---
title: AAB and Play Store Submission
description: Build an Android App Bundle, test it locally with bundletool, and move it through Play Console tracks and a staged rollout without breaking production.
status: current
toolchain: cli
---

Google Play does not accept an APK for a new app. You upload an **Android App Bundle** (`.aab`),
Play generates the actual APKs for each device configuration, signs them with the app signing key
it holds, and delivers only the parts a given device needs.

That indirection is the source of most of the surprises on this page: the artefact you build is
not the artefact your users install, and you cannot test the delivered APK by installing the
bundle.

## Why the AAB exists

A traditional APK carries every density of every drawable, every ABI of every native library, and
every localisation, because it has to run on any device. A React Native app is a heavy example:
Hermes and the React Native native libraries ship for four ABIs.

Play splits the bundle into a base APK plus configuration APKs and sends the device only the ones
it can use. The typical saving on a React Native app is substantial, and it costs you nothing but
the inability to sideload the build directly.

| | APK | AAB |
| --- | --- | --- |
| Gradle task | `assembleProdRelease` | `bundleProdRelease` |
| Installable with `adb install` | Yes | No |
| Contains every ABI and density | Yes | Yes, but they are not all delivered |
| Signed by | You | You for upload; Play re-signs for delivery |
| Accepted for a new Play app | No | Yes |
| Useful for | Direct distribution, device farms, QA | The Play Store |

You still build APKs — for testers, for device farms, for anyone outside Play. You just do not
upload them.

## Building the bundle

```bash
cd android
./gradlew bundleProdRelease
```

The output is `android/app/build/outputs/bundle/prodRelease/app-prod-release.aab`. If you have no
product flavours it is `bundleRelease` and `app-release.aab`.

This task depends on a working release signing config. If it fails on the signature, fix that
first — see [Android Signing](android-signing.md).

> [!WARNING] `bundleRelease` and `assembleRelease` are different tasks
> `assembleRelease` produces an APK and does **not** produce an AAB. Running it and then hunting
> for a `.aab` under `outputs/apk/` is a common five-minute detour. The bundle is under
> `outputs/bundle/`.

## Testing the bundle before you upload it

An AAB cannot be installed. To test what Play will actually deliver, use **bundletool**, Google's
open-source tool that performs the same split locally.

```bash
# Generate the set of split APKs, signed with your upload key.
bundletool build-apks \
  --bundle=android/app/build/outputs/bundle/prodRelease/app-prod-release.aab \
  --output=build/app-prod-release.apks \
  --ks=android/app/awesomeapp-upload-key.keystore \
  --ks-key-alias=awesomeapp-upload

# Install onto the connected device the exact splits it would receive.
bundletool install-apks --apks=build/app-prod-release.apks

# What will a device actually download?
bundletool get-size total --apks=build/app-prod-release.apks
```

For a single installable file — a device farm, a tester with no Play access — build a universal
APK from the same bundle:

```bash
bundletool build-apks \
  --bundle=android/app/build/outputs/bundle/prodRelease/app-prod-release.aab \
  --output=build/universal.apks \
  --mode=universal \
  --ks=android/app/awesomeapp-upload-key.keystore \
  --ks-key-alias=awesomeapp-upload

unzip -o build/universal.apks -d build/universal
# build/universal/universal.apk is installable with adb install.
```

A universal APK contains everything and is therefore much larger than what Play delivers. Use it
for testing, never as a size measurement.

> [!NOTE] The signature in your local test is not the production signature
> `bundletool` signs with the key you pass it — your upload key. Play strips that and re-signs
> with the app signing key. Anything that depends on the certificate fingerprint (maps SDKs, app
> links, some auth flows) behaves differently in this local test than in production. Register
> Play's app signing fingerprint, not your upload fingerprint.

## Size limits

| Limit | Value |
| --- | --- |
| Compressed download size for one device, generated from the bundle | **200 MB** |
| Size at which users on mobile data see a large-download warning | 200 MB |
| Larger payloads | Play Feature Delivery and Play Asset Delivery |

The bundle file itself can be considerably larger than 200 MB; the limit applies to what a single
device downloads. A React Native app is rarely near it unless it ships bundled video or large
model files, which is exactly what Play Asset Delivery is for.

> [!NOTE] Confirm the current limits before you plan around them
> Play's size limits and the exceptions for base modules and asset packs have changed more than
> once. Check **Play Console Help → app size limits** for the values that apply on the day you
> need them rather than trusting a number in any document, including this one.

## Target API level

Play enforces a minimum `targetSdk` for new apps and updates, and it advances each year.

**From 31 August 2026, new apps and app updates must target Android 16 (API level 36) or higher.**
Existing apps must target API 35 or higher to stay available to new users on newer devices. An
extension to 1 November 2026 can be requested through the Play Console.

React Native 0.87.1's version catalog sets `targetSdk = "36"`, so a stock 0.87 project already
satisfies this. If you overrode `targetSdk` in `android/app/build.gradle`, check it:

```bash
grep -n "targetSdk" android/app/build.gradle android/build.gradle
```

> [!NOTE] The deadline moves every year
> The API level and the dates above were read from Google's target API level requirements page on
> 2026-09-12. Verify the current values before a release that is close to a deadline — Play
> rejects the upload outright, with no partial credit.

## First submission: what Play asks for

Creating the app in the Play Console is mostly form-filling, and the forms gate publication. Doing
them late is the most common reason a finished build sits unreleased.

| Section | What it needs | Gotcha |
| --- | --- | --- |
| Store listing | Title, short and full description, screenshots, feature graphic, 512 × 512 icon | Screenshots are required per form factor you declare support for |
| App access | Credentials for a reviewer if any part is behind a login | A missing test account is a guaranteed rejection |
| Content rating | A questionnaire | Answering it wrong is worse than answering it conservatively |
| Data safety | Every category of data you collect and share | Must match what your app and your SDKs actually do, including analytics and crash reporting |
| Ads | Whether the app contains ads | Includes ads served by an SDK you added for something else |
| Target audience | Age ranges | Declaring children brings a much stricter policy set |
| Privacy policy | A public URL | Required if you collect anything, which in practice is always |
| App category and contact details | | |

The **Data safety** form is the one that bites React Native apps specifically. A crash reporter
collects device identifiers; an analytics SDK collects usage data; a push SDK collects a token.
Each is a declaration you must make, and the declaration is checked against observed behaviour.
Audit your dependencies before you fill it in — see
[Dependency Auditing](../security/dependency-auditing.md).

## Tracks

Play has four release tracks. They differ in who can install, how fast a release goes out, and
whether a human reviews it.

| Track | Audience | Typical use |
| --- | --- | --- |
| **Internal testing** | Up to 100 testers you list by email | Fastest path to a real device. Minutes, not days |
| **Closed testing** | Named testers or Google Groups | QA and partner builds; supports multiple parallel tracks |
| **Open testing** | Anyone with the opt-in link | Public beta |
| **Production** | Everyone | The store |

Internal testing is the one to wire into CI. It is available within minutes of upload, it does not
wait on review, and it installs through the Play Store app — so testers exercise the same delivery
path as production, including the Play-signed APK.

Every upload to any track produces a **pre-launch report**: Play installs your build on a set of
physical devices, crawls it automatically, and reports crashes, ANRs, accessibility problems and
security warnings. Read it. It catches "crashes immediately on Android 13" before your users do.

## Staged rollout

A production release does not have to go to everyone at once.

1. Create the release on the **Production** track and set a rollout percentage — 5% or 10% is a
   common start.
2. Watch **Android vitals** — crash rate and ANR rate — plus your own crash reporting, for long
   enough to see real usage. Hours, not minutes.
3. Increase the percentage in steps. 10% → 25% → 50% → 100% over a few days is unremarkable.
4. If something is wrong, **halt the rollout**. Users who already updated keep the bad version,
   but nobody else receives it.

> [!WARNING] You cannot roll back a Play release
> Halting stops further distribution. It does not un-install the bad build from the users who
> already have it. The recovery is a **new release with a higher `versionCode`** containing the
> fix, rolled out at 100% — which means your fix has to be ready before you need it, not after.
> This asymmetry is the entire argument for staged rollouts.

Play's **managed publishing** setting is worth turning on alongside this: reviewed releases wait
for you to publish them explicitly, instead of going live the moment review finishes at 3am.

## Release notes

Each release carries "What's new" text per language. Keep a file per locale in the repository so
the text is reviewed like anything else, and so Fastlane can pick it up:

```text title=fastlane/metadata/android/en-US/changelogs/42.txt
- Fixed a crash when opening a shared link while signed out.
- Faster first load on slow connections.
```

The filename is the `versionCode`. There is a length limit per language — the Play Console shows
the remaining characters as you type, and an over-long changelog fails the upload rather than
truncating.

## Automating the upload

Uploading by hand is fine for the first release and a liability by the tenth. Fastlane's
`supply` action uploads an AAB, its changelogs and its screenshots, using a Google Play service
account JSON key:

```ruby title=fastlane/Fastfile (excerpt)
lane :internal do
  gradle(project_dir: 'android', task: 'bundle', build_type: 'ProdRelease')

  upload_to_play_store(
    track: 'internal',
    aab: '../android/app/build/outputs/bundle/prodRelease/app-prod-release.aab',
    skip_upload_apk: true,
    release_status: 'draft'
  )
end
```

The full setup, including the service account and how to keep its key out of the repository, is
on [Fastlane](fastlane.md).

## Common patterns

### Internal track on every merge to main

Build and upload to internal testing from CI on every merge. Testers always have the current
build, the pre-launch report runs continuously, and the release-day upload is a path you have
already exercised hundreds of times.

### Promote, do not rebuild

Play lets you promote an existing release from one track to the next. Promoting the exact artefact
that passed QA is materially safer than rebuilding from the same tag and hoping the inputs were
identical.

### Keep `versionCode` monotonic and automatic

Play rejects an upload whose `versionCode` is not higher than everything previously uploaded to
any track — including a build you forgot about on internal testing. Derive it from something
monotonic rather than editing it by hand. See [Versioning Strategy](versioning.md).

### Upload the mapping file with every release

R8 renames your Kotlin and Java classes, so production stack traces are unreadable without the
mapping file. Gradle produces it at
`android/app/build/outputs/mapping/prodRelease/mapping.txt` and Play accepts it as part of the
release. See [ProGuard and R8](proguard-and-r8.md).

## Common mistakes

- **Uploading an APK.** New apps must ship as an AAB. Wrong: `./gradlew assembleRelease` then
  uploading `app-release.apk`. Right: `./gradlew bundleProdRelease`.
- **Trying to `adb install` an `.aab`.** It is not an APK. Use `bundletool install-apks`, or build
  a universal APK for sideloading.
- **Measuring app size from a universal APK.** It contains every ABI and density. The number to
  quote is `bundletool get-size total`.
- **Registering the upload key fingerprint with a maps or auth SDK.** Play re-signs with its own
  key, so the production certificate is Play's. Take the fingerprint from **App integrity**.
- **Reusing a `versionCode`.** Play rejects it, including against builds on tracks you have
  forgotten. Never decrement, never reuse.
- **Filling in Data safety from memory.** It is checked against what your app does. An analytics
  or crash SDK you added months ago collects data you have to declare.
- **Publishing without a reviewer test account.** Anything behind a login needs credentials in
  **App access**, or review fails and you lose days.
- **Rolling out to 100% immediately.** There is no rollback. Staged rollout is the only mechanism
  you have for limiting the blast radius of a bad build.
- **Ignoring the pre-launch report.** It is a free crawl on real devices, and it routinely finds
  a crash on one OS version you did not test.
- **Forgetting the mapping file.** Production crashes arrive obfuscated and you cannot
  retroactively upload a mapping for a release you no longer have the build for.

## Related topics

- [Android Signing](android-signing.md) — the upload key, the app signing key, and which fingerprint to register.
- [ProGuard and R8](proguard-and-r8.md) — shrinking, and the mapping file this page tells you to upload.
- [Versioning Strategy](versioning.md) — `versionCode` rules Play enforces.
- [Build Variants and Flavours](build-variants.md) — which variant `bundleProdRelease` refers to.
- [Fastlane](fastlane.md) — automating upload, changelogs and promotion.
- [CI Pipelines](ci-pipelines.md) — building and uploading on every merge.
- [Bundle Size](../performance/bundle-size.md) — reducing what the AAB carries in the first place.
- [Dependency Auditing](../security/dependency-auditing.md) — knowing what your SDKs collect before you declare it.
- [Release Checklist](release-checklist.md) — the pre-upload pass.
