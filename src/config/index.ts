import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  serviceDesk: {
    baseUrl: string;
    apiKey: string;
  };
  opManager: {
    baseUrl: string;
    apiKey: string;
  };
  dryRun: boolean;
  correlationWindowMinutes: number;
  retentionDays: number;
  cleanupIntervalHours: number;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    serviceDesk: {
      baseUrl: process.env.SERVICEDESK_BASE_URL || 'http://localhost:5000',
      apiKey: process.env.SERVICEDESK_API_KEY || '',
    },
    opManager: {
      baseUrl: process.env.OPMANAGER_BASE_URL || 'http://localhost:8060',
      apiKey: process.env.OPMANAGER_API_KEY || '',
    },
    dryRun: process.env.DRY_RUN === 'true',
    correlationWindowMinutes: parseInt(process.env.CORRELATION_WINDOW_MINUTES || '5', 10),
    retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
    cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24', 10),
  };
}
