---
title: Biometrics
description: Face ID, Touch ID and Android BiometricPrompt through react-native-keychain 10 — gating a secret rather than gating a boolean, and the usage description that crashes without it.
status: current
toolchain: cli
---

React Native core has **no biometric API**. There is no `Biometrics` export, no `LocalAuthentication`,
nothing in the 0.87 surface that prompts for a fingerprint or a face.

The verified answer is **`react-native-keychain` 10.0.0**, which is already in this handbook's
dependency table. It is not a "prompt for biometrics" library — it is secure storage where an
item can be locked behind biometric authentication. That distinction is the most important idea
on this page, and it is what makes the feature actually secure rather than decorative.

## Why gating a secret beats gating a boolean

The tempting shape is:

```ts title=Weak — the whole check lives in JavaScript
export async function unlock(authenticate: () => Promise<boolean>): Promise<void> {
  const ok = await authenticate();
  if (ok) {
    // …show the private screen…
  }
}
```

Nothing was protected. The session token was already readable; the biometric check only decided
whether to render a screen. An attacker who can run code in your process — a patched build, a
debugger, a hooking framework on a rooted device — flips that boolean and walks in.

The strong shape stores the secret in the Keychain or Keystore with an access-control policy,
so the **operating system** refuses to return the bytes until biometric authentication succeeds.
There is no boolean to flip: without the prompt, the value does not exist in your process.

```ts title=Strong — the OS holds the secret and the prompt releases it
import * as Keychain from 'react-native-keychain';

export async function loadSessionToken(): Promise<string | null> {
  // The prompt is shown by the OS during this call. Without a successful
  // authentication the promise resolves false and no bytes are returned.
  const credentials = await Keychain.getGenericPassword({
    service: 'session',
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    authenticationPrompt: {title: 'Unlock your account'},
  });

  return credentials === false ? null : credentials.password;
}
```

Use biometrics for exactly this: releasing a credential, a token, an encryption key, or
authorising a transaction. Do not use it as a screen lock over data you have already decrypted.

## Native configuration

:::tabs
@tab iOS

Face ID requires a usage description. **A missing `NSFaceIDUsageDescription` is a crash**, not a
denied prompt — the process is terminated the moment the Face ID prompt would appear. Touch ID
does not require it, which is exactly why this gets shipped: the bug only reproduces on Face ID
hardware.

```xml title=ios/AwesomeProject/Info.plist
<key>NSFaceIDUsageDescription</key>
<string>Used to unlock your account without typing your password.</string>
```

After installing, run `bundle exec pod install` in `ios/`. No entitlement is needed for local
biometrics; the Keychain Sharing capability is only relevant if you use `accessGroup` to share
items between your own apps.

@tab Android

The library's own manifest already declares what it needs, and the manifest merger folds it into
your app:

```xml title=Merged in from react-native-keychain — you do not add these
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
```

Verified by reading `android/src/main/AndroidManifest.xml` in the installed package. They will
appear in your merged manifest, so do not be surprised when a permission audit flags them — see
[Permissions](permissions.md) for how to read the merged manifest.

The prompt itself is `androidx.biometric:BiometricPrompt` (the library pins `1.1.0`), which
means one consistent system dialog across fingerprint, face and iris, and automatic handling of
the vendor differences that made the old `FingerprintManager` unusable.

There is no runtime permission to request. `USE_BIOMETRIC` is install-time.

:::

## Basic example

Write the secret once, read it behind a prompt afterwards:

```ts title=src/auth/session.ts
import * as Keychain from 'react-native-keychain';

const SERVICE = 'session';

/** Store the token so only a successful biometric check can read it back. */
export async function storeSessionToken(userId: string, token: string): Promise<boolean> {
  const result = await Keychain.setGenericPassword(userId, token, {
    service: SERVICE,
    // Invalidated if the user adds or removes a fingerprint or face.
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    // iOS: never leaves this device, and requires a passcode to be set.
    accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    // Android: AES-GCM with authentication required on both read and write.
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  });

  return result !== false;
}

export async function readSessionToken(): Promise<string | null> {
  const credentials = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: {
      title: 'Unlock your account',
      subtitle: 'Use your fingerprint or face', // Android only
      cancel: 'Use password instead', // Android only
    },
  });

  return credentials === false ? null : credentials.password;
}

export async function forgetSession(): Promise<boolean> {
  return Keychain.resetGenericPassword({service: SERVICE});
}
```

Note the return types. `setGenericPassword` and `getGenericPassword` resolve to `false` on
failure rather than rejecting, so `=== false` is the guard. A cancelled prompt, a failed match
and a missing item all land in the same place — see the error handling section below.

## How it works

### Find out what the device has, before you offer it

```ts title=src/auth/biometrics.ts
import * as Keychain from 'react-native-keychain';

export type BiometricKind =
  | 'face-id'
  | 'touch-id'
  | 'optic-id'
  | 'fingerprint'
  | 'face'
  | 'iris'
  | 'none';

export async function detectBiometrics(): Promise<BiometricKind> {
  // Resolves null when the device has no biometric hardware, or has hardware
  // with nothing enrolled. Treat both as 'none'.
  const type = await Keychain.getSupportedBiometryType();

  switch (type) {
    case Keychain.BIOMETRY_TYPE.FACE_ID:
      return 'face-id';
    case Keychain.BIOMETRY_TYPE.TOUCH_ID:
      return 'touch-id';
    case Keychain.BIOMETRY_TYPE.OPTIC_ID:
      return 'optic-id';
    case Keychain.BIOMETRY_TYPE.FINGERPRINT:
      return 'fingerprint';
    case Keychain.BIOMETRY_TYPE.FACE:
      return 'face';
    case Keychain.BIOMETRY_TYPE.IRIS:
      return 'iris';
    default:
      return 'none';
  }
}
```

`BIOMETRY_TYPE` is `TOUCH_ID`, `FACE_ID` and `OPTIC_ID` on Apple platforms, and `FINGERPRINT`,
`FACE` and `IRIS` on Android. Use it to **name the thing in your UI** — a button that says "Use
Face ID" on a fingerprint-only phone reads as broken.

There is also `isPasscodeAuthAvailable()` for "does the device have a passcode at all", and
`getSecurityLevel()` on Android, which reports whether the key material is in secure hardware
(`SECURE_HARDWARE`) or software-backed (`SECURE_SOFTWARE`).

### Access control decides what the prompt actually enforces

`ACCESS_CONTROL` is the policy the OS applies before releasing the item:

| Value | Meaning |
| --- | --- |
| `BIOMETRY_ANY` | Any enrolled biometric. Survives the user adding a new fingerprint |
| `BIOMETRY_CURRENT_SET` | Only the currently enrolled set. **Invalidated** when enrolment changes |
| `BIOMETRY_ANY_OR_DEVICE_PASSCODE` | Biometric, or fall back to the device passcode |
| `BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE` | As above, with the current-set restriction |
| `DEVICE_PASSCODE` | Passcode only |
| `USER_PRESENCE` | Biometric or passcode, whichever the OS prefers |
| `APPLICATION_PASSWORD` | An application-supplied password derives the key |

`BIOMETRY_CURRENT_SET` is the security-conscious default. If an attacker with the unlocked
device enrols their own fingerprint, the stored item is destroyed rather than becoming readable
by them. The cost is real: a user who legitimately adds a finger loses the stored credential and
must sign in again. Decide which of those two failures you would rather explain.

`ACCESSIBLE` is a separate axis and iOS-only — it controls when the item is readable at all,
independent of biometrics. `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` is the strictest: the item never
migrates to a new device via backup, and it does not exist at all if the user has no passcode.

On Android, `STORAGE_TYPE` chooses the cipher: `AES_GCM` requires authentication for every
operation, `AES_GCM_NO_AUTH` does not, `RSA` is asymmetric with biometric authentication, and
`AES_CBC` is deprecated in the library itself. Pick `AES_GCM` when the point is the biometric
gate.

### Handling the outcomes

A cancelled prompt is the normal case, not an error state. Distinguish it from a real failure so
the user is not shown a scary message for tapping Cancel:

```ts title=src/auth/unlock.ts
import * as Keychain from 'react-native-keychain';

export type UnlockResult =
  | {kind: 'ok'; token: string}
  | {kind: 'cancelled'}
  | {kind: 'not-enrolled'}
  | {kind: 'no-item'}
  | {kind: 'error'; message: string};

export async function unlock(): Promise<UnlockResult> {
  const biometry = await Keychain.getSupportedBiometryType();
  if (biometry == null) return {kind: 'not-enrolled'};

  // hasGenericPassword does not prompt, so it is safe to check first.
  const stored = await Keychain.hasGenericPassword({service: 'session'});
  if (!stored) return {kind: 'no-item'};

  try {
    const credentials = await Keychain.getGenericPassword({
      service: 'session',
      authenticationPrompt: {title: 'Unlock your account', cancel: 'Cancel'},
    });
    // A cancelled or failed prompt resolves false rather than rejecting.
    return credentials === false
      ? {kind: 'cancelled'}
      : {kind: 'ok', token: credentials.password};
  } catch (error) {
    // A thrown error means something structural: invalidated key, hardware
    // failure, or the item was destroyed by an enrolment change.
    return {kind: 'error', message: error instanceof Error ? error.message : 'Unknown'};
  }
}
```

`hasGenericPassword` is the useful one for UI: it tells you whether to show an "Unlock" button
at all, without triggering a prompt.

### Always keep a non-biometric path

Biometrics fail for ordinary reasons: wet fingers, a mask, a cracked sensor, a user who never
enrolled, a device with no hardware. If the only way into your app is a fingerprint, some
fraction of users are locked out permanently.

Offer either a passcode fallback (`BIOMETRY_ANY_OR_DEVICE_PASSCODE`) or your own
password/sign-in flow, and make the fallback discoverable from the failed state rather than
buried.

## Platform differences

:::tabs
@tab iOS

- `NSFaceIDUsageDescription` is required for Face ID and its absence terminates the process.
  Touch ID does not need it, so the crash only reproduces on Face ID hardware.
- The user is asked once for permission to use Face ID; a denial is remembered and recoverable
  only through Settings.
- Keychain items survive app uninstall by default. Use
  `ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` or clear on first run if that surprises you.
- `canImplyAuthentication({authenticationType})` reports whether the device can satisfy a policy.
  `AUTHENTICATION_TYPE` is `BIOMETRICS` or `DEVICE_PASSCODE_OR_BIOMETRICS`.
- `cloudSync` and `accessGroup` control iCloud Keychain sync and app-group sharing. Leave sync
  off for anything device-bound.
- Simulators support enrolling and matching a synthetic Face ID or Touch ID from the Features
  menu, which makes the happy path testable without hardware.

@tab Android

- The prompt is `BiometricPrompt` from `androidx.biometric`, so its title, subtitle, description
  and cancel label are all yours to set — the `authenticationPrompt` fields marked Android-only
  map onto exactly these.
- `getSecurityLevel()` reports `SECURE_HARDWARE` or `SECURE_SOFTWARE`. On a device without a
  Trusted Execution Environment, the key is software-backed and the guarantee is weaker. Check
  it before storing something that genuinely must not be extractable.
- Enrolment changes invalidate keys created with `BIOMETRY_CURRENT_SET`. The read then throws
  rather than resolving false, which is why the `try`/`catch` above matters.
- Device-class variation is wide. Face unlock on many Android devices is explicitly classified
  as weak biometrics and may not be usable to release a Keystore key at all.
- Keystore contents are removed when the app is uninstalled, unlike the iOS Keychain.

:::

## Security considerations

**Threat.** Biometric authentication protects against someone holding the unlocked device. It
does not protect against someone who controls the process. The realistic attacks are: a rooted
or jailbroken device with a hooking framework; a repackaged build with your check removed; and
an attacker who enrols their own fingerprint on a device they have taken.

**Exploit.** The bypass for a boolean-gated app is trivial. Every JavaScript check lives in the
bundle, in cleartext, and the bundle is a file inside the APK:

```bash
unzip -o app-release.apk -d /tmp/apk
strings /tmp/apk/assets/index.android.bundle | grep -i "biometr\|unlock"
```

Whatever that prints is the logic an attacker edits. If the secret was already in AsyncStorage
or in a plain file, the check is theatre — the data is readable without ever showing a prompt:

```bash
adb shell run-as com.awesomeproject \
  sqlite3 databases/RKStorage "select * from catalystLocalStorage;"
```

**Fix.**

1. **Store the secret behind the OS policy**, as in the examples above. The bypass then requires
   defeating the Keychain or Keystore, not editing a bundle.
2. **Use `BIOMETRY_CURRENT_SET`** when the threat includes an attacker holding the device. A new
   enrolment destroys the item instead of unlocking it.
3. **Check `getSecurityLevel()` on Android** before treating the storage as hardware-backed.
   `SECURE_SOFTWARE` means the key material can, in principle, be extracted from a compromised
   device.
4. **Keep the released secret short-lived.** Once `getGenericPassword` returns, the value is an
   ordinary string in JavaScript memory. Use it, exchange it for a short-lived server token, and
   do not copy it anywhere else.
5. **Never write it back out in plaintext.** The single most common way this goes wrong is a
   "cache" of the unlocked value in AsyncStorage so the prompt is shown less often.

**Verification.** Prove the prompt is load-bearing rather than cosmetic. Store a credential,
then try to read it around the prompt:

```bash
# 1. Nothing readable in ordinary app storage.
adb shell run-as com.awesomeproject find . -type f -newermt '-5 minutes'
adb shell run-as com.awesomeproject \
  sqlite3 databases/RKStorage "select * from catalystLocalStorage;"

# 2. The Keystore entry exists but its bytes are not in the sandbox.
adb shell run-as com.awesomeproject ls -R files
```

Then, on a test device, add a new fingerprint and reopen the app. With
`BIOMETRY_CURRENT_SET` the read must fail. If it succeeds, the policy is not the one you think
it is.

## Common mistakes

- **Gating a boolean.** Wrong: `if (await authenticate()) showPrivateScreen()` over data you
  already hold. Right: keep the secret in the Keychain/Keystore and let the prompt release it.
- **Shipping without `NSFaceIDUsageDescription`.** Wrong: testing on a Touch ID device and
  assuming it is fine. Right: add the key — its absence is a hard crash on Face ID hardware.
- **No fallback.** Wrong: biometrics as the only way in. Right: passcode or password fallback,
  offered from the failure state. Sensors fail and some users never enrol.
- **Assuming a rejection throws.** Wrong: `try { await getGenericPassword() } catch`. Right: a
  cancelled or failed prompt resolves `false`; only structural failures throw. Handle both.
- **Naming the wrong modality.** Wrong: a "Use Face ID" button on a fingerprint device. Right:
  branch on `getSupportedBiometryType()` and use the real name.
- **Caching the unlocked value.** Wrong: writing the token to AsyncStorage after the first
  unlock so the prompt shows less. Right: that deletes the entire protection; re-prompt instead.
- **Ignoring enrolment invalidation.** Wrong: treating a post-enrolment failure as a bug. Right:
  with `BIOMETRY_CURRENT_SET` it is the feature working. Detect it and send the user through
  sign-in again.
- **Trusting Android storage is hardware-backed.** Wrong: assuming Keystore means a secure
  element. Right: read `getSecurityLevel()`; plenty of devices report `SECURE_SOFTWARE`.

## Related topics

- [Secure Storage: Keychain and Keystore](../security/secure-storage-keychain-keystore.md) — the storage layer this page builds on.
- [Secure Storage](../state-and-data/secure-storage.md) — choosing where credentials live.
- [Permissions](permissions.md) — reading the merged manifest, where `USE_BIOMETRIC` will appear.
- [Root and Jailbreak Detection](../security/root-and-jailbreak-detection.md) — the threat this page cannot defend against alone.
- [Threat Model](../security/threat-model.md) — what biometrics do and do not buy you.
- [Secrets in the Bundle](../security/secrets-in-the-bundle.md) — why a JavaScript-side check is not a control.
