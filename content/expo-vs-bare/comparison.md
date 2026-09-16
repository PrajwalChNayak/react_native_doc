---
title: An Honest Comparison
description: Expo SDK 57 against the React Native Community CLI, side by side — React Native version, native project ownership, upgrades, libraries, builds, updates and cost — with the weaknesses of each stated plainly.
status: current
toolchain: expo
sdk: 57
---

This site documents two toolchains for the same framework. The
[CLI half](../getting-started/introduction.md) uses the React Native Community CLI on React Native
**0.87.1**. This half uses **Expo SDK 57** on React Native **0.86.3**. Both produce React Native
apps with the same renderer (Fabric), the same engine (Hermes) and the same core components.

The differences are in who owns the native projects, which versions you can run, and which tools
surround the build. This page lays them out without recommending either as the default for
everyone.

## Why it exists / when to use it — and when NOT to

Read this page when you are choosing a toolchain for a new project, or when a team is arguing about
switching. For a shorter, decision-shaped version, read
[Choosing Expo or the Bare CLI](../expo-getting-started/choosing-expo-or-cli.md).

Do not read it as a verdict. Both toolchains are maintained, widely used and capable of shipping
large apps. The right answer depends on your native surface, your team and your constraints.

> [!NOTE] About the words "managed" and "bare"
> Older material divides Expo projects into a "managed workflow" and a "bare workflow". That
> framing is **retired**: it described an Expo project with or without native directories, with
> "eject" as a one-way door between them. Today the live distinction inside Expo is
> [CNG vs committed native directories](../expo-core-concepts/cng-vs-committed-native.md), and it
> is reversible. On this site, "bare" means only the React Native Community CLI toolchain.

## The comparison

| | Expo SDK 57 | React Native Community CLI |
| --- | --- | --- |
| React Native version | **0.86.3**, pinned by the SDK | **0.87.1**, or whichever version you choose |
| Upgrading React Native alone | Not supported — upgrade the SDK | Supported, via the Upgrade Helper |
| Time to a new React Native release | Waits for the next SDK | Available on release day |
| `ios/` and `android/` | Generated from config (or committed, if you choose) | Committed and maintained by you |
| Native configuration | App config, config plugins | Direct edits to native files |
| Upgrade effort | SDK bump, `npx expo install --fix`, regenerate | Three-way merge of native template changes |
| Native module library | ~120 SDK packages on one version line, plus community libraries | Community libraries, versioned and vetted individually |
| Installing native libraries | `npx expo install`, which picks SDK-matched versions | Package manager; compatibility is your job |
| Routing | Expo Router in the default template | Choose a library (React Navigation is typical) |
| Development app | Development build via `expo-dev-client`; Expo Go as a sandbox | Debug build of your app |
| Local builds | `npx expo run:android` / `run:ios`, `eas build --local` | `npm run android` / `npm run ios`, Gradle, Xcode |
| Hosted builds | EAS Build — paid, with a free tier | None first-party; bring your own CI |
| Over-the-air updates | EAS Update — paid, with a free tier | No first-party option |
| TypeScript API surface | Legacy types by default on 0.86 | Strict TypeScript API by default on 0.87 |
| Adding to an existing native app | Possible, but not the path it is designed for | The designed path |

## How it works — reading the table

### Version control is the biggest structural difference

Expo SDK 57 ships React Native 0.86.3, and **you cannot upgrade React Native independently** of the
SDK. Every SDK package is compiled against one React Native version, and `npx expo install --check`
will report a forced mismatch.

In practice this means an Expo project runs one React Native minor behind the latest for part of
each release cycle. Right now that gap is concrete: this site's CLI half documents 0.87 features
and APIs — the Strict TypeScript API by default, per-component ref instance types, Swift Package
Manager support — that an SDK 57 project does not have. If you need something that landed in 0.87
before the next SDK ships, the CLI is the only route.

Whether that matters depends entirely on whether you need the newer release. Most apps do not need
a React Native minor on its first day.

### Native ownership cuts both ways

Generating native projects removes upgrade merges and native drift. It also means native changes go
through config and plugins, which is an extra layer to learn and occasionally a limit. The CLI
gives you direct control and makes you pay for it at every upgrade.

Expo lets you take the native directories over — commit them and stop regenerating — without
leaving the SDK. That is closer to the CLI model, and it keeps the SDK and tooling while giving up
the upgrade benefit.

### The SDK is a real asset and a real dependency

A single version line for camera, file system, secure storage, notifications, images, video,
audio and the rest removes a lot of compatibility work. The cost is that you move at the SDK's
pace, and a bug in an SDK module is fixed on the SDK's schedule.

On the CLI, you assemble equivalents from community libraries. You choose each one and upgrade
each one, and a compatibility problem between two of them is yours to resolve.

### EAS is optional, and it is not free at scale

EAS Build, Submit, Update and Workflows are a hosted, paid service with a free tier. Queue
priority and concurrency depend on the plan. None of it is required: Expo apps build locally, and
EAS Update is the only piece with no simple self-built equivalent. Current prices and quotas change
and are not reproduced here — check Expo's pricing page when cost matters to the decision, and see
[Costs and Limits](../expo-eas/costs-and-limits.md).

## Common patterns

### Weaknesses, stated plainly

**Expo's genuine weaknesses:**

- React Native version lags the latest release, and cannot be moved independently.
- Native changes route through config and plugins; some are awkward to express.
- Library authors sometimes ship config plugins late for a new SDK.
- The most polished paths — hosted builds, OTA updates — assume a paid service.
- `expo` and `expo-modules-core` are always present in the app.

**The CLI's genuine weaknesses:**

- Every React Native upgrade is a native merge, and upgrades get skipped because of it.
- Native module selection, versioning and compatibility are entirely on you.
- No first-party OTA updates or hosted build service.
- Native projects drift across a team without discipline.

### Try both on your hardest requirement

If one feature is driving the decision — a specific native SDK, a background mode, an extension
target — build a small spike of exactly that in each toolchain before committing. A day of spike
beats a month of argument.

## Common mistakes

- **Comparing Expo Go with the CLI.** Expo Go is a sandbox with a fixed module set. The fair
  comparison is a development build, which runs any native library you install.
- **Assuming Expo means EAS.** Local builds are supported and free.
- **Assuming the CLI is "more native".** The runtime is identical. The difference is who maintains
  the native project files.
- **Choosing the CLI for a newer React Native without a concrete need.** A version gap is only a
  cost if you need what is in the newer release.
- **Choosing Expo and then hand-editing generated native files.** That is neither toolchain used
  correctly. Pick CNG or committed native directories.
- **Using "managed" and "bare workflow" to describe the choice.** Those terms describe a model that
  no longer exists and lead to wrong conclusions about ejecting.

## Related topics

- [Choosing Expo or the Bare CLI](../expo-getting-started/choosing-expo-or-cli.md) — the decision, in one page.
- [What Expo Gives You and What It Costs](what-expo-costs.md) — the ledger in detail.
- [When the Bare CLI Is Better](when-bare-is-better.md) — the cases that genuinely favour the CLI.
- [Ejecting Is Not a Thing Any More](ejecting-is-gone.md) — why the old framing is retired.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the choice inside Expo.
- [Introduction to the CLI half](../getting-started/introduction.md) — the other toolchain, on React Native 0.87.
