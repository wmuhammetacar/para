import 'dotenv/config';
import { closeDb, initDb } from '../src/db.js';
import { purgeOldAuditLogs } from '../src/utils/audit.js';

async function purge() {
  await initDb();

  const result = await purgeOldAuditLogs(process.env.AUDIT_LOG_RETENTION_DAYS);
  // eslint-disable-next-line no-console
  console.log(
    `Audit log purge tamamlandi. Silinen kayit: ${result.deleted}, retention gun: ${result.retentionDays}`
  );

  await closeDb();
}

purge().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Audit log purge hatasi:', error);
  await closeDb();
  process.exit(1);
});
