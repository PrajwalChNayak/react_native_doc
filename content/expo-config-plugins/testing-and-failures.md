---
title: Testing Plugins and Common Failures
description: Unit-testing a config plugin without prebuild, testing the registered mod, and the real error messages and silent failures you meet when a plugin goes wrong.
status: current
toolchain: expo
sdk: 57
---

A config plugin fails in one of two ways. Either prebuild stops with an error — annoying, but
honest — or prebuild succeeds and the change is not in the binary. The second kind is the one
that costs days, because nothing tells you it happened.

This page covers testing that catches both, and the failures you will actually meet. The tests below
were run with Node's built-in test runner against the installed `@expo/config-plugins` 57.0.9; the
error messages are quoted from its source.

> [!NOTE] Expo Go vs development build
> Plugins only matter for a development build or release build. Nothing on this page can be observed
> in Expo Go.

## Why it exists / when to use it — and when NOT to

Test a plugin when it has logic: conditionals on props, idempotency checks, string edits with
anchors. Those break quietly on SDK upgrades.

A plugin that only sets one key through a helper does not need unit tests. A single
[verification diff](verifying-output.md) after each SDK upgrade is enough.

## Basic example

Structure the plugin so the transformation is a plain exported function, and the mod callback only
adapts it:

```js title=plugins/withAnalyticsKey.js
const {AndroidConfig, withAndroidManifest} = require('expo/config-plugins');

// Pure: takes the parsed manifest, returns it. No filesystem, no prebuild.
function setAnalyticsKey(manifest, apiKey) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    app,
    'com.example.analytics.API_KEY',
    apiKey,
  );
  return manifest;
}

const withAnalyticsKey = (config, {apiKey}) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = setAnalyticsKey(cfg.modResults, apiKey);
    return cfg;
  });

module.exports = withAnalyticsKey;
module.exports.setAnalyticsKey = setAnalyticsKey;
```

Then test three things: the transformation, its idempotency, and that the plugin registers a mod
which applies it.

```js title=plugins/withAnalyticsKey.test.js
const test = require('node:test');
const assert = require('node:assert');
const withAnalyticsKey = require('./withAnalyticsKey');
const {setAnalyticsKey} = withAnalyticsKey;

// The smallest manifest shape the helpers accept. Build it fresh per test —
// the helpers mutate their input.
function fixtureManifest() {
  return {
    manifest: {
      $: {'xmlns:android': 'http://schemas.android.com/apk/res/android'},
      application: [{$: {'android:name': '.MainApplication'}}],
    },
  };
}

test('adds the meta-data item', () => {
  const m = setAnalyticsKey(fixtureManifest(), 'k1');
  assert.deepStrictEqual(m.manifest.application[0]['meta-data'], [
    {$: {'android:name': 'com.example.analytics.API_KEY', 'android:value': 'k1'}},
  ]);
});

test('is idempotent', () => {
  const once = setAnalyticsKey(fixtureManifest(), 'k1');
  const twice = setAnalyticsKey(once, 'k1');
  assert.strictEqual(twice.manifest.application[0]['meta-data'].length, 1);
});

test('registers a manifest mod and the mod applies the change', async () => {
  const config = withAnalyticsKey({name: 'x', slug: 'x'}, {apiKey: 'k2'});
  assert.strictEqual(typeof config.mods.android.manifest, 'function');

  // Invoke the registered mod directly with a fixture. `nextMod` stands in for
  // the rest of the chain that prebuild would normally supply.
  const result = await config.mods.android.manifest({
    ...config,
    modResults: fixtureManifest(),
    modRequest: {nextMod: (c) => c},
  });
  assert.strictEqual(
    result.modResults.manifest.application[0]['meta-data'][0].$['android:value'],
    'k2',
  );
});
```

```bash
node --test plugins/withAnalyticsKey.test.js
```

All three tests passed against `@expo/config-plugins` 57.0.9. Pass the file path, not the directory:
`node --test plugins/` tries to load the directory as a module and fails.

`jest-expo` is equally valid if your project already uses Jest; the test bodies are the same.

## How it works

### Three layers of testing

| Layer | Tests | Speed | Catches |
| --- | --- | --- | --- |
| Pure function | The transformation on a fixture | Milliseconds | Logic, idempotency |
| Registered mod | The plugin registers the right key and applies the function | Milliseconds | Wrong mod, forgotten `return cfg` |
| Scratch prebuild | The real template, every plugin, real ordering | Tens of seconds | Anchors that no longer match, plugin order, library conflicts |

The first two run on every commit. The third runs after an SDK upgrade or a plugin change — see
[Verifying Generated Native Output](verifying-output.md).

### Why fixtures, not real files

A unit test that reads a real `AndroidManifest.xml` from a generated `android/` directory depends on
having run prebuild, on the SDK version, and on every other plugin. A minimal fixture tests exactly
your transformation. The scratch prebuild is where the real template belongs.

For string mods, keep a small fixture copy of the relevant section of `build.gradle` or the Podfile
**including the anchor line**, and refresh it when you upgrade the SDK. When the anchor changes in
the template, the fixture update is the moment you notice.

## Common failures

### Prebuild stops: the plugin cannot be found

From the resolver in 57.0.9:

```text
Failed to resolve plugin for module "<name>" relative to "<projectRoot>". Do you have node modules installed?
```

Causes, in the order worth checking:

1. The package is not installed — run `npx expo install <package>`.
2. A local path is wrong. Paths are relative to the project root and must start with `./`.
3. The package has no `app.plugin.{js,cjs,mjs,ts,cts,mts}` and no usable `main` entry.

### Prebuild stops: the export is not a function

```text
Plugin "<name>" must export a function from file: <file>.
```

Usually `export default` in a CommonJS file, `module.exports = {withThing}` instead of
`module.exports = withThing`, or an `async` plugin function. A plugin must synchronously return a
config; only the **mod callback** may be async.

### Prebuild stops: a mod returned nothing

```text
Mod `mods.android.manifest` evaluated to an object that is not a valid project config. Instead got: undefined
```

The mod callback did not `return cfg`. The message names the mod key, not your plugin, so search your
plugins for callbacks registered on that key. Invoking the mod directly — as in the third test above
— resolves with `undefined` rather than throwing, which is why a test should assert on the result.

### Prebuild stops: mod ordering errors

Two further messages come from `withBaseMod`, and both mean something registered a mod after the base
mods were attached — typically hand-written tooling calling `withBaseMod` or an outdated plugin:

```text
Cannot add mod to "<platform>.<mod>" because the provider has already been added. Provider must be the last mod added.
```

```text
Cannot set provider mod for "<platform>.<mod>" because another is already being used.
```

App plugins that use `withAndroidManifest`, `withInfoPlist` and friends never hit these.

### Prebuild succeeds, change missing: anchor no longer matches

A string mod using a regex or `mergeContents` anchor against a template line that the new SDK
reworded. `mergeContents` returns `didMerge: false`, and a plugin that does not check it writes the
file unchanged.

Fix the plugin to throw when nothing matched, as in [Mods and the Dangerous Mods](mods.md). Then the
failure moves from "silently missing" to "prebuild stops with a message".

### Prebuild succeeds, change missing: another plugin overwrote it

Two plugins set the same key. For the same mod, the plugin listed **earlier** in `plugins` runs its
callback **last** and wins. That was confirmed by running prebuild with two conflicting plugins — the
first-listed plugin's value was the one generated. Reorder, or make one plugin respect an existing
value.

### Prebuild succeeds, change missing: a dangerous mod was overwritten

Dangerous mods run before all other mods. An edit to `AndroidManifest.xml` made in a dangerous mod is
replaced when the manifest's structured mod writes the file afterwards. Use the structured mod.

### Works on a clean prebuild, duplicates on `--no-clean`

The plugin appends without checking. `npx expo prebuild --no-clean` reapplies plugins to existing
files, and the second copy appears. The idempotency test above is the unit-level guard; a `--no-clean`
rerun with an empty `git diff` is the integration-level one.

### Works locally, fails on a build server

- The plugin reads an environment variable that is set in your shell but not on the server.
- A local `.ts` plugin imports a dev-only package not installed in the build environment.
- The build server regenerates `ios/` and `android/`, so a hand edit you made locally is absent.

### The binary has the old behaviour

The plugin changed but the app was not rebuilt, or you are testing in Expo Go. Plugins take effect
only in a new native build.

## Platform differences

:::tabs
@tab Android
Manifest fixtures need `manifest.application` as an **array** of objects with a `$` attribute map —
the xml2js shape. Most "cannot read property of undefined" errors in manifest tests are a fixture that
used a plain object instead of an array.
@tab iOS
`Info.plist` and entitlements fixtures are plain objects, so they are the easiest to test. The Xcode
project mod hands you an `xcode` library object, which is hard to fixture; keep logic that touches it
thin and cover it with the scratch prebuild instead.
:::

## Common patterns

**Export the pure function next to the plugin.** `module.exports.setAnalyticsKey = …` keeps the plugin
the default export while making the logic importable from a test.

**Throw with the plugin's name in the message.** Prebuild error output rarely names the plugin that
caused the error. `withAnalyticsKey: the "apiKey" option is required.` saves the search.

**Re-run the scratch prebuild on every SDK upgrade.** The template is what changes between SDKs, and
string mods are what break.

## Common mistakes

- **Testing only against a generated file on disk.** The test then depends on prebuild and every other
  plugin. Test the transformation on a fixture.
- **Not asserting idempotency.** A plugin that passes on a clean prebuild duplicates on `--no-clean`.
- **Swallowing a non-match in a string mod.** Silent success is the most expensive failure mode.
  Throw.
- **Making the plugin function `async`.** Plugins must return a config synchronously; only mod
  callbacks can be async.
- **Forgetting `return cfg`.** The error names `mods.<platform>.<key>`, not your plugin.
- **Assuming the last plugin in the array wins.** For the same mod, the first-listed plugin's callback
  runs last.
- **Reading plugin errors as library bugs.** Check your own plugins for the named mod key before
  opening an issue.
- **Running `node --test` on a directory.** Pass the test file path.

## Related topics

- [Writing Your Own Plugin](writing-your-own.md) — structuring a plugin so it can be tested.
- [Mods and the Dangerous Mods](mods.md) — ordering, and guarding string edits.
- [Verifying Generated Native Output](verifying-output.md) — the integration-level check.
- [Using Community Plugins](using-community-plugins.md) — failures from plugins you did not write.
- [Upgrading the SDK](../expo-migration/upgrading-sdk.md) — when string mods break.
