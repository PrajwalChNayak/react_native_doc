---
title: Expo Go vs Development Builds
description: Expo Go is a prebuilt sandbox app with a fixed set of native modules. A development build is your own binary. Why a library with custom native code fails at runtime in Expo Go, and when to switch.
status: current
toolchain: expo
sdk: 57
---

There are two different apps that can load your project's JavaScript during development, and
confusing them is the most common beginner mistake in Expo.

- **Expo Go** is an app Expo publishes to the App Store and Play Store. It was compiled by Expo,
  ahead of time, with a **fixed** set of native modules inside it. Your project contributes only
  JavaScript. You cannot add native code to it.
- **A development build** is *your* app, compiled from *your* project's native dependencies and
  app config, with `expo-dev-client` added so it connects to Metro and fast-refreshes the same way.

Expo's own documentation calls Expo Go a playground that is not useful for production-grade
projects. Treat it that way. A development build is the normal way to develop a real app, and
most projects need one early — often the first week.

## Why it exists / when to use it — and when NOT to

Expo Go exists so that you can run SDK code on a phone without installing Xcode or Android
Studio and without waiting for a native build. That is genuinely valuable for:

- Trying an SDK package before you commit to it.
- Teaching, workshops and first-day exploration.
- Sharing a small reproduction with someone who has no native toolchain.

Do **not** use Expo Go as your development environment once any of these is true:

- You installed a library with custom native code that Expo Go does not contain.
- You need a config plugin to take effect (permissions strings, entitlements, Gradle settings).
- You need your own bundle identifier, app name, icon or URL scheme — for deep links, OAuth
  redirects or push notifications with your credentials.
- You want the thing you test to resemble the thing you ship.

For a real app, one of those arrives almost immediately.

## The failure: a runtime error, not a build error

This is the part that catches people, because nothing fails where you expect it to.

1. `npx expo install some-native-library` succeeds.
2. Metro bundles without complaint.
3. Expo Go opens the project and shows your first screen.
4. The screen that **calls into** the library throws.

The message depends on how the library was built. Both strings below were read from the
installed SDK 57 packages in this repository.

A library built on the **Expo Modules API** fails inside `expo-modules-core`'s
`requireNativeModule`, whose error template is literally:

```text
Cannot find native module '<NativeModuleName>'
```

A library built on **React Native TurboModules** fails inside
`TurboModuleRegistry.getEnforcing` in React Native 0.86, whose invariant message is literally:

```text
TurboModuleRegistry.getEnforcing(...): '<NativeModuleName>' could not be found. Verify that a module by this name is registered in the native binary.
```

> [!NOTE] What is verified and what is not
> The two templates above are the exact strings in the installed source
> (`expo-modules-core/src/requireNativeModule.ts` and
> `react-native/Libraries/TurboModule/TurboModuleRegistry.js`). What surrounds them on screen —
> the red box, the stack, any extra hint a library adds, and whether a library throws its own
> error first — varies by library and platform and was **not** captured from a device for this
> page. Libraries that look modules up without the enforcing variant may fail later, as
> `undefined is not a function`-style errors, rather than with either message.

The name in quotes is the **native** module name registered in the binary, which is often not
the npm package name. Search for the package that owns the screen, not for the quoted string.

### Why it happens at runtime

Expo Go has no build step for your project. It was compiled months ago with whatever native
modules Expo chose. Your project produces a JavaScript bundle, and a JavaScript `import` resolves
against `node_modules` — which *does* contain the library's JavaScript. Nothing compares the
JavaScript you import with the native code in the running binary until the JavaScript actually
calls native code. Then the lookup returns nothing and the call throws.

That is also why the fix is never a Metro cache clear, a `node_modules` reinstall or
`--clear`. The missing piece is native code inside the binary. The fix is a binary that contains
it: a development build.

The same mechanism is what makes a native library written against the CLI half's
[TurboModules path](../native-modules/turbomodules-end-to-end.md) unusable in Expo Go: the module
exists only once it is compiled into an app.

## Decision table

| Situation | Expo Go | Development build |
| --- | --- | --- |
| Only SDK packages that Expo Go already contains | Works | Works |
| A library with custom native code Expo Go does not contain | **Fails at runtime** | Works |
| A config plugin that edits `Info.plist`, `AndroidManifest.xml`, Gradle or entitlements | Not applied — the native project is Expo's | Applied |
| Your own bundle identifier, name, icon, URL scheme | You get Expo Go's | Yours |
| Deep links and universal links on your scheme or domain | Not testable | Testable |
| Push notifications with your credentials | Not testable | Testable |
| Performance measurement | Misleading | Debug build — still measure release |
| Five-minute SDK experiment | Ideal | Overkill |
| Reproduction for someone with no toolchain | Ideal | Heavier |

If any row in the "Fails" or "Not" column applies to you, stop using Expo Go for that project.

## Basic example — creating a development build

Add the dev client to the project. Always through `npx expo install`, so the version matches
SDK 57 (`~57.0.19`):

```bash
npx expo install expo-dev-client
```

Then build the binary. There are two routes, and neither requires the other.

:::tabs
@tab Local
```bash
# Needs Android Studio (and Xcode on macOS for iOS).
# If ios/ or android/ does not exist yet, run:* generates it first.
npx expo run:android
npx expo run:ios
```
@tab EAS (hosted)
```bash
# EAS Build is a paid hosted service with a free tier.
eas build --platform android --profile development
eas build --platform ios --profile development
```
:::

Once the build is installed, start Metro targeting it:

```bash
npx expo start --dev-client
```

`--dev-client` (alias `-d`) and `--go` (alias `-g`) are both real `npx expo start` flags in the
installed `@expo/cli@57.0.24`; they choose which app the dev server targets.

From here the loop is the same one you had in Expo Go: edit JavaScript, the app fast-refreshes.
You rebuild the binary only when the **native** surface changes — a new native dependency, a
config plugin or app config change that affects native files, or an SDK upgrade.

> [!WARNING] `run:*` generates native directories, and prebuild is destructive
> `npx expo run:android` / `run:ios` run prebuild for you when the platform directory is missing.
> A later `npx expo prebuild` **clears and regenerates** those directories by default in SDK 57.
> Do not hand-edit them unless you have deliberately chosen to commit them. See
> [expo prebuild](prebuild.md).

## How it works

A development build is a normal **debug** build of your app, plus `expo-dev-client`, which adds:

- a **launcher** screen to choose which dev server to connect to;
- the **dev menu** (reload, inspector, performance monitor);
- a config plugin that wires the launcher into the generated native project.

Because the binary is compiled from your project, it contains exactly your native modules —
nothing more, nothing less. That is the whole difference from Expo Go, which contains Expo's
chosen set and none of yours.

### Detecting Expo Go at runtime

Occasionally it is useful to degrade gracefully instead of crashing — for example in a sample
project that should still open in Expo Go. `expo-constants` reports which kind of app is running,
and `requireOptionalNativeModule` returns `null` instead of throwing:

```tsx title=src/components/NativeFeatureGate.tsx
import Constants, {ExecutionEnvironment} from 'expo-constants';
import {requireOptionalNativeModule} from 'expo';
import type {ReactNode} from 'react';
import {Text, View} from 'react-native';

// 'StoreClient' is Expo Go. 'Bare' and 'Standalone' are your own binaries.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type Props = {nativeModuleName: string; children: ReactNode};

export function NativeFeatureGate({nativeModuleName, children}: Props) {
  // Returns null rather than throwing when the module is not in this binary.
  const mod = requireOptionalNativeModule(nativeModuleName);

  if (mod == null) {
    return (
      <View>
        <Text>
          {isExpoGo
            ? 'This feature needs a development build. Expo Go does not contain its native code.'
            : 'This build was compiled without the native module. Rebuild the app.'}
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}
```

This is a diagnostic aid, not a strategy. A real app should not be designed to run in Expo Go.

## Common patterns

### Switch early and write it down

Put the run command in the README: "This project uses a development build; Expo Go will fail on
the camera screen." That sentence saves every new contributor an afternoon.

### Keep Expo Go for experiments only

A scratch project created with `npx create-expo-app@latest` is the right place to poke at an SDK
package in Expo Go. Your real project is not.

### Rebuild on native change, not on every change

JavaScript changes never need a rebuild. Native changes always do. When unsure, check whether the
change touched `package.json` dependencies with native code, `app.json` / `app.config.ts`, or
the SDK version.

## Common mistakes

- **Treating Expo Go as the normal way to build an app.** It is a sandbox with a fixed module
  set. Wrong: developing a production app in Expo Go until something breaks. Right: create a
  development build as soon as the project has a native dependency or needs its own identity.
- **Clearing the Metro cache to fix `Cannot find native module`.** The cache is not the problem;
  the binary lacks the native code. Build a development build.
- **Installing a native library with a bare package-manager install.** You get `latest`, often
  built for another SDK, and it fails at runtime even in a development build. Use
  `npx expo install <package>`, then rebuild.
- **Expecting a config plugin to work in Expo Go.** Plugins edit native files during generation.
  Expo Go's native project is not yours.
- **Assuming a development build requires EAS.** `npx expo run:android` and `npx expo run:ios`
  build locally with no account.
- **Forgetting to rebuild after adding a native dependency.** The old development build has the
  same problem Expo Go does: the new native code is not in it.
- **Shipping `expo-dev-client` in a store build.** It is a development tool; keep it to
  development and internal profiles.

## Related topics

- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — the build itself, in more depth.
- [Creating One Locally](../expo-development-builds/creating-locally.md) — `npx expo run:*` and `eas build --local`.
- [Creating One with EAS](../expo-development-builds/creating-with-eas.md) — the hosted route and what it costs.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — when a new package forces a rebuild.
- [expo install and SDK Alignment](expo-install-and-sdk-alignment.md) — why the install command matters.
- [expo prebuild](prebuild.md) — how the native directories are generated, and why it is destructive.
- [Continuous Native Generation](continuous-native-generation.md) — the model behind all of this.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — how a native module gets into a binary, on the CLI half.
