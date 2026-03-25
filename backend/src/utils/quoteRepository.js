import { all, get, run } from '../db.js';
import { conflict } from './httpErrors.js';

function buildQuoteListWhereClause(userId, query = '') {
  const whereParts = ['q.user_id = ?'];
  const params = [userId];

  if (query) {
    const searchValue = `%${query.toLowerCase()}%`;
    whereParts.push('(LOWER(q.quote_number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(q.date) LIKE ?)');
    params.push(searchValue, searchValue, searchValue);
  }

  return {
    whereSql: whereParts.join(' AND '),
    params
  };
}

export async function findCustomer(userId, customerId) {
  return get('SELECT id, name, phone, email, address FROM customers WHERE id = ? AND user_id = ?', [
    customerId,
    userId
  ]);
}

export async function getQuoteSummary(userId, quoteId) {
  return get(
    `
    SELECT id, quote_number
    FROM quotes
    WHERE id = ? AND user_id = ?
    `,
    [quoteId, userId]
  );
}

export async function getQuoteWithItems(userId, quoteId) {
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

export async function assertUniqueQuoteNumber(userId, quoteNumber, excludeId = null) {
  if (!quoteNumber) {
    return;
  }

  const duplicate = await get(
    `
    SELECT id
    FROM quotes
    WHERE user_id = ? AND quote_number = ? AND (? IS NULL OR id <> ?)
    LIMIT 1
    `,
    [userId, quoteNumber, excludeId, excludeId]
  );

  if (duplicate) {
    throw conflict('Bu teklif numarasi zaten kullanimda.');
  }
}

export async function listQuotes(userId, options = {}) {
  const { query = '', limit = 20, offset = 0, useWindow = false } = options;
  const { whereSql, params } = buildQuoteListWhereClause(userId, query);

  return all(
    `
    SELECT
      q.id,
      q.quote_number,
      q.date,
      q.total,
      c.name AS customer_name
    FROM quotes q
    JOIN customers c ON c.id = q.customer_id
    WHERE ${whereSql}
    ORDER BY q.id DESC
    ${useWindow ? 'LIMIT ? OFFSET ?' : ''}
    `,
    useWindow ? [...params, limit, offset] : params
  );
}

export async function countQuotes(userId, options = {}) {
  const { query = '' } = options;
  const { whereSql, params } = buildQuoteListWhereClause(userId, query);

  const row = await get(
    `
    SELECT COUNT(*) AS total
    FROM quotes q
    JOIN customers c ON c.id = q.customer_id
    WHERE ${whereSql}
    `,
    params
  );

  return Number(row?.total) || 0;
}

export async function insertQuote(userId, payload) {
  const { customerId, quoteNumber, date, total } = payload;

  const result = await run(
    `
    INSERT INTO quotes (user_id, customer_id, quote_number, date, total)
    VALUES (?, ?, ?, ?, ?)
    `,
    [userId, customerId, quoteNumber, date, total]
  );

  return result.id;
}

export async function updateQuoteHeader(userId, quoteId, payload) {
  const { customerId, quoteNumber, date, total } = payload;

  await run(
    `
    UPDATE quotes
    SET customer_id = ?, quote_number = ?, date = ?, total = ?
    WHERE id = ? AND user_id = ?
    `,
    [customerId, quoteNumber, date, total, quoteId, userId]
  );
}

export async function deleteQuoteItems(userId, quoteId) {
  await run('DELETE FROM items WHERE quote_id = ? AND user_id = ?', [quoteId, userId]);
}

export async function insertQuoteItems(userId, quoteId, items) {
  for (const item of items) {
    await run(
      `
      INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
      `,
      [userId, quoteId, item.name, item.quantity, item.unitPrice, item.total]
    );
  }
}

export async function deleteQuote(userId, quoteId) {
  await run('DELETE FROM quotes WHERE id = ? AND user_id = ?', [quoteId, userId]);
}
