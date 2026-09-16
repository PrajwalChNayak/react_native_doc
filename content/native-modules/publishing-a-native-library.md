---
title: Publishing a Native Library
description: The package layout, package.json fields, codegenConfig and peer dependency ranges a React Native 0.87 library needs, what its consumers have to do, and where Swift Package Manager fits.
status: current
toolchain: cli
---

A React Native library is an npm package that also carries an Android Gradle project and an iOS
podspec, plus the spec files Codegen reads. Nothing about publishing it is special — `npm publish`
is `npm publish` — but the package has to be laid out in the way the Community CLI's autolinking
expects, or it installs cleanly and then does nothing.

This page is about the package, not about writing the native code. The implementation is in
[Writing a Module in Kotlin](writing-a-module-in-kotlin.md) and
[Writing a Module in Swift](writing-a-module-in-swift.md).

## What a consumer's build actually needs from you

Four things, and every layout rule below exists to deliver one of them.

| The consumer's build needs | You provide it as |
| --- | --- |
| Spec files to run Codegen over | `codegenConfig.jsSrcsDir` in your `package.json`, and the specs inside it |
| An Android Gradle project to include | An `android/` directory with a `build.gradle` |
| An iOS pod to install | A single `*.podspec` at the package root |
| JavaScript the app can import | `main` / `types` (or `exports`) pointing at built files inside `files` |

Autolinking discovers all four by convention. A library that follows the convention needs no
`react-native.config.js` at all.

## Package layout

```text title=react-native-calendar/
react-native-calendar/
├── src/
│   ├── index.ts                     The public JavaScript API
│   └── specs/
│       └── NativeCalendar.ts        The Codegen spec — shipped, not just built
├── lib/                             Build output: commonjs, module, typescript
├── android/
│   ├── build.gradle                 The library Gradle module
│   ├── gradle.properties            Library-scoped Gradle properties
│   └── src/main/java/com/calendar/
│       ├── CalendarModule.kt
│       └── CalendarPackage.kt       The ReactPackage autolinking registers
├── ios/
│   ├── RCTCalendar.h
│   ├── RCTCalendar.mm               The Objective-C++ class that conforms to the spec
│   └── Calendar.swift
├── react-native-calendar.podspec    One podspec, at the root, named after the package
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

Two details in that tree are load-bearing:

- **The specs ship in the published tarball.** Codegen runs in the *consumer's* build, over your
  `jsSrcsDir`. If `src/` is excluded from `files`, Codegen finds nothing and the module is never
  registered. This surprises people who assume only `lib/` needs publishing.
- **One podspec, at the root.** The CLI finds the iOS project by globbing for a single `*.podspec`.
  Two podspecs, or one nested inside `ios/`, means you now need a `react-native.config.js` to say
  which is which.

## `package.json`, field by field

```json title=package.json
{
  "name": "react-native-calendar",
  "version": "1.0.0",
  "description": "Calendar access for React Native",
  "main": "lib/commonjs/index.js",
  "module": "lib/module/index.js",
  "types": "lib/typescript/src/index.d.ts",
  "react-native": "src/index.ts",
  "source": "src/index.ts",
  "files": [
    "src",
    "lib",
    "android",
    "ios",
    "react-native-calendar.podspec",
    "!android/build",
    "!ios/build",
    "!**/__tests__"
  ],
  "codegenConfig": {
    "name": "RNCalendarSpec",
    "type": "modules",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.calendar"
    },
    "ios": {
      "modules": {
        "NativeCalendar": {"className": "RCTCalendar"}
      }
    }
  },
  "peerDependencies": {
    "react": ">=19.0.0",
    "react-native": ">=0.82.0"
  },
  "devDependencies": {
    "react": "19.2.3",
    "react-native": "0.87.1",
    "react-native-builder-bob": "^0.43.1",
    "typescript": "5.9.3"
  }
}
```

| Field | Why it is there |
| --- | --- |
| `main` / `module` / `types` | What a bundler and `tsc` resolve for a consumer. Point at built output, not `src`. |
| `react-native` | Metro-specific entry. Pointing it at `src/index.ts` lets Metro transpile your TypeScript directly, which is what makes a library debuggable in a consuming app. |
| `source` | Read by `react-native-builder-bob`; not used at runtime. |
| `files` | The allow-list npm publishes. Getting this wrong is the single most common publishing bug. |
| `codegenConfig` | How the consumer's build finds your specs. Full reference in [Codegen and Spec Files](codegen-specs.md). |
| `peerDependencies` | The compatibility contract. See below. |
| `devDependencies` | Your own build and test versions. These are not what consumers install. |

> [!WARNING] `react-native` and `react` belong in `peerDependencies`, never in `dependencies`
> A library that depends on `react-native` directly can install a second copy of React Native into
> the consumer's `node_modules`. The symptoms are surreal: two renderers, hooks that throw
> "invalid hook call", a TurboModule that registers into the wrong runtime. Declare them as peers
> and as devDependencies, and nothing else.

### The spec file, shipped as source

```ts title=src/specs/NativeCalendar.ts
import {TurboModuleRegistry} from 'react-native';
import type {TurboModule} from 'react-native';

export interface Spec extends TurboModule {
  createEvent(title: string, startTimeIso: string): Promise<string>;
  getPermissionStatus(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeCalendar');
```

The public entry point wraps it, so you can change the spec without changing your API:

```ts-fragment title=src/index.ts
import NativeCalendar from './specs/NativeCalendar';

export type CalendarPermission = 'granted' | 'denied' | 'restricted';

export function createEvent(title: string, startsAt: Date): Promise<string> {
  return NativeCalendar.createEvent(title, startsAt.toISOString());
}

export function getPermissionStatus(): CalendarPermission {
  return NativeCalendar.getPermissionStatus() as CalendarPermission;
}
```

Wrapping matters more than it looks. The Codegen spec language is deliberately restricted — no
`Date`, no unions of object types, no overloads — so the spec is rarely the API you want to expose.
The wrapper is where the ergonomic types live.

## Peer dependency ranges: how to choose one honestly

A peer range is a promise. It says "I have been built and tested against these versions". The
ecosystem contains two opposite mistakes, and both hurt.

| Range | What it claims | When it is right |
| --- | --- | --- |
| `"react-native": "*"` | Nothing at all | Almost never. It tells npm to stay quiet and tells the consumer nothing. |
| `"react-native": ">=0.82.0"` | Every future version works | Reasonable for a pure-Kotlin/Swift TurboModule with no C++ and no private API use |
| `"react-native": "0.83 - 0.87"` | Exactly these minors are tested | Correct for anything touching JSI, C++, worklets or internal headers |

Two real, verified examples of the tight form, from packages installed in this repository's
type-check harness:

- `react-native-reanimated@4.6.0` declares `"react-native": "0.83 - 0.87"` and additionally
  requires `react-native-worklets@0.12.x` as a separate peer install.
- `react-native-worklets@0.12.2` declares the same `"react-native": "0.83 - 0.87"`.

Those tight ranges are not timidity. Reanimated compiles against React Native's C++ internals, and
those move between minors. If your library does the same, copy the pattern: pin the range, and
publish a new minor when you have actually tested the next React Native version.

> [!NOTE] `>=0.82.0` is the floor worth stating for a new library
> 0.82 is where the old Bridge was removed and the New Architecture became the only architecture. A
> library written against TurboModules and Fabric cannot work on anything older, and claiming
> otherwise produces bug reports you cannot fix. See
> [New Architecture Migration](../migration/new-architecture-migration.md).

## The Android side

The consumer's `settings.gradle` includes your `android/` directory as a subproject, so it must be
a valid standalone Gradle library module. The full file is in
[Writing a Module in Kotlin](writing-a-module-in-kotlin.md); the parts that are about *publishing*
rather than about building are these:

```gradle title=android/build.gradle (the publishing-relevant parts)
android {
    namespace "com.calendar"

    defaultConfig {
        // State the real floor. A consumer whose minSdkVersion is lower gets a
        // manifest merger error, which is a far better failure than a runtime one.
        minSdkVersion 24
    }
}

dependencies {
    // Never pin a react-native version here. `+` resolves to whatever the
    // consuming app already has, which is the only correct answer.
    implementation "com.facebook.react:react-android"
}
```

The `com.facebook.react:react-android` artifact without a version is the convention: the consuming
app's React Native version wins. A library that pins a version will either fail to resolve or
silently duplicate classes.

Autolinking registers your `ReactPackage` by deriving `new CalendarPackage()` from the package
name. If your class is named anything else, or there are several, say so explicitly — see
[Autolinking](autolinking.md).

## The iOS side

One podspec at the package root, using React Native's own dependency helper:

```ruby title=react-native-calendar.podspec
require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-calendar'
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']
  s.authors      = package['author']
  s.homepage     = package['homepage']
  s.platforms    = { :ios => '15.1' }
  s.source       = { :git => 'https://github.com/you/react-native-calendar.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'

  # Adds React-Core, the codegen output, the folly compiler flags and the
  # header search paths, matched to the consumer's React Native version.
  install_modules_dependencies(s)
end
```

`install_modules_dependencies(s)` is defined in React Native's `scripts/react_native_pods.rb` and
is available inside any podspec a React Native `Podfile` evaluates. Hand-rolling the dependency
list instead is how a library ends up broken by a React Native minor release.

> [!WARNING] Everything in this section needs macOS to test
> You can write and publish the podspec from any machine. You cannot run `pod install`, build the
> pod, or find out whether it compiles without macOS and Xcode. Publishing an iOS half you have
> never built is a reliable way to ship a broken release.

## Swift Package Manager support

> [!WARNING] Swift Package Manager support is Experimental in 0.87
> SPM is an opt-in alternative to CocoaPods that needs no Ruby, Bundler or CocoaPods — only Xcode.
> The commands and the package layout may still change between minor versions. **CocoaPods remains
> the default**, and the overwhelming majority of consumers will install your library through it.

To participate, a library ships a `Package.swift` alongside its podspec. React Native can scaffold
one:

```bash
# Run from the library's root. Verified against react-native 0.87.1's own
# spm command, whose documented actions are: add, update, deinit, scaffold.
npx react-native spm scaffold
```

The rule to follow: **ship the podspec, add `Package.swift` as an extra.** A library that ships only
a `Package.swift` will not install for most consumers today. The migration path for apps is in
[CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md).

## Shipping pre-generated native code

By default, Codegen runs in every consumer's build, over your specs. A library can instead generate
the native code once, commit it, and set:

```json title=package.json (excerpt)
{
  "codegenConfig": {
    "name": "RNCalendarSpec",
    "type": "modules",
    "jsSrcsDir": "src/specs",
    "includesGeneratedCode": true
  }
}
```

The consumer's build then skips generation for your library. It shortens consumers' builds, and it
ties your generated code to the React Native version you generated it with. For most libraries the
default is the right choice; consider `includesGeneratedCode` only when you are prepared to
regenerate and republish on every React Native minor.

## What your consumers have to do

State this in your README, because people will not guess it:

```bash
npm install react-native-calendar
cd ios && bundle exec pod install && cd ..
npm run android
```

And state what autolinking does **not** do for them:

| Consumer must do it themselves | Why |
| --- | --- |
| Run `pod install` | iOS autolinking happens at install time, not build time |
| Add Android permissions to their `AndroidManifest.xml` | Manifest merging pulls in your library's manifest, but app-level runtime permissions are theirs |
| Add `Info.plist` usage strings | Apple rejects a build that uses an API without the matching usage description |
| Meet your `minSdkVersion` and deployment target | A mismatch is a build error, not a runtime one |
| Install any separate peer packages | npm warns; it does not install them |

That last row is worth a sentence in bold in your README if your library needs a companion package.
The two best-known examples in the ecosystem are exactly this failure: Reanimated 4 needs
`react-native-worklets` installed separately, and `react-native-mmkv@4.3.2` needs
`react-native-nitro-modules`. Both produce confusing runtime errors rather than install failures.

## Testing the package before you publish

Three checks, in increasing order of realism.

**1. See what npm would actually publish.**

```bash
# Lists every file in the tarball without publishing anything.
npm pack --dry-run
```

Read the list. If `src/specs/` or `android/` or the podspec is missing, `files` is wrong, and the
library will install and do nothing.

**2. Build it against a real app, without publishing.** Point the app's `react-native.config.js` at
your checkout:

```js title=react-native.config.js (in the test app)
const path = require('path');

module.exports = {
  dependencies: {
    'react-native-calendar': {
      root: path.join(__dirname, '../react-native-calendar'),
    },
  },
};
```

This exercises the real path — Codegen, autolinking, the podspec, Gradle — which `npm link` does
not, because the CLI resolves symlinks inconsistently across the two platforms.

**3. Install the tarball.** `npm pack` produces a `.tgz`; `npm install ../react-native-calendar-1.0.0.tgz`
in a fresh app installs exactly what a consumer would get. This is the only check that catches a
missing file in `files`.

## Versioning

Your version number is a claim about your JavaScript API *and* your native contract. Treat these as
breaking changes even when the TypeScript surface is unchanged:

- Raising `minSdkVersion` or the iOS deployment target.
- Narrowing the `react-native` peer range.
- Renaming the TurboModule string passed to `getEnforcing`.
- Adding a required permission to your library's `AndroidManifest.xml`.
- Switching `includesGeneratedCode` on or off.

Each of those breaks a consumer's build on `npm update`. See
[Versioning Strategy](../build-and-release/versioning.md) for the app-side view of the same problem.

## Tooling worth knowing about

Both are published by Callstack and were last published on 2026-09-08; versions read from the npm
registry on 2026-09-12.

| Package | Version | What it does |
| --- | --- | --- |
| `react-native-builder-bob` | 0.43.1 | Builds `lib/commonjs`, `lib/module` and `lib/typescript` from `src/`, so `main` / `module` / `types` have something to point at |
| `create-react-native-library` | 0.63.1 | Scaffolds a library skeleton, including `codegenConfig`, the Gradle module and the podspec |

Neither declares a `react-native` peer dependency, which is correct: they are build-time tools, not
runtime dependencies. Neither is required — a library is a `package.json`, a `tsc` invocation and
the folders above — but writing the `exports`/`main`/`types` matrix by hand is tedious and easy to
get subtly wrong.

## Security considerations

### Threat

Your package runs on every consumer's machine and inside every app that installs it. Two attack
surfaces come with publishing: a compromised npm account pushing a malicious version, and a
`postinstall` script in your own package running arbitrary code on thousands of developer
machines and CI runners.

### Exploit

```bash
# What an installing developer can check, and usually does not.
npm view react-native-calendar dist.tarball
npm pack react-native-calendar@1.0.1 && tar -tzf react-native-calendar-1.0.1.tgz

# Any lifecycle script is arbitrary code execution at install time.
npm view react-native-calendar scripts
```

### Fix

1. **Do not ship an install-time lifecycle script.** A React Native library needs no `postinstall`.
   Autolinking is a build-time scan, not an install-time hook.
2. **Turn on two-factor authentication for publishing** on the npm account and on every maintainer
   account with publish rights.
3. **Publish from CI with a granular automation token**, scoped to this one package, rather than
   from a laptop with a long-lived credential.
4. **Keep `files` tight.** A broad `files` list, or none at all, has published `.env` files, private
   keys and internal source more than once.

### Verification

```bash
# 1. No lifecycle scripts that run on install.
npm pkg get scripts.postinstall scripts.preinstall scripts.install

# 2. Nothing secret in the tarball.
npm pack --dry-run 2>&1 | grep -iE '\.env|\.pem|\.p12|keystore|id_rsa' && echo "FAIL" || echo "OK"

# 3. Two-factor is required for publishing this package.
npm access get status react-native-calendar
```

The consumer's side of this is in [Dependency Auditing](../security/dependency-auditing.md).

## Common mistakes

- **Leaving `src/` out of `files`.** Wrong: publishing only `lib/`, `android/` and `ios/`. Right:
  ship `src/` too. Codegen runs over `jsSrcsDir` in the consumer's build; without the specs the
  module never registers and `getEnforcing` throws.
- **Putting `react-native` in `dependencies`.** Wrong: a second copy of React Native in the
  consumer's tree. Right: `peerDependencies` plus `devDependencies`.
- **Declaring `"react-native": "*"`.** It silences npm's warning and tells consumers nothing. State
  the range you have actually tested.
- **Pinning a React Native version in `android/build.gradle`.** Wrong:
  `implementation "com.facebook.react:react-android:0.87.1"`. Right: no version, so the app's
  version wins.
- **Two podspecs, or a podspec inside `ios/`.** The CLI globs for a single podspec at the root.
  Anything else needs an explicit `react-native.config.js`.
- **Publishing an iOS half you have never built.** The podspec is text until `pod install` and
  Xcode say otherwise, and both need macOS.
- **Using `npm link` to test.** Wrong: a symlink the CLI resolves differently on each platform, so
  "works on Android" proves nothing. Right: `dependencies.<name>.root` in a test app, then a
  tarball install.
- **Shipping only a `Package.swift`.** Swift Package Manager is Experimental in 0.87 and CocoaPods
  is still the default. A library without a podspec is uninstallable for most consumers.
- **Forgetting to document a required peer package.** npm prints a warning nobody reads, and your
  users get a native crash on first call. Say it in the first paragraph of the README.
- **Bumping a patch version when you raised `minSdkVersion`.** That is a breaking change for every
  consumer whose floor is lower, and it arrives through an automated dependency update.

## Related topics

- [Autolinking and react-native.config.js](autolinking.md) — how the consumer's build finds your package.
- [Codegen and Spec Files](codegen-specs.md) — the full `codegenConfig` reference and the spec type rules.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — the Android half and its Gradle file.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the iOS half and the podspec in full.
- [TurboModules End to End](turbomodules-end-to-end.md) — the whole path, from spec to call site.
- [Fabric Native Components](fabric-native-components.md) — publishing a component instead of a module.
- [Platform Folders](platform-folders.md) — the folder conventions autolinking derives defaults from.
- [Debugging Native Code](debugging-native-code.md) — proving your library linked in a consumer's app.
- [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md) — the app-side SPM migration.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — how consumers will judge your package.
- [Versioning Strategy](../build-and-release/versioning.md) — what a version number promises.
- [Dependency Auditing](../security/dependency-auditing.md) — the consumer's view of your supply chain.
