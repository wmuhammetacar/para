import request from 'supertest';
import app from '../src/app.js';
import { get, run } from '../src/db.js';
import { processReminderQueue } from '../src/services/reminderQueue.js';
import { registerAndLogin } from './helpers/auth.js';

describe('Reminder Queue Backoff', () => {
  test('schedules retry with backoff and eventually marks as failed at retry limit', async () => {
    const { token, user } = await registerAndLogin();

    const customerResponse = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Backoff Musteri',
        phone: '+90 555 222 3344',
        email: 'backoff@test.com',
        address: 'Istanbul'
      });

    expect(customerResponse.statusCode).toBe(201);

    const invoiceResponse = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customerResponse.body.id,
        date: '2026-03-23',
        dueDate: '2026-03-30',
        items: [{ name: 'Backoff Hizmet', quantity: 1, unitPrice: 1000 }]
      });

    expect(invoiceResponse.statusCode).toBe(201);

    const reminderInsert = await run(
      `
      INSERT INTO reminder_jobs (
        user_id,
        invoice_id,
        channel,
        recipient,
        message,
        status
      )
      VALUES (?, ?, 'email', ?, ?, 'queued')
      `,
      [user.id, invoiceResponse.body.id, 'gecersiz-email', 'Backoff test']
    );

    const firstRun = await processReminderQueue({ onlyJobId: reminderInsert.id, limit: 1 });
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0].status).toBe('retry_scheduled');
    expect(firstRun[0].retryCount).toBe(1);
    expect(firstRun[0].nextAttemptAt).toBeTruthy();

    let reminder = await get(
      `
      SELECT status, retry_count, error_message, next_attempt_at
      FROM reminder_jobs
      WHERE id = ?
      `,
      [reminderInsert.id]
    );

    expect(reminder.status).toBe('queued');
    expect(reminder.retry_count).toBe(1);
    expect(reminder.error_message).toContain('E-posta alicisi gecersiz');
    expect(reminder.next_attempt_at).toBeTruthy();

    for (let retryStep = 0; retryStep < 2; retryStep += 1) {
      await run('UPDATE reminder_jobs SET next_attempt_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', reminderInsert.id]);
      await processReminderQueue({ onlyJobId: reminderInsert.id, limit: 1 });
    }

    reminder = await get(
      `
      SELECT status, retry_count, next_attempt_at
      FROM reminder_jobs
      WHERE id = ?
      `,
      [reminderInsert.id]
    );

    expect(reminder.status).toBe('queued');
    expect(reminder.retry_count).toBe(3);
    expect(reminder.next_attempt_at).toBeTruthy();

    await run('UPDATE reminder_jobs SET next_attempt_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', reminderInsert.id]);
    const finalRun = await processReminderQueue({ onlyJobId: reminderInsert.id, limit: 1 });
    expect(finalRun).toHaveLength(1);
    expect(finalRun[0].status).toBe('failed');
    expect(finalRun[0].retryCount).toBe(3);

    reminder = await get(
      `
      SELECT status, retry_count, next_attempt_at
      FROM reminder_jobs
      WHERE id = ?
      `,
      [reminderInsert.id]
    );

    expect(reminder.status).toBe('failed');
    expect(reminder.retry_count).toBe(3);
    expect(reminder.next_attempt_at).toBeNull();
  });
});
