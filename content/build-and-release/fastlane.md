---
title: Fastlane
description: Automate signing, building, and uploading to both stores with a Fastfile you can run locally and from CI.
status: current
toolchain: cli
---

Fastlane is a Ruby tool that wraps the commands this section has been running by hand —
`gradlew bundleProdRelease`, `xcodebuild archive`, the upload to each store — into named lanes
you invoke as `fastlane android internal` or `fastlane ios beta`.

The value is not that it types `xcodebuild` for you. It is that the release process becomes a
file in your repository: reviewed, versioned, identical on your machine and on CI, and runnable
by someone who has never released this app before.

> [!WARNING] iOS lanes need macOS
> Any lane that calls `build_app`, `match` or `upload_to_testflight` runs Xcode and the macOS
> Keychain, so it runs only on macOS. Android lanes run on macOS and Linux. Fastlane's Windows
> support is limited and not what Android CI runners use — if your team is on Windows, expect to
> run lanes on a Linux container for Android and a hosted macOS runner for iOS.

## Installing it through Bundler

A generated React Native project already has a `Gemfile`, because CocoaPods is a gem. Add Fastlane
to it rather than installing globally, so everyone and every CI job runs the same version:

```ruby title=Gemfile
source 'https://rubygems.org'

ruby '>= 2.6.10'

gem 'cocoapods', '>= 1.13', '!= 1.15.0', '!= 1.15.1'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'
gem 'fastlane'
```

```bash
bundle install
bundle exec fastlane --version
```

Run every lane through `bundle exec`. A globally installed `fastlane` is whatever version you last
happened to install, and a release process that behaves differently per machine is the problem
you are trying to remove.

> [!NOTE] Fastlane's version is not verifiable from the npm registry
> Every other version in this handbook was read from `npm view`. Fastlane is a RubyGem, so it was
> not verified that way. Pin it in your `Gemfile.lock` (which `bundle install` writes and you
> commit), and check `bundle exec fastlane --version` on your own machine before relying on any
> action parameter below.

```bash
cd android && bundle exec fastlane init   # or run it from the project root
```

`fastlane init` creates `fastlane/Appfile` and `fastlane/Fastfile`. A React Native project has two
native projects, and you can either keep one `fastlane/` at the root with platform blocks — which
is what this page does — or one inside `android/` and one inside `ios/`. The root layout keeps
shared configuration in one place.

## The Appfile

`Appfile` holds identifiers, not secrets.

```ruby title=fastlane/Appfile
# iOS
app_identifier("com.awesomeapp")
apple_id(ENV["FASTLANE_APPLE_ID"])       # only used for actions that need an Apple ID
team_id(ENV["FASTLANE_TEAM_ID"])

# Android
json_key_file(ENV["PLAY_STORE_JSON_KEY_PATH"])
package_name("com.awesomeapp")
```

Everything sensitive comes from the environment. The `Appfile` is committed; the values are not.

## The Android lanes

```ruby title=fastlane/Fastfile
default_platform(:android)

platform :android do
  desc "Build a release AAB and upload it to the internal testing track"
  lane :internal do
    version = JSON.parse(File.read("../package.json"))["version"]
    build_number = ENV.fetch("BUILD_NUMBER")

    gradle(
      project_dir: "android/",
      task: "clean"
    )

    gradle(
      project_dir: "android/",
      task: "bundle",
      flavor: "prod",
      build_type: "Release",
      properties: {
        # Passed to Gradle as -P properties, so build.gradle can read them.
        "versionName" => version,
        "versionCode" => build_number
      }
    )

    upload_to_play_store(
      track: "internal",
      aab: lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH],
      release_status: "draft",
      # Store listing text is managed deliberately, not on every build.
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end

  desc "Promote the current internal build to production at 10%"
  lane :promote do
    upload_to_play_store(
      track: "internal",
      track_promote_to: "production",
      rollout: "0.1",
      skip_upload_aab: true,
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
```

Three things that matter here:

- **`lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH]`** is the path the `gradle` action just
  produced. Hard-coding the path breaks the moment you add a flavour.
- **`release_status: "draft"`** uploads without releasing. A human presses the button. Remove it
  only when you genuinely want an unattended release.
- **`track_promote_to`** promotes the artefact that already passed testing rather than building a
  new one — which is materially safer, because the bytes are identical.

### The Play service account

`upload_to_play_store` authenticates with a Google Cloud service account JSON key, granted access
in the Play Console under **Users and permissions**. Grant it the narrowest role that covers what
your lanes do — releasing to testing tracks does not require production release permission.

```bash
# Confirm the key works before wiring it into CI.
bundle exec fastlane run validate_play_store_json_key \
  json_key:/path/to/play-store-key.json
```

Treat the JSON key exactly like a keystore: never committed, stored base64-encoded in your CI
secret store, decoded at the start of the job, deleted at the end.

## The iOS lanes

```ruby title=fastlane/Fastfile (continued)
platform :ios do
  desc "Build and upload to TestFlight"
  lane :beta do
    # On CI, create a temporary keychain so codesign never blocks on a GUI
    # prompt. This is a no-op outside CI.
    setup_ci

    api_key = app_store_connect_api_key(
      key_id: ENV.fetch("ASC_KEY_ID"),
      issuer_id: ENV.fetch("ASC_ISSUER_ID"),
      key_content: ENV.fetch("ASC_KEY_CONTENT_BASE64"),
      is_key_content_base64: true
    )

    # Installs the shared certificate and profile from the encrypted repo.
    # readonly on CI: a runner must never mint new certificates.
    match(
      type: "appstore",
      app_identifier: "com.awesomeapp",
      readonly: is_ci,
      api_key: api_key
    )

    cocoapods(podfile: "ios/Podfile")

    version = JSON.parse(File.read("../package.json"))["version"]

    increment_version_number(
      xcodeproj: "ios/AwesomeApp.xcodeproj",
      version_number: version
    )
    increment_build_number(
      xcodeproj: "ios/AwesomeApp.xcodeproj",
      build_number: ENV.fetch("BUILD_NUMBER")
    )

    build_app(
      workspace: "ios/AwesomeApp.xcworkspace",
      scheme: "AwesomeApp",
      configuration: "Release",
      export_method: "app-store",
      output_directory: "build/ios",
      clean: true
    )

    upload_to_testflight(
      api_key: api_key,
      # Waiting for Apple to finish processing can take an hour. Let the job
      # finish and check the result asynchronously.
      skip_waiting_for_build_processing: true,
      changelog: File.read("../CHANGELOG_LATEST.md")
    )
  end
end
```

### `match` is the point

`match` stores one shared distribution certificate and its provisioning profiles, encrypted, in a
private git repository or a cloud bucket. Every machine and every runner installs the same
identity from it.

```ruby title=fastlane/Matchfile
git_url("git@github.com:yourorg/ios-certificates.git")
storage_mode("git")
type("appstore")
app_identifier(["com.awesomeapp", "com.awesomeapp.staging"])
```

```bash
# Once, from a machine that may create certificates:
bundle exec fastlane match appstore

# On every other machine and on CI: install only, never create.
bundle exec fastlane match appstore --readonly
```

This is the actual fix for "it signs on my machine and not on his" — described as a problem on
[iOS Signing and Provisioning](ios-signing.md). The `MATCH_PASSWORD` environment variable
decrypts the repository, so it is a high-value secret: anyone with it and read access to the repo
holds your distribution identity.

> [!NOTE] Verify action parameters against your installed Fastlane
> Fastlane's actions gain and rename parameters between releases, and `export_method` in
> particular tracks Xcode's own export option names, which have changed. Before relying on any
> parameter above, run `bundle exec fastlane action build_app` (or `match`, `upload_to_testflight`,
> `upload_to_play_store`) — it prints the full parameter list for the version you actually have.

## Secrets

Fastlane reads environment variables, so secrets live in your CI secret store and in a local
`.env` that is never committed.

```text title=fastlane/.env.default — committed, no secrets
FASTLANE_TEAM_ID=ABCDE12345
FASTLANE_SKIP_UPDATE_CHECK=1
FASTLANE_HIDE_CHANGELOG=1
```

```text title=.gitignore
fastlane/.env
fastlane/.env.*
!fastlane/.env.default
fastlane/report.xml
fastlane/README.md
*.p8
*.p12
play-store-key.json
```

| Secret | Used by | Notes |
| --- | --- | --- |
| `MATCH_PASSWORD` | `match` | Decrypts the certificate repository |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT_BASE64` | App Store Connect API | The `.p8` is downloadable once |
| `PLAY_STORE_JSON_KEY_PATH` or its base64 content | `upload_to_play_store` | Scope the service account narrowly |
| Android keystore and passwords | `gradle` | See [Android Signing](android-signing.md) |

> [!DANGER] `fastlane run` prints its parameters
> Debugging with `fastlane run <action> param:value` echoes what you passed, and CI log masking
> only covers values it was told about. Never paste a secret onto a `fastlane run` command line on
> a machine whose logs you do not control.

## Store metadata in the repository

`deliver` (for the App Store) and `supply` (for Play) read metadata from disk, so your listings can
be reviewed like code:

```text title=fastlane/metadata/
fastlane/metadata/
├── android/
│   └── en-US/
│       ├── title.txt
│       ├── short_description.txt
│       ├── full_description.txt
│       └── changelogs/
│           └── 882.txt          Named after the versionCode
└── en-US/                       App Store
    ├── name.txt
    ├── description.txt
    ├── keywords.txt
    └── release_notes.txt
```

```bash
# Pull what is currently live, so the repository starts from reality.
bundle exec fastlane deliver download_metadata
bundle exec fastlane supply init
```

Then upload metadata deliberately — a separate lane, run when the text changes — rather than on
every build. Store listing edits can trigger review.

## Common patterns

### A lane per destination, not per action

`ios beta`, `ios release`, `android internal`, `android production`. Someone releasing for the
first time should not have to know which actions to compose.

### Fail early on a dirty tree

```ruby
lane :release do
  ensure_git_status_clean
  ensure_git_branch(branch: 'main')
  # …
end
```

A release built from uncommitted changes cannot be reproduced, and you will want to reproduce it.

### Wrap Gradle rather than replacing it

The `gradle` action runs your existing tasks. Keep the build logic in `build.gradle`, where it
also works without Fastlane, and let the lane orchestrate.

### Use the same lanes locally and on CI

If the release lane only ever runs on CI, it breaks silently and you discover it on release day.
Run `bundle exec fastlane android internal` from your own machine occasionally.

### `setup_ci` at the top of every iOS lane

It creates and unlocks a temporary keychain on CI and does nothing elsewhere, which is exactly the
behaviour you want from one line.

## Common mistakes

- **Running iOS lanes on a Linux runner.** They need Xcode. The job fails on the first `xcodebuild`
  with an error that does not say "wrong operating system".
- **Running `fastlane` without `bundle exec`.** Different versions on different machines, and
  actions whose parameters do not match your `Fastfile`.
- **Not using `readonly: is_ci` with `match`.** A runner that can create certificates will, and
  you will hit Apple's certificate limit and invalidate your team's profiles.
- **Hard-coding the AAB or IPA path.** Adding a flavour changes it. Use
  `lane_context[SharedValues::GRADLE_AAB_OUTPUT_PATH]` and `build_app`'s return value.
- **Committing `fastlane/.env`.** It is where people put `MATCH_PASSWORD`. Ignore it, allow only
  `.env.default`, and keep that free of secrets.
- **Uploading metadata on every build.** Listing changes can trigger review. Use
  `skip_upload_metadata: true` on build lanes and a separate lane for text.
- **Granting the Play service account full production release rights for an internal-track lane.**
  Scope it to what the lane does.
- **Copying action parameters from a blog post.** Fastlane renames and deprecates parameters
  between releases. `fastlane action <name>` prints the truth for your version.
- **Leaving `skip_waiting_for_build_processing` off by default.** The job sits for up to an hour
  holding a macOS runner, which is the most expensive minute in your pipeline.

## Related topics

- [CI Pipelines](ci-pipelines.md) — the runners and secrets these lanes need.
- [Android Signing](android-signing.md) — the keystore the `gradle` action uses.
- [iOS Signing and Provisioning](ios-signing.md) — what `match` is solving.
- [AAB and Play Store Submission](play-store-submission.md) — tracks, rollout and the service account.
- [TestFlight and App Store Submission](app-store-submission.md) — what `upload_to_testflight` feeds.
- [Versioning Strategy](versioning.md) — where `BUILD_NUMBER` comes from.
- [Build Variants and Flavours](build-variants.md) — the flavour these lanes build.
- [Release Checklist](release-checklist.md) — what to verify before running the release lane.
