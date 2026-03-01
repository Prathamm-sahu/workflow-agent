import { AlertProcessor } from '../src/services/alert-processor';
import { OpManagerWebhookPayload } from '../src/types/opmanager';
import { db } from '../src/db/in-memory';

function makePayload(overrides: Partial<OpManagerWebhookPayload> = {}): OpManagerWebhookPayload {
  return {
    source: 'opmanager',
    profile: { name: 'TestProfile' },
    alarm: {
      id: 'ALM-001',
      message: 'Device is down',
      severity: 'Critical',
      eventType: 'Device Down',
      lastModifiedTime: '2024-01-01T10:00:00',
      cycleId: 'CYC-001',
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

describe('AlertProcessor', () => {
  let processor: AlertProcessor;

  beforeEach(() => {
    // Reset DB state
    db.alerts.clear();
    (db as any).alarmDedup.clear();
    db.auditLogs.length = 0;
    processor = new AlertProcessor();
  });

  it('should parse a valid webhook payload into an Alert', () => {
    const payload = makePayload();
    const alert = processor.process(payload);

    expect(alert).not.toBeNull();
    expect(alert!.alarmId).toBe('ALM-001');
    expect(alert!.severity).toBe('Critical');
    expect(alert!.eventType).toBe('Device Down');
    expect(alert!.deviceName).toBe('FW-Mumbai-01');
    expect(alert!.deviceCategory).toBe('Firewall');
    expect(alert!.site).toBe('HQ-Mumbai');
    expect(alert!.status).toBe('new');
  });

  it('should deduplicate alerts with same alarmId + cycleId', () => {
    const payload = makePayload();
    const first = processor.process(payload);
    expect(first).not.toBeNull();

    const second = processor.process(payload);
    expect(second).toBeNull(); // deduplicated

    // Should have a dedup audit log
    const dedupLogs = db.auditLogs.filter((l) => l.action === 'alert_deduplicated');
    expect(dedupLogs.length).toBe(1);
  });

  it('should treat different cycleIds as different alerts', () => {
    const payload1 = makePayload();
    const payload2 = makePayload({
      alarm: { ...makePayload().alarm, cycleId: 'CYC-002' },
    });

    const first = processor.process(payload1);
    const second = processor.process(payload2);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).not.toBe(second!.id);
  });

  it('should throw on missing alarm data', () => {
    const payload = { source: 'opmanager' } as OpManagerWebhookPayload;
    expect(() => processor.process(payload)).toThrow('Missing alarm data');
  });

  it('should throw on missing alarm.id', () => {
    const payload = makePayload({
      alarm: { ...makePayload().alarm, id: '' },
    });
    expect(() => processor.process(payload)).toThrow('Missing alarm.id');
  });

  it('should normalize severity values', () => {
    const payload = makePayload({
      alarm: { ...makePayload().alarm, severity: 'major', cycleId: 'CYC-100' },
    });
    const alert = processor.process(payload);
    expect(alert!.severity).toBe('Trouble');
  });

  it('should extract site from building field', () => {
    const payload = makePayload();
    const alert = processor.process(payload);
    expect(alert!.site).toBe('HQ-Mumbai');
  });

  it('should fallback site to siteAddress if building is empty', () => {
    const payload = makePayload();
    payload.device.location.building = '';
    payload.alarm.cycleId = 'CYC-200';
    const alert = processor.process(payload);
    expect(alert!.site).toBe('Mumbai, India');
  });
});

export { makePayload };
