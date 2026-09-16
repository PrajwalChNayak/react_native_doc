---
title: Adding Native Dependencies
description: Installing a library with native code into a development build — npx expo install, the rebuild rule, autolinking, and how to tell whether a package needs a new binary at all.
status: current
toolchain: expo
sdk: 57
allow-banned: npm-install-sdk-package
---

Adding a dependency to an Expo project is two questions, not one:

1. **Which version?** `npx expo install` answers it against your installed SDK.
2. **Does the binary need rebuilding?** Only if the package contains native code, or changes the
   native project through a config plugin.

Getting the first wrong produces a runtime crash that looks like a code bug. Getting the second
wrong produces hours of debugging a change that was never in the binary.

## Why it exists / when to use it — and when NOT to

Every development build is compiled against a specific set of native modules. The JavaScript in
`node_modules` and the native code in the installed binary are two separate things that only agree
because you built them together.

The moment you add a package with native code, they disagree until you rebuild. That is the whole
subject of this page.

## Basic example

```bash
npx expo install expo-camera
npx expo run:android
```

Install, then rebuild. `npx expo install` resolves the version that matches your installed SDK from
`expo/bundledNativeModules.json` — for SDK 57 that is `expo-camera@~57.0.5`.

> [!WARNING] Never install an SDK package with a bare package-manager command
> ```bash
> npm install expo-camera     # WRONG — fetches `latest`
> npx expo install expo-camera # correct — SDK-matched version
> ```
> A bare install fetches whatever is newest on npm, which is routinely built against a different
> SDK. The mismatch surfaces at runtime, not install time, which is what makes it expensive.
>
> This page names the wrong command in order to warn against it. That requires the
> `allow-banned: npm-install-sdk-package` opt-in in its front matter.

## How it works

### The rebuild rule

| What you changed | Rebuild the binary? |
| --- | --- |
| JavaScript or TypeScript in your app | No — fast refresh handles it |
| A JavaScript-only dependency | No — Metro picks it up, restart the server if it does not |
| A dependency with native code | **Yes** |
| A config plugin, or a plugin's options | **Yes** |
| `ios.bundleIdentifier`, `android.package`, app name, icon, URL scheme | **Yes** |
| A permission string in the app config | **Yes** |
| An Expo SDK upgrade | **Yes** |
| An environment variable read at runtime by JavaScript | No |

Everything in the "yes" column ends in native files being regenerated and recompiled. Everything in
the "no" column is JavaScript, which the dev server ships live.

### Is this package native?

Three reliable signals, in order of confidence:

1. **It is in `expo/bundledNativeModules.json`.** Anything `npx expo install` resolves through that
   map is an SDK package, and SDK packages are native unless they are pure JavaScript helpers.
   Check it directly:

   ```bash
   node -p "require('expo/bundledNativeModules.json')['react-native-svg']"
   ```

2. **The published package contains an `android/` or `ios/` directory, or an
   `expo-module.config.json`.** Look inside `node_modules/<package>/`.

3. **It ships an `app.plugin.js`.** That is a config plugin entry point, which means it modifies the
   native project — so even if the JavaScript would run in Expo Go, the configuration it needs will
   not be there.

If none of those are true, it is a JavaScript package and no rebuild is needed.

### Autolinking

You do not edit Gradle files or a Podfile to register a native dependency. Expo's autolinking finds
installed native modules and links them during generation and build. That is why the install step
and the rebuild step are the whole procedure.

Autolinking is also why a half-installed dependency produces a confusing error: the JavaScript
resolves, the native module was never linked, and the failure is the runtime
`Cannot find native module '…'` described in
[Why You Need a Development Build](why-you-need-one.md).

### Checking alignment

```bash
npx expo install --check
```

Reports packages whose installed version does not match what SDK 57 expects.

```bash
npx expo install --fix
```

Corrects them. Run `--check` after any dependency change you did not make through
`npx expo install`, and after merging a branch that touched `package.json`.

> [!WARNING] Versions differ from the React Native CLI half of this site
> Shared libraries are pinned by the SDK and are not the same versions the CLI sections document.
> SDK 57 pins `react-native-gesture-handler@~2.32.0`, for example, while the CLI half is on 3.3.0 —
> a whole major version apart. Never copy a version number across.

## Common patterns

### Install, regenerate, rebuild — in that order

```bash
npx expo install react-native-svg
npx expo prebuild --clean   # only if you manage native dirs yourself
npx expo run:android
```

> [!DANGER] `npx expo prebuild` destroys hand-edited native code
> In SDK 57 it **clears and regenerates** `ios/` and `android/` by default. If you hand-edited
> anything there, it is gone.
>
> Most projects never run `prebuild` directly: `npx expo run:android` and `npx expo run:ios`
> generate the native project only when it is missing, and leave an existing one alone. Run
> `prebuild` deliberately, not reflexively. See
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

### Decide about Expo Go once, up front

> [!NOTE] Expo Go vs development build
> A package with native code that Expo Go does not already bundle **cannot** run in Expo Go. There
> is no flag, no configuration and no workaround. Adding such a package is the moment a project
> moves to a development build permanently.

### Tell the team a rebuild is needed

A pull request that adds a native dependency changes what every teammate must have installed.
Putting "requires a rebuild" in the PR description saves the next person the same investigation you
just did, because the failure they will hit does not mention your change.

### Prefer a library that has shipped New Architecture support

SDK 57 is on React Native 0.86, which runs entirely on the New Architecture. A library without
Fabric and TurboModule support is not a viable dependency — the interop layers cover a lot, but a
library that has not been touched in two years is a liability regardless.

## Performance considerations

Every native dependency adds to binary size and, for anything that initialises at startup, to
launch time. The cost is invisible in a development build, where the dev launcher and Metro
connection dominate.

Measure in a release build before and after adding something large. See
[Bundle Size](../expo-performance/bundle-size.md) and [Startup Time](../expo-performance/startup-time.md).

## Security considerations

**Threat.** A native dependency runs with your app's full privileges. It can read anything the app
can read, open network connections, and access any permission the app holds. A compromised or
careless package is not sandboxed away from the rest of your app.

**Exploit.** Native code is not visible in the JavaScript bundle, so the usual "read the bundle"
review finds nothing. A package can also add permissions to `AndroidManifest.xml` or `Info.plist`
through its config plugin without you writing a line of configuration.

**Fix.** Review what a new native dependency actually adds:

```bash
npx expo prebuild --clean   # in a SCRATCH COPY of the project, never your working tree
git diff -- android/app/src/main/AndroidManifest.xml ios/
```

If a logging library added a location permission, you want to know before the store review tells
you.

**Verification.** [Verifying Generated Native Output](../expo-config-plugins/verifying-output.md)
walks through the scratch-copy diff properly. Do it once per dependency that ships a config plugin.

## Common mistakes

- **Installing with a bare package-manager command.** You get a version built for a different SDK
  and a runtime failure later. `npx expo install` every time.
- **Not rebuilding after adding a native package.** The JavaScript import resolves, so everything
  looks installed until the first call into native code.
- **Assuming a config plugin applies without a rebuild.** Plugins run during native generation.
  Nothing in a running binary re-reads them.
- **Running `npx expo prebuild` to force the change through, on a project with committed native
  directories.** It clears and regenerates them. Rebuild instead, or regenerate deliberately in a
  scratch copy first.
- **Copying a version number from a React Native CLI tutorial.** SDK 57 pins its own versions.
  `npx expo install --check` will tell you, but only if you run it.
- **Adding a library that has not shipped New Architecture support.** SDK 57 is on 0.86, which is
  New Architecture only.
- **Skipping `--check` after a merge.** Someone else's `package.json` edit is exactly the case it
  catches.

## Related topics

- [Why You Need a Development Build](why-you-need-one.md) — the runtime error a missing native module produces.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — how the version map works.
- [Creating One Locally](creating-locally.md) — running the rebuild.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — how a package changes native config.
- [Verifying Generated Native Output](../expo-config-plugins/verifying-output.md) — diffing what a dependency added.
- [Using Community Plugins](../expo-config-plugins/using-community-plugins.md) — plugins that ship with libraries.
- [Dependency Auditing](../expo-security/dependency-auditing.md) — reviewing what you depend on.
- [install --check and --fix](../expo-migration/install-check-and-fix.md) — the alignment commands in detail.
