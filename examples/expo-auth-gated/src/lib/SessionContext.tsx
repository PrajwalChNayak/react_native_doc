import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react';

import type {Session} from './sessionLogic';
import {clearSession, loadSession, saveSession} from './sessionStore';

type SessionState = {
  session: Session | null;
  /** True until the keychain read on launch has finished. */
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Stands in for a real sign-in request. A real one posts credentials over HTTPS
 * and receives a short-lived token; the password never reaches storage.
 */
async function requestToken(): Promise<Session> {
  await new Promise<void>((resolve) => setTimeout(() => resolve(), 300));
  return {token: `demo-${Date.now()}`, expiresAt: Date.now() + 15 * 60 * 1000};
}

export function SessionProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((restored) => {
        if (!cancelled) setSession(restored);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    const next = await requestToken();
    await saveSession(next);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({session, isLoading, signIn, signOut}),
    [session, isLoading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return value;
}
