---
title: Adopting Expo in an Existing Bare App
description: What it realistically takes to use Expo modules and tooling inside an existing React Native CLI app — install-expo-modules, the React Native version constraint, and why generation usually does not apply.
status: current
toolchain: expo
sdk: 57
allow-banned: npm-install-sdk-package
---

An existing React Native Community CLI app can use Expo SDK packages. It is a supported path, and
it is a genuinely different thing from starting a project on Expo: you add the `expo` package and
its module system to native projects **you already own**, and those projects stay committed and
hand-maintained.

This page is honest about the three things that make adoption harder than a new project: the
React Native version pin, the native changes, and the fact that Continuous Native Generation
rarely fits an existing app.

## Why it exists / when to use it — and when NOT to

Adopt Expo in an existing CLI app when:

- you want specific SDK packages — `expo-image`, `expo-camera`, `expo-secure-store` — without
  replacing your native projects;
- you want to write new native modules with the Expo Modules API;
- you want `npx expo run:*`, Expo's Metro and Babel configuration, or EAS, while keeping native
  control.

Do **not** expect adoption to give you:

- **Generated native projects.** Your `ios/` and `android/` contain years of edits. Running
  `npx expo prebuild` on them **clears and regenerates** the directories by default in SDK 57,
  destroying those edits. Treat the app as using committed native directories, permanently or
  until you deliberately migrate.
- **A way around the React Native version pin.** See the next section.

## The React Native version constraint comes first

Each Expo SDK targets exactly one React Native version, and the SDK's native packages are compiled
against it:

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | 0.83.10 |
| SDK 56 | 0.85.3 |
| SDK 57 | 0.86.3 |

An app built with the [CLI half of this site](../getting-started/introduction.md) is on React Native
**0.87.1**. **No stable SDK targets 0.87 yet**, so SDK 57 packages in a 0.87.1 app are a
mismatch that `npx expo install --check` will report and that is not supported.

Your realistic options:

1. **Adopt when an SDK targeting your React Native version is stable.** Nothing to force.
2. **Keep the app on React Native 0.86.3** and adopt SDK 57.
3. **Force it anyway.** Unsupported; any native incompatibility is yours to debug.

Check your version before doing anything else:

```bash
npm ls react-native
```

> [!WARNING] 0.86 and 0.87 code is not interchangeable
> React Native 0.87 made the Strict TypeScript API the default and added per-component ref instance
> types that **do not exist in 0.86**. If you move an app from 0.87 down to 0.86 to adopt SDK 57, code
> using those types stops compiling. Type refs by component instead:
> `useRef<TextInput | null>(null)`.

## Basic example

With a React Native version that matches an SDK, the automated path is a single command, from
the `install-expo-modules` package (verified on npm at 0.16.0, described as "Tools to install
expo-modules for existing react-native projects"):

```bash
npx install-expo-modules@latest
```

It installs the `expo` package and edits the native projects to set up the Expo module system. Then
install SDK packages the normal way, so versions match the SDK:

```bash
npx expo install expo-image expo-secure-store
npx expo install --check
```

Then rebuild both platforms. Native changes need a native build.

### If the automated path fails

`docs.expo.dev` documents a manual path: install `expo` with your package manager
(`npm install expo` — the one place a bare install of an Expo package is expected, because the
`npx expo` CLI does not exist in the project yet), apply the documented native diffs, and install
pods. The diffs vary by React Native version, so follow the page for your version at
<https://docs.expo.dev/bare/installing-expo-modules/> rather than a copy here.

Once `expo` is installed, switch to `npx expo install` for everything else, and run
`npx expo install --fix` to bring `expo` itself onto a matching version.

## How it works

The Expo SDK packages are native modules built on `expo-modules-core`. Installing `expo` adds:

- **Expo's module autolinking**, which finds Expo modules in `node_modules` and registers them in
  the native build — on iOS through the `use_expo_modules!` hook in the Podfile;
- **the `expo` runtime package**, which SDK packages depend on;
- **access to the local CLI** (`npx expo`), so `npx expo install`, `run:*` and `start` work.

Community React Native libraries keep working through React Native's own autolinking. The two sit
side by side.

### Native minimums

The installed SDK 57 `Expo.podspec` and `ExpoModulesCore.podspec` both declare an iOS platform of
**16.4**. If your app's deployment target is lower, it has to be raised before the pods will
install. Check each Android SDK package's requirements the same way before assuming your
`minSdkVersion` is sufficient; this page does not state an Android minimum because none was
verified.

## Common patterns

### Adopt one package at a time

Install `expo`, then one SDK package, rebuild both platforms, and ship it. Adding ten packages in one
change makes a native build failure hard to attribute.

### Never run prebuild on the existing app

Document it in the README and remove it from any script a template may have added. The app's native
directories are source. If you later want generation, follow the "committed back to CNG" steps in
[CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — on a branch,
with a diff.

### Gate alignment in CI

```bash
npx expo install --check
```

Exit code `1` means an SDK-tracked package is off the SDK's version. This matters more in an
adopted app, where the React Native version was chosen before Expo arrived.

## Common mistakes

- **Adopting SDK 57 in a React Native 0.87.1 app.** SDK 57 is built against 0.86.3. Wait for an SDK
  that targets your version, or align React Native to the SDK.
- **Running `npx expo prebuild` after adoption.** It deletes and regenerates `ios/` and `android/`,
  wiping the existing app's native work.
- **Installing SDK packages with a bare package-manager install after `expo` is present.** Use
  `npx expo install` so versions match the SDK.
- **Expecting config plugins in `app.json` to change the native projects.** Nothing regenerates in an
  adopted app. Apply each library's native setup by hand.
- **Skipping the iOS deployment target check.** The Expo pods declare iOS 16.4.
- **Treating adoption as the same as starting on Expo.** The native projects stay yours, and so do
  their upgrades.

## Related topics

- [When the Bare CLI Is Better](when-bare-is-better.md) — why existing native apps usually start from the CLI.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — `--check`, `--fix` and the version map.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the strategy an adopted app is on.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the command not to run on an adopted app.
- [SDK to React Native Pairing](../expo-migration/sdk-react-native-pairing.md) — the version constraint in detail.
- [Autolinking](../native-modules/autolinking.md) — how community libraries link on the CLI half.
