import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import sqlite3 from 'sqlite3';

sqlite3.verbose();

const TABLES = ['users', 'customers', 'quotes', 'invoices', 'items', 'reminder_jobs', 'audit_logs'];

function resolveDbPath() {
  const envPath = process.env.DB_PATH || './database.sqlite';
  if (path.isAbsolute(envPath)) {
    return envPath;
  }

  return path.resolve(process.cwd(), envPath);
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

function runNodeScript(scriptPath, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Script failed (${scriptPath}) exit=${code}\nstdout:\n${stdout || '-'}\nstderr:\n${stderr || '-'}`
        )
      );
    });
  });
}

function withDb(dbPath, task) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openError) => {
      if (openError) {
        reject(openError);
        return;
      }

      Promise.resolve()
        .then(() => task(db))
        .then((result) => {
          db.close((closeError) => {
            if (closeError) {
              reject(closeError);
              return;
            }

            resolve(result);
          });
        })
        .catch((error) => {
          db.close(() => reject(error));
        });
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

async function tableExists(db, tableName) {
  const row = await dbGet(
    db,
    "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row?.found);
}

async function collectDbSummary(dbPath) {
  return withDb(dbPath, async (db) => {
    const quickCheckRow = await dbGet(db, 'PRAGMA quick_check');
    const quickCheckValue = Object.values(quickCheckRow || {})[0] || 'unknown';

    const tables = {};
    for (const tableName of TABLES) {
      // table names are static from controlled list
      const exists = await tableExists(db, tableName);
      if (!exists) {
        tables[tableName] = {
          exists: false,
          count: 0,
          maxId: 0
        };
        continue;
      }

      const row = await dbGet(
        db,
        `SELECT COUNT(*) AS count, COALESCE(MAX(id), 0) AS maxId FROM ${tableName}`
      );
      tables[tableName] = {
        exists: true,
        count: Number(row?.count) || 0,
        maxId: Number(row?.maxId) || 0
      };
    }

    return {
      quickCheck: String(quickCheckValue),
      tables
    };
  });
}

function summariesEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  if (left.quickCheck !== 'ok' || right.quickCheck !== 'ok') {
    return false;
  }

  for (const tableName of TABLES) {
    const a = left.tables[tableName];
    const b = right.tables[tableName];

    if (!a || !b) {
      return false;
    }

    if (a.exists !== b.exists || a.count !== b.count || a.maxId !== b.maxId) {
      return false;
    }
  }

  return true;
}

async function findLatestBackupFile(backupDir) {
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('teklifim-backup-') && entry.name.endsWith('.sqlite'))
    .map((entry) => entry.name);

  if (!files.length) {
    throw new Error(`Backup dosyasi bulunamadi: ${backupDir}`);
  }

  const stats = await Promise.all(
    files.map(async (name) => {
      const fullPath = path.join(backupDir, name);
      const fileStat = await fs.stat(fullPath);
      return {
        fullPath,
        mtimeMs: fileStat.mtimeMs
      };
    })
  );

  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0].fullPath;
}

async function main() {
  const sourceDbPath = resolveDbPath();
  await fs.access(sourceDbPath);

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const tempRoot = path.join(os.tmpdir(), `teklifim-drill-${timestamp}`);
  const tempLiveDbPath = path.join(tempRoot, 'live.sqlite');
  const tempRestoreDbPath = path.join(tempRoot, 'restored.sqlite');
  const tempBackupDir = path.join(tempRoot, 'backups');
  const keepTemp = String(process.env.DR_KEEP_TMP || '').trim() === '1';

  await fs.mkdir(tempRoot, { recursive: true });
  await fs.mkdir(tempBackupDir, { recursive: true });

  await fs.copyFile(sourceDbPath, tempLiveDbPath);
  await copyIfExists(`${sourceDbPath}-wal`, `${tempLiveDbPath}-wal`);
  await copyIfExists(`${sourceDbPath}-shm`, `${tempLiveDbPath}-shm`);

  const backupScriptPath = path.resolve(process.cwd(), 'scripts', 'backupDb.js');
  const restoreScriptPath = path.resolve(process.cwd(), 'scripts', 'restoreDb.js');

  await runNodeScript(backupScriptPath, [], {
    DB_PATH: tempLiveDbPath,
    BACKUP_DIR: tempBackupDir
  });

  const latestBackupFile = await findLatestBackupFile(tempBackupDir);

  await runNodeScript(restoreScriptPath, ['--from', latestBackupFile], {
    DB_PATH: tempRestoreDbPath
  });

  const originalSummary = await collectDbSummary(tempLiveDbPath);
  const restoredSummary = await collectDbSummary(tempRestoreDbPath);

  const isSuccess = summariesEqual(originalSummary, restoredSummary);
  const report = {
    sourceDbPath,
    tempRoot,
    backupFile: latestBackupFile,
    checks: {
      quickCheckOriginal: originalSummary.quickCheck,
      quickCheckRestored: restoredSummary.quickCheck,
      summaryMatch: isSuccess
    },
    original: originalSummary.tables,
    restored: restoredSummary.tables
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  if (!keepTemp) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  } else {
    // eslint-disable-next-line no-console
    console.log(`DR debug klasoru korundu: ${tempRoot}`);
  }

  if (!isSuccess) {
    throw new Error('Backup/restore drill ozeti eslesmedi.');
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('DR drill hatasi:', error.message);
  process.exit(1);
});
