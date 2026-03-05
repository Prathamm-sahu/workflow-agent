import { v4 as uuid } from 'uuid';
import { Alert, Incident, Severity } from '../types/models';
import { db } from '../db/prisma';
import { AppConfig } from '../config';

const SEVERITY_ORDER: Record<Severity, number> = {
  Clear: 0,
  Attention: 1,
  Trouble: 2,
  Critical: 3,
};

export class CorrelationEngine {
  private windowMs: number;

  constructor(config: AppConfig) {
    this.windowMs = config.correlationWindowMinutes * 60 * 1000;
  }


  async correlate(alert: Alert): Promise<Incident> {
    // 1. Try to find an existing open incident for the same site within the time window
    const existingIncident = await this.findCorrelatedIncident(alert);

    if (existingIncident) {
      return this.addToIncident(existingIncident, alert);
    }

    // 2. Create a new incident
    return this.createIncident(alert);
  }


  private async findCorrelatedIncident(alert: Alert): Promise<Incident | undefined> {
    const now = Date.now();

    // Check for open incidents at the same site within the correlation window
    const siteIncident = await db.findOpenIncidentBySite(alert.site);

    if (siteIncident && now - siteIncident.updatedAt.getTime() < this.windowMs) {
      return siteIncident;
    }

    // Check dependency — if the alert device has a parent dependency
    if (alert.deviceDependent && siteIncident) {
      // Check if any alert in the incident matches the parent device
      for (const alertId of siteIncident.alertIds) {
        const parentAlert = await db.getAlert(alertId);
        if (parentAlert && parentAlert.deviceName === alert.deviceDependent) {
          return siteIncident;
        }
      }
    }

    return undefined;
  }

  private async addToIncident(incident: Incident, alert: Alert): Promise<Incident> {
    incident.alertIds.push(alert.id);
    incident.updatedAt = new Date();

    // Escalate severity if the new alert is more severe
    if (SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[incident.severity]) {
      incident.severity = alert.severity;
      incident.status = incident.status === 'ticket_created' ? 'ticket_created' : 'open';
    }

    // Update summary
    incident.summary = await this.buildSummary(incident);

    // Link alert to incident
    alert.incidentId = incident.id;
    alert.status = 'processing';
    await db.saveAlert(alert);
    await db.saveIncident(incident);

    await db.addAuditLog('incident_updated', 'incident', incident.id, {
      alertId: alert.id,
      totalAlerts: incident.alertIds.length,
      severity: incident.severity,
    });

    return incident;
  }

  /**
   * Create a new incident from a single alert.
   */
  private async createIncident(alert: Alert): Promise<Incident> {
    const incident: Incident = {
      id: uuid(),
      alertIds: [alert.id],
      severity: alert.severity,
      site: alert.site,
      eventType: alert.eventType,
      summary: '',
      ticketId: null,
      status: 'open',
      assignee: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    incident.summary = await this.buildSummary(incident);

    alert.incidentId = incident.id;
    alert.status = 'processing';
    await db.saveAlert(alert);
    await db.saveIncident(incident);

    await db.addAuditLog('incident_created', 'incident', incident.id, {
      alertId: alert.id,
      severity: incident.severity,
      site: incident.site,
      eventType: incident.eventType,
    });

    return incident;
  }

  private async buildSummary(incident: Incident): Promise<string> {
    const alerts: Alert[] = [];
    for (const id of incident.alertIds) {
      const a = await db.getAlert(id);
      if (a) alerts.push(a);
    }

    if (alerts.length === 1) {
      const a = alerts[0];
      return `[${a.severity}] ${a.eventType} on ${a.deviceName} (${a.deviceIp}) at ${a.site}`;
    }

    const deviceNames = [...new Set(alerts.map((a) => a.deviceName))];
    const eventTypes = [...new Set(alerts.map((a) => a.eventType))];

    return `[${incident.severity}] ${alerts.length} alerts — ${eventTypes.join(', ')} across ${deviceNames.join(', ')} at ${incident.site}`;
  }
}
