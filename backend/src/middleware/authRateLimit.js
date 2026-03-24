import { sendError } from '../utils/response.js';

const WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const MAX_REQUESTS = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20;
const MAX_BUCKETS = 5000;
const buckets = new Map();

function cleanupExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getRateLimitKey(req) {
  return `${req.ip}:${req.path}`;
}

export function authRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    cleanupExpired(now);
  }

  const key = getRateLimitKey(req);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  existing.count += 1;

  if (existing.count > MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    sendError(
      res,
      429,
      'RATE_LIMITED',
      'Cok fazla giris denemesi yaptiniz. Lutfen biraz sonra tekrar deneyin.'
    );
    return;
  }

  next();
}
