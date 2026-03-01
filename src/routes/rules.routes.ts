import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/in-memory';
import { FilterRule, RuleCondition, RuleAction } from '../types/rules';

export function createRulesRoutes(): Router {
  const router = Router();

  /**
   * GET /api/rules — List all filter rules
   */
  router.get('/', (_req: Request, res: Response) => {
    const rules = db.getAllRules();
    res.json({ rules, total: rules.length });
  });

  /**
   * GET /api/rules/:id — Get a single rule
   */
  router.get('/:id', (req: Request, res: Response) => {
    const rule = db.getRule(req.params.id as string);
    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ rule });
  });

  /**
   * POST /api/rules — Create a new filter rule
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = req.body as {
        name: string;
        enabled?: boolean;
        conditions: RuleCondition[];
        matchMode?: 'all' | 'any';
        actions: RuleAction;
        order?: number;
      };

      if (!body.name || !body.conditions || !body.actions) {
        res.status(400).json({
          error: 'Missing required fields: name, conditions, actions',
        });
        return;
      }

      const rule: FilterRule = {
        id: uuid(),
        name: body.name,
        enabled: body.enabled !== false,
        conditions: body.conditions,
        matchMode: body.matchMode || 'all',
        actions: body.actions,
        order: body.order ?? db.getAllRules().length,
      };

      db.saveRule(rule);
      res.status(201).json({ rule });
    } catch (error) {
      res.status(400).json({
        error: 'Invalid rule data',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/rules/:id — Update an existing rule
   */
  router.put('/:id', (req: Request, res: Response) => {
    const existing = db.getRule(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const body = req.body;
    const updated: FilterRule = {
      ...existing,
      name: body.name ?? existing.name,
      enabled: body.enabled ?? existing.enabled,
      conditions: body.conditions ?? existing.conditions,
      matchMode: body.matchMode ?? existing.matchMode,
      actions: body.actions ?? existing.actions,
      order: body.order ?? existing.order,
    };

    db.saveRule(updated);
    res.json({ rule: updated });
  });

  /**
   * DELETE /api/rules/:id — Delete a rule
   */
  router.delete('/:id', (req: Request, res: Response) => {
    const deleted = db.deleteRule(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json({ message: 'Rule deleted' });
  });

  return router;
}
