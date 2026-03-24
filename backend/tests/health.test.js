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
});
