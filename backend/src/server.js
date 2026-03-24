import 'dotenv/config';
import app from './app.js';
import { initDb } from './db.js';
import { processReminderQueue, startReminderWorker, stopReminderWorker } from './services/reminderQueue.js';
import { purgeOldAuditLogs } from './utils/audit.js';

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || '127.0.0.1';
let auditPurgeInterval = null;

async function start() {
  try {
    const shouldEnforceStrictConfig = process.env.NODE_ENV !== 'test';

    if (shouldEnforceStrictConfig && !process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET tanimli olmadan servis baslatilamaz.');
    }

    if (shouldEnforceStrictConfig && !process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN tanimli olmadan servis baslatilamaz.');
    }

    await initDb();
    if (process.env.NODE_ENV !== 'test') {
      const initialPurge = await purgeOldAuditLogs();
      // eslint-disable-next-line no-console
      console.log(
        `Audit purge completed: deleted=${initialPurge.deleted}, retentionDays=${initialPurge.retentionDays}`
      );

      const purgeIntervalMs = Number(process.env.AUDIT_PURGE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
      auditPurgeInterval = setInterval(() => {
        purgeOldAuditLogs().catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Audit purge failed:', error);
        });
      }, purgeIntervalMs);

      if (typeof auditPurgeInterval.unref === 'function') {
        auditPurgeInterval.unref();
      }
    }

    await processReminderQueue({ limit: 50 });
    startReminderWorker({
      intervalMs: Number(process.env.REMINDER_WORKER_INTERVAL_MS) || 15000
    });

    app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`Teklifim backend running on http://${host}:${port}`);
    });

    process.on('SIGINT', () => {
      stopReminderWorker();
      if (auditPurgeInterval) {
        clearInterval(auditPurgeInterval);
      }
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      stopReminderWorker();
      if (auditPurgeInterval) {
        clearInterval(auditPurgeInterval);
      }
      process.exit(0);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

start();
