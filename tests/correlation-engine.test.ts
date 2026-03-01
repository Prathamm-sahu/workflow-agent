import { v4 as uuid } from 'uuid';
import { CorrelationEngine } from '../src/services/correlation-engine';
import { Alert } from '../src/types/models';
import { db } from '../src/db/in-memory';
import { AppConfig } from '../src/config';

const testConfig: AppConfig = {
  port: 3000,
  serviceDesk: { baseUrl: '', apiKey: '' },
  opManager: { baseUrl: '', apiKey: '' },
  dryRun: true,
  correlationWindowMinutes: 5,
};

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: uuid(),
    alarmId: `ALM-${Date.now()}`,
    cycleId: `CYC-${Date.now()}`,
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

describe('CorrelationEngine', () => {
  let engine: CorrelationEngine;

  beforeEach(() => {
    db.alerts.clear();
    db.incidents.clear();
    db.auditLogs.length = 0;
    engine = new CorrelationEngine(testConfig);
  });

  it('should create a new incident for the first alert at a site', () => {
    const alert = makeAlert();
    db.saveAlert(alert);

    const incident = engine.correlate(alert);

    expect(incident).toBeDefined();
    expect(incident.alertIds).toContain(alert.id);
    expect(incident.site).toBe('HQ-Mumbai');
    expect(incident.severity).toBe('Critical');
    expect(incident.status).toBe('open');
  });

  it('should correlate a second alert from the same site into the same incident', () => {
    const alert1 = makeAlert({ deviceName: 'FW-Mumbai-01' });
    db.saveAlert(alert1);
    const incident1 = engine.correlate(alert1);

    const alert2 = makeAlert({
      deviceName: 'SW-Mumbai-01',
      alarmId: 'ALM-002',
      cycleId: 'CYC-002',
    });
    db.saveAlert(alert2);
    const incident2 = engine.correlate(alert2);

    expect(incident2.id).toBe(incident1.id);
    expect(incident2.alertIds.length).toBe(2);
  });

  it('should NOT correlate alerts from different sites', () => {
    const alert1 = makeAlert({ site: 'HQ-Mumbai' });
    db.saveAlert(alert1);
    const incident1 = engine.correlate(alert1);

    const alert2 = makeAlert({
      site: 'Branch-Delhi',
      alarmId: 'ALM-003',
      cycleId: 'CYC-003',
    });
    db.saveAlert(alert2);
    const incident2 = engine.correlate(alert2);

    expect(incident2.id).not.toBe(incident1.id);
  });

  it('should escalate severity when a more severe alert arrives', () => {
    const alert1 = makeAlert({ severity: 'Trouble' });
    db.saveAlert(alert1);
    const incident = engine.correlate(alert1);

    expect(incident.severity).toBe('Trouble');

    const alert2 = makeAlert({
      severity: 'Critical',
      alarmId: 'ALM-004',
      cycleId: 'CYC-004',
    });
    db.saveAlert(alert2);
    const updatedIncident = engine.correlate(alert2);

    expect(updatedIncident.id).toBe(incident.id);
    expect(updatedIncident.severity).toBe('Critical');
  });

  it('should build a summary for a single-alert incident', () => {
    const alert = makeAlert();
    db.saveAlert(alert);
    const incident = engine.correlate(alert);

    expect(incident.summary).toContain('Critical');
    expect(incident.summary).toContain('Device Down');
    expect(incident.summary).toContain('FW-Mumbai-01');
  });

  it('should build a multi-alert summary', () => {
    const alert1 = makeAlert({ deviceName: 'FW-Mumbai-01' });
    db.saveAlert(alert1);
    engine.correlate(alert1);

    const alert2 = makeAlert({
      deviceName: 'SW-Mumbai-01',
      alarmId: 'ALM-005',
      cycleId: 'CYC-005',
    });
    db.saveAlert(alert2);
    const incident = engine.correlate(alert2);

    expect(incident.summary).toContain('2 alerts');
    expect(incident.summary).toContain('FW-Mumbai-01');
    expect(incident.summary).toContain('SW-Mumbai-01');
  });
});
