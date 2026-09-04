import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@shared/types.js';
import { api, ApiError } from './api.js';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
}

interface AuthResponse {
  user: User;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  function apply(res: AuthResponse) {
    setUser(res.user);
    setIsAdmin(res.isAdmin);
  }

  useEffect(() => {
    api
      .get<AuthResponse>('/api/auth/me')
      .then(apply)
      .catch(() => {
        setUser(null);
        setIsAdmin(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    apply(await api.post<AuthResponse>('/api/auth/login', { email, password, remember }));
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    apply(await api.post<AuthResponse>('/api/auth/register', { email, password, name }));
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    setIsAdmin(false);
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    apply(await api.post<AuthResponse>('/api/auth/reset-password', { token, password }));
  }, []);

  const updateName = useCallback(async (name: string) => {
    apply(await api.patch<AuthResponse>('/api/auth/me', { name }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, register, logout, resetPassword, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}
