---
title: Why Secrets in JS Are Readable
description: Extract string literals from a real release build, including a Hermes bytecode bundle, and see why no API key belongs in an app.
status: current
toolchain: cli
---

Every string literal in your JavaScript ships inside the app binary. Hermes compiles your source
to bytecode, which makes the *code* hard to read — but string constants are stored in a string
table, verbatim, and a ten-second command prints them all. This page shows you the extraction on
a release build so the rule stops being something you were told and becomes something you have
seen.

The conclusion up front: **there is no way to put a secret in a React Native app and keep it
secret.** Not with Hermes, not with obfuscation, not with native code, not with encryption whose
key also ships. The only fix is to not ship the secret.

## Threat

An attacker wants a credential your app uses: a third-party API key, a signing secret, a
service token. They install your app from the store — no rooted device needed on Android — pull
the package, and search it for anything that looks like a key.

This is automated. Scanners crawl store binaries looking for known key formats. A leaked key is
usually found by a bot before a human ever thinks about your app.

## Exploit

### Step 1 — build a real release APK

Do this against a **release** build, not a debug one. A debug build loads the bundle from Metro
and proves nothing.

```bash
cd android
./gradlew assembleRelease
ls app/build/outputs/apk/release/
```

### Step 2 — unzip it

An APK is a zip file. No special tooling is required to open it.

```bash
cd app/build/outputs/apk/release
unzip -o app-release.apk -d extracted
ls extracted/assets/
```

You are looking for `extracted/assets/index.android.bundle`. That name is the React Native
Gradle plugin's default (`bundleAssetName`), so unless you changed it, that is your app's
JavaScript.

### Step 3 — confirm it is Hermes bytecode, not JavaScript

The file keeps the `.bundle` extension whether it contains source or bytecode, so check the
content rather than the name. A Hermes bytecode bundle begins with an eight-byte magic number.
React Native's own loader checks for it in `ReactCommon/cxxreact/JSBundleType.cpp`, where the
constant is `0x1F1903C103BC1FC6` — little-endian, so on disk the first eight bytes are:

```text
c6 1f bc 03 c1 03 19 1f
```

Check yours:

```bash
xxd -l 16 extracted/assets/index.android.bundle
```

If the first bytes match, Hermes compiled it. If you instead see readable JavaScript, Hermes is
disabled for this variant and the situation is even worse — your source is right there.

### Step 4 — read the strings out of the bytecode

This is the step that surprises people. Hermes bytecode is not source, but the string table is
plain data:

```bash
strings -n 8 extracted/assets/index.android.bundle | less
```

Then search for the shapes secrets take:

```bash
strings -n 8 extracted/assets/index.android.bundle \
  | grep -iE 'api[_-]?key|secret|token|password|bearer |AKIA[0-9A-Z]{16}|sk_live_|-----BEGIN'
```

If your app has a key in it, this prints it. So does the URL of every endpoint you call, every
feature-flag name, every error message, and every property name in your API payloads.

> [!DANGER] `strings` is the low-effort attack
> This is not reverse engineering. It is one command against a file anyone can download. A tool
> like `hbctool` or a Hermes disassembler goes considerably further, but you rarely need one:
> the string table alone leaks the secret.

### Step 5 — check the Android resources too

If you use `react-native-config`, the bundle is not the only place to look. Version 1.7.2's
`android/dotenv.gradle` emits every key in your `.env` twice — once as a `buildConfigField` and
once as `resValue "string", k, …`. The second one puts the value into the APK's compiled string
resources:

```bash
# Values from .env end up in the compiled resource table.
strings extracted/resources.arsc | grep -iE 'api[_-]?key|secret|token'

# Or, with the Android SDK build-tools on your PATH:
aapt2 dump strings app-release.apk | grep -iE 'api[_-]?key|secret'
```

### Step 6 — the iOS equivalent

On iOS the bundle is written to `main.jsbundle` inside the `.app`, and React Native's
`scripts/react-native-xcode.sh` runs `hermesc -emit-binary` over it for non-debug builds. The
extension stays `.jsbundle` even though the content is bytecode.

Getting the `.app` out of an App Store build requires a decrypted IPA, which needs a jailbroken
device — a higher bar than Android. But you can run the identical check on your own build output
without any of that:

```bash
# Point at the .app that Xcode produced for a Release configuration.
xxd -l 16 "$APP_PATH/main.jsbundle"
strings -n 8 "$APP_PATH/main.jsbundle" | grep -iE 'api[_-]?key|secret|bearer '
```

Anything you find there is in every copy of the app you ship.

## What Hermes does and does not hide

This distinction matters, because "we use Hermes, so it is bytecode" gets repeated as if it were
a security control.

| Hides | Does not hide |
| --- | --- |
| Readable source structure — your functions become bytecode | **String literals**, which sit in a string table in the clear |
| Local variable names | Property and method names used for dynamic access |
| Comments and formatting | URLs, endpoint paths, error text, feature-flag names |
| Original control flow at a glance | The overall shape of your API, once someone disassembles |

Hermes is a performance feature that happens to raise the effort of casual reading. It is not an
obfuscator, and it was never claimed to be one. See
[Hermes](../core-concepts/hermes.md) for what it is actually for.

## Fix

### 1. The secret does not go in the app

State it as an architectural rule: **the app holds no credential that is not scoped to the
current user and revocable by you.**

That means:

- No third-party API keys. If your app needs to call a third-party API with a secret key, it
  does not call it — your backend does.
- No shared secrets used for request signing. A signing key in the binary is a public key with
  extra steps.
- No "encrypted" keys whose decryption key also ships. The attacker runs your decryption code.

### 2. Put a backend-for-frontend in front of third-party services

The pattern that replaces a client-side key:

```text
app  ──► your backend (holds the third-party key)  ──►  third-party API
```

Your backend authenticates the user, applies its own rate limits and authorisation, then calls
the third party with the real key. The app never sees it. The additional benefit is that you can
rotate the third-party key without shipping an app update — which you cannot do when the key is
in a binary sitting on a hundred thousand devices.

### 3. Use short-lived, revocable tokens

The app should hold an access token with a short lifetime and a refresh token stored in the
platform keystore. Both are scoped to one user, both can be revoked server-side, and neither is
useful to an attacker who extracted them from a build rather than from a device.

```ts title=src/api/client.ts
import * as Keychain from 'react-native-keychain';

const REFRESH_SERVICE = 'com.example.app.refresh';

/** The base URL is configuration, not a secret — it is fine in the bundle. */
const API_BASE = 'https://api.example.com';

async function readRefreshToken(): Promise<string | null> {
  const entry = await Keychain.getGenericPassword({service: REFRESH_SERVICE});
  return entry ? entry.password : null;
}

/**
 * Exchanges the refresh token for a short-lived access token. The exchange
 * happens against your own backend, which is the only party that holds any
 * third-party credentials.
 */
export async function getAccessToken(): Promise<string> {
  const refresh = await readRefreshToken();
  if (!refresh) {
    throw new Error('Not signed in');
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refreshToken: refresh}),
  });

  if (!response.ok) {
    throw new Error(`Refresh failed: ${response.status}`);
  }

  const body = (await response.json()) as {accessToken: string};
  return body.accessToken;
}
```

The refresh token still lives on the device, so it is still extractable from a device the
attacker controls. The difference is that it is one user's token, it expires, and you can kill it
from the server. That is the whole game: reduce the blast radius and keep the kill switch on your
side of the boundary.

## `react-native-config` is configuration, not secrets

`react-native-config` (1.7.2) is a genuinely useful package for per-environment **configuration**.
The trap is the word "env": people carry over the habit of putting secrets in `.env` files from
server-side projects, where the file stays on the server.

Here the values are compiled into the binary. As shown above, on Android each key becomes both a
`BuildConfig` field and a string resource; on iOS the values are written into a generated header
and xcconfig at build time. There is no runtime fetch and no protection.

```ts title=src/config.ts — the right use of react-native-config
import Config from 'react-native-config';

/**
 * These are all public facts about the build. Anyone can read them out of the
 * APK; none of them grant access to anything on their own.
 */
export const appConfig = {
  apiBaseUrl: Config.API_BASE_URL ?? 'https://api.example.com',
  environment: Config.APP_ENV ?? 'production',
  sentryDsn: Config.SENTRY_DSN, // a DSN is a write-only ingest endpoint, not a credential
};
```

> [!WARNING] What must never go in `.env` for a mobile app
> Payment provider secret keys, cloud storage access keys, database credentials, private signing
> keys, admin tokens, or any key whose documentation calls it a "secret key". If a third-party
> dashboard offers both a publishable and a secret key, only the publishable one may ship.

Environment plumbing is covered in
[Environment Configuration](../build-and-release/environment-configuration.md). This page is only
about the security boundary.

## Verification

Prove the fix rather than assuming it. Two checks, both cheap.

### Manual check on your own release build

```bash
cd android && ./gradlew assembleRelease
cd app/build/outputs/apk/release
unzip -o app-release.apk -d extracted
strings -n 8 extracted/assets/index.android.bundle \
  | grep -iE 'api[_-]?key|secret|password|AKIA[0-9A-Z]{16}|sk_live_|-----BEGIN'
strings extracted/resources.arsc | grep -iE 'api[_-]?key|secret'
```

A clean run prints nothing. If it prints something, you have found a real problem and you should
assume the value is already compromised — rotate it rather than only removing it.

### Automated check in CI

Make the grep a build step so a key cannot be reintroduced quietly.

```bash title=scripts/scan-release-bundle.sh
#!/usr/bin/env bash
set -euo pipefail

APK="${1:?usage: scan-release-bundle.sh <path-to-apk>}"
WORK="$(mktemp -d)"
unzip -q -o "$APK" -d "$WORK"

PATTERN='api[_-]?key|secret[_-]?key|AKIA[0-9A-Z]{16}|sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY'

if strings -n 8 "$WORK/assets/index.android.bundle" | grep -qiE "$PATTERN"; then
  echo "FAIL: possible secret in the JS bundle" >&2
  strings -n 8 "$WORK/assets/index.android.bundle" | grep -iE "$PATTERN" >&2
  exit 1
fi

if strings "$WORK/resources.arsc" | grep -qiE "$PATTERN"; then
  echo "FAIL: possible secret in Android string resources" >&2
  exit 1
fi

echo "OK: no obvious secrets in $APK"
```

Tune the pattern to the key formats your vendors actually use — a generic word list produces
false positives, and a check people learn to ignore is worse than no check. Wire it into your
pipeline alongside the rest of [CI for Mobile](../testing/ci-for-mobile.md).

### The rotation check

Ask one question of every credential your app touches: *if this leaked today, how long until it
stops working?* If the answer involves shipping an app update and waiting for users to install
it, the credential is in the wrong place.

## Common mistakes

- **Testing the debug build.** Wrong: `strings` on a debug APK finds nothing because the bundle
  is served by Metro. Right: always run the extraction against `assembleRelease` output.
- **Assuming Hermes bytecode hides strings.** It hides source structure. The string table is
  plain. Step 4 above takes one command.
- **Splitting a key into pieces and reassembling it at runtime.** The pieces are in the same
  binary and the reassembly code is next to them. This costs an attacker minutes.
- **Encrypting the key in the bundle.** The decryption key ships too. You have moved the problem
  one function call to the left.
- **Putting a secret in native Kotlin or Swift instead.** Native code is harder to read than
  Hermes bytecode, but `strings` works on `.so` files and on Mach-O binaries as well. Different
  effort, same outcome.
- **Treating a Sentry DSN or a publishable payment key as a secret.** These are designed to be
  public. Confusing them with real secrets wastes effort you need elsewhere.
- **Forgetting `resources.arsc`.** People scan the JS bundle, find nothing, and miss the copy
  that `react-native-config` wrote into the Android resource table.

## Related topics

- [Threat Model](threat-model.md) — why the binary was never private in the first place.
- [Obfuscation and Its Limits](obfuscation.md) — what R8 and minification change, and what they do not.
- [Keychain and Keystore](secure-storage-keychain-keystore.md) — where the refresh token above belongs.
- [Environment Configuration](../build-and-release/environment-configuration.md) — per-environment builds done properly.
- [Hermes](../core-concepts/hermes.md) — what Hermes bytecode is for.
- [Safe Logging in Release Builds](safe-logging.md) — the other common way a token escapes.
