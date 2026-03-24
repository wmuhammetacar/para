import request from 'supertest';
import app from '../src/app.js';
import { run } from '../src/db.js';

describe('Auth API', () => {
  test('registers a user and returns token', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'owner@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe('owner@test.com');
  });

  test('returns standardized validation error for invalid register payload', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'invalid-email',
      password: 'Strong123'
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Gecerli bir e-posta girin.');
  });

  test('returns validation error for weak password', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'weak-password@test.com',
      password: '1234567',
      companyName: 'Firma Test'
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('en az 8');
  });

  test('returns conflict when email already exists', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'owner@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    const response = await request(app).post('/api/auth/register').send({
      email: 'owner@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    expect(response.statusCode).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  test('returns auth error on invalid login', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'owner@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'owner@test.com',
      password: 'wrong-pass'
    });

    expect(response.statusCode).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('AUTH_FAILED');
  });

  test('locks account after repeated failed login attempts', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'lock-user@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    for (let index = 0; index < 4; index += 1) {
      const response = await request(app).post('/api/auth/login').send({
        email: 'lock-user@test.com',
        password: 'wrong-pass'
      });

      expect(response.statusCode).toBe(401);
      expect(response.body.error.code).toBe('AUTH_FAILED');
    }

    const lockResponse = await request(app).post('/api/auth/login').send({
      email: 'lock-user@test.com',
      password: 'wrong-pass'
    });

    expect(lockResponse.statusCode).toBe(423);
    expect(lockResponse.body.success).toBe(false);
    expect(lockResponse.body.error.code).toBe('AUTH_LOCKED');

    const blockedResponse = await request(app).post('/api/auth/login').send({
      email: 'lock-user@test.com',
      password: 'Strong123'
    });

    expect(blockedResponse.statusCode).toBe(423);
    expect(blockedResponse.body.success).toBe(false);
    expect(blockedResponse.body.error.code).toBe('AUTH_LOCKED');
  });

  test('allows login after lock period ends', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'unlock-user@test.com',
      password: 'Strong123',
      companyName: 'Firma Test'
    });

    for (let index = 0; index < 5; index += 1) {
      await request(app).post('/api/auth/login').send({
        email: 'unlock-user@test.com',
        password: 'wrong-pass'
      });
    }

    await run('UPDATE users SET locked_until = ?, failed_login_attempts = 0 WHERE email = ?', [
      '2020-01-01T00:00:00.000Z',
      'unlock-user@test.com'
    ]);

    const loginResponse = await request(app).post('/api/auth/login').send({
      email: 'unlock-user@test.com',
      password: 'Strong123'
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.body.success).not.toBe(false);
    expect(loginResponse.body.token).toBeTruthy();
  });
});
