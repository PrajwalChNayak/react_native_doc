---
title: Debugging a Development Build
description: React Native DevTools, the dev menu, the network inspector, native logs and the failures specific to a development build rather than to your JavaScript.
status: current
toolchain: expo
sdk: 57
---

A development build debugs like any React Native app, with one addition and one subtraction. The
addition is the dev launcher, which introduces a class of failure that has nothing to do with your
code. The subtraction is that you can no longer blame Expo Go's fixed module set, because the
binary is yours.

This page covers both: the tools, and the development-build-specific failures.

## Basic example

Start the dev server, then press <kbd>j</kbd>:

```bash
npx expo start --dev-client
```

<kbd>j</kbd> opens **React Native DevTools** against the connected app. The interactive command
table also offers:

| Key | Action |
| --- | --- |
| <kbd>r</kbd> | reload app |
| <kbd>j</kbd> | open debugger |
| <kbd>m</kbd> | toggle menu |
| <kbd>shift</kbd>+<kbd>m</kbd> | more tools |
| <kbd>a</kbd> / <kbd>i</kbd> | open Android / iOS simulator |
| <kbd>o</kbd> | open project code in your editor |
| <kbd>s</kbd> | switch between Expo Go and development build |

> [!NOTE] DevTools requires Hermes
> If no Hermes-backed app is connected, Expo CLI declines to open the debugger and says so:
> React Native DevTools can only be used with Hermes. Hermes is the engine SDK 57 uses, so in
> practice this message means nothing is connected rather than that your engine is wrong.

## How it works

### React Native DevTools

The debugger gives you the console, sources with breakpoints, a memory profiler and the React
component tree. It attaches over the same connection Metro uses, which is why the app has to be
running and connected before <kbd>j</kbd> does anything.

React Native 0.86, which SDK 57 ships, adds **light and dark mode emulation** to React Native
DevTools. That is useful precisely because theme bugs are tedious to reproduce on a device.

> [!LEGACY] The standalone `react-devtools` package is not the tool
> Standalone `react-devtools` WebSocket support was removed from React Native. React Native DevTools
> is the supported debugger. If a tutorial tells you to run a separate `react-devtools` process, it
> predates this.

### The dev menu

Shake the device, or press <kbd>m</kbd> in the terminal, for reload, the element inspector and the
performance monitor. [expo-dev-client Features](dev-client-features.md) covers adding your own
entries with `registerDevMenuItems`, which is the right home for "reset onboarding" and "switch
environment" affordances.

### The network inspector

`expo-build-properties` exposes a `networkInspector` option on both platforms, defaulting to
`true`. It is a native build setting, so turning it off requires a rebuild:

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", {"android": {"networkInspector": false}, "ios": {"networkInspector": false}}]
    ]
  }
}
```

You would only disable it to rule it out as the cause of a native-layer networking problem. See
[expo-build-properties](../expo-config-plugins/build-properties.md).

### Native logs

JavaScript errors appear in the DevTools console and in LogBox. Native crashes do not — the app
disappears and the console shows nothing useful.

:::tabs
@tab Android
```bash
adb logcat --pid=$(adb shell pidof -s com.example.myapp)
```

Filters logcat to your app's process. Without the filter, the signal is buried. A native crash
prints a `FATAL EXCEPTION` block with a Java or Kotlin stack trace, or a `signal 11` block for a
native crash in C++.
@tab iOS
Open the project in Xcode and run it from there, or attach to the running process. Xcode's console
shows the native log and stops on native exceptions with a usable stack.

For a build made elsewhere, the device console in Xcode's **Devices and Simulators** window shows
the same logs without a local build.
:::

### Uncaught promise rejections are loud now

Since React Native 0.82 — and therefore in SDK 57 — an uncaught promise rejection raises a
`console.error` instead of being silently swallowed. If your app suddenly seems noisier after an
upgrade, those errors were always happening; they were just invisible.

## Common patterns

### Rule out the launcher before debugging your code

A development build that shows the launcher and will not connect is not a JavaScript problem. Work
through this in order:

1. Is the dev server running, and is the header line `Using development build`? Press <kbd>s</kbd>
   if it says `Using Expo Go`.
2. Are the device and the laptop on the same network, with no VPN and no client isolation? Try
   `npx expo start --tunnel`.
3. Is this development build actually for **this** project? A build from another project connects
   happily and then fails on the first native call.
4. Did you add a native dependency without rebuilding? See
   [Adding Native Dependencies](adding-native-dependencies.md).

### Clear caches in the right order

```bash
npx expo start --clear
```

`--clear` clears the bundler cache; `--reset-cache` is also accepted. Do this **after** ruling out
the connection, not before — a cache clear is a cheap ritual that hides the real question for a
minute and then leaves you where you started.

If the symptom is native rather than JavaScript, the relevant cache is the build cache:

```bash
npx expo run:android --no-build-cache
```

### Read the error's vocabulary to find its layer

| Message | Layer | Action |
| --- | --- | --- |
| `Cannot find native module 'X'` | Native module missing from the binary | Rebuild with the dependency installed |
| `TurboModuleRegistry.getEnforcing(...): 'X' could not be found.` | Same, via React Native's registry | Rebuild |
| `Unable to resolve module …` from Metro | JavaScript resolution | Install the package, restart Metro |
| Red box with your own stack frames | Your JavaScript | Debug normally |
| App closes with no red box | Native crash | `adb logcat` or Xcode |

That table saves more time than any single tool, because the first two look like JavaScript errors
and are not.

### Debug a release-like build when the bug only happens there

Some bugs exist only when Metro is not in the loop — minification, dead-code elimination, missing
development-only polyfills. Build an internal-distribution build without the dev client and
reproduce there. The trade is that you lose the debugger, so lean on logging and on
[Monitoring](../expo-build-and-release/monitoring.md).

## Common mistakes

- **Debugging JavaScript when the error is a missing native module.** `Cannot find native module`
  and `TurboModuleRegistry.getEnforcing` both mean the binary lacks native code. No amount of
  JavaScript work fixes that.
- **Clearing caches first.** It is the cheapest action and almost never the cause. Check the
  connection and the binary first.
- **Expecting a native crash in the DevTools console.** It is not there. Use `adb logcat` or Xcode.
- **Looking for a standalone `react-devtools` process.** That path was removed. Press <kbd>j</kbd>.
- **Profiling in a development build.** The launcher, dev menu and Metro connection are all running.
  Measure in a release build — see [Profiling](../expo-performance/profiling.md).
- **Connecting a development build from another project.** It connects, loads, and then fails in a
  way that looks like your code.
- **Treating new promise-rejection errors after an upgrade as new bugs.** They were being swallowed
  before 0.82.

## Related topics

- [expo-dev-client Features](dev-client-features.md) — the launcher, the dev menu and custom entries.
- [Installing It on a Device](installing-on-a-device.md) — connection and network requirements.
- [Adding Native Dependencies](adding-native-dependencies.md) — the rebuild rule.
- [Why You Need a Development Build](why-you-need-one.md) — the two runtime errors, in full.
- [expo-build-properties](../expo-config-plugins/build-properties.md) — the network inspector option.
- [Profiling](../expo-performance/profiling.md) — measuring in the right build.
- [Troubleshooting](../expo-migration/troubleshooting.md) — upgrade-shaped failures.
