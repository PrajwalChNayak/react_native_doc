---
title: JSI
description: The JavaScript Interface — a C++ API that lets JavaScript hold and call native objects directly, replacing the Bridge's serialised message queue.
status: current
toolchain: cli
---

JSI (the JavaScript Interface) is a small, engine-agnostic **C++ API**. It defines what a
JavaScript engine must be able to do — create values, read properties, call functions — and,
crucially, it lets C++ install its own objects and functions into the JavaScript global scope.

That last capability is the whole point. A JavaScript variable can hold a pointer to a live
C++ object. Calling a method on it is a virtual C++ call on the calling thread. No
serialisation, no queue, no callback.

Everything else in the New Architecture — [Fabric](fabric.md), [TurboModules](turbomodules.md),
Reanimated's worklets, JSI-based storage libraries — is built on this one idea.

## Why it exists — and why you rarely touch it directly

The Bridge could only move data. Anything you wanted native to do had to be encoded as a JSON
message, queued, batched, and answered later through another message. Three things were
therefore impossible:

- **Synchronous results.** You could not ask native a question and use the answer on the next
  line.
- **Sharing memory.** A 4 MB buffer had to be copied and re-encoded to cross, so image
  pixels, audio samples and database rows were expensive by construction.
- **Passing functions.** A callback had to be registered by id and invoked by another message,
  so ownership and lifetime were manual and leaky.

JSI removes all three by making the boundary a **pointer**, not a protocol.

You will almost never write JSI code in an app. You use it constantly and indirectly. Write
raw JSI only when you are building a library that needs to expose something the TurboModule
and Fabric shapes cannot express — a memory-mapped buffer, a custom runtime, a hot path
measured in microseconds. For everything else, a [TurboModule](turbomodules.md) gives you the
same mechanism with a generated, type-safe surface.

> [!BEST-PRACTICE] Reach for the generated layer first
> A hand-written JSI binding means hand-written type conversion, hand-written lifetime
> management and no build-time checking. [Codegen](codegen.md) produces all of that from a
> TypeScript spec. Drop to raw JSI only when you have measured a reason.

## Basic example

From JavaScript, a JSI-backed object looks like any other object. The only clue is that it was
never defined in JavaScript:

```ts title=A TurboModule is a JSI object
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

interface Spec extends TurboModule {
  readonly getConstants: () => {version: string};
  // Returns in the same tick: the JS thread blocks on a C++ call and gets the
  // value back. This shape simply could not exist over the Bridge.
  getPreferredLanguageSync(): string;
}

const Localisation = TurboModuleRegistry.getEnforcing<Spec>('Localisation');

export const language: string = Localisation.getPreferredLanguageSync();
```

The C++ that backs it is a **host object**: a class that decides what happens when JavaScript
reads a property off it.

```cpp title=The shape of a JSI host object
#include <jsi/jsi.h>

using namespace facebook;

// JavaScript sees an object; every property read lands in `get`.
class LocalisationHostObject : public jsi::HostObject {
 public:
  jsi::Value get(jsi::Runtime &rt, const jsi::PropNameID &name) override {
    if (name.utf8(rt) == "getPreferredLanguageSync") {
      // A host function: a C++ lambda that JavaScript can call directly.
      return jsi::Function::createFromHostFunction(
          rt,
          name,
          /* paramCount */ 0,
          [](jsi::Runtime &rt,
             const jsi::Value &thisVal,
             const jsi::Value *args,
             size_t count) -> jsi::Value {
            // `currentLocaleIdentifier` is your own platform helper.
            return jsi::String::createFromUtf8(rt, currentLocaleIdentifier());
          });
    }
    return jsi::Value::undefined();
  }
};
```

The call from JavaScript enters that lambda on the JavaScript thread. There is no marshalling
step to inspect, which is exactly why there is nothing to optimise about "bridge traffic" any
more.

## How it works

### The runtime is a C++ object

`jsi::Runtime` is the abstraction over the engine. Hermes implements it; JavaScriptCore
implements it; so does V8 in out-of-tree builds. React Native's C++ is written against
`jsi::Runtime` rather than against Hermes, which is why the engine is swappable at all.

### Values, and who owns them

`jsi::Value` is a tagged union — undefined, null, boolean, number, symbol, string, object. The
object cases are reference-counted handles into the engine's heap, not raw pointers, so the
garbage collector knows they are alive.

This is where JSI code most often goes wrong. A `jsi::Value` is only valid on the thread that
owns the runtime, and only while that runtime is alive. Capturing one in a lambda that runs
later on another thread is a crash waiting for a race condition. React Native provides
`CallInvoker` precisely so native code can schedule work back **onto** the JS thread rather
than reaching into the runtime from elsewhere.

### Host objects and host functions

Two primitives cover almost everything:

| Primitive | What it is | Used for |
| --- | --- | --- |
| `jsi::HostObject` | A C++ object whose property reads and writes are intercepted | A whole native module surface |
| `jsi::HostFunction` | A C++ callable exposed as a JS function | A single method, or a callback handed to native |

Because a host function is a first-class JS value, a JS function can also be handed **to**
native and stored — which is how event callbacks and worklet scheduling work without an id
registry.

### Shared memory

`jsi::ArrayBuffer` lets native expose a block of memory that JavaScript reads without a copy.
That is what makes JSI-based key-value stores and image pipelines fast: the bytes never move
and are never encoded.

It is also the sharpest edge in the API. The buffer's lifetime is yours to manage; if native
frees it while JavaScript still holds a `TypedArray` over it, you get memory corruption rather
than an exception.

### Synchronous means "on the calling thread"

A synchronous JSI call does not teleport. It runs native code **on the JS thread**. If that
native code does disk I/O, the JS thread is blocked for the duration — no timers, no touch
handling, no rendering. The capability is real; the discipline it demands is also real. See
[JS Thread vs UI Thread](threading-model.md).

## Platform differences

JSI itself is identical on both platforms — the same C++ headers compile for each. What
differs is the toolchain around it.

:::tabs
@tab iOS
C++ sources are compiled as Objective-C++ (`.mm`) so they can call UIKit. React Native 0.82
removed the C++ backward-compatibility headers, so include the real paths, for example
`#include <react/bridging/LongLivedObject.h>`. Headers now also ship as
`ReactNativeHeaders.xcframework`.
@tab Android
C++ sources build through the NDK with CMake, and cross into Kotlin through JNI (React Native
uses `fbjni` to make that bearable). A JSI call that ends up in Kotlin therefore crosses two
boundaries, JSI and JNI, so keep the JNI side of a hot path thin.
:::

## Performance considerations

- **The crossing is cheap; the conversion is not.** Turning a large JS object into native
  structures still costs proportional to its size. Passing a handle or an id and fetching in
  bulk beats passing the data.
- **Per-call overhead is small but not zero.** Ten thousand calls per frame will show up. Batch.
- **Sync calls serialise your own app.** Each one occupies the JS thread. Two milliseconds of
  native work called sixty times per frame is 120 ms of frozen JavaScript.
- **Shared buffers avoid the copy entirely.** When you genuinely move megabytes — pixels,
  audio, database pages — an `ArrayBuffer` is the difference between viable and not.

## Security considerations

**Threat.** JSI code runs with the app's full native privileges and no sandbox. A logic error
in a host function is a native memory bug, not a JavaScript exception.

**Exploit.** A host function that reads an index from `args[0]` and uses it to offset into an
`ArrayBuffer` without bounds-checking gives any JavaScript in the bundle — including a
transitive dependency — an arbitrary read of process memory. The same class of bug that would
throw `undefined` in JavaScript reads someone else's heap in C++.

**Fix.** Validate every argument's type and range inside the host function before using it.
Treat `const jsi::Value *args` and `count` as untrusted input, because JavaScript can call your
function with anything, in any arity. Prefer [Codegen](codegen.md)-generated bindings, which
emit the type checks for you.

**Verification.** Call the binding from a debug screen with deliberately wrong arguments — no
arguments, a string where a number is expected, a negative length — and confirm you get a
thrown JS error rather than a crash or garbage. Run a debug build with Address Sanitizer
enabled while you do it.

## Common mistakes

- **Using a `jsi::Value` off the JS thread.** Wrong: capturing a `jsi::Function` and calling it
  from a background thread. Right: schedule through `CallInvoker` so it runs on the runtime's
  own thread.
- **Holding a `jsi::Runtime &` past teardown.** Wrong: storing the reference in a singleton.
  Right: tie your object's lifetime to the runtime's, and tear down when it does.
- **Writing raw JSI for an ordinary native module.** Wrong: hand-rolling a host object to
  expose three methods. Right: a TurboModule spec, which generates the same thing with types.
- **Assuming synchronous is free.** Wrong: replacing a promise with a sync call "for speed"
  when the native work takes 30 ms. Right: sync only for values already in memory.
- **Trusting arity.** Wrong: reading `args[1]` without checking `count`. Right: check `count`
  and each argument's type, then convert.
- **Treating "no Bridge" as "no boundary".** Wrong: calling native in a tight render loop.
  Right: the boundary got cheap, not free, and the thread is still single.

## Related topics

- [The New Architecture](new-architecture.md) — how JSI underpins everything else.
- [TurboModules](turbomodules.md) — the type-safe way to use JSI from an app.
- [Codegen](codegen.md) — generating bindings instead of writing them.
- [Fabric](fabric.md) — the renderer that JSI makes reachable from JavaScript.
- [Hermes](hermes.md) — the engine that implements `jsi::Runtime` by default.
- [JS Thread vs UI Thread](threading-model.md) — what a synchronous call blocks.
- [The UI Thread and Worklets](../animation/worklets.md) — a second JSI runtime, and why it exists.
