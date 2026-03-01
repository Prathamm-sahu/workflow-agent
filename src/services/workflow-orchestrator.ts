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
import { db } from '../db/in-memory';
import { AppConfig } from '../config';

/**
 * Orchestrates the full workflow:
 * Webhook → Parse → Filter → Correlate → Create Ticket → Acknowledge Alarm
 */
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

  /**
   * Handle an incoming OpManager webhook.
   * This is the main entry point for the workflow.
   */
  async handleWebhook(payload: OpManagerWebhookPayload): Promise<{
    action: string;
    alertId?: string;
    incidentId?: string;
    ticketId?: string;
  }> {
    // 1. Parse and validate the alert
    const alert = this.alertProcessor.process(payload);

    if (!alert) {
      return { action: 'deduplicated' };
    }

    // 2. Handle "Clear" severity — close existing ticket if any
    if (alert.severity === 'Clear') {
      return this.handleClearAlarm(alert);
    }

    // 3. Evaluate against filter rules
    const matchedRule = this.ruleEngine.evaluate(alert);

    if (!matchedRule) {
      alert.status = 'ignored';
      db.saveAlert(alert);
      return { action: 'ignored', alertId: alert.id };
    }

    // 4. Correlate into an incident
    const incident = this.correlationEngine.correlate(alert);

    // 5. Take action based on the rule
    if (matchedRule.actions.createTicket) {
      if (!incident.ticketId) {
        // New incident — create a ticket
        const ticketId = await this.createTicket(incident, alert, matchedRule);
        incident.ticketId = ticketId;
        incident.status = 'ticket_created';
        db.saveIncident(incident);

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

  /**
   * Handle a "Clear" severity alarm — find and close the corresponding ticket.
   */
  private async handleClearAlarm(alert: Alert): Promise<{
    action: string;
    alertId: string;
    incidentId?: string;
  }> {
    // Find the incident for the same site
    const incident = db.findOpenIncidentBySite(alert.site);

    if (incident && incident.ticketId) {
      try {
        await this.serviceDeskClient.closeRequest(incident.ticketId);
        incident.status = 'closed';
        db.saveIncident(incident);

        // Update ticket record
        const ticketRecord = Array.from(db.tickets.values()).find(
          (t) => t.serviceDeskRequestId === incident.ticketId
        );
        if (ticketRecord) {
          ticketRecord.status = 'closed';
          ticketRecord.updatedAt = new Date();
          db.saveTicket(ticketRecord);
        }

        this.auditService.log('ticket_closed', 'ticket', incident.ticketId!, {
          incidentId: incident.id,
          reason: 'Alarm cleared',
        });
      } catch (error) {
        this.auditService.log('error', 'system', alert.id, {
          operation: 'close_ticket',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    alert.status = 'cleared';
    db.saveAlert(alert);

    this.auditService.log('alarm_cleared', 'alarm', alert.alarmId, {
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
   * Create a ticket in ServiceDesk Plus.
   */
  private async createTicket(
    incident: Incident,
    alert: Alert,
    rule: FilterRule
  ): Promise<string> {
    // Get site contact for assignment
    const siteContact = db.getSiteContact(alert.site);
    const assignee = siteContact?.personA;

    const description = this.buildTicketDescription(incident, alert);

    const input: ServiceDeskRequestInput = {
      request: {
        subject: `[${alert.severity}] ${alert.eventType} — ${alert.deviceName} at ${alert.site}`,
        description,
        priority: { name: rule.actions.priority || 'High' },
        site: { name: alert.site },
        request_type: { name: 'Incident' },
        category: { name: 'Network' },
        urgency: { name: alert.severity === 'Critical' ? 'Urgent' : 'Normal' },
        impact: { name: alert.severity === 'Critical' ? 'Affects Business' : 'Affects Department' },
      },
    };

    // Assign to site tech if known
    if (assignee) {
      input.request.technician = {
        name: assignee.name,
        email_id: assignee.email,
      };
    }

    try {
      const result = await this.serviceDeskClient.createRequest(input);

      // Save ticket record
      const ticketRecord: TicketRecord = {
        id: uuid(),
        serviceDeskRequestId: result.id,
        incidentId: incident.id,
        subject: input.request.subject,
        status: 'open',
        priority: rule.actions.priority || 'High',
        assignee: assignee?.name || null,
        site: alert.site,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.saveTicket(ticketRecord);

      // Update alert status
      alert.status = 'ticket_created';
      db.saveAlert(alert);

      this.auditService.log('ticket_created', 'ticket', result.id, {
        incidentId: incident.id,
        subject: input.request.subject,
        priority: rule.actions.priority,
        assignee: assignee?.name,
      });

      return result.id;
    } catch (error) {
      this.auditService.log('error', 'system', incident.id, {
        operation: 'create_ticket',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update an existing ticket with new alert information.
   */
  private async updateTicket(incident: Incident): Promise<void> {
    if (!incident.ticketId) return;

    const alerts = incident.alertIds
      .map((id) => db.getAlert(id))
      .filter(Boolean) as Alert[];

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

      this.auditService.log('ticket_updated', 'ticket', incident.ticketId, {
        incidentId: incident.id,
        totalAlerts: incident.alertIds.length,
      });
    } catch (error) {
      this.auditService.log('error', 'system', incident.id, {
        operation: 'update_ticket',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Acknowledge an alarm in OpManager.
   */
  private async acknowledgeAlarm(alert: Alert): Promise<void> {
    try {
      await this.opManagerClient.acknowledgeAlarm(alert.entity || alert.alarmId);
      alert.status = 'acknowledged';
      db.saveAlert(alert);

      this.auditService.log('alarm_acknowledged', 'alarm', alert.alarmId, {
        alertId: alert.id,
        entity: alert.entity,
      });
    } catch (error) {
      this.auditService.log('error', 'system', alert.id, {
        operation: 'acknowledge_alarm',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Build a detailed ticket description.
   */
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
