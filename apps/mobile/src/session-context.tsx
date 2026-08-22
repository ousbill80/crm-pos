import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setUnauthorizedHandler } from './api';
import {
  clearSession,
  hydrateSession,
  markPasswordChanged as persistPasswordChanged,
  persistSession,
  type SessionUser,
} from './session';

interface SessionState {
  ready: boolean;
  user: SessionUser | null;
  mustChangePassword: boolean;
  signIn: (accessToken: string, mustChangePassword: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  markPasswordChanged: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
    setMustChangePassword(false);
  }, []);

  const signIn = useCallback(
    async (accessToken: string, mcp: boolean) => {
      const next = await persistSession(accessToken, mcp);
      setUser(next);
      setMustChangePassword(mcp);
    },
    [],
  );

  const markPasswordChanged = useCallback(async () => {
    await persistPasswordChanged();
    setMustChangePassword(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    void hydrateSession()
      .then((restored) => {
        if (restored) {
          setUser(restored.user);
          setMustChangePassword(restored.mustChangePassword);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      mustChangePassword,
      signIn,
      signOut,
      markPasswordChanged,
    }),
    [ready, user, mustChangePassword, signIn, signOut, markPasswordChanged],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
