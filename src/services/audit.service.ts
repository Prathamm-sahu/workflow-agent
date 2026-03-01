import { db } from '../db/in-memory';
import { AuditAction, AuditLog } from '../types/models';

/**
 * Audit logging service.
 * Provides structured logging and query methods.
 */
export class AuditService {
  /**
   * Log an action to the audit trail.
   */
  log(
    action: AuditAction,
    entityType: AuditLog['entityType'],
    entityId: string,
    details: Record<string, unknown> = {}
  ): void {
    db.addAuditLog(action, entityType, entityId, details);
    console.log(`[AUDIT] ${action} | ${entityType}:${entityId}`, JSON.stringify(details));
  }

  /**
   * Get recent audit logs, optionally filtered.
   */
  getLogs(filters?: {
    action?: AuditAction;
    entityType?: AuditLog['entityType'];
    limit?: number;
  }): AuditLog[] {
    let logs = db.getAuditLogs(filters?.limit || 100);

    if (filters?.action) {
      logs = logs.filter((l) => l.action === filters.action);
    }
    if (filters?.entityType) {
      logs = logs.filter((l) => l.entityType === filters.entityType);
    }

    return logs;
  }
}
