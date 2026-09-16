---
title: CocoaPods to Swift Package Manager
description: The experimental Swift Package Manager path for iOS in React Native 0.87 — the commands, the header change, the xcframeworks, and an honest account of what is not settled yet.
status: current
toolchain: cli
---

React Native 0.87 ships an **experimental** opt-in alternative to CocoaPods for the iOS build:
Swift Package Manager. It removes Ruby, Bundler and CocoaPods from the toolchain entirely, leaving
Xcode as the only requirement.

> [!WARNING] Experimental — commands and layout may still change
> This is labelled experimental by React Native and this page labels it experimental everywhere.
> **CocoaPods remains the default** for `init` and for the ecosystem at large. Do not migrate a
> project you are about to ship, and do not assume the commands below will be spelled the same way
> in 0.88.

> [!NOTE] macOS only
> Every command on this page requires Xcode, which runs only on macOS. There is no Linux or Windows
> path for any iOS build, CocoaPods or SPM.

## Why it exists / when to use it — and when NOT to

CocoaPods is a Ruby program. That means every machine and every CI runner that builds your iOS app
needs a Ruby, a `Gemfile`, a `Gemfile.lock`, Bundler, and the discipline to use `bundle exec` so
everyone runs the same CocoaPods version. A surprising share of "it builds on my machine" comes from
that stack rather than from your code. CocoaPods is also in maintenance, while Swift Package Manager
is Apple's own dependency manager and is built into Xcode.

Consider the SPM path if you are starting a greenfield project, if you want to try it on a branch,
or if Ruby specifically is causing you pain in CI.

Do not adopt it if you are close to a release, if your team is not comfortable debugging an Xcode
project by hand, or — most importantly — if any of your native dependencies do not ship a
`Package.swift`. That last one is usually the deciding factor, and it is a question about your
dependency list rather than about your app.

## The commands

All of these run from the `ios/` directory of your project.

```bash
cd ios
```

| Command | What it does |
| --- | --- |
| `npx react-native spm --deintegrate` | Remove CocoaPods and switch the project to SPM — the migration command |
| `npx react-native spm` | Set up SPM. On a fresh clone or in CI, this is the equivalent of `pod install` |
| `npx react-native spm deinit` | Reverse the setup |
| `npx react-native spm scaffold` | Scaffold a `Package.swift` for a library |

The command is registered by `react-native` itself rather than by the Community CLI, and its own
description reads: "Set up or maintain Swift Package Manager support for the iOS/macOS app.
Actions: add, update, deinit, scaffold. With no action: add (or update if SPM is already set up)."

That is worth reading twice, because it explains the shapes above. `--deintegrate` is a **flag on
the `add` action**, not an action of its own; running `npx react-native spm` with no action performs
`add`, or `update` if SPM is already configured.

Options the command accepts, read from its registration in `react-native@0.87.1`:

| Option | Purpose |
| --- | --- |
| `--version <string>` | React Native version. Defaults to the version in `node_modules/react-native/package.json` |
| `--yes` | Skip the dirty-`pbxproj` confirmation prompt |
| `--xcodeproj <path>` | Which `.xcodeproj` to inject into, when several exist |
| `--productName <string>` | Which app target to inject into, when several exist |
| `--deintegrate` | Run `pod deintegrate` and strip React Native from the `Podfile` before injecting |
| `--artifacts <path>` | Advanced: a local artifact root with complete `debug/` and `release/` slots |
| `--download <string>` | Advanced: artifact download policy — `auto` (default), `skip`, or `force` |
| `--skipCodegen` | Advanced: skip the React Native codegen step |

The `--yes` flag exists because the command edits your Xcode project file. That is the single riskiest
part of the migration, and the prompt is there for a reason.

## Basic example — migrating an existing project

```bash
# 0. Commit first. This command edits project.pbxproj, and a hand-review of the
#    diff is the only way to know what it did.
git status --porcelain          # must be empty
git switch -c spm-experiment

# 1. Deintegrate CocoaPods and inject the Swift packages.
cd ios
npx react-native spm --deintegrate

# 2. Read the diff. Every line of it.
cd ..
git diff --stat
git diff ios/App.xcodeproj/project.pbxproj

# 3. Build from the command line before touching Xcode, so a failure is legible.
npm run ios
```

To go back:

```bash
cd ios
npx react-native spm deinit
# Then restore the Podfile from git and reinstall:
cd .. && git checkout ios/Podfile ios/Podfile.lock
cd ios && bundle install && bundle exec pod install
```

Keeping the CocoaPods files in git history until you are confident is not optional. The reverse path
depends on them.

On a fresh clone or a CI runner, the setup step replaces `pod install`:

```bash
# CocoaPods path (the default)
cd ios && bundle install && bundle exec pod install

# SPM path (experimental) — no Ruby, no Bundler, no CocoaPods
cd ios && npx react-native spm
```

## The header change

0.87 changed how React Native's Objective-C headers are imported. This applies **whether or not you
adopt SPM** — it is part of the same body of work but lands for everyone.

```diff title=ios/AppDelegate.swift or any native source of yours
-#import <RCTAppDelegate.h>
+#import <React/RCTAppDelegate.h>
```

The bare form worked because CocoaPods flattened every pod's headers into one search path. Framework
builds do not, so the header must be qualified with its framework name. If a native file of yours, or
a library you vendored, uses the bare spelling, it will not compile.

```bash
grep -rn "#import <RCT" ios/ --include=*.h --include=*.m --include=*.mm --include=*.swift
```

Anything that names a React Native header without a `React/` prefix needs the prefix.

## The new xcframeworks

Two new binary frameworks carry React Native's headers on the SPM path:

| Framework | Contents |
| --- | --- |
| `ReactNativeHeaders.xcframework` | React Native's own public headers |
| `ReactNativeDependenciesHeaders.xcframework` | Headers for React Native's third-party C++ dependencies |

They are downloaded rather than built, which is where the `--download` and `--artifacts` options come
in: `--download skip` is for an air-gapped or cache-warmed environment, `--artifacts` points at a
local root holding complete `debug/` and `release/` slots.

This is the mechanism behind most of the speed difference people report. A framework that arrives
prebuilt is not compiled on your machine or your CI runner.

## Libraries must ship a `Package.swift`

This is the constraint that decides whether the migration is possible at all. CocoaPods reads a
`.podspec`; Swift Package Manager reads a `Package.swift`. A library that ships only a podspec cannot
be consumed by SPM.

Check every native dependency:

```bash
# Every installed package that ships a podspec
ls node_modules/*/[!.]*.podspec node_modules/@*/*/[!.]*.podspec 2>/dev/null

# Which of those also ship a Package.swift
ls node_modules/*/Package.swift node_modules/@*/*/Package.swift 2>/dev/null
```

Anything in the first list and not in the second blocks the migration. Your options, in order of
preference: upgrade the library to a version that ships one, open an issue or a pull request
upstream, or scaffold one locally with `npx react-native spm scaffold` and maintain it yourself
until upstream catches up. The third option means you now own a build file for somebody else's
library — real, ongoing cost.

For a library you publish yourself, `scaffold` generates the starting point:

```bash
cd path/to/your-library
npx react-native spm scaffold
```

Ship the result alongside your `.podspec`, not instead of it. Most consumers are still on CocoaPods.

## How it works

CocoaPods generates an `.xcworkspace` that contains your project plus a generated `Pods` project, and
your app links against targets inside it. That is why `Podfile.lock` and the `Pods` directory matter
so much, and why a stale `Pods` directory produces link errors naming symbols rather than versions.

The SPM path does something different: it injects Swift package dependencies directly into your
`.xcodeproj`, and Xcode resolves them itself. There is no workspace, no generated second project, and
no Ruby.

Three consequences follow:

1. **Your `project.pbxproj` is modified.** That is why the command prompts before touching a dirty
   one, and why reviewing the diff is not optional.
2. **Xcode owns resolution.** Package resolution state lives in Xcode's own files rather than in a
   `Podfile.lock` you read.
3. **Codegen still runs.** React Native's Codegen step is independent of the dependency manager; the
   `--skipCodegen` flag exists for advanced cases where you drive it yourself.

## Platform differences

There is no cross-platform dimension here at all. Swift Package Manager is an Apple tool, the command
targets iOS and macOS, and Xcode runs only on macOS.

Android is completely unaffected: Gradle is the dependency manager there, nothing about this changes
it, and your `android/` folder needs no attention during this migration.

If your team develops on a mix of operating systems, note that anyone on Linux or Windows cannot
verify this change at all. Plan the review accordingly.

## Performance considerations

- **Prebuilt xcframeworks skip compilation.** The headers and binaries arrive rather than being
  built, which is the main source of the improvement people report. Measure on your own project
  before committing to a number.
- **CI stops installing Ruby and CocoaPods.** On a hosted macOS runner that is a real saving per job,
  and it removes a class of failure where the runner image's Ruby changes under you.
- **First resolution is not free.** Xcode fetches and resolves packages on a cold checkout. Cache
  Xcode's derived data and package cache in CI, the same way you would cache `Pods`.
- **Do not migrate for speed alone.** The build-time difference is smaller than the risk of running an
  experimental path on a project that ships. Migrate because Ruby is a genuine problem for you, not
  because a benchmark looked good.

## Common mistakes

- **Running it on a dirty working tree.** Wrong: `npx react-native spm --deintegrate --yes` with
  uncommitted changes. Right: commit first. The command rewrites `project.pbxproj`, and without a
  clean baseline you cannot read the diff or revert it.
- **Passing `--yes` the first time.** Wrong: skipping the prompt on the first run. Right: let it
  prompt, and read what it says. The prompt guards the single most destructive step.
- **Assuming `--deintegrate` is its own action.** Wrong: expecting `spm --deintegrate` to only remove
  CocoaPods. Right: it is a flag on the `add` action — it deintegrates **and** injects. `spm deinit`
  is the command that reverses setup.
- **Migrating before checking `Package.swift` coverage.** Wrong: starting the migration and
  discovering mid-way that a core dependency ships only a podspec. Right: audit first. That audit is
  the decision, not a formality.
- **Deleting the `Podfile` and `Gemfile` immediately.** Wrong: removing the rollback path on day one.
  Right: keep them in git until the SPM build has survived a full release cycle. This is
  experimental; you will want the way back.
- **Leaving the bare `RCTAppDelegate.h` import.** Wrong: `#import <RCTAppDelegate.h>`. Right:
  `#import <React/RCTAppDelegate.h>`. The bare form only ever worked because CocoaPods flattened
  header search paths.
- **Recommending it to a team shipping next week.** Wrong: adopting an experimental build path under
  release pressure. Right: a branch, an afternoon, and a decision made with evidence. CocoaPods
  remains the supported default.

## Related topics

- [0.87 Breaking Changes](breaking-changes-087.md) — including the header change, which applies to everyone.
- [The Upgrade Helper Workflow](upgrade-helper-workflow.md) — the iOS half of a normal upgrade.
- [Native Dependency Compatibility](native-dependency-compatibility.md) — auditing what your libraries actually ship.
- [Running on iOS](../getting-started/running-on-ios.md) — the CocoaPods path that remains the default.
- [Publishing a Native Library](../native-modules/publishing-a-native-library.md) — shipping a `Package.swift` alongside your podspec.
- [CI for Mobile](../testing/ci-for-mobile.md) — what removing Ruby does to a macOS runner.
- [Troubleshooting](../reference/troubleshooting.md) — iOS build failures and their causes.
