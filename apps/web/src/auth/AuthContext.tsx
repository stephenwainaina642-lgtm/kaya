import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@kaya/shared';
import { api, setAccessToken, setUnauthorizedHandler } from '../lib/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
  }, [clear]);

  const didBootstrap = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke in dev: the refresh
    // endpoint rotates the refresh token on each use, so firing this twice
    // concurrently makes the second call 401 on an already-consumed token
    // and log the user straight back out.
    if (didBootstrap.current) return;
    didBootstrap.current = true;
    (async () => {
      try {
        const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/refresh');
        setAccessToken(res.accessToken);
        setUser(res.user);
      } catch {
        clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clear();
    }
  }, [clear]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, updateUser }), [user, loading, login, logout, updateUser]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
