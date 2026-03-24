import request from 'supertest';
import app from '../src/app.js';
import { resetAbuseRateLimitForTests } from '../src/middleware/abuseRateLimit.js';
import { registerAndLogin } from './helpers/auth.js';

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('Abuse rate limit middleware', () => {
  const envKeys = [
    'NODE_ENV',
    'ABUSE_WRITE_RATE_LIMIT_WINDOW_MS',
    'ABUSE_WRITE_RATE_LIMIT_MAX',
    'ABUSE_PDF_RATE_LIMIT_WINDOW_MS',
    'ABUSE_PDF_RATE_LIMIT_MAX'
  ];

  test('limits excessive write operations per user', async () => {
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

    try {
      process.env.NODE_ENV = 'production';
      process.env.ABUSE_WRITE_RATE_LIMIT_WINDOW_MS = '60000';
      process.env.ABUSE_WRITE_RATE_LIMIT_MAX = '1';
      resetAbuseRateLimitForTests();

      const { token } = await registerAndLogin();

      const first = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Rate Limit Musteri 1',
          phone: '+90 555 000 0000',
          email: 'rate1@test.com',
          address: 'Istanbul'
        });

      expect(first.statusCode).toBe(201);

      const second = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Rate Limit Musteri 2',
          phone: '+90 555 000 0001',
          email: 'rate2@test.com',
          address: 'Ankara'
        });

      expect(second.statusCode).toBe(429);
      expect(second.body.success).toBe(false);
      expect(second.body.error.code).toBe('WRITE_RATE_LIMITED');
      expect(second.headers['retry-after']).toBeDefined();
    } finally {
      restoreEnv(previousEnv);
      resetAbuseRateLimitForTests();
    }
  });

  test('limits repeated PDF export requests per user', async () => {
    const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

    try {
      process.env.NODE_ENV = 'production';
      process.env.ABUSE_WRITE_RATE_LIMIT_WINDOW_MS = '60000';
      process.env.ABUSE_WRITE_RATE_LIMIT_MAX = '20';
      process.env.ABUSE_PDF_RATE_LIMIT_WINDOW_MS = '60000';
      process.env.ABUSE_PDF_RATE_LIMIT_MAX = '1';
      resetAbuseRateLimitForTests();

      const { token } = await registerAndLogin();

      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Pdf Limit Musteri',
          phone: '+90 555 000 0100',
          email: 'pdf-limit@test.com',
          address: 'Izmir'
        });

      expect(customer.statusCode).toBe(201);

      const quote = await request(app)
        .post('/api/quotes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerId: customer.body.id,
          date: '2026-03-24',
          items: [{ name: 'PDF Limit Kalemi', quantity: 1, unitPrice: 1000 }]
        });

      expect(quote.statusCode).toBe(201);

      const firstPdf = await request(app)
        .get(`/api/quotes/${quote.body.id}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(firstPdf.statusCode).toBe(200);

      const secondPdf = await request(app)
        .get(`/api/quotes/${quote.body.id}/pdf`)
        .set('Authorization', `Bearer ${token}`);

      expect(secondPdf.statusCode).toBe(429);
      expect(secondPdf.body.success).toBe(false);
      expect(secondPdf.body.error.code).toBe('PDF_RATE_LIMITED');
      expect(secondPdf.headers['retry-after']).toBeDefined();
    } finally {
      restoreEnv(previousEnv);
      resetAbuseRateLimitForTests();
    }
  });
});
