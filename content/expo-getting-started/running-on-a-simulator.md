---
title: Running on a Simulator
description: Opening an Expo SDK 57 app in the Android emulator and the iOS Simulator, the difference between expo start and expo run, and what each one needs installed.
status: current
toolchain: expo
sdk: 57
---

There are two ways to get your app onto a simulator, and they are not variations of the same
thing. `npx expo start` attaches a JavaScript bundle to an app that already exists.
`npx expo run:android` / `run:ios` compiles a native app first. Knowing which one you are
doing explains most of the confusing errors in this area.

## Basic example

Start the dev server and open a simulator from it:

```bash
npx expo start
```

Then press a key in the terminal:

| Key | Action |
| --- | --- |
| `a` | open Android |
| `i` | open iOS simulator (macOS only) |
| `w` | open web |
| `r` | reload app |
| `j` | open debugger |
| `m` | toggle the dev menu on the device |
| `shift+m` | more tools |
| `o` | open the project in your editor |
| `s` | switch between Expo Go and a development build |
| `?` | show all commands |

Or skip the key press:

```bash
npx expo start --android    # or -a
npx expo start --ios        # or -i
```

> [!NOTE] `shift+a` and `shift+i` let you choose
> Pressing `a` or `i` opens whichever device the CLI picks. `shift+a` prompts you to select
> an Android device or emulator; `shift+i` prompts you to select an iOS simulator. Press `?`
> to see the full list of commands, which includes these.

## Why it exists / when to use it — and when NOT to

`npx expo start` is what you run all day. It starts Metro, serves your JavaScript, and
connects to an app already installed on the simulator — either Expo Go or your development
build.

`npx expo run:android` and `npx expo run:ios` do a full native build: generate the native
project if it is missing, compile it, install it on the device, and start Metro. You run
these when the **native** side changed — a new native dependency, an app config change that
affects native files, an SDK upgrade — and not otherwise. A native build takes minutes; a JS
reload takes under a second.

> [!DANGER] `run:android` and `run:ios` invoke prebuild
> If `ios/` or `android/` does not exist, these commands generate it. If it does exist and
> is malformed, the CLI offers to clear and reinitialise it. Any hand-edits you made inside
> those directories can be destroyed. Read [expo prebuild](../expo-core-concepts/prebuild.md)
> before running either on a project with hand-edited native code.

## Platform differences

:::tabs
@tab Android
Works on macOS, Windows and Linux.

You need Android Studio, JDK 17 and an emulator image. Create one in Android Studio's Device
Manager; the CLI can start a stopped emulator for you but cannot create one.

```bash
# Attach to an emulator that already has Expo Go or your dev build installed
npx expo start --android

# Build the native app and install it on the emulator
npx expo run:android
```

Useful `run:android` flags, verified against `@expo/cli` 57.0.24:

| Flag | Effect |
| --- | --- |
| `--variant <name>` | Build variant or product flavor plus variant. Default: `debug`. |
| `-d, --device [device]` | Device name to run on. |
| `--no-build-cache` | Clear the native build cache. |
| `--no-bundler` | Skip starting Metro — useful when one is already running. |
| `--no-install` | Skip installing dependencies. |
| `--binary <path>` | Install an existing `.apk` or `.aab` instead of building. |
| `--app-id <appId>` | Custom Android application ID to launch. |
| `-p, --port <port>` | Metro port. Default: 8081. |

If the emulator is running but the CLI cannot see it, check `adb devices`. A device listed as
`unauthorized` needs the USB-debugging prompt accepted inside the emulator.
@tab iOS
**macOS only.** There is no supported way to run the iOS Simulator on Windows or Linux, and
`npx expo prebuild` on Windows skips the iOS project entirely rather than failing loudly.

You need Xcode and at least one Simulator runtime installed through Xcode's Components
settings — Xcode does not always install one.

```bash
npx expo start --ios
npx expo run:ios
```

Useful `run:ios` flags:

| Flag | Effect |
| --- | --- |
| `--configuration <configuration>` | Xcode configuration: `Debug` or `Release`. Default: `Debug`. |
| `-d, --device [device]` | Device name, UDID, or `generic` for build-only. |
| `--scheme [scheme]` | Xcode scheme to build. |
| `-o, --output <path>` | Directory to write the built binary to. |
| `--no-build-cache` | Clear derived data before building. |
| `--no-bundler` | Skip starting Metro. |
| `--binary <path>` | Install an existing `.app` or `.ipa`. |
| `-p, --port <port>` | Metro port. Default: 8081. |

A release-configuration simulator build, useful for measuring performance honestly:

```bash
npx expo run:ios --configuration Release
```

The generated iOS project targets iOS 16.4 on SDK 57, so a Simulator runtime older than that
will not accept the build.
:::

## How it works

### What actually runs on the simulator

Three different things can be the app on the simulator, and the CLI tells you which one it is
targeting in the line it prints on start:

| The app | Where it comes from | Native modules available |
| --- | --- | --- |
| **Expo Go** | Downloaded from the store, or installed by the CLI | Only the fixed set it was built with |
| **A development build** | `npx expo run:*` or EAS, built from your project | Everything your project installs |
| **A release build** | `--configuration Release` / `--variant release` | Everything, with the JS bundled in |

Press `s` in the dev server to switch which one `a` and `i` target. The
[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) page
explains why the middle row is where real development happens.

### The dev server auto-detects a development build

If `expo-dev-client` is a direct dependency in your `package.json`, `npx expo start` runs in
development-build mode by default and stops offering Expo Go as the target. That is the
intended behaviour: once you have a dev client, Expo Go is the wrong target because it does
not contain your native modules.

### When a native rebuild is actually required

You only need `npx expo run:*` again after:

- installing or removing a package with native code
- changing anything in `app.json` that affects the native projects (permissions, scheme,
  icons, plugins, bundle identifier)
- adding, removing or changing a config plugin
- upgrading the Expo SDK

Editing JavaScript, TypeScript, styles or assets does not need one. Fast Refresh handles it —
see [The Dev Server and Fast Refresh](dev-server-and-fast-refresh.md).

## Common patterns

### Keep Metro running across native rebuilds

```bash
# Terminal 1
npx expo start

# Terminal 2
npx expo run:android --no-bundler
```

`--no-bundler` tells the build not to start a second Metro instance on the same port, which
is the cause of the "port 8081 already in use" prompt.

### Clear the bundler cache before blaming your code

```bash
npx expo start --clear
```

A stale Metro cache produces symptoms that look like broken code: a module resolving to an
old version, a changed `babel.config.js` not taking effect, an alias not resolving. Try this
before deeper debugging. `--reset-cache` is an alias for the same flag.

### Measure on a release build, never a debug one

Debug builds are not representative. JavaScript is served from Metro rather than bundled,
development-only checks are active, and the native code is unoptimised.

```bash
npx expo run:ios --configuration Release
npx expo run:android --variant release
```

See [Measuring Before Optimising](../expo-performance/measuring-first.md).

## Common mistakes

- **Running `npx expo run:android` for every change.** It is a full native build. Use
  `npx expo start` and let Fast Refresh do the work; rebuild only when the native side
  changed.
- **Expecting `npx expo start` to install the app.** It attaches to an app that is already
  there. If nothing is installed, `a` and `i` can install Expo Go for you, but a development
  build has to be built or installed first.
- **Running two Metro instances.** `npx expo run:*` starts one unless you pass
  `--no-bundler`, and a second one on a different port means your app connects to the wrong
  bundler and shows stale code.
- **Trying to run the iOS Simulator on Windows.** Not possible. Use a physical iPhone with a
  development build, or the web target for layout work. See
  [Running on a Device](running-on-a-device.md).
- **Hand-editing the generated `ios/` project in Xcode and then running `run:ios` again.**
  The regeneration can wipe it. Express the change in the app config or a config plugin.
- **Assuming a debug build's performance means anything.** It does not.

## Related topics

- [Prerequisites](prerequisites.md) — Xcode, Android Studio and JDK 17.
- [Running on a Device](running-on-a-device.md) — physical hardware, and the only iOS option off a Mac.
- [The Dev Server and Fast Refresh](dev-server-and-fast-refresh.md) — what the dev server does between rebuilds.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — which app you are attaching to.
- [expo prebuild](../expo-core-concepts/prebuild.md) — what `run:*` invokes, and what it destroys.
- [Creating One Locally](../expo-development-builds/creating-locally.md) — building a dev client on your own machine.
- [Debugging a Development Build](../expo-development-builds/debugging.md) — the `j` key and what it opens.
- [Measuring Before Optimising](../expo-performance/measuring-first.md) — why release configuration matters.
