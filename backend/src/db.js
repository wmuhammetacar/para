import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

sqlite3.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDbPath() {
  const envPath = process.env.DB_PATH;
  if (!envPath) {
    return path.resolve(__dirname, '..', 'database.sqlite');
  }

  if (path.isAbsolute(envPath)) {
    return envPath;
  }

  return path.resolve(process.cwd(), envPath);
}

const dbPath = resolveDbPath();
export const db = new sqlite3.Database(dbPath);
let transactionQueue = Promise.resolve();

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function executeTransaction(task, mode = 'IMMEDIATE') {
  const normalizedMode = ['DEFERRED', 'IMMEDIATE', 'EXCLUSIVE'].includes(mode) ? mode : 'IMMEDIATE';
  await run(`BEGIN ${normalizedMode}`);

  try {
    const result = await task();
    await run('COMMIT');
    return result;
  } catch (error) {
    try {
      await run('ROLLBACK');
    } catch (rollbackError) {
      // eslint-disable-next-line no-console
      console.error('Rollback failed:', rollbackError);
    }
    throw error;
  }
}

export function withDbTransaction(task, options = {}) {
  const { mode = 'IMMEDIATE' } = options;
  const runTask = () => executeTransaction(task, mode);
  const resultPromise = transactionQueue.then(runTask, runTask);
  transactionQueue = resultPromise.catch(() => {});
  return resultPromise;
}

async function hasColumn(tableName, columnName) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function ensureColumn(tableName, columnName, definition) {
  const exists = await hasColumn(tableName, columnName);
  if (exists) {
    return;
  }

  await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function normalizeDocumentNumberForDb(value, prefix, id) {
  const fallback = `${prefix}-${String(id).padStart(4, '0')}`;
  const raw = String(value || '').trim().toUpperCase();
  const normalized = raw
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return normalized || fallback;
}

async function deduplicateDocumentNumbers(tableName, columnName, prefix) {
  const rows = await all(
    `
    SELECT id, user_id, ${columnName} AS document_number
    FROM ${tableName}
    ORDER BY user_id ASC, id ASC
    `
  );

  const seen = new Set();

  for (const row of rows) {
    const baseValue = normalizeDocumentNumberForDb(row.document_number, prefix, row.id);
    let candidate = baseValue;
    let key = `${row.user_id}:${candidate}`;

    while (seen.has(key)) {
      const suffix = `-${row.id}`;
      const sliced = baseValue.slice(0, Math.max(1, 40 - suffix.length));
      candidate = `${sliced}${suffix}`;
      key = `${row.user_id}:${candidate}`;
    }

    seen.add(key);

    if (candidate !== row.document_number) {
      await run(`UPDATE ${tableName} SET ${columnName} = ? WHERE id = ?`, [candidate, row.id]);
    }
  }
}

async function createIntegrityTriggers() {
  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_quotes_customer_scope_insert
    BEFORE INSERT ON quotes
    FOR EACH ROW
    WHEN NEW.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.id = NEW.customer_id AND c.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_quotes_customer_scope_update
    BEFORE UPDATE OF customer_id, user_id ON quotes
    FOR EACH ROW
    WHEN NEW.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.id = NEW.customer_id AND c.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_quotes_total_insert
    BEFORE INSERT ON quotes
    FOR EACH ROW
    WHEN NEW.total < 0
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_quotes_total_update
    BEFORE UPDATE OF total ON quotes
    FOR EACH ROW
    WHEN NEW.total < 0
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_customer_scope_insert
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN NEW.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.id = NEW.customer_id AND c.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_customer_scope_update
    BEFORE UPDATE OF customer_id, user_id ON invoices
    FOR EACH ROW
    WHEN NEW.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.id = NEW.customer_id AND c.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_quote_scope_insert
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN NEW.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM quotes q WHERE q.id = NEW.quote_id AND q.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_quote_scope_update
    BEFORE UPDATE OF quote_id, user_id ON invoices
    FOR EACH ROW
    WHEN NEW.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM quotes q WHERE q.id = NEW.quote_id AND q.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_total_insert
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN NEW.total < 0
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_total_update
    BEFORE UPDATE OF total ON invoices
    FOR EACH ROW
    WHEN NEW.total < 0
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_payment_insert
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN NEW.payment_status NOT IN ('pending', 'paid')
      OR (NEW.payment_status = 'pending' AND NEW.paid_at IS NOT NULL)
      OR (NEW.payment_status = 'paid' AND (NEW.paid_at IS NULL OR TRIM(NEW.paid_at) = ''))
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_PAYMENT_STATE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_invoices_payment_update
    BEFORE UPDATE OF payment_status, paid_at ON invoices
    FOR EACH ROW
    WHEN NEW.payment_status NOT IN ('pending', 'paid')
      OR (NEW.payment_status = 'pending' AND NEW.paid_at IS NOT NULL)
      OR (NEW.payment_status = 'paid' AND (NEW.paid_at IS NULL OR TRIM(NEW.paid_at) = ''))
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_PAYMENT_STATE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_billing_plan_change_state_insert
    BEFORE INSERT ON billing_plan_change_requests
    FOR EACH ROW
    WHEN NEW.status NOT IN ('pending', 'paid', 'applied', 'expired', 'cancelled')
      OR (NEW.status = 'paid' AND (NEW.paid_at IS NULL OR TRIM(NEW.paid_at) = ''))
      OR (NEW.status = 'applied' AND (NEW.applied_at IS NULL OR TRIM(NEW.applied_at) = ''))
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_BILLING_STATE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_billing_plan_change_state_update
    BEFORE UPDATE OF status, paid_at, applied_at ON billing_plan_change_requests
    FOR EACH ROW
    WHEN NEW.status NOT IN ('pending', 'paid', 'applied', 'expired', 'cancelled')
      OR (NEW.status = 'pending' AND (NEW.paid_at IS NOT NULL OR NEW.applied_at IS NOT NULL))
      OR (NEW.status = 'paid' AND (NEW.paid_at IS NULL OR TRIM(NEW.paid_at) = '' OR NEW.applied_at IS NOT NULL))
      OR (NEW.status = 'applied' AND (NEW.paid_at IS NULL OR NEW.applied_at IS NULL OR TRIM(NEW.applied_at) = ''))
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_BILLING_STATE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_parent_insert
    BEFORE INSERT ON items
    FOR EACH ROW
    WHEN (NEW.quote_id IS NULL AND NEW.invoice_id IS NULL)
      OR (NEW.quote_id IS NOT NULL AND NEW.invoice_id IS NOT NULL)
    BEGIN
      SELECT RAISE(ABORT, 'ITEM_PARENT_INVALID');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_parent_update
    BEFORE UPDATE OF quote_id, invoice_id, user_id ON items
    FOR EACH ROW
    WHEN (NEW.quote_id IS NULL AND NEW.invoice_id IS NULL)
      OR (NEW.quote_id IS NOT NULL AND NEW.invoice_id IS NOT NULL)
    BEGIN
      SELECT RAISE(ABORT, 'ITEM_PARENT_INVALID');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_quote_scope_insert
    BEFORE INSERT ON items
    FOR EACH ROW
    WHEN NEW.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM quotes q WHERE q.id = NEW.quote_id AND q.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_quote_scope_update
    BEFORE UPDATE OF quote_id, user_id ON items
    FOR EACH ROW
    WHEN NEW.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM quotes q WHERE q.id = NEW.quote_id AND q.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_invoice_scope_insert
    BEFORE INSERT ON items
    FOR EACH ROW
    WHEN NEW.invoice_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_invoice_scope_update
    BEFORE UPDATE OF invoice_id, user_id ON items
    FOR EACH ROW
    WHEN NEW.invoice_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM invoices i WHERE i.id = NEW.invoice_id AND i.user_id = NEW.user_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'TENANT_SCOPE_VIOLATION');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_monetary_insert
    BEFORE INSERT ON items
    FOR EACH ROW
    WHEN NEW.quantity <= 0
      OR NEW.unit_price < 0
      OR NEW.total < 0
      OR ABS(NEW.total - ROUND(NEW.quantity * NEW.unit_price, 2)) > 0.009
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);

  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_items_monetary_update
    BEFORE UPDATE OF quantity, unit_price, total ON items
    FOR EACH ROW
    WHEN NEW.quantity <= 0
      OR NEW.unit_price < 0
      OR NEW.total < 0
      OR ABS(NEW.total - ROUND(NEW.quantity * NEW.unit_price, 2)) > 0.009
    BEGIN
      SELECT RAISE(ABORT, 'INVALID_MONETARY_VALUE');
    END;
  `);
}

export async function initDb() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT 'Teklifim',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('users', 'failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'locked_until', 'TEXT');
  await ensureColumn('users', 'plan_code', "TEXT NOT NULL DEFAULT 'starter'");
  await run(`
    UPDATE users
    SET failed_login_attempts = 0
    WHERE failed_login_attempts IS NULL OR failed_login_attempts < 0
  `);
  await run(`
    UPDATE users
    SET plan_code = 'starter'
    WHERE plan_code IS NULL OR plan_code NOT IN ('starter', 'standard')
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      quote_number TEXT NOT NULL,
      date TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      quote_id INTEGER,
      invoice_number TEXT NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      paid_at TEXT,
      total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (quote_id) REFERENCES quotes(id)
    )
  `);

  await ensureColumn('invoices', 'due_date', 'TEXT');
  await ensureColumn('invoices', 'payment_status', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn('invoices', 'paid_at', 'TEXT');

  await run(`UPDATE invoices SET due_date = date WHERE due_date IS NULL OR due_date = ''`);
  await run(`
    UPDATE invoices
    SET payment_status = 'pending'
    WHERE payment_status IS NULL OR payment_status NOT IN ('pending', 'paid')
  `);
  await run(`UPDATE invoices SET paid_at = NULL WHERE payment_status <> 'paid'`);

  await deduplicateDocumentNumbers('quotes', 'quote_number', 'TKL');
  await deduplicateDocumentNumbers('invoices', 'invoice_number', 'FTR');

  await run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quote_id INTEGER,
      invoice_id INTEGER,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      CHECK (quote_id IS NOT NULL OR invoice_id IS NOT NULL)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminder_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      delivery_url TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_retry_at TEXT,
      next_attempt_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS billing_plan_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_plan_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      applied_at TEXT,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_type TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS rate_limit_counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      bucket_key TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      window_end INTEGER NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('audit_logs', 'metadata_json', 'TEXT');
  await ensureColumn('audit_logs', 'request_id', 'TEXT');
  await ensureColumn('audit_logs', 'ip_address', 'TEXT');
  await ensureColumn('audit_logs', 'user_agent', 'TEXT');

  await ensureColumn('reminder_jobs', 'delivery_url', 'TEXT');
  await ensureColumn('reminder_jobs', 'error_message', 'TEXT');
  await ensureColumn('reminder_jobs', 'processed_at', 'TEXT');
  await ensureColumn('reminder_jobs', 'retry_count', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('reminder_jobs', 'last_retry_at', 'TEXT');
  await ensureColumn('reminder_jobs', 'next_attempt_at', 'TEXT');
  await ensureColumn('billing_plan_change_requests', 'status', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn('billing_plan_change_requests', 'payment_reference', 'TEXT');
  await ensureColumn('billing_plan_change_requests', 'paid_at', 'TEXT');
  await ensureColumn('billing_plan_change_requests', 'applied_at', 'TEXT');
  await ensureColumn('billing_plan_change_requests', 'expires_at', 'TEXT');

  await run(`
    UPDATE reminder_jobs
    SET status = 'queued'
    WHERE status IS NULL OR status NOT IN ('queued', 'sent', 'failed')
  `);
  await run(`
    UPDATE reminder_jobs
    SET channel = 'email'
    WHERE channel IS NULL OR channel NOT IN ('whatsapp', 'email')
  `);
  await run(`
    UPDATE reminder_jobs
    SET retry_count = 0
    WHERE retry_count IS NULL OR retry_count < 0
  `);
  await run(`
    UPDATE billing_plan_change_requests
    SET status = 'pending'
    WHERE status IS NULL OR status NOT IN ('pending', 'paid', 'applied', 'expired', 'cancelled')
  `);
  await run(`
    UPDATE billing_plan_change_requests
    SET expires_at = datetime(created_at, '+30 minute')
    WHERE expires_at IS NULL OR TRIM(expires_at) = ''
  `);

  await createIntegrityTriggers();

  await run('CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_customers_user_name ON customers(user_id, name)');
  await run('CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_quotes_user_quote_number ON quotes(user_id, quote_number)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_user_quote_number_uq ON quotes(user_id, quote_number)');
  await run('CREATE INDEX IF NOT EXISTS idx_quotes_user_date ON quotes(user_id, date)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_user_invoice_number ON invoices(user_id, invoice_number)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_user_invoice_number_uq ON invoices(user_id, invoice_number)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_user_date ON invoices(user_id, date)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_user_status_due ON invoices(user_id, payment_status, due_date)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)');
  await run('CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status)');
  await run('CREATE INDEX IF NOT EXISTS idx_items_quote_id ON items(quote_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_items_invoice_id ON items(invoice_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_reminder_jobs_user_id ON reminder_jobs(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_reminder_jobs_invoice_id ON reminder_jobs(invoice_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_reminder_jobs_status ON reminder_jobs(status)');
  await run('CREATE INDEX IF NOT EXISTS idx_reminder_jobs_next_attempt_at ON reminder_jobs(next_attempt_at)');
  await run(
    'CREATE INDEX IF NOT EXISTS idx_billing_plan_change_user_status ON billing_plan_change_requests(user_id, status)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_billing_plan_change_expires ON billing_plan_change_requests(expires_at)'
  );
  await run('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at)');
  await run(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_event_created_at ON audit_logs(user_id, event_type, created_at)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_resource_created_at ON audit_logs(user_id, resource_type, created_at)'
  );
  await run(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_scope_key_window_uq ON rate_limit_counters(scope, bucket_key, window_start)'
  );
  await run('CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end ON rate_limit_counters(window_end)');
}

export function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}
