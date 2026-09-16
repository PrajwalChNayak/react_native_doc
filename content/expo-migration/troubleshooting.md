---
title: Expo Troubleshooting
description: The failures Expo SDK 57 projects actually hit — stale tutorials, SDK-mismatched native modules, Expo Go limits, destroyed native edits and React Native 0.87 code on a 0.86 runtime — with cause and fix for each.
status: current
toolchain: expo
sdk: 57
---

Every entry below follows the same shape: the **symptom** you see, the **cause**, and the **fix**.
Most of these are not bugs in Expo. They are a stale instruction, a version mismatch, or a boundary
nobody told you about.

## Why it exists / when to use it — and when NOT to

Come here when something has already gone wrong. If you are choosing between approaches rather than
debugging one, the [Expo Cheat Sheet](cheat-sheet.md) is the faster read.

Nothing on this page is a workaround for an unverified problem. If you cannot reproduce the symptom,
do not apply the fix.

## A tutorial tells you to run `expo init`

**Symptom.** You follow a tutorial, run `expo init MyApp`, and get either `command not found` or:

```text
  $ expo init is not supported in the local CLI, please use npx create-expo-app instead
```

**Cause.** `expo init` was **removed**. It belonged to the old global `expo-cli`, which was split
apart: project creation went to `create-expo-app`, cloud operations went to `eas-cli`, project checks
went to `expo-doctor`, and what remains is the local `npx expo` CLI versioned with your SDK.

**Fix.**

```bash
npx create-expo-app@latest MyApp
cd MyApp
npx expo start
```

> [!WARNING] The rest of that tutorial is suspect too
> `expo init` was removed several SDKs ago. A tutorial still using it also predates prebuild, EAS,
> and the current app config. Check every command against
> [expo init and Other Removed Commands](removed-commands.md) before running it. Do **not** install
> the global `expo-cli` to make the tutorial work — you will hit the next stale instruction shortly.

## `npm install` succeeded but the app crashes on launch

**Symptom.** You installed a package with `npm install`, the install was clean, the bundle built, and
then the app crashes at startup or the first time the module is used. Typical shapes: a null native
module, a missing method on a native object, or a hard native crash with no JavaScript frames.

**Cause.** An `expo-*` package is a JavaScript API plus **compiled native code**. `npm install
expo-camera` fetches whatever npm calls `latest`, which is built for whatever SDK is current — not
necessarily yours. The JavaScript resolves fine; the native half does not match your
`expo-modules-core` or your React Native 0.86.3.

**Nothing fails at install time.** Native mismatches fail at runtime, which is why this shows up days
after the commit that caused it.

**Fix.**

```bash
npx expo install --check     # find every mismatch
npx expo install --fix       # correct them
```

Then rebuild — a JavaScript reload does not replace native code:

```bash
npx expo run:android         # or run:ios
```

**Prevention.** Always use `npx expo install`, which resolves versions from
`expo/bundledNativeModules.json` for your installed SDK:

```bash
npx expo install expo-camera     # correct
npm install expo-camera          # wrong
```

Add `npx expo install --check` to CI. It exits 1 on any mismatch. →
[expo install --check and --fix](install-check-and-fix.md)

## `--check` reports a version mismatch

**Symptom.**

```bash
npx expo install --check
```

lists packages in the form `<package>@<actual> - expected version: <expected>`, then warns that
your project may not work correctly, and exits 1.

**Cause.** Something in `package.json` is not the version SDK 57 expects: someone ran a bare
`npm install`, a lockfile merge resolved the wrong way, a `npm update` ran, or you upgraded the SDK
without running `--fix`.

**Fix.** Read the list first — it tells you what will change.

```bash
npx expo install --fix
```

If a package on the list is one you pinned **deliberately**, `--fix` will undo your decision. Record
the exception instead:

```json title=package.json
{
  "expo": {
    "install": {
      "exclude": ["react-native-webview"]
    }
  }
}
```

The CLI then prints that it skipped those packages by name, so the exception stays visible rather
than becoming folklore.

> [!WARNING] Do not silence it with an environment variable
> `EXPO_OFFLINE` and `EXPO_NO_DEPENDENCY_VALIDATION` both skip validation. Using them to get a green
> CI run converts an install-time warning into a crash on a user's device. The build going green
> changes nothing about the app.

## Expo Go fails on a library with custom native code

**Symptom.** The library installs, the bundle builds, and then in Expo Go you get a runtime error —
commonly that the native module is null or undefined, or a method does not exist. The same code works
for a colleague who is running a development build.

**Cause.** **Expo Go bundles a fixed set of native modules.** It is a pre-built app from the app
store; nobody rebuilt it when you added your dependency. If a library ships custom native code that
is not already inside Expo Go, Expo Go cannot load it.

This is a **runtime** error, not a build error, which is why it is confusing: nothing along the way
warned you.

**Fix.** Build a development build — your own binary containing your own native dependencies, with
the same fast-refresh workflow:

```bash
npx expo install expo-dev-client
npx expo run:android            # or run:ios on macOS
npx expo start --dev-client     # develop against it from then on
```

**Prevention.** Treat Expo Go as a sandbox for trying the SDK, not as the way real apps are
developed. The point at which a project needs a development build arrives early. →
[Why You Need a Development Build](../expo-development-builds/why-you-need-one.md)

## `expo prebuild` deleted your hand-edited native code

**Symptom.** You edited `ios/Podfile`, `android/app/build.gradle`, `AndroidManifest.xml` or an
`AppDelegate`, everything worked, and then after running `npx expo prebuild` (or `npx expo run:ios`,
or an EAS build) the edits are gone and the symptom they fixed is back.

**Cause.** In SDK 57, prebuild **clears and regenerates** the native directories by default. The CLI
computes its clean behaviour as `!args['--no-clean']`, so clean is on unless you explicitly opt out.

The mental model is **Continuous Native Generation**: `ios/` and `android/` are **build output**, not
source. Prebuild treats them as disposable, because under CNG they are.

**Fix — right now.** If the edits are in git, recover them:

```bash
git checkout -- ios android     # only if you commit the native directories
```

If they are not in git, they are gone. This is the reason the warning exists.

**Fix — permanently.** Pick one strategy and write it in the README:

| Strategy | What you do | What it costs |
| --- | --- | --- |
| **Continuous Native Generation** | Never commit `ios/`/`android/`. Every native change becomes a config plugin. | Limited to what plugins can express |
| **Committed native directories** | Prebuild once, commit the output, **never run prebuild again**. | Full native freedom; you own every upgrade by hand |

Mixing them — hand-editing native code *and* running prebuild — is the failure this warning exists to
prevent. → [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md)

If you are staying on CNG, express the change as a config plugin, or as
[`expo-build-properties`](../expo-config-plugins/build-properties.md) for Gradle and Podfile
settings. Check the result without destroying anything:

```bash
npx expo config --type introspect
```

> [!DANGER] `npx expo run:ios` and `npx expo run:android` can trigger prebuild too
> It is not only the explicit `prebuild` command. Any command that needs the native directories may
> regenerate them. "I never ran prebuild" is rarely true.

## Code copied from the React Native 0.87 docs does not compile

**Symptom.** You copy a snippet from React Native documentation, or from the CLI half of this site,
and TypeScript reports `Cannot find name 'ViewInstance'` or `Cannot find name 'TextInputInstance'` or
`Cannot find name 'HostInstance'`.

**Cause.** Expo SDK 57 ships **React Native 0.86.3**. The per-component instance ref types —
`ViewInstance`, `TextInputInstance`, `ScrollViewInstance`, `HostInstance` and the rest — were
introduced in **0.87** alongside the Strict TypeScript API. On 0.86 they **do not exist at all**.

`expo/tsconfig.base.json` sets `customConditions: ["react-native"]`, so an Expo project resolves the
**legacy** type definitions, where refs are typed by the component itself.

**The broken version** — this is 0.87 code, and it does not compile on SDK 57:

```tsx-fragment
// DOES NOT COMPILE on Expo SDK 57 (React Native 0.86.3).
// TextInputInstance is a React Native 0.87 type and does not exist here.
import {useRef} from 'react';
import {TextInput, View} from 'react-native';
import type {TextInputInstance} from 'react-native';

export default function Broken() {
  const inputRef = useRef<TextInputInstance | null>(null);
  return (
    <View>
      <TextInput ref={inputRef} />
    </View>
  );
}
```

**The working version** — type the ref by the component:

```tsx title=app/search.tsx
import {useRef} from 'react';
import {Button, TextInput, View} from 'react-native';

export default function Search() {
  // On React Native 0.86 a ref is typed by the component itself.
  const inputRef = useRef<TextInput | null>(null);

  return (
    <View>
      <TextInput ref={inputRef} placeholder="Search" />
      <Button title="Focus" onPress={() => inputRef.current?.focus()} />
    </View>
  );
}
```

**Fix.** Replace every `*Instance` type with the component type. There is no import to add — the
component is already imported.

| React Native 0.87 | Expo SDK 57 (0.86) |
| --- | --- |
| `useRef<ViewInstance \| null>(null)` | `useRef<View \| null>(null)` |
| `useRef<TextInputInstance \| null>(null)` | `useRef<TextInput \| null>(null)` |
| `useRef<ScrollViewInstance \| null>(null)` | `useRef<ScrollView \| null>(null)` |
| `HostInstance` | The component type, or `NativeMethods` on 0.86 |

→ [SDK to React Native Pairing](sdk-react-native-pairing.md)

## A "removed in 0.87" API still works, or vice versa

**Symptom.** Documentation tells you an API was removed, but it works in your project. Or the reverse
— a replacement the docs recommend does not exist for you.

**Cause.** React Native 0.87 removed a set of APIs. **SDK 57 is on 0.86, where they are still
present.** A 0.87 removal note is accurate for the CLI half of this site and premature for you.

Still present on your React Native 0.86: `InteractionManager`, `Modal`'s `animated` prop,
`StatusBar`'s `backgroundColor` and `translucent` props, the boolean form of `ScrollView`'s
`keyboardShouldPersistTaps`, the `*Properties` type aliases, and `NativeMethods`.

**Fix.** Do not chase replacements your version does not need. But do not build **new** code on any
of them either — they disappear the moment your SDK moves to a React Native 0.87 base, and that is
one SDK upgrade away.

The same applies to deep imports into `react-native/Libraries/`. They still resolve on 0.86 and are a
hard type error on 0.87. Do not start using them now.

## A config change appears to do nothing

**Symptom.** You add a key to `app.json`, restart, and nothing changes.

**Cause.** One of three things:

1. **The key does not exist.** Unknown keys in the app config are **silently ignored** — no error, no
   warning. A typo and a stale key look identical to a feature that is broken.
2. **The key is consumed at build time.** Most native-affecting keys are read during prebuild or the
   native build, not at runtime. Restarting Metro changes nothing.
3. **It has no effect in Expo Go.** `scheme`, for instance, is explicitly build-time configuration
   and does nothing in Expo Go.

**Fix.** Print the resolved config rather than guessing:

```bash
npx expo config --type public       # what ships in the manifest
npx expo config --type prebuild     # what prebuild will use
npx expo config --type introspect   # the native changes plugins will make
```

If your key is not in that output, it was ignored. Check it against the
[App Config Reference](app-config-reference.md), then rebuild:

```bash
npx expo prebuild        # if you are on CNG — note the danger above
npx expo run:android
```

> [!LEGACY] A top-level `"splash"` key is the most common case of this
> `splash` is not a top-level key in SDK 57. It exists only under `web`, for the PWA splash screen.
> Native splash screens are configured through the `expo-splash-screen` plugin. A project upgraded
> from an older SDK keeps the old key in `app.json`, where it is now ignored.

## `npx expo doctor` says it is not supported

**Symptom.**

```text
  $ expo doctor is not supported in the local CLI, please use npx expo-doctor instead
```

**Cause.** `doctor` is not a subcommand of the local Expo CLI. It is a separate package.

**Fix.**

```bash
npx expo-doctor
```

Several other commands redirect the same way — `init`, `eject`, `upgrade`, `publish`, `build:*`. The
complete list is in [expo init and Other Removed Commands](removed-commands.md).

## After an SDK upgrade, the bundler reports errors that make no sense

**Symptom.** Post-upgrade, Metro reports missing modules, duplicate React copies, or syntax errors in
files you did not touch.

**Cause.** Stale Metro and package-manager caches from the previous SDK.

**Fix.** In increasing order of aggression:

```bash
npx expo start --clear                       # clear the Metro cache
rm -rf node_modules && npm install           # rebuild the dependency tree
npx expo install --check                     # confirm the tree matches the SDK
```

If you are on CNG and the failure is native rather than JavaScript, regenerate:

```bash
rm -rf ios android
npx expo prebuild
```

Only do this if you are genuinely on CNG. If you commit the native directories, deleting them
destroys work.

## Common mistakes

- **Fixing a symptom without reading the error.** "Native module is null" from Expo Go and from an
  SDK mismatch look similar and have completely different fixes. Check which client you are on first.
- **Running `npm install` once "because it is faster".** One bare install is all it takes; the crash
  arrives later, on a device, far from the cause.
- **Deleting `node_modules` as the first step.** It fixes cache problems and nothing else, and it
  hides the actual mismatch that `--check` would have named in a second.
- **Setting `EXPO_NO_DEPENDENCY_VALIDATION=1` to get a green CI run.** You have hidden the warning,
  not the crash.
- **Running `npx expo prebuild` to "reset things" on a project with committed native directories.**
  Clean is the default. That command destroys the work.
- **Assuming "it works in Expo Go" means it will work in a build, or the reverse.** They contain
  different native code. A library that works in one can fail in the other.
- **Replacing a working 0.86 API because a 0.87 page called it removed.** It is not removed for you
  yet. Just do not build new code on it.
- **Adding `*Instance` types because an autocomplete suggestion or a model produced them.** They do
  not exist on React Native 0.86. Type refs by the component.
- **Reinstalling the global `expo-cli` when a command is missing.** The command was moved, not
  hidden. A stale global binary shadowing `npx expo` causes its own class of confusing errors.

## Related topics

- [expo install --check and --fix](install-check-and-fix.md) — the tool that catches most of this early.
- [SDK to React Native Pairing](sdk-react-native-pairing.md) — the 0.86 vs 0.87 boundary in full.
- [expo init and Other Removed Commands](removed-commands.md) — for anything that "is not supported in the local CLI".
- [App Config Reference](app-config-reference.md) — for a key that appears to do nothing.
- [Upgrading Between SDK Versions](upgrading-sdk.md) — the flow that avoids most post-upgrade breakage.
- [Expo Cheat Sheet](cheat-sheet.md) — the facts, without the diagnosis.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — the boundary behind several entries here.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the destructive command in detail.
- [Debugging a Development Build](../expo-development-builds/debugging.md) — tools for the failures this page does not cover.
