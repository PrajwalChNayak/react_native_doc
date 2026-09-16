---
title: eas.json and Build Profiles
description: The real eas.json schema as eas-cli 24.5.0 validates it — cli options, build profiles, platform overrides, submit profiles and profile inheritance.
status: current
toolchain: expo
sdk: 57
---

`eas.json` sits at the root of your project next to `package.json` and configures every `eas`
command. It has exactly three top-level keys: `cli`, `build` and `submit`. Everything else is a
profile name you chose.

The field names on this page were read from the `@expo/eas-json` **24.5.0** validation schema — the
same code `eas-cli` runs against your file. Fields not listed here either do not exist or could not
be verified; `eas-cli` rejects unknown keys, so a guessed field name fails the build rather than
being ignored.

## Why it exists / when to use it — and when NOT to

One file describes every way you build the app, so "the preview build" means the same thing on
your machine and in CI. Without it, build variants live in people's shell history.

You do not need `eas.json` at all if you never run `eas`. `npx expo run:android` and
`npx expo run:ios` read the app config, not this file.

## Basic example

`eas build:configure` generates this and nothing else:

```json title=eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

Three profiles that correspond to three questions:

| Profile | `developmentClient` | `distribution` | What it produces |
| --- | --- | --- | --- |
| `development` | `true` | `internal` | A [development build](../expo-development-builds/why-you-need-one.md) that loads JS from a dev server |
| `preview` | absent (`false`) | `internal` | A release-mode build installable by testers without the stores |
| `production` | absent | absent (`store`) | A store-ready `.aab` / `.ipa` |

`production` being empty is not an oversight. `distribution` defaults to `"store"` and
`credentialsSource` defaults to `"remote"`, so an empty profile already means "signed store build
using credentials EAS holds".

## How it works

### The `cli` block

```json title=eas.json
{
  "cli": {
    "version": ">= 24.0.0",
    "requireCommit": true,
    "appVersionSource": "remote"
  }
}
```

| Key | Type | What it does |
| --- | --- | --- |
| `version` | semver range | Refuses to run if the installed `eas-cli` is outside the range. Pin this. |
| `requireCommit` | boolean | Refuses to build with uncommitted changes. Makes a build traceable to a commit. |
| `appVersionSource` | `"local"` or `"remote"` | Whether build numbers live in your app config or on EAS servers. See [Versioning and Runtime Versions](../expo-build-and-release/versioning.md). |
| `promptToConfigurePushNotifications` | boolean | Suppresses the push-credentials prompt. |

Two further keys, `updateAssetHostOverride` and `updateManifestHostOverride`, exist in the schema
for self-hosted update infrastructure. They are not documented here because we could not verify
their correct use.

### Build profile fields

These apply to a whole profile, and can also be set per platform:

```json title=eas.json
{
  "build": {
    "production": {
      "channel": "production",
      "distribution": "store",
      "credentialsSource": "remote",
      "autoIncrement": true,
      "node": "22.13.0",
      "env": {
        "API_URL": "https://api.example.com"
      }
    }
  }
}
```

| Field | Values | Notes |
| --- | --- | --- |
| `extends` | another profile name | Inherit and override. Profile-level only. |
| `channel` | lowercase string | The [EAS Update channel](runtime-versions.md) baked into the binary. |
| `distribution` | `"store"` \| `"internal"` | Defaults to `"store"`. See [Internal Distribution](internal-distribution.md). |
| `credentialsSource` | `"local"` \| `"remote"` | Defaults to `"remote"`. `"local"` reads `credentials.json`. |
| `developmentClient` | boolean | Build a dev-client binary that loads JS from a dev server. |
| `autoIncrement` | boolean (or a platform-specific string) | Bump the build number for each build. |
| `env` | object of strings | Plain-text environment variables. **Not for secrets** — this file is committed. |
| `environment` | lowercase string, 3–100 chars | Names an EAS environment whose stored variables are injected. |
| `node`, `yarn`, `pnpm`, `bun`, `corepack` | version strings / boolean | Pin the toolchain on the hosted worker. Ignored by `--local`. |
| `resourceClass` | `"default"`, `"medium"`, `"large"` | Worker size. iOS additionally accepts `"m-medium"` and `"m-large"`. Affects cost. |
| `prebuildCommand` | string | Replaces the default `expo prebuild` invocation. |
| `cache` | `{ "disabled": bool, "key": string, "paths": [string] }` | Build cache control. Not available to local builds. |
| `buildArtifactPaths` | array of globs | Extra files to return alongside the binary — useful for reports. |
| `uploadSourceMaps` | boolean | Upload source maps with the build. |
| `withoutCredentials` | boolean | Build unsigned. Useful for compile-only checks. |
| `config` | string | Points at a custom build config file. |

> [!WARNING] `env` in `eas.json` is not a secret store
> `eas.json` is committed to your repository. Anything in an `env` block is readable by everyone
> with repository access and ends up in build logs. Use EAS environment variables marked secret,
> or an `environment` name, for anything that matters. See
> [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md).

`releaseChannel` also exists in the schema. It belongs to the retired classic-updates system;
use `channel`.

### Android-specific options

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "autoIncrement": "versionCode"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle",
        "resourceClass": "medium"
      }
    }
  }
}
```

| Field | Values |
| --- | --- |
| `buildType` | `"apk"` or `"app-bundle"` — exactly those two strings, not `"aab"` |
| `gradleCommand` | e.g. `":app:assembleRelease"` |
| `autoIncrement` | `true`, `false`, `"version"` or `"versionCode"` |
| `image` | builder image name |
| `ndk` | semver string |
| `keystoreName` | names a specific stored keystore; only valid with `credentialsSource: "remote"` |
| `applicationArchivePath` | glob for a non-default output path |
| `resourceClass` | `"default"`, `"medium"`, `"large"` |

### iOS-specific options

```json title=eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "buildConfiguration": "Release",
        "autoIncrement": "buildNumber"
      }
    }
  }
}
```

| Field | Values |
| --- | --- |
| `simulator` | boolean — produces an unsigned simulator build |
| `enterpriseProvisioning` | `"adhoc"` or `"universal"` |
| `scheme` | Xcode scheme name |
| `buildConfiguration` | Xcode configuration, e.g. `"Release"` |
| `autoIncrement` | `true`, `false`, `"version"` or `"buildNumber"` |
| `bundler`, `fastlane`, `cocoapods` | semver pins for the worker toolchain |
| `image` | builder image name |
| `applicationArchivePath` | glob for a non-default output path |
| `resourceClass` | `"default"`, `"medium"`, `"large"`, `"m-medium"`, `"m-large"` |

> [!NOTE] `ios.simulator: true` is the one iOS build that runs anywhere useful
> A simulator build is unsigned and produces a `.app` you can drag onto the iOS Simulator. It still
> needs macOS to *run*, but it needs no Apple Developer account to *produce*, which makes it the
> cheapest way to hand an iOS build to a designer with a Mac.

### Profile inheritance with `extends`

`extends` is the reason you do not repeat yourself across environments:

```json title=eas.json
{
  "build": {
    "base": {
      "node": "22.13.0",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "extends": "base",
      "distribution": "internal",
      "channel": "preview"
    },
    "preview-staging": {
      "extends": "preview",
      "channel": "staging",
      "env": { "API_URL": "https://staging.example.com" }
    }
  }
}
```

Merging is per key: `preview-staging` inherits `node` and `android.buildType` from `base` through
`preview`, and overrides `channel`. A profile you only inherit from (`base` here) is a normal
profile and can still be built directly, which is worth knowing when someone runs
`eas build --profile base` by accident.

### Submit profiles

`submit` uses the same profile-name mechanism, with a completely different field set:

```json title=eas.json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "../secrets/play-service-account.json",
        "track": "internal",
        "releaseStatus": "draft",
        "changesNotSentForReview": false
      },
      "ios": {
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345",
        "ascApiKeyPath": "../secrets/AuthKey.p8",
        "ascApiKeyId": "XXXXXXXXXX",
        "ascApiKeyIssuerId": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

Android fields: `serviceAccountKeyPath`, `track` (defaults to `"internal"`), `releaseStatus`
(`"completed"`, `"draft"`, `"halted"`, `"inProgress"`), `changesNotSentForReview`, `applicationId`,
`rollout` (a number).

iOS fields: `appleId`, `ascAppId`, `appleTeamId`, `ascApiKeyPath`, `ascApiKeyId`,
`ascApiKeyIssuerId`, `sku`, `language`, `companyName`, `appName`, `bundleIdentifier`,
`metadataPath`, `groups`.

The paths above point **outside** the repository on purpose. See [EAS Submit](submit.md).

## Common patterns

### One profile per environment, one channel per profile

```json title=eas.json
{
  "cli": { "version": ">= 24.0.0", "appVersionSource": "remote", "requireCommit": true },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "android": { "track": "internal" }
    }
  }
}
```

Keeping profile name and channel name identical removes an entire class of "why did the staging
build get the production bundle" incident. [Build Profiles per Environment](../expo-build-and-release/environments.md)
expands on this.

### Validate before you push

```bash
# Any eas command parses eas.json first, so this is a fast syntax check
eas build --profile production --platform android --non-interactive --json
```

There is no dedicated `eas.json` lint command in eas-cli 24.5.0. The practical check is that a
command using the profile does not immediately fail with a validation error.

## Common mistakes

- **Writing `"buildType": "aab"`.** The valid values are `"apk"` and `"app-bundle"`. The schema
  rejects anything else, which is at least a fast failure.
- **Putting secrets in `env`.** `eas.json` is committed. Wrong:
  `"env": { "STRIPE_SECRET_KEY": "sk_live_..." }`. Right: an EAS environment variable marked
  secret, referenced through `environment`, and nothing sensitive in the file.
- **Setting `distribution: "internal"` on the production profile.** You then cannot submit the
  result to the stores: internal Android builds default to an APK, and Google Play requires an AAB.
- **Expecting `autoIncrement: true` to bump the user-facing `version`.** It does not — it bumps the
  build number (`versionCode` / `buildNumber`). The marketing version stays where you set it.
- **Adding a field you read in a blog post.** Unknown keys are a validation error, not a warning.
  If it is not in the schema above, check `docs.expo.dev` before adding it.
- **Forgetting `channel` on a profile that ships to users.** A build with no channel cannot receive
  EAS updates, and this is silent until you try to publish one.
- **Assuming `node` / `cache` / `image` apply locally.** They configure the hosted worker.
  `eas build --local` ignores them and uses whatever is on your machine.

## Related topics

- [EAS Overview](overview.md) — what EAS is and what it costs.
- [Building on EAS](building.md) — running a build against these profiles.
- [Building Locally](local-builds.md) — which of these fields still apply.
- [Credentials Management](credentials.md) — `credentialsSource` and `credentials.json`.
- [Internal Distribution](internal-distribution.md) — what `distribution: "internal"` changes.
- [EAS Submit](submit.md) — the submit profile fields in use.
- [Build Profiles per Environment](../expo-build-and-release/environments.md) — dev, staging and production.
- [Versioning and Runtime Versions](../expo-build-and-release/versioning.md) — `appVersionSource` and `autoIncrement`.
- [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md) — where secrets actually belong.
