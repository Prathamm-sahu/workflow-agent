import { db } from '../db/prisma';
import { AuditAction, AuditLog } from '../types/models';

export class AuditService {

  async log(
    action: AuditAction,
    entityType: AuditLog['entityType'],
    entityId: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await db.addAuditLog(action, entityType, entityId, details);
    console.log(`[AUDIT] ${action} | ${entityType}:${entityId}`, JSON.stringify(details));
  }

  async getLogs(filters?: {
    action?: AuditAction;
    entityType?: AuditLog['entityType'];
    limit?: number;
  }): Promise<AuditLog[]> {
    let logs = await db.getAuditLogs(filters?.limit || 100);

    if (filters?.action) {
      logs = logs.filter((l) => l.action === filters.action);
    }
    if (filters?.entityType) {
      logs = logs.filter((l) => l.entityType === filters.entityType);
    }

    return logs;
  }
}
