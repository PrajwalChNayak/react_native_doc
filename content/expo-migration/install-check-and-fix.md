---
title: expo install --check and --fix
description: How the Expo CLI decides which dependency versions your project should have, what --check reports, what --fix rewrites, and why a bare npm install silently breaks an Expo app.
status: current
toolchain: expo
sdk: 57
---

`npx expo install --check` compares every dependency in your `package.json` against the version the
**installed SDK** expects, and reports the ones that do not match. `npx expo install --fix` rewrites
them to the expected versions.

These two flags exist because `npm install <pkg>` fetches `latest`, and `latest` is routinely built
for a different Expo SDK than the one your project is on. That mismatch does not fail at install
time. It fails at runtime, on a device, usually as a crash with a stack trace pointing into native
code you did not write.

## Why it exists / when to use it — and when NOT to

Run `--check` when you want to know, before you ship, whether your dependency tree still matches the
SDK. It is a good CI step: it exits non-zero when anything is out of line.

Run `--fix` after an SDK upgrade, after someone on the team has run a bare `npm install`, or when
`--check` has told you what is wrong and you agree with its answer.

Do **not** run `--fix` when you have deliberately pinned a package to a version the SDK does not
choose. It will undo that decision. Record the exception in `expo.install.exclude` instead — see
[Excluding a package you must pin yourself](#excluding-a-package-you-must-pin-yourself).

## Basic example

```bash
# Report mismatches, change nothing (when non-interactive)
npx expo install --check

# Rewrite mismatched versions without prompting
npx expo install --fix

# Machine-readable, for CI
npx expo install --check --json
```

Verified from `npx expo install --help` on `@expo/cli@57.0.24`:

```text
  Options
    --check     Check which installed packages need to be updated
    --dev       Save the dependencies as devDependencies
    --fix       Automatically update any invalid package versions
    --npm       Use npm to install dependencies. Default when package-lock.json exists
    --yarn      Use Yarn to install dependencies. Default when yarn.lock exists
    --bun       Use bun to install dependencies. Default when bun.lock or bun.lockb exists
    --pnpm      Use pnpm to install dependencies. Default when pnpm-lock.yaml exists
    -h, --help  Usage info
    --json      Output dependency information in JSON format with --check flag
```

## How it works

### Where the expected versions come from

`npx expo install` does not ask npm what the newest version of a package is. It asks the **SDK**
what version of that package belongs to it.

The answer lives in `expo/bundledNativeModules.json`, inside the `expo` package you have installed.
For SDK 57 (`expo@57.0.22`) that file maps 123 packages to versions. A sample, read out of the
installed file:

| Package | SDK 57 |
| --- | --- |
| `expo-dev-client` | `~57.0.19` |
| `expo-updates` | `~57.0.22` |
| `expo-image` | `~57.0.5` |
| `expo-file-system` | `~57.0.7` |
| `expo-notifications` | `~57.0.18` |
| `expo-secure-store` | `~57.0.4` |
| `expo-sqlite` | `~57.0.3` |
| `expo-camera` | `~57.0.5` |
| `expo-audio` | `~57.0.5` |
| `expo-video` | `~57.0.4` |
| `expo-constants` | `~57.0.18` |
| `expo-modules-core` | `~57.0.18` |
| `@expo/vector-icons` | `^15.0.2` |

The SDK also pins community libraries, which is why the versions differ from the ones the CLI half
of this site documents:

| Package | SDK 57 pins | CLI half (React Native 0.87) |
| --- | --- | --- |
| `react-native-gesture-handler` | `~2.32.0` | 3.3.0 |
| `react-native-reanimated` | `4.5.1` | 4.6.0 |
| `react-native-worklets` | `0.10.1` | 0.12.2 |
| `react-native-screens` | `~4.26.0` | 4.27.0 |
| `react-native-safe-area-context` | `~5.7.0` | 5.9.1 |
| `react-native-webview` | `13.16.1` | 14.0.1 |
| `@react-native-async-storage/async-storage` | `2.2.0` | 3.1.1 |

Gesture Handler is a whole major version apart. Copying a version number from a CLI page into an
Expo project is exactly the mistake `--check` is built to catch.

You can read any entry yourself rather than trusting a table:

```bash
node -p "require('./node_modules/expo/bundledNativeModules.json')['expo-image']"
```

> [!NOTE] There is a remote source too
> The CLI first tries a hosted versions endpoint and falls back to the local
> `expo/bundledNativeModules.json`. When it cannot reach the endpoint it says so:
> `Unable to reach well-known versions endpoint. Using local dependency map
> expo/bundledNativeModules.json for version validation`. Either way the answer is
> "what this SDK expects", never "what npm calls latest".

### What `--check` prints and what it exits with

When everything matches, the CLI prints `Dependencies are up to date` and exits **0**.

When something does not match, it lists each offender in the form
`<package>@<actual> - expected version: <expected>`, then warns:

```text
The following packages should be updated for best compatibility with the installed expo version:
Your project may not work correctly until you install the expected versions of the packages.
```

It then exits **1** — which is what makes it usable as a CI gate. In an interactive terminal it
first offers `Fix dependencies?`; in CI it does not prompt.

`--check --json` prints `{"dependencies": [...], "upToDate": false}` and still exits 1, so a script
can read the list without parsing console colours.

### What `--fix` does

`--fix` skips the prompt and performs the install immediately, using the same expected-version list.
It respects your lockfile's package manager: npm when `package-lock.json` exists, Yarn when
`yarn.lock` exists, pnpm for `pnpm-lock.yaml`, bun for `bun.lock`/`bun.lockb`. You can force one
with `--npm` / `--yarn` / `--pnpm` / `--bun`.

### Why a bare `npm install` is the problem

```bash
npx expo install expo-image        # correct — resolves ~57.0.5 from the SDK map
npm install expo-image             # wrong — resolves whatever npm calls latest
```

An `expo-*` package is a JavaScript API plus compiled native code. The native half must match the
`expo-modules-core` in your build and the React Native version underneath it. When it does not:

- `npm install` succeeds. There is no error.
- The bundle builds. There is no error.
- The app launches and the module's first native call fails — a missing method, a null native
  module, or a hard crash.

By that point the failure is several days and several commits away from the `npm install` that
caused it. `--check` closes that gap.

## Common patterns

### Gate CI on it

```bash title=.github/workflows/ci.yml
- run: npm ci
- run: npx expo install --check
- run: npx tsc --noEmit
```

`--check` exits 1, so the job fails on a mismatch without anyone having to read the log.

### Excluding a package you must pin yourself

Sometimes you genuinely need a version the SDK does not pin — a bug fix that landed after the SDK
froze, for instance. Tell the CLI, rather than fighting it every upgrade:

```json title=package.json
{
  "expo": {
    "install": {
      "exclude": ["react-native-webview"]
    }
  }
}
```

The CLI then prints that it skipped those packages, naming them, so the exception stays visible:
`Skipped checking dependencies: react-native-webview. These dependencies are listed in
expo.install.exclude in package.json.`

Every exclusion is compatibility risk you have personally accepted. Review the list at each SDK
upgrade and delete entries that are no longer needed.

### Turning validation off (and why you probably should not)

Two environment variables change the behaviour, both read by the installed CLI:

| Variable | Effect |
| --- | --- |
| `EXPO_OFFLINE` | Skips dependency validation entirely, printing `Skipping dependency validation in offline mode` |
| `EXPO_NO_DEPENDENCY_VALIDATION` | Disables the validation pass |

These exist for constrained environments — an air-gapped build machine, for example. Using them to
silence a mismatch you do not want to deal with converts an install-time warning into a runtime
crash on a user's device.

### Installing dev dependencies

```bash
npx expo install --dev @types/react
```

`--dev` saves into `devDependencies`. Extra arguments can be forwarded to the underlying package
manager after `--`:

```bash
npx expo install react -- --verbose
```

## Common mistakes

- **Running `--fix` before bumping `expo`.** The expected versions come from the *installed* SDK, so
  `--fix` on an SDK 56 project pins everything to SDK 56. Bump `expo` first — see
  [Upgrading Between SDK Versions](upgrading-sdk.md).
- **Using `npm install` for an `expo-*` package.**
  Wrong: `npm install expo-secure-store`. Right: `npx expo install expo-secure-store`.
  The wrong one succeeds quietly and fails on a device.
- **Treating a green `npm ci` as proof the project is healthy.** `npm ci` validates the lockfile,
  not SDK compatibility. Only `--check` compares against the SDK.
- **Assuming `--check` covers community libraries that the SDK does not pin.** It only knows about
  packages present in the SDK's version map. A library outside that map is your responsibility —
  check its peer range against React Native 0.86.3 yourself.
- **Adding a package to `expo.install.exclude` to make a warning go away.** The exclusion is a
  promise that you have verified compatibility. If you have not, you have only hidden the warning.
- **Copying a version number from a React Native CLI tutorial.** The SDK pins different versions;
  `react-native-gesture-handler` is a whole major version apart.
- **Setting `EXPO_NO_DEPENDENCY_VALIDATION=1` in CI to get a green build.** The build going green
  changes nothing about the app crashing on launch.

## Related topics

- [Upgrading Between SDK Versions](upgrading-sdk.md) — where `--fix` fits in the upgrade flow.
- [SDK to React Native Pairing](sdk-react-native-pairing.md) — why the SDK, not you, picks the React Native version.
- [Expo CLI Reference](cli-reference.md) — every `npx expo` command and its verified flags.
- [Expo Troubleshooting](troubleshooting.md) — what a version mismatch looks like when it reaches a device.
- [Expo Cheat Sheet](cheat-sheet.md) — the one-page version of all of this.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — the concept, at length.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — what to do after the install succeeds.
