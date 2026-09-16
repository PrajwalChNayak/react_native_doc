---
title: Dependency Auditing
description: Your Expo app runs every package in its dependency tree with the user's session in the same process. npm audit, lockfiles, npx expo install --check, and the install-script risk on build machines.
status: current
toolchain: expo
sdk: 57
---

Every package in your dependency tree ends up in one of two places:

- **In the bundle**, running inside your app with access to everything your app can read —
  including tokens you correctly stored in SecureStore, the moment your code reads them.
- **On the build machine**, where install scripts run with your environment variables in scope —
  including EAS secrets and CI tokens.

You wrote a few thousand lines. You ship a few hundred packages. Auditing is how you keep track of
what those packages are and whether they changed.

## Why it exists / when to use it — and when NOT to

Do this on every pull request that touches `package.json` or the lockfile, and on a schedule for
advisories published against packages you already have.

Do not treat any single tool as the audit. `npm audit` knows about **reported** vulnerabilities in
**known** versions. It says nothing about a package that was malicious from its first release, or
a maintainer account taken over yesterday. The habits below cover different gaps.

## Basic example

A CI step that covers the four checks this page describes:

```yaml title=.github/workflows/dependencies.yml
name: dependencies
on:
  pull_request:
  schedule:
    - cron: '0 6 * * 1'
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      # 1. Install exactly what the lockfile says. Fails if package.json and the lockfile disagree.
      - run: npm ci
      # 2. Known vulnerabilities in dependencies that ship.
      - run: npm audit --omit=dev --audit-level=high
      # 3. SDK 57 alignment: every Expo-managed package at the version the SDK expects.
      - run: npx expo install --check
      # 4. Registry signatures and provenance for what was installed.
      - run: npm audit signatures
```

## How it works

### 1. The lockfile is the audit target

`package.json` says `"^1.4.0"`. The lockfile says exactly `1.4.7`, with an integrity hash. Without
a committed lockfile, two installs a day apart can resolve different code, and you have audited
neither.

- **Commit the lockfile** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` or `bun.lock`).
- **Use `npm ci` in CI and on build machines**, not `npm install`. `npm ci` installs exactly the
  lockfile and fails if it does not match `package.json`, instead of silently rewriting it.
- **Review lockfile diffs.** A one-line `package.json` change that adds forty lockfile entries is
  forty new packages. That is the thing to look at.

### 2. `npm audit` — known vulnerabilities

```bash
npm audit
npm audit --omit=dev
npm audit --omit=dev --audit-level=high
```

`--omit=dev` limits the report to dependencies that are not dev dependencies, which is closer to
what ships. `--audit-level` sets the minimum severity that makes the command exit non-zero.

Read the output rather than reaching for `npm audit fix --force`. `--force` is allowed to install
**major** version changes, which in an Expo project routinely means a package built for a different
SDK.

Many advisories you will see are in build tooling that never reaches the device (a dev server, a
bundler dependency). They still run on your build machine, so do not dismiss them — but prioritise
by where the code runs.

### 3. `npx expo install --check` — SDK alignment

Expo SDK 57 expects specific versions of its native packages, read from
`expo/bundledNativeModules.json`. A package at the wrong version is not a vulnerability report, but
it is a correctness and security problem: you are running native code the SDK was not built or
tested against, and a mismatched native module fails at runtime, not at install time.

```bash
npx expo install --check   # report mismatches
npx expo install --fix     # correct them to the SDK 57 versions
```

`npx expo-doctor` runs broader project health checks, including dependency problems. It is a
separate package fetched by `npx`; the current published version at the time of writing is
`1.20.4`.

The rule that prevents most of these problems in the first place:

```bash
npx expo install expo-camera   # correct — resolves the SDK 57 version
```

A bare package-manager install fetches `latest`, which is frequently a version for a different SDK.
See [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

### 4. Install scripts — the build-machine risk

npm runs a package's `preinstall`, `install` and `postinstall` scripts during installation. They
run as your user, on your laptop or your CI runner or an EAS build worker, with the environment of
that process.

That environment can include `EXPO_TOKEN`, a Sentry auth token, a private registry token, EAS
environment variables, and cloud credentials. A malicious or compromised package does not need to
reach the device at all; it can read those and send them anywhere during `npm ci`.

List which installed packages declare install scripts:

```bash
node -e '
const fs = require("fs"), path = require("path");
const hooks = ["preinstall", "install", "postinstall"];
function walk(dir) {
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (name.startsWith("@")) { walk(full); continue; }
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(full, "package.json"), "utf8"));
      const found = hooks.filter((h) => pkg.scripts && pkg.scripts[h]);
      if (found.length) console.log(pkg.name + "@" + pkg.version + "  " + found.join(","));
    } catch {}
    walk(path.join(full, "node_modules"));
  }
}
walk("node_modules");
'
```

Keep that list short and known. A new entry in it is worth a human look before merging.

`npm ci --ignore-scripts` skips install scripts entirely. It is a strong control for jobs that
only need to **read** the code — linting, type-checking, the bundle scan — and it may break jobs
where a package genuinely needs its script. Test it per job rather than globally.

> [!WARNING] Build machines hold your secrets
> This is the concrete path from a compromised package to your EAS secrets. See
> [EAS Secrets and Build-Time Variables](eas-secrets.md): a `secret`-visibility variable is hidden in
> the dashboard and logs, but it is in the environment of the build job, where install scripts run.

### 5. Registry signatures

```bash
npm audit signatures
```

This verifies the registry signatures of installed packages, and provenance attestations where
packages publish them. It detects tampering between the registry and your machine. It does not
detect a malicious package that was published and signed legitimately.

## Platform differences

The dependency tree is the same for both platforms, but what reaches each binary differs:

- **JavaScript packages** go into the one bundle both platforms share.
- **Native code** from packages is compiled per platform: Gradle dependencies for Android, CocoaPods
  or Swift packages for iOS. `npm audit` does not scan those native dependency trees. If a native SDK
  has a published advisory, you find it through that SDK's own release notes.

## Common patterns

### Review a new dependency before adding it

Before `npx expo install some-package`, check:

```bash
npm view some-package version repository.url maintainers time.modified
npm view some-package scripts
```

- Does it have install scripts? Why?
- How many maintainers, and did that change recently?
- Is it a typo of a popular name (`expo-secure-stor`, `react-native-reanimate`)?
- Does it need native code? Then it also needs a development build, and it is in your binary.

### Keep dependencies few

Every package removed is one less thing to audit. `npx expo install --check` and a periodic
`npm ls --depth=0` against what the app actually imports catch packages nobody uses any more.

### Scan the output, not just the input

A dependency can embed a credential or an endpoint in the code it ships. The bundle scan from
[What Ships Inside the Bundle](what-ships-in-the-bundle.md) belongs in the same pipeline:

```bash
npx expo export --platform android
grep -r -a -i -E "sk_live|sk_test|AKIA|BEGIN (RSA|EC|PRIVATE)" dist/ && exit 1 || echo "bundle scan clean"
```

## Security considerations

**Threat.** A package in your tree — directly, or five levels down — is compromised. It either runs
code during installation on a machine holding your publish and build secrets, or ships code in your
bundle that reads user tokens at runtime.

**Exploit.** The install-time path needs no device. A package with this in its `package.json` runs
on every `npm ci`:

```json title=package.json (a malicious dependency)
{
  "name": "innocent-looking-helper",
  "version": "2.0.1",
  "scripts": {
    "postinstall": "node collect.js"
  }
}
```

`collect.js` reads `process.env` and posts it to a remote server. On a build worker that includes
every variable the job was given.

To see the exposure on your own pipeline without any malicious code, add a temporary CI step that
prints only the **names** of environment variables visible during install:

```bash
node -e 'console.log(Object.keys(process.env).sort().join("\n"))'
```

Every name in that list is readable by every install script in your tree.

**Fix.**

1. Commit the lockfile and install with `npm ci`.
2. Run `npm audit --omit=dev`, `npx expo install --check` and `npm audit signatures` in CI.
3. Maintain the install-script inventory and review new entries.
4. Use `npm ci --ignore-scripts` in jobs that do not need scripts.
5. Give install steps the fewest secrets possible; inject publish tokens only into the step that
   publishes.
6. Sign updates, so a compromised CI token alone cannot ship code — see
   [EAS Update Signing](update-signing.md).

**Verification.**

- `npm ci` fails on a branch where you hand-edit `package.json` without updating the lockfile.
- `npx expo install --check` exits cleanly on your main branch.
- The environment-name listing for install steps no longer includes `EXPO_TOKEN` or signing
  material.
- A pull request that adds a package with a `postinstall` script produces a visible diff in your
  install-script inventory.

## Common mistakes

- **Not committing the lockfile.** You are auditing something other than what gets built.
- **Running `npm install` in CI.** It can rewrite the lockfile. Use `npm ci`.
- **`npm audit fix --force` in an Expo project.** It can jump major versions past what SDK 57
  supports. Fix deliberately and re-run `npx expo install --check`.
- **Installing SDK packages without `npx expo install`.** You get `latest`, not the SDK 57 version.
- **Treating a clean `npm audit` as "safe".** It only knows about reported issues in known versions.
- **Giving every CI step every secret.** Install scripts can read them.
- **Assuming only runtime dependencies matter.** Dev dependencies run on the build machine, which is
  where your secrets are.
- **Ignoring native dependencies.** `npm audit` does not see Gradle or CocoaPods trees.

## Related topics

- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why SDK packages go through `npx expo install`.
- [npx expo install --check and --fix](../expo-migration/install-check-and-fix.md) — using the alignment check during upgrades.
- [EAS Secrets and Build-Time Variables](eas-secrets.md) — what install scripts can reach on a build worker.
- [EAS Update Signing](update-signing.md) — limiting what a stolen publish token can do.
- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — the bundle scan to run alongside these checks.
- [Testing in CI](../expo-testing/ci.md) — where these jobs sit in a pipeline.
