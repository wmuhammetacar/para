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
      remainingSteps: 2,
      completionPercent: 50,
      isCompleted: false,
      estimatedMinutesLeft: 8,
      momentumStatus: 'on_track',
      nextStep: {
        key: 'invoice',
        ctaPath: '/invoices'
      },
      quickWins: [
        {
          key: 'invoice',
          label: 'Ilk Fatura Olusturma',
          ctaPath: '/invoices',
          estimatedMinutes: 4
        },
        {
          key: 'reminder',
          label: 'Ilk Tahsilat Hatirlatmasi',
          ctaPath: '/invoices',
          estimatedMinutes: 4
        }
      ],
      steps: [
        {
          key: 'customer',
          label: 'Ilk Musteri Kaydi',
          description: 'Musteri olusturun',
          current: 1,
          target: 1,
          remaining: 0,
          progressPercent: 100,
          estimatedMinutes: 0,
          actionLabel: 'Musteri Ekle',
          ctaPath: '/customers',
          completed: true
        },
        {
          key: 'quote',
          label: 'Ilk Teklif Olusturma',
          description: 'Teklif olusturun',
          current: 1,
          target: 1,
          remaining: 0,
          progressPercent: 100,
          estimatedMinutes: 0,
          actionLabel: 'Teklif Olustur',
          ctaPath: '/quotes',
          completed: true
        },
        {
          key: 'invoice',
          label: 'Ilk Fatura Olusturma',
          description: 'Fatura olusturun',
          current: 0,
          target: 1,
          remaining: 1,
          progressPercent: 0,
          estimatedMinutes: 4,
          actionLabel: 'Fatura Olustur',
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

    expect(await screen.findByText('Kurulum')).toBeInTheDocument();
    expect(await screen.findByText('%50')).toBeInTheDocument();
    expect(await screen.findByText('Tamamlanan Adim: 2 / 4')).toBeInTheDocument();
    expect(await screen.findByText('Kalan Adim')).toBeInTheDocument();
    expect(await screen.findByText('8 dk')).toBeInTheDocument();
    expect(await screen.findByText('Kurulum Durumu: Yolda')).toBeInTheDocument();
    const invoiceStepLabels = await screen.findAllByText('Ilk Fatura Olusturma');
    expect(invoiceStepLabels.length).toBeGreaterThan(0);
    expect(await screen.findByText('Oncelikli Adimlar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Durumu Yenile' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/dashboard/activation', {
        token: 'test-token'
      });
    });
  });
});
