---
title: expo install and SDK Alignment
description: Why SDK packages must be installed with npx expo install rather than a bare package-manager install, how it picks versions for your SDK, and how --check and --fix find and repair mismatches.
status: current
toolchain: expo
sdk: 57
allow-banned: npm-install-sdk-package
---

An Expo SDK release is a **set** of native packages built and tested against one React Native
version. SDK 57 pairs with React Native **0.86.3**, and every `expo-*` package in it — plus the
community native libraries the SDK tracks — has a version range chosen for that pairing.

`npx expo install` is the command that keeps your project inside that set. It is a thin wrapper
over your package manager that **rewrites the version** before installing.

```bash
npx expo install expo-image expo-secure-store     # correct
npm install expo-image expo-secure-store          # WRONG for an Expo project
```

The second line is named here only to warn against it.

## Why it exists / when to use it — and when NOT to

A bare `npm install expo-image` resolves the `latest` dist-tag on npm. `latest` follows the
newest SDK, not yours. If the newest SDK is ahead of your project, you get a package compiled
against a different `expo-modules-core` and a different React Native.

That mismatch rarely fails at install time. It fails **at runtime**, as a crash or a missing native
method, sometimes only on one platform, sometimes only in a release build. It is one of the most
common causes of a broken Expo app, and it is miserable to diagnose because nothing about the
install looked wrong.

Use `npx expo install` for:

- every `expo-*` package;
- community native libraries the SDK tracks — `react-native-reanimated`,
  `react-native-gesture-handler`, `react-native-screens`, `react-native-safe-area-context`,
  `@react-native-async-storage/async-storage`, `react-native-webview` and the rest;
- `react`, `react-native` and `expo` itself during upgrades.

For a package the SDK does not track — a pure-JavaScript library, or a native library outside the
map — `npx expo install` passes the name through to your package manager unchanged, so using it
everywhere is harmless and a good habit.

## Basic example

```bash
npx expo install react-native-reanimated react-native-worklets
```

On SDK 57 that installs `react-native-reanimated@4.5.1` and `react-native-worklets@0.10.1` — the
values in `expo/bundledNativeModules.json` — not the newer versions the CLI half of this site
documents for React Native 0.87. The versions are genuinely different — Gesture Handler is a
whole major version apart — so never copy a version number from a CLI page. See
[Choosing Expo or the Bare CLI](../expo-getting-started/choosing-expo-or-cli.md).

A few SDK 57 values, read from the installed map:

| Package | SDK 57 range |
| --- | --- |
| `react-native` | `0.86.3` |
| `react` | `19.2.3` |
| `expo-dev-client` | `~57.0.19` |
| `expo-image` | `~57.0.5` |
| `expo-camera` | `~57.0.5` |
| `react-native-gesture-handler` | `~2.32.0` |
| `react-native-reanimated` | `4.5.1` |
| `@react-native-async-storage/async-storage` | `2.2.0` |

You can read any entry yourself:

```bash
node -p "require('expo/bundledNativeModules.json')['expo-camera']"
```

## How it works

Read from the installed `@expo/cli@57.0.24` (`install/installAsync.js` and
`start/doctor/dependencies/`):

1. The CLI works out your SDK version from the installed `expo` package.
2. It builds a **known versions** map by combining:
   - the SDK's native module versions, fetched from Expo's versions endpoint, **falling back to the
     local `expo/bundledNativeModules.json`** if the endpoint is unreachable or `EXPO_OFFLINE` is
     set (it logs `Unable to reach well-known versions endpoint. Using local dependency map
     expo/bundledNativeModules.json for version validation`);
   - remote per-SDK versions, which take precedence so Expo can ship an emergency fix without a
     new `expo` release.
3. For each package you named **without a version**, if it is in the map, it is rewritten to
   `name@<range>`. Otherwise it is passed through as-is.
4. It runs your package manager — npm, Yarn, pnpm or bun, detected from the lockfile or chosen
   with `--npm` / `--yarn` / `--pnpm` / `--bun`.
5. If an installed package ships a config plugin and your app config is static JSON, it adds the
   plugin to `plugins`.

Two details matter:

- **Naming an explicit version overrides the map.** `npx expo install expo-image@1.2.3` installs
  exactly that, with a message saying the version was explicitly provided.
- **`expo.install.exclude` in `package.json`** lists packages you have deliberately taken off the
  SDK's version, so the CLI stops rewriting and stops checking them.

Arguments after `--` go to the underlying package manager:
`npx expo install react -- --verbose`.

## Checking and fixing alignment

```bash
npx expo install --check     # report packages that do not match the SDK
npx expo install --fix       # rewrite them to the SDK's versions and install
```

`--check` exits `0` with `Dependencies are up to date`, or exits `1` with
`Found outdated dependencies` after listing each mismatch. That exit code makes it usable as a CI
gate. `--json` (only valid with `--check`) produces machine-readable output. `--check` and `--fix`
cannot be combined.

The complete verified flag list for `npx expo install`:

| Flag | Effect |
| --- | --- |
| `--check` | Check which installed packages need to be updated |
| `--fix` | Automatically update any invalid package versions |
| `--dev` | Save as devDependencies |
| `--npm` / `--yarn` / `--pnpm` / `--bun` | Package manager to use |
| `--json` | JSON output, with `--check` only |

`npx expo add` is an alias for `npx expo install`.

## Common patterns

### Gate CI on alignment

```bash
npx expo install --check
```

Run it before building. A mismatch caught here costs a minute; the same mismatch found as a
release-build crash costs a day.

### Upgrading the SDK

The upgrade sequence relies on `--fix`: install the new `expo`, let `--fix` move every tracked
package to the new SDK's ranges, then run `npx expo-doctor`. See
[Upgrading Between SDK Versions](../expo-migration/upgrading-sdk.md).

```bash
npx expo install expo@^57.0.0
npx expo install --fix
npx expo-doctor
```

### Deliberately leaving the SDK's version

Sometimes you need a newer patch of one library than the SDK pins. Install it explicitly, add it
to `expo.install.exclude` so the choice is visible and `--check` stops flagging it, and write down
why:

```json title=package.json
{
  "expo": {
    "install": {
      "exclude": ["react-native-webview"]
    }
  }
}
```

You now own that compatibility. Test it in a release build on both platforms.

### Do not try to upgrade React Native on its own

`react-native` is in the map too. Forcing a newer React Native than the SDK pins is not supported:
SDK packages are compiled against 0.86.3, and `--check` will report the mismatch. If you need
React Native 0.87, you need a newer SDK — or the [CLI toolchain](../getting-started/introduction.md).

## Common mistakes

- **Using a bare package-manager install for an SDK package.** Wrong: `npm install expo-camera`
  (fetches `latest`, possibly built for another SDK). Right: `npx expo install expo-camera`.
- **Copying a version from a tutorial into `package.json`.** It overrides the map and pins you to
  whatever SDK the tutorial used. Remove the version and run `npx expo install --fix`.
- **Assuming a successful install means a compatible install.** Native mismatches surface at
  runtime. Run `--check`.
- **Running `--fix` and not rebuilding.** Changing native package versions changes the binary.
  Rebuild your development build.
- **Excluding a package and forgetting it.** `expo.install.exclude` silences the check forever.
  Revisit the list on every SDK upgrade.
- **Upgrading `react-native` alone "to get a fix".** Not supported. Upgrade the SDK.

## Related topics

- [Expo install --check and --fix](../expo-migration/install-check-and-fix.md) — the commands in migration and troubleshooting context.
- [SDK to React Native Pairing](../expo-migration/sdk-react-native-pairing.md) — which React Native each SDK ships.
- [Upgrading Between SDK Versions](../expo-migration/upgrading-sdk.md) — where `--fix` does most of the work.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — install, then rebuild.
- [Expo Go vs Development Builds](expo-go-vs-development-builds.md) — why native mismatches show up at runtime.
- [The App Config](app-config.md) — where `npx expo install` adds config plugins.
