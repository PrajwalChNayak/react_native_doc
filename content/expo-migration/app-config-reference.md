---
title: App Config Reference
description: The app.json / app.config.ts keys that exist in Expo SDK 57, read out of the installed @expo/config-types 57.0.2 — including the ones that were removed.
status: current
toolchain: expo
sdk: 57
---

The app config is the single file that drives your app's identity, its native project generation and
a large part of its runtime behaviour. It can be written as `app.json`, `app.config.js` or
`app.config.ts`, and the keys are the same in all three.

Every key on this page was read out of the **installed `@expo/config-types@57.0.2`** in an SDK 57
project and cross-checked against `docs.expo.dev/versions/latest/config/app/`. Where a key you might
expect is absent, this page says so — because an unrecognised key in the app config is silently
ignored, which makes a typo or a stale key look exactly like a feature that does not work.

## Why it exists / when to use it — and when NOT to

Use this page to check that a key exists and is spelled correctly before you spend an afternoon
wondering why it has no effect. Use `npx expo config` to see what the config resolved to after
plugins and environment variables ran.

Do **not** use this page as a substitute for reading the documentation of the key you need — this is
a name-and-shape reference, not a guide to what each setting is for.

## Basic example

```json title=app.json
{
  "expo": {
    "name": "My App",
    "slug": "my-app",
    "version": "1.0.0",
    "scheme": "myapp",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "runtimeVersion": {"policy": "appVersion"},
    "updates": {
      "url": "https://u.expo.dev/your-project-id"
    },
    "ios": {
      "bundleIdentifier": "com.example.myapp",
      "supportsTablet": true
    },
    "android": {
      "package": "com.example.myapp",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "output": "static",
      "favicon": "./assets/favicon.png"
    },
    "plugins": ["expo-router", "expo-secure-store"],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

## The complete top-level key list

These are **every** key on the `ExpoConfig` interface in SDK 57, in declaration order. The interface
has no index signature, so this list is exhaustive.

| Key | Type | Notes |
| --- | --- | --- |
| `name` | `string` | **Required.** Display name on the home screen |
| `description` | `string` | Free text |
| `slug` | `string` | **Required.** URL-friendly project name, unique across your account |
| `owner` | `string` | Expo account that owns the project. Defaults to the current user |
| `currentFullName` | `string` | Managed by tooling; you rarely set this |
| `originalFullName` | `string` | Managed by tooling |
| `sdkVersion` | `string` | Usually inferred from the installed `expo` package |
| `runtimeVersion` | `string \| {policy}` | Native/update compatibility. See below |
| `version` | `string` | Maps to `CFBundleShortVersionString` on iOS and `versionName` on Android |
| `platforms` | `('android' \| 'ios' \| 'web')[]` | Defaults to `["ios","android"]`; adds `web` when `react-dom` is installed |
| `githubUrl` | `string` | Repository link on your Expo project page |
| `orientation` | `'default' \| 'portrait' \| 'landscape'` | |
| `userInterfaceStyle` | `'light' \| 'dark' \| 'automatic'` | Defaults to `light`. Needs `expo-system-ui` on Android |
| `backgroundColor` | `string` | Root view background. Needs `expo-system-ui` on iOS |
| `primaryColor` | `string` | Android multitasker colour |
| `icon` | `string` | Path or URL. A 1024x1024 PNG is recommended |
| `androidStatusBar` | object | **Deprecated** — use the `expo-status-bar` plugin configuration |
| `developmentClient` | `{silentLaunch?}` | Behaviour when running in a development build |
| `scheme` | `string \| string[]` | Deep-link URL scheme. Build-time only — no effect in Expo Go |
| `extra` | object | Arbitrary values, readable via `Constants.expoConfig.extra` |
| `updates` | object | `expo-updates` configuration. See below |
| `locales` | object | Per-locale strings for system dialogs |
| `assetBundlePatterns` | `string[]` | **Deprecated** — use EAS Update asset selection |
| `plugins` | array | Config plugins. See below |
| `buildCacheProvider` | `'eas' \| {plugin, options?}` | Download cached builds from remote |
| `ios` | object | iOS-specific config |
| `android` | object | Android-specific config |
| `web` | object | Web-specific config |
| `experiments` | object | Experimental flags. See below |
| `_internal` | object | Written by tooling. Do not set it |

## Keys the brief expected that are NOT top-level in SDK 57

### `splash` is not a top-level key

There is **no top-level `splash` key** in SDK 57's config types, and none in the published app config
reference. A `splash` object exists only under `web`, where it configures the PWA splash screen.

Splash screens are configured through the **`expo-splash-screen` config plugin** instead. Its props,
read from the installed plugin's own types:

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff",
          "image": "./assets/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "dark": {
            "image": "./assets/splash-icon-dark.png",
            "backgroundColor": "#000000"
          }
        }
      ]
    ]
  }
}
```

| Prop | Type | Default |
| --- | --- | --- |
| `backgroundColor` | `string` | `"#ffffff"` |
| `image` | `string` | — |
| `imageWidth` | `number` | `100` |
| `resizeMode` | `'contain' \| 'cover' \| 'native'` | `"contain"` |
| `enableFullScreenImage_legacy` | `boolean` | `false` — a transition helper, marked for removal |
| `dark` | `{image?, backgroundColor?}` | — |
| `android` | partial Android splash config | — |
| `ios` | partial iOS splash config | — |

> [!LEGACY] Top-level `"splash": {...}` is stale advice
> Tutorials and older projects put `splash` alongside `icon` at the top level. In SDK 57 that key is
> not part of the config type and is ignored. If your splash screen stopped responding to config
> changes after an upgrade, this is why. Move the settings into the `expo-splash-screen` plugin
> entry.

### Other keys that are absent

Verified absent from SDK 57's `ExpoConfig`, despite appearing in older material:

| Stale key | Status |
| --- | --- |
| `splash` | Web-only; use the `expo-splash-screen` plugin |
| `notification` | Not in the config type; use the `expo-notifications` plugin |
| `jsEngine` | Not in the config type |
| `packagerOpts` | Not in the config type |
| `entryPoint` | Not in the config type |
| `newArchEnabled` | Not in the config type — the New Architecture is not optional |
| `androidNavigationBar` | Not in the config type; use `expo-navigation-bar` |

An unknown key in `app.json` does not raise an error. It is simply ignored, which is why a stale key
looks like a broken feature.

## `plugins`

```json
"plugins": [
  "expo-router",
  ["expo-build-properties", {"android": {"compileSdkVersion": 35}}]
]
```

The type is `(string | [] | [string] | [string, any])[]` — a bare package name, or a two-element
array of package name and options object. This is the extension point for anything the fixed key set
cannot express; see [What a Config Plugin Is](../expo-config-plugins/what-they-are.md).

## `updates`

Configuration for `expo-updates`. Verified keys:

| Key | Type | Notes |
| --- | --- | --- |
| `enabled` | `boolean` | Defaults to true |
| `url` | `string` | Where manifests are fetched from |
| `checkAutomatically` | `'ON_LOAD' \| 'ON_ERROR_RECOVERY' \| 'WIFI_ONLY' \| 'NEVER'` | Default `ON_LOAD` |
| `fallbackToCacheTimeout` | `number` | Milliseconds, 0 to 300000. Default 0 |
| `useEmbeddedUpdate` | `boolean` | Defaults to true. Not for production when false |
| `codeSigningCertificate` | `string` | Local path to a PEM X.509 certificate |
| `codeSigningMetadata` | `{alg?, keyid?}` | `alg` accepts `rsa-v1_5-sha256` |
| `requestHeaders` | object | Extra HTTP headers for manifest and asset requests |
| `assetPatternsToBeBundled` | `string[]` | Glob patterns for assets to include in updates |
| `disableAntiBrickingMeasures` | `boolean` | Defaults to false. Not for production |
| `useNativeDebug` | `boolean` | Defaults to false. Not for production |
| `enableBsdiffPatchSupport` | `boolean` | Defaults to true |

## `runtimeVersion`

Declares which native builds a given update is compatible with. Either a literal string, or a policy:

```json
"runtimeVersion": {"policy": "appVersion"}
```

The four verified policy values are `nativeVersion`, `sdkVersion`, `appVersion` and `fingerprint`.
Getting this wrong ships an update to a binary that cannot run it — see
[Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md).

## `ios`

Verified keys: `appleTeamId`, `publishManifestPath`, `publishBundlePath`, `bundleIdentifier`,
`buildNumber`, `deploymentTarget`, `backgroundColor`, `scheme`, `icon`, `appStoreUrl`, `bitcode`,
`config`, `googleServicesFile`, `supportsTablet`, `isTabletOnly`, `requireFullScreen`,
`userInterfaceStyle`, `infoPlist`, `entitlements`, `privacyManifests`, `associatedDomains`,
`usesIcloudStorage`, `usesAppleSignIn`, `usesBroadcastPushNotifications`, `accessesContactNotes`,
`runtimeVersion`, `version`.

`ios.icon` accepts a string or an object of `{light?, dark?, tinted?}`.

The two you will reach for most:

```json
"ios": {
  "bundleIdentifier": "com.example.myapp",
  "infoPlist": {
    "NSCameraUsageDescription": "We use the camera to scan receipts."
  }
}
```

`infoPlist` and `entitlements` are free-form pass-throughs into the generated native project. They
are how you set a value that has no dedicated key, and they are checked by Apple, not by Expo.

## `android`

Verified keys: `publishManifestPath`, `publishBundlePath`, `package`, `versionCode`,
`backgroundColor`, `userInterfaceStyle`, `scheme`, `icon`, `adaptiveIcon`, `playStoreUrl`,
`permissions`, `blockedPermissions`, `googleServicesFile`, `config`, `intentFilters`, `allowBackup`,
`softwareKeyboardLayoutMode`, `runtimeVersion`, `version`, `predictiveBackGestureEnabled`.

```json
"android": {
  "package": "com.example.myapp",
  "permissions": ["android.permission.CAMERA"],
  "blockedPermissions": ["android.permission.RECORD_AUDIO"],
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "monochromeImage": "./assets/adaptive-icon-mono.png",
    "backgroundColor": "#ffffff"
  }
}
```

`blockedPermissions` is the escape hatch for a permission a dependency declares that you do not want
— it removes the entry from the merged manifest. See
[Permissions Hygiene](../expo-security/permissions-hygiene.md).

## `web`

Verified keys: `output`, `favicon`, `name`, `shortName`, `lang`, `scope`, `themeColor`,
`description`, `dir`, `display`, `startUrl`, `orientation`, `backgroundColor`, `barStyle`,
`preferRelatedApplications`, `dangerous`, `splash`, `config`, `bundler`.

`web.output` is the one that changes behaviour most: `'single'` (default, a SPA), `'static'`
(pre-rendered HTML per route, Expo Router only) or `'server'` (static HTML plus API routes, needs a
Node server).

## `experiments`

Experimental flags. The type's own wording is that these **break without deprecation notice**, so
treat anything here as temporary. Verified keys in SDK 57:

`outOfTreePlatforms`, `onDemandFilesystem`, `autolinkingModuleResolution`, `baseUrl`,
`buildCacheProvider`, `supportsTVOnly`, `tsconfigPaths`, `typedRoutes`, `turboModules`,
`reactCanary`, `reactCompiler`, `reactServerComponentRoutes`, `reactServerFunctions`,
`inlineModules`.

The one most projects enable:

```json
"experiments": {
  "typedRoutes": true
}
```

See [Typed Routes](../expo-router/typed-routes.md).

## Common patterns

### Print the resolved config instead of guessing

```bash
npx expo config --type public       # what ships in the manifest
npx expo config --type prebuild     # what prebuild will use
npx expo config --type introspect   # the native changes plugins will make
npx expo config --json --full
```

`--type introspect` is the safe way to check a plugin's effect: it shows the native changes without
running prebuild and destroying anything.

### Dynamic config in TypeScript

`app.config.ts` gets you type checking on the keys, which catches exactly the typo that the silent
ignore would otherwise hide:

```ts title=app.config.ts
import type {ExpoConfig} from '@expo/config-types';

const config: ExpoConfig = {
  name: 'My App',
  slug: 'my-app',
  version: '1.0.0',
  scheme: 'myapp',
  ios: {bundleIdentifier: 'com.example.myapp'},
  android: {package: 'com.example.myapp'},
};

export default config;
```

The `ExpoConfig` interface has no index signature, so an unknown key is a compile error rather than a
silent no-op. That alone is a reason to prefer `app.config.ts` over `app.json`.

### Keep secrets out of it

`extra` and the rest of the config are readable in the shipped bundle and in the manifest. Nothing in
the app config is private. See
[What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md).

## Common mistakes

- **Using a top-level `"splash"` key.** Not part of SDK 57's config. It is ignored. Configure the
  `expo-splash-screen` plugin instead.
- **Assuming a typo will be reported.** Unknown keys in `app.json` are silently ignored. Use
  `app.config.ts` with the `ExpoConfig` type, or run `npx expo config` and look for your value.
- **Editing the app config and expecting a running app to pick it up.** Most keys are consumed at
  prebuild or build time. Native-affecting changes need a rebuild.
- **Setting `scheme` and testing deep links in Expo Go.** `scheme` is build-time configuration and
  has no effect in Expo Go. You need a development build.
- **Putting an API key in `extra`.** The config ships with the app and is readable.
- **Using `androidStatusBar` or `assetBundlePatterns` on a new project.** Both are marked deprecated
  in the SDK 57 types — use the `expo-status-bar` plugin and EAS Update asset selection.
- **Looking for `newArchEnabled`.** It is not a config key. The New Architecture is not optional.
- **Setting `_internal`.** It is written by tooling, not by you.

## Related topics

- [Expo CLI Reference](cli-reference.md) — `npx expo config` and its `--type` values.
- [Expo Cheat Sheet](cheat-sheet.md) — the handful of keys you set on every project.
- [Upgrading Between SDK Versions](upgrading-sdk.md) — where config keys move between SDKs.
- [Expo Troubleshooting](troubleshooting.md) — when a config change appears to do nothing.
- [The App Config](../expo-core-concepts/app-config.md) — the concept, at length.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — for anything the key set cannot express.
- [expo-build-properties](../expo-config-plugins/build-properties.md) — Gradle and Podfile settings.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — `runtimeVersion` in practice.
