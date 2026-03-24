import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { all, closeDb, get, initDb, run } from '../src/db.js';
import { buildDocumentNumber } from '../src/utils/documents.js';

async function seed() {
  await initDb();

  const demoEmail = 'demo@teklifim.com';
  const demoPassword = '123456';

  let user = await get('SELECT * FROM users WHERE email = ?', [demoEmail]);

  if (!user) {
    const passwordHash = await bcrypt.hash(demoPassword, 10);
    const result = await run(
      'INSERT INTO users (email, password_hash, company_name) VALUES (?, ?, ?)',
      [demoEmail, passwordHash, 'Teklifim Demo']
    );

    user = await get('SELECT * FROM users WHERE id = ?', [result.id]);
  }

  const existingCustomers = await all('SELECT id FROM customers WHERE user_id = ?', [user.id]);
  const existingQuotes = await all('SELECT id FROM quotes WHERE user_id = ?', [user.id]);
  const existingInvoices = await all('SELECT id FROM invoices WHERE user_id = ?', [user.id]);

  if (existingCustomers.length && existingQuotes.length && existingInvoices.length) {
    // eslint-disable-next-line no-console
    console.log('Seed data zaten var. Demo kullanici: demo@teklifim.com / 123456');
    await closeDb();
    return;
  }

  const customer1 = await run(
    'INSERT INTO customers (user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    [user.id, 'Acar Insaat', '+90 555 123 4567', 'info@acarinsaat.com', 'Kadikoy / Istanbul']
  );

  const customer2 = await run(
    'INSERT INTO customers (user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    [user.id, 'Mavi Ajans', '+90 532 888 1122', 'iletisim@maviajans.com', 'Konak / Izmir']
  );

  const quoteDate = new Date().toISOString().slice(0, 10);
  const quoteItems = [
    { name: 'Web Tasarim Hizmeti', quantity: 1, unitPrice: 12000 },
    { name: 'Bakim Paketi (3 Ay)', quantity: 1, unitPrice: 3500 }
  ];

  const quoteTotal = Number(
    quoteItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0).toFixed(2)
  );

  const quoteInsert = await run(
    'INSERT INTO quotes (user_id, customer_id, quote_number, date, total) VALUES (?, ?, ?, ?, ?)',
    [user.id, customer1.id, 'TEMP', quoteDate, quoteTotal]
  );

  const quoteNumber = buildDocumentNumber('TKL', quoteInsert.id, quoteDate);
  await run('UPDATE quotes SET quote_number = ? WHERE id = ?', [quoteNumber, quoteInsert.id]);

  for (const item of quoteItems) {
    const total = Number((item.quantity * item.unitPrice).toFixed(2));
    await run(
      `
      INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
      VALUES (?, ?, NULL, ?, ?, ?, ?)
      `,
      [user.id, quoteInsert.id, item.name, item.quantity, item.unitPrice, total]
    );
  }

  const invoiceDate = quoteDate;
  const invoiceDueDate = quoteDate;
  const invoiceInsert = await run(
    `
    INSERT INTO invoices (
      user_id,
      customer_id,
      quote_id,
      invoice_number,
      date,
      due_date,
      payment_status,
      paid_at,
      total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [user.id, customer1.id, quoteInsert.id, 'TEMP', invoiceDate, invoiceDueDate, 'paid', invoiceDate, quoteTotal]
  );

  const invoiceNumber = buildDocumentNumber('FTR', invoiceInsert.id, invoiceDate);
  await run('UPDATE invoices SET invoice_number = ? WHERE id = ?', [invoiceNumber, invoiceInsert.id]);

  for (const item of quoteItems) {
    const total = Number((item.quantity * item.unitPrice).toFixed(2));
    await run(
      `
      INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
      `,
      [user.id, invoiceInsert.id, item.name, item.quantity, item.unitPrice, total]
    );
  }

  const secondInvoiceDate = quoteDate;
  const overdueDueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
  const secondInvoiceItems = [
    { name: 'Sosyal Medya Yonetimi', quantity: 1, unitPrice: 4800 },
    { name: 'Reklam Danismanligi', quantity: 1, unitPrice: 3200 }
  ];

  const secondTotal = Number(
    secondInvoiceItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0).toFixed(2)
  );

  const secondInvoiceInsert = await run(
    `
    INSERT INTO invoices (
      user_id,
      customer_id,
      quote_id,
      invoice_number,
      date,
      due_date,
      payment_status,
      paid_at,
      total
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?)
    `,
    [user.id, customer2.id, 'TEMP', secondInvoiceDate, overdueDueDate, 'pending', secondTotal]
  );

  const secondInvoiceNumber = buildDocumentNumber('FTR', secondInvoiceInsert.id, secondInvoiceDate);
  await run('UPDATE invoices SET invoice_number = ? WHERE id = ?', [
    secondInvoiceNumber,
    secondInvoiceInsert.id
  ]);

  for (const item of secondInvoiceItems) {
    const total = Number((item.quantity * item.unitPrice).toFixed(2));
    await run(
      `
      INSERT INTO items (user_id, quote_id, invoice_id, name, quantity, unit_price, total)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
      `,
      [user.id, secondInvoiceInsert.id, item.name, item.quantity, item.unitPrice, total]
    );
  }

  await run(
    `
    INSERT INTO reminder_jobs (user_id, invoice_id, channel, recipient, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      user.id,
      secondInvoiceInsert.id,
      'email',
      'iletisim@maviajans.com',
      `Merhaba Mavi Ajans, ${secondInvoiceNumber} numarali faturamiz icin odeme hatirlatmasi.`,
      'queued'
    ]
  );

  // eslint-disable-next-line no-console
  console.log('Seed tamamlandi. Demo kullanici: demo@teklifim.com / 123456');

  await closeDb();
}

seed().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Seed hatasi:', error);
  await closeDb();
  process.exit(1);
});
