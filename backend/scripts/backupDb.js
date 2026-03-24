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

function resolveBackupDir() {
  const envPath = process.env.BACKUP_DIR || './backups';
  if (path.isAbsolute(envPath)) {
    return envPath;
  }

  return path.resolve(process.cwd(), envPath);
}

function buildTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '-',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds())
  ].join('');
}

async function copyIfExists(sourcePath, targetPath) {
  try {
    await fs.copyFile(sourcePath, targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function backupDb() {
  const dbPath = resolveDbPath();
  const backupDir = resolveBackupDir();

  await fs.mkdir(backupDir, { recursive: true });
  await fs.access(dbPath);

  const timestamp = buildTimestamp();
  const baseName = `teklifim-backup-${timestamp}`;
  const backupDbPath = path.join(backupDir, `${baseName}.sqlite`);

  await fs.copyFile(dbPath, backupDbPath);

  const walCopied = await copyIfExists(`${dbPath}-wal`, path.join(backupDir, `${baseName}.sqlite-wal`));
  const shmCopied = await copyIfExists(`${dbPath}-shm`, path.join(backupDir, `${baseName}.sqlite-shm`));

  // eslint-disable-next-line no-console
  console.log(`Backup tamamlandi: ${backupDbPath}`);
  // eslint-disable-next-line no-console
  console.log(`Ek dosyalar: wal=${walCopied ? 'kopyalandi' : 'yok'}, shm=${shmCopied ? 'kopyalandi' : 'yok'}`);
}

backupDb().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Backup hatasi:', error.message);
  process.exit(1);
});
