---
title: When You Need Native Code
description: How to decide between JavaScript, an existing library and writing your own TurboModule or Fabric component.
status: current
toolchain: cli
---

Writing native code is the most expensive decision you can make in a React Native project. It
doubles the number of languages, build systems, CI steps and upgrade risks you own. This page
is about deciding whether you have to, and — once you have decided — which of the three native
extension points you actually need.

Everything in this section assumes React Native 0.87 and therefore the New Architecture:
TurboModules, Fabric and Codegen. There is no other architecture to target. The old Bridge was
removed in 0.82, so any tutorial that starts by registering a module with the Bridge is
describing a runtime that no longer ships.

## Why it exists — and when NOT to reach for it

React Native exposes a large amount of platform capability through core APIs and through
community packages that have already done the native work. Before you write a line of Kotlin
or Swift, work down this list in order.

| Step | Question | If yes |
| --- | --- | --- |
| 1 | Can this be done in JavaScript alone? | Do that. No build changes, no platform parity work. |
| 2 | Does a core API already cover it? | Use it. `Linking`, `Share`, `PermissionsAndroid`, `Clipboard`, `AppState`, `Dimensions` cover a lot. |
| 3 | Is there a maintained library with Fabric/TurboModule support? | Use it, after checking compatibility. |
| 4 | Do you need a platform SDK with no JS surface, a background service, or C/C++ that must not cross into JS? | Write native code. |

Step 3 has a hard filter attached to it. A package that has not shipped New Architecture
support is not a valid answer in 0.87. The interop layers may keep it limping along, but you
are then depending on a compatibility shim for your core functionality. Check before you
depend; see [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

The honest reasons to write native code are narrow:

- **A vendor SDK exists only as an `.aar` and an `.xcframework`.** Payment terminals, DRM
  players, hardware peripherals, enterprise MDM agents.
- **The work must not happen on the JavaScript thread**, and cannot be expressed as a worklet —
  for example a camera pipeline, an audio engine, or an ML inference loop.
- **You need a platform-owned UI control** with its own gesture, accessibility and recycling
  behaviour, such as a native map, a media player surface, or a system text editor.
- **You need to run without JavaScript** — a background service, a widget, a watch app, a push
  notification service extension.

The reasons that look good and are not:

- "It will be faster." Crossing into native has a cost. A chatty native module called once per
  frame is usually slower than the JavaScript it replaced.
- "I want types." Write TypeScript.
- "The library does 90% of what I want." Fork the library or send a patch. You will maintain far
  less code than a from-scratch module.

## Basic example — choosing the right extension point

There are three native extension points, and they are not interchangeable.

| You need | Use | Spec file | Generated from |
| --- | --- | --- | --- |
| Methods JavaScript can call, and values it can read | **TurboModule** | `src/specs/NativeFoo.ts` | `TurboModuleRegistry.getEnforcing<Spec>()` |
| A platform view that participates in layout and rendering | **Fabric native component** | `src/specs/FooNativeComponent.ts` | `codegenNativeComponent<NativeProps>()` |
| Shared C++ that must run identically on both platforms | **C++ TurboModule** | `src/specs/NativeFoo.ts` | the same module spec, with a C++ implementation |

A TurboModule spec is an interface that extends `TurboModule`:

```ts title=src/specs/NativeBatteryInfo.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  // Codegen maps `number` to double on both platforms. Use CodegenTypes.Int32
  // when you specifically need a 32-bit integer on the native side.
  getLevel(): number;
  isCharging(): boolean;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBatteryInfo');
```

A Fabric component spec describes props, not methods:

```ts title=src/specs/BatteryGaugeNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {CodegenTypes, ViewProps} from 'react-native';

export interface NativeProps extends ViewProps {
  level?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  charging?: CodegenTypes.WithDefault<boolean, false>;
}

export default codegenNativeComponent<NativeProps>('BatteryGaugeView');
```

Both files are inputs to Codegen. You never write the glue between them and native code; you
write the spec, and Codegen writes the glue. That is the whole point of the architecture, and it
is why the spec file is the first thing you create, not the last.

> [!TIP] Pick the smallest surface that works
> A TurboModule with four methods is cheaper to maintain, test and upgrade than a Fabric
> component with twenty props. If the platform work can be done off-screen and handed back as
> data, prefer a module.

## How it works

Every native extension in 0.87 goes through the same pipeline:

1. You write a **spec** in TypeScript. It is the single source of truth for the interface.
2. **Codegen** parses the spec at build time and emits typed native scaffolding — an abstract
   Kotlin/Java class on Android, an Objective-C protocol and a C++ JSI binding on iOS, plus the
   C++ props, shadow node and event emitter types for components.
3. You write the **implementation** that satisfies the generated scaffolding. The compiler tells
   you when your implementation and the spec have drifted apart.
4. **Autolinking** finds your package, registers it, and wires the build so a consumer gets it
   by installing your package.

The consequence worth internalising: if the spec and the native code disagree, you get a
compile error rather than an `undefined is not a function` at runtime. This is the main practical
improvement over the old Bridge, and it is why the spec file is not optional boilerplate.

## Platform differences

Native work is never one job. Budget for both platforms up front.

:::tabs
@tab Android
- Kotlin 2.x (0.87 bundles 2.2.0), Gradle, AGP 9.
- `compileSdk` 37, `minCompileSdk` 34 for libraries.
- The generated spec is an abstract class you extend, so the compiler enforces the signature.
- Debugging goes through Android Studio and `adb logcat`.
@tab iOS
- The generated spec is an Objective-C protocol plus a C++ JSI class. Your implementation file
  is Objective-C++ (`.mm`), not plain Objective-C.
- Swift cannot conform to that protocol directly. Swift modules need a thin Objective-C++ layer.
  See [Writing a Module in Swift](writing-a-module-in-swift.md) for exactly how much.
- CocoaPods is the default. Swift Package Manager support is **Experimental** and opt-in.
- You need a Mac. There is no way around this for the iOS half.
:::

## Common patterns

**Start with the spec and a stub.** Write the spec, run Codegen, and implement every method as a
stub that throws. Get the build green on both platforms before writing real logic. Most of the
pain in a native module is in the build, not in the code.

**Keep the spec narrow and coarse.** One call that returns a whole record beats six calls that
each return a field. Every call crosses a language boundary and serialises its arguments.

**Put the real logic in a plain platform class.** Let the TurboModule subclass be a thin adapter
over a `CalendarStore` or a `PaymentClient` that has no React Native types in it. That class is
testable with plain JUnit or XCTest, and it survives an architecture change.

**Wrap the generated module in a hand-written TypeScript module.** The spec has to stay simple
enough for Codegen to parse. A wrapper is where defaults, validation, error mapping and richer
types belong.

## Performance considerations

TurboModules are lazily initialised — the native object is not constructed until JavaScript
first touches it. That means the cost of *having* a module is close to zero, and the cost of
*using* one is paid on first call. Do not eagerly import every native module at app start just to
"warm it up"; you will trade startup time for nothing.

Synchronous methods are possible and are occasionally the right call, but they block the
JavaScript thread for the whole duration of the native work. Anything that touches disk, network
or a system dialog should return a `Promise`.

Crossing the boundary per frame is the classic mistake. If a value changes every frame, it
belongs in a Fabric component's props or in a worklet on the UI thread — not in a module method
called from a JavaScript animation loop.

## Security considerations

Native modules are the usual place where secrets leak into a shipped app, because developers
assume "native means compiled means safe". It does not.

**Threat.** An attacker with the APK or the IPA wants your API key.

**Exploit.** A string constant compiled into a shared library is still a string in the binary.
Both of these find it without a debugger:

```bash
# Android: pull the APK apart and grep the native libraries and the DEX.
unzip -o app-release.apk -d apk-out
strings apk-out/lib/arm64-v8a/*.so | grep -i "api[_-]\?key"
strings apk-out/classes.dex | grep -i "sk_live"
```

```bash
# iOS: the same for a decrypted binary inside the .ipa.
unzip -o MyApp.ipa -d ipa-out
strings ipa-out/Payload/MyApp.app/MyApp | grep -i "api[_-]\?key"
```

**Fix.** Keep the secret on a server you control, and have the app exchange a user credential for
a short-lived token. Where a value genuinely must live on the device — a session token, a refresh
token — store it in Keychain or the Android Keystore rather than in a constant or in
AsyncStorage.

**Verification.** Run the two commands above against your own release build before you ship. If
either prints something that looks like a credential, the credential is public. Repeat after
enabling R8 or bitcode; you will find that neither removes the string, which is the point.

A native module also widens your permission surface. Anything you add to
`AndroidManifest.xml` or to `Info.plist` on behalf of a module shows up in the store listing and
in the runtime permission prompts. Add the narrowest permission that works, and document why in
the library README.

## Common mistakes

- **Following a Bridge-era tutorial.** If a guide tells you to implement a bridge module
  interface or to annotate methods with an export macro, it predates 0.82 and describes a runtime
  that was deleted. The current path is spec, Codegen, implementation, registration.
- **Writing the native code first and the spec last.** The spec is the input to the build. Code
  written before the spec exists will not match what Codegen emits, and you will rewrite it.
- **Choosing a component when you needed a module.** A Fabric component brings a shadow node, a
  props struct, an event emitter and a view manager on each platform. If nothing has to appear on
  screen, none of that is work you need to do.
- **Making everything synchronous because it is easier to call.** A sync method that opens a
  database blocks every frame until it returns. Return a `Promise` and let the UI stay
  responsive.
- **Assuming a library works because `npm install` succeeded.** Installation says nothing about
  New Architecture support. A legacy-only package can install cleanly and fail at first render.

## Related topics

- [TurboModules End to End](turbomodules-end-to-end.md) — the complete path for a module, spec to consumer.
- [Fabric Native Components](fabric-native-components.md) — the same treatment for a native view.
- [Codegen and Spec Files](codegen-specs.md) — what Codegen accepts, and what it emits where.
- [The New Architecture](../core-concepts/new-architecture.md) — why Fabric, TurboModules and JSI exist.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — how to check a package before you depend on it.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — the same extraction attack, applied to the bundle.
