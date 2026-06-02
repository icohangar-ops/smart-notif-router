import { config } from './config';
import app from './app';
import { initDatabase, closeDatabase, getDatabase } from './models/database';
import { startWorker, stopWorker } from './workers/delivery.worker';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           Smart Notification Router v1.0.0              ║');
  console.log('║     AI-Powered Multi-Channel Alert Routing Engine      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize database
  initDatabase();
  console.log(`[DB] SQLite database ready at ${config.db.path}`);

  // Seed sample data if empty
  const db = getDatabase();
  const count = (db.prepare('SELECT COUNT(*) as c FROM channels').get() as any).c;
  if (count === 0) {
    console.log('[DB] Seeding sample channels...');
    db.prepare("INSERT INTO channels (type, name, config) VALUES ('email', 'Default Email (Wooxy)', '{\"provider\": \"wooxy\"}')").run();
    db.prepare("INSERT INTO channels (type, name, config) VALUES ('webhook', 'Slack Webhook', '{\"url\": \"https://hooks.slack.com/services/demo\"}')").run();
    db.prepare("INSERT INTO channels (type, name, config) VALUES ('sms', 'Ops Team SMS', '{\"provider\": \"twilio\"}')").run();
    db.prepare("INSERT INTO routing_rules (name, description, conditions, channel, priority_override) VALUES ('Critical → SMS', 'All critical alerts go to SMS', '{\"priority\": \"critical\"}', 'sms', 'critical')").run();
    db.prepare("INSERT INTO routing_rules (name, description, conditions, channel, priority_override) VALUES ('CI/CD → Webhook', 'GitHub Actions events to webhook', '{\"source\": \"github-actions\"}', 'webhook', null)").run();
    console.log('[DB] Sample data seeded');
  }

  // Start BullMQ worker
  try {
    startWorker();
  } catch (error) {
    console.warn('[Worker] BullMQ worker failed to start (Redis unavailable). Running in synchronous mode.');
    console.warn(`[Worker] Connect Redis at ${config.redis.host}:${config.redis.port} for async processing.`);
  }

  // Start Express server
  app.listen(config.port, () => {
    console.log('');
    console.log(`[Server] Express API running on http://localhost:${config.port}`);
    console.log(`[Server] Swagger docs: http://localhost:${config.port}/api/docs`);
    console.log(`[Server] Health check: http://localhost:${config.port}/api/health`);
    console.log('');
    console.log('[Server] Ready to accept notifications!');
    console.log('');
  });
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}. Shutting down gracefully...`);
  try {
    await stopWorker();
    closeDatabase();
    console.log('[Shutdown] Cleanup complete. Exiting.');
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] Error during cleanup:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  console.error('[Fatal] Failed to start:', error);
  process.exit(1);
});
