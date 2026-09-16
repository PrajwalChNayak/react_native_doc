---
title: Upgrading Between SDK Versions
description: The real upgrade flow for an Expo project — bump expo, run expo install --fix, read the changelog, and regenerate or hand-merge the native directories.
status: current
toolchain: expo
sdk: 57
---

Upgrading an Expo project means moving the whole version line at once: the `expo` package, every
`expo-*` package, the React Native version underneath, and the community libraries the SDK pins.
You do not pick those versions yourself — the SDK does, and `npx expo install --fix` applies them.

This page documents the upgrade to **SDK 57**, which ships **React Native 0.86.3**.

## Why it exists / when to use it — and when NOT to

Upgrade when you want a newer SDK's modules, a newer React Native, or platform support the
current SDK lacks (a new Android target API, a new Xcode requirement). Upgrading is also how you
stay on a version that still receives fixes.

Do **not** upgrade to solve a bug you have not diagnosed. An SDK bump changes ~120 native modules
and the React Native version in one step; if something was already broken, you now have two
problems and no way to tell them apart.

And do **not** try to upgrade React Native on its own. Each SDK targets exactly one React Native
version and the SDK packages are compiled against it — see
[SDK to React Native Pairing](sdk-react-native-pairing.md).

## Basic example

The flow documented on `docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/`, in order:

:::tabs
@tab npm
```bash
# 1. Bump the expo package itself
npm install expo@^57.0.0

# 2. Bring every other dependency in line with the new SDK
npx expo install --fix

# 3. Check the project for known problems
npx expo-doctor
```
@tab yarn
```bash
yarn add expo@^57.0.0
npx expo install --fix
npx expo-doctor
```
@tab pnpm
```bash
pnpm add expo@^57.0.0
npx expo install --fix
npx expo-doctor
```
@tab bun
```bash
bun install expo@^57.0.0
npx expo install --fix
npx expo-doctor
```
:::

Then update the native side, which depends on which strategy your project uses — see
[Step 3: the native directories](#step-3-the-native-directories) below.

> [!NOTE] `npx expo install expo@^57.0.0` also works
> The Expo CLI special-cases the `expo` package: it installs it first, then respawns itself so the
> new CLI version handles everything after. `npx expo install expo@^57.0.0 --fix` does steps 1 and
> 2 in one command. What you may **not** do is combine `expo@<version>` with other packages *and*
> `--fix`/`--check` — the CLI rejects that with
> `Cannot install other packages with expo@^57.0.0 and --fix or --check`.
>
> The published walkthrough uses the two-step form, so that is what this page leads with.

## How it works

### Step 1: bump `expo`

`expo@^57.0.0` is what pulls in the new CLI, the new `bundledNativeModules.json`, and the new
`sdkVersion` the rest of the tooling reads. Nothing else can be resolved correctly until this
package is on the target version, which is why it goes first and alone.

### Step 2: `npx expo install --fix`

`--fix` walks your `package.json`, compares every dependency against the version the installed SDK
expects, and rewrites the ones that do not match. This is the step that moves `expo-image`,
`expo-router`, `react-native`, `react`, `react-native-reanimated` and everything else onto the SDK
57 line at the same time.

Run `npx expo install --check` first if you want to see the diff before it is applied. Both flags
are covered in detail in [expo install --check and --fix](install-check-and-fix.md).

### Step 3: the native directories

This is the step where the two strategies diverge, and getting it wrong is how people lose work.

:::tabs
@tab Continuous Native Generation
You do not commit `ios/` and `android/`. Delete them; they regenerate on the next build.

```bash
rm -rf ios android
npx expo prebuild
```

Or skip the explicit prebuild — `npx expo run:android` and `npx expo run:ios` regenerate what they
need.
@tab Committed native directories
You own `ios/` and `android/`, so nothing regenerates them for you. Reinstall pods and hand-apply
the native diff:

```bash
npx pod-install
```

Then work through the **Native project upgrade helper** for the React Native version change
(0.85.x to 0.86.3 if you came from SDK 56) and apply the diff by hand.
:::

> [!DANGER] `npx expo prebuild` deletes hand-edited native code
> In SDK 57 prebuild **clears and regenerates** the native directories by default. Verified from
> the installed CLI: the `clean` option is computed as `!args['--no-clean']`, so clean is on unless
> you pass `--no-clean`.
>
> If you hand-edited `ios/` or `android/` and then run prebuild, those edits are gone. Pick one
> strategy and write it down for the team — see
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

### Step 4: read the changelog

The SDK changelog lives at `expo.dev/changelog/sdk-57`. Read the **"Upgrading your app"** section
specifically: it lists the breaking changes, the deprecations, and the config keys that moved.
`npx expo install --fix` fixes versions; it does not rewrite your code or your app config.

For SDK 57 the changes most likely to touch your project are:

| Change | What it means for you |
| --- | --- |
| React Native 0.86 | Android edge-to-edge fixes, light/dark emulation in React Native DevTools, rendering/layout/animation fixes |
| `expo prebuild` clears native directories by default | See the danger callout above |
| `expo-av` is not in the SDK 57 version map | Migrate to `expo-audio` and `expo-video` |
| Bundled bumps | reanimated 4.3 to 4.5, worklets 0.8 to 0.10, gesture-handler 2.31 to 2.32 |
| `expo-dev-client` | The iOS launcher can auto-launch the most recent project or show the launcher |
| `expo-image` | New `writeToCacheAsync` and `readFromCacheAsync` |
| `expo-router` | `Stack.Toolbar.Badge` in header placements; toolbar menu icons on Android |
| `expo-navigation-bar` | `setStyle` and `setHidden` now apply to React Native `<Modal>` windows |

## Common patterns

### Upgrade one SDK at a time

If you are on SDK 55, go 55 to 56 to 57 rather than 55 to 57 in one jump. Each hop is a smaller
set of breaking changes, and when something breaks you know which release did it. The React Native
version moves with every hop — 0.83.10, then 0.85.3, then 0.86.3 — so a multi-SDK jump is also a
multi-version React Native jump.

### Verify before you celebrate

```bash
npx expo install --check     # exits 1 if anything is still mismatched
npx expo-doctor              # project-level checks
npx tsc --noEmit             # your own code against the new types
```

Then run the app on **both** platforms on a real device or simulator. Native module mismatches do
not show up at install time; they show up at runtime, which means a clean `npm install` proves
nothing.

### Clear the caches when the bundler misbehaves

After an SDK bump, stale Metro cache produces errors that look like code errors:

```bash
npx expo start --clear
```

### `expo.install.exclude` for a package you must pin yourself

If you genuinely need a version the SDK does not pin, record that decision in `package.json` so
`--check` and `--fix` stop fighting you:

```json title=package.json
{
  "expo": {
    "install": {
      "exclude": ["react-native-webview"]
    }
  }
}
```

The CLI then prints that it skipped those packages rather than silently ignoring them. Use this
sparingly — every exclusion is a compatibility risk you have taken on personally.

## Migrating from the old upgrade command

> [!LEGACY] `expo upgrade` no longer exists
> Older tutorials tell you to run `expo upgrade`. The local CLI removed it. Running it prints:
>
> ```text
>   $ expo upgrade is not supported in the local CLI, please follow this guide https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ instead
> ```
>
> There is no single command any more. The flow at the top of this page is the replacement. See
> [expo init and Other Removed Commands](removed-commands.md).

## Common mistakes

- **Running `npx expo install --fix` before bumping `expo`.** The CLI resolves versions from the
  *installed* SDK. If `expo` is still on 56, `--fix` will helpfully pin everything to SDK 56.
  Bump `expo` first.
- **Bumping `react-native` by hand to match the CLI half of this site.** SDK 57 ships 0.86.3. The
  SDK packages are built against it, and `--check` will flag your change as a mismatch. See
  [SDK to React Native Pairing](sdk-react-native-pairing.md).
- **Using `npm install` for the other packages after the bump.**
  Wrong: `npm install expo-image@latest` — `latest` is built for whatever SDK is current, not
  yours. Right: `npx expo install expo-image`.
- **Hand-editing `ios/` or `android/` and then running `npx expo prebuild` as part of the upgrade.**
  The default is clean, so your edits are deleted. If you own the native directories, do not run
  prebuild — run `npx pod-install` and apply the native diff yourself.
- **Skipping the changelog because `--fix` exited zero.** `--fix` only aligns versions. Removed
  APIs, renamed config keys and changed defaults are still your job.
- **Jumping several SDKs at once on a real project.** You will be debugging three releases of
  breaking changes simultaneously with no way to bisect.
- **Testing only on one platform.** iOS and Android ship different native code for the same SDK
  package; a mismatch commonly crashes one and not the other.
- **Assuming `npm install` succeeding means the upgrade worked.** Native module version mismatches
  fail at runtime. Launch the app.

## Related topics

- [expo install --check and --fix](install-check-and-fix.md) — what `--fix` actually compares, and why.
- [SDK to React Native Pairing](sdk-react-native-pairing.md) — why you cannot move React Native on its own.
- [expo init and Other Removed Commands](removed-commands.md) — including `expo upgrade` and `expo doctor`.
- [Expo CLI Reference](cli-reference.md) — the full verified `npx expo` command surface.
- [Expo Troubleshooting](troubleshooting.md) — what a botched upgrade looks like at runtime.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the destructive regeneration step in detail.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — pick one before you upgrade.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — the concept behind the command.
