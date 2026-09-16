---
title: Codegen
description: How TypeScript spec files become C++, Java and Objective-C interfaces at build time, and why that makes native contracts compile-time checked.
status: current
toolchain: cli
---

Codegen is a build-time code generator. It reads **TypeScript spec files** from your project
and its dependencies and emits the native interfaces that [TurboModules](turbomodules.md) and
[Fabric](fabric.md) components must implement: C++ bindings, a Java abstract class, an
Objective-C protocol.

The spec is the source of truth. You write the contract once, in TypeScript, and the compiler
on each platform enforces it. A method you declared but did not implement is a build error
rather than a runtime `undefined is not a function`.

## Why it exists — and when it runs

Before Codegen, the glue between JavaScript and native was hand-written on both sides and
agreed on by convention. Argument types were coerced at runtime. The failure mode was a
mismatch that compiled cleanly, shipped, and produced a null on one platform only.

Codegen makes the contract machine-checked in three places at once:

| Where | What is checked |
| --- | --- |
| TypeScript | Your call sites match the spec |
| Kotlin / Java | Your implementation matches the generated abstract class |
| Swift / Objective-C | Your implementation conforms to the generated protocol |

It runs as part of the **native build**, not as part of Metro. That is the single most common
source of confusion: editing a spec and reloading JavaScript changes nothing, because
generated native code is produced by Gradle and by the CocoaPods/Xcode build script.

> [!NOTE] When you must rebuild
> Change a spec file and you need a native rebuild (`npm run android` / `npm run ios`), not a
> Fast Refresh. If a newly added method is `undefined` at runtime, a stale generated interface
> is the first thing to check.

## Basic example

A spec file is recognised by convention: it lives in a directory declared in your
`codegenConfig`, and its filename starts with `Native` for a module or ends with
`NativeComponent` for a view.

### A module spec

```ts title=src/specs/NativeAnalytics.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

export interface Spec extends TurboModule {
  readonly getConstants: () => {sdkVersion: string};

  // Int32 / Double / Float are branded aliases for `number`. They exist so the
  // generator knows which native type to emit — `int` vs `double` matters in
  // Kotlin and in C++ even though JavaScript has one number type.
  track(event: string, value: CodegenTypes.Double): void;

  getQueuedEventCount(): CodegenTypes.Int32;

  flush(): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Analytics');
```

### A component spec

```ts title=src/specs/RNTGaugeNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {ViewProps, CodegenTypes} from 'react-native';

export interface NativeProps extends ViewProps {
  // WithDefault records the default on the NATIVE side, so a prop you omit is
  // filled in by the generated code rather than by JavaScript.
  value?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  trackColor?: string;
  showsLabel?: CodegenTypes.WithDefault<boolean, true>;

  // Direct events go straight to the target's handler. Bubbling events
  // propagate up the tree, like a press.
  onValueSettled?: CodegenTypes.DirectEventHandler<
    Readonly<{value: CodegenTypes.Double}>
  >;
}

// The string is the native component name that the view manager registers.
export default codegenNativeComponent<NativeProps>('RNTGauge');
```

### Telling the build where to look

```json title=package.json
{
  "codegenConfig": {
    "name": "AppSpecs",
    "type": "all",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.yourapp.specs"
    }
  }
}
```

`type` is `"modules"`, `"components"` or `"all"`. `jsSrcsDir` is scanned recursively for spec
files. A library declares the same block in its own `package.json`, and autolinking picks it
up — see [Autolinking and react-native.config.js](../native-modules/autolinking.md).

## How it works

### The pipeline

1. The native build invokes Codegen with your `codegenConfig` and the config of every
   autolinked dependency.
2. Codegen **parses** each spec with a TypeScript parser and builds a schema — an abstract
   description of modules, components, props, events and types. It does not execute the file.
3. Generators walk that schema and emit source for each target language.
4. The generated sources are added to the native compilation unit for that platform.

Step 2 is why specs are restricted: a parser reading types, not a runtime evaluating code, can
only understand a fixed vocabulary.

### What the generator accepts

| In the spec | Generated as |
| --- | --- |
| `string`, `boolean` | `String`/`NSString`, `boolean`/`BOOL` |
| `CodegenTypes.Int32` | `int` / `NSInteger` |
| `CodegenTypes.Double`, `CodegenTypes.Float` | `double` / `float` |
| Object literal type | A generated struct / `ReadableMap` |
| `ReadonlyArray<T>` | A typed array / `ReadableArray` |
| `Promise<T>` | A promise-resolver parameter on the native method |
| `CodegenTypes.EventEmitter<T>` | A typed emitter on the module |
| `CodegenTypes.DirectEventHandler<T>` / `BubblingEventHandler<T>` | An event on a component |
| `CodegenTypes.WithDefault<T, V>` | A prop with a native-side default |
| `CodegenTypes.UnsafeObject` | An untyped map — an escape hatch with no checking |

What it does **not** accept is the more useful list: general union types, intersections,
generics of your own, optional function parameters, overloads, `any`, enums that are not
string or number literal unions, and conditional or mapped types. If the parser cannot reduce
a type to the vocabulary above, the build fails — which is the correct outcome, because there
would be no native type to emit.

### Where the output lands

:::tabs
@tab iOS
`ios/build/generated/ios/` — an Objective-C protocol per module (`NativeAnalyticsSpec`), C++
`ComponentDescriptor`, `Props`, `EventEmitter` and `ShadowNode` classes per component, plus
the `RCTThirdPartyFabricComponentsProvider` that maps component names to classes. Generation
is triggered from the `[CP-User] Generate Specs` build phase.
@tab Android
`android/app/build/generated/source/codegen/` — a Java abstract class per module
(`NativeAnalyticsSpec`) under your `javaPackageName`, the matching C++ under `jni/`, and a
`ComponentDescriptor` per component. Generation is a Gradle task in the React Native Gradle
plugin, so it reruns when a spec changes.
:::

These directories are **build output**. They belong in `.gitignore`, and editing a file there
is undone by the next build. Read them freely — they are the clearest documentation of what
your spec actually produced.

### Reading the generated interface

The fastest way to debug a spec is to look at what it generated. If your Kotlin class does not
compile because it "does not implement `getQueuedEventCount`", open the generated abstract
class: the signature there is the truth, including whether the generator decided your method
was synchronous, and which nullability it applied.

## Platform differences

The schema is shared, so the two platforms receive the same contract. The differences are in
how you satisfy it.

:::tabs
@tab iOS
The generated interface is **Objective-C**. Swift cannot conform to it directly with full
fidelity, so a Swift implementation is normally fronted by a small Objective-C++ class that
conforms to the protocol and forwards. `excludedPlatforms: ['iOS']` in
`codegenNativeComponent` options skips generation for iOS entirely.
@tab Android
The generated interface is a **Java abstract class**, which Kotlin extends directly with no
shim. Nullability maps to Kotlin's `?` types, so a spec parameter that is optional in
TypeScript becomes a nullable Kotlin parameter and the compiler will make you handle it.
:::

## Performance considerations

Codegen has no runtime cost — it produces source, and the result is ordinary compiled code.
Its costs are in the build:

- **A spec change invalidates native compilation.** Editing a spec triggers regeneration and
  recompilation of the affected native sources. Batch spec edits rather than changing one
  method at a time.
- **The generated conversions are the fast path.** A hand-written binding using an untyped map
  does conversion work at runtime that the generated code does once at compile time. Avoid
  `UnsafeObject` in hot paths for that reason as well as the safety one.
- **Every autolinked library's specs are generated too.** A dependency with a large spec
  surface adds to your build time even if you never call it.

## Common mistakes

- **Editing a spec and only reloading JavaScript.** Wrong: Fast Refresh after adding a method,
  then puzzling over `undefined`. Right: rebuild the native app. Codegen runs in the native
  build.
- **Naming the file wrong.** Wrong: `AnalyticsSpec.ts` or `Gauge.ts`. Right: `NativeAnalytics.ts`
  for a module, `RNTGaugeNativeComponent.ts` for a component. The convention is how the
  generator finds them.
- **Putting non-spec code in `jsSrcsDir`.** Wrong: a helpers file next to the specs, which the
  parser then tries and fails to interpret. Right: keep `jsSrcsDir` limited to specs.
- **Using a type the generator cannot express.** Wrong: `track(event: string | number)` or a
  generic method. Right: split into two methods, or narrow to one type. The build error is
  telling you there is no native signature to emit.
- **Reaching for `UnsafeObject` to get unblocked.** Wrong: typing a complex argument as
  `CodegenTypes.UnsafeObject` to stop the build complaining. Right: declare the object shape.
  `UnsafeObject` discards exactly the checking you adopted Codegen for.
- **Committing generated output.** Wrong: checking `build/generated/` into git, then debugging
  a stale file. Right: `.gitignore` it and let each build produce it.
- **Forgetting `getConstants` is optional but typed.** Wrong: declaring constants in the spec
  and reading a different shape natively. Right: the generated struct is the contract; match it.

## Related topics

- [TurboModules](turbomodules.md) — what module specs produce.
- [Fabric](fabric.md) — the renderer that component specs plug into.
- [JSI](jsi.md) — the layer the generated bindings are written against.
- [Codegen and Spec Files](../native-modules/codegen-specs.md) — the full reference for spec syntax.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — implementing a generated interface in Kotlin and Swift.
- [Fabric Native Components](../native-modules/fabric-native-components.md) — implementing a generated component.
- [Autolinking and react-native.config.js](../native-modules/autolinking.md) — how a library's specs reach your build.
