---
title: CI for Mobile
description: Running a React Native 0.87 test suite on hosted runners — Node version, caching, the macOS constraint, and what to run on every push versus nightly.
status: current
toolchain: cli
---

Mobile CI differs from web CI in three ways that decide the shape of your pipeline: builds are slow
and native, iOS needs macOS, and the expensive checks are the ones that catch real regressions.
Getting the split right is more valuable than any single optimisation.

This page is about running **checks**. Producing signed artefacts for a store is a different job;
see [CI Pipelines](../build-and-release/ci-pipelines.md) and
[Release Checklist](../build-and-release/release-checklist.md).

## Why it exists / when to use it — and when NOT to

CI exists to make a regression visible before it reaches a device you cannot patch remotely. A
mobile release takes days to review and cannot be rolled back for users who already updated, so a
bug that ships is expensive in a way a web bug is not.

That does not mean running everything on every push. A full iOS build on every commit burns the
scarcest resource you have — macOS runner minutes — to re-prove something that rarely breaks. Run
the fast, high-signal checks on every push and the slow ones on a schedule or before a release.

## The constraints to design around

| Constraint | Consequence |
| --- | --- |
| React Native 0.87.1 `engines.node` is `^22.13.0 \|\| ^24.3.0 \|\| >= 26.0.0` | Pin Node to at least **22.13.0**. A runner defaulting to an older Node fails in ways that do not name the Node version. |
| iOS builds need Xcode | Any iOS job must run on **macOS**. There is no Linux path, no container, and no flag. |
| macOS runners cost several times a Linux runner | Put everything that can run on Linux on Linux. |
| Android needs the SDK and, for emulators, hardware acceleration | Emulator jobs need a runner that exposes nested virtualisation; without it, boot times make the job unusable. |
| Native builds are minutes, JS checks are seconds | Cache aggressively and split jobs so a lint failure does not wait for a Gradle build. |
| `react-native@0.87.1` pins `react` to `^19.2.3` | Use a lockfile and `npm ci`. A floating install can resolve a React that does not satisfy the peer range. |

## Basic example

A pull-request pipeline with the cheap checks on Linux. The syntax below is GitHub Actions; the
shape transfers to any provider.

```text title=.github/workflows/pr.yml
name: pr
on: pull_request

jobs:
  javascript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.13.0'   # minimum supported by react-native 0.87.1
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npx jest --ci --coverage --maxWorkers=2

  android-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.13.0'
          cache: 'npm'
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - run: npm ci
      - name: Assemble debug
        run: cd android && ./gradlew assembleDebug --no-daemon
```

The iOS job is separate because it is the expensive one:

```text title=.github/workflows/ios.yml
name: ios
on:
  schedule: [{cron: '0 3 * * *'}]   # nightly, not per push
  workflow_dispatch:

jobs:
  ios-build:
    runs-on: macos-latest           # Xcode exists only here
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.13.0'
          cache: 'npm'
      - run: npm ci
      - name: CocoaPods
        run: cd ios && bundle install && bundle exec pod install
      - name: Build for simulator
        run: |
          xcodebuild -workspace ios/App.xcworkspace -scheme App \
            -configuration Debug -sdk iphonesimulator \
            -derivedDataPath ios/build build
```

> [!NOTE] These workflows are illustrative, not recorded output
> Job names, action versions and image contents change. Verify the Node and Java versions your
> runner image ships with `node --version` and `java -version` in the job rather than assuming.

## How it works — what to run where

Think of the pipeline as four tiers, ordered by cost per unit of signal.

**Tier 1 — seconds, every push, Linux.**

```bash
npx tsc --noEmit        # the Strict API makes this catch real upgrade breakage
npx eslint .
npx jest --ci
```

`tsc --noEmit` is the highest-value check in a 0.87 project. The Strict TypeScript API turns stale
deep imports and outdated ref types into hard errors, which is exactly the class of problem that
survives code review. See [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md).

`--ci` matters for Jest: without it, a missing snapshot is written on the runner and the test passes.

**Tier 2 — minutes, every push, Linux.** An Android debug build. This is where a native dependency
that does not support the New Architecture, a Gradle misconfiguration or an AGP 9 incompatibility
surfaces. It runs on Linux, so it is cheap enough to keep on every pull request.

**Tier 3 — minutes and macOS-only, on a schedule or before release.** An iOS build, plus
`pod install`. A CocoaPods lockfile that drifted from `package.json` only fails here.

**Tier 4 — tens of minutes, nightly or pre-release.** End-to-end flows. Android on Linux with an
emulator; iOS on macOS with a simulator. See
[End-to-End with Detox or Maestro](end-to-end.md).

Resist promoting a tier because something once slipped through. The correct response to a missed
regression is usually a cheaper test at a lower tier, not a slower pipeline.

## Common patterns

### Verify the toolchain before blaming the code

`react-native doctor` is a real CLI command (`@react-native-community/cli@20.2.0`) and it checks
Node, the JDK, the Android SDK, Xcode and CocoaPods. Running it early turns "Gradle failed" into
"the runner has the wrong JDK".

```bash
npx react-native doctor
npx react-native info    # OS, toolchain and library versions, useful in a failure report
```

### Cache the things that dominate

| Cache | Why |
| --- | --- |
| npm cache, keyed on `package-lock.json` | Install drops from minutes to seconds |
| Gradle caches (`~/.gradle/caches`, `~/.gradle/wrapper`) | The single biggest Android win |
| CocoaPods (`ios/Pods`, `~/Library/Caches/CocoaPods`), keyed on `Podfile.lock` | Saves minutes per macOS job |
| Jest cache | Babel transformation dominates a cold run |

Always key a cache on the lockfile that determines its contents. A cache keyed on the branch name
serves stale dependencies and produces failures that disappear when you clear it — the worst kind.

### Fail on a dependency drift you did not intend

```bash
npm ci                       # fails if package.json and the lockfile disagree
git diff --exit-code ios/Podfile.lock   # after pod install: fails if Pods drifted
```

The second one catches the specific case where someone changed a native dependency and committed
`package.json` without the regenerated `Podfile.lock`.

### Upload something you can debug from

A failed native build is unreadable from a log tail. Upload the Gradle report, the Xcode build log,
and for end-to-end runs the screenshots and JUnit XML:

```bash
maestro test .maestro --format=JUNIT --output=reports/maestro.xml
```

### Keep the runner's Node pinned in one place

Put the version in `.nvmrc` and have the workflow read it, so the local and CI toolchains cannot
drift:

```text title=.nvmrc
22.13.0
```

## Platform differences

:::tabs
@tab iOS
macOS runners only. Xcode version is fixed by the runner image, so an image update can change your
build without any change in your repository — pin the Xcode version explicitly if your build is
sensitive to it. CocoaPods needs Ruby and Bundler; use `bundle exec pod install` so the CocoaPods
version comes from `Gemfile.lock` rather than from whatever the image happens to ship. A project
that has migrated to Swift Package Manager skips Ruby entirely, but that path is experimental — see
[CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md).
@tab Android
Runs on Linux, which is where you want it. Needs a JDK (17 is the common choice for AGP 9) and the
Android SDK, both present on most CI images. React Native 0.87 targets `compileSdk` 37 with
`buildToolsVersion` 37 and `minCompileSdk` 34; if the image lacks those, the SDK manager step must
install them. Emulator jobs need KVM or equivalent — without acceleration, boot alone can exceed the
job timeout.
:::

## Performance considerations

- **Split jobs by failure mode.** Lint, types and unit tests in one fast job; native builds in
  another. A typo should not wait on Gradle.
- **`--maxWorkers` is usually worth setting.** Hosted runners frequently report more cores than they
  can use. On a two-core container, `jest --maxWorkers=2` often beats the default. Measure on your
  runner.
- **Do not run `npm install` in CI.** `npm ci` is faster and reproducible, and it fails loudly when
  the lockfile is stale instead of silently resolving something new.
- **Skip the iOS job on documentation-only changes.** Path filters pay for themselves immediately at
  macOS pricing.
- **Reuse one build across end-to-end flows.** Building per flow multiplies the slowest step by the
  number of tests.
- **Watch cache size, not just hit rate.** A multi-gigabyte Gradle cache can take longer to restore
  than the build it saves.

## Security considerations

**Threat.** CI has broader credentials than any individual developer: signing keys, store API keys,
backend tokens. A pipeline that prints them, or that runs untrusted code with access to them, hands
them to anyone who can open a pull request.

**Exploit.** On most providers, a workflow triggered by a pull request from a fork can run arbitrary
code from that fork. If that workflow has access to secrets, the attacker's code has access to
secrets — one `curl` to an external host is enough. Separately, a test that logs a response body can
put a token straight into a log that is readable by anyone who can see the build.

**Fix.**

- Do not expose secrets to workflows triggered by untrusted pull requests. Keep signing and
  publishing in jobs that run only on protected branches or on tags.
- Keep signing material out of the repository entirely; inject it from the provider's secret store
  at build time. See [Android Signing](../build-and-release/android-signing.md) and
  [iOS Signing and Provisioning](../build-and-release/ios-signing.md).
- Pin third-party CI actions to a commit SHA rather than a moving tag, so an upstream compromise
  does not silently become yours.
- Point test builds at staging. A CI job with production credentials is a CI job that can modify
  production data on a flaky run.

**Verification.** Download the artefacts and logs from a build and search them:

```bash
grep -ri "BEGIN PRIVATE KEY\|bearer \|-----BEGIN\|password=" ./ci-artifacts
```

Anything found is already exposed to everyone with read access to the build. Rotate it, then fix
the job that emitted it.

## Common mistakes

- **Letting the runner choose Node.** Wrong: no `setup-node` step. Right: pin `22.13.0` or newer.
  React Native 0.87.1 requires it, and the failure on an older Node is an obscure syntax or
  resolution error rather than a version message.
- **Running `npm install` instead of `npm ci`.** Wrong: resolving fresh dependencies on every run.
  Right: `npm ci`. Otherwise CI tests a dependency tree nobody has locally, and a transitive bump
  breaks the build with no commit to blame.
- **Putting the iOS build on every push.** Wrong: a macOS job per commit. Right: Android per push,
  iOS nightly and before release. The cost is real and the incremental signal is small.
- **Running Jest without `--ci`.** Wrong: `npx jest`. Right: `npx jest --ci`. Without it a missing
  snapshot is created on the runner and a test with no expectation passes.
- **Caching on the branch name.** Wrong: `key: ${{ github.ref }}`. Right: key on the lockfile hash.
  A stale cache produces failures that vanish when the cache is cleared, which teaches everyone to
  clear the cache instead of reading the error.
- **Assuming a green unit suite means the app builds.** Jest never compiles native code. A library
  with no Fabric support, a broken Gradle plugin or a Pod that fails to install passes every Jest
  test. Keep the Android build in the per-push tier for exactly this reason.
- **Exposing signing secrets to fork pull requests.** Wrong: one workflow with every secret. Right:
  separate the untrusted-trigger jobs from the ones holding credentials.

## Related topics

- [Jest Setup](jest-setup.md) — the unit tier, and `--ci`.
- [End-to-End with Detox or Maestro](end-to-end.md) — the slowest tier and its macOS constraint.
- [Snapshot Testing](snapshot-testing.md) — why `--ci` changes snapshot behaviour.
- [CI Pipelines](../build-and-release/ci-pipelines.md) — producing and shipping signed artefacts.
- [Android Signing](../build-and-release/android-signing.md) — keeping keystores out of the repository.
- [iOS Signing and Provisioning](../build-and-release/ios-signing.md) — certificates on a hosted macOS runner.
- [Troubleshooting](../reference/troubleshooting.md) — specific build failures and their causes.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — why `tsc --noEmit` is the highest-value CI check in 0.87.
