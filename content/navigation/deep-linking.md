---
title: Deep Linking and Universal Links
description: Mapping URLs onto navigation state, the Android and iOS native configuration that makes links work, and treating every link parameter as attacker-controlled input.
status: current
toolchain: cli
---

A deep link is a URL that opens a specific screen. React Navigation handles the JavaScript half:
you give it a `linking` config, it converts an incoming URL into a navigation state tree and
restores the app into it. The other half is native configuration, and that half is where deep links
usually fail — silently, on one platform, in release builds only.

This page covers both halves, and then treats the part most guides skip: a deep link parameter is
input from whoever sent the link, which is not necessarily your user.

## Why it exists / when to use it — and when NOT to

Deep links are how everything outside your app points into it: a push notification, an email, a
shared link, a Google result, an OAuth redirect. Without them, every one of those lands on your
home screen and the user has to find their way.

There are two kinds, and they are not interchangeable:

| Kind | Example | Behaviour |
| --- | --- | --- |
| Custom scheme | `myapp://post/42` | Only your app can open it. Nothing happens if the app is not installed. Any other app can also claim the same scheme. |
| Universal / App Link | `https://example.com/post/42` | A verified https URL. Opens your app if installed, your website if not. Ownership is proven by a file on your domain. |

Ship both. The custom scheme is what you use for internal redirects and for testing; the https link
is what you put in emails and share sheets, because it degrades to a web page and because its
ownership cannot be hijacked by another app.

Skip deep links entirely only for an app with no external entry points at all — an internal tool
launched from the home screen and nothing else.

## Basic example

The `linking` prop on the container maps paths onto the screen tree. The shape of `config.screens`
mirrors the shape of your navigators.

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import type {LinkingOptions, NavigatorScreenParams} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

type TabParamList = {
  Feed: undefined;
  Profile: {userId: string};
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Post: {postId: string};
  NotFound: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

function Tabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Feed" component={Placeholder} />
      <Tab.Screen name="Profile" component={Placeholder} />
    </Tab.Navigator>
  );
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['myapp://', 'https://example.com', 'https://*.example.com'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Feed: 'feed',
          // `:userId` becomes route.params.userId.
          Profile: 'user/:userId',
        },
      },
      Post: {
        path: 'post/:postId',
        // Params arrive as strings; parse converts them at the boundary.
        parse: {postId: (value: string) => value.toLowerCase()},
      },
      // A catch-all keeps an unknown URL from being dropped on the floor.
      NotFound: '*',
    },
  },
};

export function App() {
  return (
    <NavigationContainer linking={linking} fallback={<Text>Loading</Text>}>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{headerShown: false}} />
        <Stack.Screen name="Post" component={Placeholder} />
        <Stack.Screen name="NotFound" component={Placeholder} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

`fallback` is rendered while the initial URL is being resolved. Without it the app shows the initial
route for a frame and then jumps, which reads as a flash of the wrong screen.

## How it works

`prefixes` are stripped from the URL first. Everything after the prefix is a path, which
`getStateFromPath` matches against `config.screens` to build a nested state object — the same shape
described in [Fundamentals](fundamentals.md). The container then applies it as the initial state, or
as a navigation action if the app is already running.

Two entry points feed it. `Linking.getInitialURL()` supplies the URL that launched a cold app;
`Linking.addEventListener('url', …)` supplies URLs that arrive while it is running. React Navigation
subscribes to both for you — you only replace them via `getInitialURL` / `subscribe` when something
else in the app needs to see the URL first.

Path params are always strings, because a URL has no types. `parse` runs per param and is where a
numeric id becomes a number — but see the security section before you assume the value is sane.

`filter` lets you decline a URL entirely. The usual use is an OAuth callback that your auth library
handles, which should never become a navigation action.

> [!TIP] Static API config
> With `createStaticNavigation`, the path lives next to the screen as `linking: {path: 'post/:postId'}`
> and the config is assembled for you. `linking.enabled: 'auto'` on the navigation component then
> gives every leaf screen a kebab-case path automatically.

## Native configuration

Nothing above works until the operating system agrees to hand the URL to your app.

:::tabs
@tab Android

Declare the scheme and the https host as intent filters on `MainActivity`. `launchMode="singleTask"`
matters: without it, a link opens a second copy of the activity and the running app's state is
replaced rather than updated.

```xml title=android/app/src/main/AndroidManifest.xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask"
  android:exported="true">

  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- Custom scheme: myapp://post/42 -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="myapp" />
  </intent-filter>

  <!-- App Links: https://example.com/post/42.
       autoVerify makes Android fetch assetlinks.json at install time. -->
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="example.com" />
    <data android:scheme="https" android:host="www.example.com" />
  </intent-filter>
</activity>
```

`android:autoVerify="true"` is the whole difference between an App Link and a link that shows a
disambiguation dialog. It tells Android to fetch a signed statement from your domain and confirm
that you own both ends.

That statement lives at `https://example.com/.well-known/assetlinks.json`, served over https with
`Content-Type: application/json`, no redirects:

```json title=https://example.com/.well-known/assetlinks.json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.awesomeproject",
      "sha256_cert_fingerprints": [
        "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"
      ]
    }
  }
]
```

Read the fingerprint from the keystore that actually signs the build you ship:

```bash
keytool -list -v -keystore android/app/release.keystore -alias release-key
```

If Play App Signing is enabled, the fingerprint Android checks is the one Google holds, not yours —
copy it from the Play Console's App Signing page. Getting this wrong is the single most common
reason App Links work in a local release build and stop working from the store.

Verify on a device, after installing:

```bash
# Android 12 and newer: shows each host's verification state for the package.
adb shell pm get-app-links com.awesomeproject

# Fire a link at the app directly, bypassing verification.
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://post/42" com.awesomeproject
```

@tab iOS

Custom schemes are declared in `Info.plist`:

```xml title=ios/AwesomeProject/Info.plist
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.awesomeproject</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>myapp</string>
    </array>
  </dict>
</array>
```

Universal Links need the Associated Domains capability instead. Add it in Xcode under Signing and
Capabilities, which writes the entitlement file:

```xml title=ios/AwesomeProject/AwesomeProject.entitlements
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:example.com</string>
  <string>applinks:www.example.com</string>
</array>
```

The matching file on your domain is `https://example.com/.well-known/apple-app-site-association` —
no file extension, served as `application/json`, over https, with no redirects:

```json title=https://example.com/.well-known/apple-app-site-association
{
  "applinks": {
    "details": [
      {
        "appIDs": ["ABCDE12345.com.awesomeproject"],
        "components": [
          { "/": "/post/*", "comment": "Posts" },
          { "/": "/user/*", "comment": "Profiles" }
        ]
      }
    ]
  }
}
```

`ABCDE12345` is your Team ID, from the Apple Developer account. The prefix is required; the bundle
identifier alone does not match.

Both URL types reach React Native through `RCTLinkingManager`, so the app delegate has to forward
them. The 0.87 Community CLI template uses Swift:

```swift title=ios/AwesomeProject/AppDelegate.swift
import React
import UIKit

extension AppDelegate {
  // Custom scheme: myapp://post/42
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links: https://example.com/post/42
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }
}
```

With an Objective-C app delegate the same two methods go in `AppDelegate.mm` after
`#import <React/RCTLinkingManager.h>`.

Verify on the simulator:

```bash
xcrun simctl openurl booted "myapp://post/42"
xcrun simctl openurl booted "https://example.com/post/42"
```

A Universal Link typed into Safari's address bar will not open the app — that is by design. Tap it
from Notes or Messages instead. Apple's CDN also caches the association file, so a fresh install is
the reliable way to pick up a change.
:::

## Security considerations

### Threat

A deep link is an entry point into your app that anyone can invoke. A web page, another installed
app, an email, a QR code or an SMS can all fire a URL at you, and your code decides what to do with
the parts of it. The parameters are attacker-controlled strings that arrive already typed as
`string` — TypeScript has been erased by the time the URL exists.

Custom schemes are worse than https links here, because there is no ownership check at all: any app
on the device can register `myapp://` and any web page can navigate to it.

### Exploit

Here is a handler that trusts the URL. It looks reasonable and it appears in a lot of codebases:

```ts title=src/navigation/handleLink.vulnerable.ts
import {Linking} from 'react-native';

type Navigate = (screen: string, params: Record<string, string>) => void;

// VULNERABLE — do not ship this.
export function installLinkHandler(navigate: Navigate) {
  Linking.addEventListener('url', ({url}) => {
    const parsed = new URL(url);
    const route = parsed.pathname.replace(/^\/+/, '');
    const next = parsed.searchParams.get('next') ?? '';

    // 1. `route` is whatever the sender wrote, including screens meant to be unreachable.
    // 2. `next` is handed straight to a WebView screen, so it can point anywhere.
    navigate(route, {next});
  });
}
```

Two problems. `route` lets the sender pick any registered screen name — including a debug screen, or
a screen that is only supposed to be reachable after authentication. And `next` is an open redirect:
a page under the attacker's control, rendered inside your app, wearing your chrome and, if the
WebView shares cookies or a bridge, with more privilege than a browser tab.

Fire it and watch:

```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://debug?next=https://attacker.example/login" com.awesomeproject
```

### Fix

Allow-list. Not a block-list, not a regular expression that rejects the bad cases you thought of —
an explicit set of the routes and hosts you intend to support, with everything else refused.

```ts title=src/navigation/handleLink.ts
import {Linking} from 'react-native';

// Exactly the screens a link may open. Nothing else is reachable by URL.
const LINKABLE_ROUTES = {
  post: 'Post',
  user: 'Profile',
} as const;

type LinkableSegment = keyof typeof LINKABLE_ROUTES;

// Exactly the hosts a link may point at, for the https form.
const ALLOWED_HOSTS = new Set(['example.com', 'www.example.com']);

// Ids in this app are short slugs. Anything else is not an id.
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type ResolvedLink = {screen: string; id: string};

export function resolveLink(url: string): ResolvedLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Only our own scheme, or an https URL on a host we own.
  if (parsed.protocol === 'https:') {
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return null;
    }
  } else if (parsed.protocol !== 'myapp:') {
    return null;
  }

  const [segment, id] = parsed.pathname.replace(/^\/+/, '').split('/');

  if (!Object.hasOwn(LINKABLE_ROUTES, segment)) {
    return null;
  }
  if (id === undefined || !ID_PATTERN.test(id)) {
    return null;
  }

  return {screen: LINKABLE_ROUTES[segment as LinkableSegment], id};
}

export function installLinkHandler(onLink: (link: ResolvedLink) => void) {
  const handle = (url: string | null | undefined) => {
    const link = url == null ? null : resolveLink(url);
    if (link !== null) {
      onLink(link);
    }
    // A refused link is dropped. The app stays where it is.
  };

  void Linking.getInitialURL().then(handle);
  const subscription = Linking.addEventListener('url', ({url}) => handle(url));
  return () => subscription.remove();
}
```

Four things make this safe where the first version was not. The scheme is checked. The host is
checked against a set, not a `startsWith` or an `includes` — `https://example.com.attacker.example`
passes a naive prefix test and fails this one. The route segment is a key lookup in a fixed map,
so an unlisted screen simply does not resolve. And the id is matched against a pattern describing
what an id actually looks like, which rejects `../`, a URL, and a 4 KB string.

The `next` parameter is gone entirely. If you genuinely need a post-link destination, encode it as
one of a fixed set of tokens and map it on your side — never as a URL the sender supplies.

The same discipline applies to the declarative `linking` config: a path pattern such as `post/:postId`
constrains the shape but not the content, so validate `route.params.postId` in the screen before
using it in a request path, a file name or a WebView source.

> [!DANGER] A validated URL is still not a safe WebView source
> Allow-listing the host stops the obvious redirect. It does not make the page safe to render with
> a JavaScript bridge attached. See [WebView Hardening](../security/webview-hardening.md).

### Verification

Prove it on your own machine, against a real build:

```bash
# Should open the post screen.
adb shell am start -W -a android.intent.action.VIEW -d "myapp://post/hello-world" com.awesomeproject

# Each of these should be refused and leave the app where it was.
adb shell am start -W -a android.intent.action.VIEW -d "myapp://debug/1" com.awesomeproject
adb shell am start -W -a android.intent.action.VIEW -d "myapp://post/../../admin" com.awesomeproject
adb shell am start -W -a android.intent.action.VIEW -d "https://example.com.attacker.example/post/1" com.awesomeproject
```

```bash
xcrun simctl openurl booted "myapp://post/hello-world"
xcrun simctl openurl booted "myapp://post/../../admin"
```

Add the same cases as unit tests over `resolveLink`, which needs no device: a table of URLs and the
expected `ResolvedLink | null`. That is the version that keeps working when someone adds a screen a
year from now.

## Common patterns

**Open a link from inside the app.** `Linking.openURL` is for external URLs. To move within the app,
navigate — a self-inflicted round trip through the operating system is slower and drops state.

**Decline the URLs another library owns.** An OAuth redirect should reach your auth code, not the
router:

```tsx title=src/linking.ts
import type {LinkingOptions} from '@react-navigation/native';

type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['myapp://', 'https://example.com'],
  // Anything under /auth is handled elsewhere and must not become navigation state.
  filter: (url) => !url.includes('/auth/callback'),
  config: {
    screens: {
      Home: '',
      Post: 'post/:postId',
    },
  },
};
```

**Require authentication for a linked screen.** Do not intercept the link. Let it resolve, and let
the conditional-screens pattern from [Native Stack](native-stack.md) decide what is in the tree: if
the user is signed out, the sign-in screen is the only screen that exists, and the link resolves
after they sign in.

## Common mistakes

- **`autoVerify` missing on the App Link intent filter.** Wrong: an intent filter for
  `https://example.com` with no `android:autoVerify="true"`. Android shows a chooser dialog instead
  of opening your app, and most users pick the browser. Right: set it, and confirm with
  `adb shell pm get-app-links`.
- **The wrong signing fingerprint in `assetlinks.json`.** With Play App Signing, the fingerprint that
  matters is Google's, not your upload key's. Local release builds verify and store builds do not.
- **Serving `apple-app-site-association` with a `.json` extension or behind a redirect.** Apple
  fetches the exact path with no extension and does not follow redirects. The app silently falls
  back to opening Safari.
- **Forgetting `launchMode="singleTask"` on Android.** Each link spawns a new activity instance, so
  the running app's navigation state is discarded and the back stack fills with duplicates.
- **Testing a Universal Link by typing it into Safari.** Safari deliberately stays in the browser for
  a URL you typed. Tap the link from another app.
- **Assuming the linking config validates params.** `post/:postId` matches `post/../../etc/passwd`
  and hands you that string. The pattern constrains shape, never content.
- **Using a block-list for link parameters.** Wrong: rejecting values containing `javascript:` or
  `..`. Right: an allow-list of the exact routes and hosts you support.
- **Leaving a debug or developer screen in the linking config.** It is reachable from any web page
  on the device once the scheme is registered.

## Related topics

- [Deep Link Validation](../security/deep-link-validation.md) — the allow-list pattern in full, with tests.
- [WebView Hardening](../security/webview-hardening.md) — why an allow-listed URL is still not a safe WebView source.
- [Linking](../platform-apis/linking.md) — the core `Linking` API these handlers are built on.
- [Params and Typed Routes](params-and-typed-routes.md) — why typed params are not validation.
- [Nesting Navigators](nesting.md) — the nested shape the linking config has to mirror.
- [State Persistence](state-persistence.md) — the other way state arrives from outside the app.
- [React Navigation Fundamentals](fundamentals.md) — the state tree a URL is converted into.
