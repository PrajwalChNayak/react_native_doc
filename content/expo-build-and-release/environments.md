---
title: Build Profiles per Environment
description: Separating development, preview and production builds of an Expo app — distinct app identifiers installed side by side, eas.json profiles, EAS environments, update channels, and which values may differ between them.
status: current
toolchain: expo
sdk: 57
---

Most apps need at least three builds that can coexist: a **development** build that loads code from
your dev server, a **preview** build testers install to try a release candidate against staging, and
the **production** build in the stores.

If all three share an application identifier, installing one replaces the other, a tester's preview
build can receive a production update, and a staging API URL can end up in a store build. This page
sets them up so those mistakes cannot happen by accident.

## Why it exists / when to use it — and when NOT to

Set this up before you hand a build to anyone else. Retrofitting it later means changing bundle
identifiers, which on the stores means a new app.

You do **not** need separate identifiers if you only ever install one build per device and do not
use EAS Update. A single profile set with different `env` values is enough.

Do not use environments to hide secrets. Every value that reaches the JavaScript bundle is readable
in every environment — see [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md).

## Basic example

### 1. A dynamic app config keyed on `APP_VARIANT`

This is the pattern from Expo's multiple-app-variants guide, typed with `ExpoConfig` and
`ConfigContext` from `expo/config`:

```ts-fragment title=app.config.ts
import type {ConfigContext, ExpoConfig} from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

function uniqueIdentifier(): string {
  if (IS_DEV) return 'com.example.myapp.dev';
  if (IS_PREVIEW) return 'com.example.myapp.preview';
  return 'com.example.myapp';
}

function appName(): string {
  if (IS_DEV) return 'MyApp (Dev)';
  if (IS_PREVIEW) return 'MyApp (Preview)';
  return 'MyApp';
}

export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName(),
  slug: 'myapp',
  ios: {
    ...config.ios,
    bundleIdentifier: uniqueIdentifier(),
  },
  android: {
    ...config.android,
    package: uniqueIdentifier(),
  },
});
```

The block is marked as a fragment only because `process.env` is typed by the `expo-env.d.ts` file
Expo CLI generates in a real project, which a standalone snippet does not have.

`app.config.ts` receives the static `app.json` as `config` and returns the final config. Keep
everything that does not vary in `app.json`; put only the differences here.

### 2. Profiles that set the variant

```json title=eas.json
{
  "cli": {"version": ">= 24.0.0", "appVersionSource": "remote"},
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "environment": "development",
      "env": {"APP_VARIANT": "development"}
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "environment": "preview",
      "env": {"APP_VARIANT": "preview"}
    },
    "production": {
      "channel": "production",
      "environment": "production",
      "autoIncrement": true
    }
  }
}
```

Every field above is in the `@expo/eas-json` 24.5.0 schema documented on
[eas.json and Build Profiles](../expo-eas/eas-json.md).

### 3. Build each one

```bash
eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform all
```

The three Android builds have three package names, so they install side by side.

> [!NOTE] Cost and alternatives
> `eas build` runs on EAS, which needs an Expo account and is a paid service with a free tier; queue
> times and concurrency depend on the plan. `eas build --local` runs the same profile on your
> machine. `npx expo run:android` / `run:ios` build without EAS at all — set `APP_VARIANT` in your
> shell for those. iOS builds need macOS with Xcode, or a hosted service.

## How it works

### Four settings, four jobs

| Setting | Where | What it decides |
| --- | --- | --- |
| `APP_VARIANT` (via `env`) | Profile `env` | Which identifiers and name `app.config.ts` produces |
| `environment` | Profile | Which EAS environment's stored variables are injected into the build |
| `channel` | Profile | Which update channel is **baked into the binary** |
| `distribution` | Profile | `internal` (install via link/device) or `store` |

They are independent. That is the flexibility and the risk: nothing stops you writing
`"channel": "production"` on the preview profile. Keep profile name, `channel` and `environment`
identical so a mismatch is visible in review.

### `env` versus `environment`

- **`env`** is a plain object in `eas.json`. It is committed to the repository, so it is for
  non-secret values only — `APP_VARIANT`, a public API base URL.
- **`environment`** names one of the EAS environments — `development`, `preview` or `production` —
  whose variables are stored on EAS. Use it for values the build process needs that should not be in
  git. See [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md).

Neither makes a value private once it is read by client code.

### Why separate identifiers matter

| Shared identifier | Separate identifiers |
| --- | --- |
| Installing preview replaces production on a tester's phone | Both installed side by side |
| Preview data and production data share one sandbox | Separate SecureStore, AsyncStorage and files |
| A preview build can sign in with production credentials stored by the production build | Credentials do not cross |
| One set of push notification credentials and OAuth redirect registrations | Separate registrations — more setup, clearer boundaries |

The cost of separate identifiers is real: each identifier is a separate app for push credentials,
OAuth redirect URIs, universal link association files, and Firebase config files. Budget for
registering each.

### Channels keep updates in their lane

A binary receives updates only for its baked-in channel (and its runtime version). With one channel
per profile:

```bash
eas update --branch preview --message "try new onboarding"
```

reaches preview builds and cannot reach production builds. See
[Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md).

`eas update --environment` also exists in eas-cli 24.5.0, so an update can be bundled with the same
EAS environment variables as the build it targets. Use the matching name.

### What may differ between environments

| Safe to vary | Must not vary between preview and production |
| --- | --- |
| App name, icon, identifiers | Native dependencies and their versions |
| API base URL, feature flags | `runtimeVersion` policy |
| Analytics / crash-reporting environment tag | Config plugins and their options |
| Update channel | Permissions |

The right-hand column matters because the purpose of a preview build is to test **what production
will be**. A preview build with a different native dependency set tests a different app.

## Platform differences

:::tabs
@tab iOS
- Each `bundleIdentifier` needs its own App ID and provisioning profile. `internal` distribution
  builds need registered devices (ad hoc) or an enterprise account.
- `ios.simulator: true` in a development profile produces a simulator build that needs no device
  registration.
- Associated domains and push capabilities are per identifier.
@tab Android
- Each `package` is a separate application to Android and to Google Play.
- `internal` distribution produces an APK by default, installable directly.
- A `google-services.json` is tied to a package name; a variant with a different package needs its
  own entry in the Firebase project.
:::

## Common patterns

### Read the variant at runtime without shipping secrets

```ts-fragment title=app/lib/env.ts
// Public by design: which backend this build talks to.
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com';
export const variant = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'production';
```

Set `EXPO_PUBLIC_API_URL` per profile in `env` or the EAS environment. It is inlined at build time.

### Check what a profile will produce before building

```bash
APP_VARIANT=preview npx expo config --type public
```

`npx expo config` prints the resolved app config, so you can confirm the identifier and name for a
variant without starting a build. Use `--type public` to see what ships to the client.

### A staging profile that inherits preview

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "environment": "preview",
      "env": {"APP_VARIANT": "preview"}
    },
    "preview-simulator": {
      "extends": "preview",
      "ios": {"simulator": true}
    }
  }
}
```

`extends` merges per key, so the simulator profile keeps the channel, environment and variant.

## Common mistakes

- **One identifier for every environment.** Installing preview wipes production on the tester's
  device and shares its data. Use distinct identifiers per variant.
- **`"channel": "production"` on a preview profile.** Testers receive production updates, or worse,
  you publish a preview update to production users. Keep profile, channel and environment names
  identical.
- **Secrets in `env`.** `eas.json` is committed. Use an EAS environment variable with an appropriate
  visibility — and remember no setting protects a value inlined into the bundle.
- **Different native dependencies in preview and production.** You are no longer testing the
  production app.
- **Forgetting `APP_VARIANT` for local builds.** `npx expo run:*` does not read `eas.json`; the build
  silently gets the production identifier.
- **Changing the production `bundleIdentifier` or `package` after release.** To the store that is a
  new app. Choose production identifiers once.
- **Registering only the production redirect URI with your OAuth provider.** Each variant's scheme
  or identifier needs its own entry.

## Related topics

- [eas.json and Build Profiles](../expo-eas/eas-json.md) — every profile field.
- [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md) — `environment` and variable visibility.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md) — what per-environment client values do not protect.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — why one channel per profile.
- [Internal Distribution](../expo-eas/internal-distribution.md) — getting preview builds to testers.
- [Versioning and Runtime Versions](versioning.md) — build numbers across profiles.
- [App Icons and Splash Screens](icons-and-splash-screens.md) — a visibly different icon per variant.
