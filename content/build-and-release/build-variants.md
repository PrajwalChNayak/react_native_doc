---
title: Build Variants and Flavours
description: Build one codebase into dev, staging and production apps that install side by side, using Android product flavours and iOS schemes and configurations.
status: current
toolchain: cli
---

A real app is not one app. It is at least three: the one you run against a local API, the one QA
runs against a staging API, and the one that reaches the store. They need different API
endpoints, different app icons, different names, and — this is the part people discover late —
different application identifiers, so all three can sit on the same device at once.

Android and iOS solve this with different machinery. Android has **build types** and **product
flavours**, combined into **variants**. iOS has **build configurations** and **schemes**. This
page builds the same dev/staging/prod split on both, end to end.

## Why it exists, and when not to bother

The alternative to variants is editing a constant before each build, or keeping three branches.
Both fail the same way: someone ships a production build pointing at staging, and nobody notices
until the support tickets arrive.

Use variants when any of these is true:

- You have more than one backend environment.
- You want testers to keep a staging build installed alongside the store build.
- You need different signing, different crash-reporting projects, or different analytics keys per
  environment.

Do **not** reach for variants when the only difference is a feature flag that can be flipped at
runtime. A flag fetched from your server is cheaper to change than a build, and it does not
double your CI matrix. Variants are for things that must be baked into the binary: the
application ID, the icon, the entitlements, the signing identity.

> [!WARNING] Variants multiply your build matrix
> Three flavours times two build types is six Android variants, and CI has to build the ones you
> ship. Add a second dimension and it is twelve. Start with one dimension and three flavours.

## The vocabulary, on both platforms

| Concept | Android | iOS |
| --- | --- | --- |
| Debuggable vs optimised | Build type (`debug`, `release`) | Build configuration (`Debug`, `Release`) |
| Environment / white-label | Product flavour (`dev`, `staging`, `prod`) | Build configuration, plus a scheme per environment |
| The thing you actually build | Variant (`stagingRelease`) | Scheme + configuration |
| Where per-variant files live | `android/app/src/<flavour>/` | Target membership, `.xcconfig`, or per-configuration settings |

The important asymmetry: Android's two axes are genuinely independent, so `dev` and `release`
compose automatically. iOS has one axis, so a dev/staging/prod split with debug and release each
means **six** build configurations, not five. That is why iOS environment splits usually get
their own schemes.

## Android: build types

React Native 0.87's Gradle plugin already touches your build types before you do. Reading
`AgpConfiguratorUtils.kt` in `@react-native/gradle-plugin`, it:

- sets `usesCleartextTraffic` to `true` on `debug` and `false` on `release` as a manifest
  placeholder, and
- creates a third build type, **`debugOptimized`**, initialised from `debug`, with
  `matchingFallbacks` of `release` and a CMake build type of `Release`.

`debugOptimized` gives you a debuggable JavaScript experience on optimised native code. It is
useful when a bug only reproduces with release-built native libraries.

The plugin's `debuggableVariants` property defaults to `["debug", "debugOptimized"]`. Variants in
that list do **not** get a JS bundle compiled into them — they expect Metro. Everything else
gets a bundle.

> [!WARNING] Adding flavours breaks the default `debuggableVariants`
> The default list contains the literal strings `debug` and `debugOptimized`. Once you add a
> flavour dimension, your debuggable variants are called `devDebug`, `stagingDebug` and
> `prodDebug` — none of which match. Gradle will then try to bundle JavaScript into your debug
> builds. Set the list explicitly, as shown below.

## Android: a dev/staging/prod split

Everything here goes in `android/app/build.gradle`.

```gradle title=android/app/build.gradle
apply plugin: "com.facebook.react"

android {
    // The generated project reads these from the ext block in android/build.gradle,
    // where 0.87.1 sets buildToolsVersion 37.0.0, compileSdkVersion 37,
    // targetSdkVersion 36, minSdkVersion 24 and kotlinVersion 2.2.0.
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace "com.awesomeapp"

    defaultConfig {
        applicationId "com.awesomeapp"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0.0"
    }

    // One dimension is enough for an environment split. A second dimension
    // (e.g. "brand") multiplies the variant count, so add one only when you
    // genuinely ship more than one brand.
    flavorDimensions += "env"

    productFlavors {
        dev {
            dimension "env"
            // Suffixes append to defaultConfig, so this installs as
            // com.awesomeapp.dev and coexists with staging and prod.
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
            resValue "string", "app_name", "AwesomeApp Dev"
        }
        staging {
            dimension "env"
            applicationIdSuffix ".staging"
            versionNameSuffix "-staging"
            resValue "string", "app_name", "AwesomeApp Staging"
        }
        prod {
            dimension "env"
            // No suffix: this is the identifier the Play Store knows.
            resValue "string", "app_name", "AwesomeApp"
        }
    }

    buildTypes {
        debug {
            // signingConfig is the generated debug key; leave it alone.
        }
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }
}

react {
    // Must be updated when you add flavours, or Gradle bundles JavaScript
    // into your debug builds and Fast Refresh stops working.
    debuggableVariants = ["devDebug", "stagingDebug", "prodDebug"]

    autolinkLibrariesWithApp()
}
```

`resValue "string", "app_name", …` defines the string resource at build time, so delete the
`app_name` entry from `android/app/src/main/res/values/strings.xml` or Gradle fails with a
duplicate-resource error. That error message names the resource, not the cause, and it catches
almost everyone once.

### Per-flavour source sets

Gradle merges `src/main/` with `src/<flavour>/` for the variant being built. This is how you give
each environment its own icon, its own manifest entries, or its own native code.

```text title=android/app/src/
android/app/src/
├── main/                     Shared code, resources and manifest
│   ├── AndroidManifest.xml
│   ├── java/com/awesomeapp/
│   └── res/
├── dev/
│   └── res/mipmap-*/         A dev-badged launcher icon
├── staging/
│   ├── AndroidManifest.xml   Extra permissions or an extra intent filter
│   └── res/mipmap-*/
└── prod/
    └── res/mipmap-*/
```

A flavour manifest is **merged** into the main one, not a replacement for it, so it only needs
the elements that differ:

```xml title=android/app/src/staging/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Staging talks to an internal host over plaintext during a migration.
         Production must never carry this, which is exactly why it lives here. -->
    <application android:usesCleartextTraffic="true" />
</manifest>
```

### Building and running a variant

The task name is the flavour and the build type in camel case, with a prefix of `assemble`
(APK) or `bundle` (AAB):

```bash
cd android

./gradlew assembleDevDebug          # dev APK, debuggable
./gradlew assembleStagingRelease    # staging APK for testers
./gradlew bundleProdRelease         # production AAB for the Play Store
./gradlew tasks --all | grep -E "assemble|bundle"   # list what exists
```

The Community CLI 20.2.0 takes the variant through `--mode`, which it pascal-cases and appends to
the task prefix:

```bash
npx react-native run-android --mode=devDebug
npx react-native build-android --mode=prodRelease
npx react-native run-android --appIdSuffix .dev --mode=devDebug
npx react-native build-android --interactive   # pick build type and flavour
```

> [!NOTE] `--variant` is not the flag
> Older guides use `--variant`. In CLI 20.2.0 the flag is `--mode <string>`, described as
> "Specify your app's build variant". `--tasks <list>` overrides it entirely with raw Gradle task
> names, and `--extra-params <string>` passes anything else through to Gradle.

## iOS: configurations and schemes

iOS has no product-flavour axis. A build configuration is the whole story, and a scheme selects
which configuration each action (Run, Test, Profile, Archive) uses.

The practical split:

| Environment | Build configurations | Scheme |
| --- | --- | --- |
| Development | `Debug`, `Release` | `AwesomeApp` |
| Staging | `Debug Staging`, `Release Staging` | `AwesomeApp Staging` |
| Production | `Debug Prod`, `Release Prod` | `AwesomeApp Prod` |

Some teams keep the stock `Debug`/`Release` pair as production and add only the staging pair.
That is four configurations instead of six and is a reasonable simplification — as long as
everyone knows that plain `Release` means production.

### Step 1 — duplicate the configurations

In Xcode, select the project (not the target) → **Info** → **Configurations**. Use the **+**
button to duplicate `Debug` and `Release`, naming the copies `Debug Staging` and
`Release Staging`.

### Step 2 — give each configuration its own identifier and name

Select the app target → **Build Settings**, and expand these two rows so each configuration gets
its own value:

| Build setting | What to set per configuration |
| --- | --- |
| `PRODUCT_BUNDLE_IDENTIFIER` | `com.awesomeapp.staging` for the staging pair |
| `PRODUCT_NAME` | The name under the icon, if it should differ |
| `ASSETCATALOG_COMPILER_APPICON_NAME` | `AppIcon-Staging`, if you ship a badged icon |

Setting `PRODUCT_BUNDLE_IDENTIFIER` per configuration is what lets staging and production coexist
on one device, exactly as `applicationIdSuffix` does on Android.

### Step 3 — tell CocoaPods about the new configurations

This is the step that produces the most confusing failure. CocoaPods generates its own xcconfig
per configuration, and it only knows the configurations you declare. An undeclared configuration
builds with no pod settings at all, and the error is a missing header rather than anything
mentioning CocoaPods.

```ruby title=ios/Podfile
platform :ios, min_ios_version_supported
prepare_react_native_project!

# Every non-standard configuration must be mapped to :debug or :release so
# CocoaPods knows which of its xcconfigs to apply.
project 'AwesomeApp', {
  'Debug' => :debug,
  'Release' => :release,
  'Debug Staging' => :debug,
  'Release Staging' => :release,
}

target 'AwesomeApp' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath],
    :app_path => "#{Pod::Config.instance.installation_root}/.."
  )

  post_install do |installer|
    react_native_post_install(installer, config[:reactNativePath])
  end
end
```

Then re-run the install:

```bash
cd ios && bundle exec pod install
```

### Step 4 — add a scheme per environment

**Product → Scheme → Manage Schemes**, duplicate the app scheme, name it `AwesomeApp Staging`,
and set each action's configuration:

| Scheme action | Configuration |
| --- | --- |
| Run | `Debug Staging` |
| Test | `Debug Staging` |
| Profile | `Release Staging` |
| Analyze | `Debug Staging` |
| Archive | `Release Staging` |

Tick **Shared** in the Manage Schemes list. An unshared scheme lives in
`xcuserdata/`, which is git-ignored, so it exists on your machine and nowhere else — and CI
fails with "scheme not found" while the project builds fine for you.

### Building and running an iOS scheme

The Community CLI's Apple commands expose `--scheme` and `--mode` (`--mode` is the build
configuration, and the flag is case sensitive):

```bash
npx react-native run-ios --scheme "AwesomeApp Staging" --mode "Debug Staging"
npx react-native build-ios --scheme "AwesomeApp Staging" --mode "Release Staging"
npx react-native run-ios --interactive     # pick a scheme and configuration
```

Or drive `xcodebuild` directly, which is what CI and Fastlane do:

```bash
cd ios
xcodebuild -workspace AwesomeApp.xcworkspace \
           -scheme "AwesomeApp Staging" \
           -configuration "Release Staging" \
           -destination "generic/platform=iOS" \
           archive -archivePath build/AwesomeApp.xcarchive
```

> [!WARNING] iOS archiving needs macOS
> `xcodebuild`, Xcode schemes and everything in this half of the page run only on macOS. On
> Windows or Linux you can build every Android variant and none of the iOS ones. Plan for a Mac
> or a hosted macOS runner.

## Reading the variant from JavaScript

Variants are useless if your JavaScript cannot tell which one it is in. The wiring is covered in
full on [Environment Configuration](environment-configuration.md); the short version is that
`react-native-config` reads a different `.env` file per variant and exposes the values as a
typed-ish object.

```ts title=src/config/environment.ts
import Config from 'react-native-config';

export type AppEnvironment = 'dev' | 'staging' | 'prod';

function readEnvironment(): AppEnvironment {
  switch (Config.APP_ENV) {
    case 'dev':
    case 'staging':
    case 'prod':
      return Config.APP_ENV;
    default:
      // A missing APP_ENV means the variant wiring is broken. Fail towards the
      // most restrictive environment rather than silently acting like dev.
      return 'prod';
  }
}

export const environment = readEnvironment();
export const isProduction = environment === 'prod';
```

`__DEV__` is **not** a substitute. It is true for any Metro-served build and false for any
bundled one, so a staging release build and a production release build look identical through it.

## Common patterns

### Keep the variant visible in the app

Put the environment and version in an about screen or a long-press debug overlay, for every
non-production variant. A tester who cannot tell which build they are holding files bug reports
against the wrong environment.

### One flavour dimension until you actually need two

White-label apps genuinely need `flavorDimensions += ["brand", "env"]`, which produces
`acmeDevDebug`, `acmeProdRelease` and so on. Until you ship a second brand, the second dimension
only costs build time.

### Gate release-only tooling by variant, not by `__DEV__`

Crash reporting, analytics and performance monitors should usually be off in dev, on in staging,
and on in production — three states that `__DEV__` cannot express.

### Give each variant its own crash-reporting project

Staging crashes drowning out production crashes is a real failure mode. Use a different DSN or
project key per flavour, sourced from the same per-variant config.

## Performance considerations

Variants change build time more than run time.

- **`reactNativeArchitectures`** in `android/gradle.properties` controls which ABIs are built.
  Restricting it locally (for example to `arm64-v8a`) cuts native build time substantially. CI
  must still build all of them.
- **`--active-arch-only`** on `run-android` does the same thing for debug builds without editing
  the properties file.
- **`debugOptimized`** exists precisely so you can profile optimised native code without a full
  release build.
- Every extra flavour adds a full Gradle variant to configure. Configuration time grows even for
  variants you never build.

## Common mistakes

- **Forgetting `debuggableVariants` after adding flavours.** The default is
  `["debug", "debugOptimized"]`, which matches nothing once your variants are called `devDebug`.
  Gradle then bundles JavaScript into debug builds and Fast Refresh stops working. Set it to your
  real debug variant names.
- **Leaving `app_name` in `strings.xml` while also using `resValue`.** Gradle fails with a
  duplicate resource error that names `app_name` and not the flavour block. Delete the XML entry.
- **Using `--variant` with CLI 20.2.0.** The flag is `--mode`. Wrong:
  `run-android --variant=devDebug`. Right: `run-android --mode=devDebug`.
- **Adding an Xcode configuration without mapping it in the `Podfile`.** CocoaPods applies no
  xcconfig at all, and the build fails on a missing header with nothing pointing at pods. Add the
  configuration to the `project '<Name>', {…}` map and re-run `bundle exec pod install`.
- **Leaving a new scheme unshared.** It lives in `xcuserdata/`, which is git-ignored, so CI
  reports "scheme not found" for a scheme that clearly exists on your machine. Tick **Shared**.
- **Using `__DEV__` as the environment switch.** It only distinguishes Metro-served from bundled.
  Staging and production release builds are indistinguishable through it.
- **Not suffixing the application ID.** Without `applicationIdSuffix`, installing staging removes
  production from the device, and testers lose their data with no warning.
- **Adding a second flavour dimension "for later".** It doubles the variant count and every
  Gradle configuration pass, for a brand you have not shipped.

## Related topics

- [Environment Configuration](environment-configuration.md) — feeding per-variant values into JavaScript.
- [App Icons and Splash Screens](icons-and-splash-screens.md) — per-flavour icons and the Android 12+ splash API.
- [Android Signing](android-signing.md) — a signing config per build type and flavour.
- [iOS Signing and Provisioning](ios-signing.md) — one provisioning profile per bundle identifier.
- [Versioning Strategy](versioning.md) — `versionNameSuffix` and how it interacts with store versions.
- [Fastlane](fastlane.md) — a lane per variant.
- [CI Pipelines](ci-pipelines.md) — building the matrix without building everything.
- [Project Structure](../getting-started/project-structure.md) — where `android/` and `ios/` came from.
- [Release Checklist](release-checklist.md) — confirming you shipped the variant you meant to.
