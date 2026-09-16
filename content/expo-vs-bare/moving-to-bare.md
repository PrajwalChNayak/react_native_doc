---
title: Moving from Expo to Bare
description: Two very different things get called "moving to bare" — committing native directories while keeping the SDK, and removing Expo entirely. What each involves, what it costs, and why most teams should stop at the first.
status: current
toolchain: expo
sdk: 57
---

"Moving an Expo app to bare" is used for two different jobs, and confusing them leads teams to
plan months of work when they needed an afternoon — or an afternoon when they needed months.

| | Step 1: commit native directories | Step 2: remove Expo entirely |
| --- | --- | --- |
| What changes | `ios/` and `android/` become source; prebuild stops | Every Expo package, config and build hook is replaced |
| You keep | SDK packages, `npx expo`, Expo Router, EAS, dev client | React Native itself |
| React Native version | Still pinned by the SDK (0.86.3) | Yours to choose |
| Effort | A command and a commit | A migration project |
| Reversible | Yes, with effort | Only by adopting Expo again |

Step 1 is almost always what people need. Step 2 is only justified by a case in
[When the Bare CLI Is Better](when-bare-is-better.md).

## Why it exists / when to use it — and when NOT to

**Commit the native directories (step 1)** when you need hand-edited native code or audited native
projects, but the SDK and tooling still serve you.

**Remove Expo entirely (step 2)** only when you need something step 1 cannot give you — most often a
React Native version the SDK does not ship, or organisational independence from the SDK's release
cadence.

Do **not** remove Expo because of Expo Go limitations, because of "ejecting", or to avoid EAS. None
of those require it: development builds run any native library, ejecting no longer exists, and
local builds are free.

## Basic example — step 1: commit the native directories

```bash
git switch -c commit-native
npx expo prebuild
```

Then remove `/ios` and `/android` from `.gitignore`, commit both directories, and **stop running
`npx expo prebuild`** — remove it from scripts, CI and team habits.

> [!DANGER] After this point, prebuild destroys work
> In SDK 57 `npx expo prebuild` clears and regenerates the native directories by default. Once they
> are committed and hand-edited, one accidental run deletes the edits. Add a CI check that
> `git status --porcelain ios android` is empty after every build.

What changes day to day:

- Native changes are edits to native files, reviewed like any other source.
- Config plugins in `plugins` no longer apply. For a new library, follow its manual native setup.
- App config keys that affect native files (icons, identifiers, permissions) no longer drive the
  native projects; edit the native projects.
- SDK upgrades require merging native template changes by hand.

Full details: [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

## How it works — step 2: removing Expo entirely

This is a migration from one toolchain to another. It starts from step 1 — you need committed native
directories first — and then replaces each Expo dependency. The order below keeps the app building
at every stage.

### 1. Inventory what Expo is doing

List every Expo-owned piece in the project:

```bash
npm ls --depth=0 | grep -i expo
```

Then check `package.json` `main`, `app.json` / `app.config.ts`, `metro.config.js`,
`babel.config.js`, and the native projects for Expo hooks. In the SDK 57 default template:

| Piece | Expo's version |
| --- | --- |
| Entry point | `"main": "expo-router/entry"` in `package.json` |
| Routing | `expo-router` |
| Metro config | `@expo/metro-config`, a dependency of `expo` (the template ships no `metro.config.js`; if you have one, it typically extends `expo/metro-config`) |
| Babel preset | `babel-preset-expo`, a dependency of `expo` |
| Native modules | `expo-*` packages on `expo-modules-core` |
| iOS module registration | Expo autolinking via `use_expo_modules!` in the Podfile |
| Dev client | `expo-dev-client` |

### 2. Replace each SDK package

For every `expo-*` package, choose a community replacement, or keep it — Expo modules can run in a
CLI app, which is the [adoption](adopting-expo.md) path in reverse. Removing `expo` entirely
requires replacing **all** of them, because they depend on `expo-modules-core`.

This is usually the largest part of the work. Budget per package, and check each replacement's New
Architecture support and React Native compatibility with `npm view <pkg> version peerDependencies`.

### 3. Replace routing

Moving off Expo Router means replacing file-based routes in `src/app/` with explicit
navigators, typically React Navigation — see the CLI half's
[navigation section](../navigation/fundamentals.md).

### 4. Replace the entry point, Metro and Babel

A CLI app registers its root component with `AppRegistry` in `index.js`, and uses React Native's own
Metro config and Babel preset. Compare against a fresh CLI project rather than writing these from
memory:

```bash
npx @react-native-community/cli@latest init ReferenceApp
```

Copy the reference project's `index.js`, `metro.config.js`, `babel.config.js` and the related
`package.json` entries, then point the `main` field at the new entry.

### 5. Remove Expo from the native projects

Remove the Expo autolinking and module registration from the Podfile, Gradle settings and native
app entry points, using the reference project from step 4 as the target. Do this last, after no
JavaScript imports an Expo package.

### 6. Change the run commands

| Before | After |
| --- | --- |
| `npx expo start` | `npm start` |
| `npx expo run:android` | `npm run android` |
| `npx expo run:ios` | `npm run ios` |

### 7. Only then upgrade React Native

Once Expo is gone, React Native is yours to upgrade — for example from 0.86.3 to the CLI half's
0.87.1, using the [Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md). Do it as a
separate change. 0.87 turns on the Strict TypeScript API by default, which has its own migration:
[Strict TypeScript API](../migration/strict-typescript-api.md).

## Common patterns

### Stop at step 1 and re-evaluate

Commit the native directories, live with it for a release cycle, and write down what still blocks
you. If the list is empty, you are done. If it is only "a newer React Native", compare the timeline to
the next SDK release before committing to step 2.

### Keep EAS without Expo modules

EAS Build can build a React Native project; removing Expo modules does not by itself require leaving
EAS. Whether that combination suits you depends on the services you use — check the EAS docs for
your case rather than assuming either way.

## Common mistakes

- **Planning a full removal when committing native directories was enough.** Step 1 gives native
  freedom in an afternoon.
- **Removing Expo to escape Expo Go.** Development builds are the answer; Expo Go is a sandbox.
- **Committing native directories and continuing to run prebuild.** It clears and regenerates them,
  deleting the hand edits step 1 exists to allow.
- **Removing `expo` before replacing every `expo-*` package.** They depend on `expo-modules-core`; the
  build breaks.
- **Upgrading React Native in the same change as removing Expo.** Two migrations at once make every
  failure ambiguous. Remove first, upgrade second.
- **Writing the CLI entry, Metro and Babel config from memory.** Generate a reference CLI project and
  copy from it.

## Related topics

- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — step 1 in detail.
- [When the Bare CLI Is Better](when-bare-is-better.md) — the cases that justify step 2.
- [Ejecting Is Not a Thing Any More](ejecting-is-gone.md) — why "leaving" is no longer a single command.
- [Adopting Expo in an Existing Bare App](adopting-expo.md) — the opposite direction.
- [Creating a Project](../getting-started/creating-a-project.md) — the CLI project to compare against.
- [Upgrade Helper Workflow](../migration/upgrade-helper-workflow.md) — upgrading React Native once Expo is gone.
