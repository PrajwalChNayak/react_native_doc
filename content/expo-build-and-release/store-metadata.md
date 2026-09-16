---
title: App Store Metadata
description: Store listings for an Expo app — what lives in the binary versus the store console, EAS Metadata's store.config.json for the App Store (beta, App Store only), and the privacy disclosures both stores require.
status: current
toolchain: expo
sdk: 57
---

A store listing is everything a user sees before installing: name, subtitle, description, keywords,
screenshots, the privacy disclosures, support and privacy policy URLs, age rating and category.
Almost none of it is in your binary. It lives in App Store Connect and the Google Play Console, and
it is reviewed alongside the build.

This page separates what your app config controls from what the stores control, and covers the one
Expo tool for managing listings as files: **EAS Metadata**, which today supports the Apple App Store
only and is in beta.

## Why it exists / when to use it — and when NOT to

Read this before your first submission, and whenever a listing change needs review or has to match
a release.

Consider EAS Metadata when you want App Store listing text in version control, reviewed in pull
requests, and pushed from the command line. Do not adopt it for Google Play — Expo's documentation
states the Google Play Store is not implemented — and weigh its beta status before making it the
only copy of your listing.

## Basic example

### What the binary contributes

| Listing item | Comes from |
| --- | --- |
| App name under the icon | `name` in the app config |
| In-app icon | `icon`, `ios.icon`, `android.adaptiveIcon` — see [App Icons and Splash Screens](icons-and-splash-screens.md) |
| Version shown on the listing | `version` |
| Permissions and usage descriptions | Native config — see [Permissions Hygiene](../expo-security/permissions-hygiene.md) |

Everything else — store title, description, screenshots, privacy answers — is entered in the store.

### EAS Metadata for the App Store

`store.config.json` at the project root. This is the minimal example from Expo's documentation:

```json title=store.config.json
{
  "configVersion": 0,
  "apple": {
    "info": {
      "en-US": {
        "title": "Awesome App",
        "subtitle": "Your self-made awesome app",
        "description": "The most awesome app you have ever seen",
        "keywords": ["awesome", "app"],
        "marketingUrl": "https://example.com/en/promo",
        "supportUrl": "https://example.com/en/support",
        "privacyPolicyUrl": "https://example.com/en/privacy"
      }
    }
  }
}
```

```bash
# First time: pull what App Store Connect already has, so you start from the live listing
eas metadata:pull

# After editing the file
eas metadata:push
```

Expo documents built-in validation that runs before anything is sent to the store, which catches
some listing problems without waiting for review.

If the file is not at the default location, point `eas submit` at it with the verified `metadataPath`
field on the iOS submit profile:

```json title=eas.json
{
  "submit": {
    "production": {
      "ios": {
        "metadataPath": "./store/store.config.json"
      }
    }
  }
}
```

> [!WARNING] Beta, App Store only
> Expo's documentation states EAS Metadata is in beta and subject to breaking changes, and that Google
> Play is not implemented. Keep your Play listing in the Play Console, and pin `cli.version` in
> `eas.json` so a CLI upgrade does not change metadata behaviour under you.

EAS Metadata commands require an Expo account and App Store Connect access. EAS is a paid service
with a free tier; check [Costs and Limits](../expo-eas/costs-and-limits.md) for what applies.

## How it works

### Pull first, then push

`eas metadata:pull` writes the current App Store Connect listing into the file. Starting from an empty
file and pushing risks overwriting fields someone set in the dashboard. After the first pull, treat
the file as the source of truth and make changes there, or run a pull again after any dashboard edit.

### Dynamic config

Expo documents a `store.config.js` alternative, evaluated in Node.js, for content that should be
computed:

```js title=store.config.js
const config = require('./store.config.json');

const year = new Date().getFullYear();
config.apple.copyright = `${year} Acme, Inc.`;

module.exports = config;
```

Keep it deterministic. A config that fetches remote content makes the pushed listing depend on
something outside the repository.

### Privacy disclosures are metadata too — and they are checked

Both stores require you to declare what data your app collects and why:

- **App Store Connect:** the App Privacy section, plus privacy manifest information in the binary for
  your app and for third-party SDKs that declare it. `ios.privacyManifests` exists in the SDK 57
  config types.
- **Google Play Console:** the Data safety form.

These answers must cover **every SDK in the app**, not only your own code. Crash reporting,
analytics and advertising SDKs collect data on their own. Inventory them from `package.json` and
from each SDK's documentation before answering.

A mismatch between what you declare and what the app does is a review and policy problem, and it is
the part of the listing that most often needs engineering input.

## Platform differences

:::tabs
@tab iOS
- Listing text, keywords, screenshots and App Privacy answers live in App Store Connect, per locale.
- EAS Metadata can manage the text fields shown above from `store.config.json`.
- Screenshots are required for the device classes you support; upload them in App Store Connect.
- Changes to some listing fields are reviewed with the next version submission.
@tab Android
- Listing text, graphics and the Data safety form live in the Google Play Console.
- The Play Store icon and feature graphic are uploaded in the console, separately from the launcher
  icon in your binary.
- EAS Metadata does not manage Google Play listings.
- The first release of an app must be uploaded manually in the Play Console — see
  [EAS Submit](../expo-eas/submit.md).
:::

## Common patterns

### Review listing changes like code

Put `store.config.json` in the repository and require review. A keyword change or a new
`privacyPolicyUrl` then has an author, a reason and a date, which a dashboard edit does not.

### Keep release notes next to the release

Write release notes in the same pull request as the version bump, so the listing and the build
describe the same release. See [Versioning and Runtime Versions](versioning.md).

### Keep an SDK data inventory

A short table — SDK, data it collects, purpose, whether it is linked to the user — makes the App
Privacy and Data safety answers reproducible, and makes adding an SDK a visible listing change.

## Common mistakes

- **Expecting EAS Metadata to manage the Google Play listing.** It supports the App Store only.
- **Pushing before pulling.** You overwrite listing fields that were set in App Store Connect.
- **Answering privacy questions for your own code only.** Third-party SDKs collect data too, and the
  disclosure must include them.
- **Treating `name` in `app.json` as the store title.** It is the name under the icon. The store
  title is set in the store (or `title` in `store.config.json`).
- **Letting the listing and the build disagree.** A listing that promises a feature the reviewed
  build does not have invites rejection.
- **Committing App Store Connect API keys next to `store.config.json`.** The config is public-safe;
  the key is a publish credential. Keep keys outside the repository.

## Related topics

- [EAS Submit](../expo-eas/submit.md) — uploading builds, and the `metadataPath` field.
- [Submission Checklists](submission-checklists.md) — listing items to check before each submission.
- [App Icons and Splash Screens](icons-and-splash-screens.md) — the in-binary icon, separate from store graphics.
- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — the permission strings reviewers read.
- [Versioning and Runtime Versions](versioning.md) — the version a listing describes.
- [Costs and Limits](../expo-eas/costs-and-limits.md) — what EAS services cost.
