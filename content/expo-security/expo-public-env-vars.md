---
title: EXPO_PUBLIC_ Variables and the Leak They Cause
description: EXPO_PUBLIC_ variables are inlined into the bundle as string literals at build time. Extract one yourself in two commands, then use the pattern that actually keeps a secret.
status: current
toolchain: expo
sdk: 57
---

`EXPO_PUBLIC_*` environment variables are a **build-time text substitution**. Metro replaces
every `process.env.EXPO_PUBLIC_FOO` in your code with the literal value before the bundle is
written. There is no runtime lookup, no environment, and no indirection — by the time your app
runs, the variable does not exist, only the string it was replaced with.

The prefix is a warning label, not a feature. `PUBLIC` means public.

This page shows you how to extract one from a bundle on your own machine in two commands, so you
do not have to take anyone's word for it.

## Why it exists / when to use it — and when NOT to

`EXPO_PUBLIC_` exists so you can vary non-secret configuration between builds without editing
source: an API base URL, a feature flag, an analytics environment name, a public OAuth client
ID.

Use it for anything you would be willing to print on the app's About screen.

Do **not** use it for:

| Value | Why not |
| --- | --- |
| API keys with billing or write access | Extractable; an attacker spends your money |
| Third-party secret keys (`sk_live_…`, etc.) | Extractable; usually a full account compromise |
| Private keys, signing keys | Extractable |
| Database credentials | Extractable, and they should never be reachable from a client anyway |
| A "shared secret" used to authenticate the app to your backend | Extractable, so it authenticates nothing |

> [!DANGER] This is not a workaround you can engineer around
> There is no Expo setting that makes an `EXPO_PUBLIC_` value private, because the value is
> substituted into code that must run on the user's device. The only fix is to not put the
> secret in the client.

## Basic example

```bash title=.env
EXPO_PUBLIC_API_URL=https://api.example.com
EXPO_PUBLIC_SENTRY_DSN=https://abc123@o0.ingest.sentry.io/0
```

```ts-fragment title=app/lib/config.ts
// Both of these are fine to ship: a base URL and a Sentry DSN are designed to be public.
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com';
export const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
```

You must write `process.env.EXPO_PUBLIC_API_URL` in full. The substitution is a static text
replacement performed by a Babel plugin, so it cannot see through a variable:

```ts-fragment
// WRONG — nothing to substitute, so this is `undefined` at runtime.
const key = 'EXPO_PUBLIC_API_URL';
const wrong = process.env[key];

// RIGHT — the full member expression is what gets replaced.
const right = process.env.EXPO_PUBLIC_API_URL;

export {wrong, right};
```

That limitation is the clearest evidence of what is happening: it is not an environment, it is
find-and-replace.

> [!NOTE] Where `process.env` gets its TypeScript types
> Expo CLI generates `expo-env.d.ts` in your project root containing a single line —
> `/// <reference types="expo/types" />` — and adds it to your `tsconfig.json` `include`. That
> reference is what declares `process` for an Expo app. The file is git-ignored and regenerated,
> so do not edit it.

## How it works

### The substitution happens in Babel, at build time

`babel-preset-expo` includes an inline-env-vars plugin. It walks your code for
`process.env.<KEY>` member expressions and replaces them when the key starts with
`EXPO_PUBLIC_`. Keys without that prefix are left alone in client code, which is why a
non-prefixed variable in the same `.env` file does not reach the bundle.

The values come from `.env` files loaded by the CLI. For a given `NODE_ENV` mode, the load order
from highest priority to lowest is:

```text
.env.<mode>.local
.env.local            (skipped when mode is "test")
.env.<mode>
.env
```

Shell environment variables take precedence over all of them. `EXPO_NO_DOTENV=1` disables `.env`
loading entirely, and `EXPO_NO_CLIENT_ENV_VARS=1` disables environment-variable injection into
client bundles.

### Demonstrate the leak yourself

This works on any machine with any Expo project. It takes about a minute.

**Step 1 — put a marker value in `.env`.** Two variables: one prefixed, one not.

```bash title=.env
EXPO_PUBLIC_API_KEY=sk_live_LEAKDEMO_9f3c21
SERVER_ONLY_SECRET=sk_live_SERVERONLY_abcdef
```

**Step 2 — read the prefixed one somewhere in the app.**

```tsx-fragment title=app/index.tsx
import {Text} from 'react-native';

export default function Home() {
  return <Text>key: {process.env.EXPO_PUBLIC_API_KEY}</Text>;
}
```

**Step 3 — run the production bundler.**

```bash
npx expo export --platform android
```

```text
env: load .env
env: export EXPO_PUBLIC_API_KEY SERVER_ONLY_SECRET
Starting Metro Bundler

Android Bundled 16065ms index.js (577 modules)

› android bundles (1):
_expo/static/js/android/index-269da0adfdacb404ffcbb13c47b108a7.hbc (1.4MB)

› Files (1):
metadata.json (150B)

Exported: dist
```

**Step 4 — search the emitted bundle.**

```bash
grep -r -a -c "sk_live_LEAKDEMO_9f3c21" dist/
grep -r -a -c "sk_live_SERVERONLY_abcdef" dist/
```

```text
dist/metadata.json:0
dist/_expo/static/js/android/index-269da0adfdacb404ffcbb13c47b108a7.hbc:1
```

```text
dist/metadata.json:0
dist/_expo/static/js/android/index-269da0adfdacb404ffcbb13c47b108a7.hbc:0
```

The `EXPO_PUBLIC_` value is in the shipped bytecode. The non-prefixed one is not — it was loaded
into the CLI's environment (the `env: export` line lists both) but never injected into client
code.

`-a` tells `grep` to treat the binary bytecode file as text. That is the entire tooling
requirement.

**Step 5 — see the substituted code.** Export again without bytecode or minification so the
JavaScript is readable:

```bash
npx expo export --platform android --no-bytecode --no-minify
grep -a -o ".\{0,60\}sk_live_LEAKDEMO_9f3c21.\{0,40\}" dist/_expo/static/js/android/*.js
```

```text
/React.default.createElement(_reactNative.Text, null, "key: sk_live_LEAKDEMO_9f3c21");
```

Note what is *not* there: no `process.env`, no lookup, not even the string concatenation. The
compiler folded the whole expression into one literal. That is what "inlined at build time"
means.

### This is not an Expo flaw

Any client bundle is readable. A React web app built with Vite (`VITE_*`), Next.js
(`NEXT_PUBLIC_*`) or Create React App (`REACT_APP_*`) does exactly the same substitution, and
the result is served to the browser as text. Expo's prefix convention is more honest than most:
it forces you to type `PUBLIC` on the way in.

The lesson generalises. **A program that runs on the user's machine cannot hold a secret from
that user.**

## Common patterns

### The correct shape: server holds the secret, client holds a short-lived token

```text
device                         your server                   third party
  |  POST /session  (credentials)    |                             |
  |--------------------------------->|                             |
  |  <-- short-lived session token --|                             |
  |                                  |                             |
  |  GET /forecast  (session token)  |                             |
  |--------------------------------->|  GET /v1/forecast           |
  |                                  |  (provider secret key)      |
  |                                  |---------------------------->|
  |  <---------- result -------------|<--------- result -----------|
```

The provider's secret key exists only on your server. The device holds a token that is
short-lived, scoped to one user and revocable. If the device is compromised you revoke one
session; you do not rotate a key shared by every install.

```ts-fragment title=app/lib/api.ts
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com';

/** Calls our own backend. No third-party credential is present on the device. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await SecureStore.getItemAsync('session_token');
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_URL}${path}`, {...init, headers});
}
```

`EXPO_PUBLIC_API_URL` is still an `EXPO_PUBLIC_` variable — and that is correct, because the URL
of your own API is not a secret.

### Keep secret-shaped names out of `.env` entirely

If a value must never reach a build, do not let it sit next to ones that do. Put deployment
secrets in your CI provider or in EAS environment variables, and keep `.env` for client
configuration only. See [EAS Secrets and Build-Time Variables](eas-secrets.md).

Add `.env*.local` to `.gitignore`, and check in a `.env.example` that lists key names with empty
values so a new developer knows what to set.

## Security considerations

**Threat.** An attacker installs your app, exports or unpacks the bundle, and reads every
`EXPO_PUBLIC_` value. With a third-party API key they can call that API as you: burn your quota,
run up your bill, or read data the key is authorised for.

**Exploit.** The five steps above. Total cost: `npx expo export` plus `grep`.

**Fix.**

1. Audit every `EXPO_PUBLIC_` variable and classify it: *public by design* or *must not ship*.
2. For anything in the second group, move the call behind your own endpoint and rotate the
   credential — it is compromised from the moment it shipped.
3. Delete the variable from `.env`, from EAS environment variables, and from CI.

**Verification.** Prove the value is gone from the artifact, not just from the source:

```bash
npx expo export --platform android
grep -r -a -i -E "sk_live|sk_test|AKIA|BEGIN (RSA|EC|PRIVATE)" dist/ || echo "no credential-shaped strings found"
```

Wire that into CI so a reintroduced key fails the pipeline. Then confirm the old credential is
actually revoked at the provider — a rotated-but-not-revoked key is still a live key.

> [!WARNING] Renaming does not help
> `EXPO_PUBLIC_CFG_7` and `EXPO_PUBLIC_STRIPE_SECRET_KEY` produce byte-identical bundles apart
> from the identifier. Obscurity is not a control here: the attacker greps for the *value*
> pattern, not the name.

## Common mistakes

- **Treating `EXPO_PUBLIC_` as "an environment variable, so it is on the server".** There is no
  server. The value is a literal in the bundle.
- **Using `process.env[someKey]` and expecting it to work.** The substitution is static; a
  computed key is never replaced and reads as `undefined` at runtime.
- **Prefixing a secret to "make it work".** If a value only reaches the client when you add
  `EXPO_PUBLIC_`, that is the tooling telling you the value should not be in the client.
- **Assuming a secret leaked only into a preview build.** A preview build is distributed to
  testers and can be pulled apart the same way. Treat every artifact as public.
- **Rotating the key but leaving the old one enabled.** Rotation without revocation changes
  nothing for the attacker who already has the old value.
- **Storing an `EXPO_PUBLIC_` value in EAS as a "secret" type variable.** The visibility setting
  controls who can read it in the EAS dashboard and logs, not whether the build inlines it. See
  [EAS Secrets](eas-secrets.md).
- **Only checking `.env`.** A key hard-coded in a source file, or pulled in by a dependency, has
  the same exposure. Scan `dist/`.

## Related topics

- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — everything else that travels with your app.
- [EAS Secrets and Build-Time Variables](eas-secrets.md) — the line between "not in your repo" and "not in your app".
- [expo-secure-store vs AsyncStorage](secure-store-vs-asyncstorage.md) — where the short-lived token goes once the client has it.
- [OAuth with expo-auth-session and PKCE](oauth-and-pkce.md) — why a public client has no secret to leak.
- [Build Profiles per Environment](../expo-build-and-release/environments.md) — varying configuration between builds without varying secrets.
- [App Config](../expo-core-concepts/app-config.md) — where `app.json` values go, and why `extra` is not private either.
