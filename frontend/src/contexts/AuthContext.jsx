import { createContext, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('teklifim_token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('teklifim_user');
    return raw ? JSON.parse(raw) : null;
  });

  const [loading, setLoading] = useState(false);

  async function login(email, password) {
    setLoading(true);

    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('teklifim_token', data.token);
      localStorage.setItem('teklifim_user', JSON.stringify(data.user));
      return data;
    } finally {
      setLoading(false);
    }
  }

  function updateUser(patch) {
    setUser((prevUser) => {
      const nextUser = {
        ...(prevUser || {}),
        ...(patch || {})
      };

      localStorage.setItem('teklifim_user', JSON.stringify(nextUser));
      return nextUser;
    });
  }

  function logout() {
    setToken('');
    setUser(null);
    localStorage.removeItem('teklifim_token');
    localStorage.removeItem('teklifim_user');
  }

  const value = useMemo(
    () => ({ token, user, loading, isAuthenticated: Boolean(token), login, logout, updateUser }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
