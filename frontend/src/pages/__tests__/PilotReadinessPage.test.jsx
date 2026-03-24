import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PilotReadinessPage from '../PilotReadinessPage';

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

function buildReadiness(period = 30) {
  return {
    periodDays: period,
    dateFrom: '2026-03-01',
    dateTo: '2026-03-24',
    generatedAt: '2026-03-24T10:00:00.000Z',
    score: 83,
    status: { code: 'watch', label: 'Izlemeye Acik' },
    summary: { passedChecks: 5, totalChecks: 6 },
    financialRisk: { pendingTotal: 3400, overdueTotal: 900, overdueRatio: 26.5 },
    checks: [
      { key: 'onboarding', label: 'Onboarding Tamamlama', passed: true, value: 'Tamamlandi', target: '4/4 adim' }
    ],
    nextActions: [
      { key: 'collection_rate', label: 'Tahsilat Donusumu', reason: '%30 (hedef: >= %40)', ctaPath: '/growth' }
    ]
  };
}

describe('PilotReadinessPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation((path) => {
      if (typeof path === 'string' && path.startsWith('/dashboard/pilot-readiness?period=')) {
        const period = Number(path.split('=')[1]) || 30;
        return Promise.resolve(buildReadiness(period));
      }

      return Promise.resolve(null);
    });
  });

  test('loads pilot readiness checks', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PilotReadinessPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pilot Hardening')).toBeInTheDocument();
    expect(await screen.findByText('Pilot Kontrol Listesi')).toBeInTheDocument();
    expect(await screen.findByText('Onboarding Tamamlama')).toBeInTheDocument();
    expect(await screen.findByText('Oncelikli Aksiyonlar')).toBeInTheDocument();

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/pilot-readiness?period=30', {
        token: 'test-token'
      });
    });
  });
});
