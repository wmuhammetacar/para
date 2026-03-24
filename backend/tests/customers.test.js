import request from 'supertest';
import app from '../src/app.js';
import { registerAndLogin } from './helpers/auth.js';

describe('Customers API', () => {
  test('rejects unauthenticated request with standardized error', async () => {
    const response = await request(app).get('/api/customers');

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  test('creates and lists customers', async () => {
    const { token } = await registerAndLogin();

    const createResponse = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Acar Insaat',
        phone: '+90 555 123 4567',
        email: 'info@acarinsaat.com',
        address: 'Kadikoy / Istanbul'
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.name).toBe('Acar Insaat');

    const listResponse = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(listResponse.statusCode).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body).toHaveLength(1);
  });

  test('supports customer list search and pagination metadata', async () => {
    const { token } = await registerAndLogin();

    await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Acar Insaat',
        phone: '+90 555 123 4567',
        email: 'info@acarinsaat.com',
        address: 'Kadikoy / Istanbul'
      });

    await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mavi Ajans',
        phone: '+90 532 888 1122',
        email: 'iletisim@maviajans.com',
        address: 'Konak / Izmir'
      });

    const response = await request(app)
      .get('/api/customers?withMeta=1&q=acar&limit=1&page=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Acar Insaat');
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.pagination.page).toBe(1);
  });

  test('returns validation error when name is missing', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '',
        phone: '',
        email: '',
        address: ''
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns validation error when email format is invalid', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Acar Insaat',
        phone: '+90 555 123 4567',
        email: 'invalid-email',
        address: 'Kadikoy / Istanbul'
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email', rule: 'format' })])
    );
  });

  test('returns validation error when phone format is invalid', async () => {
    const { token } = await registerAndLogin();

    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Acar Insaat',
        phone: 'abc-555',
        email: 'info@acarinsaat.com',
        address: 'Kadikoy / Istanbul'
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'phone', rule: 'format' })])
    );
  });
});
