import { get, run } from '../db.js';

let cleanupCounter = 0;

function clampPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeWindowStart(nowMs, windowMs) {
  return Math.floor(nowMs / windowMs) * windowMs;
}

async function maybeCleanupExpiredBuckets(nowMs, windowMs) {
  cleanupCounter += 1;
  if (cleanupCounter % 200 !== 0) {
    return;
  }

  const staleThreshold = nowMs - Math.max(windowMs * 2, 60 * 60 * 1000);
  await run('DELETE FROM rate_limit_counters WHERE window_end < ?', [staleThreshold]);
}

export function resolveRateLimitPolicy(windowValue, maxValue, fallbackWindowMs, fallbackMax) {
  return {
    windowMs: clampPositiveInt(windowValue, fallbackWindowMs),
    max: clampPositiveInt(maxValue, fallbackMax)
  };
}

export async function consumeRateLimitBucket({
  scope,
  bucketKey,
  windowMs,
  max,
  nowMs = Date.now()
}) {
  const safeWindowMs = clampPositiveInt(windowMs, 60_000);
  const safeMax = clampPositiveInt(max, 100);
  const windowStart = normalizeWindowStart(nowMs, safeWindowMs);
  const windowEnd = windowStart + safeWindowMs;

  await maybeCleanupExpiredBuckets(nowMs, safeWindowMs);

  await run(
    `
    INSERT INTO rate_limit_counters (scope, bucket_key, window_start, window_end, request_count)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(scope, bucket_key, window_start)
    DO UPDATE SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
    `,
    [scope, bucketKey, windowStart, windowEnd]
  );

  const row = await get(
    `
    SELECT request_count, window_end
    FROM rate_limit_counters
    WHERE scope = ? AND bucket_key = ? AND window_start = ?
    `,
    [scope, bucketKey, windowStart]
  );

  const used = Number(row?.request_count) || 0;
  const resetAt = Number(row?.window_end) || windowEnd;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - nowMs) / 1000));

  return {
    allowed: used <= safeMax,
    used,
    limit: safeMax,
    remaining: Math.max(0, safeMax - used),
    resetAt,
    retryAfterSeconds
  };
}

export async function resetRateLimitBucketsForTests() {
  await run('DELETE FROM rate_limit_counters');
}
