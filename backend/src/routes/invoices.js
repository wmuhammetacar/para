import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { buildDefaultReminderMessage, processReminderQueue } from '../services/reminderQueue.js';
import { recordAuditLog } from '../utils/audit.js';
import { buildDocumentNumber, normalizeDate, sanitizeItems } from '../utils/documents.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import { assertPlanLimit } from '../utils/plans.js';
import { writeDocumentPdf } from '../utils/pdf.js';

const router = Router();
const DEFAULT_REMINDER_MAX_RETRY_COUNT = 3;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

function resolvePositiveIntEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const REMINDER_MAX_RETRY_COUNT = resolvePositiveIntEnv(
  process.env.REMINDER_MAX_RETRY_COUNT,
  DEFAULT_REMINDER_MAX_RETRY_COUNT
);
const REMINDER_RETRY_BACKOFF_MINUTES = typeof process.env.REMINDER_RETRY_BACKOFF_MINUTES === 'string'
  ? process.env.REMINDER_RETRY_BACKOFF_MINUTES
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isInteger(part) && part > 0)
  : [];

router.use(authenticate);

async function withTransaction(task) {
  await run('BEGIN');

  try {
    const result = await task();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

async function findCustomer(userId, customerId) {
  return get('SELECT id, name, phone, email, address FROM customers WHERE id = ? AND user_id = ?', [
    customerId,
    userId
  ]);
}

function normalizePaymentStatus(value, field = 'paymentStatus') {
  if (value === undefined || value === null || value === '') {
    return 'pending';
  }

  const status = String(value).trim().toLowerCase();
  if (status === 'pending' || status === 'paid') {
    return status;
  }

  throw badRequest('Odeme durumu gecersiz. Desteklenen degerler: pending, paid.', [
    { field, rule: 'enum', values: ['pending', 'paid'] }
  ]);
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeListStatusFilter(value) {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }

  const status = String(value).trim().toLowerCase();
  if (['all', 'pending', 'paid', 'overdue'].includes(status)) {
    return status;
  }

  throw badRequest('Durum filtresi gecersiz. Desteklenen degerler: all, pending, paid, overdue.', [
    { field: 'status', rule: 'enum', values: ['all', 'pending', 'paid', 'overdue'] }
  ]);
}

function normalizeListLimit(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIST_LIMIT;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw badRequest(`Limit 1 ile ${MAX_LIST_LIMIT} arasinda bir tam sayi olmalidir.`, [
      { field: 'limit', rule: 'range', min: 1, max: MAX_LIST_LIMIT }
    ]);
  }

  return limit;
}

function normalizeListPage(value) {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('Page degeri 1 veya daha buyuk bir tam sayi olmalidir.', [
      { field: 'page', rule: 'min', min: 1 }
    ]);
  }

  return page;
}

function normalizeListQuery(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const query = String(value).trim();
  if (!query) {
    return '';
  }

  if (query.length > 120) {
    throw badRequest('Arama metni en fazla 120 karakter olabilir.', [
      { field: 'q', rule: 'maxLength', max: 120 }
    ]);
  }

  return query;
}

function normalizeWithMeta(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function invoiceMatchesStatusFilter(invoice, filter) {
  if (filter === 'all') {
    return true;
  }

  const paymentStatus = invoice.payment_status || 'pending';

  if (filter === 'pending') {
    return paymentStatus === 'pending';
  }

  if (filter === 'paid') {
    return paymentStatus === 'paid';
  }

  if (filter === 'overdue') {
    return Number(invoice.is_overdue) === 1;
  }

  return true;
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
    whereParts.push('i.payment_status = \'pending\'');
  } else if (status === 'paid') {
    whereParts.push('i.payment_status = \'paid\'');
  } else if (status === 'overdue') {
    whereParts.push('i.payment_status = \'pending\' AND date(i.due_date) < date(\'now\')');
  }

  return {
    whereSql: whereParts.join(' AND '),
    params
  };
}

function parseInvoiceIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest('En az bir fatura secmelisiniz.', [{ field: 'invoiceIds', rule: 'minItems' }]);
  }

  const ids = [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) {
    throw badRequest('Secilen faturalar gecersiz.', [{ field: 'invoiceIds', rule: 'integerArray' }]);
  }

  return ids;
}

function normalizeReminderChannel(value) {
  if (value === undefined || value === null || value === '') {
    throw badRequest('Hatirlatma kanali zorunludur.', [{ field: 'channel', rule: 'required' }]);
  }

  const channel = String(value).trim().toLowerCase();
  if (channel === 'whatsapp' || channel === 'email') {
    return channel;
  }

  throw badRequest('Hatirlatma kanali gecersiz. Desteklenen degerler: whatsapp, email.', [
    { field: 'channel', rule: 'enum', values: ['whatsapp', 'email'] }
  ]);
}

function normalizeReminderRecipient(channel, value) {
  const recipient = String(value || '').trim();
  if (!recipient) {
    throw badRequest('Hatirlatma alicisi bos olamaz.', [{ field: 'recipient', rule: 'required' }]);
  }

  if (channel === 'email') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(recipient)) {
      throw badRequest('E-posta alicisi gecersiz.', [{ field: 'recipient', rule: 'email' }]);
    }
    return recipient;
  }

  const digits = recipient.replace(/\D/g, '');
  const normalizedPhone =
    digits.length === 10
      ? `90${digits}`
      : digits.length === 11 && digits.startsWith('0')
        ? `90${digits.slice(1)}`
        : digits;

  if (normalizedPhone.length < 11) {
    throw badRequest('WhatsApp numarasi gecersiz.', [{ field: 'recipient', rule: 'phone' }]);
  }

  return normalizedPhone;
}

function normalizeReminderMessage(value, fallbackMessage) {
  const message = String(value || fallbackMessage || '').trim();

  if (!message) {
    throw badRequest('Hatirlatma mesaji bos olamaz.', [{ field: 'message', rule: 'required' }]);
  }

  if (message.length > 1200) {
    throw badRequest('Hatirlatma mesaji en fazla 1200 karakter olabilir.', [
      { field: 'message', rule: 'maxLength', value: 1200 }
    ]);
  }

  return message;
}

function normalizeReminderOpsStatus(value) {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }

  const status = String(value).trim().toLowerCase();
  if (status === 'all' || status === 'queued' || status === 'sent' || status === 'failed') {
    return status;
  }

  throw badRequest('Hatirlatma durum filtresi gecersiz. Desteklenen degerler: all, queued, sent, failed.', [
    { field: 'status', rule: 'enum', values: ['all', 'queued', 'sent', 'failed'] }
  ]);
}

function normalizeReminderOpsChannel(value) {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }

  const channel = String(value).trim().toLowerCase();
  if (channel === 'all' || channel === 'whatsapp' || channel === 'email') {
    return channel;
  }

  throw badRequest('Hatirlatma kanal filtresi gecersiz. Desteklenen degerler: all, whatsapp, email.', [
    { field: 'channel', rule: 'enum', values: ['all', 'whatsapp', 'email'] }
  ]);
}

function normalizeReminderOpsLimit(value) {
  if (value === undefined || value === null || value === '') {
    return 10;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw badRequest('Limit 1 ile 100 arasinda bir tam sayi olmalidir.', [
      { field: 'limit', rule: 'range', min: 1, max: 100 }
    ]);
  }

  return parsed;
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

async function listReminderJobs(userId, invoiceId) {
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

async function listReminderOpsSummary(userId) {
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

async function countReminderOpsJobs(userId, filters) {
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

async function listReminderOpsJobs(userId, filters) {
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

async function getReminderJobById(userId, reminderId) {
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

async function listReminderOpsErrorBreakdown(userId, limit = 5) {
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

async function listInvoices(userId, options = {}) {
  const { status = 'all', query = '', limit = DEFAULT_LIST_LIMIT, offset = 0, useWindow = false } = options;
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

async function countInvoices(userId, options = {}) {
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

async function getInvoiceWithItems(userId, invoiceId) {
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

router.get('/', async (req, res, next) => {
  try {
    const statusFilter = normalizeListStatusFilter(req.query.status);
    const query = normalizeListQuery(req.query.q);
    const limit = normalizeListLimit(req.query.limit);
    const page = normalizeListPage(req.query.page);
    const withMeta = normalizeWithMeta(req.query.withMeta);
    const offset = (page - 1) * limit;
    const shouldUseWindow = Boolean(query) || req.query.limit !== undefined || req.query.page !== undefined || withMeta;

    const rows = await listInvoices(req.user.id, {
      status: statusFilter,
      query,
      limit,
      offset,
      useWindow: shouldUseWindow
    });

    if (!withMeta) {
      res.json(rows);
      return;
    }

    const total = await countInvoices(req.user.id, {
      status: statusFilter,
      query
    });
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    await assertPlanLimit(req.user.id, 'invoice_create');
    const date = normalizeDate(req.body.date);
    const dueDate = normalizeDate(req.body.dueDate || date);
    const paymentStatus = normalizePaymentStatus(req.body.paymentStatus);
    const paidAt = paymentStatus === 'paid' ? normalizeDate(req.body.paidAt || date) : null;
    const quoteId = req.body.quoteId ? Number(req.body.quoteId) : null;

    let customerId = null;
    let itemResult = null;

    if (quoteId) {
      if (!Number.isInteger(quoteId) || quoteId <= 0) {
        next(badRequest('Gecerli bir teklif secin.', [{ field: 'quoteId', rule: 'integer' }]));
        return;
      }

      const quote = await get(
        `
        SELECT id, customer_id
        FROM quotes
        WHERE id = ? AND user_id = ?
        `,
        [quoteId, req.user.id]
      );

      if (!quote) {
        next(notFound('Teklif bulunamadi.'));
        return;
      }

      const quoteItems = await all(
        'SELECT name, quantity, unit_price, total FROM items WHERE quote_id = ? ORDER BY id ASC',
        [quoteId]
      );

      if (!quoteItems.length) {
        next(badRequest('Teklifte kalem bulunamadi.', [{ field: 'quoteId', rule: 'hasItems' }]));
        return;
      }

      customerId = quote.customer_id;
      itemResult = {
        items: quoteItems.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price),
          total: Number(item.total)
        })),
        total: Number(quoteItems.reduce((acc, item) => acc + Number(item.total), 0).toFixed(2))
      };
    } else {
      customerId = Number(req.body.customerId);

      if (!Number.isInteger(customerId) || customerId <= 0) {
        next(badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]));
        return;
      }

      itemResult = sanitizeItems(req.body.items);
    }

    const customer = await findCustomer(req.user.id, customerId);

    if (!customer) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    const created = await withTransaction(async () => {
      const insertInvoice = await run(
        `
        INSERT INTO invoices (
          user_id,
          customer_id,
          quote_id,
          invoice_number,
          date,
          due_date,
          payment_status,
          paid_at,
          total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [req.user.id, customerId, quoteId, 'TEMP', date, dueDate, paymentStatus, paidAt, itemResult.total]
      );

      const invoiceNumber =
        typeof req.body.invoiceNumber === 'string' && req.body.invoiceNumber.trim()
          ? req.body.invoiceNumber.trim()
          : buildDocumentNumber('FTR', insertInvoice.id, date);

      await run('UPDATE invoices SET invoice_number = ? WHERE id = ? AND user_id = ?', [
        invoiceNumber,
        insertInvoice.id,
        req.user.id
      ]);

      for (const item of itemResult.items) {
        await run(
          `
          INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
          VALUES (?, NULL, ?, ?, ?, ?, ?)
          `,
          [req.user.id, insertInvoice.id, item.name, item.quantity, item.unitPrice, item.total]
        );
      }

      return getInvoiceWithItems(req.user.id, insertInvoice.id);
    });

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_CREATED',
      resourceType: 'invoice',
      resourceId: String(created.id),
      metadata: {
        invoiceNumber: created.invoice_number,
        customerId: created.customer_id,
        quoteId: created.quote_id || null,
        total: created.total,
        paymentStatus: created.payment_status
      }
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/payment/bulk', async (req, res, next) => {
  try {
    const invoiceIds = parseInvoiceIds(req.body.invoiceIds);
    const paymentStatus = normalizePaymentStatus(req.body.status ?? req.body.paymentStatus, 'status');
    const paidAt = paymentStatus === 'paid' ? normalizeDate(req.body.paidAt || getTodayIsoDate()) : null;

    const placeholders = invoiceIds.map(() => '?').join(', ');

    const existing = await all(
      `
      SELECT id
      FROM invoices
      WHERE user_id = ? AND id IN (${placeholders})
      `,
      [req.user.id, ...invoiceIds]
    );

    if (!existing.length) {
      next(notFound('Secilen faturalar bulunamadi.'));
      return;
    }

    const existingIds = new Set(existing.map((row) => row.id));
    const missingIds = invoiceIds.filter((id) => !existingIds.has(id));
    if (missingIds.length) {
      next(
        badRequest('Bazi faturalar bulunamadi veya bu hesaba ait degil.', [
          { field: 'invoiceIds', rule: 'ownership', missingIds }
        ])
      );
      return;
    }

    await run(
      `
      UPDATE invoices
      SET payment_status = ?, paid_at = ?
      WHERE user_id = ? AND id IN (${placeholders})
      `,
      [paymentStatus, paidAt, req.user.id, ...invoiceIds]
    );

    const updatedInvoices = await all(
      `
      SELECT
        id,
        invoice_number,
        payment_status,
        paid_at
      FROM invoices
      WHERE user_id = ? AND id IN (${placeholders})
      ORDER BY id DESC
      `,
      [req.user.id, ...invoiceIds]
    );

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_BULK_PAYMENT_UPDATED',
      resourceType: 'invoice',
      metadata: {
        invoiceIds,
        updatedCount: updatedInvoices.length,
        status: paymentStatus,
        paidAt
      }
    });

    res.json({
      updatedCount: updatedInvoices.length,
      status: paymentStatus,
      invoices: updatedInvoices
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reminders/ops', async (req, res, next) => {
  try {
    const filters = {
      status: normalizeReminderOpsStatus(req.query.status),
      channel: normalizeReminderOpsChannel(req.query.channel),
      limit: normalizeReminderOpsLimit(req.query.limit)
    };

    const [summary, filteredCount, jobs, errorBreakdown] = await Promise.all([
      listReminderOpsSummary(req.user.id),
      countReminderOpsJobs(req.user.id, filters),
      listReminderOpsJobs(req.user.id, filters),
      listReminderOpsErrorBreakdown(req.user.id, 5)
    ]);

    res.json({
      filters,
      policy: {
        maxRetryCount: REMINDER_MAX_RETRY_COUNT,
        retryBackoffMinutes:
          REMINDER_RETRY_BACKOFF_MINUTES.length > 0 ? REMINDER_RETRY_BACKOFF_MINUTES : [5, 15, 30]
      },
      summary,
      filteredCount,
      errorBreakdown: errorBreakdown.map((row) => ({
        message: row.error_message,
        total: Number(row.total) || 0
      })),
      jobs
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reminders/:reminderId/retry', async (req, res, next) => {
  try {
    const reminderId = Number(req.params.reminderId);

    if (!Number.isInteger(reminderId) || reminderId <= 0) {
      next(badRequest('Gecersiz hatirlatma id.', [{ field: 'reminderId', rule: 'integer' }]));
      return;
    }

    const existingReminder = await getReminderJobById(req.user.id, reminderId);
    if (!existingReminder) {
      next(notFound('Hatirlatma kaydi bulunamadi.'));
      return;
    }

    if (existingReminder.status !== 'failed') {
      next(
        badRequest('Yeniden deneme yalnizca hata durumundaki kayitlar icin kullanilabilir.', [
          { field: 'status', rule: 'mustBeFailed' }
        ])
      );
      return;
    }

    const currentRetryCount = Number(existingReminder.retry_count) || 0;
    if (currentRetryCount >= REMINDER_MAX_RETRY_COUNT) {
      await recordAuditLog({
        req,
        userId: req.user.id,
        eventType: 'INVOICE_REMINDER_RETRY_LIMIT_REACHED',
        resourceType: 'invoice',
        resourceId: String(existingReminder.invoice_id),
        metadata: {
          reminderId,
          retryCount: currentRetryCount,
          maxRetryCount: REMINDER_MAX_RETRY_COUNT
        }
      });
      next(
        badRequest('Yeniden deneme limiti asildi. Lutfen yeni bir hatirlatma olusturun.', [
          { field: 'retryCount', rule: 'max', max: REMINDER_MAX_RETRY_COUNT }
        ])
      );
      return;
    }

    await run(
      `
      UPDATE reminder_jobs
      SET status = 'queued',
          error_message = NULL,
          delivery_url = NULL,
          processed_at = NULL,
          retry_count = retry_count + 1,
          last_retry_at = CURRENT_TIMESTAMP,
          next_attempt_at = NULL
      WHERE id = ? AND user_id = ?
      `,
      [reminderId, req.user.id]
    );

    await processReminderQueue({ onlyJobId: reminderId, limit: 1 });

    const updatedReminder = await getReminderJobById(req.user.id, reminderId);
    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_REMINDER_RETRIED',
      resourceType: 'invoice',
      resourceId: String(existingReminder.invoice_id),
      metadata: {
        reminderId,
        channel: updatedReminder?.channel || existingReminder.channel,
        status: updatedReminder?.status || 'queued',
        retryCount: updatedReminder?.retry_count ?? currentRetryCount + 1,
        maxRetryCount: REMINDER_MAX_RETRY_COUNT
      }
    });

    res.json(updatedReminder);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/reminders', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const existing = await get('SELECT id FROM invoices WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existing) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    const reminders = await listReminderJobs(req.user.id, id);
    res.json(reminders);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reminders', async (req, res, next) => {
  try {
    await assertPlanLimit(req.user.id, 'reminder_create');
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const invoice = await getInvoiceWithItems(req.user.id, id);
    if (!invoice) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    if ((invoice.payment_status || 'pending') === 'paid') {
      next(
        badRequest('Tahsil edilen fatura icin hatirlatma olusturulamaz.', [
          { field: 'paymentStatus', rule: 'mustBePending' }
        ])
      );
      return;
    }

    const channel = normalizeReminderChannel(req.body.channel);
    const fallbackRecipient = channel === 'whatsapp' ? invoice.customer_phone : invoice.customer_email;
    const recipient = normalizeReminderRecipient(channel, req.body.recipient || fallbackRecipient);

    const fallbackMessage = buildDefaultReminderMessage({
      companyName: req.user.companyName || process.env.COMPANY_NAME || 'Teklifim',
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      dueDate: invoice.due_date || invoice.date,
      total: invoice.total,
      paymentStatus: invoice.payment_status
    });
    const message = normalizeReminderMessage(req.body.message, fallbackMessage);

    const createdReminder = await run(
      `
      INSERT INTO reminder_jobs (user_id, invoice_id, channel, recipient, message, status)
      VALUES (?, ?, ?, ?, ?, 'queued')
      `,
      [req.user.id, id, channel, recipient, message]
    );

    await processReminderQueue({ onlyJobId: createdReminder.id, limit: 1 });

    const reminder = await get(
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
      [createdReminder.id, req.user.id]
    );

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_REMINDER_CREATED',
      resourceType: 'invoice',
      resourceId: String(id),
      metadata: {
        reminderId: reminder?.id || createdReminder.id,
        channel: reminder?.channel || channel,
        status: reminder?.status || 'queued',
        retryCount: reminder?.retry_count ?? 0
      }
    });

    res.status(201).json(reminder);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const invoice = await getInvoiceWithItems(req.user.id, id);

    if (!invoice) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    writeDocumentPdf(res, {
      companyName: req.user.companyName || process.env.COMPANY_NAME || 'Teklifim',
      documentType: 'Fatura',
      documentNumber: invoice.invoice_number,
      date: invoice.date,
      dueDate: invoice.due_date,
      paymentStatus: invoice.payment_status,
      paidAt: invoice.paid_at,
      customer: {
        name: invoice.customer_name,
        phone: invoice.customer_phone,
        email: invoice.customer_email,
        address: invoice.customer_address
      },
      items: invoice.items,
      total: invoice.total
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const invoice = await getInvoiceWithItems(req.user.id, id);

    if (!invoice) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const customerId = Number(req.body.customerId);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    if (!Number.isInteger(customerId) || customerId <= 0) {
      next(badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]));
      return;
    }

    const date = normalizeDate(req.body.date);
    const itemResult = sanitizeItems(req.body.items);

    const existing = await get(
      'SELECT id, invoice_number, due_date, payment_status, paid_at FROM invoices WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!existing) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    const customer = await findCustomer(req.user.id, customerId);

    if (!customer) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    const dueDate = normalizeDate(req.body.dueDate || existing.due_date || date);
    const paymentStatus = normalizePaymentStatus(req.body.paymentStatus ?? existing.payment_status);
    const paidAt =
      paymentStatus === 'paid'
        ? normalizeDate(req.body.paidAt || existing.paid_at || date)
        : null;

    await withTransaction(async () => {
      const invoiceNumber =
        typeof req.body.invoiceNumber === 'string' && req.body.invoiceNumber.trim()
          ? req.body.invoiceNumber.trim()
          : existing.invoice_number;

      await run(
        `
        UPDATE invoices
        SET customer_id = ?, invoice_number = ?, date = ?, due_date = ?, payment_status = ?, paid_at = ?, total = ?
        WHERE id = ? AND user_id = ?
        `,
        [customerId, invoiceNumber, date, dueDate, paymentStatus, paidAt, itemResult.total, id, req.user.id]
      );

      await run('DELETE FROM items WHERE invoice_id = ? AND user_id = ?', [id, req.user.id]);

      for (const item of itemResult.items) {
        await run(
          `
          INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
          VALUES (?, NULL, ?, ?, ?, ?, ?)
          `,
          [req.user.id, id, item.name, item.quantity, item.unitPrice, item.total]
        );
      }
    });

    const updated = await getInvoiceWithItems(req.user.id, id);
    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_UPDATED',
      resourceType: 'invoice',
      resourceId: String(id),
      metadata: {
        invoiceNumber: updated?.invoice_number || null,
        customerId: updated?.customer_id || null,
        total: updated?.total || null,
        paymentStatus: updated?.payment_status || null
      }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/payment', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const existing = await get('SELECT id, payment_status FROM invoices WHERE id = ? AND user_id = ?', [
      id,
      req.user.id
    ]);

    if (!existing) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    const paymentStatus = normalizePaymentStatus(req.body.status ?? req.body.paymentStatus, 'status');
    const paidAt = paymentStatus === 'paid' ? normalizeDate(req.body.paidAt || getTodayIsoDate()) : null;

    await run('UPDATE invoices SET payment_status = ?, paid_at = ? WHERE id = ? AND user_id = ?', [
      paymentStatus,
      paidAt,
      id,
      req.user.id
    ]);

    const updated = await getInvoiceWithItems(req.user.id, id);
    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_PAYMENT_UPDATED',
      resourceType: 'invoice',
      resourceId: String(id),
      metadata: {
        paymentStatus,
        paidAt
      }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz fatura id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const existing = await get('SELECT id FROM invoices WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (!existing) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    await withTransaction(async () => {
      await run('DELETE FROM items WHERE invoice_id = ? AND user_id = ?', [id, req.user.id]);
      await run('DELETE FROM invoices WHERE id = ? AND user_id = ?', [id, req.user.id]);
    });

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_DELETED',
      resourceType: 'invoice',
      resourceId: String(id)
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
