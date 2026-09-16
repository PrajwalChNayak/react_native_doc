---
title: New Architecture Migration
description: For apps still on 0.81 or earlier — what the old Bridge patterns were, why the architecture flags no longer do anything, and what "migration" actually means now.
status: legacy
toolchain: cli
---

If your app is on React Native 0.81 or earlier and still running the legacy architecture, this page
is the map. If you are already on 0.82 or later, there is nothing to migrate: you are on the New
Architecture whether you asked for it or not, and the work is described in
[0.87 Breaking Changes](breaking-changes-087.md) instead.

> [!LEGACY] This page is full of code that no longer works
> The Bridge, `RCTBridgeModule`, `RCT_EXPORT_METHOD`, `ReactInstanceManager` and the architecture
> flags all appear below. They are here so you can recognise them in your own project and in the
> tutorials you will find while searching. None of it is a pattern to write today.

## The single most important thing to understand

There is no migration switch, because as of React Native 0.82 there is nothing to switch.

| Version | What happened |
| --- | --- |
| 0.76 (Oct 2024) | New Architecture became the **default** |
| 0.81 (Aug 2025) | **Last** version supporting both architectures |
| 0.82 (Oct 2025) | Runs **entirely** on the New Architecture. The flags are **ignored**. Bridgeless by default; the Bridge is **gone** |
| 0.83+ | Legacy architecture classes are being **removed** to cut install size |

So "migrating to the New Architecture" is not a project you plan and execute. It is a consequence of
upgrading past 0.82. The real project is: **upgrade, then fix everything that assumed a Bridge**.

That reframing matters because it changes the order of work. You do not enable a flag, test, and roll
back if something breaks — there is no rollback. You audit your dependencies and your native code
*first*, fix what you can, and only then upgrade.

## The legacy pieces, so you can recognise them

### The architecture flags

```properties title=android/gradle.properties — LEGACY, ignored since 0.82
# These lines did something up to 0.81. From 0.82 they are read and discarded.
newArchEnabled=false
```

```ruby title=ios/Podfile — LEGACY, ignored since 0.82
# Same story on iOS.
ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

If a blog post, a Stack Overflow answer or a library's README tells you to set either of these, it
was written for 0.81 or earlier. Treat the rest of that source as stale too. Setting them today
changes nothing — including, importantly, nothing about the bug you were trying to work around.

### A legacy native module

This is what a native module looked like when there was a Bridge. Objective-C:

```objc title=RCTDeviceInfo.m — LEGACY, does not work in 0.82+
// The bridge macro system: every method registered by name, arguments coerced
// from JSON at runtime, no types anywhere.
#import <React/RCTBridgeModule.h>

@interface RCTDeviceInfo : NSObject <RCTBridgeModule>
@end

@implementation RCTDeviceInfo

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(getFreeDiskBytes:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject)
{
  // A typo in the JS call site produced `undefined is not a function` at runtime.
  resolve(@(1234));
}

@end
```

Kotlin:

```kotlin title=DeviceInfoModule.kt — LEGACY, does not work in 0.82+
// ReactContextBaseJavaModule + @ReactMethod: the Android half of the same model.
class DeviceInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "DeviceInfo"

  @ReactMethod
  fun getFreeDiskBytes(promise: Promise) {
    promise.resolve(1234.0)
  }
}
```

And the JavaScript that called it:

```js title=LEGACY call site
import {NativeModules} from 'react-native';

// NativeModules was a plain object populated at startup. If the module was not
// linked, this was `undefined` and the failure happened at the call, not here.
const {DeviceInfo} = NativeModules;
DeviceInfo.getFreeDiskBytes().then((bytes) => console.log(bytes));
```

Four properties of that model are worth naming, because every difference in the replacement follows
from them: every call was **serialised** to JSON, **asynchronous**, **batched**, and shared **one
queue** with everything else.

### The legacy host objects

```kotlin title=MainApplication.kt — LEGACY
// ReactInstanceManager owned the Bridge and the instance lifecycle.
private val reactNativeHost = object : ReactNativeHost(this) {
  override fun getUseDeveloperSupport() = BuildConfig.DEBUG
  override fun getPackages(): List<ReactPackage> = PackageList(this).packages
}
```

```objc title=AppDelegate.mm — LEGACY
// RCTBridge was the object everything hung off. Libraries took it as a
// constructor argument; there is no equivalent to hand them now.
RCTBridge *bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:launchOptions];
RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:bridge
                                                 moduleName:@"App"
                                          initialProperties:nil];
```

## What replaces each piece

| Legacy | Current |
| --- | --- |
| `RCTBridgeModule` + `RCT_EXPORT_METHOD` | A TypeScript spec plus a Codegen-generated protocol the Swift/ObjC class conforms to |
| `ReactContextBaseJavaModule` + `@ReactMethod` | A TypeScript spec plus a Codegen-generated abstract class the Kotlin class extends |
| `NativeModules.Foo` | `TurboModuleRegistry.getEnforcing<Spec>('Foo')` |
| `RCTViewManager` / `SimpleViewManager` | `codegenNativeComponent` plus a Fabric component |
| `RCTBridge` | `RCTHost` / `RCTReactNativeFactory` |
| `ReactInstanceManager` | `ReactHost`, created by `DefaultReactHost` |
| `UIManagerModule.addUIBlock` | `UIManagerListener`, or View Commands |
| JSON over a queue | JSI — direct, synchronous-capable, typed |

The replacement for a native module, in full:

```ts title=src/specs/NativeDeviceInfo.ts — the current form
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

// The interface IS the contract. Codegen reads it at build time and emits the
// C++, Kotlin and Objective-C declarations the native side must satisfy, so a
// mismatch is a compile error instead of a runtime `undefined`.
export interface Spec extends TurboModule {
  getFreeDiskBytes(): Promise<CodegenTypes.Double>;
  // Synchronous calls are expressible now. Over the Bridge they were not.
  getInstallIdSync(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('DeviceInfo');
```

The end-to-end treatment — spec, generated output, Kotlin, Swift, registration, autolinking and the
typed call site — is in
[TurboModules End to End](../native-modules/turbomodules-end-to-end.md) and
[Fabric Native Components](../native-modules/fabric-native-components.md).

## The interop layers — a shim, not a destination

React Native still ships **interop layers** so that third-party libraries which never migrated can
run. There are two:

- **Module interop** wraps a legacy native module so it is reachable as a TurboModule.
- **View manager interop** wraps a legacy view manager so Fabric can mount its views.

They exist to stop the ecosystem breaking all at once, and they are genuinely useful during an
upgrade. They are not a place to stay, for four reasons:

1. **They cost.** Interop reintroduces a translation step the New Architecture was built to remove:
   extra allocation, extra indirection, and none of the synchronous-call benefit.
2. **They are incomplete.** Legacy view managers wrapped for Fabric do not support everything a real
   Fabric component does, and the gaps show up as subtle layout or event differences rather than as
   clear errors.
3. **They are a transitional mechanism.** Legacy architecture classes have been under removal since
   0.83. What the shim wraps is shrinking.
4. **They hide an unmaintained dependency.** A library that has not shipped Fabric support since 2024
   is telling you something about its maintenance, and the interop layer is what lets you ignore it
   for another year.

Treat a library running through interop as technical debt with a name. Track it, and replace it.
See [Native Dependency Compatibility](native-dependency-compatibility.md) for how to tell which of
your dependencies are in that position.

## The migration, in the order that works

**Step 1 — inventory before you upgrade.** This is the step people skip and regret. On 0.81, while
you still have a working app, list every native dependency and check each one for Fabric and
TurboModule support:

```bash
npm ls --depth=0
npm view <pkg> version peerDependencies
```

For each, look for a `codegenConfig` block in its `package.json` and a spec file in its source. A
package with neither has not migrated. See
[Native Dependency Compatibility](native-dependency-compatibility.md) for the full method.

Sort the results into three piles: **fine**, **needs a version bump**, **needs replacing**. The
third pile is your actual project plan. A library with no maintained successor can block the upgrade
entirely, and you want to know that now rather than three days in.

**Step 2 — inventory your own native code.** Grep for the legacy names:

```bash
grep -rn "RCTBridgeModule\|RCT_EXPORT_METHOD\|RCTViewManager\|RCTBridge" ios/
grep -rn "ReactContextBaseJavaModule\|@ReactMethod\|SimpleViewManager\|ReactInstanceManager" android/
```

Every hit is work. Native modules are usually a day each; view managers are harder, because a Fabric
component is a genuinely different shape rather than a rename.

**Step 3 — migrate your own modules while still on 0.81.** 0.81 supports both architectures, which
makes it the only version where you can write a TurboModule and still run the legacy path if
something goes wrong. Use that. Convert one module, ship it, convert the next.

**Step 4 — upgrade to 0.82 and fix what breaks.** This is where the Bridge disappears. Expect:

- Libraries that took an `RCTBridge` in a constructor to fail at runtime.
- `ReactInstanceManager` references to stop compiling.
- Uncaught promise rejections to start appearing in your logs as `console.error`. They were always
  happening; 0.82 stopped swallowing them. Triage rather than suppress.
- Android Gradle Plugin 9.0.0, with the DSL and Kotlin changes that brings.
- C++ backward-compatibility headers to be gone — include the real path, for example
  `#include <react/bridging/LongLivedObject.h>`.

**Step 5 — remove the flags.** They do nothing. Delete them so nobody spends an afternoon toggling
them during the next incident.

```diff title=android/gradle.properties
-newArchEnabled=false
```

```diff title=ios/Podfile
-ENV['RCT_NEW_ARCH_ENABLED'] = '0'
```

**Step 6 — continue to 0.87, one minor at a time.** See
[The Upgrade Helper Workflow](upgrade-helper-workflow.md). 0.87 brings its own set of changes,
headed by the Strict TypeScript API.

**Step 7 — retire the interop layers.** Revisit the libraries still running through a shim and
replace or upgrade them.

## Platform differences

:::tabs
@tab iOS
The host object changed shape. `RCTBridge` is gone; `RCTHost` and `RCTReactNativeFactory` replace it,
and there is no bridge instance to hand to a library that wants one. Codegen output lands under
`ios/build/generated/ios/`.

Three 0.87-specific iOS items ride along: `#import <React/RCTAppDelegate.h>` replaces the bare form,
and `RCTTurboModuleEnabled()` / `RCTEnableTurboModule()` / `TimingModule` are gone — delete the calls
rather than replacing them.

**All iOS verification requires macOS.** There is no way to check the iOS half of this migration on
Linux or Windows.
@tab Android
`ReactInstanceManager` is replaced by `ReactHost`, created through `DefaultReactHost`. Codegen output
lands under `android/app/build/generated/source/codegen/`.

`UIBlock`, `UIManagerModule.addUIBlock` and `prependUIBlock` were removed in 0.87 — use
`UIManagerListener` or View Commands. The new-architecture-flag constructors on
`DefaultReactActivityDelegate` are gone; construct it without them.

Android can be verified on any operating system, so it is the cheaper half to attempt first.
:::

## Performance considerations

The architecture change moves where your time goes; it does not hand you a faster app for free.

- **Startup improves because of laziness.** TurboModules are constructed on first use, so the gain
  scales with how many linked modules a screen never touches. An app with three native dependencies
  will not notice.
- **Interop gives back part of the win.** A library running through the module interop layer is
  constructed and called through a translation step. If startup matters, the libraries still on the
  shim are the first place to look.
- **The JS thread is still single-threaded.** Removing serialisation did not remove the fact that one
  long synchronous function blocks everything else.
- **Synchronous native calls are cheap individually and ruinous in a loop.** The Bridge made them
  impossible; JSI makes them easy. Each one blocks the JS thread for the duration of the native work.
- **Old benchmarks measure a runtime that no longer exists.** Anything published before 0.76 is
  archaeology. Profile your own app; see
  [Measuring Before Optimising](../performance/measuring-first.md).

## Common mistakes

- **Setting `newArchEnabled=false` to work around a bug.** Wrong: toggling the flag. Right: fix the
  library or the code. The flag has been ignored since 0.82 — the afternoon spent toggling it is
  pure loss.
- **Upgrading first and auditing dependencies afterwards.** Wrong: jumping to 0.87 and then
  discovering a core dependency has no Fabric support and no successor. Right: inventory on 0.81,
  while you still have a working app and a rollback.
- **Migrating native modules after the upgrade rather than before.** Wrong: doing the conversion on
  0.82 with no fallback. Right: convert on 0.81, where both architectures still run and you can
  compare behaviour.
- **Treating interop as "done".** Wrong: shipping with half the dependencies on the shim and closing
  the ticket. Right: list them and plan replacements. The shim wraps classes that are being deleted.
- **Assuming an installing library is a working library.** Wrong: `npm install` succeeded, therefore
  it works. Right: check for `codegenConfig` and a spec. A legacy-only package installs cleanly and
  fails when a view mounts or a method is called.
- **Suppressing the new promise-rejection errors.** Wrong: silencing `console.error`. Right: fix the
  rejections. 0.82 did not create them, it stopped hiding them, and some of them are real bugs that
  have been in production for years.
- **Porting a view manager by renaming the class.** Wrong: expecting `SimpleViewManager` to become a
  Fabric component with a search and replace. Right: write the component spec and let Codegen define
  the interface. The props, events and commands model is genuinely different.

## Related topics

- [The New Architecture](../core-concepts/new-architecture.md) — what the replacement actually is.
- [TurboModules](../core-concepts/turbomodules.md) — the module model in detail.
- [Fabric](../core-concepts/fabric.md) — the renderer and its C++ shadow tree.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — spec to Kotlin to Swift to call site.
- [Fabric Native Components](../native-modules/fabric-native-components.md) — replacing a view manager.
- [Native Dependency Compatibility](native-dependency-compatibility.md) — the inventory step, in detail.
- [The Upgrade Helper Workflow](upgrade-helper-workflow.md) — moving through the minors.
- [0.87 Breaking Changes](breaking-changes-087.md) — what awaits you at the end of the route.
