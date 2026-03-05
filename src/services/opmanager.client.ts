import axios from 'axios';
import { AppConfig } from '../config';

export class OpManagerClient {
  private baseUrl: string;
  private apiKey: string;
  private dryRun: boolean;

  constructor(config: AppConfig) {
    this.baseUrl = config.opManager.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.opManager.apiKey;
    this.dryRun = config.dryRun;
  }

  async acknowledgeAlarm(alarmEntity: string): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/json/alarm/acknowledgeAlarm`;

    if (this.dryRun) {
      console.log(`[DRY-RUN] OpManager acknowledgeAlarm: entity=${alarmEntity}`);
      return { success: true };
    }

    try {
      const response = await axios.post(url, null, {
        params: {
          apiKey: this.apiKey,
          entity: alarmEntity,
        },
      });
      console.log(`[OpManager] Alarm acknowledged: entity=${alarmEntity}`, response.data);
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[OpManager] Failed to acknowledge alarm ${alarmEntity}:`, errMsg);
      throw new Error(`OpManager acknowledgeAlarm failed: ${errMsg}`);
    }
  }

  /**
   * Clear an alarm in OpManager.
   * POST /api/json/alarm/clearAlarm?apiKey=...&entity=...
   */
  async clearAlarm(alarmEntity: string): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/json/alarm/clearAlarm`;

    if (this.dryRun) {
      console.log(`[DRY-RUN] OpManager clearAlarm: entity=${alarmEntity}`);
      return { success: true };
    }

    try {
      const response = await axios.post(url, null, {
        params: {
          apiKey: this.apiKey,
          entity: alarmEntity,
        },
      });
      console.log(`[OpManager] Alarm cleared: entity=${alarmEntity}`, response.data);
      return { success: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[OpManager] Failed to clear alarm ${alarmEntity}:`, errMsg);
      throw new Error(`OpManager clearAlarm failed: ${errMsg}`);
    }
  }

  async listAlarms(params?: {
    severity?: string;
    deviceName?: string;
  }): Promise<unknown> {
    const url = `${this.baseUrl}/api/json/alarm/listAlarms`;

    if (this.dryRun) {
      console.log('[DRY-RUN] OpManager listAlarms:', params);
      return { alarms: [] };
    }

    try {
      const response = await axios.get(url, {
        params: {
          apiKey: this.apiKey,
          ...params,
        },
      });
      return response.data;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[OpManager] Failed to list alarms:', errMsg);
      return { alarms: [] };
    }
  }
}
