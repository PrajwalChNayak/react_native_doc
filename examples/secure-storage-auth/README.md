# Secure storage and an auth flow

A sign-in screen that stores a session in the **iOS Keychain** and the **Android Keystore** via
`react-native-keychain` 10, restores it on launch, and clears it on sign-out.

Token logic lives in `src/tokenStore.ts` as pure, testable functions; only the three functions
that actually talk to the keychain are async.

## What this protects, and what it does not

This is the part most tutorials get wrong, so it is first.

**What the OS keystore gives you:**

- The token is encrypted at rest by the OS, with the key held outside your app's sandbox.
- Another app cannot read it.
- On a device with a passcode it is hardware-backed — Secure Enclave on iOS, Keystore/StrongBox
  on Android where the hardware supports it.
- With `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, as used here, it is readable only while the device is
  unlocked and **never restored onto a different device from a backup**.

**What it does not give you:**

- It does **not** protect against a compromised device. On a rooted or jailbroken phone, an
  attacker with your unlocked device, or a process attached with a debugger, the token is
  reachable. Client-side storage cannot solve this.
- It is **not** a reason to hold a long-lived credential on the client. The real mitigation is
  that the access token is short-lived and the server can revoke it.
- It does **not** make the app's own code trustworthy. Anything the app can read, an attacker
  who controls the app can read.

**`AsyncStorage` is not an alternative here.** It is unencrypted. On Android it is a Room
database and on iOS a plain file in the app container — readable on a rooted or jailbroken
device, and in some backup scenarios. Never put a token, a password, or anything else sensitive
in it.

## Run it

This directory holds the JavaScript and TypeScript only. Generating a correct 0.87 `android/`
and `ios/` project by hand is not feasible, so create the native projects with the Community CLI
and copy this source in:

```bash
npx @react-native-community/cli@20.2.0 init SecureStorageAuth --version 0.87.1
```

Copy `App.tsx`, `src/`, `__tests__/` and `jest.config.js` into the generated project, then:

```bash
npm install react-native-keychain@10.0.0 react-native-safe-area-context@5.9.1
```

iOS also needs its native dependencies (**macOS with Xcode only**):

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

```bash
npm start
```

```bash
npm run android
```

```bash
npm run ios
```

### Native configuration

If you extend this example to gate the token behind biometrics, iOS requires a usage
description or the app crashes the moment it prompts:

```xml title=ios/SecureStorageAuth/Info.plist
<key>NSFaceIDUsageDescription</key>
<string>Unlock your saved session.</string>
```

This example as written does not prompt for biometrics, so it does not need that key. It is
listed because adding `accessControl` to the `setGenericPassword` options is the obvious next
step and the missing-key crash is otherwise baffling.

## What you should see

- First launch shows the sign-in form. Any email and a non-empty password are accepted — this is
  a local demo with no server.
- After signing in, the screen shows the token expiry.
- **Force-quit and relaunch**: you are still signed in, restored from the keychain, with a brief
  spinner while the read completes.
- Sign out, relaunch: back to the form.

The brief "checking" state is deliberate. A keychain read is asynchronous and can fail, so the
UI must have a third state rather than flashing the login screen at an already-signed-in user.

## API notes for react-native-keychain 10

Verified against the installed package, not from memory:

- `setGenericPassword(username, password, options?)` → `Promise<false | Result>`
- `getGenericPassword(options?)` → `Promise<false | UserCredentials>` — it resolves to `false`
  rather than throwing when nothing is stored, so `if (result === false)` is the check.
- `resetGenericPassword(options?)` → `Promise<boolean>`
- `getSupportedBiometryType()` → `Promise<null | BIOMETRY_TYPE>`

The access token and refresh token are packed into the single password field as JSON so they
rotate atomically. Two separate entries can disagree if one write fails.

`parse()` returns `null` for anything unexpected rather than throwing. A corrupted or
half-migrated entry should sign the user out, not crash the app on launch — and that is what the
tests assert.

## Verify

```bash
npm run tsc
```

```bash
npm test
```

Both pass on Node 22.13.0 or newer — 11 tests covering the round-trip, every malformed-input
case, and the clock-skew window that stops a request going out with a credential that expires
in flight.

The tests do not touch the real keychain: it needs a device or simulator, so the pure functions
are tested directly and the three keychain calls are left as the thin layer they are.

## Related reading

- [Keychain and Keystore](../../content/security/secure-storage-keychain-keystore.md)
- [AsyncStorage vs MMKV](../../content/state-and-data/asyncstorage-vs-mmkv.md)
- [Why Secrets in JS Are Readable](../../content/security/secrets-in-the-bundle.md)
- [Biometrics](../../content/platform-apis/biometrics.md)
