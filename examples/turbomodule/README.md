# TurboModule example: `react-native-device-metadata`

A complete TurboModule for React Native 0.87, laid out the way a real library is: a Codegen
spec, a Kotlin implementation, a Swift implementation behind an Objective-C++ shim, and the
autolinking metadata a consuming app needs.

Four methods, chosen to cover every shape Codegen has to handle:

| Spec method | Kind | Why it is here |
| --- | --- | --- |
| `getDeviceName(): string` | synchronous | A plain return becomes a blocking JSI call |
| `getTotalMemoryBytes(): number` | synchronous | `number` maps differently per platform |
| `isLowPowerModeEnabled(): Promise<boolean>` | asynchronous | Promise → resolve/reject parameters |
| `setDebugTag(tag: string): void` | fire-and-forget | `void` cannot report failure |

There is **no old-Bridge code anywhere**. No `RCT_EXPORT_METHOD`, no `NativeModules`. Since
0.82 the Bridge is gone and the flags that used to toggle it are ignored, so a library
targeting 0.87 has exactly one shape.

## The whole path, in order

### 1. The spec — `src/specs/NativeDeviceMetadata.ts`

This file is the contract. Everything else is derived from it. Codegen enforces four rules:
the filename starts with `Native`, the interface is named exactly `Spec`, it extends
`TurboModule`, and the file contains exactly one `TurboModuleRegistry.getEnforcing<Spec>('…')`
call with a string literal. That literal — `DeviceMetadata` — is the name the native side
registers under.

Both imports come from the `react-native` root. Under the 0.87 Strict TypeScript API a deep
import such as `react-native/Libraries/TurboModule/RCTExport` is a **type error**, because the
package's `exports` map sets `"types": null` for `./Libraries/*`.

### 2. What Codegen generates, and where

Codegen runs at **build** time on both platforms. It never runs at runtime, and there is no
task to invoke by hand in a normal build.

| Platform | Output |
| --- | --- |
| Android | `android/build/generated/source/codegen/java/com/devicemetadata/` — an abstract `NativeDeviceMetadataSpec` class |
| iOS | `RNDeviceMetadataSpec/` under the Pods build output — a protocol plus a C++ `NativeDeviceMetadataSpecJSI` class |

> [!NOTE]
> The exact iOS output path depends on your Pods layout and CocoaPods version. Build the app
> once and look for `RNDeviceMetadataSpec` under `ios/build/generated/ios/` or inside
> `ios/Pods/`. This has moved between releases; check yours rather than trusting a path from a
> blog post.

The `codegenConfig` block in `package.json` drives it:

```json title=package.json
"codegenConfig": {
  "name": "RNDeviceMetadataSpec",
  "type": "modules",
  "jsSrcsDir": "src",
  "android": { "javaPackageName": "com.devicemetadata" }
}
```

`javaPackageName` must match the Kotlin `package` declarations and the `namespace` in
`android/build.gradle`, or the generated spec lands in a package your sources cannot see.

### 3. Kotlin — `android/src/main/java/com/devicemetadata/DeviceMetadataModule.kt`

Extends the generated abstract class. Because the base class is abstract and already carries
the `@ReactMethod` annotations, a signature that drifts from the spec is a **Kotlin compile
error** rather than a runtime surprise — and you never write `@ReactMethod` yourself.

### 4. Swift — `ios/RNDeviceMetadata.swift` plus `ios/RNDeviceMetadata.mm`

Swift cannot adopt the generated protocol directly: it is declared in a C++ header, and only
Objective-C++ can import it. So the shape is plain Swift for the behaviour, and a thin `.mm`
shim that conforms to `NativeDeviceMetadataSpec` and forwards.

That shim is not ceremony you can skip. `getTurboModule:` in it is the New Architecture entry
point — it hands the runtime the generated C++ class, which is what makes calls from JS direct
JSI calls.

### 5. Registration — `DeviceMetadataPackage.kt`

`BaseReactPackage` is the New Architecture shape: a lookup by name plus a metadata provider,
instead of eagerly building every module. That is what makes TurboModules lazy — the module is
constructed the first time JavaScript asks for it.

`isTurboModule = true` in the `ReactModuleInfo` is load-bearing. With it `false` the module is
invisible to `TurboModuleRegistry` and `getEnforcing` throws at startup.

### 6. Autolinking — `react-native.config.js`

The CLI would discover this library anyway (an `android/` with a `build.gradle`, an `ios/` with
a `.podspec`). The file states the locations explicitly so a directory rename is a one-line
change rather than a silent "module not found".

On iOS, `install_modules_dependencies(s)` in the podspec is what wires the library into the New
Architecture — React-Core, the C++ standard, header search paths, and the Codegen build phase.

### 7. Calling it — `src/index.ts`

Apps import the wrapper, not the spec. That leaves room for validation, caching or a JS-side
fallback without touching every call site, and keeps the spec free of anything Codegen cannot
parse.

```ts
import {getDeviceName, getTotalMemoryMiB, isLowPowerModeEnabled} from 'react-native-device-metadata';

const name = getDeviceName();              // string
const ram = getTotalMemoryMiB();           // number
const saving = await isLowPowerModeEnabled(); // boolean
```

## Consuming it from an app

```bash
npx @react-native-community/cli@20.2.0 init MetadataDemo --version 0.87.1
cd MetadataDemo
npm install /path/to/examples/turbomodule
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

Autolinking picks the library up; there is nothing to register by hand.

## Platform differences worth knowing

| | Android | iOS |
| --- | --- | --- |
| `number` return | `double` | `NSNumber *` |
| `number` parameter | `double` | `double` |
| Promise | trailing `Promise promise` | `RCTPromiseResolveBlock` + `RCTPromiseRejectBlock` |
| Low-power meaning | `PowerManager.isPowerSaveMode` — can change while running | `ProcessInfo.isLowPowerModeEnabled` — the user's explicit toggle |

The last row is why `isLowPowerModeEnabled` is documented as a **hint**: the two platforms do
not mean quite the same thing by it.

## Verify

```bash
npm run typecheck
```

Passes on Node 22.13.0 or newer — the spec and the wrapper compile against real
`react-native@0.87.1` types with the Strict API active, which is what proves the spec is
well-formed TypeScript and the wrapper matches it.

> [!WARNING] What was NOT verified here
> The Kotlin and Swift sources have **not been compiled**. This example was authored on
> Windows, which has no Xcode and no wired-up Gradle project, so only the TypeScript half is
> machine-checked. The native sources follow the documented 0.87 shapes and the generated names
> are derived by the documented rules, but treat them as needing a real build before you depend
> on them — particularly the generated header paths, which have moved between releases.

## Related reading

- [TurboModules End to End](../../content/native-modules/turbomodules-end-to-end.md)
- [Codegen and Spec Files](../../content/native-modules/codegen-specs.md)
- [Writing a Module in Kotlin](../../content/native-modules/writing-a-module-in-kotlin.md)
- [Writing a Module in Swift](../../content/native-modules/writing-a-module-in-swift.md)
- [Autolinking and react-native.config.js](../../content/native-modules/autolinking.md)
