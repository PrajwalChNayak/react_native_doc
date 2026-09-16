---
title: Mods and the Dangerous Mods
description: How a config plugin actually edits a native file — every mod plugin in @expo/config-plugins 57.0.9, the order they run in, and why withDangerousMod is a last resort.
status: current
toolchain: expo
sdk: 57
---

A **mod** is the part of a config plugin that touches a native file. `withAndroidManifest`,
`withInfoPlist` and the rest are *mod plugins*: they register a callback against one file, and
prebuild later reads that file, runs every registered callback over its parsed contents, and writes
it back.

Every mod name on this page was read from the installed `@expo/config-plugins` **57.0.9** — its
`index.d.ts` exports and its `ModConfig` type. The ordering behaviour was read from its mod compiler
and then confirmed by running `npx expo prebuild` against a scratch copy of an SDK 57 project.

> [!NOTE] Expo Go vs development build
> Mods change the generated native project, which Expo Go does not use. Anything here needs a
> [development build](../expo-development-builds/why-you-need-one.md).

## Why it exists / when to use it — and when NOT to

Mods exist so that plugins never have to find, open, parse or save native files themselves. The
base mods own the file I/O; your callback only sees a parsed object and returns it. That is what
lets twenty plugins edit the same `AndroidManifest.xml` without trampling each other.

Use a **structured** mod (manifest, plist, entitlements, Gradle properties) whenever one reaches the
file you need. Use a **string** mod (Gradle files, Podfile, `MainApplication`) when the file has no
structured form. Use a **dangerous** mod only when nothing else reaches the file at all.

## Basic example

```ts title=plugins/withNoBackup.ts
import {AndroidConfig, withAndroidManifest, type ConfigPlugin} from 'expo/config-plugins';

// Structured mod: modResults is the manifest parsed to JSON. No regex, no file I/O.
const withNoBackup: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'false';
    return cfg;
  });

export default withNoBackup;
```

## How it works

### The mod plugins, verified

Exported from `expo/config-plugins` (re-exporting `@expo/config-plugins` 57.0.9):

:::tabs
@tab Android
| Mod plugin | `mods.android.*` key | File | `modResults` |
| --- | --- | --- | --- |
| `withAndroidManifest` | `manifest` | `android/app/src/main/AndroidManifest.xml` | Parsed XML (xml2js) |
| `withStringsXml` | `strings` | `res/values/strings.xml` | Parsed XML |
| `withAndroidColors` | `colors` | `res/values/colors.xml` | Parsed XML |
| `withAndroidColorsNight` | `colorsNight` | `res/values-night/colors.xml` | Parsed XML |
| `withAndroidStyles` | `styles` | `res/values/styles.xml` | Parsed XML |
| `withGradleProperties` | `gradleProperties` | `android/gradle.properties` | Array of property items |
| `withAppBuildGradle` | `appBuildGradle` | `android/app/build.gradle` | `{path, language, contents}` string |
| `withProjectBuildGradle` | `projectBuildGradle` | `android/build.gradle` | `{path, language, contents}` string |
| `withSettingsGradle` | `settingsGradle` | `android/settings.gradle` | `{path, language, contents}` string |
| `withMainActivity` | `mainActivity` | `MainActivity` (Kotlin or Java) | `{path, language, contents}` string |
| `withMainApplication` | `mainApplication` | `MainApplication` (Kotlin or Java) | `{path, language, contents}` string |
@tab iOS
| Mod plugin | `mods.ios.*` key | File | `modResults` |
| --- | --- | --- | --- |
| `withInfoPlist` | `infoPlist` | `ios/<name>/Info.plist` | Plist object |
| `withEntitlementsPlist` | `entitlements` | `ios/<name>/<name>.entitlements` | Plist object |
| `withExpoPlist` | `expoPlist` | `ios/<name>/Supporting/Expo.plist` | Plist object |
| `withPodfileProperties` | `podfileProperties` | `ios/Podfile.properties.json` | Key-value object |
| `withXcodeProject` | `xcodeproj` | `ios/<name>.xcodeproj` | An `xcode` project object |
| `withPodfile` | `podfile` | `ios/Podfile` | `{path, language, contents}` string |
| `withAppDelegate` | `appDelegate` | `AppDelegate` | `{path, language, contents}` string |
:::

Plus the platform-agnostic ones:

| Export | What it does |
| --- | --- |
| `withDangerousMod(config, [platform, action])` | Registers on `dangerous` — no file is read or written for you |
| `withFinalizedMod(config, [platform, action])` | Registers on `finalized` — same, but runs after everything else |
| `withMod(config, {platform, mod, action})` | Registers an action on any mod key by name |
| `withBaseMod(config, {...})` | Creates or intercepts a base mod (a provider). Tooling-level; you should not need it in an app |

There is no `withAndroidGradleProperties`, no `withIosEntitlements` and no `withInfoPlistAsync`. If a
name you have seen is not in the tables above, it is not in SDK 57.

### Registration versus evaluation

Calling a mod plugin only **records** a callback on `config.mods.<platform>.<key>`. Nothing runs
until prebuild compiles the mods:

1. Your `plugins` array is applied in order. Each mod plugin wraps the callback already registered
   for its key.
2. Prebuild adds the **base mods** — providers that know how to read and write each file — last.
3. For each platform, the compiler sorts the mod keys, then runs each key's chain: the provider
   reads the file, the callbacks run over `modResults`, the provider writes the result.

### The order your callbacks run in

This is the part that surprises people. `withMod` in 57.0.9 runs **your** callback first and then
calls the callback that was registered **before** it. The result, for two plugins editing the same
key:

- The plugin listed **later** in `plugins` runs its callback **earlier**.
- The plugin listed **earlier** runs **last**, sees the later plugin's changes, and wins any direct
  conflict.

Confirmed by running prebuild with two plugins that set the same `<meta-data>` name. The plugin
listed first in the array produced the value that ended up in the generated manifest:

```json title=app.json
{
  "expo": {
    "plugins": ["./plugins/withOrderA", "./plugins/withOrderB"]
  }
}
```

```diff
+    <meta-data android:name="com.example.ORDER" android:value="A-first-in-array"/>
```

Across **different** keys, the order is decided by the compiler, not by your array. It sorts keys so
that `dangerous` runs first and `finalized` runs last on both platforms, and on iOS `xcodeproj` runs
second — the compiler's comment says this is because many plugins read from it.

> [!TIP] Do not design around plugin order
> Order-dependent plugins break the moment someone reorders `plugins` or a library adds a mod to the
> same file. If two plugins genuinely conflict, make one of them check for the other's value, or
> merge them into one plugin.

### String mods and `mergeContents`

String mods give you a whole file as text. Editing it with a bare `replace` is fragile and not
idempotent. `CodeGenerator.mergeContents` inserts a tagged block after an anchor and replaces that
block on the next run:

```ts title=plugins/withExtraPod.ts
import {CodeGenerator, withPodfile, type ConfigPlugin} from 'expo/config-plugins';

const withExtraPod: ConfigPlugin<{pod: string}> = (config, {pod}) =>
  withPodfile(config, (cfg) => {
    const result = CodeGenerator.mergeContents({
      src: cfg.modResults.contents,
      newSrc: `  pod '${pod}'`,
      // The tag names the generated block so a later run replaces it instead of
      // appending a second copy.
      tag: 'with-extra-pod',
      anchor: /use_expo_modules!/,
      offset: 1,
      comment: '#',
    });
    // didMerge is false when the anchor was not found. Fail loudly: silently
    // skipping means a binary without the pod and no error until runtime.
    if (!result.didMerge && !result.didClear) {
      throw new Error('withExtraPod: could not find use_expo_modules! in the Podfile.');
    }
    cfg.modResults.contents = result.contents;
    return cfg;
  });

export default withExtraPod;
```

Before writing this, check [expo-build-properties](build-properties.md): `ios.extraPods` does the
same thing with no code.

## The dangerous mods

`withDangerousMod` registers on the `dangerous` key. Its base provider reads nothing and writes
nothing. Your callback receives the config and `modRequest` — including `platformProjectRoot` — and
is expected to do its own filesystem work.

```js title=plugins/withGoogleServicesCopy.js
const fs = require('node:fs');
const path = require('node:path');
const {withDangerousMod} = require('expo/config-plugins');

// Copies a file into the generated Android project. There is no structured mod
// for "place an arbitrary file", which is the one legitimate reason to reach for
// a dangerous mod.
module.exports = function withGoogleServicesCopy(config, {source}) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const {projectRoot, platformProjectRoot} = cfg.modRequest;
      const target = path.join(platformProjectRoot, 'app', 'google-services.json');
      await fs.promises.copyFile(path.resolve(projectRoot, source), target);
      return cfg;
    },
  ]);
};
```

> [!NOTE] Check the config key first
> For this specific file, `android.googleServicesFile` in the app config already exists. The example
> shows the mechanism, not a recommendation.

### Why they are a last resort

| Problem | Why it bites |
| --- | --- |
| **They run before every other mod.** | The compiler sorts `dangerous` first. Whatever you write can be overwritten by a structured mod that runs later, and you cannot see what later mods will do. |
| **No parsing, so usually a regex.** | Expo's own documentation says regex mods may break the build and are hard to version. A template change in the next SDK moves your anchor and the regex silently stops matching. |
| **No idempotency help.** | Nothing stops you appending twice on a `--no-clean` run. |
| **Invisible to introspection.** | `npx expo config --type introspect` removes every mod that has no introspection-capable base mod, `dangerous` included. You cannot preview a dangerous mod's effect without running prebuild. |
| **Unrestricted file access.** | The callback can write anywhere the build user can. A bug — or a malicious plugin — edits files outside `android/` or `ios/`. |
| **Silent failure.** | If a regex does not match, most dangerous mods write the file unchanged and report success. |

`withFinalizedMod` has most of the same problems, but runs **last**. It is the right choice in the
rare case where you must post-process a file after every structured mod has finished.

## Platform differences

:::tabs
@tab Android
Nearly every Android file you would want is reachable by a structured or string mod. A dangerous mod
on Android is usually a sign that the change belongs in `expo-build-properties`, or in a Gradle file
reachable by `withAppBuildGradle`.
@tab iOS
`withXcodeProject` hands you the `xcode` library's project object, which is how you add build
settings, files or build phases without a regex. It is also the mod most prone to conflicts, which is
why the compiler runs it right after the dangerous mods.
:::

## Common patterns

**One mod per concern, one plugin per mod file.** A plugin that edits the manifest, the Podfile and
`Info.plist` should be three platform plugins composed together, so a failure names the file.

**Guard every string edit.** Check `didMerge` from `mergeContents`, or check that a regex matched,
and throw if not. A silent no-op is worse than a failed prebuild.

**Prefer helpers over raw shapes.** `AndroidConfig.Manifest` and `AndroidConfig.Permissions` operate
on the parsed manifest and hide the xml2js layout (`$` for attributes, arrays everywhere).

## Security considerations

**Threat.** A dangerous mod is arbitrary Node code with unrestricted filesystem access, running on
every machine that runs prebuild — including CI workers that hold signing credentials.

**Exploit.** A dependency ships `app.plugin.js` with a dangerous mod that reads
`~/.gradle/gradle.properties` or a `credentials.json` and writes it into a generated resource file
that ends up in the APK.

**Fix.** Read the `app.plugin.js` of any plugin you add. Search for `withDangerousMod`,
`withFinalizedMod`, `fs.` and `child_process`. Constrain your own dangerous mods to
`modRequest.platformProjectRoot`.

**Verification.** In a scratch copy, diff the whole generated tree, not only the file you expected
to change:

```bash
git diff --stat -- android ios
git status --porcelain
```

A changed file outside `android/` or `ios/` after prebuild is a red flag.

## Common mistakes

- **Using a dangerous mod to edit `AndroidManifest.xml` or `Info.plist`.** Structured mods exist for
  both. A regex over XML breaks on attribute reordering; a later structured mod can also overwrite
  your edit because dangerous mods run first.
- **Assuming the later plugin wins.** For the same mod key, the plugin listed **earlier** in
  `plugins` runs its callback last and wins direct conflicts.
- **Not checking whether a string edit matched.** `mergeContents` returns `didMerge`; a regex returns
  its match. Throw when nothing matched.
- **Appending with `+=` in a string mod.** Duplicates on `--no-clean`. Use `mergeContents` with a tag.
- **Expecting introspection to show a dangerous mod's effect.** It is dropped from introspection.
  Run prebuild in a scratch copy instead.
- **Inventing mod names.** `withAndroidGradleProperties` and `withIosEntitlements` do not exist. Use
  `withGradleProperties` and `withEntitlementsPlist`.
- **Writing outside `platformProjectRoot`.** Prebuild will not stop you, and the change will not be
  regenerated or cleaned up.

## Related topics

- [Writing Your Own Plugin](writing-your-own.md) — the plugin structure these mods live in.
- [Verifying Generated Native Output](verifying-output.md) — seeing exactly what a mod changed.
- [Testing Plugins and Common Failures](testing-and-failures.md) — including silent string-mod failures.
- [What a Config Plugin Is](what-they-are.md) — the model underneath.
- [expo-build-properties](build-properties.md) — Gradle and Podfile changes without a string mod.
- [Using Community Plugins](using-community-plugins.md) — reviewing plugins you did not write.
