# Contributing / Authoring Guide

**Every author — human or agent — MUST read this file completely before writing a single
line of content.** The React Native ecosystem changed fundamentally between 0.76 and 0.87.
Almost every tutorial, Stack Overflow answer and model-memorised snippet about React Native
is now wrong. If you write from memory you will produce broken, pre-0.82 code.

This file is the single source of truth for facts. When this file and your memory disagree,
**this file wins**.

---

## 0. Scope rule — this site documents TWO toolchains, kept strictly apart

This site has two halves, and **a page belongs to exactly one of them**:

| Half | Sections | Toolchain | React Native |
| --- | --- | --- | --- |
| **CLI** | `getting-started`, `core-concepts`, `components`, `styling`, `navigation`, `state-and-data`, `platform-apis`, `native-modules`, `animation`, `performance`, `debugging`, `testing`, `build-and-release`, `security`, `migration`, `reference` | React Native Community CLI | **0.87.1** |
| **Expo** | every section whose id starts with `expo-` | Expo SDK 57 | **0.86.3** |

### The CLI half stays Expo-free

**Do NOT write about** Expo, Expo Router, EAS, `expo-*` packages or `create-expo-app` in any
CLI section. There is exactly **one** permitted mention: the scope note in
`content/getting-started/introduction.md`. Do not add another.

If a CLI page would otherwise reach for Expo (e.g. OTA updates), document the **non-Expo**
option, or say plainly that the CLI path has no first-party equivalent.

### The Expo half stays CLI-free where the two genuinely differ

Expo sections assume the Expo toolchain. Do not import CLI-only instructions into them, and
**never present a React Native 0.87 API as available to an Expo reader** — SDK 57 is on 0.86.

`scripts/check.mjs` enforces both directions. This is not advisory.

### Every page must declare its toolchain

Expo pages carry `toolchain: expo` and `sdk: 57` in front matter; CLI pages carry
`toolchain: cli`. The generator renders a badge from this, so a reader always knows which
toolchain and which React Native version a page assumes.

---

## 1. Verified facts

Verified against the npm registry and reactnative.dev on **2026-09-12**. The
version numbers below were read from `npm view`, and the API surface was read from the
**real installed `react-native@0.87.1` type definitions** in `tools/typecheck/node_modules/`.

### 1.1 Versions and toolchain

| Thing | Value |
| --- | --- |
| `react-native` | **0.87.1** (0.87 released 11 August 2026) |
| `react` peer dependency | **`^19.2.3`** (pin `19.2.3`; latest react is 19.3.0 but pin to the peer range) |
| `@types/react` peer dependency | `^19.1.1` |
| `@react-native-community/cli` | **20.2.0** |
| Node.js engine (from `react-native`'s `engines`) | `^22.13.0 \|\| ^24.3.0 \|\| >= 26.0.0` — **minimum 22.13.0** |
| Kotlin | **>= 2.0** (bundled 2.2.0) |
| Android `minCompileSdk` | **34** |
| Android `compileSdk` / `buildToolsVersion` | **37** |
| Unsupported | **0.84.x and older** |

### 1.2 Creating and running a project

Always remove any globally installed CLI first — a stale global `react-native` binary is one
of the most common causes of confusing errors:

```bash
npm uninstall -g react-native-cli @react-native-community/cli
```

Create a project:

```bash
npx @react-native-community/cli@latest init AwesomeProject
```

Pin a specific React Native version:

```bash
npx @react-native-community/cli@X.XX.X init AwesomeProject --version X.XX.X
```

iOS native dependencies (CocoaPods path):

```bash
cd ios && bundle install && bundle exec pod install
```

Run:

```bash
npm start            # Metro
npm run android
npm run ios
```

Reload: press <kbd>R</kbd> twice. Dev Menu: <kbd>Ctrl</kbd>+<kbd>M</kbd> on Android,
<kbd>Cmd</kbd>+<kbd>D</kbd> on the iOS simulator.

Upgrades: the **React Native Upgrade Helper**, or re-init at a pinned version.

### 1.3 Architecture timeline — the biggest source of stale tutorials

| Version | What happened |
| --- | --- |
| 0.76 (Oct 2024) | New Architecture became the **default** |
| 0.81 (Aug 2025) | **Last** version supporting both architectures |
| 0.82 (Oct 2025) | Runs **entirely** on the New Architecture. `newArchEnabled=false` and `RCT_NEW_ARCH_ENABLED=0` are **IGNORED**. Bridgeless by default; the old Bridge is **gone**. Interop layers remain for third-party libraries. |
| 0.83+ | Legacy architecture classes are being **removed** to cut install size. |

**Therefore:** document **Fabric, TurboModules, JSI, Codegen and Hermes as the only
architecture.** Never present the old Bridge, `NativeModules` bridge patterns, `RCTBridgeModule`,
or the architecture flags as current. They appear **only** in the migration section, clearly
labelled Legacy.

Also landed in 0.82, and worth mentioning where relevant:

- Uncaught promise rejections now raise `console.error` (they used to be silently swallowed).
- Android Gradle **9.0.0**.
- C++ backward-compatibility headers removed — use e.g. `#include <react/bridging/LongLivedObject.h>`.
- `ReactNativeFeatureFlags` moved to **private API** — do not depend on it.

### 1.4 React Native 0.87 — changes that invalidate most existing code

#### Strict TypeScript API is now the DEFAULT

It was opt-in from 0.80; in 0.87 it is on by default. This is enforced through
`package.json` `exports` conditions in `react-native` itself. Verified from the installed
package:

```json
"exports": {
  ".": {
    "react-native-legacy-deep-imports": "./types/index.d.ts",
    "types": "./types_generated/index.d.ts",
    "default": "./index.js"
  },
  "./Libraries/*": {
    "react-native-legacy-deep-imports": "./Libraries/*.d.ts",
    "types": null,
    "default": "./Libraries/*.js"
  }
}
```

Note `"types": null` on `./Libraries/*` — that is literally what makes deep imports a type
error. Consequences:

- Deep imports into `react-native/Libraries/*` are now **TYPE ERRORS**.
- Deep imports into `src/private/` are **removed**.
- Refs use dedicated instance types: `ViewInstance`, `TextInputInstance`,
  `ScrollViewInstance`, `FlatListInstance`, `TextInstance`, `PressableInstance`,
  `ModalInstance`, `SectionListInstance`, and so on — one per component.
- `NativeMethods` / `NativeMethodsMixin` types are **gone** — use **`HostInstance`**.
- The opt-out below exists **ONLY through 0.88** (removal intended in 0.89). Document it as a
  **temporary migration aid**, never as a recommendation:

```json
{
  "extends": "@react-native/typescript-config",
  "compilerOptions": {
    "customConditions": ["react-native", "react-native-legacy-deep-imports"]
  }
}
```

#### Metro 0.87

- Source map generation **2x faster**; memory usage **~50% lower**.
- Stable TypeScript and ESM config files (`metro.config.mts`).
- **DROPPED:** `.es6` extensions and YAML config files.

#### Swift Package Manager for iOS — **Experimental**

An opt-in alternative to CocoaPods requiring no Ruby, Bundler or CocoaPods — only Xcode.
CocoaPods remains the default.

```bash
cd ios
npx react-native spm --deintegrate   # remove CocoaPods, switch to SPM
npx react-native spm                 # set up SPM on a fresh clone / in CI
npx react-native spm deinit          # reverse it
npx react-native spm scaffold        # scaffold Package.swift for a library
```

Libraries must ship a `Package.swift`. Commands and layout may still change — **always label
this Experimental.**

Header breaking change:

```objc
// Before
#import <RCTAppDelegate.h>
// After
#import <React/RCTAppDelegate.h>
```

New: `ReactNativeHeaders.xcframework` and `ReactNativeDependenciesHeaders.xcframework`.

#### Android Gradle Plugin 9

Recommended opt-outs in `android/gradle.properties`:

```properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

### 1.5 REMOVED in 0.87 — must NEVER appear as working current code

- Deep imports to `react-native/Libraries/` and `src/private/`
- `*Properties` type aliases (e.g. `ViewProperties`) — use `*Props`
- YAML Metro config and `.es6` extensions
- **`InteractionManager`** — use the `requestIdleCallback` global
- `Modal`'s `animated` prop
- `StatusBar` props `backgroundColor`, `translucent`, `networkActivityIndicatorVisible`
  (and their setter methods)
- Boolean form of `ScrollView`'s `keyboardShouldPersistTaps` (use `'never' | 'always' | 'handled'`)
- The `useTurboModules` feature flag (TurboModules are always on)
- `useColorScheme()` returning `'unspecified'` — it returns **`ColorSchemeName | null`**
- `NativeDialogManagerAndroid` export; undocumented `Touchable` root export
- `@react-native/core-cli-utils` (no longer published)
- `react-native/rn-get-polyfills` → **`@react-native/js-polyfills`**
- Standalone `react-devtools` WebSocket support → **React Native DevTools**
- Android: `UIBlock`, `UIManagerModule.addUIBlock` / `prependUIBlock` → `UIManagerListener` or View Commands
- Android: new-arch-flag constructors on `DefaultReactActivityDelegate`
- iOS: `TimingModule`, `RCTTurboModuleEnabled()`, `RCTEnableTurboModule()`

Confirmed absent from the installed 0.87.1 strict type surface: `InteractionManager`,
`NativeMethods`, `ViewProperties`, `NativeDialogManagerAndroid`.

### 1.6 DEPRECATED in 0.87 — label clearly, never teach as the default

- `react-native/Libraries/Core/InitializeCore` → **`react-native/setup-env`**
- `@react-native/assets-registry` → `AssetRegistry` from `react-native` plus `@react-native/asset-utils`
- **`ImageBackground`** → a `View` with an absolutely positioned `Image`
- `NativeMethods` interface → **`HostInstance`**
- `Appearance.setColorScheme('unspecified')` → **`'auto'`**
- Android: **`DrawerLayoutAndroid`** → `react-native-drawer-layout`
- iOS: `TimingModule`, `RCTTurboModuleEnabled()`, `RCTEnableTurboModule()`

`ImageBackground` and `DrawerLayoutAndroid` are still **exported** from `react-native` in
0.87 — they are deprecated, not removed. Do not use them in examples; if you mention them,
mark them Deprecated and show the replacement.

### 1.7 Verified ecosystem library versions

All read from `npm view` on 2026-09-12 and checked for RN 0.87 / New Architecture support.

| Package | Version | Notes |
| --- | --- | --- |
| `@react-navigation/native` | 7.3.18 | |
| `@react-navigation/native-stack` | 7.18.10 | |
| `@react-navigation/bottom-tabs` | 7.18.18 | |
| `@react-navigation/drawer` | 7.13.10 | |
| `@react-navigation/elements` | 2.9.40 | |
| `react-native-screens` | 4.27.0 | |
| `react-native-safe-area-context` | 5.9.1 | |
| `react-native-reanimated` | 4.6.0 | **peer `react-native`: `0.83 - 0.87`. Requires peer `react-native-worklets@0.12.x` as a SEPARATE install.** |
| `react-native-worklets` | 0.12.2 | peer `react-native`: `0.83 - 0.87` |
| `react-native-gesture-handler` | 3.3.0 | |
| `react-native-svg` | 15.15.5 | |
| `@shopify/flash-list` | 2.3.2 | |
| `react-native-mmkv` | 4.3.2 | **Requires peer `react-native-nitro-modules`.** |
| `@react-native-async-storage/async-storage` | 3.1.1 | |
| `react-native-keychain` | 10.0.0 | |
| `@tanstack/react-query` | 5.102.8 | |
| `zustand` | 5.0.15 | |
| `@testing-library/react-native` | 14.0.1 | peers: `jest >=29`, `react >=19`, `react-native >=0.78`, `test-renderer ^1.0.0` |
| `detox` | 20.51.4 | |
| `react-native-config` | 1.7.2 | |
| `react-native-permissions` | 5.6.1 | |
| `@notifee/react-native` | 9.1.8 | |
| `react-native-vision-camera` | 5.2.3 | |
| `react-native-webview` | 14.0.1 | |
| `@react-native-community/netinfo` | 12.0.1 | |

Two traps to get right, because almost every tutorial online has them wrong:

1. **Reanimated 4 does not bundle the worklets runtime.** You must install
   `react-native-worklets` alongside it and add the plugin to `babel.config.js`.
2. **MMKV 4 is built on Nitro Modules.** `react-native-nitro-modules` is a required peer.

If you need a package not in this table, run `npm view <pkg> version peerDependencies`
yourself and add it here with its real version. **Never guess a version number.**

### 1.8 The complete `react-native` 0.87.1 runtime export surface

This is every value exported from `react-native` under the Strict API, read from
`types_generated/index.d.ts`. **If a component or API is not in this list, it does not exist
in core** — it is either from a third-party package or you are misremembering it.

```
AccessibilityInfo ActionSheetIOS ActivityIndicator Alert Animated AppRegistry AppState
AssetRegistry BackHandler Button Clipboard DevMenu DevSettings DeviceEventEmitter DeviceInfo
Dimensions DrawerLayoutAndroid DynamicColorIOS Easing EventEmitter FlatList I18nManager Image
ImageBackground InputAccessoryView Keyboard KeyboardAvoidingView LayoutAnimation Linking
LogBox Modal NativeAppEventEmitter NativeEventEmitter NativeModules Networking PanResponder
PermissionsAndroid PixelRatio Platform PlatformColor Pressable ProgressBarAndroid
PushNotificationIOS ReactNativeVersion RefreshControl RootTagContext SafeAreaView ScrollView
SectionList Settings Share StatusBar StyleSheet Switch Text TextInput ToastAndroid
TouchableHighlight TouchableNativeFeedback TouchableOpacity TouchableWithoutFeedback UIManager
UTFSequence Vibration View VirtualViewMode VirtualizedList VirtualizedSectionList
codegenNativeCommands codegenNativeComponent experimental_LayoutConformance findNodeHandle
processColor registerCallableModule requireNativeComponent
unstable_DEFAULT_INITIAL_NUM_TO_RENDER unstable_NativeText unstable_NativeView
unstable_TextAncestorContext unstable_VirtualArray unstable_VirtualColumn
unstable_VirtualColumnGenerator unstable_VirtualRow unstable_VirtualView
unstable_createVirtualCollectionView unstable_getScrollParent useAnimatedColor
useAnimatedValue useAnimatedValueXY useColorScheme usePressability useWindowDimensions
```

To check a type name, grep the real types:

```bash
grep -n "SomeTypeName" tools/typecheck/node_modules/react-native/types_generated/index.d.ts
```

---

## 1B. Verified Expo facts — read this before writing any Expo page

Verified on **2026-09-12** against the npm registry, `docs.expo.dev`, and the **real installed
`expo@57.0.22` package** in `tools/typecheck-expo/node_modules/`. The version map below was read
out of `expo/bundledNativeModules.json`, which is the file `npx expo install` itself consults.

### 1B.1 Versions

| Thing | Value |
| --- | --- |
| `expo` | **57.0.22** — Expo SDK 57 |
| `@expo/cli` | **57.0.24** |
| `expo-router` | **57.0.21** |
| `eas-cli` | **24.5.0** (was 24.3.0 on 2026-09-12; 24.5.0 published 2026-09-15) |
| React Native shipped by SDK 57 | **0.86.3** |
| Prerequisites | Node.js LTS; macOS, Windows (PowerShell or WSL 2), or Linux |

SDK 58 exists only as `canary` / `preview` dist-tags. **SDK 57 is current stable.**

### 1B.2 SDK to React Native pairing — VERIFIED, and the brief was wrong

Read directly from each release's `bundledNativeModules.json`:

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | **0.83.10** |
| SDK 56 | **0.85.3** |
| SDK 57 | **0.86.3** |

> The task brief stated "SDK 55 / 56 → RN 0.85". That is wrong for SDK 55, which ships
> **0.83**. The table above is what the packages actually contain. Use it.

**Upgrading React Native independently of the SDK is not supported.** Each SDK targets one
React Native version, and Expo SDK packages are built against it. Say this plainly wherever
version questions come up.

### 1B.3 The 0.86 vs 0.87 trap — the single most likely mistake on this site

The CLI half of this site documents React Native **0.87**. Expo SDK 57 is on **0.86**. They are
genuinely different, and copying a snippet across is the failure mode this section exists to
prevent. Verified from both installed packages:

| | RN 0.86 (Expo SDK 57) | RN 0.87 (CLI half) |
| --- | --- | --- |
| Default `types` condition | `./types/index.d.ts` — the **legacy** types | `./types_generated/` — the **Strict API** |
| Strict API | **opt-in**, via the `react-native-strict-api` condition | **default** |
| `./Libraries/*` deep imports | still resolve — no `exports` restriction | **type error** (`"types": null`) |
| `ViewInstance`, `TextInputInstance`, ... | **do not exist** | exist |

`expo/tsconfig.base.json` sets `customConditions: ["react-native"]`, so a normal Expo project
gets the **legacy** types. Consequences for Expo pages:

- **Never use `ViewInstance` / `TextInputInstance` / `HostInstance`.** They are 0.87-only.
  Type a ref by the component itself: `useRef<TextInput | null>(null)`.
- The 0.87 removals (`InteractionManager`, `Modal`'s `animated`, the `StatusBar` props,
  boolean `keyboardShouldPersistTaps`, `*Properties` aliases) are **not** removals for an Expo
  SDK 57 reader. Do not tell them an API is gone when it is not — if you mention it, say
  "removed in React Native 0.87, which SDK 57 does not yet ship".
- Deep imports into `react-native/Libraries/` still resolve on 0.86, but are still a bad idea.
  Do not teach them.

Every `ts`/`tsx` block in an Expo page is compiled against **expo 57 + react-native 0.86.3**, so
a block copied from the CLI half will fail. That is the check working, not a harness bug.

### 1B.4 `expo init` DOES NOT EXIST

It was removed and replaced by `create-expo-app`. Never use or teach it.

```bash
npx create-expo-app@latest        # npm
yarn create expo-app              # yarn
pnpm create expo-app              # pnpm
bun create expo                   # bun
```

Alternative starting points: `--template <name>` and `--example <name>`.

`expo eject` is also gone. Neither appears outside the Expo migration section, where both are
labelled Legacy.

### 1B.5 ALWAYS `npx expo install`, never bare `npm install`

```bash
npx expo install expo-image expo-secure-store     # correct
npm install expo-image expo-secure-store          # WRONG
```

`npx expo install` resolves the version matching the **installed SDK**, using
`expo/bundledNativeModules.json`. A bare `npm install` fetches `latest`, which is routinely a
version built for a different SDK — and native-module mismatches fail at runtime, not install
time. This is one of the most common causes of a broken Expo app.

`npx expo install --check` reports mismatches; `--fix` corrects them.

### 1B.6 `expo prebuild` is DESTRUCTIVE in SDK 57

It **clears and regenerates** the native directories by default. Anyone who hand-edited
`ios/` or `android/` loses those edits. Every page that mentions it needs a `> [!DANGER]`
callout.

The mental model is **Continuous Native Generation**: the native directories are *build
output*, not source. Two valid strategies, and readers must pick one:

1. **Stay fully CNG.** Never commit `ios/`/`android/`; express every native change as a config
   plugin. Upgrades are cheap; you are limited to what plugins can express.
2. **Commit the native directories and stop running prebuild.** Full native freedom; you now
   own every upgrade by hand.

Mixing the two — hand-editing native code *and* running prebuild — is the failure this warning
exists to prevent.

### 1B.7 SDK 57 changes worth documenting

- React Native 0.86: Android edge-to-edge fixes, light/dark emulation in React Native DevTools,
  plus rendering, layout and animation fixes
- `expo prebuild` clears and regenerates native directories by default (see 1B.6)
- `expo-dev-client`: the iOS launcher can auto-launch the most recent project or show the launcher
- `expo-image`: new `writeToCacheAsync` and `readFromCacheAsync`
- `expo-router`: `Stack.Toolbar.Badge` in header placements; toolbar menu icons on Android
- `expo-navigation-bar`: `setStyle` and `setHidden` now apply to React Native `<Modal>` windows
- Bundled bumps: reanimated 4.3 to 4.5, worklets 0.8 to 0.10, gesture-handler 2.31 to 2.32

### 1B.8 Verified SDK 57 library versions

From `expo/bundledNativeModules.json` — these are exactly what `npx expo install` resolves.
**Use the `~` ranges as shown; do not pin an exact version an Expo project would not choose.**

| Package | SDK 57 |
| --- | --- |
| `expo-dev-client` | `~57.0.19` |
| `expo-updates` | `~57.0.22` |
| `expo-image` | `~57.0.5` |
| `expo-file-system` | `~57.0.7` |
| `expo-font` | `~57.0.4` |
| `expo-splash-screen` | `~57.0.9` |
| `expo-notifications` | `~57.0.18` |
| `expo-secure-store` | `~57.0.4` |
| `expo-sqlite` | `~57.0.3` |
| `expo-camera` | `~57.0.5` |
| `expo-location` | `~57.0.17` |
| `expo-audio` | `~57.0.5` |
| `expo-video` | `~57.0.4` |
| `expo-auth-session` | `~57.0.12` |
| `expo-local-authentication` | `~57.0.3` |
| `expo-linking` | `~57.0.10` |
| `expo-constants` | `~57.0.18` |
| `expo-build-properties` | `~57.0.17` |
| `expo-crypto` | `~57.0.3` |
| `expo-haptics` | `~57.0.3` |
| `expo-clipboard` | `~57.0.2` |
| `expo-sensors` | `~57.0.3` |
| `expo-background-task` | `~57.0.17` |
| `expo-task-manager` | `~57.0.17` |
| `expo-media-library` | `~57.0.5` |
| `expo-image-picker` | `~57.0.17` |
| `expo-web-browser` | `~57.0.3` |
| `expo-status-bar` | `~57.0.1` |
| `expo-asset` | `~57.0.17` |
| `expo-modules-core` | `~57.0.18` |
| `@expo/vector-icons` | `^15.0.2` |

**`expo-av` is NOT in the SDK 57 map.** It has been superseded by **`expo-audio`** and
**`expo-video`**. Do not recommend `expo-av`; if you mention it, mark it Legacy and point at the
successors.

If you need a package not listed, read it out of the installed map rather than guessing:

```bash
node -p "require('./tools/typecheck-expo/node_modules/expo/bundledNativeModules.json')['PACKAGE']"
```

### 1B.9 Shared libraries differ between the two halves — check before you copy

Every library both halves use is at a **different version**, because the SDK pins its own set:

| Package | SDK 57 | CLI half (RN 0.87) |
| --- | --- | --- |
| `react-native-gesture-handler` | `~2.32.0` | 3.3.0 |
| `react-native-reanimated` | `4.5.1` | 4.6.0 |
| `react-native-worklets` | `0.10.1` | 0.12.2 |
| `react-native-screens` | `~4.26.0` | 4.27.0 |
| `react-native-safe-area-context` | `~5.7.0` | 5.9.1 |
| `react-native-webview` | `13.16.1` | 14.0.1 |
| `@react-native-async-storage/async-storage` | `2.2.0` | 3.1.1 |
| `react-native-svg` | `15.15.4` | 15.15.5 |
| `react-native-mmkv` | **not in the SDK map** | 4.3.2 |

Gesture Handler is a **whole major version** apart. Never copy a version number from a CLI page
into an Expo page.

### 1B.10 EAS — state costs plainly, write no marketing

EAS (Build, Submit, Update, Workflows) is a **paid hosted service with a free tier**. Build
queues and concurrency depend on the plan. **Local builds are a supported alternative**
(`eas build --local`, or `npx expo run:android` / `run:ios` for a plain native build).

Do not write promotional copy. Do not imply EAS is required to ship an Expo app. Where a limit
or price matters to a decision, say so; if you cannot verify a current price or quota, say that
rather than inventing a number.

### 1B.11 Expo Go vs development builds

Expo Go bundles a **fixed** set of native modules. The moment a project adds a library with
custom native code, Expo Go cannot run it — the reader gets a runtime error, not a build error.

Do **not** present Expo Go as the normal way to develop a real app. It is a sandbox for trying
the SDK. A development build (`expo-dev-client`) is the normal path, and the point at which a
project needs one arrives early.

Every Expo page that involves a native dependency needs an **"Expo Go vs development build"**
note saying which it requires.

### 1B.12 Traps found while building the examples — verified, write them correctly

- **Detecting Expo Go.** Use `isRunningInExpoGo()` from `expo`. Do **not** use
  `Constants.executionEnvironment === 'storeClient'`: the installed expo-constants types
  document `StoreClient` as "Expo Go **or a development build** built with expo-dev-client", so
  that check also matches the dev build. To ask whether a native module is present, use
  `requireOptionalNativeModule('Name')` from `expo`, which returns `null` instead of throwing.
- **jest-expo needs a second package.** jest-expo 57.0.5 declares a peer on
  `@react-native/jest-preset@^0.86.3`, and `npx expo install jest-expo` does not install it.
  Without it every run fails with *"The React Native Jest preset that jest-expo relies on has
  moved to a separate package."* Install `@react-native/jest-preset@0.86.3`, not 0.87.
- **Expo Router vendors React Navigation.** expo-router 57.0.21 has no `@react-navigation/*`
  dependency; it ships its own copy under `build/react-navigation/`. Do not write that it
  "depends on" React Navigation.
- **iOS prebuild does not run on Windows.** The Expo CLI refuses it
  (`@expo/cli` `build/src/prebuild/resolveOptions.js`). Use `npx expo config --type introspect`
  to see the effect of iOS mods on a Windows host, and say that is what you did.
- **`@shopify/flash-list` is 2.0.2 in SDK 57**, not the 2.3.2 the CLI half documents.
- **eas-cli moved from 24.3.0 to 24.5.0 during writing** (24.4.0 on 2026-09-14, 24.5.0 on
  2026-09-15). The published `oclif.manifest.json` of both versions was diffed: identical command
  set, and every command and flag these pages cite is present in both — including `build --local`,
  `build --no-wait` (a negation of the `wait` flag), `update --rollout-percentage`,
  `update --private-key-path`, `update --environment`, `update:rollback`, `update:republish`,
  `channel:rollout`, `update:insights`, `channel:insights` and `workflow:run`. `login` and `whoami`
  are aliases of `account:login` and `account:view` in both. Pages therefore cite **24.5.0**.
  Re-diff the manifest before bumping again rather than assuming a minor release is compatible.

---

## 2. How to verify a claim

**Never invent a component, prop, API or package.** If you cannot verify it, leave it out and
add a line to the "Remaining issues" list you return.

Three verification tools, in order of preference:

1. **The installed types** (fastest, most authoritative for API shape):
   `tools/typecheck/node_modules/react-native/types_generated/`
2. **`npm view <pkg> version peerDependencies`** for any package version or compatibility claim.
3. **reactnative.dev** for prose, behaviour and platform notes.

A library that has not shipped Fabric / TurboModule support is **not a valid recommendation**.

---

## 3. File and front matter conventions

Content lives in `content/<section>/<page>.md`. Filenames are **kebab-case**, one topic per
file. Every page starts with YAML-ish front matter:

```markdown
---
title: Pressable
description: One sentence, plain, no marketing. Shown in search results and page headers.
status: current
---
```

`status` must be one of **`current`**, **`legacy`** or **`deprecated`**. Default to `current`.
Only migration pages use `legacy`.

Do **not** write an `# H1` in the body — the generator renders the title from front matter.
Start the body at `##`.

### Navigation manifest is the single source of truth

`scripts/nav.mjs` defines every page, its section, its order, its title and its URL. It drives
navigation, breadcrumbs, prev/next links and the search index. **If a page is not in
`nav.mjs` it is an orphan and `check.mjs` will fail.** Do not add a page without adding it to
the manifest, and do not rename a file without updating the manifest.

---

## 4. Required page shape

Every page follows this order. Omit a section only if it genuinely does not apply — except
the last two, which are **mandatory on every page** and enforced by `check.mjs`.

```
(front matter: title + description)
Overview — a short paragraph. What this is, in plain words.
## Why it exists / when to use it — and when NOT to
## Basic example
## How it works  (explanation)
## Platform differences        (where they exist)
## Common patterns
## Performance considerations  (where relevant)
## Security considerations     (where relevant)
## Common mistakes             (REQUIRED)
## Related topics              (REQUIRED)
```

Rules:

- **Explain WHY, not just what.** A prop list without reasoning is not documentation.
- Short paragraphs. No filler, no marketing voice, no "in today's fast-paced mobile world".
- `## Related topics` is a bullet list of **relative** links to other pages, e.g.
  `- [Pressable](../components/pressable.md) — the modern touch primitive.`
  Write links with the `.md` extension pointing at the real source file; the generator
  rewrites them to `.html`. `check.mjs` validates every one.
- `## Common mistakes` must contain real, specific mistakes with the reason they bite —
  ideally each as a short wrong/right pair.

---

## 5. Markdown features available

### Callouts

```markdown
> [!NOTE] Optional custom title
> Body text.
```

Types: `NOTE`, `TIP`, `BEST-PRACTICE`, `WARNING`, `DANGER`, `DEPRECATED`, `LEGACY`.

Use `DEPRECATED` and `LEGACY` for anything from sections 1.5 and 1.6. Use `DANGER` for
security footguns.

### Tabs — use these heavily

```markdown
:::tabs
@tab iOS
iOS content here.
@tab Android
Android content here.
:::
```

Tab groups are also the right tool for npm / yarn / pnpm and for Kotlin / Swift. The tab
label is free text; iOS/Android/npm/yarn/pnpm get matching icons automatically.

### Code blocks

Supported languages: `tsx`, `ts`, `js`, `jsx`, `json`, `bash`, `kotlin`, `swift`, `objc`,
`gradle`, `groovy`, `xml`, `properties`, `ruby`, `powershell`, `yaml`, `diff`, `text`.

Add a filename with `title=`:

````markdown
```tsx title=src/screens/HomeScreen.tsx
// ...
```
````

**Every `ts` and `tsx` block is type-checked against the real installed react-native 0.87
types with the Strict API active.** If your snippet is a fragment that cannot compile alone,
either make it compile, or mark it as non-checkable by using the language `tsx-fragment` /
`ts-fragment` — but prefer making it compile. Fragments are highlighted identically; they are
just excluded from the type-check. **Do not reach for `-fragment` to hide a real error.**

The type-checker wraps each block in its own file, so a block needs its own imports. Blocks
may reference `react`, `react-native`, and any package listed in section 1.7 that is
installed in `tools/typecheck` — check before importing something exotic.

---

## 6. Platform differences are a first-class concern

Where Android and iOS genuinely differ, **show both** — in tabs. Never present an iOS-only or
Android-only solution as universal.

Call out explicitly where a feature needs native configuration rather than leaving the reader
to discover it at runtime:

- `ios/<App>/Info.plist` entries (usage descriptions, ATS, URL schemes)
- `android/app/src/main/AndroidManifest.xml` permissions and intent filters
- Gradle changes in `android/app/build.gradle` or `android/build.gradle`

If a thing works on only one platform, say so in the first sentence about it.

---

## 7. Security: threat → exploit → fix → verification

Security is not a single page; it is a section on many pages. Where a page touches
credentials, storage, networking, deep links or WebViews, include a
`## Security considerations` section that follows this shape:

1. **Threat** — what an attacker actually does.
2. **Exploit** — show it concretely. Real commands, real code.
3. **Fix** — the correct pattern.
4. **Verification** — how the reader proves the fix works on their own machine.

Every security claim must be **demonstrable**. Specific things to get right:

- **Anything in the JS bundle is readable.** Demonstrate extracting strings from a release
  build (unzip the APK, run `strings` on the Hermes bytecode or the bundle), then show the
  correct pattern: secrets server-side, short-lived tokens, no API keys in the app.
- **Secure storage:** Keychain / Keystore via `react-native-keychain` vs AsyncStorage, and
  exactly what AsyncStorage does **not** protect (it is unencrypted; on a rooted or jailbroken
  device, and in some backup scenarios, it is readable plaintext).
- **Deep link validation:** show a vulnerable handler that trusts a URL parameter, then the
  fixed version with an allow-list.
- **WebView:** `originWhitelist`, disabling file access, disabling JS where possible.
- **Certificate pinning:** include an honest note on operational cost and certificate rotation
  — a pinned app bricks itself when the cert rotates and the app has not been updated.
- **Obfuscation:** state plainly what R8/ProGuard and JS minification actually buy you
  (raising effort, shrinking size) and what they do **not** (they are not encryption; a
  determined attacker reads your code).

Do not overstate. "This makes extraction harder" is honest; "this makes your keys safe" is not.

---

## 8. Native modules — the section most tutorials get wrong

**Everything uses TurboModules, Fabric and Codegen.** No old-Bridge `RCTBridgeModule` or
`NativeModules`-based patterns anywhere outside the migration page.

A complete native module page shows the **whole path**:

1. The **spec file** (`src/specs/NativeFoo.ts`) with `TurboModuleRegistry`.
2. What **Codegen generates**, and where it lands.
3. The **Kotlin** implementation.
4. The **Swift** implementation.
5. **Registration** (package / provider).
6. **Autolinking** and `react-native.config.js`.
7. **Calling it from TypeScript** with correct types.

Do the same end-to-end treatment for a **Fabric native component** using
`codegenNativeComponent`.

---

## 9. No fake anything

- **No live previews.** React Native components cannot render in a browser, and Expo Snack is
  out of scope. Do not build an iframe preview system.
- **No invented screenshots.** Do not embed an image you have not actually produced. If a
  visual is genuinely needed, write a clearly marked placeholder saying a screenshot is
  required.
- **No invented output.** Do not show terminal output you did not run.

Runnable code goes in `examples/` as a real app with its own `package.json` and README.
Docs pages **reference** those files rather than duplicating copies that will drift.

---

## 10. Writing style

- Second person ("you"), present tense, active voice.
- Short paragraphs — 2–4 sentences. Break up walls of text with headings and lists.
- Prefer a table over three paragraphs when comparing options.
- Code comments explain *why*, not *what*.
- No emoji in body text. No exclamation marks.
- British or American spelling is fine, but be consistent within a page.
- Never write "simply", "just", "obviously", or "easy" — they are false for someone stuck.

---

## 11. Before you finish

Run, from the repo root:

```bash
node scripts/check.mjs
```

It validates internal links, heading anchors, front matter, required sections and orphan
pages, and it **fails on banned patterns**: deep imports, `newArchEnabled=false`,
`RCT_NEW_ARCH_ENABLED=0`, `InteractionManager`, `Modal animated`, `StatusBar backgroundColor`
/ `translucent`, `useTurboModules`, `NativeMethods`, `*Properties` type aliases,
`ImageBackground`, `rn-get-polyfills`, `InitializeCore`, bare `#import <RCTAppDelegate.h>`,
and Expo references outside the one allow-listed scope note.

### Naming a banned API on purpose

Some pages must *name* a removed API in order to warn against it — the way this file names
`InteractionManager`. That needs an explicit opt-in in front matter listing the rule ids you
need, and `check.mjs` prints every page that uses it so the hatch cannot be used quietly:

```markdown
---
title: 0.87 Breaking Changes
description: …
status: current
allow-banned: interaction-manager, native-methods
---
```

Use it only to warn against something. If you find yourself adding a rule id so that a
*working example* compiles, the example is wrong — fix the example.

Then type-check your section (the argument is a path substring, and each run gets its own
workspace so this is safe to run while other authors are working):

```bash
node scripts/typecheck-blocks.mjs components
```

**Do not run `node scripts/build.mjs`.** The build is run once, centrally, at the end.
Multiple agents building concurrently will corrupt `docs/`.

Report honestly. If a check fails and you cannot fix it, say so explicitly rather than
quietly removing the example.
