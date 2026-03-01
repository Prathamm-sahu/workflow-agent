import { v4 as uuid } from 'uuid';
import {
  Alert,
  Incident,
  TicketRecord,
  AuditLog,
  AuditAction,
  SiteContact,
  EscalationPolicy,
} from '../types/models';
import { FilterRule } from '../types/rules';

/**
 * In-memory database using Map-based stores.
 * All data lives in memory — swappable to a real DB later.
 */
class InMemoryDB {
  // ─── Stores ──────────────────────────────────────────────
  alerts: Map<string, Alert> = new Map();
  incidents: Map<string, Incident> = new Map();
  tickets: Map<string, TicketRecord> = new Map();
  rules: Map<string, FilterRule> = new Map();
  auditLogs: AuditLog[] = [];
  siteContacts: Map<string, SiteContact> = new Map();
  escalationPolicy: EscalationPolicy = {
    slaBreachMinutes: 30,
    maxEscalationLevel: 2,
    enabled: true,
  };

  // Deduplication index: "alarmId:cycleId" → alertId
  private alarmDedup: Map<string, string> = new Map();

  // ─── Alert Methods ───────────────────────────────────────
  saveAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
    const dedupKey = `${alert.alarmId}:${alert.cycleId}`;
    this.alarmDedup.set(dedupKey, alert.id);
  }

  getAlert(id: string): Alert | undefined {
    return this.alerts.get(id);
  }

  findAlertByAlarm(alarmId: string, cycleId: string): Alert | undefined {
    const dedupKey = `${alarmId}:${cycleId}`;
    const alertId = this.alarmDedup.get(dedupKey);
    return alertId ? this.alerts.get(alertId) : undefined;
  }

  getRecentAlerts(limit: number = 50): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, limit);
  }

  // ─── Incident Methods ────────────────────────────────────
  saveIncident(incident: Incident): void {
    this.incidents.set(incident.id, incident);
  }

  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  findOpenIncidentBySite(site: string): Incident | undefined {
    return Array.from(this.incidents.values()).find(
      (inc) =>
        inc.site === site &&
        (inc.status === 'open' || inc.status === 'ticket_created')
    );
  }

  getActiveIncidents(): Incident[] {
    return Array.from(this.incidents.values())
      .filter((inc) => inc.status !== 'closed' && inc.status !== 'resolved')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // ─── Ticket Methods ──────────────────────────────────────
  saveTicket(ticket: TicketRecord): void {
    this.tickets.set(ticket.id, ticket);
  }

  getTicket(id: string): TicketRecord | undefined {
    return this.tickets.get(id);
  }

  findTicketByServiceDeskId(sdId: string): TicketRecord | undefined {
    return Array.from(this.tickets.values()).find(
      (t) => t.serviceDeskRequestId === sdId
    );
  }

  getRecentTickets(limit: number = 50): TicketRecord[] {
    return Array.from(this.tickets.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ─── Rule Methods ────────────────────────────────────────
  saveRule(rule: FilterRule): void {
    this.rules.set(rule.id, rule);
  }

  getRule(id: string): FilterRule | undefined {
    return this.rules.get(id);
  }

  deleteRule(id: string): boolean {
    return this.rules.delete(id);
  }

  getEnabledRulesSorted(): FilterRule[] {
    return Array.from(this.rules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => a.order - b.order);
  }

  getAllRules(): FilterRule[] {
    return Array.from(this.rules.values()).sort((a, b) => a.order - b.order);
  }

  // ─── Audit Log Methods ───────────────────────────────────
  addAuditLog(
    action: AuditAction,
    entityType: AuditLog['entityType'],
    entityId: string,
    details: Record<string, unknown> = {}
  ): void {
    this.auditLogs.push({
      id: uuid(),
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date(),
    });
  }

  getAuditLogs(limit: number = 100): AuditLog[] {
    return this.auditLogs
      .slice(-limit)
      .reverse();
  }

  // ─── Site Contact Methods ─────────────────────────────────
  saveSiteContact(contact: SiteContact): void {
    this.siteContacts.set(contact.site, contact);
  }

  getSiteContact(site: string): SiteContact | undefined {
    return this.siteContacts.get(site);
  }

  getAllSiteContacts(): SiteContact[] {
    return Array.from(this.siteContacts.values());
  }

  // ─── Stats ────────────────────────────────────────────────
  getStats(): {
    totalAlerts: number;
    activeIncidents: number;
    totalTickets: number;
    totalAuditLogs: number;
    alertsByStatus: Record<string, number>;
  } {
    const alertsByStatus: Record<string, number> = {};
    this.alerts.forEach((a) => {
      alertsByStatus[a.status] = (alertsByStatus[a.status] || 0) + 1;
    });

    return {
      totalAlerts: this.alerts.size,
      activeIncidents: this.getActiveIncidents().length,
      totalTickets: this.tickets.size,
      totalAuditLogs: this.auditLogs.length,
      alertsByStatus,
    };
  }
}

// Singleton instance
export const db = new InMemoryDB();
