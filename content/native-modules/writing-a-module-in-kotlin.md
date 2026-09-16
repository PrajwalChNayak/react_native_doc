---
title: Writing a Module in Kotlin
description: The Android half of a TurboModule in depth — the generated class, type mapping, threading, context lifetime, permissions, Gradle and R8.
status: current
toolchain: cli
---

Android is the easier half of a native module, because the artefact Codegen produces is a JVM
class and Kotlin is a JVM language. You extend the generated abstract class and the compiler
tells you when your implementation and the spec have drifted apart.

This page assumes you have read [TurboModules End to End](turbomodules-end-to-end.md), which
walks the whole path once. Here we stay on Android and go deeper: what the generated class
actually looks like, how each spec type lands in Kotlin, which thread your code runs on, how
long you may hold the context, and what the build needs.

## Why Kotlin, and what version

React Native 0.87 bundles **Kotlin 2.2.0** and requires **Kotlin 2.0 or newer**. Java still
works — the generated class is Java and a Java subclass compiles fine — but every generated
signature carries nullability information that Kotlin turns into `?` types and Java does not.
That is the practical argument: the same mistake is a compile error in Kotlin and a
`NullPointerException` in Java.

The toolchain numbers you need:

| Thing | Value |
| --- | --- |
| Kotlin | 2.2.0 bundled; 2.0 minimum |
| Android Gradle Plugin | 9.x |
| Gradle | 9.x |
| `compileSdk` / `buildToolsVersion` | 37 |
| `minCompileSdk` for a published library | 34 |

AGP 9 ships its own Kotlin support and a new DSL, and React Native 0.87 is not yet built
against either. Opt out in the app's `android/gradle.properties`:

```properties title=android/gradle.properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

## The generated class you extend

For a spec file `src/specs/NativeCalendar.ts`, Codegen writes
`NativeCalendarSpec.java` into the Java package you named in
`codegenConfig.android.javaPackageName`. Reduced to its shape:

```kotlin title=What the generated Java amounts to, expressed as Kotlin
abstract class NativeCalendarSpec(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), TurboModule {

  // The name JavaScript looks the module up by.
  companion object {
    const val NAME: String = "NativeCalendar"
  }

  override fun getName(): String = NAME

  // One abstract member per spec method, each annotated @ReactMethod and
  // @DoNotStrip so R8 leaves it alone.
  abstract fun createEvent(title: String, startsAt: Double, promise: Promise)

  abstract fun getPendingCount(): Double

  abstract fun setSyncEnabled(enabled: Boolean)

  // Present only when the spec declares getConstants.
  protected abstract fun getTypedExportedConstants(): Map<String, Any>
}
```

Three consequences worth internalising:

- **It is a class, not an interface.** A method you forget is a compile error naming the method.
  There is no runtime surprise.
- **`@ReactMethod` and `@DoNotStrip` are already on the generated members.** You do not write
  them, and you must not add an export macro or annotation of your own — the generated class is
  the registration.
- **The constructor takes `ReactApplicationContext`.** Your subclass must pass it up.

> [!NOTE] Read the real generated file
> `android/app/build/generated/source/codegen/java/<your package path>/NativeCalendarSpec.java`
> is regenerated on every build and is the authority on the exact signatures. If you are on a
> React Native version other than 0.87, trust that file over the sketch above.

## How spec types land in Kotlin

| In the spec | Generated Java parameter | Idiomatic Kotlin |
| --- | --- | --- |
| `string` | `String` | `String` |
| `string \| null`, `string?` | `@Nullable String` | `String?` |
| `boolean` | `boolean` | `Boolean` |
| `number`, `CodegenTypes.Double`, `CodegenTypes.Float` | `double` | `Double` |
| `CodegenTypes.Int32` | `double` | `Double` |
| An object type | `ReadableMap` | `ReadableMap` |
| `ReadonlyArray<T>` | `ReadableArray` | `ReadableArray` |
| `Promise<T>` | a trailing `Promise promise` parameter | `promise: Promise` |
| A return of `T` (sync) | `T` | `T` |
| `void` | `void` | `Unit` |

The row that catches everyone is `Int32`. On the JVM every number is a `double`, whatever the
spec said; `Int32` and `Float` change the C++ and Objective-C types only. Convert at the edge:

```kotlin title=Converting at the boundary, not in the middle
override fun getPendingCount(): Double = store.pendingCount.toDouble()

override fun setRetryLimit(limit: Double) {
  store.retryLimit = limit.toInt()
}
```

### Returning structured data

There is no automatic mapping from a Kotlin data class to the generated struct. You build a
`WritableMap` or `WritableArray` with `Arguments`:

```kotlin title=android/app/src/main/java/com/awesomeproject/calendar/CalendarMapping.kt
package com.awesomeproject.calendar

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

// A plain domain type with no React Native in it — the whole point of keeping
// the module class thin.
data class CalendarEvent(
    val id: String,
    val title: String,
    val startsAt: Double,
    val isAllDay: Boolean,
)

fun CalendarEvent.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      putString("id", id)
      putString("title", title)
      putDouble("startsAt", startsAt)
      putBoolean("isAllDay", isAllDay)
    }

fun List<CalendarEvent>.toWritableArray(): WritableArray =
    Arguments.createArray().apply { forEach { pushMap(it.toWritableMap()) } }

// Reading goes the other way. hasKey before get, because a missing key throws
// rather than returning a default.
fun ReadableMap.toCalendarEvent(): CalendarEvent =
    CalendarEvent(
        id = getString("id").orEmpty(),
        title = getString("title").orEmpty(),
        startsAt = if (hasKey("startsAt")) getDouble("startsAt") else 0.0,
        isAllDay = hasKey("isAllDay") && getBoolean("isAllDay"),
    )
```

A `WritableMap` is **consumed** when you resolve a promise with it. Building one and handing it
to two promises throws `ObjectAlreadyConsumedException`. Build a fresh map per call.

## Promises and coroutines

A `Promise` parameter must be settled exactly once on every path, including exceptions.
Resolving twice throws; never resolving leaks a pending JavaScript promise forever, which shows
up as a screen that never leaves its loading state.

```kotlin title=android/app/src/main/java/com/awesomeproject/calendar/CalendarModule.kt
package com.awesomeproject.calendar

import com.awesomeproject.specs.NativeCalendarSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class CalendarModule(reactContext: ReactApplicationContext) :
    NativeCalendarSpec(reactContext) {

  // A scope owned by the module, cancelled in invalidate(). Without this,
  // work outlives the React instance and resolves a promise into nothing.
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val store = CalendarStore(reactContext)

  override fun getName(): String = NAME

  override fun createEvent(title: String, startsAt: Double, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(store.createEvent(title, startsAt))
      } catch (e: SecurityException) {
        // A stable code is what JavaScript branches on. The message is for humans.
        promise.reject("E_CALENDAR_PERMISSION", "Calendar permission denied", e)
      } catch (e: Exception) {
        promise.reject("E_CALENDAR_WRITE", e.message, e)
      }
    }
  }

  override fun invalidate() {
    // Called when the React instance goes away. Everything the module owns —
    // coroutines, listeners, receivers, sensors — is released here.
    scope.cancel()
    store.close()
    super.invalidate()
  }

  companion object {
    const val NAME: String = NativeCalendarSpec.NAME
  }
}
```

Coroutines are not a React Native feature — `kotlinx-coroutines-android` is an ordinary Gradle
dependency. Use them or use callbacks; what matters is that the promise is settled once and the
work is cancellable.

## Threading

| Code | Thread |
| --- | --- |
| A `void` or `Promise` method body | The native modules queue thread |
| A synchronous method body | **The JavaScript thread** |
| `reactApplicationContext.runOnUiQueueThread { }` | The Android main thread |
| `reactApplicationContext.runOnNativeModulesQueueThread { }` | The native modules queue |
| A coroutine you launched | Whatever dispatcher you chose |

Two rules follow:

**Touch the UI only on the main thread.** Anything involving an `Activity`, a `Dialog`, a
`View` or a `Window` must be inside `runOnUiQueueThread`.

**A synchronous method blocks a frame.** `getPendingCount()` runs on the JavaScript thread, so
its entire body is time nobody else gets. Reading a field is fine; opening a database is not.

```kotlin title=Doing UI work from a module
override fun showRationale(promise: Promise) {
  val activity = reactApplicationContext.currentActivity
  if (activity == null) {
    // The app can be backgrounded between the JS call and this line.
    promise.reject("E_NO_ACTIVITY", "No foreground activity")
    return
  }
  reactApplicationContext.runOnUiQueueThread {
    AlertDialog.Builder(activity)
        .setMessage("This app needs calendar access")
        .setPositiveButton("OK") { _, _ -> promise.resolve(true) }
        .setOnCancelListener { promise.resolve(false) }
        .show()
  }
}
```

## Context, activity and lifetime

`ReactApplicationContext` is application-scoped and safe to hold for the life of the module.
The **activity is not**. `reactApplicationContext.currentActivity` returns null whenever the app
is backgrounded or between activity recreations, and storing it in a field leaks the activity
across a rotation.

Two hooks let a module follow the host's lifecycle:

```kotlin title=Following the host lifecycle
class CalendarModule(reactContext: ReactApplicationContext) :
    NativeCalendarSpec(reactContext), LifecycleEventListener, ActivityEventListener {

  override fun initialize() {
    super.initialize()
    // Called once, after construction, on the native modules queue.
    reactApplicationContext.addLifecycleEventListener(this)
    reactApplicationContext.addActivityEventListener(this)
  }

  override fun onHostResume() = store.resumeSync()

  override fun onHostPause() = store.pauseSync()

  override fun onHostDestroy() = store.close()

  override fun onNewIntent(intent: Intent?) = Unit

  override fun onActivityResult(
      activity: Activity?,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
  ) {
    // Where a startActivityForResult flow lands. Match on your own requestCode
    // and settle the promise you stored when you launched it.
  }

  override fun invalidate() {
    reactApplicationContext.removeLifecycleEventListener(this)
    reactApplicationContext.removeActivityEventListener(this)
    super.invalidate()
  }
}
```

`invalidate()` is the teardown hook on `NativeModule`. It runs when the React instance is
destroyed — on a reload in development, and on host destruction in production. Anything you
registered in `initialize()` is unregistered here, or you leak it across every Fast Refresh
reload.

## Requesting a permission from a module

A module that needs a runtime permission goes through the hosting activity, which must be a
`PermissionAwareActivity` — React Native's `ReactActivity` already is.

```kotlin title=Requesting a runtime permission
import android.Manifest
import android.content.pm.PackageManager
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

private const val REQUEST_CALENDAR = 4201

override fun requestAccess(promise: Promise) {
  val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
  if (activity == null) {
    promise.reject("E_NO_ACTIVITY", "No foreground activity to request from")
    return
  }

  val listener = PermissionListener { requestCode, _, grantResults ->
    if (requestCode == REQUEST_CALENDAR) {
      promise.resolve(
          grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
      )
    }
    // Returning true means "this listener is done and can be removed".
    true
  }

  activity.requestPermissions(
      arrayOf(Manifest.permission.WRITE_CALENDAR),
      REQUEST_CALENDAR,
      listener,
  )
}
```

The permission must also be declared in the manifest that ships with the module. For a library,
that is the library's own `AndroidManifest.xml`, which is merged into the consumer's —
so declare only what the module genuinely needs, because it becomes visible in the consumer's
store listing.

```xml title=android/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.WRITE_CALENDAR" />
</manifest>
```

## Gradle for a library module

An app needs no Gradle changes at all — the React Native Gradle plugin is already applied and
picks up the app's `codegenConfig`. A **library** ships its own Android project:

```gradle title=android/build.gradle
plugins {
  id 'com.android.library'
  id 'org.jetbrains.kotlin.android'
  // Applying this plugin is what registers the codegen tasks for the library.
  id 'com.facebook.react'
}

android {
  namespace 'com.awesomeproject.calendar'
  compileSdk 37

  defaultConfig {
    minSdk 24
    // Consumers on an older compileSdk get a clear error instead of a link failure.
    aarMetadata {
      minCompileSdk 34
    }
  }

  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = '17'
  }
}

dependencies {
  // No version: the React Native Gradle plugin forces the version that matches
  // the react-native in the consumer's node_modules.
  implementation 'com.facebook.react:react-android'
}
```

The `com.facebook.react` plugin reads the library's `package.json` for `codegenConfig`, so the
`name`, `type`, `jsSrcsDir` and `android.javaPackageName` fields drive generation without any
Gradle configuration.

> [!NOTE] Plugin ids and Gradle wiring change between major versions
> `com.android.library`, `org.jetbrains.kotlin.android` and `com.facebook.react` are the plugin
> ids in the 0.87 / AGP 9 generation. If your React Native or AGP version differs, compare
> against a freshly generated library rather than copying this block.

## R8 and ProGuard

React Native ships consumer ProGuard rules that already keep what a TurboModule needs:

- Anything annotated `@com.facebook.proguard.annotations.DoNotStrip` — which includes every
  generated spec method.
- Members annotated `@ReactMethod` on any `NativeModule` subclass, and their constructors.
- Classes implementing `NativeModule`.

So a normal module needs **no keep rules of its own**. You do need them when you reach outside
that pattern: reflection on your own classes, a JSON model deserialised by name, or a JNI entry
point you added by hand.

```properties title=android/app/proguard-rules.pro
# Only needed for classes React Native's own rules cannot see, such as models
# deserialised reflectively inside your module.
-keep class com.awesomeproject.calendar.model.** { *; }
```

Be honest about what this buys you: R8 shrinks and renames. It is not encryption, and a string
constant survives it intact. See [Obfuscation and Its
Limits](../security/obfuscation.md).

## Testing the Android half

Split the module in two and test the half that has no React Native in it.

```kotlin title=android/src/test/java/com/awesomeproject/calendar/CalendarStoreTest.kt
class CalendarStoreTest {
  @Test
  fun `rejects an event that starts in the past`() {
    val store = CalendarStore(FakeCalendarBackend())
    val result = store.validate(title = "Standup", startsAt = 0.0)
    assertTrue(result.isFailure)
  }
}
```

`CalendarStore` is a plain class, so this is an ordinary JUnit test with no Robolectric, no
emulator and no React instance. The module subclass that wraps it is thin enough that an
integration test on the JavaScript side covers it; see [Mocking Native
Modules](../testing/mocking-native-modules.md).

## Common mistakes

- **Adding an export annotation to your methods.** Wrong: annotating your overrides with
  `@ReactMethod`. Right: nothing. The generated class already carries the annotations, and
  duplicating them is at best redundant.
- **Overriding `getConstants` instead of `getTypedExportedConstants`.** Wrong: the compiler
  complains that `getConstants` is final. Right: override the abstract
  `getTypedExportedConstants()` the generator emitted alongside it.
- **Returning `Int` where the generated signature says `Double`.** Wrong: `override fun
  getPendingCount(): Int`. Right: `Double`, and call `.toDouble()` at the boundary. `Int32` in
  the spec does not change the JVM type.
- **Storing `currentActivity` in a field.** Wrong: a field assigned in `initialize()`. Right:
  read `reactApplicationContext.currentActivity` at the point of use and handle null. Holding it
  leaks the activity across every rotation.
- **Not cancelling work in `invalidate()`.** Wrong: a coroutine scope or a `BroadcastReceiver`
  that survives a Fast Refresh reload, so after ten reloads there are ten receivers. Right:
  release everything you acquired in `initialize()`.
- **Settling a promise zero or twice.** Wrong: an early `return` that skips the reject, or a
  resolve inside a loop. Right: exactly one `resolve` or `reject` on every path, including the
  `catch`.
- **Reusing a `WritableMap`.** Wrong: building one map and resolving two promises with it.
  Right: build a fresh map per call — a consumed map throws.
- **Doing disk work in a synchronous method.** Wrong: a sync getter that queries the calendar
  provider. Right: a `Promise`, or cache the value and return the cached copy synchronously.
- **Reading a `ReadableMap` key without `hasKey`.** Wrong: `map.getDouble("startsAt")` on an
  optional field. Right: guard with `hasKey`, because a missing key throws rather than returning
  a default.

## Related topics

- [TurboModules End to End](turbomodules-end-to-end.md) — the whole path, both platforms.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the same depth for iOS.
- [Codegen and Spec Files](codegen-specs.md) — what each spec type generates.
- [Fabric Native Components](fabric-native-components.md) — the Android ViewManager side.
- [Autolinking and react-native.config.js](autolinking.md) — how the package is registered in a consumer app.
- [Platform Folders](platform-folders.md) — where Kotlin sources go in an app and in a library.
- [Debugging Native Code](debugging-native-code.md) — attaching Android Studio to the module.
- [Obfuscation and Its Limits](../security/obfuscation.md) — what R8 does and does not do.
