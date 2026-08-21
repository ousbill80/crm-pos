import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { RoleLibelle } from '@caisse-crm/shared';
import { apiFetch, setMustChangePasswordListener } from '../lib/api';
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
  mustChangePassword: boolean;
  login: (login: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  confirmerMotDePasseChange: () => void;
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
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Réarmé à chaque render de l'app : capte le 403 MUST_CHANGE_PASSWORD que
  // n'importe quel appel API peut renvoyer (utile après un rechargement de
  // page, cf. commentaire dans lib/api.ts).
  useEffect(() => {
    setMustChangePasswordListener(() => setMustChangePassword(true));
    return () => setMustChangePasswordListener(null);
  }, []);

  const login = useCallback(async (loginValue: string, password: string) => {
    const { accessToken, mustChangePassword: doitChanger } = await apiFetch<{
      accessToken: string;
      mustChangePassword: boolean;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login: loginValue, password }),
    });
    setToken(accessToken);
    const next = userFromToken(accessToken);
    setUser(next);
    setMustChangePassword(doitChanger);
    if (!next) {
      throw new Error('Jeton invalide après connexion.');
    }
    return next;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setMustChangePassword(false);
  }, []);

  const confirmerMotDePasseChange = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      mustChangePassword,
      login,
      logout,
      confirmerMotDePasseChange,
    }),
    [user, mustChangePassword, login, logout, confirmerMotDePasseChange],
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
