import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InvoicesPage from '../InvoicesPage';

const authState = {
  token: 'test-token'
};

const apiRequestMock = vi.fn();
const downloadPdfMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../../api', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  downloadPdf: (...args) => downloadPdfMock(...args),
  formatCurrency: (value) => `${value}`,
  formatDate: (value) => value
}));

describe('InvoicesPage', () => {
  let invoicesData = [];
  let invoiceDetails = {};
  let reminderHistory = {};
  let reminderOpsData = {};
  let quotesData = [];
  let customersData = [];

  beforeEach(() => {
    invoicesData = [];
    invoiceDetails = {
      9: {
        id: 9,
        customer_id: 1,
        date: '2026-03-22',
        due_date: '2026-03-29',
        payment_status: 'pending',
        items: [{ id: 1, name: 'Eski Hizmet', quantity: 1, unit_price: 1800, total: 1800 }]
      }
    };
    reminderHistory = {};
    reminderOpsData = {
      policy: {
        maxRetryCount: 3,
        retryBackoffMinutes: [5, 15, 30]
      },
      summary: {
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        failedLast24h: 0,
        scheduledRetries: 0,
        oldestQueuedMinutes: null,
        whatsapp: 0,
        email: 0,
        failedRate: 0
      },
      filteredCount: 0,
      errorBreakdown: [],
      jobs: []
    };
    quotesData = [{ id: 7, quote_number: 'TKL-7', customer_name: 'Acar Insaat' }];
    customersData = [{ id: 1, name: 'Acar Insaat' }];

    apiRequestMock.mockReset();
    downloadPdfMock.mockReset();

    apiRequestMock.mockImplementation((path, options = {}) => {
      const method = options.method || 'GET';

      if (path.startsWith('/invoices/reminders/ops') && method === 'GET') {
        const params = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : new URLSearchParams();
        const status = params.get('status') || 'all';
        const sourceJobs = Array.isArray(reminderOpsData.jobs) ? reminderOpsData.jobs : [];
        const filteredJobs = status === 'all' ? sourceJobs : sourceJobs.filter((job) => job.status === status);

        const summary = sourceJobs.reduce(
          (acc, job) => {
            const statusKey = job.status || 'queued';
            const channelKey = job.channel || 'email';
            const retryCount = Number(job.retry_count) || 0;

            acc.total += 1;
            if (statusKey === 'queued') {
              acc.queued += 1;
              if (retryCount > 0) {
                acc.scheduledRetries += 1;
              }
            } else if (statusKey === 'sent') {
              acc.sent += 1;
            } else if (statusKey === 'failed') {
              acc.failed += 1;
              acc.failedLast24h += 1;
            }

            if (channelKey === 'whatsapp') {
              acc.whatsapp += 1;
            } else if (channelKey === 'email') {
              acc.email += 1;
            }

            return acc;
          },
          {
            total: 0,
            queued: 0,
            sent: 0,
            failed: 0,
            failedLast24h: 0,
            scheduledRetries: 0,
            oldestQueuedMinutes: null,
            whatsapp: 0,
            email: 0
          }
        );

        const failedRate = summary.total > 0 ? Number(((summary.failed / summary.total) * 100).toFixed(1)) : 0;

        return Promise.resolve({
          policy: reminderOpsData.policy || { maxRetryCount: 3, retryBackoffMinutes: [5, 15, 30] },
          summary: { ...summary, failedRate },
          filteredCount: filteredJobs.length,
          errorBreakdown: reminderOpsData.errorBreakdown || [],
          jobs: filteredJobs
        });
      }

      const retryReminderMatch = path.match(/^\/invoices\/reminders\/(\d+)\/retry$/);
      if (retryReminderMatch && method === 'POST') {
        const reminderId = Number(retryReminderMatch[1]);
        const jobs = Array.isArray(reminderOpsData.jobs) ? reminderOpsData.jobs : [];
        const nextJobs = jobs.map((job) =>
          job.id === reminderId
            ? {
                ...job,
                status: 'sent',
                error_message: null,
                processed_at: '2026-03-23 10:05:00',
                delivery_url: job.channel === 'email' ? 'mailto:test@example.com' : 'https://wa.me/905551112233'
              }
            : job
        );

        reminderOpsData = {
          ...reminderOpsData,
          jobs: nextJobs
        };

        return Promise.resolve(nextJobs.find((job) => job.id === reminderId) || null);
      }

      if (path.startsWith('/invoices') && method === 'GET' && !path.match(/^\/invoices\/\d+$/)) {
        const statusParam = path.includes('?') ? new URLSearchParams(path.split('?')[1]).get('status') : 'all';
        if (!statusParam || statusParam === 'all') {
          return Promise.resolve([...invoicesData]);
        }

        if (statusParam === 'pending') {
          return Promise.resolve(invoicesData.filter((invoice) => (invoice.payment_status || 'pending') === 'pending'));
        }

        if (statusParam === 'paid') {
          return Promise.resolve(invoicesData.filter((invoice) => (invoice.payment_status || 'pending') === 'paid'));
        }

        if (statusParam === 'overdue') {
          return Promise.resolve(
            invoicesData.filter(
              (invoice) => (invoice.payment_status || 'pending') === 'pending' && Number(invoice.is_overdue) === 1
            )
          );
        }

        return Promise.resolve([...invoicesData]);
      }

      if (path === '/quotes' && method === 'GET') {
        return Promise.resolve([...quotesData]);
      }

      if (path === '/customers' && method === 'GET') {
        return Promise.resolve([...customersData]);
      }

      if (path === '/invoices' && method === 'POST') {
        const body = options.body || {};
        const customerName =
          customersData.find((customer) => customer.id === body.customerId)?.name ||
          quotesData.find((quote) => quote.id === body.quoteId)?.customer_name ||
          'Unknown';
        const total = body.items
          ? body.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
          : 2500;
        const created = {
          id: 99,
          invoice_number: 'FTR-99',
          customer_name: customerName,
          date: body.date || '2026-03-22',
          due_date: body.dueDate || body.date || '2026-03-22',
          payment_status: 'pending',
          total
        };
        invoicesData = [created, ...invoicesData];
        return Promise.resolve({ ...created, quote_id: body.quoteId || null });
      }

      const invoiceMatch = path.match(/^\/invoices\/(\d+)$/);
      if (invoiceMatch && method === 'GET') {
        return Promise.resolve(invoiceDetails[Number(invoiceMatch[1])] || null);
      }

      if (invoiceMatch && method === 'PUT') {
        const invoiceId = Number(invoiceMatch[1]);
        const body = options.body || {};
        const total = body.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

        invoiceDetails[invoiceId] = {
          ...invoiceDetails[invoiceId],
          customer_id: body.customerId,
          date: body.date,
          due_date: body.dueDate || body.date,
          items: body.items.map((item, index) => ({
            id: index + 1,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.quantity * item.unitPrice
          }))
        };

        invoicesData = invoicesData.map((invoice) =>
          invoice.id === invoiceId
            ? {
                ...invoice,
                customer_name:
                  customersData.find((customer) => customer.id === body.customerId)?.name ||
                  invoice.customer_name,
                date: body.date,
                due_date: body.dueDate || body.date,
                total
              }
            : invoice
        );
        return Promise.resolve(invoiceDetails[invoiceId]);
      }

      const paymentMatch = path.match(/^\/invoices\/(\d+)\/payment$/);
      if (paymentMatch && method === 'PATCH') {
        const invoiceId = Number(paymentMatch[1]);
        const body = options.body || {};
        const status = body.status || body.paymentStatus || 'pending';
        const paidAt = status === 'paid' ? body.paidAt || '2026-03-23' : null;

        invoicesData = invoicesData.map((invoice) =>
          invoice.id === invoiceId
            ? {
                ...invoice,
                payment_status: status,
                paid_at: paidAt
              }
            : invoice
        );
        invoiceDetails[invoiceId] = {
          ...(invoiceDetails[invoiceId] || {}),
          id: invoiceId,
          payment_status: status,
          paid_at: paidAt
        };

        return Promise.resolve({
          ...(invoiceDetails[invoiceId] || {}),
          id: invoiceId
        });
      }

      const reminderMatch = path.match(/^\/invoices\/(\d+)\/reminders$/);
      if (reminderMatch && method === 'POST') {
        const invoiceId = Number(reminderMatch[1]);
        const body = options.body || {};
        const channel = body.channel || 'email';
        const createdReminder = {
          id: Date.now(),
          invoice_id: invoiceId,
          channel,
          recipient: channel === 'whatsapp' ? '905551112233' : 'info@acar.com',
          status: 'sent',
          delivery_url: channel === 'whatsapp' ? 'https://wa.me/905551112233?text=test' : null,
          created_at: '2026-03-23 10:00:00',
          processed_at: '2026-03-23 10:00:00'
        };

        reminderHistory[invoiceId] = [createdReminder, ...(reminderHistory[invoiceId] || [])];
        return Promise.resolve(createdReminder);
      }

      if (reminderMatch && method === 'GET') {
        const invoiceId = Number(reminderMatch[1]);
        return Promise.resolve(reminderHistory[invoiceId] || []);
      }

      if (invoiceMatch && method === 'DELETE') {
        const invoiceId = Number(invoiceMatch[1]);
        invoicesData = invoicesData.filter((invoice) => invoice.id !== invoiceId);
        delete invoiceDetails[invoiceId];
        return Promise.resolve(null);
      }

      return Promise.resolve([]);
    });
  });

  test('creates invoice from quote', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('TKL-7 - Acar Insaat')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], '7');
    await user.click(screen.getByRole('button', { name: 'Fatura Dosyasina Donustur' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token',
          body: expect.objectContaining({ quoteId: 7 })
        })
      );
    });
  });

  test('shows validation error when quote is not selected for conversion', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    await screen.findByText('TKL-7 - Acar Insaat');
    await user.click(screen.getByRole('button', { name: 'Fatura Dosyasina Donustur' }));

    expect(await screen.findByText('Faturaya cevrilecek teklifi secmelisiniz.')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      '/invoices',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ quoteId: expect.any(Number) }) })
    );
  });

  test('creates manual invoice', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    await screen.findByText('TKL-7 - Acar Insaat');

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], '1');

    const nameInput = screen.getByPlaceholderText('Hizmet kalemi adi');
    const quantityInput = screen.getByPlaceholderText('Miktar');
    const unitPriceInput = screen.getByPlaceholderText('Birim fiyat');

    await user.clear(nameInput);
    await user.type(nameInput, 'Danismanlik');
    await user.clear(quantityInput);
    await user.type(quantityInput, '1');
    await user.clear(unitPriceInput);
    await user.type(unitPriceInput, '3000');

    await user.click(screen.getByRole('button', { name: 'Faturayi Kaydet' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token',
          body: expect.objectContaining({
            customerId: 1,
            items: expect.arrayContaining([
              expect.objectContaining({ name: 'Danismanlik', quantity: 1, unitPrice: 3000 })
            ])
          })
        })
      );
    });
  });

  test('edits and deletes invoice from list actions', async () => {
    invoicesData = [
      {
        id: 9,
        invoice_number: 'FTR-9',
        customer_name: 'Acar Insaat',
        date: '2026-03-22',
        due_date: '2026-03-29',
        payment_status: 'pending',
        total: 1800
      }
    ];

    const user = userEvent.setup();
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    const row = (await screen.findByText('FTR-9')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Duzenle' }));

    await screen.findByRole('button', { name: 'Guncelle' });
    await user.clear(screen.getByPlaceholderText('Hizmet kalemi adi'));
    await user.type(screen.getByPlaceholderText('Hizmet kalemi adi'), 'Guncel Hizmet');
    await user.click(screen.getByRole('button', { name: 'Guncelle' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/9',
        expect.objectContaining({
          method: 'PUT',
          token: 'test-token',
          body: expect.objectContaining({
            customerId: 1,
            items: expect.arrayContaining([expect.objectContaining({ name: 'Guncel Hizmet' })])
          })
        })
      );
    });

    const updatedRow = (await screen.findByText('FTR-9')).closest('tr');
    await user.click(within(updatedRow).getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/9',
        expect.objectContaining({ method: 'DELETE', token: 'test-token' })
      );
    });

    expect(await screen.findByText('Fatura dosyasi silindi.')).toBeInTheDocument();
    confirmMock.mockRestore();
  });

  test('updates payment status from list action', async () => {
    invoicesData = [
      {
        id: 9,
        invoice_number: 'FTR-9',
        customer_name: 'Acar Insaat',
        date: '2026-03-22',
        due_date: '2026-03-29',
        payment_status: 'pending',
        total: 1800
      }
    ];

    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    const row = (await screen.findByText('FTR-9')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Tahsil Edildi' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/9/payment',
        expect.objectContaining({
          method: 'PATCH',
          token: 'test-token',
          body: expect.objectContaining({ status: 'paid' })
        })
      );
    });

    expect(await screen.findByText('Fatura tahsil edildi olarak isaretlendi.')).toBeInTheDocument();
  });

  test('sends whatsapp reminder from invoice list action', async () => {
    invoicesData = [
      {
        id: 9,
        invoice_number: 'FTR-9',
        customer_name: 'Acar Insaat',
        date: '2026-03-22',
        due_date: '2026-03-29',
        payment_status: 'pending',
        total: 1800
      }
    ];

    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    const row = (await screen.findByText('FTR-9')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'WA Hatirlat' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/9/reminders',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token',
          body: expect.objectContaining({ channel: 'whatsapp' })
        })
      );
    });

    expect(openSpy).toHaveBeenCalled();
    expect(await screen.findByText('WhatsApp hatirlatmasi hazirlandi.')).toBeInTheDocument();

    openSpy.mockRestore();
  });

  test('shows reminder ops panel and retries failed reminder', async () => {
    reminderOpsData = {
      jobs: [
        {
          id: 501,
          invoice_id: 9,
          invoice_number: 'FTR-9',
          customer_name: 'Acar Insaat',
          channel: 'email',
          status: 'failed',
          error_message: 'SMTP timeout',
          created_at: '2026-03-23 10:00:00',
          processed_at: '2026-03-23 10:01:00'
        }
      ]
    };

    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <InvoicesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Tahsilat Hatirlatma Akisi')).toBeInTheDocument();
    expect(await screen.findByText('SMTP timeout')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yeniden Dene' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/reminders/501/retry',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token'
        })
      );
    });

    expect(await screen.findByText('Hatirlatma tekrar gonderildi.')).toBeInTheDocument();
  });
});
