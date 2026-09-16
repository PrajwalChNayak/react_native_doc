---
title: Deep Links and Universal Links
description: How URLs reach an Expo Router 57 app — the custom scheme, Android App Links with assetlinks.json, iOS Universal Links with apple-app-site-association, rewriting incoming paths, and treating every link as untrusted input.
status: current
toolchain: expo
sdk: 57
---

Because every Expo Router screen has a URL, deep linking needs no routing code. A link to
`router://posts/42` or `https://example.com/posts/42` opens `src/app/posts/[id].tsx` with
`id` set to `'42'`, the same way an in-app `Link` would.

What does need work is getting the operating system to hand those URLs to your app. There are two
kinds of link, and they are set up differently:

| | Custom scheme | App Links / Universal Links |
| --- | --- | --- |
| Looks like | `router://posts/42` | `https://example.com/posts/42` |
| Setup | one app config key | app config **plus** a file hosted on your domain |
| Proves you own it | no — any app can claim the scheme | yes — the OS checks your domain |
| Falls back to a website | no | yes, when the app is not installed |

## Why it exists / when to use it — and when NOT to

Use a **custom scheme** for links that only ever come from your own surfaces — an OAuth redirect,
a link inside a notification you send, a QR code in your own app. It is quick and works offline.

Use **App Links and Universal Links** for anything shared publicly: emails, marketing pages,
messages between users. They open the app when it is installed and the website when it is not, and
the domain verification means another app cannot intercept them.

Do **not** treat either as authenticated. A deep link is a URL anyone can construct and any app or
web page can fire at your app. Verification proves the *domain* is yours; it says nothing about who
built the URL. See [Security considerations](#security-considerations).

## Basic example

The SDK 57 template sets a scheme already:

```json title=app.json
{
  "expo": {
    "scheme": "router",
    "plugins": ["expo-router"]
  }
}
```

With that, `router://posts/42` resolves to `src/app/posts/[id].tsx`. Rebuild the native app after
changing `scheme` — it is written into the native projects, so a JavaScript reload does not pick it
up.

Test it on a development build:

:::tabs
@tab Android
```bash
adb shell am start -a android.intent.action.VIEW -d "router://posts/42"
```
@tab iOS
```bash
xcrun simctl openurl booted "router://posts/42"
```
:::

`npx uri-scheme open "router://posts/42" --android` (or `--ios`) does the same.

> [!NOTE] Expo Go vs development build
> Expo Go has its own scheme (`exp://`), so your `scheme` and your verified domains do not apply
> there. Test deep links in a [development build](../expo-development-builds/why-you-need-one.md),
> where the app config you wrote is the one compiled into the app.

## How it works

### From URL to screen

1. The OS delivers the URL to the app — at cold start, or while it is running.
2. If `src/app/+native-intent.tsx` exists, its `redirectSystemPath` can rewrite the path.
3. The router strips the scheme and host and matches the path against the file tree, exactly as it
   would for `router.push`.
4. The screen mounts. Path segments and query parameters are available through
   `useLocalSearchParams`.

An unmatched path renders `+not-found`. On a cold start, a layout with an `anchor` in
`unstable_settings` renders its anchor route beneath the linked screen so back has somewhere to go.

### Building URLs to hand out

`expo-linking`'s `createURL` builds a URL for the current environment, so the same code produces
the right scheme in a development build and a release build:

```tsx title=src/components/share-post.tsx
import * as Linking from 'expo-linking';
import {Button, Share} from 'react-native';

export function SharePost({id}: {id: string}) {
  async function onShare() {
    const url = Linking.createURL(`/posts/${encodeURIComponent(id)}`);
    await Share.share({message: url});
  }

  return <Button title="Share" onPress={onShare} />;
}
```

For links meant to be opened by other people, share your `https://` domain instead — a custom
scheme link does nothing on a device without the app.

### Rewriting incoming paths with `+native-intent`

Old URLs, marketing links and third-party providers rarely match your file tree. Rather than
creating routes for each, rewrite them before routing. The installed types define
`redirectSystemPath` as receiving `{path, initial}` and returning a path, `null`, or a promise of
either:

```tsx title=src/app/+native-intent.tsx
import type {NativeIntent} from 'expo-router';

export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({path}) => {
  try {
    const url = new URL(path, 'https://example.com');

    // A URL shape from an older app version.
    if (url.pathname.startsWith('/p/')) {
      return `/posts/${url.pathname.slice(3)}`;
    }
    return path;
  } catch {
    // Throwing here can crash the app on launch. Fall back to the home route.
    return '/';
  }
};
```

`+native-intent` applies to native only. The types warn that errors thrown inside it may crash the
app, which is why the whole body is wrapped.

## Platform differences

:::tabs
@tab Android App Links
Android verifies an `https` intent filter against a file on your domain.

**1. Declare the intent filter** in the app config. `autoVerify: true` is what asks Android to
verify the domain:

```json title=app.json
{
  "expo": {
    "android": {
      "package": "com.example.router",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{"scheme": "https", "host": "example.com", "pathPrefix": "/posts"}],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

**2. Host `assetlinks.json`** at `https://example.com/.well-known/assetlinks.json`. In an Expo
Router project that also builds for web, `public/.well-known/assetlinks.json` is served at that
path:

```json title=public/.well-known/assetlinks.json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.router",
      "sha256_cert_fingerprints": ["AA:BB:CC:...:FF"]
    }
  }
]
```

The fingerprint is the SHA-256 of the certificate **that signs the installed APK**:

- a local keystore: `keytool -list -v -keystore my-release.keystore`
- credentials managed by EAS: `eas credentials -p android`
- Google Play App Signing: the app signing key certificate shown in the Play Console — not your
  upload key

List every certificate a user might have installed (debug, internal testing, Play) in the array.

**3. Rebuild, install, and check verification** (Android 12 and later):

```bash
adb shell pm verify-app-links --re-verify com.example.router
adb shell pm get-app-links com.example.router
```

A domain showing `verified` opens in the app. Any other state means Android will show a chooser or
open the browser — almost always a fingerprint or hosting problem.

@tab iOS Universal Links
iOS verifies an associated domain against a file on your domain.

**1. Declare the associated domain** in the app config. Write `applinks:` and the host — no
`https://`:

```json title=app.json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.example.router",
      "associatedDomains": ["applinks:example.com"]
    }
  }
}
```

This adds the Associated Domains entitlement, so the App ID must have the capability enabled in
your Apple Developer account.

**2. Host `apple-app-site-association`** at
`https://example.com/.well-known/apple-app-site-association` — no file extension, served over
HTTPS without redirects. In an Expo Router project, place it at
`public/.well-known/apple-app-site-association`:

```json title=public/.well-known/apple-app-site-association
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID1234.com.example.router"],
        "components": [{"/": "/posts/*", "comment": "Post detail pages"}]
      }
    ]
  }
}
```

`TEAMID1234` is your Apple Team ID. The Expo documentation notes the file must not exceed 128 KB
uncompressed.

**3. Rebuild, install, and test from outside the app.** Tap the link in Notes or Messages on a
device. Typing it into Safari's address bar does not trigger a Universal Link, which makes that a
misleading test. Apple fetches the file through its own CDN, so a corrected file can take time to
be picked up by a fresh install.
:::

## Common patterns

### Read the URL the app was opened with

Most screens should not care — the router has already navigated. When you do need the raw URL, for
attribution for example, `expo-linking` exposes `useURL()`:

```tsx title=src/app/_layout.tsx
import * as Linking from 'expo-linking';
import {Stack} from 'expo-router';
import {useEffect} from 'react';

export default function RootLayout() {
  const url = Linking.useURL();

  useEffect(() => {
    if (url) {
      const {queryParams} = Linking.parse(url);
      // Record attribution only; never make an authorisation decision from these values.
      console.log('opened via', queryParams?.utm_source);
    }
  }, [url]);

  return <Stack />;
}
```

### One link format for web and native

If the app also ships on web at `example.com`, the same `https://example.com/posts/42` is the web
page, the Android App Link and the iOS Universal Link. The file tree is the single source of truth
for all three.

## Security considerations

### Threat

A deep link is **attacker-controlled input**. Any app installed on the device can fire an intent
at your scheme, and any web page, email or message can contain a link to your domain. Every path
segment and query parameter reaches your screens as if the user had navigated there.

Custom schemes add a second threat: they are not owned. Another app can register `router://` too,
and on Android the user may be offered a chooser — or the other app may receive the link. Never put
a secret, such as an OAuth code or a password-reset token, in a custom scheme link that a verified
`https` link could carry instead.

### Exploit

A screen that trusts a parameter as a navigation or open target is an open redirect:

```tsx title=src/app/continue.tsx
import {useLocalSearchParams} from 'expo-router';
import {useEffect} from 'react';
import {Linking, Text} from 'react-native';

export default function Continue() {
  const {next} = useLocalSearchParams<{next: string}>();

  useEffect(() => {
    // WRONG: `next` comes from whoever built the link.
    // router://continue?next=https://evil.example/login opens a phishing page
    // that appears to have come from your app.
    Linking.openURL(next);
  }, [next]);

  return <Text>Continuing…</Text>;
}
```

Fire it from a shell and watch the browser open an arbitrary site:

```bash
adb shell am start -a android.intent.action.VIEW -d "router://continue?next=https://evil.example/login"
```

### Fix

Accept only destinations from a fixed allow-list, and treat everything else as a no-op:

```tsx title=src/app/continue.tsx
import {Redirect, useLocalSearchParams} from 'expo-router';

// Internal routes this screen is allowed to continue to. Nothing else is accepted.
const ALLOWED_NEXT = new Set(['/', '/posts', '/settings', '/profile']);

export default function Continue() {
  const {next} = useLocalSearchParams<{next?: string | string[]}>();
  const candidate = typeof next === 'string' ? next : undefined;

  // Exact-match against internal paths: no schemes, no hosts, no "//evil.example".
  const target = candidate && ALLOWED_NEXT.has(candidate) ? candidate : '/';

  return <Redirect href={target} />;
}
```

Three properties make this safe: it compares whole strings rather than prefixes (so
`/settings.evil.example` does not pass a `startsWith('/settings')` check), it never passes the
value to `Linking.openURL`, and a rejected value falls back to a harmless route instead of an error
the attacker can probe.

Apply the same rule to route parameters used in requests: validate the shape, then encode — see
[Dynamic and Catch-All Routes](dynamic-routes.md#security-considerations). And never let a deep
link perform an action by itself; a link to `/transfer?to=…&amount=…` should open a confirmation
screen, not submit.

### Verification

Run the exploit command against the fixed build. The app should land on `/` and no browser should
open. Repeat with variations an attacker would try:

```bash
adb shell am start -a android.intent.action.VIEW -d "router://continue?next=//evil.example"
adb shell am start -a android.intent.action.VIEW -d "router://continue?next=%2Fsettings.evil.example"
xcrun simctl openurl booted "router://continue?next=javascript:alert(1)"
```

The full allow-list treatment, including validating URLs you intend to open externally, is in
[Deep Link Validation](../expo-security/deep-link-validation.md).

## Common mistakes

- **Changing `scheme` or `intentFilters` and only reloading JavaScript.** Both are native
  configuration. Rebuild the app.
- **Testing in Expo Go.** Your scheme and domains are not part of Expo Go. Use a development build.
- **Writing `https://` in `associatedDomains`.** The entry is `applinks:example.com`.
- **Using the upload key's fingerprint in `assetlinks.json`.** With Play App Signing, users install
  an APK signed by Google's app signing key. Use that certificate's SHA-256.
- **Serving `apple-app-site-association` through a redirect** or with an HTML error page at that
  path. Verification fails silently.
- **Testing a Universal Link by typing it into Safari.** That navigates the browser. Tap the link
  from another app.
- **Throwing inside `redirectSystemPath`.** It runs at launch; an exception can crash the app.
  Catch and return a safe path.
- **Trusting a parameter because the link "came from our domain".** Verification covers the domain,
  not the URL's contents. Validate every parameter.

## Related topics

- [Dynamic and Catch-All Routes](dynamic-routes.md) — how path segments become params.
- [Navigation and Params](navigation-and-params.md) — `useLocalSearchParams` and `Redirect`.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — what happens when a link targets a signed-in screen.
- [Linking](../expo-sdk/linking.md) — `expo-linking` in depth.
- [Deep Link Validation](../expo-security/deep-link-validation.md) — the allow-list pattern for every link type.
- [The App Config](../expo-core-concepts/app-config.md) — `scheme`, `intentFilters` and `associatedDomains`.
