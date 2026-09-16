---
title: Choosing Expo or the Bare CLI
description: A decision framework for picking between Expo SDK 57 and the React Native Community CLI, including what each choice costs you later.
status: current
toolchain: expo
sdk: 57
---

[What Expo Actually Is](introduction.md) explains what Expo is. This page is about the
decision: which of the two toolchains this site documents should you start a project with,
and what does each choice cost you six months in.

The decision is less permanent than people assume — you can move in either direction — but
the moves are not free, and the cost is asymmetric. Adding Expo to an existing native
codebase is harder than starting on Expo and taking the native directories over later.

## Why it exists / when to use it — and when NOT to

### Start from the native surface you need, not from preference

Almost every real answer falls out of one question: **can every native change your app needs
be expressed in configuration?**

Expo generates `ios/` and `android/` from your app config and installed packages. If the
native changes you need are covered by SDK packages, by an existing config plugin, or by a
plugin you can write, Expo handles the native build pipeline and you never open Xcode or
Android Studio for build reasons. If they are not, you are fighting the toolchain.

The question is narrower than it sounds, because config plugins can edit `Info.plist`,
entitlements, `AndroidManifest.xml`, Gradle files and Xcode project settings. What they
cannot do well is maintain a large body of hand-written native code that lives inside the
app target itself.

### Decision table

| Your situation | Choose | Why |
| --- | --- | --- |
| New app, no existing native code | **Expo** | The native projects are generated and upgraded for you. |
| You need a library with custom native code that has a config plugin, or needs no native config | **Expo** | A [development build](../expo-development-builds/why-you-need-one.md) covers this. Common. |
| You want file-based routing, typed routes and deep links out of the box | **Expo** | [Expo Router](../expo-router/fundamentals.md) ships in the default template. |
| You need over-the-air updates with a first-party path | **Expo** | EAS Update. The CLI half has no first-party equivalent. |
| Adding React Native to an existing native iOS/Android app | **Bare CLI** | See [Adopting Expo in an Existing Bare App](../expo-vs-bare/adopting-expo.md) before assuming otherwise. |
| A large body of hand-written native code lives in the app target | **Bare CLI** | Generation and hand-edited native code conflict. See [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md). |
| Your build must run on infrastructure that cannot use generated native projects | **Bare CLI** | Or Expo with committed native directories, which gives up the main benefit. |
| You need a React Native version newer than the SDK ships | **Bare CLI** | SDK 57 pins React Native 0.86.3, and that pin is not negotiable. |

Anything not in that table is usually Expo, because the generated-native default is cheaper
to maintain and you can still take the native directories over later.

### What each choice actually costs

**Choosing Expo costs you:**

- **React Native version control.** SDK 57 is on **React Native 0.86.3**. You cannot upgrade
  React Native on its own; the SDK pins it and the SDK packages are compiled against it. The
  CLI half of this site is on 0.87.1 — a version you cannot have on SDK 57.
- **Direct native editing, unless you give up generation.** Hand-edited `ios/`/`android/`
  and `npx expo prebuild` are mutually exclusive. Picking one is a real decision, covered in
  [expo prebuild](../expo-core-concepts/prebuild.md).
- **Some bundle size**, because `expo` and `expo-modules-core` are always present.
- **A vendor relationship for the optional services.** EAS is paid with a free tier. It is
  not required — `npx expo run:android` and `npx expo run:ios` build locally — but the
  smoothest paths in the ecosystem assume it.

**Choosing the bare CLI costs you:**

- **Owning every native upgrade by hand.** React Native upgrades become three-way merges
  across `ios/` and `android/`.
- **Assembling the SDK yourself.** Camera, secure storage, notifications, file system and
  the rest come from separate community packages you version and vet individually.
- **No first-party OTA updates, no first-party build service.** You build the equivalents or
  do without.

### What is NOT a reason to avoid Expo

- **"Expo cannot use native modules."** It can. The thing that cannot is **Expo Go**, which
  is a sandbox app, not the toolchain. A development build runs any native dependency you
  install. This confusion is the single most common reason people reject Expo for the wrong
  reason — see [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).
- **"You have to eject eventually."** That path does not exist any more in the form people
  remember. See [Ejecting Is Not a Thing Any More](../expo-vs-bare/ejecting-is-gone.md).
- **"Expo forces you onto their servers."** It does not. Local builds are supported.

## Basic example

The two starting commands, so the difference is concrete:

:::tabs
@tab Expo
```bash
npx create-expo-app@latest MyApp
cd MyApp
npx expo start
```
@tab Bare CLI
```bash
npx @react-native-community/cli@latest init MyApp
cd MyApp
npm run android
```
:::

The Expo project has no `ios/` or `android/` directory. The default template's `.gitignore`
lists `/ios` and `/android` under "generated native folders" — the toolchain treats them as
build output. The CLI project has both, committed, and you maintain them.

## How it works

### The two toolchains are not far apart at runtime

An Expo app is a React Native app. Same Fabric renderer, same Hermes engine, same `View` and
`Text`. The difference is entirely in the build pipeline and the library set, which is why
moving between them is possible at all.

What differs is:

| | Expo SDK 57 | React Native Community CLI |
| --- | --- | --- |
| React Native | 0.86.3 | 0.87.1 |
| `ios/` and `android/` | Generated from config | Committed, maintained by you |
| Adding a native dependency | `npx expo install`, then rebuild the dev client | Install, then `pod install` / Gradle sync |
| Upgrade | Bump the SDK, regenerate | Upgrade Helper, merge native diffs by hand |
| Native config | App config plus config plugins | Edit the native files directly |

> [!WARNING] Code does not copy between the two halves of this site
> The CLI sections target React Native 0.87, where the Strict TypeScript API is the default
> and each component has its own dedicated ref instance type. **None of those types exist in
> 0.86**, so a CLI snippet pasted into an Expo project will not compile. On this half you
> type a ref by the component itself: `useRef<TextInput | null>(null)`. The full list of what
> differs is in [What Expo Actually Is](introduction.md).

### The escape hatches, in order of cost

If Expo stops fitting, you do not go straight to a rewrite. In increasing order of cost:

1. **Install an SDK package or a community library with a config plugin.** No native code,
   no decision made.
2. **Use [`expo-build-properties`](../expo-config-plugins/build-properties.md)** for Gradle
   and CocoaPods knobs — deployment targets, compile SDK, Proguard.
3. **Write a config plugin** for the native edit you need. This keeps generation working and
   is the intended answer for most native configuration.
4. **Write a local Expo module** in Kotlin or Swift, inside your repo. Still generated, still
   upgradable. See [Local Modules](../expo-native-code/local-modules.md).
5. **Commit the native directories and stop running prebuild.** Full native freedom, and you
   now own upgrades by hand. Covered in
   [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

Steps 1 through 4 keep the main benefit. Only step 5 gives it up, and most projects never
reach it.

## Common patterns

### Decide once, write it in the README

The failure mode is not picking wrong; it is not picking at all. A team where one engineer
hand-edits `android/app/build.gradle` and another runs `npx expo prebuild` will lose work,
repeatedly, and nobody will know why. Record the decision where a new joiner will see it.

### Prototype in Expo even when you suspect you need bare

Starting in Expo and moving out later is cheaper than starting bare and adopting Expo later,
because the generated native projects are a valid starting point for a committed-native
project — the reverse is not true. If you are genuinely unsure, start on Expo.

### Do not choose on ecosystem fear

Check the specific library you are worried about before deciding. Most popular native
libraries either ship a config plugin or need no native configuration beyond autolinking.
[Using Community Plugins](../expo-config-plugins/using-community-plugins.md) covers how to
check.

## Common mistakes

- **Rejecting Expo because "Expo Go cannot run native modules."** True of Expo Go, irrelevant
  to the toolchain. Development builds run anything. Deciding on this basis is deciding on a
  sandbox limitation.
- **Choosing bare to get a newer React Native, without checking whether you need it.** SDK 57
  gives you 0.86.3. If nothing you need landed in 0.87, this is not a reason.
- **Assuming Expo means EAS and a monthly bill.** `npx expo run:android` and
  `npx expo run:ios` build on your own machine with no account.
- **Choosing Expo and then hand-editing `ios/`.** That combination is the one that destroys
  work. Pick generated or committed, not both.

  ```bash
  # Wrong: edits by hand, then regenerates over them
  vim ios/MyApp/Info.plist
  npx expo prebuild

  # Right: express it in the app config, then regenerate
  #   ios.infoPlist in app.json, or a config plugin
  npx expo prebuild
  ```

- **Treating the choice as irreversible.** It is not, but the cost is asymmetric: Expo to
  committed-native is a supported path; existing-native to Expo is an adoption project.
- **Copying a version number from a CLI page.** Every shared library is pinned differently.
  `react-native-gesture-handler` is `~2.32.0` on SDK 57 and 3.3.0 on the CLI half — a whole
  major version apart.

## Related topics

- [What Expo Actually Is](introduction.md) — the SDK, the CLI and the services, and the version pairing.
- [Prerequisites](prerequisites.md) — what to install before either path.
- [An Honest Comparison](../expo-vs-bare/comparison.md) — the same comparison in more detail.
- [What Expo Gives You and What It Costs](../expo-vs-bare/what-expo-costs.md) — the ledger.
- [When the Bare CLI Is Better](../expo-vs-bare/when-bare-is-better.md) — the cases that genuinely do not fit.
- [Adopting Expo in an Existing Bare App](../expo-vs-bare/adopting-expo.md) — the harder direction.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the decision inside Expo.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — why the sandbox limitation is not a toolchain limitation.
