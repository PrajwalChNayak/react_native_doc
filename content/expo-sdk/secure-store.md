---
title: Secure Store
description: expo-secure-store stores small values in the iOS Keychain and the Android Keystore — what that actually protects, what AsyncStorage does not, and the biometric gating option.
status: current
toolchain: expo
sdk: 57
---

`expo-secure-store` stores string key–value pairs in the iOS Keychain and in Android's
`EncryptedSharedPreferences` backed by the hardware Keystore. It is where refresh tokens, session
cookies and any client-side key belong. It is not a general storage API: values are strings, and
the store is sized for secrets, not data.

```bash
npx expo install expo-secure-store
```

That resolves `expo-secure-store@~57.0.4` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) for why
the command matters.

## Why it exists / when to use it — and when NOT to

Use it for anything whose disclosure is a security incident: refresh tokens, OAuth access tokens,
API keys scoped to a user, a device-binding secret, a PIN hash.

Do **not** use it for:

- **Bulk data.** Values are strings, and each read and write crosses into the Keychain / Keystore.
  It is not a cache. Anything over a couple of kilobytes belongs in
  [`expo-file-system`](file-system-and-storage.md) or [`expo-sqlite`](sqlite.md).
- **A secret the server should hold.** No client-side store makes a shared API key safe. If the
  secret must never be seen by the user, it must never reach the device. See
  [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md).
- **Non-sensitive preferences.** AsyncStorage is faster and simpler for `theme: 'dark'`.

## Expo Go vs development build

**Works in Expo Go — with one real exception.** Basic `setItemAsync` / `getItemAsync` /
`deleteItemAsync` work in Expo Go.

`requireAuthentication: true` does **not** reliably work in Expo Go. The package's own
documentation says so plainly: the option is unsupported in Expo Go when biometric authentication
is available, because Expo Go's binary has no `NSFaceIDUsageDescription` string. You need a
development build with the `expo-secure-store` config plugin applied.

Two further caveats that are easy to lose a day to:

- **Simulators and emulators do not enforce biometrics the way a real device does.** Testing
  `requireAuthentication` on a simulator can succeed when it would prompt on hardware. Test on a
  real device.
- **Values written in Expo Go live under Expo Go's Keychain / Keystore identity**, not your app's.
  They are not visible to your development build, and vice versa.

## Basic example

```ts title=lib/tokenStore.ts
import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN = 'refresh_token';

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN, token, {
    // The default is WHEN_UNLOCKED. AFTER_FIRST_UNLOCK lets a background
    // refresh run while the phone is locked, which is usually what a token
    // needs; it is a deliberate loosening, so pick it on purpose.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function readRefreshToken(): Promise<string | null> {
  // Resolves null when the key is absent OR has been invalidated.
  return SecureStore.getItemAsync(REFRESH_TOKEN);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN);
}
```

## How it works

### API surface

| Export | Signature |
| --- | --- |
| `setItemAsync` | `(key, value, options?) => Promise<void>` |
| `getItemAsync` | `(key, options?) => Promise<string \| null>` |
| `deleteItemAsync` | `(key, options?) => Promise<void>` |
| `setItem` | `(key, value, options?) => void` — synchronous |
| `getItem` | `(key, options?) => string \| null` — synchronous |
| `isAvailableAsync` | `() => Promise<boolean>` |
| `canUseBiometricAuthentication` | `() => boolean` — Android and iOS |

Keys may contain alphanumeric characters plus `.`, `-` and `_`. Anything else throws.

> [!WARNING] The synchronous variants block the JS thread
> `getItem` and `setItem` are convenient in a module-scope initialiser, but with
> `requireAuthentication: true` they block until the user has completed the biometric prompt. The
> app is frozen for that whole time. Use the async forms anywhere the user can see the UI.

### `SecureStoreOptions`

| Option | Platform | Meaning |
| --- | --- | --- |
| `keychainService` | both | iOS: the item's `kSecAttrService`. Android: the key-pair alias. **If you set it on write you must set it on read.** |
| `requireAuthentication` | both | Gates access behind device biometrics / passcode. |
| `authenticationPrompt` | both | The message shown during that prompt. |
| `keychainAccessible` | iOS | When the item is readable — see the table below. |
| `accessGroup` | iOS | Keychain access group, for sharing with an app extension or sibling app. |

### `keychainAccessible` constants

These are iOS `kSecAttrAccessible` values. The default is `WHEN_UNLOCKED`.

| Constant | Readable when | Migrates to a new device |
| --- | --- | --- |
| `WHEN_UNLOCKED` | Device is unlocked | Yes |
| `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Device is unlocked | No |
| `AFTER_FIRST_UNLOCK` | Any time after the first unlock since boot | Yes |
| `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` | Same, but stays on this device | No |
| `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` | Device unlocked **and** a passcode is set; deleted if the passcode is removed | No |
| `ALWAYS` | Always — **deprecated** | Yes |
| `ALWAYS_THIS_DEVICE_ONLY` | Always — **deprecated** | No |

> [!DEPRECATED] `ALWAYS` and `ALWAYS_THIS_DEVICE_ONLY`
> Both are deprecated in the installed package. They make the item readable with the device locked
> and give you no user protection at all. Use `AFTER_FIRST_UNLOCK` (or its
> `_THIS_DEVICE_ONLY` variant) when you need background access.

The `_THIS_DEVICE_ONLY` variants are the ones you want for a device-bound secret: they are excluded
from encrypted backups and do not restore onto a new phone. A refresh token that survives a restore
onto an attacker's device is a real, exploited attack.

### Biometric gating

```ts title=lib/vault.ts
import * as SecureStore from 'expo-secure-store';

const KEY = 'vault_master_key';

export async function storeMasterKey(key: string): Promise<void> {
  // canUseBiometricAuthentication() is synchronous and returns false when the
  // device has no sufficiently secure enrolled method — always check first,
  // because writing with requireAuthentication on a device that cannot satisfy
  // it leaves the value unreadable.
  if (!SecureStore.canUseBiometricAuthentication()) {
    throw new Error('This device cannot protect the key with biometrics.');
  }

  await SecureStore.setItemAsync(KEY, key, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your vault',
  });
}

export async function readMasterKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your vault',
  });
}
```

Three properties of `requireAuthentication` that bite:

1. **It behaves differently per platform.** On Android, authentication is required for *all*
   operations on that key. On iOS the user is prompted when reading or updating an existing value,
   but not when creating a new one.
2. **Changing enrolled biometrics invalidates the key.** Adding a fingerprint or re-enrolling a
   face makes the value permanently unreadable — `getItemAsync` resolves `null`, not an error. Your
   code must treat `null` as "re-authenticate the user", never as "corrupted".
3. **It does not compose with `keychainService`.** The package notes that full functionality is
   only available with a freshly generated key, which is not the same key used for your other,
   non-authenticated `keychainService` operations.

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-secure-store",
        {
          "faceIDPermission": "Allow $(PRODUCT_NAME) to unlock your saved credentials with Face ID."
        }
      ]
    ]
  }
}
```

`faceIDPermission` sets **`NSFaceIDUsageDescription`**. Its default is
`"Allow $(PRODUCT_NAME) to access your Face ID biometric data."`; pass `false` to omit the key
entirely.

> [!DANGER] A missing `NSFaceIDUsageDescription` is an instant crash
> If your app triggers Face ID and `NSFaceIDUsageDescription` is not in `Info.plist`, iOS
> terminates the process immediately. There is no error, no dialog and no JavaScript exception —
> the app disappears. Anything that sets `requireAuthentication: true` must ship this string.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-secure-store",
        {
          "configureAndroidBackup": true
        }
      ]
    ]
  }
}
```

`configureAndroidBackup` defaults to `true` and adjusts Android Auto Backup so it does not copy
`expo-secure-store`'s encrypted preferences. That matters: the Keystore key never leaves the
device, so a backed-up ciphertext restored on another device is undecryptable garbage — and your
app reads `null` where it expected a token. Leave this on unless you have a specific reason not to.

No manifest permission is required. Biometric gating uses the Keystore's
`setUserAuthenticationRequired` flag rather than a runtime permission.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Backing store | Keychain | `EncryptedSharedPreferences` + hardware Keystore |
| Hardware isolation | Secure Enclave when available | StrongBox / TEE when available |
| `keychainAccessible` | Honoured | Ignored |
| `accessGroup` | Honoured | Ignored |
| `requireAuthentication` scope | Prompts on read/update, not on first create | Prompts on every operation |
| Backup behaviour | Controlled by `keychainAccessible` `_THIS_DEVICE_ONLY` variants | Controlled by `configureAndroidBackup` |
| Uninstall clears the data | **No** — Keychain items can survive reinstall | Yes |

The iOS reinstall behaviour surprises people: a Keychain item written by a deleted app can still be
there when the app is reinstalled. Do not rely on uninstall as a logout.

## Common patterns

### A typed wrapper that fails closed

```ts title=lib/secrets.ts
import * as SecureStore from 'expo-secure-store';

type SecretKey = 'access_token' | 'refresh_token' | 'device_id';

export async function readSecret(key: SecretKey): Promise<string | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    // Do not silently fall back to unencrypted storage. Fail, and let the
    // caller decide whether the feature can run at all.
    throw new Error('Secure storage is unavailable on this device.');
  }
  return SecureStore.getItemAsync(key);
}

export async function writeSecret(key: SecretKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
```

### Storing an object

```ts title=lib/sessionStore.ts
import * as SecureStore from 'expo-secure-store';

type Session = {accessToken: string; expiresAt: number};

export async function saveSession(session: Session): Promise<void> {
  // Values are strings. Serialise, and keep the object small — this is a
  // Keychain item, not a database row.
  await SecureStore.setItemAsync('session', JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync('session');
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accessToken' in parsed &&
      'expiresAt' in parsed
    ) {
      return parsed as Session;
    }
  } catch {
    // A value that no longer parses is a corrupt entry, not a session.
  }
  await SecureStore.deleteItemAsync('session');
  return null;
}
```

### Treating `null` as "re-authenticate"

```ts title=lib/requireSecret.ts
import * as SecureStore from 'expo-secure-store';

export async function getGatedSecret(): Promise<string> {
  const value = await SecureStore.getItemAsync('vault_master_key', {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your vault',
  });

  if (value === null) {
    // Either the user cancelled, or their biometrics changed and the key was
    // invalidated. Both mean the same thing to the app: start over.
    throw new Error('re-auth-required');
  }
  return value;
}
```

## Security considerations

**Threat.** An attacker with physical access to an unlocked, rooted or jailbroken device reads the
app's private storage and extracts whatever it finds.

**Exploit.** AsyncStorage on Android is a plain SQLite database inside the app sandbox. On a rooted
device or a debuggable build:

```bash
adb shell run-as com.example.myapp \
  sqlite3 databases/RKStorage "select * from catalystLocalStorage;"
```

Every key and value comes out as plaintext, including anything you stored as "just a token". The
same applies to a plain JSON file in the documents directory, and on iOS to an unencrypted device
backup.

**Fix.** Move the value into `expo-secure-store` and pick an accessibility level that matches the
threat:

```ts title=lib/migrateToken.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export async function migrateToken(): Promise<void> {
  const legacy = await AsyncStorage.getItem('token');
  if (legacy === null) {
    return;
  }
  await SecureStore.setItemAsync('token', legacy, {
    // Device-bound: excluded from encrypted backups and never restored onto
    // another phone.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  // The old copy is still plaintext on disk until you delete it.
  await AsyncStorage.removeItem('token');
}
```

**Verification.** Re-run the `sqlite3` dump above and confirm the token is gone from
`catalystLocalStorage`. Then confirm it is genuinely in the secure store by reading it back through
`getItemAsync` and, on Android, checking that
`adb shell run-as com.example.myapp cat shared_prefs/*.xml` shows only ciphertext.

### What the Keychain and Keystore actually give you

Be precise about this, because overstating it leads to bad decisions:

**They do give you:**

- Encryption at rest with a key held by the OS, and on most modern devices by dedicated hardware
  (Secure Enclave, StrongBox / TEE) that the key material never leaves.
- Enforcement tied to device state — the `keychainAccessible` level genuinely prevents reads while
  the device is locked.
- Optional binding to the user's enrolled biometrics, where a biometric change invalidates the key.
- Exclusion from backups, via the `_THIS_DEVICE_ONLY` levels on iOS and `configureAndroidBackup` on
  Android.

**They do not give you:**

- **Protection from your own running process.** Any code in your app — including a compromised
  third-party dependency — can call `getItemAsync` and read the value. Secure storage protects data
  at rest, not data in use.
- **Protection on a rooted or jailbroken device with an attacker present.** Hooking frameworks
  attach to the process and read the plaintext after the OS hands it over.
- **Protection against a user who wants to see their own token.** They own the device.
- **A safe place for a secret that is not per-user.** A shared API key in the Keychain is still one
  jailbroken device away from being on the internet.

### What AsyncStorage does not protect

`@react-native-async-storage/async-storage` (`2.2.0` on SDK 57) offers **no** confidentiality:

- **It is not encrypted.** On Android it is a SQLite file; on iOS a plist-style file in the app
  container. Both are plaintext.
- **It is readable on a rooted or jailbroken device** with a single shell command, as shown above.
- **It is included in device backups by default.** An iTunes/Finder backup without a backup password
  contains it in the clear, and Android Auto Backup uploads it.
- **It is readable from a debuggable build** with `run-as`, which includes any debug APK you hand a
  tester.
- **It has no access control.** There is no per-key gating, no lock-state awareness, no biometric
  option.

The full comparison, including the migration path and how to prove each claim on your own machine,
is in [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md).

## Common mistakes

- **Storing a token in AsyncStorage "for now".** It is plaintext, and "for now" ships. Wrong:
  `AsyncStorage.setItem('refresh_token', t)`. Right: `SecureStore.setItemAsync('refresh_token', t)`.
- **Setting `keychainService` on write and omitting it on read.** The read finds nothing and
  resolves `null`. Keep the options in one shared helper so they cannot drift.
- **Treating `null` from a `requireAuthentication` read as a bug.** It is the documented result of a
  cancelled prompt or invalidated key. Handle it as "re-authenticate".
- **Using `ALWAYS` or `ALWAYS_THIS_DEVICE_ONLY`.** Both are deprecated and give no user protection.
  Use `AFTER_FIRST_UNLOCK` when you need background reads.
- **Shipping `requireAuthentication: true` without the config plugin.** On iOS the missing
  `NSFaceIDUsageDescription` crashes the app on the first prompt with no error message.
- **Testing biometric gating on a simulator.** Simulators do not enforce it the way hardware does.
- **Assuming an uninstall wipes the data on iOS.** Keychain items can outlive the app.
- **Putting a shared, server-side API key in the secure store.** No client store makes that safe.
- **Storing large values.** It is a Keychain item, not a database. Use SQLite or the file system.

## Related topics

- [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md) — the full threat model and the exploit you can run yourself.
- [File System and Storage](file-system-and-storage.md) — where non-secret data belongs.
- [SQLite](sqlite.md) — structured data, including the SQLCipher option.
- [Biometrics](biometrics.md) — prompting for Face ID / fingerprint directly.
- [Authentication and OAuth](authentication.md) — what you are storing in the first place.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — why some secrets must never reach the device.
- [EAS Secrets](../expo-security/eas-secrets.md) — build-time secrets that are not client secrets.
