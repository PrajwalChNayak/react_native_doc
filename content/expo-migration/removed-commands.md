---
title: expo init and Other Removed Commands
description: expo init, expo eject and the rest of the global expo-cli command surface were removed. The verified old-to-new mapping, read out of the local CLI itself.
status: legacy
toolchain: expo
sdk: 57
---

> [!LEGACY] This page documents commands that no longer exist
> Everything named here has been **removed**. None of it is current advice. This page exists so
> that a reader arriving from an older tutorial can find out what to run instead.

If a tutorial tells you to run `expo init`, it predates the split between the old global `expo-cli`
package and the local `npx expo` CLI. That split is the root of almost every "command not found" or
"not supported in the local CLI" message people hit today.

## Why it exists / when to use it — and when NOT to

Use this page to translate an old command into a current one. Do **not** use it as a reason to
install the old global CLI so the old command works again — the commands were not renamed for
cosmetic reasons. Most of them moved to a different tool (`create-expo-app`, `eas-cli`,
`expo-doctor`) or were replaced by a different model entirely.

## The two CLIs, and why commands "disappeared"

| | Old | Current |
| --- | --- | --- |
| Package | `expo-cli`, installed globally | `@expo/cli`, a dependency of `expo` in your project |
| Invocation | `expo <command>` | `npx expo <command>` |
| Versioning | one global version for every project | versioned with the SDK, per project |

The local CLI is versioned with your SDK. On SDK 57 you are running `@expo/cli@57.0.24`, and a
different project on a different SDK runs a different CLI. That is the whole point: the CLI that
resolves your dependency versions has to know which SDK you are on.

The global CLI's command set was much larger because it also did account management, builds,
credentials and publishing. Those responsibilities moved to `eas-cli` (verified current version
**24.5.0**), which is a separate tool you install or run with `npx`.

## Basic example — the two that matter most

### `expo init` is gone

```bash
expo init MyApp                    # REMOVED — does not work
npx create-expo-app@latest MyApp   # current
```

Running the old command against the local CLI prints, verbatim:

```text
  $ expo init is not supported in the local CLI, please use npx create-expo-app instead
```

The replacement, by package manager:

:::tabs
@tab npm
```bash
npx create-expo-app@latest MyApp
```
@tab yarn
```bash
yarn create expo-app MyApp
```
@tab pnpm
```bash
pnpm create expo-app MyApp
```
@tab bun
```bash
bun create expo MyApp
```
:::

`create-expo-app` also accepts `--template <name>` and `--example <name>` for alternative starting
points.

### `expo eject` is gone

```bash
expo eject           # REMOVED — does not work
npx expo prebuild    # generates the native directories
```

The local CLI prints:

```text
  $ expo eject is not supported in the local CLI, please use npx expo prebuild instead
```

That message is accurate about the command but understates the change. "Ejecting" described a
one-way door: you left Expo's tooling behind and owned the native projects from then on. That model
is gone. What replaced it is a **choice you make and can revisit**:

| Strategy | What you do | What it costs |
| --- | --- | --- |
| **Continuous Native Generation** | Never commit `ios/`/`android/`. Express native changes as config plugins. | You are limited to what plugins can express. |
| **Committed native directories** | Run prebuild once, commit the output, stop running prebuild. | Full native freedom; you own every upgrade by hand. |

`npx expo prebuild` is the command that generates the native directories in both cases. It is not a
one-way door — under CNG you run it constantly, and the output is disposable.

> [!DANGER] `npx expo prebuild` deletes hand-edited native code
> In SDK 57 prebuild **clears and regenerates** the native directories by default. Verified from
> the installed CLI, where the clean behaviour is computed as `!args['--no-clean']`.
>
> If you came here from an `expo eject` tutorial, this is the trap: eject was a one-time operation,
> prebuild is not. Running it over hand-edited native code destroys those edits. Decide between the
> two strategies above before you run it. See
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

> [!LEGACY] The "managed workflow" / "bare workflow" framing is retired too
> Older material splits Expo projects into a "managed workflow" and a "bare workflow", with eject as
> the one-way transition between them. Those terms no longer describe anything real. The live
> distinction is CNG versus committed native directories, and it is reversible.

## How it works — the complete old-to-new map

This table is read directly out of the migration map inside the installed `@expo/cli@57.0.24`. Every
row is a command the local CLI explicitly recognises and redirects; nothing here is a guess.

| Removed command | Run this instead |
| --- | --- |
| `expo init` | `npx create-expo-app` |
| `expo eject` | `npx expo prebuild` |
| `expo web` | `npx expo start --web` |
| `expo start:web` | `npx expo start --web` |
| `expo build:ios` | `eas build -p ios` |
| `expo build:android` | `eas build -p android` |
| `expo build:web` | `npx expo export:web` |
| `expo build:status` | `eas build:list` |
| `expo client:install:ios` | `npx expo start --ios` |
| `expo client:install:android` | `npx expo start --android` |
| `expo doctor` | `npx expo-doctor` |
| `expo upgrade` | Follow the SDK upgrade walkthrough — there is no single command |
| `expo customize:web` | `npx expo customize` |
| `expo publish` | `eas update` |
| `expo publish:set` | `eas update` |
| `expo publish:rollback` | `eas update` |
| `expo publish:history` | `eas update` |
| `expo publish:details` | `eas update` |
| `expo credentials:manager` | `eas credentials` |
| `expo fetch:ios:certs` | `eas credentials` |
| `expo fetch:android:keystore` | `eas credentials` |
| `expo fetch:android:hashes` | `eas credentials` |
| `expo fetch:android:upload-cert` | `eas credentials` |
| `expo push:android:upload` | `eas credentials` |
| `expo push:android:show` | `eas credentials` |
| `expo push:android:clear` | `eas credentials` |
| `expo url` | `eas build:list` |
| `expo url:ipa` | `eas build:list` |
| `expo url:apk` | `eas build:list` |
| `expo webhooks` | `eas webhook` |
| `expo webhooks:add` | `eas webhook:create` |
| `expo webhooks:remove` | `eas webhook:delete` |
| `expo webhooks:update` | `eas webhook:update` |
| `expo upload:android` | `eas submit -p android` |
| `expo upload:ios` | `eas submit -p ios` |

Two further commands are recognised and rejected outright, with no replacement offered:
`expo send` and `expo client:ios`. The CLI prints `expo <command> is deprecated` and exits 1.

### The three destinations

Reading the table as a whole, the removed commands went to three places:

1. **`create-expo-app`** — project creation only. One command, no longer part of the Expo CLI.
2. **`eas-cli` (24.5.0)** — everything cloud: builds, submissions, credentials, updates, webhooks.
   A **separate tool**, and a paid hosted service with a free tier. Local builds remain a supported
   alternative via `npx expo run:android` / `run:ios`, or `eas build --local`.
3. **`expo-doctor`** — project health checks, run as `npx expo-doctor`.

### `expo doctor` deserves its own note

`doctor` is **not** a `npx expo` subcommand. It is not in the local CLI's command list, and running
`npx expo doctor` prints:

```text
  $ expo doctor is not supported in the local CLI, please use npx expo-doctor instead
```

`expo-doctor` is a separate npm package. Run it with `npx expo-doctor` — including as step 3 of the
[SDK upgrade flow](upgrading-sdk.md).

### `expo upgrade` has no one-command replacement

```text
  $ expo upgrade is not supported in the local CLI, please follow this guide https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ instead
```

The replacement is a sequence, not a command: bump `expo`, run `npx expo install --fix`, run
`npx expo-doctor`, then regenerate or hand-merge the native directories. That is the subject of
[Upgrading Between SDK Versions](upgrading-sdk.md).

## What did NOT change

Worth stating, because "everything moved" is not true. These are current commands on the local CLI,
spelled the same as they always were — only the invocation gained `npx`:

`start`, `install`, `prebuild`, `run:ios`, `run:android`, `export`, `config`, `customize`, `serve`,
`lint`, `login`, `logout`, `whoami`, `register`, and `add` as an alias for `install`.

The full surface with verified flags is in the [Expo CLI Reference](cli-reference.md).

## Common patterns

### Recognising a stale tutorial in ten seconds

If a tutorial does any of the following, treat the rest of it as unverified:

| Signal | What it tells you |
| --- | --- |
| `expo init` | Predates `create-expo-app` |
| `expo eject` | Predates prebuild and CNG |
| "managed workflow" / "bare workflow" | Uses the retired mental model |
| `npm install -g expo-cli` | Global CLI; the local CLI is versioned per project |
| `expo build:android` | Predates EAS Build |
| `expo publish` | Predates EAS Update |
| `expo-av` for audio or video | SDK 57 does not pin it; use `expo-audio` and `expo-video` |

### Remove the global CLI if you still have it

A stale global `expo` binary shadowing `npx expo` produces confusing errors. If `expo` resolves to
something outside your project, uninstall it and use `npx expo`:

```bash
npm uninstall -g expo-cli
```

## Common mistakes

- **Running `expo init` and concluding Expo is broken.** The command was removed. Run
  `npx create-expo-app@latest MyApp`.
- **Treating `npx expo prebuild` as a drop-in for `expo eject`.** Eject ran once. Prebuild runs
  repeatedly and **clears the native directories by default**. Hand-edited native code is deleted.
- **Installing the global `expo-cli` so an old tutorial's commands work.** The tutorial is stale for
  reasons beyond the command names; you will hit the next stale instruction shortly.
- **Running `npx expo doctor`.** Not a subcommand. It is `npx expo-doctor`, a separate package.
- **Looking for `expo build:android` in the local CLI.** Builds moved to `eas build -p android`, a
  separate tool and a paid service with a free tier. `npx expo run:android` builds locally for free.
- **Assuming `expo publish` still ships JavaScript updates.** It was replaced by `eas update`, which
  has a different model for channels, branches and runtime versions.
- **Still thinking in "managed" and "bare".** The live decision is CNG versus committed native
  directories, and unlike ejecting it is reversible.

## Related topics

- [Expo CLI Reference](cli-reference.md) — every command that does exist, with verified flags.
- [Upgrading Between SDK Versions](upgrading-sdk.md) — the replacement for `expo upgrade`.
- [Expo Cheat Sheet](cheat-sheet.md) — the current commands in one page.
- [Expo Troubleshooting](troubleshooting.md) — what to do when a stale tutorial has already broken something.
- [Ejecting Is Not a Thing Any More](../expo-vs-bare/ejecting-is-gone.md) — the model that replaced ejecting.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the choice `expo eject` used to make for you.
- [expo prebuild](../expo-core-concepts/prebuild.md) — the destructive regeneration command in detail.
- [EAS Overview](../expo-eas/overview.md) — where the build and publish commands went.
