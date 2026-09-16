---
title: Building Locally
description: Producing Android and iOS binaries on your own machine — npx expo run:*, eas build --local, and the host-OS facts that decide what is possible.
status: current
toolchain: expo
sdk: 57
---

You do not need a hosted service to build an Expo app. There are two local paths, and they solve
different problems:

| Path | Needs an Expo account | Uses `eas.json` | What it produces |
| --- | --- | --- | --- |
| `npx expo run:android` / `npx expo run:ios` | No | No | A native build, installed on a connected device or simulator |
| `eas build --local` | **Yes** — it still authenticates | Yes | The same artifact the hosted worker would produce |

Both are supported. Keeping one of them working is worth doing even if you use EAS Build day to
day, because a release you cannot cut without a third party is a single point of failure.

## Why it exists / when to use it — and when NOT to

Use a local build when:

- You want a build with **no account and no upload** — `npx expo run:*` is the only path that
  involves no Expo service at all.
- You are iterating on native code or a config plugin and a hosted round trip is too slow.
- Your source cannot leave your network.
- You are on the free tier and have run out of included builds.

Do not use a local build when:

- **You need an iOS binary and have no Mac.** This is not a preference; iOS binaries require macOS
  with Xcode. No flag works around it.
- You want the build to be reproducible across a team. Local builds use whatever toolchain is on
  the machine — the `node`, `yarn`, `fastlane`, `cocoapods`, `ndk` and `image` pins in `eas.json`
  are hosted-worker settings and are ignored locally.
- You need EAS secret environment variables. They are not available to `--local`.

## Basic example

### A plain native build, no EAS

```bash
npx expo run:android
npx expo run:ios
```

This generates the native projects if they do not exist, compiles them, and installs the app. It is
the Expo equivalent of running Gradle or Xcode by hand, and it is the answer to "can I build this
without an account".

For a release-configuration build:

```bash
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

A release build needs real signing configuration, which is the point at which
[Credentials Management](credentials.md) stops being optional.

### `eas build --local`

```bash
eas build --platform android --profile production --local
eas build --platform ios --profile production --local --output ./build/app.ipa
```

This runs the same build pipeline the hosted worker runs — prebuild, credential resolution,
compile — on your machine. You still sign in first (`eas login`, or set `EXPO_TOKEN`), because the
CLI resolves project and credential state from Expo's servers.

## How it works

### Host OS rules, stated plainly

| Target | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Android | Yes | Yes | Yes |
| iOS | Yes | **No** | **No** |

iOS builds need Xcode, and Xcode only runs on macOS. Every other question about iOS builds is
downstream of that one.

For `eas build --local` specifically, Expo's documentation states that **Windows is not officially
supported** — macOS and Linux are, and WSL is untested. On Windows, `npx expo run:android` is the
reliable local path for Android; for anything else on that machine, use a hosted build or a Linux
container.

### What `--local` gives up

The documented limitations of `eas build --local`:

- `--platform all` is disabled. Build one platform at a time.
- Toolchain version pinning (`node`, `yarn`, `fastlane`, `cocoapods`, `ndk`, `image`) is not
  applied. Your machine's versions are used.
- Build caching is not available.
- **Secret environment variables are not available.** Values you keep as EAS secrets will be
  missing, and the build will either fail or — worse — succeed with an empty string.
- Windows is not officially supported.

### Debugging a local build

Three environment variables control the working directory and cleanup:

```bash
# Keep the temporary working directory after the build for inspection
EAS_LOCAL_BUILD_SKIP_CLEANUP=1 eas build --platform android --profile preview --local

# Use a specific working directory instead of the system temp directory
EAS_LOCAL_BUILD_WORKINGDIR=/tmp/eas-work eas build --platform android --local

# Copy artifacts somewhere predictable
EAS_LOCAL_BUILD_ARTIFACTS_DIR=./artifacts eas build --platform android --local
```

`EAS_LOCAL_BUILD_SKIP_CLEANUP=1` is the one you will actually use. When a local build fails in the
native step, the preserved directory contains the generated `android/` or `ios/` project and you
can run Gradle or Xcode against it directly.

## Platform differences

:::tabs
@tab Android

Requirements: a JDK, the Android SDK, and `ANDROID_HOME` set. `npx expo run:android` needs a
connected device or a running emulator; `eas build --local` does not.

Output is an `.apk` or `.aab` depending on `android.buildType` in the profile.

@tab iOS

Requirements: macOS, Xcode with command line tools, and CocoaPods. A signed device or store build
additionally needs a **paid Apple Developer Program membership**.

The exception is a simulator build, which is unsigned:

```json title=eas.json
{
  "build": {
    "simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    }
  }
}
```

```bash
eas build --platform ios --profile simulator --local
```

That produces a `.app` you can drag onto the iOS Simulator, with no Apple account.

:::

## Common patterns

### Keep the local path in the test matrix

Run a local release build on a schedule — monthly is enough — so that the first time you need it is
not during an incident. A local build that has not run in a year does not work.

### Local for Android, hosted for iOS

Android has no host-OS constraint, so many teams build Android locally or on ordinary Linux CI and
use a hosted builder only for iOS. Nothing in `eas.json` prevents mixing; the profile is the same,
only the invocation differs.

### Reproduce a hosted failure

```bash
EAS_LOCAL_BUILD_SKIP_CLEANUP=1 eas build --platform android --profile production --local
```

If it fails the same way locally, it is a build problem. If it only fails on the worker, look at
environment variables, secrets and credentials — those are the things that differ.

## Common mistakes

- **Expecting `--local` to work offline or without an account.** It authenticates and talks to
  Expo. For a genuinely service-free build, use `npx expo run:android` / `npx expo run:ios`.
- **Expecting secret environment variables in a local build.** They are not available. A build that
  reads a missing secret and succeeds anyway is the dangerous case — assert on required variables
  at startup rather than defaulting them.
- **Assuming `eas.json` toolchain pins apply.** `node`, `yarn`, `cocoapods`, `fastlane`, `ndk` and
  `image` configure the hosted worker only. Local builds use your machine's versions, which is the
  usual explanation for "it builds on EAS but not here".
- **Trying to build iOS on Windows or Linux.** It is not possible. Use a Mac, a hosted build, or a
  Mac in CI.
- **Running `--platform all --local`.** Disabled. One platform per invocation.
- **Hand-editing the generated `android/` inside the preserved working directory and expecting it
  to persist.** That directory is scratch space. Real native changes belong in a
  [config plugin](../expo-config-plugins/what-they-are.md) or in committed native directories.

## Related topics

- [Building on EAS](building.md) — the hosted equivalent and its flags.
- [eas.json and Build Profiles](eas-json.md) — which fields apply locally and which do not.
- [Credentials Management](credentials.md) — signing a local release build.
- [Creating One Locally](../expo-development-builds/creating-locally.md) — development builds without EAS.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the native generation step local builds also run.
- [Prerequisites](../expo-getting-started/prerequisites.md) — what to install on each host OS.
- [Costs and Limits](costs-and-limits.md) — why local builds are sometimes the cheaper answer.
