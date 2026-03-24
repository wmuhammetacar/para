const state = {
  startedAt: Date.now(),
  totalRequests: 0,
  total4xx: 0,
  total5xx: 0,
  authRateLimited: 0,
  latencySamplesMs: [],
  endpointMetrics: new Map()
};

const MAX_LATENCY_SAMPLES = 5000;
const MAX_ENDPOINTS = 120;
const MAX_ENDPOINT_LATENCY_SAMPLES = 400;
const MAX_ENDPOINTS_IN_SNAPSHOT = 10;

function isMetricsPath(path) {
  return path === '/health' || path === '/health/metrics';
}

function pushBoundedSample(list, value, maxSize) {
  list.push(value);
  if (list.length > maxSize) {
    list.shift();
  }
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function avg(values) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function normalizePathForMetrics(path) {
  if (!path) {
    return 'unknown';
  }

  return path
    .replace(/[a-f0-9]{24,}/gi, ':id')
    .replace(/\b\d+\b/g, ':id');
}

function endpointKey(req) {
  return `${req.method} ${normalizePathForMetrics(req.path)}`;
}

function ensureEndpointBucket(key) {
  if (!state.endpointMetrics.has(key)) {
    if (state.endpointMetrics.size >= MAX_ENDPOINTS) {
      const oldestKey = state.endpointMetrics.keys().next().value;
      if (oldestKey) {
        state.endpointMetrics.delete(oldestKey);
      }
    }

    state.endpointMetrics.set(key, {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      total4xx: 0,
      total5xx: 0,
      samplesMs: []
    });
  }

  return state.endpointMetrics.get(key);
}

function uptimeSeconds() {
  return Number(((Date.now() - state.startedAt) / 1000).toFixed(2));
}

function requestsPerMinute() {
  const uptime = uptimeSeconds();
  if (uptime <= 0) {
    return 0;
  }

  return Number(((state.totalRequests / uptime) * 60).toFixed(2));
}

export function metricsMiddleware(req, res, next) {
  const startNs = process.hrtime.bigint();

  if (!isMetricsPath(req.path)) {
    state.totalRequests += 1;
  }

  res.on('finish', () => {
    if (isMetricsPath(req.path)) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    const normalizedDuration = Number(durationMs.toFixed(2));
    pushBoundedSample(state.latencySamplesMs, normalizedDuration, MAX_LATENCY_SAMPLES);

    const key = endpointKey(req);
    const bucket = ensureEndpointBucket(key);
    bucket.count += 1;
    bucket.totalMs += normalizedDuration;
    bucket.maxMs = Math.max(bucket.maxMs, normalizedDuration);
    pushBoundedSample(bucket.samplesMs, normalizedDuration, MAX_ENDPOINT_LATENCY_SAMPLES);

    if (res.statusCode >= 500) {
      state.total5xx += 1;
      bucket.total5xx += 1;
      return;
    }

    if (res.statusCode >= 400) {
      state.total4xx += 1;
      bucket.total4xx += 1;
      if (res.statusCode === 429 && req.path.startsWith('/api/auth')) {
        state.authRateLimited += 1;
      }
    }
  });

  next();
}

export function getMetricsSnapshot() {
  const globalMax = state.latencySamplesMs.length ? Math.max(...state.latencySamplesMs) : 0;
  const latencyMs = {
    avg: avg(state.latencySamplesMs),
    p50: percentile(state.latencySamplesMs, 50),
    p95: percentile(state.latencySamplesMs, 95),
    p99: percentile(state.latencySamplesMs, 99),
    max: Number(globalMax.toFixed(2)),
    sampleSize: state.latencySamplesMs.length
  };

  const topEndpoints = [...state.endpointMetrics.entries()]
    .map(([key, bucket]) => ({
      endpoint: key,
      count: bucket.count,
      avgMs: bucket.count > 0 ? Number((bucket.totalMs / bucket.count).toFixed(2)) : 0,
      p95Ms: percentile(bucket.samplesMs, 95),
      maxMs: Number(bucket.maxMs.toFixed(2)),
      total4xx: bucket.total4xx,
      total5xx: bucket.total5xx,
      errorRate: bucket.count > 0 ? Number((((bucket.total4xx + bucket.total5xx) / bucket.count) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ENDPOINTS_IN_SNAPSHOT);

  return {
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSeconds: uptimeSeconds(),
    totalRequests: state.totalRequests,
    requestsPerMinute: requestsPerMinute(),
    total4xx: state.total4xx,
    total5xx: state.total5xx,
    authRateLimited: state.authRateLimited,
    latencyMs,
    topEndpoints
  };
}

export function resetMetricsForTests() {
  state.startedAt = Date.now();
  state.totalRequests = 0;
  state.total4xx = 0;
  state.total5xx = 0;
  state.authRateLimited = 0;
  state.latencySamplesMs = [];
  state.endpointMetrics = new Map();
}
