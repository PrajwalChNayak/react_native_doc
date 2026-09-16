---
title: expo-dev-client Features
description: The dev launcher, the dev menu, custom menu entries, and the launchMode option that decides whether a development build opens the launcher or reconnects to the last project.
status: current
toolchain: expo
sdk: 57
---

`expo-dev-client` is what turns a plain debug build into a development build. On SDK 57 the
version is **`~57.0.19`**:

```bash
npx expo install expo-dev-client
```

It brings two user-facing pieces — the **dev launcher** (a screen for choosing what to load) and
the **dev menu** (an in-app menu of development tools) — plus a config plugin that wires both into
the native project during generation.

## Why it exists / when to use it — and when NOT to

Without it, a debug build loads one bundle from one hard-coded location. That is fine for a single
developer on a single machine and painful for everyone else: switching between a colleague's dev
server, a branch preview and an embedded bundle each means a rebuild.

The launcher removes the rebuild from that loop. You rebuild when native code changes, not when the
bundle source changes.

Leave it out of release builds. It is development tooling, and it carries a launcher UI that has no
business in a store submission. Keep it to the `development` build profile — see
[Creating One with EAS](creating-with-eas.md).

## Basic example

Install the package and rebuild once. Everything below is then available.

```bash
npx expo install expo-dev-client
npx expo run:android
```

Start the dev server in development-build mode:

```bash
npx expo start --dev-client
```

## How it works

### The dev launcher

On launch, the app either reconnects to a project or shows the launcher screen. The launcher lists
dev servers it discovers on the local network, accepts a URL typed by hand, can scan a QR code, and
— when the build is configured for updates — can load a published update such as a pull-request
preview.

That last capability is the reason internal testers can review several branches from one installed
binary.

### Configuring it in the app config

`expo-dev-client` is a config plugin. Its options are the dev launcher's options, with a small
addition of its own. Read from the installed plugin type definitions for
`expo-dev-launcher@57.0.20` and `expo-dev-client@57.0.19`.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `launchMode` | `'most-recent'` \| `'launcher'` | `'most-recent'` | Launch straight into the previously opened project, or always show the launcher screen |
| `defaultLaunchURL` | string | — | Launch directly into this URL. With `launchMode: 'most-recent'` it is the fallback when reopening the previous project fails |
| `toolsButton` | boolean | `true` | Show the tools button |
| `embeddedBundle` | boolean | `false` | Offer a "Load embedded bundle" option when a bundle file is present in the app |
| `skipOnboarding` | boolean | `false` | Skip the dev menu onboarding popup on first launch |
| `showMenuAtLaunch` | boolean | `true` | Open the dev menu automatically when the app launches |
| `addGeneratedScheme` | boolean | `true` | Register a custom URL scheme so a project can be opened by link |

Every option except `addGeneratedScheme` can also be set per platform, under an `android` or `ios`
key, and the platform value takes precedence.

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-dev-client",
        {
          "launchMode": "launcher",
          "ios": {
            "launchMode": "most-recent"
          }
        }
      ]
    ]
  }
}
```

> [!NOTE] SDK 57: the iOS launcher honours `launchMode`
> In SDK 57, the iOS dev launcher can either auto-launch the most recent project or show the
> launcher screen, matching the Android behaviour. The setting is `launchMode`, with the values
> `'most-recent'` and `'launcher'` and a default of `'most-recent'`.
>
> An older `launchModeExperimental` option still exists with the same two values and is marked
> **deprecated** in the installed types. Use `launchMode`.

Changing any of these is a native change: edit the config, regenerate, rebuild.

### The dev menu

The dev menu is the in-app panel with reload, the element inspector, the performance monitor and
the link to React Native DevTools. Open it by shaking the device, or press <kbd>m</kbd> in the
terminal running Expo CLI to toggle it, or <kbd>shift</kbd>+<kbd>m</kbd> for more tools.

`showMenuAtLaunch` controls whether it opens by itself on launch. Set it to `false` for end-to-end
test runs, where an overlay that appears on launch blocks automated input. `skipOnboarding` exists
for the same reason, suppressing the first-launch onboarding popup.

### Controlling the menu from JavaScript

`expo-dev-client` re-exports the `expo-dev-menu` API, so these are importable from either package.

```ts-fragment
import {openMenu, closeMenu, hideMenu, registerDevMenuItems} from 'expo-dev-client';

// Add entries to the dev menu. `shouldCollapse` closes the menu after the tap.
await registerDevMenuItems([
  {
    name: 'Reset onboarding state',
    callback: () => resetOnboarding(),
    shouldCollapse: true,
  },
  {
    name: 'Toggle feature flag',
    callback: () => toggleFlag(),
  },
]);

openMenu();
```

The item type is `{name: string; callback: () => void; shouldCollapse?: boolean}`, with
`shouldCollapse` defaulting to `false`.

> [!NOTE] Why this block is marked as a fragment
> `expo-dev-client` is not installed in this site's Expo type-check workspace, so the block is
> tagged `ts-fragment` and is highlighted but not compiled. The names and the item shape were read
> from the installed `expo-dev-menu@57.0.18` type definitions.

These calls only make sense in a development build. Guard them with `__DEV__` if the module could
ever be reached in a release bundle.

## Platform differences

:::tabs
@tab Android
Shake the device or press <kbd>Ctrl</kbd>+<kbd>M</kbd> on an emulator to open the dev menu. The
launcher includes a QR scanner, so you can scan Expo CLI's code from inside the app.

`addGeneratedScheme` registers a URL scheme. The generated Android scheme requires the main activity
to use `singleTask` launch mode, which the plugin arranges during generation.
@tab iOS
Shake the device or press <kbd>Cmd</kbd>+<kbd>D</kbd> in the simulator to open the dev menu. There
is no in-app QR scanner — use the system camera, which opens the app through the registered URL
scheme.

`launchMode` is honoured on iOS from SDK 57.
:::

## Common patterns

### Set `launchMode: 'launcher'` when you switch projects constantly

The default, `'most-recent'`, is right when you work on one project: the app reopens where you left
off. If you bounce between several dev servers, `'launcher'` saves a step each time, because the
app stops guessing.

### Turn the menu off for end-to-end tests

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-dev-client", {"showMenuAtLaunch": false, "skipOnboarding": true}]
    ]
  }
}
```

Both options exist because an overlay on launch breaks automated UI runs. Use a separate app config
for the test build rather than changing the one developers use.

### Put your debug affordances in the dev menu, not in the UI

A "clear cache", "reset onboarding" or "switch environment" button embedded in a screen tends to
survive into production. `registerDevMenuItems` keeps those out of the app's own interface, and the
dev menu does not exist in a release build.

## Performance considerations

`expo-dev-client` is development tooling and adds launcher and menu code to the binary. That is
irrelevant for development and unacceptable for release, which is why it belongs in a development
build profile only.

Do not measure startup time in a development build. The launcher, the dev menu and the Metro
connection all run before your first screen.

## Common mistakes

- **Shipping `expo-dev-client` in a release profile.** Keep `developmentClient: true` in exactly one
  EAS profile and never in `production`.
- **Changing a plugin option and expecting it to apply without a rebuild.** These options are baked
  into the native project during generation. Regenerate and rebuild.
- **Using `launchModeExperimental`.** It is deprecated in the installed types. Use `launchMode`.
- **Wondering why the launcher never appears.** The default is `'most-recent'`, so a build that
  successfully reconnects goes straight into the last project. Set `launchMode: 'launcher'`, or
  disconnect from the dev server.
- **Leaving the dev menu auto-opening during end-to-end runs.** It blocks automated input. Set
  `showMenuAtLaunch: false` and `skipOnboarding: true` for those builds.
- **Calling `openMenu()` from code that also runs in release.** The dev menu is not there. Guard it.
- **Measuring startup or frame rate in a development build.** Development tooling is running.

## Related topics

- [Why You Need a Development Build](why-you-need-one.md) — what forces you into one.
- [Installing It on a Device](installing-on-a-device.md) — getting the launcher onto hardware.
- [Debugging a Development Build](debugging.md) — React Native DevTools and the network inspector.
- [Adding Native Dependencies](adding-native-dependencies.md) — when a rebuild is required.
- [Creating One with EAS](creating-with-eas.md) — keeping the dev client out of release profiles.
- [App Config](../expo-core-concepts/app-config.md) — where the `plugins` array lives.
- [Dev Server and Fast Refresh](../expo-getting-started/dev-server-and-fast-refresh.md) — the JavaScript loop.
