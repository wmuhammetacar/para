import { sendError } from '../utils/response.js';
import { consumeRateLimitBucket } from '../utils/rateLimitStore.js';

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

  consumeRateLimitBucket({
    scope: `abuse:${config.scope}`,
    bucketKey: buildBucketKey(req, config.scope),
    windowMs: config.windowMs,
    max: config.max
  })
    .then((result) => {
      if (result.allowed) {
        next();
        return;
      }

      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      sendError(res, 429, config.code, config.message);
    })
    .catch(() => {
      sendError(res, 503, 'RATE_LIMIT_UNAVAILABLE', 'Gecici olarak istek limiti dogrulanamiyor.');
    });
}

export function resetAbuseRateLimitForTests() {
  // No-op: limiter state is persisted in DB and cleaned in test setup.
}
