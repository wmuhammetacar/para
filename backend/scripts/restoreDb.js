import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

function resolveDbPath() {
  const envPath = process.env.DB_PATH || './database.sqlite';
  if (path.isAbsolute(envPath)) {
    return envPath;
  }

  return path.resolve(process.cwd(), envPath);
}

function parseFromArg(argv) {
  const fromIndex = argv.indexOf('--from');
  if (fromIndex < 0 || fromIndex === argv.length - 1) {
    return '';
  }

  return argv[fromIndex + 1];
}

async function restoreDb() {
  const fromArg = parseFromArg(process.argv.slice(2));
  if (!fromArg) {
    throw new Error('Kullanim: npm run restore:db -- --from <backup-file-path>');
  }

  const sourcePath = path.isAbsolute(fromArg) ? fromArg : path.resolve(process.cwd(), fromArg);
  const dbPath = resolveDbPath();

  await fs.access(sourcePath);
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.copyFile(sourcePath, dbPath);

  // onceki wal/shm dosyalari varsa temizlenir
  await Promise.all([
    fs.rm(`${dbPath}-wal`, { force: true }),
    fs.rm(`${dbPath}-shm`, { force: true }),
    fs.rm(`${dbPath}-journal`, { force: true })
  ]);

  // backup ile gelen wal/shm dosyalari da varsa geri yuklenir
  await Promise.all([
    fs.copyFile(`${sourcePath}-wal`, `${dbPath}-wal`).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }),
    fs.copyFile(`${sourcePath}-shm`, `${dbPath}-shm`).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    })
  ]);

  // eslint-disable-next-line no-console
  console.log(`Restore tamamlandi: ${sourcePath} -> ${dbPath}`);
}

restoreDb().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Restore hatasi:', error.message);
  process.exit(1);
});
