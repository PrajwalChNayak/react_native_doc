---
title: Writing a Module in Kotlin
description: The Android half of an Expo module end to end — Gradle setup, the ModuleDefinition DSL, argument conversion, coroutines, errors, events and the TypeScript call site.
status: current
toolchain: expo
sdk: 57
---

This page builds the Android side of one real Expo module from an empty directory to a typed
call site. The example is a **battery** module: it reports a level, exposes a charging flag,
runs a slow read off the main thread, and emits an event when the charging state changes.

Everything here is verified against `expo-modules-core@57.0.18`, the version Expo SDK 57 pins.

> [!NOTE] Expo Go vs development build
> A module you wrote is native code, and Expo Go cannot load it. Create a
> [development build](../expo-development-builds/creating-locally.md) and rebuild it whenever
> the native code changes — Fast Refresh only reloads JavaScript.

> [!WARNING] This page was not compiled
> The Kotlin here was written against the installed `expo-modules-core` sources and the SDK 57
> module template, but it has not been run through Gradle as part of authoring this site. Treat
> it as correct in shape and check it against your own build.

## Why it exists / when to use it — and when NOT to

Write Kotlin when the capability you need lives in the Android platform or in an Android-only
vendor SDK. If the same capability exists on iOS you should write both halves together, under
one `Name(...)`, so the JavaScript side has no platform branch in it.

Do not write a module when the change is a manifest permission, a Gradle dependency or a
resource. Those are [config plugin](../expo-config-plugins/writing-your-own.md) territory, and a
plugin survives `prebuild` while a hand-edited `android/` directory does not.

## Basic example

### The file layout

A module — local or published — has the same Android layout:

```text
modules/expo-battery/
  expo-module.config.json
  android/
    build.gradle
    src/main/AndroidManifest.xml
    src/main/java/expo/modules/battery/ExpoBatteryModule.kt
  src/
    ExpoBatteryModule.ts
    index.ts
```

### Gradle

The SDK 57 template's `android/build.gradle` is short, because `expo-module-gradle-plugin`
supplies the Android and Kotlin configuration that every Expo module shares:

```gradle title=modules/expo-battery/android/build.gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.battery'
version = '0.1.0'

android {
  namespace "expo.modules.battery"
  defaultConfig {
    versionCode 1
    versionName "0.1.0"
  }
  lintOptions {
    abortOnError false
  }
}
```

Do not add `compileSdk`, a Kotlin plugin, or an `expo-modules-core` dependency by hand. The
Gradle plugin sets those from the app's Expo version, which is what keeps a module working
across SDK upgrades.

### The module class

```kotlin title=modules/expo-battery/android/src/main/java/expo/modules/battery/ExpoBatteryModule.kt
package expo.modules.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBatteryModule : Module() {
  // appContext is not available until the module has been attached, so every
  // access to it goes through a getter rather than an init block.
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val batteryManager: BatteryManager
    get() = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager

  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    // This string, not the class name, is what JavaScript resolves.
    Name("ExpoBattery")

    Events("onChargingChange")

    // A value that cannot change while the process lives.
    Constant("isSupported") {
      context.packageManager.hasSystemFeature("android.hardware.battery")
    }

    // Re-read on every access from JavaScript.
    Property("level") {
      batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0
    }

    // Synchronous: the value is already in memory, so blocking the JS thread
    // for it is defensible.
    Function("isCharging") {
      batteryManager.isCharging
    }

    // Register the broadcast receiver only while JavaScript is listening.
    OnStartObserving("onChargingChange") {
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          sendEvent("onChargingChange", mapOf("isCharging" to batteryManager.isCharging))
        }
      }
      receiver = r
      context.registerReceiver(r, IntentFilter(Intent.ACTION_POWER_CONNECTED))
    }

    OnStopObserving("onChargingChange") {
      receiver?.let { context.unregisterReceiver(it) }
      receiver = null
    }

    OnDestroy {
      receiver?.let { context.unregisterReceiver(it) }
      receiver = null
    }
  }
}
```

### Telling autolinking about it

```json title=modules/expo-battery/expo-module.config.json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.battery.ExpoBatteryModule"]
  }
}
```

The Android entry is the **fully qualified** class name. A bare `ExpoBatteryModule` here
produces a module that never loads, with no build error to point at it.

### The TypeScript side

```ts title=modules/expo-battery/src/ExpoBatteryModule.ts
import {NativeModule, requireNativeModule} from 'expo';

export type ExpoBatteryModuleEvents = {
  onChargingChange: (payload: {isCharging: boolean}) => void;
};

declare class ExpoBatteryModule extends NativeModule<ExpoBatteryModuleEvents> {
  isSupported: boolean;
  level: number;
  isCharging(): boolean;
}

// The string must match Name("ExpoBattery") in the Kotlin definition.
export default requireNativeModule<ExpoBatteryModule>('ExpoBattery');
```

## How it works

### Argument and return conversion

The DSL functions are `inline` with `reified` type parameters, so the **types you write on the
lambda** are the contract. There is no schema file:

```kotlin
// Kotlin sees String and Int and installs the matching converters. A JavaScript
// caller passing a number where a String is declared gets a typed exception.
AsyncFunction("saveAsync") { key: String, ttlSeconds: Int ->
  store.save(key, ttlSeconds)
}
```

What converts out of the box: primitives, `String`, `List`, `Map`, `Array`, enums implementing
`Enumerable`, records, `Either` types, typed arrays, and shared objects. For a structured
argument, a **record** is better than a `Map<String, Any?>` because it converts once and gives
you a typed Kotlin object rather than a bag of `Any?` you have to cast.

### Enums

An enum used as an argument must implement `Enumerable`, which is what lets the converter map a
JavaScript string onto a case:

```kotlin
import expo.modules.kotlin.types.Enumerable

enum class Precision(val value: String) : Enumerable {
  LOW("low"),
  HIGH("high")
}

AsyncFunction("readAsync") { precision: Precision ->
  reader.read(precision)
}
```

### Coroutines and queues

An `AsyncFunction` runs on the modules queue, which is not the main thread and is not a good
place for blocking I/O either. Two ways to move the work:

```kotlin
import expo.modules.kotlin.functions.Queues
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// `Coroutine` gives the body a suspending scope. Prefer this for anything
// awaiting I/O, and switch dispatchers inside it.
AsyncFunction("readFileAsync") Coroutine { path: String ->
  withContext(Dispatchers.IO) { java.io.File(path).readText() }
}

// Main-thread-affine Android APIs — View methods, dialogs, anything touching
// the Activity's UI — need the main queue explicitly.
AsyncFunction("vibrateViewAsync") {
  appContext.currentActivity?.window?.decorView?.performHapticFeedback(0)
}.runOnQueue(Queues.MAIN)
```

`Queues.MAIN` and `Queues.DEFAULT` are the two values. Omitting `runOnQueue` for a main-thread
API is the failure that looks like "the function ran and nothing happened".

### Errors

Throwing from a definition body rejects the JavaScript promise. Throw a **coded** exception so
the JavaScript caller has something stable to branch on:

```kotlin
import expo.modules.kotlin.exception.CodedException

// With no explicit code, CodedException derives one from the class name by
// stripping "Exception", splitting on camel case and prefixing ERR_ — this
// class produces ERR_BATTERY_UNAVAILABLE.
class BatteryUnavailableException :
  CodedException(message = "No battery on this device")

// The three-argument constructor is there when you need a specific code string,
// for example to stay compatible with an error code you already ship.
class LegacyBatteryException :
  CodedException("E_BATTERY_UNAVAILABLE", "No battery on this device", null)

AsyncFunction("requireLevelAsync") {
  if (!batteryManager.isCharging) throw BatteryUnavailableException()
  batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
}
```

`expo.modules.kotlin.exception.Exceptions` also carries the common ones —
`Exceptions.ReactContextLost()`, `Exceptions.MissingActivity()` — and using them keeps your
error codes consistent with the rest of the SDK.

### Activity results and intents

Android-only lifecycle components let a module participate in the activity lifecycle without
you wiring anything into `MainActivity`:

```kotlin
OnActivityResult { _, payload ->
  if (payload.requestCode == PICK_REQUEST) {
    // payload.resultCode and payload.data are the standard Android values.
  }
}

OnNewIntent { intent ->
  handleDeepLink(intent.data)
}
```

`RegisterActivityContracts` is the modern path for launching an activity and awaiting its
result. All four are Android-only — do not look for them in the Swift DSL.

## Platform differences

:::tabs
@tab Android
- The definition is a Kotlin lambda; components are statements inside it.
- The view name inside a `View { ... }` block is set with `Name(...)`.
- `PropGroup`, `GroupView`, `OnViewDestroys` and the activity lifecycle hooks exist here only.
- Generic argument conversion relies on `reified`, so a generic helper that forwards a type
  parameter will not compile unless it is `inline` and `reified` too.
@tab iOS
- The definition is a Swift result builder; components are listed.
- The view name inside a `View { ... }` block is set with `ViewName(...)`, not `Name(...)`.
- `.runOnQueue(.main)` rather than `.runOnQueue(Queues.MAIN)`.
- See [Writing a Module in Swift](module-in-swift.md).
:::

## Common patterns

**Put the real work in a plain class.** `BatteryReader(context)` with no Expo imports can be
tested with JUnit and Robolectric and does not change when the module API does.

**Guard `appContext` accesses.** `appContext.reactContext` is nullable, and it is null during
teardown. `?: throw Exceptions.ReactContextLost()` is the idiom the SDK modules use.

**Unregister in both `OnStopObserving` and `OnDestroy`.** A receiver registered in
`OnStartObserving` leaks if the app is torn down while a listener is still attached.

**Use records for structured arguments.** A record converts once, is typed, and documents the
shape. A `Map<String, Any?>` pushes the casting into your logic.

## Performance considerations

The module is constructed on first use, so a cheap constructor keeps that first call cheap.
Anything expensive belongs in `OnCreate` at worst, and lazily at best.

`Property` runs on every read. Reading `level` once per list row is one native call per row;
read it once and pass the value down.

Broadcast receivers registered for the life of the module cost battery and wake-ups. Gating them
behind `OnStartObserving` / `OnStopObserving`, as above, means you pay only while JavaScript is
actually listening.

## Security considerations

**Threat.** A module exposes a native capability to JavaScript, and JavaScript in a shipped app
is readable and modifiable by anyone with the APK. A function that takes a file path and returns
its contents is an arbitrary-file-read primitive for anyone who can inject JavaScript — for
example through a compromised over-the-air update channel.

**Exploit.** Given `AsyncFunction("readFileAsync") { path: String -> File(path).readText() }`,
a caller passes `/data/data/<your.package>/shared_prefs/secure.xml` and reads whatever your app
stored there.

**Fix.** Constrain the input in native code, where JavaScript cannot reach around it:

```kotlin
AsyncFunction("readCachedAsync") Coroutine { name: String ->
  // Resolve against a fixed base and verify the result is still inside it.
  // A name of "../../shared_prefs/secure.xml" fails this check.
  val base = context.cacheDir.canonicalFile
  val target = java.io.File(base, name).canonicalFile
  if (!target.path.startsWith(base.path + java.io.File.separator)) {
    throw CodedException("E_PATH_OUTSIDE_CACHE", "Refusing to read outside the cache", null)
  }
  withContext(Dispatchers.IO) { target.readText() }
}
```

**Verification.** From a debug build, call the function with `../` sequences and confirm it
rejects. Then confirm the rejection is by *code*, not message, so a future reword does not break
your JavaScript error handling.

Do not accept a raw SQL string, a raw URL for an authenticated request, or a raw file path from
JavaScript. Accept an identifier and resolve it natively.

## Common mistakes

- **Short class name in `expo-module.config.json`.** Wrong:
  `"modules": ["ExpoBatteryModule"]`. Right:
  `"modules": ["expo.modules.battery.ExpoBatteryModule"]`. The build succeeds either way; the
  module is missing at runtime.
- **Touching `appContext` in an `init` block or a property initialiser.** It is not attached
  yet. Use a `get()` accessor, or `OnCreate`.
- **Blocking inside `Function`.** A synchronous definition body holds the JavaScript thread.
  Anything with a `File`, a `Socket` or a `ContentResolver` in it belongs in `AsyncFunction`.
- **Omitting `runOnQueue(Queues.MAIN)` for UI work.** The call appears to succeed and does
  nothing. This is the hardest Expo module bug to spot.
- **Editing `android/` in the app instead of the module.** `npx expo prebuild` clears and
  regenerates those directories by default, and your edits go with them. Module code lives in
  `modules/<name>/android/`, which prebuild does not touch.
- **Rebuilding only JavaScript after a Kotlin change.** Fast Refresh does not recompile native
  code. Rerun `npx expo run:android`, or rebuild the development build.
- **Assuming the TypeScript declaration validates the module.** It does not. A renamed function
  in Kotlin still type-checks in TypeScript and throws at runtime.

## Related topics

- [The Expo Modules API](expo-modules-api.md) — the DSL and the model behind it.
- [Writing a Module in Swift](module-in-swift.md) — the other half of the same module.
- [View Components](view-components.md) — exporting a native `View` rather than functions.
- [Local Modules](local-modules.md) — generating this layout with one command.
- [Expo Modules vs TurboModules](vs-turbomodules.md) — how this compares to the core mechanism.
- [Creating a Development Build Locally](../expo-development-builds/creating-locally.md) — how to run the module.
- [Writing Your Own Plugin](../expo-config-plugins/writing-your-own.md) — for native changes that are not a module.
