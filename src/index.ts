import express from 'express';
import cors from 'cors';
import { loadConfig } from './config';
import { WorkflowOrchestrator } from './services/workflow-orchestrator';
import { createWebhookRoutes } from './routes/webhook.routes';
import { createRulesRoutes } from './routes/rules.routes';
import { createDashboardRoutes } from './routes/dashboard.routes';
import { createConfigRoutes } from './routes/config.routes';
import { errorHandler } from './middleware/error-handler';
import { seedDefaultData } from './seed';
import { CleanupService } from './services/cleanup.service';

const config = loadConfig();
const app = express();

app.use(cors());
app.use(express.json());

const orchestrator = new WorkflowOrchestrator(config);
app.use('/api/webhooks', createWebhookRoutes(orchestrator));
app.use('/api/rules', createRulesRoutes());
app.use('/api/dashboard', createDashboardRoutes());
app.use('/api/config', createConfigRoutes());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), dryRun: config.dryRun });
});

app.use(errorHandler);

async function main() {
  await seedDefaultData();

  // Start the cleanup scheduler
  const cleanupService = new CleanupService({
    retentionDays: config.retentionDays,
    intervalMs: config.cleanupIntervalHours * 60 * 60 * 1000,
  });
  cleanupService.start();

  const server = app.listen(config.port, () => {
    console.log(`\n🚀 NOC Automation Server running on port ${config.port}`);
    console.log(`   Mode: ${config.dryRun ? 'DRY-RUN (no external API calls)' : 'LIVE'}`);
    console.log(`   Database: SQLite (Prisma)`);
    console.log(`   ServiceDesk: ${config.serviceDesk.baseUrl}`);
    console.log(`   OpManager:   ${config.opManager.baseUrl}`);
    console.log(`   Correlation Window: ${config.correlationWindowMinutes} minutes`);
    console.log(`   Data Retention: ${config.retentionDays} days`);
    console.log(`   Cleanup Interval: ${config.cleanupIntervalHours}h\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Shutdown] Stopping cleanup scheduler...');
    cleanupService.stop();
    console.log('[Shutdown] Closing HTTP server...');
    server.close(() => {
      console.log('[Shutdown] Server closed. Exiting.');
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
