import 'dotenv/config';
import app from './app.js';
import { initDb } from './db.js';
import { processReminderQueue, startReminderWorker, stopReminderWorker } from './services/reminderQueue.js';

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || '127.0.0.1';

async function start() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET tanimli olmadan production modda baslatilamaz.');
    }

    if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
      throw new Error('CORS_ORIGIN tanimli olmadan production modda baslatilamaz.');
    }

    await initDb();
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
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      stopReminderWorker();
      process.exit(0);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

start();
