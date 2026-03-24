import request from 'supertest';
import app from '../src/app.js';
import { registerAndLogin } from './helpers/auth.js';

async function createCustomer(token) {
  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Mavi Ajans',
      phone: '+90 500 000 0000',
      email: 'mavi@ajans.com',
      address: 'Konak / Izmir'
    });

  return response.body;
}

async function createQuote(token, customerId) {
  const response = await request(app)
    .post('/api/quotes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      date: '2026-03-22',
      items: [{ name: 'Ilk Kalem', quantity: 1, unitPrice: 1000 }]
    });

  if (response.statusCode !== 201) {
    throw new Error(`Quote create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe('Quotes API', () => {
  test('creates quote and auto-calculates total', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [
          { name: 'Kalem A', quantity: 2, unitPrice: 1500 },
          { name: 'Kalem B', quantity: 1, unitPrice: 2000 }
        ]
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.total).toBe(5000);
    expect(response.body.items).toHaveLength(2);
  });

  test('returns validation error when items invalid', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [{ name: '', quantity: 1, unitPrice: 100 }]
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('updates and deletes quote successfully', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);
    const quote = await createQuote(token, customer.id);

    const updateResponse = await request(app)
      .put(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-23',
        items: [
          { name: 'Revize Kalem A', quantity: 2, unitPrice: 1200 },
          { name: 'Revize Kalem B', quantity: 1, unitPrice: 500 }
        ]
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.total).toBe(2900);
    expect(updateResponse.body.items).toHaveLength(2);

    const deleteResponse = await request(app)
      .delete(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteResponse.statusCode).toBe(204);

    const getAfterDeleteResponse = await request(app)
      .get(`/api/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getAfterDeleteResponse.statusCode).toBe(404);
    expect(getAfterDeleteResponse.body.success).toBe(false);
    expect(getAfterDeleteResponse.body.error.code).toBe('NOT_FOUND');
  });

  test('supports quote list search and pagination metadata', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [{ name: 'Web Tasarim', quantity: 1, unitPrice: 1000 }]
      });

    await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-23',
        items: [{ name: 'Bakim Hizmeti', quantity: 1, unitPrice: 500 }]
      });

    const response = await request(app)
      .get('/api/quotes?withMeta=1&q=TKL&limit=1&page=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination.total).toBe(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(1);
  });

  test('returns validation error for invalid quote id on update', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const response = await request(app)
      .put('/api/quotes/0')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [{ name: 'Kalem', quantity: 1, unitPrice: 100 }]
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects duplicate custom quote number for same user', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const first = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        quoteNumber: 'TKL-SECURE-001',
        date: '2026-03-22',
        items: [{ name: 'Kalem A', quantity: 1, unitPrice: 100 }]
      });

    expect(first.statusCode).toBe(201);

    const second = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        quoteNumber: 'TKL-SECURE-001',
        date: '2026-03-23',
        items: [{ name: 'Kalem B', quantity: 1, unitPrice: 200 }]
      });

    expect(second.statusCode).toBe(409);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe('CONFLICT');
  });
});
