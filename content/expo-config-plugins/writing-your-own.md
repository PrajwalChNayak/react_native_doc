---
title: Writing Your Own Plugin
description: The full authoring path for a local config plugin — typed props, one mod per platform, idempotency, composition, and shipping it inside a published package.
status: current
toolchain: expo
sdk: 57
---

You write your own config plugin when a native change is needed, no app config key covers it,
`expo-build-properties` does not expose it, and no library you use ships a plugin for it. That is
rarer than people expect — check [What a Config Plugin Is](what-they-are.md) for the list of things
to rule out first.

Everything on this page was checked against the installed `@expo/config-plugins` **57.0.9**, the
version `expo@57.0.22` depends on, imported through `expo/config-plugins` as an app should.

> [!NOTE] Expo Go vs development build
> A config plugin changes the generated native project. Expo Go's native project is not yours, so
> plugins do nothing there. You need a
> [development build](../expo-development-builds/why-you-need-one.md), rebuilt after every plugin
> change.

## Why it exists / when to use it — and when NOT to

The situation that justifies a plugin: your app needs a specific element in `AndroidManifest.xml`,
a key in `Info.plist`, an entitlement, or a line in a Gradle file, **and** you have chosen to keep
`ios/` and `android/` generated rather than committed. The plugin is the only way that change
survives the next prebuild.

Do not write one when:

- **The app config already has the key.** `ios.infoPlist`, `ios.entitlements`,
  `android.permissions`, `android.intentFilters` and `scheme` cover a lot.
- **`expo-build-properties` has the option.** See [expo-build-properties](build-properties.md).
- **You have committed the native directories.** Edit them directly and stop running prebuild.
- **You want runtime behaviour.** A plugin runs in Node at generation time and never again. If you
  need code that runs in the app, you want a [module](../expo-native-code/expo-modules-api.md).

## Basic example

A plugin that writes an analytics key into both native projects: a `<meta-data>` element on
Android and an `Info.plist` key on iOS.

```ts title=plugins/withAnalyticsKey.ts
import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

type Props = {
  apiKey: string;
};

const META_DATA_NAME = 'com.example.analytics.API_KEY';

const withAnalyticsKeyAndroid: ConfigPlugin<Props> = (config, {apiKey}) =>
  withAndroidManifest(config, (cfg) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    // addMetaDataItemToMainApplication replaces an existing item with the same
    // name, so running the plugin twice does not produce two elements.
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_DATA_NAME,
      apiKey,
    );
    return cfg;
  });

const withAnalyticsKeyIos: ConfigPlugin<Props> = (config, {apiKey}) =>
  withInfoPlist(config, (cfg) => {
    // Assigning a key is naturally idempotent. Appending to an array is not —
    // see "Idempotency" below.
    cfg.modResults.ExampleAnalyticsApiKey = apiKey;
    return cfg;
  });

const withAnalyticsKey: ConfigPlugin<Props> = (config, props) => {
  if (!props?.apiKey) {
    // Fail at generation time, where the message is visible, rather than
    // shipping a binary whose SDK silently refuses to start.
    throw new Error('withAnalyticsKey: the "apiKey" option is required.');
  }
  config = withAnalyticsKeyAndroid(config, props);
  config = withAnalyticsKeyIos(config, props);
  return config;
};

export default createRunOncePlugin(withAnalyticsKey, 'withAnalyticsKey', '1.0.0');
```

Reference it by path, with its options:

```json title=app.json
{
  "expo": {
    "plugins": [["./plugins/withAnalyticsKey", {"apiKey": "public-client-key"}]]
  }
}
```

A path entry resolves with the extensions `.js`, `.cjs`, `.mjs`, `.ts`, `.cts` and `.mts`, read from
the plugin resolver in `@expo/config-plugins` 57.0.9, and `.ts` files are transformed to CommonJS
by `@expo/require-utils` when loaded. You can therefore write a local plugin in TypeScript without a
build step. If you prefer plain JavaScript, the same plugin works as a `.js` file using `require`.

Then check the output before you trust it — [Verifying Generated Native Output](verifying-output.md):

```bash
npx expo prebuild --no-install
```

> [!DANGER] `npx expo prebuild` clears and regenerates the native directories
> In SDK 57 prebuild **deletes and recreates** `ios/` and `android/` by default. Hand edits in them
> are destroyed. Run it in a scratch copy of the project if you have anything in those directories
> you have not committed. See
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

> [!WARNING] A value in a plugin option is not a secret
> `apiKey` above ends up in `AndroidManifest.xml` and `Info.plist` inside the shipped binary, where
> anyone can read it. Only put **public** client identifiers there. See
> [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md).

## How it works

### The anatomy

Every plugin you write has the same three layers:

| Layer | What it is | Example above |
| --- | --- | --- |
| The exported plugin | `ConfigPlugin<Props>` — validates props, composes the platform plugins | `withAnalyticsKey` |
| A platform plugin | `ConfigPlugin<Props>` that registers exactly one mod | `withAnalyticsKeyAndroid` |
| The mod callback | Receives `cfg.modResults` (the parsed file), mutates it, returns `cfg` | the arrow passed to `withAndroidManifest` |

`ConfigPlugin<Props>` is `(config: ExpoConfig, props: Props) => ExpoConfig`. A plugin that takes no
options is `ConfigPlugin` (the default `Props` is `void`).

### Registering is not running

Calling `withAndroidManifest(config, callback)` does **not** edit the manifest. It records the
callback on `config.mods.android.manifest` and returns the config. The callbacks run later, when
prebuild compiles the mods and hands each one the parsed file. [Mods and the Dangerous Mods](mods.md)
covers that compilation step and its ordering.

This is why a plugin body with a `console.log` outside the callback prints during
`npx expo config` too, while the callback only runs when native files are actually being generated
or introspected.

### What the callback receives

The callback's argument is an `ExportedConfigWithProps<T>`:

| Field | What it holds |
| --- | --- |
| `modResults` | The parsed file — a manifest object, a plist object, or `{path, language, contents}` for string-based files |
| `modRequest.projectRoot` | The app's root directory |
| `modRequest.platformProjectRoot` | `…/android` or `…/ios` |
| `modRequest.projectName` | iOS only — the Xcode project directory name |
| `modRequest.introspect` | `true` when evaluated by `npx expo config --type introspect`; make no filesystem writes |
| `modRawConfig` | A frozen copy of the original app config |

The rest of the object is the app config itself, so `cfg.ios?.bundleIdentifier` is available inside
a mod callback.

### Idempotency

Prebuild clears and regenerates by default, so each run starts from the template. That hides a
non-idempotent plugin — until someone runs `npx expo prebuild --no-clean`, which applies plugins to
the **existing** native directories. A plugin that appends without checking then appends twice.

Write every mod so running it twice produces the same file as running it once:

```ts title=plugins/withQueriesScheme.ts
import {withInfoPlist, type ConfigPlugin} from 'expo/config-plugins';

const withQueriesScheme: ConfigPlugin<{scheme: string}> = (config, {scheme}) =>
  withInfoPlist(config, (cfg) => {
    const existing = cfg.modResults.LSApplicationQueriesSchemes ?? [];
    // Only add the scheme if it is not already present, so a --no-clean run or a
    // second plugin adding the same value leaves one entry, not two.
    if (!existing.includes(scheme)) {
      cfg.modResults.LSApplicationQueriesSchemes = [...existing, scheme];
    }
    return cfg;
  });

export default withQueriesScheme;
```

For string-based files (Gradle, Podfile), use `CodeGenerator.mergeContents`, which wraps the inserted
lines in tagged comments and replaces them on the next run rather than duplicating them. The
[mods page](mods.md) shows it.

### Composition

Three ways to combine plugins, all verified exports:

| Helper | Use it for |
| --- | --- |
| Sequential calls (`config = withA(config); config = withB(config)`) | The clearest form when props differ per call |
| `withPlugins(config, [withA, [withB, props]])` | An array in the same shape as the app config `plugins` array |
| `createRunOncePlugin(plugin, name, version)` | Recording the plugin in the config history so a second application is skipped |

Use `createRunOncePlugin` on anything you export, because a plugin can arrive twice: once from your
`plugins` array and once from a library that applies it internally.

### Errors and warnings

Throw an `Error` for a misconfiguration that would produce a broken binary. For something worth
knowing but not fatal, use `WarningAggregator`, which prints without disrupting the prebuild
spinner:

```ts title=plugins/withOptionalFeature.ts
import {WarningAggregator, withAndroidManifest, type ConfigPlugin} from 'expo/config-plugins';

const withOptionalFeature: ConfigPlugin<{enabled?: boolean}> = (config, props) => {
  if (!props?.enabled) {
    // Signature verified: addWarningAndroid(property, text, link?)
    WarningAggregator.addWarningAndroid(
      'withOptionalFeature',
      'Feature disabled; no manifest changes were made.',
    );
    return config;
  }
  return withAndroidManifest(config, (cfg) => cfg);
};

export default withOptionalFeature;
```

## Platform differences

:::tabs
@tab Android
- Structured mods: `withAndroidManifest` (xml2js JSON), `withStringsXml`, `withAndroidColors`,
  `withAndroidColorsNight`, `withAndroidStyles`, `withGradleProperties` (a list of property items).
- String mods: `withAppBuildGradle`, `withProjectBuildGradle`, `withSettingsGradle`,
  `withMainActivity`, `withMainApplication` — `modResults.contents` is the file as a string, and
  `modResults.language` tells you whether it is Groovy/Kotlin DSL or Java/Kotlin.
- `AndroidConfig.Manifest` and `AndroidConfig.Permissions` provide helpers that operate on the
  parsed manifest, so you rarely touch the raw xml2js shape.
@tab iOS
- Structured mods: `withInfoPlist`, `withEntitlementsPlist`, `withExpoPlist`,
  `withPodfileProperties` (key-value pairs), `withXcodeProject` (an `xcode` project object).
- String mods: `withPodfile`, `withAppDelegate` — `modResults.contents` is the file as a string.
- Anything under `ios/` that none of these reach needs a dangerous mod. See
  [Mods and the Dangerous Mods](mods.md) for why that should be your last option.
:::

## Common patterns

### Ship a plugin inside a package

A published package exposes its plugin through `app.plugin.js` at the package root, which the
resolver looks for first (`app.plugin.{js,cjs,mjs,ts,cts,mts}`):

```js title=app.plugin.js
// A one-line re-export keeps the compiled plugin in its own build directory.
module.exports = require('./plugin/build');
```

The SDK 57 module template's `prepare` script builds a `plugin/` subdirectory with its own
`tsconfig.json` when one exists, which is the conventional layout. See
[Publishing an Expo Module](../expo-native-code/publishing.md).

### Keep the logic testable

Put the transformation in a plain function that takes and returns the parsed data, and keep the mod
callback a one-line adapter. The function can then be unit-tested without prebuild — see
[Testing Plugins and Common Failures](testing-and-failures.md).

```ts title=plugins/analyticsKey.ts
import type {InfoPlist} from 'expo/config-plugins';

// Pure: no filesystem, no config, no mods. Trivial to test.
export function setAnalyticsKey(plist: InfoPlist, apiKey: string): InfoPlist {
  return {...plist, ExampleAnalyticsApiKey: apiKey};
}
```

### Read the app config, do not duplicate it

A mod callback has the full app config on `cfg`. Derive values from `cfg.ios?.bundleIdentifier` or
`cfg.android?.package` rather than asking the user to pass them again as props, so the two can never
disagree.

## Security considerations

**Threat.** A plugin is Node code that runs with the build user's permissions on every developer
machine and every build server. A plugin option is also a value that ends up in the shipped binary.

**Exploit.** Two realistic failures: a plugin that reads `process.env.SECRET_TOKEN` and writes it
into `Info.plist` — now extractable from the `.ipa` with `unzip` and `plutil` — and a dangerous mod
that writes outside `modRequest.platformProjectRoot`, silently modifying source files.

**Fix.** Pass only public identifiers through plugins. Keep secrets server-side. Constrain every
file write to `modRequest.platformProjectRoot`, and prefer a structured mod that writes nothing
itself.

**Verification.** After prebuild in a scratch copy, search the generated output for the value:

```bash
git grep -n "SECRET" -- android ios
```

Any hit is in your binary.

## Common mistakes

- **Editing the file outside the callback.** Wrong: calling `fs.writeFileSync` in the plugin body.
  Right: register a mod and mutate `modResults`. Code in the plugin body runs even when nothing is
  being generated.
- **Forgetting to return `cfg` from the callback.** The mod chain receives `undefined` and prebuild
  fails with an error that does not name your plugin.
- **Non-idempotent appends.** Works on a clean prebuild, duplicates on `--no-clean`. Check before
  adding to an array; use `mergeContents` for string files.
- **Validating props lazily.** A missing option discovered inside a mod callback surfaces as a
  confusing mid-prebuild failure. Validate in the outer plugin and throw a message naming the plugin.
- **Putting a secret in a plugin option.** It lands in a plist or manifest in the binary.
- **Reaching for `withDangerousMod` first.** If a structured mod reaches the file, use it. See
  [Mods and the Dangerous Mods](mods.md).
- **Importing from `@expo/config-plugins` in an app.** Import from `expo/config-plugins`, which
  re-exports the version your SDK depends on.
- **Changing the plugin and not rebuilding.** The installed binary does not re-run plugins.

## Related topics

- [What a Config Plugin Is](what-they-are.md) — the model, and what to rule out first.
- [Mods and the Dangerous Mods](mods.md) — every mod, and how they are ordered.
- [Verifying Generated Native Output](verifying-output.md) — diffing what your plugin produced.
- [Testing Plugins and Common Failures](testing-and-failures.md) — unit tests and failure modes.
- [expo-build-properties](build-properties.md) — the options you may not need a plugin for.
- [Publishing an Expo Module](../expo-native-code/publishing.md) — shipping `app.plugin.js` with a package.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — why plugin options are public.
