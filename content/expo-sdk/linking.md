---
title: Linking
description: expo-linking in Expo SDK 57 — URL schemes, building and parsing deep links, reading the URL that opened the app, opening other apps and Settings, universal links and App Links, and validating incoming links.
status: current
toolchain: expo
sdk: 57
---

`expo-linking` handles URLs in both directions. **Into** your app: registering a URL scheme, reading the
link that launched or resumed the app, and building links that point back at it. **Out of** your app:
opening web pages, the phone dialer, maps, other apps and your app's page in Settings.

```bash
npx expo install expo-linking
```

That resolves `expo-linking@~57.0.10` on SDK 57. It is already a dependency of `expo-router`, so
projects using Expo Router usually have it. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use it to:

- Build a URL that opens a specific screen (`createURL`), for sharing or as an OAuth redirect.
- React to the URL that opened the app when you are **not** using Expo Router.
- Open `https:`, `tel:`, `mailto:` and other apps' URLs, and send the user to Settings.

Do **not** use it:

- **To route inside an Expo Router app.** Expo Router already maps incoming URLs to routes; handling them
  again with a listener causes double navigation. See
  [Deep Links and Universal Links](../expo-router/deep-linking.md).
- **To show web content inside the app.** Use `expo-web-browser`'s `openBrowserAsync` for an in-app browser
  sheet, or a WebView.
- **As a trusted input.** Any app, web page or QR code can open your scheme with any parameters.

## Expo Go vs development build

**The API works in Expo Go, but your own URL scheme does not.** In Expo Go, links into the app use Expo Go's
`exp://` scheme — `createURL('path')` returns something like `exp://127.0.0.1:8081/--/path`. The installed
package documents that in Expo Go for published updates the created URL is "neither stable nor
predictable", and that when a stable URL is needed (for example, authorization callbacks) you should use a
build with your scheme.

Expo's linking guide says that after adding a custom scheme you need to create a new
[development build](../expo-development-builds/why-you-need-one.md) to test it. Universal links and App
Links always need a build, because they depend on your bundle identifier and signing certificate.

## Basic example

```tsx title=components/IncomingLink.tsx
import * as Linking from 'expo-linking';
import {Text} from 'react-native';

export function IncomingLink() {
  // The URL that launched the app, then each URL that arrives while it runs.
  const url = Linking.useLinkingURL();

  if (url === null) {
    return <Text>Opened normally</Text>;
  }

  const {hostname, path, queryParams} = Linking.parse(url);
  return <Text>{`host=${hostname} path=${path} params=${JSON.stringify(queryParams)}`}</Text>;
}
```

## How it works

### Incoming links

| API | Behaviour |
| --- | --- |
| `useLinkingURL()` | Hook: the initial URL, then subsequent ones. Returns the initial URL immediately on reload. |
| `getLinkingURL()` | Synchronous initial URL, or `null`. |
| `getInitialURL()` | Promise of the initial URL, or `null`. |
| `clearInitialURL()` | Clears the cached initial URL so it is not handled twice (Android, iOS). |
| `addEventListener('url', handler)` | Called with `{url}` for links received while running. Returns a subscription with `remove()`. |
| `parseInitialURLAsync()` | `getInitialURL()` passed through `parse()`. |

> [!DEPRECATED] `useURL`
> `Linking.useURL()` is marked deprecated in the installed package. Use `useLinkingURL()`.

### Building and parsing

`createURL(path, {scheme?, queryParams?, isTripleSlashed?})` builds a link to your app for the current
environment:

| Environment | Result of `createURL('orders/42')` |
| --- | --- |
| Development or production build | `myapp://orders/42` (first `scheme` in the app config) |
| Expo Go (development) | `exp://<host>:8081/--/orders/42` |
| Web (production) | `https://<your domain>/orders/42` |

`parse(url)` returns `{scheme, hostname, path, queryParams}`, each nullable. `queryParams` values are
`string | string[] | undefined`, because a key can repeat.

Note that in `myapp://orders/42`, `orders` is the **hostname** and `42` is the **path**. In
`myapp:///orders/42` (triple slash) the whole of `orders/42` is the path. Pick one form and parse
accordingly.

### Outgoing links

| API | Behaviour |
| --- | --- |
| `openURL(url)` | Opens the URL with whatever handles it. Resolves `true`; **rejects** if nothing can open it or the user cancels. |
| `canOpenURL(url)` | Whether some installed app can handle the URL. |
| `openSettings()` | Opens your app's page in the system Settings app. |
| `sendIntent(action, extras?)` | Android only; prefer `expo-intent-launcher`. |

`canOpenURL` on iOS only answers for schemes listed in `LSApplicationQueriesSchemes`; for other schemes it
returns `false` even when the app is installed. On Android 11+ it is subject to package visibility rules.
Often the simpler approach is to call `openURL` and catch the rejection.

```ts title=lib/openExternal.ts
import * as Linking from 'expo-linking';
import {Alert} from 'react-native';

export async function callSupport(): Promise<void> {
  try {
    await Linking.openURL('tel:+441234567890');
  } catch {
    // Tablets and simulators have no dialer; openURL rejects rather than
    // failing silently.
    Alert.alert('Calling is not available on this device.');
  }
}
```

## Native configuration

### URL scheme

```json title=app.json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

`scheme` is a string or an array of strings. `expo.ios.scheme` and `expo.android.scheme` override it per
platform. Rebuild after changing it.

:::tabs
@tab iOS

The top-level `scheme` becomes a `CFBundleURLTypes` entry in the generated `Info.plist`.

To call `canOpenURL` for another app's scheme, declare it:

```json title=app.json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "LSApplicationQueriesSchemes": ["comgooglemaps", "whatsapp"]
      }
    }
  }
}
```

**Universal links** (`https://example.com/...` opening your app) need the Associated Domains entitlement
and an `apple-app-site-association` file served from your domain:

```json title=app.json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.example.myapp",
      "associatedDomains": ["applinks:example.com"]
    }
  }
}
```

No usage-description string is involved in linking.

@tab Android

The top-level `scheme` becomes an intent filter on the main activity.

**App Links** (verified `https://` links) need an intent filter with `autoVerify` and a
`/.well-known/assetlinks.json` file on your domain containing your signing certificate's SHA-256
fingerprint:

```json title=app.json
{
  "expo": {
    "android": {
      "package": "com.example.myapp",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [{"scheme": "https", "host": "example.com", "pathPrefix": "/orders"}],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

No Android permission is required to receive or open links.
:::

### Testing a link

```bash
# iOS Simulator
xcrun simctl openurl booted "myapp://orders/42"

# Android emulator or device
adb shell am start -W -a android.intent.action.VIEW -d "myapp://orders/42"

# Either platform
npx uri-scheme open "myapp://orders/42" --ios
```

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Custom scheme ownership | Not exclusive — another app can register the same scheme | Not exclusive — the user may get a chooser |
| Verified https links | Universal links, via `associatedDomains` + AASA file | App Links, via `intentFilters` `autoVerify` + `assetlinks.json` |
| `canOpenURL` for other apps | Requires `LSApplicationQueriesSchemes` | Subject to package visibility (Android 11+) |
| `openSettings()` | Opens the app's Settings page | Opens the app's details page in system settings |

## Common patterns

### Handling links without Expo Router

```tsx title=hooks/useOrderLinks.ts
import * as Linking from 'expo-linking';
import {useEffect} from 'react';

const ORDER_ID = /^\d{1,12}$/;

export function useOrderLinks(openOrder: (id: string) => void): void {
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (url === null) {
      return;
    }
    const {hostname, path} = Linking.parse(url);
    // Allow-list the shape of the link before acting on it.
    if (hostname === 'orders' && path !== null && ORDER_ID.test(path)) {
      openOrder(path);
    }
    // The initial URL is cached; clear it so a reload does not replay it.
    Linking.clearInitialURL();
  }, [url, openOrder]);
}
```

### Sending the user to Settings after a denied permission

```ts title=lib/openAppSettings.ts
import * as Linking from 'expo-linking';

export async function openAppSettings(): Promise<void> {
  // Once a permission is permanently denied, this is the only way back.
  await Linking.openSettings();
}
```

See [Permissions Patterns](permissions-patterns.md) for the full flow.

## Security considerations

**Threat.** Deep links are attacker-controlled input. A malicious web page, QR code, or app opens
`myapp://...` with parameters of its choosing. Custom schemes are not exclusive, so another app can also
**register** your scheme and receive links meant for you.

**Exploit.** A handler that trusts a URL parameter:

```ts title=lib/vulnerableHandler.ts
import * as Linking from 'expo-linking';

// VULNERABLE: opens whatever URL the link carries.
export function vulnerableHandler(url: string): void {
  const {queryParams} = Linking.parse(url);
  const next = queryParams?.next;
  if (typeof next === 'string') {
    void Linking.openURL(next);
  }
}
```

A page containing `<a href="myapp://login?next=https://evil.example/fake-login">` sends the user from your
trusted app straight to a phishing page. The same pattern with a `token`, `amount` or `action` parameter
lets a link perform actions in the user's session.

**Fix.** Validate against an allow-list; never forward a URL or trigger a state-changing action purely
from link parameters.

```ts title=lib/safeHandler.ts
import * as Linking from 'expo-linking';

const ALLOWED_NEXT = new Set(['/home', '/orders', '/settings']);

export function safeHandler(url: string): string {
  const {queryParams} = Linking.parse(url);
  const next = queryParams?.next;
  // Only internal routes from a fixed set. Everything else goes home.
  return typeof next === 'string' && ALLOWED_NEXT.has(next) ? next : '/home';
}
```

For anything sensitive — OAuth redirects, password-reset links, payment links — use **verified https links**
(universal links / App Links), which the OS delivers only to the app that proves ownership of the domain,
and still require confirmation in the UI before acting. For OAuth, PKCE is what makes an intercepted
redirect useless; see [Authentication and OAuth](authentication.md).

**Verification.**

```bash
adb shell am start -W -a android.intent.action.VIEW -d "myapp://login?next=https://evil.example"
xcrun simctl openurl booted "myapp://login?next=https://evil.example"
```

The app must land on `/home` and must not open a browser.

The full treatment is in [Deep Link Validation](../expo-security/deep-link-validation.md).

## Common mistakes

- **Testing your custom scheme in Expo Go.** Links use `exp://` there. Build a development build after adding
  `scheme`.
- **Handling links manually in an Expo Router app.** The router already does it; you navigate twice.
- **Trusting query parameters.** Validate against an allow-list.
- **Using a custom scheme for sensitive links.** Any app can register it. Use universal links / App Links.
- **Confusing hostname and path.** In `myapp://orders/42`, `orders` is the hostname.
- **Relying on `canOpenURL` on iOS without `LSApplicationQueriesSchemes`.** It returns `false`.
- **Not catching `openURL`.** It rejects when nothing can handle the URL.
- **Using `useURL`.** It is deprecated; use `useLinkingURL`.
- **Hard-coding `myapp://` instead of `createURL`.** The link breaks in Expo Go and on web.
- **Handling the initial URL twice.** Call `clearInitialURL()` after acting on it.

## Related topics

- [Deep Links and Universal Links](../expo-router/deep-linking.md) — how Expo Router maps URLs to routes.
- [Deep Link Validation](../expo-security/deep-link-validation.md) — the complete threat model.
- [Authentication and OAuth](authentication.md) — redirect URIs and why PKCE matters for scheme interception.
- [Notifications](notifications.md) — routing from a notification tap.
- [Permissions Patterns](permissions-patterns.md) — `openSettings()` after a denial.
- [The App Config](../expo-core-concepts/app-config.md) — `scheme`, `associatedDomains` and `intentFilters`.
