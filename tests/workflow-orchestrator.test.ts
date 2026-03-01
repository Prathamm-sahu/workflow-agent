import { WorkflowOrchestrator } from '../src/services/workflow-orchestrator';
import { OpManagerWebhookPayload } from '../src/types/opmanager';
import { db } from '../src/db/in-memory';
import { AppConfig } from '../src/config';
import { seedDefaultData } from '../src/seed';

const testConfig: AppConfig = {
  port: 3000,
  serviceDesk: { baseUrl: 'http://localhost:8080', apiKey: 'test-key' },
  opManager: { baseUrl: 'http://localhost:8060', apiKey: 'test-key' },
  dryRun: true,
  correlationWindowMinutes: 5,
};

function makePayload(overrides: Record<string, any> = {}): OpManagerWebhookPayload {
  return {
    source: 'opmanager',
    profile: { name: 'TestProfile' },
    alarm: {
      id: `ALM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      message: 'Device is unreachable',
      severity: 'Critical',
      eventType: 'Device Down',
      lastModifiedTime: new Date().toISOString(),
      cycleId: `CYC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      rootCause: '',
      entity: 'ENT-001',
      lastPolledValue: '0',
      ...(overrides.alarm || {}),
    },
    device: {
      name: 'FW-Mumbai-01',
      category: 'Firewall',
      type: 'Hardware',
      ip: '192.168.1.1',
      vendor: 'Cisco',
      isSNMP: 'true',
      dependent: '',
      hardware: { ramSize: '8GB', hardDiskSize: '256GB' },
      location: {
        building: 'HQ-Mumbai',
        floor: '3',
        cabinet: 'A1',
        siteAddress: 'Mumbai, India',
      },
      asset: { department: 'IT', serialNumber: 'SN-123', vmwareTags: '' },
      contact: { name: 'Rajesh Kumar', phone: '+91-9876543210' },
      ...(overrides.device || {}),
    },
    interface: {
      name: '',
      description: '',
      alias: '',
      ip: '',
      media: '',
      index: '',
      circuitId: '',
      speedIn: '',
      speedOut: '',
      custom: {
        circuitId: '',
        sla: '',
        severity: '',
        contactName: '',
        phone: '',
        comments: '',
      },
      ...(overrides.interface || {}),
    },
    monitor: {
      name: '',
      instance: '',
      protocol: '',
      ...(overrides.monitor || {}),
    },
  } as OpManagerWebhookPayload;
}

describe('WorkflowOrchestrator', () => {
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    db.alerts.clear();
    db.incidents.clear();
    db.tickets.clear();
    db.rules.clear();
    db.siteContacts.clear();
    (db as any).alarmDedup.clear();
    db.auditLogs.length = 0;

    // Load default rules and contacts
    seedDefaultData();

    orchestrator = new WorkflowOrchestrator(testConfig);
  });

  it('should create a ticket for a Critical alarm', async () => {
    const payload = makePayload({
      alarm: { severity: 'Critical', eventType: 'Device Down' },
    });

    const result = await orchestrator.handleWebhook(payload);

    expect(result.action).toBe('ticket_created');
    expect(result.alertId).toBeDefined();
    expect(result.incidentId).toBeDefined();
    expect(result.ticketId).toBeDefined();

    // Verify ticket record was saved
    const tickets = db.getRecentTickets();
    expect(tickets.length).toBe(1);
    expect(tickets[0].status).toBe('open');
  });

  it('should create a ticket for a Trouble alarm', async () => {
    const payload = makePayload({
      alarm: { severity: 'Trouble', eventType: 'High CPU Usage' },
    });

    const result = await orchestrator.handleWebhook(payload);

    expect(result.action).toBe('ticket_created');
  });

  it('should NOT create a ticket for Attention severity (log only rule)', async () => {
    const payload = makePayload({
      alarm: { severity: 'Attention', eventType: 'Minor Alert' },
    });

    const result = await orchestrator.handleWebhook(payload);

    // The "Attention" rule has createTicket: false
    expect(result.action).toBe('rule_matched_no_ticket');
    expect(db.getRecentTickets().length).toBe(0);
  });

  it('should deduplicate identical alarms', async () => {
    const payload = makePayload();

    const result1 = await orchestrator.handleWebhook(payload);
    expect(result1.action).toBe('ticket_created');

    const result2 = await orchestrator.handleWebhook(payload);
    expect(result2.action).toBe('deduplicated');

    // Only one ticket should exist
    expect(db.getRecentTickets().length).toBe(1);
  });

  it('should handle Clear severity by closing tickets', async () => {
    // First, create a ticket
    const critPayload = makePayload({
      alarm: { severity: 'Critical', eventType: 'Device Down' },
    });
    await orchestrator.handleWebhook(critPayload);
    expect(db.getRecentTickets().length).toBe(1);

    // Now send a Clear alarm for the same site
    const clearPayload = makePayload({
      alarm: { severity: 'Clear', eventType: 'Device Up' },
      device: {
        name: 'FW-Mumbai-01',
        location: { building: 'HQ-Mumbai' },
      },
    });

    const result = await orchestrator.handleWebhook(clearPayload);
    expect(result.action).toBe('alarm_cleared');
  });

  it('should correlate multiple alerts from the same site', async () => {
    const payload1 = makePayload({
      alarm: { severity: 'Critical', eventType: 'Device Down' },
      device: { name: 'FW-Mumbai-01' },
    });
    const result1 = await orchestrator.handleWebhook(payload1);
    expect(result1.action).toBe('ticket_created');

    const payload2 = makePayload({
      alarm: { severity: 'Critical', eventType: 'Interface Down' },
      device: { name: 'SW-Mumbai-01' },
    });
    const result2 = await orchestrator.handleWebhook(payload2);

    // Second alert should be correlated to the same incident
    expect(result2.action).toBe('ticket_updated');
    expect(result2.incidentId).toBe(result1.incidentId);

    // Still only one ticket
    expect(db.getRecentTickets().length).toBe(1);
  });

  it('should generate audit logs for each step', async () => {
    const payload = makePayload({
      alarm: { severity: 'Critical' },
    });

    await orchestrator.handleWebhook(payload);

    const logs = db.getAuditLogs();
    const actions = logs.map((l) => l.action);

    expect(actions).toContain('alert_received');
    expect(actions).toContain('rule_matched');
    expect(actions).toContain('incident_created');
    expect(actions).toContain('ticket_created');
    expect(actions).toContain('alarm_acknowledged');
  });
});
