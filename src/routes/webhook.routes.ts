import { Router, Request, Response } from 'express';
import { WorkflowOrchestrator } from '../services/workflow-orchestrator';
import { OpManagerWebhookPayload } from '../types/opmanager';

export function createWebhookRoutes(orchestrator: WorkflowOrchestrator): Router {
  const router = Router();

  router.post('/opmanager', async (req: Request, res: Response) => {
    try {
      const payload = req.body as OpManagerWebhookPayload;

      if (!payload || !payload.alarm) {
        res.status(400).json({
          error: 'Invalid payload',
          message: 'Request body must include an "alarm" object',
        });
        return;
      }

      res.status(202).json({
        status: 'accepted',
        message: 'Webhook received and queued for processing',
      });

      // Process in background (non-blocking)
      orchestrator.handleWebhook(payload).then((result) => {
        console.log(`[Webhook] Processed alarm ${payload.alarm.id}: ${result.action}`);
      }).catch((error) => {
        console.error(`[Webhook] Error processing alarm ${payload.alarm.id}:`, error);
      });
    } catch (error) {
      console.error('[Webhook] Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
