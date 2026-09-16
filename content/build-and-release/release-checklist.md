---
title: Release Checklist
description: An ordered, runnable checklist for shipping a React Native 0.87 release — versions, signing, store compliance, security and rollout — with links to the page that explains each step.
status: current
toolchain: cli
---

This page is a checklist, not an explanation. Every item says what to do, why it bites when you
skip it, and links to the page that covers it properly. Work top to bottom; the order is roughly
the order in which a mistake becomes expensive to fix.

Nothing here is React Native folklore. Each item is either a store rule, a signing property, or a
failure this handbook documents elsewhere with a reproduction.

## How to use it

Run it twice. Once a few days before the release, when there is still time to fix a signing or
compliance problem, and once immediately before you upload, when the only question is whether the
artefact in front of you is the one you tested.

The iOS half needs **macOS with Xcode**. There is no cross-platform path to an iOS archive, so a
team shipping to both stores needs a Mac or a hosted macOS runner before any of section 6 is
possible.

## 1. Code and dependency health

- [ ] **The branch builds and the tests pass locally**, not only on CI. A red pipeline on release
      day is a bad time to discover a flaky native test — see [CI for Mobile](../testing/ci-for-mobile.md).
- [ ] **No `console.log` left in a code path that runs in release.** Logs leak user data and
      survive into the shipped bundle. [Safe Logging in Release Builds](../security/safe-logging.md)
- [ ] **Dependencies audited.** `npm audit --omit=dev`, and a look at anything that changed since
      the last release. [Dependency Auditing](../security/dependency-auditing.md)
- [ ] **Every native dependency is New Architecture compatible.** "It installed" proves nothing on
      0.87. [Native Dependency Compatibility](../migration/native-dependency-compatibility.md)
- [ ] **Companion peer packages are installed**, not merely warned about. Reanimated 4 needs
      `react-native-worklets`; `react-native-mmkv` 4 needs `react-native-nitro-modules`. Both fail
      at runtime, not at install. [Troubleshooting](../reference/troubleshooting.md)
- [ ] **Lock files are committed and unchanged by the build.** `package-lock.json` and
      `ios/Podfile.lock` decide what CI installs. [Autolinking](../native-modules/autolinking.md)

## 2. Version numbers

- [ ] **`versionCode` is strictly greater than every code ever uploaded to any Play track** —
      including internal testing. Play rejects a duplicate outright.
- [ ] **`CFBundleVersion` is unique and increasing within the current short version string.**
- [ ] **The user-facing version is what you intend to call this release** in both stores and in
      your release notes.
- [ ] **One source of truth for all of them**, so the two platforms cannot drift.
      [Versioning Strategy](versioning.md)

```bash
# Read what is actually set, rather than what you remember setting.
grep -nE 'versionCode|versionName' android/app/build.gradle
grep -nE 'MARKETING_VERSION|CURRENT_PROJECT_VERSION' ios/*.xcodeproj/project.pbxproj | head
```

## 3. Configuration and environment

- [ ] **The release build points at production endpoints**, and the staging build does not point at
      production. [Environment Configuration](environment-configuration.md)
- [ ] **The right variant and scheme are selected.** A release signed correctly but built from the
      staging flavour is a real and common failure. [Build Variants and Flavours](build-variants.md)
- [ ] **No development-only network exception ships.** A cleartext-HTTP allowance added for a local
      server must not be in the release manifest or `Info.plist`.
      [Network Security Config and ATS](../security/network-security-config.md)
- [ ] **App icons and splash screens are the release assets** at every density, on both platforms.
      [App Icons and Splash Screens](icons-and-splash-screens.md)
- [ ] **Deep link registrations match the production domain** and are validated, not trusted.
      [Deep Link Validation](../security/deep-link-validation.md)

## 4. Security review

Do this before the build, because two of the items change the artefact.

- [ ] **No secrets in the bundle.** Not in `react-native-config`, not in a constant, not in a
      comment. Everything in the bundle is readable.
      [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md)
- [ ] **Credentials are in the Keychain / Keystore**, not in AsyncStorage.
      [Keychain and Keystore](../security/secure-storage-keychain-keystore.md)
- [ ] **Permissions are the minimum set the app actually uses.** Over-requesting is both a privacy
      problem and a review rejection. [Permissions Hygiene](../security/permissions-hygiene.md)
- [ ] **Any WebView is hardened** — origin allow-list, no file access, JavaScript off where
      possible. [WebView Hardening](../security/webview-hardening.md)
- [ ] **If you pin certificates, the backup pin is valid and the rotation date is in a calendar.**
      A pinned app bricks itself when the certificate rotates.
      [Certificate Pinning](../security/certificate-pinning.md)
- [ ] **R8 is on for the Android release build, and you know what it does and does not buy you.**
      [Obfuscation and Its Limits](../security/obfuscation.md)

```bash
# The check worth running every release: what strings survive into the artefact.
grep -rnE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"]" src/ | grep -v '\.test\.' | head
```

## 5. Android build

- [ ] **The release variant uses the release signing config**, not a fallback to the debug key.
- [ ] **The keystore and its passwords are not in the repository**, now or in its history.
      [Android Signing](android-signing.md)
- [ ] **`targetSdk` meets Play's current requirement.** It advances every year and Play rejects the
      upload with no partial credit. [AAB and Play Store Submission](play-store-submission.md)
- [ ] **R8 keep rules cover anything reflective** that your app or a dependency needs.
      [ProGuard and R8](proguard-and-r8.md)
- [ ] **`mapping.txt` is archived with the build**, or your release crash reports are unreadable.

```bash
cd android

# 1. Which key does each variant actually use?
./gradlew signingReport

# 2. Build the artefacts.
./gradlew bundleRelease      # AAB — what you upload
./gradlew assembleRelease    # APK — for direct testing

# 3. Confirm the APK carries the certificate you expect.
$ANDROID_HOME/build-tools/37.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

## 6. iOS build — macOS only

- [ ] **Pods are installed from the committed lock file**, with no unexpected drift.
- [ ] **The archive is signed with a distribution certificate and the right provisioning profile.**
      [iOS Signing and Provisioning](ios-signing.md)
- [ ] **Certificates and profiles do not expire before your next release.** Check the dates, not
      your memory.
- [ ] **`ITSAppUsesNonExemptEncryption` is declared in `Info.plist`**, or every upload sits waiting
      for a manual answer. [TestFlight and App Store Submission](app-store-submission.md)
- [ ] **`PrivacyInfo.xcprivacy` reflects what the app and its dependencies actually do.** Apple
      rejects builds over this.
- [ ] **Every permission the app requests has a usage-description string** that explains the real
      reason. A missing string is a rejection; a vague one is a slower rejection.
- [ ] **The dSYM is kept**, not just the IPA. Without it, release crash reports are hex addresses.
      [Reading a Release Stack Trace](../debugging/release-stack-traces.md)

```bash
cd ios
bundle install
bundle exec pod install

# Confirm the lock file did not change. If it did, find out why before shipping.
git diff --exit-code Podfile.lock || echo "Podfile.lock changed — investigate"
```

## 7. Store metadata and compliance

The forms gate publication, and doing them late is the most common reason a finished build sits
unreleased.

- [ ] **Play Data safety form** matches what the app collects, including what your SDKs collect.
- [ ] **App Store privacy nutrition labels** likewise.
- [ ] **Content rating questionnaires** completed on both stores.
- [ ] **Screenshots for every required device size**, current with the UI you are shipping.
- [ ] **Release notes written** — for humans, and in every locale you list.
- [ ] **Test account credentials provided to review** if any part of the app is behind a login.
      Missing credentials is the single most common avoidable rejection.
      [TestFlight and App Store Submission](app-store-submission.md) ·
      [AAB and Play Store Submission](play-store-submission.md)

## 8. Test the artefact you are actually shipping

Not a debug build. Not yesterday's build. This one.

- [ ] **Install the release artefact on a real device** — the AAB through a Play internal track, the
      IPA through TestFlight. Emulator behaviour differs in exactly the areas that break in release.
- [ ] **Cold start the app** with no previous install and no cached data.
- [ ] **Exercise every native permission flow**, granting and denying.
- [ ] **Test an upgrade over the previous version**, not just a clean install. Migration bugs in
      persisted state only appear on upgrade.
- [ ] **Test offline and on a slow network.**
- [ ] **Confirm R8 did not strip something you need.** A reflective call that works in debug and
      crashes in release is the classic shape. [ProGuard and R8](proguard-and-r8.md)
- [ ] **Check startup time against the previous release**, rather than trusting that it is fine.
      [Startup Time](../performance/startup-time.md)

## 9. Observability, before the rollout rather than after

- [ ] **Crash reporting is initialised in the release build** and you have seen a test crash arrive.
- [ ] **Source maps and `mapping.txt` for this exact build are uploaded** to wherever you read
      stack traces. [Source Maps](../debugging/source-maps.md)
- [ ] **You know what "normal" looks like** — the crash-free rate of the previous release — so you
      can tell whether this one is worse.

## 10. Rollout

- [ ] **Staged, not all at once.** Play's staged rollout and App Store phased release both let you
      stop. Use them. Halting at 1% is the cheapest insurance in this list.
- [ ] **Someone is watching** the crash rate and the reviews for the first few hours.
- [ ] **You know your rollback move before you need it.** On Play, halt the rollout; on the App
      Store, pause the phased release. Neither un-installs a bad build from the devices that already
      have it, which is the point of going slowly.
- [ ] **No over-the-air update is expected to save you.** OTA can replace the JavaScript bundle
      only; a native bug needs a new build regardless.
      [Over-the-Air Updates](over-the-air-updates.md)

## 11. After it is out

- [ ] **Tag the commit** with the exact version you shipped.
- [ ] **Archive the build artefacts**, the `mapping.txt`, the dSYMs and the source maps together.
      A release you cannot symbolicate is a release you cannot debug.
- [ ] **Write down what went wrong** and turn it into an item on this checklist. That is where most
      of the items above came from.

## A single pre-flight script

Everything mechanical from the sections above, in one place. Run it from the repository root. It
checks; it does not fix.

```bash
#!/usr/bin/env bash
set -u

echo "== toolchain =="
node --version              # must satisfy ^22.13.0 || ^24.3.0 || >= 26.0.0
npx react-native --version  # prints the CLI's version (20.2.0), not React Native's
node -p "require('react-native/package.json').version"

echo "== no global CLI shadowing the local one =="
npm ls -g --depth=0 2>/dev/null | grep -E 'react-native-cli|@react-native-community/cli' \
  && echo "FAIL: uninstall the global CLI" || echo "OK"

echo "== versions =="
grep -nE 'versionCode|versionName' android/app/build.gradle

echo "== secrets =="
grep -rnE "(api[_-]?key|secret|password)\s*[:=]\s*['\"]" src/ | grep -v '\.test\.' \
  && echo "FAIL: review the matches above" || echo "OK"

echo "== keystores are not tracked, now or historically =="
git log --all --diff-filter=A --name-only --pretty=format: | sort -u \
  | grep -iE '\.(keystore|jks|p12)$' && echo "FAIL" || echo "OK"

echo "== committed gradle.properties holds no credentials =="
grep -iE 'password|storeFile|keyAlias' android/gradle.properties && echo "FAIL" || echo "OK"

echo "== lock files are committed =="
git ls-files --error-unmatch package-lock.json ios/Podfile.lock >/dev/null 2>&1 \
  && echo "OK" || echo "FAIL: commit the lock files"

echo "== dependency audit (production only) =="
npm audit --omit=dev || true

echo "== type check and tests =="
npx tsc --noEmit
npm test -- --ci
```

Wire it into CI as a required job rather than remembering to run it. The version of this checklist
that runs automatically is the one that stays accurate. [CI Pipelines](ci-pipelines.md)

## Common mistakes

- **Running the checklist after building.** Half of it changes the artefact. A version bump or a
  signing fix discovered after the archive means rebuilding and retesting everything.
- **Testing a debug build and shipping a release build.** R8, a different signing key, a different
  endpoint and a bundled rather than served JavaScript bundle all differ. The build you test must
  be the build you ship.
- **Reusing a `versionCode`.** Play rejects the upload. It counts codes used on *any* track,
  including an internal test you forgot about.
- **Shipping the development network exception.** A cleartext allowance added for a local API
  reaches production and quietly downgrades every user's connection.
  [Network Security Config and ATS](../security/network-security-config.md)
- **Discovering an expired provisioning profile on release day.** Certificates and profiles expire
  on a schedule you can read months in advance. [iOS Signing and Provisioning](ios-signing.md)
- **Uploading without a review test account.** The build sits in review for days and comes back
  rejected for a reason that took thirty seconds to fix.
- **Skipping the upgrade test.** Clean installs pass; the users who already have your app hit a
  migration bug in persisted state that nobody exercised.
- **Rolling out to 100% because the release "is small".** Every incident report begins that way.
- **Losing the `mapping.txt` or the dSYM.** The crashes arrive; you cannot read any of them.
- **Planning to fix it with an OTA update.** OTA replaces JavaScript and assets only, and if the
  problem is native it cannot help. [Over-the-Air Updates](over-the-air-updates.md)

## Related topics

- [Android Signing](android-signing.md) — the keys, and how not to lose or leak them.
- [iOS Signing and Provisioning](ios-signing.md) — certificates, profiles and expiry.
- [AAB and Play Store Submission](play-store-submission.md) — target API level, tracks, staged rollout.
- [TestFlight and App Store Submission](app-store-submission.md) — export compliance, privacy manifest, review.
- [Versioning Strategy](versioning.md) — the five numbers and one source of truth.
- [Build Variants and Flavours](build-variants.md) — making sure you built the right one.
- [Environment Configuration](environment-configuration.md) — pointing a release at production.
- [ProGuard and R8](proguard-and-r8.md) — the release-only failures and `mapping.txt`.
- [CI Pipelines](ci-pipelines.md) — running this checklist automatically.
- [Fastlane](fastlane.md) — automating the build and the upload.
- [Over-the-Air Updates](over-the-air-updates.md) — what you can and cannot fix after shipping.
- [Threat Model](../security/threat-model.md) — the security section of this list, in context.
- [Troubleshooting](../reference/troubleshooting.md) — when a step here fails.
