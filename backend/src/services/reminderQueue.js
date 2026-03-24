import { all, run } from '../db.js';

const DEFAULT_REMINDER_MAX_RETRY_COUNT = 3;
const DEFAULT_REMINDER_RETRY_BACKOFF_MINUTES = [5, 15, 30];

function resolvePositiveIntEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBackoffSchedule(value) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    return DEFAULT_REMINDER_RETRY_BACKOFF_MINUTES;
  }

  const minutes = rawValue
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part > 0);

  return minutes.length ? minutes : DEFAULT_REMINDER_RETRY_BACKOFF_MINUTES;
}

const REMINDER_MAX_RETRY_COUNT = resolvePositiveIntEnv(
  process.env.REMINDER_MAX_RETRY_COUNT,
  DEFAULT_REMINDER_MAX_RETRY_COUNT
);
const REMINDER_RETRY_BACKOFF_MINUTES = resolveBackoffSchedule(process.env.REMINDER_RETRY_BACKOFF_MINUTES);

function formatCurrency(value) {
  return `${(Number(value) || 0).toFixed(2)} TL`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeWhatsappNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `90${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `90${digits.slice(1)}`;
  }

  return digits;
}

function buildDeliveryUrl(job) {
  if (job.channel === 'whatsapp') {
    const normalizedNumber = normalizeWhatsappNumber(job.recipient);
    if (normalizedNumber.length < 11) {
      throw new Error('WhatsApp alicisi gecersiz.');
    }
    return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(job.message)}`;
  }

  if (job.channel !== 'email') {
    throw new Error('Hatirlatma kanali gecersiz.');
  }

  if (!isValidEmail(job.recipient)) {
    throw new Error('E-posta alicisi gecersiz.');
  }

  return `mailto:${encodeURIComponent(job.recipient)}?subject=${encodeURIComponent(
    `${job.company_name || 'Teklifim'} - Odeme Hatirlatmasi`
  )}&body=${encodeURIComponent(job.message)}`;
}

function getBackoffMinutesForRetryCount(retryCount) {
  const safeRetryCount = Number.isInteger(retryCount) && retryCount > 0 ? retryCount : 1;
  const index = Math.max(0, Math.min(REMINDER_RETRY_BACKOFF_MINUTES.length - 1, safeRetryCount - 1));
  return REMINDER_RETRY_BACKOFF_MINUTES[index];
}

function toIsoAfterMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function buildDefaultReminderMessage({
  companyName,
  customerName,
  invoiceNumber,
  dueDate,
  total,
  paymentStatus
}) {
  const statusLabel = paymentStatus === 'paid' ? 'Tahsil Edildi' : 'Beklemede';

  return [
    `Merhaba ${customerName || 'degerli musterimiz'},`,
    `${invoiceNumber} numarali faturamiz icin odeme hatirlatmasi iletiyoruz.`,
    `Tutar: ${formatCurrency(total)} - Vade: ${dueDate || '-'}.`,
    `Durum: ${statusLabel}.`,
    `Tesekkurler, ${companyName || 'Teklifim'}`
  ].join(' ');
}

let queueInterval = null;
let processing = false;

export async function processReminderQueue(options = {}) {
  const { limit = 20, onlyJobId = null } = options;

  if (processing) {
    return [];
  }

  processing = true;

  try {
    const whereParts = [`r.status = 'queued'`];
    const params = [];

    if (onlyJobId) {
      whereParts.push('r.id = ?');
      params.push(onlyJobId);
    }

    params.push(Number(limit) > 0 ? Number(limit) : 20);

    const jobs = await all(
      `
      SELECT
        r.id,
        r.channel,
        r.recipient,
        r.message,
        r.retry_count,
        r.next_attempt_at,
        i.invoice_number,
        i.total,
        i.due_date,
        i.payment_status,
        c.name AS customer_name,
        u.company_name
      FROM reminder_jobs r
      JOIN invoices i ON i.id = r.invoice_id
      JOIN customers c ON c.id = i.customer_id
      JOIN users u ON u.id = r.user_id
      WHERE ${whereParts.join(' AND ')}
        AND (r.next_attempt_at IS NULL OR datetime(r.next_attempt_at) <= datetime('now'))
      ORDER BY r.id ASC
      LIMIT ?
      `,
      params
    );

    const results = [];

    for (const job of jobs) {
      try {
        const deliveryUrl = buildDeliveryUrl(job);

        await run(
          `
          UPDATE reminder_jobs
          SET status = 'sent',
              delivery_url = ?,
              error_message = NULL,
              next_attempt_at = NULL,
              processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [deliveryUrl, job.id]
        );

        results.push({
          id: job.id,
          status: 'sent',
          deliveryUrl,
          retryCount: Number(job.retry_count) || 0
        });
      } catch (error) {
        const currentRetryCount = Number(job.retry_count) || 0;
        if (currentRetryCount >= REMINDER_MAX_RETRY_COUNT) {
          await run(
            `
            UPDATE reminder_jobs
            SET status = 'failed',
                error_message = ?,
                next_attempt_at = NULL,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [error.message, job.id]
          );

          results.push({
            id: job.id,
            status: 'failed',
            retryCount: currentRetryCount
          });
          continue;
        }

        const nextRetryCount = currentRetryCount + 1;
        const backoffMinutes = getBackoffMinutesForRetryCount(nextRetryCount);
        const nextAttemptAt = toIsoAfterMinutes(backoffMinutes);

        await run(
          `
          UPDATE reminder_jobs
          SET status = 'queued',
              retry_count = ?,
              last_retry_at = CURRENT_TIMESTAMP,
              next_attempt_at = ?,
              delivery_url = NULL,
              error_message = ?,
              processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [nextRetryCount, nextAttemptAt, error.message, job.id]
        );

        results.push({
          id: job.id,
          status: 'retry_scheduled',
          retryCount: nextRetryCount,
          nextAttemptAt
        });
      }
    }

    return results;
  } finally {
    processing = false;
  }
}

export function startReminderWorker(options = {}) {
  const { intervalMs = 15000 } = options;

  if (queueInterval) {
    return;
  }

  queueInterval = setInterval(() => {
    processReminderQueue().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Reminder worker error:', error);
    });
  }, intervalMs);

  if (typeof queueInterval.unref === 'function') {
    queueInterval.unref();
  }
}

export function stopReminderWorker() {
  if (!queueInterval) {
    return;
  }

  clearInterval(queueInterval);
  queueInterval = null;
}
