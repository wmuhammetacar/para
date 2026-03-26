import { all, get, run } from '../db.js';

function buildCustomerListWhereClause(userId, query = '') {
  const whereParts = ['user_id = ?'];
  const params = [userId];

  if (query) {
    const searchValue = `%${query.toLowerCase()}%`;
    whereParts.push('(LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(email) LIKE ? OR LOWER(address) LIKE ?)');
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  return {
    whereSql: whereParts.join(' AND '),
    params
  };
}

export async function listCustomers(userId, options = {}) {
  const { query = '', limit = 20, offset = 0, useWindow = false } = options;
  const { whereSql, params } = buildCustomerListWhereClause(userId, query);

  return all(
    `
    SELECT id, name, phone, email, address, created_at
    FROM customers
    WHERE ${whereSql}
    ORDER BY id DESC
    ${useWindow ? 'LIMIT ? OFFSET ?' : ''}
    `,
    useWindow ? [...params, limit, offset] : params
  );
}

export async function countCustomers(userId, options = {}) {
  const { query = '' } = options;
  const { whereSql, params } = buildCustomerListWhereClause(userId, query);

  const row = await get(
    `
    SELECT COUNT(*) AS total
    FROM customers
    WHERE ${whereSql}
    `,
    params
  );

  return Number(row?.total) || 0;
}

export async function insertCustomer(userId, customer) {
  const { name, phone, email, address } = customer;
  const result = await run(
    `
    INSERT INTO customers (user_id, name, phone, email, address)
    VALUES (?, ?, ?, ?, ?)
    `,
    [userId, name, phone, email, address]
  );

  return result.id;
}

export async function getCustomerById(userId, customerId) {
  return get(
    `
    SELECT id, name, phone, email, address, created_at
    FROM customers
    WHERE id = ? AND user_id = ?
    `,
    [customerId, userId]
  );
}

export async function updateCustomer(userId, customerId, customer) {
  const { name, phone, email, address } = customer;
  const result = await run(
    `
    UPDATE customers
    SET name = ?, phone = ?, email = ?, address = ?
    WHERE id = ? AND user_id = ?
    `,
    [name, phone, email, address, customerId, userId]
  );

  return result.changes > 0;
}

export async function deleteCustomer(userId, customerId) {
  const result = await run('DELETE FROM customers WHERE id = ? AND user_id = ?', [customerId, userId]);
  return result.changes > 0;
}
