---
title: expo-secure-store vs AsyncStorage
description: expo-secure-store uses the iOS Keychain and the Android Keystore. AsyncStorage is unencrypted key-value storage. Which values belong in which, and exactly what neither of them protects.
status: current
toolchain: expo
sdk: 57
---

Expo SDK 57 gives you two obvious places to put a value on the device, and they are not
interchangeable:

- **`expo-secure-store`** (`~57.0.4`) — small string values in the **iOS Keychain** and, on
  Android, in SharedPreferences **encrypted with the Android Keystore**.
- **`@react-native-async-storage/async-storage`** (SDK 57 pins **`2.2.0`**) — an unencrypted
  key-value store backed by a plain file or database in your app's sandbox.

The short rule: credentials and tokens go in SecureStore; everything else goes in AsyncStorage.
The longer version, including what SecureStore does *not* do, is below.

> [!WARNING] Version note
> SDK 57 pins `@react-native-async-storage/async-storage` at **2.2.0**. The React Native CLI half
> of this site documents **3.1.1** for React Native 0.87. Do not copy that number into an Expo
> project — `npx expo install` resolves 2.2.0, and a mismatched native module fails at runtime,
> not at install time.

## Why it exists / when to use it — and when NOT to

Use `expo-secure-store` for session tokens, refresh tokens, API tokens issued to this user, and
anything whose disclosure would let someone act as the user.

Use AsyncStorage for cache, the last-viewed screen, a theme preference, a feature-flag snapshot,
onboarding state — data whose disclosure is uninteresting.

Do **not** use SecureStore as a general database. Values are strings, they go through the
platform's keychain machinery, and large payloads can be rejected by the platform. Expo's
documentation notes that some historical iOS releases refused values above roughly 2048 bytes and
that Expo itself does not enforce a limit, so you must handle native errors if you store large
strings. For structured local data, use [expo-sqlite](../expo-sdk/sqlite.md).

## Basic example

```bash
npx expo install expo-secure-store
npx expo install @react-native-async-storage/async-storage
```

```ts title=app/lib/session.ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'session_token';

export async function saveToken(token: string): Promise<void> {
  // WHEN_UNLOCKED_THIS_DEVICE_ONLY keeps the entry off device backups and off any
  // restored-to-a-new-phone copy, which is what you want for a session credential.
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

```ts title=app/lib/preferences.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Non-sensitive. Readable by anyone with filesystem access to the app sandbox,
// and that is fine for a theme preference.
export async function saveTheme(theme: 'light' | 'dark'): Promise<void> {
  await AsyncStorage.setItem('ui.theme', theme);
}

export async function readTheme(): Promise<'light' | 'dark' | null> {
  const value = await AsyncStorage.getItem('ui.theme');
  return value === 'light' || value === 'dark' ? value : null;
}
```

> [!NOTE] Expo Go vs development build
> Both packages contain native code and are included in Expo Go, so simple usage runs there.
> `requireAuthentication: true` is **not supported in Expo Go** when biometric authentication is
> available, because Expo Go lacks an `NSFaceIDUsageDescription`. Use a
> [development build](../expo-development-builds/why-you-need-one.md) with the
> `expo-secure-store` config plugin for that option.

## How it works

### What each one actually does

| | `expo-secure-store` `~57.0.4` | `@react-native-async-storage/async-storage` `2.2.0` |
| --- | --- | --- |
| iOS storage | Keychain services, as `kSecClassGenericPassword` | Files in the app sandbox |
| Android storage | SharedPreferences, encrypted with the Android Keystore | SQLite/files in the app sandbox |
| Encrypted at rest | Yes, by the platform | **No** |
| Hardware-backed key | Yes, where the device provides it | No |
| Survives app uninstall | **iOS: yes.** Android: no | No |
| Value type | Strings | Strings |
| Practical size | Small — handle platform rejection for large values | Large values are fine |
| Async API | Yes | Yes |

The "survives uninstall" row surprises people. Expo's documentation states that data stored with
`expo-secure-store` persists across uninstall and reinstall on iOS when the bundle ID is the
same, and that on Android it is **not** preserved. If you rely on a token being gone after an
uninstall, that assumption is wrong on iOS.

### What AsyncStorage does NOT protect

State it precisely, because "storage" sounds protective and this one is not:

- **It is not encrypted.** Values are stored as written. The library offers no encryption option.
- **On a rooted Android device or a jailbroken iPhone it is plaintext.** Any process with
  filesystem access reads it directly — no exploit required, just a file read.
- **On Android it can be swept into a device backup.** Auto Backup copies app data to the user's
  Google account unless you exclude it. The copy is outside your app's control.
- **It is readable from an unencrypted iOS device backup** for the same reason.
- **A debug build on a developer machine exposes it trivially** — `adb shell run-as` on Android,
  or the app container downloaded from a connected device on iOS.
- **It offers no integrity protection.** An attacker with write access can change the values your
  app reads back, so never store an authorisation decision there (`{"isAdmin": true}` is an
  invitation).

Nothing above requires a vulnerability in AsyncStorage. That is simply what unencrypted storage
in an app sandbox means.

### What SecureStore does NOT protect either

SecureStore is meaningfully better, and it is still not a vault against an attacker holding the
device:

- **A compromised device loses.** On a rooted or jailbroken phone, a process running as your app
  — or with enough privilege — can ask the Keychain/Keystore for the value the same way your app
  does. Hardware-backed keys raise the cost; they do not make extraction impossible.
- **Your own process is the weak point.** Once your JavaScript calls `getItemAsync`, the value is
  a plain string in memory. A malicious dependency in your bundle can read it and send it
  anywhere. See [Dependency Auditing](dependency-auditing.md).
- **Without `requireAuthentication`, no user interaction is required.** The entry is available
  whenever the accessibility constant allows, including to malware running in your app's context.
- **`requireAuthentication: true` entries are invalidated by biometric changes.** Expo documents
  that adding a fingerprint or changing the face profile makes previously stored values
  unreadable — permanently. Design for that: a failed read means "sign in again", not "crash".

The honest framing is: SecureStore raises the cost of extraction substantially on a healthy
device and gives you OS-level key management. It does not defeat an attacker who owns the
hardware.

### Accessibility constants

`keychainAccessible` is iOS-only and controls when an entry can be read. The constants
`expo-secure-store` exports are:

| Constant | Behaviour |
| --- | --- |
| `WHEN_UNLOCKED` | Readable only while the device is unlocked (the default) |
| `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | As above, and never migrated to a new device from a backup |
| `AFTER_FIRST_UNLOCK` | Readable after the first unlock following a restart — for background work |
| `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` | As above, not migrated from a backup |
| `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` | Requires a device passcode; the entry is deleted if the user removes it |
| `ALWAYS`, `ALWAYS_THIS_DEVICE_ONLY` | **Deprecated** in the package's own types — they grant access regardless of lock state |

> [!DEPRECATED] `ALWAYS` and `ALWAYS_THIS_DEVICE_ONLY`
> The installed type definitions mark both as deprecated and direct you to a level that provides
> some user protection, such as `AFTER_FIRST_UNLOCK`. Do not use them in new code.

Prefer a `THIS_DEVICE_ONLY` variant for credentials: it keeps the entry out of backups and off a
restored device, which is the scenario where "survives uninstall" turns into "arrived on someone
else's phone".

## Platform differences

:::tabs
@tab iOS
Keychain services store the value under `kSecClassGenericPassword`. `keychainService` maps to
`kSecAttrService` — if you set it when writing, you must pass the same value when reading.
`accessGroup` lets a group of your own apps share entries.

Entries persist across uninstall and reinstall with the same bundle ID. With
`requireAuthentication: true`, the user is prompted when **reading or updating** an existing
value, not when creating a new one.
@tab Android
Values go into SharedPreferences encrypted with the Android Keystore. `keychainService` is the
equivalent of the key-pair alias.

Entries are **not** preserved across uninstall. With `requireAuthentication: true`, user
authentication is required for **all** operations, not just reads. The config plugin's
`configureAndroidBackup` option (default `true`) wires up automatic Android backup to work
correctly with the library.
:::

Because the platforms differ on backup and uninstall behaviour, never treat "the token is still
there" as a cross-platform guarantee. Always be able to recover by re-authenticating.

## Common patterns

### Config plugin setup

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-secure-store",
        {
          "configureAndroidBackup": true,
          "faceIDPermission": "Allow $(PRODUCT_NAME) to unlock your saved sign-in."
        }
      ]
    ]
  }
}
```

Adding or changing a config plugin changes native code, so it requires a new build — see
[expo prebuild](../expo-core-concepts/prebuild.md).

### Split the record: secret in SecureStore, the rest in AsyncStorage

SecureStore is for small strings. Keep the profile blob where it belongs and store only the
credential securely.

```ts title=app/lib/auth-storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

type Profile = {id: string; displayName: string; avatarUrl: string | null};

const REFRESH_KEY = 'auth.refresh_token';
const PROFILE_KEY = 'auth.profile';

export async function persistSignIn(refreshToken: string, profile: Profile): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  // The profile is not a secret; it is display data we want available instantly at launch.
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function clearSignIn(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(REFRESH_KEY),
    AsyncStorage.removeItem(PROFILE_KEY),
  ]);
}
```

### Handle an unreadable entry as a normal state

```ts title=app/lib/read-refresh-token.ts
import * as SecureStore from 'expo-secure-store';

/**
 * Returns null for every failure mode — no entry, biometrics changed and invalidated the
 * key, SecureStore unavailable. The caller's job is then to send the user to sign-in,
 * never to crash.
 */
export async function readRefreshToken(): Promise<string | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }
  try {
    return await SecureStore.getItemAsync('auth.refresh_token', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    return null;
  }
}
```

## Security considerations

**Threat.** An attacker gets filesystem access to the device — a rooted test phone, a stolen
device with a weak passcode, malware with elevated privilege, or an unencrypted backup — and
reads your app's stored data looking for a credential.

**Exploit.** On an Android emulator or a rooted device, AsyncStorage is a file you can read:

```bash
adb shell "run-as com.example.myapp ls -R /data/data/com.example.myapp"
adb shell "run-as com.example.myapp cat /data/data/com.example.myapp/databases/RKStorage" | strings | grep -i token
```

On a debuggable build this needs no exploit at all. The same data is in an ADB backup and, on
iOS, in an unencrypted iTunes/Finder backup.

**Fix.**

1. Move every credential to `expo-secure-store` with a `THIS_DEVICE_ONLY` accessibility
   constant.
2. Keep only non-sensitive data in AsyncStorage, and never an authorisation flag the app trusts.
3. Make the server the authority: short-lived access tokens, a refresh token that can be revoked,
   and re-authentication when a read fails.
4. Consider `requireAuthentication: true` for the highest-value entries, accepting that biometric
   changes invalidate them.

**Verification.** Prove the move worked:

```bash
# 1. Sign in on a debuggable build.
# 2. Confirm the token is NOT in AsyncStorage any more:
adb shell "run-as com.example.myapp cat /data/data/com.example.myapp/databases/RKStorage" | strings | grep -c "eyJ"
# 3. Confirm the app still works after clearing SecureStore, by reinstalling on Android
#    (which drops the entry) and checking you land on the sign-in screen rather than a crash.
```

`eyJ` is the start of a base64-encoded JWT header, which makes it a useful marker for a leaked
token. A count of zero is what you want.

> [!DANGER] Do not encrypt AsyncStorage with a key stored in the bundle
> A common "fix" is to encrypt values before writing them to AsyncStorage. If the encryption key
> is in your JavaScript, it is in the bundle and readable — see
> [What Ships Inside the Bundle](what-ships-in-the-bundle.md). You have added work, not
> protection. If you want encryption at rest, use the platform keystore, which is what
> `expo-secure-store` already does.

## Common mistakes

- **Storing a session token in AsyncStorage.** It is plaintext on disk and can be swept into a
  backup. Wrong: `AsyncStorage.setItem('token', jwt)`. Right:
  `SecureStore.setItemAsync('token', jwt, {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY})`.
- **Copying `3.1.1` from the CLI half for AsyncStorage.** SDK 57 pins `2.2.0`. Use
  `npx expo install`.
- **Assuming uninstall clears SecureStore.** It does on Android; on iOS the Keychain entry
  survives a reinstall with the same bundle ID.
- **Omitting `keychainService` on read after setting it on write.** The entry will not be found.
  The option must match on both calls.
- **Storing large JSON in SecureStore.** Platforms can reject large values, and the failure is a
  native error you must handle. Use [expo-sqlite](../expo-sdk/sqlite.md) for real data.
- **Treating a `requireAuthentication` read failure as a bug.** Biometric enrolment changes
  invalidate those keys by design. Recover by re-authenticating.
- **Storing an authorisation decision on the device.** `{"role": "admin"}` in AsyncStorage is
  editable by the attacker. Authorisation belongs on the server.
- **Encrypting AsyncStorage with a key from `EXPO_PUBLIC_*`.** That key is inlined into the
  bundle. See [EXPO_PUBLIC_ Variables](expo-public-env-vars.md).

## Related topics

- [Secure Store](../expo-sdk/secure-store.md) — the full API surface of the package.
- [File System and Storage](../expo-sdk/file-system-and-storage.md) — the other on-device storage options.
- [SQLite](../expo-sdk/sqlite.md) — structured local data that does not fit in a keychain entry.
- [Biometrics](../expo-sdk/biometrics.md) — `expo-local-authentication` and the `requireAuthentication` option.
- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — why an in-app encryption key is not a key.
- [OAuth with expo-auth-session and PKCE](oauth-and-pkce.md) — where the token you are storing comes from.
- [Dependency Auditing](dependency-auditing.md) — the code running beside your token in the same process.
