import { withDbTransaction } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { buildDocumentNumber, normalizeDate, normalizeDocumentNumber, sanitizeItems } from '../utils/documents.js';
import { notFound } from '../utils/httpErrors.js';
import { assertPlanLimit } from '../utils/plans.js';
import {
  assertUniqueQuoteNumber,
  deleteQuote,
  deleteQuoteItems,
  findCustomer,
  getQuoteSummary,
  getQuoteWithItems,
  insertQuote,
  insertQuoteItems,
  updateQuoteHeader
} from '../utils/quoteRepository.js';
import { normalizeQuoteCustomerId } from '../utils/quoteValidation.js';

function resolveQuoteDraft(body) {
  return {
    customerId: normalizeQuoteCustomerId(body.customerId),
    date: normalizeDate(body.date),
    requestedQuoteNumber: normalizeDocumentNumber(body.quoteNumber, 'quoteNumber'),
    itemResult: sanitizeItems(body.items)
  };
}

async function ensureCustomerExists(userId, customerId) {
  const customer = await findCustomer(userId, customerId);
  if (!customer) {
    throw notFound('Musteri bulunamadi.');
  }
}

export async function createQuoteWorkflow({ req, userId, body }) {
  const draft = resolveQuoteDraft(body);
  await ensureCustomerExists(userId, draft.customerId);

  const created = await withDbTransaction(async () => {
    await assertPlanLimit(userId, 'quote_create');

    const quoteId = await insertQuote(userId, {
      customerId: draft.customerId,
      quoteNumber: 'TEMP',
      date: draft.date,
      total: draft.itemResult.total
    });

    const quoteNumber = draft.requestedQuoteNumber
      ? draft.requestedQuoteNumber
      : buildDocumentNumber('TKL', quoteId, draft.date);

    await assertUniqueQuoteNumber(userId, quoteNumber, quoteId);

    await updateQuoteHeader(userId, quoteId, {
      customerId: draft.customerId,
      quoteNumber,
      date: draft.date,
      total: draft.itemResult.total
    });

    await insertQuoteItems(userId, quoteId, draft.itemResult.items);

    return getQuoteWithItems(userId, quoteId);
  });

  await recordAuditLog({
    req,
    userId,
    eventType: 'QUOTE_CREATED',
    resourceType: 'quote',
    resourceId: String(created.id),
    metadata: {
      quoteNumber: created.quote_number,
      customerId: created.customer_id,
      total: created.total
    }
  });

  return created;
}

export async function updateQuoteWorkflow({ req, userId, quoteId, body }) {
  const draft = resolveQuoteDraft(body);
  const existing = await getQuoteSummary(userId, quoteId);
  if (!existing) {
    throw notFound('Teklif bulunamadi.');
  }

  await ensureCustomerExists(userId, draft.customerId);

  await withDbTransaction(async () => {
    const quoteNumber = draft.requestedQuoteNumber
      ? draft.requestedQuoteNumber
      : existing.quote_number;

    await assertUniqueQuoteNumber(userId, quoteNumber, quoteId);

    await updateQuoteHeader(userId, quoteId, {
      customerId: draft.customerId,
      quoteNumber,
      date: draft.date,
      total: draft.itemResult.total
    });

    await deleteQuoteItems(userId, quoteId);
    await insertQuoteItems(userId, quoteId, draft.itemResult.items);
  });

  const updated = await getQuoteWithItems(userId, quoteId);

  await recordAuditLog({
    req,
    userId,
    eventType: 'QUOTE_UPDATED',
    resourceType: 'quote',
    resourceId: String(quoteId),
    metadata: {
      quoteNumber: updated?.quote_number || null,
      customerId: updated?.customer_id || null,
      total: updated?.total || null
    }
  });

  return updated;
}

export async function deleteQuoteWorkflow({ req, userId, quoteId }) {
  const existing = await getQuoteSummary(userId, quoteId);
  if (!existing) {
    throw notFound('Teklif bulunamadi.');
  }

  await withDbTransaction(async () => {
    await deleteQuoteItems(userId, quoteId);
    await deleteQuote(userId, quoteId);
  });

  await recordAuditLog({
    req,
    userId,
    eventType: 'QUOTE_DELETED',
    resourceType: 'quote',
    resourceId: String(quoteId)
  });
}
