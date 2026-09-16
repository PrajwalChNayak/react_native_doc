---
title: Expo CLI Reference
description: The npx expo command surface for SDK 57, read out of the installed @expo/cli 57.0.24 — every command, its verified flags, and what is deliberately not in it.
status: current
toolchain: expo
sdk: 57
---

`npx expo` runs the **local** Expo CLI — `@expo/cli`, a dependency of the `expo` package in your
project. It is versioned with your SDK, so an SDK 57 project runs `@expo/cli@57.0.24` and a project
on a different SDK runs a different CLI.

Everything on this page was read out of that installed package and confirmed by running
`npx expo <command> --help` locally. Where a flag exists in the CLI's argument parser but is not
documented in its own help output, this page says so rather than guessing at its meaning.

## Why it exists / when to use it — and when NOT to

Use this as the lookup table when you know roughly what you want and need the exact flag. For the
narrative version of any given workflow, follow the links in
[Related topics](#related-topics) — this page is deliberately a reference, not a tutorial.

Do **not** reach for this page for EAS commands. `eas build`, `eas submit`, `eas update` and
`eas credentials` belong to `eas-cli` (**24.5.0**), a separate tool covered in
[EAS Overview](../expo-eas/overview.md).

## Basic example

The top-level help, run against the installed CLI:

```text
  Usage
    $ npx expo <command>

  Commands
    start, export
    run:ios, run:android, prebuild
    install, customize, config, serve
    login, logout, whoami, register

  Options
    --version, -v   Version number
    --help, -h      Usage info

  For more info run a command with the --help flag
    $ npx expo start --help
```

`npx expo` with no subcommand runs `start`. `npx expo --version` prints the CLI version, `57.0.24`
on SDK 57.

## The command surface

| Command | What it does |
| --- | --- |
| `start` | Start the local dev server (Metro) |
| `install` | Install packages at the versions the SDK expects (alias: `add`) |
| `prebuild` | Generate the native `ios/` and `android/` directories |
| `run:android` | Build and run the native Android app locally |
| `run:ios` | Build and run the native iOS app locally |
| `export` | Export the JavaScript bundle and assets for hosting |
| `config` | Evaluate and print the resolved app config |
| `customize` | Generate static project files you want to own |
| `lint` | Run ESLint with Expo's setup |
| `serve` | Serve a previously exported build locally |
| `login` / `logout` / `whoami` / `register` | Expo account authentication |

Three further entries exist in the CLI's command table but are hidden from `--help` on purpose:
`run` (a dispatcher — `npx expo run <android|ios>`), `export:embed` (an internal production
bundling step) and `export:web` (deprecated). Treat all three as implementation detail rather than
part of the public surface.

## `npx expo start`

Starts the dev server. This is the default command.

```bash
npx expo start                 # dev server, LAN host
npx expo start --android       # and open on a connected Android device
npx expo start --ios           # and open in an iOS simulator
npx expo start --dev-client    # target a development build, not Expo Go
npx expo start --clear         # clear the Metro cache first
npx expo start --tunnel        # reach the dev server from any network
```

| Flag | Meaning |
| --- | --- |
| `<dir>` | Project directory. Default: current working directory |
| `-a, --android` | Open on a connected Android device |
| `-i, --ios` | Open in an iOS simulator |
| `-w, --web` | Open in a web browser |
| `-d, --dev-client` | Launch in a custom native app (a development build) |
| `-g, --go` | Launch in Expo Go |
| `-c, --clear` | Clear the bundler cache |
| `--max-workers <number>` | Maximum tasks Metro may spawn |
| `--no-dev` | Bundle in production mode |
| `--minify` | Minify JavaScript |
| `-m, --host <string>` | Dev server hosting type: `lan` (default), `tunnel`, `localhost` |
| `--tunnel` | Same as `--host tunnel` |
| `--lan` | Same as `--host lan` |
| `--localhost` | Same as `--host localhost` |
| `--offline` | Skip network requests, use anonymous manifest signatures |
| `--https` | Start with https. **Deprecated in favour of `--tunnel`** |
| `--scheme <scheme>` | Custom URI protocol to use when launching the app |
| `-p, --port <number>` | Dev server port (not web or tunnel). Default: 8081 |
| `--private-key-path <path>` | Private key for code signing |

> [!NOTE] Expo Go vs development build
> `--go` and `--dev-client` decide which client the dev server targets. Once your project has a
> library with custom native code, Expo Go cannot run it and `--dev-client` is the only working
> option. See [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).

## `npx expo install`

Installs packages at the version the **installed SDK** expects, resolved from
`expo/bundledNativeModules.json` rather than from npm's `latest`.

```bash
npx expo install expo-image expo-secure-store
npx expo install --check          # report mismatches, exit 1 if any
npx expo install --fix            # rewrite mismatched versions
npx expo install --check --json   # machine-readable, for CI
npx expo install --dev @types/react
npx expo install react -- --verbose   # pass extra args to the package manager
```

| Flag | Meaning |
| --- | --- |
| `--check` | Check which installed packages need updating |
| `--fix` | Automatically update any invalid package versions |
| `--dev` | Save as `devDependencies` |
| `--json` | JSON output, with `--check` |
| `--npm` / `--yarn` / `--pnpm` / `--bun` | Force a package manager. Default follows your lockfile |

`add` is an alias for `install`.

This command has its own page: [expo install --check and --fix](install-check-and-fix.md).

## `npx expo prebuild`

Generates the native `ios/` and `android/` directories from your app config and installed packages.

> [!DANGER] Clean is the default — hand-edited native code is deleted
> The CLI computes its clean behaviour as `!args['--no-clean']`, so prebuild **clears and
> regenerates** the native directories unless you pass `--no-clean`.
>
> If you hand-edited `ios/` or `android/`, run this and those edits are gone. Decide between
> [CNG and committed native directories](../expo-core-concepts/cng-vs-committed-native.md) before
> you run it, and do not mix the two.

```bash
npx expo prebuild                       # clears and regenerates both platforms
npx expo prebuild --no-clean            # layer changes onto existing native folders
npx expo prebuild -p android            # Android only
npx expo prebuild --no-install          # skip npm packages and CocoaPods
```

| Flag | Meaning |
| --- | --- |
| `<dir>` | Project directory. Default: current working directory |
| `--no-install` | Skip installing npm packages and CocoaPods |
| `--no-clean` | Apply changes to the existing native folders instead of recreating them |
| `--npm` / `--yarn` / `--pnpm` / `--bun` | Force a package manager |
| `--template <template>` | Project template to clone from: local tar file, npm package or GitHub repo |
| `-p, --platform <all\|android\|ios>` | Platforms to sync. Default: `all` |
| `--skip-dependency-update <deps>` | Preserve the `package.json` versions of a comma-separated list |

> [!WARNING] `--clean` is accepted but undocumented
> The argument parser accepts `--clean` as well as `--no-clean`, but only `--no-clean` appears in
> `npx expo prebuild --help`. Since clean is already the default, `--clean` has no documented effect
> and this page does not recommend relying on it.

## `npx expo run:android`

Builds and runs the native Android app locally. This is a real native build — it needs the Android
SDK and a JDK, and it produces a development build rather than using Expo Go.

```bash
npx expo run:android
npx expo run:android --variant release
npx expo run:android -d               # pick a device interactively
```

| Flag | Meaning |
| --- | --- |
| `--no-build-cache` | Clear the native build cache |
| `--no-install` | Skip installing dependencies |
| `--no-bundler` | Skip starting the bundler |
| `--app-id <appId>` | Custom Android application ID to launch |
| `--variant <name>` | Build variant, or product flavour plus variant. Default: `debug` |
| `--binary <path>` | Path to an existing `.apk` or `.aab` to install |
| `-d, --device [device]` | Device name to run on |
| `-p, --port <port>` | Dev server port. Default: 8081 |

> [!NOTE] `--all-arch` is accepted but undocumented
> The argument parser accepts `--all-arch` and passes it through as `allArch`, but it does not
> appear in `npx expo run:android --help`. Its exact behaviour is **not verified here**; the name
> suggests building every ABI rather than only the connected device's, but this page will not state
> that as fact.

## `npx expo run:ios`

Builds and runs the native iOS app locally. macOS and Xcode only.

```bash
npx expo run:ios
npx expo run:ios --configuration Release
npx expo run:ios --configuration Release --device generic --output ./build
```

| Flag | Meaning |
| --- | --- |
| `--no-build-cache` | Clear the native derived data before building |
| `--no-install` | Skip installing dependencies |
| `--no-bundler` | Skip starting the Metro bundler |
| `--scheme [scheme]` | Scheme to build |
| `--binary <path>` | Path to an existing `.app` or `.ipa` to install |
| `--configuration <configuration>` | Xcode configuration: `Debug` or `Release`. Default: `Debug` |
| `-d, --device [device]` | Device name, UDID, or `generic` for build-only |
| `-o, --output <path>` | Directory to output the built binary |
| `-p, --port <port>` | Metro port. Default: 8081 |

> [!NOTE] `--unstable-rebundle` is accepted but undocumented
> It appears in the argument parser and not in `--help`. Marked unstable by its own name. Its
> behaviour is **not verified here**, and it should not be used in a documented workflow.

## `npx expo export`

Exports the JavaScript bundle and assets for hosting. For a web build this produces the static site;
for native it produces the update payload.

```bash
npx expo export                          # everything, into dist/
npx expo export -p web                   # web only
npx expo export --output-dir build       # elsewhere
npx expo export --source-maps external   # emit source maps
```

| Flag | Meaning |
| --- | --- |
| `<dir>` | Project directory. Default: current working directory |
| `--output-dir <dir>` | Output directory. Default: `dist` |
| `--dev` | Configure static files for local development over a non-https server |
| `--no-minify` | Prevent minifying source |
| `--no-bytecode` | Prevent generating Hermes bytecode |
| `--max-workers <number>` | Maximum bundler tasks |
| `--dump-assetmap` | Emit an asset map for further processing |
| `--no-ssg`, `--api-only` | Skip static HTML, export only web API routes |
| `-p, --platform <platform>` | `android`, `ios`, `web`, `all`. Default: `all` |
| `-s, --source-maps [mode]` | `true`, `false`, `inline`, `external`. Default: `false` |
| `-c, --clear` | Clear the bundler cache |

> [!NOTE] `--unstable-hosted-native` and `--experimental-bundle` are accepted but undocumented
> Both are in the parser and neither is in `--help`. The CLI source even notes that
> `--experimental-bundle` is hidden because people should not use it. **Not verified here**; do not
> build a workflow on them.

## `npx expo config`

Evaluates your `app.json` / `app.config.js` / `app.config.ts` and prints the resolved result. This
is how you find out what the config *actually* is after plugins and environment variables have had
their say.

```bash
npx expo config --type public       # what ships in the manifest
npx expo config --type prebuild     # what prebuild will use
npx expo config --type introspect   # the native changes plugins will make
npx expo config --json --full
```

| Flag | Meaning |
| --- | --- |
| `<dir>` | Project directory. Default: current working directory |
| `--full` | Include all project config data |
| `--json` | Output in JSON format |
| `-t, --type <public\|prebuild\|introspect>` | Type of config to show |

`--type introspect` is the one worth remembering: it shows what config plugins would do to the
native projects without actually running prebuild, which makes it the safe way to debug a plugin.

## `npx expo customize`

Generates static project files that Expo normally manages for you, handing you ownership of them.

```bash
npx expo customize                       # interactive picker
npx expo customize metro.config.js       # generate a specific file
```

```text
  Usage
    $ npx expo customize [files...] -- [options]

  Options
    [files...]  List of files to generate
    [options]   Options to pass to the install command
    -h, --help  Usage info
```

The set of files offered is chosen by the CLI at runtime based on your project, so it is **not
enumerated here** — run the command with no arguments to see the list for your project. Every file
you generate is a file you now maintain across SDK upgrades.

## `npx expo lint`

Runs ESLint with Expo's configuration.

```bash
npx expo lint
npx expo lint --fix
npx expo lint app components
```

| Flag | Meaning |
| --- | --- |
| `[path...]` | Files and directories to lint |
| `--ext <string>` | Additional extensions. Default: `.js, .jsx, .ts, .tsx, .mjs, .cjs` |
| `--config <path>` | Custom ESLint config file |
| `--no-cache` | Check all files instead of changes between runs |
| `--fix` | Automatically fix problems |
| `--fix-type <string>` | Types of fixes to apply, e.g. `problem`, `suggestion`, `layout` |
| `--no-ignore` | Disable ignore files and patterns |
| `--ignore-pattern <string>` | Patterns of files to ignore |
| `--quiet` | Only report errors |
| `--max-warnings <number>` | Warning count that triggers a non-zero exit |

Extra arguments pass through to `eslint` after `--`:

```bash
npx expo lint -- --no-error-on-unmatched-pattern
```

Its help text says it lints `/src`, `/app` and `/components` by default.

## `npx expo serve`

Serves a previously exported build locally, so you can check an export before deploying it.

| Flag | Meaning |
| --- | --- |
| `--port <number>` | Port to host the server on |

## Account commands

`login`, `logout`, `whoami` and `register` manage your Expo account session. They are needed for EAS
and for hosted services, and are not required to build or run an app locally.

## What is NOT in `npx expo`

| You might expect | Where it actually is |
| --- | --- |
| `expo doctor` | `npx expo-doctor` — a separate package |
| `expo init` | `npx create-expo-app@latest` — a separate package |
| `expo eject` | `npx expo prebuild`, plus a strategy decision |
| `expo upgrade` | A sequence, not a command — see [Upgrading Between SDK Versions](upgrading-sdk.md) |
| `expo build:*` | `eas build` in `eas-cli` |
| `expo publish` | `eas update` in `eas-cli` |
| `expo credentials:*` | `eas credentials` in `eas-cli` |

The complete verified mapping is in
[expo init and Other Removed Commands](removed-commands.md).

### `eas-cli` is a separate tool

**`eas-cli` 24.5.0** is not part of `@expo/cli` and is not installed by `create-expo-app`. Run it
with `npx eas-cli <command>` or install it. It talks to a **paid hosted service with a free tier**;
build queues and concurrency depend on the plan. Local builds remain supported — `eas build --local`,
or `npx expo run:android` / `npx expo run:ios` for a plain native build with no service involved.

## Common patterns

### Check what you are actually running

```bash
npx expo --version                              # 57.0.24 on SDK 57
node -p "require('expo/package.json').version"  # 57.0.22
```

If `expo --version` (without `npx`) reports something else, you have a stale global CLI shadowing
the local one. Remove it.

### Debug a config plugin without running prebuild

```bash
npx expo config --type introspect
```

Non-destructive, and it shows exactly what the plugin would write.

### Start against a development build rather than Expo Go

```bash
npx expo start --dev-client --clear
```

## Common mistakes

- **Running `npx expo doctor`.** Not a subcommand. It is `npx expo-doctor`.
- **Expecting a global `expo` binary to behave the same.** The local CLI is versioned with your SDK.
  A stale global `expo-cli` produces errors that look like project errors.
- **Running `npx expo prebuild` on a project with hand-edited native code.** Clean is the default.
  Your edits are deleted.
- **Using `npm install` instead of `npx expo install` for an SDK package.**
  Wrong: `npm install expo-camera`. Right: `npx expo install expo-camera`.
- **Using `--https` for a dev server on another network.** Its own help marks it deprecated in favour
  of `--tunnel`.
- **Assuming `npx expo export` uploads anything.** It writes to `dist/`. Publishing an update is
  `eas update`, a different tool.
- **Running `npx expo start` and expecting Expo Go to load a project with custom native code.** It
  cannot. Build a development build and use `--dev-client`.
- **Copying an undocumented flag out of the CLI source into a script.** The four this page flags —
  `--clean`, `--all-arch`, `--unstable-rebundle`, `--unstable-hosted-native` /
  `--experimental-bundle` — are not in `--help` and can change without notice.

## Related topics

- [expo install --check and --fix](install-check-and-fix.md) — the install command in depth.
- [Upgrading Between SDK Versions](upgrading-sdk.md) — the flow that uses half of these commands.
- [expo init and Other Removed Commands](removed-commands.md) — everything that used to be here.
- [App Config Reference](app-config-reference.md) — what `npx expo config` is printing.
- [Expo Cheat Sheet](cheat-sheet.md) — the commands you actually type daily.
- [Expo Troubleshooting](troubleshooting.md) — when a command does not do what this page says.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the long-form version of the danger callout.
- [EAS Overview](../expo-eas/overview.md) — the separate `eas-cli` tool.
