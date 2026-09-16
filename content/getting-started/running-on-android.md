---
title: Running on Android
description: What `npm run android` actually does, how to pick an emulator or a device, and how to read the Gradle, Metro and adb failures you will hit on the way.
status: current
toolchain: cli
---

`npm run android` builds a debug APK with Gradle, installs it on a target, launches the main
activity, and makes sure Metro is serving the JavaScript bundle. Four moving parts, four
different places a failure can come from. This page is about telling them apart.

The single most useful habit is reading the **first** error, not the last. Gradle prints a long
tail of "Execution failed for task" lines after the real cause, and the real cause is usually
twenty lines above where your eye lands.

## Why it exists / when to use it — and when NOT to

The CLI command is for the development loop: build, install, attach to Metro, iterate. It always
produces a **debug** build that loads JavaScript from the Metro server over the network.

It is the wrong tool when you want to inspect the release build, test startup time, or reproduce
a bug that only happens without Metro. For those, build the release variant and let the bundle be
embedded in the APK:

```bash
npm run android -- --mode release
```

That takes noticeably longer because it bundles and minifies JavaScript into the APK, and it
needs a signing config. See [Android Signing](../build-and-release/android-signing.md).

## Basic example

Two terminals. Metro in the first, and leave it running:

```bash
npm start
```

The build in the second:

```bash
npm run android
```

Metro's terminal accepts three key commands once it is running, which is faster than reaching for
the device:

| Key | Effect |
| --- | --- |
| <kbd>r</kbd> | Reload the connected app(s) |
| <kbd>d</kbd> | Open the Dev Menu on the connected app(s) |
| <kbd>j</kbd> | Open React Native DevTools |

On the device itself, reload by pressing <kbd>R</kbd> twice, and open the Dev Menu with
<kbd>Ctrl</kbd>+<kbd>M</kbd> (or by shaking a physical device).

## How it works

`npm run android` runs `react-native run-android` from the project-local CLI. In order, it:

1. Looks for a running Metro server on port **8081**. If there is not one, it starts one in a new
   terminal window.
2. Picks a target — the device you named with `--device`, or the single connected device, or a
   booted emulator.
3. Shells out to `./gradlew` in `android/` to assemble and install the debug variant. This is
   where the JDK, the Android SDK and every native dependency get involved.
4. Uses `adb shell am start` to launch the main activity.
5. Sets up `adb reverse tcp:8081 tcp:8081` so the app on the device can reach Metro on your
   machine.

Step 3 is the slow one on a cold build and the one that fails in the most ways. Steps 1 and 5 are
the fast ones that produce the most confusing symptoms, because the build succeeds and the app
still shows a red screen.

### Choosing a target

```bash
# What does adb see right now?
adb devices -l

# Build for one specific target.
npm run android -- --device emulator-5554
npm run android -- --device R5CT30XXXXX

# Pick from a list interactively.
npm run android -- --list-devices
```

`adb devices` is the ground truth. If a device is not in that list, the CLI cannot use it, and no
amount of rebuilding will change that.

:::tabs
@tab Emulator
Boot one before building, or the CLI has to wait for a cold boot inside its own timeout:

```bash
emulator -list-avds
emulator -avd rn_pixel
```

The emulator reaches your machine's `localhost` at the special address **`10.0.2.2`**. You
rarely need to know that, because `adb reverse` makes `localhost:8081` work directly, but it
matters when you are pointing the app at a local API server.
@tab Physical device
Enable **Developer options** (tap Build number seven times in Settings → About phone), then
**USB debugging**. Plug the device in and accept the RSA fingerprint prompt on the phone — the
prompt is easy to miss and until you accept it, `adb devices` shows the device as
`unauthorized`.

```bash
adb devices -l
# R5CT30XXXXX   unauthorized   <- accept the prompt on the phone
# R5CT30XXXXX   device         <- ready
```

Over Wi-Fi, pair first with **Wireless debugging** in Developer options:

```bash
adb pair 192.168.1.50:41234
adb connect 192.168.1.50:39121
```
:::

## Common patterns

### Reading a Gradle failure

Gradle failures fall into a small number of shapes. Match the message, not the task name.

| Message fragment | Cause | Fix |
| --- | --- | --- |
| `Unsupported class file major version` | Wrong JDK | Install JDK 17 and point `JAVA_HOME` at it |
| `SDK location not found` | `ANDROID_HOME` unset, or no `local.properties` | Set `ANDROID_HOME` in your shell profile, then open a new terminal |
| `Failed to install the following Android SDK packages` | Missing platform or build-tools | Install SDK Platform 37 and Build-Tools 37.0.0 |
| `Could not determine java version` | JDK newer than Gradle supports | Same fix: JDK 17 |
| `Execution failed for task ':app:checkDebugAarMetadata'` with a `minCompileSdk` line | A dependency needs a higher `compileSdk` than the project uses | Read the required level from the message; React Native 0.87 sets `compileSdk = 37` |
| `Duplicate class ...` | Two libraries pulling different versions of the same transitive dependency | `./gradlew :app:dependencies` to find both, then align versions |
| `Task :app:mergeDebugResources FAILED` after adding an asset | A resource name that is not a valid Android resource identifier | Rename to lowercase letters, digits and underscores only |
| `error: resource android:attr/lStar not found` | A library built against a much older SDK | Update the library, or force a newer `compileSdk` for it |

When the message is not in that table, ask Gradle for the real stack:

```bash
cd android
./gradlew app:assembleDebug --stacktrace --info
```

`--info` is verbose but it prints the actual compiler invocation, which is what you need when a
native dependency fails to compile.

### The failures that are not Gradle's fault

**"Unable to load script. Make sure you're running Metro."** The build worked. The app cannot
reach the bundle server. In order of likelihood:

```bash
# 1. Is Metro actually running?
npm start

# 2. Can the device reach it? Re-establish the port forward.
adb reverse tcp:8081 tcp:8081

# 3. Is something else on 8081?
```

`adb reverse` is per-device and does not survive a reconnect, a reboot, or `adb kill-server`. If
the app worked ten minutes ago and now cannot load the bundle after you unplugged the phone, this
is why. Run it again.

**Port 8081 is already in use.** Usually a Metro from a previous session, a different React
Native project, or another tool that likes 8081.

:::tabs
@tab macOS
```bash
lsof -i :8081
kill -9 <pid>
```
@tab Windows
```powershell
netstat -ano | findstr :8081
taskkill /PID <pid> /F
```
@tab Linux
```bash
ss -lptn 'sport = :8081'
kill -9 <pid>
```
:::

If you genuinely want two projects running at once, move one of them:

```bash
npm start -- --port 8082
npm run android -- --port 8082
```

The `--port` on the build matters as much as the one on Metro: it is what gets baked into the
app's dev-server setting and what `adb reverse` forwards.

**The app installs but shows the previous code.** Metro's transform cache is stale, which happens
most often after editing `babel.config.js` or `metro.config.js`, or after a dependency changes.

```bash
npm start -- --reset-cache
```

**`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.** A build with a different signing key is already
installed — typically a release build sitting on top of a debug one, or a colleague's APK.

```bash
adb uninstall com.yourapp
npm run android
```

### When to clean, and when not to

Cleaning is expensive and rarely the right first move. A clean is justified when you changed
something Gradle caches aggressively: the Android Gradle Plugin version, `compileSdk`, a native
dependency's version, or Codegen specs.

```bash
cd android
./gradlew clean
```

The heavier reset, for when `clean` is not enough:

```bash
cd android
./gradlew --stop           # kill stale Gradle daemons
rm -rf .gradle build app/build
```

> [!WARNING] Deleting `~/.gradle` is almost never the fix
> It throws away every downloaded dependency for every project on your machine and buys a
> half-hour re-download. Reach for it only when you have concrete evidence of a corrupted
> artifact, such as a checksum mismatch in the error output.

### After adding a native dependency

Installing a package that contains native code is not a JavaScript-only change. Metro will happily
serve the new JavaScript while the native module is missing from the APK, and the failure arrives
at runtime as "TurboModuleRegistry.getEnforcing(...): '<Name>' could not be found".

```bash
npm install some-native-library
npm run android          # rebuild — autolinking runs during the Gradle build
```

Restarting Metro is not enough. The Gradle build is what runs autolinking and compiles the
library into the APK.

## Platform differences

This page is the Android half. The iOS build has an entirely separate set of failure modes —
CocoaPods drift, derived data, signing — and is covered in [Running on iOS](running-on-ios.md).
Android has no equivalent of `pod install`: Gradle resolves and builds native dependencies as
part of the normal build, which is why "rebuild" is the answer to most native-dependency
problems here.

## Performance considerations

- **The first build is slow and the rest are not.** A cold Gradle build compiles every native
  dependency. Expect minutes. Incremental builds after a JavaScript-only change should not
  rebuild anything native at all — if they do, something is invalidating the Gradle cache.
- **Give the Gradle daemon enough heap.** The default in `android/gradle.properties` is
  conservative; out-of-memory failures during Kotlin compilation are the symptom.

  ```properties title=android/gradle.properties
  org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
  ```

- **Do not benchmark on a debug build.** Debug builds run unoptimised JavaScript from Metro with
  dev-mode assertions on. Numbers from them tell you nothing about the shipped app. See
  [Measuring Before Optimising](../performance/measuring-first.md).
- **Prefer an emulator image that matches your CPU.** An x86_64 image on Apple silicon runs under
  full emulation and feels like a broken app rather than a slow one.

## Common mistakes

- **Running `npm run android` with no Metro and then debugging the build.** Wrong: rebuilding
  repeatedly because the app shows a red screen. Right: read the red screen — "Unable to load
  script" is a networking problem, not a build problem.
- **Forgetting `adb reverse` after reconnecting a device.** The forward is per-connection. Wrong:
  concluding the build is broken. Right: `adb reverse tcp:8081 tcp:8081`, then reload.
- **Changing only Metro's port.** Wrong: `npm start -- --port 8082` followed by a plain
  `npm run android`. Right: pass `--port 8082` to both, or the app looks for a server on 8081.
- **Treating `./gradlew clean` as step one.** It costs several minutes and fixes a narrow class of
  problems. Read the error first; clean only after changing AGP, `compileSdk`, or a native
  dependency.
- **Installing a native library and only restarting Metro.** Autolinking runs during the Gradle
  build. Wrong: `npm install x` then <kbd>r</kbd> in Metro. Right: `npm install x` then
  `npm run android`.
- **Ignoring an `unauthorized` device in `adb devices`.** The RSA prompt is on the phone's screen
  and it times out. Unplug, replug, and watch the device.
- **Assuming a release APK will work because the debug one did.** Release builds embed the bundle,
  run R8, and use a different signing config. Test the release variant before you need it; see
  [ProGuard and R8](../build-and-release/proguard-and-r8.md).
- **Deleting `node_modules` as a reflex.** It has no effect on a Gradle failure. Native build
  problems live in `android/`, not in `node_modules`.

## Related topics

- [Environment Setup](environment-setup.md) — the JDK, SDK and `ANDROID_HOME` that Gradle needs.
- [Creating a Project](creating-a-project.md) — `init`, version pinning, and the first build.
- [Running on iOS](running-on-ios.md) — the other half, with its own failure catalogue.
- [Dev Menu and Fast Refresh](dev-menu-and-fast-refresh.md) — the loop once the app is running.
- [Project Structure](project-structure.md) — which files in `android/` you actually edit.
- [Android Signing](../build-and-release/android-signing.md) — what a release build needs.
- [Build Variants and Flavours](../build-and-release/build-variants.md) — debug, release and beyond.
- [Troubleshooting](../reference/troubleshooting.md) — the wider failure catalogue.
