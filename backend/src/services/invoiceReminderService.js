import { run, withDbTransaction } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import {
  countReminderOpsJobs,
  getInvoiceIdentity,
  getInvoiceWithItems,
  getReminderJobById,
  getReminderJobRecord,
  listReminderJobs,
  listReminderOpsErrorBreakdown,
  listReminderOpsJobs,
  listReminderOpsSummary
} from '../utils/invoiceRepository.js';
import {
  normalizeReminderChannel,
  normalizeReminderMessage,
  normalizeReminderOpsChannel,
  normalizeReminderOpsLimit,
  normalizeReminderOpsStatus,
  normalizeReminderRecipient
} from '../utils/invoiceValidation.js';
import { assertPlanLimit } from '../utils/plans.js';
import { buildDefaultReminderMessage, processReminderQueue } from './reminderQueue.js';

export function normalizeReminderOpsFilters(query) {
  return {
    status: normalizeReminderOpsStatus(query.status),
    channel: normalizeReminderOpsChannel(query.channel),
    limit: normalizeReminderOpsLimit(query.limit)
  };
}

export async function getReminderOpsOverview({ userId, filters, reminderPolicy }) {
  const [summary, filteredCount, jobs, errorBreakdown] = await Promise.all([
    listReminderOpsSummary(userId),
    countReminderOpsJobs(userId, filters),
    listReminderOpsJobs(userId, filters),
    listReminderOpsErrorBreakdown(userId, 5)
  ]);

  return {
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
  };
}

export async function listInvoiceRemindersWorkflow({ userId, invoiceId }) {
  const existing = await getInvoiceIdentity(userId, invoiceId);
  if (!existing) {
    throw notFound('Fatura bulunamadi.');
  }

  return listReminderJobs(userId, invoiceId);
}

export async function createInvoiceReminderWorkflow({
  req,
  userId,
  invoiceId,
  body,
  companyName,
  fallbackCompanyName = 'Teklifim'
}) {
  const invoice = await getInvoiceWithItems(userId, invoiceId);
  if (!invoice) {
    throw notFound('Fatura bulunamadi.');
  }

  if ((invoice.payment_status || 'pending') === 'paid') {
    throw badRequest('Tahsil edilen fatura icin hatirlatma olusturulamaz.', [
      { field: 'paymentStatus', rule: 'mustBePending' }
    ]);
  }

  const channel = normalizeReminderChannel(body.channel);
  const fallbackRecipient = channel === 'whatsapp' ? invoice.customer_phone : invoice.customer_email;
  const recipient = normalizeReminderRecipient(channel, body.recipient || fallbackRecipient);

  const resolvedCompanyName = companyName || process.env.COMPANY_NAME || fallbackCompanyName;
  const fallbackMessage = buildDefaultReminderMessage({
    companyName: resolvedCompanyName,
    customerName: invoice.customer_name,
    invoiceNumber: invoice.invoice_number,
    dueDate: invoice.due_date || invoice.date,
    total: invoice.total,
    paymentStatus: invoice.payment_status
  });

  const message = normalizeReminderMessage(body.message, fallbackMessage);

  const createdReminderId = await withDbTransaction(async () => {
    await assertPlanLimit(userId, 'reminder_create');
    const createdReminder = await run(
      `
      INSERT INTO reminder_jobs (user_id, invoice_id, channel, recipient, message, status)
      VALUES (?, ?, ?, ?, ?, 'queued')
      `,
      [userId, invoiceId, channel, recipient, message]
    );

    return createdReminder.id;
  });

  await processReminderQueue({ onlyJobId: createdReminderId, limit: 1 });

  const reminder = await getReminderJobRecord(userId, createdReminderId);

  await recordAuditLog({
    req,
    userId,
    eventType: 'INVOICE_REMINDER_CREATED',
    resourceType: 'invoice',
    resourceId: String(invoiceId),
    metadata: {
      reminderId: reminder?.id || createdReminderId,
      channel: reminder?.channel || channel,
      status: reminder?.status || 'queued',
      retryCount: reminder?.retry_count ?? 0
    }
  });

  return reminder;
}

export async function retryInvoiceReminderWorkflow({ req, userId, reminderId, reminderPolicy }) {
  const existingReminder = await getReminderJobById(userId, reminderId);
  if (!existingReminder) {
    throw notFound('Hatirlatma kaydi bulunamadi.');
  }

  if (existingReminder.status !== 'failed') {
    throw badRequest('Yeniden deneme yalnizca hata durumundaki kayitlar icin kullanilabilir.', [
      { field: 'status', rule: 'mustBeFailed' }
    ]);
  }

  const currentRetryCount = Number(existingReminder.retry_count) || 0;
  if (currentRetryCount >= reminderPolicy.maxRetryCount) {
    await recordAuditLog({
      req,
      userId,
      eventType: 'INVOICE_REMINDER_RETRY_LIMIT_REACHED',
      resourceType: 'invoice',
      resourceId: String(existingReminder.invoice_id),
      metadata: {
        reminderId,
        retryCount: currentRetryCount,
        maxRetryCount: reminderPolicy.maxRetryCount
      }
    });

    throw badRequest('Yeniden deneme limiti asildi. Lutfen yeni bir hatirlatma olusturun.', [
      { field: 'retryCount', rule: 'max', max: reminderPolicy.maxRetryCount }
    ]);
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
    [reminderId, userId]
  );

  await processReminderQueue({ onlyJobId: reminderId, limit: 1 });

  const updatedReminder = await getReminderJobById(userId, reminderId);

  await recordAuditLog({
    req,
    userId,
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

  return updatedReminder;
}
