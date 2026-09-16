---
title: TurboModules
description: How native modules work in React Native 0.87 — lazy creation through TurboModuleRegistry, typed interfaces from Codegen, and synchronous calls over JSI.
status: current
allow-banned: use-turbo-modules
toolchain: cli
---

A TurboModule is a native module exposed to JavaScript as a **JSI object**. Calling one of its
methods is a C++ call into Kotlin or Swift, not a message posted to a queue. The module itself
is created the first time JavaScript asks for it, and its method signatures are generated from
a TypeScript spec at build time.

TurboModules are how every native module works in 0.87. There is no flag, and no alternative;
the `useTurboModules` feature flag was removed.

## Why they exist — and when you need one

The previous system had two structural problems. Every registered native module was
instantiated when the app started, whether or not you used it — so install a library and pay
for it on every cold start. And every call was dynamically dispatched with arguments coerced
at runtime, so a wrong argument type produced a confusing failure deep inside native code, or
silently did nothing.

TurboModules fix both: **lazy instantiation** through a registry, and **typed interfaces**
that [Codegen](codegen.md) derives from your spec so a mismatch is a build error.

You need a TurboModule when JavaScript has to reach a platform capability that core does not
expose — a vendor SDK, a hardware API, an existing native library in your own app. You do
**not** need one to make JavaScript faster; JS and native are both fast, and the boundary is
no longer the bottleneck it was.

## Basic example

The spec file is the contract. It is ordinary TypeScript and lives in your app.

```ts title=src/specs/NativeAppLock.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

export interface Spec extends TurboModule {
  // Constants are read once at module construction and are available
  // synchronously without a method call.
  readonly getConstants: () => {isSupported: boolean};

  // Promise-returning: the native side does the work off the JS thread and
  // resolves later. This is the right default.
  authenticate(reason: string): Promise<boolean>;

  // Synchronous: blocks the JS thread until native returns. Only for values
  // that are already in memory natively and are cheap to read.
  getFailedAttemptCountSync(): CodegenTypes.Int32;

  setEnabled(enabled: boolean): void;
}

// getEnforcing throws immediately, with the module name in the message, if the
// native side is not linked. `get` returns null instead, for optional modules.
export default TurboModuleRegistry.getEnforcing<Spec>('AppLock');
```

Using it from a component is unremarkable, which is the point — the types come from the spec:

```tsx title=src/screens/LockScreen.tsx
import {useCallback, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

interface Spec extends TurboModule {
  readonly getConstants: () => {isSupported: boolean};
  authenticate(reason: string): Promise<boolean>;
}

const AppLock = TurboModuleRegistry.getEnforcing<Spec>('AppLock');

export function LockScreen() {
  const [status, setStatus] = useState<'idle' | 'ok' | 'denied'>('idle');

  const unlock = useCallback(async () => {
    // Awaited, so the JS thread stays free while the OS prompt is up.
    const granted = await AppLock.authenticate('Unlock your vault');
    setStatus(granted ? 'ok' : 'denied');
  }, []);

  if (!AppLock.getConstants().isSupported) {
    return <Text>Device lock is not available on this device.</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={unlock} accessibilityRole="button">
        <Text>Unlock</Text>
      </Pressable>
      <Text>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({wrap: {gap: 12, padding: 16}});
```

The full native side — Kotlin, Swift, registration and autolinking — is in
[TurboModules End to End](../native-modules/turbomodules-end-to-end.md).

## How it works

### Registration and lazy creation

At startup the runtime installs a **TurboModule provider** into the JavaScript global scope: a
JSI object whose property lookups are intercepted by C++.

`TurboModuleRegistry.getEnforcing<Spec>('AppLock')` asks that provider for `'AppLock'`. The
first time, C++ walks the registered module providers, constructs the native instance, wraps
it in a JSI host object, and caches it. Every later lookup returns the cached object.

Two things follow from that:

- The cost of a module you never call is the cost of it being *registered*, not constructed.
  That is the startup win.
- A module whose constructor does expensive work still pays that cost — just at first use,
  possibly mid-interaction. Do slow setup lazily inside the module, not in its constructor.

Because the lookup happens when the module-level `getEnforcing` call runs, importing your spec
file at the top of a screen constructs the module when that screen's module is first
evaluated. Import it inside the function if you want to defer further.

### Method dispatch

Each method on the JSI host object is a C++ function. When JavaScript calls
`AppLock.authenticate('...')`:

1. The C++ binding converts the JS arguments to native types using the **generated** signature
   — it knows `reason` is a string because Codegen wrote that down.
2. It invokes the platform implementation (a Kotlin method, or an Objective-C selector
   fronting your Swift code).
3. For a `Promise`-returning method, native gets a promise resolver and returns immediately;
   JavaScript continues. For a `void` method, it returns immediately with nothing.
4. For a **synchronous** method, the JS thread blocks until the native call returns and the
   result is converted back to a JS value.

There is no JSON, no message id, and no queue in any of those steps.

### Sync versus async, concretely

| Return type | JS thread | Use it for |
| --- | --- | --- |
| `Promise<T>` | Free while native works | Anything involving I/O, the network, disk, or a UI prompt |
| `void` | Free; fire and forget | Commands with no result — logging, a setting write |
| `T` (sync) | **Blocked** until native returns | Small values already in native memory: a constant, a cached flag, a locale |

Synchronous methods are the headline capability TurboModules unlocked, and the most commonly
misused. A synchronous method that touches disk turns every call into a frame drop. The rule
is not "avoid sync" — it is "sync only for work that is already done".

### Events

For native-to-JS notifications, declare an event in the spec rather than polling a sync
method. Codegen understands a property typed `CodegenTypes.EventEmitter<T>` and generates a
typed subscribe function on the module itself, so the event name and payload are checked:

```ts title=src/specs/NativeAppLock.ts (event declaration)
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

export interface Spec extends TurboModule {
  readonly getConstants: () => {isSupported: boolean};
  // Subscribing returns an EventSubscription; the payload type is generated.
  readonly onLocked: CodegenTypes.EventEmitter<{reason: string}>;
  startWatching(): void;
  stopWatching(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppLock');
```

```ts title=src/hooks/useLockEvents.ts
import {useEffect} from 'react';
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

interface Spec extends TurboModule {
  readonly getConstants: () => {isSupported: boolean};
  readonly onLocked: CodegenTypes.EventEmitter<{reason: string}>;
  startWatching(): void;
  stopWatching(): void;
}

const AppLock = TurboModuleRegistry.getEnforcing<Spec>('AppLock');

export function useLockEvents(onLocked: (reason: string) => void) {
  useEffect(() => {
    const sub = AppLock.onLocked(event => onLocked(event.reason));
    AppLock.startWatching();

    // Leaking this subscription keeps the closure — and whatever it captured —
    // alive for the life of the app.
    return () => {
      sub.remove();
      AppLock.stopWatching();
    };
  }, [onLocked]);
}
```

## Platform differences

:::tabs
@tab iOS
Codegen emits an Objective-C protocol (`NativeAppLockSpec`) plus C++ bindings under
`ios/build/generated/ios/`. Swift implementations are reached through an Objective-C class
that conforms to the protocol, because the generated interface is Objective-C. Modules are
provided through `RCTAppDelegate`'s module provider hook; there is no `RCTBridge` to register
against.
@tab Android
Codegen emits an abstract Java class (`NativeAppLockSpec`) under
`android/app/build/generated/source/codegen/`. Your Kotlin class extends it and is returned
from a `TurboReactPackage`-style provider, which also reports the module's metadata so the
registry knows the module exists without constructing it.
:::

A module that only makes sense on one platform should say so: return a distinct value from
`getConstants`, or expose it via `TurboModuleRegistry.get` (which returns `null`) and check
`Platform.OS` before use. Do not ship a spec whose methods throw on the other platform.

## Performance considerations

- **Construction is deferred, not free.** Heavy work in a module constructor moves the cost
  from startup into the middle of a user interaction, which is usually worse. Initialise
  lazily inside the module.
- **Crossing costs little; converting costs something.** A call with a 2 MB string or a large
  object still pays for the conversion at the boundary. Pass ids and fetch in bulk rather than
  chatty per-item calls.
- **Sync in a loop is the classic regression.** A thousand synchronous reads inside a render
  will block the JS thread for the sum of them. Read once and cache.
- **Constants are the cheapest option.** A value that never changes for the process lifetime
  belongs in `getConstants`, where it is read once at construction.

## Security considerations

**Threat.** A TurboModule is a hole you punched in the JavaScript sandbox. Whatever the module
exposes, any JavaScript in your bundle can call — including code from a dependency you did not
audit.

**Exploit.** A module written as a thin convenience wrapper, say
`readFile(path: string): Promise<string>`, hands every package in `node_modules` the ability to
read arbitrary paths, including the Keychain-adjacent files and the app's own preferences. No
attacker code needs to reach native; yours already did the work.

**Fix.** Make the native API specific rather than general. Expose
`readCachedInvoice(id: string)` that resolves the path natively inside a known directory, not
`readFile(path)`. Validate on the native side — JavaScript checks are advisory because the
caller is JavaScript. Never accept a file path, URL or SQL fragment from JS and use it
unvalidated.

**Verification.** Grep your spec files for parameters typed `string` that end up as a path, a
URL or a command, and check the native implementation rejects anything outside an allow-list.
Then call the module from a debug screen with `../../` in the argument and confirm it is
refused rather than served.

## Common mistakes

- **Using `get` and not checking for null.** Wrong: `TurboModuleRegistry.get<Spec>('AppLock')!`
  followed by a call. Right: use `getEnforcing` when the module is required, or handle the
  `null` when it is genuinely optional.
- **Making everything synchronous because it is now possible.** Wrong: a sync method that
  reads a file. Right: `Promise<T>` for anything that does work; sync only for cached values.
- **Doing setup in the constructor.** Wrong: opening a database in the module's constructor,
  so the first call to any method stalls. Right: open it on first use, behind a lazy field.
- **Forgetting to remove event subscriptions.** Wrong: `addListener` in an effect with no
  cleanup. Right: return `() => sub.remove()`. The leak is silent until a screen is mounted a
  hundred times.
- **Editing generated code.** Wrong: fixing a signature in the generated spec class under
  `build/`. Right: fix the TypeScript spec and rebuild — the generated file is overwritten.
- **Shipping a spec whose types the generator cannot express.** Wrong: a union of object types
  or an optional function parameter. Right: keep specs to the primitives, objects, arrays and
  promises Codegen supports; see [Codegen](codegen.md).

## Related topics

- [Codegen](codegen.md) — what turns the spec into native interfaces.
- [JSI](jsi.md) — the mechanism that makes a native object callable from JavaScript.
- [The New Architecture](new-architecture.md) — where TurboModules sit in the whole.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — the full Kotlin and Swift implementation.
- [When You Need Native Code](../native-modules/when-you-need-native-code.md) — deciding whether to write one at all.
- [JS Thread vs UI Thread](threading-model.md) — what a synchronous call actually blocks.
- [Mocking Native Modules](../testing/mocking-native-modules.md) — testing code that depends on one.
