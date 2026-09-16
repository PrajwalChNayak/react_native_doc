---
title: What Ships Inside the Bundle
description: Everything your JavaScript touches is shipped to the device and can be read there. What an Expo build actually contains, how to look inside it, and what that means for secrets.
status: current
toolchain: expo
sdk: 57
---

An Expo app ships as a native binary containing your JavaScript, your assets and your
configuration. All of it lands on hardware the user controls. Anyone with the app file — which
is anyone who can install it — can take it apart.

This page is the foundation for the rest of this section. Once you accept that the bundle is
readable, most security questions in a mobile app answer themselves: the client cannot keep a
secret, so the secret has to live somewhere else.

## Why it exists / when to use it — and when NOT to

Read this before you decide where a credential lives. The common failure is not malice or
incompetence — it is an assumption that a compiled, minified Hermes bytecode bundle is opaque.
It is not. It is a file format with a published structure, and the strings inside it are
recoverable with a text search.

You do **not** need this page to justify skipping ordinary hygiene. Minification, R8 and
bytecode compilation are all worth having. They just buy you time and size, not secrecy.

## Basic example

You can see the whole shipped JavaScript payload without building a binary at all.
`npx expo export` runs the same production bundling pipeline a real build runs and writes the
result to `dist/`.

```bash
npx expo export --platform android
```

On a project with a single screen, that produces:

```text
Starting Metro Bundler

Android Bundled 16065ms index.js (577 modules)

› android bundles (1):
_expo/static/js/android/index-269da0adfdacb404ffcbb13c47b108a7.hbc (1.4MB)

› Files (1):
metadata.json (150B)

Exported: dist
```

That `.hbc` file is Hermes bytecode — your entire application logic, every module you imported,
and every string literal any of them contain. It is 1.4 MB for a hello-world screen because it
also contains React, React Native and the Expo runtime.

## How it works

### The pieces of a shipped app

| Piece | Where it ends up | Readable by the user? |
| --- | --- | --- |
| Your JavaScript | Hermes bytecode inside the app binary | Yes — strings recover with a text search |
| Images, fonts, JSON assets | Files inside the app archive | Yes — unzip |
| `app.json` / `app.config.js` values that reach the client | Baked into the bundle and the manifest | Yes |
| `EXPO_PUBLIC_*` environment variables | **Inlined as string literals** at build time | Yes — see [EXPO_PUBLIC_ Variables](expo-public-env-vars.md) |
| Native code from SDK packages | Compiled `.so` / Mach-O binaries | Yes, with more effort |
| Values in the iOS Keychain / Android Keystore | The device's secure storage, not the binary | Not from the binary |

The last row is the only one that is not part of what you ship. Everything above it travels
with the app.

### Hermes bytecode is a compilation, not an encryption

Hermes compiles your JavaScript ahead of time into bytecode so the app does not have to parse
JavaScript at startup. That is a startup-time optimisation. It changes the *shape* of your code,
not its *secrecy* — string literals survive compilation because the program needs them at
runtime.

The demonstration is one command. Given a project with this line in it:

```tsx-fragment title=app/index.tsx
import {Text} from 'react-native';

export default function Home() {
  return <Text>key: {process.env.EXPO_PUBLIC_API_KEY}</Text>;
}
```

and `EXPO_PUBLIC_API_KEY=sk_live_LEAKDEMO_9f3c21` in `.env`, export and search the output:

```bash
npx expo export --platform android
grep -r -a -c "sk_live_LEAKDEMO_9f3c21" dist/
```

```text
dist/metadata.json:0
dist/_expo/static/js/android/index-269da0adfdacb404ffcbb13c47b108a7.hbc:1
```

The value is in the bytecode. No reverse engineering, no tooling beyond `grep`.

To see the surrounding code rather than just a hit count, export without bytecode and without
minification:

```bash
npx expo export --platform android --no-bytecode --no-minify
grep -a -o ".\{0,60\}sk_live_LEAKDEMO_9f3c21.\{0,40\}" dist/_expo/static/js/android/*.js
```

```text
/React.default.createElement(_reactNative.Text, null, "key: sk_live_LEAKDEMO_9f3c21");
```

> [!NOTE] `--no-bytecode` is a debugging aid
> The CLI prints a warning that disabling bytecode slows startup and should only be used for
> debugging. Use it to inspect your own bundle, never to ship one.

### Inspecting a real build

`npx expo export` covers the JavaScript. To see everything that ships, open the artifact itself.
An `.apk`/`.aab` and an `.ipa` are both zip archives.

:::tabs
@tab Android
```bash
unzip -o app-release.apk -d apk-contents
ls apk-contents/assets            # index.android.bundle / .hbc lives here
ls apk-contents/lib               # native libraries, per ABI
ls apk-contents/res               # drawables, including your icon
```
@tab iOS
```bash
unzip -o MyApp.ipa -d ipa-contents
ls ipa-contents/Payload/MyApp.app        # Info.plist, assets, main.jsbundle
```
:::

Everything listed there is on the device, unencrypted, for every user of your app.

## Platform differences

The exposure is the same on both platforms; the effort differs slightly.

- **Android** — an APK is a plain zip. Anyone can pull it off a device with `adb` or download it
  from a mirror site. There is no meaningful barrier.
- **iOS** — App Store binaries are encrypted with FairPlay, which has to be stripped before the
  Mach-O can be read. On a jailbroken device that is a solved, automated problem, and the
  JavaScript bundle sits in the app's resources outside the encrypted segment anyway. Treat iOS
  as readable too.

Do not build a security argument on "iOS is harder".

## Common patterns

### Move the secret behind an endpoint you control

The pattern that actually works: the client authenticates as *itself* (a user session), and the
server holds the third-party credential.

```ts title=app/lib/weather.ts
// The API key for the weather provider never reaches the device. The client calls
// our own endpoint with the user's session token; the server adds the provider key.
export async function fetchForecast(sessionToken: string, city: string) {
  const response = await fetch(`https://api.example.com/forecast?city=${encodeURIComponent(city)}`, {
    headers: {Authorization: `Bearer ${sessionToken}`},
  });
  if (!response.ok) {
    throw new Error(`forecast failed: ${response.status}`);
  }
  return (await response.json()) as {tempC: number};
}
```

The session token *is* in the app, but it is short-lived, scoped to one user, and revocable.
That is the difference between a credential you can afford to ship and one you cannot.

### Accept that some identifiers must ship

Not every string in the bundle is a secret. These are designed to be public:

- An OAuth **client ID** for a public client (see [OAuth and PKCE](oauth-and-pkce.md)).
- A Firebase web config object, a Sentry DSN, a Mapbox public token.
- Your API's base URL.

The test is not "can someone read it" — they can. The test is "what can someone do with it that
they could not do by using the app normally?" If the answer is nothing, shipping it is fine.

## Security considerations

**Threat.** An attacker downloads your app, extracts the bundle, and searches it for credentials.
This is the cheapest attack in mobile: it costs one command and no skill.

**Exploit.** Reproduce it on your own app right now:

```bash
npx expo export --platform android
grep -r -a -i -E "sk_live|secret|BEGIN RSA|AKIA" dist/
```

Any hit is a credential you have shipped to every user. `AKIA` is an AWS access key ID prefix;
`sk_live` is a common live-secret-key convention; `BEGIN RSA` is a private key.

**Fix.**

1. Move the credential server-side and expose a narrow endpoint instead.
2. If a value genuinely must reach the device, make it short-lived and per-user — a token from
   your own auth system, stored with
   [expo-secure-store](secure-store-vs-asyncstorage.md).
3. Rotate anything you previously shipped. Shipped once means compromised.

**Verification.** Re-run the same `grep` after the change and confirm zero hits, then repeat it
against a real release artifact:

```bash
unzip -p app-release.apk assets/index.android.bundle | grep -a -c "sk_live"
```

Add the export-and-grep to CI so a regression fails the build rather than shipping. See
[Dependency Auditing](dependency-auditing.md) for where this fits alongside other automated
checks.

### What obfuscation and minification really buy

Minification renames local identifiers and strips comments. R8 does the equivalent for the
Android native/Java side. Hermes compiles to bytecode. Together they:

- **Do** make the code smaller and faster to load.
- **Do** make casual reading annoying, which deters low-effort attackers.
- **Do not** protect string literals — those must survive, or the program cannot run.
- **Do not** stop anyone who is actually trying. Treat the delay as hours, not a barrier.

Budget accordingly: obfuscation is a cost-raising measure, never a control you can rely on.

## Common mistakes

- **Assuming Hermes bytecode hides strings.** It does not. `grep -a` on the `.hbc` finds them.
  Wrong: "we compile to bytecode so the key is safe." Right: "the key is in the bytecode, so it
  is not a key we can ship."
- **Renaming the variable to something innocuous.** `EXPO_PUBLIC_X7` inlines exactly the same
  value as `EXPO_PUBLIC_STRIPE_SECRET`. The name is not part of the protection.
- **Putting a credential in `app.json` `extra`.** `extra` is read through `expo-constants` at
  runtime, which means it is in the manifest that ships with the app. Same exposure.
- **Trusting iOS binary encryption.** FairPlay is stripped routinely, and the JavaScript bundle
  is a resource file regardless.
- **Shipping a key "temporarily" for a demo.** Anything shipped is public from that moment.
  Rotate it; do not plan to remove it later.
- **Only scanning source, not output.** A dependency can embed a key too. Scan `dist/`, which is
  what actually ships.

## Related topics

- [EXPO_PUBLIC_ Variables and the Leak They Cause](expo-public-env-vars.md) — the specific mechanism, with a reproducible demonstration.
- [EAS Secrets and Build-Time Variables](eas-secrets.md) — what build-time injection does and does not protect.
- [expo-secure-store vs AsyncStorage](secure-store-vs-asyncstorage.md) — where a token on the device belongs.
- [Bundle Size and Tree Shaking](../expo-performance/bundle-size.md) — the same `expo export` output, read for size instead of secrets.
- [Hermes](../expo-performance/hermes.md) — why the bundle is bytecode in the first place.
- [Dependency Auditing](dependency-auditing.md) — catching a leak in CI before it ships.
