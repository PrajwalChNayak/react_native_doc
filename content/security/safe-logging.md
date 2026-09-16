---
title: Safe Logging in Release Builds
description: Where console output actually goes on a shipped app, what it leaks, and how to strip or redact it without losing your crash diagnostics.
status: current
toolchain: cli
---

`console.log` does not disappear in a release build. It writes to the platform log, where anyone
with a USB cable, a bug report, or in some cases another process can read it. A single
`console.log(response)` on the wrong screen turns a token into something recoverable from a
device that was plugged into a laptop once.

This is the cheapest leak in the section to create and the cheapest to fix. It is also the one
that most often defeats everything else on these pages: there is no point putting a refresh token
in the Keystore and then printing it.

## Threat

Who reads a device log, realistically:

| Reader | How | Effort |
| --- | --- | --- |
| Anyone with physical access and a laptop | `adb logcat`, macOS Console.app | Minutes |
| A support ticket | The user sends a bug report or sysdiagnose containing system logs | None — you asked them to |
| A crash reporting service | Breadcrumbs that capture `console` output, shipped to a third party | None — you configured it |
| A colleague's screen recording | A demo with the log window open | None |
| Malware on a rooted device | Reads everything | Already lost |

Note the second and third rows. The most common way logged secrets escape a device is not an
attacker at all — it is your own diagnostics pipeline faithfully carrying them to a server where
they persist, get indexed, and outlive the session they belonged to.

## Exploit

### Android: `adb logcat`

```bash
# Find the process, then read everything it writes.
adb shell pidof -s com.example.app
adb logcat --pid="$(adb shell pidof -s com.example.app)"

# JavaScript console output arrives under a dedicated tag.
adb logcat -s ReactNativeJS:V

# The search that finds the problem.
adb logcat -d | grep -iE 'bearer |authorization|refresh_token|password|"email"'
```

Run this against your own release build while signing in. Anything that scrolls past is readable
by anyone who can attach to the device — which includes the repair shop, the second-hand buyer
before a factory reset, and whoever the user hands the phone to.

```bash
# A bug report captures the buffer and can be sent anywhere.
adb bugreport bugreport.zip
unzip -p bugreport.zip | grep -iE 'bearer |refresh_token'
```

### iOS: the device console

```bash
# With the device attached, stream its log.
log stream --device --predicate 'processImagePath CONTAINS "YourApp"'

# Or read from a captured archive.
log show --archive sysdiagnose.logarchive --predicate 'eventMessage CONTAINS "Bearer"'
```

macOS Console.app shows the same stream with a search box. A sysdiagnose, which Apple support and
many enterprise MDM tools routinely ask users to produce, contains it.

### The realistic source: a helpful debugging line

Nobody writes `console.log(token)`. They write this:

```ts title=src/api/client.ts — do not ship this
/**
 * Every one of these lines is reasonable while debugging and catastrophic in
 * a release build. The last one prints the Authorization header.
 */
export async function loginBadly(email: string, password: string): Promise<void> {
  console.log('Login attempt', {email, password});

  const response = await fetch('https://api.example.com/login', {
    method: 'POST',
    body: JSON.stringify({email, password}),
  });

  const body = await response.json();
  console.log('Login response', body); // contains accessToken and refreshToken

  console.log('Request config', {
    headers: {Authorization: `Bearer ${(body as {accessToken: string}).accessToken}`},
  });
}
```

And the one that survives code review because it looks like error handling:

```ts title=src/api/errors.ts — also do not ship this
/**
 * The error object from a failed request commonly carries the request config,
 * including headers. Logging the whole thing logs the token.
 */
export function reportFailure(error: unknown): void {
  console.error('Request failed', error);
}
```

Uncaught promise rejections are worth knowing about here too: since React Native 0.82 they raise
`console.error` rather than being swallowed, so a rejected promise carrying a response body now
reaches the device log by default.

## Fix

Three layers, in order of how much you should rely on them: guard, strip, redact.

### 1. `__DEV__` guards, which genuinely remove code

`__DEV__` is not a runtime variable you are hoping is false. Metro's transform pipeline replaces
it with a literal, and on a production build (`dev: false`) a constant-folding pass then removes
the dead branch. Both steps run independently of minification, which matters because React Native
disables JavaScript minification on Hermes builds — see
[Obfuscation and Its Limits](obfuscation.md).

```ts title=src/utils/log.ts
/**
 * The only logger the app calls. In a release build every call site collapses
 * to nothing: `__DEV__` becomes `false`, and constant folding removes the
 * branch along with its arguments.
 */
export const log = {
  debug(...args: unknown[]): void {
    if (__DEV__) {
      console.log(...args);
    }
  },

  warn(...args: unknown[]): void {
    if (__DEV__) {
      console.warn(...args);
    }
  },

  /**
   * Errors are the exception: you want these in release, so they go through
   * redaction rather than through a dev-only guard.
   */
  error(message: string, context?: Record<string, unknown>): void {
    reportError(message, context === undefined ? undefined : redact(context));
  },
};

/** Replace with your crash reporter's API. */
function reportError(message: string, context?: Record<string, unknown>): void {
  if (__DEV__) {
    console.error(message, context);
  }
}

/** Defined in the redaction section below. */
declare function redact(value: Record<string, unknown>): Record<string, unknown>;
```

Two rules that make this work:

- **Nothing calls `console.*` directly.** One logger, enforced by lint, is what makes the guarantee
  checkable.
- **Put the guard around the call, not inside the logger's implementation.** `if (__DEV__)` at the
  call site is what lets the folding pass delete the argument expressions too. A guard inside a
  function that is always called still evaluates the arguments — and building a log string can be
  expensive as well as leaky.

### 2. Strip `console.*` at build time as a backstop

Guards work only where they were written. A Babel plugin catches the ones nobody wrapped, including
calls inside dependencies that Metro transforms with your config.

`babel-plugin-transform-remove-console` is the standard choice. Verified on the registry: version
**6.9.4**, published from the `babel/minify` repository, last updated 2025-02-27. The `6.x` version
number is historical — it is an ordinary Babel plugin with a modern plugin signature and an
`exclude` option.

```js title=babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  env: {
    production: {
      plugins: [
        [
          'transform-remove-console',
          // Keep error and warn so crash reports stay useful. Everything else
          // is removed from the production bundle.
          {exclude: ['error', 'warn']},
        ],
      ],
    },
  },
};
```

> [!WARNING] This removes the arguments too
> The plugin deletes the whole call expression. `console.log(computeExpensiveThing())` removes the
> call to `computeExpensiveThing()` as well. If any of your logging arguments have side effects —
> and some analytics helpers do — you will change behaviour between debug and release. Search for
> logging calls with side-effecting arguments before enabling it.

Note also that `env.production` applies when `BABEL_ENV` or `NODE_ENV` is `production`. React
Native's release bundling sets this, but verify it in your own pipeline rather than assuming; the
verification section below shows how.

### 3. Redact what you deliberately keep

Errors, breadcrumbs and analytics events still ship. Those need redaction, because the thing you
are logging is usually a structure someone else built.

```ts title=src/utils/redact.ts
/** Keys whose values never appear in a log, at any depth. */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'cookie',
  'setcookie',
  'apikey',
  'clientsecret',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'pin',
];

/** Values that look like credentials regardless of the key they sit under. */
const TOKEN_SHAPES: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, // Authorization header values
  /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, // JWT
  /\bsk_(?:live|test)_[A-Za-z0-9]+/g, // payment provider secret keys
  /\bAKIA[0-9A-Z]{16}\b/g, // cloud access key ids
];

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z]/g, '');
  return SENSITIVE_KEYS.some((k) => normalised.includes(k));
}

/** Keeps enough of an email to be useful for support, not enough to be the address. */
function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) {
    return value;
  }
  return `${value[0]}***@${value.slice(at + 1)}`;
}

function redactString(value: string): string {
  let out = value;
  for (const shape of TOKEN_SHAPES) {
    out = out.replace(shape, '[REDACTED]');
  }
  if (out.includes('@') && !out.includes(' ')) {
    out = maskEmail(out);
  }
  return out;
}

/**
 * Walks a value and removes anything that looks like a credential, by key and
 * by shape. Depth-limited so a cyclic or enormous object cannot hang the app
 * on the error path — which is the worst possible place to hang.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[TRUNCATED]';
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return {name: value.name, message: redactString(value.message)};
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? '[REDACTED]' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}
```

Two honest limits on this, because a redaction list is not a security boundary:

- **It is a deny-list.** A key called `sessionMaterial` passes. Prefer logging an identifier — a
  request id, a user id — and looking the rest up server-side, over logging the object and hoping
  the filter catches everything.
- **It runs on data you did not shape.** A third-party SDK's error object can nest a header map
  three levels down under a name you never thought of. The depth walk helps; it does not
  guarantee.

### 4. Never log the whole request or response

The single most effective rule. Log the method, the path, the status and a request id. That is
everything you need to correlate with a server-side log, and none of it is a credential.

```ts title=src/api/logging.ts
/** Safe to ship: identifiers and outcomes, never bodies or headers. */
export function logRequest(
  method: string,
  url: string,
  status: number,
  requestId: string | null,
  durationMs: number,
): void {
  // Strip the query string — it is where tokens and ids hide.
  const path = url.split('?')[0];
  if (__DEV__) {
    console.log(`${method} ${path} -> ${status} (${durationMs}ms) id=${requestId ?? '-'}`);
  }
}
```

Note the query-string strip. Session ids, invite codes and signed URLs live in query strings, and
a URL is the thing people log most casually.

### 5. Audit your crash reporter and analytics

Both commonly capture breadcrumbs, and several capture `console` output automatically.

- Turn off automatic console capture, or point it at your redacting logger.
- Turn off automatic request/response body capture.
- Check what the SDK attaches by default: device identifiers, user email, the last screen's props.
- Confirm what your retention policy actually is on the vendor side. A token in a crash report
  persists for as long as the report does.

## Verification

### 1. Watch the log during a real sign-in on a release build

```bash
adb logcat -c   # clear the buffer
# sign in on the device, then:
adb logcat -d | grep -iE 'bearer |eyJ|refresh|password|"email"|sk_live_'
```

Nothing should match. This is the only test that matters, because it observes the shipped binary
rather than the source.

### 2. Confirm the strip actually ran

The plugin only runs when the production Babel environment is active. Prove it from the artifact:

```bash
unzip -o app-release.apk -d extracted
strings -n 6 extracted/assets/index.android.bundle | grep -c "console.log"
```

Compare with a debug bundle. If the counts are similar, `BABEL_ENV` was not `production` during
bundling and your backstop is not in place.

### 3. Lint `console` out of the codebase

```json title=.eslintrc.json
{
  "rules": {
    "no-console": ["error", {"allow": []}]
  }
}
```

Allow it only in `src/utils/log.ts`, with an inline disable comment that names the reason. Any
other occurrence is then a build failure rather than a review comment somebody missed.

### 4. Test the redactor

```ts-fragment title=src/utils/redact.test.ts
import {redact} from './redact';

test('removes credentials by key and by shape', () => {
  expect(redact({accessToken: 'abc', user: {email: 'a@b.test'}})).toEqual({
    accessToken: '[REDACTED]',
    user: {email: 'a***@b.test'},
  });

  expect(redact('Authorization: Bearer eyJhbGciOi.payload.sig')).toContain('[REDACTED]');

  // Deny-lists miss things. This assertion documents the known gap rather
  // than pretending it does not exist.
  expect(redact({sessionMaterial: 'still-visible'})).toEqual({
    sessionMaterial: 'still-visible',
  });
});
```

### 5. Grep the release bundle for credential shapes

Reuse the scan from [Why Secrets in JS Are Readable](secrets-in-the-bundle.md). It finds hardcoded
secrets, and run against a bundle captured after an authenticated session it finds logging
templates that would have printed one.

## Common mistakes

- **Assuming release builds drop `console`.** They do not. Without a guard or the Babel plugin,
  every call runs and every call writes to the platform log.
- **Guarding inside the logger instead of at the call site.** The arguments are still evaluated and
  the code is still in the bundle. Put `if (__DEV__)` around the call.
- **Logging the error object wholesale.** Request errors carry the config, and the config carries
  the `Authorization` header.
- **Logging a URL with its query string.** Tokens, invite codes and signed URLs all live there.
- **Enabling `transform-remove-console` without checking for side effects in arguments.** The
  plugin deletes the arguments along with the call.
- **Excluding nothing.** Removing `console.error` as well leaves you with silent failures in
  production and nothing in your crash reports.
- **Forgetting the crash reporter.** Stripping `console` from your bundle achieves nothing if the
  SDK is separately capturing breadcrumbs containing the same data.
- **Trusting the redaction deny-list.** It catches the common names and shapes. Log identifiers
  rather than objects and you do not have to trust it.
- **Testing on a debug build.** Debug bundles keep everything. Verify against
  `assembleRelease` output.

## Related topics

- [Console and Logs](../debugging/console-and-logs.md) — how logging works in development, and the tools to use instead.
- [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — the scan that also catches logging templates.
- [Keychain and Keystore](secure-storage-keychain-keystore.md) — the credential this page keeps out of the log.
- [Obfuscation and Its Limits](obfuscation.md) — why minification is not doing this job for you.
- [Crash Reporting](../debugging/crash-reporting.md) — the other pipeline that carries your data off the device.
- [Threat Model](threat-model.md) — where cheap controls like this rank.
