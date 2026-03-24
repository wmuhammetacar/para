import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import GrowthPage from '../GrowthPage';

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

function buildGrowth(periodDays = 90, cohortMonths = 6) {
  return {
    periodDays,
    cohortMonths,
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
    comparison: {
      previousPeriod: {
        dateFrom: '2025-10-03',
        dateTo: '2025-12-31',
        issued: 10000,
        collected: 7000
      },
      issuedGrowthRate: 20,
      collectedGrowthRate: 21.4
    },
    velocity: {
      quoteToInvoiceAvgDays: 1.2,
      invoiceToPaidAvgDays: 5.1
    },
    health: {
      score: 71,
      status: 'watch',
      insight: 'Donusum orta seviyede.'
    },
    retention: [
      {
        cohortMonth: '2026-02',
        cohortLabel: 'sub 2026',
        cohortSize: 2,
        totalRevenue: 5000,
        points: [
          { monthOffset: 0, retentionRate: 100 },
          { monthOffset: 1, retentionRate: 50 }
        ]
      }
    ]
  };
}

describe('GrowthPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path) => {
      if (typeof path === 'string' && path.startsWith('/dashboard/growth?period=')) {
        const query = new URLSearchParams(path.split('?')[1]);
        const period = Number(query.get('period')) || 90;
        const cohortMonths = Number(query.get('cohortMonths')) || 6;
        return Promise.resolve(buildGrowth(period, cohortMonths));
      }

      return Promise.resolve(null);
    });
  });

  test('loads growth metrics and updates filters', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GrowthPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Growth Analitigi')).toBeInTheDocument();
    expect(await screen.findByText('Cohort Retention')).toBeInTheDocument();

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/growth?period=90&cohortMonths=6', {
        token: 'test-token'
      });
    });

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], '30');

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/growth?period=30&cohortMonths=6', {
        token: 'test-token'
      });
    });
  });
});
