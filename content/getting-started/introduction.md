---
title: Introduction
description: What this handbook covers, why it targets the Community CLI, and what changed in React Native 0.87.
status: current
allow-banned: deep-import-libraries, new-arch-flag-android, new-arch-flag-ios, native-methods
toolchain: cli
---

This is a practical handbook for building, shipping and maintaining React Native apps with
the **React Native Community CLI**. It targets React Native `0.87.1` and assumes the New
Architecture, because as of 0.82 there is no other architecture to assume.

Everything here was checked against the npm registry and the installed `react-native` type
definitions on 2026-09-12. Where a version number appears, it is a real one that was read
from the registry rather than remembered.

## Why the CLI path, and a note on Expo

React Native has two mainstream setups. **Expo** is a framework built on top of React Native,
and the official React Native documentation recommends it for most new apps. It is a
reasonable default, and if you have no specific reason to avoid it, you should read their
docs instead of these.

This handbook deliberately covers the other path: **the framework-less Community CLI**, where
you own the `android/` and `ios/` folders outright. That path is the right one when you are
adding React Native to an existing native app, when you depend on native code that no managed
workflow will accommodate, when your build has to run inside an existing native CI pipeline,
or when your organisation needs the native projects under its own control.

That is the entire scope note. Expo, EAS and `expo-*` packages do not appear anywhere else in
this handbook — every command, dependency and example from here on uses the Community CLI.

## What changed, and why most tutorials are now wrong

If you search for React Native help, most of what you find describes an architecture that no
longer exists. This is the single biggest source of wasted time for people picking the
framework back up.

| Version | Date | What happened |
| --- | --- | --- |
| 0.76 | Oct 2024 | New Architecture became the default |
| 0.81 | Aug 2025 | Last version that supported **both** architectures |
| 0.82 | Oct 2025 | Runs **entirely** on the New Architecture; the old Bridge is gone |
| 0.83+ | — | Legacy architecture classes are being removed outright |
| 0.87 | Aug 2026 | Strict TypeScript API becomes the default |

> [!WARNING] The architecture flags no longer do anything
> Since 0.82, `newArchEnabled=false` on Android and `RCT_NEW_ARCH_ENABLED=0` on iOS are
> **ignored**. Bridgeless is the default and the Bridge has been removed. If a tutorial tells
> you to set either flag, it was written for 0.81 or earlier and the rest of its advice is
> probably stale too.

Two consequences shape this entire handbook:

- **There is one architecture.** Fabric, TurboModules, JSI, Codegen and Hermes are not an
  opt-in "new" path — they are how React Native works. The old Bridge and
  `RCTBridgeModule`-style native modules appear only in
  [New Architecture Migration](../migration/new-architecture-migration.md), clearly labelled.
- **Interop layers still exist** for third-party libraries that have not migrated, so a
  legacy library may still run. That is a compatibility shim, not a pattern to copy.

## The 0.87 change that breaks existing code

The **Strict TypeScript API** is now on by default. It was opt-in from 0.80. The practical
effect is that a large class of previously-working imports are now type errors.

```tsx title=Deep imports are now a type error
// This used to work. In 0.87 it does not type-check.
import StyleSheet from 'react-native/Libraries/StyleSheet/StyleSheet';
```

```tsx title=The supported form
import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
});
```

This is enforced by the `exports` map in `react-native` itself, which sets `"types": null` for
`./Libraries/*`. It is not a lint rule you can wave away.

Refs changed with it. The `NativeMethods` and `NativeMethodsMixin` types are gone, and each
component now has its own instance type:

```tsx title=Typing a ref in 0.87
import {useRef} from 'react';
import {View, TextInput, Text} from 'react-native';
import type {ViewInstance, TextInputInstance} from 'react-native';

export function Field() {
  const wrapper = useRef<ViewInstance | null>(null);
  const input = useRef<TextInputInstance | null>(null);

  return (
    <View ref={wrapper}>
      <Text>Email</Text>
      <TextInput ref={input} inputMode="email" />
    </View>
  );
}
```

Where you need a generic host element type — for example in a helper that measures any
component — use `HostInstance`, which replaces `NativeMethods`.

> [!NOTE] There is a temporary escape hatch, and you should not reach for it
> A `customConditions` opt-out restores the old deep-import types, but it works only through
> 0.88 and is intended for removal in 0.89. It is covered in
> [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) as a
> migration aid, not as a configuration to adopt.

## What this handbook assumes

- You know React — components, hooks, state and effects. This is not a React tutorial.
- You are comfortable in a terminal.
- You do **not** need prior native Android or iOS experience. Where native work is
  unavoidable, the steps are spelled out for both platforms.

You need a Mac to build and ship for iOS. Android development works on macOS, Linux and
Windows. Where a step is macOS-only, this handbook says so rather than letting you discover it
halfway through.

## How the handbook is organised

The sections are ordered roughly the way a project grows:

- **Getting Started** and **Core Concepts** — set up the toolchain, then understand what is
  actually running.
- **Components**, **Styling and Layout**, **Navigation** — build screens.
- **State and Data**, **Platform APIs** — make the app do something real.
- **Native Modules**, **Animation and Gestures** — go past what JavaScript alone can do.
- **Performance**, **Debugging and DevTools**, **Testing** — make it good.
- **Build and Release**, **Security**, **Upgrading and Migration** — ship it and keep it alive.
- **Reference** — the lookup material.

Every page ends with **Common mistakes** and **Related topics**. Runnable code lives in the
`examples/` directory of this repository rather than being pasted twice, so the examples
cannot drift from the prose.

## Conventions in this handbook

- Code blocks in `ts` and `tsx` are type-checked against the real installed React Native 0.87
  types with the Strict API active. If a snippet compiles here, it compiles in your project.
- Where Android and iOS genuinely differ, both are shown in tabs. A single-platform solution
  is never presented as universal.
- Anything removed or deprecated in 0.87 is labelled. It appears only where migration is the
  point.

:::tabs
@tab npm
```bash
npm install
npm run android
```
@tab yarn
```bash
yarn install
yarn android
```
@tab pnpm
```bash
pnpm install
pnpm android
```
:::

## Common mistakes

- **Following a tutorial that sets `newArchEnabled`.** The flag has done nothing since 0.82.
  If a guide sets it, treat everything else in that guide as suspect.
- **Installing the CLI globally.** A stale global `react-native` binary shadows the local one
  and produces errors that make no sense. Remove it first; see
  [Creating a Project](creating-a-project.md).
- **Copying deep imports from Stack Overflow.** `react-native/Libraries/...` imports are type
  errors in 0.87. The answer that recommends them predates the Strict API.
- **Assuming a library works because it installs.** A package that has not shipped
  Fabric/TurboModule support can install cleanly and then fail at runtime. Check compatibility
  before you depend on it; see
  [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).
- **Mixing Expo instructions into a CLI project.** `expo-*` packages assume a config plugin
  system the CLI path does not have. Advice from the two ecosystems is not interchangeable.

## Related topics

- [Environment Setup](environment-setup.md) — the toolchain you need before anything else works.
- [Creating a Project](creating-a-project.md) — `init`, version pinning, and first run.
- [The New Architecture](../core-concepts/new-architecture.md) — what Fabric, TurboModules and JSI actually do.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — the full removal and deprecation list.
- [Learning Path](learning-path.md) — a suggested reading order.
