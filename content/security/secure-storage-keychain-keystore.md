---
title: Keychain and Keystore
description: Where credentials actually belong on iOS and Android, what AsyncStorage leaves in plaintext, and how far hardware-backed storage really goes.
status: current
toolchain: cli
---

A refresh token has to live somewhere on the device. The question is not whether an attacker
with full control of that device can eventually reach it — [the threat model](threat-model.md)
already answered that — but how much of the device they have to control first. Plaintext in a
file needs nothing. A Keychain item gated on biometrics needs a live, unlocked device and a
successful face or fingerprint match.

That difference is the whole value of this page. Platform secure storage does not make a
credential safe; it narrows the set of attackers who can read it and the set of situations in
which it leaks.

## Threat

Three concrete situations, in rough order of how often they actually happen:

1. **A lost or stolen device.** Someone picks up a phone. Whether they can read your token
   depends entirely on where you put it.
2. **A backup.** Android's auto-backup and iOS's unencrypted local backups can copy app files
   to somewhere the user never thought about — a laptop, a cloud account with a weaker password
   than the phone.
3. **A rooted or jailbroken device.** The user did this themselves, or malware did. Every file
   your app owns is readable.

In all three the attacker is reading files, not attacking cryptography. Storage choice is what
decides whether there is anything worth reading.

## Exploit: AsyncStorage is a plaintext database

`@react-native-async-storage/async-storage` (3.1.1) is not encrypted and has never claimed to
be. Its README says so; people install it anyway and put tokens in it. Here is what that means
in practice.

### Where the data actually sits

Read from the installed 3.1.1 package rather than from memory:

| Platform | Location | Format |
| --- | --- | --- |
| Android | `/data/data/<package>/databases/AsyncStorage` (migrated from the older `RKStorage`) | Room/SQLite database, table `Storage`, columns `key` and `value` |
| iOS | `Application Support/<bundle id>/RCTAsyncLocalStorage_V1/` | `manifest.json` plus one file per large entry |

### Step 1 — write a token the wrong way

```ts title=src/auth/badStorage.ts — do not ship this
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Every value written here lands in a SQLite database in the app's data
 * directory, in the clear. Nothing about this call encrypts anything.
 */
export async function saveTokenBadly(refreshToken: string): Promise<void> {
  await AsyncStorage.setItem('refreshToken', refreshToken);
}
```

### Step 2 — read it back without the app

On an emulator, or any device where `adb root` works, no exploit is needed at all:

```bash
# Pull the whole app data directory off a debuggable build.
adb shell run-as com.example.app ls databases

# Copy the database out and read it with any SQLite client.
adb shell run-as com.example.app cat databases/AsyncStorage > AsyncStorage.db
sqlite3 AsyncStorage.db "SELECT key, value FROM Storage;"
```

`run-as` works on a debuggable build without root. On a release build you need root, which is a
one-command flash on an unlocked bootloader. On iOS the equivalent is reading the app container
out of a backup or off a jailbroken device:

```bash
# From a macOS machine with the app container extracted from a backup.
cat "AppData/Library/Application Support/com.example.app/RCTAsyncLocalStorage_V1/manifest.json"
```

The output is your token, as a string, with no further work.

### Step 3 — check the backup path

This is the one people miss, because it leaks without anyone touching the device.

```bash
# Does your manifest allow the OS to back up the app data directory?
grep -n "allowBackup\|fullBackupContent\|dataExtractionRules" \
  android/app/src/main/AndroidManifest.xml
```

Android sets `android:allowBackup="true"` by default. With it on, the contents of
`/data/data/<package>/databases` — including that SQLite file — are eligible for backup and
transfer to a new device. Keychain and Keystore entries are treated differently: Keystore key
material is non-exportable, and a Keychain item marked `ThisDeviceOnly` never migrates.

## What AsyncStorage does not protect

Say this plainly to anyone who proposes it for credentials.

| Claim | Reality |
| --- | --- |
| "It is encrypted" | It is not. It is a SQLite database (Android) and JSON files (iOS). |
| "Only my app can read it" | True only while the OS sandbox holds. Root or a jailbreak removes it. |
| "It is safe in backups" | It is included in backups unless you exclude it explicitly. |
| "Nobody knows my key names" | Key names are in the same database, and in your bundle. |

AsyncStorage is the right tool for cache, preferences, a last-selected tab, a draft. See
[AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) for the performance comparison
between the two general-purpose options — neither of which is a credential store.

> [!DANGER] Encrypted MMKV is not a credential store either
> MMKV supports an encryption key. That key has to come from somewhere, and if it comes from the
> bundle it is [readable](secrets-in-the-bundle.md). The only version of that design which helps
> is one where the MMKV key itself lives in the Keychain or Keystore — at which point you may as
> well put the credential there directly.

## Fix: react-native-keychain

`react-native-keychain` 10.0.0 wraps the iOS Keychain and the Android Keystore behind one API.
Install it and the usual native step:

:::tabs
@tab npm
```bash
npm install react-native-keychain
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-keychain
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-keychain
cd ios && bundle exec pod install
```
:::

### The shape of the API

Every function is verified against the 10.0.0 type definitions. The two you will use most are
`setGenericPassword` and `getGenericPassword`; both resolve to `false` rather than throwing when
there is nothing stored.

```ts title=src/auth/secureStorage.ts
import * as Keychain from 'react-native-keychain';

/** One service string per credential. Namespacing by app id avoids collisions. */
const REFRESH_SERVICE = 'com.example.app.refresh';

/**
 * The username slot is not optional in the API, but it does not have to be a
 * real username — here it records which account the token belongs to, which
 * makes multi-account logout possible without a second store.
 */
export async function storeRefreshToken(
  accountId: string,
  refreshToken: string,
): Promise<boolean> {
  const result = await Keychain.setGenericPassword(accountId, refreshToken, {
    service: REFRESH_SERVICE,
    // iOS: readable only while the device is unlocked, and never restored to a
    // different device from a backup.
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    // Android: AES-GCM in the Keystore without a per-read auth prompt.
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });
  return result !== false;
}

export async function readRefreshToken(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({service: REFRESH_SERVICE});
  // `false` means "nothing stored", which is not the same as an error.
  return credentials === false ? null : credentials.password;
}

export async function clearRefreshToken(): Promise<boolean> {
  return Keychain.resetGenericPassword({service: REFRESH_SERVICE});
}
```

> [!WARNING] `resetInternetCredentials` takes an options object in 10.x
> The internet-credentials variants changed shape. `resetInternetCredentials({server})` is
> correct; passing a bare string compiles in older versions and fails here. If you are upgrading
> from 8.x, check every call site.

### iOS accessibility constants

`accessible` decides when iOS will hand the item back. The default is
`ACCESSIBLE.AFTER_FIRST_UNLOCK`, which is more permissive than most apps need.

| Constant | Readable when | Migrates to a new device |
| --- | --- | --- |
| `ACCESSIBLE.WHEN_UNLOCKED` | Device is unlocked | Yes |
| `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Device is unlocked | No |
| `ACCESSIBLE.AFTER_FIRST_UNLOCK` | After the first unlock since boot | Yes |
| `ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` | After the first unlock since boot | No |
| `ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` | Device is unlocked, and only if a passcode is set | No |
| `ACCESSIBLE.ALWAYS` | Always, locked or not | Yes |

Two rules that follow from the table:

- **Pick a `THIS_DEVICE_ONLY` variant for anything you would not want restored onto a stranger's
  phone from a backup.** The cost is that a legitimate user who restores to a new phone has to
  sign in again, which for a refresh token is the correct trade.
- **`ACCESSIBLE.ALWAYS` exists for background work that must run before first unlock.** If you do
  not have that requirement, do not use it.

`AFTER_FIRST_UNLOCK` is the right choice when a background task must refresh a session while the
screen is locked. `WHEN_UNLOCKED` is the right choice when only foreground code touches the
credential.

### Biometric-gated access

Setting `accessControl` makes the platform require an authentication result before it will
release the item. The prompt is shown by the OS, not by your JavaScript — you cannot draw it, and
you cannot skip it.

```ts title=src/auth/biometricStorage.ts
import * as Keychain from 'react-native-keychain';

const VAULT_SERVICE = 'com.example.app.vault';

/**
 * Stores a value that the OS will only release after a successful biometric
 * check. BIOMETRY_CURRENT_SET invalidates the item if the user enrols a new
 * face or fingerprint, which is what you want for a high-value credential.
 */
export async function storeGatedSecret(value: string): Promise<boolean> {
  const result = await Keychain.setGenericPassword('vault', value, {
    service: VAULT_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    // Android: AES_GCM (as opposed to AES_GCM_NO_AUTH) is the authenticated
    // variant — the Keystore key itself requires user authentication.
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  });
  return result !== false;
}

/**
 * A cancelled prompt rejects. Treat that as "user declined", not as an error
 * worth reporting to a crash service.
 */
export async function readGatedSecret(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: VAULT_SERVICE,
      authenticationPrompt: {
        title: 'Unlock your saved credentials',
        subtitle: 'Used to sign requests to your account',
        cancel: 'Cancel',
      },
    });
    return credentials === false ? null : credentials.password;
  } catch {
    return null;
  }
}

/** Decide what to offer before you offer it. */
export async function biometricsAvailable(): Promise<boolean> {
  const type = await Keychain.getSupportedBiometryType();
  return type !== null;
}
```

`getSupportedBiometryType()` resolves to a `BIOMETRY_TYPE` value —
`TOUCH_ID`, `FACE_ID`, `OPTIC_ID` on Apple platforms, `FINGERPRINT`, `FACE` or `IRIS` on Android
— or `null` when nothing is enrolled. Branch on it before you promise the user a face scan.

The choice between the two biometric access-control constants matters:

| Constant | Behaviour when biometrics change |
| --- | --- |
| `ACCESS_CONTROL.BIOMETRY_ANY` | Item survives; a newly enrolled finger can read it |
| `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` | Item is invalidated when the enrolled set changes |
| `ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE` | Falls back to the passcode |
| `ACCESS_CONTROL.USER_PRESENCE` | Biometrics or passcode, platform's choice |

`BIOMETRY_CURRENT_SET` is the strict option: if someone coerces the user into adding their own
fingerprint, the stored item stops decrypting instead of quietly becoming readable. The cost is
that a user who re-enrols legitimately has to sign in again.

### Android: Keystore, security levels and StrongBox

On Android the credential is encrypted with a key held in the Android Keystore. The key material
is not exportable through the Keystore API even on a rooted device when it is hardware-backed —
the encrypted blob is readable, the key is not usable outside the device.

`react-native-keychain` 10.0.0 attempts the strongest key it can without being asked. Reading
`CipherStorageBase.kt` in the installed package: it checks for the
`FEATURE_STRONGBOX_KEYSTORE` system feature, tries to generate the key with
`setIsStrongBoxBacked(true)`, and on failure logs `StrongBox security storage is not available`
and falls back to a regular Keystore key — which may still be hardware-backed, though not in the
dedicated security chip.

There is no JavaScript flag for StrongBox. What you can do is state a floor and let the call
fail if the device cannot meet it:

```ts title=src/auth/androidSecurityLevel.ts
import {Platform} from 'react-native';
import * as Keychain from 'react-native-keychain';

/**
 * Refuses to store anything unless the Keystore key can be backed by secure
 * hardware. Use this only where a software-backed key is genuinely
 * unacceptable — it will reject some low-end and older devices outright.
 */
export async function storeHardwareBacked(value: string): Promise<boolean> {
  const result = await Keychain.setGenericPassword('account', value, {
    service: 'com.example.app.hardware',
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  });
  return result !== false;
}

/** Report what the device can actually do before you demand it. */
export async function describeSecurityLevel(): Promise<string> {
  if (Platform.OS !== 'android') {
    return 'not applicable';
  }
  const level = await Keychain.getSecurityLevel();
  return level === null ? 'unknown' : String(level);
}
```

The Android storage types, from the installed enum:

| `STORAGE_TYPE` | What it is | Use for |
| --- | --- | --- |
| `AES_GCM_NO_AUTH` | AES-GCM, no per-read authentication | Session and refresh tokens |
| `AES_GCM` | AES-GCM with a Keystore key that requires user authentication | High-value secrets behind biometrics |
| `RSA` | Asymmetric, biometric-gated | Signing keys, key exchange |
| `AES_CBC` | **Deprecated in the package itself** | Nothing new; migrate off it |

## Platform differences

:::tabs
@tab iOS
Items live in the Keychain, a system-wide encrypted database. Access is controlled by the
`accessible` attribute and optionally by an access-control flag backed by the Secure Enclave.

- A `ThisDeviceOnly` item is excluded from encrypted backups and never restores onto another
  device.
- `accessGroup` lets an app group or an app and its extension share an item. Anything you put in
  a shared access group is readable by every app in that group, so scope it deliberately.
- `cloudSync` opts an item into iCloud Keychain synchronisation. Do not set it on a token that
  must stay on one device.
- Keychain items **survive app uninstall** on iOS. A fresh install can find the previous
  installation's credentials. If that is wrong for your app, clear the service on first launch.

@tab Android
Items are encrypted with an Android Keystore key and the ciphertext is stored in app-private
shared preferences.

- Keystore keys are per-app and are destroyed on uninstall, so the stored blob becomes
  permanently undecryptable. This is the opposite of iOS and it surprises people.
- A key generated with `setIsStrongBoxBacked(true)` lives in a separate security chip where the
  device has one. The library tries this automatically and falls back silently apart from a
  `logcat` warning.
- `SECURITY_LEVEL.SECURE_HARDWARE` makes that fallback an error instead of a silent downgrade.
- Biometric prompts go through the AndroidX biometric prompt, so the strings in
  `authenticationPrompt` (`title`, `subtitle`, `description`, `cancel`) all apply here; on iOS
  only `title` is used.
:::

## Verification

Prove the fix rather than trusting the library README.

### 1. Confirm nothing sensitive remains in AsyncStorage

```bash
# Debuggable build, no root needed.
adb shell run-as com.example.app cat databases/AsyncStorage > /tmp/as.db
sqlite3 /tmp/as.db "SELECT key, substr(value, 1, 40) FROM Storage;"
```

Read every row. A key called `user`, `session`, `profile` or `settings` that happens to contain
a token counts as a failure.

### 2. Confirm the Keychain item is not in the same place

Run the same dump after storing through `react-native-keychain`. On Android the value appears as
a base64 ciphertext blob in the app's shared preferences, not as a readable string, and the key
that decrypts it is in the Keystore:

```bash
adb shell run-as com.example.app ls shared_prefs
adb shell run-as com.example.app cat shared_prefs/com.oblador.keychain.xml
```

You should see encrypted bytes. If you can read your token in that output, something is
misconfigured — check that the call actually succeeded rather than resolving to `false`.

### 3. Confirm the biometric gate is real

With a gated item stored, lock the device, then try to read it from a background task. The read
must fail. Then, on Android, remove and re-enrol a fingerprint and read again: with
`BIOMETRY_CURRENT_SET` the read must fail rather than succeed with the new finger.

### 4. Confirm the backup behaviour

```bash
# Android: what does the manifest actually say?
grep -n "allowBackup\|dataExtractionRules\|fullBackupContent" \
  android/app/src/main/AndroidManifest.xml
```

If `allowBackup` is true and you keep anything sensitive in files, either move it into the
Keystore or exclude it with a backup rules file. Verify by taking a backup and inspecting it, not
by reading the manifest and assuming.

## What this still does not buy you

Be precise about the limits, because "we use the Keychain" gets quoted in security reviews as if
it settled the question.

- **A device the attacker controls while unlocked can read anything your app can read.** If your
  app can fetch the token to make a request, so can a debugger attached to your app. Frida
  scripts that hook `getGenericPassword` are published and maintained.
- **Hardware-backed keys protect the key, not the plaintext.** Once your code has decrypted the
  token into a JavaScript string, it is an ordinary string in an ordinary heap.
- **Biometrics authenticate a person to the OS, not to your server.** A successful prompt tells
  you the device owner was present. It does not prove anything to your backend, which still has
  to validate the token it receives.
- **None of this survives a compromised app.** A malicious dependency inside your own bundle runs
  with your app's identity and can call the same APIs. That boundary is covered in
  [Dependency Auditing](dependency-auditing.md).

What it does buy you is real: backups stop leaking, other apps cannot read the item, a lost phone
is not a credential breach, and an attacker needs an unlocked device rather than a file.

## Common mistakes

- **Putting a token in AsyncStorage because it is "only the refresh token".** Wrong:
  `AsyncStorage.setItem('refreshToken', t)`. Right: `Keychain.setGenericPassword(...)` with a
  service and an `accessible` constant. The refresh token is the credential with the longest
  lifetime you hold.
- **Leaving `accessible` at its default.** The default is `AFTER_FIRST_UNLOCK`, which keeps the
  item readable while the screen is locked and lets it migrate in a backup. Choose consciously.
- **Treating `false` as an error.** `getGenericPassword` resolves to `false` when nothing is
  stored. Code that does `const {password} = await Keychain.getGenericPassword()` crashes on a
  fresh install. Check for `false` first.
- **Reporting a cancelled biometric prompt as a crash.** The user tapping Cancel rejects the
  promise. Filter it out or your crash dashboard fills with user decisions.
- **Assuming uninstall behaves the same on both platforms.** iOS Keychain items survive
  uninstall; Android Keystore keys do not. An app that relies on either behaviour is broken on
  one platform.
- **Storing a blob larger than a credential.** The Keychain is for small secrets. Encrypt bulk
  data with a key held in the Keychain instead of pushing megabytes through it.
- **Calling it an encryption layer for the whole app.** It secures the items you put in it.
  Anything you write elsewhere is unaffected.

## Related topics

- [Threat Model](threat-model.md) — what the attacker controls, and why this is about narrowing rather than preventing.
- [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — why an encryption key in the bundle solves nothing.
- [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) — choosing between the two non-secure stores.
- [Secure Storage](../state-and-data/secure-storage.md) — the same library from the data-layer perspective.
- [Biometrics](../platform-apis/biometrics.md) — authenticating the user, as distinct from gating a stored item.
- [Safe Logging in Release Builds](safe-logging.md) — the fastest way to undo all of this.
- [Dependency Auditing](dependency-auditing.md) — the code running beside your credential store.
