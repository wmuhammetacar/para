import { sendError } from '../utils/response.js';

const buckets = new Map();
const MAX_BUCKETS = 20000;

function resolvePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getScopePolicy(scope) {
  if (scope === 'write') {
    return {
      windowMs: resolvePositiveInt(process.env.ABUSE_WRITE_RATE_LIMIT_WINDOW_MS, 60_000),
      max: resolvePositiveInt(process.env.ABUSE_WRITE_RATE_LIMIT_MAX, 120),
      code: 'WRITE_RATE_LIMITED',
      message: 'Yazma islemi limiti asildi. Lutfen biraz sonra tekrar deneyin.'
    };
  }

  if (scope === 'pdf') {
    return {
      windowMs: resolvePositiveInt(process.env.ABUSE_PDF_RATE_LIMIT_WINDOW_MS, 60_000),
      max: resolvePositiveInt(process.env.ABUSE_PDF_RATE_LIMIT_MAX, 30),
      code: 'PDF_RATE_LIMITED',
      message: 'PDF indirme limiti asildi. Lutfen kisa bir sure bekleyin.'
    };
  }

  return {
    windowMs: resolvePositiveInt(process.env.ABUSE_REMINDER_RATE_LIMIT_WINDOW_MS, 60_000),
    max: resolvePositiveInt(process.env.ABUSE_REMINDER_RATE_LIMIT_MAX, 40),
    code: 'REMINDER_RATE_LIMITED',
    message: 'Hatirlatma islemleri icin cok fazla istek gonderdiniz. Lutfen sonra tekrar deneyin.'
  };
}

function cleanupExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function classifyScope(req) {
  const method = req.method.toUpperCase();
  const path = req.path || '';

  if (path.includes('/reminders')) {
    return { scope: 'reminder', ...getScopePolicy('reminder') };
  }

  if (method === 'GET' && path.endsWith('/pdf')) {
    return { scope: 'pdf', ...getScopePolicy('pdf') };
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return { scope: 'write', ...getScopePolicy('write') };
  }

  return null;
}

function buildBucketKey(req, scope) {
  const userId = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`;
  return `${scope}:${userId}`;
}

export function abuseRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const config = classifyScope(req);
  if (!config) {
    next();
    return;
  }

  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    cleanupExpired(now);
  }

  const key = buildBucketKey(req, config.scope);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    next();
    return;
  }

  existing.count += 1;
  if (existing.count > config.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    sendError(res, 429, config.code, config.message);
    return;
  }

  next();
}

export function resetAbuseRateLimitForTests() {
  buckets.clear();
}
