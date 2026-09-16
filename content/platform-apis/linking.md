---
title: Linking
description: Opening URLs, registering your own scheme, handling incoming links from cold and warm starts, and why an incoming URL is untrusted input.
status: current
toolchain: cli
---

`Linking` is the boundary between your app and every other app on the device. It goes both
ways: outbound, you open a URL and the OS decides who handles it; inbound, someone else opens a
URL and the OS hands it to you.

The outbound half is four methods and one gotcha. The inbound half is where the interesting
problems live — native configuration you cannot skip, a cold-start path that behaves differently
from the warm-start path, and the fact that **anything arriving through a link is input from
outside your app**.

## Why it exists — and when NOT to use it

Use `Linking` to leave the app deliberately: open a web page, start a phone call, compose an
email, hand off to a maps app. Use the inbound half to let a push notification, an email, or a
web page land the user on the right screen.

Do not use `Linking.openURL` for a web page you want the user to come back from — that is what
an in-app browser or a WebView is for; leaving the app for a help article is a bad flow and
loses your navigation state. And do not use raw `Linking` for deep-link routing if you already
use React Navigation: it has a linking configuration that maps URLs to routes and handles the
cold-start case for you. See [Deep Linking](../navigation/deep-linking.md).

## The API

Verified from the 0.87.1 type definitions:

| Method | Returns | Notes |
| --- | --- | --- |
| `openURL(url)` | `Promise<void>` | Rejects if nothing can handle it |
| `canOpenURL(url)` | `Promise<boolean>` | On iOS, gated by `LSApplicationQueriesSchemes` |
| `getInitialURL()` | `Promise<string \| null \| undefined>` | The URL that cold-started the app |
| `addEventListener('url', listener)` | `EventSubscription` | Links arriving while running |
| `openSettings()` | `Promise<void>` | Opens your app's settings page |
| `sendIntent(action, extras?)` | `Promise<void>` | **Android only** |

## Native configuration

Outbound links need no configuration on Android and one array on iOS. Inbound links need real
setup on both.

:::tabs
@tab iOS

**To be opened by a custom scheme** (`awesomeapp://order/1042`), register it:

```xml title=ios/AwesomeProject/Info.plist
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.awesomeproject</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>awesomeapp</string>
    </array>
  </dict>
</array>
```

**To use `canOpenURL` at all**, list every scheme you will ask about. iOS returns `false` for
any scheme not in this array, even when the app is installed — it is an anti-enumeration
measure, not a bug:

```xml title=ios/AwesomeProject/Info.plist
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>whatsapp</string>
  <string>tg</string>
  <string>comgooglemaps</string>
</array>
```

The array is capped at **50 entries** and its contents are visible to App Review. Some
well-known schemes (`http`, `https`, `tel`, `mailto`, `sms`) do not need listing.

**To receive links, the app delegate must forward them.** These are the real class methods from
`RCTLinkingManager.h` in react-native 0.87.1:

```objc title=ios/AwesomeProject/AppDelegate.mm
#import <React/RCTLinkingManager.h>

// Custom-scheme links.
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options {
  return [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links.
- (BOOL)application:(UIApplication *)application
    continueUserActivity:(NSUserActivity *)userActivity
      restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *))restorationHandler {
  return [RCTLinkingManager application:application
                   continueUserActivity:userActivity
                     restorationHandler:restorationHandler];
}
```

**For Universal Links** (`https://awesomeproject.example/order/1042`), add the
`com.apple.developer.associated-domains` entitlement with `applinks:awesomeproject.example`, and
serve an `apple-app-site-association` JSON file from
`https://awesomeproject.example/.well-known/apple-app-site-association` with the correct content
type and no redirect. iOS fetches it when the app installs; a wrong file means the link opens in
Safari and you get no error anywhere.

@tab Android

**To be opened by a custom scheme**, add an intent filter to your main activity. `launchMode`
matters: without `singleTask`, a link opens a second copy of your activity instead of delivering
to the running one.

```xml title=android/app/src/main/AndroidManifest.xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask"
  android:exported="true">

  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- awesomeapp://order/1042 -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="awesomeapp" />
  </intent-filter>

  <!-- https://awesomeproject.example/… — autoVerify makes these App Links -->
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="awesomeproject.example" />
  </intent-filter>
</activity>
```

`android:autoVerify="true"` turns the filter into a verified **App Link**, which requires a
`assetlinks.json` at `https://awesomeproject.example/.well-known/assetlinks.json` containing your
package name and signing-certificate fingerprint. Without verification the link shows a
disambiguation dialog instead of opening your app.

**To query other apps** on Android 11+ (API 30), package visibility applies. `canOpenURL` returns
`false` for an installed app you have not declared:

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <data android:scheme="https" />
    </intent>
    <package android:name="com.whatsapp" />
  </queries>
</manifest>
```

:::

> [!WARNING] Verify App Links and Universal Links on a real device
> Both are verified against a file on your server, at install time, over the network. A
> misconfigured file fails silently: the link opens a browser and nothing in your app logs
> anything. Test with `adb shell am start -W -a android.intent.action.VIEW -d "https://…"` and
> with `adb shell pm get-app-links <package>` on Android.

## Basic example

Opening a URL, with the check that matters:

```tsx title=src/links/open.ts
import {Alert, Linking} from 'react-native';

export async function openExternal(url: string): Promise<void> {
  try {
    // canOpenURL answers "is there a handler", not "will it succeed".
    // On iOS it is false for any scheme missing from LSApplicationQueriesSchemes.
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Cannot open this link', 'No app on this device handles it.');
      return;
    }
    await Linking.openURL(url);
  } catch {
    // openURL rejects when the OS refuses, which canOpenURL does not always predict.
    Alert.alert('Cannot open this link');
  }
}
```

Handling incoming links, both paths:

```tsx title=src/links/useIncomingLink.ts
import {useEffect} from 'react';
import {Linking} from 'react-native';

export function useIncomingLink(handle: (url: string) => void): void {
  useEffect(() => {
    let cancelled = false;

    // Cold start: the app was launched by the link. This resolves once.
    void Linking.getInitialURL().then(url => {
      if (!cancelled && url != null) handle(url);
    });

    // Warm start: the app was already running. This fires every time.
    const sub = Linking.addEventListener('url', ({url}) => handle(url));

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [handle]);
}
```

**Both are required.** `getInitialURL` never fires for a link that arrives while the app is
running, and the `url` event never fires for the link that started it. Implementing one and not
the other produces a bug that only reproduces in one launch state, which is why it survives
testing.

## How it works

### Well-known schemes

`openURL` works with any scheme the OS knows. The common ones:

```ts title=src/links/actions.ts
import {Linking} from 'react-native';

export const call = (number: string) => Linking.openURL(`tel:${encodeURIComponent(number)}`);
export const sms = (number: string) => Linking.openURL(`sms:${encodeURIComponent(number)}`);
export const email = (address: string, subject: string) =>
  Linking.openURL(`mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}`);
export const web = (url: string) => Linking.openURL(url);

/** Opens this app's own page in the system Settings app. */
export const appSettings = () => Linking.openSettings();
```

`encodeURIComponent` on every interpolated value is not optional. A phone number with a `#`
(extension dialling) or an email subject with an `&` silently truncates the URL otherwise.

### Custom schemes versus verified links

| | Custom scheme | Universal / App Link |
| --- | --- | --- |
| Looks like | `awesomeapp://order/1042` | `https://awesomeproject.example/order/1042` |
| Setup | Info.plist / manifest only | Also a file served from your domain |
| Ownership | **Any app can claim the same scheme** | Cryptographically tied to your domain |
| Fallback when not installed | Nothing happens | Opens the web page |
| Use for | Internal, app-to-app handoff | Anything a user or a third party will click |

The ownership row is the important one. Custom schemes are first-come, first-served on Android
and ambiguous on iOS — another app can register `awesomeapp://` and intercept your links. Use
verified links for anything that carries meaning, and treat a custom scheme as a convenience.

### `sendIntent` is Android-only

```tsx title=src/links/androidIntent.ts
import {Linking, Platform} from 'react-native';

export async function openWifiSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Android intent actions have no iOS equivalent; this method does not exist there.
  await Linking.sendIntent('android.settings.WIFI_SETTINGS');
}
```

## Platform differences

:::tabs
@tab iOS

- `canOpenURL` is gated by `LSApplicationQueriesSchemes`. An unlisted scheme returns `false`
  even when the app is installed, and the array is capped at 50.
- `openURL` for an unregistered custom scheme rejects; for `https` it always succeeds because
  Safari handles it.
- Universal Links opened from within your own app, or typed into Safari, deliberately do **not**
  come back to your app — iOS treats that as the user asking for the web page.
- A Universal Link arrives through `continueUserActivity`, a custom scheme through
  `application:openURL:options:`. Both must be forwarded or only one kind of link works.
- `openSettings()` opens your app's own settings page, which is the destination for a `blocked`
  permission; see [Permissions](permissions.md).

@tab Android

- Package visibility (API 30+) means `canOpenURL` returns `false` for apps you have not declared
  in `<queries>`.
- `launchMode="singleTask"` is what makes a link reach the running activity. Without it you get
  a second activity instance and confusing back-stack behaviour.
- App Links need `assetlinks.json` and network verification at install. Check the result with
  `adb shell pm get-app-links <package>`.
- `sendIntent` exists only here, and is the escape hatch for actions with no URL form.
- Any app can register the same custom scheme, and the user is shown a chooser. There is no
  concept of scheme ownership without App Link verification.

:::

## Security considerations

**Threat.** An incoming URL is **input from an attacker-controlled source**. A link can be sent
in an email, embedded in a web page, put in a QR code, posted in a chat, or triggered by another
app on the device. Your handler runs with your app's full authority and, on the cold-start path,
often before the user has done anything.

The consequences worth naming: navigating to an authenticated screen with an attacker-chosen
identifier; passing an attacker-chosen URL to a WebView; storing an attacker-chosen token; or
forwarding the whole link somewhere else.

**Exploit.** Here is a handler that looks reasonable and is not:

```ts title=Vulnerable — trusts whatever the URL says
import {Linking} from 'react-native';

export function handleLink(url: string): void {
  const target = new URL(url);
  // Takes a URL out of a query parameter and opens it. This is an open redirect
  // with the device's full app list behind it.
  const next = target.searchParams.get('next');
  if (next != null) void Linking.openURL(next);
}
```

Anyone can now make your app open anything:

```bash
# Android — any app or any web page can fire this.
adb shell am start -a android.intent.action.VIEW \
  -d "awesomeapp://open?next=https%3A%2F%2Fphish.example%2Flogin"

# iOS simulator.
xcrun simctl openurl booted "awesomeapp://open?next=https://phish.example/login"
```

The user sees a link that came from your app and lands on a page that looks like your login.

**Fix.** Parse, allow-list, and never forward a URL you were handed.

```ts title=src/links/route.ts
/** Routes an incoming link, or returns null. Nothing here trusts the input. */
const HOSTS = new Set(['awesomeproject.example']);
const ROUTES: Record<string, RegExp> = {
  order: /^[0-9]{1,12}$/,
  article: /^[a-z0-9-]{1,64}$/,
};

export function routeFromLink(raw: string): {screen: string; id: string} | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // Not a URL at all.
  }

  // 1. Allow-list the scheme. Never act on javascript:, file: or data:.
  const isOwnScheme = url.protocol === 'awesomeapp:';
  const isOwnWeb = url.protocol === 'https:' && HOSTS.has(url.hostname);
  if (!isOwnScheme && !isOwnWeb) return null;

  // 2. Allow-list the destination. An unknown path is dropped, not guessed at.
  const [screen, id] = url.pathname.replace(/^\/+/, '').split('/');
  const pattern = screen == null ? undefined : ROUTES[screen];
  if (pattern == null || id == null) return null;

  // 3. Validate the parameter shape. An id is an id, not arbitrary text.
  if (!pattern.test(id)) return null;

  return {screen, id};
}
```

Three further rules:

- **Never re-open a URL taken from a link.** There is no safe version of the `next` parameter
  above. If you need a post-login destination, encode it as a route name you already allow-list.
- **A link is not authentication.** Deep links routinely arrive while the user is signed out, or
  signed in as someone else. Check authorisation on the destination screen, server-side, every
  time.
- **Never put a secret in a link.** Links land in browser history, referrer headers, chat
  previews and server logs.

**Verification.** Fire hostile links at your own app from the shell and confirm each one is
rejected. Run the list from both a cold start and while the app is running:

```bash
adb shell am start -a android.intent.action.VIEW -d "awesomeapp://order/../../admin"
adb shell am start -a android.intent.action.VIEW -d "awesomeapp://order/1042'--"
adb shell am start -a android.intent.action.VIEW -d "javascript:alert(1)"
adb shell am start -a android.intent.action.VIEW -d "https://evil.example/order/1042"
```

None should navigate anywhere. The last one is the one people miss: the host check is what stops
a lookalike domain reusing your path structure.

Full treatment, including the WebView case, is in
[Deep Link Validation](../security/deep-link-validation.md).

## Common mistakes

- **Handling only one launch path.** Wrong: adding the `url` listener and shipping. Right:
  `getInitialURL` **and** `addEventListener`. The missing one only fails in the launch state you
  did not test.
- **Forgetting `LSApplicationQueriesSchemes`.** Wrong: `canOpenURL('whatsapp://…')` returning
  `false` on a device with WhatsApp installed. Right: list the scheme in `Info.plist`. The same
  problem on Android 11+ is the missing `<queries>` block.
- **Omitting `launchMode="singleTask"`.** Wrong: every link spawns a new activity. Right: set it,
  or incoming links never reach the running app.
- **Trusting `canOpenURL` as a success guarantee.** Wrong: calling `openURL` without a `catch`
  because the check passed. Right: `openURL` can still reject; wrap it.
- **Interpolating without encoding.** Wrong: `` `mailto:${to}?subject=${subject}` ``. Right:
  `encodeURIComponent` each part — an `&` or `#` truncates the URL silently.
- **Acting on a URL parameter that is itself a URL.** Wrong: opening `?next=`. Right: there is no
  safe version; map to a route name you allow-list.
- **Treating a deep link as proof of identity.** Wrong: opening an account screen because the
  link named an account. Right: authorise on the server for every request the screen makes.

## Related topics

- [Deep Link Validation](../security/deep-link-validation.md) — the full threat model for incoming URLs.
- [Deep Linking](../navigation/deep-linking.md) — mapping URLs to routes with React Navigation.
- [Push and Local Notifications](notifications.md) — the other source of attacker-influenced destinations.
- [Permissions](permissions.md) — `openSettings()` as the recovery path for a blocked permission.
- [Clipboard and Share](clipboard-and-share.md) — the other boundary with other apps.
- [WebView Hardening](../security/webview-hardening.md) — what happens if a link reaches a WebView.
