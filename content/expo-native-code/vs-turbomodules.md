---
title: Expo Modules vs TurboModules
description: An honest comparison of the Expo Modules API (Kotlin and Swift DSL, no Codegen spec) and React Native TurboModules (TypeScript spec plus Codegen), and how to choose between them in an SDK 57 app.
status: current
toolchain: expo
sdk: 57
---

An Expo app can call native code through two mechanisms, and both run on JSI under React Native's
New Architecture:

- The **Expo Modules API** — you describe the module in a Kotlin or Swift DSL, and
  `expo-modules-core` builds the JavaScript object from that description at runtime. No spec file,
  no Codegen.
- **TurboModules** — you describe the module in a TypeScript spec, Codegen generates native
  interfaces from it, and you implement those interfaces.

Neither is "the right one". They make different trade-offs, and the choice mostly comes down to who
will consume the module and whether you need C++.

> [!WARNING] The TurboModule pages on this site target React Native 0.87, not 0.86
> The CLI half of this site documents TurboModules on **React Native 0.87**. Expo SDK 57 ships
> **React Native 0.86.3**. The TurboModule mechanism is the same, but the surrounding details — the
> TypeScript type surface, template files, library versions — are not. When you follow
> [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) from an Expo project,
> treat its version numbers and any 0.87-only API as not applying to you, and install packages with
> `npx expo install`.

> [!NOTE] Expo Go vs development build
> Both mechanisms add native code. Expo Go cannot load either; you need a
> [development build](../expo-development-builds/why-you-need-one.md).

## Why it exists / when to use it — and when NOT to

The Expo Modules API exists because writing a TurboModule means maintaining the same contract in
three places — a TypeScript spec, a Kotlin implementation, and a Swift implementation behind an
Objective-C++ wrapper — plus the Codegen configuration that connects them. Expo's own documentation
frames the choice this way: use the Expo Modules API for a better developer experience if you are
willing to depend on the `expo` package, and use TurboModules if you intend to use C++, because they
give easier access to lower-level mechanisms.

Choose the **Expo Modules API** when:

- The module is for your own Expo app, local or shared across your apps.
- You want Kotlin and Swift to be the source of truth, with no generated code to inspect.
- You want module, view, events, shared objects and lifecycle hooks from one API.

Choose a **TurboModule** when:

- The core of the work is **C++** shared between platforms.
- You are publishing a library for React Native apps that do **not** use Expo and you do not want
  to add an `expo` dependency to them.
- You want the JavaScript-to-native contract checked at **build time** by Codegen.

## Basic example

The same synchronous function, `multiply(a, b)`, both ways.

### Expo Modules API

:::tabs
@tab Kotlin
```kotlin title=modules/expo-math/android/src/main/java/expo/modules/math/ExpoMathModule.kt
package expo.modules.math

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMathModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMath")

    // The lambda's parameter types are the contract. There is no other file.
    Function("multiply") { a: Double, b: Double ->
      a * b
    }
  }
}
```
@tab Swift
```swift title=modules/expo-math/ios/ExpoMathModule.swift
import ExpoModulesCore

public class ExpoMathModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoMath")

    Function("multiply") { (a: Double, b: Double) -> Double in
      a * b
    }
  }
}
```
:::

```ts title=modules/expo-math/src/ExpoMathModule.ts
import {NativeModule, requireNativeModule} from 'expo';

// Hand-written. Nothing checks this against the Kotlin or Swift definition.
declare class ExpoMathModule extends NativeModule {
  multiply(a: number, b: number): number;
}

export default requireNativeModule<ExpoMathModule>('ExpoMath');
```

Plus an `expo-module.config.json` naming the two classes, which
`npx create-expo-module@latest --local` generates for you. See [Local Modules](local-modules.md).

### TurboModule

```ts title=specs/NativeMath.ts
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

// This file is the contract. Codegen reads it and generates native interfaces
// that the Kotlin and Objective-C++ implementations must satisfy.
export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeMath');
```

Then a `codegenConfig` block in `package.json`, a Kotlin class extending the generated spec, a
package class for registration, and on iOS an implementation conforming to the generated protocol —
the full path is in [TurboModules End to End](../native-modules/turbomodules-end-to-end.md).
Remember that page targets 0.87.

## How it works

### The comparison

| | Expo Modules API | TurboModules |
| --- | --- | --- |
| Source of truth | Kotlin and Swift definitions | A TypeScript spec file |
| Code generation | None — definition is read at runtime by `expo-modules-core` | Codegen generates native interfaces from the spec |
| Contract checking | **Runtime.** A mismatched TypeScript declaration compiles and throws when called | **Build time.** An implementation that does not match the generated interface fails to compile |
| iOS language | Swift only | Objective-C++ glue, with Swift possible behind it |
| Android language | Kotlin | Kotlin or Java |
| C++ shared core | Not the natural fit | Expo's docs recommend TurboModules for C++ |
| Native views | `View` in the same module definition | Separate Fabric component with its own spec |
| Events | `Events` + `sendEvent`; the module object is an event emitter | Event emitters declared in the spec |
| Lifecycle hooks | Built in (`OnCreate`, `OnDestroy`, activity and app lifecycle hooks) | Wired by hand |
| Dependency imposed on consumers | `expo` / `expo-modules-core` | None beyond React Native |
| Transport | JSI | JSI |
| Performance | Expo's docs describe it as similar to TurboModules | Baseline |
| Scaffolding | `npx create-expo-module@latest` (`--local` for in-app) | Manual, or a library template |
| Autolinking in an Expo app | `expo-module.config.json` | `package.json` / `react-native.config.js`, resolved by Expo Autolinking |

### The DSL names, verified

Checked against `expo-modules-core@57.0.18` installed for SDK 57: `Name`, `Constant`, `Function`,
`AsyncFunction`, `Property`, `Events`, `OnStartObserving`, `OnStopObserving`, `View`, `Prop`,
`OnViewDidUpdateProps`, `Class`, `OnCreate` and `OnDestroy` are defined in both the Kotlin sources and
the Swift sources. `ViewName` exists only in Swift. `Constants` still exists in both but is
deprecated in SDK 57 in favour of `Constant` and `Property` — see
[The Expo Modules API](expo-modules-api.md).

### What "no Codegen" really costs

The Expo Modules API has no build-time link between your TypeScript declaration and your native
definition. Rename `multiply` to `times` in Kotlin, forget the TypeScript file, and everything still
compiles — the call throws at runtime on Android and works on iOS. TurboModules catch that class of
mistake while compiling.

In exchange, there is one fewer file to maintain per module, no Codegen configuration to get right,
and no generated sources to debug when the build does fail. For a module with two methods owned by
the same team as the app, that trade is usually worth it. For a widely-consumed library with a large
surface, build-time checking is worth more.

### Using TurboModule libraries in an Expo app

You do not have to choose one mechanism for the whole app. Community libraries written as
TurboModules or Fabric components work in an SDK 57 app: Expo's autolinking documentation states
that from SDK 52 Expo Autolinking replaces the React Native community CLI autolinking by default, and
it resolves React Native libraries as well as Expo modules. See
[Interoperating with Community Libraries](community-interop.md).

> [!NOTE] Not verified: a hand-written TurboModule inside an Expo app
> This page did not verify the end-to-end steps for writing a **local** TurboModule (spec plus
> `codegenConfig`) directly inside an SDK 57 app under Continuous Native Generation, and the native
> code on this page was not compiled. If you need a TurboModule of your own in an Expo app, the lower-
> risk route is to put it in its own package and consume it like any community library.

## Platform differences

:::tabs
@tab Android
- Expo: a `Module` subclass with `definition()`; argument conversion from `reified` lambda types.
- TurboModule: a class extending the Codegen-generated spec class, plus a package that registers it.
@tab iOS
- Expo: a `public` Swift class conforming to `Module`; no Objective-C++ file.
- TurboModule: an implementation of the generated protocol in Objective-C++, which can delegate to
  Swift. See [TurboModules End to End](../native-modules/turbomodules-end-to-end.md).
:::

## Common patterns

**Wrap a vendor SDK with the Expo Modules API** when the SDK is used only by your apps. The DSL's
lifecycle hooks and `AsyncFunction` queues cover what vendor SDKs usually need.

**Put shared C++ behind a TurboModule** when both platforms call the same C++ core, and call that
TurboModule from your Expo app like any other library.

**Keep the logic out of either binding layer.** A plain Kotlin or Swift class is testable and survives
a switch between mechanisms; the binding should only convert arguments and delegate.

## Performance considerations

Both mechanisms call through JSI, and Expo's documentation describes their performance as similar.
The costs that dominate in practice are the same for both: argument conversion per call, synchronous
functions blocking the JavaScript thread, and chatty fine-grained APIs. Design for one coarse call
rather than many small ones whichever mechanism you use, and measure before you rewrite a module on
performance grounds.

## Common mistakes

- **Copying a TurboModule tutorial written for 0.87 into an SDK 57 app verbatim.** SDK 57 is on
  React Native 0.86.3. Take the mechanism, not the version numbers or 0.87-only APIs.
- **Assuming the Expo TypeScript declaration is checked.** It is not. A typo in a method name compiles
  and throws at runtime. Test every exported function on both platforms.
- **Choosing the Expo Modules API for a library meant for non-Expo apps without saying so.** Your
  consumers then need `expo` installed. State it in the README, or write a TurboModule.
- **Choosing TurboModules for a two-method, app-private module.** You take on a spec, Codegen
  configuration and an Objective-C++ file to get build-time checking for a surface one team owns.
- **Believing Expo modules are slower because they are "not TurboModules".** Both use JSI; measure
  your actual call pattern.
- **Expecting either to run in Expo Go.** Neither does.

## Related topics

- [The Expo Modules API](expo-modules-api.md) — the DSL in full.
- [Local Modules](local-modules.md) — the fastest way to start an Expo module in your app.
- [Publishing an Expo Module](publishing.md) — shipping one to npm.
- [Interoperating with Community Libraries](community-interop.md) — TurboModule libraries in an Expo app.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — the CLI half's full TurboModule path, on React Native 0.87.
- [Codegen Specs](../native-modules/codegen-specs.md) — the spec format, on React Native 0.87.
- [SDK and React Native Pairing](../expo-migration/sdk-react-native-pairing.md) — why SDK 57 means 0.86.
