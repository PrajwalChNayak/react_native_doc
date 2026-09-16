# Example: navigation

Native stack + bottom tabs, **typed routes**, and **deep linking**, on React
Native **0.87.1** with the New Architecture and the Strict TypeScript API.

Read [`../minimal-app/README.md`](../minimal-app/README.md) first — it explains
the shared project layout and why there is no `android/` or `ios/` folder here.

## What it demonstrates

| File | Point |
| --- | --- |
| `src/navigation/types.ts` | `RootStackParamList` / `TabParamList`, and the global `ReactNavigation.RootParamList` augmentation that types the untyped helpers. |
| `src/navigation/RootNavigator.tsx` | `createNativeStackNavigator<RootStackParamList>()` and `createBottomTabNavigator<TabParamList>()` — passing the param list is what types `name` and `initialParams`. |
| `src/screens/FeedScreen.tsx` | `CompositeScreenProps` — a tab screen that also pushes onto the parent stack. |
| `src/navigation/linking.ts` | `LinkingOptions<RootStackParamList>` with a custom scheme and an https prefix, plus URL builders. |
| `__tests__/linking.test.ts` | Runs the real `getStateFromPath` against the real config, so a broken link config fails `npm test` instead of failing on a user's phone. |

## Versions

```
@react-navigation/native        7.3.18
@react-navigation/native-stack  7.18.10
@react-navigation/bottom-tabs   7.18.18
react-native-screens            4.27.0
react-native-safe-area-context  5.9.1
react-native                    0.87.1
react                           19.2.3
```

## Step 1 — requirements

- **Node >= 22.13.0** (`react-native@0.87.1`'s own `engines` floor).
- Android Studio with compileSdk 37, plus an emulator or device, for Android.
- **iOS builds require macOS with Xcode.** iOS cannot be built on Windows or
  Linux at all.

## Step 2 — generate the native projects

```bash
npx @react-native-community/cli@20.2.0 init NavigationExample --version 0.87.1
cd NavigationExample
npm install \
  @react-navigation/native@7.3.18 \
  @react-navigation/native-stack@7.18.10 \
  @react-navigation/bottom-tabs@7.18.18 \
  react-native-screens@4.27.0 \
  react-native-safe-area-context@5.9.1 \
  --legacy-peer-deps
```

Then copy this example's source over the generated project (`App.tsx`,
`index.js`, `src/`, `__tests__/`, `jest.config.js`, `tsconfig.json`). On
Windows PowerShell use `Copy-Item -Recurse -Force` in place of `cp -R`.

Keep the app name consistent: this example's `app.json` says
`NavigationExample`, and that string must match what the native side
registers, or you get `"NavigationExample" has not been registered`.

Both libraries are autolinked. On iOS run `bundle exec pod install` in `ios/`
after installing them.

## Step 3 — required native configuration

### Android: `react-native-screens` needs `super.onCreate(null)`

`android/app/src/main/java/<your/package>/MainActivity.kt` — add the `onCreate`
override. Without it, Android's own fragment-state restoration fights
`react-native-screens` and the app crashes when the OS recreates the activity
(rotation, "Don't keep activities", returning after a process kill).

```kotlin
package com.navigationexample

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "NavigationExample"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Required by react-native-screens: passing null discards the Android
   * fragment state that react-native-screens restores itself.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
```

### Android: the deep link intent filter

`android/app/src/main/AndroidManifest.xml` — add a second `<intent-filter>`
inside the existing `<activity android:name=".MainActivity">`. Keep
`android:launchMode="singleTask"` (the 0.87 template already sets it), or a
link opened while the app is running starts a second copy of the activity.

```xml
<activity
  android:name=".MainActivity"
  android:label="@string/app_name"
  android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
  android:launchMode="singleTask"
  android:windowSoftInputMode="adjustResize"
  android:exported="true">
  <intent-filter>
      <action android:name="android.intent.action.MAIN" />
      <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- Custom scheme: rnhandbook://post/2 -->
  <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="rnhandbook" />
  </intent-filter>

  <!-- App Links: https://handbook.example.com/post/2
       android:autoVerify requires a matching
       https://handbook.example.com/.well-known/assetlinks.json -->
  <intent-filter android:autoVerify="true">
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="https" android:host="handbook.example.com" />
  </intent-filter>
</activity>
```

### iOS: the URL scheme (macOS only)

`ios/NavigationExample/Info.plist` — add inside the top-level `<dict>`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.navigationexample</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>rnhandbook</string>
    </array>
  </dict>
</array>
```

### iOS: forward the URL to React Native (macOS only)

The 0.87 template's `ios/NavigationExample/AppDelegate.swift` is Swift and
already does `import React`. Add these two methods to the `AppDelegate` class:

```swift
func application(
  _ app: UIApplication,
  open url: URL,
  options: [UIApplication.OpenURLOptionsKey: Any] = [:]
) -> Bool {
  return RCTLinkingManager.application(app, open: url, options: options)
}

// Needed only for universal links (https://…). Also add the
// "Associated Domains" capability with applinks:handbook.example.com.
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
```

`RCTLinkingManager` comes from the `React-RCTLinking` pod, whose header is
re-exported by `React-Core/RCTLinkingHeaders`, so `import React` is enough on
the default CocoaPods setup.

> These iOS snippets could not be compiled while writing this example — the
> machine it was authored on runs Windows, where no iOS toolchain exists. The
> Android side and all of the JavaScript were verified.

## Step 4 — install and check the JS

```bash
cd examples/navigation
npm install --legacy-peer-deps
npx tsc --noEmit      # or: npm run tsc
npm test
```

`--legacy-peer-deps` is needed because several React Navigation packages
declare peer ranges npm's strict resolver rejects.

## Step 5 — run it

```bash
npm start          # Metro, in its own terminal
npm run android    # Android
npm run ios        # iOS — macOS with Xcode only
```

## What you should see

1. The app opens on a **Feed** tab showing three cards: "The bridge is gone",
   "Strict TypeScript API", "Typed routes are worth the setup", each with a
   "by <name>" line. A bottom tab bar shows **Feed** (≡) and **Settings** (⚙),
   with the active tab in blue.
2. Tapping a card pushes a native stack screen titled **Post** with the post
   body and a blue **View <name>'s profile** button. The platform's own back
   affordance works: swipe from the left edge on iOS, the system back gesture
   or button on Android.
3. Tapping the profile button pushes a **Profile** screen showing `@ada` (or
   whichever author) and "No highlight query parameter was set."
4. The **Settings** tab lists four deep links with their URLs underneath, plus
   a typed-navigation button.

## Testing deep links for real

With the app installed and running:

```bash
# Android
adb shell am start -W -a android.intent.action.VIEW \
  -d "rnhandbook://post/2" com.navigationexample

adb shell am start -W -a android.intent.action.VIEW \
  -d "rnhandbook://user/ada?highlight=new%20architecture" com.navigationexample
```

```bash
# iOS simulator (macOS only)
xcrun simctl openurl booted "rnhandbook://post/2"
xcrun simctl openurl booted "rnhandbook://user/ada?highlight=new%20architecture"
```

Expected: `rnhandbook://post/2` opens the **Post** screen for "Strict
TypeScript API" with a back button to the tabs.
`rnhandbook://user/ada?highlight=new%20architecture` opens **Profile** showing
`@ada` and a blue line reading **Highlight: new architecture** — note the
`%20` has been decoded by the `parse` function in the linking config.

Launching the app cold from a link goes through the same path; the
`ActivityIndicator` passed as `NavigationContainer`'s `fallback` is what you
see for the moment the container spends resolving the initial URL.

## Common mistakes

- **Config and manifest disagree.** The scheme in `linking.prefixes` must match
  `CFBundleURLSchemes` and `<data android:scheme>`. If they differ the OS never
  delivers the URL, your config is never consulted, and nothing happens — with
  no error anywhere.
- **Missing `super.onCreate(null)`.** The app works until Android recreates the
  activity, then crashes with a fragment-state exception. Turn on "Don't keep
  activities" in developer options to reproduce it deliberately.
- **Trusting URL params.** `route.params.postId` for a deep-linked screen is a
  string an attacker chose. `PostDetailsScreen` handles the not-found case
  explicitly; do the same for anything that indexes into data or builds a
  request.
- **Using `BottomTabScreenProps` alone** on a tab screen that pushes onto the
  parent stack. It compiles until you call `navigate('PostDetails', …)`, then
  fails to type-check. `CompositeScreenProps` is the fix, not a cast.
- **Forgetting `transformIgnorePatterns`.** React Navigation ships ES modules,
  so Jest cannot parse it with React Native's default pattern. See
  `jest.config.js`.
