---
title: The Upgrade Helper Workflow
description: A repeatable process for moving a Community CLI project between React Native versions using the Upgrade Helper, one minor at a time.
status: current
toolchain: cli
---

Upgrading React Native is not `npm install react-native@latest`. The JavaScript dependency is the
small part; the `android/` and `ios/` folders you own contain template files that the React Native
team also changes every release, and nothing updates them for you.

The **React Native Upgrade Helper** solves exactly that problem. It is a web tool that diffs the
project template between any two versions, so you can see every change the template made and apply
each one deliberately.

<https://react-native-community.github.io/upgrade-helper/>

## Why it exists / when to use it — and when NOT to

When you run `init`, the CLI copies a template into your repository. From that moment the template
and your copy diverge: you add permissions to `AndroidManifest.xml`, you edit `Info.plist`, you
change the Gradle config, and upstream changes the same files for its own reasons. Nothing
reconciles the two.

The Upgrade Helper shows you the upstream half of that divergence. You apply the parts that matter,
skip the parts you have deliberately changed, and end up with a project that matches the new
version without losing your own work.

Use it for every upgrade that crosses a minor version. Do not use it for a patch bump within the
same minor — `0.87.0` to `0.87.1` almost never touches the template, and the diff will be empty.

There is one case where it is the wrong tool: a project several minors behind with heavy native
customisation. Past roughly four or five minors the accumulated diff is large enough that
re-initialising a fresh project at the target version and moving your source into it is faster and
produces a cleaner result. Use `git` to compare afterwards rather than trusting your memory of what
was custom.

## Basic example

The whole loop, for a single minor step:

```bash
# 0. Start clean. The diff is the deliverable; an unrelated dirty file ruins it.
git status --porcelain      # must be empty
git switch -c upgrade/0.87

# 1. Update the JavaScript dependencies to the target version.
#    react-native@0.87.1 peers react ^19.2.3 and @types/react ^19.1.1.
npm install react-native@0.87.1 react@19.2.3
npm install --save-dev @types/react@19.1.1 @react-native/typescript-config@0.87.1 \
  @react-native/babel-preset@0.87.1 @react-native/metro-config@0.87.1 \
  @react-native/eslint-config@0.87.1 @react-native/jest-preset@0.87.1

# 2. Apply the native template diff from the Upgrade Helper, file by file.
#    (Browser work — there is no command for this step.)

# 3. Reinstall native dependencies.
cd ios && bundle install && bundle exec pod install && cd ..

# 4. Clear every cache that can hold a stale artefact.
npx react-native clean

# 5. Check the toolchain before blaming the code.
npx react-native doctor

# 6. Build both platforms. This is the step that finds real breakage.
npm run android
npm run ios
```

Commit after each successful step. When something breaks two hours later you want to bisect your
own upgrade, not re-derive it.

## How it works

The Upgrade Helper renders `git diff` between two tags of the project template
(`@react-native-community/template`). Choose your current version and your target version, and it
shows every file the template changed.

Changes fall into four categories, and treating them differently is the whole skill:

**1. Version numbers.** `package.json` dependency versions, `gradle.properties` values, Gradle
plugin versions, `Podfile` platform lines. Apply these verbatim. They are the reason the upgrade
exists.

**2. Template files you have never touched.** `android/gradlew`, `android/build.gradle`,
`ios/Podfile`, `metro.config.js`, `babel.config.js`. Apply these verbatim too, then re-apply any
deliberate customisation on top.

**3. Files you have modified heavily.** `AndroidManifest.xml`, `Info.plist`,
`android/app/build.gradle`, `AppDelegate.swift`, `MainActivity.kt`. Apply the upstream change by
hand. A copy-paste here silently deletes your permissions, your URL schemes or your product
flavours.

**4. Files that no longer exist in your project.** If the template renamed or removed a file, the
diff will not say so loudly. Check the file list on both sides.

The Helper knows nothing about your project. It cannot tell you that a third-party library needs a
newer version, that a Gradle plugin you added conflicts with the new AGP, or that a deep import you
wrote is now a type error. Those come out of the build in step 6.

## Common patterns

### One minor at a time

Upgrading 0.81 to 0.87 as a single jump means every breaking change from six releases arrives at
once, and you cannot tell which one caused the failure in front of you. Step through the minors,
building at each stop.

The route matters for architecture reasons. 0.81 was the last version supporting both
architectures; 0.82 removed the Bridge entirely. Landing on 0.82 first and fixing what breaks there
separates architecture problems from everything else. See
[New Architecture Migration](new-architecture-migration.md).

> [!WARNING] 0.84.x and older are unsupported
> The intermediate versions you pass through on the way to 0.87 are not all supported destinations.
> Stop on them long enough to build and fix, then keep moving. Do not plan to ship from one.

### Pin the version you land on

`react-native@latest` resolves to a moving target, and two developers on the same branch can end up
on different versions. Pin the exact version and commit the lockfile:

```bash
npm install react-native@0.87.1 --save-exact
```

### Re-init when the diff is too large

For a project several minors behind, generate a fresh project at the target version and move into
it:

```bash
npx @react-native-community/cli@20.2.0 init AwesomeProject --version 0.87.1
```

Then copy across, in this order, checking each: your `src/` tree, your assets, your
`package.json` dependency list (re-resolved at current versions, not copied verbatim), then the
native customisations you can identify — permissions, URL schemes, signing config, flavours, and any
native code you wrote.

The reason this works is that it inverts the problem. Instead of "which upstream changes do I need",
the question becomes "which of my changes do I need", and you know the answer to that one.

### Verify the toolchain moved too

React Native 0.87.1 requires Node `^22.13.0 || ^24.3.0 || >= 26.0.0`, Kotlin 2.0 or newer (2.2.0 is
bundled), Android `minCompileSdk` 34 and `compileSdk` / `buildToolsVersion` 37. An upgrade that
leaves the toolchain behind fails in the build system rather than in your code, which sends people
looking in the wrong place.

```bash
node --version                 # must be >= 22.13.0
npx react-native doctor
npx react-native info
```

### Clear the caches that hold stale output

An upgrade that "did not take" is nearly always a cached artefact:

```bash
npx react-native clean                    # interactive; --include npm,metro,android,ios
watchman watch-del-all                    # if watchman is installed
rm -rf node_modules && npm ci
cd android && ./gradlew clean && cd ..
cd ios && rm -rf Pods build && bundle exec pod install && cd ..
```

### Read the release notes, not only the diff

The Helper shows file changes. It does not show removed JavaScript APIs, changed default behaviour
or deprecations. For 0.87 that list is substantial and lives in
[0.87 Breaking Changes](breaking-changes-087.md). Work through it as a checklist before you start,
so you recognise the failures when they appear.

## Platform differences

:::tabs
@tab iOS
The native diff is usually larger on iOS because `AppDelegate`, the Xcode project and the `Podfile`
all change. After applying it, delete `ios/Pods` and `ios/build` and run
`bundle exec pod install` — an incremental install over a changed `Podfile` frequently leaves stale
entries. Use `bundle exec` so the CocoaPods version comes from `Gemfile.lock`.

0.87 changed a header import: `#import <React/RCTAppDelegate.h>` replaces the bare form. Any native
file of yours that used the old spelling will not compile.

**All of this requires macOS.** There is no way to apply or verify the iOS half of an upgrade on
Linux or Windows.
@tab Android
Changes cluster in `android/build.gradle`, `android/app/build.gradle`, `gradle.properties` and the
Gradle wrapper. 0.82 moved to Android Gradle Plugin 9.0.0, and 0.87 documents two opt-outs worth
adding while the ecosystem catches up:

```properties title=android/gradle.properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x.
android.builtInKotlin=false
android.newDsl=false
```

Android upgrades can be verified on any operating system, which makes them the cheaper half to
attempt first.
:::

## Performance considerations

The upgrade itself is not a performance question, but two things are worth knowing:

- **The first build after an upgrade is slow and that is expected.** Gradle and Xcode rebuild
  everything. Do not interpret it as a regression.
- **Do not clear caches you did not need to.** `rm -rf node_modules` plus a Gradle clean plus a Pods
  reinstall costs a lot of wall-clock time. Clear the narrowest cache that explains the symptom, and
  only widen if it persists.

## Common mistakes

- **Upgrading with a dirty working tree.** Wrong: applying the template diff on top of uncommitted
  work. Right: commit or stash first. The upgrade diff is your only record of what changed; mixing
  it with unrelated edits makes it unreadable and un-revertable.
- **Copy-pasting a whole file from the Helper.** Wrong: replacing `AndroidManifest.xml` wholesale.
  Right: apply the upstream hunks by hand. A wholesale copy deletes your permissions and intent
  filters, and the app fails at runtime rather than at build time.
- **Jumping several minors in one step.** Wrong: 0.81 straight to 0.87. Right: one minor at a time,
  building at each. Six releases of breaking changes arriving together makes every failure
  ambiguous.
- **Updating `react-native` but not `react`.** Wrong: leaving React at an older version.
  Right: `react@19.2.3`, matching the `^19.2.3` peer. A peer mismatch produces renderer errors that
  read as application bugs.
- **Skipping `pod install`.** Wrong: building iOS straight after the JavaScript update. Right:
  `bundle exec pod install` after every native dependency change. A stale `Pods` directory produces
  link errors that name symbols, not versions.
- **Assuming the build passing means the upgrade is done.** Wrong: shipping on a green build. Right:
  work through [0.87 Breaking Changes](breaking-changes-087.md). Removed JavaScript APIs and changed
  runtime behaviour do not necessarily break the build; they break at runtime, on a user's device.
- **Not upgrading Node.** Wrong: staying on the Node version that worked last year. Right: 22.13.0
  or newer. The failures from an old Node are resolution and syntax errors that never mention Node.

## Related topics

- [0.87 Breaking Changes](breaking-changes-087.md) — the complete removal and deprecation checklist.
- [Migrating to the Strict TypeScript API](strict-typescript-api.md) — the 0.87 change that breaks the most existing code.
- [New Architecture Migration](new-architecture-migration.md) — what to do if you are on 0.81 or earlier.
- [Native Dependency Compatibility](native-dependency-compatibility.md) — checking your libraries before you start.
- [CocoaPods to Swift Package Manager](cocoapods-to-spm.md) — the experimental iOS alternative.
- [Creating a Project](../getting-started/creating-a-project.md) — `init` and version pinning, for the re-init route.
- [Environment Setup](../getting-started/environment-setup.md) — Node, JDK and SDK versions the upgrade assumes.
- [Troubleshooting](../reference/troubleshooting.md) — specific failures you will hit during an upgrade.
