---
title: SDK to React Native Pairing
description: Each Expo SDK targets exactly one React Native version. The verified pairing table, why you cannot upgrade React Native on its own, and why code does not transfer between the two halves of this site.
status: current
toolchain: expo
sdk: 57
---

An Expo SDK release is not a loose collection of packages that happen to work together. Every
`expo-*` package in a given SDK is compiled against **one** React Native version. That version is
not a recommendation or a minimum — it is the version the native code was built for.

This page is the canonical reference for which React Native each SDK ships, and for what follows
from that.

## The verified pairing table

Read directly out of each release's own `bundledNativeModules.json`, which is the file
`npx expo install` itself consults:

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | **0.83.10** |
| SDK 56 | **0.85.3** |
| **SDK 57** | **0.86.3** |

You can confirm the row for your own project without trusting this page:

```bash
node -p "require('./node_modules/expo/bundledNativeModules.json')['react-native']"
```

On an SDK 57 project that prints `0.86.3`.

> [!NOTE] Secondary sources get this wrong
> Summaries of the SDK line frequently report SDK 55 as shipping React Native 0.85. It ships
> **0.83.10**. The table above was read out of the packages, not out of a blog post. When a source
> disagrees, run the command above.

SDK 58 exists only as `canary` and `preview` dist-tags. **SDK 57 is the current stable release.**

## Why it exists / when to use it — and when NOT to

Come here whenever a version question arises: someone wants a React Native feature that landed after
0.86, a library's peer range names a React Native version, or a snippet from somewhere else will not
compile.

The one thing this page cannot give you is a way around the pairing. There isn't one.

## Upgrading React Native independently of the SDK is not supported

Stated plainly, because it is the single most common request:

> [!WARNING] You cannot pick your own React Native version on an Expo project
> Each Expo SDK targets one React Native version, and the SDK's ~120 native modules are **built
> against it**. Forcing a different version in `package.json` does not recompile them.
>
> What you get instead: `npx expo install --check` reports the mismatch, prebuild generates native
> projects for a version your JavaScript dependencies were not built for, and — if it builds at all
> — the app fails at runtime in native code. Nobody supports the result.

The supported way to move React Native forward is to **move the SDK forward**, which brings the new
React Native with it. See [Upgrading Between SDK Versions](upgrading-sdk.md).

### What about going the other way?

Downgrading React Native below what the SDK pins is the same problem with the same outcome. There is
exactly one supported version per SDK.

### Why the SDK trails the latest React Native release

React Native 0.87 was released while SDK 57 ships 0.86.3. That lag is structural, not neglect: the
SDK has to update, build and test roughly 120 native modules against a new React Native, on two
platforms, before it can pin it. A release or so of delay is normal and expected.

If you need the newest React Native the week it ships, you need the React Native Community CLI, not
Expo. That trade-off is covered honestly in
[When the Bare CLI Is Better](../expo-vs-bare/when-bare-is-better.md).

## The two halves of this site are on different React Natives

This matters for every page you read here.

| | This half (Expo) | The CLI half |
| --- | --- | --- |
| Toolchain | Expo SDK 57 | React Native Community CLI |
| React Native | **0.86.3** | **0.87.1** |
| Sections | every `expo-` section | `getting-started`, `components`, `navigation`, `native-modules`, and the rest |

**Code does not transfer between the halves unchecked.** The two versions differ in ways that break
compilation, not just style.

### The differences that actually bite

Verified from both installed packages:

| | React Native 0.86 (Expo SDK 57) | React Native 0.87 (CLI half) |
| --- | --- | --- |
| Default `types` condition | `./types/index.d.ts` — the **legacy** types | `./types_generated/` — the **Strict API** |
| Strict TypeScript API | **opt-in**, via the `react-native-strict-api` condition | **default** |
| `react-native/Libraries/*` deep imports | still resolve — no `exports` restriction | **type error** (`"types": null`) |
| `ViewInstance`, `TextInputInstance`, `HostInstance` | **do not exist** | exist, one per component |

`expo/tsconfig.base.json` sets `customConditions: ["react-native"]`, so a normal Expo project
resolves the **legacy** type definitions. That single line is why a CLI-half snippet fails to
compile in an Expo project.

### Ref types: the concrete failure

React Native 0.87 introduced per-component instance types. On SDK 57 they do not exist at all, so a
0.87 snippet produces `Cannot find name 'TextInputInstance'`. Type the ref by the component instead:

```tsx title=app/search.tsx
import {useRef} from 'react';
import {TextInput, View} from 'react-native';

export default function Search() {
  // Correct on Expo SDK 57 / React Native 0.86 — type the ref by the component.
  const inputRef = useRef<TextInput | null>(null);

  return (
    <View>
      <TextInput ref={inputRef} placeholder="Search" onSubmitEditing={() => inputRef.current?.blur()} />
    </View>
  );
}
```

The `*Instance` form — `useRef<TextInputInstance | null>(null)` — is the 0.87 spelling and is a
compile error here.

### The 0.87 removals are not removals for you

React Native 0.87 removed a set of APIs. SDK 57 is on 0.86, where they are still present. If a CLI
page tells you something is gone, the accurate statement for an Expo SDK 57 reader is "removed in
React Native 0.87, which SDK 57 does not yet ship":

- `InteractionManager`
- `Modal`'s `animated` prop
- `StatusBar`'s `backgroundColor` / `translucent` props
- the boolean form of `ScrollView`'s `keyboardShouldPersistTaps`
- `*Properties` type aliases such as `ViewProperties`
- `NativeMethods` / `NativeMethodsMixin`

They are all still there on 0.86. They will disappear when the SDK moves to 0.87, so do not build
new code on them — but do not go hunting for replacements that your version does not need either.

Deep imports into `react-native/Libraries/` also still resolve on 0.86. They are still a bad idea:
they are a hard type error the moment your SDK moves to a React Native 0.87 base, and that day is
coming.

## Common patterns

### Check a library's peer range before you install it

A library advertising support for "React Native 0.87" may or may not also support 0.86. Read the
peer range rather than the marketing line:

```bash
npm view react-native-some-library peerDependencies
```

A range such as `0.83 - 0.87` covers you. A range of `>=0.87` does not.

### Check what you actually have, in the project

```bash
node -p "require('expo/package.json').version"           # your SDK
node -p "require('react-native/package.json').version"   # your React Native
npx expo install --check                                 # does the tree agree?
```

### Record the pairing where your team will see it

An SDK number is more memorable than a React Native number, and half your dependency questions are
really React Native questions. A line in the project README — "SDK 57 / React Native 0.86.3" — saves
a surprising amount of time.

## Common mistakes

- **Editing `react-native` in `package.json` to a newer version.** Not supported. The SDK's native
  modules were compiled against the pinned version and are not recompiled by your edit.
- **Copying a ref type from a CLI page.**
  Wrong: `useRef<TextInputInstance | null>(null)` — the type does not exist on 0.86.
  Right: `useRef<TextInput | null>(null)`.
- **Believing a secondary source's pairing table.** SDK 55 is commonly reported as 0.85; it is
  0.83.10. Read `bundledNativeModules.json`.
- **Assuming a library that supports React Native 0.87 supports 0.86.** Read the peer range.
- **Treating the SDK's React Native lag as a bug to route around.** It is the cost of 120 native
  modules being tested together. Routing around it is how projects end up unsupportable.
- **Copying a version number for a shared library between the two halves.** SDK 57 pins
  `react-native-gesture-handler ~2.32.0`; the CLI half documents 3.3.0. A whole major version apart.
- **Reading a "removed in 0.87" note as applying to you.** SDK 57 is on 0.86. Those APIs are still
  present — just do not build new code on them.

## Related topics

- [Upgrading Between SDK Versions](upgrading-sdk.md) — the supported way to move React Native forward.
- [expo install --check and --fix](install-check-and-fix.md) — the command that detects a broken pairing.
- [Expo Cheat Sheet](cheat-sheet.md) — the pairing table in one scannable page.
- [Expo Troubleshooting](troubleshooting.md) — the runtime symptoms of a mismatch.
- [What Expo Actually Is](../expo-getting-started/introduction.md) — the shorter version of this page.
- [When the Bare CLI Is Better](../expo-vs-bare/when-bare-is-better.md) — including "I need the newest React Native".
- [An Honest Comparison](../expo-vs-bare/comparison.md) — the full trade-off.
