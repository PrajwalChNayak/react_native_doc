---
title: TestFlight and App Store Submission
description: Upload a signed archive, distribute it through TestFlight, and get through App Review — including the privacy manifest and permission strings that reject React Native apps.
status: current
toolchain: cli
---

Once you have a signed archive, everything else is App Store Connect: upload the build, let Apple
process it, hand it to testers through TestFlight, and eventually submit it for review.

The mechanics are straightforward. What catches React Native teams is the metadata — the privacy
manifest, the permission usage strings, the export compliance answer, and the App Privacy
questionnaire. Those reject builds far more often than code does.

> [!WARNING] This page requires macOS
> Archiving and uploading an iOS build require Xcode's toolchain, which runs only on macOS. There
> is no supported route from Windows or Linux. Everything from "build the archive" onwards needs a
> Mac or a hosted macOS CI runner. Managing metadata and releases in App Store Connect is a web
> interface and works from anywhere; producing the binary does not.

## The path a build takes

```text
Xcode archive  →  export .ipa  →  upload  →  App Store Connect processing
                                                   ↓
                                        TestFlight: internal testers
                                                   ↓
                                   Beta App Review → external testers
                                                   ↓
                                          App Review → release
```

Each arrow is a place things stop. Processing can reject an upload outright for a missing icon or
an invalid entitlement. Beta App Review gates external TestFlight testers, not internal ones. App
Review gates the store.

## Building the archive

```bash
cd ios

xcodebuild -workspace AwesomeApp.xcworkspace \
           -scheme "AwesomeApp" \
           -configuration "Release" \
           -destination "generic/platform=iOS" \
           -archivePath build/AwesomeApp.xcarchive \
           archive

xcodebuild -exportArchive \
           -archivePath build/AwesomeApp.xcarchive \
           -exportOptionsPlist ExportOptions.plist \
           -exportPath build/export
```

Signing details, including `ExportOptions.plist`, are on
[iOS Signing and Provisioning](ios-signing.md).

One React Native specific point: the **JavaScript bundle is produced by a build phase inside the
Xcode project**, so a Release archive contains a bundled, Hermes-compiled JavaScript payload
rather than a Metro connection. If the archive builds but the app shows a red screen about a
missing bundle, that build phase is what to look at — not the archive settings.

## Uploading

| Route | Good for | Notes |
| --- | --- | --- |
| **Xcode Organizer** → Distribute App | The first upload, and one-offs | Shows validation errors in a readable form |
| **Transporter** (Mac App Store app) | Uploading an `.ipa` someone else built | No Xcode project required |
| **Fastlane** `upload_to_testflight` | Everything repeatable | Uses the App Store Connect API key; see [Fastlane](fastlane.md) |

> [!NOTE] `xcrun altool` flags have moved
> Command-line uploads through `xcrun altool` still exist, but the flags have changed across Xcode
> releases — `--upload-app` has been superseded by `--upload-package`, and the authentication
> options differ depending on whether you pass an API key or an Apple ID. Run
> `xcrun altool --help` on the Xcode version you actually have before scripting it, and prefer
> Fastlane or Transporter for anything you intend to keep.

After upload, App Store Connect **processes** the build. This takes anywhere from a few minutes to
an hour or so, and the build does not appear in TestFlight until it completes. A processing
failure arrives by email, usually naming a missing icon size, an invalid bundle identifier, or a
disallowed entitlement.

## Export compliance

Every build is asked whether it uses encryption. Left unanswered, each upload sits waiting for you
to click a button in App Store Connect before it reaches testers.

If your app only uses HTTPS — which is nearly every React Native app — declare that once in
`Info.plist` and never see the prompt again:

```xml title=ios/AwesomeApp/Info.plist
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

> [!WARNING] This is a legal declaration, not a checkbox
> `false` means your app uses no non-exempt encryption. Standard HTTPS and the platform's own
> cryptography are exempt. If you implement your own encryption, or ship a cryptography library
> for something beyond transport security, the answer may be different and there may be
> documentation requirements. If you are unsure, answer it in App Store Connect with someone who
> can make that determination rather than hard-coding `false` to silence the prompt.

## The privacy manifest

Since 2024, Apple requires a **privacy manifest** — `PrivacyInfo.xcprivacy` — declaring the data
your app collects and the reason it calls certain "required reason" APIs. This is enforced at
upload: a build that uses a required-reason API with no declared reason is rejected by App Store
Connect with an email, not by review.

React Native 0.87's template already ships one, and it is worth reading because it shows the
shape:

```xml title=ios/AwesomeApp/PrivacyInfo.xcprivacy (as generated by 0.87.1)
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyTracking</key>
    <false/>
</dict>
</plist>
```

Those three API categories are what React Native's own code touches. `NSPrivacyCollectedDataTypes`
is empty because the framework collects nothing — **your** app almost certainly does, and that
array is yours to fill in.

Third-party SDKs on Apple's designated list must ship their own manifests, and the app's manifest
plus every bundled one are aggregated at build time. React Native 0.87 ships manifests for its
own components and several of its vendored dependencies; check your other native dependencies:

```bash
# Which of your native dependencies ship a privacy manifest?
find node_modules -name "PrivacyInfo.xcprivacy" | sed 's|/[^/]*$||' | sort -u
```

A dependency on Apple's list that ships no manifest is a problem you have to raise with its
maintainer — or replace.

> [!NOTE] The required-reason API list and the SDK list both change
> Apple adds categories and adds SDKs to the list that must provide manifests and signatures.
> Verify the current requirements in Apple's developer documentation before a release, especially
> if you have added native dependencies since the last one.

## Permission usage strings

This is the most common App Review rejection for React Native apps, and it is entirely avoidable.

Every permission your app requests needs a usage description string in `Info.plist`, and the
string must explain **what your app does with the data**, specifically. "This app needs camera
access" is rejected. "Used to scan the barcode on your membership card" is not.

```xml title=ios/AwesomeApp/Info.plist
<key>NSCameraUsageDescription</key>
<string>Used to scan the barcode on your membership card when you check in.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to attach a photo to a support request.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to show delivery vehicles near your address while an order is active.</string>
```

Two traps specific to React Native:

- **The 0.87 template ships an empty `NSLocationWhenInUseUsageDescription`.** An empty string is
  worse than a missing one: the permission dialog appears with no explanation. Fill it in or
  delete the key.
- **A native dependency can add a permission you never use.** If a library links a framework that
  triggers a permission prompt, the string is required even though your product never asks. Audit
  what your dependencies pull in — see [Permissions Hygiene](../security/permissions-hygiene.md).

## TestFlight

| | Internal testers | External testers |
| --- | --- | --- |
| Who | Members of your App Store Connect team | Anyone, by email or public link |
| Limit | Up to 100 team members | Up to 10,000 |
| Review | None | **Beta App Review** for the first build of each version |
| Availability | As soon as processing completes | After beta review passes |

Internal testing is the fast path and should be wired into CI: every merge to your release branch
produces a build your team can install within the hour, through the same delivery mechanism as
the store.

A TestFlight build expires **90 days** after upload. That is a feature — it stops testers running
a build from last quarter and reporting bugs you fixed in March — but it means an app you only
release twice a year needs periodic TestFlight uploads anyway.

Add "What to Test" notes with every build. Testers who are not told what changed test the home
screen again.

## App Review

Submitting for review asks for a few things that are easy to get wrong in a hurry:

| Field | What it needs |
| --- | --- |
| **Sign-in required** | A working demo account, if any part of the app is behind a login |
| **Notes for review** | How to reach the feature you changed, any special setup, why a permission is needed |
| **Contact information** | A person who will answer within a day |
| **App Privacy** | The data collection questionnaire, per data type, for your app and its SDKs |
| **Age rating** | A questionnaire |
| **Screenshots** | Per required device size, matching what the app actually looks like |

The rejections React Native apps hit most:

- **Guideline 5.1.1 — permission strings.** Vague or missing usage descriptions. Covered above.
- **Guideline 2.1 — crashes on review.** The reviewer uses a device configuration you did not
  test, often with no network or a restricted account. A crash on a cold launch with no session
  is the classic case.
- **Guideline 4.2 — minimum functionality.** An app that is a thin wrapper around a website. A
  React Native app that is mostly a `WebView` is squarely in this territory.
- **Guideline 2.3 — accurate metadata.** Screenshots that do not match the app, or a description
  promising features that are not in the build.
- **Demo account missing or broken.** Check the credentials yourself, on a fresh install, before
  submitting.

> [!TIP] Reply in Resolution Center rather than resubmitting blindly
> If you believe a rejection is a misunderstanding, answer it in the Resolution Center with a
> concrete explanation, a screen recording, or a pointer to the relevant screen. Resubmitting the
> same build with no reply generally gets the same rejection, a week later.

## Releasing

Once approved, you control when it goes live:

| Option | Behaviour |
| --- | --- |
| **Manually release** | Approved builds wait for you to press a button |
| **Automatically release** | Goes live as soon as review passes, whenever that is |
| **Scheduled** | Goes live at a date and time you set |
| **Phased release** | Rolls out to a growing share of existing users over seven days |

**Phased release** is the App Store's equivalent of a staged rollout: an approved update reaches a
small percentage of users who have automatic updates on, growing daily over a week. You can pause
it, and you can release to everyone at once.

> [!WARNING] Phased release is not a rollback
> Pausing stops further automatic distribution. Users who already updated keep the version they
> have, and anyone who taps Update in the App Store gets it regardless of the phase. The only real
> recovery is a new build through review — which is why **expedited review** exists and why you
> should know how to request it *before* you need it.

Manual release plus phased release is the combination most teams settle on: approval does not
surprise you at 3am, and the rollout is gradual once you do press the button.

## Common patterns

### Upload to TestFlight from CI on every merge

The upload path is the part of the release that fails, and the way to stop it failing on release
day is to run it constantly. See [CI Pipelines](ci-pipelines.md).

### Keep release metadata in the repository

Fastlane's `deliver` reads descriptions, keywords, release notes and screenshots from
`fastlane/metadata/`. Putting them in git means the App Store text goes through review like
everything else, and you can see who changed the keywords and when.

### Archive the `.dSYM` with every build

Without it, crash reports from TestFlight and the App Store are addresses rather than functions.
Set `uploadSymbols` in your export options, and keep the archive.

### Submit the version bump before you need it

`CFBundleVersion` must increase for every upload to the same `CFBundleShortVersionString`. Automate
it rather than discovering a duplicate at upload time — see
[Versioning Strategy](versioning.md).

## Common mistakes

- **Expecting to upload from Windows or Linux.** Producing the archive requires Xcode. App Store
  Connect's web interface works anywhere; the build does not.
- **Leaving the template's empty `NSLocationWhenInUseUsageDescription`.** An empty usage string
  produces a permission dialog with no explanation and is a review rejection. Fill it in or remove
  the key.
- **Writing generic permission strings.** "This app needs camera access" is rejected under 5.1.1.
  Say what the data is used for, in the user's terms.
- **Ignoring the privacy manifest.** A required-reason API with no declared reason is rejected at
  upload, by email, before any human sees the build.
- **Not answering export compliance in `Info.plist`.** Every upload then waits for a manual click
  before testers can install it.
- **Submitting without a working demo account.** Review cannot get past your login screen, and you
  lose the review cycle.
- **Assuming a TestFlight build lasts forever.** Builds expire after 90 days.
- **Treating phased release as a rollback mechanism.** It limits new automatic updates and nothing
  else. Recovery requires a new approved build.
- **Uploading a build with the same `CFBundleVersion`.** App Store Connect rejects it immediately.
- **Forgetting `uploadSymbols`, or discarding the archive.** Crash reports become unreadable and
  cannot be fixed retroactively.

## Related topics

- [iOS Signing and Provisioning](ios-signing.md) — producing the signed archive this page uploads.
- [Versioning Strategy](versioning.md) — `CFBundleShortVersionString` and `CFBundleVersion` rules.
- [Fastlane](fastlane.md) — `gym`, `pilot` and `deliver` for everything on this page.
- [CI Pipelines](ci-pipelines.md) — the macOS runner an iOS job requires.
- [AAB and Play Store Submission](play-store-submission.md) — the Android counterpart.
- [Permissions Hygiene](../security/permissions-hygiene.md) — auditing what your dependencies request.
- [Crash Reporting](../debugging/crash-reporting.md) — symbolication and the `.dSYM`.
- [Over-the-Air Updates](over-the-air-updates.md) — what you may and may not change without review.
- [Release Checklist](release-checklist.md) — the pre-submission pass.
