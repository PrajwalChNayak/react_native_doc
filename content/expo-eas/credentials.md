---
title: Credentials Management
description: iOS distribution certificates and provisioning profiles, Android keystores, who holds them, and how to move between EAS-managed and your own.
status: current
toolchain: expo
sdk: 57
---

Every release build is signed. On iOS that means a **distribution certificate** and a
**provisioning profile**; on Android it means a **keystore** containing a private key. EAS can
generate and hold these for you, or you can keep them yourself and hand them to the build.

This is the part of shipping where a mistake is expensive rather than annoying. Lose an Android
upload key and you cannot update your own app on Google Play without a key reset request. Commit a
keystore to a public repository and anyone can sign a package that claims to be you.

> [!DANGER] Never commit signing material
> A keystore, a `.p12`, a `.mobileprovision`, an App Store Connect `.p8` key, a Google Play service
> account JSON and a `credentials.json` are all secrets. Add them to `.gitignore` before you create
> them, not after. Deleting a committed secret does not remove it from git history — the only fix
> is to rotate it.

## Why it exists / when to use it — and when NOT to

You need managed credentials when more than one person, or any CI machine, has to produce a signed
build. Passing a keystore around on Slack does not survive a team of three.

You do **not** need EAS to hold them. `credentialsSource: "local"` keeps everything on your
machine and in your secret store, and `npx expo run:android` / `npx expo run:ios` sign with
whatever Xcode and Gradle are configured to use, with no EAS involvement at all.

## What each platform actually needs

:::tabs
@tab iOS

| Credential | Scope | Notes |
| --- | --- | --- |
| Distribution certificate | One per Apple Developer account, shared across apps | Represents your team's identity |
| Provisioning profile | Per app, per distribution method | Expires after 12 months; ties the app ID, certificate and (for ad hoc) a device allow-list |
| Push notification key (`.p8`) | Per Apple Developer account | Limited to 2 per account — do not let tooling regenerate them casually |

All iOS signing requires a **paid Apple Developer Program membership**. EAS supplies build
machines, not membership.

@tab Android

| Credential | Scope | Notes |
| --- | --- | --- |
| Keystore (`.jks` / `.keystore`) | Per app | Contains the private key. Includes a keystore password, a key alias and a key password |
| Google Play service account JSON | Per Play developer account | Only needed for `eas submit`, not for building |

If you use Google Play App Signing, the keystore you hold is the **upload key**: Play re-signs with
its own key. That makes an upload key recoverable through Play's key reset process, which a
pre-App-Signing release key is not. Check which one you have before you plan your backups.

:::

## Basic example

### Let EAS generate and hold them

This is the default. The first time you run a build that needs signing, `eas-cli` offers to
generate the missing credential:

```bash
eas build --platform android --profile production
# EAS prompts: "Generate a new Android Keystore?" -> Yes
```

Nothing is written to your repository; the keystore lives on EAS servers and is attached to the
project.

Inspect or change what is stored at any time:

```bash
eas credentials --platform android
eas credentials --platform ios
```

That command is interactive. It is also the route to **download** stored credentials, which you
should do at least once so you have your own copy.

### Bring your own

Set `credentialsSource` on the profile:

```json title=eas.json
{
  "build": {
    "production": {
      "credentialsSource": "local"
    }
  }
}
```

and create a `credentials.json` beside `eas.json`:

```json title=credentials.json
{
  "android": {
    "keystore": {
      "keystorePath": "../secrets/release.keystore",
      "keystorePassword": "$KEYSTORE_PASSWORD",
      "keyAlias": "upload",
      "keyPassword": "$KEY_PASSWORD"
    }
  },
  "ios": {
    "provisioningProfilePath": "../secrets/profile.mobileprovision",
    "distributionCertificate": {
      "path": "../secrets/dist-cert.p12",
      "password": "$CERT_PASSWORD"
    }
  }
}
```

Two things to notice. The paths point **outside** the repository, and the passwords are shown as
placeholders — put the real values in your secret manager and materialise this file at build time,
or accept that `credentials.json` itself is a secret and keep it out of git.

`credentialsSource` defaults to `"remote"`, so a profile that omits it uses EAS-stored credentials.

## How it works

### The remote path

EAS stores credentials per project and per platform. When a build starts, the worker fetches the
credential set the profile asks for, signs with it, and discards it. For iOS, EAS will also talk to
App Store Connect on your behalf — with credentials you provide — to create or renew a provisioning
profile when the stored one no longer covers the build.

That last part is the convenience people actually buy: provisioning profiles expire yearly and
regenerating them by hand through the Apple developer portal is tedious.

### The local path

With `credentialsSource: "local"`, `eas-cli` reads `credentials.json`, uploads the material with
the build job, and the worker signs with it. The files still leave your machine — "local" describes
where the source of truth lives, not that signing happens offline. If that distinction matters to
you, use [`eas build --local`](local-builds.md) or a plain native build.

### Moving between them

```bash
eas credentials --platform android
# -> "credentials.json: Upload/Download credentials between EAS servers and your local json"
```

The same menu both uploads a local set to EAS and downloads a stored set into `credentials.json`.
Downloading is how you take a backup of a keystore EAS generated for you.

### Freezing credentials in CI

```bash
eas build --platform ios --profile production --non-interactive --freeze-credentials
```

`--freeze-credentials` stops the build from creating or modifying credentials. In CI this is what
you want: a build that silently regenerates a provisioning profile at 3am is a build that changed
something nobody reviewed.

## Platform differences

### iOS device registration

Ad hoc distribution only installs on devices listed in the provisioning profile **at build time**.
Registering a device later does not fix an existing build:

```bash
eas device:create          # register UDIDs (interactive: URL, QR code or manual)
eas device:list
eas build --platform ios --profile preview   # new profile, now includes the device
```

`eas build --refresh-ad-hoc-provisioning-profile` forces the profile to be regenerated with the
current device list.

### Android key rotation

You can change the keystore for a build profile, but you cannot change the key Google Play expects
for an existing app without going through Play's key reset flow. Treat an Android release key as
permanent until proven otherwise, and back it up somewhere that survives a laptop failure.

## Security considerations

**Threat.** An attacker who obtains your Android release key can sign a modified APK that the OS
treats as an update to your app. An attacker with your iOS distribution certificate and a matching
profile can sign builds attributed to your team.

**Exploit.** The common path is not a break-in. It is a keystore committed to the repository in the
first week of the project, or a `credentials.json` with plaintext passwords next to it.

```bash
# Is it already in history?
git log --all --full-history --name-only -- \
  'credentials.json' '*.keystore' '*.jks' '*.p12' '*.p8' '*.mobileprovision'
```

**Fix.**

```gitignore title=.gitignore
credentials.json
*.keystore
*.jks
*.p12
*.p8
*.mobileprovision
google-services.json
play-service-account*.json
```

Keep the real files in a password manager or secret store. In CI, write them to disk from secrets
at the start of the job and delete them at the end. Enable two-factor authentication on the Expo,
Apple and Google accounts — the credential store is only as strong as the account guarding it.

**Verification.** After adding the ignore rules, run `git check-ignore -v credentials.json`. It
should print the matching rule. Then run the `git log` command above; an empty result means nothing
was ever committed. A non-empty result means rotation, not deletion.

## Common mistakes

- **Committing `credentials.json`.** It contains paths and, unless you are careful, passwords. It
  is a secret.
- **Treating the EAS copy as your backup.** Download your keystore once and store it yourself. A
  deleted project, a lost account or a billing lapse should not be able to separate you from your
  signing key.
- **Letting each developer generate their own keystore.** Two different keystores mean two mutually
  un-upgradable apps. One keystore per app, held centrally.
- **Regenerating an iOS push key without checking.** Apple limits you to two per account, and
  revoking one breaks every app using it — including apps you did not think about.
- **Registering a device and expecting the existing build to install.** The device list is baked
  into the provisioning profile at build time. Register first, then rebuild.
- **Running interactive credential prompts in CI.** Pass `--non-interactive`, and add
  `--freeze-credentials` so an unattended job cannot mutate your signing setup.
- **Assuming `credentialsSource: "local"` means nothing is uploaded.** With `eas build` the files
  are sent to the build worker either way. Only `--local` keeps them on your machine.

## Related topics

- [eas.json and Build Profiles](eas-json.md) — where `credentialsSource` lives.
- [Building on EAS](building.md) — `--freeze-credentials` and credential prompts.
- [Building Locally](local-builds.md) — signing without sending anything to a worker.
- [Internal Distribution](internal-distribution.md) — ad hoc profiles and device allow-lists.
- [EAS Submit](submit.md) — App Store Connect keys and Play service accounts.
- [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md) — secret handling in builds.
- [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) — what an attacker can read from a shipped app.
