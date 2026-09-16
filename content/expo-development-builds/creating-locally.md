---
title: Creating One Locally
description: Build a development build on your own machine with npx expo run:android, npx expo run:ios, or eas build --local — no hosted service and no queue.
status: current
toolchain: expo
sdk: 57
---

You do not need a hosted build service to produce a development build. Two local routes exist, and
both are fully supported:

- **`npx expo run:android` / `npx expo run:ios`** — a plain native build through Gradle or Xcode,
  which then installs and launches the app and starts Metro.
- **`eas build --local`** — the EAS build pipeline executed on your machine instead of Expo's
  servers. EAS CLI still reads `eas.json`, still resolves credentials, and produces the same kind
  of artifact as a cloud build.

Local builds are a real alternative to paid cloud builds, not a fallback. They cost you machine
time and a working native toolchain instead of money and queue time.
[Creating One with EAS](creating-with-eas.md) covers the hosted route and where it earns its place.

## Why it exists / when to use it — and when NOT to

Build locally when:

- You already have Android Studio, or a Mac with Xcode, set up.
- You are iterating on native configuration and want the turnaround measured in minutes rather than
  queue position.
- You cannot or do not want to upload source to a hosted service.
- You want to avoid a paid plan.

Do **not** build locally when:

- **You need an iOS build and you do not have a Mac.** This is absolute. Building for iOS requires
  macOS with Xcode. No amount of configuration makes `npx expo run:ios` work on Windows or Linux.
- You need the same artifact reproduced consistently across a team with different machines.
- You need signed builds for testers and do not want to manage signing identities yourself.
- Your CI does not have the toolchain, and you do not want to install it there.

## Basic example

Install the dev client first, so the build that comes out is a development build rather than a
plain debug build:

```bash
npx expo install expo-dev-client
```

That resolves to `~57.0.19` on SDK 57. Then build and run:

:::tabs
@tab Android
```bash
npx expo run:android
```
Requires the Android SDK and a connected device or running emulator. Works on macOS, Windows and
Linux.
@tab iOS
```bash
npx expo run:ios
```
**Requires macOS with Xcode.** There is no cross-platform substitute.
:::

The first run is slow — it compiles the whole native project. Subsequent runs reuse the Gradle and
Xcode build caches and are much faster.

## How it works

`npx expo run:<platform>` does four things in order:

1. **Ensures a native project exists.** If `android/` or `ios/` is missing, it runs prebuild for
   that platform first. If the directory already exists, it is left alone and used as-is.
2. **Installs dependencies** — npm packages and, on iOS, CocoaPods. Skip with `--no-install`.
3. **Builds and installs the app** through Gradle or Xcode, then launches it on the device or
   simulator.
4. **Starts Metro**, unless you pass `--no-bundler`.

> [!DANGER] Prebuild clears and regenerates the native directories
> In SDK 57, `npx expo prebuild` **clears and regenerates** `ios/` and `android/` by default.
> Anything you hand-edited there is destroyed. `--no-clean` applies changes to the existing folders
> instead of recreating them, but that is a narrower promise than it sounds — it does not preserve
> arbitrary hand edits reliably.
>
> `npx expo run:*` only triggers a prebuild when the native directory is **absent**, so it will not
> silently wipe a directory you already have. Running `prebuild` yourself will. Decide once whether
> your project is fully generated or has committed native directories, and see
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

### Useful flags

Read out of the installed `@expo/cli` 57.0.24.

| Flag | Platform | What it does |
| --- | --- | --- |
| `-d, --device [device]` | both | Device name to run the app on |
| `-p, --port <port>` | both | Port for the dev server. Default `8081` |
| `--no-install` | both | Skip installing dependencies |
| `--no-build-cache` | both | Clear the native build cache |
| `--no-bundler` | both | Skip starting Metro |
| `--binary <path>` | both | Install an existing `.apk` / `.aab` or app bundle rather than building |
| `--variant <name>` | Android | Build variant or product flavour. Default `debug` |
| `--app-id <appId>` | Android | Custom Android application ID to launch |
| `--configuration <name>` | iOS | Xcode build configuration |
| `--scheme <scheme>` | iOS | Xcode scheme to build |

```bash
npx expo run:android --device
npx expo run:ios --device --configuration Debug
```

### Building with `eas build --local`

This runs the EAS build steps on your machine. You still need `eas.json` and a profile, and you
still need to be logged in for anything that resolves credentials from Expo's servers.

```bash
npx eas-cli@24.5.0 build --profile development --platform android --local
```

The same platform rule applies: `--platform ios` locally requires macOS with Xcode.

> [!WARNING] `--local` is labelled experimental by EAS CLI
> The flag's own description in EAS CLI 24.5.0 reads `Run build locally [experimental]`. It works
> and people use it in production pipelines, but treat behaviour changes across EAS CLI versions as
> expected rather than surprising.

`--output <path>` writes the resulting artifact to a path you choose, which is what you want in CI.

## Platform differences

:::tabs
@tab Android
Buildable on macOS, Windows and Linux. You need a JDK, the Android SDK and either a physical device
with USB debugging or a running emulator.

The debug build is signed with a debug keystore that Gradle generates, so there is nothing to
configure before your first build. That same fact means the artifact is not distributable to
testers through the Play Store.
@tab iOS
**macOS with Xcode only.** The simulator needs no Apple Developer account. A physical device needs a
signing identity and a provisioning profile; a free Apple ID can sign for personal devices with a
short-lived profile, which is enough for solo development but expires quickly.

CocoaPods runs as part of the build. If it fails, the error usually points at a pod version rather
than at your app.
:::

## Common patterns

### Rebuild only when the native surface changes

After the first successful build, keep working with:

```bash
npx expo start --dev-client
```

JavaScript changes fast-refresh. Rebuild the binary when you add a native dependency, change a
config plugin, or upgrade the SDK. [Adding Native Dependencies](adding-native-dependencies.md) has
the full rule.

### Keep local and cloud builds honest about each other

If your team uses both, pin the same EAS CLI version everywhere and use the same profile name. A
build that works locally and fails in the cloud is nearly always a difference in toolchain version
or in an environment variable, not in your code.

### Clear the native cache before blaming your code

```bash
npx expo run:android --no-build-cache
```

Gradle and Xcode caches survive changes they should not occasionally, particularly after an SDK
upgrade. One clean build is cheaper than an hour of hypotheses.

## Common mistakes

- **Trying to build for iOS without a Mac.** `npx expo run:ios` and `eas build --local --platform
  ios` both need macOS with Xcode. If you are on Windows or Linux and need an iOS build, the hosted
  service is the only option — see [Creating One with EAS](creating-with-eas.md).
- **Running `npx expo prebuild` to "fix" a build, on a project with hand-edited native code.** It
  clears and regenerates the directories in SDK 57. Your edits are gone and the build failure is
  usually still there.
- **Forgetting `expo-dev-client` and wondering where the launcher went.** Without it you get a plain
  debug build that loads one hard-coded dev server URL and has no launcher screen.
- **Rebuilding the binary for every JavaScript change.** You only need a rebuild when the native
  surface changes. Otherwise `npx expo start --dev-client` is the whole loop.
- **Assuming a debug Android build can be uploaded to the Play Store.** It is signed with a
  generated debug keystore. Distribution needs a real signing configuration.
- **Comparing a local build and a cloud build with different EAS CLI versions.** Pin the version in
  `eas.json`'s `cli.version` field so the comparison means something.

## Related topics

- [Why You Need a Development Build](why-you-need-one.md) — what forces you into one.
- [Creating One with EAS](creating-with-eas.md) — the hosted alternative, and what it costs.
- [Installing It on a Device](installing-on-a-device.md) — getting the artifact onto hardware.
- [Adding Native Dependencies](adding-native-dependencies.md) — when you must rebuild.
- [Local Builds](../expo-eas/local-builds.md) — `eas build --local` in more depth.
- [expo prebuild](../expo-core-concepts/prebuild.md) — what generation actually does.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — pick one strategy.
- [Prerequisites](../expo-getting-started/prerequisites.md) — the toolchain a local build needs.
