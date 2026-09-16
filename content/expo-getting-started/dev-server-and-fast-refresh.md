---
title: The Dev Server and Fast Refresh
description: What npx expo start actually runs, the terminal commands it accepts, how Fast Refresh decides between patching and reloading, and when a cache clear is the real fix.
status: current
toolchain: expo
sdk: 57
---

`npx expo start` runs Metro, serves your JavaScript over HTTP, and keeps a WebSocket open to
every connected client. Everything else on this page — Fast Refresh, the terminal key
commands, the dev menu, the debugger — hangs off that one process.

Understanding where the boundary sits between "the dev server can fix this" and "you need a
native rebuild" saves more time than any other piece of Expo knowledge.

## Basic example

```bash
npx expo start
```

Edit a file, save, and the change appears on every connected device in well under a second.
No rebuild, no reinstall.

## Why it exists / when to use it — and when NOT to

The dev server exists so the JavaScript half of your app can iterate without touching the
native half. Native code is compiled and installed; JavaScript is fetched at runtime. That
split is what makes React Native development fast, and it is also the source of the most
common confusion in the ecosystem: **a change the dev server cannot serve needs a rebuild,
and nothing tells you which is which until something fails.**

The boundary:

| Change | Dev server handles it | Needs `npx expo run:*` |
| --- | --- | --- |
| Any `.ts` / `.tsx` / `.js` file | Yes | |
| Styles, images, JSON, fonts already bundled | Yes | |
| Adding a JavaScript-only package | Yes (restart the server) | |
| Adding a package with native code | | **Yes** |
| Changing `app.json` native keys, plugins, permissions, scheme | | **Yes** |
| Adding or editing a config plugin | | **Yes** |
| Upgrading the SDK | | **Yes** |
| Editing `babel.config.js` or `metro.config.js` | Restart with `--clear` | |

## The terminal interface

With the server running, the terminal accepts single-key commands. Verified against
`@expo/cli` 57.0.24:

| Key | Action |
| --- | --- |
| `s` | switch between Expo Go and a development build |
| `a` | open Android |
| `shift+a` | select an Android device or emulator |
| `i` | open the iOS simulator (macOS only) |
| `shift+i` | select an iOS simulator |
| `w` | open web |
| `r` | reload the app |
| `j` | open the debugger |
| `m` | toggle the dev menu on the device |
| `shift+m` | more tools |
| `o` | open the project in your editor |
| `c` | show the project QR code |
| `?` | show all commands |

The line above the command table tells you which target you are on — "Using development
build" or "Using Expo Go". If it says Expo Go and your project has native dependencies, that
is the bug you are about to hit; see
[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).

### Start flags worth knowing

| Flag | Effect |
| --- | --- |
| `-c, --clear` | Clear the Metro cache before starting. `--reset-cache` is an alias. |
| `-a`, `-i`, `-w` | Open Android / iOS / web immediately |
| `-d, --dev-client` | Target a development build |
| `-g, --go` | Target Expo Go |
| `-m, --host <type>` | `lan` (default), `tunnel`, or `localhost` |
| `--tunnel`, `--lan`, `--localhost` | Shorthand for the above |
| `-p, --port <number>` | Metro port. Default 8081. Does not apply to web or tunnel. |
| `--no-dev` | Bundle in production mode |
| `--minify` | Minify JavaScript |
| `--max-workers <number>` | Cap Metro's worker processes |
| `--offline` | Skip network requests, use anonymous manifest signatures |
| `--scheme <scheme>` | Custom URI protocol to launch the app with |

> [!NOTE] `--https` is deprecated
> The CLI's own help marks `--https` as deprecated in favour of `--tunnel`. If you reached
> for it to make a device connect, `--tunnel` is the supported answer.

## How it works

### The dev server picks its target from your dependencies

If `expo-dev-client` is a direct dependency in `package.json`, `npx expo start` runs in
development-build mode by default. If it is not, the server assumes Expo Go. Press `s` to
override, or pass `--dev-client` / `--go` explicitly.

This matters because the QR code the server prints differs between the two: Expo Go gets a
URL Expo Go can open; a development build gets a link in **your app's own scheme**, which is
why `expo.scheme` has to be set for the dev-build QR code to work.

### Fast Refresh, and when it gives up

Fast Refresh is React Refresh wired into Metro's hot module replacement. On save, Metro sends
the changed module to the client, and React Refresh decides what to do with it:

- **If the module only exports React components**, it patches them in place and **preserves
  their state**. This is the good case, and it is why you can iterate on a form without
  re-entering the data.
- **If the module exports anything that is not a component** — a constant, a hook, a utility
  — React Refresh cannot reason about who depends on it, so it performs a **full reload** and
  state is lost.
- **If a component throws while rendering after a refresh**, you get an error overlay. Fix
  the error and save again; Fast Refresh recovers without a manual reload.

That first rule has a practical consequence: a file mixing a component with the constants and
helpers it uses will full-reload on every edit, while one exporting only components will
patch. If a screen keeps losing its state on every save, check what else that file exports.

To force a reset for one file — useful when a component holds state you specifically want
cleared on every edit — add the comment anywhere in it:

```tsx title=src/components/counter.tsx
/* @refresh reset */
import {useState} from 'react';
import {Pressable, Text} from 'react-native';

export function Counter() {
  // This component remounts on every edit because of the comment above,
  // so `count` always starts from zero while you are iterating on it.
  const [count, setCount] = useState(0);
  return <Pressable onPress={() => setCount(count + 1)}><Text>{count}</Text></Pressable>;
}
```

### Reload versus refresh versus rebuild

Three different hammers, in increasing order of cost:

1. **Fast Refresh** — automatic, sub-second, preserves state where it can.
2. **Reload** (`r` in the terminal, or Reload in the dev menu) — re-evaluates the whole
   bundle. Loses all in-memory state. Use when the app is in a state you cannot reason about.
3. **Rebuild** (`npx expo run:*`) — recompiles native code. Minutes. Only needed for the
   changes in the table above.

### Clearing the Metro cache

```bash
npx expo start --clear
```

Metro caches aggressively, and a stale cache produces symptoms that look like broken code: a
`babel.config.js` change that does not take effect, a path alias that will not resolve, a
module resolving to a version you removed. If a change "should obviously work" and does not,
clear the cache before you start debugging your own code.

### Environment variables

The dev server loads `.env` files before starting, in this precedence order (highest first),
where `<mode>` is `NODE_ENV`:

```text
.env.<mode>.local
.env.local          (skipped when mode is "test")
.env.<mode>
.env
```

`EXPO_NO_DOTENV=1` disables the whole mechanism.

> [!DANGER] `EXPO_PUBLIC_` variables are inlined into the bundle
> Any variable prefixed `EXPO_PUBLIC_` is substituted into your JavaScript at build time and
> ships inside the bundle. It is readable by anyone with the app file. This is not a leak in
> the tooling — it is what the prefix means — but it is routinely used for API keys that
> should never have been there. See
> [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md).

Changing a `.env` file requires restarting the dev server. The values are read at start and
inlined at bundle time, not read at runtime.

### The dev menu and the debugger

Press `m` in the terminal to toggle the dev menu remotely, or shake a physical device. Press
`j` to open the debugger — React Native DevTools, with the usual console, sources, network
and component tools.

React Native 0.86, which SDK 57 ships, added light/dark emulation to React Native DevTools,
so you can check both themes without changing your device settings.

A development build using `expo-dev-client` gets more than the base dev menu: a launcher for
switching between dev servers and deployments, and network request inspection. See
[expo-dev-client Features](../expo-development-builds/dev-client-features.md).

## Common patterns

### Keep one dev server, not three

`npx expo run:android` and `npx expo run:ios` each start Metro unless you pass
`--no-bundler`. Two servers on two ports means your app connects to one of them and you edit
files watched by the other, which presents as "my changes are not appearing".

```bash
# Terminal 1: the only Metro instance
npx expo start

# Terminal 2
npx expo run:android --no-bundler
```

### Separate components from constants for better refresh behaviour

```tsx title=src/screens/profile-screen.tsx
// Only components are exported from this file, so edits patch in place
// and the screen keeps its state.
import {Text, View} from 'react-native';

export function ProfileScreen() {
  return (
    <View>
      <Text>Profile</Text>
    </View>
  );
}
```

Put the constants, types and helpers that screen uses in a sibling module. The refresh
behaviour is a side benefit of a structure that is better anyway.

### Restart after dependency changes

Metro resolves modules at start. Installing a package, changing `metro.config.js`, or
changing `babel.config.js` all need a restart — with `--clear` for the last two.

## Common mistakes

- **Rebuilding natively for a JavaScript change.** Minutes spent on something Fast Refresh
  does in under a second. Check the table above before reaching for `run:*`.
- **Not rebuilding after a native change.** The opposite failure, and worse, because the
  symptom is a runtime crash rather than an obvious no-op. Adding a native package or
  changing a config plugin requires a rebuild.
- **Blaming Fast Refresh for lost state.** If a file exports anything other than components,
  a full reload is the documented behaviour, not a bug.
- **Editing `.env` and expecting a hot reload.** Restart the server.
- **Running two Metro instances.** Pass `--no-bundler` to `run:*` when a server is already up.
- **Leaving `--tunnel` on permanently.** Every request goes through a remote relay. Use it
  when LAN genuinely does not work.
- **Putting a secret in an `EXPO_PUBLIC_` variable.** It is inlined into the bundle. The
  prefix is the warning.
- **Debugging for an hour before trying `--clear`.** A stale Metro cache imitates a code bug
  convincingly.

## Related topics

- [Running on a Simulator](running-on-a-simulator.md) — the `a` and `i` keys in context.
- [Running on a Device](running-on-a-device.md) — LAN, tunnel and the QR code.
- [Running on the Web](running-on-web.md) — the `w` key and the shared Metro pipeline.
- [Project Structure](project-structure.md) — what `.expo/` holds between runs.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — which target the server is serving.
- [expo-dev-client Features](../expo-development-builds/dev-client-features.md) — the launcher and network inspector.
- [Debugging a Development Build](../expo-development-builds/debugging.md) — what the `j` key opens.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md) — why inlining matters.
- [Expo Troubleshooting](../expo-migration/troubleshooting.md) — when clearing the cache is not enough.
