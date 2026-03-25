import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import QuotesPage from '../QuotesPage';

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

describe('QuotesPage', () => {
  let quotesData = [];
  let quoteDetails = {};
  let customersData = [];

  beforeEach(() => {
    quotesData = [];
    quoteDetails = {
      5: {
        id: 5,
        customer_id: 1,
        date: '2026-03-22',
        items: [{ id: 1, name: 'Eski Kalem', quantity: 1, unit_price: 1000, total: 1000 }]
      }
    };
    customersData = [{ id: 1, name: 'Acar Insaat' }];

    apiRequestMock.mockReset();
    downloadPdfMock.mockReset();

    apiRequestMock.mockImplementation((path, options = {}) => {
      const method = options.method || 'GET';

      if (path.startsWith('/quotes?') && method === 'GET') {
        const params = new URLSearchParams(path.split('?')[1] || '');
        const keyword = (params.get('q') || '').trim().toLowerCase();
        const page = Number(params.get('page')) || 1;
        const limit = Number(params.get('limit')) || 10;

        const filtered = keyword
          ? quotesData.filter((quote) =>
              `${quote.quote_number} ${quote.customer_name} ${quote.date}`.toLowerCase().includes(keyword)
            )
          : [...quotesData];

        const offset = (page - 1) * limit;
        const rows = filtered.slice(offset, offset + limit);
        const totalPages = filtered.length ? Math.ceil(filtered.length / limit) : 0;

        return Promise.resolve({
          data: rows,
          pagination: {
            page,
            limit,
            total: filtered.length,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        });
      }

      if (path === '/quotes' && method === 'GET') {
        return Promise.resolve([...quotesData]);
      }

      if (path === '/customers' && method === 'GET') {
        return Promise.resolve([...customersData]);
      }

      if (path === '/quotes' && method === 'POST') {
        const body = options.body || {};
        const created = {
          id: 11,
          quote_number: 'TKL-11',
          customer_name: customersData.find((customer) => customer.id === body.customerId)?.name || 'Unknown',
          date: body.date,
          total: body.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
        };
        quotesData = [created, ...quotesData];
        return Promise.resolve(created);
      }

      const quoteMatch = path.match(/^\/quotes\/(\d+)$/);
      if (quoteMatch && method === 'GET') {
        const quoteId = Number(quoteMatch[1]);
        return Promise.resolve(quoteDetails[quoteId] || null);
      }

      if (quoteMatch && method === 'PUT') {
        const quoteId = Number(quoteMatch[1]);
        const body = options.body || {};
        const total = body.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

        quoteDetails[quoteId] = {
          ...quoteDetails[quoteId],
          customer_id: body.customerId,
          date: body.date,
          items: body.items.map((item, index) => ({
            id: index + 1,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.quantity * item.unitPrice
          }))
        };

        quotesData = quotesData.map((quote) =>
          quote.id === quoteId
            ? {
                ...quote,
                customer_name:
                  customersData.find((customer) => customer.id === body.customerId)?.name || quote.customer_name,
                date: body.date,
                total
              }
            : quote
        );
        return Promise.resolve(quoteDetails[quoteId]);
      }

      if (quoteMatch && method === 'DELETE') {
        const quoteId = Number(quoteMatch[1]);
        quotesData = quotesData.filter((quote) => quote.id !== quoteId);
        delete quoteDetails[quoteId];
        return Promise.resolve(null);
      }

      return Promise.resolve([]);
    });
  });

  test('creates a quote with selected customer and items', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QuotesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Acar Insaat')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), '1');

    const nameInput = screen.getByPlaceholderText('Hizmet kalemi adi');
    const quantityInput = screen.getByPlaceholderText('Miktar');
    const unitPriceInput = screen.getByPlaceholderText('Birim fiyat');

    await user.clear(nameInput);
    await user.type(nameInput, 'Web Tasarim');
    await user.clear(quantityInput);
    await user.type(quantityInput, '2');
    await user.clear(unitPriceInput);
    await user.type(unitPriceInput, '1500');

    await user.click(screen.getByRole('button', { name: 'Teklifi Kaydet' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/quotes',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token',
          body: expect.objectContaining({
            customerId: 1,
            items: expect.arrayContaining([
              expect.objectContaining({ name: 'Web Tasarim', quantity: 2, unitPrice: 1500 })
            ])
          })
        })
      );
    });
  });

  test('shows validation error when item name is empty', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QuotesPage />
      </MemoryRouter>
    );

    await screen.findByText('Acar Insaat');
    await user.selectOptions(screen.getByRole('combobox'), '1');
    await user.click(screen.getByRole('button', { name: 'Teklifi Kaydet' }));

    expect(await screen.findByText('Tum kalemlerde hizmet kalemi adi zorunludur.')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      '/quotes',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('edits and deletes quote from list actions', async () => {
    quotesData = [
      {
        id: 5,
        quote_number: 'TKL-5',
        customer_name: 'Acar Insaat',
        date: '2026-03-22',
        total: 1000
      }
    ];
    const user = userEvent.setup();
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QuotesPage />
      </MemoryRouter>
    );

    const row = (await screen.findByText('TKL-5')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Duzenle' }));

    await screen.findByRole('button', { name: 'Guncelle' });
    await user.clear(screen.getByPlaceholderText('Hizmet kalemi adi'));
    await user.type(screen.getByPlaceholderText('Hizmet kalemi adi'), 'Guncel Kalem');
    await user.click(screen.getByRole('button', { name: 'Guncelle' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/quotes/5',
        expect.objectContaining({
          method: 'PUT',
          token: 'test-token',
          body: expect.objectContaining({
            customerId: 1,
            items: expect.arrayContaining([expect.objectContaining({ name: 'Guncel Kalem' })])
          })
        })
      );
    });

    const updatedRow = (await screen.findByText('TKL-5')).closest('tr');
    await user.click(within(updatedRow).getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/quotes/5',
        expect.objectContaining({ method: 'DELETE', token: 'test-token' })
      );
    });

    expect(await screen.findByText('Teklif dosyasi silindi.')).toBeInTheDocument();
    confirmMock.mockRestore();
  });
});
