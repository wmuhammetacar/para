import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import DashboardPage from '../DashboardPage';

const authState = {
  token: 'test-token'
};

const apiRequestMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../../api', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  formatCurrency: (value) => `${value}`,
  formatDate: (value) => value
}));

function buildStats(period) {
  if (period === 'today') {
    return {
      period: 'today',
      periodLabel: 'Bugun',
      dateFrom: '2026-03-23',
      totalCustomers: 1,
      totalQuotes: 1,
      totalInvoices: 1,
      totalRevenue: 2500,
      pendingReceivable: 2500,
      overdueReceivable: 0,
      pendingInvoiceCount: 1,
      overdueInvoiceCount: 0,
      overdueBuckets: { days0to7: 0, days8to30: 0, days31plus: 0 }
    };
  }

  return {
    period: 'all',
    periodLabel: 'Tum Zamanlar',
    dateFrom: null,
    totalCustomers: 3,
    totalQuotes: 4,
    totalInvoices: 5,
    totalRevenue: 12500,
    pendingReceivable: 4500,
    overdueReceivable: 1200,
    pendingInvoiceCount: 3,
    overdueInvoiceCount: 1,
    overdueBuckets: { days0to7: 400, days8to30: 500, days31plus: 300 }
  };
}

function buildActivity(path) {
  if (path.includes('dateFrom=')) {
    return {
      limit: 8,
      count: 1,
      activities: [
        {
          id: 2,
          eventType: 'INVOICE_PAYMENT_UPDATED',
          resourceType: 'invoice',
          resourceId: '15',
          metadata: { status: 'paid' },
          createdAt: '2026-03-23 10:30:00'
        }
      ]
    };
  }

  return {
    limit: 8,
    count: 1,
    activities: [
      {
        id: 1,
        eventType: 'INVOICE_CREATED',
        resourceType: 'invoice',
        resourceId: '14',
        metadata: { invoiceNumber: 'FTR-20260323-0014' },
        createdAt: '2026-03-23 09:30:00'
      }
    ]
  };
}

function buildGrowth(periodDays) {
  return {
    periodDays,
    dateFrom: '2026-01-01',
    dateTo: '2026-03-24',
    funnel: {
      customers: 3,
      quotes: 4,
      invoices: 3,
      paidInvoices: 2,
      quoteToInvoiceRate: 75,
      invoiceToPaidRate: 66.7
    },
    revenue: {
      issued: 12000,
      collected: 8500,
      openReceivable: 3500,
      overdueReceivable: 1200
    },
    health: {
      score: 71,
      status: 'watch',
      insight: 'Donusum orta seviyede.'
    },
    trend: [
      {
        monthKey: '2026-02',
        label: 'sub 2026',
        issuedRevenue: 5000,
        collectedRevenue: 4000,
        createdInvoices: 2,
        paidInvoices: 1
      },
      {
        monthKey: '2026-03',
        label: 'mar 2026',
        issuedRevenue: 7000,
        collectedRevenue: 4500,
        createdInvoices: 3,
        paidInvoices: 2
      }
    ]
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path) => {
      if (path.startsWith('/dashboard/stats?period=')) {
        const period = path.split('=')[1];
        return Promise.resolve(buildStats(period));
      }

      if (path.startsWith('/dashboard/activity')) {
        return Promise.resolve(buildActivity(path));
      }

      if (path.startsWith('/dashboard/growth?period=')) {
        const periodDays = Number(path.split('=')[1]) || 90;
        return Promise.resolve(buildGrowth(periodDays));
      }

      return Promise.resolve(null);
    });
  });

  test('loads stats and recent activities, then updates by period filter', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    expect(await screen.findByText('Toplam musteri')).toBeInTheDocument();
    expect(screen.getByText('Son hareketler')).toBeInTheDocument();
    expect(screen.getByText('Donusum')).toBeInTheDocument();
    expect(screen.getByText('Fatura Olusturuldu')).toBeInTheDocument();

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/stats?period=all', {
        token: 'test-token'
      });
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/activity?limit=8', {
        token: 'test-token'
      });
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/growth?period=180', {
        token: 'test-token'
      });
    });

    await user.click(screen.getByRole('button', { name: 'Bugun' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/stats?period=today', {
        token: 'test-token'
      });
      expect(
        apiRequestMock.mock.calls.some(
          ([path]) => typeof path === 'string' && path.startsWith('/dashboard/activity?limit=8&dateFrom=')
        )
      ).toBe(true);
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/growth?period=7', {
        token: 'test-token'
      });
    });

    expect(await screen.findByText('Tahsilat Durumu Guncellendi')).toBeInTheDocument();
  });
});
