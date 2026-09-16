---
title: Writing a Module in Swift
description: The iOS half of an Expo module end to end — podspec, the ModuleDefinition result builder, argument conversion, queues, records, errors and the TypeScript call site.
status: current
toolchain: expo
sdk: 57
---

This page builds the iOS side of the same battery module the
[Kotlin page](module-in-kotlin.md) builds for Android: a level property, a synchronous charging
flag, an asynchronous read, and an event when the charging state changes.

The thing to notice, if you have written a TurboModule in Swift before, is what is **missing**:
there is no Objective-C++ wrapper, no generated protocol to conform to, and no `getTurboModule:`
implementation. `expo-modules-core` reads your Swift definition directly.

Everything here is verified against `expo-modules-core@57.0.18`, the version Expo SDK 57 pins.

> [!NOTE] Expo Go vs development build
> Expo Go cannot load a module you wrote. Build a
> [development build](../expo-development-builds/creating-locally.md), and rebuild it after every
> Swift change — Fast Refresh only reloads JavaScript.

> [!WARNING] This page was not compiled
> The Swift here was written against the installed `expo-modules-core` sources and the SDK 57
> module template. It has not been built with Xcode as part of authoring this site. Treat it as
> correct in shape and verify against your own build.

## Why it exists / when to use it — and when NOT to

Write Swift when the capability lives in an Apple framework or an iOS-only vendor SDK. Write it
alongside the Kotlin half under one `Name(...)` whenever the capability exists on both platforms,
so that the JavaScript call site has no platform branch.

Do not write a module for something an `Info.plist` entry or a Podfile change would do. That is
[config plugin](../expo-config-plugins/writing-your-own.md) work, and a plugin survives
`npx expo prebuild` while a hand-edited `ios/` directory does not.

## Basic example

### The file layout

```text
modules/expo-battery/
  expo-module.config.json
  ios/
    ExpoBattery.podspec
    ExpoBatteryModule.swift
  src/
    ExpoBatteryModule.ts
    index.ts
```

### The podspec

This is the SDK 57 module template's podspec for a local module, with the parts that matter
called out:

```ruby title=modules/expo-battery/ios/ExpoBattery.podspec
Pod::Spec.new do |s|
  s.name           = 'ExpoBattery'
  s.version        = '1.0.0'
  s.summary        = 'Battery level and charging state'
  s.description    = 'Battery level and charging state'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  # This is the dependency that makes the DSL available. Without it the Swift
  # file will not compile because `Module` and `ModuleDefinition` are undefined.
  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
```

The iOS deployment target in the SDK 57 template is **16.4**. If your app targets something
lower, the pod will not install.

### The module class

```swift title=modules/expo-battery/ios/ExpoBatteryModule.swift
import ExpoModulesCore
import UIKit

// `public` is not optional: expo-module.config.json names this class by string,
// and the module is instantiated from outside its own module boundary.
public class ExpoBatteryModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    // The string JavaScript resolves the module by. Must match the Kotlin side.
    Name("ExpoBattery")

    Events("onChargingChange")

    OnCreate {
      // Battery properties read as -1 / .unknown until monitoring is enabled.
      UIDevice.current.isBatteryMonitoringEnabled = true
    }

    Constant("isSupported") {
      UIDevice.current.batteryState != .unknown
    }

    Property("level") {
      Double(UIDevice.current.batteryLevel)
    }

    Function("isCharging") {
      return UIDevice.current.batteryState == .charging
        || UIDevice.current.batteryState == .full
    }

    // Only observe while JavaScript is listening — an always-on observer costs
    // battery for an event nobody consumes.
    OnStartObserving("onChargingChange") {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIDevice.batteryStateDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        let charging = UIDevice.current.batteryState == .charging
        self?.sendEvent("onChargingChange", ["isCharging": charging])
      }
    }

    OnStopObserving("onChargingChange") {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }

    OnDestroy {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
```

### Telling autolinking about it

```json title=modules/expo-battery/expo-module.config.json
{
  "platforms": ["apple"],
  "apple": {
    "modules": ["ExpoBatteryModule"]
  }
}
```

The `apple` entry is the **bare Swift class name** — no module prefix, no package. `ios` is
accepted as a deprecated fallback for `apple`; new modules should use `apple`.

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

export default requireNativeModule<ExpoBatteryModule>('ExpoBattery');
```

## How it works

### The definition is a result builder

`ModuleDefinition` is a Swift `@resultBuilder`. That is why components are listed one after
another with no commas and no `return` — the same shape as a SwiftUI `body`. Each component
(`Name`, `Function`, `Property`, ...) is a free function returning a definition object, and the
builder collects them into an array.

Two consequences worth knowing:

- **Ordinary Swift statements do not belong in the builder.** A `let x = ...` or an `if` in the
  middle of a definition either fails to compile or produces a confusing diagnostic. Compute
  outside the definition, or inside a component's closure.
- **Type inference does a lot of work.** A closure whose types Swift cannot infer produces an
  error that points at the whole definition rather than the line. Annotate the closure's
  parameters explicitly when the compiler complains about the definition as a whole.

### Argument and return conversion

The closure signature is the contract:

```swift
// String and Int here are what drive conversion. A JavaScript caller passing
// the wrong type gets a typed rejection, not a crash.
AsyncFunction("saveAsync") { (key: String, ttlSeconds: Int) in
  try Store.shared.save(key, ttl: ttlSeconds)
}
```

Supported out of the box: primitives, `String`, arrays, dictionaries, `URL`, `Data`, enums
conforming to `Enumerable`, records, typed arrays and shared objects.

### Records — structured arguments

A `Record` gives you a typed Swift struct instead of a `[String: Any]` you have to unpick:

```swift
// Each @Field maps to a key in the JavaScript object. The property name is the
// key unless you pass one explicitly.
struct ReadOptions: Record {
  @Field var precision: String = "low"
  @Field var timeoutMs: Int = 5000
}

AsyncFunction("readAsync") { (options: ReadOptions) in
  return try Reader.read(precision: options.precision, timeout: options.timeoutMs)
}
```

### Enums

```swift
// Enumerable is what lets a JavaScript string map onto a case. The raw value is
// the string JavaScript passes.
enum Precision: String, Enumerable {
  case low
  case high
}

AsyncFunction("readAsync") { (precision: Precision) in
  return Reader.read(precision)
}
```

### Queues

An `AsyncFunction` runs off the main thread by default. **Anything touching UIKit must say so:**

```swift
AsyncFunction("presentAsync") {
  // UIKit is main-thread-only. Without .runOnQueue(.main) this either trips a
  // main-thread checker in a debug build or does nothing in release.
  self.appContext?.utilities?.currentViewController()?.present(picker, animated: true)
}
.runOnQueue(.main)
```

`Function` is always synchronous on the JavaScript thread and cannot be moved to another queue.
That is the reason `Function` is only appropriate for reading a value already in memory.

### Errors

Subclass `Exception` and override `reason`. The code JavaScript sees is derived from the class
name unless you set one:

```swift
// The code for this exception is derived from its name. Pass `code:` to the
// designated initializer if you need a specific string instead.
final class BatteryUnavailableException: Exception {
  override var reason: String {
    "No battery information is available on this device"
  }
}

AsyncFunction("requireLevelAsync") {
  guard UIDevice.current.batteryState != .unknown else {
    throw BatteryUnavailableException()
  }
  return Double(UIDevice.current.batteryLevel)
}
```

`GenericException<ParamType>` is the base to use when the message needs a value in it — it takes
exactly one parameter, so pass a tuple if you need more than one.

## Platform differences

:::tabs
@tab iOS
- The module class must be `public` and conform to `Module`, which is a typealias for
  `AnyModule & BaseModule`.
- The definition is a result builder, so components are listed rather than assigned.
- Inside a `View { ... }` block the view's JavaScript name is set with **`ViewName(...)`**.
- Queue selection is `.runOnQueue(.main)`.
- `OnAppEntersForeground`, `OnAppEntersBackground` and `OnAppBecomesActive` exist here only.
@tab Android
- The module class extends `Module` and overrides `definition()`; the definition is a lambda.
- Inside a `View { ... }` block the view's JavaScript name is set with **`Name(...)`**.
- Queue selection is `.runOnQueue(Queues.MAIN)`, and suspending bodies use the `Coroutine` form.
- The activity lifecycle hooks (`OnActivityResult`, `OnNewIntent`, ...) exist here only.
- See [Writing a Module in Kotlin](module-in-kotlin.md).
:::

> [!NOTE] Verify `ViewName` against your SDK
> The `ViewName` / `Name` split inside a view definition is read from the installed
> `expo-modules-core@57.0.18` sources: the Swift `ViewDefinitionBuilder` accepts a
> `ViewNameDefinition`, which only the `ViewName(...)` factory produces, while the Kotlin
> `ViewDefinitionBuilder` exposes `Name(...)`. The published API reference lists `Name` for both.
> If your SDK differs, the compiler will tell you immediately — this is a compile error, not a
> runtime surprise.

## Common patterns

**Keep Apple frameworks behind a plain class.** A `BatteryReader` with no `ExpoModulesCore`
import is testable in XCTest and unaffected by SDK upgrades.

**Use `[weak self]` in long-lived closures.** Notification observers and delegate callbacks
outlive a single call; capturing `self` strongly keeps the module alive after teardown.

**Prefer a record over a dictionary** for anything with more than one field. It converts once,
documents the shape, and the compiler checks your access.

**Enable what you need in `OnCreate`, undo it in `OnDestroy`.** `isBatteryMonitoringEnabled`
above is the pattern: process-wide state that a module turns on should be a module lifecycle
concern, not a side effect of the first function call.

## Performance considerations

The module is constructed the first time JavaScript resolves it. A cheap `init` and a cheap
`OnCreate` keep that first call cheap; anything expensive should be lazy.

`Property` is evaluated on every read from JavaScript. `Constant` is read once at construction.
Choosing the wrong one turns a one-off read into a per-render native call.

Events cross into JavaScript individually. A notification that fires many times a second should
be throttled or coalesced in Swift before `sendEvent`, not filtered in JavaScript.

## Security considerations

**Threat.** Every function you expose is callable by any JavaScript in the app, including
JavaScript that arrived through an over-the-air update. A Swift function that takes a path, a
URL or a query string and uses it verbatim hands that power to whoever controls the JavaScript.

**Exploit.** Given `AsyncFunction("readAsync") { (path: String) in try String(contentsOfFile: path) }`,
a caller passes a path inside the app's container and reads any file the app can read —
including the Keychain-adjacent caches and any token written to disk.

**Fix.** Resolve the input against a fixed base natively and reject anything that escapes it:

```swift
AsyncFunction("readCachedAsync") { (name: String) -> String in
  let base = try FileManager.default.url(
    for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true
  ).standardizedFileURL

  // standardizedFileURL resolves ".." before the prefix check, so a name of
  // "../Documents/token.json" fails here rather than escaping the cache.
  let target = base.appendingPathComponent(name).standardizedFileURL
  guard target.path.hasPrefix(base.path + "/") else {
    throw PathOutsideCacheException()
  }
  return try String(contentsOf: target, encoding: .utf8)
}
```

**Verification.** In a debug build, call the function with `../` sequences and with an absolute
path, and confirm both are rejected by code rather than by message. Then confirm your JavaScript
error handling branches on `error.code`, which is stable, rather than on the message, which is not.

Do not accept a raw SQL string or an arbitrary URL for an authenticated request. Accept an
identifier and build the real thing in Swift.

## Common mistakes

- **A non-`public` module class.** The build succeeds and the module never loads. `public class
  ExpoBatteryModule: Module` is required.
- **Mismatched `Name(...)` strings between Swift and Kotlin.** The module works on one platform
  and throws "Cannot find native module" on the other.
- **Forgetting `.runOnQueue(.main)` for UIKit.** In debug you may get a main-thread-checker
  warning; in release the call frequently does nothing at all.
- **Ordinary statements inside the definition builder.** Wrong: a `let` between two components.
  Right: compute in a stored property or inside a component's closure.
- **Capturing `self` strongly in a notification observer.** The module cannot be deallocated,
  and the observer keeps firing after the app context is gone.
- **Editing the app's `ios/` directory instead of the module's.** `npx expo prebuild` clears and
  regenerates the app's native directories by default. Module code under
  `modules/<name>/ios/` is not touched.
- **Expecting a Swift change to Fast Refresh.** It will not. Rebuild with `npx expo run:ios` or
  produce a new development build.
- **A deployment target below 16.4.** The SDK 57 module template's podspec requires it, and
  `pod install` fails rather than warning.

## Related topics

- [The Expo Modules API](expo-modules-api.md) — the DSL and the model behind it.
- [Writing a Module in Kotlin](module-in-kotlin.md) — the other half of the same module.
- [View Components](view-components.md) — exporting a native view.
- [Local Modules](local-modules.md) — generating this layout with one command.
- [Expo Modules vs TurboModules](vs-turbomodules.md) — including why there is no `.mm` file here.
- [Creating a Development Build Locally](../expo-development-builds/creating-locally.md) — how to run the module.
- [Writing Your Own Plugin](../expo-config-plugins/writing-your-own.md) — for `Info.plist` and Podfile changes.
