---
title: Platform Folders
description: What android/ and ios/ actually contain in a 0.87 project, which files are yours to edit and which are build output, and how Metro resolves .ios.tsx / .android.tsx.
status: current
toolchain: cli
---

A project created by the Community CLI checks the whole Android project and the whole Xcode
project into your repository. That is the single biggest difference between this path and a
managed one: nothing regenerates `android/` or `ios/` for you, so every file in them is yours —
including the ones you should never touch.

This page is a map. It says what each file is, whether editing it is normal or a mistake, and
where the equivalent knob lives on the other platform. It then covers the JavaScript-side half of
the same idea: `.ios.tsx` / `.android.tsx` files and how Metro picks between them.

## Why the folders are checked in — and what it costs

Checking in the native projects buys you three things: you can add a native dependency that needs
a Gradle or Xcode change, you can write your own native code without ejecting from anything, and
what you build locally is what CI builds.

The cost is that upgrades touch files you have edited. React Native ships template changes in
every minor version — a new AGP property, a changed `AppDelegate`, a different Podfile helper —
and those land in files that also contain your own edits. That is what the
[Upgrade Helper](../migration/upgrade-helper-workflow.md) exists to diff.

The practical rule that follows: **make the smallest native edit that works, and leave a comment
saying why.** A three-line diff against the template is easy to reapply. A rewritten
`MainApplication.kt` is not.

## What `android/` contains

The tree below is the 0.87 Community CLI template, read from the template repository rather than
from memory.

```text title=android/
android/
├── app/
│   ├── build.gradle                     App module: SDK levels, variants, signing, the react { } block
│   ├── debug.keystore                   The shared debug key. Checked in on purpose
│   ├── proguard-rules.pro               Your R8 keep rules
│   └── src/main/
│       ├── AndroidManifest.xml          Permissions, the launcher activity, intent filters
│       ├── java/com/<yourapp>/
│       │   ├── MainActivity.kt          The single Activity that hosts React
│       │   └── MainApplication.kt       ReactApplication wiring and the package list
│       └── res/
│           ├── drawable/                Vector and bitmap drawables
│           ├── mipmap-*/                Launcher icons, one folder per density
│           └── values/
│               ├── strings.xml          app_name and other strings
│               └── styles.xml           AppTheme
├── build.gradle                         Root project: repositories and the plugin classpath
├── gradle.properties                    JVM args, architectures, AGP opt-outs
├── gradle/wrapper/                      gradle-wrapper.jar and .properties — the Gradle version
├── gradlew, gradlew.bat                 The wrapper scripts. Always build through these
└── settings.gradle                      Autolinking and includeBuild of the RN Gradle plugin
```

### Which of those you actually edit

| File | Edit it? | What you edit it for |
| --- | --- | --- |
| `app/build.gradle` | Often | `applicationId`, `versionCode`/`versionName`, flavours, signing configs, `minifyEnabled` |
| `app/src/main/AndroidManifest.xml` | Often | Permissions, intent filters for deep links, `android:exported`, service declarations |
| `app/src/main/res/**` | Often | Icons, splash theme, strings, colours |
| `app/proguard-rules.pro` | Sometimes | Keep rules for a library R8 stripped |
| `gradle.properties` | Sometimes | JVM heap, `reactNativeArchitectures`, the AGP 9 opt-outs |
| `MainApplication.kt` | Rarely | Registering a `ReactPackage` you wrote yourself |
| `MainActivity.kt` | Rarely | `getMainComponentName()`, a custom `ReactActivityDelegate` |
| `build.gradle` (root) | Rarely | Adding a Maven repository a native dependency needs |
| `settings.gradle` | Almost never | It is autolinking wiring; the CLI owns its shape |
| `gradle/wrapper/*` | Via `./gradlew wrapper` | Never hand-edit the jar |
| `debug.keystore` | Never | Shared on purpose so every developer's debug build has the same signature |
| `android/build/`, `app/build/` | Never | Build output, including generated autolinking files |

`android/gradle.properties` is committed, which is exactly why credentials must not go in it —
see [Android Signing](../build-and-release/android-signing.md). The two properties worth knowing
in 0.87 are the AGP 9 opt-outs:

```properties title=android/gradle.properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

> [!NOTE] `newArchEnabled` in the template is vestigial
> The generated `gradle.properties` still carries a `newArchEnabled` line. Since 0.82 the value is
> ignored — the New Architecture is the only architecture. Leaving it alone is fine; changing it
> does nothing. See [New Architecture Migration](../migration/new-architecture-migration.md).

### The generated folders inside `android/`

Everything under a `build/` directory is output. Two of those paths are worth knowing by name
because you will read them while debugging:

| Path | What it is |
| --- | --- |
| `android/build/generated/autolinking/autolinking.json` | The cached CLI config autolinking ran on |
| `android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java` | The registered `ReactPackage` list |
| `android/app/build/generated/source/codegen/` | Codegen output for this app's specs |
| `android/app/build/outputs/` | The APKs and AABs |

Reading them is normal. Editing them is not — they are rewritten on every build.

## What `ios/` contains

```text title=ios/
ios/
├── <AppName>.xcodeproj/
│   ├── project.pbxproj                  The Xcode project graph. Merge-hostile
│   └── xcshareddata/xcschemes/          Shared schemes. These are checked in
├── <AppName>/
│   ├── AppDelegate.swift                App entry point and React Native bootstrap
│   ├── Images.xcassets/                 App icon and image assets
│   ├── Info.plist                       Display name, usage strings, ATS, URL schemes
│   ├── LaunchScreen.storyboard          The launch screen
│   └── PrivacyInfo.xcprivacy            The privacy manifest Apple requires
├── Podfile                              CocoaPods: use_native_modules!, use_react_native!
└── .xcode.env                           NODE_BINARY for Xcode script phases
```

Two more files appear after your first `pod install` and are **not** in a fresh clone:
`Podfile.lock` (commit it) and `Pods/` plus `<AppName>.xcworkspace` (do not commit them; they are
regenerated). Open the **workspace**, never the `.xcodeproj`, once CocoaPods is in play.

### Which of those you actually edit

| File | Edit it? | What you edit it for |
| --- | --- | --- |
| `<AppName>/Info.plist` | Often | Permission usage strings, URL schemes, ATS exceptions, display name |
| `<AppName>/Images.xcassets` | Often | App icon |
| `Podfile` | Sometimes | Deployment target, an extra pod, a `post_install` hook |
| `PrivacyInfo.xcprivacy` | Sometimes | Declaring required-reason APIs and tracking domains |
| `AppDelegate.swift` | Rarely | Deep link handling, push notification callbacks |
| `project.pbxproj` | Through Xcode only | Build settings, targets, capabilities |
| `.xcode.env` | Rarely | Point `NODE_BINARY` at a specific Node, or create `.xcode.env.local` |
| `Pods/`, `build/`, `DerivedData/` | Never | Output |

`.xcode.env` exists because Xcode script phases do not inherit your shell's `PATH`. Its committed
form resolves Node from the environment; when your Node comes from a version manager, the fix is a
machine-local `.xcode.env.local`, which is deliberately not committed.

> [!WARNING] Anything under `ios/` needs macOS
> Xcode, CocoaPods, `xcodebuild`, the simulator and code signing are macOS-only. On Windows or
> Linux you can edit these files and reason about them, but you cannot build, run or sign an iOS
> app. Plan a Mac — physical or hosted CI — before you commit to shipping on iOS.

## The same setting, on both platforms

Knowing which file to open is most of the work. This table is the translation.

| You want to change | Android | iOS |
| --- | --- | --- |
| App display name | `res/values/strings.xml` → `app_name` | `Info.plist` → `CFBundleDisplayName` |
| Bundle / application id | `app/build.gradle` → `applicationId` | Xcode build setting `PRODUCT_BUNDLE_IDENTIFIER` |
| Version shown to users | `versionName` | `MARKETING_VERSION` / `CFBundleShortVersionString` |
| Build number | `versionCode` | `CURRENT_PROJECT_VERSION` / `CFBundleVersion` |
| A runtime permission | `AndroidManifest.xml` `<uses-permission>` | `Info.plist` usage-description key |
| Deep link registration | `AndroidManifest.xml` `<intent-filter>` | `Info.plist` `CFBundleURLTypes`, or an entitlement |
| Minimum OS version | `minSdkVersion` | `IPHONEOS_DEPLOYMENT_TARGET`, and the Podfile `platform` |
| Cleartext HTTP policy | Network security config | ATS keys in `Info.plist` |
| Code shrinking | `minifyEnabled` plus `proguard-rules.pro` | Not applicable — no equivalent |

The last row matters more than it looks. Several things have no counterpart, and presenting an
Android-only mechanism as cross-platform is one of the most common documentation errors — see
[Platform Differences](../core-concepts/platform-differences.md).

## Platform extensions on the JavaScript side

The folders above are the native half. The JavaScript half of "this is different per platform" is
a file naming convention that Metro understands.

```text
src/components/
  BlurPanel.tsx           shared fallback, or the type-only surface
  BlurPanel.ios.tsx       iOS implementation
  BlurPanel.android.tsx   Android implementation
```

The import site never names a platform:

```tsx-fragment title=src/screens/SettingsScreen.tsx
import {View} from 'react-native';
import {BlurPanel} from '../components/BlurPanel';

export default function SettingsScreen() {
  return (
    <View>
      <BlurPanel intensity={40} />
    </View>
  );
}
```

Both implementations must export the same names with the same types:

```tsx title=src/components/BlurPanel.ios.tsx
import {View, StyleSheet} from 'react-native';
import type {ReactNode} from 'react';

export type BlurPanelProps = {
  intensity: number;
  children?: ReactNode;
};

export function BlurPanel({intensity, children}: BlurPanelProps) {
  // iOS can approximate a blur with a translucent overlay without a native
  // dependency; the Android file uses elevation instead.
  return (
    <View style={[styles.panel, {opacity: 1 - intensity / 200}]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  panel: {backgroundColor: '#ffffff', borderRadius: 12, padding: 16},
});
```

### How Metro resolves them

For a request for `./BlurPanel` with the `ios` platform and the source extension `.tsx`, Metro
tries, in order:

1. `BlurPanel.ios.tsx`
2. `BlurPanel.native.tsx` — React Native turns on `preferNativePlatform`
3. `BlurPanel.tsx`

The first match wins and the others are not bundled at all, so the Android implementation never
reaches the iOS binary. Metro's default platform list is `["ios", "android", "windows", "web"]`.

`.native.tsx` is for code shared by iOS and Android but not by a web build. In a project that only
ships to iOS and Android it is an extra file for no benefit.

> [!NOTE] TypeScript does not resolve platform extensions
> `tsc` type-checks each variant as an independent module, and an importer is checked against the
> extension-less file. That is usually what you want, but it means a `.ios.tsx` whose props have
> drifted will type-check happily and fail at runtime on iOS. Keep one exported type, ideally in a
> shared `types.ts`, and have both variants import it.

### Choosing between an extension and `Platform.select`

| Situation | Use |
| --- | --- |
| A value differs — a padding, a colour, a string | `Platform.OS` / `Platform.select` inline |
| A few branches inside one component | `Platform.select` |
| Different component trees, different imports, or a native dependency that exists on one platform | Separate `.ios` / `.android` files |
| A native module that only one platform implements | Separate files, plus `TurboModuleRegistry.get` |

The deciding question is whether the *other* platform's code should be in the bundle at all. An
iOS-only native dependency imported at the top of a shared file is still imported on Android.

## Pairing platform files with a native module

This is where the two halves of the page meet. A TurboModule that exists on only one platform is
best wrapped in a platform-extension pair, so the call site is unconditional:

```ts title=src/native/Haptics.ios.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  impact(style: string): void;
}

const native = TurboModuleRegistry.get<Spec>('NativeHaptics');

export function impact(style: string): void {
  // `get` returns null when the module is not linked, which keeps a missing
  // pod from crashing the app at import time.
  native?.impact(style);
}
```

```ts title=src/native/Haptics.android.ts
export function impact(_style: string): void {
  // Android has no equivalent in this app yet. A no-op with the same signature
  // means call sites need no Platform check.
}
```

`TurboModuleRegistry.getEnforcing` throws when a module is missing, which is correct for a module
you require; `get` returns `null`, which is correct for an optional one. The whole path from spec
to registration is in [TurboModules End to End](turbomodules-end-to-end.md).

## Platform differences

:::tabs
@tab Android
- The native project builds from any host OS. Android Studio is optional; `./gradlew` is the real
  interface.
- Autolinking runs on **every** Gradle build, so a newly installed dependency is picked up by a
  rebuild.
- `android/app/src/main/java/...` uses your package name as directory structure. Renaming the
  package means moving directories and editing `applicationId`, `namespace` and the manifest.
- `debug.keystore` being checked in is intentional: every developer's debug build then shares one
  signature, which matters for services that key on a signing fingerprint.
@tab iOS
- **macOS with Xcode only.** There is no cross-platform path to an iOS build.
- Autolinking runs during `pod install`, not during the build. Installing a dependency without
  running it produces a module that is simply absent at runtime.
- `project.pbxproj` is a single large file that every Xcode change rewrites. Two people editing
  build settings in the same week will conflict; keep the edits small and review the diff.
- `Pods/` and `*.xcworkspace` are generated. `Podfile.lock` is not — commit it.
:::

## Common patterns

**Treat native edits as diffs against the template.** Before an upgrade, run the Upgrade Helper for
your version pair and read the native files it changes. Your own edits are whatever is left over.

**Put configuration in Gradle and `Info.plist`, not in code.** A value read from `BuildConfig` or
`Info.plist` can differ per variant without a code branch. See
[Environment Configuration](../build-and-release/environment-configuration.md).

**Keep one shared type file next to a platform pair.** `BlurPanel.types.ts` imported by both
variants gives you the compile error when they drift, which the bundler's resolution will not.

**Never edit anything under a `build/` or `Pods/` directory to fix a problem.** The change
survives until the next build and then vanishes, and the hours you spend finding that out are
worse than the original bug.

## Common mistakes

- **Editing `PackageList.java` or another generated autolinking file.** Wrong: adding your package
  to the generated list. Right: register it in `MainApplication.kt`, or fix the library's
  `react-native.config.js`. The file is rewritten on every build. See
  [Autolinking](autolinking.md).
- **Opening `<AppName>.xcodeproj` after `pod install`.** Wrong: the project builds without the pods
  and fails with missing headers. Right: open `<AppName>.xcworkspace`.
- **Committing `Pods/` but not `Podfile.lock`.** Wrong, and exactly backwards. `Podfile.lock` pins
  what everyone installs; `Pods/` is regenerated and enormous.
- **Assuming a `.ios.tsx` file is type-checked against its importer.** Wrong: `tsc` checks the
  extension-less file. Right: share one props type between the variants.
- **Importing an iOS-only package at the top of a shared file.** Wrong:
  `import {Blur} from 'some-ios-only-lib'` in `Panel.tsx` with a `Platform.OS` check inside. Right:
  a `Panel.ios.tsx` that imports it, so the Android bundle never contains it.
- **Putting keystore passwords in `android/gradle.properties`.** That file is committed. Use
  `~/.gradle/gradle.properties` or CI secrets.
- **Renaming the Android package by editing `applicationId` only.** The `namespace`, the manifest,
  the directory structure under `java/` and the Kotlin `package` declarations all have to agree.
- **Expecting `android/` and `ios/` to regenerate.** Nothing regenerates them. Deleting `ios/`
  loses your `Info.plist` edits, your capabilities and your scheme configuration.
- **Hand-editing `gradle/wrapper/gradle-wrapper.properties` to change Gradle.** Use
  `./gradlew wrapper --gradle-version <x>` so the jar and the checksum are updated together.

## Related topics

- [Project Structure](../getting-started/project-structure.md) — the JavaScript half of the tree.
- [Autolinking and react-native.config.js](autolinking.md) — what writes the generated files here.
- [TurboModules End to End](turbomodules-end-to-end.md) — where your own native code goes.
- [Publishing a Native Library](publishing-a-native-library.md) — the same folders, in a package.
- [Debugging Native Code](debugging-native-code.md) — opening these projects in an IDE.
- [Platform Differences](../core-concepts/platform-differences.md) — `Platform`, and the resolution order in depth.
- [Build Variants and Flavours](../build-and-release/build-variants.md) — what `app/build.gradle` and schemes control.
- [Android Signing](../build-and-release/android-signing.md) — why `gradle.properties` must stay free of secrets.
- [The Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md) — diffing your native edits against a new template.
