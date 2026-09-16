---
title: Building on EAS
description: Running eas build — the verified flags, what the hosted worker does with your project, and how to read a failure.
status: current
toolchain: expo
sdk: 57
---

`eas build` uploads your project to Expo's infrastructure, compiles it on a hosted worker, and
gives you a download URL for the resulting `.aab`, `.apk` or `.ipa`. It is the paid product most
people mean when they say "EAS".

If you want the same binary without a hosted worker, [Building Locally](local-builds.md) covers
`eas build --local` and the plain `npx expo run:*` path. Neither is a fallback — both are supported.

## Why it exists / when to use it — and when NOT to

The honest case for it is narrow and real: **iOS binaries require macOS with Xcode**. If nobody on
the team has a Mac, or your CI has no Mac runners, a hosted builder is the practical answer. The
secondary case is that the worker also resolves signing credentials, which is the step teams most
often get stuck on.

Skip it when your builds already run somewhere — an existing CI pipeline that produces signed
binaries is not improved by moving to EAS — or when uploading your source to a third party is not
acceptable at your organisation.

## Basic example

```bash
eas login
eas build --platform android --profile production
```

Follow the build in the terminal, or pass `--no-wait` to return immediately and check later:

```bash
eas build --platform ios --profile production --no-wait
eas build:list --limit 5
eas build:view
```

Build both platforms from one command:

```bash
eas build --platform all --profile production
```

## Verified flags

Read from the `eas-cli` **24.5.0** command manifest. Anything not listed here was not verified.

| Flag | Meaning |
| --- | --- |
| `--platform` / `-p` | `android`, `ios` or `all` |
| `--profile` / `-e` | Build profile name from `eas.json`. Note the short form is `-e`, not `-p`. |
| `--local` | Compile on this machine instead of a hosted worker |
| `--output` | Where to write the artifact (local builds) |
| `--wait` / `--no-wait` | Block until the build finishes, or return immediately |
| `--clear-cache` | Ignore the build cache |
| `--auto-submit` / `-s` | Submit the finished binary with the matching submit profile |
| `--auto-submit-with-profile` | Submit using a named submit profile |
| `--what-to-test` | TestFlight "what to test" notes |
| `--resource-class` | `default`, `large`, `medium`, `m-medium`, `m-large`, `m1-medium` |
| `--message` / `-m` | A note attached to the build |
| `--freeze-credentials` | Fail rather than create or modify credentials |
| `--refresh-ad-hoc-provisioning-profile` | Regenerate the iOS ad hoc profile with the current device list |
| `--skip-credentials-check` | Skip the pre-flight credential validation |
| `--skip-project-configuration` | Skip the project configuration step |
| `--build-logger-level` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `--verbose-logs` | More output from the build itself |
| `--json` | Machine-readable output. Implies non-interactive use. |
| `--non-interactive` | Never prompt. Required in CI. |

Related commands: `eas build:list`, `eas build:view`, `eas build:cancel`, `eas build:download`,
`eas build:delete`, `eas build:resign`, `eas build:run`, `eas build:inspect`,
`eas build:configure`.

## How it works

### What the worker does

1. **Archive and upload.** Your project directory is packed and sent to Expo. With
   `"requireCommit": true` in `eas.json`, only committed state is sent.
2. **Install dependencies.** Using the lockfile in the project, on the Node version the profile
   pins.
3. **Generate native projects.** `npx expo prebuild` runs unless `ios/` and `android/` are
   committed, in which case they are used as-is. This is where your
   [config plugins](../expo-config-plugins/what-they-are.md) execute.
4. **Resolve credentials.** Fetched from EAS, or read from `credentials.json` when
   `credentialsSource` is `"local"`.
5. **Compile.** Gradle for Android, Xcode for iOS.
6. **Publish the artifact.** A download URL, plus anything matched by `buildArtifactPaths`.

> [!DANGER] Prebuild on the worker uses your config, not your local native edits
> If you hand-edited `ios/` or `android/` but did not commit those directories, the worker
> regenerates them and your edits are simply absent from the build. Decide once whether the native
> directories are generated or committed — see
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

### Queues and concurrency

Builds queue. How long they wait, and how many of your builds can run at once, depends on your
plan — concurrency is a billed resource. This is the practical difference between the free tier
and a paid one on a busy day, and it is worth understanding before a release deadline. See
[Costs and Limits](costs-and-limits.md).

### Builds in CI

```yaml title=.github/workflows/build.yml
- run: npm ci
- run: npx eas-cli@24.5.0 build --platform android --profile production --non-interactive --no-wait
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

Three things make this survive: the CLI version is pinned, `--non-interactive` prevents a prompt
from hanging the job forever, and authentication is a token rather than a login.

## Platform differences

:::tabs
@tab Android

Produces an `.aab` by default (`buildType: "app-bundle"`), which is what Google Play requires. Set
`"buildType": "apk"` for something testers can sideload. Profiles with
`distribution: "internal"` default to an APK for exactly that reason.

You need a keystore. EAS generates one on first use if you let it.

@tab iOS

Produces an `.ipa`. Requires a **paid Apple Developer Program membership** for anything installable
on a device or submittable to the store — EAS provides machines, not membership.

The one exception is `"ios": { "simulator": true }`, which produces an unsigned simulator build
with no Apple account involved. It still needs a Mac to run.

:::

## Common patterns

### Build, then submit, in one step

```bash
eas build --platform ios --profile production --auto-submit
```

The binary goes straight to App Store Connect using the `production` submit profile. Convenient,
and worth being deliberate about: there is no human checkpoint between "build finished" and
"binary uploaded".

### Install a finished build on a simulator or emulator

```bash
eas build:run --platform android --latest
eas build:run --platform ios --latest
```

### Reproduce a failure locally before paying for another build

A failing hosted build is a slow feedback loop. Run the same prebuild step locally first:

```bash
npx expo prebuild --clean --platform android
cd android && ./gradlew assembleRelease
```

Most EAS build failures are ordinary native build failures and reproduce on your machine. The ones
that do not are usually credentials or environment variables.

### Reading a failure

Build logs are linked from the terminal output and the EAS dashboard. Work backwards from the first
error, not the last — Gradle and Xcode both print a large amount of noise after the real failure.
`--build-logger-level debug` adds detail about the EAS-side steps (dependency install, prebuild,
credential resolution) rather than the compiler.

## Common mistakes

- **Using `-p` for the profile.** `-p` is `--platform`; the profile short flag is `-e`. Passing
  `-p production` fails with an unhelpful platform error.
- **Running without `--non-interactive` in CI.** The job hangs on the first prompt until it times
  out, and you pay for the wait.
- **Letting an unattended build generate credentials.** Add `--freeze-credentials` so a CI run
  cannot silently create a new provisioning profile.
- **Expecting hand-edited native code to be in the build.** Unless `ios/`/`android/` are committed,
  the worker regenerates them from your app config.
- **Assuming an internal-distribution build can be submitted.** `distribution: "internal"` on
  Android gives you an APK; Google Play needs an AAB.
- **Forgetting `channel` on the profile.** The binary then has no EAS Update channel and cannot
  receive updates. This fails silently at build time and loudly at incident time.
- **Building `--platform all` to debug one platform.** You pay for two builds to learn about one.

## Related topics

- [eas.json and Build Profiles](eas-json.md) — the profiles these commands select.
- [Building Locally](local-builds.md) — the same output, on your machine.
- [Credentials Management](credentials.md) — signing, and `--freeze-credentials`.
- [Internal Distribution](internal-distribution.md) — getting builds to testers.
- [EAS Submit](submit.md) — what `--auto-submit` triggers.
- [Costs and Limits](costs-and-limits.md) — queues, concurrency and what a build costs.
- [EAS Workflows](workflows.md) — running these builds on triggers.
- [Creating One with EAS](../expo-development-builds/creating-with-eas.md) — development builds specifically.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the step that generates the native projects.
