import { Router, Request, Response } from 'express';
import { db } from '../db/prisma';

export function createConfigRoutes(): Router {
  const router = Router();

  // Placeholder — site contacts and escalation policy can be added later
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ message: 'Config routes active' });
  });

  return router;
}
