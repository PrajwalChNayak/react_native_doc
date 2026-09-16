---
title: Autolinking and react-native.config.js
description: How a native dependency reaches your build without you editing Gradle or the Podfile, every key of react-native.config.js, and what to do when the defaults are wrong.
status: current
toolchain: cli
---

Autolinking is the step that turns `npm install react-native-calendar` into a registered
TurboModule on both platforms. The React Native Community CLI scans your dependencies, works out
which of them ship native code, and hands that list to Gradle and to CocoaPods.

When it works you never think about it. When it does not, the symptom is almost always the same
— `getEnforcing` throws on one platform — and the fix is almost always in
`react-native.config.js`. This page is about both halves.

## Why it exists — and what it does not do

Before autolinking, adding a native dependency meant editing `settings.gradle`,
`app/build.gradle`, `MainApplication`, the `Podfile` and sometimes the Xcode project. Five files
per library, each with its own way of going wrong, each conflicting on every merge.

Autolinking replaces all five with a scan. What it does **not** do is equally important:

| Autolinking does | Autolinking does not |
| --- | --- |
| Find packages with native code in `node_modules` | Install pods for you — you still run `pod install` |
| Add Android subprojects and register their `ReactPackage` | Register a package you wrote inside your own app |
| Feed each library's `codegenConfig` into Codegen | Decide which native modules your JavaScript imports |
| Wire the library's podspec into the Podfile | Add permissions, capabilities or `Info.plist` keys |

The second row is the one that catches people. Your own app's `ReactPackage` is not in
`node_modules`, so you add it to `MainApplication.kt` by hand — see
[TurboModules End to End](turbomodules-end-to-end.md).

## Basic example — what happens on install

```bash
npm install react-native-calendar
cd ios && bundle exec pod install && cd ..
npm run android
```

Three separate mechanisms run:

1. **The CLI produces a config.** `@react-native-community/cli config` walks `package.json`
   dependencies, applies each library's `react-native.config.js`, and emits JSON describing
   every linkable dependency.
2. **Gradle consumes it.** The settings plugin writes
   `android/build/generated/autolinking/autolinking.json`, includes each library as a Gradle
   subproject, and generates `PackageList.java` so `PackageList(this).packages` contains the
   library's `ReactPackage`.
3. **CocoaPods consumes it.** `use_native_modules!` in the `Podfile` reads the same config and
   adds a `pod` entry for each library's podspec.

Codegen runs inside 2 and 3, over every discovered library's `codegenConfig` as well as your
app's.

## How it works

### Android

Two pieces of Gradle wiring, both already present in a project created by the Community CLI.

```gradle title=android/settings.gradle
plugins { id("com.facebook.react.settings") }

extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  // Runs `npx @react-native-community/cli config` and caches the result,
  // re-running only when a lock file or react-native.config.js changes.
  ex.autolinkLibrariesFromCommand()
}

includeBuild('../node_modules/@react-native/gradle-plugin')
```

```gradle title=android/app/build.gradle
react {
  // Turns the config into Gradle dependencies, a generated PackageList and
  // the New Architecture C++ autolinking files.
  autolinkLibrariesWithApp()
}
```

What that produces, all of it build output:

| Path | Contents |
| --- | --- |
| `android/build/generated/autolinking/autolinking.json` | The CLI config, cached |
| `android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java` | The `ReactPackage` list |
| `android/app/build/generated/autolinking/src/main/jni/Android-autolinking.cmake` | `add_subdirectory` per C++ library |
| `android/app/build/generated/autolinking/src/main/jni/autolinking.cpp` | C++ module and component descriptor registration |

The relevant Gradle tasks are `generateAutolinkingPackageList` and
`generateAutolinkingNewArchitectureFiles`, both wired into `preBuild`. Running them directly is
a useful way to see what the CLI found without a full build.

> [!NOTE] Compare the wiring against a freshly generated project
> The exact `settings.gradle` and `app/build.gradle` text is owned by the Community CLI
> template and has changed between minor versions. The function names above —
> `autolinkLibrariesFromCommand()` and `autolinkLibrariesWithApp()` — are what the 0.87 Gradle
> plugin exposes. If your project predates 0.87, run an upgrade rather than hand-editing.

### iOS

One line in the `Podfile`, plus `pod install`.

```ruby title=ios/Podfile (the autolinking part)
require Pod::Executable.execute_command('node', ['-p',
  'require.resolve("react-native/scripts/react_native_pods.rb", {paths: [process.argv[1]]})',
  __dir__]).strip

target 'AwesomeProject' do
  config = use_native_modules!

  use_react_native!(:path => config[:reactNativePath])
end
```

`use_native_modules!` runs the same CLI config command, adds a `pod` entry for every dependency
with a podspec, and returns a hash whose `:reactNativePath` is passed to `use_react_native!`.

Unlike Android, **nothing happens at build time**. If you install a dependency and skip
`pod install`, the library is simply absent, and the error you get is `getEnforcing` failing at
first use. That asymmetry is why a module so often "works on Android and not on iOS".

### Codegen and autolinking are the same pass

Every discovered library's `package.json` is checked for `codegenConfig`. If it has one, its
specs are generated into the consumer's build alongside the app's own. That is why a library
ships spec files in its published package rather than only the generated output.

A library that ships **pre-generated** native code sets `codegenConfig.includesGeneratedCode`
to `true`, and the consumer's build skips generating it.

## `react-native.config.js` in a library

Most libraries need no config file at all. The CLI derives everything from the folder layout:
an `android/` directory, a single `*.podspec`, and a class implementing `ReactPackage`.

Write one only to correct a default.

```js title=react-native.config.js (in the library)
module.exports = {
  dependency: {
    platforms: {
      android: {
        // Only if the Android project is not at ./android
        sourceDir: './native/android',
        // Only if the CLI cannot find your ReactPackage, or you have several
        packageImportPath: 'import com.awesomeproject.calendar.CalendarPackage;',
        packageInstance: 'new CalendarPackage()',
      },
      ios: {
        // Runs during the consumer's build, for code generation or asset copying
        scriptPhases: [],
      },
    },
  },
};
```

### Every `dependency.platforms.android` key

| Key | Meaning |
| --- | --- |
| `sourceDir` | Path to the Gradle project. Defaults to `./android`. |
| `manifestPath` | Path to a non-standard `AndroidManifest.xml`. |
| `packageName` | Overrides the package name read from the manifest. |
| `packageImportPath` | The `import` line written into `PackageList.java`. |
| `packageInstance` | The constructor expression written into `PackageList.java`. Defaults to `new <Name>Package()`. |
| `buildTypes` | Build types or flavours the dependency is added to. Empty means all. |
| `dependencyConfiguration` | Replaces `implementation project(...)` with your own Gradle expression. |
| `libraryName` | The C++ library name, for a library with hand-written native code. |
| `cmakeListsPath` | Path to a `CMakeLists.txt` that Codegen did not generate. |
| `cxxModuleCMakeListsModuleName` | The CMake target that builds a C++ TurboModule. |
| `cxxModuleCMakeListsPath` | Path to that target's `CMakeLists.txt`. |
| `cxxModuleHeaderName` | The C++ TurboModule class name. |

The last five are New Architecture C++ options. A library that is Kotlin plus a spec needs none
of them — the generated component descriptors and module bindings are compiled into the
consumer's codegen target automatically.

### Every `dependency.platforms.ios` key

| Key | Meaning |
| --- | --- |
| `scriptPhases` | Xcode script phases added to the consumer's Pods project. Each takes `name`, `path`, `execution_position`. |
| `configurations` | Build configurations the pod is added to. Empty means all. |

Everything else on iOS comes from the podspec.

## `react-native.config.js` in an app

An app's config file does two different jobs: describing the app's own native projects, and
overriding what autolinking does with specific dependencies.

```js title=react-native.config.js (in the app)
const path = require('path');

module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
      automaticPodsInstallation: true,
    },
    android: {
      sourceDir: './android',
      appName: 'app',
      manifestPath: './android/app/src/main/AndroidManifest.xml',
      packageName: 'com.awesomeproject',
    },
  },
  dependencies: {
    // Link a library that is not in node_modules — a sibling folder, a
    // monorepo package, or a fork you are debugging.
    'react-native-calendar': {
      root: path.join(__dirname, '../libraries/react-native-calendar'),
    },

    // Turn autolinking off for one platform. Use this when you link the
    // library manually, or when its iOS half is broken for your build.
    'react-native-webview': {
      platforms: {
        ios: null,
      },
    },

    // Replace the Gradle dependency expression, for example to route through
    // a brownfield wrapper project.
    'react-native-brownfield': {
      platforms: {
        android: {
          dependencyConfiguration: 'embed project(path: ":react-native-brownfield-bridge")',
        },
      },
    },
  },
};
```

Setting a platform to `null` disables autolinking for that dependency on that platform only. It
does not uninstall the package, and it does not stop Codegen from reading its `codegenConfig` —
that is a common source of "I disabled it and it still builds its specs".

## Inspecting what the CLI actually found

When a library is not linked, look at the config before you look at Gradle.

```bash
# The full autolinking config as JSON. Long, but it is the ground truth.
npx @react-native-community/cli config
```

```bash
# Just the dependency names the CLI considers linkable.
npx @react-native-community/cli config | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).dependencies).join('\n')))"
```

If your library is missing from that output, the problem is in the library's layout or its
`react-native.config.js` — not in the app. If it is present but the Android module is still
unregistered, check `PackageList.java` in the generated autolinking folder: it lists the exact
`packageInstance` expression the CLI produced.

## Platform differences

:::tabs
@tab Android
- Autolinking runs as part of **every Gradle build**, so installing a dependency and rebuilding
  is enough.
- The config is cached in `autolinking.json` and only recomputed when a lock file,
  `package.json` or `react-native.config.js` changes. A stale cache is cleared by
  `./gradlew clean` or by deleting `android/build/generated/autolinking`.
- The generated `PackageList.java` is readable and is the fastest way to confirm a library was
  registered.
@tab iOS
- Autolinking runs during **`pod install`**, not during the build. A new dependency is invisible
  to Xcode until you run it.
- `automaticPodsInstallation: true` in the app's `project.ios` config makes the CLI run
  `pod install` for you when it detects a dependency change.
- Deleting `ios/Pods` and `ios/Podfile.lock` and reinstalling is the equivalent of a Gradle
  clean. Commit `Podfile.lock`.
- Swift Package Manager is **Experimental** in 0.87. Autolinking under SPM is handled by
  `npx react-native spm`, and libraries must ship a `Package.swift` to participate.
:::

## Common patterns

**Develop a library against a real app with `root`.** Pointing `dependencies.<name>.root` at a
sibling checkout gives you the library's real build path — codegen, autolinking, the podspec —
without publishing or `npm link`. It is the closest thing to a proper monorepo workflow for a
single library.

**Disable one platform while you port.** `platforms: {ios: null}` lets the Android half keep
working while the iOS half is unfinished. Pair it with `TurboModuleRegistry.get` and a
`Platform.OS` check in JavaScript, so the JavaScript side degrades instead of throwing.

**Keep `react-native.config.js` out of the library unless you need it.** Every key you write is
a default you have taken responsibility for. A library with no config file inherits the CLI's
conventions and keeps inheriting them across upgrades.

**Commit the lock files.** Autolinking's cache keys are lock files. A project where
`package-lock.json` or `Podfile.lock` is not committed gets different linking results on
different machines, and the failure looks like a native bug.

## Common mistakes

- **Forgetting `pod install` after installing a dependency.** Wrong: `npm install` then
  `npm run ios`, and a module that "only works on Android". Right: `bundle exec pod install`
  in `ios/` first. iOS autolinking happens at install time, not build time.
- **Expecting your own app's `ReactPackage` to be autolinked.** Wrong: writing
  `CalendarPackage` inside `android/app/src/main/java` and waiting for it to appear. Right: add
  it to `MainApplication.kt`. Autolinking only scans dependencies.
- **Editing `PackageList.java`.** Wrong: adding a line to the generated file to fix a missing
  package. Right: fix `packageImportPath` / `packageInstance` in the library's
  `react-native.config.js`. The generated file is rewritten on every build.
- **Assuming `platforms: {ios: null}` removes the library.** Wrong: expecting its specs to stop
  generating. Right: it only skips linking. Remove the dependency if you want it gone.
- **Putting the app's overrides in the library's config, or the reverse.** Wrong:
  a `dependencies` key in a library's `react-native.config.js`. Right: `dependency` (singular)
  in a library, `project` and `dependencies` in an app. The names differ by one letter and the
  wrong one is silently ignored.
- **Debugging Gradle before reading the config.** Wrong: an hour in `build.gradle`. Right:
  `npx @react-native-community/cli config` first. If the library is not in that output, nothing
  downstream can link it.
- **Using `npm link` for library development.** Wrong: a symlink that the CLI resolves
  inconsistently across platforms. Right: `dependencies.<name>.root` pointing at the checkout.

## Related topics

- [TurboModules End to End](turbomodules-end-to-end.md) — where autolinking sits in the whole path.
- [Fabric Native Components](fabric-native-components.md) — what a component library needs beyond the defaults.
- [Publishing a Native Library](publishing-a-native-library.md) — the package layout autolinking expects.
- [Codegen and Spec Files](codegen-specs.md) — how a dependency's `codegenConfig` is discovered.
- [Platform Folders](platform-folders.md) — the folder conventions the CLI derives defaults from.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — the `ReactPackage` autolinking registers.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the podspec `use_native_modules!` finds.
- [Debugging Native Code](debugging-native-code.md) — proving a library is or is not linked.
