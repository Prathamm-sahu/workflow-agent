import { Router, Request, Response } from 'express';
import { db } from '../db/prisma';
import { AuditService } from '../services/audit.service';

export function createDashboardRoutes(): Router {
  const router = Router();
  const auditService = new AuditService();

  /**
   * GET /api/dashboard/stats — Overview metrics
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    const stats = await db.getStats();
    res.json(stats);
  });

  /**
   * GET /api/dashboard/alerts — Recent alerts
   */
  router.get('/alerts', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = await db.getRecentAlerts(limit);
    res.json({ alerts, total: alerts.length });
  });

  /**
   * GET /api/dashboard/incidents — Active incidents
   */
  router.get('/incidents', async (_req: Request, res: Response) => {
    const incidents = await db.getActiveIncidents();
    res.json({ incidents, total: incidents.length });
  });

  /**
   * GET /api/dashboard/tickets — Recent tickets
   */
  router.get('/tickets', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const tickets = await db.getRecentTickets(limit);
    res.json({ tickets, total: tickets.length });
  });

  /**
   * GET /api/dashboard/audit-logs — Audit trail
   */
  router.get('/audit-logs', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const action = req.query.action as string | undefined;
    const entityType = req.query.entityType as string | undefined;

    const logs = await auditService.getLogs({
      action: action as any,
      entityType: entityType as any,
      limit,
    });

    res.json({ auditLogs: logs, total: logs.length });
  });

  return router;
}
