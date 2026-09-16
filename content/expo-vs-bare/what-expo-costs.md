---
title: What Expo Gives You and What It Costs
description: A ledger of what Expo SDK 57 provides over the bare React Native CLI and what you pay for it — in React Native version control, native flexibility, app size, vendor dependency and money.
status: current
toolchain: expo
sdk: 57
---

Every toolchain trades something. This page is the ledger for Expo: each benefit next to the cost
that comes with it, without promotional language and without pretending the costs are zero.

The baseline for comparison is the React Native Community CLI, documented in the
[CLI half of this site](../getting-started/introduction.md).

## Why it exists / when to use it — and when NOT to

Use this page when you need to justify a toolchain choice to someone else — a lead, a native
team, a finance owner — and want both columns in one place.

It is not a recommendation. If the costs below are acceptable for your project, Expo is usually
cheaper to maintain. If one of them is a hard blocker, read
[When the Bare CLI Is Better](when-bare-is-better.md).

## What you get

### Generated native projects

`ios/` and `android/` are produced from your app config by
[Continuous Native Generation](../expo-core-concepts/continuous-native-generation.md). Upgrades do
not involve merging native template changes into hand-edited files, because there are no
hand-edited files.

### One SDK, one version line

About 120 native packages (`expo-camera`, `expo-image`, `expo-secure-store`, `expo-notifications`,
`expo-sqlite` and so on), released together, tested against one React Native version, with the
community libraries the SDK tracks pinned alongside. `npx expo install` picks matching versions for
you. See [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

### Tooling around the build

- `create-expo-app` templates with Expo Router, typed routes and the React Compiler experiment
  already enabled in the SDK 57 default.
- Development builds via `expo-dev-client`, with a launcher and dev menu.
- Config plugins as a structured way to change native projects.
- The Expo Modules API for writing native modules in Swift and Kotlin.
- Web output from the same project.

### Optional hosted services

EAS Build, Submit, Update and Workflows. EAS Update in particular fills a gap the CLI has no
first-party answer for.

## What it costs

### 1. React Native version control

SDK 57 ships **React Native 0.86.3**. The CLI half of this site is on **0.87.1**. You cannot
upgrade React Native independently of the SDK — the SDK packages are compiled against its React
Native version.

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | 0.83.10 |
| SDK 56 | 0.85.3 |
| SDK 57 | 0.86.3 |

The concrete cost today: React Native 0.87 features such as the Strict TypeScript API by default
and experimental Swift Package Manager support are not available to an SDK 57 project. Code written
for 0.87 — for example, refs typed with 0.87's per-component instance types — does not compile on
0.86, where you type a ref by the component itself: `useRef<TextInput | null>(null)`.

### 2. Native flexibility, or the upgrade benefit — pick one

Under CNG, native changes must be expressible as config or config plugins. When they are not, you
either write and maintain a plugin, move the code into a module, or
[commit the native directories](../expo-core-concepts/cng-vs-committed-native.md) and give up
generated upgrades.

And the constraint is sharp: in SDK 57, [`npx expo prebuild`](../expo-core-concepts/prebuild.md)
clears and regenerates the native directories by default. Hand edits under CNG are not merely
discouraged; they are deleted.

### 3. Another layer to understand

When a native build fails in an Expo project, the failing file was generated. Debugging means
understanding the app config, the plugin that wrote the line, and the native project — one more
layer than a CLI project, where the file is simply yours.

### 4. App size

`expo` and `expo-modules-core` are present in every Expo app, and SDK packages add their own
native code. The overhead depends on which packages you use; this page does not quote a number
because none was measured for SDK 57. If size is a constraint, measure a release build of your own
app on both toolchains.

### 5. Pace and priorities set by someone else

A bug in an SDK package is fixed on the SDK's release schedule. A community library that has not
shipped a config plugin or SDK-compatible release blocks you until it does, or until you patch it.
On the CLI you face the same library problems, but without the SDK in the middle.

### 6. Money, if you use EAS

EAS is a **paid hosted service with a free tier**. Build queues, concurrency and update audience
depend on the plan. Plans and prices change, and none are quoted here; check Expo's pricing page at
decision time and see [Costs and Limits](../expo-eas/costs-and-limits.md).

EAS is not required:

```bash
npx expo run:android     # local debug build, no account
npx expo run:ios         # macOS with Xcode
eas build --local        # EAS build pipeline on your own machine
```

The honest caveat is that the smoothest documented paths — especially OTA updates via EAS Update —
assume the hosted service. Replacing EAS Update with your own infrastructure is possible but is a
real project.

### 7. Expo Go is not the product

Expo Go is a sandbox with a fixed module set. Teams that plan around it discover the first time
they add a native library that it fails at runtime. The real development loop is a development
build, which costs a native build per native change. See
[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).

## Basic example

The ledger, compressed:

| You get | You pay |
| --- | --- |
| Generated native projects, cheap upgrades | Native changes via config and plugins; prebuild deletes hand edits |
| One SDK version line | React Native pinned to 0.86.3; no independent upgrade |
| `npx expo install` version matching | Moving at the SDK's pace |
| Development builds with launcher and dev menu | A rebuild for every native change |
| Expo Router, templates, web | Conventions you adopt rather than choose |
| EAS Build, Submit, Update | Paid beyond the free tier; vendor dependency |
| Expo Modules API | Another native module API alongside TurboModules |

## Common mistakes

- **Counting EAS as a mandatory cost.** It is optional; local builds are free.
- **Counting Expo Go's limits as Expo's limits.** Development builds run any native library.
- **Ignoring the React Native pin.** If your roadmap depends on a feature in the next React Native
  release, the pin is the cost that matters most.
- **Quoting a size overhead without measuring.** Measure your own release build.
- **Assuming committing native directories removes all the costs.** It removes the plugin
  constraint and the upgrade benefit together; the React Native pin remains.

## Related topics

- [An Honest Comparison](comparison.md) — both toolchains side by side.
- [When the Bare CLI Is Better](when-bare-is-better.md) — where the costs become blockers.
- [EAS Overview](../expo-eas/overview.md) — what the hosted services do.
- [Building Locally](../expo-eas/local-builds.md) — the no-account path.
- [SDK to React Native Pairing](../expo-migration/sdk-react-native-pairing.md) — the version pin in detail.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the flexibility trade-off.
