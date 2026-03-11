import { prisma } from '../db/prisma';
import { AuditService } from './audit.service';

export interface CleanupConfig {
  /** How many days to retain data before cleanup. Default: 30 */
  retentionDays: number;
  /** How often to run cleanup, in milliseconds. Default: 24 hours */
  intervalMs: number;
}

const DEFAULT_CONFIG: CleanupConfig = {
  retentionDays: 30,
  intervalMs: 24 * 60 * 60 * 1000, // 24 hours
};

export class CleanupService {
  private config: CleanupConfig;
  private auditService: AuditService;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<CleanupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.auditService = new AuditService();
  }

  /**
   * Returns the cutoff date: records older than this should be cleaned up.
   */
  private getCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    return cutoff;
  }

  /**
   * Start the periodic cleanup scheduler.
   */
  start(): void {
    // Stop any existing timer to prevent orphaned intervals
    this.stop();

    console.log(
      `[Cleanup] Scheduler started — retention: ${this.config.retentionDays} days, ` +
      `interval: ${this.config.intervalMs / (60 * 60 * 1000)}h`
    );

    // Run once immediately on startup
    this.runCleanup().catch((err) =>
      console.error('[Cleanup] Initial cleanup failed:', err)
    );

    // Then schedule periodic runs
    this.timer = setInterval(() => {
      this.runCleanup().catch((err) =>
        console.error('[Cleanup] Scheduled cleanup failed:', err)
      );
    }, this.config.intervalMs);
  }

  /**
   * Stop the periodic cleanup scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Cleanup] Scheduler stopped');
    }
  }

  /**
   * Run the full cleanup pipeline.
   */
  async runCleanup(): Promise<{
    alerts: number;
    incidentAlerts: number;
    incidents: number;
    tickets: number;
    auditLogs: number;
  }> {
    const cutoff = this.getCutoffDate();
    console.log(`[Cleanup] Running cleanup for records older than ${cutoff.toISOString()}...`);

    const results = {
      alerts: 0,
      incidentAlerts: 0,
      incidents: 0,
      tickets: 0,
      auditLogs: 0,
    };

    try {
      // 1. Delete old audit logs (no dependencies)
      results.auditLogs = await this.cleanupAuditLogs(cutoff);

      // 2. Find closed/resolved incidents older than cutoff
      const oldIncidentIds = await this.getOldClosedIncidentIds(cutoff);

      if (oldIncidentIds.length > 0) {
        // 3. Delete ticket records linked to old incidents
        results.tickets = await this.cleanupTickets(oldIncidentIds);

        // 4. Delete incident-alert join records for old incidents
        results.incidentAlerts = await this.cleanupIncidentAlerts(oldIncidentIds);

        // 5. Delete old incidents
        results.incidents = await this.cleanupIncidents(oldIncidentIds);
      }

      // 6. Delete old alerts in terminal states that are not linked to any active incident
      const alertCleanup = await this.cleanupAlerts(cutoff);
      results.alerts = alertCleanup.alerts;
      results.incidentAlerts += alertCleanup.incidentAlerts;

      const total =
        results.alerts +
        results.incidentAlerts +
        results.incidents +
        results.tickets +
        results.auditLogs;

      console.log(
        `[Cleanup] Complete — removed ${total} records ` +
        `(alerts: ${results.alerts}, incidents: ${results.incidents}, ` +
        `tickets: ${results.tickets}, incidentAlerts: ${results.incidentAlerts}, ` +
        `auditLogs: ${results.auditLogs})`
      );

      await this.auditService.log('cleanup_completed', 'system', 'cleanup', {
        cutoffDate: cutoff.toISOString(),
        ...results,
      });

      return results;
    } catch (error) {
      console.error('[Cleanup] Error during cleanup:', error);
      await this.auditService.log('error', 'system', 'cleanup', {
        operation: 'cleanup',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete audit logs older than the cutoff date.
   */
  private async cleanupAuditLogs(cutoff: Date): Promise<number> {
    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoff },
      },
    });
    return result.count;
  }

  /**
   * Get IDs of closed/resolved incidents older than the cutoff date.
   */
  private async getOldClosedIncidentIds(cutoff: Date): Promise<string[]> {
    const incidents = await prisma.incident.findMany({
      where: {
        status: { in: ['closed', 'resolved'] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    return incidents.map((i) => i.id);
  }

  /**
   * Delete ticket records linked to the given incident IDs.
   */
  private async cleanupTickets(incidentIds: string[]): Promise<number> {
    const result = await prisma.ticketRecord.deleteMany({
      where: {
        incidentId: { in: incidentIds },
      },
    });
    return result.count;
  }

  /**
   * Delete incident-alert join records for the given incident IDs.
   */
  private async cleanupIncidentAlerts(incidentIds: string[]): Promise<number> {
    const result = await prisma.incidentAlert.deleteMany({
      where: {
        incidentId: { in: incidentIds },
      },
    });
    return result.count;
  }

  /**
   * Delete old incidents by their IDs.
   */
  private async cleanupIncidents(incidentIds: string[]): Promise<number> {
    const result = await prisma.incident.deleteMany({
      where: {
        id: { in: incidentIds },
      },
    });
    return result.count;
  }

  /**
   * Delete old alerts in terminal states that are no longer linked to any active incident.
   * Terminal states: cleared, ignored, ticket_created, acknowledged.
   */
  private async cleanupAlerts(cutoff: Date): Promise<{ alerts: number; incidentAlerts: number }> {
    // First, get IDs of alerts still linked to active (non-closed) incidents
    const activeLinks = await prisma.incidentAlert.findMany({
      where: {
        incident: {
          status: { notIn: ['closed', 'resolved'] },
        },
      },
      select: { alertId: true },
    });
    const activeAlertIds = new Set(activeLinks.map((l) => l.alertId));

    // Delete old terminal-state alerts that aren't linked to active incidents
    const oldAlerts = await prisma.alert.findMany({
      where: {
        receivedAt: { lt: cutoff },
        status: { in: ['cleared', 'ignored', 'ticket_created', 'acknowledged'] },
      },
      select: { id: true },
    });

    const alertIdsToDelete = oldAlerts
      .map((a) => a.id)
      .filter((id) => !activeAlertIds.has(id));

    if (alertIdsToDelete.length === 0) return { alerts: 0, incidentAlerts: 0 };

    // Delete orphaned IncidentAlert links for these alerts first
    const orphanedLinks = await prisma.incidentAlert.deleteMany({
      where: {
        alertId: { in: alertIdsToDelete },
      },
    });

    // Now delete the alerts
    const result = await prisma.alert.deleteMany({
      where: {
        id: { in: alertIdsToDelete },
      },
    });

    return { alerts: result.count, incidentAlerts: orphanedLinks.count };
  }
}
