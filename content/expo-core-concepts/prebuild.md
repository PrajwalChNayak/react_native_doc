---
title: expo prebuild
description: npx expo prebuild generates ios/ and android/ from your app config. In SDK 57 it clears and regenerates them by default, destroying hand edits. The model, the flags, and the two strategies you must choose between.
status: current
toolchain: expo
sdk: 57
---

`npx expo prebuild` generates the native `ios/` and `android/` projects for an Expo app from the
[app config](app-config.md), installed packages and config plugins. It is the command that
implements [Continuous Native Generation](continuous-native-generation.md).

> [!DANGER] SDK 57 prebuild deletes the native directories first
> By default, `npx expo prebuild` **clears** `ios/` and `android/` and then **regenerates** them.
> Any change made by hand inside those directories — a Gradle tweak, an `AppDelegate` edit, a
> hand-added build phase, a custom `Info.plist` key — is **gone**.
>
> Verified in the installed `@expo/cli@57.0.24`: the option is computed as
> `clean: !args['--no-clean']`, and when it is true the CLI calls `fs.promises.rm` with
> `recursive: true, force: true` on each platform directory before copying the template.
>
> Before running prebuild on a project that already has native directories, decide which of the
> two strategies below you are following. Running prebuild over hand-edited native code is the
> single most common way to lose work in an Expo project.

## Why it exists / when to use it — and when NOT to

Use prebuild when the native directories are **build output**: you want them generated from
config, and you are prepared to regenerate them whenever the SDK, a native dependency or the app
config changes.

Do **not** run prebuild on a project whose `ios/` or `android/` contain hand edits you want to
keep. On such a project, prebuild is not a sync — it is a reset.

You often do not need to call it directly. `npx expo run:android` and `npx expo run:ios` call
prebuild **only when the platform directory does not exist**, and EAS Build runs it for projects
that do not commit native directories.

## Basic example

```bash
npx expo prebuild                      # clear and regenerate ios/ and android/
npx expo prebuild --platform android   # only android/ (-p is the alias)
npx expo prebuild --no-install         # skip npm install and CocoaPods
npx expo prebuild --no-clean           # apply config onto the existing folders instead of recreating them
```

Every flag above is listed in `npx expo prebuild --help` for SDK 57. The complete set:

| Flag | Effect |
| --- | --- |
| `--no-clean` | Apply changes to the existing native folders instead of recreating them |
| `--no-install` | Skip installing npm packages and CocoaPods |
| `-p, --platform <all\|android\|ios>` | Platforms to sync. Default `all` |
| `--template <template>` | Native project template: a local tar file, npm package or GitHub repo |
| `--skip-dependency-update <deps>` | Preserve the listed packages' versions in `package.json` |
| `--npm` / `--yarn` / `--pnpm` / `--bun` | Package manager for installs |

`--clean` is still accepted for compatibility, but it no longer changes anything: cleaning is
already the default.

> [!WARNING] `--no-clean` is not a safe mode for hand edits
> `--no-clean` skips the delete, but config mods still write into the existing native files.
> A plugin that sets a Gradle property or a plist key overwrites whatever is there. It reduces
> the blast radius; it does not make hand-edited native code and prebuild compatible.

On **Windows**, iOS generation is skipped with a warning telling you to run prebuild again from
macOS or Linux (read from `ensureValidPlatforms` in the installed CLI). Generating `ios/` on
Linux is allowed, but building it still needs Xcode on macOS.

## How it works

Read from `prebuild/prebuildAsync.js` in the installed CLI, in order:

1. **Loads `.env` files** and the app config.
2. **If cleaning and a native directory exists**, runs two guards:
   - a **git status check** — if the working tree has uncommitted changes and the terminal is
     interactive, it warns and asks `Continue with uncommitted changes?`; in a non-interactive
     terminal it warns and continues;
   - a **native module check** — if the directory is itself a native library rather than an app,
     it bails instead of deleting the library's code.
3. **Deletes** each platform directory.
4. **Copies the native template** for the SDK and updates `package.json` dependencies the
   template requires (prompting before installing).
5. **Runs config** — built-in handlers and every config plugin — against the fresh projects.
6. **Runs `pod install`** for iOS if needed and installs are enabled.

The git guard is your last line of defence, and it only helps if the native directories are
tracked by git. If they are ignored — as the default template does — deleting them is expected,
and there is nothing to warn about.

## Choosing a strategy

There are exactly two coherent ways to use prebuild. Every team needs to pick one and write it
down.

### Strategy 1: Stay fully CNG

- `ios/` and `android/` stay in `.gitignore`.
- Every native change is expressed in the app config, `expo-build-properties`, or a config plugin.
- You run prebuild freely — locally, in CI, on EAS — because the output is disposable.

| Gains | Costs |
| --- | --- |
| SDK upgrades are a version bump plus regenerate, with no native merge | You are limited to what config and plugins can express |
| Native config is reviewable as a small config diff | Complex native edits mean writing and maintaining a plugin |
| Any machine can reproduce the native projects from the repo | Debugging requires generating the projects first |
| Prebuild can never destroy work, because there is no hand-written work in the output | Plugin authors sometimes lag an SDK release |

### Strategy 2: Commit the native directories and stop running prebuild

- Run prebuild **once** to produce a starting point, commit `ios/` and `android/`, remove them
  from `.gitignore`.
- Edit native files directly from then on, like a CLI project.
- **Never run `npx expo prebuild` again** on this project, and make sure your build service does
  not either. Per docs.expo.dev, EAS Build does not run prebuild for a project that has `android`
  and `ios` directories, to avoid overwriting your changes.

| Gains | Costs |
| --- | --- |
| Full native freedom — any edit, any structure | Every SDK upgrade becomes a manual native merge |
| Native files are audited source, visible in review | Config plugins in `plugins` no longer apply automatically — you replicate their effects by hand |
| No dependence on plugin coverage | App config keys that affect native files (icons, permissions, identifiers) stop being the source of truth |
| Familiar to native engineers | One accidental `prebuild` wipes your edits, unless git catches it |

The comparison, including how to move between the two, is in
[CNG vs Committed Native Directories](cng-vs-committed-native.md).

### The failure mode: mixing them

The expensive situation is neither strategy: the directories are committed *and* someone runs
prebuild, or they are ignored *and* someone hand-edits them. Both end the same way — hand edits
silently disappear on the next regenerate, often on a different machine, often in CI.

## Common patterns

### Guard the CNG choice in CI

Under Strategy 1, make CI start from a clean generate so nobody depends on a locally hand-edited
tree:

```bash
npx expo prebuild --no-install
```

### Guard the committed choice in CI

Under Strategy 2, fail the pipeline if anything regenerates the native projects. A simple check
is that `git status --porcelain ios android` is empty after the build.

### Preview a plugin's output before committing to it

```bash
npx expo prebuild --platform android --no-install
```

Inspect `android/`, confirm the plugin did what you expected, then discard. Only do this in a
project following Strategy 1, or on a throwaway branch.

## Common mistakes

- **Running prebuild to "sync" a hand-edited project.** It deletes first. Wrong:
  `vim android/app/build.gradle` then `npx expo prebuild`. Right: express the change through
  `expo-build-properties` or a config plugin, then `npx expo prebuild`.
- **Relying on `--no-clean` to preserve hand edits.** Config still writes into the files. Some
  edits survive, some do not, and the ones that do not are the ones you forget.
- **Committing native directories and leaving plugins in `plugins` expecting them to apply.**
  Under Strategy 2 nothing regenerates, so plugin changes never reach native files.
- **Assuming the git guard protects you.** It only fires when the native directories are tracked
  and dirty. Ignored directories are deleted without a prompt, which is correct under CNG.
- **Following an old tutorial that says prebuild is a one-time "eject".** That model is gone;
  prebuild is designed to run repeatedly. See [Ejecting Is Not a Thing Any More](../expo-vs-bare/ejecting-is-gone.md).
- **Running iOS prebuild on Windows and expecting `ios/`.** The CLI skips iOS on Windows with a
  warning. Generate and build iOS on a Mac, or on EAS.

## Related topics

- [Continuous Native Generation](continuous-native-generation.md) — the model prebuild implements.
- [CNG vs Committed Native Directories](cng-vs-committed-native.md) — the strategy decision in detail.
- [The App Config](app-config.md) — the primary input.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — how to make native edits survive regeneration.
- [expo-build-properties](../expo-config-plugins/build-properties.md) — common Gradle and CocoaPods settings.
- [Ejecting Is Not a Thing Any More](../expo-vs-bare/ejecting-is-gone.md) — why prebuild replaced eject.
- [Expo CLI Reference](../expo-migration/cli-reference.md) — every command and flag.
