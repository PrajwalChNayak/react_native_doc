---
title: Cheat Sheet
description: The commands, components, style props, native config file locations and removed APIs of React Native 0.87.1, on one page.
status: current
allow-banned: interaction-manager, native-methods, properties-aliases, image-background, deep-import-libraries, deep-import-private, initialize-core, rn-get-polyfills, use-turbo-modules
toolchain: cli
---

One page, tables only. Everything here is verified against the installed `react-native@0.87.1`
type definitions, the published `@react-native-community/cli@20.2.0` packages, and the npm registry
on 2026-09-12. Longer explanations are one link away in every section.

## Versions

| Thing | Value |
| --- | --- |
| `react-native` | 0.87.1 |
| `react` peer | `^19.2.3` — pin `19.2.3` |
| `@types/react` peer | `^19.1.1` |
| `@react-native-community/cli` | 20.2.0 |
| Node engine | `^22.13.0 \|\| ^24.3.0 \|\| >= 26.0.0` — **minimum 22.13.0** |
| Kotlin | >= 2.0 (bundled 2.2.0) |
| Android `minCompileSdk` | 34 |
| Android `compileSdk` / `buildToolsVersion` | 37 |
| Android Gradle Plugin | 9 |
| Unsupported | 0.84.x and older |

## Setup

```bash
# 1. Always remove a stale global CLI first.
npm uninstall -g react-native-cli @react-native-community/cli

# 2. Create a project.
npx @react-native-community/cli@latest init AwesomeProject

# 3. Or pin both the CLI and React Native.
npx @react-native-community/cli@20.2.0 init AwesomeProject --version 0.87.1

# 4. iOS native dependencies (macOS only).
cd ios && bundle install && bundle exec pod install && cd ..
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Metro |
| `npm run android` | Build and launch on Android |
| `npm run ios` | Build and launch on iOS (**macOS only**) |
| `npx react-native start --reset-cache` | Metro with a clean cache |
| `npx react-native run-android --active-arch-only` | Build native libs for one architecture — much faster |
| `npx react-native run-ios --simulator "iPhone 15 (17.0)"` | A specific simulator |
| `npx react-native config` | The autolinking configuration, as JSON |
| `npx react-native info` | OS, toolchain and library versions, for bug reports |
| `npx @react-native-community/cli doctor` | Diagnose the toolchain; `--fix` attempts repairs |
| `npx react-native clean --include metro,android` | Clear caches |
| `npx react-native log-android` | logcat, filtered to `ReactNative` / `ReactNativeJS` |
| `npx react-native log-ios -i` | Simulator syslog, pick which simulator |
| `npx react-native codegen` | Run Codegen by hand |
| `cd android && ./gradlew signingReport` | Which key each variant signs with |
| `cd android && ./gradlew bundleRelease` | The AAB you upload to Play |

Full flag tables: [CLI Command Reference](cli-reference.md).

## Dev menu and reload

| Action | Android | iOS simulator |
| --- | --- | --- |
| Reload | <kbd>R</kbd> twice | <kbd>R</kbd> twice |
| Dev menu | <kbd>Ctrl</kbd>+<kbd>M</kbd> | <kbd>Cmd</kbd>+<kbd>D</kbd> |

## Core components

The complete component export surface of 0.87.1. **If it is not here, it is not in core.**

| Group | Components |
| --- | --- |
| Layout and content | `View` `Text` `Image` `SafeAreaView`* `experimental_LayoutConformance` |
| Scrolling and lists | `ScrollView` `FlatList` `SectionList` `VirtualizedList` `VirtualizedSectionList` `RefreshControl` |
| Input and interaction | `Pressable` `TextInput` `Switch` `Button` `TouchableOpacity` `TouchableHighlight` `TouchableNativeFeedback` `TouchableWithoutFeedback` `InputAccessoryView` `KeyboardAvoidingView` |
| Overlays and status | `Modal` `StatusBar` |
| Feedback | `ActivityIndicator` |
| Android only | `DrawerLayoutAndroid`* `ProgressBarAndroid`* `TouchableNativeFeedback` |
| iOS only | `InputAccessoryView` `SafeAreaView`* |

`*` deprecated in 0.87. Full table with replacements: [Component Reference](component-reference.md).

## Core APIs worth memorising

| API | Use |
| --- | --- |
| `Platform.OS` / `Platform.select` | Branch on platform |
| `StyleSheet.create` / `StyleSheet.absoluteFill` | Styles |
| `Dimensions` / `useWindowDimensions` | Screen size; prefer the hook |
| `useColorScheme()` | Returns `ColorSchemeName \| null` |
| `Appearance` | Read and set the colour scheme; use `'auto'`, not the removed third value |
| `PixelRatio` | Density-aware sizing |
| `Linking` | Open and receive URLs |
| `AppState` | Foreground / background |
| `Keyboard` | Keyboard events and dismissal |
| `Alert` / `Share` / `Vibration` | System UI |
| `PermissionsAndroid` | Android runtime permissions |
| `AppRegistry` | Registers the root component in `index.js` |
| `TurboModuleRegistry.get` / `.getEnforcing` | Reach a native module; `get` returns `null`, `getEnforcing` throws |
| `codegenNativeComponent` / `codegenNativeCommands` | Fabric component specs |
| `requestIdleCallback` (global) | Defer work until after interactions |

Full table: [API Reference](api-reference.md).

## Common style props

### Layout

| Prop | Notes |
| --- | --- |
| `flex` `flexGrow` `flexShrink` `flexBasis` | `flexShrink` defaults to `0` |
| `flexDirection` | Defaults to **`column`** |
| `justifyContent` `alignItems` `alignSelf` `alignContent` | `alignContent` defaults to `flex-start` |
| `flexWrap` | `nowrap` by default |
| `gap` `rowGap` `columnGap` | Supported; simpler than margins between children |
| `width` `height` `minWidth` `maxWidth` `minHeight` `maxHeight` | Numbers are density-independent pixels; strings may be percentages |
| `aspectRatio` | Number or string |
| `margin` / `padding` + `Top` `Right` `Bottom` `Left` `Horizontal` `Vertical` | |
| `position` | `relative` (default) or `absolute` — no `fixed` or `sticky` |
| `top` `right` `bottom` `left` | With `position: 'absolute'` |
| `zIndex` | Works; stacking rules differ from the web |
| `overflow` | `visible` `hidden` `scroll` |

### Appearance

| Prop | Notes |
| --- | --- |
| `backgroundColor` `opacity` | |
| `borderRadius` + per-corner variants | |
| `borderWidth` `borderColor` `borderStyle` | Per-edge variants exist |
| `boxShadow` | Cross-platform shadow; array of values or a string |
| `filter` | Array of filter functions or a string |
| `shadowColor` `shadowOffset` `shadowOpacity` `shadowRadius` | iOS |
| `elevation` | Android |
| `transform` | `translateX` `translateY` `scale` `rotate` `skew` and matrix |

### Text

| Prop | Notes |
| --- | --- |
| `color` `fontSize` `fontWeight` `fontFamily` `fontStyle` | |
| `lineHeight` `letterSpacing` | |
| `textAlign` `textAlignVertical` | The second is Android |
| `textTransform` | `none` `capitalize` `uppercase` `lowercase` |
| `textDecorationLine` | |
| `includeFontPadding` | Android; the usual fix for vertical text misalignment |

### Flexbox defaults that differ from the web

| Property | React Native | Web |
| --- | --- | --- |
| `flexDirection` | `column` | `row` |
| `alignContent` | `flex-start` | `stretch` |
| `flexShrink` | `0` | `1` |
| `boxSizing` | `border-box` | `content-box` |

There are no CSS files, no cascade, no media queries and no units — every number is a
density-independent pixel. [Flexbox in React Native](../styling/flexbox.md) ·
[How RN Differs from the Web](../core-concepts/differences-from-web.md)

## Where native configuration lives

| You want to change | File |
| --- | --- |
| Android permissions, intent filters, launcher activity | `android/app/src/main/AndroidManifest.xml` |
| Android app id, version, variants, signing, R8 | `android/app/build.gradle` |
| Gradle memory, architectures, AGP opt-outs | `android/gradle.properties` |
| Android repositories and plugin classpath | `android/build.gradle` |
| Android autolinking wiring | `android/settings.gradle` |
| Android strings and theme | `android/app/src/main/res/values/{strings,styles}.xml` |
| Android R8 keep rules | `android/app/proguard-rules.pro` |
| Android package registration (your own module) | `android/app/src/main/java/<pkg>/MainApplication.kt` |
| iOS permission strings, URL schemes, ATS, display name | `ios/<App>/Info.plist` |
| iOS privacy manifest | `ios/<App>/PrivacyInfo.xcprivacy` |
| iOS bundle id, version, signing, deployment target | Xcode build settings in `ios/<App>.xcodeproj` |
| iOS pods, deployment target, `post_install` | `ios/Podfile` |
| Node path for Xcode script phases | `ios/.xcode.env`, or `ios/.xcode.env.local` (not committed) |
| iOS app entry point, deep links, push callbacks | `ios/<App>/AppDelegate.swift` |

Open `ios/<App>.xcworkspace`, never the `.xcodeproj`, once pods are installed.
[Platform Folders](../native-modules/platform-folders.md)

### `android/gradle.properties` — the 0.87 lines that matter

```properties title=android/gradle.properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

This file is committed. Credentials go in `~/.gradle/gradle.properties` or CI secrets.
[Android Signing](../build-and-release/android-signing.md)

### `Info.plist` keys you will actually add

```xml title=ios/AwesomeApp/Info.plist (excerpt)
<key>NSCameraUsageDescription</key>
<string>Scan a document to attach it to a report.</string>
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

### `AndroidManifest.xml` shape

```xml title=android/app/src/main/AndroidManifest.xml (excerpt)
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:name=".MainApplication" android:allowBackup="false">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
```

## Removed in 0.87 — never write these

| Removed | Use instead |
| --- | --- |
| Deep imports of `react-native/Libraries/*` and `react-native/src/private/*` | The root `react-native` export |
| `ViewProperties` and every other `*Properties` alias | `*Props` |
| `InteractionManager` | The `requestIdleCallback` global |
| `NativeMethods` / `NativeMethodsMixin` types | `HostInstance` |
| `Modal`'s `animated` prop | `animationType` |
| `StatusBar`'s `backgroundColor`, `translucent`, `networkActivityIndicatorVisible` | A `View` sized to the top safe-area inset |
| Boolean `keyboardShouldPersistTaps` | `'never' \| 'always' \| 'handled'` |
| The `useTurboModules` feature flag | Nothing — TurboModules are always on |
| `useColorScheme()` returning a third value | It returns `ColorSchemeName \| null` |
| `NativeDialogManagerAndroid`, the `Touchable` root export | — |
| `react-native/rn-get-polyfills` | `@react-native/js-polyfills` |
| YAML Metro config, `.es6` extensions | `metro.config.js` / `.mts` |
| Android `UIBlock`, `UIManagerModule.addUIBlock` | `UIManagerListener` or View Commands |
| iOS `TimingModule`, `RCTTurboModuleEnabled()`, `RCTEnableTurboModule()` | — |

## Deprecated in 0.87 — still exported, do not build on them

| Deprecated | Use instead |
| --- | --- |
| `ImageBackground` | A `View` with an absolutely positioned `Image` |
| `SafeAreaView` | `react-native-safe-area-context` |
| `DrawerLayoutAndroid` | `react-native-drawer-layout` |
| `ProgressBarAndroid` | `@react-native-community/progress-bar-android` |
| `react-native/Libraries/Core/InitializeCore` | `react-native/setup-env` |
| `@react-native/assets-registry` | `AssetRegistry` from `react-native` plus `@react-native/asset-utils` |
| `Appearance.setColorScheme` with the old third value | `'auto'` |

Before / after pairs: [0.87 Breaking Changes](../migration/breaking-changes-087.md).

## The Strict TypeScript API in three lines

- Deep imports into `react-native/Libraries/*` are **type errors** — `"types": null` in the
  package's `exports` makes them so.
- Refs use per-component instance types: `ViewInstance`, `TextInputInstance`, `ScrollViewInstance`,
  `FlatListInstance`, and so on. The generic one is `HostInstance`.
- The `react-native-legacy-deep-imports` `customConditions` opt-out exists **only through 0.88**.
  It is a migration aid, not a setting.

[Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md)

## Verified ecosystem versions

Read from `npm view` on 2026-09-12 and checked for New Architecture support.

| Package | Version | Package | Version |
| --- | --- | --- | --- |
| `@react-navigation/native` | 7.3.18 | `react-native-reanimated` | 4.6.0 |
| `@react-navigation/native-stack` | 7.18.10 | `react-native-worklets` | 0.12.2 |
| `@react-navigation/bottom-tabs` | 7.18.18 | `react-native-gesture-handler` | 3.3.0 |
| `@react-navigation/drawer` | 7.13.10 | `react-native-svg` | 15.15.5 |
| `@react-navigation/elements` | 2.9.40 | `@shopify/flash-list` | 2.3.2 |
| `react-native-screens` | 4.27.0 | `react-native-mmkv` | 4.3.2 |
| `react-native-safe-area-context` | 5.9.1 | `@react-native-async-storage/async-storage` | 3.1.1 |
| `react-native-keychain` | 10.0.0 | `@tanstack/react-query` | 5.102.8 |
| `zustand` | 5.0.15 | `@testing-library/react-native` | 14.0.1 |
| `detox` | 20.51.4 | `react-native-config` | 1.7.2 |
| `react-native-permissions` | 5.6.1 | `@notifee/react-native` | 9.1.8 |
| `react-native-vision-camera` | 5.2.3 | `react-native-webview` | 14.0.1 |
| `@react-native-community/netinfo` | 12.0.1 | | |

### The two peer traps

| Package | Also install | Why |
| --- | --- | --- |
| `react-native-reanimated@4.6.0` | `react-native-worklets@0.12.x` | Reanimated 4 does not bundle the worklets runtime, and needs the Babel plugin added |
| `react-native-mmkv@4.3.2` | `react-native-nitro-modules` | MMKV 4 is built on Nitro Modules |

Both fail at runtime, not at install. Reanimated declares `"react-native": "0.83 - 0.87"`.

```bash
# The one command to run before believing any version claim.
npm view <pkg> version peerDependencies
```

## Repository validation commands

Run from the repository root.

```bash
# Structure, front matter, required sections, links, anchors, orphans,
# and the banned-pattern scan.
node scripts/check.mjs

# Type-check every ts/tsx block in a section against the real installed
# react-native 0.87 types with the Strict API active. The argument is a
# path substring.
node scripts/typecheck-blocks.mjs native-modules
node scripts/typecheck-blocks.mjs build-and-release
node scripts/typecheck-blocks.mjs reference

# Grep the real type definitions rather than trusting memory.
grep -n "SomeTypeName" tools/typecheck/node_modules/react-native/types_generated/index.d.ts
```

**Do not run `node scripts/build.mjs`.** The build runs once, centrally. Concurrent builds corrupt
`docs/`.

Naming a banned API on purpose needs an explicit front-matter opt-in, which `check.mjs` reports:

```markdown
---
title: Some Page
description: …
status: current
allow-banned: interaction-manager, native-methods
---
```

This page uses it for exactly that reason — the removed and deprecated tables above name the APIs
they warn against.

## Common mistakes

- **Trusting a tutorial written before 0.82.** The Bridge is gone, `NativeModules`-style patterns
  are legacy, and the architecture flags are ignored. Check the date before the code.
- **Running `npx react-native bundle` without `--platform`.** It defaults to `ios` and silently
  produces the wrong bundle for an Android build.
- **Leaving a global CLI installed.** It shadows the project's version and produces errors that do
  not match any documentation. `npm uninstall -g react-native-cli @react-native-community/cli`.
- **Assuming `flexDirection` is `row`.** It is `column`. This is the single most common layout
  surprise.
- **Expecting text to shrink in a row.** `flexShrink` defaults to `0`, so it overflows. Set
  `flexShrink: 1` on the child that should give way.
- **Installing Reanimated 4 without `react-native-worklets`.** npm warns; the app crashes at
  runtime. Same shape for MMKV 4 and `react-native-nitro-modules`.
- **Editing `android/gradle.properties` to hold a keystore password.** That file is committed.
- **Opening the `.xcodeproj` after `pod install`.** Open the `.xcworkspace`.
- **Skipping `pod install` after adding a dependency.** iOS autolinking happens at install time,
  so the module is simply absent and `getEnforcing` throws.
- **Believing `npx react-native --version`.** It prints the CLI's version, not React Native's.

## Related topics

- [CLI Command Reference](cli-reference.md) — every command and flag in full.
- [Component Reference](component-reference.md) — the complete component surface with status.
- [API Reference](api-reference.md) — the non-component exports.
- [Troubleshooting](troubleshooting.md) — symptom, cause, fix.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — before/after for every removal above.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — the deep-import rules in depth.
- [Environment Setup](../getting-started/environment-setup.md) — the toolchain versions above, installed.
- [Creating a Project](../getting-started/creating-a-project.md) — the setup commands in context.
- [Flexbox in React Native](../styling/flexbox.md) — the defaults table, with reasons.
- [Platform Folders](../native-modules/platform-folders.md) — the native configuration files in full.
- [Release Checklist](../build-and-release/release-checklist.md) — what to run before you ship.
