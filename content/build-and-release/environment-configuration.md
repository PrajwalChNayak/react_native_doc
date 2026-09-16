---
title: Environment Configuration
description: Wire per-environment values into Android and iOS builds with react-native-config 1.7.2 — and understand why everything you put there is public.
status: current
toolchain: cli
---

Your app needs to know which API to call, which crash-reporting project to report to, and which
environment it is running in. Those values differ per build and have to be decided at build time,
because the app cannot ask a server which server to ask.

`react-native-config` is the standard answer on the Community CLI path. It reads a `.env` file at
build time and compiles the values into the native app, where a TurboModule hands them back to
JavaScript. This page sets it up for a dev/staging/prod split on both platforms.

> [!DANGER] These values are not secrets. They are public data with an extra step
> Everything in your `.env` is compiled into the binary that you hand to strangers. On Android
> each key becomes a `BuildConfig` field **and** a string resource in `resources.arsc`. On iOS
> each key is written into a generated Objective-C file that ends up in the app binary. Anyone
> with the app can read every one of them in under a minute, with no rooted device and no
> reverse engineering — `unzip`, then `strings`.
>
> There is no setting that changes this. The library's own README says it plainly: it does not
> obfuscate or encrypt anything. If a value would hurt you when published on a web page, it does
> not belong in a mobile app at all. See
> [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) for the extraction,
> demonstrated on a real release build.

## Why it exists, and when not to use it

Use it for **configuration**: values that vary per build, that you would happily print in a log,
and that grant no access on their own.

| Belongs in `.env` | Never belongs in `.env` |
| --- | --- |
| `API_BASE_URL` | Payment provider secret keys |
| `APP_ENV` (`dev` / `staging` / `prod`) | Cloud provider access keys |
| A crash-reporter DSN (a write-only ingest endpoint) | Database credentials |
| A publishable / client-side API key the vendor documents as public | Anything a vendor calls a "secret key" |
| Feature-flag defaults | Signing keystore passwords |
| A CDN or asset host | Admin or service tokens |

Do not use it when the value can change without a new build. A feature flag fetched from your
backend is cheaper to flip and does not require a store review. `react-native-config` values are
frozen at build time and only change when you ship.

## Installing it

```bash
npm install react-native-config
cd ios && bundle exec pod install
```

Verified against the npm registry on 2026-09-12: **`react-native-config@1.7.2`**, with
`peerDependencies` of `react: *`, `react-native: *` and `react-native-windows: >=0.61`. Version
1.6.0 and above require React Native 0.74 or newer, so 0.87 is comfortably inside the supported
range. The library ships a `codegenConfig` TurboModule spec, so it works on the New Architecture
without an interop shim.

It is autolinked. Do **not** add it to `android/settings.gradle` by hand and do not disable its
autolinking in `react-native.config.js` — a manually linked module is not registered as a
TurboModule, and the JavaScript side then throws at import time with a message telling you
exactly that.

### Android needs one manual line

Autolinking wires the native module, but the Gradle plugin that reads your `.env` has to be
applied by you. Near the top of `android/app/build.gradle`:

```gradle title=android/app/build.gradle
apply plugin: "com.android.application"
apply plugin: "com.facebook.react"
apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"
```

That script reads the env file and, inside `defaultConfig`, emits every key twice:

```gradle title=node_modules/react-native-config/android/dotenv.gradle (excerpt)
android {
    defaultConfig {
        project.env.each { k, v ->
            def escaped = v.replaceAll("%","\\\\u0025")
            buildConfigField "String", k, "\"$v\""
            resValue "string", k, "\"$escaped\""
        }
    }
}
```

The `resValue` half is why `strings extracted/resources.arsc` finds your configuration even when
the JavaScript bundle is clean. It exists so you can reference a value from
`AndroidManifest.xml` as `@string/GOOGLE_MAPS_API_KEY`, which is genuinely useful — and it is a
second public copy of every value.

## Reading values from JavaScript

```ts title=src/config/index.ts
import Config from 'react-native-config';

/**
 * Config is `{[name: string]: string | undefined}`, so every read is possibly
 * undefined and every value is a string. Parse and validate once, here, rather
 * than sprinkling `Config.X ?? 'default'` through the app.
 */
export type AppEnvironment = 'dev' | 'staging' | 'prod';

function requireValue(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    // Failing loudly at startup beats a fetch to "undefined/users" in week three.
    throw new Error(`Missing build configuration: ${name}`);
  }
  return value;
}

function readEnvironment(): AppEnvironment {
  switch (Config.APP_ENV) {
    case 'dev':
    case 'staging':
    case 'prod':
      return Config.APP_ENV;
    default:
      // A missing APP_ENV means the env wiring is broken for this variant.
      // Fail towards the safest environment rather than acting like dev.
      return 'prod';
  }
}

export const appConfig = {
  environment: readEnvironment(),
  apiBaseUrl: requireValue('API_BASE_URL', Config.API_BASE_URL),
  sentryDsn: Config.SENTRY_DSN,
  enableDebugMenu: Config.ENABLE_DEBUG_MENU === 'true',
} as const;
```

Two things worth noticing:

- **Everything is a string.** `ENABLE_DEBUG_MENU=false` arrives as the string `"false"`, which is
  truthy. Compare against `'true'` rather than coercing.
- **Everything is optional.** The type is `string | undefined`. A key you forgot to add to
  `.env.staging` is `undefined` at runtime, not a build error.

### Typing your own keys

The shipped type is an index signature, so `Config.ANYTHING` type-checks. Narrow it with a
declaration file so a typo becomes a compile error:

```ts-fragment title=src/types/react-native-config.d.ts
declare module 'react-native-config' {
  export interface NativeConfig {
    APP_ENV?: 'dev' | 'staging' | 'prod';
    API_BASE_URL?: string;
    SENTRY_DSN?: string;
    ENABLE_DEBUG_MENU?: 'true' | 'false';
  }

  export const Config: NativeConfig;
  export default Config;
}
```

This narrows the type only. It does not make the values present at runtime — that is still your
build's job.

## The env files

Keep one file per environment, at the project root, and commit **none** of the ones with real
values. Commit a template instead.

```text title=Project root
AwesomeApp/
├── .env.example        Committed. Every key, with placeholder values.
├── .env.dev            Git-ignored
├── .env.staging        Git-ignored
└── .env.prod           Git-ignored
```

```properties title=.env.example
# Copy to .env.dev / .env.staging / .env.prod and fill in.
# Everything here is compiled into the app and is readable by anyone.
# Do not add a value you would not publish.
APP_ENV=dev
API_BASE_URL=https://api.dev.example.com
SENTRY_DSN=
ENABLE_DEBUG_MENU=true
```

```text title=.gitignore (addition)
.env
.env.dev
.env.staging
.env.prod
.env.local
ios/tmp.xcconfig
```

> [!NOTE] Git-ignoring `.env` is about hygiene, not secrecy
> It stops per-developer values and half-finished endpoints from churning in pull requests. It
> does **not** protect the values — they are in the shipped binary regardless. The reason to keep
> them out of the repository is that a repository is forever and a build is not.

## Selecting a file per build

### The portable way: `ENVFILE`

The library checks the `ENVFILE` environment variable on both platforms.

:::tabs
@tab macOS
```bash
ENVFILE=.env.staging npx react-native run-ios
ENVFILE=.env.staging npx react-native run-android
cd android && ENVFILE=.env.staging ./gradlew assembleRelease
```
@tab Windows
```powershell
$env:ENVFILE=".env.staging"; npx react-native run-android
cd android; $env:ENVFILE=".env.staging"; ./gradlew assembleRelease
```
@tab Linux
```bash
ENVFILE=.env.staging npx react-native run-android
cd android && ENVFILE=.env.staging ./gradlew assembleRelease
```
:::

This works, and it is the right tool for a one-off build. It is the wrong tool for a team,
because it depends on every person and every CI job remembering to set it. Prefer the
per-variant wiring below, and keep `ENVFILE` as the override.

### Android: map flavours to env files

Define `project.ext.envConfigFiles` **before** the `apply from` line, or the map is not yet set
when the script runs:

```gradle title=android/app/build.gradle
apply plugin: "com.android.application"
apply plugin: "com.facebook.react"

// Keys are lowercase, and matching is `variantName.startsWith(key)`.
// Order matters: a variant named "stagingDebug" would match a "staging" key
// before a "stagingdebug" key further down the map.
project.ext.envConfigFiles = [
    devdebug      : ".env.dev",
    devrelease    : ".env.dev",
    stagingdebug  : ".env.staging",
    stagingrelease: ".env.staging",
    proddebug     : ".env.prod",
    prodrelease   : ".env.prod",
]

apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"
```

Two details from the script itself, both of which bite:

- **Keys must be lowercase.** The variant name is lowercased before comparison, so a key of
  `stagingRelease` never matches.
- **Matching is `startsWith`, not equality.** This is deliberate — Gradle invokes tasks like
  `generateStagingReleaseSources`, and the prefix match still resolves them. It also means a key
  of `debug` matches the variant `debugOptimized`.

`ENVFILE` takes priority over this map when it is set, which is what makes it a usable override
in CI.

### iOS: map build configurations to env files

The library's recommended approach sets an `ENVFILE` build setting on the pod target from the
`Podfile`. Nothing is copied over anything else, and it behaves identically in Xcode, from the
CLI, and in CI.

```ruby title=ios/Podfile
ENVFILES = {
  'Debug' => '.env.dev',
  'Release' => '.env.prod',
  'Debug Staging' => '.env.staging',
  'Release Staging' => '.env.staging',
}

target 'AwesomeApp' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )

  post_install do |installer|
    react_native_post_install(installer, config[:reactNativePath])

    installer.pods_project.targets.each do |target|
      next unless target.name == 'react-native-config'

      target.build_configurations.each do |build_configuration|
        build_configuration.build_settings['ENVFILE'] = ENVFILES[build_configuration.name]
      end
    end
  end
end
```

If your env files are named after your configurations, one line covers every configuration you
will ever add:

```ruby title=ios/Podfile (alternative)
build_configuration.build_settings['ENVFILE'] = '.env.$(CONFIGURATION)'
```

With configurations `Debug Staging` and `Release Staging`, that resolves to `.env.Debug Staging`
and `.env.Release Staging`. Xcode expands `$(CONFIGURATION)`; the library expands build-setting
references itself when Xcode has not, which is what makes the same value work from a plain shell.

Run `bundle exec pod install` after editing the `Podfile`. The resolved file is echoed in the
build log — search it for `ENVFILE=`.

> [!WARNING] A missing env file does not fail the build
> If `ENVFILE` names a file that does not exist, the library prints a warning, falls back, and
> the build **succeeds** with an empty or wrong config. The failure then appears at runtime as a
> request to `undefined/users`. This is exactly why the `requireValue` helper above throws at
> startup: it converts a silent build-time miss into a loud, immediate failure.

### Exposing values to `Info.plist` and build settings

If you need a value in `Info.plist` — a maps API key, a URL scheme — it has to reach Xcode's
build settings, not just JavaScript.

1. Create `ios/Config.xcconfig` containing the single line `#include? "tmp.xcconfig"`.
2. Add `ios/tmp.xcconfig` to `.gitignore`.
3. In the project's **Info → Configurations**, apply `Config.xcconfig` to each configuration.
4. In **Edit Scheme → Build → Pre-actions**, add a **New Run Script Action**, set
   **Provide build settings from** to your app target, and paste:

```bash
"${SRCROOT}/../node_modules/react-native-config/ios/ReactNativeConfig/BuildXCConfig.rb" "${SRCROOT}/.." "${SRCROOT}/tmp.xcconfig"
```

Values are then available as `$(MY_KEY)` in `Info.plist` and in build settings.

### Using values from Gradle and the manifest

On Android the same values are available to Gradle as `project.env` and to resources as
`@string/KEY`:

```gradle title=android/app/build.gradle
defaultConfig {
    // Everything from .env is a string; cast where Gradle needs a number.
    versionCode project.env.get("VERSION_CODE").toInteger()
}
```

```xml title=android/app/src/main/AndroidManifest.xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="@string/GOOGLE_MAPS_API_KEY" />
```

## Platform differences

| | Android | iOS |
| --- | --- | --- |
| Where values land | `BuildConfig` fields **and** string resources | A generated `GeneratedDotEnv.m` compiled into the binary |
| Selection mechanism | `project.ext.envConfigFiles` keyed by variant, or `ENVFILE` | `ENVFILE` build setting per build configuration, or `ENVFILE` |
| Extra setup step | One `apply from:` line in `app/build.gradle` | A `Podfile` `post_install` block, then `pod install` |
| Available to native code | `BuildConfig.API_BASE_URL` | `[RNCConfig envFor:@"API_BASE_URL"]` |
| Available to manifest / plist | `@string/KEY` directly | Only via the extra xcconfig step above |
| Where to look when it is empty | `logcat` for `Could not find BuildConfig class` | Build log for `ENVFILE=` and `Missing .env file` |

## Common patterns

### A single typed config module

Import `react-native-config` in exactly one file, validate there, and export a frozen object.
Every other module imports your object. This gives you one place to add a default, one place to
throw on a missing key, and one place to mock in tests.

### Fail fast on a missing key

The `requireValue` helper above throws during module initialisation. That turns "the staging
build points at nothing" into a crash on the first launch of the first test build, instead of a
support ticket a month later.

### Keep `.env.example` in sync

Add a CI step that diffs the key names — not values — between `.env.example` and each real file.
A key added to `.env.dev` and forgotten in `.env.prod` is the most common way this setup fails.

```bash title=scripts/check-env-keys.sh
#!/usr/bin/env bash
set -euo pipefail

keys() { grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$1" | sort -u; }

for file in .env.dev .env.staging .env.prod; do
  if ! diff <(keys .env.example) <(keys "$file") > /dev/null; then
    echo "FAIL: keys in $file do not match .env.example" >&2
    diff <(keys .env.example) <(keys "$file") >&2 || true
    exit 1
  fi
done

echo "OK: env keys match"
```

### Show the environment in non-production builds

Render `appConfig.environment` somewhere visible in dev and staging builds. It costs one line and
removes a whole category of "which build is this" confusion during testing.

## Security considerations

### Threat

An attacker downloads your app from the store and reads every configuration value out of it.
This is not targeted — automated scanners crawl store binaries looking for key-shaped strings.

### Exploit

```bash
cd android && ./gradlew assembleProdRelease
cd app/build/outputs/apk/prodRelease
unzip -o app-prod-release.apk -d extracted

# The JS bundle.
strings -n 8 extracted/assets/index.android.bundle | grep -iE 'api[_-]?key|secret|token'

# The copy react-native-config wrote into the compiled resource table.
strings extracted/resources.arsc | grep -iE 'api[_-]?key|secret|token'
```

The second command is the one people miss. `resValue` put every key from your `.env` into
`resources.arsc`, so a bundle that greps clean proves nothing on its own.

### Fix

1. **Remove every real secret from `.env`.** Move the operation that needs it to your backend.
   The app calls your backend; your backend holds the third-party key.
2. **Assume anything left is published.** Base URLs, environment names, DSNs and publishable keys
   are fine — they are public facts about the build.
3. **Rotate anything that was ever in a `.env` that shipped.** Removing it from the next release
   does not un-ship the current one, and older versions stay installed for months.

### Verification

```bash
# Should print nothing. If it prints something, treat that value as compromised
# and rotate it rather than only deleting the line.
strings -n 8 extracted/assets/index.android.bundle \
  | grep -iE 'secret[_-]?key|AKIA[0-9A-Z]{16}|sk_live_|-----BEGIN'
strings extracted/resources.arsc | grep -iE 'secret[_-]?key|sk_live_'
```

Wire that into CI so a key cannot be reintroduced quietly. The full script lives on
[Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

## Common mistakes

- **Treating `.env` as private.** It is compiled into the binary twice on Android. Git-ignoring it
  hides it from your repository, not from your users. Wrong: `STRIPE_SECRET_KEY=sk_live_…`.
  Right: the secret stays on your backend and the app calls your backend.
- **Putting `envConfigFiles` after the `apply from:` line.** The script reads the map at apply
  time, so a map defined later is invisible and you silently get `.env`.
- **Using camelCase keys in `envConfigFiles`.** The variant name is lowercased before matching, so
  `stagingRelease:` never matches. Use `stagingrelease:`.
- **Expecting a missing env file to fail the build.** It does not. The build succeeds with an
  empty config and fails at runtime. Validate at startup.
- **Treating values as booleans.** `Config.ENABLE_DEBUG_MENU` is the string `"false"`, which is
  truthy. Compare with `=== 'true'`.
- **Adding the library to `android/settings.gradle` manually.** Autolinking is what registers the
  TurboModule; a manual link leaves it unregistered and the import throws.
- **Forgetting `bundle exec pod install` after editing the `Podfile`.** The `ENVFILE` build
  setting is written into the pod project at install time, so the old value persists until you
  re-install.
- **Adding a key to one env file only.** It is `undefined` in the others with no warning at build
  time. Diff the key names in CI.
- **Rebuilding JavaScript only after changing `.env`.** The values are baked in natively. Metro
  reloading changes nothing — you have to rebuild the native app.

## Related topics

- [Build Variants and Flavours](build-variants.md) — the flavours and configurations these files are keyed to.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — the extraction, on a real release build.
- [Android Signing](android-signing.md) — where keystore passwords go, which is never here.
- [Versioning Strategy](versioning.md) — driving `versionCode` from configuration.
- [CI Pipelines](ci-pipelines.md) — supplying env files to a build that has no working copy of them.
- [Fastlane](fastlane.md) — setting `ENVFILE` per lane.
- [Threat Model](../security/threat-model.md) — what an attacker with your binary can do.
- [Release Checklist](release-checklist.md) — confirming the shipped build read the right file.
