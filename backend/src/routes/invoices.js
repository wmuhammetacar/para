import { Router } from 'express';
import { all, get, run, withDbTransaction } from '../db.js';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { buildDefaultReminderMessage, processReminderQueue } from '../services/reminderQueue.js';
import {
  assertUniqueInvoiceNumber,
  countInvoices,
  countReminderOpsJobs,
  findCustomer,
  getInvoiceWithItems,
  getReminderJobById,
  listExistingInvoiceIds,
  listInvoices,
  listReminderJobs,
  listReminderOpsErrorBreakdown,
  listReminderOpsJobs,
  listReminderOpsSummary
} from '../utils/invoiceRepository.js';
import {
  getReminderPolicyFromEnv,
  getTodayIsoDate,
  normalizeEntityId,
  normalizeListLimit,
  normalizeListPage,
  normalizeListQuery,
  normalizeListStatusFilter,
  normalizePaymentStatus,
  normalizeReminderChannel,
  normalizeReminderMessage,
  normalizeReminderOpsChannel,
  normalizeReminderOpsLimit,
  normalizeReminderOpsStatus,
  normalizeReminderRecipient,
  normalizeWithMeta,
  parseInvoiceIds
} from '../utils/invoiceValidation.js';
import { recordAuditLog } from '../utils/audit.js';
import { buildDocumentNumber, normalizeDate, normalizeDocumentNumber, sanitizeItems } from '../utils/documents.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import { assertPlanLimit } from '../utils/plans.js';
import { writeDocumentPdf } from '../utils/pdf.js';

const router = Router();
const reminderPolicy = getReminderPolicyFromEnv();

router.use(authenticate);
router.use(abuseRateLimit);

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
    const date = normalizeDate(req.body.date);
    const dueDate = normalizeDate(req.body.dueDate || date);
    const paymentStatus = normalizePaymentStatus(req.body.paymentStatus);
    const paidAt = paymentStatus === 'paid' ? normalizeDate(req.body.paidAt || date) : null;
    const requestedInvoiceNumber = normalizeDocumentNumber(req.body.invoiceNumber, 'invoiceNumber');
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
      itemResult = sanitizeItems(
        quoteItems.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unit_price)
        }))
      );
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

    const created = await withDbTransaction(async () => {
      await assertPlanLimit(req.user.id, 'invoice_create');
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

      const invoiceNumber = requestedInvoiceNumber
        ? requestedInvoiceNumber
        : buildDocumentNumber('FTR', insertInvoice.id, date);

      await assertUniqueInvoiceNumber(req.user.id, invoiceNumber, insertInvoice.id);

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
    const existing = await listExistingInvoiceIds(req.user.id, invoiceIds);

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
        maxRetryCount: reminderPolicy.maxRetryCount,
        retryBackoffMinutes: reminderPolicy.retryBackoffMinutes
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
    const reminderId = normalizeEntityId(req.params.reminderId, 'reminderId', 'Gecersiz hatirlatma id.');

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
    if (currentRetryCount >= reminderPolicy.maxRetryCount) {
      await recordAuditLog({
        req,
        userId: req.user.id,
        eventType: 'INVOICE_REMINDER_RETRY_LIMIT_REACHED',
        resourceType: 'invoice',
        resourceId: String(existingReminder.invoice_id),
        metadata: {
          reminderId,
          retryCount: currentRetryCount,
          maxRetryCount: reminderPolicy.maxRetryCount
        }
      });
      next(
        badRequest('Yeniden deneme limiti asildi. Lutfen yeni bir hatirlatma olusturun.', [
          { field: 'retryCount', rule: 'max', max: reminderPolicy.maxRetryCount }
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
        maxRetryCount: reminderPolicy.maxRetryCount
      }
    });

    res.json(updatedReminder);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/reminders', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

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
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

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

    const createdReminderId = await withDbTransaction(async () => {
      await assertPlanLimit(req.user.id, 'reminder_create');
      const createdReminder = await run(
        `
        INSERT INTO reminder_jobs (user_id, invoice_id, channel, recipient, message, status)
        VALUES (?, ?, ?, ?, ?, 'queued')
        `,
        [req.user.id, id, channel, recipient, message]
      );
      return createdReminder.id;
    });

    await processReminderQueue({ onlyJobId: createdReminderId, limit: 1 });

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
      [createdReminderId, req.user.id]
    );

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'INVOICE_REMINDER_CREATED',
      resourceType: 'invoice',
      resourceId: String(id),
      metadata: {
        reminderId: reminder?.id || createdReminderId,
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
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

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
      total: invoice.total,
      projectSummary: invoice.items?.map((item) => item.name).filter(Boolean).slice(0, 3).join(', ') || '-',
      paymentTerms: `Odeme vadesi ${invoice.due_date || invoice.date}. Odeme referansinda ${invoice.invoice_number} belirtin.`
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

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
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');
    const customerId = Number(req.body.customerId);

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
    const requestedInvoiceNumber = normalizeDocumentNumber(req.body.invoiceNumber, 'invoiceNumber');
    const paidAt = paymentStatus === 'paid' ? normalizeDate(req.body.paidAt || existing.paid_at || date) : null;

    await withDbTransaction(async () => {
      const invoiceNumber = requestedInvoiceNumber ? requestedInvoiceNumber : existing.invoice_number;

      await assertUniqueInvoiceNumber(req.user.id, invoiceNumber, id);

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
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

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
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

    const existing = await get('SELECT id FROM invoices WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (!existing) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    await withDbTransaction(async () => {
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
