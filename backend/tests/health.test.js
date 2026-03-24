import request from 'supertest';
import app from '../src/app.js';
import { resetMetricsForTests } from '../src/middleware/metrics.js';

describe('Health and Metrics API', () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  test('returns health payload', async () => {
    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.uptime).toBe('number');
  });

  test('returns metrics payload and counts traffic', async () => {
    await request(app).get('/health');
    await request(app).get('/api/not-found');
    await request(app).get('/api/not-found');

    const response = await request(app).get('/health/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.metrics.totalRequests).toBeGreaterThanOrEqual(1);
    expect(response.body.metrics.total4xx).toBeGreaterThanOrEqual(1);
    expect(response.body.metrics.total5xx).toBe(0);
    expect(response.body.metrics.latencyMs.sampleSize).toBeGreaterThanOrEqual(1);
    expect(response.body.metrics.latencyMs.p95).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(response.body.metrics.topEndpoints)).toBe(true);
    expect(response.body.metrics.topEndpoints.length).toBeGreaterThanOrEqual(1);
    expect(response.body.metrics.topEndpoints[0].endpoint).toMatch(/^GET /);
  });

  test('protects metrics endpoint with internal token outside test mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousMetricsToken = process.env.METRICS_INTERNAL_TOKEN;

    try {
      process.env.NODE_ENV = 'production';
      process.env.METRICS_INTERNAL_TOKEN = 'metrics-test-token';

      const blocked = await request(app).get('/health/metrics');
      expect(blocked.statusCode).toBe(403);
      expect(blocked.body.success).toBe(false);
      expect(blocked.body.error.code).toBe('FORBIDDEN');

      const allowed = await request(app).get('/health/metrics').set('x-metrics-token', 'metrics-test-token');
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body.status).toBe('ok');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousMetricsToken === undefined) {
        delete process.env.METRICS_INTERNAL_TOKEN;
      } else {
        process.env.METRICS_INTERNAL_TOKEN = previousMetricsToken;
      }
    }
  });
});
