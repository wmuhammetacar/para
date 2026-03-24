import request from 'supertest';
import app from '../src/app.js';
import { registerAndLogin } from './helpers/auth.js';

async function createCustomer(token, name = 'Izolasyon Musterisi') {
  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name,
      phone: '+90 555 000 00 00',
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      address: 'Istanbul'
    });

  if (response.statusCode !== 201) {
    throw new Error(`Customer create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function createQuote(token, customerId) {
  const response = await request(app)
    .post('/api/quotes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      date: '2026-03-22',
      items: [{ name: 'Izolasyon Teklif', quantity: 1, unitPrice: 1000 }]
    });

  if (response.statusCode !== 201) {
    throw new Error(`Quote create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function createInvoice(token, customerId) {
  const response = await request(app)
    .post('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      date: '2026-03-22',
      items: [{ name: 'Izolasyon Fatura', quantity: 1, unitPrice: 1300 }]
    });

  if (response.statusCode !== 201) {
    throw new Error(`Invoice create failed: ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe('Authorization Isolation', () => {
  test('users only see their own customers', async () => {
    const owner = await registerAndLogin();
    const outsider = await registerAndLogin();

    const ownerCustomer = await createCustomer(owner.token, 'Owner Musteri');

    const ownerListResponse = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${owner.token}`);

    const outsiderListResponse = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(ownerListResponse.statusCode).toBe(200);
    expect(outsiderListResponse.statusCode).toBe(200);

    expect(ownerListResponse.body.some((customer) => customer.id === ownerCustomer.id)).toBe(true);
    expect(outsiderListResponse.body.some((customer) => customer.id === ownerCustomer.id)).toBe(false);
  });

  test('user cannot access/update/delete another users quote', async () => {
    const owner = await registerAndLogin();
    const outsider = await registerAndLogin();

    const ownerCustomer = await createCustomer(owner.token, 'Owner Quote Musteri');
    const ownerQuote = await createQuote(owner.token, ownerCustomer.id);

    const getResponse = await request(app)
      .get(`/api/quotes/${ownerQuote.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    const updateResponse = await request(app)
      .put(`/api/quotes/${ownerQuote.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        customerId: 1,
        date: '2026-03-23',
        items: [{ name: 'Yetkisiz Guncelleme', quantity: 1, unitPrice: 99 }]
      });

    const deleteResponse = await request(app)
      .delete(`/api/quotes/${ownerQuote.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    const pdfResponse = await request(app)
      .get(`/api/quotes/${ownerQuote.id}/pdf`)
      .set('Authorization', `Bearer ${outsider.token}`);

    for (const response of [getResponse, updateResponse, deleteResponse, pdfResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });

  test('user cannot access/update/delete another users invoice', async () => {
    const owner = await registerAndLogin();
    const outsider = await registerAndLogin();

    const ownerCustomer = await createCustomer(owner.token, 'Owner Invoice Musteri');
    const ownerInvoice = await createInvoice(owner.token, ownerCustomer.id);

    const getResponse = await request(app)
      .get(`/api/invoices/${ownerInvoice.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    const updateResponse = await request(app)
      .put(`/api/invoices/${ownerInvoice.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        customerId: 1,
        date: '2026-03-23',
        items: [{ name: 'Yetkisiz Guncelleme', quantity: 1, unitPrice: 99 }]
      });

    const deleteResponse = await request(app)
      .delete(`/api/invoices/${ownerInvoice.id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    const pdfResponse = await request(app)
      .get(`/api/invoices/${ownerInvoice.id}/pdf`)
      .set('Authorization', `Bearer ${outsider.token}`);

    for (const response of [getResponse, updateResponse, deleteResponse, pdfResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });
});
