---
title: Versioning and Runtime Versions
description: The three numbers every Expo release carries — the user-facing version, the store build number, and the runtime version that decides which updates a binary accepts — and how to keep them from drifting.
status: current
toolchain: expo
sdk: 57
---

A shipped Expo app carries three different version identifiers, and each one answers a different
question:

| Identifier | App config key | Answers | Who reads it |
| --- | --- | --- | --- |
| **Version** | `version` | "Which release is this?" | Users, store listings |
| **Build number** | `ios.buildNumber` / `android.versionCode` | "Is this upload newer than the last one?" | App Store Connect, Google Play |
| **Runtime version** | `runtimeVersion` | "Which updates can this binary run?" | `expo-updates` and the update server |

Most versioning incidents come from treating these as one number. A store rejects an upload because
the build number did not increase. An update crashes a binary because the runtime version said they
were compatible when they were not.

## Why it exists / when to use it — and when NOT to

You need all three once you ship to a store **and** use updates. Without `expo-updates` there is no
runtime version to manage, and only the first two matter.

The decisions on this page are:

1. Who increments build numbers — you, in the app config, or EAS, remotely.
2. Which `runtimeVersion` policy decides update compatibility.

## Basic example

```json title=app.json
{
  "expo": {
    "version": "1.4.0",
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "ios": {
      "bundleIdentifier": "com.example.myapp",
      "buildNumber": "42"
    },
    "android": {
      "package": "com.example.myapp",
      "versionCode": 42
    }
  }
}
```

Types, from the installed `@expo/config-types` for SDK 57:

| Key | Type | Maps to |
| --- | --- | --- |
| `version` | string | iOS `CFBundleShortVersionString`, Android `versionName` |
| `ios.buildNumber` | **string** | iOS `CFBundleVersion` |
| `android.versionCode` | **number** — a positive integer | Android `versionCode` |
| `runtimeVersion` | string, or `{ "policy": "appVersion" \| "nativeVersion" \| "fingerprint" \| "sdkVersion" }` | The runtime version embedded in the build |

`ios.version`, `android.version`, `ios.runtimeVersion` and `android.runtimeVersion` also exist and
override the top-level value for one platform. Use them only when the platforms genuinely diverge.

> [!NOTE] `buildNumber` is a string, `versionCode` is a number
> `"buildNumber": 42` and `"versionCode": "42"` are both type errors in a typed `app.config.ts`.
> The config types also note that Apple's Transporter reads the version number from `expo.version`,
> not from `ios.buildNumber`.

## How it works

### Version: for people

`version` is what users see in the store and in your About screen. Follow whatever scheme your team
uses (semantic versioning is common). Stores do not require it to increase on every upload, but each
**store release** should have a distinct one so support conversations are unambiguous.

### Build number: for the stores

Both stores require each upload to be distinguishable and newer:

- **Google Play** requires `versionCode` to be a positive integer, and a new upload must have a
  higher `versionCode` than any previous upload for that app.
- **App Store Connect** requires `CFBundleVersion` to be unique for a given version, and increasing.

A build number is spent the moment you **upload**, even if that build is never released. That is
the main reason to automate it.

### Who increments build numbers: `cli.appVersionSource`

`eas.json` decides where the build number lives:

```json title=eas.json
{
  "cli": {
    "version": ">= 24.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "production": {
      "autoIncrement": true
    }
  }
}
```

| `appVersionSource` | Source of truth for build numbers | What `autoIncrement` does |
| --- | --- | --- |
| `"remote"` | EAS servers | Increments `android.versionCode` / `ios.buildNumber` on EAS for each build; nothing to commit |
| `"local"` | Your app config | Edits your app config during the build; you must commit that change for it to persist |

Expo's documentation describes `remote` as the recommended behaviour from EAS CLI 12.0.0. What it
manages remotely is the **build number only**: `autoIncrement` does not support incrementing the
user-facing `version`. You still change `version` yourself.

Two commands move numbers between the two sources:

```bash
# Copy the build numbers from your local app config to EAS (use when switching to remote)
eas build:version:set

# Write the current remote build numbers into your local project (use before a local build)
eas build:version:sync
```

Platform-specific `autoIncrement` values are verified in the `@expo/eas-json` 24.5.0 schema:
Android accepts `true`, `false`, `"version"` or `"versionCode"`; iOS accepts `true`, `false`,
`"version"` or `"buildNumber"`. See [eas.json and Build Profiles](../expo-eas/eas-json.md).

> [!WARNING] Remote versioning does not apply to builds that never touch EAS
> `npx expo run:android` and `npx expo run:ios` read your local app config. If you use
> `appVersionSource: "remote"` and also build locally for a store upload, run
> `eas build:version:sync` first, or the local build reuses an old build number.

### Runtime version: for updates

The runtime version is embedded in the binary at build time and sent with every update request. The
update server only returns updates published for the **same** runtime version. It is a
compatibility contract: "this JavaScript expects exactly this native code".

Get it wrong in one direction and users never receive updates. Get it wrong in the other and an
update calls a native module the binary does not contain, and the app crashes.

### Runtime version policies

Expo's `expo-updates` documentation defines the policies:

| Policy | Runtime version is | Bumps when | Risk |
| --- | --- | --- | --- |
| `"appVersion"` | The project's `version` | You change `version` | You must remember to change `version` for **every** native change. A native change with the same `version` produces a compatible-looking but incompatible update. |
| `"nativeVersion"` | `version` combined with `buildNumber` / `versionCode` | Either changes | Documented as requiring manual management of native version numbers between builds; **incompatible with `appVersionSource: "remote"`** |
| `"fingerprint"` | A hash of the project calculated by `@expo/fingerprint` during builds and updates | Anything that affects native code changes | More builds; the safest against incompatible updates |
| A custom string | Exactly the string you set, e.g. `"1.4.0"` | You change it | Entirely manual |

`sdkVersion` also appears in the SDK 57 config type union, but the current `expo-updates`
documentation does not describe it as an available policy. Do not choose it for a new project.

Expo's runtime version documentation recommends `"fingerprint"` if you want to make incompatible
updates extremely unlikely, at the cost of building more often.

### Choosing a policy

- **Start with `"fingerprint"`** unless you have a reason not to. It follows the thing that actually
  determines compatibility — native code — rather than a number a person has to remember to change.
- **Use `"appVersion"`** if your team already bumps `version` on every native change and you want
  the runtime version to be human-readable. Enforce the rule in review.
- **Avoid `"nativeVersion"` with remote versioning.** They do not work together.

### Seeing what a build is running

```tsx title=app/debug/version.tsx
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import {Text, View} from 'react-native';

export default function VersionScreen() {
  return (
    <View style={{padding: 16, gap: 4}}>
      <Text>Version: {Application.nativeApplicationVersion ?? 'unknown'}</Text>
      <Text>Build: {Application.nativeBuildVersion ?? 'unknown'}</Text>
      <Text>Runtime: {Updates.runtimeVersion ?? 'none'}</Text>
      <Text>Channel: {Updates.channel ?? 'none'}</Text>
      <Text>Update: {Updates.updateId ?? 'embedded'}</Text>
    </View>
  );
}
```

`expo-application` (SDK 57 resolves `~57.0.3`) reads the values from the native binary, which is
what the store and the update server see. Put this behind a debug menu: it is the first thing you
need when a user reports a bug you cannot reproduce.

> [!NOTE] Expo Go vs development build
> Both `expo-application` and `expo-updates` are native. In Expo Go these values describe Expo Go,
> not your app, and `expo-updates` cannot be exercised at all. Check versions on a `preview` or
> `production` build.

## Platform differences

:::tabs
@tab iOS
- `version` → `CFBundleShortVersionString`; `ios.buildNumber` → `CFBundleVersion`, a string.
- Building an iOS binary needs macOS with Xcode, or a hosted build service such as EAS Build. EAS
  requires an Expo account and is a paid service with a free tier.
- App Store Connect rejects an upload whose build number was already used for that version.
@tab Android
- `version` → `versionName`; `android.versionCode` → `versionCode`, a positive integer.
- Android builds run locally on Windows, macOS or Linux with the Android SDK, or on EAS.
- Google Play rejects an upload whose `versionCode` is not higher than every previous upload, on any
  track.
:::

## Common patterns

### Release branch flow with remote versioning and fingerprint

```json title=eas.json
{
  "cli": {"version": ">= 24.0.0", "appVersionSource": "remote"},
  "build": {
    "preview": {"distribution": "internal", "channel": "preview"},
    "production": {"channel": "production", "autoIncrement": true}
  }
}
```

```json title=app.json
{
  "expo": {
    "version": "1.5.0",
    "runtimeVersion": {"policy": "fingerprint"}
  }
}
```

1. Change `version` to `1.5.0` for the release, by hand.
2. `eas build --profile production` — EAS assigns the next build number.
3. Ship JavaScript fixes with `eas update --branch production`. The fingerprint policy guarantees
   they only reach binaries with matching native code.
4. Add a native dependency → the fingerprint changes → the next build gets a new runtime version,
   and old binaries stop receiving updates meant for it.

### Bump `version` from a script, not by hand in three places

With a static `app.json`, `version` exists in one place — keep it that way. Do not also maintain a
separate version constant in JavaScript; read it with `expo-application` at runtime.

## Common mistakes

- **Uploading two builds with the same build number.** Both stores reject the second. Use
  `autoIncrement` with `appVersionSource: "remote"`.
- **Writing `"versionCode": "42"` or `"buildNumber": 42`.** `versionCode` is a number and
  `buildNumber` is a string.
- **Expecting `autoIncrement` to change `version`.** It changes build numbers only.
- **Using `"appVersion"` and shipping a native change without changing `version`.** Existing binaries
  accept an update that needs native code they do not have. Use `"fingerprint"`, or enforce a
  `version` bump for every native change.
- **Combining `"nativeVersion"` with `appVersionSource: "remote"`.** Expo documents them as
  incompatible.
- **Building locally with remote versioning and no sync.** Run `eas build:version:sync` first.
- **Forgetting that a spent build number stays spent.** A failed review or a deleted build does not
  free its number on Google Play.

## Related topics

- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — how runtime version, channel and branch combine.
- [eas.json and Build Profiles](../expo-eas/eas-json.md) — `appVersionSource` and `autoIncrement` in the schema.
- [EAS Update](../expo-eas/update.md) — publishing against a runtime version.
- [Build Profiles per Environment](environments.md) — different identifiers per environment.
- [Rollback Strategy](rollback-strategy.md) — why runtime versions decide what you can roll back to.
- [EAS Update Signing](../expo-security/update-signing.md) — certificate rotation requires a new runtime version.
- [Building Locally](../expo-eas/local-builds.md) — local builds and the build number they use.
