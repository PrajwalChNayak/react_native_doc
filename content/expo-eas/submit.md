---
title: EAS Submit
description: Uploading a finished binary to App Store Connect and Google Play — submit profiles, the credentials each store needs, and what submission does not do.
status: current
toolchain: expo
sdk: 57
---

`eas submit` takes a binary you already have and uploads it to App Store Connect or Google Play.
That is the whole job. It does not build, it does not review, and it does not release your app to
users — it puts the file where the store expects it.

It is optional in the same way the rest of EAS is optional: Xcode's Organizer, Apple's Transporter,
the Play Console web upload and fastlane all do the same thing.

## Why it exists / when to use it — and when NOT to

Use it when uploads should be scriptable and identical every time, especially from CI, and when you
want `eas build --auto-submit` to close the loop between building and uploading.

Do not use it when you already have a working `fastlane` setup, when your release process needs a
human to make choices in the store dashboard anyway, or when a submission requires store features
`eas submit` does not expose.

## Basic example

```json title=eas.json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "../secrets/play-service-account.json",
        "track": "internal",
        "releaseStatus": "draft"
      },
      "ios": {
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345",
        "ascApiKeyPath": "../secrets/AuthKey_XXXXXXXXXX.p8",
        "ascApiKeyId": "XXXXXXXXXX",
        "ascApiKeyIssuerId": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

```bash
# Submit the most recent build for the platform
eas submit --platform android --profile production --latest

# Submit a local file instead
eas submit --platform ios --profile production --path ./build/app.ipa
```

Note that the credential paths point **outside** the repository. Neither a Play service account JSON
nor an App Store Connect `.p8` key belongs in git.

## Verified flags

Read from the `eas-cli` **24.5.0** command manifest:

| Flag | Meaning |
| --- | --- |
| `--platform` / `-p` | `android`, `ios` or `all` |
| `--profile` / `-e` | Submit profile name from `eas.json` |
| `--latest` | Submit the most recent finished build |
| `--id` | Submit a specific EAS build by id |
| `--path` | Submit a local binary file |
| `--url` | Submit a binary from a URL |
| `--what-to-test` | TestFlight "what to test" notes |
| `--groups` / `-g` | TestFlight groups to distribute to |
| `--auto-testflight-setup` | Set up TestFlight automatically |
| `--wait` | Block until the submission finishes |
| `--verbose`, `--verbose-fastlane` | More output |
| `--non-interactive` | Never prompt. Required in CI. |

Related commands: `eas submit:list`, `eas submit:status`, `eas submit:view`, `eas submit:retry`,
`eas submit:cancel`.

## How it works

### Submit profile fields

Verified against the `@expo/eas-json` 24.5.0 schema.

**Android**

| Field | Notes |
| --- | --- |
| `serviceAccountKeyPath` | Path to the Google Play service account JSON |
| `track` | Play track name. Defaults to `"internal"` |
| `releaseStatus` | `"completed"`, `"draft"`, `"halted"` or `"inProgress"` |
| `rollout` | A number — the staged rollout fraction |
| `changesNotSentForReview` | Submit the change without sending it for review |
| `applicationId` | Override the application id |

**iOS**

| Field | Notes |
| --- | --- |
| `ascApiKeyPath`, `ascApiKeyId`, `ascApiKeyIssuerId` | App Store Connect API key — the recommended authentication |
| `appleId`, `appleTeamId` | Apple ID authentication, as an alternative |
| `ascAppId` | The App Store Connect app id |
| `bundleIdentifier` | Override the bundle id |
| `sku`, `language`, `companyName`, `appName` | Used when creating a new App Store Connect app |
| `metadataPath` | Path to a `store.config.json` for [EAS Metadata](../expo-build-and-release/store-metadata.md) |
| `groups` | TestFlight groups |

### What each store needs from you

:::tabs
@tab iOS

An **App Store Connect API key** (`.p8`), its key id, and the issuer id. You create these in App
Store Connect under Users and Access. The `.p8` file is downloadable exactly once — if you lose it,
you revoke the key and make a new one.

An API key is better than an Apple ID and password here: it is scoped, it is revocable, and it does
not trip over two-factor authentication in CI.

The app record must already exist in App Store Connect, or `eas submit` must be able to create it
— which is what `sku`, `language`, `companyName` and `appName` are for.

@tab Android

A **Google Play service account JSON**. You create a service account in the Google Cloud project
linked to your Play developer account, grant it access in the Play Console, and download the key
file.

Google Play also requires that the **first** release of an app is uploaded manually through the Play
Console. Automation works from the second release onwards. Plan the first release as a manual step.

:::

### `releaseStatus` and `track`

These decide what happens after upload, and getting them wrong is how an unfinished build reaches
users.

```json title=eas.json
{
  "submit": {
    "internal": {
      "android": { "track": "internal", "releaseStatus": "completed" }
    },
    "production": {
      "android": { "track": "production", "releaseStatus": "draft" }
    }
  }
}
```

`"releaseStatus": "draft"` uploads the build and stops. A human then opens the Play Console and
decides when it goes out. That is usually what you want for the production track, and
`"completed"` is usually what you want for internal testing.

For staged rollouts, `"inProgress"` with a `rollout` fraction is the mechanism — see
[Staged Rollouts](../expo-build-and-release/staged-rollouts.md).

### Build and submit together

```bash
eas build --platform ios --profile production --auto-submit
eas build --platform ios --profile production --auto-submit-with-profile production
```

`--auto-submit` uses the submit profile with the same name as the build profile.
`--auto-submit-with-profile` lets you name a different one.

Be deliberate about this. There is no confirmation between the build finishing and the binary
landing in App Store Connect.

## Common patterns

### CI submission with an API key from secrets

```yaml title=.github/workflows/release.yml
- name: Write App Store Connect key
  run: |
    mkdir -p secrets
    echo "$ASC_API_KEY_P8" > secrets/AuthKey.p8
  env:
    ASC_API_KEY_P8: ${{ secrets.ASC_API_KEY_P8 }}

- name: Submit
  run: npx eas-cli@24.5.0 submit --platform ios --profile production --latest --non-interactive
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

The key is written from a CI secret at job time and never exists in the repository.

### Upload to a draft, release by hand

Keep `"releaseStatus": "draft"` on production and treat "submitted" and "released" as two separate
decisions made by two separate people. It costs one click and prevents a category of accident that
is otherwise unrecoverable.

### Check status without watching the terminal

```bash
eas submit --platform android --profile production --latest --non-interactive
eas submit:list --limit 5
eas submit:status
```

## Security considerations

**Threat.** An App Store Connect API key or a Play service account JSON is a credential that can
publish software under your name. It is strictly more dangerous than a build credential: signing
material lets an attacker make a fake build, a store key lets them ship it to your users.

**Exploit.** The realistic path is a `.p8` or service account JSON committed to the repository —
often in a `secrets/` or `fastlane/` directory added "temporarily".

**Fix.**

```gitignore title=.gitignore
*.p8
play-service-account*.json
secrets/
```

Grant the Play service account the minimum roles it needs to upload to the tracks you use, not
account-wide admin. Rotate both credentials when someone with access leaves.

**Verification.**

```bash
git log --all --full-history --name-only -- '*.p8' '*service-account*.json'
```

Any output means the credential is in history and must be revoked in App Store Connect or the Google
Cloud console. Removing the file is not sufficient.

## Common mistakes

- **Committing the `.p8` or the service account JSON.** Both are publish-capable credentials. Keep
  them outside the repository and reference them by path.
- **Expecting the first Google Play release to work from CI.** Google Play requires the first APK or
  AAB to be uploaded through the Play Console by hand.
- **Submitting an APK to Google Play.** Play requires an AAB for new apps. Check that the build
  profile is not `distribution: "internal"`, which defaults to an APK.
- **Leaving `releaseStatus` unset on the production track and assuming nothing ships.** Be explicit.
  `"draft"` if a human should decide, `"completed"` if you mean it.
- **Thinking submission is release.** `eas submit` uploads. Apple still reviews; Google Play still
  processes and may review. Neither is instant.
- **Reusing an Apple ID and password in CI.** Two-factor authentication makes this fragile. Use an
  App Store Connect API key.
- **Forgetting `--non-interactive` in CI.** The job waits on a prompt nobody will answer.

## Related topics

- [eas.json and Build Profiles](eas-json.md) — the full submit profile schema.
- [Building on EAS](building.md) — `--auto-submit` and build artifacts.
- [Credentials Management](credentials.md) — signing credentials, which these are not.
- [App Store Metadata](../expo-build-and-release/store-metadata.md) — `metadataPath` and store listings.
- [Submission Checklists](../expo-build-and-release/submission-checklists.md) — what to check before you upload.
- [Staged Rollouts](../expo-build-and-release/staged-rollouts.md) — `track`, `rollout` and phased release.
- [Internal Distribution](internal-distribution.md) — getting builds to testers without the stores.
