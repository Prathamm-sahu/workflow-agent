import { v4 as uuid } from 'uuid';
import { RuleEngine } from '../src/services/rule-engine';
import { Alert } from '../src/types/models';
import { FilterRule } from '../src/types/rules';
import { db } from '../src/db/in-memory';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: uuid(),
    alarmId: 'ALM-001',
    cycleId: 'CYC-001',
    severity: 'Critical',
    eventType: 'Device Down',
    message: 'Device is down',
    entity: 'ENT-001',
    lastPolledValue: '0',
    rootCause: '',
    deviceName: 'FW-Mumbai-01',
    deviceCategory: 'Firewall',
    deviceType: 'Hardware',
    deviceIp: '192.168.1.1',
    deviceVendor: 'Cisco',
    deviceDependent: '',
    site: 'HQ-Mumbai',
    building: 'HQ-Mumbai',
    floor: '3',
    interfaceName: '',
    interfaceIp: '',
    interfaceCircuitId: '',
    monitorName: '',
    status: 'new',
    incidentId: null,
    receivedAt: new Date(),
    lastModifiedTime: '',
    rawPayload: {},
    ...overrides,
  };
}

function makeRule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: uuid(),
    name: 'Test Rule',
    enabled: true,
    conditions: [],
    matchMode: 'all',
    actions: {
      createTicket: true,
      acknowledgeAlarm: true,
      priority: 'High',
    },
    order: 0,
    ...overrides,
  };
}

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    db.rules.clear();
    db.auditLogs.length = 0;
    engine = new RuleEngine();
  });

  it('should match a rule with equals operator', () => {
    const rule = makeRule({
      conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Critical' });
    const matched = engine.evaluate(alert);

    expect(matched).not.toBeNull();
    expect(matched!.id).toBe(rule.id);
  });

  it('should not match when condition fails', () => {
    const rule = makeRule({
      conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Attention' });
    const matched = engine.evaluate(alert);

    expect(matched).toBeNull();
  });

  it('should match "contains" operator', () => {
    const rule = makeRule({
      conditions: [{ field: 'eventType', operator: 'contains', value: 'Device' }],
    });
    db.saveRule(rule);

    const alert = makeAlert({ eventType: 'Device Down' });
    const matched = engine.evaluate(alert);

    expect(matched).not.toBeNull();
  });

  it('should match "in" operator', () => {
    const rule = makeRule({
      conditions: [
        { field: 'severity', operator: 'in', value: ['Critical', 'Trouble'] },
      ],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Trouble' });
    const matched = engine.evaluate(alert);

    expect(matched).not.toBeNull();
  });

  it('should require ALL conditions in "all" matchMode', () => {
    const rule = makeRule({
      matchMode: 'all',
      conditions: [
        { field: 'severity', operator: 'equals', value: 'Critical' },
        { field: 'deviceCategory', operator: 'equals', value: 'Switch' },
      ],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Critical', deviceCategory: 'Firewall' });
    const matched = engine.evaluate(alert);

    expect(matched).toBeNull(); // deviceCategory doesn't match
  });

  it('should require ANY condition in "any" matchMode', () => {
    const rule = makeRule({
      matchMode: 'any',
      conditions: [
        { field: 'severity', operator: 'equals', value: 'Critical' },
        { field: 'deviceCategory', operator: 'equals', value: 'Switch' },
      ],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Critical', deviceCategory: 'Firewall' });
    const matched = engine.evaluate(alert);

    expect(matched).not.toBeNull(); // severity matches
  });

  it('should return the first matching rule by order', () => {
    const rule1 = makeRule({
      name: 'Low priority rule',
      conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }],
      order: 1,
    });
    const rule0 = makeRule({
      name: 'High priority rule',
      conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }],
      order: 0,
    });
    db.saveRule(rule1);
    db.saveRule(rule0);

    const alert = makeAlert({ severity: 'Critical' });
    const matched = engine.evaluate(alert);

    expect(matched!.name).toBe('High priority rule');
  });

  it('should skip disabled rules', () => {
    const rule = makeRule({
      enabled: false,
      conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }],
    });
    db.saveRule(rule);

    const alert = makeAlert({ severity: 'Critical' });
    const matched = engine.evaluate(alert);

    expect(matched).toBeNull();
  });
});
