import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import OnboardingPage from '../OnboardingPage';

const authState = {
  token: 'test-token'
};

const apiRequestMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../../api', () => ({
  apiRequest: (...args) => apiRequestMock(...args)
}));

describe('OnboardingPage', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({
      completedSteps: 2,
      totalSteps: 4,
      completionPercent: 50,
      isCompleted: false,
      nextStep: {
        key: 'invoice',
        ctaPath: '/invoices'
      },
      steps: [
        {
          key: 'customer',
          label: 'Ilk Musteri Kaydi',
          description: 'Musteri olusturun',
          current: 1,
          target: 1,
          ctaPath: '/customers',
          completed: true
        },
        {
          key: 'quote',
          label: 'Ilk Teklif Olusturma',
          description: 'Teklif olusturun',
          current: 1,
          target: 1,
          ctaPath: '/quotes',
          completed: true
        },
        {
          key: 'invoice',
          label: 'Ilk Fatura Olusturma',
          description: 'Fatura olusturun',
          current: 0,
          target: 1,
          ctaPath: '/invoices',
          completed: false
        }
      ]
    });
  });

  test('renders activation progress and supports refresh', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OnboardingPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Onboarding Aktivasyon')).toBeInTheDocument();
    expect(await screen.findByText('%50')).toBeInTheDocument();
    expect(await screen.findByText('Tamamlanan Adim: 2 / 4')).toBeInTheDocument();
    expect(await screen.findByText('Ilk Fatura Olusturma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Durumu Yenile' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/activation', {
        token: 'test-token'
      });
    });
  });
});
