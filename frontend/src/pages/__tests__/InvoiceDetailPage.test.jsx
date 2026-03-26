import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InvoiceDetailPage from '../InvoiceDetailPage';

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

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    downloadPdfMock.mockReset();

    apiRequestMock.mockImplementation((path, options = {}) => {
      const method = options.method || 'GET';

      if (path === '/invoices/22') {
        return Promise.resolve({
          id: 22,
          invoice_number: 'FTR-2026-22',
          date: '2026-03-23',
          due_date: '2026-03-30',
          payment_status: 'pending',
          total: 4250,
          quote_id: 12,
          customer_name: 'Acar Insaat',
          customer_phone: '+90 555 111 22 33',
          customer_email: 'info@acar.com',
          customer_address: 'Istanbul',
          items: [{ id: 1, name: 'Danismanlik', quantity: 1, unit_price: 4250, total: 4250 }]
        });
      }

      if (path === '/invoices/22/reminders' && method === 'GET') {
        return Promise.resolve([]);
      }

      if (path === '/invoices/22/reminders' && method === 'POST') {
        return Promise.resolve({
          id: 1,
          invoice_id: 22,
          channel: options.body?.channel || 'email',
          recipient: options.body?.channel === 'whatsapp' ? '905551112233' : 'info@acar.com',
          status: 'sent',
          delivery_url:
            options.body?.channel === 'whatsapp' ? 'https://wa.me/905551112233?text=test' : null,
          created_at: '2026-03-23 10:00:00',
          processed_at: '2026-03-23 10:00:00'
        });
      }

      return Promise.resolve(null);
    });
  });

  test('renders invoice detail and exports pdf', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/invoices/22']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('FTR-2026-22')).toBeInTheDocument();
    expect(screen.getByText('Danismanlik')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PDF Indir' }));

    await waitFor(() => {
      expect(downloadPdfMock).toHaveBeenCalledWith('/invoices/22/pdf', 'test-token', 'FTR-2026-22.pdf');
    });
  });

  test('sends whatsapp reminder from detail page', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <MemoryRouter
        initialEntries={['/invoices/22']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('FTR-2026-22')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'WA Hatirlat' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/invoices/22/reminders',
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
});
