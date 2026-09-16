---
title: Using Community Plugins
description: Most libraries that need native configuration ship a config plugin. How to find one, add it to the plugins array, pass its options, and check what it actually changed.
status: current
toolchain: expo
sdk: 57
---

Most of the config plugins you use are ones you did not write. A library that needs a permission
string, a URL scheme, a Gradle property or an entitlement ships an `app.plugin.js`, and using it is
one line in your app config.

This page is about consuming those plugins well: finding them, passing options, ordering them, and
confirming they did what you expected.

## Why it exists / when to use it — and when NOT to

A library that needs native configuration has two options: ask you to edit `AndroidManifest.xml` by
hand, or ship a plugin. The second survives a regeneration; the first does not.

That is why a library's plugin is not optional decoration. In a generated project, a hand edit to a
native file lives until the next prebuild and then disappears, taking the feature with it.

Do not add a plugin when the library does not ship one. Adding a name that is not a plugin to the
`plugins` array is a resolution error, not a no-op.

## Basic example

Install the library with `npx expo install`, then add its plugin:

```bash
npx expo install expo-camera
```

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Scan a receipt to attach it to an expense.",
          "microphonePermission": "Record a voice note with a receipt.",
          "recordAudioAndroid": true
        }
      ]
    ]
  }
}
```

Those four option names — `cameraPermission`, `microphonePermission`, `recordAudioAndroid` and
`barcodeScannerEnabled` — are the plugin's real props, read from `expo-camera@57.0.5`'s own type
definitions. The two permission strings also accept `false`, which omits the key instead of setting
it.

Then regenerate and rebuild. A plugin has no effect on a binary that already exists.

## How it works

### Finding out whether a library has a plugin

Three checks, cheapest first:

1. **Look for `app.plugin.js` at the package root.**

   ```bash
   ls node_modules/expo-camera/app.plugin.js
   ```

   If it exists, the package name is a valid `plugins` entry.

2. **Read its props type.** The file is conventionally a one-line re-export:

   ```bash
   cat node_modules/expo-camera/app.plugin.js
   # module.exports = require('./plugin/build/withCamera');
   cat node_modules/expo-camera/plugin/build/withCamera.d.ts
   ```

   That `.d.ts` is the authoritative option list. A library's README goes stale; the type does not.

3. **Check the library's documentation** for which options are platform-specific and what the
   defaults are.

> [!TIP] The `.d.ts` beats the README
> Every option name and default in this section was read from an installed package's type
> definitions rather than from prose. When a README and a `.d.ts` disagree, the `.d.ts` is what runs.

### Entry shapes

| Entry | Meaning |
| --- | --- |
| `"expo-camera"` | Apply with no options |
| `["expo-camera", {…}]` | Apply with options |
| `"./plugins/withThing"` | A local plugin, by path from the project root |

Many plugins are applied automatically when the package is installed, so the package does not need
to appear in `plugins` at all unless you want to pass options. `expo-camera`'s plugin type is
`ConfigPlugin<void | Props>` precisely because the no-options case is normal.

### Ordering

`plugins` is an ordered array, but the order in which their **mods** run is the reverse of what most
people expect. Each plugin wraps the previous one's mod, so for the same mod key the plugin listed
**earlier** runs its callback **last** — it sees the later plugin's changes and **wins** any direct
conflict.

This was confirmed two ways: by reading how the installed `@expo/config-plugins` 57.0.9 chains mods,
and by running `npx expo prebuild` with two conflicting plugins, where the value from the
**first-listed** plugin was the one in the generated manifest.

That matters less often than people fear, because most plugins add rather than replace. It matters a
great deal when two plugins both write the same `Info.plist` key or both insert into the same
Gradle block. If a change seems to vanish, try moving its plugin **earlier** in the array before
suspecting the plugin itself.

### Version alignment

A plugin ships inside a library, so its behaviour is tied to that library's version, which is in
turn tied to your SDK:

```bash
npx expo install --check
```

A plugin from a package built for a different SDK is one of the harder failures to diagnose,
because it usually still runs — it just writes something the current template does not expect. See
[Testing Plugins and Common Failures](testing-and-failures.md).

## Common patterns

### Prefer a library's plugin over your own

If a library ships a plugin that sets a permission string, use it rather than writing
`ios.infoPlist` yourself. The library's plugin is updated when the library's native requirements
change; your config key is not.

### Use `false` to suppress a permission you do not need

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-camera", {"microphonePermission": false, "recordAudioAndroid": false}]
    ]
  }
}
```

`expo-camera` requests microphone access by default because video recording needs it. An app that
only takes stills should say so — a permission you never use is a permission you have to justify in
review, and a small risk surface you gained for nothing.

### Group your plugin options where you can read them

```json title=app.json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["expo-camera", {"cameraPermission": "Scan a receipt."}],
      ["expo-build-properties", {"android": {"minSdkVersion": 26}}],
      "./plugins/withCustomScheme"
    ]
  }
}
```

Library plugins first, `expo-build-properties` near the end because it writes Gradle and Podfile
settings, your own plugins last so they can react to everything before them. This is a convention,
not a rule — but a consistent one is easier to reason about when something conflicts.

### Verify rather than assume

After adding or changing a plugin, prove it did what you meant by diffing the generated output in a
scratch copy of the project. [Verifying Generated Native Output](verifying-output.md) has the
procedure. It takes two minutes and it is the only thing that turns "the plugin should have done
that" into a fact.

## Security considerations

**Threat.** A config plugin is arbitrary Node code that runs on your machine and on your build
server during generation, with full filesystem access. It can also add permissions and entitlements
to your app without you writing any configuration.

**Exploit.** A plugin using a dangerous mod can read or write anything the build user can — source,
environment variables, credentials cached on a build machine. Separately, a plugin can quietly add
`android.permission.ACCESS_FINE_LOCATION` to your manifest, and the first you hear of it is a store
review question.

**Fix.** Treat a new plugin as you would any dependency that runs at build time:

- Read the plugin source for packages you do not recognise. It is usually under a hundred lines.
- Diff the generated native output before and after adding it, in a scratch copy.
- Pin versions and review upgrades, rather than accepting whatever `latest` resolves to.

**Verification.** In a scratch copy of the project:

```bash
npx expo prebuild --clean --no-install
git diff --stat -- android ios
git diff -- android/app/src/main/AndroidManifest.xml
```

Anything in that diff you cannot explain is a question for the library, not something to accept.

## Common mistakes

- **Adding a plugin and not rebuilding.** Plugins run during generation. The installed binary does
  not re-read them.
- **Adding a package name that has no `app.plugin.js`.** That is a resolution error during prebuild,
  not a silent skip. Check the file exists.
- **Trusting a README over the installed types.** Option names get renamed between SDKs. The
  `.d.ts` in `node_modules` is what actually runs.
- **Mixing a library's plugin with a manual config key doing the same thing.** One of them wins and
  which one is not obvious, so pick one.
- **Assuming the last plugin in the array wins.** It is the other way round: for the same mod key
  the **first-listed** plugin runs its callback last and wins.
- **Installing a library with a bare package-manager command.** You get a version built for another
  SDK, and its plugin writes what that SDK's template expected. Use `npx expo install`.
- **Assuming plugin order never matters.** It matters exactly when two plugins touch the same file,
  which is also when the failure is most confusing.
- **Accepting a plugin's default permissions without reading them.** Defaults are chosen for the
  library's full feature set, not your app's.

## Related topics

- [What a Config Plugin Is](what-they-are.md) — the model underneath.
- [expo-build-properties](build-properties.md) — the Gradle and Podfile knobs, with verified options.
- [Writing Your Own Plugin](writing-your-own.md) — when no library covers it.
- [Verifying Generated Native Output](verifying-output.md) — diffing what a plugin produced.
- [Testing Plugins and Common Failures](testing-and-failures.md) — ordering and version failures.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — the rebuild rule.
- [Dependency Auditing](../expo-security/dependency-auditing.md) — reviewing build-time code.
- [Permissions Patterns](../expo-sdk/permissions-patterns.md) — asking for only what you use.
