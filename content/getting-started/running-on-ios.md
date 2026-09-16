---
title: Running on iOS
description: Building and running the iOS app on a simulator and a real device, and reading the CocoaPods, Xcode and signing failures that come with it.
status: current
toolchain: cli
---

> [!WARNING] iOS builds require macOS and Xcode
> Xcode runs only on macOS, and there is no supported alternative — not a virtual machine you can
> license, not a cross-compiler, not a container. If you are on Windows or Linux you can build the
> whole Android app and write all of the shared JavaScript, but the iOS half needs a Mac: your
> own, a colleague's, or a hosted macOS CI runner. Everything on this page assumes macOS.

`npm run ios` compiles the Xcode workspace, installs the app on a simulator or device, launches
it, and makes sure Metro is serving the bundle. Unlike Android, iOS has a separate dependency
step — **CocoaPods** — that you run by hand, and most of the confusing failures on this page come
from that step being out of date.

## Why it exists / when to use it — and when NOT to

The CLI command is the development loop. It always builds the **Debug** configuration, which
loads JavaScript from Metro over the network.

Use Xcode directly instead when you need something the CLI does not expose: reading a native
crash in the debugger, changing signing settings, inspecting the view hierarchy, or profiling with
Instruments. Open **`ios/<App>.xcworkspace`** — never the `.xcodeproj`, which does not include the
pod targets.

For a build that behaves like the shipped app:

```bash
npm run ios -- --mode Release
```

That embeds the JavaScript bundle in the app instead of loading it from Metro, so it is also how
you reproduce "works in development, broken in release".

## Basic example

First run, from a freshly created or freshly cloned project:

```bash
cd ios
bundle install            # installs the CocoaPods version pinned in the Gemfile
bundle exec pod install   # installs the iOS native dependencies
cd ..
```

Then, in two terminals:

```bash
npm start
```

```bash
npm run ios
```

Metro's terminal accepts the same keys as on Android: <kbd>r</kbd> to reload, <kbd>d</kbd> to open
the Dev Menu, <kbd>j</kbd> to open React Native DevTools. On the simulator itself, the Dev Menu is
<kbd>Cmd</kbd>+<kbd>D</kbd>, and reload is <kbd>R</kbd> pressed twice.

## How it works

`npm run ios` runs `react-native run-ios` from the project-local CLI, which:

1. Starts Metro on port **8081** if nothing is listening there.
2. Resolves a target — the simulator you named, the connected device, or a sensible default.
3. Invokes `xcodebuild` against `ios/<App>.xcworkspace` for the Debug configuration.
4. Installs and launches the resulting app bundle with `xcrun simctl` (simulator) or `devicectl`
   (device).

The simulator shares your Mac's network stack, so `localhost:8081` in the app *is* Metro on your
machine. There is no port-forwarding step and nothing equivalent to Android's `adb reverse`. A
**physical** device does not share it, which is a separate problem covered below.

### Choosing a target

```bash
# What simulators and devices exist?
xcrun simctl list devices available
npm run ios -- --list-devices

# Name a simulator exactly as simctl prints it.
npm run ios -- --simulator "iPhone 17 Pro"

# Build to a connected physical device.
npm run ios -- --device "Rowan's iPhone"
```

If `xcrun simctl list runtimes` prints an empty list, you have Xcode but no iOS runtime installed.
Open **Xcode → Settings → Platforms**, press **+**, and install one. The symptom without it is a
"no devices found" error that reads like a CLI bug.

## Common patterns

### CocoaPods drift — the single biggest source of iOS build failures

`Podfile.lock` records exactly which pods, at which versions, are linked into the workspace. Every
one of these makes it stale:

- Installing or removing any package with native code.
- Pulling a branch where somebody else did.
- Upgrading React Native.
- Switching Node or Ruby versions, which can change the resolved pod set.

The fix is always the same:

```bash
cd ios
bundle exec pod install
cd ..
npm run ios
```

The failures it produces are distinctive once you know them:

| Symptom | What it means |
| --- | --- |
| `ld: framework not found <PodName>` | The pod is in `Podfile.lock` but not in the workspace, or vice versa |
| `'RNSomething/RNSomething.h' file not found` | A newly installed library was never `pod install`ed |
| `The sandbox is not in sync with the Podfile.lock` | `Podfile.lock` changed under you; run `pod install` |
| `Unable to find a specification for ...` | Your local pod spec repo is behind: `bundle exec pod repo update` |
| `TurboModuleRegistry.getEnforcing(...) could not be found` at runtime | The JavaScript half is there and the native half is not |

> [!BEST-PRACTICE] Always `bundle exec pod`, never bare `pod`
> Bare `pod` is whatever CocoaPods you last installed globally. `bundle exec pod` is the version
> the project pinned in its `Gemfile`. Mixing the two churns `Podfile.lock` in every pull request
> and produces "works on my machine" differences that are genuinely hard to see.

When `pod install` itself fails, escalate in this order — each step is more destructive than the
last:

```bash
cd ios
bundle exec pod repo update          # 1. refresh the spec repos
bundle exec pod install --repo-update

rm -rf Pods                          # 2. rebuild the pod tree from the lock file
bundle exec pod install

rm -rf Pods Podfile.lock             # 3. re-resolve versions. This CHANGES the lock file.
bundle exec pod install
```

Step 3 can silently bump transitive pod versions, so review the `Podfile.lock` diff before you
commit it.

### Derived data, and when clearing it is justified

Xcode caches build products, indexes and module maps in `~/Library/Developer/Xcode/DerivedData`.
It is usually correct and occasionally not — after an Xcode upgrade, a React Native upgrade, or a
pod set that changed underneath a partially built workspace.

The symptoms that point at derived data rather than at your code:

- A header that demonstrably exists on disk is "not found".
- The build fails on a file you have not touched, and the error mentions a module or a precompiled
  header.
- A clean checkout of the same commit builds fine on a colleague's machine.

```bash
# Scoped: only this project's build products.
cd ios
xcodebuild clean -workspace YourApp.xcworkspace -scheme YourApp

# Heavier: everything Xcode cached for every project.
rm -rf ~/Library/Developer/Xcode/DerivedData
```

> [!WARNING] Clearing derived data is not a diagnostic step
> It costs a full rebuild of every native dependency, and because that "fixes" a lot of unrelated
> things by accident, it teaches you nothing about what was actually wrong. Read the first error
> first. Reach for derived data when the error is about modules, headers or precompiled headers —
> not when a Swift file has a genuine type error.

### Building to a physical device

Two extra things are required that the simulator does not need: **code signing** and **a route to
Metro**.

**Signing.** Open `ios/<App>.xcworkspace` in Xcode, select the app target, go to **Signing &
Capabilities**, tick **Automatically manage signing**, and choose your Team. With a free Apple ID
this works, with two limits worth knowing before you plan around it: the provisioning profile
expires after 7 days, and a handful of capabilities (push notifications, associated domains,
background modes) are unavailable. A paid Apple Developer Program membership removes both.

The failures map cleanly to causes:

| Message | Cause |
| --- | --- |
| `No profiles for 'com.yourapp' were found` | The bundle identifier is not registered to your team. Change it to something unique, then let Xcode create the profile |
| `Signing for "YourApp" requires a development team` | No Team selected on the target |
| `Command CodeSign failed with a nonzero exit code` | A stale or revoked certificate in the keychain, or an expired free-tier profile |
| `Untrusted Developer` on the device after install | Trust the certificate on the phone: Settings → General → VPN & Device Management |

**Reaching Metro.** A physical device is not on your Mac's loopback. It must be on the same
network, and the app must be told where the bundler is. Open the Dev Menu on the device,
choose **Configure Bundler** (called Dev Settings on older builds), and enter your Mac's LAN
address and port, for example `192.168.1.24:8081`:

```bash
# Your Mac's LAN address on the Wi-Fi interface.
ipconfig getifaddr en0
```

If the device cannot reach that address, the usual culprits are a guest or client-isolated Wi-Fi
network, a VPN on the Mac, or the macOS firewall blocking incoming connections to Node.

### Port 8081 is in use

```bash
lsof -i :8081
kill -9 <pid>
```

To run two projects side by side, move one of them — and pass the port to **both** commands, or
the app will keep looking for a server on 8081:

```bash
npm start -- --port 8082
npm run ios -- --port 8082
```

### After adding a native dependency

```bash
npm install some-native-library
cd ios && bundle exec pod install && cd ..
npm run ios
```

Skipping `pod install` here is the most common iOS mistake there is. The JavaScript loads, the
native module does not exist, and the error arrives at the first call rather than at build time.

### Escalating a build failure, in order

Each step costs more than the one above it. Do not start at the bottom.

```bash
# 1. Is it just a stale JS transform?
npm start -- --reset-cache

# 2. Is the pod set current?
cd ios && bundle exec pod install && cd ..

# 3. Is it a cached build product?
cd ios && xcodebuild clean -workspace YourApp.xcworkspace -scheme YourApp && cd ..

# 4. Rebuild the pod tree.
cd ios && rm -rf Pods && bundle exec pod install && cd ..

# 5. Only now, derived data.
rm -rf ~/Library/Developer/Xcode/DerivedData
```

If step 5 does not fix it, the problem is in your code or in a dependency, and no further cleaning
will help. Open the workspace in Xcode and read the error there, where you get the file, the line
and the full compiler invocation.

## Platform differences

:::tabs
@tab iOS
Native dependencies are installed by an explicit `bundle exec pod install` step that you own.
Forgetting it is the default failure mode. The simulator shares the host network, so Metro is
reachable at `localhost` with no configuration.
@tab Android
Gradle resolves and builds native dependencies as part of the normal build, so "rebuild" is the
equivalent of `pod install`. In exchange, the device needs `adb reverse tcp:8081 tcp:8081` to
reach Metro, and that forward does not survive a reconnect. See
[Running on Android](running-on-android.md).
:::

> [!NOTE] Swift Package Manager is Experimental in 0.87
> React Native 0.87 ships an opt-in SPM path that needs no Ruby, Bundler or CocoaPods — only
> Xcode. CocoaPods remains the default, libraries must ship a `Package.swift` to participate, and
> the commands may still change. See
> [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md) before switching a real
> project.

## Performance considerations

- **The first build compiles every pod.** Ten to twenty minutes on a cold checkout is normal.
  Subsequent builds reuse the cache; if they do not, something is invalidating it — most often a
  `pod install` on every run, or derived data being cleared habitually.
- **A debug build is not a performance sample.** It runs unminified JavaScript from Metro with
  development assertions on. Measure `--mode Release` on a real device, never the simulator: the
  simulator runs your Mac's CPU and gives numbers no phone can reproduce. See
  [Measuring Before Optimising](../performance/measuring-first.md).
- **Prefer the simulator for the inner loop anyway.** It builds and boots far faster than a device,
  and for layout and logic work the difference does not matter. Switch to a device for gestures,
  camera, performance and anything touching hardware.

## Common mistakes

- **Opening `ios/<App>.xcodeproj`.** Wrong: double-clicking the `.xcodeproj`, then drowning in
  missing-header errors. Right: open `ios/<App>.xcworkspace`, which includes the pod targets.
- **Installing a native library and not running `pod install`.** Wrong: `npm install x` then
  `npm run ios`. Right: `npm install x`, `cd ios && bundle exec pod install`, then `npm run ios`.
- **Running bare `pod install`.** Use `bundle exec pod install` so the CocoaPods version matches
  the `Gemfile`. A global CocoaPods produces lock-file churn nobody can reproduce.
- **Deleting `Podfile.lock` as a first step.** That re-resolves versions and can bump transitive
  pods invisibly. Try `pod install`, then `rm -rf Pods && pod install`, and only then the lock.
- **Clearing derived data before reading the error.** It is slow and it hides the cause. It is the
  right fix for module and header errors, and the wrong fix for a genuine compile error.
- **Expecting a physical device to find Metro on its own.** The simulator shares your network
  stack; a device does not. Set the bundler host in the Dev Menu to your Mac's LAN address.
- **Assuming a free Apple ID is enough for a demo next week.** The provisioning profile expires
  after 7 days and the app stops launching. Plan for a paid membership if anyone else has to keep
  the build running.
- **Changing only Metro's port.** `npm start -- --port 8082` needs a matching
  `npm run ios -- --port 8082`, or the app looks for 8081.

## Related topics

- [Environment Setup](environment-setup.md) — Xcode, command line tools, Ruby and Bundler.
- [Creating a Project](creating-a-project.md) — `init` and the first `pod install`.
- [Running on Android](running-on-android.md) — the other half, with its own failure catalogue.
- [Dev Menu and Fast Refresh](dev-menu-and-fast-refresh.md) — the loop once the app is running.
- [Project Structure](project-structure.md) — what lives in `ios/`, and what not to edit.
- [iOS Signing and Provisioning](../build-and-release/ios-signing.md) — certificates and profiles in depth.
- [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md) — the Experimental alternative.
- [Troubleshooting](../reference/troubleshooting.md) — the wider failure catalogue.
