import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PlatformAdminRef, PlatformLoginResult } from '@kaya/shared';
import { platformApi, setPlatformToken } from './api';

interface PlatformAuthState {
  admin: PlatformAdminRef | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<PlatformAuthState | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdminRef | null>(null);

  // No refresh-token rotation here, unlike the tenant app: this is a
  // lightweight operator console, so the session simply lives in memory for
  // the tab and an admin signs in again after a reload.
  const login = useCallback(async (email: string, password: string) => {
    const res = await platformApi.post<PlatformLoginResult>('/auth/login', { email, password });
    setPlatformToken(res.accessToken);
    setAdmin(res.admin);
  }, []);

  const logout = useCallback(() => {
    setPlatformToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ admin, ready: true, login, logout }), [admin, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlatformAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlatformAuth must be used within PlatformAuthProvider');
  return ctx;
}
