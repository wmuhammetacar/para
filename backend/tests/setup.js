import fs from 'node:fs/promises';
import path from 'node:path';
import { closeDb, initDb, run } from '../src/db.js';

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './test.sqlite');

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await run('DELETE FROM rate_limit_counters');
  await run('DELETE FROM audit_logs');
  await run('DELETE FROM billing_plan_change_requests');
  await run('DELETE FROM reminder_jobs');
  await run('DELETE FROM items');
  await run('DELETE FROM invoices');
  await run('DELETE FROM quotes');
  await run('DELETE FROM customers');
  await run('DELETE FROM users');
});

afterAll(async () => {
  await closeDb();

  await Promise.all([
    fs.rm(dbPath, { force: true }),
    fs.rm(`${dbPath}-wal`, { force: true }),
    fs.rm(`${dbPath}-shm`, { force: true }),
    fs.rm(`${dbPath}-journal`, { force: true })
  ]);
});
