---
title: Expo Cheat Sheet
description: Every Expo SDK 57 fact worth memorising on one page — commands, the SDK to React Native pairing, config keys, the prebuild danger and the Expo Go boundary.
status: current
toolchain: expo
sdk: 57
---

One page, scannable, SDK 57. Every number here was read out of the installed packages, not from
memory. Each section links to the page that explains why.

## Versions

| Thing | Value |
| --- | --- |
| `expo` | **57.0.22** — Expo SDK 57 |
| `@expo/cli` | **57.0.24** |
| `expo-router` | **57.0.21** |
| `eas-cli` | **24.5.0** — separate tool |
| `expo-doctor` | **1.20.4** — separate tool |
| React Native | **0.86.3** |
| Prerequisites | Node.js LTS; macOS, Windows (PowerShell or WSL 2), or Linux |

SDK 58 exists only as `canary` / `preview`. **SDK 57 is current stable.**

## SDK to React Native pairing

| Expo SDK | React Native |
| --- | --- |
| SDK 55 | 0.83.10 |
| SDK 56 | 0.85.3 |
| **SDK 57** | **0.86.3** |

**You cannot upgrade React Native independently of the SDK.** Each SDK targets one React Native
version and its ~120 native modules are compiled against it. Move the SDK, and React Native moves
with it. → [SDK to React Native Pairing](sdk-react-native-pairing.md)

```bash
node -p "require('./node_modules/expo/bundledNativeModules.json')['react-native']"   # 0.86.3
```

### The 0.86 vs 0.87 trap

This site's CLI half documents React Native **0.87.1**. You are on **0.86.3**.

| | You (SDK 57 / 0.86) | CLI half (0.87) |
| --- | --- | --- |
| Strict TypeScript API | opt-in | default |
| `ViewInstance`, `TextInputInstance`, `HostInstance` | **do not exist** | exist |
| `react-native/Libraries/*` deep imports | resolve (still a bad idea) | type error |

Ref types: `useRef<TextInput \| null>(null)`, never `useRef<TextInputInstance \| null>(null)`.

## Create a project

| Manager | Command |
| --- | --- |
| npm | `npx create-expo-app@latest MyApp` |
| yarn | `yarn create expo-app MyApp` |
| pnpm | `pnpm create expo-app MyApp` |
| bun | `bun create expo MyApp` |

Options: `--template <name>`, `--example <name>`.

> [!LEGACY] `expo init` was removed
> It no longer exists. `expo eject` is gone too. → [Removed Commands](removed-commands.md)

## Run

```bash
npx expo start                  # dev server (default command)
npx expo start --dev-client     # target a development build
npx expo start --go             # target Expo Go
npx expo start --clear          # clear the Metro cache
npx expo start --tunnel         # reachable from any network
npx expo run:android            # local native build + run
npx expo run:ios                # local native build + run (macOS)
```

## The install rule

```bash
npx expo install expo-image expo-secure-store    # correct
npm install expo-image expo-secure-store         # WRONG
```

`npx expo install` resolves the version matching your **installed SDK** from
`expo/bundledNativeModules.json`. A bare `npm install` fetches `latest`, routinely built for a
different SDK. **Native module mismatches fail at runtime, not install time.**

| Command | Effect |
| --- | --- |
| `npx expo install <pkg>` | Install at the SDK-matched version |
| `npx expo install --check` | Report mismatches. Exit 1 if any |
| `npx expo install --fix` | Rewrite mismatched versions |
| `npx expo install --check --json` | Machine-readable, for CI |
| `npx expo install --dev <pkg>` | Save to `devDependencies` |

→ [expo install --check and --fix](install-check-and-fix.md)

Pin something deliberately? Record it, do not fight the tool:

```json title=package.json
{"expo": {"install": {"exclude": ["react-native-webview"]}}}
```

## Upgrade an SDK

```bash
npm install expo@^57.0.0      # 1. bump expo first
npx expo install --fix        # 2. align everything else
npx expo-doctor               # 3. project health check
# 4. CNG: rm -rf ios android    |    committed native: npx pod-install + hand-merge
# 5. read expo.dev/changelog/sdk-57
```

One SDK at a time. `--fix` fixes versions, not your code. → [Upgrading Between SDK Versions](upgrading-sdk.md)

## `npx expo` commands

| Command | Use |
| --- | --- |
| `start` | Dev server (the default) |
| `install` / `add` | SDK-matched installs |
| `prebuild` | Generate `ios/` and `android/` |
| `run:android` / `run:ios` | Local native build and run |
| `export` | Bundle and assets into `dist/` |
| `config` | Print the resolved app config |
| `customize` | Take ownership of a generated file |
| `lint` | ESLint with Expo's setup |
| `serve` | Serve a previous export locally |
| `login` / `logout` / `whoami` / `register` | Account session |

Not here: `doctor` (→ `npx expo-doctor`), `init` (→ `npx create-expo-app`), `eject` (→ prebuild),
`upgrade` (→ a sequence), `build:*` / `publish` / `credentials:*` (→ `eas-cli`).
→ [Expo CLI Reference](cli-reference.md)

## The prebuild danger

> [!DANGER] `npx expo prebuild` clears and regenerates the native directories by default
> Verified: the CLI computes `clean` as `!args['--no-clean']`. Hand-edited `ios/` or `android/` code
> is **deleted**.

Pick one strategy. Write it in the README.

| Strategy | Rule | Cost |
| --- | --- | --- |
| **Continuous Native Generation** | Never commit `ios/`/`android/`. Native changes go in config plugins. | Limited to what plugins express |
| **Committed native directories** | Prebuild once, commit, never run prebuild again. | You own every upgrade by hand |

Mixing them — hand-editing native code *and* running prebuild — is the failure mode.
→ [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md)

```bash
npx expo prebuild                 # clean regenerate (default)
npx expo prebuild --no-clean      # layer onto existing folders
npx expo prebuild -p android      # one platform
```

## Expo Go vs development build

| | Expo Go | Development build |
| --- | --- | --- |
| What it is | A pre-built app from the store | Your own binary, your own native deps |
| Native modules | A **fixed** set | Whatever your project installs |
| Adding a library with custom native code | **Breaks** — runtime error, not build error | Works |
| Use it for | Trying the SDK | Developing a real app |

Expo Go is a sandbox. The point at which a project needs a development build arrives early.
→ [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md)

```bash
npx expo run:android          # build a development build locally
npx expo run:ios              # macOS
npx expo start --dev-client   # then develop against it
```

## App config keys

Top-level, in `app.json` / `app.config.ts`:

| Key | Notes |
| --- | --- |
| `name` | **Required** |
| `slug` | **Required** |
| `version` | `CFBundleShortVersionString` / `versionName` |
| `scheme` | Deep links. Build-time only — no effect in Expo Go |
| `orientation` | `default` / `portrait` / `landscape` |
| `icon` | 1024x1024 PNG recommended |
| `userInterfaceStyle` | `light` / `dark` / `automatic` |
| `runtimeVersion` | String, or `{policy}`: `nativeVersion`, `sdkVersion`, `appVersion`, `fingerprint` |
| `updates` | `expo-updates` config (`url`, `checkAutomatically`, ...) |
| `plugins` | `"name"` or `["name", {options}]` |
| `experiments` | `typedRoutes`, `reactCompiler`, `tsconfigPaths`, ... — break without notice |
| `ios` | `bundleIdentifier`, `infoPlist`, `entitlements`, `supportsTablet`, ... |
| `android` | `package`, `permissions`, `blockedPermissions`, `adaptiveIcon`, ... |
| `web` | `output` (`single` / `static` / `server`), `favicon`, ... |
| `extra` | Arbitrary values via `Constants.expoConfig.extra`. **Not private** |

Also present: `description`, `owner`, `sdkVersion`, `platforms`, `githubUrl`, `backgroundColor`,
`primaryColor`, `developmentClient`, `locales`, `buildCacheProvider`.
Deprecated: `androidStatusBar`, `assetBundlePatterns`.

**No top-level `splash` key in SDK 57.** Use the `expo-splash-screen` plugin.
Also absent: `notification`, `jsEngine`, `packagerOpts`, `entryPoint`, `newArchEnabled`.

Unknown keys are **silently ignored**. Use `app.config.ts` typed as `ExpoConfig` so a typo is a
compile error. → [App Config Reference](app-config-reference.md)

```bash
npx expo config --type introspect   # what plugins will do, without running prebuild
```

## SDK 57 package versions

Exactly what `npx expo install` resolves:

| Package | SDK 57 |
| --- | --- |
| `expo-dev-client` | `~57.0.19` |
| `expo-updates` | `~57.0.22` |
| `expo-image` | `~57.0.5` |
| `expo-file-system` | `~57.0.7` |
| `expo-font` | `~57.0.4` |
| `expo-splash-screen` | `~57.0.9` |
| `expo-notifications` | `~57.0.18` |
| `expo-secure-store` | `~57.0.4` |
| `expo-sqlite` | `~57.0.3` |
| `expo-crypto` | `~57.0.3` |
| `expo-haptics` | `~57.0.3` |
| `expo-clipboard` | `~57.0.2` |
| `expo-sensors` | `~57.0.3` |
| `expo-background-task` | `~57.0.17` |
| `expo-task-manager` | `~57.0.17` |
| `expo-camera` | `~57.0.5` |
| `expo-location` | `~57.0.17` |
| `expo-audio` | `~57.0.5` |
| `expo-video` | `~57.0.4` |
| `expo-auth-session` | `~57.0.12` |
| `expo-local-authentication` | `~57.0.3` |
| `expo-linking` | `~57.0.10` |
| `expo-constants` | `~57.0.18` |
| `expo-build-properties` | `~57.0.17` |
| `expo-media-library` | `~57.0.5` |
| `expo-image-picker` | `~57.0.17` |
| `expo-web-browser` | `~57.0.3` |
| `expo-status-bar` | `~57.0.1` |
| `expo-asset` | `~57.0.17` |
| `expo-modules-core` | `~57.0.18` |
| `@expo/vector-icons` | `^15.0.2` |

**`expo-av` is not in the SDK 57 map.** Superseded by `expo-audio` and `expo-video`.

Read any entry yourself:

```bash
node -p "require('./node_modules/expo/bundledNativeModules.json')['expo-image']"
```

## Shared libraries differ between the two halves

| Package | SDK 57 | CLI half (0.87) |
| --- | --- | --- |
| `react-native-gesture-handler` | `~2.32.0` | 3.3.0 |
| `react-native-reanimated` | `4.5.1` | 4.6.0 |
| `react-native-worklets` | `0.10.1` | 0.12.2 |
| `react-native-screens` | `~4.26.0` | 4.27.0 |
| `react-native-safe-area-context` | `~5.7.0` | 5.9.1 |
| `react-native-webview` | `13.16.1` | 14.0.1 |
| `@react-native-async-storage/async-storage` | `2.2.0` | 3.1.1 |
| `react-native-svg` | `15.15.4` | 15.15.5 |
| `react-native-mmkv` | not in the SDK map | 4.3.2 |

Gesture Handler is a whole major version apart. **Never copy a version number between halves.**

## Stale-tutorial detector

| Signal | Verdict |
| --- | --- |
| `expo init` | Predates `create-expo-app` |
| `expo eject` | Predates prebuild and CNG |
| "managed workflow" / "bare workflow" | Retired framing |
| `npm install -g expo-cli` | Global CLI; the local one is per project |
| `expo build:android` | Predates EAS Build |
| `expo publish` | Predates EAS Update |
| `expo-av` | Not pinned by SDK 57 |
| Top-level `"splash"` in app.json | Not a SDK 57 key |
| `ViewInstance` / `HostInstance` | React Native 0.87, not yours |

## Common mistakes

- **`npm install expo-foo`** instead of `npx expo install expo-foo` — you get a package built for a
  different SDK, and it fails at runtime.
- **Bumping `react-native` by hand.** Not supported; the SDK pins it.
- **Hand-editing `ios/` or `android/` and running prebuild.** Clean is the default. The edits are gone.
- **`npx expo doctor`.** Not a subcommand — `npx expo-doctor`.
- **A top-level `"splash"` key.** Ignored in SDK 57. Use the `expo-splash-screen` plugin.
- **Copying `ViewInstance` / `TextInputInstance` from a React Native 0.87 page.** Those types do not
  exist on 0.86. Use `useRef<TextInput | null>(null)`.
- **Expecting Expo Go to run a library with custom native code.** It cannot. Build a development build.
- **Running `--fix` before bumping `expo`.** It pins everything to the SDK you are leaving.
- **Assuming a green `npm install` means the app works.** Native mismatches surface at launch.

## Related topics

- [SDK to React Native Pairing](sdk-react-native-pairing.md) — the pairing table and why it is fixed.
- [expo install --check and --fix](install-check-and-fix.md) — the install rule in depth.
- [Upgrading Between SDK Versions](upgrading-sdk.md) — the full upgrade flow.
- [expo init and Other Removed Commands](removed-commands.md) — the old-to-new mapping.
- [Expo CLI Reference](cli-reference.md) — every command and flag.
- [App Config Reference](app-config-reference.md) — every config key.
- [Expo Troubleshooting](troubleshooting.md) — symptom, cause, fix.
- [What Expo Actually Is](../expo-getting-started/introduction.md) — start here if any of this is new.
