import request from 'supertest';
import app from '../src/app.js';
import { all } from '../src/db.js';
import { registerAndLogin } from './helpers/auth.js';

describe('Audit Logs', () => {
  test('records auth success and failure events', async () => {
    const email = `audit-${Date.now()}@teklifim.local`;
    const password = 'Strong123';

    const registerResponse = await request(app).post('/api/auth/register').send({
      email,
      password,
      companyName: 'Audit Sirketi'
    });

    expect(registerResponse.statusCode).toBe(201);
    expect(registerResponse.body.user?.id).toBeDefined();

    const failedLoginResponse = await request(app).post('/api/auth/login').send({
      email,
      password: 'wrong-password'
    });

    expect(failedLoginResponse.statusCode).toBe(401);

    const successLoginResponse = await request(app).post('/api/auth/login').send({
      email,
      password
    });

    expect(successLoginResponse.statusCode).toBe(200);

    const logs = await all(
      `
      SELECT event_type
      FROM audit_logs
      ORDER BY id ASC
      `
    );

    const eventTypes = logs.map((log) => log.event_type);
    expect(eventTypes).toContain('AUTH_REGISTER_SUCCESS');
    expect(eventTypes).toContain('AUTH_LOGIN_FAILED');
    expect(eventTypes).toContain('AUTH_LOGIN_SUCCESS');
  });

  test('records invoice operation events', async () => {
    const { token, user } = await registerAndLogin();

    const createCustomerResponse = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Audit Musteri',
        phone: '+90 555 000 0000',
        email: 'audit.musteri@test.com',
        address: 'Istanbul'
      });

    expect(createCustomerResponse.statusCode).toBe(201);

    const createQuoteResponse = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: createCustomerResponse.body.id,
        date: '2026-03-23',
        items: [{ name: 'Audit Kalemi', quantity: 1, unitPrice: 1000 }]
      });

    expect(createQuoteResponse.statusCode).toBe(201);

    const createInvoiceResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quoteId: createQuoteResponse.body.id,
        date: '2026-03-23'
      });

    expect(createInvoiceResponse.statusCode).toBe(201);

    const reminderResponse = await request(app)
      .post(`/api/invoices/${createInvoiceResponse.body.id}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email' });

    expect(reminderResponse.statusCode).toBe(201);

    const paymentResponse = await request(app)
      .patch(`/api/invoices/${createInvoiceResponse.body.id}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid', paidAt: '2026-03-24' });

    expect(paymentResponse.statusCode).toBe(200);

    const logs = await all(
      `
      SELECT event_type
      FROM audit_logs
      WHERE user_id = ?
      ORDER BY id ASC
      `,
      [user.id]
    );

    const eventTypes = logs.map((log) => log.event_type);

    expect(eventTypes).toContain('CUSTOMER_CREATED');
    expect(eventTypes).toContain('QUOTE_CREATED');
    expect(eventTypes).toContain('INVOICE_CREATED');
    expect(eventTypes).toContain('INVOICE_REMINDER_CREATED');
    expect(eventTypes).toContain('INVOICE_PAYMENT_UPDATED');
  });

  test('records account lock events after failed logins', async () => {
    const email = `lock-audit-${Date.now()}@teklifim.local`;
    const password = 'Strong123';

    const registerResponse = await request(app).post('/api/auth/register').send({
      email,
      password,
      companyName: 'Audit Lock'
    });

    expect(registerResponse.statusCode).toBe(201);

    for (let index = 0; index < 5; index += 1) {
      await request(app).post('/api/auth/login').send({
        email,
        password: 'wrong-password'
      });
    }

    const logs = await all(
      `
      SELECT event_type
      FROM audit_logs
      ORDER BY id ASC
      `
    );

    const eventTypes = logs.map((log) => log.event_type);
    expect(eventTypes).toContain('AUTH_ACCOUNT_LOCKED');
  });
});
