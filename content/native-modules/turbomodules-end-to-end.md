---
title: TurboModules End to End
description: The complete path for a native module in React Native 0.87 — spec file, Codegen, Kotlin, Swift, registration, autolinking and the TypeScript call site.
status: current
toolchain: cli
---

This page builds one real TurboModule from an empty folder to a typed call site, with nothing
skipped. The example is a calendar module: it reads a constant, creates an event
asynchronously, reports a queue depth synchronously, and toggles a setting.

Everything here is React Native 0.87 on the New Architecture. There is no Bridge to register
against, no macro to export a method, and no runtime name lookup — the spec file is the
contract and the compiler on each platform enforces it.

## Why the whole path matters

A TurboModule is not one file. It is a spec, generated code, two platform implementations, two
registrations and a build configuration that ties them together. Tutorials that show you the
Kotlin class and stop are the reason most first attempts fail at link time rather than at
compile time.

The seven steps below are in dependency order. Doing them out of order is the single most
common way to waste an afternoon, because step 3 and step 4 both consume output produced by
step 2.

| Step | Artefact | Who writes it |
| --- | --- | --- |
| 1 | `src/specs/NativeCalendar.ts` | You |
| 2 | `NativeCalendarSpec` (Java) / `NativeCalendarSpec` (ObjC protocol) | Codegen |
| 3 | `CalendarModule.kt` | You |
| 4 | `Calendar.swift` + `RCTCalendar.mm` | You |
| 5 | `CalendarPackage.kt` / `codegenConfig.ios.modules` | You |
| 6 | `react-native.config.js`, autolinking | Mostly the CLI |
| 7 | The call site | You |

> [!TIP] Get the build green before you write logic
> Implement every method as a stub that throws, run both builds, and only then write the real
> code. Almost all of the difficulty in a native module is in the build graph, and a stub
> isolates that difficulty from your logic.

## Step 1 — the spec file

The spec is ordinary TypeScript in your app. Codegen finds it by convention: it lives under
the directory named in `codegenConfig.jsSrcsDir`, and its filename starts with `Native`.

The filename is load-bearing. `NativeCalendar.ts` produces a generated class called
`NativeCalendarSpec` on both platforms. Rename the file and every generated name changes with
it.

```ts title=src/specs/NativeCalendar.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule, CodegenTypes} from 'react-native';

// Object types used in the spec must be declared as types, not interfaces, and
// must be closed shapes. Codegen turns this into a struct on both platforms.
export type CalendarEvent = Readonly<{
  id: string;
  title: string;
  startsAt: CodegenTypes.Double;
  isAllDay: boolean;
}>;

export interface Spec extends TurboModule {
  // Constants are read once when the module is constructed, so this is
  // available without a method call and without crossing asynchronously.
  readonly getConstants: () => {defaultCalendarName: string};

  // Promise-returning. The permission prompt and the calendar write both
  // happen off the JS thread.
  createEvent(title: string, startsAt: CodegenTypes.Double): Promise<string>;

  // Returns a value already held in native memory, so a synchronous call is
  // defensible here. Int32 tells the generator to emit `int`, not `double`.
  getPendingCount(): CodegenTypes.Int32;

  // Fire and forget.
  setSyncEnabled(enabled: boolean): void;

  listEvents(from: CodegenTypes.Double): Promise<ReadonlyArray<CalendarEvent>>;
}

// The string is the name the native side registers under. getEnforcing throws
// with that name in the message if the module is not linked; `get` returns null.
export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalendar');
```

`TurboModule` and `CodegenTypes` are both type-only exports of `react-native`, and
`TurboModuleRegistry` is a value export. Under the Strict TypeScript API that is the only
import path that type-checks — a deep import into the package's internal `Libraries` folder is
a compile error in 0.87.

## Step 2 — Codegen, and where its output lands

### Telling the build about your specs

```json title=package.json
{
  "name": "AwesomeProject",
  "codegenConfig": {
    "name": "AppSpecs",
    "type": "all",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.awesomeproject.specs"
    },
    "ios": {
      "modules": {
        "NativeCalendar": {
          "className": "RCTCalendar"
        }
      }
    }
  }
}
```

Every field here is read by the build, and the names are exact:

| Field | Meaning |
| --- | --- |
| `name` | The generated library name. It becomes the iOS header directory and the C++ namespace folder. |
| `type` | `"modules"`, `"components"` or `"all"`. `"all"` runs both sets of generators. |
| `jsSrcsDir` | Directory scanned recursively for spec files, relative to this `package.json`. |
| `android.javaPackageName` | Java package for the generated module spec classes. |
| `ios.modules` | Maps each module name to the Objective-C class that implements it. |

> [!NOTE] `ios.modulesProvider` is the older spelling
> React Native 0.87 accepts both `ios.modules` (an object per module, with a `className` key)
> and the older flat `ios.modulesProvider` map. New code should use `ios.modules`; if you read
> a tutorial or a library that uses `modulesProvider`, it is not broken, just older.

### What is generated, and where

:::tabs
@tab Android
Gradle runs two tasks: one that produces `schema.json`, and one that runs
`scripts/generate-specs-cli.js` over it. Output goes under the module's build directory:

```text
android/app/build/generated/source/codegen/
├── schema.json
├── java/
│   └── com/awesomeproject/specs/
│       └── NativeCalendarSpec.java        ← abstract class you extend
└── jni/
    ├── AppSpecs.h
    ├── AppSpecs-generated.cpp
    └── CMakeLists.txt
```

`java/` is added to the Android source set by the React Native Gradle plugin, so the class is
on your compile classpath without any `sourceSets` edit of your own.

`NativeCalendarSpec` is an abstract Java class that extends `ReactContextBaseJavaModule` and
implements the `TurboModule` marker interface. It carries a `public static final String NAME`
holding the JavaScript-facing name, and one abstract method per spec method.
@tab iOS
Generation is driven by the `ReactCodegen` pod's build script phase. Output goes under the
iOS project directory:

```text
ios/build/generated/ios/
├── AppSpecs/
│   ├── AppSpecs.h                 ← @protocol NativeCalendarSpec lives here
│   └── AppSpecs-generated.mm      ← the C++/ObjC glue, compiled for you
├── RCTModuleProviders.h
├── RCTModuleProviders.mm          ← built from codegenConfig.ios.modules
└── RCTAppDependencyProvider.h/.mm
```

The header is named after `codegenConfig.name`, so you import it as
`#import <AppSpecs/AppSpecs.h>`. Inside it, Codegen declares an Objective-C protocol
`NativeCalendarSpec` and a C++ class `facebook::react::NativeCalendarSpecJSI` that carries the
JSI bindings.
:::

Both directories are build output. Add them to `.gitignore`, never edit them, and read them
freely — the generated signature is the authoritative answer to "what am I supposed to
implement".

> [!WARNING] Codegen runs in the native build, not in Metro
> Editing a spec and pressing reload changes nothing. Run `npm run android` / `npm run ios`
> again. A method that is `undefined` right after you added it to the spec is almost always a
> missing native rebuild.

## Step 3 — the Kotlin implementation

Kotlin extends the generated abstract class directly. There is no shim, because the generated
artefact is a JVM class and Kotlin is a JVM language.

```kotlin title=android/app/src/main/java/com/awesomeproject/calendar/CalendarModule.kt
package com.awesomeproject.calendar

import com.awesomeproject.specs.NativeCalendarSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray

class CalendarModule(reactContext: ReactApplicationContext) :
    NativeCalendarSpec(reactContext) {

  // The real work lives in a plain class with no React Native types in it, so
  // it can be unit-tested with JUnit and survives an architecture change.
  private val store = CalendarStore(reactContext)

  override fun getName(): String = NAME

  override fun getTypedExportedConstants(): Map<String, Any> =
      mapOf("defaultCalendarName" to store.defaultCalendarName)

  override fun createEvent(title: String, startsAt: Double, promise: Promise) {
    // The generated signature appends a Promise parameter for every spec method
    // that returns Promise<T>. Rejecting with a stable code lets JavaScript
    // branch on the failure instead of string-matching a message.
    store.createEvent(title, startsAt) { result ->
      result
          .onSuccess { id -> promise.resolve(id) }
          .onFailure { error -> promise.reject("E_CALENDAR_WRITE", error.message, error) }
    }
  }

  override fun getPendingCount(): Double = store.pendingCount.toDouble()

  override fun setSyncEnabled(enabled: Boolean) {
    store.syncEnabled = enabled
  }

  override fun listEvents(from: Double, promise: Promise) {
    store.listEvents(from) { events ->
      val array: WritableArray = Arguments.createArray()
      events.forEach { event ->
        val map = Arguments.createMap()
        map.putString("id", event.id)
        map.putString("title", event.title)
        map.putDouble("startsAt", event.startsAt)
        map.putBoolean("isAllDay", event.isAllDay)
        array.pushMap(map)
      }
      promise.resolve(array)
    }
  }

  companion object {
    // NativeCalendarSpec also declares NAME; keeping a companion copy lets the
    // package class reference it without constructing the module.
    const val NAME: String = NativeCalendarSpec.NAME
  }
}
```

Two details that surprise people:

- **`CodegenTypes.Int32` still arrives as `Double` in Kotlin.** The generated Java signature for
  a numeric return is `double`. `Int32` changes the C++ and Objective-C types, not the JVM one.
  Check the generated file rather than assuming.
- **`getConstants` becomes `getTypedExportedConstants`.** When a spec declares constants,
  Codegen emits a `final getConstants()` that validates your map against the declared keys and
  calls an abstract `getTypedExportedConstants()`. You override the second one.

> [!NOTE] Confirm the generated member names against your version
> `NAME`, `getTypedExportedConstants()` and the appended `Promise` parameter are what
> React Native 0.87's generator emits. If you are on a different minor version, open
> `android/app/build/generated/source/codegen/java/.../NativeCalendarSpec.java` and match that
> file exactly — it is regenerated on every build and is always right.

## Step 4 — the iOS implementation

### Why there is an Objective-C++ file

The generated iOS artefact is an Objective-C protocol whose methods take C++ types, plus a C++
class in namespace `facebook::react`. Swift cannot adopt that protocol: Swift has no way to
express the `std::shared_ptr<facebook::react::TurboModule>` return type of the
`getTurboModule:` requirement, and the header cannot be imported into Swift because it is C++.

So the layering is fixed, and it is not optional:

1. **Swift** holds your logic. It knows nothing about React Native.
2. **An Objective-C++ `.mm` class** adopts the generated protocol, implements
   `getTurboModule:` by handing back the generated JSI class, and forwards each method to the
   Swift object.
3. Xcode's generated `<YourApp>-Swift.h` header is what lets the `.mm` file see the Swift class.

That third point is why the Swift class must inherit from `NSObject` and why its members need
`@objc` exposure: `<YourApp>-Swift.h` only contains the Objective-C-visible surface.

### The Swift class

```swift title=ios/AwesomeProject/Calendar.swift
import EventKit
import Foundation

// NSObject inheritance and @objcMembers are what put this class into the
// generated <AwesomeProject>-Swift.h header that the .mm file imports.
@objcMembers
public class Calendar: NSObject {
  private let store = EKEventStore()

  public var defaultCalendarName: String {
    store.defaultCalendarForNewEvents?.title ?? ""
  }

  public var pendingCount: Int {
    // Already in memory, which is why the spec may expose it synchronously.
    store.pendingWriteCount
  }

  public func createEvent(
    title: String,
    startsAt: Double,
    onSuccess: @escaping (String) -> Void,
    onFailure: @escaping (String) -> Void
  ) {
    // Closure parameters rather than a Swift Result, because the .mm layer has
    // to translate this into a promise resolve/reject pair anyway.
    store.requestWriteOnlyAccessToEvents { granted, error in
      guard granted, error == nil else {
        onFailure(error?.localizedDescription ?? "Calendar access denied")
        return
      }
      // ... create and save the EKEvent, then:
      onSuccess("event-identifier")
    }
  }

  public func setSyncEnabled(_ enabled: Bool) {
    store.syncEnabled = enabled
  }
}
```

### The Objective-C++ wrapper

```objc title=ios/AwesomeProject/RCTCalendar.h
#import <AppSpecs/AppSpecs.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// NativeCalendarSpec is the protocol Codegen wrote into AppSpecs.h.
@interface RCTCalendar : NSObject <NativeCalendarSpec>
@end

NS_ASSUME_NONNULL_END
```

```objc title=ios/AwesomeProject/RCTCalendar.mm
#import "RCTCalendar.h"
// Xcode generates this header from the app target's Swift files. The name is
// <PRODUCT_MODULE_NAME>-Swift.h, so it changes if you rename the target.
#import "AwesomeProject-Swift.h"

@implementation RCTCalendar {
  Calendar *_calendar;
}

- (instancetype)init
{
  if (self = [super init]) {
    _calendar = [Calendar new];
  }
  return self;
}

// This is the only genuinely C++ method. It hands the runtime the generated
// JSI class, which is what actually installs the methods on the JS object.
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeCalendarSpecJSI>(params);
}

// The name JavaScript asks for. No export macro is involved.
+ (NSString *)moduleName
{
  return @"NativeCalendar";
}

- (NSDictionary *)getConstants
{
  return @{@"defaultCalendarName" : _calendar.defaultCalendarName};
}

- (void)createEvent:(NSString *)title
           startsAt:(double)startsAt
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  [_calendar createEventWithTitle:title
                         startsAt:startsAt
                        onSuccess:^(NSString *identifier) { resolve(identifier); }
                        onFailure:^(NSString *message) {
                          reject(@"E_CALENDAR_WRITE", message, nil);
                        }];
}

- (NSNumber *)getPendingCount
{
  return @(_calendar.pendingCount);
}

- (void)setSyncEnabled:(BOOL)enabled
{
  [_calendar setSyncEnabled:enabled];
}

@end
```

> [!NOTE] Check the generated selectors, not this page
> The exact Objective-C selectors — argument labels, whether a promise method takes
> `resolve:reject:`, the return type chosen for a numeric value — are emitted by Codegen from
> your spec. Open `ios/build/generated/ios/AppSpecs/AppSpecs.h` and copy the protocol
> declarations into your implementation. If your React Native version differs from 0.87, that
> file is the authority and this page is not.

One more constraint, and it bites late: **keep C++ out of your `AppDelegate` header.** If a
header that the Swift bridging header imports transitively pulls in C++, the Swift compiler
fails on it. Keep the `.mm` files self-contained and import them only from other `.mm` files.

If you would rather not write the wrapper at all, you can implement the module directly in
Objective-C++ — drop the Swift file and put the logic in `RCTCalendar.mm`. The trade is fewer
moving parts against writing your platform code in Objective-C++.

## Step 5 — registration

:::tabs
@tab Android
Android needs a `ReactPackage` that can answer two questions without constructing anything:
"do you have a module called X?" and "what are its properties?". `BaseReactPackage` is the
current base class for that.

```kotlin title=android/app/src/main/java/com/awesomeproject/calendar/CalendarPackage.kt
package com.awesomeproject.calendar

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class CalendarPackage : BaseReactPackage() {

  // Called lazily, the first time JavaScript asks for this module by name.
  override fun getModule(
      name: String,
      reactContext: ReactApplicationContext,
  ): NativeModule? =
      if (name == CalendarModule.NAME) CalendarModule(reactContext) else null

  // Metadata only. The registry uses this to know the module exists without
  // instantiating it, which is where the startup win comes from.
  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
      ReactModuleInfoProvider {
        mapOf(
            CalendarModule.NAME to
                ReactModuleInfo(
                    name = CalendarModule.NAME,
                    className = CalendarModule.NAME,
                    canOverrideExistingModule = false,
                    needsEagerInit = false,
                    isCxxModule = false,
                    isTurboModule = true,
                )
        )
      }
}
```

An app registers its own package by hand in `MainApplication.kt`:

```kotlin title=android/app/src/main/java/com/awesomeproject/MainApplication.kt
override fun getPackages(): List<ReactPackage> =
    // PackageList is generated by autolinking; add only your own packages.
    PackageList(this).packages.apply { add(CalendarPackage()) }
```

`TurboReactPackage` still exists but is deprecated in favour of `BaseReactPackage`; it is now
an empty subclass of it.
@tab iOS
iOS has no package class. The `codegenConfig.ios.modules` entry from step 2 is the whole
registration: Codegen writes `RCTModuleProviders.mm` with a dictionary mapping
`@"NativeCalendar"` to `@"RCTCalendar"`, and the runtime looks the class up by name and asks
it for a TurboModule.

```json title=package.json (the part that registers the module)
"ios": {
  "modules": {
    "NativeCalendar": {
      "className": "RCTCalendar"
    }
  }
}
```

That generated provider is reached through `RCTAppDependencyProvider`, which the app's
`AppDelegate` already installs in a project created by the Community CLI:

```swift title=ios/AwesomeProject/AppDelegate.swift (the line that matters)
// dependencyProvider is a property of RCTReactNativeFactoryDelegate. The
// template assigns it before creating the root view; you do not add anything.
delegate.dependencyProvider = RCTAppDependencyProvider()
```

> [!NOTE] The surrounding `AppDelegate` is template code, not API
> The exact shape of `AppDelegate.swift` — the factory, the delegate subclass, the
> `application(_:didFinishLaunchingWithOptions:)` body — is owned by the Community CLI template
> and changes between versions. Compare against a freshly generated 0.87 project rather than
> copying an `AppDelegate` from a tutorial.

If you leave `ios.modules` out, nothing registers your class, `getEnforcing` throws at first
use, and the Kotlin half will keep working — which is exactly the confusing asymmetry that
makes people blame the spec.
:::

## Step 6 — autolinking

Inside your own app, the steps above are all there is: your `codegenConfig` is read from the
app's `package.json`, and you added the package to `MainApplication.kt` yourself.

When the module lives in a **separate package** that other apps install, autolinking removes
every one of those manual steps for the consumer. The CLI scans dependencies, finds the ones
that look like React Native libraries, and feeds them into both builds.

```js title=react-native.config.js (in the library, only if the defaults are wrong)
module.exports = {
  dependency: {
    platforms: {
      android: {
        // Defaults are derived from the folder layout and from the class that
        // implements ReactPackage. Override only what is genuinely different.
        sourceDir: './android',
        packageImportPath: 'import com.awesomeproject.calendar.CalendarPackage;',
        packageInstance: 'new CalendarPackage()',
      },
    },
  },
};
```

What the consumer gets without doing anything:

- The library's `codegenConfig` is discovered, so their build generates the specs.
- `PackageList` includes `CalendarPackage`, so the Android module is registered.
- The library's podspec is picked up by `use_native_modules!` in their `Podfile`.
- The library's `ios.modules` entry is merged into their `RCTModuleProviders.mm`.

The full set of keys, how to link a library that is not in `node_modules`, and how to turn
autolinking off for one platform are covered in
[Autolinking and react-native.config.js](autolinking.md).

## Step 7 — calling it from TypeScript

The spec file is already a module. Import it and the types are the ones you declared.

In practice, do not export the generated object directly to the rest of your app. Wrap it. The
spec has to stay simple enough for Codegen to parse, and the wrapper is where richer types,
defaults, validation and error mapping belong.

```ts-fragment title=src/calendar/index.ts
import NativeCalendar from '../specs/NativeCalendar';
import type {CalendarEvent} from '../specs/NativeCalendar';

export type {CalendarEvent};

export class CalendarWriteError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CalendarWriteError';
  }
}

// The spec takes a millisecond number because Codegen has no Date type. The
// wrapper is where the app-facing API gets to use Date.
export async function createEvent(title: string, startsAt: Date): Promise<string> {
  try {
    return await NativeCalendar.createEvent(title, startsAt.getTime());
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as {code: unknown}).code)
        : 'E_UNKNOWN';
    throw new CalendarWriteError(code, String(error));
  }
}

export function getDefaultCalendarName(): string {
  return NativeCalendar.getConstants().defaultCalendarName;
}

export function getPendingCount(): number {
  return NativeCalendar.getPendingCount();
}
```

And the call site, which is the point of all of it:

```tsx-fragment title=src/screens/NewEventScreen.tsx
import {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {createEvent, getDefaultCalendarName} from '../calendar';

export function NewEventScreen() {
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setError(null);
    try {
      // Awaited, so the JS thread is free while iOS shows its permission sheet.
      setSaved(await createEvent(title, new Date()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  }, [title]);

  return (
    <View style={styles.wrap}>
      <Text>Saving to {getDefaultCalendarName()}</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} />
      <Pressable onPress={save} accessibilityRole="button">
        <Text>Save</Text>
      </Pressable>
      {saved != null ? <Text>Created {saved}</Text> : null}
      {error != null ? <Text>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12, padding: 16},
  input: {borderWidth: 1, padding: 8},
});
```

## Platform differences

:::tabs
@tab Android
- The generated spec is a **class**, so `override` is checked by the Kotlin compiler and a
  missing method is a build failure with the method name in it.
- Registration is code you write: a `BaseReactPackage` plus an entry in `MainApplication.kt`.
- Numeric returns are `double` regardless of whether the spec said `Int32`.
- Optional spec parameters become nullable Kotlin parameters, so the compiler forces you to
  handle the null case.
@tab iOS
- The generated spec is a **protocol**, so a missing method is a warning by default rather than
  an error. Turn on "Treat incomplete protocol conformance as error" if you want parity.
- Registration is configuration: a `codegenConfig.ios.modules` entry, no code.
- Swift needs the Objective-C++ wrapper described in step 4. Budget for it.
- CocoaPods is the default. Swift Package Manager is **Experimental** in 0.87 and opt-in.
:::

## Common patterns

**One coarse call beats six fine ones.** `listEvents()` returning an array of records is
cheaper and easier to keep in sync than `getEventCount()` plus `getEventAt(i)`. Each call
converts its arguments and its result.

**Keep React Native types out of your logic class.** `CalendarStore` and `Calendar.swift` above
take and return plain platform types. That class is testable with JUnit and XCTest, and it does
not have to be rewritten when the module layer changes.

**Reject with a stable code.** `promise.reject("E_CALENDAR_WRITE", ...)` on Android and
`reject(@"E_CALENDAR_WRITE", ...)` on iOS give JavaScript something to branch on. A message
string is for humans and will be translated or reworded.

**Return `null` for "not available here"** by using `TurboModuleRegistry.get` instead of
`getEnforcing` for a module that genuinely only exists on one platform, and check before use.
Do not ship a spec whose methods throw on the other platform.

## Performance considerations

A TurboModule is constructed the first time JavaScript touches it, not at startup. That makes
the cost of *registering* a module you never call negligible, and it makes a heavy constructor
a mid-interaction stall rather than a startup cost. Initialise lazily inside the module.

`getPendingCount()` is synchronous, which means the JavaScript thread stops until Kotlin or
Swift returns. That is correct for a counter already in memory and wrong for anything that
touches disk, the network, or a system dialog. The rule is not "avoid sync" but "sync only for
work that is already done".

Argument conversion is real work. Passing a 2 MB string or a thousand-element array through a
module method costs proportionally to its size on both sides of the call. If a value changes
every frame, it belongs in a Fabric component's props, not in a module method called from an
animation loop.

## Security considerations

**Threat.** An attacker with your APK or IPA wants whatever your module talks to — an API key,
a signing secret, a backend URL that is not meant to be public.

**Exploit.** Compiling a constant into Kotlin or Swift does not hide it. Both of these read it
straight out of a release build:

```bash
unzip -o app-release.apk -d apk-out
strings apk-out/classes.dex | grep -i "sk_live"
strings apk-out/lib/arm64-v8a/*.so | grep -i "api[_-]\?key"
```

```bash
unzip -o AwesomeProject.ipa -d ipa-out
strings ipa-out/Payload/AwesomeProject.app/AwesomeProject | grep -i "api[_-]\?key"
```

**Fix.** Do not put the secret in the module. Have the module exchange a user credential for a
short-lived token against a server you control, and store the token in Keychain or the Android
Keystore. Where the module needs a permission, request the narrowest one that works and declare
it in the library's own manifest or `Info.plist` so a consumer can see it.

**Verification.** Run both commands above against your own release build before shipping.
Repeat with R8 enabled, and notice that the string is still there — shrinking and renaming are
not encryption.

## Common mistakes

- **Writing the Kotlin class before the spec.** Wrong: implement `CalendarModule` first, then
  write a spec to match. Right: spec, build, then implement against the generated class. Code
  written before Codegen has run will not match what it emits.
- **Renaming the spec file and nothing else.** Wrong: rename `NativeCalendar.ts` to
  `CalendarSpec.ts` and keep extending `NativeCalendarSpec`. Right: the filename determines the
  generated class name, so rename both — and remember Codegen only picks up files whose names
  start with `Native`.
- **Forgetting `codegenConfig.ios.modules`.** Wrong: the Android half works, iOS throws
  "NativeCalendar could not be found" and you go looking at the spec. Right: the iOS
  registration is a `package.json` entry, and it is easy to leave out because Android does not
  need one.
- **Expecting Swift to conform to the generated protocol.** Wrong: `class Calendar: NSObject,
  NativeCalendarSpec`. Right: an Objective-C++ class conforms, and forwards to Swift. The
  protocol has a C++ return type that Swift cannot express.
- **Putting C++ in a header the bridging header can reach.** Wrong: importing a generated spec
  header from `AppDelegate.h`. Right: keep it in `.mm` files. The Swift compiler cannot parse
  C++ and the error it produces will not mention C++.
- **Making everything synchronous because the call site is tidier.** Wrong: `getAllEventsSync()`
  that queries the calendar database. Right: return a `Promise`. A synchronous method blocks
  every frame until it returns.
- **Reloading JavaScript after a spec change.** Wrong: Fast Refresh, then puzzling over an
  `undefined` method. Right: rebuild the native app. Codegen runs in the native build.

## Related topics

- [When You Need Native Code](when-you-need-native-code.md) — deciding whether to write this at all.
- [Codegen and Spec Files](codegen-specs.md) — every type the spec parser accepts, and what it emits.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — the Android half in depth.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the iOS half, including the bridging layer.
- [Fabric Native Components](fabric-native-components.md) — the same end-to-end path for a view.
- [Autolinking and react-native.config.js](autolinking.md) — how a consumer gets the module for free.
- [Publishing a Native Library](publishing-a-native-library.md) — turning this into a package.
- [Debugging Native Code](debugging-native-code.md) — when the build is green and it still does not work.
- [TurboModules](../core-concepts/turbomodules.md) — the runtime mechanics behind this page.
