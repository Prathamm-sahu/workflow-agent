import { v4 as uuid } from 'uuid';
import { Alert, Incident, Severity } from '../types/models';
import { db } from '../db/in-memory';
import { AppConfig } from '../config';

const SEVERITY_ORDER: Record<Severity, number> = {
  Clear: 0,
  Attention: 1,
  Trouble: 2,
  Critical: 3,
};

/**
 * Groups related alerts into incidents using site-based and dependency-based correlation.
 */
export class CorrelationEngine {
  private windowMs: number;

  constructor(config: AppConfig) {
    this.windowMs = config.correlationWindowMinutes * 60 * 1000;
  }

  /**
   * Correlate an alert — either adds it to an existing incident or creates a new one.
   * Returns the incident (new or updated).
   */
  correlate(alert: Alert): Incident {
    // 1. Try to find an existing open incident for the same site within the time window
    const existingIncident = this.findCorrelatedIncident(alert);

    if (existingIncident) {
      return this.addToIncident(existingIncident, alert);
    }

    // 2. Create a new incident
    return this.createIncident(alert);
  }

  /**
   * Find an existing open incident that this alert should be correlated with.
   */
  private findCorrelatedIncident(alert: Alert): Incident | undefined {
    const now = Date.now();

    // Check for open incidents at the same site within the correlation window
    const siteIncidents = Array.from(db.incidents.values()).filter(
      (inc) =>
        inc.site === alert.site &&
        (inc.status === 'open' || inc.status === 'ticket_created') &&
        now - inc.updatedAt.getTime() < this.windowMs
    );

    if (siteIncidents.length > 0) {
      // Return the most recent one
      return siteIncidents.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      )[0];
    }

    // Check dependency — if the alert device has a parent dependency
    if (alert.deviceDependent) {
      const parentIncident = Array.from(db.incidents.values()).find(
        (inc) =>
          (inc.status === 'open' || inc.status === 'ticket_created') &&
          now - inc.updatedAt.getTime() < this.windowMs &&
          inc.alertIds.some((aid) => {
            const parentAlert = db.getAlert(aid);
            return parentAlert && parentAlert.deviceName === alert.deviceDependent;
          })
      );
      if (parentIncident) return parentIncident;
    }

    return undefined;
  }

  /**
   * Add an alert to an existing incident, potentially escalating severity.
   */
  private addToIncident(incident: Incident, alert: Alert): Incident {
    incident.alertIds.push(alert.id);
    incident.updatedAt = new Date();

    // Escalate severity if the new alert is more severe
    if (SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[incident.severity]) {
      incident.severity = alert.severity;
      incident.status = incident.status === 'ticket_created' ? 'ticket_created' : 'open';
    }

    // Update summary
    incident.summary = this.buildSummary(incident);

    // Link alert to incident
    alert.incidentId = incident.id;
    alert.status = 'processing';
    db.saveAlert(alert);
    db.saveIncident(incident);

    db.addAuditLog('incident_updated', 'incident', incident.id, {
      alertId: alert.id,
      totalAlerts: incident.alertIds.length,
      severity: incident.severity,
    });

    return incident;
  }

  /**
   * Create a new incident from a single alert.
   */
  private createIncident(alert: Alert): Incident {
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

    incident.summary = this.buildSummary(incident);

    // Link alert to incident
    alert.incidentId = incident.id;
    alert.status = 'processing';
    db.saveAlert(alert);
    db.saveIncident(incident);

    db.addAuditLog('incident_created', 'incident', incident.id, {
      alertId: alert.id,
      severity: incident.severity,
      site: incident.site,
      eventType: incident.eventType,
    });

    return incident;
  }

  /**
   * Build a human-readable summary for the incident.
   */
  private buildSummary(incident: Incident): string {
    const alerts = incident.alertIds
      .map((id) => db.getAlert(id))
      .filter(Boolean) as Alert[];

    if (alerts.length === 1) {
      const a = alerts[0];
      return `[${a.severity}] ${a.eventType} on ${a.deviceName} (${a.deviceIp}) at ${a.site}`;
    }

    const deviceNames = [...new Set(alerts.map((a) => a.deviceName))];
    const eventTypes = [...new Set(alerts.map((a) => a.eventType))];

    return `[${incident.severity}] ${alerts.length} alerts — ${eventTypes.join(', ')} across ${deviceNames.join(', ')} at ${incident.site}`;
  }
}
