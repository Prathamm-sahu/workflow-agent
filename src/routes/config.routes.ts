import { Router, Request, Response } from 'express';
import { db } from '../db/in-memory';
import { SiteContact, EscalationPolicy } from '../types/models';

export function createConfigRoutes(): Router {
  const router = Router();

  /**
   * GET /api/config/site-contacts — List all site contact mappings
   */
  router.get('/site-contacts', (_req: Request, res: Response) => {
    const contacts = db.getAllSiteContacts();
    res.json({ siteContacts: contacts, total: contacts.length });
  });

  /**
   * PUT /api/config/site-contacts — Update site contact mappings (bulk)
   */
  router.put('/site-contacts', (req: Request, res: Response) => {
    const body = req.body as { siteContacts: SiteContact[] };

    if (!body.siteContacts || !Array.isArray(body.siteContacts)) {
      res.status(400).json({
        error: 'Invalid payload',
        message: 'Body must include a "siteContacts" array',
      });
      return;
    }

    for (const contact of body.siteContacts) {
      if (!contact.site || !contact.personA) {
        res.status(400).json({
          error: 'Invalid contact',
          message: 'Each contact must have "site" and "personA" fields',
        });
        return;
      }
      db.saveSiteContact(contact);
    }

    res.json({
      message: `Updated ${body.siteContacts.length} site contact(s)`,
      siteContacts: db.getAllSiteContacts(),
    });
  });

  /**
   * GET /api/config/escalation — Get escalation policy
   */
  router.get('/escalation', (_req: Request, res: Response) => {
    res.json({ escalationPolicy: db.escalationPolicy });
  });

  /**
   * PUT /api/config/escalation — Update escalation policy
   */
  router.put('/escalation', (req: Request, res: Response) => {
    const body = req.body as Partial<EscalationPolicy>;

    if (body.slaBreachMinutes !== undefined) {
      db.escalationPolicy.slaBreachMinutes = body.slaBreachMinutes;
    }
    if (body.maxEscalationLevel !== undefined) {
      db.escalationPolicy.maxEscalationLevel = body.maxEscalationLevel;
    }
    if (body.enabled !== undefined) {
      db.escalationPolicy.enabled = body.enabled;
    }

    res.json({ escalationPolicy: db.escalationPolicy });
  });

  return router;
}
