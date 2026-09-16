import * as SecureStore from 'expo-secure-store';

import {serialiseSession, usableSession, type Session} from './sessionLogic';

/**
 * expo-secure-store keeps the value in the iOS Keychain and in Android storage
 * encrypted with a Keystore-held key. That protects it at rest against other
 * apps and casual filesystem access. It does not protect against a rooted or
 * jailbroken device, or an attacker with the unlocked phone — which is why the
 * token here is short-lived and the server stays the authority.
 *
 * AsyncStorage would be the wrong choice: it is unencrypted.
 */
const KEY = 'session';

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  const session = usableSession(raw);
  // An expired or corrupt entry is deleted rather than left lying around.
  if (raw !== null && session === null) {
    await SecureStore.deleteItemAsync(KEY);
  }
  return session;
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, serialiseSession(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
