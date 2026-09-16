---
title: CI Pipelines
description: A working GitHub Actions pipeline for a React Native 0.87 app — checks, an Android build on Linux, an iOS build on a macOS runner, and secrets handled safely.
status: current
toolchain: cli
---

Mobile CI has one structural difference from web CI: **you cannot build both platforms on one
runner**. iOS needs macOS; Android does not and should not pay for it. Every pipeline in this
section is therefore at least two jobs, on two operating systems, with different caches and
different secrets.

This page builds that pipeline for GitHub Actions, because it is the most common starting point.
The shape transfers to GitLab CI, Bitrise, CircleCI and the rest — the jobs, the caches and the
secrets are the same; only the syntax moves.

## The shape

```text
                    ┌─────────────────────────┐
  push / PR  ──────►│ checks (ubuntu)         │  lint, typecheck, jest
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
   ┌──────────────────────┐          ┌──────────────────────────┐
   │ android (ubuntu)     │          │ ios (macOS runner)       │
   │ Gradle → AAB         │          │ Xcode → IPA              │
   └──────────────────────┘          └──────────────────────────┘
```

Run checks once, on the cheap runner, and gate both builds on them. There is no reason to spend
macOS minutes discovering a lint error.

> [!WARNING] macOS runners are the expensive part
> Hosted macOS minutes bill at a multiple of Linux minutes on every provider. That multiplier is
> the single biggest lever on your CI bill, and it is why the iOS job below runs only where it has
> to: on release branches and tags, not on every pull request.

## Checks

```yaml title=.github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

# A new push supersedes an in-flight run for the same ref.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          # Reads .nvmrc, so CI and developers cannot drift.
          node-version-file: .nvmrc
          cache: npm

      # `npm ci` installs exactly the lockfile. `npm install` may resolve
      # something new, which is the opposite of what CI is for.
      - run: npm ci

      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test -- --ci
```

`node-version-file: .nvmrc` matters more than it looks. React Native 0.87.1 declares
`"node": "^22.13.0 || ^24.3.0 || >= 26.0.0"`, and those are three disjoint ranges — a runner
defaulting to Node 22.11 satisfies "Node 22" and not the engine constraint. Commit an `.nvmrc`
(see [Environment Setup](../getting-started/environment-setup.md)) and point CI at it.

## The Android job

```yaml title=.github/workflows/ci.yml (continued)
  android:
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      # React Native 0.87 requires JDK 17. A newer JDK produces
      # "Unsupported class file major version" errors from Gradle.
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - uses: gradle/actions/setup-gradle@v4

      - run: npm ci

      - name: Decode the upload keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.ANDROID_UPLOAD_KEYSTORE_BASE64 }}
        run: echo "$KEYSTORE_BASE64" | base64 --decode > android/app/upload.keystore

      - name: Write the environment file
        env:
          ENV_PROD: ${{ secrets.ENV_PROD }}
        run: printf '%s' "$ENV_PROD" > .env.prod

      - name: Build the release bundle
        env:
          ENVFILE: .env.prod
          AWESOMEAPP_UPLOAD_STORE_FILE: upload.keystore
          AWESOMEAPP_UPLOAD_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          AWESOMEAPP_UPLOAD_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
          AWESOMEAPP_UPLOAD_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          BUILD_NUMBER: ${{ github.run_number }}
        working-directory: android
        run: ./gradlew bundleProdRelease --no-daemon

      - name: Upload the artefacts
        uses: actions/upload-artifact@v4
        with:
          name: android-release
          # The mapping file is as important as the bundle. Without it, every
          # crash report from this build is permanently unreadable.
          path: |
            android/app/build/outputs/bundle/prodRelease/*.aab
            android/app/build/outputs/mapping/prodRelease/mapping.txt
          retention-days: 90

      - name: Remove the decoded secrets
        if: always()
        run: rm -f android/app/upload.keystore .env.prod
```

Points worth calling out:

- **`--no-daemon`.** The Gradle daemon is a long-lived process that helps on a machine you keep.
  A CI runner is discarded, and the daemon costs startup time and memory for nothing.
- **`github.run_number` as `BUILD_NUMBER`.** Monotonic, never reused, and requires no git history.
  See [Versioning Strategy](versioning.md).
- **The cleanup step runs `if: always()`.** A failed build must not leave a keystore in the
  workspace where a cache or an artefact upload could pick it up.
- **The mapping file is uploaded with the bundle.** It is regenerated on every build; once the
  runner is gone it cannot be recovered.

### Making Gradle fast enough

| Lever | Effect |
| --- | --- |
| `gradle/actions/setup-gradle` | Caches the Gradle user home and build cache between runs |
| `actions/setup-node` with `cache: npm` | Caches the npm download cache — not `node_modules` |
| `reactNativeArchitectures` | Building fewer ABIs is the single largest saving, but a release build needs all of them |
| `org.gradle.jvmargs=-Xmx2048m` | Already in the template; raise it if the runner has the memory |

Do **not** cache `node_modules` directly. A partially restored `node_modules` produces failures
that look like source bugs, and `npm ci` against a warm npm cache is fast enough.

## The iOS job

```yaml title=.github/workflows/release-ios.yml
name: iOS release

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  ios:
    # iOS builds require macOS. There is no Linux or Windows alternative.
    runs-on: macos-15
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      # React Native 0.87 requires Xcode 26.0 or newer. Runner images ship
      # several versions; pin one rather than taking the image default.
      - uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: '26.0'

      - uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true   # bundle install + cache the gems

      - run: npm ci

      - name: Cache CocoaPods
        uses: actions/cache@v4
        with:
          path: ios/Pods
          key: pods-${{ hashFiles('ios/Podfile.lock') }}
          restore-keys: pods-

      - name: Install pods
        working-directory: ios
        run: bundle exec pod install

      - name: Write the environment file
        env:
          ENV_PROD: ${{ secrets.ENV_PROD }}
        run: printf '%s' "$ENV_PROD" > .env.prod

      - name: Build and upload to TestFlight
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_CONTENT_BASE64: ${{ secrets.ASC_KEY_CONTENT_BASE64 }}
          BUILD_NUMBER: ${{ github.run_number }}
        run: bundle exec fastlane ios beta

      - name: Upload the dSYMs
        uses: actions/upload-artifact@v4
        with:
          name: ios-dsyms
          path: build/ios/*.dSYM.zip
          retention-days: 90

      - name: Clean up
        if: always()
        run: rm -f .env.prod
```

> [!NOTE] Pin the runner image and the Xcode version, and check both
> `macos-latest` moves to a new major macOS release without warning, taking the default Xcode with
> it. Pin the image (`macos-15`) and the Xcode version, then upgrade deliberately. Both the
> available runner labels and the Xcode versions installed on them change over time — check your
> provider's current runner image documentation rather than trusting a version string from any
> document, including this one.

The build itself is a Fastlane lane rather than a pile of `xcodebuild` invocations, because
signing on a fresh runner needs `setup_ci`, `match` and an App Store Connect API key. That whole
path is on [Fastlane](fastlane.md) and [iOS Signing and Provisioning](ios-signing.md).

## Secrets: the rules that matter

| Rule | Why |
| --- | --- |
| Binary secrets are base64 in the secret store, decoded at job start | A secret store holds strings; a keystore and a `.p8` are bytes |
| Decoded files are deleted in an `if: always()` step | So a failed job cannot leak them into a cache or artefact |
| Never `echo` a derived value | Masking covers registered secrets, not values you computed from them |
| No secrets in workflows triggered by `pull_request` from forks | A fork PR can modify the workflow it runs |
| Scope each credential to what its job does | An internal-track upload does not need production release rights |

That fourth rule is the one that bites. On GitHub, `pull_request` runs from a fork do not receive
secrets by default — which is correct, and it also means a signed build cannot run on a fork PR.
Keep signing in workflows triggered by `push` to protected branches and tags.

```yaml
# Do this: a release build runs only on a tag, from your own repository.
on:
  push:
    tags: ['v*']

# Not this: a fork can change the workflow and it would run with your secrets.
on:
  pull_request_target:
```

## Other providers, same shape

| Provider | Android runner | iOS runner | Notes |
| --- | --- | --- | --- |
| GitHub Actions | `ubuntu-latest` | `macos-*` | Shown above |
| GitLab CI | A Linux Docker image | A macOS runner or a self-hosted Mac | macOS runners are a separate tier |
| CircleCI | A Docker executor | A `macos` executor | |
| Bitrise | Linux stack | macOS stack | Mobile-specific; more built-in steps |
| Self-hosted | Any Linux machine | A physical or virtual Mac | Cheapest at volume; you own the maintenance |

```yaml title=.gitlab-ci.yml (the Android half, for comparison)
stages: [check, build]

variables:
  GRADLE_OPTS: "-Dorg.gradle.daemon=false"

check:
  stage: check
  image: node:22
  cache:
    key: npm-$CI_COMMIT_REF_SLUG
    paths: [.npm]
  script:
    - npm ci --cache .npm --prefer-offline
    - npx tsc --noEmit
    - npm run lint
    - npm test -- --ci

android:
  stage: build
  # An image with the Android SDK and JDK 17 already installed.
  image: reactnativecommunity/react-native-android:latest
  script:
    - npm ci
    - echo "$ANDROID_UPLOAD_KEYSTORE_BASE64" | base64 -d > android/app/upload.keystore
    - cd android && ./gradlew bundleProdRelease
  after_script:
    - rm -f android/app/upload.keystore
  artifacts:
    paths:
      - android/app/build/outputs/bundle/prodRelease/
      - android/app/build/outputs/mapping/prodRelease/mapping.txt
    expire_in: 90 days
  only:
    - main
    - tags
```

> [!NOTE] Verify third-party images and actions before adopting them
> `reactnativecommunity/react-native-android`, `maxim-lobanov/setup-xcode`,
> `gradle/actions/setup-gradle` and every other third-party building block above is code you are
> running with your secrets in scope. Check that the version you pin is current and maintained,
> and pin to a tag or a commit SHA rather than a floating `latest`.

## Performance considerations

CI time on a React Native project is dominated by three things, in this order:

1. **Native compilation.** Gradle's Kotlin/Java compilation and CMake, plus Xcode's. Cache the
   Gradle user home; cache `ios/Pods` keyed on `Podfile.lock`.
2. **Dependency installation.** `npm ci` against a warm cache, `bundle install` with
   `bundler-cache: true`, and a CocoaPods cache.
3. **Metro bundling.** Fast relative to the native steps, and it runs inside the native build.

Two further levers:

- **Do not run the iOS job on every pull request.** Run checks plus the Android build on PRs, and
  the iOS build on release branches and tags. Most regressions that matter are caught by the
  shared JavaScript.
- **Use `concurrency` with `cancel-in-progress`.** A superseded run is wasted money, and on macOS
  it is a lot of wasted money.

## Common patterns

### Gate builds on checks

`needs: checks` on both build jobs. Lint failures should not consume a build slot.

### One workflow per purpose

`ci.yml` on every push and PR; `release-android.yml` and `release-ios.yml` on tags. Mixing them
produces a workflow full of `if:` conditions that nobody can reason about.

### Upload the debug symbols with every build

`mapping.txt` on Android, `.dSYM` on iOS. They are per-build and unrecoverable once the runner is
recycled. Ninety days of retention costs almost nothing and saves an entire class of
unreadable crash report.

### Run the release lane from a tag

The tag is the record of what shipped. A build from a moving branch cannot be reproduced.

### Post the build to a chat channel

A message with the version, the build number and the track turns "is the build up?" into
something nobody has to ask.

## Common mistakes

- **Trying to build iOS on Linux.** There is no supported path. The job fails at `xcodebuild` with
  an error that does not mention the operating system.
- **Letting CI pick its own Node version.** React Native 0.87's `engines` field is three disjoint
  ranges. Use `node-version-file: .nvmrc`.
- **Installing the newest JDK.** 0.87 needs JDK 17. A newer one produces
  `Unsupported class file major version` from Gradle, which reads like a Gradle bug.
- **`npm install` instead of `npm ci`.** `install` may resolve a version the lockfile does not
  name, so CI stops testing what you will ship.
- **Caching `node_modules`.** A partially restored tree fails in ways that look like source bugs.
  Cache the package manager's download cache instead.
- **Leaving decoded secrets in the workspace.** Delete them in an `if: always()` step, or they can
  reach a cache or an uploaded artefact.
- **Running signed builds on fork pull requests.** Either it fails because secrets are absent, or —
  far worse — you configured `pull_request_target` and handed your secrets to arbitrary code.
- **Not uploading `mapping.txt` and the `.dSYM`.** They are regenerated per build and gone with
  the runner.
- **Running the macOS job on every push.** It is the most expensive minute in the pipeline and
  rarely the one that catches the bug.
- **Using `macos-latest` and a floating Xcode.** Both move under you. Pin, and upgrade on purpose.
- **Leaving the Gradle daemon on.** `--no-daemon` on an ephemeral runner; the daemon only pays off
  on a machine you keep.

## Related topics

- [Fastlane](fastlane.md) — the lanes these jobs invoke.
- [Android Signing](android-signing.md) — the keystore and the secrets this pipeline decodes.
- [iOS Signing and Provisioning](ios-signing.md) — why the iOS job needs `match` and an API key.
- [Environment Configuration](environment-configuration.md) — supplying `.env` files to a runner.
- [Versioning Strategy](versioning.md) — using the run number as the build number.
- [AAB and Play Store Submission](play-store-submission.md) — where the AAB goes next.
- [TestFlight and App Store Submission](app-store-submission.md) — where the IPA goes next.
- [CI for Mobile](../testing/ci-for-mobile.md) — the testing side of the same pipeline.
- [Environment Setup](../getting-started/environment-setup.md) — the toolchain these jobs install.
- [Release Checklist](release-checklist.md) — what to check before triggering a release workflow.
