import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CustomersPage from '../CustomersPage';

const authState = {
  token: 'test-token'
};

const apiRequestMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../../api', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  formatDate: (value) => value
}));

describe('CustomersPage', () => {
  let customersData = [];

  beforeEach(() => {
    customersData = [
      {
        id: 1,
        name: 'Acar Insaat',
        phone: '+90 555 123 4567',
        email: 'info@acarinsaat.com',
        address: 'Kadikoy / Istanbul',
        created_at: '2026-03-22 10:00:00'
      }
    ];

    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path, options = {}) => {
      const method = options.method || 'GET';

      if (path.startsWith('/customers?') && method === 'GET') {
        const params = new URLSearchParams(path.split('?')[1] || '');
        const keyword = (params.get('q') || '').trim().toLowerCase();
        const page = Number(params.get('page')) || 1;
        const limit = Number(params.get('limit')) || 10;

        const filtered = keyword
          ? customersData.filter((customer) =>
              `${customer.name} ${customer.phone} ${customer.email} ${customer.address}`
                .toLowerCase()
                .includes(keyword)
            )
          : [...customersData];

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

      if (path === '/customers' && method === 'GET') {
        return Promise.resolve([...customersData]);
      }

      if (path === '/customers' && method === 'POST') {
        const created = {
          id: 2,
          ...options.body,
          created_at: '2026-03-23 10:00:00'
        };
        customersData = [created, ...customersData];
        return Promise.resolve(created);
      }

      if (path === '/customers/1' && method === 'PUT') {
        customersData = customersData.map((customer) =>
          customer.id === 1 ? { ...customer, ...options.body } : customer
        );
        return Promise.resolve(customersData.find((customer) => customer.id === 1));
      }

      if (path === '/customers/1' && method === 'DELETE') {
        customersData = customersData.filter((customer) => customer.id !== 1);
        return Promise.resolve(null);
      }

      return Promise.resolve([]);
    });
  });

  test('creates customer successfully', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CustomersPage />
      </MemoryRouter>
    );

    await screen.findByText('Acar Insaat');

    const form = screen.getByRole('button', { name: 'Musteri Ekle' }).closest('form');
    const inputs = within(form).getAllByRole('textbox');

    await user.clear(inputs[0]);
    await user.type(inputs[0], 'Yeni Musteri');
    await user.clear(inputs[1]);
    await user.type(inputs[1], '+90 555 111 22 33');
    await user.clear(inputs[2]);
    await user.type(inputs[2], 'yeni@firma.com');
    await user.clear(inputs[3]);
    await user.type(inputs[3], 'Ankara');
    await user.click(screen.getByRole('button', { name: 'Musteri Ekle' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({
          method: 'POST',
          token: 'test-token',
          body: expect.objectContaining({ name: 'Yeni Musteri' })
        })
      );
    });

    expect(await screen.findByText('Yeni musteri kaydi eklendi.')).toBeInTheDocument();
  });

  test('shows validation error for invalid phone and skips API submit', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CustomersPage />
      </MemoryRouter>
    );

    await screen.findByText('Acar Insaat');

    const form = screen.getByRole('button', { name: 'Musteri Ekle' }).closest('form');
    const inputs = within(form).getAllByRole('textbox');

    await user.clear(inputs[0]);
    await user.type(inputs[0], 'Telefon Test');
    await user.clear(inputs[1]);
    await user.type(inputs[1], 'abc-123');
    await user.click(screen.getByRole('button', { name: 'Musteri Ekle' }));

    expect(await screen.findByText('Telefon formati gecersiz.')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      '/customers',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('edits and deletes customer', async () => {
    const user = userEvent.setup();
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CustomersPage />
      </MemoryRouter>
    );

    const row = (await screen.findByText('Acar Insaat')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Duzenle' }));

    const updateForm = screen.getByRole('button', { name: 'Degisiklikleri Kaydet' }).closest('form');
    const updateInputs = within(updateForm).getAllByRole('textbox');
    await user.clear(updateInputs[0]);
    await user.type(updateInputs[0], 'Acar Insaat Revize');
    await user.click(screen.getByRole('button', { name: 'Degisiklikleri Kaydet' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/customers/1',
        expect.objectContaining({
          method: 'PUT',
          token: 'test-token',
          body: expect.objectContaining({ name: 'Acar Insaat Revize' })
        })
      );
    });

    expect(await screen.findByText('Musteri kaydi guncellendi.')).toBeInTheDocument();

    const updatedRow = (await screen.findByText('Acar Insaat Revize')).closest('tr');
    await user.click(within(updatedRow).getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/customers/1',
        expect.objectContaining({
          method: 'DELETE',
          token: 'test-token'
        })
      );
    });

    expect(await screen.findByText('Musteri kaydi silindi.')).toBeInTheDocument();
    confirmMock.mockRestore();
  });
});
