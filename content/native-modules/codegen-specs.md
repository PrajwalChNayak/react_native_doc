---
title: Codegen and Spec Files
description: The reference for spec files — how Codegen finds them, every type it accepts, every field of codegenConfig, and exactly what it emits where.
status: current
toolchain: cli
---

This is the reference page for spec files. [Codegen](../core-concepts/codegen.md) explains why
the pipeline exists; this page is the detail you come back to when the build says
`UnsupportedTypeAnnotationParserError` at four in the afternoon.

Everything below is how React Native 0.87's Codegen behaves. Where a rule comes from a regular
expression or a hard-coded name inside the generator, that is said explicitly, because those
are the rules that fail silently rather than loudly.

## Why the spec language is so restricted

Codegen **parses** your spec. It never executes it. A parser reading a type annotation can only
understand a fixed vocabulary, and everything outside that vocabulary has no native equivalent
to emit.

That is also why the failures split into two very different categories:

| Failure | Symptom |
| --- | --- |
| The file is not recognised as a spec | Nothing is generated. No error. The module or component is simply missing at runtime. |
| The file is a spec but uses an unsupported type | A build error naming the file, the method and the offending annotation. |

The second is the good failure. The first is the one that costs an afternoon, and it is almost
always a filename.

## How Codegen finds a spec

Three conditions must all hold.

**1. The file is inside `jsSrcsDir`.** That directory is read from `codegenConfig` and scanned
recursively.

**2. The basename matches `/^(Native.+|.+NativeComponent)/`.** That is the literal regular
expression in the generator. So:

| Filename | Recognised | As |
| --- | --- | --- |
| `NativeCalendar.ts` | yes | module |
| `ColorWheelNativeComponent.ts` | yes | component |
| `NativeCalendar.ios.ts` | yes | module, iOS only |
| `CalendarSpec.ts` | no | — |
| `NativeCalendar.d.ts` | no | `.d.ts` is excluded |
| `__tests__/NativeCalendar.ts` | no | paths containing `__tests` are excluded |

A platform suffix works because the basename is split on dots: two segments means
platform-agnostic, three means the middle segment is the platform.

**3. The contents match.** A module file must contain the text `extends TurboModule`. A
component file must have a default export of the form `export default codegenNativeComponent<`.
A file that satisfies the filename rule but not this one is skipped in silence.

## Module specs

### The shape the parser requires

```ts title=src/specs/NativeCalendar.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

// The interface MUST be named exactly `Spec`, and it MUST extend TurboModule.
// A differently named interface is a parser error, not a warning.
export interface Spec extends TurboModule {
  readonly getConstants: () => {defaultCalendarName: string};
  createEvent(title: string, startsAt: CodegenTypes.Double): Promise<string>;
}

// Exactly one registry call per file. Two is an error; zero means the file is
// parsed as "no modules" and you get nothing.
export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalendar');
```

Three hard rules, all enforced by the parser:

- The interface is named `Spec` and extends `TurboModule`.
- There is exactly one `TurboModuleRegistry.get` or `getEnforcing` call, with a string literal
  argument and an explicit type parameter.
- The **filename** determines the generated class name. `NativeCalendar.ts` produces
  `NativeCalendarSpec`. The string passed to `getEnforcing` is the *runtime* lookup name and is
  independent of it, though keeping them the same saves confusion.

### Types a module spec may use

| Written in the spec | Meaning |
| --- | --- |
| `string`, `boolean` | The obvious primitives |
| `number` | A `double` on both platforms |
| `CodegenTypes.Int32` | A 32-bit integer in C++ and Objective-C |
| `CodegenTypes.Double`, `CodegenTypes.Float` | Explicit floating point width |
| `void` | A method that returns nothing |
| `Promise<T>` | An async method; native receives a resolve/reject pair |
| `ReadonlyArray<T>`, `Array<T>`, `T[]` | A typed array |
| An object literal type, or a `type` alias for one | A generated struct |
| `{[key: string]: T}` | A dictionary, if the type has **only** an index signature |
| A union of string literals | A validated string enum |
| A union of number literals | A validated numeric enum |
| A TypeScript `enum` with integer or string values | An enum. Non-integer numeric members are rejected |
| `Partial<T>` | Every member of `T` made optional |
| `CodegenTypes.UnsafeObject` / `Object` | An untyped map. No checking at all |
| `CodegenTypes.EventEmitter<T>` | A typed native-to-JavaScript event |
| `ArrayBuffer` | A binary buffer |
| `RootTag` | The surface's root tag |

What is **not** accepted, and why the error is right: general unions of unrelated types
(there is no native type to emit), your own generics, function overloads, optional function
parameters, `any`, conditional and mapped types, and an object type that mixes an index
signature with named properties.

> [!TIP] `?` and `| null` are not the same thing
> An optional property (`title?: string`) and a nullable one (`title: string | null`) both
> produce a nullable native parameter, but the generated Kotlin and Objective-C signatures
> differ in whether the argument may be omitted. Pick one spelling per spec and be consistent.

### Method shapes

| Return type | Generated Kotlin | Generated Objective-C | JS thread |
| --- | --- | --- | --- |
| `void` | `fun name(...)` | `- (void)name...` | free |
| `Promise<T>` | `fun name(..., promise: Promise)` | `...resolve:reject:` | free |
| `T` | `fun name(...): T` | `- (T)name...` | **blocked** |

A spec method with a non-`void`, non-`Promise` return type is a **synchronous** method. That is
a deliberate capability, not an accident, and it blocks the JavaScript thread for the duration
of the native call.

### Constants

```ts title=src/specs/NativeDeviceInfo.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  // getConstants is special-cased by the generator. Declare it readonly and as
  // a property, returning a closed object type.
  readonly getConstants: () => {
    modelName: string;
    isTablet: boolean;
  };
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceInfo');
```

On Android this generates a `final getConstants()` that checks your map against the declared
keys and delegates to an abstract `getTypedExportedConstants()` — so the method you override is
the second one. Declaring a constant you never fill in throws at construction with the missing
key named, which is the behaviour you want.

### Events

```ts title=src/specs/NativeBatteryMonitor.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

export type BatteryState = Readonly<{
  level: CodegenTypes.Double;
  isCharging: boolean;
}>;

export interface Spec extends TurboModule {
  // A property typed EventEmitter<T>, not a method. Subscribing returns an
  // EventSubscription, and the payload type is generated on both sides.
  readonly onBatteryChanged: CodegenTypes.EventEmitter<BatteryState>;
  startMonitoring(): void;
  stopMonitoring(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBatteryMonitor');
```

The parser recognises an event by the property's type being `EventEmitter`, so it must be a
property signature and not a method. An `EventEmitter<{}>` with an empty payload type is
rejected — use a concrete payload, or a payload-free event if the generator in your version
supports it.

### Platform-only modules

Two mechanisms, and they behave differently:

| Technique | Effect |
| --- | --- |
| Filename `NativeFoo.android.ts` / `NativeFoo.ios.ts` | Two separate specs; only the matching one is parsed for that platform |
| Name suffix `NativeFooAndroid` / `NativeFooIOS` | One spec, generation skipped for the other platform |
| Name suffix `NativeFooCxx` | C++-only module; no Java or Objective-C is generated |

The suffix rule checks both the filename and the registry name, so
`TurboModuleRegistry.getEnforcing<Spec>('NativeClipboardAndroid')` excludes iOS even if the
file is called something else. That is easy to trigger by accident when naming a module after
an Android API.

## Component specs

### The shape the parser requires

```ts title=src/specs/ColorWheelNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {CodegenTypes, ViewProps} from 'react-native';

// The props type extends ViewProps so the component inherits style, layout,
// accessibility and the standard touch props.
export interface NativeProps extends ViewProps {
  hue?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  label?: string;
}

// interfaceOnly tells Codegen there is no matching legacy view manager to
// generate a view config for; excludedPlatforms skips a platform entirely.
export default codegenNativeComponent<NativeProps>('ColorWheel', {
  interfaceOnly: false,
  excludedPlatforms: ['android'],
});
```

The recognised options are `interfaceOnly`, `paperComponentName`,
`paperComponentNameDeprecated` and `excludedPlatforms`. The last two exist for components that
also had a pre-Fabric implementation; new components do not need them.

### Prop types a component spec may use

| Written in the spec | Native type |
| --- | --- |
| `boolean`, `string` | The obvious primitives |
| `CodegenTypes.Int32`, `CodegenTypes.Double`, `CodegenTypes.Float` | Explicit numeric widths |
| `CodegenTypes.WithDefault<T, V>` | `T` with `V` applied natively when the prop is absent |
| A union of string literals | A generated C++ enum |
| An object literal type | A nested props struct |
| `ReadonlyArray<T>` | A vector of `T` |
| `ColorValue` | A platform colour |
| `ProcessedColorValue` | An already-processed colour |
| `ImageSource` | An image source struct |
| `PointValue`, `EdgeInsetsValue`, `DimensionValue` | The matching layout structs |
| `CodegenTypes.UnsafeMixed` | Untyped. Avoid |

`ColorValue`, `ProcessedColorValue`, `ImageSource`, `PointValue`, `EdgeInsetsValue` and
`DimensionValue` are all type exports of `react-native`, so they import cleanly under the
Strict TypeScript API:

```ts title=src/specs/BannerNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {
  CodegenTypes,
  ColorValue,
  DimensionValue,
  EdgeInsetsValue,
  ImageSource,
  ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  tintColor?: ColorValue;
  artwork?: ImageSource;
  contentInsets?: EdgeInsetsValue;
  maxWidth?: DimensionValue;
  // A union of string literals becomes a C++ enum, so an invalid value is a
  // build error in JavaScript and an exhaustive switch in C++.
  fit?: CodegenTypes.WithDefault<'cover' | 'contain' | 'stretch', 'cover'>;
}

export default codegenNativeComponent<NativeProps>('Banner');
```

### Events

| Written in the spec | Behaviour |
| --- | --- |
| `CodegenTypes.DirectEventHandler<T>` | Delivered straight to this view's handler |
| `CodegenTypes.BubblingEventHandler<T>` | Propagates up the tree, with a `Capture` phase |

The payload type must be a closed object type. Both handler types are optional props by
convention (`onFoo?:`) because a component with no listener should not be a type error.

### Commands

```ts title=src/specs/VideoSurfaceNativeComponent.ts
import {codegenNativeCommands, codegenNativeComponent} from 'react-native';
import type {CodegenTypes, HostInstance, ViewProps} from 'react-native';

export interface NativeProps extends ViewProps {
  source?: string;
}

// The first parameter of every command is the view reference. The rest are the
// arguments, and they are limited to boolean, Int32, Double, Float and string.
interface NativeCommands {
  seek: (viewRef: HostInstance, seconds: CodegenTypes.Double) => void;
  play: (viewRef: HostInstance) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  // Every command must be listed here as well as declared above. A command
  // missing from this array is not generated.
  supportedCommands: ['seek', 'play'],
});

export default codegenNativeComponent<NativeProps>('VideoSurface');
```

## The `codegenConfig` reference

```json title=package.json
{
  "codegenConfig": {
    "name": "AppSpecs",
    "type": "all",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.awesomeproject.specs"
    },
    "ios": {
      "modules": {
        "NativeCalendar": {"className": "RCTCalendar"}
      },
      "components": {
        "ColorWheel": {"className": "RCTColorWheelComponentView"}
      }
    }
  }
}
```

| Field | Type | What it does |
| --- | --- | --- |
| `name` | string | The generated library name. Becomes the iOS header folder, the C++ include path segment and the Gradle task's library name. |
| `type` | `"modules"` \| `"components"` \| `"all"` | Which generator sets run. |
| `jsSrcsDir` | string | Directory scanned for specs, relative to this `package.json`. |
| `android.javaPackageName` | string | Java package for generated **module** specs. |
| `ios.modules` | object | Maps a module name to `{ "className": "..." }`. |
| `ios.components` | object | Maps a component name to `{ "className": "..." }`. |
| `outputDir` | string or `{ios, android}` | Overrides the base output path. Rarely needed. |
| `includesGeneratedCode` | boolean | Set by libraries that ship pre-generated native code, so the consumer's build does not regenerate it. |

Two things worth stating plainly because they are asymmetric:

- `android.javaPackageName` affects **module** specs only. Generated view manager interfaces and
  delegates always land in `com.facebook.react.viewmanagers`, no matter what you set.
- `ios.modules` / `ios.components` have no Android counterpart. Android discovers implementations
  through the `ReactPackage` you write; iOS discovers them from this configuration.

> [!NOTE] The older `modulesProvider` / `componentProvider` spelling
> React Native 0.87 still accepts `ios.modulesProvider` and `ios.componentProvider`, which map a
> name directly to a class string rather than to an object. Libraries written before the object
> form are not broken. Prefer the object form in new code.

## What is generated, and where

### Modules

:::tabs
@tab Android
```text
<module>/build/generated/source/codegen/
├── schema.json
├── java/<javaPackageName as a path>/NativeCalendarSpec.java
└── jni/
    ├── <name>.h
    ├── <name>-generated.cpp
    └── CMakeLists.txt
```

`NativeCalendarSpec` is an abstract class extending `ReactContextBaseJavaModule` and
implementing the `TurboModule` marker interface, with a `public static final String NAME` and
one abstract method per spec method. `java/` is added to the variant's source set by the
React Native Gradle plugin.
@tab iOS
```text
ios/build/generated/ios/
└── <name>/
    ├── <name>.h                ← @protocol NativeCalendarSpec, class NativeCalendarSpecJSI
    └── <name>-generated.mm
```

The protocol declares one Objective-C method per spec method. `NativeCalendarSpecJSI` is the
C++ class your implementation returns from `getTurboModule:`.
:::

### Components

:::tabs
@tab Android
```text
<module>/build/generated/source/codegen/
├── java/com/facebook/react/viewmanagers/
│   ├── ColorWheelManagerInterface.java
│   └── ColorWheelManagerDelegate.java
└── jni/react/renderer/components/<name>/
    ├── ComponentDescriptors.h / .cpp
    ├── Props.h / .cpp
    ├── EventEmitters.h / .cpp
    ├── ShadowNodes.h / .cpp
    └── States.h / .cpp
```
@tab iOS
```text
ios/build/generated/ios/react/renderer/components/<name>/
├── ComponentDescriptors.h / .cpp
├── Props.h / .cpp
├── EventEmitters.h / .cpp
├── ShadowNodes.h / .cpp
├── States.h / .cpp
└── RCTComponentViewHelpers.h    ← RCTColorWheelViewProtocol + command dispatcher
```
:::

The C++ names are built mechanically from the component name. For `'ColorWheel'` you get
`ColorWheelProps`, `ColorWheelState`, `ColorWheelEventEmitter`, `ColorWheelShadowNode` and
`ColorWheelComponentDescriptor`. The Objective-C protocol is `RCT` + the name + `ViewProtocol`,
which is why naming a component `'FooView'` gives you `RCTFooViewViewProtocol`.

### Provider files generated for the app

Alongside the per-library output, the app's build produces the wiring that connects them:

| File | Purpose |
| --- | --- |
| `RCTModuleProviders.h/.mm` | Module name to provider class, built from every `ios.modules` |
| `RCTThirdPartyComponentsProvider.h/.mm` | Component name to view class, built from every `ios.components` |
| `RCTAppDependencyProvider.h/.mm` | The object the `AppDelegate` hands to React Native |
| `ReactCodegen.podspec` | The pod that compiles all of the above |

> [!WARNING] Everything in these directories is build output
> Add them to `.gitignore`. Editing a generated file fixes your machine until the next build.
> Reading them is encouraged — the generated signature is the authoritative answer to "what am
> I supposed to implement".

## Running Codegen by hand

The build runs Codegen for you. Running it manually is for inspecting output without a full
compile, and for libraries that want to check what a spec change produced.

```bash
# Generate for both platforms into the default location.
npx react-native codegen

# One platform, explicit output directory, from a library rather than an app.
npx react-native codegen --platform ios --outputPath ./build/generated --source library
```

```bash
# Android only: the Gradle task the plugin registers.
cd android && ./gradlew generateCodegenArtifactsFromSchema
```

The `codegen` command's options are `--path`, `--platform` (`android`, `ios` or `all`),
`--outputPath` and `--source` (`app` or `library`).

## Platform differences

:::tabs
@tab Android
- Generated module specs are **abstract classes**, so an unimplemented method is a compile
  error naming the method.
- Numeric returns are always `double` on the JVM, regardless of `Int32` or `Float` in the spec.
- Generated view manager scaffolding ignores `javaPackageName` and lands in
  `com.facebook.react.viewmanagers`.
- Generation is a Gradle task, so it reruns automatically when a spec changes.
@tab iOS
- Generated module specs are **protocols**, so an unimplemented method is a warning by default.
- `assumeNonnull` is on for iOS generation, so the generated header is wrapped in
  `NS_ASSUME_NONNULL_BEGIN` and optionality in your spec shows up as explicit `_Nullable`.
- Generation happens in a CocoaPods build script phase on the `ReactCodegen` pod.
- The generated header folder is named after `codegenConfig.name`, so renaming that field
  changes every `#import` in your implementation files.
:::

## Common patterns

**Keep `jsSrcsDir` free of anything that is not a spec.** A helper file whose name happens to
start with `Native` will be parsed as a spec and fail the build. A directory that contains only
specs is the cheapest way to avoid that class of problem.

**Wrap the spec in a hand-written module.** The spec has to stay inside the parser's vocabulary.
Defaults, `Date` handling, validation, error mapping and richer unions belong in a TypeScript
wrapper that imports the spec. Consumers import the wrapper.

**Prefer one coarse struct to many scalars.** A method returning a record costs one crossing;
six getters cost six. The generated struct conversion is the fast path.

**Read the generated file when the compiler disagrees with you.** The generated signature is
what the compiler is checking against, and it is regenerated on every build. It is never stale
and never wrong about itself.

## Performance considerations

Codegen itself has no runtime cost — it emits source, which becomes ordinary compiled code. Its
costs are all in the build:

- A spec change invalidates native compilation for that library. Batch spec edits rather than
  adding one method at a time and rebuilding.
- Every autolinked dependency with a `codegenConfig` is generated too, on every clean build.
  A dependency with a large spec surface costs you build time even if you never call it.
- `UnsafeObject` and `UnsafeMixed` move conversion work from compile time to run time, on top of
  discarding the type checking. They are slower as well as less safe.

## Common mistakes

- **Naming the interface anything but `Spec`.** Wrong: `export interface CalendarSpec extends
  TurboModule`. Right: `export interface Spec extends TurboModule`. The parser checks the
  identifier literally.
- **Naming the file so Codegen skips it.** Wrong: `CalendarNative.ts`, `Calendar.spec.ts`.
  Right: `NativeCalendar.ts` or `CalendarNativeComponent.ts`. A skipped file produces no error
  at all — just a missing module.
- **Two registry calls in one file.** Wrong: exporting both a `getEnforcing` default and a
  `get`-based optional fallback. Right: one call per spec file; put the fallback in a wrapper.
- **Ending a module name in `Android` or `IOS` by accident.** Wrong:
  `TurboModuleRegistry.getEnforcing<Spec>('NativeMediaIOS')` for a cross-platform module, which
  silently excludes Android. Right: pick a neutral name, and use the suffix only when you mean
  it.
- **Mixing an index signature with named properties.** Wrong: `{[key: string]: string; id:
  string}`. Right: pick one. The parser rejects the combination because there is no native type
  for it.
- **Expecting `Int32` to change the Kotlin signature.** Wrong: `override fun getCount(): Int`.
  Right: `override fun getCount(): Double`. `Int32` changes the C++ and Objective-C types only.
- **Declaring a constant and not returning it.** Wrong: adding a key to `getConstants` and
  forgetting the native map. Right: the generated code validates the keys and throws at
  construction with the missing name.
- **Editing generated code to make the build pass.** Wrong: adding a method to the generated
  spec. Right: change the TypeScript spec; the generated file is overwritten on the next build.

## Related topics

- [Codegen](../core-concepts/codegen.md) — the conceptual overview of the pipeline.
- [TurboModules End to End](turbomodules-end-to-end.md) — a module spec taken all the way to a call site.
- [Fabric Native Components](fabric-native-components.md) — a component spec taken all the way to JSX.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — implementing the generated Java class.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — implementing the generated protocol.
- [Autolinking and react-native.config.js](autolinking.md) — how a dependency's `codegenConfig` reaches your build.
- [Platform Folders](platform-folders.md) — where generated output lands relative to your own sources.
