---
title: expo-build-properties
description: The common Gradle and Podfile knobs — SDK versions, R8 and Proguard, use_frameworks, extra repositories and pods — exposed as config options so you do not have to write a plugin.
status: current
toolchain: expo
sdk: 57
---

`expo-build-properties` is a config plugin that exposes the native build settings people reach for
most often. Instead of writing a plugin that edits `build.gradle` or the Podfile with a regular
expression, you set an option in your app config.

```bash
npx expo install expo-build-properties
```

That resolves to **`~57.0.17`** on SDK 57.

Every option name, type and default in this page was read from that installed package's own
`pluginConfig.d.ts`. If a name here disagrees with something you read elsewhere, the type
definitions are what run.

## Why it exists / when to use it — and when NOT to

Most native build changes are one of a small set: raise `minSdkVersion`, turn on R8, add Proguard
rules, switch CocoaPods to frameworks, add a Maven repository, add a pod. Writing a plugin for each
of those means writing string manipulation against a Gradle file whose shape changes between SDKs.

`expo-build-properties` does that manipulation for you and keeps it working across upgrades.

Use it for anything in the tables below. Write your own plugin only when the setting is not there —
and check the tables before concluding that it is not, because the list is longer than people
expect.

> [!NOTE] It is a build-time setting, so it needs a rebuild
> Changing an option here changes the generated native project. Regenerate and rebuild; nothing
> picks it up at runtime.

## Basic example

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 26,
            "enableMinifyInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true,
            "extraProguardRules": "-keep class com.example.** { *; }"
          },
          "ios": {
            "useFrameworks": "static"
          }
        }
      ]
    ]
  }
}
```

## How it works

The plugin reads its options and applies them to the generated Gradle files, `gradle.properties`,
the Podfile and `Podfile.properties.json`. Because it runs during generation, it composes with
everything else in the `plugins` array rather than fighting it.

### Shared options

These three can be set at the top level or overridden per platform. A platform-specific value wins.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `buildReactNativeFromSource` | boolean | `false` | Build React Native from source instead of using precompiled binaries. Significantly increases build times. On iOS it also disables the precompiled `ReactNativeDependencies.xcframework` and `React.xcframework` |
| `reactNativeReleaseLevel` | `'stable'` \| `'canary'` \| `'experimental'` | `'stable'` | Which set of internal React Native feature flags to enable |
| `useHermesV1` | boolean | `true` | Hermes V1. Setting it to `false` selects the legacy Hermes engine and also requires `buildReactNativeFromSource: true` |

### Android options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `minSdkVersion` | number | — | Override `minSdkVersion` in **build.gradle** |
| `compileSdkVersion` | number | — | Override `compileSdkVersion` |
| `targetSdkVersion` | number | — | Override `targetSdkVersion` |
| `buildToolsVersion` | string | — | Override `buildToolsVersion` |
| `kotlinVersion` | string | — | Override the Kotlin version used to build the app |
| `cmakeVersion` | string | — | Override the CMake version for the app and all autolinked modules |
| `enableMinifyInReleaseBuilds` | boolean | — | Enable R8 in release builds to obfuscate Java code and reduce size |
| `enableShrinkResourcesInReleaseBuilds` | boolean | — | Enable `shrinkResources`. Use together with `enableMinifyInReleaseBuilds` |
| `enablePngCrunchInReleaseBuilds` | boolean | `true` | `crunchPngs` in release builds. Disable if you optimise PNGs yourself |
| `extraProguardRules` | string | — | Appended to **android/app/proguard-rules.pro** |
| `packagingOptions` | object | — | `pickFirst`, `exclude`, `merge`, `doNotStrip` — each an array of patterns |
| `networkInspector` | boolean | `true` | Enable the network inspector |
| `extraMavenRepos` | array of string or object | — | Extra Maven repositories for all Gradle projects. Objects support `url`, `credentials` and `authentication` |
| `exclusiveMavenMirror` | string | — | Use one repository as an exclusive mirror; all others are ignored |
| `usesCleartextTraffic` | boolean | platform default | Whether the app intends to use cleartext HTTP |
| `useLegacyPackaging` | boolean | `false` | Compress native libraries in the APK using legacy packaging |
| `manifestQueries` | object | — | `<queries>` entries: `package`, `intent`, `provider` |
| `useDayNightTheme` | boolean | — | Switch the app theme to a DayNight variant for dark mode |
| `enableBundleCompression` | boolean | `false` | Compress the JavaScript bundle. Smaller APK, possibly slower startup |
| `buildArchs` | string array | `["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]` | Override `reactNativeArchitectures` |
| `usePrecompiledHeaders` | boolean | `false` | Precompiled headers for C++ builds. Marked **experimental** |

> [!DEPRECATED] `buildFromSource` on Android
> The installed types mark `android.buildFromSource` deprecated in favour of the shared
> `buildReactNativeFromSource`. Use the shared option.

### iOS options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `useFrameworks` | `'static'` \| `'dynamic'` | — | Enable `use_frameworks!` in the Podfile |
| `forceStaticLinking` | string array | — | Pods to link statically even when `use_frameworks!` is on. Consumed by `use_expo_modules` |
| `extraPods` | array of objects | — | Extra CocoaPods dependencies. Each takes `name` and optionally `version`, `configurations`, `modular_headers`, `source`, `path`, `podspec`, `testspecs`, `git`, `branch`, `tag`, `commit` |
| `networkInspector` | boolean | `true` | Enable the network inspector |
| `ccacheEnabled` | boolean | — | Enable the C++ compiler cache for iOS builds |
| `privacyManifestAggregationEnabled` | boolean | — | Merge `PrivacyInfo.xcprivacy` manifests from CocoaPods resource bundles into one file |
| `usePrecompiledModules` | boolean | `true` | Link matching Expo modules as vendored XCFrameworks instead of building from source |

> [!DEPRECATED] `ios.deploymentTarget`
> The plugin's `ios.deploymentTarget` option is marked deprecated in the installed types: use the
> built-in `ios.deploymentTarget` app config property instead, available from SDK 56 onward.

## Common patterns

### Raise the Android minimum SDK for a dependency

```json title=app.json
{
  "expo": {
    "plugins": [["expo-build-properties", {"android": {"minSdkVersion": 26}}]]
  }
}
```

A library that fails to link with a "minSdkVersion is too low" Gradle error needs this, not a
plugin of your own. Raising it excludes older devices, so check what you are dropping first.

### Turn on R8 and keep what reflection needs

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "enableMinifyInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true,
            "extraProguardRules": "-keep class com.example.models.** { *; }\n-keepattributes Signature"
          }
        }
      ]
    ]
  }
}
```

`enableShrinkResourcesInReleaseBuilds` is documented as requiring `enableMinifyInReleaseBuilds`;
setting it alone does not work. Add keep rules for anything reached by reflection — serialisation
models are the usual casualty.

> [!WARNING] R8 is not encryption
> Minification and obfuscation raise the effort required to read your code and shrink your app.
> They do not protect secrets. Anything in the bundle or the binary is readable by someone
> determined. See [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md).

### Add a private Maven repository

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "extraMavenRepos": [
              {
                "url": "https://maven.example.com/releases",
                "credentials": {
                  "username": "System.getenv('MAVEN_USER')",
                  "password": "System.getenv('MAVEN_TOKEN')"
                },
                "authentication": "basic"
              }
            ]
          }
        }
      ]
    ]
  }
}
```

A plain string entry is shorthand for `{url: "…"}` with no credentials. The credential values accept
a literal `System.getenv('NAME')` string so the secret stays out of the committed config — which is
the point, because `app.json` is committed.

### Add a pod a library forgot to declare

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {"ios": {"extraPods": [{"name": "Protobuf", "version": "~> 3.14.0"}]}}
      ]
    ]
  }
}
```

Each entry becomes a `pod` line in the generated Podfile.

## Performance considerations

Three options here have real build-time cost:

- **`buildReactNativeFromSource: true`** significantly increases build times, by the plugin's own
  documentation. Enable it only when you need to patch React Native itself.
- **`ccacheEnabled`** on iOS caches C++ compilation results and shortens repeat builds.
- **`usePrecompiledHeaders`** on Android speeds up C++ compilation and is marked experimental —
  it may not work with all native libraries.

`buildArchs` is the blunt instrument for local iteration: building only `arm64-v8a` for a device you
actually use cuts Android build time noticeably. Never ship a release with a trimmed list.

`enableBundleCompression` trades a smaller APK for possibly slower startup. Measure both before
deciding.

## Common mistakes

- **Writing a custom plugin for something already in the tables above.** Check first. A regular
  expression against `build.gradle` is a liability you will pay for at the next SDK upgrade.
- **Setting `enableShrinkResourcesInReleaseBuilds` without `enableMinifyInReleaseBuilds`.** The
  option is documented as needing the other one.
- **Enabling R8 and never testing a release build.** Minification breaks reflection-based code, and
  a development build will not show you.
- **Setting `useHermesV1: false` and nothing else.** It also requires `buildReactNativeFromSource:
  true`, which makes builds much slower.
- **Using `ios.deploymentTarget` from this plugin.** It is deprecated; use the built-in app config
  property.
- **Using `android.buildFromSource`.** Deprecated in favour of the shared
  `buildReactNativeFromSource`.
- **Putting a real credential in `extraMavenRepos`.** `app.json` is committed. Use the
  `System.getenv('…')` form.
- **Shipping a trimmed `buildArchs`.** It is a local iteration trick. A release needs every
  architecture your store listing claims.
- **Changing an option and expecting it to apply without a rebuild.** It is a native build setting.

## Related topics

- [What a Config Plugin Is](what-they-are.md) — why this package exists at all.
- [Using Community Plugins](using-community-plugins.md) — the `plugins` array and ordering.
- [Writing Your Own Plugin](writing-your-own.md) — when an option genuinely is missing.
- [Mods and the Dangerous Mods](mods.md) — what this plugin does internally.
- [Verifying Generated Native Output](verifying-output.md) — confirming a setting landed.
- [Debugging a Development Build](../expo-development-builds/debugging.md) — the network inspector option.
- [Bundle Size](../expo-performance/bundle-size.md) — what minification actually buys.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — what it does not.
