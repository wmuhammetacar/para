import request from 'supertest';
import app from '../../src/app.js';

export async function registerAndLogin(overrides = {}) {
  const timestamp = Date.now();
  const email = overrides.email || `test-${timestamp}@teklifim.local`;
  const password = overrides.password || 'Strong123';
  const companyName = overrides.companyName || 'Test Sirketi';

  const registerResponse = await request(app).post('/api/auth/register').send({
    email,
    password,
    companyName
  });

  if (registerResponse.statusCode !== 201) {
    throw new Error(`Register failed: ${JSON.stringify(registerResponse.body)}`);
  }

  const loginResponse = await request(app).post('/api/auth/login').send({
    email,
    password
  });

  if (loginResponse.statusCode !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(loginResponse.body)}`);
  }

  return {
    token: loginResponse.body.token,
    user: loginResponse.body.user,
    email,
    password
  };
}
