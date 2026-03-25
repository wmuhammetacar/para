import { badRequest } from './httpErrors.js';

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

export function normalizeListLimit(value) {
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

export function normalizeListPage(value) {
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

export function normalizeListQuery(value) {
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

export function normalizeWithMeta(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
