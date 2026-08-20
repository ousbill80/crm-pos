import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import { clearToken, getToken, setToken } from '../lib/auth-storage';
import { decodeJwt, isExpired } from '../lib/jwt';

export interface AuthUser {
  userId: string;
  login: string;
  role: RoleLibelle;
  boutiqueId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function userFromToken(token: string | null): AuthUser | null {
  if (!token) {
    return null;
  }
  const payload = decodeJwt(token);
  if (!payload || isExpired(payload)) {
    return null;
  }
  return {
    userId: payload.sub,
    login: payload.login,
    role: payload.role,
    boutiqueId: payload.boutiqueId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    userFromToken(getToken()),
  );

  const login = useCallback(async (loginValue: string, password: string) => {
    const { accessToken } = await apiFetch<{ accessToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ login: loginValue, password }),
      },
    );
    setToken(accessToken);
    setUser(userFromToken(accessToken));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un <AuthProvider>.');
  }
  return context;
}
