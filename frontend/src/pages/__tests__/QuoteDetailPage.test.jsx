import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import QuoteDetailPage from '../QuoteDetailPage';

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

describe('QuoteDetailPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    downloadPdfMock.mockReset();

    apiRequestMock.mockImplementation((path) => {
      if (path === '/quotes/12') {
        return Promise.resolve({
          id: 12,
          quote_number: 'TKL-2026-12',
          date: '2026-03-23',
          total: 3000,
          customer_name: 'Acar Insaat',
          customer_phone: '+90 555 111 22 33',
          customer_email: 'info@acar.com',
          customer_address: 'Istanbul',
          items: [{ id: 1, name: 'Web Tasarim', quantity: 1, unit_price: 3000, total: 3000 }]
        });
      }

      return Promise.resolve(null);
    });
  });

  test('renders quote detail and exports pdf', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/quotes/12']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('TKL-2026-12')).toBeInTheDocument();
    expect(screen.getByText('Web Tasarim')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'PDF Indir' }));

    await waitFor(() => {
      expect(downloadPdfMock).toHaveBeenCalledWith('/quotes/12/pdf', 'test-token', 'TKL-2026-12.pdf');
    });
  });
});
