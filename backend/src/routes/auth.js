import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authRateLimit } from '../middleware/authRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { get, run } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, conflict, locked, notFound, unauthorized } from '../utils/httpErrors.js';
import { signToken } from '../utils/jwt.js';
import { getDefaultPlanCode, normalizePlanCode } from '../utils/plans.js';

const router = Router();

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

router.post('/register', authRateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const companyName = typeof req.body.companyName === 'string' && req.body.companyName.trim()
      ? req.body.companyName.trim()
      : 'Teklifim';
    const requestedPlanCode = normalizePlanCode(req.body.planCode);
    const planCode = requestedPlanCode || getDefaultPlanCode();

    if (!email || !email.includes('@')) {
      await recordAuditLog({
        req,
        eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
        resourceType: 'user',
        metadata: { email, reason: 'invalid_email' }
      });
      next(badRequest('Gecerli bir e-posta girin.', [{ field: 'email', rule: 'email' }]));
      return;
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      await recordAuditLog({
        req,
        eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
        resourceType: 'user',
        metadata: { email, reason: passwordValidation.reason }
      });
      next(
        badRequest(
          `Sifre en az ${PASSWORD_MIN_LENGTH}, en fazla ${PASSWORD_MAX_LENGTH} karakter olmali ve en az bir buyuk harf, bir kucuk harf, bir rakam icermelidir.`,
          [
            { field: 'password', rule: 'minLength', min: PASSWORD_MIN_LENGTH },
            { field: 'password', rule: 'maxLength', max: PASSWORD_MAX_LENGTH },
            { field: 'password', rule: 'pattern', value: 'lower+upper+digit' }
          ]
        )
      );
      return;
    }

    if (companyName.length > 120) {
      await recordAuditLog({
        req,
        eventType: 'AUTH_REGISTER_VALIDATION_FAILED',
        resourceType: 'user',
        metadata: { email, reason: 'company_name_too_long' }
      });
      next(
        badRequest('Sirket adi en fazla 120 karakter olabilir.', [
          { field: 'companyName', rule: 'maxLength', max: 120 }
        ])
      );
      return;
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
      next(conflict('Bu e-posta zaten kayitli.'));
      return;
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

    const token = signToken(user);
    await recordAuditLog({
      req,
      userId: user.id,
      eventType: 'AUTH_REGISTER_SUCCESS',
      resourceType: 'user',
      resourceId: String(user.id),
      metadata: { email: user.email, companyName }
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.company_name,
        planCode: user.plan_code
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      await recordAuditLog({
        req,
        eventType: 'AUTH_LOGIN_VALIDATION_FAILED',
        resourceType: 'user',
        metadata: { email, reason: 'missing_credentials' }
      });
      next(
        badRequest('E-posta ve sifre zorunludur.', [
          { field: 'email', rule: 'required' },
          { field: 'password', rule: 'required' }
        ])
      );
      return;
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      await recordAuditLog({
        req,
        eventType: 'AUTH_LOGIN_FAILED',
        resourceType: 'user',
        metadata: { email, reason: 'user_not_found' }
      });
      next(unauthorized('Gecersiz giris bilgileri.', 'AUTH_FAILED'));
      return;
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
      next(
        locked(
          `Hesap gecici olarak kilitlendi. Lutfen ${LOGIN_LOCK_MINUTES} dakika sonra tekrar deneyin.`,
          'AUTH_LOCKED'
        )
      );
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      const failedAttempts = (Number(user.failed_login_attempts) || 0) + 1;

      if (failedAttempts >= LOGIN_MAX_FAILED_ATTEMPTS) {
        const lockedUntil = calculateLockUntilIso();
        await run('UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?', [
          lockedUntil,
          user.id
        ]);
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
        next(
          locked(
            `Cok fazla hatali giris denemesi. Hesap ${LOGIN_LOCK_MINUTES} dakika boyunca kilitlendi.`,
            'AUTH_LOCKED'
          )
        );
        return;
      }

      await run('UPDATE users SET failed_login_attempts = ?, locked_until = NULL WHERE id = ?', [
        failedAttempts,
        user.id
      ]);
      await recordAuditLog({
        req,
        userId: user.id,
        eventType: 'AUTH_LOGIN_FAILED',
        resourceType: 'user',
        resourceId: String(user.id),
        metadata: { email, reason: 'invalid_password', failedAttempts }
      });
      next(unauthorized('Gecersiz giris bilgileri.', 'AUTH_FAILED'));
      return;
    }

    if ((Number(user.failed_login_attempts) || 0) > 0 || user.locked_until) {
      await run('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    }

    const token = signToken(user);
    await recordAuditLog({
      req,
      userId: user.id,
      eventType: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: String(user.id),
      metadata: { email: user.email }
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.company_name,
        planCode: user.plan_code || getDefaultPlanCode()
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await get('SELECT id, email, company_name, plan_code FROM users WHERE id = ?', [req.user.id]);

    if (!user) {
      next(notFound('Kullanici bulunamadi.'));
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      companyName: user.company_name,
      planCode: user.plan_code || getDefaultPlanCode()
    });
  } catch (error) {
    next(error);
  }
});

export default router;
