import { get, run } from '../src/db.js';

describe('DB integrity guards', () => {
  test('blocks cross-tenant quote insert with foreign customer id', async () => {
    const ownerUser = await run(
      'INSERT INTO users (email, password_hash, company_name, plan_code) VALUES (?, ?, ?, ?)',
      ['owner-db-scope@test.com', 'hash', 'Owner Co', 'starter']
    );

    const outsiderUser = await run(
      'INSERT INTO users (email, password_hash, company_name, plan_code) VALUES (?, ?, ?, ?)',
      ['outsider-db-scope@test.com', 'hash', 'Outsider Co', 'starter']
    );

    const ownerCustomer = await run(
      'INSERT INTO customers (user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [ownerUser.id, 'Owner Customer', '+90 555 111 1111', 'owner.customer@test.com', 'Istanbul']
    );

    await expect(
      run(
        'INSERT INTO quotes (user_id, customer_id, quote_number, date, total) VALUES (?, ?, ?, ?, ?)',
        [outsiderUser.id, ownerCustomer.id, 'TKL-DB-SCOPE-1', '2026-03-24', 1000]
      )
    ).rejects.toThrow('TENANT_SCOPE_VIOLATION');
  });

  test('blocks item insert when line total does not match quantity x unit price', async () => {
    const user = await run(
      'INSERT INTO users (email, password_hash, company_name, plan_code) VALUES (?, ?, ?, ?)',
      ['money-guard@test.com', 'hash', 'Money Co', 'starter']
    );

    const customer = await run(
      'INSERT INTO customers (user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'Money Customer', '+90 555 222 2222', 'money.customer@test.com', 'Ankara']
    );

    const quote = await run(
      'INSERT INTO quotes (user_id, customer_id, quote_number, date, total) VALUES (?, ?, ?, ?, ?)',
      [user.id, customer.id, 'TKL-MONEY-1', '2026-03-24', 1000]
    );

    await expect(
      run(
        'INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total) VALUES (?, ?, NULL, ?, ?, ?, ?)',
        [user.id, quote.id, 'Kalem 1', 2, 100, 50]
      )
    ).rejects.toThrow('INVALID_MONETARY_VALUE');

    const rows = await get('SELECT COUNT(*) AS total FROM items WHERE quote_id = ?', [quote.id]);
    expect(Number(rows.total)).toBe(0);
  });
});
