import { all, get } from '../db.js';
import { conflict } from './httpErrors.js';

export async function findCustomer(userId, customerId) {
  return get('SELECT id, name, phone, email, address FROM customers WHERE id = ? AND user_id = ?', [
    customerId,
    userId
  ]);
}

export async function assertUniqueInvoiceNumber(userId, invoiceNumber, excludeId = null) {
  if (!invoiceNumber) {
    return;
  }

  const duplicate = await get(
    `
    SELECT id
    FROM invoices
    WHERE user_id = ? AND invoice_number = ? AND (? IS NULL OR id <> ?)
    LIMIT 1
    `,
    [userId, invoiceNumber, excludeId, excludeId]
  );

  if (duplicate) {
    throw conflict('Bu fatura numarasi zaten kullanimda.');
  }
}

function buildInvoiceListWhereClause(userId, options = {}) {
  const { status = 'all', query = '' } = options;
  const whereParts = ['i.user_id = ?'];
  const params = [userId];

  if (query) {
    const searchValue = `%${query.toLowerCase()}%`;
    whereParts.push(
      '(LOWER(i.invoice_number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(i.date) LIKE ? OR LOWER(COALESCE(i.due_date, \'\')) LIKE ?)'
    );
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  if (status === 'pending') {
    whereParts.push("i.payment_status = 'pending'");
  } else if (status === 'paid') {
    whereParts.push("i.payment_status = 'paid'");
  } else if (status === 'overdue') {
    whereParts.push("i.payment_status = 'pending' AND date(i.due_date) < date('now')");
  }

  return {
    whereSql: whereParts.join(' AND '),
    params
  };
}

function buildReminderOpsWhereClause(userId, filters) {
  const { status, channel } = filters;
  const whereParts = ['r.user_id = ?'];
  const params = [userId];

  if (status !== 'all') {
    whereParts.push('r.status = ?');
    params.push(status);
  }

  if (channel !== 'all') {
    whereParts.push('r.channel = ?');
    params.push(channel);
  }

  return {
    whereSql: whereParts.join(' AND '),
    params
  };
}

export async function listReminderJobs(userId, invoiceId) {
  return all(
    `
    SELECT
      id,
      invoice_id,
      channel,
      recipient,
      message,
      status,
      delivery_url,
      error_message,
      retry_count,
      last_retry_at,
      next_attempt_at,
      created_at,
      processed_at
    FROM reminder_jobs
    WHERE user_id = ? AND invoice_id = ?
    ORDER BY id DESC
    `,
    [userId, invoiceId]
  );
}

export async function listReminderOpsSummary(userId) {
  const [summary, queueAging] = await Promise.all([
    get(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(
        CASE
          WHEN status = 'failed' AND datetime(COALESCE(processed_at, created_at)) >= datetime('now', '-1 day')
          THEN 1
            ELSE 0
          END
        ) AS failed_last_24h,
        SUM(CASE WHEN status = 'queued' AND retry_count > 0 THEN 1 ELSE 0 END) AS scheduled_retries,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp,
        SUM(CASE WHEN channel = 'email' THEN 1 ELSE 0 END) AS email
      FROM reminder_jobs
      WHERE user_id = ?
      `,
      [userId]
    ),
    get(
      `
      SELECT
        CAST((julianday('now') - julianday(MIN(created_at))) * 24 * 60 AS INTEGER) AS oldest_queued_minutes
      FROM reminder_jobs
      WHERE user_id = ? AND status = 'queued'
      `,
      [userId]
    )
  ]);

  const total = Number(summary?.total) || 0;
  const failed = Number(summary?.failed) || 0;

  return {
    total,
    queued: Number(summary?.queued) || 0,
    sent: Number(summary?.sent) || 0,
    failed,
    failedLast24h: Number(summary?.failed_last_24h) || 0,
    scheduledRetries: Number(summary?.scheduled_retries) || 0,
    whatsapp: Number(summary?.whatsapp) || 0,
    email: Number(summary?.email) || 0,
    oldestQueuedMinutes:
      queueAging?.oldest_queued_minutes === null || queueAging?.oldest_queued_minutes === undefined
        ? null
        : Math.max(0, Number(queueAging.oldest_queued_minutes) || 0),
    failedRate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0
  };
}

export async function countReminderOpsJobs(userId, filters) {
  const { whereSql, params } = buildReminderOpsWhereClause(userId, filters);

  const countRow = await get(
    `
    SELECT COUNT(*) AS total
    FROM reminder_jobs r
    WHERE ${whereSql}
    `,
    params
  );

  return Number(countRow?.total) || 0;
}

export async function listReminderOpsJobs(userId, filters) {
  const { limit } = filters;
  const { whereSql, params } = buildReminderOpsWhereClause(userId, filters);

  return all(
    `
    SELECT
      r.id,
      r.invoice_id,
      r.channel,
      r.recipient,
      r.message,
      r.status,
      r.delivery_url,
      r.error_message,
      r.retry_count,
      r.last_retry_at,
      r.next_attempt_at,
      r.created_at,
      r.processed_at,
      i.invoice_number,
      c.name AS customer_name
    FROM reminder_jobs r
    JOIN invoices i ON i.id = r.invoice_id
    JOIN customers c ON c.id = i.customer_id
    WHERE ${whereSql}
    ORDER BY
      CASE
        WHEN r.status = 'failed' THEN 0
        WHEN r.status = 'queued' THEN 1
        ELSE 2
      END ASC,
      r.id DESC
    LIMIT ?
    `,
    [...params, limit]
  );
}

export async function getReminderJobById(userId, reminderId) {
  return get(
    `
    SELECT
      r.id,
      r.invoice_id,
      r.channel,
      r.recipient,
      r.message,
      r.status,
      r.delivery_url,
      r.error_message,
      r.retry_count,
      r.last_retry_at,
      r.next_attempt_at,
      r.created_at,
      r.processed_at,
      i.invoice_number,
      c.name AS customer_name
    FROM reminder_jobs r
    JOIN invoices i ON i.id = r.invoice_id
    JOIN customers c ON c.id = i.customer_id
    WHERE r.id = ? AND r.user_id = ?
    `,
    [reminderId, userId]
  );
}

export async function getReminderJobRecord(userId, reminderId) {
  return get(
    `
    SELECT
      id,
      invoice_id,
      channel,
      recipient,
      message,
      status,
      delivery_url,
      error_message,
      retry_count,
      last_retry_at,
      next_attempt_at,
      created_at,
      processed_at
    FROM reminder_jobs
    WHERE id = ? AND user_id = ?
    `,
    [reminderId, userId]
  );
}

export async function listReminderOpsErrorBreakdown(userId, limit = 5) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

  return all(
    `
    SELECT
      COALESCE(NULLIF(TRIM(error_message), ''), 'Bilinmeyen hata') AS error_message,
      COUNT(*) AS total
    FROM reminder_jobs
    WHERE user_id = ? AND status = 'failed'
    GROUP BY COALESCE(NULLIF(TRIM(error_message), ''), 'Bilinmeyen hata')
    ORDER BY total DESC, error_message ASC
    LIMIT ?
    `,
    [userId, normalizedLimit]
  );
}

export async function listInvoices(userId, options = {}) {
  const { status = 'all', query = '', limit = 20, offset = 0, useWindow = false } = options;
  const { whereSql, params } = buildInvoiceListWhereClause(userId, { status, query });

  return all(
    `
    SELECT
      i.id,
      i.invoice_number,
      i.date,
      i.due_date,
      i.payment_status,
      i.paid_at,
      i.total,
      i.quote_id,
      CASE
        WHEN i.payment_status = 'pending' AND date(i.due_date) < date('now') THEN 1
        ELSE 0
      END AS is_overdue,
      c.name AS customer_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE ${whereSql}
    ORDER BY i.id DESC
    ${useWindow ? 'LIMIT ? OFFSET ?' : ''}
    `,
    useWindow ? [...params, limit, offset] : params
  );
}

export async function countInvoices(userId, options = {}) {
  const { status = 'all', query = '' } = options;
  const { whereSql, params } = buildInvoiceListWhereClause(userId, { status, query });

  const row = await get(
    `
    SELECT COUNT(*) AS total
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE ${whereSql}
    `,
    params
  );

  return Number(row?.total) || 0;
}

export async function getInvoiceWithItems(userId, invoiceId) {
  const invoice = await get(
    `
    SELECT
      i.id,
      i.invoice_number,
      i.date,
      i.due_date,
      i.payment_status,
      i.paid_at,
      i.total,
      i.quote_id,
      i.customer_id,
      CASE
        WHEN i.payment_status = 'pending' AND date(i.due_date) < date('now') THEN 1
        ELSE 0
      END AS is_overdue,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.email AS customer_email,
      c.address AS customer_address
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ? AND i.user_id = ?
    `,
    [invoiceId, userId]
  );

  if (!invoice) {
    return null;
  }

  const items = await all(
    `
    SELECT id, name, quantity, unit_price, total
    FROM items
    WHERE invoice_id = ?
    ORDER BY id ASC
    `,
    [invoiceId]
  );

  return { ...invoice, items };
}

export async function listExistingInvoiceIds(userId, invoiceIds) {
  const placeholders = invoiceIds.map(() => '?').join(', ');

  return all(
    `
      SELECT id
      FROM invoices
      WHERE user_id = ? AND id IN (${placeholders})
    `,
    [userId, ...invoiceIds]
  );
}

export async function findQuote(userId, quoteId) {
  return get(
    `
    SELECT id, customer_id
    FROM quotes
    WHERE id = ? AND user_id = ?
    `,
    [quoteId, userId]
  );
}

export async function listQuoteItems(quoteId) {
  return all(
    `
    SELECT name, quantity, unit_price, total
    FROM items
    WHERE quote_id = ?
    ORDER BY id ASC
    `,
    [quoteId]
  );
}

export async function getInvoiceSummary(userId, invoiceId) {
  return get(
    `
    SELECT id, invoice_number, due_date, payment_status, paid_at
    FROM invoices
    WHERE id = ? AND user_id = ?
    `,
    [invoiceId, userId]
  );
}

export async function getInvoiceIdentity(userId, invoiceId) {
  return get('SELECT id FROM invoices WHERE id = ? AND user_id = ?', [invoiceId, userId]);
}
