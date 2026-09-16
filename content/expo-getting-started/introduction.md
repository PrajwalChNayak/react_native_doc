---
title: What Expo Actually Is
description: Expo is an SDK, a CLI and a set of cloud services built on React Native — not a fork of it. What that means, and which React Native version SDK 57 gives you.
status: current
toolchain: expo
sdk: 57
allow-banned: expo-init, npm-install-sdk-package, rn-087-instance-types
---

Expo is three things that ship together:

- **An SDK** — a set of well-maintained native modules (`expo-image`, `expo-camera`,
  `expo-secure-store` and about 120 others) with a consistent API and a single version line.
- **A CLI and build system** — `create-expo-app`, `npx expo`, and Continuous Native Generation,
  which produces the `ios/` and `android/` directories from your config rather than having you
  hand-maintain them.
- **Optional cloud services** — EAS Build, Submit and Update. These are paid, with a free tier,
  and none of them is required to build or ship an Expo app.

**Expo is not a fork of React Native.** An Expo app is a React Native app. The same `View`,
`Text`, `StyleSheet`, Fabric renderer and Hermes engine, with an SDK and tooling layered on top.
Anything you know about React Native still applies.

## Which React Native do I actually have?

This matters more than anything else on this page, because this site documents **two**
toolchains and they are not on the same React Native version.

| | This half (Expo) | [The CLI half](../getting-started/introduction.md) |
| --- | --- | --- |
| Toolchain | Expo SDK 57 | React Native Community CLI |
| React Native | **0.86.3** | 0.87.1 |

Every page in the Expo sections is written and type-checked against **React Native 0.86.3**,
because that is what SDK 57 ships. Every page in the CLI sections targets 0.87.1.

> [!WARNING] Do not copy code between the two halves without checking
> The differences are real and they bite. React Native 0.87 made the Strict TypeScript API the
> default and introduced per-component ref types like `ViewInstance`. **Those types do not exist
> in 0.86 at all**, so a snippet copied from a CLI page into an Expo project will not compile.
> Going the other way, deep imports into `react-native/Libraries/` still resolve on 0.86 but are
> hard type errors on 0.87.
>
> Type a ref by the component itself on this half: `useRef<TextInput | null>(null)`.

### SDK and React Native version pairing

Read out of each release's own `bundledNativeModules.json`:

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | 0.83.10 |
| SDK 56 | 0.85.3 |
| **SDK 57** | **0.86.3** |

**Upgrading React Native independently of the SDK is not supported.** Each SDK targets exactly
one React Native version, and the SDK packages are built against it. If you force a different
version you are on your own, and `npx expo install --check` will tell you so.

The SDK trailing the latest React Native release by a version is normal, not a defect. The SDK
has to ship ~120 native modules that all work against a given React Native, which takes time
after that version lands.

## Why it exists / when to use it — and when NOT to

Use Expo when you want the native build pipeline handled for you: someone else maintains the
`ios/` and `android/` projects, upgrades are a config change rather than a merge conflict, and
the SDK covers the native surface most apps need.

Do **not** reach for Expo when:

- **You have a native codebase you must keep.** Adding React Native to an existing native app
  is the CLI's territory. See [Adopting Expo in an Existing Bare App](../expo-vs-bare/adopting-expo.md)
  for the honest assessment.
- **You need a native capability no SDK package or config plugin can express.** This is rarer
  than people assume — config plugins cover a lot — but it happens, and
  [When the Bare CLI Is Better](../expo-vs-bare/when-bare-is-better.md) says where the line is.
- **Your organisation requires the native projects under version control and audited.** You can
  still do this with Expo by committing the native directories, but at that point you have given
  up the main benefit. That trade-off is covered in
  [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

The comparison is laid out without sales pitch in [An Honest Comparison](../expo-vs-bare/comparison.md).

## Basic example

Creating a project takes one command. Note that it is **`create-expo-app`** — `expo init` was
removed and no longer exists.

:::tabs
@tab npm
```bash
npx create-expo-app@latest MyApp
cd MyApp
npx expo start
```
@tab yarn
```bash
yarn create expo-app MyApp
cd MyApp
yarn expo start
```
@tab pnpm
```bash
pnpm create expo-app MyApp
cd MyApp
pnpm expo start
```
@tab bun
```bash
bun create expo MyApp
cd MyApp
bun expo start
```
:::

The app that comes out is a normal React Native app with [Expo Router](../expo-router/fundamentals.md)
already wired up. A screen looks exactly like a React Native screen:

```tsx title=app/index.tsx
import {StyleSheet, Text, View} from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello from Expo SDK 57</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 18, fontWeight: '600'},
});
```

## How it works

### Continuous Native Generation

The idea that makes Expo different: **the `ios/` and `android/` directories are build output,
not source.** They are generated from your app config and the packages you have installed.

That is why upgrading an Expo SDK is usually a version bump and a regenerate, rather than the
three-way merge an upgrade requires when you own the native projects by hand.

The cost is that native changes have to be expressible in config. When they are not, you write
a [config plugin](../expo-config-plugins/what-they-are.md) — a small script that edits the
native files during generation.

> [!DANGER] `expo prebuild` deletes hand-edited native code
> In SDK 57, `npx expo prebuild` **clears and regenerates** the native directories by default.
> If you hand-edited `ios/` or `android/`, those edits are gone.
>
> Pick one strategy and stick to it: stay fully generated and express native changes as config
> plugins, or commit the native directories and stop running prebuild. Mixing the two is the
> single most common way to lose work. See [expo prebuild](../expo-core-concepts/prebuild.md).

### Always install SDK packages with `expo install`

```bash
npx expo install expo-image expo-secure-store
```

Never `npm install expo-image`. `npx expo install` looks up the version that matches your
**installed SDK** and installs that; a bare `npm install` fetches `latest`, which is routinely
built for a different SDK. Native module mismatches fail at runtime, not at install time, which
makes them miserable to diagnose.

`npx expo install --check` reports mismatches and `--fix` corrects them. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Expo Go vs development builds

New projects can run in **Expo Go**, a pre-built app from the store containing a fixed set of
native modules. It is a fast way to try the SDK.

It stops working the moment your project needs a native module Expo Go does not contain — which
in practice arrives early. At that point you need a **development build**: your own app binary,
containing your own native dependencies, with the same fast-refresh workflow.

This distinction is the thing beginners get wrong most often, and it has its own page:
[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md). Expo Go
is a sandbox; a development build is how real apps are developed.

## Common mistakes

- **Running `expo init`.** It was removed. The command is `npx create-expo-app@latest`. If a
  tutorial uses `expo init`, it predates SDK 50 and the rest of its advice is likely stale too.
- **Using `npm install` for SDK packages.** You will get a version built for a different SDK.
  Always `npx expo install`.
- **Copying React Native 0.87 code into an Expo project.** SDK 57 is on 0.86. `ViewInstance`,
  `TextInputInstance` and `HostInstance` do not exist for you.
- **Hand-editing `ios/` or `android/` and then running `prebuild`.** Your edits are deleted.
  Decide between generated and committed native directories, and write it down for the team.
- **Assuming Expo means EAS.** EAS is optional and paid. You can build locally with
  `npx expo run:android` / `run:ios`, or `eas build --local`.
- **Trying to upgrade React Native on its own.** Not supported. The SDK pins it.
- **Believing Expo Go is how real apps are built.** It is a sandbox with a fixed module set.

## Related topics

- [Choosing Expo or the Bare CLI](choosing-expo-or-cli.md) — the decision, in one page.
- [Prerequisites](prerequisites.md) — what to install before you start.
- [Creating a Project](creating-a-project.md) — templates, examples and what you get.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — the distinction that matters most.
- [Continuous Native Generation](../expo-core-concepts/continuous-native-generation.md) — why there is no `ios/` folder.
- [SDK to React Native Pairing](../expo-migration/sdk-react-native-pairing.md) — the full table and upgrade implications.
- [An Honest Comparison](../expo-vs-bare/comparison.md) — Expo against the bare CLI, without the sales pitch.
