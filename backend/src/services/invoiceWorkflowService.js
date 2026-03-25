import { all, run, withDbTransaction } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { buildDocumentNumber, normalizeDate, normalizeDocumentNumber, sanitizeItems } from '../utils/documents.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import {
  assertUniqueInvoiceNumber,
  findCustomer,
  findQuote,
  getInvoiceIdentity,
  getInvoiceSummary,
  getInvoiceWithItems,
  listExistingInvoiceIds,
  listQuoteItems
} from '../utils/invoiceRepository.js';
import { getTodayIsoDate, normalizePaymentStatus, parseInvoiceIds } from '../utils/invoiceValidation.js';
import { assertPlanLimit } from '../utils/plans.js';

async function insertInvoiceItems(userId, invoiceId, items) {
  for (const item of items) {
    await run(
      `
      INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
      `,
      [userId, invoiceId, item.name, item.quantity, item.unitPrice, item.total]
    );
  }
}

async function resolveCreateDraft(userId, body) {
  const date = normalizeDate(body.date);
  const dueDate = normalizeDate(body.dueDate || date);
  const paymentStatus = normalizePaymentStatus(body.paymentStatus);
  const paidAt = paymentStatus === 'paid' ? normalizeDate(body.paidAt || date) : null;
  const requestedInvoiceNumber = normalizeDocumentNumber(body.invoiceNumber, 'invoiceNumber');
  const quoteId = body.quoteId ? Number(body.quoteId) : null;

  let customerId = null;
  let itemResult = null;

  if (quoteId) {
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
      throw badRequest('Gecerli bir teklif secin.', [{ field: 'quoteId', rule: 'integer' }]);
    }

    const quote = await findQuote(userId, quoteId);
    if (!quote) {
      throw notFound('Teklif bulunamadi.');
    }

    const quoteItems = await listQuoteItems(quoteId);
    if (!quoteItems.length) {
      throw badRequest('Teklifte kalem bulunamadi.', [{ field: 'quoteId', rule: 'hasItems' }]);
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
    customerId = Number(body.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      throw badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]);
    }

    itemResult = sanitizeItems(body.items);
  }

  return {
    customerId,
    quoteId,
    date,
    dueDate,
    paymentStatus,
    paidAt,
    requestedInvoiceNumber,
    itemResult
  };
}

export async function createInvoiceWorkflow({ req, userId, body }) {
  const draft = await resolveCreateDraft(userId, body);
  const customer = await findCustomer(userId, draft.customerId);
  if (!customer) {
    throw notFound('Musteri bulunamadi.');
  }

  const created = await withDbTransaction(async () => {
    await assertPlanLimit(userId, 'invoice_create');

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
      [
        userId,
        draft.customerId,
        draft.quoteId,
        'TEMP',
        draft.date,
        draft.dueDate,
        draft.paymentStatus,
        draft.paidAt,
        draft.itemResult.total
      ]
    );

    const invoiceNumber = draft.requestedInvoiceNumber
      ? draft.requestedInvoiceNumber
      : buildDocumentNumber('FTR', insertInvoice.id, draft.date);

    await assertUniqueInvoiceNumber(userId, invoiceNumber, insertInvoice.id);

    await run('UPDATE invoices SET invoice_number = ? WHERE id = ? AND user_id = ?', [invoiceNumber, insertInvoice.id, userId]);

    await insertInvoiceItems(userId, insertInvoice.id, draft.itemResult.items);

    return getInvoiceWithItems(userId, insertInvoice.id);
  });

  await recordAuditLog({
    req,
    userId,
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

  return created;
}

export async function updateInvoiceWorkflow({ req, userId, invoiceId, body }) {
  const customerId = Number(body.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]);
  }

  const date = normalizeDate(body.date);
  const itemResult = sanitizeItems(body.items);

  const existing = await getInvoiceSummary(userId, invoiceId);
  if (!existing) {
    throw notFound('Fatura bulunamadi.');
  }

  const customer = await findCustomer(userId, customerId);
  if (!customer) {
    throw notFound('Musteri bulunamadi.');
  }

  const dueDate = normalizeDate(body.dueDate || existing.due_date || date);
  const paymentStatus = normalizePaymentStatus(body.paymentStatus ?? existing.payment_status);
  const requestedInvoiceNumber = normalizeDocumentNumber(body.invoiceNumber, 'invoiceNumber');
  const paidAt = paymentStatus === 'paid' ? normalizeDate(body.paidAt || existing.paid_at || date) : null;

  await withDbTransaction(async () => {
    const invoiceNumber = requestedInvoiceNumber ? requestedInvoiceNumber : existing.invoice_number;

    await assertUniqueInvoiceNumber(userId, invoiceNumber, invoiceId);

    await run(
      `
      UPDATE invoices
      SET customer_id = ?, invoice_number = ?, date = ?, due_date = ?, payment_status = ?, paid_at = ?, total = ?
      WHERE id = ? AND user_id = ?
      `,
      [customerId, invoiceNumber, date, dueDate, paymentStatus, paidAt, itemResult.total, invoiceId, userId]
    );

    await run('DELETE FROM items WHERE invoice_id = ? AND user_id = ?', [invoiceId, userId]);
    await insertInvoiceItems(userId, invoiceId, itemResult.items);
  });

  const updated = await getInvoiceWithItems(userId, invoiceId);

  await recordAuditLog({
    req,
    userId,
    eventType: 'INVOICE_UPDATED',
    resourceType: 'invoice',
    resourceId: String(invoiceId),
    metadata: {
      invoiceNumber: updated?.invoice_number || null,
      customerId: updated?.customer_id || null,
      total: updated?.total || null,
      paymentStatus: updated?.payment_status || null
    }
  });

  return updated;
}

export async function updateInvoicePaymentWorkflow({ req, userId, invoiceId, body }) {
  const existing = await getInvoiceSummary(userId, invoiceId);
  if (!existing) {
    throw notFound('Fatura bulunamadi.');
  }

  const paymentStatus = normalizePaymentStatus(body.status ?? body.paymentStatus, 'status');
  const paidAt = paymentStatus === 'paid' ? normalizeDate(body.paidAt || getTodayIsoDate()) : null;

  await run('UPDATE invoices SET payment_status = ?, paid_at = ? WHERE id = ? AND user_id = ?', [paymentStatus, paidAt, invoiceId, userId]);

  const updated = await getInvoiceWithItems(userId, invoiceId);

  await recordAuditLog({
    req,
    userId,
    eventType: 'INVOICE_PAYMENT_UPDATED',
    resourceType: 'invoice',
    resourceId: String(invoiceId),
    metadata: {
      paymentStatus,
      paidAt
    }
  });

  return updated;
}

export async function updateBulkInvoicePaymentWorkflow({ req, userId, body }) {
  const invoiceIds = parseInvoiceIds(body.invoiceIds);
  const paymentStatus = normalizePaymentStatus(body.status ?? body.paymentStatus, 'status');
  const paidAt = paymentStatus === 'paid' ? normalizeDate(body.paidAt || getTodayIsoDate()) : null;

  const existing = await listExistingInvoiceIds(userId, invoiceIds);
  if (!existing.length) {
    throw notFound('Secilen faturalar bulunamadi.');
  }

  const existingIds = new Set(existing.map((row) => row.id));
  const missingIds = invoiceIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) {
    throw badRequest('Bazi faturalar bulunamadi veya bu hesaba ait degil.', [
      { field: 'invoiceIds', rule: 'ownership', missingIds }
    ]);
  }

  const placeholders = invoiceIds.map(() => '?').join(', ');

  await run(
    `
    UPDATE invoices
    SET payment_status = ?, paid_at = ?
    WHERE user_id = ? AND id IN (${placeholders})
    `,
    [paymentStatus, paidAt, userId, ...invoiceIds]
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
    [userId, ...invoiceIds]
  );

  await recordAuditLog({
    req,
    userId,
    eventType: 'INVOICE_BULK_PAYMENT_UPDATED',
    resourceType: 'invoice',
    metadata: {
      invoiceIds,
      updatedCount: updatedInvoices.length,
      status: paymentStatus,
      paidAt
    }
  });

  return {
    updatedCount: updatedInvoices.length,
    status: paymentStatus,
    invoices: updatedInvoices
  };
}

export async function deleteInvoiceWorkflow({ req, userId, invoiceId }) {
  const existing = await getInvoiceIdentity(userId, invoiceId);
  if (!existing) {
    throw notFound('Fatura bulunamadi.');
  }

  await withDbTransaction(async () => {
    await run('DELETE FROM items WHERE invoice_id = ? AND user_id = ?', [invoiceId, userId]);
    await run('DELETE FROM invoices WHERE id = ? AND user_id = ?', [invoiceId, userId]);
  });

  await recordAuditLog({
    req,
    userId,
    eventType: 'INVOICE_DELETED',
    resourceType: 'invoice',
    resourceId: String(invoiceId)
  });
}
