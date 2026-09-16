/**
 * Token storage backed by the iOS Keychain and the Android Keystore, via
 * react-native-keychain 10.
 *
 * What this buys you and what it does not is spelled out in the README. The
 * short version: the OS keystore protects the token at rest against another
 * app and against casual filesystem access, and on a device with a passcode it
 * is hardware-backed. It does not protect against a compromised device, and it
 * is not a reason to hold a long-lived credential on the client.
 */

import * as Keychain from 'react-native-keychain';

/**
 * The keychain stores a username/password pair, so short-lived and long-lived
 * tokens are packed into the password field as JSON. Keeping them in one entry
 * means they rotate atomically — two entries can disagree if a write fails
 * halfway.
 */
export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export const SERVICE = 'com.example.securestorageauth.session';

/** The account label shown by the OS credential UI. */
const ACCOUNT = 'session';

export function isExpired(session: Session, now: number = Date.now()): boolean {
  return session.expiresAt <= now;
}

/**
 * Treats a token that expires imminently as already expired, so a request is
 * not fired with a credential that dies in flight.
 */
export function needsRefresh(
  session: Session,
  now: number = Date.now(),
  skewMs = 30_000,
): boolean {
  return session.expiresAt - skewMs <= now;
}

export function serialise(session: Session): string {
  return JSON.stringify(session);
}

/**
 * Parses what came out of the keychain. Anything unexpected returns null
 * rather than throwing: a corrupted or half-migrated entry should log the
 * user out, not crash the app on launch.
 */
export function parse(raw: string): Session | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const {accessToken, refreshToken, expiresAt} = value as Record<string, unknown>;
    if (typeof accessToken !== 'string' || accessToken === '') return null;
    if (typeof refreshToken !== 'string' || refreshToken === '') return null;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    return {accessToken, refreshToken, expiresAt};
  } catch {
    return null;
  }
}

export async function save(session: Session): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, serialise(session), {
    service: SERVICE,
    // Only readable while the device is unlocked, and never restored to a
    // different device from a backup. THIS_DEVICE_ONLY is the part that stops
    // a token travelling in an iCloud or iTunes backup.
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function load(): Promise<Session | null> {
  const result = await Keychain.getGenericPassword({service: SERVICE});
  if (result === false) return null;
  return parse(result.password);
}

export async function clear(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}

/**
 * Which biometry the device offers, or null. Used to decide whether to show a
 * "unlock with Face ID" affordance — never to decide whether the user is
 * authorised. Authorisation is the server's job.
 */
export async function biometryType(): Promise<Keychain.BIOMETRY_TYPE | null> {
  return Keychain.getSupportedBiometryType();
}
