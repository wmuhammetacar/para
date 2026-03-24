import { randomUUID } from 'node:crypto';

function normalizeRequestId(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, 100);
}

export function requestContext(req, res, next) {
  const incomingId = normalizeRequestId(req.headers['x-request-id']);
  const requestId = incomingId || randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
