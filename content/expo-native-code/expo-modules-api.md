---
title: The Expo Modules API
description: Expo's own native module system — a Kotlin and Swift DSL that replaces a Codegen spec with a declarative module definition, verified against expo-modules-core 57.0.18.
status: current
toolchain: expo
sdk: 57
---

The Expo Modules API is how you write native code for an Expo app. It is **not** React Native's
TurboModule system. Instead of a TypeScript spec file that Codegen turns into abstract native
classes, you write a **module definition** in Kotlin or Swift using a small domain-specific
language, and `expo-modules-core` reads that definition at runtime to build the JavaScript
object your app imports.

The package that implements it is `expo-modules-core`, at **~57.0.18** in SDK 57. It is already
installed in every Expo project — `expo` depends on it — so there is nothing to add before you
start.

> [!NOTE] Expo Go vs development build
> Anything on this page adds native code to your app. **Expo Go cannot load it**, because Expo Go
> ships a fixed set of prebuilt native modules. You need a
> [development build](../expo-development-builds/why-you-need-one.md) before your module will run.

## Why it exists / when to use it — and when NOT to

The Expo Modules API exists because the SDK itself needed a way to write ~120 native modules
that stay consistent across two platforms, two languages and many SDK versions. Everything in
`expo-image`, `expo-camera` and `expo-secure-store` is written with it.

Reach for it when:

- You need a platform capability no SDK package covers — a vendor SDK, a hardware integration,
  a piece of platform API nobody has wrapped.
- You want the native surface **typed from the native side**. The DSL infers argument and return
  conversion from the Kotlin or Swift types you write, so there is no second place to keep in sync.
- You want the same module to work on both platforms without maintaining an Objective-C++ bridge
  layer by hand.

Do **not** reach for it when:

- **A config plugin is enough.** Adding an `Info.plist` key or a Gradle dependency is not a
  module. See [Writing Your Own Plugin](../expo-config-plugins/writing-your-own.md).
- **You are publishing a library for the whole React Native ecosystem, Expo or not.** A module
  written with the Expo Modules API requires `expo-modules-core` in the consuming app. That is
  installable in a bare React Native app, but it is a dependency you are imposing. A
  TurboModule has no such requirement — see
  [Expo Modules vs TurboModules](vs-turbomodules.md).
- **The work belongs in JavaScript.** Crossing into native costs a conversion on every argument
  and every result. A pure computation is usually faster in Hermes than in a module call.

## Basic example

A module has three parts: a native class on each platform, an entry in
`expo-module.config.json` so autolinking finds it, and a TypeScript file that requires it.

:::tabs
@tab Kotlin
```kotlin title=modules/expo-settings/android/src/main/java/expo/modules/settings/ExpoSettingsModule.kt
package expo.modules.settings

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoSettingsModule : Module() {
  // Resolving the context lazily matters: the module object is constructed before
  // the app context is attached, so touching appContext in an init block throws.
  private val preferences
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost())
      .getSharedPreferences("expo.settings", Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    // The name JavaScript looks the module up by. It has nothing to do with the
    // Kotlin class name, and it must match the Swift side exactly.
    Name("ExpoSettings")

    Events("onThemeChange")

    // Read once when the module object is created. Use it for values that
    // genuinely never change for the life of the process.
    Constant("defaultTheme") { "system" }

    // Re-read every time JavaScript touches the property.
    Property("theme") {
      preferences.getString("theme", "system")
    }

    Function("getTheme") {
      preferences.getString("theme", "system")
    }

    AsyncFunction("setThemeAsync") { theme: String ->
      preferences.edit().putString("theme", theme).apply()
      sendEvent("onThemeChange", mapOf("theme" to theme))
    }
  }
}
```
@tab Swift
```swift title=modules/expo-settings/ios/ExpoSettingsModule.swift
import ExpoModulesCore

public class ExpoSettingsModule: Module {
  private let defaults = UserDefaults.standard

  public func definition() -> ModuleDefinition {
    // Must be byte-for-byte the same string as the Kotlin side, or the module
    // resolves on one platform and throws on the other.
    Name("ExpoSettings")

    Events("onThemeChange")

    Constant("defaultTheme") { "system" }

    Property("theme") {
      self.defaults.string(forKey: "theme") ?? "system"
    }

    Function("getTheme") {
      return self.defaults.string(forKey: "theme") ?? "system"
    }

    AsyncFunction("setThemeAsync") { (theme: String) in
      self.defaults.set(theme, forKey: "theme")
      self.sendEvent("onThemeChange", ["theme": theme])
    }
  }
}
```
:::

Autolinking finds the module through `expo-module.config.json`, which lives at the root of the
module directory:

```json title=modules/expo-settings/expo-module.config.json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["ExpoSettingsModule"]
  },
  "android": {
    "modules": ["expo.modules.settings.ExpoSettingsModule"]
  }
}
```

The `apple` entry is a **Swift class name**; the `android` entry is a **fully qualified Kotlin
class name**. Neither is the `Name(...)` string — that is the JavaScript-facing name, resolved
at runtime.

Then the TypeScript side describes what the native definition produces and requires it by the
`Name(...)` string:

```ts title=modules/expo-settings/src/ExpoSettingsModule.ts
import {NativeModule, requireNativeModule} from 'expo';

// The events map is what gives addListener and useEvent their argument types.
export type ExpoSettingsModuleEvents = {
  onThemeChange: (payload: {theme: string}) => void;
};

// `declare class` because the implementation is native. Every member here has
// to correspond to something in the module definition, and nothing checks that
// for you — this declaration is a promise you are making to the compiler.
declare class ExpoSettingsModule extends NativeModule<ExpoSettingsModuleEvents> {
  defaultTheme: string;
  theme: string;
  getTheme(): string;
  setThemeAsync(theme: string): Promise<void>;
}

export default requireNativeModule<ExpoSettingsModule>('ExpoSettings');
```

Calling it looks like calling any other object:

```tsx title=app/settings.tsx
import {NativeModule, requireNativeModule, useEvent} from 'expo';
import {Button, Text, View} from 'react-native';

// In a real project these five lines are the module's own file and this screen
// imports it. They are inlined here so the snippet stands on its own.
type ExpoSettingsModuleEvents = {
  onThemeChange: (payload: {theme: string}) => void;
};
declare class ExpoSettingsModule extends NativeModule<ExpoSettingsModuleEvents> {
  getTheme(): string;
  setThemeAsync(theme: string): Promise<void>;
}
const ExpoSettings = requireNativeModule<ExpoSettingsModule>('ExpoSettings');

export default function SettingsScreen() {
  // useEvent re-renders when the native side emits, and seeds the first render
  // from the synchronous getter so there is no empty frame.
  const {theme} = useEvent(ExpoSettings, 'onThemeChange', {
    theme: ExpoSettings.getTheme(),
  });

  return (
    <View>
      <Text>Theme: {theme}</Text>
      <Button title="Dark" onPress={() => void ExpoSettings.setThemeAsync('dark')} />
    </View>
  );
}
```

## How it works

### The definition is data, not generated code

`ModuleDefinition { ... }` in Kotlin and `definition() -> ModuleDefinition` in Swift both build
an object graph describing the module: its name, its functions, their argument types, its
properties, its events. `expo-modules-core` walks that graph and installs a corresponding
JavaScript object on the JSI runtime.

That is the central difference from TurboModules. There is **no code generation step**, so:

- There is no build phase to run and no generated file to inspect when something goes wrong.
- Argument conversion is driven by the native type you wrote, using Kotlin's `reified` generics
  and Swift's generics — not by a schema.
- A mismatch between your TypeScript declaration and your native definition is a **runtime**
  error, not a compile error. Nothing checks the two against each other.

That last point is the real trade-off and it is worth internalising before you write much code.

### The definition components

Verified against `expo-modules-core@57.0.18`. Availability differs between platforms in a few
places, and those are marked.

| Component | Purpose |
| --- | --- |
| `Name` | The name JavaScript resolves the module by. Required. |
| `Constant` | A value read once at module creation. |
| `Constants` | **Deprecated** in 57 in favour of `Constant` and `Property`. |
| `Function` | A synchronous function. Blocks the JavaScript thread. |
| `AsyncFunction` | Returns a promise. Runs off the JavaScript thread by default. |
| `Property` | A getter (and optional setter) re-evaluated on each access. |
| `Events` | Declares the event names the module may send. |
| `OnStartObserving` / `OnStopObserving` | Called when the first / last listener for an event appears or goes. |
| `View` | Declares a native view component. See [View Components](view-components.md). |
| `Class` | Declares a JavaScript class backed by a native shared object. |
| `OnCreate` / `OnDestroy` | Module lifecycle. |
| `OnAppContextDestroys` | The owning app context is going away. |

Lifecycle components that exist on only one platform:

| Component | Platform |
| --- | --- |
| `OnAppEntersForeground`, `OnAppEntersBackground`, `OnAppBecomesActive` | iOS |
| `OnActivityEntersForeground`, `OnActivityEntersBackground`, `OnActivityDestroys` | Android |
| `OnActivityResult`, `OnNewIntent`, `OnUserLeavesActivity`, `RegisterActivityContracts` | Android |

Write a lifecycle hook only on the platform that has it, and put the shared consequence in a
plain function both platforms call.

### `Function` versus `AsyncFunction`

`Function` runs **synchronously on the JavaScript thread**. The JavaScript thread is stopped for
the whole duration of the call. That is correct for reading a value already in native memory and
wrong for anything that touches disk, the network, or a permission prompt.

`AsyncFunction` returns a promise and runs on the modules queue by default. You can move it:

:::tabs
@tab Kotlin
```kotlin
import expo.modules.kotlin.functions.Queues

// Anything main-thread-affine — most UI APIs — must say so explicitly.
AsyncFunction("focusAsync") {
  // ...
}.runOnQueue(Queues.MAIN)

// A suspending body gets dispatched on the module's coroutine scope.
AsyncFunction("readAsync") Coroutine { path: String ->
  withContext(Dispatchers.IO) { File(path).readText() }
}
```
@tab Swift
```swift
// `.runOnQueue(.main)` is required for UIKit work; without it the call runs on
// a background queue and UIKit either asserts or silently does nothing.
AsyncFunction("focusAsync") {
  // ...
}
.runOnQueue(.main)
```
:::

Forgetting `runOnQueue` for main-thread work is the most common Expo module bug, because it
frequently fails silently rather than crashing.

### Events

`Events("onThemeChange")` declares the name. `sendEvent` emits it. On the JavaScript side the
module object *is* an event emitter — `NativeModule` extends `EventEmitter` — so there is no
separate emitter to construct:

```ts title=modules/expo-settings/src/subscribe.ts
import {NativeModule, requireNativeModule} from 'expo';
import type {EventSubscription} from 'expo-modules-core';

// Normally `import ExpoSettings from './ExpoSettingsModule'`; inlined so the
// snippet compiles on its own.
declare class ExpoSettingsModule extends NativeModule<{
  onThemeChange: (payload: {theme: string}) => void;
}> {}
const ExpoSettings = requireNativeModule<ExpoSettingsModule>('ExpoSettings');

export function watchTheme(onChange: (theme: string) => void): EventSubscription {
  // Keep the subscription and call remove() — listeners are not cleaned up for
  // you, and a leaked one keeps the closure (and whatever it captured) alive.
  return ExpoSettings.addListener('onThemeChange', ({theme}) => onChange(theme));
}
```

If producing the event is expensive, gate it with `OnStartObserving` / `OnStopObserving` so you
do no work while nothing is listening.

### Where the module lives, and how it is found

Three shapes, all using the same API:

| Shape | Location | Page |
| --- | --- | --- |
| Local module | `modules/<name>/` in your app | [Local Modules](local-modules.md) |
| Published module | Its own npm package | [Publishing an Expo Module](publishing.md) |
| SDK module | `expo-*` packages | — |

Autolinking scans your dependencies for `expo-module.config.json`, plus the local modules
directory (`modules/` by default). Nothing needs adding to a Podfile or a Gradle file.

## Platform differences

:::tabs
@tab Android
- The module class extends `expo.modules.kotlin.modules.Module` and overrides `definition()`.
- `appContext.reactContext` is nullable; throw `Exceptions.ReactContextLost()` rather than
  forcing it.
- Argument conversion uses `reified` generics, so the lambda parameter type is the contract:
  `AsyncFunction("f") { value: String -> ... }`.
- Coroutines are first class through the `Coroutine` block form.
@tab iOS
- The module class conforms to `Module` (a typealias for `AnyModule & BaseModule`) and must be
  `public`, because `expo-module.config.json` names the Swift class.
- The definition is a Swift result builder, so components are listed, not returned in an array.
- `self` is captured implicitly inside definition closures; write `self.` for clarity in
  anything non-trivial.
- The deployment target for the SDK 57 module template is **iOS 16.4**.
:::

There is no Objective-C++ wrapper anywhere in this API. That is one of the larger practical
differences from writing a TurboModule in Swift.

## Common patterns

**Keep the logic out of the definition.** The definition block should convert arguments and
delegate. A plain Kotlin or Swift class with no Expo types in it can be unit-tested with JUnit
or XCTest, and survives an SDK upgrade untouched.

**One coarse call, not six fine ones.** Every call converts its arguments and its result.
`listItems(): [Item]` costs far less than `count()` plus `itemAt(i)` in a loop.

**Throw a typed error.** Both platforms convert a thrown error into a promise rejection. Define
your own error type so JavaScript gets a stable code to branch on instead of a message string
that will get reworded.

**Declare the TypeScript surface in one file** next to the module and export from there. When
the native definition changes, there is exactly one place to update.

## Performance considerations

The module object is created the first time JavaScript resolves it, not at app start, so
registering a module you never call is close to free. A heavy constructor becomes a stall
mid-interaction rather than a startup cost, so initialise lazily.

`Property` is re-evaluated on **every** access, including inside a render. Reading one in a list
row is a native call per row. `Constant` is read once and cached, so prefer it for anything
genuinely fixed.

Events are cheap to declare and not free to send. Each one crosses into JavaScript and, in a
component, can trigger a render. Coalesce high-frequency events natively before emitting.

## Common mistakes

- **Different `Name(...)` strings on the two platforms.** The module resolves on Android and
  throws "Cannot find native module" on iOS. Search for the string, not the class name.
- **Putting the Kotlin class name in `expo-module.config.json` without its package.** Android
  needs the fully qualified name (`expo.modules.settings.ExpoSettingsModule`); Apple needs the
  bare Swift class name.
- **Using `Function` for I/O.** Wrong: `Function("readFile") { File(path).readText() }` freezes
  the JavaScript thread for the length of a disk read. Right: `AsyncFunction`, with a
  `Coroutine` body or `withContext(Dispatchers.IO)`.
- **Forgetting `runOnQueue` for UIKit or `View` work.** On iOS the call runs on a background
  queue and UIKit misbehaves; on Android a main-thread-affine call can be a silent no-op. Both
  look like "my module does nothing".
- **Trusting the TypeScript declaration.** `declare class ... extends NativeModule` is not
  checked against the native definition. A typo in a method name compiles and then throws at
  runtime.
- **Reaching for `Constants`.** It is deprecated in SDK 57. Use `Constant` for fixed values and
  `Property` for values that change.
- **Expecting Expo Go to load it.** It cannot. Build a development build first.
- **Leaking listeners.** `addListener` returns a subscription; call `remove()`, or use
  `useEventListener` in a component so it is removed on unmount.

## Related topics

- [Writing a Module in Kotlin](module-in-kotlin.md) — the Android half end to end.
- [Writing a Module in Swift](module-in-swift.md) — the iOS half end to end.
- [View Components](view-components.md) — exporting a native view rather than a function.
- [Expo Modules vs TurboModules](vs-turbomodules.md) — which system to pick, honestly.
- [Local Modules](local-modules.md) — a module that lives inside your app.
- [Publishing an Expo Module](publishing.md) — turning it into an npm package.
- [Interoperating with Community Libraries](community-interop.md) — how autolinking treats non-Expo native modules.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — the prerequisite for running any of this.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — the React Native CLI mechanism, on 0.87.
