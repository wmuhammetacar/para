import { sendError } from '../utils/response.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'JSON body gecersiz.');
    return;
  }

  if (typeof err?.status === 'number' && err?.code && err?.message) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  // Keep a single centralized log for unexpected server failures.
  // eslint-disable-next-line no-console
  console.error(err);

  sendError(res, 500, 'INTERNAL_ERROR', 'Sunucu hatasi.');
}
