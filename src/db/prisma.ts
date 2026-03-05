import { PrismaClient } from '../generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { v4 as uuid } from 'uuid';
import {
  Alert,
  Incident,
  TicketRecord,
  AuditLog,
  AuditAction,
  SiteContact,
  ContactInfo,
  EscalationPolicy,
} from '../types/models';
import { FilterRule, RuleCondition, RuleAction } from '../types/rules';

// ─── Prisma Client Setup ─────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const adapter = new PrismaLibSql({ url: dbUrl });
export const prisma = new PrismaClient({ adapter });

// ─── EscalationPolicy (kept in-memory, no table needed) ──────
let _escalationPolicy: EscalationPolicy = {
  slaBreachMinutes: 30,
  maxEscalationLevel: 2,
  enabled: true,
};

// ─── Helper: convert Prisma model rows ↔ app types ───────────

function toAlert(row: any): Alert {
  return {
    id: row.id,
    alarmId: row.alarmId,
    cycleId: row.cycleId,
    severity: row.severity,
    eventType: row.eventType,
    message: row.message,
    entity: row.entity,
    lastPolledValue: row.lastPolledValue,
    rootCause: row.rootCause,
    deviceName: row.deviceName,
    deviceCategory: row.deviceCategory,
    deviceType: row.deviceType,
    deviceIp: row.deviceIp,
    deviceVendor: row.deviceVendor,
    deviceDependent: row.deviceDependent,
    site: row.site,
    building: row.building,
    floor: row.floor,
    interfaceName: row.interfaceName,
    interfaceIp: row.interfaceIp,
    interfaceCircuitId: row.interfaceCircuitId,
    monitorName: row.monitorName,
    status: row.status,
    incidentId: row.incidentId,
    receivedAt: row.receivedAt,
    lastModifiedTime: row.lastModifiedTime,
    rawPayload: JSON.parse(row.rawPayload || '{}'),
  };
}

function toIncident(row: any): Incident {
  return {
    id: row.id,
    alertIds: row.alerts ? row.alerts.map((ia: any) => ia.alertId) : [],
    severity: row.severity,
    site: row.site,
    eventType: row.eventType,
    summary: row.summary,
    ticketId: row.ticketId,
    status: row.status,
    assignee: row.assignee,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTicketRecord(row: any): TicketRecord {
  return {
    id: row.id,
    serviceDeskRequestId: row.serviceDeskRequestId,
    incidentId: row.incidentId,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    site: row.site,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFilterRule(row: any): FilterRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    conditions: JSON.parse(row.conditions) as RuleCondition[],
    matchMode: row.matchMode as 'all' | 'any',
    actions: JSON.parse(row.actions) as RuleAction,
    order: row.order,
  };
}

function toAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    details: JSON.parse(row.details || '{}'),
    timestamp: row.timestamp,
  };
}

function toSiteContact(row: any): SiteContact {
  return {
    site: row.site,
    personA: {
      name: row.personAName,
      email: row.personAEmail,
      phone: row.personAPhone,
    },
    escalationContacts: (row.escalationContacts || []).map((ec: any) => ({
      name: ec.name,
      email: ec.email,
      phone: ec.phone,
    })),
  };
}

// ─── Database API (same method names as old InMemoryDB) ──────

export const db = {
  // ─── Alert Methods ───────────────────────────────────────
  async saveAlert(alert: Alert): Promise<void> {
    await prisma.alert.upsert({
      where: { id: alert.id },
      update: {
        severity: alert.severity,
        message: alert.message,
        status: alert.status,
        incidentId: alert.incidentId,
        lastModifiedTime: alert.lastModifiedTime,
        rawPayload: JSON.stringify(alert.rawPayload),
      },
      create: {
        id: alert.id,
        alarmId: alert.alarmId,
        cycleId: alert.cycleId,
        severity: alert.severity,
        eventType: alert.eventType,
        message: alert.message,
        entity: alert.entity,
        lastPolledValue: alert.lastPolledValue,
        rootCause: alert.rootCause,
        deviceName: alert.deviceName,
        deviceCategory: alert.deviceCategory,
        deviceType: alert.deviceType,
        deviceIp: alert.deviceIp,
        deviceVendor: alert.deviceVendor,
        deviceDependent: alert.deviceDependent,
        site: alert.site,
        building: alert.building,
        floor: alert.floor,
        interfaceName: alert.interfaceName,
        interfaceIp: alert.interfaceIp,
        interfaceCircuitId: alert.interfaceCircuitId,
        monitorName: alert.monitorName,
        status: alert.status,
        incidentId: alert.incidentId,
        receivedAt: alert.receivedAt,
        lastModifiedTime: alert.lastModifiedTime,
        rawPayload: JSON.stringify(alert.rawPayload),
      },
    });
  },

  async getAlert(id: string): Promise<Alert | undefined> {
    const row = await prisma.alert.findUnique({ where: { id } });
    return row ? toAlert(row) : undefined;
  },

  async findAlertByAlarm(alarmId: string, cycleId: string): Promise<Alert | undefined> {
    const row = await prisma.alert.findUnique({
      where: { alarmId_cycleId: { alarmId, cycleId } },
    });
    return row ? toAlert(row) : undefined;
  },

  async getRecentAlerts(limit: number = 50): Promise<Alert[]> {
    const rows = await prisma.alert.findMany({
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
    return rows.map(toAlert);
  },

  // ─── Incident Methods ────────────────────────────────────
  async saveIncident(incident: Incident): Promise<void> {
    // Upsert incident
    await prisma.incident.upsert({
      where: { id: incident.id },
      update: {
        severity: incident.severity,
        summary: incident.summary,
        ticketId: incident.ticketId,
        status: incident.status,
        assignee: incident.assignee,
        eventType: incident.eventType,
      },
      create: {
        id: incident.id,
        severity: incident.severity,
        site: incident.site,
        eventType: incident.eventType,
        summary: incident.summary,
        ticketId: incident.ticketId,
        status: incident.status,
        assignee: incident.assignee,
      },
    });

    // Sync alertIds via join table
    const existingLinks = await prisma.incidentAlert.findMany({
      where: { incidentId: incident.id },
      select: { alertId: true },
    });
    const existingAlertIds = new Set(existingLinks.map((l: { alertId: string }) => l.alertId));
    const newAlertIds = incident.alertIds.filter((id) => !existingAlertIds.has(id));

    if (newAlertIds.length > 0) {
      await prisma.incidentAlert.createMany({
        data: newAlertIds.map((alertId) => ({
          id: uuid(),
          incidentId: incident.id,
          alertId,
        })),
      });
    }
  },

  async getIncident(id: string): Promise<Incident | undefined> {
    const row = await prisma.incident.findUnique({
      where: { id },
      include: { alerts: true },
    });
    return row ? toIncident(row) : undefined;
  },

  async findOpenIncidentBySite(site: string): Promise<Incident | undefined> {
    const row = await prisma.incident.findFirst({
      where: {
        site,
        status: { in: ['open', 'ticket_created'] },
      },
      include: { alerts: true },
    });
    return row ? toIncident(row) : undefined;
  },

  async getActiveIncidents(): Promise<Incident[]> {
    const rows = await prisma.incident.findMany({
      where: {
        status: { notIn: ['closed', 'resolved'] },
      },
      include: { alerts: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toIncident);
  },

  // ─── Ticket Methods ──────────────────────────────────────
  async saveTicket(ticket: TicketRecord): Promise<void> {
    await prisma.ticketRecord.upsert({
      where: { id: ticket.id },
      update: {
        status: ticket.status,
        priority: ticket.priority,
        assignee: ticket.assignee,
        subject: ticket.subject,
      },
      create: {
        id: ticket.id,
        serviceDeskRequestId: ticket.serviceDeskRequestId,
        incidentId: ticket.incidentId,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        assignee: ticket.assignee,
        site: ticket.site,
      },
    });
  },

  async getTicket(id: string): Promise<TicketRecord | undefined> {
    const row = await prisma.ticketRecord.findUnique({ where: { id } });
    return row ? toTicketRecord(row) : undefined;
  },

  async findTicketByServiceDeskId(sdId: string): Promise<TicketRecord | undefined> {
    const row = await prisma.ticketRecord.findFirst({
      where: { serviceDeskRequestId: sdId },
    });
    return row ? toTicketRecord(row) : undefined;
  },

  async getRecentTickets(limit: number = 50): Promise<TicketRecord[]> {
    const rows = await prisma.ticketRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toTicketRecord);
  },

  // ─── Rule Methods ────────────────────────────────────────
  async saveRule(rule: FilterRule): Promise<void> {
    await prisma.filterRule.upsert({
      where: { id: rule.id },
      update: {
        name: rule.name,
        enabled: rule.enabled,
        conditions: JSON.stringify(rule.conditions),
        matchMode: rule.matchMode,
        actions: JSON.stringify(rule.actions),
        order: rule.order,
      },
      create: {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        conditions: JSON.stringify(rule.conditions),
        matchMode: rule.matchMode,
        actions: JSON.stringify(rule.actions),
        order: rule.order,
      },
    });
  },

  async getRule(id: string): Promise<FilterRule | undefined> {
    const row = await prisma.filterRule.findUnique({ where: { id } });
    return row ? toFilterRule(row) : undefined;
  },

  async deleteRule(id: string): Promise<boolean> {
    try {
      await prisma.filterRule.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async getEnabledRulesSorted(): Promise<FilterRule[]> {
    const rows = await prisma.filterRule.findMany({
      where: { enabled: true },
      orderBy: { order: 'asc' },
    });
    return rows.map(toFilterRule);
  },

  async getAllRules(): Promise<FilterRule[]> {
    const rows = await prisma.filterRule.findMany({
      orderBy: { order: 'asc' },
    });
    return rows.map(toFilterRule);
  },

  // ─── Audit Log Methods ───────────────────────────────────
  async addAuditLog(
    action: AuditAction,
    entityType: AuditLog['entityType'],
    entityId: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: uuid(),
        action,
        entityType,
        entityId,
        details: JSON.stringify(details),
      },
    });
  },

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    const rows = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return rows.map(toAuditLog);
  },

  // ─── Site Contact Methods ─────────────────────────────────
  async saveSiteContact(contact: SiteContact): Promise<void> {
    // Upsert by site name
    const existing = await prisma.siteContact.findUnique({
      where: { site: contact.site },
    });

    if (existing) {
      await prisma.siteContact.update({
        where: { site: contact.site },
        data: {
          personAName: contact.personA.name,
          personAEmail: contact.personA.email,
          personAPhone: contact.personA.phone,
        },
      });
      // Replace escalation contacts
      await prisma.escalationContact.deleteMany({
        where: { siteContactId: existing.id },
      });
      if (contact.escalationContacts.length > 0) {
        await prisma.escalationContact.createMany({
          data: contact.escalationContacts.map((ec, i) => ({
            id: uuid(),
            siteContactId: existing.id,
            name: ec.name,
            email: ec.email,
            phone: ec.phone,
            order: i,
          })),
        });
      }
    } else {
      await prisma.siteContact.create({
        data: {
          id: uuid(),
          site: contact.site,
          personAName: contact.personA.name,
          personAEmail: contact.personA.email,
          personAPhone: contact.personA.phone,
          escalationContacts: {
            create: contact.escalationContacts.map((ec, i) => ({
              id: uuid(),
              name: ec.name,
              email: ec.email,
              phone: ec.phone,
              order: i,
            })),
          },
        },
      });
    }
  },

  async getSiteContact(site: string): Promise<SiteContact | undefined> {
    const row = await prisma.siteContact.findUnique({
      where: { site },
      include: { escalationContacts: { orderBy: { order: 'asc' } } },
    });
    return row ? toSiteContact(row) : undefined;
  },

  async getAllSiteContacts(): Promise<SiteContact[]> {
    const rows = await prisma.siteContact.findMany({
      include: { escalationContacts: { orderBy: { order: 'asc' } } },
    });
    return rows.map(toSiteContact);
  },

  // ─── Escalation Policy (in-memory) ────────────────────────
  get escalationPolicy(): EscalationPolicy {
    return _escalationPolicy;
  },
  set escalationPolicy(val: EscalationPolicy) {
    _escalationPolicy = val;
  },

  // ─── Stats ────────────────────────────────────────────────
  async getStats(): Promise<{
    totalAlerts: number;
    activeIncidents: number;
    totalTickets: number;
    totalAuditLogs: number;
    alertsByStatus: Record<string, number>;
  }> {
    const [totalAlerts, totalTickets, totalAuditLogs, activeIncidents] = await Promise.all([
      prisma.alert.count(),
      prisma.ticketRecord.count(),
      prisma.auditLog.count(),
      prisma.incident.count({
        where: { status: { notIn: ['closed', 'resolved'] } },
      }),
    ]);

    // Group alerts by status
    const statusGroups = await prisma.alert.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const alertsByStatus: Record<string, number> = {};
    statusGroups.forEach((g: { status: string; _count: { status: number } }) => {
      alertsByStatus[g.status] = g._count.status;
    });

    return { totalAlerts, activeIncidents, totalTickets, totalAuditLogs, alertsByStatus };
  },
};
