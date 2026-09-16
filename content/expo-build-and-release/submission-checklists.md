---
title: Submission Checklists
description: Concrete pre-submission checks for an Expo SDK 57 release — build and version checks, security scans, native configuration, and the per-store items that most often cause a rejection or a bad release.
status: current
toolchain: expo
sdk: 57
---

A submission checklist exists to catch the mistakes that are cheap before upload and expensive
after: a spent build number, a staging URL in production, a secret in the bundle, a permission string
that fails review, an update channel pointing at the wrong branch.

Each item below is something you can **check with a command or a specific screen**, not a reminder
to "make sure it works". Copy the lists into your release process and delete what does not apply.

## Why it exists / when to use it — and when NOT to

Run through this for every store submission. For JavaScript-only changes shipped as an EAS Update,
use the shorter update checklist at the end.

The store review guidelines are long and change. This page does not restate them; it lists the
technical checks an Expo project controls, and points at where the stores' own rules live.

## Basic example

A script that automates the checks which can be automated:

```bash title=scripts/pre-submit.sh
#!/usr/bin/env bash
set -euo pipefail

echo "1. Clean install from lockfile"
npm ci

echo "2. SDK 57 alignment"
npx expo install --check

echo "3. Project health"
npx expo-doctor

echo "4. Type check"
npx tsc --noEmit

echo "5. Known vulnerabilities in shipped dependencies"
npm audit --omit=dev --audit-level=high

echo "6. Resolved public config for production"
APP_VARIANT=production npx expo config --type public > /tmp/public-config.json
grep -E '"(bundleIdentifier|package|version|runtimeVersion)"' /tmp/public-config.json

echo "7. Credential-shaped strings in the exported bundle"
rm -rf dist
npx expo export --platform all
if grep -r -a -q -i -E "sk_live|sk_test|AKIA|BEGIN (RSA|EC|PRIVATE)" dist/; then
  echo "credential-shaped string found in bundle"; exit 1
fi

echo "8. Staging hosts must not appear in a production bundle"
if grep -r -a -q -E "staging\.|localhost|10\.0\.2\.2" dist/; then
  echo "non-production host found in bundle"; exit 1
fi

echo "pre-submit checks passed"
```

Adjust the host patterns in step 8 to your own staging domains. Step 8 in particular catches a
mistake no store review will catch for you.

## How it works

### Build and version

- [ ] `version` is set to this release. `autoIncrement` does not change it.
- [ ] Build numbers are managed: `cli.appVersionSource: "remote"` with `autoIncrement: true`, or a
      manual bump you have checked is higher than the last **upload** (not the last release).
- [ ] `runtimeVersion` policy is what you intend. If it is `"appVersion"` and this release changes
      native code, `version` changed too.
- [ ] The build profile is `production`: `distribution` is not `"internal"`, `developmentClient` is
      not `true`.
- [ ] The production profile's `channel` is `production`. Check the built binary, not only
      `eas.json`, by surfacing `Updates.channel` on a debug screen of a release build.
- [ ] `eas.json` `cli.version` is pinned.

See [Versioning and Runtime Versions](versioning.md) and
[Build Profiles per Environment](environments.md).

### Security

- [ ] Bundle scan (step 7) is clean. See [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md).
- [ ] Every `EXPO_PUBLIC_` variable is public by design. See
      [EXPO_PUBLIC_ Variables](../expo-security/expo-public-env-vars.md).
- [ ] No signing keys, `.p8`, keystores or service account JSON in git history:
      `git log --all --full-history --name-only -- '*.p8' '*.jks' '*.keystore' '*service-account*.json' '*private-key.pem'`
      prints nothing.
- [ ] Tokens are in `expo-secure-store`, not AsyncStorage. See
      [expo-secure-store vs AsyncStorage](../expo-security/secure-store-vs-asyncstorage.md).
- [ ] Deep link handlers that navigate or open URLs use an allow-list. See
      [Deep Link Validation](../expo-security/deep-link-validation.md).
- [ ] If you use update signing, the build embeds `updates.codeSigningCertificate`. See
      [EAS Update Signing](../expo-security/update-signing.md).

### Native configuration

- [ ] Declared permissions match shipped features: `apkanalyzer manifest permissions` on the Android
      artifact, and `UsageDescription` keys in the iOS `Info.plist`. See
      [Permissions Hygiene](../expo-security/permissions-hygiene.md).
- [ ] Every usage description explains the purpose in the user's terms.
- [ ] Icons checked on device in light, dark and tinted/themed modes. See
      [App Icons and Splash Screens](icons-and-splash-screens.md).
- [ ] Splash screen hides on both success and error paths.
- [ ] `ios.bundleIdentifier` and `android.package` are the production identifiers and have never
      changed since first release.

### Behaviour on a release build

Test on an installed **release** artifact, not a development build — development builds load code
from a dev server and behave differently.

- [ ] Cold start on a slow network. Offline start.
- [ ] Sign in, sign out, and sign in after reinstall.
- [ ] A deep link from outside the app lands on the right screen when the app is closed and when it
      is running.
- [ ] Denying each permission leaves the app usable.
- [ ] Crash reporting receives a test event from the release build, with readable stack traces. See
      [Monitoring](monitoring.md).

## Platform differences

:::tabs
@tab iOS
- [ ] Building requires macOS with Xcode, or a hosted build such as EAS Build (Expo account, paid
      with a free tier).
- [ ] Encryption export compliance is answered. `ios.config.usesNonExemptEncryption` in the app
      config sets `ITSAppUsesNonExemptEncryption` in `Info.plist` (verified in the SDK 57 config
      types), which avoids answering the question manually for each build. Set it to the value that
      is true for your app.
- [ ] App Privacy answers in App Store Connect cover every SDK. Privacy manifest information is
      present for the SDKs that need it (`ios.privacyManifests` is available in the config types).
- [ ] If the app lets users create an account, check Apple's current App Review Guidelines on account
      deletion and on sign-in options, and confirm the app meets them.
- [ ] A demo account and review notes are provided if features are behind sign-in.
- [ ] TestFlight build installed and smoke-tested before submitting for review.
@tab Android
- [ ] The artifact is an **AAB** (`buildType: "app-bundle"`, the store default), not an APK.
- [ ] The first release of a new app is uploaded manually in the Play Console; automation works from
      the second release. See [EAS Submit](../expo-eas/submit.md).
- [ ] The app meets Google Play's current target API level requirement. Check the Play Console
      policy status page for the date and level that apply to your update.
- [ ] Data safety form covers every SDK.
- [ ] Sensitive permissions (for example background location) have their Play Console declaration
      completed, or have been removed.
- [ ] Upload key is backed up and you know whether Play App Signing is enabled. See
      [Credentials Management](../expo-eas/credentials.md).
- [ ] Internal testing track install smoke-tested before promoting.
:::

## Common patterns

### The update checklist

For a JavaScript-only change shipped with EAS Update:

- [ ] The change touches no native code, config plugins, permissions or app config native fields.
      See [What OTA Updates May Not Change](../expo-eas/ota-limits-and-policy.md).
- [ ] Published to the branch that the target channel points at: `eas channel:view production`.
- [ ] The runtime version matches the installed binaries you intend to reach.
- [ ] Signed with `--private-key-path` if the builds enforce signing.
- [ ] Published with `--rollout-percentage` first for anything non-trivial. See
      [Staged Rollouts](staged-rollouts.md).
- [ ] A rollback plan is written before publishing. See [Rollback Strategy](rollback-strategy.md).

### Make one person own the release

Checklists work when a named person ticks them. Put the checklist in the release pull request or
ticket so the ticks have an author and a timestamp.

## Common mistakes

- **Testing on a development build.** It loads JavaScript from a dev server and includes the dev
  client. Test the release artifact.
- **Checking `eas.json` instead of the binary.** Surface `Updates.channel` and the version on a debug
  screen of the build you are about to submit.
- **Submitting an APK to Google Play.** Use an AAB.
- **Assuming the store's automated checks catch a staging URL.** They do not. Scan the bundle.
- **Answering privacy forms from memory.** Inventory SDKs from `package.json`.
- **Submitting on a Friday without a rollback plan.** Phased releases and update rollbacks help only
  if someone is watching. See [Monitoring](monitoring.md).
- **Relying on this page for store policy.** Store rules change; read the current guidelines for the
  items marked above.

## Related topics

- [EAS Submit](../expo-eas/submit.md) — uploading the build once the checks pass.
- [App Store Metadata](store-metadata.md) — listing and privacy disclosures.
- [Versioning and Runtime Versions](versioning.md) — the version checks above.
- [Staged Rollouts](staged-rollouts.md) — what to do after approval.
- [Monitoring](monitoring.md) — confirming the release is healthy.
- [Dependency Auditing](../expo-security/dependency-auditing.md) — the dependency checks in the script.
