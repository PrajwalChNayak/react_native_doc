---
title: Secure Storage
description: react-native-keychain 10 from the data-layer side — the real API surface, where a token store sits in startup, and what secure storage does not protect you from.
status: current
toolchain: cli
---

Secure storage is the third tier of an app's data layer. Memory holds what only matters while the
app is open, a key-value store holds preferences and caches, and the platform's Keychain or
Keystore holds the handful of values you would not want printed in a support log.

`react-native-keychain` **10.0.0** is the verified library for that tier. This page covers it from
the data-layer perspective: the API shape, where the read fits in startup, how the session state
it produces connects to the rest of your state, and where its guarantees stop.
[Keychain and Keystore](../security/secure-storage-keychain-keystore.md) covers the same library
from the attacker's side, with the exploit walkthrough and the platform-by-platform detail. Read
both; this one is about architecture.

## Why it exists / when to use it — and when NOT to

| Value | Tier |
| --- | --- |
| Refresh token, access token, session cookie | **Secure storage** |
| A key used to encrypt something else at rest | **Secure storage** |
| A PIN or passphrase the user set for your app | **Secure storage** |
| Theme, onboarding flag, last tab, feature toggles | [AsyncStorage or MMKV](asyncstorage-vs-mmkv.md) |
| Cached API responses | A query cache — [Data Fetching and Caching](data-fetching.md) |
| Anything you can fetch again in under a second | Do not persist it at all |

Do **not** use it as a general store. Every read is a native call, some of them show a system
prompt, and the platforms are explicit that it is for small secrets. Encrypt bulk data with a key
held here rather than pushing the data itself through it.

Do **not** use it for a value you can derive. A user id is not a secret; it is in every request
you make.

## Basic example

One module owns the credential. Nothing else in the app calls the library.

```ts title=src/auth/tokenStore.ts
import * as Keychain from 'react-native-keychain';

/** Namespaced by bundle id so two services never collide. */
const SERVICE = 'com.example.app.session';

export type Tokens = {accessToken: string; refreshToken: string};

/**
 * `setGenericPassword` takes a username and a password. Neither has to be a
 * real credential — here the username slot records which account the tokens
 * belong to, which is what makes multi-account sign-out possible without a
 * second store.
 */
export async function saveTokens(accountId: string, tokens: Tokens): Promise<boolean> {
  const result = await Keychain.setGenericPassword(accountId, JSON.stringify(tokens), {
    service: SERVICE,
    // iOS: readable only while unlocked, and never restored onto another
    // device from a backup.
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    // Android: AES-GCM in the Keystore, no per-read authentication prompt.
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });
  // The API resolves to `false` on failure rather than rejecting.
  return result !== false;
}

export async function loadTokens(): Promise<{accountId: string; tokens: Tokens} | null> {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  // `false` means "nothing stored", which is a normal first-launch result and
  // not an error worth reporting.
  if (credentials === false) {
    return null;
  }
  try {
    return {
      accountId: credentials.username,
      tokens: JSON.parse(credentials.password) as Tokens,
    };
  } catch {
    // A stored value we cannot parse is worse than no value: clear it so the
    // next launch starts clean instead of failing the same way forever.
    await Keychain.resetGenericPassword({service: SERVICE});
    return null;
  }
}

export async function clearTokens(): Promise<boolean> {
  return Keychain.resetGenericPassword({service: SERVICE});
}
```

## How it works

### The API surface, verified

Read from the installed 10.0.0 type definitions. These are the functions a data layer actually
uses:

| Function | Signature |
| --- | --- |
| `setGenericPassword` | `(username, password, options?: SetOptions) => Promise<false \| Result>` |
| `getGenericPassword` | `(options?: GetOptions) => Promise<false \| UserCredentials>` |
| `hasGenericPassword` | `(options?: BaseOptions) => Promise<boolean>` |
| `resetGenericPassword` | `(options?: BaseOptions) => Promise<boolean>` |
| `getAllGenericPasswordServices` | `(options?: GetAllOptions) => Promise<string[]>` |
| `getSupportedBiometryType` | `() => Promise<null \| BIOMETRY_TYPE>` |
| `isPasscodeAuthAvailable` | `() => Promise<boolean>` |
| `getSecurityLevel` | `(options?: AccessControlOption) => Promise<null \| SECURITY_LEVEL>` — Android |
| `canImplyAuthentication` | `(options?: AuthenticationTypeOption) => Promise<boolean>` — iOS |

There is a parallel set for internet credentials — `setInternetCredentials(server, username,
password, options?)`, `getInternetCredentials(server, options?)`,
`hasInternetCredentials(server \| options)` and `resetInternetCredentials(options)` — which is the
right shape when you hold one credential per host.

`UserCredentials` is `{username, password, service, storage}`. `Result` is `{service, storage}`.
Both carry `storage: STORAGE_TYPE`, so you can log which backend was actually used without
logging the secret.

> [!WARNING] Every getter can resolve to `false`
> `getGenericPassword` returns `false | UserCredentials`, not `UserCredentials | null`. Code
> written as `const {password} = await Keychain.getGenericPassword()` compiles only if you
> ignore the union, and crashes on a fresh install. Narrow on `=== false` first.

The five enums, all exported as values:

| Enum | What it controls |
| --- | --- |
| `ACCESSIBLE` | iOS: when the item can be read, and whether it migrates in a backup |
| `ACCESS_CONTROL` | Biometric or passcode gating on both platforms |
| `AUTHENTICATION_TYPE` | iOS: biometrics, or biometrics-or-passcode |
| `SECURITY_LEVEL` | Android: whether a software-backed Keystore key is acceptable |
| `STORAGE_TYPE` | Android: which cipher, and whether the key requires authentication |

The constants themselves and the trade-offs between them are tabulated in
[Keychain and Keystore](../security/secure-storage-keychain-keystore.md). The data-layer summary:
use `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` and `STORAGE_TYPE.AES_GCM_NO_AUTH` for a session
token, and add `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` with `STORAGE_TYPE.AES_GCM` for anything
you want gated behind a face or fingerprint.

### Where the read goes in startup

This is the part that belongs on this page rather than the security one. Reading the Keychain is
asynchronous and can be slow — on Android it involves a Keystore operation, and with an access
control flag it can show a system prompt. That means your app has **three** startup states, not
two.

```ts-fragment title=src/auth/useSessionStore.ts
import {create} from 'zustand';
import {clearTokens, loadTokens, saveTokens} from './tokenStore';
import type {Tokens} from './tokenStore';

type SessionStatus = 'restoring' | 'signedIn' | 'signedOut';

type SessionState = {
  status: SessionStatus;
  accountId: string | null;
  restore: () => Promise<void>;
  signIn: (accountId: string, tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSessionStore = create<SessionState>()((set) => ({
  // 'restoring' is the initial state, not 'signedOut'. Starting at
  // 'signedOut' flashes the sign-in screen at every returning user.
  status: 'restoring',
  accountId: null,

  restore: async () => {
    const stored = await loadTokens();
    set(
      stored === null
        ? {status: 'signedOut', accountId: null}
        : {status: 'signedIn', accountId: stored.accountId},
    );
  },

  signIn: async (accountId, tokens) => {
    await saveTokens(accountId, tokens);
    set({status: 'signedIn', accountId});
  },

  signOut: async () => {
    await clearTokens();
    set({status: 'signedOut', accountId: null});
  },
}));
```

The navigator then branches on three states, and the third one keeps the splash screen up:

```tsx-fragment title=src/navigation/RootNavigator.tsx
import {useEffect} from 'react';
import {useSessionStore} from '../auth/useSessionStore';
import {SplashScreen} from '../screens/SplashScreen';
import {AppStack} from './AppStack';
import {AuthStack} from './AuthStack';

export function RootNavigator() {
  const status = useSessionStore((state) => state.status);
  const restore = useSessionStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (status === 'restoring') {
    return <SplashScreen />;
  }
  return status === 'signedIn' ? <AppStack /> : <AuthStack />;
}
```

### Keep the token out of React state

The store above holds `accountId` and a status — not the tokens. That is deliberate. A token in
React state is a token in every profiler snapshot, every devtools inspection and every error
report that serialises component state. Read it from the Keychain at the point of use instead.

```ts title=src/api/authorizedFetch.ts
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.example.app.session';

type Tokens = {accessToken: string; refreshToken: string};

/**
 * Reads the credential per request rather than caching it in a module
 * variable or in React state. On MMKV-speed storage that would be wasteful;
 * on the Keychain it is a native call, so cache it in a short-lived local if
 * you are issuing a burst of requests — but never in the component tree.
 */
export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  const headers = new Headers(init?.headers);

  if (credentials !== false) {
    const tokens = JSON.parse(credentials.password) as Tokens;
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  return fetch(`https://api.example.com${path}`, {...init, headers});
}
```

### Biometric gating changes the shape of your data layer

A value stored with an `accessControl` flag cannot be read silently. The OS shows a prompt, and
the promise rejects if the user cancels. That means the read is a **user interaction**, and it
cannot live in a startup effect or an interceptor that runs on every request.

```ts title=src/auth/vault.ts
import * as Keychain from 'react-native-keychain';

const VAULT_SERVICE = 'com.example.app.vault';

export type VaultReadResult =
  | {kind: 'value'; value: string}
  | {kind: 'empty'}
  | {kind: 'cancelled'}
  | {kind: 'unavailable'};

/**
 * Models cancellation as a result rather than an exception, because a user
 * declining a biometric prompt is a normal outcome. Throwing here is how crash
 * dashboards fill up with user decisions.
 */
export async function readVault(): Promise<VaultReadResult> {
  const biometry = await Keychain.getSupportedBiometryType();
  if (biometry === null) {
    return {kind: 'unavailable'};
  }
  try {
    const credentials = await Keychain.getGenericPassword({
      service: VAULT_SERVICE,
      authenticationPrompt: {
        title: 'Unlock your saved credentials',
        cancel: 'Cancel',
      },
    });
    return credentials === false
      ? {kind: 'empty'}
      : {kind: 'value', value: credentials.password};
  } catch {
    return {kind: 'cancelled'};
  }
}
```

Check `getSupportedBiometryType()` **before** you offer the feature, not after the prompt fails.
It resolves to `null` when nothing is enrolled, and to a `BIOMETRY_TYPE` value otherwise, which
also tells you whether to say "Face ID", "fingerprint" or something neutral in your own UI.

## What it does not protect

Be precise about this, because "we use the Keychain" gets treated as if it settled the question.

- **It does not protect against your own app.** If your code can read the token to make a
  request, a debugger attached to your process can too. Published tooling hooks
  `getGenericPassword` directly.
- **It does not protect the value once it is in memory.** After `JSON.parse`, the token is an
  ordinary JavaScript string on an ordinary heap.
- **It does not protect against a malicious dependency.** Anything in your bundle runs with your
  app's identity and can call the same functions. See
  [Dependency Auditing](../security/dependency-auditing.md).
- **Biometrics do not authenticate anyone to your server.** A successful prompt proves the device
  owner was present. Your backend still has to validate the token it receives.
- **It does not survive uninstall consistently.** iOS Keychain items survive an uninstall;
  Android Keystore keys do not, which makes the stored blob permanently undecryptable. An app
  that depends on either behaviour is broken on one platform.

What it does buy you is real and worth the work: backups stop leaking, other apps cannot read the
item, and a lost phone stops being a credential breach. The full accounting is in
[Keychain and Keystore](../security/secure-storage-keychain-keystore.md).

## Platform differences

:::tabs
@tab iOS
Items live in the system Keychain and **survive app uninstall**. A fresh install can find the
previous installation's credential, which surprises people and is occasionally exploited by users
to dodge a trial period. If that is wrong for your app, clear the service on first launch — keyed
on a flag in a store that *does* get wiped, such as MMKV.

`accessible` decides both when the item is readable and whether it migrates in a backup. A
`THIS_DEVICE_ONLY` variant is the right default for a session token.
@tab Android
The credential is a ciphertext blob in app-private preferences; the key that decrypts it is in the
Android Keystore and is **destroyed on uninstall**. Uninstalling and reinstalling therefore always
produces a signed-out app, and there is nothing to clear.

`getSecurityLevel()` reports what the device can do, and passing
`securityLevel: SECURITY_LEVEL.SECURE_HARDWARE` makes a software-backed key an error rather than a
silent downgrade. Be aware that this rejects some low-end and older devices outright — decide
whether a failed sign-in is better than a software-backed key for your app.
:::

## Common patterns

### One module, one service string

Everything goes through `tokenStore.ts`. That gives you one place to change the accessibility
constant, one place to add biometric gating, and one place to mock in tests.

### A key for MMKV, not the data in the Keychain

If you want encrypted bulk storage, this is the shape that actually works: generate a random key
on first launch, keep it in the Keychain, and hand it to MMKV.

```ts title=src/storage/encryptedStore.ts
import * as Keychain from 'react-native-keychain';
import {createMMKV} from 'react-native-mmkv';
import type {MMKV} from 'react-native-mmkv';

const KEY_SERVICE = 'com.example.app.mmkv-key';

/**
 * Supplied by you. React Native core has **no** cryptographic random source:
 * `getRandomValues` does not appear anywhere in the react-native 0.87.1
 * package, so there is no `crypto` global to call. See the note below.
 * Must return exactly 32 characters for AES-256.
 */
declare function generateRandomKey(): string;

/**
 * The key never appears in the bundle, so an attacker who reads the MMKV file
 * does not also get the key from the binary. That is the only version of
 * "encrypted MMKV" that is worth anything.
 */
export async function openEncryptedStore(): Promise<MMKV> {
  const existing = await Keychain.getGenericPassword({service: KEY_SERVICE});

  let key: string;
  if (existing === false) {
    key = generateRandomKey();
    await Keychain.setGenericPassword('mmkv', key, {
      service: KEY_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    });
  } else {
    key = existing.password;
  }

  return createMMKV({id: 'encrypted', encryptionKey: key, encryptionType: 'AES-256'});
}
```

Note `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` rather than `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: this key
is needed to open the store, which may happen while the screen is locked.

### Clear on sign-out, and clear everything

A sign-out that only clears the Keychain leaves a query cache full of the previous user's data and
a store full of their preferences. Clear all three in one function.

```ts title=src/auth/signOut.ts
import {QueryClient} from '@tanstack/react-query';
import {createMMKV} from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.example.app.session';
const preferences = createMMKV({id: 'preferences'});

/**
 * Order matters: clear the credential first, so a crash halfway through
 * leaves the app signed out rather than signed in with someone else's cache.
 */
export async function signOutCompletely(queryClient: QueryClient): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
  queryClient.clear();
  preferences.clearAll();
}
```

### Mocking it in tests

The library is a native module, so it does not exist under Jest without a mock. Because everything
goes through your own module, the seam is your module, not the library — which keeps the mock
small and keeps your tests describing behaviour rather than the library's API. See
[Mocking Native Modules](../testing/mocking-native-modules.md).

## Performance considerations

- **Every call is a native round trip.** On Android it involves a Keystore cipher operation. This
  is microseconds-versus-milliseconds territory compared with MMKV, so do not read it in a render
  or in a loop.
- **The startup read is on the critical path.** It happens before you know which navigator to
  show. Keep it to one call: store one JSON blob rather than three separate items.
- **A biometric-gated read is seconds, not milliseconds.** It involves a user. Never put one in a
  request interceptor.
- **Do not poll `getSupportedBiometryType()`.** Call it once and keep the answer for the session;
  enrolment does not change while your app is in the foreground.
- **`getAllGenericPasswordServices()` is for diagnostics.** It enumerates the Keychain; it is not
  something to call on a screen.

## Common mistakes

- **Treating `false` as an error.** Wrong:
  `const {password} = await Keychain.getGenericPassword();`. Right: check `=== false` first.
  `false` is the normal first-launch result.
- **Starting the session state at `'signedOut'`.** The Keychain read is asynchronous, so every
  returning user sees the sign-in screen flash. Start at `'restoring'` and keep the splash up.
- **Putting the token in React state or a store.** It then appears in profiler snapshots and in
  any error report that serialises state. Keep the token in the module that reads it.
- **Persisting the token in MMKV or AsyncStorage "for speed".** Both are readable plaintext on a
  rooted device. See [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md).
- **Reporting a cancelled biometric prompt as a crash.** The user tapping Cancel rejects the
  promise. Model it as a result, not an exception.
- **Leaving `accessible` at its default.** The default is `AFTER_FIRST_UNLOCK`, which keeps the
  item readable while the screen is locked and lets it migrate in a backup. Choose deliberately.
- **Assuming uninstall behaves the same on both platforms.** iOS keeps Keychain items; Android
  destroys the Keystore key. Test both.
- **Storing a large blob.** The Keychain is for small secrets. Encrypt bulk data with a key held
  here instead.
- **Signing out by clearing only the credential.** The query cache and the preferences store still
  hold the previous user's data.

## Related topics

- [Keychain and Keystore](../security/secure-storage-keychain-keystore.md) — the same library from the security side: threat, exploit, fix, verification.
- [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) — the tier below this one, and why neither is secure.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — why an encryption key in the bundle is not a key.
- [Data Fetching and Caching](data-fetching.md) — the requests this credential authorises.
- [Zustand and Redux Toolkit](zustand-and-redux.md) — where the session *status* lives, as distinct from the token.
- [Biometrics](../platform-apis/biometrics.md) — authenticating the user, as distinct from gating a stored item.
- [Mocking Native Modules](../testing/mocking-native-modules.md) — testing code that talks to the Keychain.
- [Safe Logging in Release Builds](../security/safe-logging.md) — the fastest way to undo all of this.
