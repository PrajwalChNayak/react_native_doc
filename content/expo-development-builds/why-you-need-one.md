---
title: Why You Need a Development Build
description: Expo Go ships a fixed set of native modules, so it breaks at runtime the moment your project adds one it does not contain. A development build is your own binary with your own native code.
status: current
toolchain: expo
sdk: 57
---

A **development build** is your own app binary, compiled from your own native dependencies, with
`expo-dev-client` installed so it still connects to a Metro dev server and still hot-reloads.
It is the normal way to develop a real Expo app.

Expo Go is not that. Expo Go is a pre-compiled app from the App Store and Play Store containing a
**fixed** set of native modules chosen by Expo. You cannot add to it. The moment your project needs
a native module Expo Go was not compiled with, Expo Go cannot run your project — and it tells you
so at **runtime**, after the bundle has already loaded.

[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) introduces
that distinction and when each one applies. This page is about the build itself: what forces you
into one, what the failure looks like, and what you get in exchange.

## Why it exists / when to use it — and when NOT to

Use a development build when any of the following is true, which for a real app is almost
immediately:

- You installed a library with custom native code that Expo Go does not bundle.
- You need a config plugin to change something in `AndroidManifest.xml`, `Info.plist`, an
  entitlements file, Gradle or the Podfile.
- You need a custom URL scheme, an app-specific bundle identifier, push notification
  entitlements, or a background mode.
- You are testing anything that depends on your real app identity — deep links, OAuth redirects,
  App Clips, widgets, share extensions.
- You want the app your testers install to resemble the app you will ship.

Expo Go is still genuinely useful for: trying an SDK package before committing to it, reproducing a
bug on someone else's machine without a build, and teaching. Treat it as a sandbox with a fixed
module list, not as a development environment.

> [!NOTE] A development build is a debug build, not a release build
> `expo-dev-client` is a development tool. It belongs in your debug and internal-distribution
> builds, not in what you ship to the stores. See
> [Creating One with EAS](creating-with-eas.md) for how build profiles keep those apart.

## The failure you actually hit

This is the important part, because the error arrives later than people expect. Adding a native
library succeeds. Metro bundles fine. The app opens in Expo Go. Then the screen that imports the
module throws.

For a library built on the Expo modules API, the message comes from
`expo-modules-core`'s `requireNativeModule`, and reads literally:

```text
Cannot find native module 'ExpoBarCodeScanner'
```

The module name in the quotes is the **native** module name, which often differs from the npm
package name — that mismatch is why the error is hard to search for.

For a library built on React Native TurboModules, the message comes from
`TurboModuleRegistry.getEnforcing` instead:

```text
TurboModuleRegistry.getEnforcing(...): 'RNFooModule' could not be found. Verify that a module by
this name is registered in the native binary.
```

> [!NOTE] Both strings were read from the installed packages
> `Cannot find native module '<name>'` is the literal template in
> `expo-modules-core`'s `requireNativeModule`, and the TurboModule text is the literal `invariant`
> message in React Native 0.86's `TurboModuleRegistry.getEnforcing`. The surrounding red-box
> presentation, stack frames and any extra hint lines vary by library and by platform, so treat
> the wording above as the core of the message rather than the whole of what you will see.

Both say the same thing in different vocabularies: **the JavaScript is asking for native code that
is not inside the binary you are running.** In Expo Go, there is no way to put it there. The fix is
not a Metro cache clear, a reinstall or a `--reset-cache`; it is a build.

### Why it is a runtime error and not a build error

There is no build step. Expo Go was compiled months ago, by Expo, on their machines. Your project
only produces a JavaScript bundle, and a JavaScript bundle can import anything — the import
resolves against `node_modules`, which does contain the library's JavaScript. The absence is on the
native side, and nothing checks the two against each other until the JavaScript actually calls into
native code.

That is also why the error can appear on one screen and not another, or only after a particular
user action. The import is fine; the first call is not.

## Decision table

| Your situation | Expo Go | Development build |
| --- | --- | --- |
| Only `expo-*` packages that Expo Go already bundles | Works | Works |
| Any library with custom native code Expo Go does not bundle | **Fails at runtime** | Works |
| Any config plugin that edits native files | Ignored — Expo Go's native files are not yours | Applied |
| Custom app icon, name, bundle identifier or URL scheme | Not yours — you get Expo Go's | Yours |
| Deep links and universal links against your real scheme or domain | Not testable | Testable |
| Push notifications with your own credentials | Not testable | Testable |
| Native permissions strings from your own `Info.plist` | Expo Go's strings | Yours |
| Release-like performance measurement | Misleading | Representative |
| Trying an SDK package in five minutes | Ideal | Overkill |
| Sharing a reproduction with someone who has no toolchain | Ideal | Heavier |

## How it works

A development build is a normal debug build of your app with one extra dependency:

```bash
npx expo install expo-dev-client
```

That resolves `expo-dev-client` to the SDK 57 version, `~57.0.19`. Use `npx expo install` rather
than a bare package-manager install so the version matches your installed SDK; a mismatched native
module fails at runtime, which is the same class of problem this whole page is about.

Adding the package does three things:

1. It adds the **dev launcher** — an in-app screen that lets you pick which dev server or update to
   load, so you can switch projects without recompiling.
2. It adds the **dev menu**, with reload, the element inspector, performance monitor and a hook for
   your own entries.
3. It registers a config plugin, so the next native generation wires the launcher into
   `MainActivity` and the iOS app delegate and registers a URL scheme.

Then you build once. From that point the loop is identical to Expo Go's: edit JavaScript, Metro
rebuilds, the app fast-refreshes. You only rebuild the binary when the **native** surface changes —
a new native dependency, a config plugin change, or an SDK upgrade.

> [!WARNING] The build is per-project, not per-machine
> A development build contains your project's native modules. A teammate's development build for a
> different project will not run your project correctly even though the launcher will happily
> connect to your dev server. Symptoms look exactly like the errors above.

## Common patterns

### Start the dev server for a development build

```bash
npx expo start --dev-client
```

Without `--dev-client` the server may target Expo Go instead. While the server is running, press
<kbd>s</kbd> to switch between Expo Go and development-build mode — the interactive command table
prints the current target as `Using development build` or `Using Expo Go`.

### Keep Expo Go working for as long as it is useful

Nothing forces you to abandon Expo Go the moment you make a development build. Until you add a
module Expo Go lacks, both run the same project from the same dev server. Once one screen breaks in
Expo Go, stop pretending — mixed evidence from two different binaries wastes more time than the
rebuild costs.

### Tell the team which one to use

Write it down in the README, next to the run command. "Expo Go will fail on the camera screen"
saves a new contributor an afternoon.

## Performance considerations

A development build is a **debug** build. It includes the dev launcher, the dev menu, the
Metro-connected bundle and development-only assertions. Measurements taken in it are not
representative of release performance — usually pessimistic, occasionally optimistic in ways that
hide real problems.

Measure performance in a release build. Expo Go is worse still as a measuring instrument, because
its binary contains roughly 120 native modules you are not using.

## Common mistakes

- **Reading `Cannot find native module '…'` as a Metro problem.** Clearing the Metro cache,
  deleting `node_modules` and reinstalling changes nothing, because the missing thing is native
  code inside the running binary. Build a development build instead.
- **Searching for the npm package name from the error text.** The quoted name is the native module
  name registered in the binary, which is frequently different from the package on npm. Search for
  the package that owns the screen you were on.
- **Installing a native library with a bare `npm install`.** It fetches `latest`, which is routinely
  built against a different SDK. Use `npx expo install <package>`, then rebuild.
- **Expecting a config plugin to take effect in Expo Go.** Plugins edit the native project during
  generation. Expo Go's native project is not yours, so plugins are simply not applied there.
- **Treating a development build as something you ship.** It is a debug build with a launcher UI in
  it. Keep it in a development or internal profile.
- **Reusing one teammate's development build across projects.** The launcher will connect and the
  JavaScript will load, and then you get the same runtime error with a confusing cause.
- **Benchmarking in Expo Go or a development build.** Both are debug binaries carrying development
  tooling. Benchmark a release build.

## Related topics

- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — the distinction and when each applies.
- [Creating One Locally](creating-locally.md) — `npx expo run:android` / `run:ios` and `eas build --local`.
- [Creating One with EAS](creating-with-eas.md) — the hosted path, and what it costs.
- [Installing It on a Device](installing-on-a-device.md) — getting the binary onto real hardware.
- [expo-dev-client Features](dev-client-features.md) — the launcher, the dev menu and `launchMode`.
- [Adding Native Dependencies](adding-native-dependencies.md) — when a new package forces a rebuild.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — why plugins need a development build.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why the install command matters.
