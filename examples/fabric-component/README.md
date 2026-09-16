# Fabric component example: `react-native-gradient-view`

A complete Fabric native component for React Native 0.87 — a gradient-drawing view with three
props and one event, implemented natively on both platforms.

There is **no old-Bridge code anywhere**: no `RCTViewManager`, no
`RCT_EXPORT_VIEW_PROPERTY`, no `requireNativeComponent`. Since 0.82 the Bridge is gone, so a
component library targeting 0.87 has exactly one shape.

| Spec prop | Type | Purpose |
| --- | --- | --- |
| `colors` | `ReadonlyArray<string>` | Gradient stops |
| `angle` | `WithDefault<Float, 0>` | Degrees clockwise from the top |
| `cornerRadius` | `WithDefault<Int32, 0>` | Corner radius in dp |
| `onGradientReady` | `DirectEventHandler<{width, height}>` | Fires once, after first layout |

## How a component spec differs from a module spec

Four rules, and they are not the TurboModule rules:

1. **The filename must end in `NativeComponent`.** That suffix is how Codegen recognises a
   component spec at all. `GradientViewNativeComponent.ts` yields the component `GradientView`.
2. **The props type extends `ViewProps`** and is exported as a plain type.
3. **The default export is a single `codegenNativeComponent<T>()` call.** Its string argument is
   the name the native side registers under, and it must match on all three sides.
4. **Prop types are restricted** to what Codegen can express across TypeScript, Kotlin and C++ —
   `string`, `boolean`, `Int32`, `Float`, `Double`, `ColorValue`, `WithDefault` enums, arrays and
   event handlers. Not arbitrary TypeScript.

### Reaching the Codegen helper types in 0.87

This is the detail most existing guides get wrong now. `Int32`, `Float`, `WithDefault` and
`DirectEventHandler` are **not** individually exported from the `react-native` root, and
importing them from `react-native/Libraries/Types/CodegenTypes` is a **type error** under the
Strict API. They arrive as a namespace:

```ts
import type {CodegenTypes} from 'react-native';

type Float = CodegenTypes.Float;
type Int32 = CodegenTypes.Int32;
```

`WithDefault` also carries its own generic constraints, which an alias has to repeat or
TypeScript rejects the unconstrained parameter. See the top of the spec file — that alias block
is the compiling version.

### `WithDefault` vs a TypeScript default

`WithDefault<Float, 0>` is the only way to give a prop a default the **native** side knows
about. A default written in TypeScript is invisible to the generated ComponentDescriptor, so
the native view falls back to a zero value and the two platforms disagree.

## What Codegen generates, and where

| Platform | Output | Key pieces |
| --- | --- | --- |
| Android | `android/build/generated/source/codegen/java/com/facebook/react/viewmanagers/` | `GradientViewManagerInterface`, `GradientViewManagerDelegate` |
| iOS | `ios/build/generated/ios/react/renderer/components/RNGradientViewSpec/` | `ComponentDescriptors.h`, `Props.h`, `EventEmitters.h`, `RCTComponentViewHelpers.h` |

> [!NOTE]
> On Android the view-manager interfaces land in **`com.facebook.react.viewmanagers`**, not in
> the package from `codegenConfig.android.javaPackageName`. That is a common first failure —
> importing from the `javaPackageName` package gives an unresolved reference. The exact iOS path
> depends on your Pods layout and has moved between releases; build once and look rather than
> trusting a path from a blog post.

## Event naming

Codegen derives the native event name from the prop name by stripping `on` and lowercasing:
`onGradientReady` → **`topGradientReady`**. Dispatching any other string on Android means the
JS handler is simply never called, with no error anywhere. On iOS the generated event emitter is
typed, so the same mistake is a compile error instead.

## Consuming it

```bash
npx @react-native-community/cli@20.2.0 init GradientDemo --version 0.87.1
cd GradientDemo
npm install /path/to/examples/fabric-component
```

```tsx
import {GradientView} from 'react-native-gradient-view';

<GradientView
  colors={['#0a58ca', '#6a3fb5']}
  angle={135}
  cornerRadius={16}
  style={{width: 240, height: 120}}
  onGradientReady={e => console.log(e.nativeEvent.width)}
/>;
```

```bash
npm run android
```

iOS needs its pods installing so Codegen runs (**macOS with Xcode only**):

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

```bash
npm run ios
```

## Registration, and one flag that matters

`GradientViewPackage` returns the manager from `createViewManagers`, and its `ReactModuleInfo`
sets **`isTurboModule = false`**. That is not a legacy leftover: under Fabric a ViewManager is
registered as a view manager, not as a TurboModule. Setting it `true` makes the renderer fail to
find the component.

On iOS the equivalent wiring is `+componentDescriptorProvider` in the `.mm`, plus the
`GradientViewCls()` function at the bottom of the file. Omit either and the view silently never
appears.

## Verify

```bash
npm run typecheck
```

Passes on Node 22.13.0 or newer — the spec and wrapper compile against real
`react-native@0.87.1` types with the Strict API active, which is what proves the spec is
well-formed and the `CodegenTypes` namespace usage is correct.

> [!WARNING] What was NOT verified here
> The Kotlin, Objective-C++ and C++ sources have **not been compiled**. This example was
> authored on Windows, which has no Xcode and no wired-up Gradle project, so only the TypeScript
> half is machine-checked. The native sources follow the documented 0.87 shapes and the
> generated names are derived by the documented rules, but treat them as needing a real build
> before you depend on them — especially the generated header paths.

## Related reading

- [Fabric Native Components](../../content/native-modules/fabric-native-components.md)
- [Codegen and Spec Files](../../content/native-modules/codegen-specs.md)
- [Fabric](../../content/core-concepts/fabric.md)
- [TurboModule example](../turbomodule/README.md)
