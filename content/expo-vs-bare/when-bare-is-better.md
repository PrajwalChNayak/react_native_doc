---
title: When the Bare CLI Is Better
description: The specific situations where the React Native Community CLI is the better toolchain than Expo SDK 57 — and the situations people cite that turn out not to be reasons.
status: current
toolchain: expo
sdk: 57
---

Expo is the lower-maintenance default for most new React Native apps. It is not the right answer
for every project. This page lists the cases where the
[React Native Community CLI](../getting-started/introduction.md) genuinely fits better, with the
reason each one bites, and then the common objections that do not hold up.

"Bare" on this site means the Community CLI toolchain. It is not a mode of Expo.

## Why it exists / when to use it — and when NOT to

Read this when Expo has been proposed and someone has a concern, or when you are deciding whether
an existing Expo app has outgrown its toolchain. Check each case against your actual requirements —
"we might need that someday" is a weak basis for giving up generated native projects.

## The cases where the CLI is better

### 1. You need a React Native version the SDK does not ship

SDK 57 pins **React Native 0.86.3**. The CLI can be on **0.87.1** today. Upgrading React Native
independently of the SDK is not supported, so if you need something that landed in 0.87 — a
bug fix, a platform requirement, an API — and cannot wait for the next SDK, the CLI is the only
supported route.

Test this claim honestly: name the specific change in the newer React Native you need. If you
cannot, this is not your case.

### 2. You are adding React Native to an existing native app

Brownfield integration — a React Native screen inside an established iOS or Android codebase — is
what the CLI's model is built around. The native app is the host, and its project files are the
source of truth. Expo's generated-native model assumes the app *is* the Expo project.

You can use Expo modules inside such an app, but the generation model does not apply. See
[Adopting Expo in an Existing Bare App](adopting-expo.md) for what that realistically looks like.

### 3. Substantial hand-written native code lives in the app target

If the app target contains large amounts of custom Swift, Objective-C, Kotlin or Java — deeply
customised app delegates, multiple extension targets wired by hand, native SDKs integrated through
extensive project surgery — expressing all of it as config plugins can cost more than it saves.

Expo can still host this by committing the native directories, but at that point you have given
up generation and kept the SDK. Whether that is better than the CLI depends on how much you use the
SDK.

### 4. Native build files must be source-controlled and audited

Some organisations require every file in a shipped binary's build inputs to be reviewed. Generated
native projects conflict with that unless you commit them, which again removes the main benefit.

### 5. A library you depend on cannot work with generation

Rare, but real: a native SDK whose installation requires manual project edits that no one has
written a plugin for, and which would be fragile as a plugin. Check first — many libraries need no
native configuration beyond autolinking, and many ship plugins.

### 6. You want no dependence on a vendor's release cadence

Expo is open source and EAS is optional, but the SDK's release timing still determines when you
get a new React Native and when SDK bugs are fixed. A team that wants to own that timing entirely is
better served by the CLI.

## Basic example — the test in one table

| Question | If yes |
| --- | --- |
| Do you need a React Native release newer than 0.86.3 now? | CLI |
| Is this an existing native app gaining React Native screens? | CLI |
| Does the app target contain native code no plugin or module can reasonably hold? | CLI, or Expo with committed native directories |
| Must native project files be audited source? | CLI, or Expo with committed native directories |
| Is there a required native SDK that cannot be integrated through config or autolinking? | CLI, after checking for a plugin |
| None of the above | Expo is usually cheaper to maintain |

## How it works — what you take on with the CLI

Choosing the CLI in these cases is correct, but it is not free:

- **Upgrades are native merges.** Each React Native release changes the template's native files;
  you reconcile them with yours using the Upgrade Helper. See the CLI half's
  [Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md).
- **You assemble your own SDK.** Camera, storage, notifications and the rest come from separate
  community libraries you vet and version individually.
- **No first-party OTA updates or hosted builds.** The CLI half's
  [Over-the-Air Updates](../build-and-release/over-the-air-updates.md) page covers what is
  available instead.
- **Native modules follow the TurboModules path.** See
  [TurboModules End to End](../native-modules/turbomodules-end-to-end.md).

## Common patterns

### Reasons that are not reasons

These come up in almost every discussion, and none of them justifies the CLI on its own:

- **"Expo cannot use native libraries."** Expo *Go* cannot use native libraries it was not built
  with. A development build runs any native library. See
  [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).
- **"We will have to eject eventually."** Ejecting no longer exists; you can commit native
  directories at any time without leaving the SDK. See [Ejecting Is Not a Thing Any More](ejecting-is-gone.md).
- **"Expo forces EAS on us."** It does not; `npx expo run:android` / `run:ios` build locally.
- **"The CLI is faster at runtime."** Same React Native, same Hermes, same Fabric. Measure before
  claiming a difference.
- **"We need a custom native module."** The Expo Modules API and local modules exist for exactly
  this, and remain compatible with generation.

### Prototype the blocker, not the app

When a single requirement is pushing you toward the CLI, build only that requirement in an Expo
development build first. If it works with a plugin or a module, the reason is gone. If it does not,
you have your answer with evidence.

### Leaving Expo later is possible

If an Expo app eventually hits one of these cases, the move is supported. See
[Moving from Expo to Bare](moving-to-bare.md).

## Common mistakes

- **Choosing the CLI because of Expo Go's limitations.** Those are sandbox limitations, not
  toolchain limitations.
- **Choosing the CLI for a newer React Native "to be safe".** Name the change you need, or the
  version gap is not a cost.
- **Choosing the CLI and then rebuilding Expo's SDK piecemeal without budgeting for it.** Each
  community library is a separate compatibility and upgrade responsibility.
- **Assuming brownfield means Expo modules are off the table.** Individual Expo modules can be
  installed in a CLI app; only generation does not apply.
- **Deciding on a vague future requirement.** Committing native directories later is cheap;
  starting with the CLI and adopting Expo later is not.

## Related topics

- [An Honest Comparison](comparison.md) — both toolchains side by side.
- [What Expo Gives You and What It Costs](what-expo-costs.md) — the ledger.
- [Adopting Expo in an Existing Bare App](adopting-expo.md) — Expo modules inside a CLI app.
- [Moving from Expo to Bare](moving-to-bare.md) — leaving Expo when a case above applies.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the middle ground inside Expo.
- [Creating a Project](../getting-started/creating-a-project.md) — starting on the CLI half.
