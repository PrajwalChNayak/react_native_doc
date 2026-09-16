---
title: Troubleshooting
description: Specific React Native 0.87 failures, what actually causes them, and how to fix them.
status: current
allow-banned: deep-import-libraries, native-methods, new-arch-flag-android, new-arch-flag-ios, interaction-manager, image-background, properties-aliases, bare-rctappdelegate
toolchain: cli
---

Real failures, with the cause rather than a list of things to try at random. Several of these
are specific to 0.87 and did not exist a version earlier.

If you are upgrading, read [0.87 Breaking Changes](../migration/breaking-changes-087.md)
first — most upgrade-time errors are listed there with their replacement.

## Environment and setup

### `error react-native@0.87.1: The engine "node" is incompatible`

**Cause.** React Native 0.87 requires Node `^22.13.0 || ^24.3.0 || >= 26.0.0`. The minimum is
**22.13.0**, and Node 20 is no longer supported.

**Fix.** Check what you are actually running, which is often not what you think inside a CI
container or an IDE terminal:

```bash
node -v
```

Install and select a supported version with your version manager, then confirm again. Note that
`@react-native-community/cli` declares a lower floor than `react-native` itself — satisfying the
CLI is not enough.

### Commands behave strangely, or a flag the docs describe does not exist

**Cause.** A globally installed CLI is shadowing the local one. This is the single most
confusing class of error in the CLI path, because the symptoms look like documentation being
wrong.

**Fix.** Remove the globals. There is no supported global CLI any more:

```bash
npm uninstall -g react-native-cli @react-native-community/cli
```

Then always invoke it through `npx` or an npm script, so you get the version pinned in your
`package.json`.

### `npx react-native doctor` reports a missing Android SDK

**Cause.** `ANDROID_HOME` is unset, or points at an SDK without the platform React Native 0.87
needs.

**Fix.** 0.87 requires **compileSdk 37** and **buildToolsVersion 37**, with an aar-metadata
`minCompileSdk` of **34**. Install those through the Android Studio SDK Manager and confirm
`ANDROID_HOME` is exported in the shell that actually runs the build. See
[Environment Setup](../getting-started/environment-setup.md).

## Metro

### `error listen EADDRINUSE: address already in use :::8081`

**Cause.** A Metro instance is already running — commonly one orphaned from a previous session.

**Fix.** Stop the old one, or run on another port:

```bash
npx react-native start --port 8082
```

If you change the port, the app must be told where to look; otherwise it will sit on a red
screen saying it cannot connect to the development server.

### The app cannot reach Metro on a physical Android device

**Cause.** The device has no route to your machine's `localhost`.

**Fix.** Forward the port over adb:

```bash
adb reverse tcp:8081 tcp:8081
```

This has to be re-run after the device reconnects.

### Changes do not appear, or a module resolves to an old version

**Cause.** A stale Metro cache. This is much rarer than folklore suggests — reach for it only
after the obvious causes, because it is slow and often masks the real problem.

**Fix.**

```bash
npx react-native start --reset-cache
```

### `Attempted to import the module ... which is not listed in the "exports"`

**Cause.** Something imported a path the package does not publish. If the path is inside
`react-native` itself, this is usually internal to a dependency rather than your code.

**Fix.** If it is your import, stop deep-importing; see the next section. If it names a
third-party package, it is that package's bug — check whether a newer version fixes it.

## 0.87 TypeScript errors

### Deep imports into `react-native/Libraries/...` suddenly fail

**Cause.** The **Strict TypeScript API** is the default from 0.87. It is enforced by the
`exports` map in `react-native`, which sets `"types": null` for `./Libraries/*`. This is not a
lint rule you can disable.

**Fix.** Import from the package root:

```diff
- import StyleSheet from 'react-native/Libraries/StyleSheet/StyleSheet';
+ import {StyleSheet} from 'react-native';
```

A temporary `customConditions` opt-out exists but works only **through 0.88** and is intended
for removal in 0.89. Treat it as a migration aid, never a configuration to adopt — see
[Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md).

### `Cannot find name 'NativeMethods'`

**Cause.** `NativeMethods` and `NativeMethodsMixin` were removed in 0.87.

**Fix.** Use `HostInstance` for a generic host element, or the component's own instance type for
a specific ref — `ViewInstance`, `TextInputInstance`, `ScrollViewInstance`, `FlatListInstance`
and so on:

```diff
- const ref = useRef<NativeMethods | null>(null);
+ const ref = useRef<ViewInstance | null>(null);
```

### `Cannot find name 'ViewProperties'`

**Cause.** The `*Properties` type aliases were removed. Use `*Props`: `ViewProps`, `TextProps`,
`ImageProps`.

### `Cannot find name 'InteractionManager'`

**Cause.** Removed in 0.87.

**Fix.** Use the `requestIdleCallback` global. Note it schedules work during idle frames **while
the app is running** — it is not a background-execution mechanism.

### A `Modal` or `StatusBar` prop is rejected

**Cause.** `Modal`'s `animated` prop and `StatusBar`'s `backgroundColor`, `translucent` and
`networkActivityIndicatorVisible` were all removed in 0.87.

**Fix.** Use `Modal`'s `animationType`. For status-bar appearance, use the Android theme
resources rather than a JS prop.

### `ScrollView`'s `keyboardShouldPersistTaps` rejects `true`

**Cause.** The boolean form was removed.

**Fix.** Use `'never' | 'always' | 'handled'`. `'handled'` is almost always what you want.

### `ImageBackground` is flagged as deprecated

**Cause.** It is deprecated in 0.87.

**Fix.** Use a `View` with an absolutely positioned `Image` behind the content —
`StyleSheet.absoluteFill` does the positioning.

## Dependencies that install cleanly and then fail

### Reanimated animations do nothing, or a value "is not a worklet"

**Cause.** Reanimated 4 does **not** bundle its worklets runtime. `react-native-worklets` is a
separate required peer dependency, plus a Babel plugin. Almost every tutorial online predates
the Reanimated 3 → 4 split and omits it.

**Fix.** Install the peer and add the plugin **last** in the plugins array:

```bash
npm install react-native-reanimated@4.6.0 react-native-worklets@0.12.2
```

```js title=babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

`react-native-reanimated/plugin` still resolves — in 4.6.0 it is a four-line re-export of the
worklets plugin — but the worklets name is canonical.

### MMKV throws at startup

**Cause.** `react-native-mmkv` 4.x is built on Nitro Modules and declares
`react-native-nitro-modules` as a required peer. Installing MMKV alone is not enough.

**Fix.**

```bash
npm install react-native-mmkv react-native-nitro-modules
```

### Gestures do nothing at all

**Cause.** One of the two Gesture Handler requirements is missing: the import must come first in
`index.js`, and `GestureHandlerRootView` must wrap the app above anything using a gesture.
Neither produces an error — the gestures are simply inert.

**Fix.** Put `import 'react-native-gesture-handler';` as the **first** line of `index.js`, and
wrap the root of the tree in `GestureHandlerRootView`.

### A library installs, builds, and then crashes at runtime

**Cause.** It has not shipped Fabric / TurboModule support. Since 0.82 there is no legacy
architecture to fall back to; the interop layers cover many cases but not all.

**Fix.** Check the package before depending on it:

```bash
npm view <package> version peerDependencies
```

A permissive `"react-native": "*"` asserts nothing. Look for a `codegenConfig` block in the
package and a stated 0.87 or New Architecture claim. See
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Native builds

### A tutorial tells you to set `newArchEnabled=false` or `RCT_NEW_ARCH_ENABLED=0`

**Cause.** The guide was written for 0.81 or earlier. Since 0.82 both flags are **ignored** and
the old Bridge has been removed.

**Fix.** Delete the flag and treat the rest of that guide as suspect — it predates the current
architecture entirely.

### Android build fails after upgrading, with AGP or Kotlin DSL errors

**Cause.** React Native 0.87 supports Android Gradle Plugin 9, which changes built-in Kotlin
handling and the DSL.

**Fix.** The recommended opt-outs, in `android/gradle.properties`:

```properties title=android/gradle.properties
android.builtInKotlin=false
android.newDsl=false
```

These opt-outs are removed from AGP 10.x, so treat them as a transition measure.

### iOS fails with `'RCTAppDelegate.h' file not found`

**Cause.** The header moved in 0.87.

**Fix.**

```diff
- #import <RCTAppDelegate.h>
+ #import <React/RCTAppDelegate.h>
```

### iOS builds fail after adding a dependency

**Cause.** The Pods are out of date with `package.json`. Installing a native dependency changes
what CocoaPods must fetch, and nothing does that automatically.

**Fix.**

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

This is macOS-only. There is no way to build for iOS on Windows or Linux.

### A C++ backward-compatibility header is missing

**Cause.** Those headers were removed in 0.82.

**Fix.** Include the real path, for example
`#include <react/bridging/LongLivedObject.h>`.

## Debugging

### `npx react-devtools` cannot connect

**Cause.** Standalone `react-devtools` WebSocket support was removed in 0.87.

**Fix.** Use **React Native DevTools**, opened from the Dev Menu — <kbd>Ctrl</kbd>+<kbd>M</kbd>
on Android, <kbd>Cmd</kbd>+<kbd>D</kbd> on the iOS simulator. See
[React Native DevTools](../debugging/react-native-devtools.md).

### An unhandled promise rejection now floods the console

**Cause.** This is not a regression. Since 0.82 uncaught promise rejections raise
`console.error` — previously they were silently swallowed. The errors were always happening; you
can now see them.

**Fix.** Handle the rejection. Do not suppress the reporting.

## Common mistakes

- **Clearing caches first.** `--reset-cache`, deleting `node_modules`, wiping Pods — these are
  slow, and they hide the real cause more often than they fix it. Read the error first.
- **Trusting a guide that sets an architecture flag.** It predates 0.82, so its advice about
  native modules, performance and debugging is stale too.
- **Assuming a permissive peer range means compatibility.** `"react-native": "*"` is an absence
  of information, not a compatibility claim.
- **Fixing a Strict API type error with the `customConditions` opt-out.** It buys you until 0.88
  and nothing more. Fix the import.
- **Reaching for a cache clear when the real problem is a global CLI.** Check
  `npm ls -g --depth=0` before anything else if commands behave oddly.

## Related topics

- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — the exhaustive removal and deprecation list.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — the mechanism behind the type errors above.
- [Environment Setup](../getting-started/environment-setup.md) — the toolchain versions this page assumes.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — checking a library before you depend on it.
- [CLI Command Reference](cli-reference.md) — the commands and flags referenced here.
- [Cheat Sheet](cheat-sheet.md) — the same material as a quick lookup.
