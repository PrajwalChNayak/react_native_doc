---
title: The New Architecture
description: What actually runs a React Native 0.87 app — JSI, Fabric, TurboModules, Codegen and Hermes — and what the removal of the Bridge changed.
status: current
allow-banned: new-arch-flag-android, new-arch-flag-ios
toolchain: cli
---

"The New Architecture" is the name for the set of pieces that replaced React Native's original
runtime between 2022 and 2025. In React Native 0.87 it is not a mode, a flag or an opt-in. It
is the only way React Native runs. Understanding it is the difference between reasoning about
your app and guessing.

Five things do the work, and each has its own page:

| Piece | What it is | What it replaced |
| --- | --- | --- |
| [JSI](jsi.md) | A C++ interface that lets JavaScript hold and call native objects directly | JSON messages over an async queue |
| [Fabric](fabric.md) | The renderer: a C++ shadow tree, layout, and a mount phase | The old UIManager and its Java/ObjC shadow trees |
| [TurboModules](turbomodules.md) | Native modules as lazily created JSI objects with typed methods | Eagerly instantiated, dynamically dispatched native modules |
| [Codegen](codegen.md) | A build-time generator that turns TypeScript specs into C++/Java/ObjC interfaces | Hand-written glue and runtime type coercion |
| [Hermes](hermes.md) | The default JavaScript engine, running precompiled bytecode | JavaScriptCore with runtime parsing |

## Why it exists — the problem with the Bridge

React Native originally connected JavaScript and native code with a component called the
**Bridge**. Everything crossing between the two worlds went through it, and it had four
properties that together set a ceiling on what the framework could do:

1. **Serialised.** Every argument was converted to JSON on one side and parsed on the other.
   A large list payload or a stream of scroll events paid that cost twice per message.
2. **Asynchronous.** There was no way to ask native a question and get an answer in the same
   tick. Measuring a view, reading a layout value, or deciding what to render based on a
   native value all had to become callbacks.
3. **Batched.** Messages were queued and flushed on a schedule rather than sent immediately,
   so latency was not just non-zero, it was unpredictable.
4. **A single choke point.** One queue carried touch events, view updates, network callbacks,
   timers and every native module call. A slow consumer anywhere delayed everything.

The visible symptoms were familiar: a list that went blank while scrolling fast, a gesture
that lagged the finger, a startup cost proportional to how many native modules were linked
even if you used none of them.

> [!LEGACY] The Bridge no longer exists
> This section is history, included so you can recognise stale advice. As of React Native
> 0.82, React Native runs **bridgeless** and the Bridge has been removed. `newArchEnabled=false`
> on Android and `RCT_NEW_ARCH_ENABLED=0` on iOS are **ignored** — setting either changes
> nothing. From 0.83 onward the legacy architecture classes are being deleted outright to cut
> install size. If a tutorial tells you to touch those flags, or shows `RCTBridgeModule`, it
> predates 0.82 and the rest of its advice is probably stale too. Legacy patterns live only in
> [New Architecture Migration](../migration/new-architecture-migration.md).

## What replaced it

The replacement is not "a faster bridge". It is the removal of the boundary as a message
queue.

**JSI** is a small C++ API that a JavaScript engine implements. Through it, C++ can install
objects and functions into the JavaScript global scope such that a JS value holds a pointer to
a real C++ object. Calling a method on one is a C++ virtual call, not a message. That makes
three previously impossible things possible: synchronous calls in both directions, passing
functions across the boundary without wrapping them in ids, and sharing memory instead of
copying it.

**Fabric** builds on that. React commits into a **C++ shadow tree** that is owned by the
renderer rather than by either platform. Layout runs on that tree with Yoga, off the main
thread. Committing a new tree is an atomic pointer swap, which is what lets React's concurrent
features work correctly — an interrupted or abandoned render never half-applies to the screen.

**TurboModules** are native modules exposed as JSI objects. The registry creates a module the
first time JavaScript asks for it, so linking fifty libraries costs nothing at startup for the
forty-eight you never call on this screen.

**Codegen** removes the hand-written glue those two need. You write a TypeScript spec; at
build time Codegen emits the C++ interface, the Java abstract class and the Objective-C
protocol that the native side implements, so a type mismatch is a compile error instead of a
runtime `undefined`.

## Basic example

The New Architecture shows up in your code as two file shapes. The first is a **TurboModule
spec** — a TypeScript interface that Codegen reads:

```ts title=src/specs/NativeDeviceInfo.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

// The interface IS the contract. Codegen reads this file at build time and
// generates the C++/Kotlin/Objective-C declarations the native side must match.
export interface Spec extends TurboModule {
  readonly getConstants: () => {installId: string};
  getFreeDiskBytes(): Promise<CodegenTypes.Double>;
  // Synchronous is allowed now. Over the Bridge it was not expressible at all.
  getLocaleSync(): string;
}

// `getEnforcing` throws with a clear message if the native side is missing,
// rather than handing back undefined and failing later.
export default TurboModuleRegistry.getEnforcing<Spec>('DeviceInfo');
```

The second is a **Fabric component spec**, which describes a native view:

```ts title=src/specs/RNTSignaturePadNativeComponent.ts
import {codegenNativeComponent} from 'react-native';
import type {ViewProps, CodegenTypes} from 'react-native';

export interface NativeProps extends ViewProps {
  strokeColor?: string;
  strokeWidth?: CodegenTypes.WithDefault<CodegenTypes.Double, 2>;
  onStrokeEnd?: CodegenTypes.DirectEventHandler<
    Readonly<{pointCount: CodegenTypes.Int32}>
  >;
}

export default codegenNativeComponent<NativeProps>('RNTSignaturePad');
```

Both are ordinary TypeScript that also happens to be the input to a code generator. Nothing
about them is registered at runtime.

## How it works

A single frame of a scrolling list touches every piece. Following one update end to end is the
fastest way to see how they fit:

1. A touch lands on the main thread. The platform view dispatches it into Fabric's C++ event
   pipeline, which finds the target in the shadow tree and delivers it to JavaScript.
2. Your handler runs on the **JS thread** and calls `setState`.
3. React reconciles and produces a new shadow tree. Nodes that did not change are shared with
   the previous tree rather than rebuilt, so the cost is proportional to the change.
4. **Layout** runs over that tree with Yoga, on a background thread. The main thread is free
   while this happens.
5. The **commit** publishes the new tree atomically, and a **diff** against the previous tree
   produces a minimal list of mount instructions.
6. The **mount** phase applies those instructions to real `UIView` / `android.view.View`
   objects on the main thread. That is the only part that must be there.

If your handler had needed a native value — the device locale, a stored preference — step 2
could call a TurboModule and get the answer synchronously, without splitting the update into
two renders. That is the practical difference the architecture bought.

See [The Render Pipeline](render-pipeline.md) for the detail of steps 3 to 6 and
[JS Thread vs UI Thread](threading-model.md) for which thread owns which step.

## Platform differences

The architecture is deliberately the same shape on both platforms — the shadow tree, layout
and diffing are shared C++ — but the edges differ.

:::tabs
@tab iOS
The host is `RCTHost` / `RCTReactNativeFactory`; there is no `RCTBridge` object to obtain or
pass around. Codegen output lands under `ios/build/generated/ios/`. The main thread is the
UIKit main thread. Header imports changed in 0.87 — use `#import <React/RCTAppDelegate.h>`,
not the bare form.
@tab Android
The host is `ReactHost`, created by `DefaultReactHost`; `ReactInstanceManager` is gone.
Codegen output lands under `android/app/build/generated/source/codegen/`. The main thread is
the Android UI thread. `UIBlock` and `UIManagerModule.addUIBlock` were removed in 0.87 — use
`UIManagerListener` or View Commands.
:::

Third-party libraries that have not migrated still run through **interop layers**: legacy
native modules are wrapped as TurboModules, and legacy view managers are wrapped so Fabric can
mount them. Treat that as a compatibility shim with a cost, not as a supported pattern to
copy. See [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Performance considerations

The architecture changes where your time goes, not how much of it you have.

- **Startup improves because of laziness, not speed.** TurboModules are constructed on first
  use, so the win scales with how many linked modules a given screen does not touch.
- **The JS thread is still single-threaded.** JSI removed serialisation, not the fact that one
  long synchronous function blocks every other piece of JavaScript. A 200 ms JSON parse is
  still 200 ms of frozen event handling.
- **Synchronous native calls are a loaded gun.** They are cheap individually and ruinous in a
  loop, because each one blocks the JS thread for the duration of the native work. Batch, or
  go async.
- **Fewer bridge crossings is no longer the goal.** The old advice to "minimise bridge
  traffic" was correct for a serialised queue. The New Architecture's costs are elsewhere:
  re-render count, layout work, and mount instruction volume.

Measure before acting on any of this; see [Measuring Before Optimising](../performance/measuring-first.md).

## Common mistakes

- **Treating the New Architecture as optional.** Wrong: adding `newArchEnabled` to
  `gradle.properties` to "turn it on" or roll back. Right: there is nothing to turn on. The
  property has been ignored since 0.82 and the legacy classes are being removed.
- **Copying `NativeModules.MyModule` patterns from a blog post.** Wrong: reaching into the
  `NativeModules` object and hoping the method exists. Right:
  `TurboModuleRegistry.getEnforcing<Spec>('MyModule')`, which fails loudly at the point of the
  mistake and gives you types.
- **Assuming "no Bridge" means "no thread boundary".** The JS thread and the main thread are
  still separate threads. Synchronous JSI calls cross between them; that is a cost, not a free
  lunch. See [JS Thread vs UI Thread](threading-model.md).
- **Believing a library works because it installed.** A package with no Fabric or TurboModule
  support installs cleanly and then fails when a view mounts or a method is called. Check the
  package before you depend on it.
- **Reading old benchmarks as current.** Numbers published before 0.76 measured a runtime that
  no longer exists. Profile your own app with
  [React Native DevTools](../debugging/react-native-devtools.md).

## Related topics

- [JSI](jsi.md) — the C++ interface everything else is built on.
- [Fabric](fabric.md) — the renderer and its C++ shadow tree.
- [TurboModules](turbomodules.md) — lazy, typed native modules.
- [Codegen](codegen.md) — how a TypeScript spec becomes native interfaces.
- [Hermes](hermes.md) — the default engine and its bytecode model.
- [The Render Pipeline](render-pipeline.md) — render, commit and mount in detail.
- [JS Thread vs UI Thread](threading-model.md) — who runs what, and where it blocks.
- [New Architecture Migration](../migration/new-architecture-migration.md) — the legacy patterns and how to replace them.
- [Introduction](../getting-started/introduction.md) — the version timeline and scope of this handbook.
