---
title: EAS Overview
description: EAS is Expo's paid hosted build, submit and update service with a free tier. What each product does, what it costs you, and what you can do instead.
status: current
toolchain: expo
sdk: 57
---

EAS (Expo Application Services) is a set of **hosted, paid services with a free tier**, run by
Expo, that build your app on their machines, upload it to the stores, and deliver JavaScript
updates to installed apps. It is a separate product from the Expo SDK and the Expo CLI.

**EAS is optional.** An Expo app is a React Native app; you can build it on your own machine or
your own CI with `npx expo run:android`, `npx expo run:ios`, or `eas build --local`, and ship the
resulting binary yourself. Nothing in the SDK requires an EAS account. This section documents EAS
because plenty of teams use it, not because you have to.

## What is in EAS

| Product | What it does | The alternative |
| --- | --- | --- |
| **EAS Build** | Compiles Android and iOS binaries on Expo's machines | Build locally, or on your own CI |
| **EAS Submit** | Uploads a binary to App Store Connect and Google Play | Transporter, Xcode, Play Console, fastlane |
| **EAS Update** | Serves JavaScript and asset updates to installed apps | A self-hosted `expo-updates` server, or shipping a new binary |
| **EAS Workflows** | Runs those jobs from a YAML file on triggers | GitHub Actions, GitLab CI, Bitrise, Jenkins |
| **EAS Metadata** | Pushes store listing text from a config file (beta, iOS only) | Editing the store dashboards |

All of them are driven by one command-line tool, `eas-cli`, and one config file, `eas.json`.

## Why it exists / when to use it — and when NOT to

The concrete problem EAS Build solves is **machine ownership**. iOS binaries can only be produced
on macOS with Xcode installed. If your team is on Windows or Linux, or your CI has no Mac runners,
you either rent a Mac somewhere or you use a hosted service. EAS is one hosted service among
several.

The second problem is **credential handling**. Signing an iOS app needs a distribution certificate
and a provisioning profile; signing an Android app needs a keystore. EAS can generate and store
these for you, which removes a genuinely awkward setup step — at the cost of Expo holding your
signing material. See [Credentials Management](credentials.md) for both sides of that.

Reach for EAS when:

- You need iOS builds and do not have a Mac, or do not want to maintain one.
- You want JavaScript-only fixes to reach users without a store review, and you accept the
  constraints in [What OTA Updates May Not Change](ota-limits-and-policy.md).
- You would rather pay for build minutes than maintain build infrastructure.

Do **not** reach for EAS when:

- **You already have working CI.** If your GitHub Actions or Bitrise pipeline builds and signs the
  app today, EAS is a migration with no obvious payoff.
- **Your organisation cannot let a third party hold signing keys.** You can use EAS with local
  credentials (`credentialsSource: "local"`), but if the policy is "no third-party build machines
  at all", EAS Build is out.
- **Your build is cheap to run locally.** A solo developer on a Mac building twice a month gets
  very little from a hosted builder.
- **Cost matters more than convenience at your volume.** Read
  [Costs and Limits](costs-and-limits.md) before committing.

> [!NOTE] EAS needs an account and a network
> Every `eas` command except `--help` talks to Expo's servers and requires you to be signed in
> (`eas login`, or an `EXPO_TOKEN` environment variable in CI). `eas build --local` still
> authenticates, even though the compile happens on your machine. If you need a build path that
> works with no Expo account at all, that is `npx expo run:android` / `npx expo run:ios` — see
> [Building Locally](local-builds.md).

## Basic example

Install the CLI. `eas-cli` is a standalone tool, **not** an SDK package, so it is installed
globally or run through `npx` — `npx expo install` is not involved.

:::tabs
@tab npx
```bash
# No global install; always runs the version you name
npx eas-cli@24.5.0 --version
```
@tab npm
```bash
npm install --global eas-cli
eas --version
```
@tab yarn
```bash
yarn global add eas-cli
eas --version
```
:::

The verified current version is **eas-cli 24.5.0**. Pinning it in CI is worth doing, because the
CLI validates `eas.json` and a newer CLI occasionally accepts fields an older one rejects.

Then sign in and generate a starting `eas.json`:

```bash
eas login
eas build:configure
```

`eas build:configure` writes an `eas.json` with three profiles:

```json title=eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

That is the whole default file. Everything else in
[eas.json and Build Profiles](eas-json.md) is something you add deliberately.

## How it works

### EAS Build

`eas build --platform android --profile production` archives your project, uploads it to Expo,
and runs a build on a hosted worker. The worker installs dependencies, runs `npx expo prebuild`
to generate the native directories (unless you have committed them), resolves credentials, and
runs Gradle or Xcode. You get a download URL for an `.aab`, `.apk` or `.ipa`.

Your project is **uploaded**. If your repository contains material you cannot send to a third
party, that is a blocking objection, not a detail.

### EAS Update

`expo-updates` (SDK 57 ships `~57.0.22`) embeds an update client in your binary. At launch it asks
a server whether a newer JavaScript bundle exists for its **runtime version** and **channel**, and
if so downloads it for the next launch. EAS Update is one implementation of that server.

The runtime version is the safety mechanism: it identifies the native binary an update is
compatible with. Getting it wrong is the standard way to break a production app, which is why it
has its own page — [Runtime Versions, Channels and Branches](runtime-versions.md).

### EAS Submit

`eas submit` uploads an existing binary to App Store Connect or Google Play using credentials you
supply (an App Store Connect API key, or a Google Play service account JSON). It does not review,
release or publish your app; it puts the binary where the store expects it.

### EAS Workflows

A YAML file in `.eas/workflows/` describing jobs that run on Expo's infrastructure — builds,
submissions, updates, and custom shell steps. It competes with GitHub Actions rather than
extending it. See [EAS Workflows](workflows.md).

## Common patterns

### Use EAS for iOS only

A legitimate middle ground: build Android locally, where you need nothing but a JDK and the
Android SDK, and use EAS only for the iOS builds that need a Mac. Nothing in `eas.json` prevents
this — just never run `eas build --platform ios` for Android.

### Use EAS Update without EAS Build

`expo-updates` reads its server URL from `updates.url` in the app config. You can point a locally
built binary at EAS Update, or point an EAS-built binary at your own update server. The products
are separable.

### Keep a local build path that works

Whatever you adopt, make sure at least one person on the team can produce a release binary without
EAS, and that this is tested — not theoretical. Hosted services have outages, plans change, and a
release you cannot cut is worse than a release that takes an afternoon.

## Security considerations

**Threat.** EAS Build runs your source on a machine you do not control and, by default, stores your
signing credentials. An attacker with access to an Expo account that has project permissions can
trigger builds, read build logs, and potentially download credentials.

**Exploit.** The realistic version is not an Expo breach — it is a leaked `EXPO_TOKEN` in a CI log
or a committed `.env`. That token is a bearer credential for your whole account.

**Fix.**

- Store `EXPO_TOKEN` as a CI secret, never in the repository, and scope it to a robot user rather
  than a person's account.
- Set `"requireCommit": true` under `cli` in `eas.json` so builds cannot be made from uncommitted
  local state.
- Use EAS environment variables marked secret for build-time values rather than committing them.
  Note that secret variables are **not** available to `eas build --local`.
- Never commit a keystore, a `.p12`, a `.mobileprovision`, a Play service account JSON or a
  `credentials.json`. Add them to `.gitignore` on day one.

**Verification.** Run `git log --all --full-history -- credentials.json '*.keystore' '*.p12'` in
your repository. If it returns anything, the secret is in history and rotating it is the only fix
— deleting the file is not.

## Common mistakes

- **Assuming EAS is required.** It is not. `npx expo run:android` and `npx expo run:ios` produce
  real native builds with no account. `eas build --local` compiles on your machine. Teams adopt EAS
  and then discover they cannot build at all when it is unavailable, because they never kept the
  local path working.
- **Installing `eas-cli` with `npx expo install`.** Wrong tool. `eas-cli` is not an SDK package and
  is not in `bundledNativeModules.json`; it is a global or `npx` binary versioned independently of
  the SDK.
- **Reading the free tier as "free forever at any volume".** Build counts, update audience and CI
  minutes are all metered. [Costs and Limits](costs-and-limits.md) covers what is and is not
  verifiable.
- **Expecting iOS builds to work without an Apple Developer account.** EAS provides machines, not
  membership. You still need a paid Apple Developer Program account to sign for devices or the
  store, and a Google Play developer account to publish on Android.
- **Treating EAS Update as a way around store review.** It is not, and both stores have rules about
  it. See [What OTA Updates May Not Change](ota-limits-and-policy.md).
- **Letting `eas.json` drift from what CI actually runs.** If CI passes `--profile production` but
  humans build `preview` by hand, the thing you tested is not the thing you shipped.

## Related topics

- [eas.json and Build Profiles](eas-json.md) — the real schema, field by field.
- [Building on EAS](building.md) — the build command, its flags and what the worker does.
- [Building Locally](local-builds.md) — `eas build --local` and the no-account path.
- [Credentials Management](credentials.md) — certificates, profiles and keystores.
- [EAS Update](update.md) — how JavaScript updates reach installed apps.
- [Costs and Limits](costs-and-limits.md) — the commercial reality, stated plainly.
- [EAS Workflows](workflows.md) — CI on Expo's infrastructure.
- [What Expo Gives You and What It Costs](../expo-vs-bare/what-expo-costs.md) — the wider trade-off.
- [Creating One with EAS](../expo-development-builds/creating-with-eas.md) — development builds on EAS.
