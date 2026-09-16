---
title: Prerequisites
description: What you need installed before creating an Expo SDK 57 project, which parts are optional, and what genuinely requires a Mac.
status: current
toolchain: expo
sdk: 57
---

Expo SDK 57 needs less installed up front than a bare React Native project does, because the
native build tooling only becomes necessary when you build a native binary. This page
separates what you need on day one from what you need when you build.

## Why it exists / when to use it — and when NOT to

The honest framing: **you need Node and a package manager to start. You need platform SDKs to
build.** Many people install Xcode and Android Studio before writing a line of code, discover
the download takes an afternoon, and conclude the toolchain is heavy. It is not, yet.

You will need the platform tooling soon — the point where a project outgrows Expo Go and
needs a [development build](../expo-core-concepts/expo-go-vs-development-builds.md) arrives
early — but "soon" is not "before `create-expo-app`".

## The baseline: what everyone needs

| Thing | Requirement |
| --- | --- |
| **Node.js** | A current LTS release. React Native 0.86.3 declares `engines.node` as `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0 \|\| >= 25.0.0`. |
| **A package manager** | npm, yarn, pnpm or bun. All four are supported by the Expo CLI. |
| **Git** | Not strictly required, but `npx expo prebuild` checks git status before it deletes native directories, and that check is worth having. |
| **An OS** | macOS, Windows (PowerShell or WSL 2), or Linux. |

That is the whole list for creating a project and running it in Expo Go or on the web.

> [!NOTE] Watchman is no longer required
> Expo documents Watchman as required only for **SDK 55 and earlier**. On SDK 57 you do not
> need to install it.

Check your Node version before anything else:

```bash
node --version
npm --version
```

## What each platform target adds

### Android

Needed to run `npx expo run:android` or to build a development build locally.

- **Android Studio**, which brings the Android SDK, platform tools and the emulator.
- **JDK 17.** Expo documents the Azul Zulu distribution (`zulu@17` on macOS,
  `microsoft-openjdk17` on Windows).
- **Android SDK Platform 36** (Android 16, "Baklava"), plus its Sources. Android Studio
  installs the newest platform by default, which is not necessarily the one required —
  select Platform 36 explicitly in the SDK Manager.
- **An emulator image**, or a physical device with USB debugging enabled.

Android development works on macOS, Windows and Linux equally. Nothing here is Mac-only.

### iOS

> [!WARNING] iOS builds require macOS
> There is no supported way to build an iOS binary on Windows or Linux. `npx expo prebuild`
> on Windows will not even generate the iOS project — it prints a warning that it is
> "Skipping generating the iOS native project files" and tells you to run it again from macOS
> or Linux.

On a Mac you need:

- **Xcode**, from the Mac App Store, and its command line tools.
- **An iOS Simulator runtime**, installed through Xcode's Components settings. Xcode does not
  always install one by default.
- **CocoaPods**, which the Expo CLI runs for you as part of `prebuild` and `run:ios`.

The generated iOS project targets **iOS 16.4** as its deployment target on SDK 57. You can
raise it with [`expo-build-properties`](../expo-config-plugins/build-properties.md).

### Web

`npx expo start --web` needs `react-dom`, and `react-native-web` if your app imports
`react-native` components (it does). The default template already includes both. If they are
missing, the CLI tells you and the fix is:

```bash
npx expo install react-dom react-native-web @expo/metro-runtime
```

See [Running on the Web](running-on-web.md) for what web support actually covers.

## Platform differences

:::tabs
@tab macOS
The only platform where you can target both iOS and Android from one machine. Install Xcode
for iOS and Android Studio for Android. Node via a version manager (`nvm`, `fnm`, `volta`)
rather than the system install, so a global upgrade does not break every project at once.
@tab Windows
Android only. Use PowerShell or WSL 2 — both are supported. Under WSL 2, the Android SDK and
emulator normally live on the Windows side while your project lives in the Linux filesystem;
keeping the project on the Linux filesystem matters, because Metro's file watching across the
Windows/Linux boundary is slow.

You can still develop and test the iOS half of your app: run it on a physical iPhone using a
development build produced by a Mac or by a cloud build, and use the web target for quick
layout checks. What you cannot do is compile iOS locally.
@tab Linux
Android only, same as Windows. Android Studio and JDK 17 from your distribution or from
JetBrains Toolbox. Everything in the Expo CLI is supported.
:::

## How it works

### What `npx` is doing

Every command on this site is `npx expo ...`, never a global `expo` binary. `npx` resolves
`expo` from your project's `node_modules`, which means the CLI version always matches the SDK
version installed in that project. A globally installed CLI is the classic source of "this
worked yesterday" bugs, because it drifts out of step with each project it touches.

SDK 57 ships `@expo/cli` **57.0.24** inside the `expo` package. You do not install it
separately.

### Checking an existing machine

Once you have a project, `expo-doctor` checks the installed toolchain and your dependency
versions against the SDK:

```bash
npx expo-doctor
```

It runs a set of checks against the project rather than the machine alone, so run it from
inside a project directory. For dependency versions specifically,
`npx expo install --check` is the narrower tool — see
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Common patterns

### Use a Node version manager

Projects pin different Node majors, and React Native's supported range moves with each
release. `nvm`, `fnm` or `volta` costs five minutes and removes a recurring class of problem.

### Do not install a global Expo CLI

The old globally installed `expo-cli` package is not the current CLI, and having it on your
`PATH` shadows the correct one in confusing ways. If you installed it at some point, remove
it, and always start the dev server with:

```bash
npx expo start
```

The current CLI lives inside the `expo` package in your project, and `npx expo` finds it.

### Install platform tooling when you first need it

A reasonable order: create the project, run it on the web or in Expo Go, then install Android
Studio when you first need a development build, then Xcode if you are on a Mac. Front-loading
all of it is optional.

## Common mistakes

- **Installing a global `expo-cli`.** It is the previous-generation global CLI and it drifts
  out of step with every project it touches. Use `npx expo`, which resolves the CLI matching
  the project's SDK.
- **Assuming Android Studio installed the right SDK platform.** It installs the newest one.
  SDK 57 needs **Platform 36**; select it explicitly in the SDK Manager or Gradle will fail
  with a missing-platform error.
- **Installing the wrong JDK major.** Expo documents **JDK 17**. A newer JDK on the path is
  one of the most common causes of an opaque Gradle failure.
- **Expecting to build iOS on Windows.** You cannot. `npx expo prebuild` skips the iOS
  project entirely on Windows rather than failing, which is easy to miss in the log.
- **Installing Watchman because a tutorial said to.** Required on SDK 55 and earlier, not on
  57.
- **Keeping the project on the Windows filesystem while building under WSL 2.** Metro's file
  watching across the boundary is slow enough to be mistaken for a broken install.

## Related topics

- [Creating a Project](creating-a-project.md) — the next step once Node is in place.
- [Running on a Simulator](running-on-a-simulator.md) — where Xcode and Android Studio start to matter.
- [Running on a Device](running-on-a-device.md) — the path that needs the least local tooling.
- [Running on the Web](running-on-web.md) — what web support covers on SDK 57.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — when platform tooling stops being optional.
- [Creating One Locally](../expo-development-builds/creating-locally.md) — a local development build, and what it needs installed.
- [Expo Troubleshooting](../expo-migration/troubleshooting.md) — when the toolchain misbehaves.
