import process from 'node:process';
import { performance } from 'node:perf_hooks';

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function summarizeResults(results) {
  if (!results.length) {
    return {
      total: 0,
      ok: 0,
      failed: 0,
      errorRate: 0,
      avgMs: 0,
      p95Ms: 0,
      p99Ms: 0,
      minMs: 0,
      maxMs: 0
    };
  }

  const durations = results.map((entry) => entry.durationMs);
  const ok = results.filter((entry) => entry.ok).length;
  const failed = results.length - ok;
  const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;

  return {
    total: results.length,
    ok,
    failed,
    errorRate: Number(((failed / results.length) * 100).toFixed(2)),
    avgMs: Number(avgMs.toFixed(2)),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    minMs: Number(Math.min(...durations).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2))
  };
}

async function timedFetch(url, options = {}, timeoutMs = 8000) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs
    };
  } catch (error) {
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    return {
      ok: false,
      statusCode: 0,
      durationMs,
      error: error?.message || 'request_failed'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveAuthToken(baseUrl, email, password, timeoutMs) {
  async function requestJson(path, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      return { response, payload };
    } catch (error) {
      throw new Error(`${path} request failed: ${error?.message || 'network error'}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const loginAttempt = await requestJson('/api/auth/login', { email, password });
  if (loginAttempt.response.ok && loginAttempt.payload?.token) {
    return loginAttempt.payload.token;
  }

  if (loginAttempt.response.status === 401 || loginAttempt.response.status === 404) {
    const registerAttempt = await requestJson('/api/auth/register', {
      email,
      password,
      companyName: 'Teklifim Perf Benchmark'
    });

    if (!registerAttempt.response.ok && registerAttempt.response.status !== 409) {
      throw new Error(`Register failed (status: ${registerAttempt.response.status}).`);
    }

    const secondLogin = await requestJson('/api/auth/login', { email, password });
    if (!secondLogin.response.ok || !secondLogin.payload?.token) {
      throw new Error(`Login failed after register (status: ${secondLogin.response.status}).`);
    }

    return secondLogin.payload.token;
  }

  throw new Error(`Login failed (status: ${loginAttempt.response.status}).`);
}

async function runCase(caseConfig, config, token) {
  const total = config.requestsPerEndpoint;
  const concurrency = Math.min(config.concurrency, total);
  let cursor = 0;
  const results = [];

  async function worker() {
    while (true) {
      const next = cursor;
      cursor += 1;
      if (next >= total) {
        return;
      }

      const headers = caseConfig.auth
        ? { Authorization: `Bearer ${token}` }
        : {};

      const result = await timedFetch(
        `${config.baseUrl}${caseConfig.path}`,
        {
          method: 'GET',
          headers
        },
        config.timeoutMs
      );

      results.push(result);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return summarizeResults(results);
}

function printSummaryRow(label, stats) {
  const padded = `${label}`.padEnd(22, ' ');
  console.log(
    `${padded} total=${String(stats.total).padStart(3, ' ')} ok=${String(stats.ok).padStart(3, ' ')} ` +
      `fail=${String(stats.failed).padStart(3, ' ')} err%=${String(stats.errorRate).padStart(6, ' ')} ` +
      `avg=${String(stats.avgMs).padStart(7, ' ')}ms p95=${String(stats.p95Ms).padStart(7, ' ')}ms ` +
      `p99=${String(stats.p99Ms).padStart(7, ' ')}ms max=${String(stats.maxMs).padStart(7, ' ')}ms`
  );
}

async function main() {
  const config = {
    baseUrl: (process.env.PERF_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, ''),
    email: process.env.PERF_EMAIL || 'perf@teklifim.local',
    password: process.env.PERF_PASSWORD || 'Perf12345',
    requestsPerEndpoint: toPositiveInt(process.env.PERF_REQUESTS_PER_ENDPOINT, 40),
    concurrency: toPositiveInt(process.env.PERF_CONCURRENCY, 4),
    timeoutMs: toPositiveInt(process.env.PERF_TIMEOUT_MS, 8000),
    targetP95Ms: toPositiveInt(process.env.PERF_TARGET_P95_MS, 350),
    failOnSlo: toBoolean(process.env.PERF_FAIL_ON_SLO, false)
  };

  const cases = [
    { name: 'Health', path: '/health', auth: false },
    { name: 'Metrics', path: '/health/metrics', auth: false },
    { name: 'Dashboard Stats', path: '/api/dashboard/stats?period=30', auth: true },
    { name: 'Dashboard Activity', path: '/api/dashboard/activity?limit=8', auth: true },
    { name: 'Customers List', path: '/api/customers?withMeta=1&page=1&limit=20', auth: true },
    { name: 'Quotes List', path: '/api/quotes?withMeta=1&page=1&limit=20', auth: true },
    { name: 'Invoices List', path: '/api/invoices?withMeta=1&status=all&page=1&limit=20', auth: true }
  ];

  console.log('\nTeklifim Performance Benchmark');
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(
    `Load: ${config.requestsPerEndpoint} request/endpoint, concurrency ${config.concurrency}, timeout ${config.timeoutMs}ms`
  );
  console.log(`SLO target: p95 <= ${config.targetP95Ms}ms\n`);

  const token = await resolveAuthToken(config.baseUrl, config.email, config.password, config.timeoutMs);

  const summary = [];
  for (const caseConfig of cases) {
    const stats = await runCase(caseConfig, config, token);
    summary.push({ name: caseConfig.name, ...stats });
    printSummaryRow(caseConfig.name, stats);
  }

  const failedSlo = summary.filter((entry) => entry.p95Ms > config.targetP95Ms || entry.errorRate > 0);
  console.log('\nBenchmark completed.');
  if (failedSlo.length) {
    console.log(
      `SLO disi endpoint: ${failedSlo.map((entry) => entry.name).join(', ')}`
    );
  } else {
    console.log('Tum endpointler hedef p95 ve hata oranini karsiladi.');
  }

  if (config.failOnSlo && failedSlo.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Benchmark failed: ${error.message}`);
  process.exitCode = 1;
});
