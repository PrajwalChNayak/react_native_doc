---
title: Creating One with EAS
description: eas build --profile development produces a development build on Expo's servers. EAS is a paid hosted service with a free tier, it requires an Expo account, and queue time depends on your plan.
status: current
toolchain: expo
sdk: 57
---

EAS Build compiles your app on Expo's infrastructure and hands you back an artifact. For
development builds the command is:

```bash
eas build --profile development --platform android
```

Before deciding to use it, three facts matter more than any feature list:

- **EAS is a paid hosted service with a free tier.** You can produce builds without paying. You can
  also exhaust the free tier.
- **Build queues and concurrency depend on your plan.** A free-tier build waits in a shared queue;
  paid plans buy priority and the ability to run more than one build at a time. How long you wait is
  therefore not a property of your project.
- **An Expo account is required.** EAS builds are tied to an account and a project on Expo's
  servers. There is no anonymous mode.

None of that makes EAS the wrong choice. It makes it a choice with a price.
[Creating One Locally](creating-locally.md) is the alternative that costs machine time instead, and
[EAS Costs and Limits](../expo-eas/costs-and-limits.md) is where the plan comparison belongs.

## Why it exists / when to use it — and when NOT to

Use EAS Build for a development build when:

- **You need an iOS build and have no Mac.** This is the single strongest reason. Local iOS builds
  require macOS with Xcode; EAS runs them on macOS workers.
- You want signed, installable builds for testers without managing signing identities by hand.
- You want every team member and your CI to get the same artifact from the same inputs.
- Your machine is slow, or you would rather not install Android Studio and Xcode on it.

Do not use it when:

- You already have the toolchain and are iterating fast on native config — a local build's
  turnaround is shorter than a queued one.
- Your source cannot leave your network.
- The free tier does not cover your volume and the budget is not there. Build locally.

## Basic example

Install EAS CLI and sign in. The verified current version is **24.5.0**.

:::tabs
@tab npx
```bash
npx eas-cli@24.5.0 login
npx eas-cli@24.5.0 whoami
```
@tab global
```bash
npm install --global eas-cli@24.5.0
eas login
eas whoami
```
:::

Add the dev client, link the project, and generate `eas.json`:

```bash
npx expo install expo-dev-client
eas init
eas build:configure
```

`eas init` (an alias of `eas project:init`) creates or links the EAS project. `eas build:configure`
writes `eas.json` if it does not exist. Then build:

```bash
eas build --profile development --platform android
eas build --profile development --platform ios
```

The command uploads your project, queues a build, and prints a URL where you can watch it and
download the artifact. Add `--wait` to block until it finishes.

## How it works

### `eas.json` and the development profile

`eas build:configure` writes this file. It is reproduced here from EAS CLI 24.5.0's own default,
not paraphrased:

```json title=eas.json
{
  "cli": {
    "version": ">= 24.5.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

The two keys that make the `development` profile a development build:

- **`developmentClient: true`** — build a debug-style client that loads a bundle from a dev server
  rather than embedding a production bundle.
- **`distribution: "internal"`** — produce something installable outside the stores. On Android that
  means an APK you can download and install; on iOS it means an ad-hoc or enterprise build limited
  to registered devices.

`--profile` (short form `-e`) selects the profile. Without it, EAS defaults to `production` when
that profile exists in `eas.json`, which is not what you want for a development build.

### Profile fields you will reach for

Read from the installed `@expo/eas-json` 24.5.0 type definitions.

| Field | Where | Values | Why |
| --- | --- | --- | --- |
| `developmentClient` | top level or per platform | boolean | Makes it a development build |
| `distribution` | top level or per platform | `store` \| `internal` | Internal is what testers install |
| `channel` | top level | string | Which update channel the build subscribes to |
| `env` | top level | object of strings | Build-time environment variables |
| `extends` | top level | profile name | Inherit from another profile |
| `credentialsSource` | top level | `local` \| `remote` | Where signing credentials come from |
| `resourceClass` | top level | `default`, `medium`, `large`, … | Worker size, marked experimental on the CLI flag |
| `ios.simulator` | iOS | boolean | Build for the simulator instead of a device |
| `ios.scheme` | iOS | string | Xcode scheme |
| `ios.buildConfiguration` | iOS | string | Xcode build configuration |
| `android.buildType` | Android | `apk` \| `app-bundle` | APK for internal distribution |
| `prebuildCommand` | top level | string | Override the prebuild EAS runs |

A common addition is a simulator profile, so a Mac user can get an iOS build that runs in the
simulator without registering a device:

```json title=eas.json
{
  "build": {
    "development-simulator": {
      "extends": "development",
      "ios": {
        "simulator": true
      }
    }
  }
}
```

### Command flags worth knowing

Read from EAS CLI 24.5.0's own command manifest.

| Flag | What it does |
| --- | --- |
| `-e, --profile <name>` | Build profile from `eas.json`. Defaults to `production` if defined |
| `-p, --platform <all\|android\|ios>` | Platform to build |
| `--local` | Run the build locally, labelled experimental |
| `--output <path>` | Output path for a local build |
| `--wait` | Wait for the build to complete |
| `--clear-cache` | Clear the build cache first |
| `-m, --message <text>` | Short message describing the build |
| `--non-interactive` | Required in CI |
| `--json` | Machine-readable output, implies `--non-interactive` |

> [!NOTE] Credentials are generated for you unless you say otherwise
> On a first iOS build EAS offers to create a distribution certificate and provisioning profile for
> you and store them on its servers. That is convenient and it is also a decision about where your
> signing material lives. `credentialsSource: "local"` keeps it on your machine instead. See
> [Credentials](../expo-eas/credentials.md).

## Platform differences

:::tabs
@tab Android
An internal-distribution development build produces an **APK**, which installs directly from a
download link or by dragging it onto an emulator. Set `android.buildType` to `apk` explicitly if a
parent profile set `app-bundle`.

No device registration is needed. Anyone with the link and an Android device can install it.
@tab iOS
An internal-distribution build for physical devices is limited to **registered devices**. Register
them before building:

```bash
eas device:create
```

That command registers Apple devices for internal distribution. A device that was not registered at
build time cannot install the resulting build; you have to register it and build again.

For simulator-only builds set `ios.simulator: true`, which skips device registration entirely but
produces something that runs only in the simulator.
:::

## Common patterns

### Separate the development profile from everything else

Keep `developmentClient: true` in exactly one profile. A `preview` profile should be
internal-distribution **without** the dev client, so testers see something close to the real app,
and `production` should be neither. Mixing them is how a launcher UI ends up in a store submission.

### Download and run a finished build

```bash
eas build:run --platform android --latest
```

`eas build:run` runs simulator and emulator builds from EAS CLI; `--latest` picks the most recent
build for that platform, and `--id`, `--url` or `--path` select a specific one.

### Use it in CI without an interactive prompt

```bash
eas build --profile development --platform android --non-interactive --wait
```

CI has no terminal to answer credential prompts. `--non-interactive` makes a missing credential an
error instead of a hang.

## Common mistakes

- **Assuming EAS is required to ship an Expo app.** It is not. `npx expo run:android` / `run:ios`
  and `eas build --local` produce real builds without the hosted service.
- **Omitting `--profile` and getting a production build.** EAS defaults to `production` when that
  profile exists. A production build has no dev client and will not connect to your Metro server.
- **Expecting a fixed build time.** Queue and concurrency depend on your plan. Do not design a
  release process around a wait time you measured once.
- **Registering an iOS device after the build.** Internal-distribution iOS builds embed the list of
  registered devices at build time. Run `eas device:create` first, then build.
- **Uploading a development build to TestFlight or Play.** It contains development tooling and
  expects a dev server. Build a separate profile for testers.
- **Putting secrets in `env` in `eas.json`.** That file is committed. Use EAS secrets — see
  [EAS Secrets](../expo-security/eas-secrets.md).
- **Letting EAS CLI versions drift across a team.** `cli.version` in `eas.json` exists for this;
  pin it and let the CLI enforce it.

## Related topics

- [Creating One Locally](creating-locally.md) — the no-service alternative.
- [EAS Costs and Limits](../expo-eas/costs-and-limits.md) — plans, queues and quotas, stated plainly.
- [eas.json](../expo-eas/eas-json.md) — the full profile reference.
- [Credentials](../expo-eas/credentials.md) — where signing material lives.
- [Internal Distribution](../expo-eas/internal-distribution.md) — getting builds to testers.
- [Installing It on a Device](installing-on-a-device.md) — the install step itself.
- [Why You Need a Development Build](why-you-need-one.md) — what forces you into one.
