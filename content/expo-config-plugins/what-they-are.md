---
title: What a Config Plugin Is
description: A config plugin is a function that takes your app config and returns a modified one. It runs during prebuild, and it is how native changes stay expressible when you never hand-edit ios/ or android/.
status: current
toolchain: expo
sdk: 57
---

A config plugin is a **function that receives your app config and returns a modified app config**.
That is the entire idea. Its type, read from the installed `@expo/config-plugins` 57.0.9, is:

```ts
import type {ConfigPlugin} from 'expo/config-plugins';

export type Example = ConfigPlugin<{label: string}>;
// (config: ExpoConfig, props: {label: string}) => ExpoConfig
```

Plugins run during **prebuild**, the step that generates `ios/` and `android/` from your config.
They are the reason Continuous Native Generation is workable: if the native directories are build
output, every native change has to be expressible as an input, and a config plugin is that input.

## Why it exists / when to use it — and when NOT to

Without plugins, Continuous Native Generation would only support whatever the app config schema
happens to cover. The moment you needed a `<queries>` element in `AndroidManifest.xml`, or an extra
`UIBackgroundModes` entry, or a line in the Podfile, you would be forced to commit the native
directories and maintain them by hand.

Plugins close that gap. Write the change once as code, and it is reapplied every time the native
project is regenerated — after an SDK upgrade, on a fresh clone, in CI.

Do **not** reach for a plugin when:

- **The app config already has the field.** `ios.infoPlist`, `android.permissions`,
  `ios.bundleIdentifier`, `scheme` and many more are first-class config keys. A plugin that sets
  something the schema already sets is a maintenance liability.
- **`expo-build-properties` covers it.** Gradle and Podfile knobs — SDK versions, Proguard rules,
  `use_frameworks!`, extra Maven repositories — are already exposed as options. See
  [expo-build-properties](build-properties.md).
- **The library already ships one.** Most libraries that need native configuration include a plugin.
  See [Using Community Plugins](using-community-plugins.md).
- **You have decided to commit `ios/` and `android/`.** Then edit them directly and stop running
  prebuild. What you must not do is both.

## Basic example

A plugin is a module that default-exports the function. This one adds an Android permission.

```js title=plugins/withCustomPermission.js
const {AndroidConfig, withAndroidManifest} = require('expo/config-plugins');

/**
 * Adds a single permission to AndroidManifest.xml.
 * Written as a plugin rather than using `android.permissions` only because
 * the permission is conditional on a build-time flag.
 */
module.exports = function withCustomPermission(config, {permission}) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.addPermission(cfg.modResults, permission);
    return cfg;
  });
};
```

Reference it from the app config by path, with its options:

```json title=app.json
{
  "expo": {
    "plugins": [
      ["./plugins/withCustomPermission", {"permission": "android.permission.VIBRATE"}]
    ]
  }
}
```

Then regenerate and rebuild. A plugin has no effect on an already-built binary.

## How it works

### The `plugins` array

Each entry in `expo.plugins` is one of three shapes:

| Entry | Meaning |
| --- | --- |
| `"expo-build-properties"` | A package name. Its `app.plugin.js` is the plugin |
| `["expo-build-properties", {…}]` | The same, with options passed as the second argument |
| `"./plugins/withThing"` | A path to a local file, relative to the project root |

The array is **ordered**, and the order matters — plugins run in the order listed, and two plugins
that touch the same file see each other's output. [Mods and the Dangerous Mods](mods.md) explains
how that sequencing actually works.

### What a plugin can and cannot see

A plugin receives the resolved `ExpoConfig` object and returns a new one. It runs in Node, at
generation time, on the developer's or the build server's machine. It has no access to a running
app, no access to the device, and no runtime behaviour at all.

That is worth stating plainly because it is the most common misconception: a plugin is **build-time
configuration**, not a runtime hook.

### Where a plugin lives

| Location | Used for |
| --- | --- |
| `./plugins/withThing.js` in your project | A change specific to your app |
| `app.plugin.js` at a package root | A plugin shipped by a library |
| A dedicated npm package | A plugin shared across your own projects |

A library's `app.plugin.js` is conventionally a one-liner re-exporting the real implementation,
which is exactly what `expo-dev-client` does.

### The composition helpers

`@expo/config-plugins` — re-exported as `expo/config-plugins`, which is the import an app should
use — provides helpers for composing plugins:

```ts
import {withPlugins, createRunOncePlugin, type ConfigPlugin} from 'expo/config-plugins';
import type {ExpoConfig} from 'expo/config';

const withA: ConfigPlugin = (config) => config;
const withB: ConfigPlugin<{n: number}> = (config) => config;

const withEverything: ConfigPlugin = (config: ExpoConfig) =>
  withPlugins(config, [withA, [withB, {n: 1}]]);

// `createRunOncePlugin` guards against the same plugin being applied twice,
// which happens when two libraries both depend on a third that ships a plugin.
export default createRunOncePlugin(withEverything, 'withEverything', '1.0.0');
```

`withPlugins` takes an array in the same shape as the `plugins` config array, so a plugin can apply
other plugins. `createRunOncePlugin` records the plugin name and version in the config's history and
skips a second application.

## How it fits Continuous Native Generation

The pieces line up like this:

1. You write the app config, install packages, and list plugins.
2. `npx expo prebuild` generates `ios/` and `android/` from a template.
3. Base mods read each native file into a structured form — `AndroidManifest.xml` as JSON, an
   `Info.plist` as an object, `build.gradle` as a string.
4. Your plugins' mods modify those structures.
5. The base mods write the files back out.
6. The native build compiles what came out.

Steps 3 to 5 are the mod system. Step 2 is why the callout below matters on every page in this
section.

> [!DANGER] `npx expo prebuild` clears and regenerates the native directories
> In SDK 57, prebuild **deletes and recreates** `ios/` and `android/` by default. Any hand-edited
> native code in them is destroyed, permanently, with no prompt.
>
> This is not a bug — it is what makes generation reproducible. It does mean you must pick one
> strategy and hold to it: stay fully generated and express native changes as plugins, or commit the
> native directories and stop running prebuild. See
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

## Common patterns

### Reach for a config key before writing a plugin

```json title=app.json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Scan a receipt to attach it to an expense."
      }
    },
    "android": {
      "permissions": ["android.permission.CAMERA"]
    }
  }
}
```

This does the same job as a plugin, in fewer moving parts, and survives SDK upgrades without you
reading a changelog.

### Keep local plugins in one directory

`plugins/` at the project root, one file per concern, each named `withSomething`. Referenced by
relative path from `app.json`. Easy to find, easy to delete when a library makes one redundant.

### Write a comment saying why the plugin exists

A plugin is the least discoverable code in the project — it runs in a step most contributors never
watch, and it edits files nobody reads. The comment explaining *why* the change is needed is worth
more than the code.

## Common mistakes

- **Expecting a plugin to change a running app.** Plugins run at generation time. Editing one and
  restarting Metro does nothing; you must regenerate and rebuild.
- **Expecting a plugin to apply in Expo Go.** Expo Go's native project is not yours. Plugins are
  irrelevant there — see [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md).
- **Writing a plugin for something the app config already supports.** Check `ios.infoPlist`,
  `android.permissions`, `scheme` and `expo-build-properties` first.
- **Forgetting that `plugins` is ordered.** Two plugins editing the same file are sensitive to their
  order in the array.
- **Hand-editing `ios/` or `android/` and then running prebuild.** The edits are gone. If you are
  editing native files by hand, stop running prebuild and commit the directories.
- **Applying the same plugin twice.** Two libraries depending on a third that ships a plugin is
  common. `createRunOncePlugin` is the guard.
- **Importing from `@expo/config-plugins` directly in an app.** Use `expo/config-plugins`, which
  re-exports it at the version your SDK ships. Pinning the underlying package yourself is how you
  end up with two copies at different versions.

## Related topics

- [Using Community Plugins](using-community-plugins.md) — plugins that ship with libraries.
- [expo-build-properties](build-properties.md) — the common Gradle and Podfile knobs, without code.
- [Writing Your Own Plugin](writing-your-own.md) — the full authoring path.
- [Mods and the Dangerous Mods](mods.md) — how a plugin actually edits a native file.
- [Verifying Generated Native Output](verifying-output.md) — proving a plugin did what you meant.
- [Testing Plugins and Common Failures](testing-and-failures.md) — the failures that actually happen.
- [Continuous Native Generation](../expo-core-concepts/continuous-native-generation.md) — why generation exists.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the step plugins run in.
- [App Config](../expo-core-concepts/app-config.md) — the config a plugin receives.
