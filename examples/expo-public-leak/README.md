# Example: expo-public-leak

A vulnerable/fixed pair showing what `EXPO_PUBLIC_*` environment variables actually do — with a
script that **proves** the leak rather than asserting it.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · runs in **Expo Go**

## The claim, demonstrated

`EXPO_PUBLIC_*` variables are **inlined into the bundle at build time**. They are a text
substitution Metro performs before bundling, not a runtime secret. The value ends up as a
string constant inside the shipped binary.

`npm run prove-leak` exports the app the way a release build does, then recovers the values out
of the emitted Hermes bytecode **without running the app**. Real output from this machine:

```text
Android Bundled 9181ms index.ts (580 modules)
› android bundles (1):
_expo/static/js/android/index-c3f066814297ce94bd05587feb544fbc.hbc (1.4MB)

Scanning 1 artifact(s):
  dist\_expo\static\js\android\index-...hbc  (1399 kB)

--- Values that SHOULD be recoverable (EXPO_PUBLIC_ prefix) ---
  FOUND    EXPO_PUBLIC_API_URL = https://api.example.com
  FOUND    EXPO_PUBLIC_ANALYTICS_KEY = pk_live_NOT_A_REAL_KEY_6f2b9c1d4e

--- Value that should NOT be in the bundle (no prefix) ---
  ABSENT   SERVER_ONLY_SECRET
```

Both planted values are fake. The negative control matters as much as the positive result: a
variable **without** the `EXPO_PUBLIC_` prefix is not inlined and is genuinely absent from the
bundle, which is what makes the positive finding meaningful rather than an artefact of the
search.

## Why Hermes does not save you

The artifact is `.hbc` — Hermes **bytecode**, not readable JavaScript. People reasonably assume
that hides their strings. It does not. Bytecode obscures control flow and identifier names; the
string table is plain text, and `prove-leak.mjs` recovers it with the same logic as `strings`.

So: compiling to bytecode raises the effort of reading your *logic*. It does nothing for your
*constants*.

## The vulnerable pattern

```ts
// .env
EXPO_PUBLIC_ANALYTICS_KEY=pk_live_...
```

```tsx
// Anywhere in the app
const key = process.env.EXPO_PUBLIC_ANALYTICS_KEY;
```

This is fine for a value that is genuinely public — a public API base URL, a publishable
analytics key the vendor intends to ship client-side. It is **wrong** for anything that grants
privilege: a private API key, a database credential, a signing secret.

## The fix

Renaming the variable does not help; neither does reading it indirectly. The value has to not
be in the build.

1. **Secrets stay server-side.** The client talks to your backend; your backend holds the
   credential and talks to the third party.
2. **The client gets short-lived tokens.** Scoped, expiring, and revocable — so a token
   extracted from a device is worth little and stops working.
3. **Treat every `EXPO_PUBLIC_` value as published.** If you would not put it in a public Git
   repository, it does not belong behind that prefix.

`src/` contains the contrast as plain functions:

- `src/vulnerable.ts` — calls a third-party API directly with a build-time key.
- `src/fixed.ts` — calls your own backend, which holds the key and returns a scoped token.

## What EAS secrets do and do not fix

EAS secrets and build-time environment variables keep a value **out of your repository** and
inject it at build time. That is real and worth doing.

They do **not** make the value secret in the app. If the build inlines it into the JS bundle, it
is in the shipped binary and this same script would find it. EAS secrets protect the value in
transit to the builder, not in the artifact the builder produces.

## Run it

```bash
npm install
```

```bash
npm run prove-leak
```

Takes about a minute; the export step dominates. To see the app itself:

```bash
npx expo start
```

The screen prints both inlined values and shows `SERVER_ONLY_SECRET` as `undefined`, which is
the correct outcome.

## Verify

All of these were run on this project and pass, on Node 22.13.0 or newer:

```bash
npm run tsc
```

```bash
npm run check-deps
```

```bash
npm run config:public
```

```bash
npm run prove-leak
```

`prove-leak` exits non-zero if either expected value is missing **or** if the non-prefixed
control ever shows up — so it fails loudly if the demonstration stops being true in a future
SDK.

## Related reading

- [EXPO_PUBLIC_ Variables and the Leak They Cause](../../content/expo-security/expo-public-env-vars.md)
- [EAS Secrets and Build-Time Variables](../../content/expo-security/eas-secrets.md)
- [What Ships Inside the Bundle](../../content/expo-security/what-ships-in-the-bundle.md)
- [expo-secure-store vs AsyncStorage](../../content/expo-security/secure-store-vs-asyncstorage.md)
