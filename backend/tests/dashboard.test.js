import request from 'supertest';
import app from '../src/app.js';
import { registerAndLogin } from './helpers/auth.js';

async function createCustomer(token, name = 'Musteri Test', overrides = {}) {
  const payload = {
    name,
    phone: '+90 555 111 2233',
    email: 'musteri@test.local',
    address: 'Istanbul',
    ...overrides
  };
  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  if (response.statusCode !== 201) {
    throw new Error(`Customer create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function createQuote(token, customerId, date, unitPrice) {
  const response = await request(app)
    .post('/api/quotes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      date,
      items: [{ name: 'Hizmet', quantity: 1, unitPrice }]
    });

  if (response.statusCode !== 201) {
    throw new Error(`Quote create failed: ${JSON.stringify(response.body)}`);
  }
}

async function createInvoice(token, customerId, date, unitPrice) {
  const response = await request(app)
    .post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      date,
      items: [{ name: 'Hizmet', quantity: 1, unitPrice }]
    });

  if (response.statusCode !== 201) {
    throw new Error(`Invoice create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function markInvoicePaid(token, invoiceId, paidAt) {
  const response = await request(app)
    .patch(`/api/invoices/${invoiceId}/payment`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      status: 'paid',
      paidAt
    });

  if (response.statusCode !== 200) {
    throw new Error(`Invoice payment update failed: ${JSON.stringify(response.body)}`);
  }
}

describe('Dashboard API', () => {
  test('returns filtered stats by selected period', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token, 'Donem Musterisi');

    await createQuote(token, customer.id, '2024-01-01', 1000);
    await createInvoice(token, customer.id, '2024-01-01', 1000);

    const today = new Date().toISOString().slice(0, 10);
    await createQuote(token, customer.id, today, 2000);
    await createInvoice(token, customer.id, today, 2000);

    const allResponse = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);

    const todayResponse = await request(app)
      .get('/api/dashboard/stats?period=today')
      .set('Authorization', `Bearer ${token}`);

    expect(allResponse.statusCode).toBe(200);
    expect(todayResponse.statusCode).toBe(200);

    expect(allResponse.body.period).toBe('all');
    expect(todayResponse.body.period).toBe('today');

    expect(allResponse.body.totalQuotes).toBe(2);
    expect(todayResponse.body.totalQuotes).toBe(1);
    expect(allResponse.body.totalInvoices).toBe(2);
    expect(todayResponse.body.totalInvoices).toBe(1);
    expect(allResponse.body.totalRevenue).toBe(3000);
    expect(todayResponse.body.totalRevenue).toBe(2000);
    expect(allResponse.body.pendingReceivable).toBe(3000);
    expect(todayResponse.body.pendingReceivable).toBe(2000);
    expect(allResponse.body.overdueReceivable).toBe(1000);
    expect(todayResponse.body.overdueReceivable).toBe(0);
  });

  test('returns validation error for unsupported period', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/dashboard/stats?period=invalid')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns recent audit activities with limit', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token, 'Aktivite Musterisi');
    await createQuote(token, customer.id, new Date().toISOString().slice(0, 10), 1800);

    const response = await request(app)
      .get('/api/dashboard/activity?limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.limit).toBe(5);
    expect(Array.isArray(response.body.activities)).toBe(true);
    expect(response.body.activities.length).toBeGreaterThan(0);

    const eventTypes = response.body.activities.map((item) => item.eventType);
    expect(eventTypes).toContain('QUOTE_CREATED');
    expect(eventTypes).toContain('CUSTOMER_CREATED');
  });

  test('returns validation error for invalid activity limit', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/dashboard/activity?limit=999')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('filters activities by date range', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .get('/api/dashboard/activity?dateFrom=2099-01-01')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.count).toBe(0);
    expect(response.body.activities).toHaveLength(0);
  });

  test('returns onboarding activation progress and next step', async () => {
    const { token } = await registerAndLogin();

    const initial = await request(app)
      .get('/api/dashboard/activation')
      .set('Authorization', `Bearer ${token}`);

    expect(initial.statusCode).toBe(200);
    expect(initial.body.completedSteps).toBe(0);
    expect(initial.body.totalSteps).toBe(4);
    expect(initial.body.remainingSteps).toBe(4);
    expect(initial.body.completionPercent).toBe(0);
    expect(initial.body.isCompleted).toBe(false);
    expect(initial.body.nextStep?.key).toBe('customer');
    expect(initial.body.estimatedMinutesLeft).toBeGreaterThan(0);
    expect(initial.body.quickWins).toHaveLength(2);

    const customer = await createCustomer(token, 'Onboarding Musteri', {
      email: 'onboarding@test.local',
      phone: '+90 555 444 5566'
    });
    await createQuote(token, customer.id, new Date().toISOString().slice(0, 10), 1500);
    const invoice = await createInvoice(token, customer.id, new Date().toISOString().slice(0, 10), 1500);

    const reminderResponse = await request(app)
      .post(`/api/invoices/${invoice.id}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email' });

    expect(reminderResponse.statusCode).toBe(201);
    expect(reminderResponse.body.status).toBe('sent');

    const final = await request(app)
      .get('/api/dashboard/activation')
      .set('Authorization', `Bearer ${token}`);

    expect(final.statusCode).toBe(200);
    expect(final.body.completedSteps).toBe(4);
    expect(final.body.remainingSteps).toBe(0);
    expect(final.body.completionPercent).toBe(100);
    expect(final.body.isCompleted).toBe(true);
    expect(final.body.estimatedMinutesLeft).toBe(0);
    expect(final.body.quickWins).toHaveLength(0);
    expect(final.body.nextStep).toBeNull();
  });

  test('returns growth analytics for selected period', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token, 'Growth Musterisi', {
      email: 'growth@test.local',
      phone: '+90 555 777 7788'
    });

    const today = new Date().toISOString().slice(0, 10);

    await createQuote(token, customer.id, today, 1000);
    const paidInvoice = await createInvoice(token, customer.id, today, 1000);
    await markInvoicePaid(token, paidInvoice.id, today);

    await createQuote(token, customer.id, today, 2000);
    await createInvoice(token, customer.id, today, 2000);

    await createQuote(token, customer.id, '2024-01-01', 5000);
    await createInvoice(token, customer.id, '2024-01-01', 5000);

    const response = await request(app)
      .get('/api/dashboard/growth?period=30')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.periodDays).toBe(30);
    expect(response.body.funnel.customers).toBe(1);
    expect(response.body.funnel.quotes).toBe(2);
    expect(response.body.funnel.invoices).toBe(2);
    expect(response.body.funnel.paidInvoices).toBe(1);
    expect(response.body.funnel.quoteToInvoiceRate).toBe(100);
    expect(response.body.funnel.invoiceToPaidRate).toBe(50);
    expect(response.body.revenue.issued).toBe(3000);
    expect(response.body.revenue.collected).toBe(1000);
    expect(Array.isArray(response.body.trend)).toBe(true);
    expect(response.body.trend).toHaveLength(6);
    expect(response.body.health.score).toBeGreaterThanOrEqual(0);
  });

  test('returns plan snapshot and supports plan upgrade', async () => {
    const { token } = await registerAndLogin();

    const currentPlanResponse = await request(app)
      .get('/api/dashboard/plan')
      .set('Authorization', `Bearer ${token}`);

    expect(currentPlanResponse.statusCode).toBe(200);
    expect(currentPlanResponse.body.currentPlan.code).toBe('starter');
    expect(currentPlanResponse.body.usage.customers.limit).toBe(50);
    expect(Array.isArray(currentPlanResponse.body.availablePlans)).toBe(true);

    const patchResponse = await request(app)
      .patch('/api/dashboard/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'standard' });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.body.currentPlan.code).toBe('standard');
    expect(patchResponse.body.usage.customers.limit).toBe(250);
  });
});
