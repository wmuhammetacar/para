import 'dotenv/config';
import { closeDb, get, initDb, run } from '../src/db.js';

async function purgeDemoData() {
  await initDb();

  const demoEmail = 'demo@teklifim.com';
  const demoUser = await get('SELECT id, email FROM users WHERE email = ?', [demoEmail]);

  if (!demoUser) {
    // eslint-disable-next-line no-console
    console.log('Demo kullanici bulunamadi. Silinecek veri yok.');
    await closeDb();
    return;
  }

  await run('DELETE FROM audit_logs WHERE user_id = ?', [demoUser.id]);
  await run('DELETE FROM users WHERE id = ?', [demoUser.id]);

  // eslint-disable-next-line no-console
  console.log(`Demo verileri silindi: ${demoEmail}`);

  await closeDb();
}

purgeDemoData().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Demo veri temizleme hatasi:', error);
  await closeDb();
  process.exit(1);
});
