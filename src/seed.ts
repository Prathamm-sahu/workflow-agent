import { v4 as uuid } from 'uuid';
import { db } from './db/prisma';
import { FilterRule } from './types/rules';
import { SiteContact } from './types/models';

/**
 * Seeds the database with default filter rules and sample site contacts.
 * This runs once at startup. It checks if data already exists to avoid duplicates.
 */
export async function seedDefaultData(): Promise<void> {
  await seedFilterRules();
  await seedSiteContacts();
  console.log('[Seed] Default data loaded successfully');
}

async function seedFilterRules(): Promise<void> {
  // Check if rules already exist
  const existing = await db.getAllRules();
  if (existing.length > 0) {
    console.log(`[Seed] ${existing.length} rules already exist, skipping rule seed`);
    return;
  }

  const rules: FilterRule[] = [
    {
      id: uuid(),
      name: 'Critical Alerts → Create Ticket (High Priority)',
      enabled: true,
      conditions: [
        { field: 'severity', operator: 'equals', value: 'Critical' },
      ],
      matchMode: 'all',
      actions: {
        createTicket: true,
        acknowledgeAlarm: true,
        priority: 'High',
      },
      order: 0,
    },
    {
      id: uuid(),
      name: 'Trouble Alerts → Create Ticket (Medium Priority)',
      enabled: true,
      conditions: [
        { field: 'severity', operator: 'equals', value: 'Trouble' },
      ],
      matchMode: 'all',
      actions: {
        createTicket: true,
        acknowledgeAlarm: true,
        priority: 'Medium',
      },
      order: 1,
    },
    {
      id: uuid(),
      name: 'Device Down on Firewalls → Create Ticket (High Priority)',
      enabled: true,
      conditions: [
        { field: 'eventType', operator: 'contains', value: 'Device Down' },
        { field: 'deviceCategory', operator: 'equals', value: 'Firewall' },
      ],
      matchMode: 'all',
      actions: {
        createTicket: true,
        acknowledgeAlarm: true,
        priority: 'High',
      },
      order: 2,
    },
    {
      id: uuid(),
      name: 'Interface Down → Create Ticket (Medium Priority)',
      enabled: true,
      conditions: [
        { field: 'eventType', operator: 'contains', value: 'Interface Down' },
      ],
      matchMode: 'all',
      actions: {
        createTicket: true,
        acknowledgeAlarm: true,
        priority: 'Medium',
      },
      order: 3,
    },
    {
      id: uuid(),
      name: 'Attention Alerts → Log Only (No Ticket)',
      enabled: true,
      conditions: [
        { field: 'severity', operator: 'equals', value: 'Attention' },
      ],
      matchMode: 'all',
      actions: {
        createTicket: false,
        acknowledgeAlarm: false,
        priority: 'Low',
      },
      order: 10,
    },
  ];

  for (const r of rules) {
    await db.saveRule(r);
  }
  console.log(`[Seed] Loaded ${rules.length} default filter rules`);
}

async function seedSiteContacts(): Promise<void> {
  // Check if contacts already exist
  const existing = await db.getAllSiteContacts();
  if (existing.length > 0) {
    console.log(`[Seed] ${existing.length} site contacts already exist, skipping contact seed`);
    return;
  }

  const contacts: SiteContact[] = [
    {
      site: 'HQ-Mumbai',
      personA: {
        name: 'Rajesh Kumar',
        email: 'rajesh.kumar@soffit.in',
        phone: '+91-9876543210',
      },
      escalationContacts: [
        {
          name: 'Priya Sharma',
          email: 'priya.sharma@soffit.in',
          phone: '+91-9876543211',
        },
        {
          name: 'Amit Patel',
          email: 'amit.patel@soffit.in',
          phone: '+91-9876543212',
        },
      ],
    },
    {
      site: 'Branch-Delhi',
      personA: {
        name: 'Suresh Gupta',
        email: 'suresh.gupta@soffit.in',
        phone: '+91-9876543220',
      },
      escalationContacts: [
        {
          name: 'Priya Sharma',
          email: 'priya.sharma@soffit.in',
          phone: '+91-9876543211',
        },
        {
          name: 'Amit Patel',
          email: 'amit.patel@soffit.in',
          phone: '+91-9876543212',
        },
      ],
    },
    {
      site: 'Branch-Bangalore',
      personA: {
        name: 'Vikram Reddy',
        email: 'vikram.reddy@soffit.in',
        phone: '+91-9876543230',
      },
      escalationContacts: [
        {
          name: 'Priya Sharma',
          email: 'priya.sharma@soffit.in',
          phone: '+91-9876543211',
        },
      ],
    },
    {
      site: 'DC-Chennai',
      personA: {
        name: 'Arun Subramanian',
        email: 'arun.s@soffit.in',
        phone: '+91-9876543240',
      },
      escalationContacts: [
        {
          name: 'Amit Patel',
          email: 'amit.patel@soffit.in',
          phone: '+91-9876543212',
        },
      ],
    },
  ];

  for (const c of contacts) {
    await db.saveSiteContact(c);
  }
  console.log(`[Seed] Loaded ${contacts.length} sample site contacts`);
}
