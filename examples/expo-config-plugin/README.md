# Example: expo-config-plugin

A **config plugin** that changes native configuration on both platforms, plus a script that
shows you the generated result in a scratch copy.

> **Toolchain:** Expo SDK 57 · React Native **0.86.3** · runs in **Expo Go**. The JS app does,
> but the native changes only take effect in a development or release build, because Expo Go's
> binary is fixed.

## Why a plugin at all

Under Continuous Native Generation, `ios/` and `android/` are **build output**. In SDK 57,
`npx expo prebuild` **clears and regenerates** them by default, so a hand edit to
`AndroidManifest.xml` or `Info.plist` is deleted on the next prebuild. A config plugin is how a
native change survives: it runs during prebuild and re-applies the change every time.

## The plugin

`plugins/withExampleNativeConfig.js`:

- **Android:** adds `<meta-data android:name="com.example.EXAMPLE_FEATURE_FLAG" …>` to
  `<application>` via `withAndroidManifest` and `AndroidConfig.Manifest.addMetaDataItemToMainApplication`.
- **iOS:** adds `ExampleFeatureFlag` to `Info.plist` via `withInfoPlist`.
- It is wrapped in `createRunOncePlugin`, so listing it twice does not duplicate the entry.
- It takes an option. `app.json` passes `{"featureFlag": "enabled"}`.

Every function it uses was checked against the installed `expo/config-plugins`. That covers
`withAndroidManifest`, `withInfoPlist` and `createRunOncePlugin`, plus
`AndroidConfig.Manifest.getMainApplicationOrThrow` and
`AndroidConfig.Manifest.addMetaDataItemToMainApplication`.

It uses the **typed** mods, not `withDangerousMod`. Typed mods run in a defined order, operate
on a parsed model and compose with other plugins. A dangerous mod is raw filesystem access with
none of that, and belongs at the bottom of the list of options.

## The generated output — real, not described

> [!DANGER]
> Never run `npx expo prebuild` in a working project just to look. It deletes and regenerates
> the native directories. The script below does it in a throwaway copy.

```bash
npm run prebuild:scratch
```

**Android** — produced by an actual `npx expo prebuild --platform android --no-install` in a
scratch copy on this machine. The full generated manifest is saved at
`generated-output/AndroidManifest.xml`, and line 15 is the plugin's:

```diff
+ <meta-data android:name="com.example.EXAMPLE_FEATURE_FLAG" android:value="enabled"/>
```

**iOS** — not generated on this host. The Expo CLI refuses to prebuild iOS on Windows (see
`@expo/cli` `build/src/prebuild/resolveOptions.js`), and the script says so rather than
pretending. It falls back to `expo config --type introspect`, which runs the **same mods**
against an in-memory `Info.plist`:

```text
Info.plist ExampleFeatureFlag = "enabled"
```

That proves the plugin's iOS mod runs and produces the right value. It does **not** prove the
key lands in a generated `ios/` project, because that needs macOS. Run the script there with
`ios` as the argument to see the real file.

## Verifying without prebuild

`expo config --type introspect` is the cheapest check that a plugin applied. Running it on this
project shows the Android manifest `meta-data` list ending in:

```json
{"$":{"android:name":"com.example.EXAMPLE_FEATURE_FLAG","android:value":"enabled"}}
```

## Run it

```bash
npm install
```

```bash
npm run prebuild:scratch
```

## Verify

Every result below was produced on this project on Windows with Node 22.13.0:

| Check | Result |
| --- | --- |
| `npm run tsc` | exit 0 |
| `npm run check-deps` | `Dependencies are up to date` |
| `npm run config:public` | resolves; `sdkVersion: 57.0.0`, plugin listed with its options |
| `expo config --type introspect` | manifest `meta-data` and `Info.plist` both contain the flag |
| Android prebuild in scratch | generated manifest contains the `meta-data` line |
| iOS prebuild | **NOT RUN.** Unsupported on Windows; introspection used instead |
| `npm run export` | **580 modules** → `index-*.hbc` **1.4 MB** |

## Related reading

- [What a Config Plugin Is](../../content/expo-config-plugins/what-they-are.md)
- [Mods and the Dangerous Mods](../../content/expo-config-plugins/mods.md)
- [Verifying Generated Native Output](../../content/expo-config-plugins/verifying-output.md)
- [expo prebuild](../../content/expo-core-concepts/prebuild.md)
