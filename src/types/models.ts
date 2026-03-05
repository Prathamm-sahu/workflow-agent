/**
 * Internal domain models for the workflow engine.
 */

// ─── Severity ────────────────────────────────────────────────
export type Severity = 'Critical' | 'Trouble' | 'Attention' | 'Clear';

// ─── Alert ───────────────────────────────────────────────────
export type AlertStatus = 'new' | 'processing' | 'ticket_created' | 'acknowledged' | 'ignored' | 'cleared';

export interface Alert {
  id: string;                    
  alarmId: string;               // OpManager alarm ID
  cycleId: string;               // OpManager alarm cycle ID
  severity: Severity;
  eventType: string;
  message: string;
  entity: string;
  lastPolledValue: string;
  rootCause: string;

  // Device info
  deviceName: string;
  deviceCategory: string;
  deviceType: string;
  deviceIp: string;
  deviceVendor: string;
  deviceDependent: string;

  // Location
  site: string;                  // derived from building or siteAddress
  building: string;
  floor: string;

  // Interface info (optional)
  interfaceName: string;
  interfaceIp: string;
  interfaceCircuitId: string;

  // Monitor info (optional)
  monitorName: string;

  // Metadata
  status: AlertStatus;
  incidentId: string | null;
  receivedAt: Date;
  lastModifiedTime: string;

  // Original payload stored for audit
  rawPayload: Record<string, unknown>;
}

// ─── Incident ────────────────────────────────────────────────
export type IncidentStatus = 'open' | 'ticket_created' | 'escalated' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  alertIds: string[];
  severity: Severity;
  site: string;
  eventType: string;            // primary event type
  summary: string;              // auto-generated summary
  ticketId: string | null;      // ServiceDesk request ID
  status: IncidentStatus;
  assignee: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Ticket Record ───────────────────────────────────────────
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketRecord {
  id: string;                   // internal UUID
  serviceDeskRequestId: string; // ServiceDesk Plus request ID
  incidentId: string;
  subject: string;
  status: TicketStatus;
  priority: string;
  assignee: string | null;
  site: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Audit Log ───────────────────────────────────────────────
export type AuditAction =
  | 'alert_received'
  | 'alert_deduplicated'
  | 'alert_ignored'
  | 'rule_matched'
  | 'incident_created'
  | 'incident_updated'
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_closed'
  | 'alarm_acknowledged'
  | 'alarm_cleared'
  | 'escalation_triggered'
  | 'error';

export interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: 'alert' | 'incident' | 'ticket' | 'alarm' | 'system';
  entityId: string;
  details: Record<string, unknown>;
  timestamp: Date;
}
