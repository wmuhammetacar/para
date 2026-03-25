import { badRequest } from './httpErrors.js';
import {
  normalizeListLimit as normalizeSharedListLimit,
  normalizeListPage as normalizeSharedListPage,
  normalizeListQuery as normalizeSharedListQuery,
  normalizeWithMeta as normalizeSharedWithMeta
} from './listValidation.js';

export const normalizeListLimit = normalizeSharedListLimit;
export const normalizeListPage = normalizeSharedListPage;
export const normalizeListQuery = normalizeSharedListQuery;
export const normalizeWithMeta = normalizeSharedWithMeta;

export function normalizeQuoteId(value, field = 'id', message = 'Gecersiz teklif id.') {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(message, [{ field, rule: 'integer' }]);
  }

  return id;
}

export function normalizeQuoteCustomerId(value, field = 'customerId') {
  const customerId = Number(value);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw badRequest('Gecerli bir musteri secin.', [{ field, rule: 'integer' }]);
  }

  return customerId;
}
