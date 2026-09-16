---
title: Dependency Auditing
description: Third-party code runs with your app's full privileges and, in a native package, on your build machine too. Audit it like you mean it.
status: current
toolchain: cli
---

A React Native app is mostly other people's code. A modest project pulls in several hundred npm
packages, dozens of native Android and iOS dependencies, and a build toolchain that downloads more
at install time. Every one of those runs with your app's full privileges on the device — every
permission you hold, every credential in your Keystore, every request your app is authorised to
make.

And the native ones run somewhere else too: on your build machine, as your build user, during
`npm install`. That is a second attack surface with a different blast radius, and it is the one
this page spends the most time on.

## Threat

Four distinct ways a dependency hurts you.

1. **A known vulnerability, unpatched.** The boring one. A transitive package has a published
   advisory and nobody looked.
2. **A compromised release.** A maintainer's account is taken over, or a maintainer hands the
   package to someone else, and a new version ships with additional behaviour. Historically this
   has meant credential harvesting from CI environments and cryptocurrency address swapping — both
   of which target the **build machine**, not the end user.
3. **A malicious install script.** `postinstall` runs arbitrary code with your shell's privileges,
   before you have run a single test. Native React Native packages routinely have legitimate
   install scripts, which is what makes a malicious one plausible.
4. **A package that is abandoned.** No advisory, no attack, only a native module that no
   longer builds against React Native 0.87 and whose maintainer stopped answering. This is the
   most common failure by far and it is a security problem too, because the workaround is usually
   pinning to an old version of something else.

## Exploit: what `postinstall` can do

The demonstration is short because the attack is short. A package's `package.json` can carry:

```json title=what a malicious package ships
{
  "name": "innocuous-native-helper",
  "version": "1.4.3",
  "scripts": {
    "postinstall": "node ./scripts/setup.js"
  }
}
```

`npm install` runs that script as you, in your repository, with your environment. It can read
`~/.npmrc` and `~/.gitconfig`, environment variables holding CI secrets, your signing
configuration, and anything else the build user can reach. It can modify files in
`node_modules` so the change never appears in your diff.

You do not need to speculate about whether a package does this. Ask:

```bash
# Every lifecycle script a package declares, straight from the registry.
npm view react-native-some-package scripts

# What the package would actually put on disk, without running anything.
npm pack react-native-some-package@1.4.3
tar -tzf react-native-some-package-1.4.3.tgz
tar -xzf react-native-some-package-1.4.3.tgz && cat package/package.json
```

And you can take the capability away from the whole install:

```bash
# Install without running any lifecycle scripts.
npm ci --ignore-scripts
```

> [!WARNING] `--ignore-scripts` breaks some legitimate native packages
> React Native's own iOS setup and several native modules do real work in install scripts. Turning
> them off globally is a change to test, not a switch to flip on a Friday. The practical middle
> ground is `--ignore-scripts` in CI for jobs that only need to type-check or lint, plus a
> reviewed allow-list for the builds that produce artifacts.

## Fix

### 1. Lockfile discipline

The lockfile is the only record of exactly what you installed. Treat it as source.

```bash
# In CI and in any reproducible build: install exactly the lockfile, and fail
# if package.json and the lockfile disagree.
npm ci

# Never in CI: this resolves new versions and rewrites the lockfile.
# npm install
```

Rules worth enforcing:

- **Commit `package-lock.json`.** A repository without one installs something different every day.
- **Use `npm ci`, never `npm install`, in automation.** `npm ci` fails on a mismatch instead of
  quietly resolving something new.
- **Review lockfile diffs.** A pull request that changes one dependency should not change two
  hundred lines of lockfile. When it does, ask why.
- **Do the same for the native lockfiles.** `ios/Podfile.lock` and `Gemfile.lock` are lockfiles
  with the same properties and the same failure mode when uncommitted.
- **Pin transitive versions when you must** with an `overrides` block, and leave a comment saying
  which advisory it is for so it can be removed later.

```json title=package.json
{
  "overrides": {
    "some-transitive-package": "1.2.4"
  }
}
```

### 2. Run `npm audit`, and make it mean something

```bash
# The full report.
npm audit

# The CI gate. Exit code is non-zero when something at or above the level exists.
npm audit --audit-level=high

# Production dependencies only — a dev-only advisory is a different priority.
npm audit --omit=dev

# Verify that what you installed was signed by the registry.
npm audit signatures
```

`npm audit signatures` is the underused one: it checks registry signatures on the packages in your
lockfile and catches tampering between the registry and your disk.

Two honest limits on `npm audit`:

- **It reports advisories, not risk.** A prototype-pollution advisory in a build-time-only
  dependency is not the same as a vulnerability in your HTTP client, and the tool does not
  distinguish. Triage; do not paste the summary into a ticket and call it done.
- **`npm audit fix --force` upgrades across major versions.** In a React Native project that
  regularly means a native module jumping to a version incompatible with your React Native
  release. Run the fix, then read the diff, then build both platforms.

### 3. Check a package before you add it

Run this before the first install, not after the incident. Every command here is real and takes
seconds.

```bash
PKG=react-native-some-package

# Version, and whether its peer range includes your React Native.
npm view "$PKG" version peerDependencies

# When was it last published? A native module untouched for two years is a
# native module that predates the New Architecture becoming mandatory.
npm view "$PKG" time.modified

# New Architecture support: a TurboModule or Fabric component declares codegen.
npm view "$PKG" codegenConfig

# What it drags in, and what it runs at install time.
npm view "$PKG" dependencies scripts

# Who can publish it.
npm view "$PKG" maintainers
```

The `codegenConfig` check is the fastest reliable signal for React Native 0.87. A package that
declares it has a Codegen spec and has been built for TurboModules or Fabric:

```json title=what a New Architecture package declares
{
  "codegenConfig": {
    "name": "RNSomePackageSpec",
    "type": "modules",
    "jsSrcsDir": "src"
  }
}
```

A package with no `codegenConfig` is not automatically broken — interop layers still carry many
older libraries — but it is a package that has not been updated for the architecture that has been
the only one since 0.82. Combine it with the publish date and the peer range before you decide.

Full evaluation criteria are on
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md). The security
angle is narrower: **an unmaintained native dependency is a vulnerability you cannot patch**,
because fixing it means forking native code or removing the feature.

### 4. Reduce the number of dependencies

The most effective audit control is having less to audit. Before adding a package, ask:

- Is this a few lines of code I would rather own? A date formatter, a debounce, a
  deep-equal — these are the packages most often compromised precisely because they are everywhere
  and nobody reads them.
- Does it pull in a native module? A native dependency adds install-time script risk, build
  breakage risk, and a permission surface. The bar should be higher.
- Is there a core React Native API that does this? Check the export list before reaching for a
  package.

### 5. Know what the native side pulls in

npm is not the only supply chain in a React Native app.

:::tabs
@tab Android
Gradle resolves Maven dependencies at build time, including transitive ones you never named.

```bash
# Everything that ends up on the release classpath.
cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath
```

Gradle supports dependency locking, which gives Maven dependencies the same reproducibility your
npm lockfile gives JavaScript. Turn it on for release builds if your threat model includes a
compromised Maven artifact.

@tab iOS
CocoaPods resolves pods and writes `ios/Podfile.lock`, which records the exact version and a
checksum of each pod.

```bash
# What is actually installed, with versions.
cd ios && bundle exec pod outdated
```

Commit `Podfile.lock` and `Gemfile.lock`. `bundle install` and `bundle exec pod install` then
reproduce the same dependency set on every machine, which is the only way a build machine
compromise becomes detectable.
:::

### 6. Automate the recurring part

A one-off audit is a snapshot. The advisories that matter are the ones published after you
shipped.

```bash title=scripts/audit.sh
#!/usr/bin/env bash
set -euo pipefail

# Fail the build on anything high or critical in production dependencies.
npm audit --omit=dev --audit-level=high

# Verify registry signatures for everything in the lockfile.
npm audit signatures

# Fail if the lockfile is out of sync with package.json.
npm ci --dry-run >/dev/null

# Report — do not fail on — outdated packages, so the list stays visible.
npm outdated || true
```

Run it on every pull request and on a schedule. The scheduled run is the one that catches an
advisory published on a Tuesday against code you shipped last month. Wire it into
[CI for Mobile](../testing/ci-for-mobile.md).

## Verification

### 1. Prove your CI install is reproducible

Delete `node_modules`, run `npm ci`, and confirm the lockfile is unchanged afterwards:

```bash
rm -rf node_modules
npm ci
git diff --exit-code package-lock.json
```

A modified lockfile after `npm ci` means something in your pipeline is resolving versions at build
time, which means the artifact you ship is not the artifact you tested.

### 2. Prove the audit gate actually fails

Temporarily add a package with a known high-severity advisory and confirm your pipeline goes red.
An audit step that has never failed is a step nobody has verified.

### 3. Inventory what ships

```bash
# Production dependency tree, deduplicated.
npm ls --omit=dev --all > dependency-inventory.txt
```

Keep this between releases and diff it. A new transitive package appearing after a minor bump is
worth thirty seconds of attention, and this is the cheapest way to notice.

### 4. Check the install scripts you are actually running

```bash
# Every lifecycle script in the installed tree.
find node_modules -maxdepth 3 -name package.json -not -path "*/node_modules/*/node_modules/*" \
  -exec node -e '
    const p = require(process.argv[1]);
    const s = p.scripts || {};
    for (const k of ["preinstall", "install", "postinstall", "prepare"]) {
      if (s[k]) console.log(p.name + "  " + k + ": " + s[k]);
    }
  ' {} \; 2>/dev/null | sort -u
```

Read the list once. It is shorter than you expect, and every entry is code that ran on your
machine.

### 5. Confirm what a new dependency added to the shipped app

After adding any native package, re-run the permission diff from
[Permissions Hygiene](permissions-hygiene.md) and the host enumeration from
[Network Security Config and ATS](network-security-config.md). A library that quietly added
`ACCESS_FINE_LOCATION` or a new reporting endpoint is a finding you will not get from `npm audit`.

## Common mistakes

- **Running `npm install` in CI.** It resolves new versions, so the build is not reproducible and
  the lockfile review you did means nothing.
- **Not committing `Podfile.lock` or `Gemfile.lock`.** JavaScript is only one of three dependency
  graphs in the project.
- **`npm audit fix --force` without reading the diff.** In a React Native project this is how a
  native module ends up at a version that does not build, discovered on release day.
- **Treating every advisory as equally urgent.** Triage by whether the code path ships and whether
  it is reachable. A dev-dependency advisory and a vulnerability in your networking stack are not
  the same ticket.
- **Ignoring `npm audit signatures`.** It is the check that catches tampering rather than known
  bugs, and almost nobody runs it.
- **Adding a native module for a small feature.** The install-script surface, the build risk and
  the permission surface all scale with native dependencies, not with lines of JavaScript.
- **Assuming a popular package is a maintained package.** Download count measures the past. The
  publish date and the peer range measure the present.
- **Skipping the `codegenConfig` check.** A native module with no Codegen spec and no recent
  release is a migration problem waiting for the next React Native upgrade.
- **Auditing once, at the start of the project.** The advisory that matters has not been published
  yet.

## Related topics

- [Threat Model](threat-model.md) — the npm boundary, and what crossing it means.
- [Permissions Hygiene](permissions-hygiene.md) — the capabilities a compromised dependency inherits.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — the full evaluation checklist for a native library.
- [Autolinking and react-native.config.js](../native-modules/autolinking.md) — how a native dependency gets into your build in the first place.
- [CI for Mobile](../testing/ci-for-mobile.md) — where the audit gate runs.
- [Release Checklist](../build-and-release/release-checklist.md) — the inventory diff before you ship.
