---
title: Biometrics
description: Prompting for Face ID, Touch ID and fingerprint with expo-local-authentication in Expo SDK 57 — checking hardware and enrolment, the authenticate options, error codes, and why a local biometric check is a UI gate rather than authentication.
status: current
toolchain: expo
sdk: 57
---

`expo-local-authentication` shows the system biometric prompt — Face ID or Touch ID on iOS, the
`BiometricPrompt` fingerprint / face / iris sheet on Android — and tells you whether the user passed. It
also reports what hardware exists and what the user has enrolled.

```bash
npx expo install expo-local-authentication
```

That resolves `expo-local-authentication@~57.0.3` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use it for **re-verifying a user who is already signed in**: unlocking the app after it was backgrounded,
confirming a sensitive action, revealing a stored password.

Do **not** use it:

- **As sign-in.** A biometric check proves someone who can unlock this device is holding it. It does not
  identify the user to your server.
- **As the only protection for a secret.** `authenticateAsync` resolves `{success: true}` in JavaScript;
  code that can be hooked or patched can skip the check. To make a secret genuinely unreadable without
  biometrics, store it with [`expo-secure-store`](secure-store.md) and `requireAuthentication: true`,
  which enforces the check in the Keychain / Keystore.
- **To replace server-side authorisation.** A "confirm payment with Face ID" step still needs your server to
  authorise the payment.

## Expo Go vs development build

**Fingerprint and Touch ID work in Expo Go. Face ID needs a development build.**

The Expo documentation states that Face ID authentication for iOS is not supported in Expo Go, and that you
need a [development build](../expo-development-builds/why-you-need-one.md) to test it: Face ID requires
`NSFaceIDUsageDescription`, and that string must be in **your** app's `Info.plist`.

Test on a real device. Simulators and emulators can simulate enrolment and matches, but they do not
enforce the checks the way hardware does.

## Basic example

```ts title=lib/unlock.ts
import * as LocalAuthentication from 'expo-local-authentication';

export type UnlockResult = 'unlocked' | 'cancelled' | 'unavailable' | 'failed';

export async function unlockApp(): Promise<UnlockResult> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) {
    // Offer your own fallback (password, PIN) rather than locking the user out.
    return 'unavailable';
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock MyApp',
    cancelLabel: 'Cancel',
  });

  if (result.success) {
    return 'unlocked';
  }
  if (result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel') {
    return 'cancelled';
  }
  return 'failed';
}
```

## How it works

### Capability checks

| Function | Returns |
| --- | --- |
| `hasHardwareAsync()` | Whether a face or fingerprint sensor exists. |
| `isEnrolledAsync()` | Whether the user has enrolled biometrics. |
| `supportedAuthenticationTypesAsync()` | `AuthenticationType[]`: `FINGERPRINT` (1), `FACIAL_RECOGNITION` (2), `IRIS` (3, Android only). Empty if none. |
| `getEnrolledLevelAsync()` | The strongest enrolled `SecurityLevel`. |

`SecurityLevel` values:

| Value | Meaning |
| --- | --- |
| `NONE` (0) | Nothing enrolled. |
| `SECRET` (1) | Only a PIN, pattern or password. |
| `BIOMETRIC_WEAK` (2) | Weak biometrics, such as 2D camera face unlock. iOS has none. |
| `BIOMETRIC_STRONG` (3) | Strong biometrics: fingerprint, 3D face. |

Use `supportedAuthenticationTypesAsync()` to label your button ("Unlock with Face ID" versus "Unlock with
fingerprint") instead of guessing from the platform.

### `authenticateAsync(options?)`

Resolves a `LocalAuthenticationResult`: either `{success: true}` or
`{success: false, error, warning?}`. It does not reject for a failed match.

| Option | Platform | Meaning |
| --- | --- | --- |
| `promptMessage` | both | Main prompt text. |
| `cancelLabel` | both | Cancel button text. |
| `disableDeviceFallback` | both | Default `false`. When `true`, the system does not fall back to the device passcode after failed attempts; on iOS this switches to the biometrics-only policy. |
| `fallbackLabel` | iOS | Label of the "Use Passcode" button; an empty string hides it. |
| `promptSubtitle` | Android | Subtitle under the message. |
| `promptDescription` | Android | Description in the middle of the prompt. |
| `requireConfirmation` | Android | Default `true`. Hint to require a confirm tap after a passive (face) match. |
| `biometricsSecurityLevel` | Android | `'weak'` (default, Class 2 and 3) or `'strong'` (Class 3 only). |

`cancelAuthenticate()` dismisses an in-progress prompt on Android.

### Error codes

`error` is one of the `LocalAuthenticationError` strings:

| Error | What happened | What to do |
| --- | --- | --- |
| `user_cancel` | User tapped Cancel. | Return quietly. |
| `system_cancel` | The OS dismissed the prompt (app backgrounded, call came in). | Offer to retry. |
| `app_cancel` | Your app cancelled it. | Nothing. |
| `user_fallback` | User chose the fallback button. | Show your own password / PIN flow. |
| `not_enrolled` | No biometrics enrolled. | Offer the non-biometric path. |
| `passcode_not_set` | No device passcode. | Offer the non-biometric path. |
| `not_available` | Hardware unavailable or permission denied. | Offer the non-biometric path. |
| `lockout` | Too many failures; biometrics temporarily disabled. | Fall back to password. |
| `authentication_failed` | The match failed. | Allow retry. |
| `timeout`, `unable_to_process`, `no_space`, `invalid_context`, `unknown` | Platform errors. | Treat as failure; allow retry or fallback. |

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Unlock MyApp with Face ID instead of typing your password."
        }
      ]
    ]
  }
}
```

`faceIDPermission` sets **`NSFaceIDUsageDescription`**. The default is
`"Allow $(PRODUCT_NAME) to use Face ID"`. Touch ID has no usage string.

> [!WARNING] Without `NSFaceIDUsageDescription`, Face ID silently becomes the passcode
> The installed package documents that calling `authenticateAsync` on a Face ID iPhone without
> `NSFaceIDUsageDescription` makes the module authenticate with the **device passcode** instead. Your
> "Face ID" button then shows a passcode sheet, which looks like a bug to users and to App Review. Keep
> the plugin entry, and write a string that says why.
>
> Other packages treat the same missing key differently — [`expo-secure-store`](secure-store.md)'s
> biometric gating crashes the app. Ship the string whenever anything in your app touches Face ID.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": ["expo-local-authentication"]
  }
}
```

The plugin (and the library's own manifest) adds:

- `android.permission.USE_BIOMETRIC`
- `android.permission.USE_FINGERPRINT` — the pre-Android-9 equivalent, kept for older devices

Both are normal permissions, granted at install; there is no runtime prompt. The plugin has no Android
options.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Modalities | Face ID or Touch ID | Fingerprint, face, iris — varies by device |
| Weak biometrics | None | Class 2 (e.g. camera face unlock) allowed unless `biometricsSecurityLevel: 'strong'` |
| Passcode fallback | "Use Passcode" button; `fallbackLabel` customises it | Device credential fallback unless `disableDeviceFallback: true` |
| Usage string | `NSFaceIDUsageDescription` for Face ID | None |
| Permission prompt | Face ID asks once, on first use | None — install-time permission |
| Expo Go | Face ID unsupported | Supported |

## Common patterns

### Lock the app when it returns from the background

```tsx title=components/AppLock.tsx
import * as LocalAuthentication from 'expo-local-authentication';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {AppState, Button, Text, View} from 'react-native';

const LOCK_AFTER_MS = 60_000;

export function AppLock({children}: {children: ReactNode}) {
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        if (Date.now() - backgroundedAt.current > LOCK_AFTER_MS) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  async function unlock() {
    const result = await LocalAuthentication.authenticateAsync({promptMessage: 'Unlock MyApp'});
    if (result.success) {
      setLocked(false);
    }
  }

  if (locked) {
    return (
      <View>
        <Text>MyApp is locked</Text>
        <Button title="Unlock" onPress={unlock} />
      </View>
    );
  }
  return <>{children}</>;
}
```

The OS prompt itself fires `AppState` `inactive` on iOS, so trigger locking from `background`, not
`inactive`, or the prompt locks the app again as soon as it appears.

### Requiring strong biometrics for a sensitive action

```ts title=lib/confirmTransfer.ts
import * as LocalAuthentication from 'expo-local-authentication';

export async function confirmSensitiveAction(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level < LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) {
    return false; // route to password re-entry instead
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirm transfer',
    biometricsSecurityLevel: 'strong',
    // The user must prove biometrics, not merely the device PIN.
    disableDeviceFallback: true,
  });
  return result.success;
}
```

## Security considerations

### A JavaScript `true` is not a cryptographic check

**Threat.** An attacker with the device — or with a hooked or repackaged build — wants to reach data your
app "protects" with biometrics.

**Exploit.** The typical implementation is:

```ts title=lib/weakGate.ts
import * as LocalAuthentication from 'expo-local-authentication';

// WEAK: the secret is readable whether or not this check runs.
export async function revealSecret(read: () => Promise<string | null>): Promise<string | null> {
  const {success} = await LocalAuthentication.authenticateAsync();
  return success ? read() : null;
}
```

The secret sits in storage that is readable without biometrics, and the only thing standing in the way is an
`if`. A runtime hooking tool on a rooted or jailbroken device makes `authenticateAsync` resolve
`{success: true}`, or skips the branch, and the data comes out.

**Fix.** Put the enforcement in the OS keystore. Store the secret with `expo-secure-store` and
`requireAuthentication: true`: the Keychain / Keystore refuses to release the value until the system
biometric check passes, and invalidates it if enrolment changes. Use `expo-local-authentication` for the UI
gate on top.

```ts title=lib/strongGate.ts
import * as SecureStore from 'expo-secure-store';

export async function revealSecretStrong(): Promise<string | null> {
  // The OS prompts, and the OS decides. No JavaScript boolean to patch.
  return SecureStore.getItemAsync('vault_key', {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your vault',
  });
}
```

**Verification.** On a device, write a value with `requireAuthentication: true`, then enrol an additional
fingerprint or face in system settings. Reading the value now resolves `null`: the key was invalidated by
the OS, which a JavaScript-only gate can never do.

### Server-side actions need server-side proof

A biometric prompt before a payment or password change does not tell your server anything. The server must
still require a valid session and, for high-risk actions, a fresh credential or a signed challenge from a
hardware-backed key. Treat the prompt as UX.

## Common mistakes

- **Using a biometric prompt as sign-in.** It proves device possession, not identity.
- **Gating a secret with an `if (success)`.** Use `expo-secure-store` with `requireAuthentication: true`.
- **Testing Face ID in Expo Go.** It is not supported there; use a development build.
- **Omitting `NSFaceIDUsageDescription`.** Face ID quietly becomes a passcode prompt.
- **Not checking `isEnrolledAsync()` first.** Users without biometrics get an error instead of a fallback.
- **Treating every failure as an error.** `user_cancel` and `system_cancel` are normal; handle them quietly.
- **Locking on `inactive`.** The Face ID sheet itself makes the app inactive on iOS.
- **Assuming `'weak'` biometrics are fine for high-value actions.** Pass `biometricsSecurityLevel: 'strong'`.
- **Offering no non-biometric path.** Lockouts and unenrolled devices happen.

## Related topics

- [Secure Store](secure-store.md) — OS-enforced biometric gating of stored secrets.
- [Authentication and OAuth](authentication.md) — actual sign-in.
- [Secure Store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md) — what the keystore protects.
- [Permissions Patterns](permissions-patterns.md) — Face ID's one-time permission prompt.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — needed for Face ID.
