---
title: Interoperating with Community Libraries
description: How an SDK 57 app links React Native community libraries alongside Expo modules — Expo Autolinking, checking compatibility, libraries without config plugins, excluding and inspecting what gets linked.
status: current
toolchain: expo
sdk: 57
---

Most Expo apps use native libraries that were not written with the Expo Modules API —
`react-native-mmkv`-style TurboModules, Fabric components, vendor SDK wrappers. They work in an Expo
app. The rules for making them work are the subject of this page.

The short version: **any library compatible with React Native can be used in an Expo project once
you have a development build**, installed with `npx expo install`, configured through a config plugin
if it needs native configuration, and linked automatically by Expo Autolinking.

> [!NOTE] Expo Go vs development build
> A community library with native code **cannot run in Expo Go** unless Expo Go happens to bundle it.
> Expo's own guidance is that any React Native-compatible library works once you create a development
> build, but may not work in Expo Go. See
> [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md).

## Why it exists / when to use it — and when NOT to

An Expo project is a React Native project. The Expo SDK covers many capabilities, but not all of them,
and the community library ecosystem is where the rest lives. Interop matters every time you add a
library that is not an `expo-*` package.

Do not reach for a community library when an SDK package covers the same capability for your needs.
SDK packages are versioned with the SDK, which removes one class of upgrade problem. Where both exist
and the SDK package is sufficient, prefer it.

## Basic example

```bash
npx expo install react-native-webview
```

`npx expo install` picks the version the SDK expects for packages listed in the SDK's
`bundledNativeModules.json` — `react-native-webview` is `13.16.1` for SDK 57 — and warns about known
incompatibilities. For a library the SDK does not list, it installs normally; you are then responsible
for checking compatibility.

Then rebuild:

```bash
npx expo run:android
npx expo run:ios
```

No linking step. Expo Autolinking finds the library.

## How it works

### Expo Autolinking links both kinds

Expo's autolinking documentation states that from SDK 52, Expo Autolinking replaces React Native
community CLI autolinking by default. It resolves:

- **Expo modules**, found by their `expo-module.config.json`.
- **React Native libraries**, resolved from their `package.json` and optional `react-native.config.js`
  in the same format the community CLI uses.

In `expo-modules-autolinking@57.0.13`, transitive dependencies that are React Native libraries are
linked too, not only direct dependencies. The `legacy_shallowReactNativeLinking` option restores the
pre-SDK 54 behaviour of linking only direct dependencies.

### Inspecting what gets linked

`expo-modules-autolinking` ships a CLI. The commands below are documented by Expo and correspond to
command files in the installed 57.0.13 package:

```bash
# Expo modules found in the project
npx expo-modules-autolinking search

# Platform-specific details of what will be linked
npx expo-modules-autolinking resolve --platform android
npx expo-modules-autolinking resolve --platform apple

# React Native libraries, in react-native.config.js format
npx expo-modules-autolinking react-native-config
```

When a library "is installed but not linked", run these before touching any native file.

### Autolinking options

Set under `expo.autolinking` in the app's `package.json`. Names and defaults read from
`expo-modules-autolinking@57.0.13`:

| Option | Default | Use |
| --- | --- | --- |
| `searchPaths` | `[]` | Extra directories to search for modules |
| `nativeModulesDir` | `"./modules"` | Where [local modules](local-modules.md) live |
| `exclude` | `[]` | Package names to leave unlinked |
| `legacy_shallowReactNativeLinking` | `false` | Only link direct React Native dependencies |
| `buildFromSource` | `[]` | Package name patterns that opt out of prebuilt modules |

Each can also be set per platform under an `android` or `ios` key:

```json title=package.json
{
  "expo": {
    "autolinking": {
      "android": {
        "exclude": ["react-native-some-ios-only-library"]
      }
    }
  }
}
```

React Native libraries can alternatively be excluded through a `react-native.config.js` at the project
root, which Expo's documentation describes as supported.

### Opting back into community CLI autolinking

Expo documents an escape hatch: set `EXPO_USE_COMMUNITY_AUTOLINKING=1` and add
`@react-native-community/cli` as a dev dependency. React Native libraries are then resolved by the
community CLI, while Expo modules are still autolinked by Expo. This page did not exercise it; use it
only if a library's linking genuinely depends on community CLI behaviour.

### Libraries that need native configuration

A library that needs a permission, a plist key or a Gradle change either ships a config plugin or asks
you to edit native files.

| The library… | You… |
| --- | --- |
| Ships `app.plugin.js` | Add it to `plugins`. See [Using Community Plugins](../expo-config-plugins/using-community-plugins.md) |
| Needs only keys the app config supports | Set `ios.infoPlist`, `android.permissions` and so on |
| Needs a Gradle or Podfile setting | Check [expo-build-properties](../expo-config-plugins/build-properties.md) first |
| Documents manual native edits, no plugin | Write a small [plugin](../expo-config-plugins/writing-your-own.md) that makes the same edits, or commit the native directories and follow its README |

The last row is the decision that matters. A manual edit to a generated `android/` or `ios/` lasts
until the next prebuild.

> [!DANGER] `npx expo prebuild` clears and regenerates native directories
> Following a library README that says "add this to `MainApplication.kt`" in a project that keeps
> native directories generated gives you a change that SDK 57 prebuild deletes by default. Express it
> as a config plugin, or commit the native directories and stop running prebuild — not both.

### Checking compatibility before you install

Three checks, cheapest first:

1. **React Native Directory** (reactnative.directory) — lists New Architecture support and whether a
   library works in Expo Go.
2. **`npx expo-doctor`** — Expo's project health check. By default it validates your dependencies
   against React Native Directory metadata. Its 1.20.4 source reads configuration from `expo.doctor` in
   `package.json`, including `reactNativeDirectoryCheck.exclude` (package names or `/regex/` strings)
   and `reactNativeDirectoryCheck.listUnknownPackages`.
3. **The library's peer dependencies** — `npm view <package> peerDependencies`. A library that requires
   a React Native version newer than **0.86.3**, which SDK 57 ships, is not compatible with SDK 57
   regardless of what its README says.

```json title=package.json
{
  "expo": {
    "doctor": {
      "reactNativeDirectoryCheck": {
        "exclude": ["my-internal-native-lib"],
        "listUnknownPackages": false
      }
    }
  }
}
```

## Platform differences

:::tabs
@tab Android
Community libraries are linked as Gradle subprojects. A library whose README asks for edits to
`settings.gradle` or `MainApplication` usually predates autolinking; check whether it still needs them
before writing a plugin.
@tab iOS
Community libraries are integrated through their podspec with CocoaPods. A library that needs
`use_frameworks!` is configured with `expo-build-properties` (`ios.useFrameworks`), not a Podfile edit.
:::

## Common patterns

**Wrap a vendor SDK that has no React Native binding** in a [local Expo module](local-modules.md)
rather than hunting for an unmaintained wrapper library.

**Pin what the SDK pins.** For libraries in `bundledNativeModules.json`, let `npx expo install` choose
the version, and run `npx expo install --check` after upgrades.

**Record why each non-SDK native library is there.** On an SDK upgrade, each one is a compatibility
question you have to answer again.

## Security considerations

**Threat.** A community library adds native code to your binary and, if it ships one, a config plugin
that runs during prebuild.

**Exploit.** A library you added for one feature requests additional permissions through its plugin, or
a compromised version runs code during prebuild on your CI.

**Fix.** Review the library's `app.plugin.js` and permission defaults when you add it, pin versions,
and review upgrades.

**Verification.** Diff the generated native output before and after installing it, in a scratch copy —
see [Verifying Generated Native Output](../expo-config-plugins/verifying-output.md).

## Common mistakes

- **Trying the library in Expo Go.** You get a runtime error about a missing native module, not a
  build error. Build a development build.
- **Installing with a bare package-manager command.** For SDK-listed libraries you may get a version
  built for a different SDK. Use `npx expo install`.
- **Following a README's manual native steps in a generated project.** Prebuild deletes them. Use a
  plugin, or commit the native directories.
- **Installing a library that targets a newer React Native than 0.86.3.** SDK 57 cannot upgrade React
  Native independently. Check `peerDependencies` first.
- **Adding community CLI autolinking configuration out of habit.** Expo Autolinking already links React
  Native libraries. Inspect with `npx expo-modules-autolinking react-native-config` before changing
  anything.
- **Excluding a library to "fix" a build and forgetting it.** The JavaScript still imports it and throws
  at runtime.

## Related topics

- [Local Modules](local-modules.md) — wrapping native code yourself instead.
- [Expo Modules vs TurboModules](vs-turbomodules.md) — the two mechanisms libraries use.
- [Using Community Plugins](../expo-config-plugins/using-community-plugins.md) — configuring libraries.
- [Writing Your Own Plugin](../expo-config-plugins/writing-your-own.md) — for libraries without a plugin.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — the rebuild rule.
- [install --check and --fix](../expo-migration/install-check-and-fix.md) — keeping versions aligned.
- [Autolinking](../native-modules/autolinking.md) — the community CLI mechanism, on React Native 0.87.
