---
title: Creating a Project
description: Create a React Native 0.87 app with the Community CLI, pin the version deliberately, and get it running on both platforms.
status: current
toolchain: cli
---

With the toolchain in place, creating a project is one command. The parts worth understanding are
which command, which version it gives you, and what to do in the first ten minutes after it
finishes — because a project created carelessly is a project you will re-create.

This page assumes you have worked through [Environment Setup](environment-setup.md). If
`npx @react-native-community/cli@latest doctor` reports missing pieces, fix those first; `init`
will succeed regardless and then fail at build time, which is a much worse place to debug.

## Remove any global CLI first

```bash
npm uninstall -g react-native-cli @react-native-community/cli
```

This is not optional housekeeping. `react-native-cli` was the old global package, and a copy left
on your machine from 2021 intercepts `react-native` commands and reports errors from a CLI that
predates the New Architecture entirely. Symptoms include `Unrecognized command "start"`,
templates that do not match the docs, and Gradle configuration errors referencing files your
project does not have.

The supported invocation is `npx`, which runs a specific version and leaves nothing behind.

## Create the project

```bash
npx @react-native-community/cli@latest init AwesomeProject
```

That gives you the latest stable React Native — 0.87.1 at the time of writing — with the
`@react-native-community/cli` 20.2.0 toolchain, a TypeScript entry point, and both native
projects generated in full.

The project name becomes the Android application ID and the iOS bundle identifier, and renaming
it afterwards means touching Gradle files, Xcode project settings, Java package directories and
`Info.plist`. Choose a name you can live with. Use PascalCase with no spaces, hyphens or leading
digits.

:::tabs
@tab npm
```bash
npx @react-native-community/cli@latest init AwesomeProject
cd AwesomeProject
```
@tab yarn
```bash
npx @react-native-community/cli@latest init AwesomeProject --pm yarn
cd AwesomeProject
```
@tab pnpm
```bash
npx @react-native-community/cli@latest init AwesomeProject --pm pnpm
cd AwesomeProject
```
:::

> [!NOTE] pnpm and React Native
> pnpm's symlinked `node_modules` layout works, but some native libraries assume a flat tree and
> autolinking occasionally needs `node-linker=hoisted` in `.npmrc`. If you have no specific reason
> to choose pnpm for a React Native project, npm or yarn is the lower-friction default.

## Pin the version deliberately

`@latest` is right when you are starting something new today. It is wrong when you are recreating
a project to match an existing one, reproducing a bug report, or writing instructions that have to
still work next quarter.

```bash
npx @react-native-community/cli@X.XX.X init AwesomeProject --version X.XX.X
```

Both halves matter and they are different things:

| Part | What it pins |
| --- | --- |
| `@react-native-community/cli@X.XX.X` | The **CLI** that scaffolds the project |
| `--version X.XX.X` | The **React Native** version written into `package.json` and used for the template |

Pinning only one produces a mismatch: a new CLI generating an old React Native template, or the
reverse. Pin both to versions that were released together.

> [!WARNING] 0.84.x and older are unsupported
> If you are pinning a version, pin something from the supported window. React Native **0.84 and
> earlier are unsupported** — no patches, no security fixes, and no help from the community when
> a dependency drops them. If you are inheriting a project below that line, treat upgrading as the
> first task, not a later one. See
> [The Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md).

## What version did you actually get

Do not trust the release announcement; read the project.

```bash
cat package.json
npm ls react-native react
node -p "require('react-native/package.json').version"
```

For 0.87.1 you should see `react-native` at 0.87.1, and its peer dependencies satisfied:
`react` at `^19.2.3` and `@types/react` at `^19.1.1`. The template pins these for you.

> [!TIP] Pin React to the peer range, not to the newest React
> React 19.3.0 exists, but `react-native@0.87.1` declares its peer as `^19.2.3`. Upgrading React
> ahead of React Native gains you nothing and risks renderer mismatches, because the React Native
> renderer is versioned against a specific React. Let React Native lead.

## Install native dependencies

Android needs nothing extra — Gradle resolves everything on the first build.

iOS needs CocoaPods to link the native dependencies into the Xcode workspace. This step runs on
**macOS only**.

```bash
cd ios
bundle install
bundle exec pod install
cd ..
```

`bundle install` reads the generated `Gemfile` and installs the pinned CocoaPods version.
`bundle exec pod install` then generates `ios/AwesomeProject.xcworkspace`. From that point on you
open the **`.xcworkspace`**, never the `.xcodeproj`.

> [!NOTE] The CLI can do this for you
> `init` runs `pod install` automatically on macOS unless you pass `--skip-install`. If you
> skipped it, or you are on a machine where it failed, the commands above are the manual
> equivalent.

## Run it

Start Metro in one terminal and leave it running:

```bash
npm start
```

Then, in a second terminal:

:::tabs
@tab Android
```bash
npm run android
```

Requires a booted emulator or a connected device with USB debugging enabled.
@tab iOS
```bash
npm run ios
```

macOS only. Boots the default simulator if none is running.
:::

The first build compiles native code and will take several minutes on both platforms. Subsequent
builds are incremental and much faster. If a build fails, do not start changing files at random —
[Running on Android](running-on-android.md) and [Running on iOS](running-on-ios.md) walk through
the specific failures and what each one means.

## The first ten minutes after `init`

Four things are worth doing before you write any feature code.

### 1. Commit immediately

`init` runs `git init` and makes an initial commit unless you passed `--skip-git-init`. Verify
that, then push. A clean "generated, unmodified" commit is the reference point you will diff
against for the entire life of the project — particularly during upgrades.

```bash
git log --oneline
```

### 2. Opt out of the AGP 9 defaults

React Native 0.87 builds on Android Gradle Plugin 9, which turns on built-in Kotlin support and a
new DSL. Neither is what React Native's Gradle plugin expects yet.

```properties title=android/gradle.properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x, so this is temporary.
android.builtInKotlin=false
android.newDsl=false
```

Add these near the other React Native properties. They are recommended, not cosmetic: without
them you can hit Kotlin plugin conflicts that surface as unresolved React Native Gradle classes.

### 3. Confirm the Strict TypeScript API is active

Open `tsconfig.json`. It should read exactly this:

```json title=tsconfig.json
{
  "extends": "@react-native/typescript-config",
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/node_modules", "**/Pods"]
}
```

No `customConditions` entry. In 0.87 the **Strict TypeScript API is the default**, and the absence
of that key is what keeps it on. If you ever see `customConditions` with
`react-native-legacy-deep-imports` in it, someone added a temporary migration hatch — it works
only through 0.88 and is covered in
[Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md).

Prove it type-checks:

```bash
npx tsc --noEmit
```

### 4. Add `.env`-style secrets to `.gitignore` before you need them

The generated `.gitignore` covers build output, `node_modules`, Pods and Xcode user state. It
does not know about the environment file you are about to add. Add it now, while the repository
has nothing sensitive in it.

> [!DANGER] Nothing in the JavaScript bundle is secret
> Whatever you put in an environment file is compiled into the shipped bundle and can be read out
> of the installed app. Environment files are for configuration — API hostnames, feature flags,
> analytics keys that are public by design. They are not for secrets. See
> [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

## Upgrading later

There are two supported routes, and neither is "edit the version in `package.json`":

- **The React Native Upgrade Helper** shows a diff between any two versions across every generated
  file, including the native projects. You apply the diff to your own repository.
- **Re-init at a pinned version** into a scratch directory, then diff the generated project
  against yours. This is slower but more reliable when your native folders have drifted a long way.

Both are covered in [The Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md). The
0.87-specific removals you will have to deal with are listed in
[0.87 Breaking Changes](../migration/breaking-changes-087.md).

## Common mistakes

- **Running `npx react-native init`.** That form was removed. The CLI moved out of the
  `react-native` package; the current command is
  `npx @react-native-community/cli@latest init AwesomeProject`.
- **Leaving a global CLI installed.** Wrong: `npm i -g react-native-cli` then `react-native init`.
  Right: uninstall the globals, then use `npx`. A stale global binary is the most common source of
  errors that contradict the documentation.
- **Pinning the CLI but not React Native, or the reverse.** `npx @react-native-community/cli@20.2.0
  init App` alone still installs the latest React Native. Pass `--version` too.
- **Upgrading React ahead of React Native.** `react-native@0.87.1` declares `react` as `^19.2.3`.
  Installing React 19.3.0 to be current puts the renderer and React out of step.
- **Opening `ios/AwesomeProject.xcodeproj`.** With CocoaPods you must open
  `ios/AwesomeProject.xcworkspace`, or none of the pod targets are in the build and you get
  hundreds of missing-header errors.
- **Naming the project with a hyphen or a leading digit.** `my-app` and `2048` are not valid Java
  package fragments or Xcode target names, and the failure comes out as a Gradle or Xcode error
  rather than a clear message from `init`.
- **Choosing a version below 0.85.** 0.84.x and older are unsupported. Starting there means
  starting with a migration already owed.

## Related topics

- [Environment Setup](environment-setup.md) — do this first; `init` cannot fix a missing SDK.
- [Project Structure](project-structure.md) — every file `init` just generated, and why.
- [Running on Android](running-on-android.md) — first build, emulators, and Gradle failures.
- [Running on iOS](running-on-ios.md) — first build, simulators, and pod drift.
- [Your First Screen](your-first-screen.md) — replace the template screen with something real.
- [The Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md) — moving between versions.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — what 0.87 removed.
- [CLI Command Reference](../reference/cli-reference.md) — the full command and flag list.
