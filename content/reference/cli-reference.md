---
title: CLI Command Reference
description: Every command the React Native Community CLI 20.2.0 registers in a 0.87 project, with the flags read from the published packages rather than from memory.
status: current
toolchain: cli
---

This is the command surface of a React Native 0.87.1 project using
`@react-native-community/cli` **20.2.0**. Every command name, flag and default below was read from
the published packages — the CLI itself, its platform packages, and `react-native`'s own
`react-native.config.js` — not from a help screen someone pasted into a blog post.

Where something could not be verified, this page says so rather than guessing. Those gaps are
collected in [What is not verified on this page](#what-is-not-verified-on-this-page).

## How the CLI is actually wired

This trips people up before they get to any flag, so it comes first.

- The `react-native` binary comes from the **`react-native`** package. Its `cli.js` does nothing
  except find `@react-native-community/cli` and hand over to it. If the CLI is not installed it
  prints a warning telling you to add it to `devDependencies` and exits.
- **`@react-native-community/cli` must be an explicit devDependency.** `react-native` does not
  depend on it. The 0.87 template lists `@react-native-community/cli`,
  `@react-native-community/cli-platform-android` and `@react-native-community/cli-platform-ios`,
  all at 20.2.0.
- The CLI's own bin is named **`rnc-cli`**, not `react-native`.
- Commands arrive from three places: the CLI package (`init`, `config`, `clean`, `doctor`, `info`),
  `react-native`'s `react-native.config.js` (`start`, `bundle`, `codegen`, `spm`), and the two
  platform packages (`run-*`, `build-*`, `log-*`).

That last point explains an otherwise baffling behaviour: `run-ios` does not exist outside a
project, because it comes from a package the project depends on.

```bash
# Inside a project. Both work; the first is what the template's npm scripts use.
npx react-native <command>
npx @react-native-community/cli <command>

# Outside a project — only the detached commands (init, doctor) are available.
npx @react-native-community/cli@latest init AwesomeProject
```

> [!WARNING] Remove any globally installed CLI first
> A stale global `react-native` or `@react-native-community/cli` shadows the project's version and
> produces errors that make no sense against the documentation.
> ```bash
> npm uninstall -g react-native-cli @react-native-community/cli
> ```

## Global behaviour

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--verbose` | **Every** command | Registered on each command by the CLI itself, and raises the logger's verbosity |
| `-v`, `--version` | The CLI | Prints `@react-native-community/cli`'s version — **not** React Native's |
| `--help` | Any command | Commander's generated help for that command |

To read React Native's own version, ask the package:

```bash
node -p "require('react-native/package.json').version"
```

## The commands

| Command | Comes from | What it does |
| --- | --- | --- |
| `init [projectName]` | CLI | Creates a new project. Works outside a project |
| `start` | `react-native` → community-cli-plugin | Starts the Metro development server |
| `bundle` | `react-native` → community-cli-plugin | Builds a JavaScript bundle and copies assets |
| `run-android` | cli-platform-android | Builds and launches on an emulator or device |
| `build-android` | cli-platform-android | Builds without installing or launching |
| `log-android` | cli-platform-android | Streams filtered logcat |
| `run-ios` | cli-platform-ios | Builds and launches on a simulator or device (**macOS only**) |
| `build-ios` | cli-platform-ios | Builds without launching (**macOS only**) |
| `log-ios` | cli-platform-ios | Tails the simulator syslog (**macOS only**) |
| `config` | cli-config | Prints the CLI configuration autolinking uses |
| `doctor` | cli-doctor | Diagnoses toolchain problems. Works outside a project |
| `info` | cli-doctor | Prints OS, toolchain and library versions |
| `clean` | cli-clean | Removes caches and `node_modules` |
| `codegen` | `react-native` | Runs Codegen by hand |
| `spm [action]` | `react-native` | Swift Package Manager setup — **Experimental** |

## `init`

```bash
npx @react-native-community/cli@latest init AwesomeProject
npx @react-native-community/cli@20.2.0 init AwesomeProject --version 0.87.1
```

Detached: it runs outside a project. The description in the package notes that the Android and iOS
projects take their name from the project name, which is why renaming later is painful.

| Flag | Meaning |
| --- | --- |
| `--version <string>` | React Native version to install in the template |
| `--template <string>` | A custom template; anything `npm install` (or `yarn add` with `--pm yarn`) accepts |
| `--pm <string>` | Package manager: `yarn`, `npm` or `bun`. Default `npm` |
| `--directory <string>` | Use a directory other than `<projectName>` |
| `--title <string>` | Custom app title |
| `--skip-install` | Skip installing dependencies |
| `--install-pods [boolean]` | Whether to run CocoaPods during init |
| `--package-name <string>` | Android package name and iOS bundle id, e.g. `com.example.app` |
| `--platform-name <string>` | For an out-of-tree platform; normally passed automatically |
| `--skip-git-init` | Do not initialise a git repository |
| `--replace-directory [boolean]` | Replace the directory if it already exists |
| `--yarn-config-options <string>` | Extra `.yarnrc.yml` entries as `key=value,key2=value2` |

> [!NOTE] `--version` pins React Native, not the CLI
> `npx @react-native-community/cli@20.2.0 init App --version 0.87.1` pins both independently: the
> `@20.2.0` chooses the CLI that runs, `--version` chooses what goes in the template.

## `start`

```bash
npx react-native start
npx react-native start --reset-cache
npx react-native start --port 8082
```

| Flag | Meaning |
| --- | --- |
| `--port <number>` | Port to serve on. **No default is declared on the flag itself**; Metro's own default is 8081, and `run-android` / `run-ios` default to `RCT_METRO_PORT` or 8081 |
| `--host <string>` | Host to bind. Default is the empty string, which binds all interfaces |
| `--projectRoot <path>` | A custom project root |
| `--watchFolders <list>` | Comma-separated extra folders to watch — the monorepo flag |
| `--assetPlugins <list>` | Extra asset plugins, by full file path |
| `--sourceExts <list>` | Extra source extensions |
| `--max-workers <number>` | Worker pool size. Defaults to your core count |
| `--transformer <string>` | A custom transformer |
| `--reset-cache`, `--resetCache` | Removes cached files. The first thing to try for a stale-bundle problem |
| `--custom-log-reporter-path`, `--customLogReporterPath <string>` | A module exporting a replacement for `TerminalReporter` |
| `--https` | Serve over HTTPS |
| `--key <path>` | Custom SSL key |
| `--cert <path>` | Custom SSL certificate |
| `--config <string>` | Path to the CLI configuration file |
| `--no-interactive` | Disables the interactive key handler. Use this in CI |
| `--client-logs` | **Deprecated** in 0.87. Plain-text JavaScript log streaming for connected apps; the package marks it for removal |

## `bundle`

The command that produces the JavaScript your release build embeds. Gradle and Xcode call it for
you; you call it directly to inspect a bundle, to measure size, or to produce an artefact for
[Over-the-Air Updates](../build-and-release/over-the-air-updates.md).

```bash
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/index.android.bundle \
  --assets-dest build/android-assets \
  --sourcemap-output build/index.android.bundle.map
```

| Flag | Meaning |
| --- | --- |
| `--entry-file <path>` | Root JS file, absolute or relative to the JS root |
| `--platform <string>` | `ios` or `android`. **Default `ios`** — pass it explicitly, always |
| `--dev [boolean]` | `false` disables warnings and minifies. Default `true` |
| `--minify [boolean]` | Overrides minification. Defaults to the opposite of `--dev` |
| `--bundle-output <string>` | Where to write the bundle |
| `--bundle-encoding <string>` | Encoding for the written bundle. Default `utf8` |
| `--assets-dest <string>` | Directory for assets referenced by the bundle |
| `--sourcemap-output <string>` | Where to write the source map |
| `--sourcemap-sources-root <string>` | Make source map entries relative to this path |
| `--sourcemap-use-absolute-path` | Report the source map URL as a full path. Default `false` |
| `--max-workers <number>` | Worker pool size |
| `--transformer <string>` | A custom transformer |
| `--unstable-transform-profile <string>` | Experimental. `hermes`, `hermes-canary` or `default`. Default `default` |
| `--asset-catalog-dest [string]` | Create an iOS asset catalog for images at this path |
| `--reset-cache` | Removes cached files. Default `false` |
| `--read-global-cache` | Try the global cache, if one is configured. Default `false` |
| `--config <string>` | Path to the CLI configuration file |
| `--resolver-option <string...>` | URL-encoded `key=value` resolver options; repeatable |

> [!WARNING] `--platform` defaults to `ios`
> Omitting it on an Android build silently produces an iOS bundle. This is a real default in the
> published package, and it is the most surprising one on this page.

## `run-android`

```bash
npx react-native run-android
npx react-native run-android --mode release --active-arch-only
npx react-native run-android --list-devices
```

`run-android` registers the `build-android` options **plus** its own. Both lists are below.

### Shared with `build-android`

| Flag | Meaning |
| --- | --- |
| `--mode <string>` | The build variant to build |
| `--tasks <list>` | Run custom Gradle tasks. Overrides `--mode`. Defaults to `assembleDebug` |
| `--active-arch-only` | Build native libraries only for the connected device's architecture, for debug builds. Default `false`. The single biggest local build-time win |
| `--extra-params <string>` | Extra parameters passed through to Gradle |
| `-i`, `--interactive` | Choose the build type and flavour before building |

### `run-android` only

| Flag | Meaning |
| --- | --- |
| `--no-packager` | Do not launch Metro |
| `--port <number>` | Metro port. Default `RCT_METRO_PORT` or `8081` |
| `--terminal <string>` | Terminal to launch Metro in. Defaults to your detected terminal |
| `--appId <string>` | Application id to launch after the build. Defaults to `package` from `AndroidManifest.xml` |
| `--appIdSuffix <string>` | Application id suffix to launch |
| `--main-activity <string>` | Activity to start |
| `--device <string>` | Device by name. Optional when only one device is connected |
| `--deviceId <string>` | **Deprecated** in 20.2.0. Device by adb device id |
| `--list-devices` | List devices and emulators and choose one. Default `false` |
| `--binary-path <string>` | Path to a pre-built `.apk`, relative to the project root |
| `--user <number>` | Android user profile id to install into |

## `build-android`

```bash
npx react-native build-android --mode release
```

Same options as the shared table above, and nothing else. It builds without installing or
launching, which makes it the right command in CI.

## `log-android`

```bash
npx react-native log-android
```

**It takes no options at all** in 20.2.0 — verified by reading the command definition, which
registers a `func` and no `options` array. It starts `logkitty` filtered to the `ReactNative` and
`ReactNativeJS` tags, so your own log tags do not appear. For anything else use `adb logcat`
directly; examples are in [Debugging Native Code](../native-modules/debugging-native-code.md).

## `run-ios`

> [!WARNING] macOS only
> `run-ios`, `build-ios` and `log-ios` drive Xcode, `xcodebuild` and the iOS simulator. They cannot
> work on Windows or Linux.

```bash
npx react-native run-ios
npx react-native run-ios --simulator "iPhone SE (2nd generation)"
npx react-native run-ios --device "Max's iPhone"
```

Those three examples ship inside the published command definition. `run-ios` registers its own
options plus every `build-ios` option.

### `run-ios` only

| Flag | Meaning |
| --- | --- |
| `--no-packager` | Do not launch Metro |
| `--port <number>` | Metro port. Default `RCT_METRO_PORT` or `8081` |
| `--terminal <string>` | Terminal to launch Metro in |
| `--binary-path <string>` | Path to a pre-built `.app`, relative to the project root |
| `--list-devices` | List devices and simulators and choose one |
| `--udid <string>` | Device by UDID |
| `--simulator <string>` | Simulator by name, optionally with a version in parentheses: `"iPhone 15 (17.0)"` |

### Shared with `build-ios`

| Flag | Meaning |
| --- | --- |
| `--mode <string>` | Scheme configuration to use. **Case sensitive** |
| `--scheme <string>` | Xcode scheme |
| `--target <string>` | Xcode target |
| `--destination <string>` | Extend the destination, e.g. `"arch=x86_64"` |
| `--xcconfig [string]` | An xcconfig to apply |
| `--buildFolder <string>` | Build artefact location; Xcode's `-derivedDataPath` |
| `--extra-params <string>` | Extra parameters passed to `xcodebuild` |
| `--verbose` | Do **not** use `xcbeautify` or `xcpretty`, even if installed |
| `-i`, `--interactive` | Choose scheme and configuration before building |
| `--force-pods` | Force CocoaPods installation |
| `--only-pods` | Install pods and stop; do not build |
| `--device [string]` | Device by name or identifier. With no value, the first available physical device |

`--device` deliberately takes an optional value, which is why `--device` alone means "any connected
physical device".

## `build-ios`

```bash
npx react-native build-ios --mode "Release"
```

That example is the one published with the command. It takes the shared option table above and
nothing more.

## `log-ios`

```bash
npx react-native log-ios
npx react-native log-ios -i
```

| Flag | Meaning |
| --- | --- |
| `-i`, `--interactive` | Choose which simulator to tail. By default it tails the first booted, available simulator |

That is the complete option list for `log-ios` in 20.2.0.

## `config`

```bash
npx react-native config
npx react-native config --platform android
```

| Flag | Meaning |
| --- | --- |
| `--platform <platform>` | Output configuration for one platform only |

It prints the JSON that autolinking consumes, filtered to dependencies that declare at least one
platform. This is the first command to run when a native module is not found — if a library is
absent here, nothing downstream can link it. See [Autolinking](../native-modules/autolinking.md).

## `doctor`

```bash
npx @react-native-community/cli doctor
npx @react-native-community/cli doctor --fix
```

| Flag | Meaning |
| --- | --- |
| `--fix` | Attempt to fix every diagnosed issue |
| `--contributor` | Add the health checks needed for contributing to React Native itself |

Detached, so it runs outside a project — which is exactly what you want when diagnosing a machine
that cannot create one. See [Environment Setup](../getting-started/environment-setup.md).

## `info`

```bash
npx react-native info
```

**No options.** It prints OS, toolchain and library versions, and it is the right thing to paste
into a bug report.

## `clean`

```bash
npx react-native clean
npx react-native clean --include metro,android
```

| Flag | Meaning |
| --- | --- |
| `--include <string>` | Comma-separated caches to clear. Omitting it opens an interactive prompt |
| `--project-root <string>` | Project root. Defaults to the current working directory |
| `--verify-cache` | Verify the cache. Currently applies only to the npm cache. Default `false` |

The values `--include` accepts, read from the published package:

| Value | What it clears |
| --- | --- |
| `android` | Android build caches, including Gradle |
| `cocoapods` | The CocoaPods cache |
| `metro` | Metro and haste-map caches |
| `watchman` | Stops Watchman and deletes its cache |
| `npm` | `node_modules` in the current package, and optionally verifies the npm cache |
| `yarn` | The Yarn cache |
| `bun` | The Bun cache |

## `codegen`

```bash
npx react-native codegen
npx react-native codegen --platform ios --outputPath ./build/generated --source library
```

| Flag | Meaning |
| --- | --- |
| `--path <path>` | React Native project root. Defaults to the current working directory |
| `--platform <string>` | `android`, `ios` or `all`. Default `all` |
| `--outputPath <path>` | Where generated artefacts are written |
| `--source <string>` | `app` or `library`. Default `app` |

The build runs Codegen for you. Running it by hand is for inspecting output without a full compile
— see [Codegen and Spec Files](../native-modules/codegen-specs.md).

## `spm` — Experimental

> [!WARNING] Experimental in 0.87
> Swift Package Manager is an opt-in alternative to CocoaPods requiring no Ruby, Bundler or
> CocoaPods — only Xcode. **CocoaPods remains the default.** The commands and the layout may still
> change between minor versions, so pin your expectations to the version you are running.

```bash
cd ios
npx react-native spm                 # add, or update if SPM is already set up
npx react-native spm scaffold        # scaffold a Package.swift for a library
npx react-native spm deinit          # reverse it
npx react-native spm --deintegrate   # migrate away from CocoaPods while adding SPM
```

The command is registered as `spm [action]`. Its published description names four actions —
**`add`, `update`, `deinit`, `scaffold`** — and states that with no action it performs `add`, or
`update` when SPM is already set up.

| Flag | Meaning |
| --- | --- |
| `--version <string>` | React Native version, e.g. `0.80.0`. Defaults to the version in `node_modules/react-native/package.json` |
| `--yes` | Skip the dirty-`pbxproj` confirmation prompt |
| `--xcodeproj <path>` | `[add]` Which `.xcodeproj` to inject into, when several exist |
| `--productName <string>` | `[add]` Which app target to inject into, when several exist |
| `--deintegrate` | `[add]` Run `pod deintegrate` and strip React Native from the `Podfile` before injecting |
| `--artifacts <path>` | `[advanced]` A local artifact root with complete `debug/` and `release/` slots |
| `--download <string>` | `[advanced]` Artifact download policy: `auto` (default), `skip` or `force` |
| `--skipCodegen` | `[advanced]` Skip the Codegen step |

The bracketed prefixes are part of the published descriptions and tell you which action each flag
applies to. macOS only, like everything else that touches Xcode. The migration is covered in
[CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md).

## What is not verified on this page

Stated explicitly, so you know where the ground stops being solid:

- **Behaviour of each `spm` action.** The four action names and every flag above come from the
  command's own definition in `react-native` 0.87.1. What `add` versus `update` does to a project
  in practice was not verified here, and the command is Experimental, so treat the descriptions as
  the author's intent rather than a contract.
- **`start --port`'s effective default.** No default is declared on the flag. 8081 is Metro's
  default and is what `run-android` and `run-ios` fall back to; the `start` command's own
  resolution path was not traced.
- **`--extra-params` quoting.** Android splits the value on spaces and iOS does the same; how a
  value containing quoted spaces survives your shell was not tested.
- **`ndk-stack` and `apksigner` paths** used on neighbouring pages come from the Android SDK, not
  from the CLI, and their exact location varies by SDK and AGP version.
- **Out-of-tree platforms.** `--platform-name` exists for them; this handbook covers iOS and
  Android only.

Anything not listed on this page, and not in `--help` for your installed version, does not exist.
Check with `npx react-native <command> --help` against your own installation before believing a
flag you found elsewhere.

## Platform differences

:::tabs
@tab Android
- Every Android command works from Windows, Linux or macOS.
- `run-android` shells out to `./gradlew`, so a Gradle failure is a Gradle problem, not a CLI one.
  Rerun the underlying task with `--stacktrace` to see it.
- `--active-arch-only` is the flag worth adding to your muscle memory: it builds native libraries
  for one architecture instead of four.
- Autolinking runs on every Gradle build, so a newly installed dependency needs only a rebuild.
@tab iOS
- `run-ios`, `build-ios` and `log-ios` require **macOS with Xcode**. There is no alternative.
- They shell out to `xcodebuild`, and pipe through `xcbeautify` or `xcpretty` when one is
  installed. `--verbose` turns that off and shows the raw output, which is what you want when a
  build fails.
- `--only-pods` is useful in CI: install pods as a cacheable step, then build separately.
- Autolinking happens during `pod install`, not during the build.
:::

## Common mistakes

- **Omitting `--platform` on `bundle`.** Wrong: `npx react-native bundle --dev false ...` for an
  Android build. Right: pass `--platform android`. The default is `ios`, so you get an iOS bundle
  with no error.
- **Believing `--version` reports React Native's version.** It reports the CLI's. Read
  `react-native/package.json` for the framework version.
- **A global CLI shadowing the local one.** Wrong: an old global `react-native-cli` answering your
  commands. Right: `npm uninstall -g react-native-cli @react-native-community/cli`, then use
  `npx`.
- **Expecting `log-android` to show your own log tags.** It filters to `ReactNative` and
  `ReactNativeJS`. Use `adb logcat` for anything else.
- **Reaching for `run-ios` on Windows.** It requires macOS. No flag changes that.
- **Using `--tasks` and `--mode` together.** `--tasks` wins and the CLI warns. Pick one.
- **Running `start` interactively in CI.** Pass `--no-interactive`, or the key handler waits on a
  TTY that is not there.
- **Assuming `@react-native-community/cli` comes with `react-native`.** It does not. It is an
  explicit devDependency, and without it the `react-native` binary exits with a warning.
- **Treating `spm` as stable.** It is Experimental in 0.87, CocoaPods is still the default, and the
  command surface may change in the next minor.
- **Copying flags from a pre-0.80 tutorial.** The CLI's option surface has changed repeatedly.
  `--help` against your installed version is the only authority.

## Related topics

- [Creating a Project](../getting-started/creating-a-project.md) — `init` in context, with the version pinning explained.
- [Environment Setup](../getting-started/environment-setup.md) — what `doctor` is checking.
- [Running on Android](../getting-started/running-on-android.md) — `run-android` end to end.
- [Running on iOS](../getting-started/running-on-ios.md) — `run-ios`, and the macOS requirement.
- [Autolinking and react-native.config.js](../native-modules/autolinking.md) — what `config` prints and why it matters.
- [Codegen and Spec Files](../native-modules/codegen-specs.md) — what `codegen` generates.
- [CocoaPods to Swift Package Manager](../migration/cocoapods-to-spm.md) — the `spm` command in a real migration.
- [Over-the-Air Updates](../build-and-release/over-the-air-updates.md) — the one place `bundle` is used directly.
- [Debugging Native Code](../native-modules/debugging-native-code.md) — beyond `log-android` and `log-ios`.
- [Troubleshooting](troubleshooting.md) — when one of these commands fails.
- [Cheat Sheet](cheat-sheet.md) — the short version of this page.
