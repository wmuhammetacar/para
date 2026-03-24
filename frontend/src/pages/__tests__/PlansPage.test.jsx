import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PlansPage from '../PlansPage';

const authState = {
  token: 'test-token',
  user: { id: 1, email: 'owner@test.local', companyName: 'Test', planCode: 'starter' },
  updateUser: vi.fn()
};

const apiRequestMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../../api', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  formatDate: (value) => value
}));

function buildResponse(planCode = 'starter') {
  return {
    currentPlan: {
      code: planCode,
      name: planCode === 'starter' ? 'Baslangic' : 'Standart'
    },
    monthRange: {
      from: '2026-03-01',
      to: '2026-04-01'
    },
    usage: {
      customers: { used: 10, limit: planCode === 'starter' ? 50 : 250, remaining: 40, utilizationPercent: 20 },
      quotesPerMonth: { used: 5, limit: planCode === 'starter' ? 30 : 200, remaining: 25, utilizationPercent: 17 },
      invoicesPerMonth: { used: 4, limit: planCode === 'starter' ? 30 : 200, remaining: 26, utilizationPercent: 13 },
      remindersPerMonth: { used: 3, limit: planCode === 'starter' ? 60 : 400, remaining: 57, utilizationPercent: 5 }
    },
    availablePlans: [
      {
        code: 'starter',
        name: 'Baslangic',
        description: 'Mikro isletmeler',
        monthlyPriceTry: 499,
        yearlyPriceTry: 4790,
        limits: { customers: 50, quotesPerMonth: 30, invoicesPerMonth: 30, remindersPerMonth: 60 }
      },
      {
        code: 'standard',
        name: 'Standart',
        description: 'KOBI ekipleri',
        monthlyPriceTry: 899,
        yearlyPriceTry: 8690,
        limits: { customers: 250, quotesPerMonth: 200, invoicesPerMonth: 200, remindersPerMonth: 400 }
      }
    ]
  };
}

describe('PlansPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    authState.updateUser.mockReset();

    apiRequestMock.mockImplementation((path) => {
      if (path === '/dashboard/plan') {
        return Promise.resolve(buildResponse('starter'));
      }

      return Promise.resolve(buildResponse('standard'));
    });
  });

  test('loads plans and keeps package change as support-only flow', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlansPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Paketler ve Kullanim')).toBeInTheDocument();
    expect(await screen.findByText('Baslangic')).toBeInTheDocument();
    expect(await screen.findByText('Standart')).toBeInTheDocument();
    expect(await screen.findByText(/billing\/destek ekibi/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Destek Ile Gec' })).toBeDisabled();

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(authState.updateUser).not.toHaveBeenCalled();
  });
});
