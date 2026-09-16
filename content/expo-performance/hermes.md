---
title: Hermes
description: Hermes is the JavaScript engine Expo SDK 57 apps run on. What ahead-of-time bytecode means for startup and debugging, and the constraints it puts on you.
status: current
toolchain: expo
sdk: 57
---

Hermes is the JavaScript engine that runs your app's code on Android and iOS. It is bundled with
React Native 0.86.3, which Expo SDK 57 ships, and it is the engine Expo's tooling is built around.

The key design choice: **Hermes compiles JavaScript to bytecode ahead of time**, at build or
export time, and it has **no JIT compiler**. Your release app does not parse or compile JavaScript
on the device at all. It loads bytecode and interprets it.

## Why it exists / when to use it — and when NOT to

Hermes is optimised for what mobile apps care about: fast startup, low memory, and small binary
size, rather than peak throughput in long-running computation.

You do not choose Hermes on SDK 57 so much as work with it:

- **React Native DevTools requires Hermes.** The SDK 57 CLI prints "React Native DevTools can
  only be used with Hermes" when no compatible app is connected.
- **The `jsEngine` field is not in SDK 57's app config type.** It does not appear in the installed
  `@expo/config-types` `ExpoConfig` definition, so this handbook does not document switching
  engines on SDK 57.

When Hermes is the wrong tool: sustained CPU-heavy JavaScript (image processing, cryptography,
large data transforms). With no JIT, hot loops do not get faster the longer they run. Move that
work into a native module — see [Expo Modules API](../expo-native-code/expo-modules-api.md).

## Basic example

Confirm at runtime that you are on Hermes. Hermes installs a `HermesInternal` global:

```tsx title=components/EngineBadge.tsx
import {Text} from 'react-native';

export function EngineBadge() {
  const isHermes = typeof (globalThis as {HermesInternal?: unknown}).HermesInternal === 'object';
  return <Text>{isHermes ? 'Hermes' : 'Unknown engine'}</Text>;
}
```

And see the bytecode it produces:

```bash
npx expo export --platform android
```

A real run on the minimal SDK 57 app in
[`examples/expo-minimal`](../../examples/expo-minimal/README.md) produced a **1.4 MB** Hermes
bytecode file from **580 modules**, at `dist/_expo/static/js/android/index-<hash>.hbc`.

## How it works

### Ahead-of-time bytecode

| Step | Where it happens |
| --- | --- |
| Metro bundles your modules into one JavaScript file | Your machine or CI, at export/build time |
| Hermes compiles that file to `.hbc` bytecode | Your machine or CI, at export/build time |
| Bytecode is embedded in the binary or served as an OTA update | Build / `eas update` |
| The device loads and interprets the bytecode | On launch |

Because parsing and compiling happen before the app ships, launch does not pay for them. That is
where Hermes' startup advantage comes from.

The trade-off is that there is **no JIT**. A JIT engine watches hot code and compiles it to
machine code while the app runs; Hermes does not. For typical app code — rendering, event
handlers, network glue — that is a good trade. For number crunching in JavaScript, it is not.

### Development builds are different

In development, Metro serves JavaScript source to the app and Hermes compiles it on the device, so
Fast Refresh works. That is one more reason development builds are not representative for
[startup measurement](startup-time.md).

### Bytecode is versioned

Hermes bytecode format is tied to the Hermes version, and Hermes is tied to the React Native
version. A bytecode bundle built for one React Native version must not be loaded by a binary built
with another. This is why an SDK upgrade changes the runtime version for OTA updates — see
[Runtime Versions](../expo-eas/runtime-versions.md).

### Bytecode is not obfuscation

`.hbc` is not readable JavaScript, but string literals survive intact and bytecode can be
disassembled. Anything in the bundle — API keys, `EXPO_PUBLIC_` variables, internal URLs — is
extractable. See [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md).

## Platform differences

Hermes runs on both Android and iOS in an SDK 57 app, compiled from the same bundle. The
bytecode is exported per platform (`dist/_expo/static/js/android/…` and `…/ios/…`) because Metro
resolves platform-specific files (`.android.tsx`, `.ios.tsx`) separately. On web, there is no
Hermes: the browser's own engine runs plain JavaScript.

## Common patterns

### Debug with React Native DevTools

Press <kbd>j</kbd> in the `npx expo start` terminal to open React Native DevTools for the
connected Hermes app. See [Profiling](profiling.md).

### Keep hot loops out of JavaScript

If profiling shows a single JavaScript function dominating a trace — decoding, hashing, parsing a
large file — it is a candidate for native code, not for micro-optimisation in JavaScript. On an
interpreter, the gains from rewriting a loop are small compared to moving it off the JS thread.

## Performance considerations

- Startup benefits come from bytecode being precompiled. They only appear in a release build or
  an exported bundle.
- Memory: Hermes is designed for a low memory footprint, but the objects you keep alive are still
  yours. Use the Memory panel in React Native DevTools to take heap snapshots.
- Intl, dates and regular expressions all run in the interpreter. Heavy formatting inside list
  rows is a common, measurable cost.

## Common mistakes

- **Assuming Hermes gets faster as code "warms up".** There is no JIT. A slow loop stays slow.
- **Treating `.hbc` as protection for secrets.** Strings survive compilation. Keep secrets on a
  server.
- **Benchmarking Hermes in a development build.** In development, JavaScript is compiled on the
  device from source; release builds load precompiled bytecode.
- **Loading an OTA update built for a different React Native version.** Bytecode formats differ.
  Keep runtime versions correct.
- **Following old instructions to switch JavaScript engines.** The `jsEngine` field is not in the
  SDK 57 config type, and React Native DevTools only works with Hermes.
- **Copying Hermes advice from a React Native 0.87 page.** SDK 57 ships React Native 0.86.3 and the
  Hermes that comes with it.

## Related topics

- [Bundle Size and Tree Shaking](bundle-size.md) — what goes into the bytecode file.
- [Startup Time and the Splash Screen](startup-time.md) — where precompiled bytecode pays off.
- [Profiling](profiling.md) — React Native DevTools, which requires Hermes.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — why bytecode versions matter for updates.
- [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) — bytecode is not encryption.
- [Expo Modules API](../expo-native-code/expo-modules-api.md) — moving CPU-heavy work to native code.
