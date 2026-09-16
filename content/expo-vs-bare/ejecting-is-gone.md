---
title: Ejecting Is Not a Thing Any More
description: expo eject was removed. What ejecting used to mean, what replaced it — prebuild plus a choice between generated and committed native directories — and why the new model is reversible.
status: current
toolchain: expo
sdk: 57
allow-banned: expo-eject, expo-init
---

> [!LEGACY] "Ejecting" is a retired term
> `expo eject` has been **removed** from the Expo CLI. Nothing on this page describes a command you
> can run today. It exists so that a reader arriving from an older tutorial, Stack Overflow answer
> or team wiki knows what replaced it.

"Ejecting" used to mean running `expo eject` to turn an Expo project that had no native directories
into one that had them — and, in the process, leaving much of Expo's tooling behind. It was
described as a **one-way door**: once you ejected, you owned `ios/` and `android/` by hand forever.

That model is gone. There is no eject step, no one-way door, and no point at which you "leave" the
SDK by gaining native directories.

## Why it exists / when to use it — and when NOT to

Read this page if:

- a tutorial tells you to run `expo eject`;
- someone on your team argues against Expo because "we will have to eject eventually";
- you are trying to understand why older material divides projects into a "managed workflow" and a
  "bare workflow".

Do not treat it as a how-to. The how-to pages are [expo prebuild](../expo-core-concepts/prebuild.md)
and [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

## Basic example

Run the old command against SDK 57's local CLI and it refuses. The migration map inside the
installed `@expo/cli@57.0.24` redirects it, and the CLI exits with:

```text
  $ expo eject is not supported in the local CLI, please use npx expo prebuild instead
```

The command it points to:

```bash
npx expo prebuild
```

> [!DANGER] Prebuild is not a one-time eject
> `expo eject` ran once. `npx expo prebuild` is designed to run **repeatedly**, and in SDK 57 it
> **clears and regenerates** `ios/` and `android/` by default. If you treat it like eject — run it,
> then hand-edit the output — the next run deletes your edits. Decide on a strategy first.

## How it works — what replaced ejecting

### The old framing

| Old term | What it meant |
| --- | --- |
| Managed workflow | An Expo project with no native directories; builds done by Expo's service |
| Bare workflow | A project with native directories, either created that way or ejected |
| Eject | The one-way transition from the first to the second |

Those terms no longer describe anything real. "Managed workflow" and "bare workflow" are used on
this page only to explain the retired framing.

### The current framing

Two things replaced it.

**1. Native directories are generated, not ejected.** [Continuous Native Generation](../expo-core-concepts/continuous-native-generation.md)
produces `ios/` and `android/` from the app config whenever they are needed. Having native
directories is not a state you transition into; it is build output that exists or does not.

**2. The real decision is whether the native directories are output or source.**

| Strategy | What you do | What it costs |
| --- | --- | --- |
| **CNG** | Keep `ios/` and `android/` out of git. Express native changes as config and plugins. Run prebuild freely. | Limited to what config and plugins can express |
| **Committed native directories** | Run prebuild once, commit the result, never run prebuild again. Edit native files directly. | You own every native upgrade by hand |

Choosing the committed strategy is the closest thing to what "ejecting" used to do — except:

- **you keep the SDK.** `expo-*` packages, `npx expo install`, Expo Router, the dev client and EAS all
  still work with committed native directories;
- **it is reversible.** You can return to CNG by re-expressing your native edits as config and
  plugins, then deleting the directories. That costs effort, but it is a supported path, not a wall.

### Why the change happened

The eject model forced a false choice between convenience with no native access and native access
with no tooling. Config plugins and the Expo Modules API removed most of the reasons to eject, and
Continuous Native Generation removed the idea that native directories were a permanent commitment.

## Common patterns

### Translating an old instruction

| Old instruction | Current equivalent |
| --- | --- |
| "Eject so you can add a native library" | Install it with `npx expo install` and create a [development build](../expo-core-concepts/expo-go-vs-development-builds.md). No native directory decision needed. |
| "Eject so you can edit `Info.plist`" | Use `ios.infoPlist` in the app config, or a config plugin. |
| "Eject so you can edit Gradle" | Use `expo-build-properties` or a config plugin. |
| "Eject so you can write native code" | Write an Expo module or a local module; keep CNG. |
| "Eject because you need full control" | Commit the native directories and stop running prebuild. |
| "Eject to stop using Expo's build service" | Nothing to do — `npx expo run:android` / `run:ios` build locally. |

### Recognising stale material

A tutorial that uses `expo eject`, `expo init`, or the managed/bare workflow split predates the
current model. Treat its other advice — versions, file locations, commands — as unverified too.

## Common mistakes

- **Running `npx expo prebuild` as if it were a one-time eject.** It deletes and regenerates by
  default. Hand edits after it will be lost on the next run unless you commit the directories and
  never run it again.
- **Rejecting Expo because "you have to eject eventually".** There is no eject. Committing native
  directories later is a single command and a commit, and you keep the SDK.
- **Believing committed native directories mean you have left Expo.** You still use the SDK and its
  tooling; only generation stops.
- **Installing the old global `expo-cli` to get `eject` back.** The model it implemented is gone,
  and the global CLI is not maintained for current SDKs.
- **Using "managed" and "bare workflow" in team documentation.** The terms carry the one-way-door
  assumption with them. Say "CNG" or "committed native directories".

## Related topics

- [expo prebuild](../expo-core-concepts/prebuild.md) — the command that replaced eject, and why it is destructive.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the decision eject used to make for you.
- [Continuous Native Generation](../expo-core-concepts/continuous-native-generation.md) — the model behind the change.
- [expo init and Other Removed Commands](../expo-migration/removed-commands.md) — the full old-to-new command map.
- [Moving from Expo to Bare](moving-to-bare.md) — if you genuinely want to leave the SDK.
- [An Honest Comparison](comparison.md) — Expo and the CLI without the retired framing.
