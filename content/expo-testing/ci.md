---
title: Testing in CI
description: Running an Expo SDK 57 test suite on every pull request — Jest on a Linux runner, dependency and type checks, and an honest account of iOS needing macOS and EAS needing an account.
status: current
toolchain: expo
sdk: 57
---

A test suite that only runs on a developer's laptop stops being run. CI makes it run on every pull
request, on a clean machine, with the exact dependency versions in the lockfile.

For an Expo SDK 57 app the pipeline has layers with very different costs. Most of it runs on any
Linux runner for free; iOS builds need macOS; hosted builds need an Expo account.

## Why it exists / when to use it — and when NOT to

Run in CI, on every pull request:

- `npx expo install --check` — catches a dependency installed at a version built for another SDK.
- TypeScript — catches a React Native 0.87-only API copied into a 0.86 project.
- Jest — logic, hooks and components.

Run less often (on merge to main, nightly, or before release):

- Native builds and [end-to-end tests](end-to-end.md). They take many minutes and cost runner time.

Do **not** put E2E tests on every commit of every branch unless you have measured that the runner time
and flakiness are acceptable.

## Basic example

A GitHub Actions workflow for the fast layer. It needs no Expo account and runs on Linux:

```yaml title=.github/workflows/test.yml
name: test

on:
  pull_request:
  push:
    branches: [main]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Fails if any dependency does not match what SDK 57 expects.
      - run: npx expo install --check
      - run: npx tsc --noEmit
      # --ci: never write new snapshots; a missing snapshot is a failure.
      - run: npx jest --ci --maxWorkers=2
```

Use `npx jest` rather than `npm test` if your `test` script is `jest --watchAll`, which is what Expo's
setup instructions put in `package.json` — watch mode waits for input.

## How it works

### The jest-expo peer dependency must be in the lockfile

`jest-expo@57.0.5` needs `@react-native/jest-preset` `^0.86.3`, and `npx expo install jest-expo` does not
install it. If it is missing, CI fails on the first test with:

```text
● Validation Error: An unknown error occurred in jest-expo: The React Native Jest preset that
jest-expo relies on has moved to a separate package. To migrate, please install
"@react-native/jest-preset" to fulfill jest-expo's peer dependency.
```

Fix it once locally, commit the lockfile, and CI follows:

```bash
npx expo install @react-native/jest-preset@0.86.3 --dev
```

Use `0.86.3` to match SDK 57's React Native — not 0.87. See [Jest with jest-expo](jest-expo.md).

### Why Linux is enough for the fast layer

Jest runs in Node. `jest-expo/ios` and `jest-expo/android` presets change module resolution, not the
operating system, so the entire unit layer runs on `ubuntu-latest` — or Windows or macOS if you prefer.

### iOS needs macOS — there is no way around it

Building an iOS app, and running the iOS Simulator, require Xcode, which only runs on macOS. For CI that
means one of:

| Option | Needs |
| --- | --- |
| A macOS runner on your CI provider (e.g. `runs-on: macos-latest` on GitHub Actions) | macOS runner minutes, typically billed at a higher rate than Linux |
| EAS Build / EAS Workflows | An Expo account; EAS supplies the macOS machine |
| Your own Mac as a self-hosted runner | Maintaining that machine |

`eas build --local` builds on the machine it runs on, so an **iOS** local build still needs macOS.

Android builds run on Linux, macOS or Windows runners.

### EAS in CI needs an account and a token

EAS commands authenticate in CI through the `EXPO_TOKEN` environment variable. Create a token in your
Expo account's access token settings (a robot user is intended for CI; robot users cannot sign in and
authenticate only by token) and store it as a CI secret:

```yaml title=.github/workflows/eas-build.yml
name: eas-build

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Never commit this value. Anyone with the token can act as that Expo user.
      EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx eas-cli@24.5.0 build --platform android --profile e2e-test --non-interactive
```

EAS is a **paid service with a free tier**; build queue position and concurrency depend on the plan.
This page does not quote prices or quotas; see [Costs and Limits](../expo-eas/costs-and-limits.md). EAS is
not required to test or ship an Expo app — local builds on your own runners are a supported alternative.

## Platform differences

:::tabs
@tab Android
Builds on any runner OS. Running an emulator in CI needs hardware acceleration; whether a given hosted
runner provides it varies by provider and runner type, so check yours before designing around it.
@tab iOS
Builds and simulator runs need macOS: a macOS hosted runner, a self-hosted Mac, or EAS.
:::

## Common patterns

### Layer the pipeline by cost

| Stage | Trigger | Runner | Account needed |
| --- | --- | --- | --- |
| `expo install --check`, `tsc`, Jest | Every PR | Linux | No |
| Android build + Maestro | Merge to main / nightly | Linux, or EAS | Only for EAS |
| iOS build + Maestro | Nightly / pre-release | macOS, or EAS | Only for EAS |

### Cache what is safe to cache

Cache the package manager download cache (the `cache: npm` line above). Do not cache `node_modules`
across lockfile changes, and do not cache Metro's cache between runs you rely on for bundle
measurements.

### Keep snapshots honest

`jest --ci` fails instead of writing a new snapshot. Without it, a pipeline that writes missing
snapshots passes tests that were never reviewed.

## Security considerations

**Threat.** `EXPO_TOKEN` grants whatever the token's user can do: start builds, publish updates, submit
to stores. A pull request from a fork that can read the secret can use it.

**Exploit.** A workflow triggered by `pull_request_target` that checks out and runs the fork's code with
`EXPO_TOKEN` in the environment. The fork's `package.json` `postinstall` script sends
`process.env.EXPO_TOKEN` to an attacker's server.

**Fix.** Run untrusted code with no secrets: use `pull_request` (which does not expose secrets to forks
on GitHub Actions) for tests, and only expose `EXPO_TOKEN` to workflows triggered by trusted events such
as `push` to `main` or `workflow_dispatch`. Use a robot user token scoped to the project, not a personal
token.

**Verification.** Open a pull request from a fork that adds a step printing whether `EXPO_TOKEN` is set
(never its value). It should report empty.

## Common mistakes

- **Running `npm test` when the script is `jest --watchAll`.** CI hangs until it times out. Run
  `npx jest --ci`.
- **Missing `@react-native/jest-preset` in the lockfile.** CI fails on the first test file.
- **Expecting iOS builds on `ubuntu-latest`.** iOS needs macOS or EAS.
- **Assuming EAS is required for CI.** Jest, TypeScript and `expo install --check` need no account; local
  native builds need only the right runner OS.
- **Putting `EXPO_TOKEN` in workflows that run fork code.** Expose it only to trusted triggers.
- **Skipping `npx expo install --check`.** A mismatched native dependency passes Jest (it is mocked) and
  fails on a device.
- **Running full E2E on every push.** Slow and flaky. Run it on merge or nightly.

## Related topics

- [Jest with jest-expo](jest-expo.md) — the setup this pipeline runs.
- [End-to-End on Development Builds](end-to-end.md) — the expensive layer.
- [EAS Workflows](../expo-eas/workflows.md) — Expo's hosted pipeline.
- [Costs and Limits](../expo-eas/costs-and-limits.md) — what EAS costs, without guesses.
- [Local Builds](../expo-eas/local-builds.md) — building without EAS servers.
- [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md) — handling secrets in builds.
