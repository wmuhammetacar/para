import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { recordAuditLog } from '../utils/audit.js';
import { buildDocumentNumber, normalizeDate, sanitizeItems } from '../utils/documents.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import { assertPlanLimit } from '../utils/plans.js';
import { writeDocumentPdf } from '../utils/pdf.js';

const router = Router();
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

router.use(authenticate);

async function withTransaction(task) {
  await run('BEGIN');

  try {
    const result = await task();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

async function findCustomer(userId, customerId) {
  return get('SELECT id, name, phone, email, address FROM customers WHERE id = ? AND user_id = ?', [
    customerId,
    userId
  ]);
}

async function getQuoteWithItems(userId, quoteId) {
  const quote = await get(
    `
    SELECT
      q.id,
      q.quote_number,
      q.date,
      q.total,
      q.customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      c.email AS customer_email,
      c.address AS customer_address
    FROM quotes q
    JOIN customers c ON c.id = q.customer_id
    WHERE q.id = ? AND q.user_id = ?
    `,
    [quoteId, userId]
  );

  if (!quote) {
    return null;
  }

  const items = await all(
    `
    SELECT id, name, quantity, unit_price, total
    FROM items
    WHERE quote_id = ?
    ORDER BY id ASC
    `,
    [quoteId]
  );

  return { ...quote, items };
}

function normalizeListLimit(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIST_LIMIT;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw badRequest(`Limit 1 ile ${MAX_LIST_LIMIT} arasinda bir tam sayi olmalidir.`, [
      { field: 'limit', rule: 'range', min: 1, max: MAX_LIST_LIMIT }
    ]);
  }

  return limit;
}

function normalizeListPage(value) {
  if (value === undefined || value === null || value === '') {
    return 1;
  }

  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('Page degeri 1 veya daha buyuk bir tam sayi olmalidir.', [
      { field: 'page', rule: 'min', min: 1 }
    ]);
  }

  return page;
}

function normalizeListQuery(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const query = String(value).trim();
  if (!query) {
    return '';
  }

  if (query.length > 120) {
    throw badRequest('Arama metni en fazla 120 karakter olabilir.', [
      { field: 'q', rule: 'maxLength', max: 120 }
    ]);
  }

  return query;
}

function normalizeWithMeta(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

router.get('/', async (req, res, next) => {
  try {
    const query = normalizeListQuery(req.query.q);
    const limit = normalizeListLimit(req.query.limit);
    const page = normalizeListPage(req.query.page);
    const withMeta = normalizeWithMeta(req.query.withMeta);
    const offset = (page - 1) * limit;
    const shouldUseWindow = Boolean(query) || req.query.limit !== undefined || req.query.page !== undefined || withMeta;

    const whereParts = ['q.user_id = ?'];
    const params = [req.user.id];

    if (query) {
      const searchValue = `%${query.toLowerCase()}%`;
      whereParts.push('(LOWER(q.quote_number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(q.date) LIKE ?)');
      params.push(searchValue, searchValue, searchValue);
    }

    const rows = await all(
      `
      SELECT
        q.id,
        q.quote_number,
        q.date,
        q.total,
        c.name AS customer_name
      FROM quotes q
      JOIN customers c ON c.id = q.customer_id
      WHERE ${whereParts.join(' AND ')}
      ORDER BY q.id DESC
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
      FROM quotes q
      JOIN customers c ON c.id = q.customer_id
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
    await assertPlanLimit(req.user.id, 'quote_create');
    const customerId = Number(req.body.customerId);

    if (!Number.isInteger(customerId) || customerId <= 0) {
      next(badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]));
      return;
    }

    const date = normalizeDate(req.body.date);
    const itemResult = sanitizeItems(req.body.items);

    const customer = await findCustomer(req.user.id, customerId);

    if (!customer) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    const created = await withTransaction(async () => {
      const insertQuote = await run(
        `
        INSERT INTO quotes (user_id, customer_id, quote_number, date, total)
        VALUES (?, ?, ?, ?, ?)
        `,
        [req.user.id, customerId, 'TEMP', date, itemResult.total]
      );

      const quoteNumber =
        typeof req.body.quoteNumber === 'string' && req.body.quoteNumber.trim()
          ? req.body.quoteNumber.trim()
          : buildDocumentNumber('TKL', insertQuote.id, date);

      await run('UPDATE quotes SET quote_number = ? WHERE id = ? AND user_id = ?', [
        quoteNumber,
        insertQuote.id,
        req.user.id
      ]);

      for (const item of itemResult.items) {
        await run(
          `
          INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
          VALUES (?, ?, NULL, ?, ?, ?, ?)
          `,
          [req.user.id, insertQuote.id, item.name, item.quantity, item.unitPrice, item.total]
        );
      }

      return getQuoteWithItems(req.user.id, insertQuote.id);
    });

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'QUOTE_CREATED',
      resourceType: 'quote',
      resourceId: String(created.id),
      metadata: {
        quoteNumber: created.quote_number,
        customerId: created.customer_id,
        total: created.total
      }
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz teklif id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const quote = await getQuoteWithItems(req.user.id, id);

    if (!quote) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    writeDocumentPdf(res, {
      companyName: req.user.companyName || process.env.COMPANY_NAME || 'Teklifim',
      documentType: 'Teklif',
      documentNumber: quote.quote_number,
      date: quote.date,
      customer: {
        name: quote.customer_name,
        phone: quote.customer_phone,
        email: quote.customer_email,
        address: quote.customer_address
      },
      items: quote.items,
      total: quote.total
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz teklif id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const quote = await getQuoteWithItems(req.user.id, id);

    if (!quote) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    res.json(quote);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const customerId = Number(req.body.customerId);

    if (!Number.isInteger(id) || id <= 0) {
      next(badRequest('Gecersiz teklif id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    if (!Number.isInteger(customerId) || customerId <= 0) {
      next(badRequest('Gecerli bir musteri secin.', [{ field: 'customerId', rule: 'integer' }]));
      return;
    }

    const date = normalizeDate(req.body.date);
    const itemResult = sanitizeItems(req.body.items);

    const existing = await get('SELECT id, quote_number FROM quotes WHERE id = ? AND user_id = ?', [
      id,
      req.user.id
    ]);

    if (!existing) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    const customer = await findCustomer(req.user.id, customerId);

    if (!customer) {
      next(notFound('Musteri bulunamadi.'));
      return;
    }

    await withTransaction(async () => {
      const quoteNumber =
        typeof req.body.quoteNumber === 'string' && req.body.quoteNumber.trim()
          ? req.body.quoteNumber.trim()
          : existing.quote_number;

      await run(
        `
        UPDATE quotes
        SET customer_id = ?, quote_number = ?, date = ?, total = ?
        WHERE id = ? AND user_id = ?
        `,
        [customerId, quoteNumber, date, itemResult.total, id, req.user.id]
      );

      await run('DELETE FROM items WHERE quote_id = ? AND user_id = ?', [id, req.user.id]);

      for (const item of itemResult.items) {
        await run(
          `
          INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
          VALUES (?, ?, NULL, ?, ?, ?, ?)
          `,
          [req.user.id, id, item.name, item.quantity, item.unitPrice, item.total]
        );
      }
    });

    const updated = await getQuoteWithItems(req.user.id, id);
    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'QUOTE_UPDATED',
      resourceType: 'quote',
      resourceId: String(id),
      metadata: {
        quoteNumber: updated?.quote_number || null,
        customerId: updated?.customer_id || null,
        total: updated?.total || null
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
      next(badRequest('Gecersiz teklif id.', [{ field: 'id', rule: 'integer' }]));
      return;
    }

    const existing = await get('SELECT id FROM quotes WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (!existing) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    await withTransaction(async () => {
      await run('DELETE FROM items WHERE quote_id = ? AND user_id = ?', [id, req.user.id]);
      await run('DELETE FROM quotes WHERE id = ? AND user_id = ?', [id, req.user.id]);
    });

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'QUOTE_DELETED',
      resourceType: 'quote',
      resourceId: String(id)
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
