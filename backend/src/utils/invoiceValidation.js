import { badRequest } from './httpErrors.js';
import {
  normalizeListLimit as normalizeSharedListLimit,
  normalizeListPage as normalizeSharedListPage,
  normalizeListQuery as normalizeSharedListQuery,
  normalizeWithMeta as normalizeSharedWithMeta
} from './listValidation.js';

const DEFAULT_REMINDER_MAX_RETRY_COUNT = 3;

function resolvePositiveIntEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getReminderPolicyFromEnv() {
  const maxRetryCount = resolvePositiveIntEnv(
    process.env.REMINDER_MAX_RETRY_COUNT,
    DEFAULT_REMINDER_MAX_RETRY_COUNT
  );

  const retryBackoffMinutes = typeof process.env.REMINDER_RETRY_BACKOFF_MINUTES === 'string'
    ? process.env.REMINDER_RETRY_BACKOFF_MINUTES
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isInteger(part) && part > 0)
    : [];

  return {
    maxRetryCount,
    retryBackoffMinutes: retryBackoffMinutes.length > 0 ? retryBackoffMinutes : [5, 15, 30]
  };
}

export function normalizePaymentStatus(value, field = 'paymentStatus') {
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

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeListStatusFilter(value) {
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

export const normalizeListLimit = normalizeSharedListLimit;
export const normalizeListPage = normalizeSharedListPage;
export const normalizeListQuery = normalizeSharedListQuery;
export const normalizeWithMeta = normalizeSharedWithMeta;

export function parseInvoiceIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest('En az bir fatura secmelisiniz.', [{ field: 'invoiceIds', rule: 'minItems' }]);
  }

  const ids = [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) {
    throw badRequest('Secilen faturalar gecersiz.', [{ field: 'invoiceIds', rule: 'integerArray' }]);
  }

  return ids;
}

export function normalizeReminderChannel(value) {
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

export function normalizeReminderRecipient(channel, value) {
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

export function normalizeReminderMessage(value, fallbackMessage) {
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

export function normalizeReminderOpsStatus(value) {
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

export function normalizeReminderOpsChannel(value) {
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

export function normalizeReminderOpsLimit(value) {
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

export function normalizeEntityId(value, field = 'id', message = 'Gecersiz id.') {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(message, [{ field, rule: 'integer' }]);
  }

  return id;
}
