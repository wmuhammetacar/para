import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import LoginPage from '../LoginPage';

const loginMock = vi.fn();
const authState = {
  login: loginMock,
  loading: false,
  isAuthenticated: false
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

describe('LoginPage', () => {
  beforeEach(() => {
    authState.loading = false;
    authState.isAuthenticated = false;
    loginMock.mockReset();
  });

  test('submits login credentials', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({});

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Oturum Ac' }));

    expect(loginMock).toHaveBeenCalledWith('demo@teklifim.com', '123456');
  });

  test('shows API error when login fails', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new Error('Gecersiz giris bilgileri.'));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Oturum Ac' }));

    expect(await screen.findByText('Gecersiz giris bilgileri.')).toBeInTheDocument();
  });
});
