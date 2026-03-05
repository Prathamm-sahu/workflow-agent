import { v4 as uuid } from 'uuid';
import { OpManagerWebhookPayload } from '../types/opmanager';
import { Alert, Severity } from '../types/models';
import { db } from '../db/prisma';

const VALID_SEVERITIES: Severity[] = ['Critical', 'Trouble', 'Attention', 'Clear'];

export class AlertProcessor {

  async process(payload: OpManagerWebhookPayload): Promise<Alert | null> {
    // Validate required fields
    this.validate(payload);

    const alarmId = payload.alarm?.id || '';
    const cycleId = payload.alarm?.cycleId || '';

    // Check deduplication
    const existing = await db.findAlertByAlarm(alarmId, cycleId);
    if (existing) {
      existing.severity = this.normalizeSeverity(payload.alarm.severity);
      existing.message = payload.alarm.message;
      existing.lastModifiedTime = payload.alarm.lastModifiedTime;
      await db.saveAlert(existing);
      await db.addAuditLog('alert_deduplicated', 'alert', existing.id, {
        alarmId,
        cycleId,
        newSeverity: payload.alarm.severity,
      });
      return null;
    }

    // Create new alert
    const alert: Alert = {
      id: uuid(),
      alarmId,
      cycleId,
      severity: this.normalizeSeverity(payload.alarm.severity),
      eventType: payload.alarm?.eventType || 'Unknown',
      message: payload.alarm?.message || '',
      entity: payload.alarm?.entity || '',
      lastPolledValue: payload.alarm?.lastPolledValue || '',
      rootCause: payload.alarm?.rootCause || '',

      deviceName: payload.device?.name || 'Unknown',
      deviceCategory: payload.device?.category || '',
      deviceType: payload.device?.type || '',
      deviceIp: payload.device?.ip || '',
      deviceVendor: payload.device?.vendor || '',
      deviceDependent: payload.device?.dependent || '',

      site: this.extractSite(payload),
      building: payload.device?.location?.building || '',
      floor: payload.device?.location?.floor || '',

      interfaceName: payload.interface?.name || '',
      interfaceIp: payload.interface?.ip || '',
      interfaceCircuitId:
        payload.interface?.circuitId || payload.interface?.custom?.circuitId || '',

      monitorName: payload.monitor?.name || '',

      status: 'new',
      incidentId: null,
      receivedAt: new Date(),
      lastModifiedTime: payload.alarm?.lastModifiedTime || '',
      rawPayload: payload as unknown as Record<string, unknown>,
    };

    await db.saveAlert(alert);
    await db.addAuditLog('alert_received', 'alert', alert.id, {
      alarmId: alert.alarmId,
      severity: alert.severity,
      eventType: alert.eventType,
      deviceName: alert.deviceName,
      site: alert.site,
    });

    return alert;
  }

  private validate(payload: OpManagerWebhookPayload): void {
    if (!payload.alarm) {
      throw new Error('Missing alarm data in webhook payload');
    }
    if (!payload.alarm.id) {
      throw new Error('Missing alarm.id in webhook payload');
    }
  }

  private normalizeSeverity(severity: string): Severity {
    const normalized = severity?.trim();
    if (VALID_SEVERITIES.includes(normalized as Severity)) {
      return normalized as Severity;
    }
    const lower = normalized?.toLowerCase() || '';
    if (lower.includes('critical')) return 'Critical';
    if (lower.includes('trouble') || lower.includes('major')) return 'Trouble';
    if (lower.includes('attention') || lower.includes('warning') || lower.includes('minor'))
      return 'Attention';
    if (lower.includes('clear') || lower.includes('ok')) return 'Clear';
    return 'Attention'; 
  }

  private extractSite(payload: OpManagerWebhookPayload): string {
    const location = payload.device?.location;
    if (location?.building && location.building.trim()) {
      return location.building.trim();
    }
    if (location?.siteAddress && location.siteAddress.trim()) {
      return location.siteAddress.trim();
    }
    return payload.device?.name || 'Unknown-Site';
  }
}
