import bcrypt from 'bcryptjs';
import { get, run } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, conflict, locked, notFound, unauthorized } from '../utils/httpErrors.js';
import { signToken } from '../utils/jwt.js';
import { getDefaultPlanCode, normalizePlanCode } from '../utils/plans.js';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const LOGIN_MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_LOGIN_MAX_FAILED_ATTEMPTS) || 5;
const LOGIN_LOCK_MINUTES = Number(process.env.AUTH_LOGIN_LOCK_MINUTES) || 15;

function validatePasswordStrength(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: 'too_short' };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'missing_lowercase' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'missing_uppercase' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'missing_digit' };
  }

  return { valid: true };
}

function isUserTemporarilyLocked(user) {
  if (!user?.locked_until) {
    return false;
  }

  const lockedUntilDate = new Date(user.locked_until);
  if (Number.isNaN(lockedUntilDate.getTime())) {
    return false;
  }

  return lockedUntilDate.getTime() > Date.now();
}

function calculateLockUntilIso() {
  const lockUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
  return lockUntil.toISOString();
}

export async function registerWorkflow({ req, body }) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const companyName = typeof body.companyName === 'string' && body.companyName.trim()
    ? body.companyName.trim()
    : 'Teklifim';
  const requestedPlanCode = normalizePlanCode(body.planCode);
  const planCode = requestedPlanCode || getDefaultPlanCode();

  if (!email || !email.includes('@')) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
      resourceType: 'user',
      metadata: { email, reason: 'invalid_email' }
    });
    throw badRequest('Gecerli bir e-posta girin.', [{ field: 'email', rule: 'email' }]);
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
      resourceType: 'user',
      metadata: { email, reason: passwordValidation.reason }
    });
    throw badRequest(
      `Sifre en az ${PASSWORD_MIN_LENGTH}, en fazla ${PASSWORD_MAX_LENGTH} karakter olmali ve en az bir buyuk harf, bir kucuk harf, bir rakam icermelidir.`,
      [
        { field: 'password', rule: 'minLength', min: PASSWORD_MIN_LENGTH },
        { field: 'password', rule: 'maxLength', max: PASSWORD_MAX_LENGTH },
        { field: 'password', rule: 'pattern', value: 'lower+upper+digit' }
      ]
    );
  }

  if (companyName.length > 120) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
      resourceType: 'user',
      metadata: { email, reason: 'company_name_too_long' }
    });
    throw badRequest('Sirket adi en fazla 120 karakter olabilir.', [
      { field: 'companyName', rule: 'maxLength', max: 120 }
    ]);
  }

  const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_REGISTER_CONFLICT',
      userId: existing.id,
      resourceType: 'user',
      resourceId: String(existing.id),
      metadata: { email }
    });
    throw conflict('Bu e-posta zaten kayitli.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await run(
    'INSERT INTO users (email, password_hash, company_name, plan_code) VALUES (?, ?, ?, ?)',
    [email, passwordHash, companyName, planCode]
  );

  const user = {
    id: result.id,
    email,
    company_name: companyName,
    plan_code: planCode
  };

  await recordAuditLog({
    req,
    userId: user.id,
    eventType: 'AUTH_REGISTER_SUCCESS',
    resourceType: 'user',
    resourceId: String(user.id),
    metadata: { email: user.email, companyName }
  });

  return {
    token: signToken(user),
    user: {
      id: user.id,
      email: user.email,
      companyName: user.company_name,
      planCode: user.plan_code
    }
  };
}

export async function loginWorkflow({ req, body }) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_LOGIN_VALIDATION_FAILED',
      resourceType: 'user',
      metadata: { email, reason: 'missing_credentials' }
    });
    throw badRequest('E-posta ve sifre zorunludur.', [
      { field: 'email', rule: 'required' },
      { field: 'password', rule: 'required' }
    ]);
  }

  const user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    await recordAuditLog({
      req,
      eventType: 'AUTH_LOGIN_FAILED',
      resourceType: 'user',
      metadata: { email, reason: 'user_not_found' }
    });
    throw unauthorized('Gecersiz giris bilgileri.', 'AUTH_FAILED');
  }

  if (isUserTemporarilyLocked(user)) {
    await recordAuditLog({
      req,
      userId: user.id,
      eventType: 'AUTH_LOGIN_BLOCKED_LOCKED',
      resourceType: 'user',
      resourceId: String(user.id),
      metadata: { email, lockedUntil: user.locked_until }
    });
    throw locked(
      `Hesap gecici olarak kilitlendi. Lutfen ${LOGIN_LOCK_MINUTES} dakika sonra tekrar deneyin.`,
      'AUTH_LOCKED'
    );
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const failedAttempts = (Number(user.failed_login_attempts) || 0) + 1;

    if (failedAttempts >= LOGIN_MAX_FAILED_ATTEMPTS) {
      const lockedUntil = calculateLockUntilIso();
      await run('UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?', [lockedUntil, user.id]);
      await recordAuditLog({
        req,
        userId: user.id,
        eventType: 'AUTH_ACCOUNT_LOCKED',
        resourceType: 'user',
        resourceId: String(user.id),
        metadata: {
          email,
          failedAttempts,
          maxFailedAttempts: LOGIN_MAX_FAILED_ATTEMPTS,
          lockedUntil
        }
      });

      throw locked(
        `Cok fazla hatali giris denemesi. Hesap ${LOGIN_LOCK_MINUTES} dakika boyunca kilitlendi.`,
        'AUTH_LOCKED'
      );
    }

    await run('UPDATE users SET failed_login_attempts = ?, locked_until = NULL WHERE id = ?', [failedAttempts, user.id]);
    await recordAuditLog({
      req,
      userId: user.id,
      eventType: 'AUTH_LOGIN_FAILED',
      resourceType: 'user',
      resourceId: String(user.id),
      metadata: { email, reason: 'invalid_password', failedAttempts }
    });

    throw unauthorized('Gecersiz giris bilgileri.', 'AUTH_FAILED');
  }

  if ((Number(user.failed_login_attempts) || 0) > 0 || user.locked_until) {
    await run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  }

  await recordAuditLog({
    req,
    userId: user.id,
    eventType: 'AUTH_LOGIN_SUCCESS',
    resourceType: 'user',
    resourceId: String(user.id),
    metadata: { email: user.email }
  });

  return {
    token: signToken(user),
    user: {
      id: user.id,
      email: user.email,
      companyName: user.company_name,
      planCode: user.plan_code || getDefaultPlanCode()
    }
  };
}

export async function getAuthMeWorkflow(userId) {
  const user = await get('SELECT id, email, company_name, plan_code FROM users WHERE id = ?', [userId]);

  if (!user) {
    throw notFound('Kullanici bulunamadi.');
  }

  return {
    id: user.id,
    email: user.email,
    companyName: user.company_name,
    planCode: user.plan_code || getDefaultPlanCode()
  };
}
