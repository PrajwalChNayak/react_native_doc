/**
 * Pure session logic, kept apart from storage and UI so it can be tested
 * without a device. The storage layer (`sessionStore.ts`) only reads and writes
 * strings; everything that decides what those strings mean lives here.
 */

export type Session = {
  /** A short-lived access token. Never a password, never a long-lived secret. */
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export function serialiseSession(session: Session): string {
  return JSON.stringify(session);
}

/**
 * Anything unexpected becomes `null` rather than an exception: a corrupted or
 * half-migrated keychain entry should sign the user out, not crash on launch.
 */
export function parseSession(raw: string | null): Session | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const {token, expiresAt} = value as Record<string, unknown>;
    if (typeof token !== 'string' || token.length === 0) return null;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    return {token, expiresAt};
  } catch {
    return null;
  }
}

export function isExpired(session: Session, now: number = Date.now()): boolean {
  return session.expiresAt <= now;
}

/** A usable session is one that parses and has not expired. */
export function usableSession(raw: string | null, now: number = Date.now()): Session | null {
  const session = parseSession(raw);
  if (session === null || isExpired(session, now)) return null;
  return session;
}
