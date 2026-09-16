# Example: expo-auth-gated

Auth-gated routing with **Expo Router's `Stack.Protected`**, plus a session stored in
**expo-secure-store**.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · expo-router 57.0.21 · expo-secure-store ~57.0.4 · runs in **Expo Go**

## How the gate works

```text
src/app/
├── _layout.tsx    SessionProvider + Stack with two Stack.Protected groups
├── (app)/
│   └── index.tsx  only reachable when signed in
└── sign-in.tsx    only reachable when signed out
```

`_layout.tsx` wraps `(app)` in `<Stack.Protected guard={session !== null}>` and `sign-in` in the
opposite guard. When a guard is false, the routes inside it are **removed from the navigator**.
A signed-out user cannot reach `(app)` by any path, including a deep link straight to a
protected URL.

Why gate in the layout rather than in each screen:

- A screen that checks `session` and then redirects has **already mounted**, so the protected
  content can flash for a frame.
- The check has to be repeated in every protected screen, and the one someone forgets is the
  hole.
- Signing in or out needs **no navigation call**. Changing the session flips the guards and the
  router moves on its own. `sign-in.tsx` deliberately does not navigate.

The layout renders nothing until the keychain read on launch finishes, so a signed-in user is
never shown the sign-in screen for a moment first.

`Stack.Protected` was checked against the installed expo-router 57.0.21 types:
`StackClient.d.ts` declares `Protected` with `ProtectedProps` from `views/Protected`.

## What secure-store protects, and what it does not

`src/lib/sessionStore.ts` uses `setItemAsync` / `getItemAsync` / `deleteItemAsync`.
Those names were checked against the installed `expo-secure-store` types.

- **It protects:** the token at rest. On iOS it sits in the Keychain. On Android it is
  encrypted with a key held in the Keystore. Other apps and casual filesystem access can't read
  it.
- **It does not protect against:** a rooted or jailbroken device, an attacker holding the
  unlocked phone, or code running inside your own app. That is why the token is short-lived and
  the server stays the authority.
- **AsyncStorage would be wrong here.** It is unencrypted.

Corrupt, half-migrated or expired entries become `null` and are deleted, so a bad keychain entry
signs the user out instead of crashing the app on launch. `src/lib/sessionLogic.ts` holds that
logic as pure functions, and the tests cover it.

## Run it

```bash
npm install
```

```bash
npx expo start
```

This runs in **Expo Go**: expo-secure-store is part of the SDK 57 module set Expo Go ships.
`app.json` lists `expo-secure-store` in `plugins`. That only matters for a development or
release build, where the plugin configures the native side.

## Verify

Every result below was produced on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm test` | **7 passed**, 1 suite |
| `npm run check-deps` | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, plugins `["expo-router","expo-secure-store"]` |
| `npm run export` | **1,202 modules** → `entry-*.hbc` **2.6 MB** |

The Jest setup needs `@react-native/jest-preset@0.86.3` alongside jest-expo. See
[expo-router-app](../expo-router-app/README.md#a-test-setup-trap-this-example-hit) for the
error you get without it.

## Related reading

- [Redirects and Auth-Gated Routes](../../content/expo-router/redirects-and-auth.md)
- [Secure Store](../../content/expo-sdk/secure-store.md)
- [expo-secure-store vs AsyncStorage](../../content/expo-security/secure-store-vs-asyncstorage.md)
