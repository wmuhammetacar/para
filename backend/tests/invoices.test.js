import request from 'supertest';
import app from '../src/app.js';
import { run } from '../src/db.js';
import { registerAndLogin } from './helpers/auth.js';

async function createCustomer(token) {
  const response = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Delta Ltd',
      phone: '+90 500 000 0000',
      email: 'delta@test.com',
      address: 'Istanbul'
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
      items: [{ name: 'Teklif Kalemi', quantity: 1, unitPrice: 2500 }]
    });

  return response.body;
}

describe('Invoices API', () => {
  test('creates invoice from quote', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);
    const quote = await createQuote(token, customer.id);

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quoteId: quote.id,
        date: '2026-03-22'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.quote_id).toBe(quote.id);
    expect(response.body.total).toBe(2500);
  });

  test('creates manual invoice and exports PDF', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createResponse.statusCode).toBe(201);

    const pdfResponse = await request(app)
      .get(`/api/invoices/${createResponse.body.id}/pdf`)
      .set('Authorization', `Bearer ${token}`);

    expect(pdfResponse.statusCode).toBe(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect(pdfResponse.body.length).toBeGreaterThan(0);
  });

  test('updates and deletes manual invoice successfully', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await request(app)
      .put(`/api/invoices/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-23',
        items: [
          { name: 'Revize Hizmet', quantity: 2, unitPrice: 1500 },
          { name: 'Ek Hizmet', quantity: 1, unitPrice: 750 }
        ]
      });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.total).toBe(3750);
    expect(updateResponse.body.items).toHaveLength(2);

    const deleteResponse = await request(app)
      .delete(`/api/invoices/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteResponse.statusCode).toBe(204);

    const getAfterDeleteResponse = await request(app)
      .get(`/api/invoices/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getAfterDeleteResponse.statusCode).toBe(404);
    expect(getAfterDeleteResponse.body.success).toBe(false);
    expect(getAfterDeleteResponse.body.error.code).toBe('NOT_FOUND');
  });

  test('updates invoice payment status', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.payment_status).toBe('pending');

    const markPaidResponse = await request(app)
      .patch(`/api/invoices/${createResponse.body.id}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'paid', paidAt: '2026-03-23' });

    expect(markPaidResponse.statusCode).toBe(200);
    expect(markPaidResponse.body.payment_status).toBe('paid');
    expect(markPaidResponse.body.paid_at).toBe('2026-03-23');

    const markPendingResponse = await request(app)
      .patch(`/api/invoices/${createResponse.body.id}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' });

    expect(markPendingResponse.statusCode).toBe(200);
    expect(markPendingResponse.body.payment_status).toBe('pending');
    expect(markPendingResponse.body.paid_at).toBeNull();
  });

  test('supports invoice list status filtering and bulk payment update', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const firstInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Hizmet A', quantity: 1, unitPrice: 1000 }]
      });

    const secondInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Hizmet B', quantity: 1, unitPrice: 2000 }]
      });

    expect(firstInvoice.statusCode).toBe(201);
    expect(secondInvoice.statusCode).toBe(201);

    const bulkResponse = await request(app)
      .patch('/api/invoices/payment/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoiceIds: [firstInvoice.body.id, secondInvoice.body.id],
        status: 'paid',
        paidAt: '2026-03-23'
      });

    expect(bulkResponse.statusCode).toBe(200);
    expect(bulkResponse.body.updatedCount).toBe(2);
    expect(bulkResponse.body.status).toBe('paid');

    const paidList = await request(app)
      .get('/api/invoices?status=paid')
      .set('Authorization', `Bearer ${token}`);

    expect(paidList.statusCode).toBe(200);
    expect(Array.isArray(paidList.body)).toBe(true);
    expect(paidList.body.length).toBe(2);
    expect(paidList.body.every((invoice) => invoice.payment_status === 'paid')).toBe(true);

    const pendingList = await request(app)
      .get('/api/invoices?status=pending')
      .set('Authorization', `Bearer ${token}`);

    expect(pendingList.statusCode).toBe(200);
    expect(pendingList.body.length).toBe(0);
  });

  test('supports invoice list search and pagination metadata', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Hizmet A', quantity: 1, unitPrice: 1000 }]
      });

    await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-23',
        dueDate: '2026-03-30',
        items: [{ name: 'Hizmet B', quantity: 1, unitPrice: 1500 }]
      });

    const response = await request(app)
      .get('/api/invoices?withMeta=1&status=pending&q=FTR&limit=1&page=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination.total).toBe(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(1);
  });

  test('creates reminder jobs and returns reminder history', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createInvoice.statusCode).toBe(201);

    const reminderResponse = await request(app)
      .post(`/api/invoices/${createInvoice.body.id}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'whatsapp' });

    expect(reminderResponse.statusCode).toBe(201);
    expect(reminderResponse.body.channel).toBe('whatsapp');
    expect(reminderResponse.body.status).toBe('sent');
    expect(reminderResponse.body.delivery_url).toContain('https://wa.me/');

    const historyResponse = await request(app)
      .get(`/api/invoices/${createInvoice.body.id}/reminders`)
      .set('Authorization', `Bearer ${token}`);

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.body).toHaveLength(1);
    expect(historyResponse.body[0].channel).toBe('whatsapp');
  });

  test('returns reminder operations summary and retries failed reminder', async () => {
    const { token, user } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createInvoice.statusCode).toBe(201);

    const failedReminderInsert = await run(
      `
      INSERT INTO reminder_jobs (
        user_id,
        invoice_id,
        channel,
        recipient,
        message,
        status,
        error_message,
        processed_at
      )
      VALUES (?, ?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP)
      `,
      [
        user.id,
        createInvoice.body.id,
        'email',
        'muhasebe@delta.com',
        'Odeme hatirlatmasi',
        'SMTP timeout'
      ]
    );

    const opsResponse = await request(app)
      .get('/api/invoices/reminders/ops?status=failed&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(opsResponse.statusCode).toBe(200);
    expect(opsResponse.body.policy.maxRetryCount).toBe(3);
    expect(opsResponse.body.summary.failed).toBe(1);
    expect(opsResponse.body.summary.failedLast24h).toBe(1);
    expect(opsResponse.body.filteredCount).toBe(1);
    expect(opsResponse.body.errorBreakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'SMTP timeout', total: 1 })])
    );
    expect(opsResponse.body.jobs).toHaveLength(1);
    expect(opsResponse.body.jobs[0].id).toBe(failedReminderInsert.id);
    expect(opsResponse.body.jobs[0].status).toBe('failed');
    expect(opsResponse.body.jobs[0].retry_count).toBe(0);

    const retryResponse = await request(app)
      .post(`/api/invoices/reminders/${failedReminderInsert.id}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.body.id).toBe(failedReminderInsert.id);
    expect(retryResponse.body.status).toBe('sent');
    expect(retryResponse.body.error_message).toBeNull();
    expect(retryResponse.body.delivery_url).toContain('mailto:');
    expect(retryResponse.body.retry_count).toBe(1);
    expect(retryResponse.body.last_retry_at).toBeTruthy();
  });

  test('rejects retry when reminder is not in failed status', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createInvoice.statusCode).toBe(201);

    const reminderResponse = await request(app)
      .post(`/api/invoices/${createInvoice.body.id}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email' });

    expect(reminderResponse.statusCode).toBe(201);
    expect(reminderResponse.body.status).toBe('sent');

    const retryResponse = await request(app)
      .post(`/api/invoices/reminders/${reminderResponse.body.id}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(retryResponse.statusCode).toBe(400);
    expect(retryResponse.body.success).toBe(false);
    expect(retryResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects retry when reminder retry limit is reached', async () => {
    const { token, user } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createInvoice.statusCode).toBe(201);

    const failedReminderInsert = await run(
      `
      INSERT INTO reminder_jobs (
        user_id,
        invoice_id,
        channel,
        recipient,
        message,
        status,
        error_message,
        retry_count,
        processed_at
      )
      VALUES (?, ?, ?, ?, ?, 'failed', ?, 3, CURRENT_TIMESTAMP)
      `,
      [
        user.id,
        createInvoice.body.id,
        'email',
        'ops@delta.com',
        'Odeme hatirlatmasi',
        'SMTP timeout'
      ]
    );

    const retryResponse = await request(app)
      .post(`/api/invoices/reminders/${failedReminderInsert.id}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(retryResponse.statusCode).toBe(400);
    expect(retryResponse.body.success).toBe(false);
    expect(retryResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects reminder creation for paid invoices', async () => {
    const { token } = await registerAndLogin();
    const customer = await createCustomer(token);

    const createInvoice = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.id,
        date: '2026-03-22',
        dueDate: '2026-03-25',
        paymentStatus: 'paid',
        paidAt: '2026-03-22',
        items: [{ name: 'Aylik Hizmet', quantity: 1, unitPrice: 5000 }]
      });

    expect(createInvoice.statusCode).toBe(201);

    const reminderResponse = await request(app)
      .post(`/api/invoices/${createInvoice.body.id}/reminders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'email' });

    expect(reminderResponse.statusCode).toBe(400);
    expect(reminderResponse.body.success).toBe(false);
    expect(reminderResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns not found when creating invoice from missing quote', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quoteId: 999999,
        date: '2026-03-22'
      });

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
