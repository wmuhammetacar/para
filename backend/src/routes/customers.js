import { Router } from 'express';
import { all, get, run, withDbTransaction } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, businessRule, notFound } from '../utils/httpErrors.js';
import { normalizeListLimit, normalizeListPage, normalizeListQuery, normalizeWithMeta } from '../utils/listValidation.js';
import { assertPlanLimit } from '../utils/plans.js';

const router = Router();

router.use(authenticate);
router.use(abuseRateLimit);

const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 30;
const MAX_EMAIL_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+().\-\s]*$/;

function parseCustomerInput(body = {}) {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    address: typeof body.address === 'string' ? body.address.trim() : ''
  };
}

function validateCustomerInput({ name, phone, email, address }) {
  if (!name) {
    throw badRequest('Musteri adi zorunludur.', [{ field: 'name', rule: 'required' }]);
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw badRequest(`Musteri adi en fazla ${MAX_NAME_LENGTH} karakter olabilir.`, [
      { field: 'name', rule: 'maxLength', max: MAX_NAME_LENGTH }
    ]);
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    throw badRequest(`Telefon en fazla ${MAX_PHONE_LENGTH} karakter olabilir.`, [
      { field: 'phone', rule: 'maxLength', max: MAX_PHONE_LENGTH }
    ]);
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    throw badRequest('Telefon formati gecersiz.', [{ field: 'phone', rule: 'format' }]);
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    throw badRequest(`E-posta en fazla ${MAX_EMAIL_LENGTH} karakter olabilir.`, [
      { field: 'email', rule: 'maxLength', max: MAX_EMAIL_LENGTH }
    ]);
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw badRequest('E-posta formati gecersiz.', [{ field: 'email', rule: 'format' }]);
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    throw badRequest(`Adres en fazla ${MAX_ADDRESS_LENGTH} karakter olabilir.`, [
      { field: 'address', rule: 'maxLength', max: MAX_ADDRESS_LENGTH }
    ]);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const query = normalizeListQuery(req.query.q);
    const limit = normalizeListLimit(req.query.limit);
    const page = normalizeListPage(req.query.page);
    const withMeta = normalizeWithMeta(req.query.withMeta);
    const offset = (page - 1) * limit;
    const shouldUseWindow = Boolean(query) || req.query.limit !== undefined || req.query.page !== undefined || withMeta;

    const whereParts = ['user_id = ?'];
    const params = [req.user.id];

    if (query) {
      const searchValue = `%${query.toLowerCase()}%`;
      whereParts.push('(LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(email) LIKE ? OR LOWER(address) LIKE ?)');
      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    const rows = await all(
      `
      SELECT id, name, phone, email, address, created_at
      FROM customers
      WHERE ${whereParts.join(' AND ')}
      ORDER BY id DESC
      ${shouldUseWindow ? 'LIMIT ? OFFSET ?' : ''}
      `,
      shouldUseWindow ? [...params, limit, offset] : params
    );

    if (!withMeta) {
      res.json(rows);
      return;
    }

    const countRow = await get(
      `
      SELECT COUNT(*) AS total
      FROM customers
      WHERE ${whereParts.join(' AND ')}
      `,
      params
    );

    const total = Number(countRow?.total) || 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, email, address } = parseCustomerInput(req.body);
    validateCustomerInput({ name, phone, email, address });

    const created = await withDbTransaction(async () => {
      await assertPlanLimit(req.user.id, 'customer_create');

      const result = await run(
        `
        INSERT INTO customers (user_id, name, phone, email, address)
        VALUES (?, ?, ?, ?, ?)
        `,
        [req.user.id, name, phone, email, address]
      );

      return get(
        `
        SELECT id, name, phone, email, address, created_at
        FROM customers
        WHERE id = ? AND user_id = ?
        `,
        [result.id, req.user.id]
      );
    });

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'CUSTOMER_CREATED',
      resourceType: 'customer',
      resourceId: String(created.id),
      metadata: {
        name: created.name,
        email: created.email || null
      }
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, email, address } = parseCustomerInput(req.body);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz musteri id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    validateCustomerInput({ name, phone, email, address });

    const result = await run(
      `
      UPDATE customers
      SET name = ?, phone = ?, email = ?, address = ?
      WHERE id = ? AND user_id = ?
      `,
      [name, phone, email, address, id, req.user.id]
    );

    if (!result.changes) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    const updated = await get(
      `
      SELECT id, name, phone, email, address, created_at
      FROM customers
      WHERE id = ? AND user_id = ?
      `,
      [id, req.user.id]
    );

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'CUSTOMER_UPDATED',
      resourceType: 'customer',
      resourceId: String(id),
      metadata: {
        name: updated?.name || null,
        email: updated?.email || null
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz musteri id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const result = await run('DELETE FROM customers WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (!result.changes) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'CUSTOMER_DELETED',
      resourceType: 'customer',
      resourceId: String(id)
    });

    res.status(204).send();
  } catch (error) {
    if (error?.message?.includes('FOREIGN KEY')) {
      next(businessRule('Bu musteriye bagli teklif/fatura oldugu icin silinemez.'));
      return;
    }

    next(error);
  }
});

export default router;
