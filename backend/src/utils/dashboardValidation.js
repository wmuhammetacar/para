import { badRequest, forbidden } from './httpErrors.js';
import { normalizePlanCode } from './plans.js';

export const PLAN_CHANGE_REQUEST_TTL_MINUTES = (() => {
  const parsed = Number(process.env.BILLING_PLAN_REQUEST_TTL_MINUTES);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 24 * 60) {
    return 30;
  }

  return parsed;
})();

export function assertBillingAuthorized(req) {
  const billingInternalToken = typeof process.env.BILLING_INTERNAL_TOKEN === 'string'
    ? process.env.BILLING_INTERNAL_TOKEN.trim()
    : '';

  if (!billingInternalToken) {
    throw forbidden('Plan degisikligi devre disi. Lutfen destek ekibi ile iletisime gecin.');
  }

  const billingToken = typeof req.headers['x-billing-token'] === 'string'
    ? req.headers['x-billing-token'].trim()
    : '';

  if (!billingToken || billingToken !== billingInternalToken) {
    throw forbidden('Bu islem yalnizca yetkili billing akisiyla yapilabilir.');
  }
}

export function normalizePeriod(value) {
  if (typeof value !== 'string') {
    return 'all';
  }

  const period = value.trim().toLowerCase();
  if (!period) {
    return 'all';
  }

  return period;
}

export function normalizeLimit(value, fallback = 20) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    throw badRequest('Limit gecersiz. 1 ile 50 arasinda bir tam sayi olmali.', [
      { field: 'limit', rule: 'range', min: 1, max: 50 }
    ]);
  }

  return limit;
}

export function normalizeOptionalTextFilter(value, field, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text.length > maxLength) {
    throw badRequest(`${field} en fazla ${maxLength} karakter olabilir.`, [
      { field, rule: 'maxLength', max: maxLength }
    ]);
  }

  return text;
}

export function normalizeOptionalIsoDate(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = String(value).trim();
  const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!isValidFormat || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw badRequest(`${field} gecersiz. Beklenen format: YYYY-MM-DD.`, [
      { field, rule: 'date' }
    ]);
  }

  return date;
}

export function normalizeGrowthPeriod(value) {
  if (value === undefined || value === null || value === '') {
    return 90;
  }

  const periodDays = Number(value);
  if (!Number.isInteger(periodDays) || periodDays < 7 || periodDays > 365) {
    throw badRequest('Growth period gecersiz. 7 ile 365 arasinda bir tam sayi olmali.', [
      { field: 'period', rule: 'range', min: 7, max: 365 }
    ]);
  }

  return periodDays;
}

export function normalizeCohortMonths(value) {
  if (value === undefined || value === null || value === '') {
    return 6;
  }

  const months = Number(value);
  if (!Number.isInteger(months) || months < 3 || months > 12) {
    throw badRequest('Cohort months gecersiz. 3 ile 12 arasinda bir tam sayi olmali.', [
      { field: 'cohortMonths', rule: 'range', min: 3, max: 12 }
    ]);
  }

  return months;
}

export function normalizePilotPeriod(value) {
  if (value === undefined || value === null || value === '') {
    return 30;
  }

  const periodDays = Number(value);
  if (!Number.isInteger(periodDays) || periodDays < 7 || periodDays > 90) {
    throw badRequest('Pilot period gecersiz. 7 ile 90 arasinda bir tam sayi olmali.', [
      { field: 'period', rule: 'range', min: 7, max: 90 }
    ]);
  }

  return periodDays;
}

export function normalizePlanPatch(value) {
  const planCode = normalizePlanCode(value);
  if (!planCode) {
    throw badRequest('Paket kodu gecersiz. Desteklenen degerler: starter, standard.', [
      { field: 'planCode', rule: 'enum', values: ['starter', 'standard'] }
    ]);
  }

  return planCode;
}

export function normalizePlanChangeRequestId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Gecerli bir plan degisikligi talebi secin.', [
      { field: 'planChangeRequestId', rule: 'integer' }
    ]);
  }

  return id;
}

export function normalizePaymentReference(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw badRequest('Odeme referansi zorunludur.', [{ field: 'paymentReference', rule: 'required' }]);
  }

  if (text.length > 120) {
    throw badRequest('Odeme referansi en fazla 120 karakter olabilir.', [
      { field: 'paymentReference', rule: 'maxLength', max: 120 }
    ]);
  }

  return text;
}

export function isRequestExpired(expiresAt) {
  const raw = String(expiresAt || '').trim();
  if (!raw) {
    return true;
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  return parsed.getTime() < Date.now();
}
