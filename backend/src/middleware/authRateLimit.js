import { sendError } from '../utils/response.js';
import { consumeRateLimitBucket, resolveRateLimitPolicy } from '../utils/rateLimitStore.js';

function getRateLimitKey(req) {
  return `${req.ip}:${req.path}`;
}

export async function authRateLimit(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const { windowMs, max } = resolveRateLimitPolicy(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    process.env.AUTH_RATE_LIMIT_MAX,
    15 * 60 * 1000,
    20
  );

  try {
    const result = await consumeRateLimitBucket({
      scope: 'auth',
      bucketKey: getRateLimitKey(req),
      windowMs,
      max
    });

    if (result.allowed) {
      next();
      return;
    }

    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    sendError(
      res,
      429,
      'RATE_LIMITED',
      'Cok fazla giris denemesi yaptiniz. Lutfen biraz sonra tekrar deneyin.'
    );
  } catch (error) {
    sendError(res, 503, 'RATE_LIMIT_UNAVAILABLE', 'Gecici olarak istek limiti dogrulanamiyor.');
  }
}

export function resetAuthRateLimitForTests() {
  // No-op: limiter state is persisted in DB and cleaned in test setup.
}
