import { v4 as uuid } from 'uuid';
import { OpManagerWebhookPayload } from '../types/opmanager';
import { Alert, Incident, TicketRecord } from '../types/models';
import { ServiceDeskRequestInput } from '../types/servicedesk';
import { FilterRule } from '../types/rules';
import { AlertProcessor } from './alert-processor';
import { RuleEngine } from './rule-engine';
import { CorrelationEngine } from './correlation-engine';
import { ServiceDeskClient } from './servicedesk.client';
import { OpManagerClient } from './opmanager.client';
import { AuditService } from './audit.service';
import { db } from '../db/prisma';
import { AppConfig } from '../config';

export class WorkflowOrchestrator {
  private alertProcessor: AlertProcessor;
  private ruleEngine: RuleEngine;
  private correlationEngine: CorrelationEngine;
  private serviceDeskClient: ServiceDeskClient;
  private opManagerClient: OpManagerClient;
  private auditService: AuditService;

  constructor(config: AppConfig) {
    this.alertProcessor = new AlertProcessor();
    this.ruleEngine = new RuleEngine();
    this.correlationEngine = new CorrelationEngine(config);
    this.serviceDeskClient = new ServiceDeskClient(config);
    this.opManagerClient = new OpManagerClient(config);
    this.auditService = new AuditService();
  }

  async handleWebhook(payload: OpManagerWebhookPayload): Promise<{
    action: string;
    alertId?: string;
    incidentId?: string;
    ticketId?: string;
  }> {
    // 1. Parse and validate the alert
    const alert = await this.alertProcessor.process(payload);

    if (!alert) {
      return { action: 'deduplicated' };
    }

    // 2. Handle "Clear" severity — close existing ticket if any
    if (alert.severity === 'Clear') {
      return this.handleClearAlarm(alert);
    }

    // 3. Evaluate against filter rules
    const matchedRule = await this.ruleEngine.evaluate(alert);

    if (!matchedRule) {
      alert.status = 'ignored';
      await db.saveAlert(alert);
      return { action: 'ignored', alertId: alert.id };
    }

    // 4. Correlate into an incident
    const incident = await this.correlationEngine.correlate(alert);

    // 5. Take action based on the rule
    if (matchedRule.actions.createTicket) {
      if (!incident.ticketId) {
        // New incident — create a ticket
        const ticketId = await this.createTicket(incident, alert, matchedRule);
        incident.ticketId = ticketId;
        incident.status = 'ticket_created';
        await db.saveIncident(incident);

        // Acknowledge the alarm in OpManager
        if (matchedRule.actions.acknowledgeAlarm) {
          await this.acknowledgeAlarm(alert);
        }

        return {
          action: 'ticket_created',
          alertId: alert.id,
          incidentId: incident.id,
          ticketId,
        };
      } else {
        // Existing incident with ticket — update the ticket
        await this.updateTicket(incident);

        // Acknowledge this alert's alarm too
        if (matchedRule.actions.acknowledgeAlarm) {
          await this.acknowledgeAlarm(alert);
        }

        return {
          action: 'ticket_updated',
          alertId: alert.id,
          incidentId: incident.id,
          ticketId: incident.ticketId,
        };
      }
    }

    return { action: 'rule_matched_no_ticket', alertId: alert.id };
  }

  private async handleClearAlarm(alert: Alert): Promise<{
    action: string;
    alertId: string;
    incidentId?: string;
  }> {
    // Find the incident for the same site
    const incident = await db.findOpenIncidentBySite(alert.site);

    if (incident && incident.ticketId) {
      try {
        await this.serviceDeskClient.closeRequest(incident.ticketId);
        incident.status = 'closed';
        await db.saveIncident(incident);

        // Update ticket record
        const ticketRecord = await db.findTicketByServiceDeskId(incident.ticketId);
        if (ticketRecord) {
          ticketRecord.status = 'closed';
          ticketRecord.updatedAt = new Date();
          await db.saveTicket(ticketRecord);
        }

        await this.auditService.log('ticket_closed', 'ticket', incident.ticketId!, {
          incidentId: incident.id,
          reason: 'Alarm cleared',
        });
      } catch (error) {
        await this.auditService.log('error', 'system', alert.id, {
          operation: 'close_ticket',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    alert.status = 'cleared';
    await db.saveAlert(alert);

    await this.auditService.log('alarm_cleared', 'alarm', alert.alarmId, {
      alertId: alert.id,
      site: alert.site,
    });

    return {
      action: 'alarm_cleared',
      alertId: alert.id,
      incidentId: incident?.id,
    };
  }

  /**
   * Maps rule priority (e.g. "High", "Critical") to ServiceDesk Plus priority format.
   */
  private mapPriority(rulePriority: string): string {
    const priorityMap: Record<string, string> = {
      'Critical': 'Critical (P1)',
      'High': 'High (P2)',
      'Medium': 'Normal (P3)',
      'Normal': 'Normal (P3)',
      'Low': 'Low (P4)',
    };
    return priorityMap[rulePriority] || 'Normal (P3)';
  }

  /**
   * Determines the ServiceDesk request type based on alert severity.
   */
  private getRequestType(severity: string): string {
    switch (severity) {
      case 'Critical':
        return 'SOCR-Incidents';
      case 'Trouble':
        return 'Incident Request';
      default:
        return 'Service Request';
    }
  }

  private async createTicket(
    incident: Incident,
    alert: Alert,
    rule: FilterRule
  ): Promise<string> {
    const description = this.buildTicketDescription(incident, alert);
    const mappedPriority = this.mapPriority(rule.actions.priority || 'High');
    const requestType = this.getRequestType(alert.severity);

    const input: ServiceDeskRequestInput = {
      request: {
        subject: `NOC Alert: ${alert.severity} - ${alert.eventType} on ${alert.deviceName} (${alert.deviceIp}) at ${alert.site}`,
        description,
        priority: { name: mappedPriority },
        request_type: { name: requestType },
        category: { name: 'PROACTIVE SUPPORT' },
        site: { name: 'Cochin' },
        group: { name: 'ONSITE', site: alert.site, id: '22503' },
        requester: {
          id: '56473',
          name: 'NOC Ai'
        },
        udf_fields: {
          udf_sline_1292: null,
          udf_sline_1290: 'Nocai',
          udf_sline_1291: null,
          udf_date_4802: null,
          udf_date_4801: null,
        },
      },
    };

    try {
      console.log('Creating ticket in ServiceDesk Plus...');
      const result = await this.serviceDeskClient.createRequest(input);

      // Save ticket record
      const ticketRecord: TicketRecord = {
        id: uuid(),
        serviceDeskRequestId: result.id,
        incidentId: incident.id,
        subject: input.request.subject,
        status: 'open',
        priority: mappedPriority,
        assignee: null,
        site: alert.site,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.saveTicket(ticketRecord);

      // Update alert status
      alert.status = 'ticket_created';
      await db.saveAlert(alert);

      await this.auditService.log('ticket_created', 'ticket', result.id, {
        incidentId: incident.id,
        subject: input.request.subject,
        priority: mappedPriority,
      });

      return result.id;
    } catch (error) {
      await this.auditService.log('error', 'system', incident.id, {
        operation: 'create_ticket',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async updateTicket(incident: Incident): Promise<void> {
    if (!incident.ticketId) return;

    const alerts: Alert[] = [];
    for (const id of incident.alertIds) {
      const a = await db.getAlert(id);
      if (a) alerts.push(a);
    }

    const additionalInfo = alerts
      .slice(1) // skip the first (original) alert
      .map(
        (a) =>
          `• [${a.severity}] ${a.eventType} on ${a.deviceName} (${a.deviceIp}) at ${new Date(a.receivedAt).toISOString()}`
      )
      .join('\n');

    try {
      await this.serviceDeskClient.updateRequest(incident.ticketId, {
        request: {
          subject: `[${incident.severity}] ${incident.alertIds.length} alerts — ${incident.site}`,
          description: `${incident.summary}\n\nCorrelated Alerts:\n${additionalInfo}`,
          priority: { name: incident.severity === 'Critical' ? 'High' : 'Medium' },
        },
      });

      await this.auditService.log('ticket_updated', 'ticket', incident.ticketId, {
        incidentId: incident.id,
        totalAlerts: incident.alertIds.length,
      });
    } catch (error) {
      await this.auditService.log('error', 'system', incident.id, {
        operation: 'update_ticket',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async acknowledgeAlarm(alert: Alert): Promise<void> {
    try {
      await this.opManagerClient.acknowledgeAlarm(alert.entity || alert.alarmId);
      alert.status = 'acknowledged';
      await db.saveAlert(alert);

      await this.auditService.log('alarm_acknowledged', 'alarm', alert.alarmId, {
        alertId: alert.id,
        entity: alert.entity,
      });
    } catch (error) {
      await this.auditService.log('error', 'system', alert.id, {
        operation: 'acknowledge_alarm',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildTicketDescription(incident: Incident, alert: Alert): string {
    const sections: string[] = [
      `== NOC Automation Alert ==`,
      ``,
      `Severity: ${alert.severity}`,
      `Event Type: ${alert.eventType}`,
      `Message: ${alert.message}`,
      ``,
      `-- Device Information --`,
      `Name: ${alert.deviceName}`,
      `IP: ${alert.deviceIp}`,
      `Category: ${alert.deviceCategory}`,
      `Type: ${alert.deviceType}`,
      `Vendor: ${alert.deviceVendor}`,
      ``,
      `-- Location --`,
      `Site: ${alert.site}`,
      `Building: ${alert.building}`,
      `Floor: ${alert.floor}`,
    ];

    if (alert.interfaceName) {
      sections.push(
        ``,
        `-- Interface --`,
        `Name: ${alert.interfaceName}`,
        `IP: ${alert.interfaceIp}`,
        `Circuit ID: ${alert.interfaceCircuitId}`
      );
    }

    if (alert.monitorName) {
      sections.push(``, `-- Monitor --`, `Name: ${alert.monitorName}`);
    }

    if (alert.rootCause) {
      sections.push(``, `-- Root Cause --`, `${alert.rootCause}`);
    }

    sections.push(
      ``,
      `-- Metadata --`,
      `Alarm ID: ${alert.alarmId}`,
      `Cycle ID: ${alert.cycleId}`,
      `Entity: ${alert.entity}`,
      `Last Polled Value: ${alert.lastPolledValue}`,
      `Incident ID: ${incident.id}`,
      `Received At: ${alert.receivedAt.toISOString()}`
    );

    return sections.join('\n');
  }
}
