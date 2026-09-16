---
title: Creating a Project
description: create-expo-app, its templates and examples, what the default template actually contains, and how to strip it back to an empty app.
status: current
toolchain: expo
sdk: 57
---

One command creates an Expo SDK 57 project. The interesting decisions are which starting
point you pick and what you do with the demo content that comes with the default one.

## Basic example

:::tabs
@tab npm
```bash
npx create-expo-app@latest MyApp
cd MyApp
npx expo start
```
@tab yarn
```bash
yarn create expo-app MyApp
cd MyApp
yarn expo start
```
@tab pnpm
```bash
pnpm create expo-app MyApp
cd MyApp
pnpm expo start
```
@tab bun
```bash
bun create expo MyApp
cd MyApp
bun expo start
```
:::

The package manager you use for creation is the one the project is set up for — the lockfile
it writes is what later commands, including `npx expo install` and `npx expo prebuild`,
detect and reuse.

## Why it exists / when to use it — and when NOT to

`create-expo-app` does three things you would otherwise do by hand: it downloads a template
at the version matching the current SDK, installs dependencies with the package manager you
invoked it with, and renames the app inside the config.

The version matching matters. Templates are published per SDK — the SDK 57 default template
is `expo-template-default@57.0.24` — so the dependency set you get is one that was tested
together. Assembling the same project from `npm init` and a list of packages is how you end
up with an SDK 56 library in an SDK 57 app.

## Options

Verified against `create-expo-app@4.0.0`:

| Flag | Effect |
| --- | --- |
| `-t, --template <name>` | Which template to use: `default`, `blank`, `blank-typescript`, `tabs`, `bare-minimum`. Default: `default`. Also accepts an npm package name. |
| `-e, --example <name>` | Clone an example from [github.com/expo/examples](https://github.com/expo/examples) instead of a template. |
| `-y, --yes` | Accept the defaults without prompting. |
| `--no-install` | Create the files, skip installing dependencies. |
| `--no-agents-md` | Skip generating `AGENTS.md`, `CLAUDE.md` and `.claude/settings.json`. |
| `-v, --version` | Print the `create-expo-app` version. |
| `-h, --help` | Usage. |

### Templates

```bash
# The default: Expo Router, tabs, theming, example screens
npx create-expo-app@latest MyApp

# Minimal, JavaScript, single App.js, no router
npx create-expo-app@latest MyApp --template blank

# Minimal, TypeScript, single App.tsx, no router
npx create-expo-app@latest MyApp --template blank-typescript

# Tab navigation starting point
npx create-expo-app@latest MyApp --template tabs

# Includes committed ios/ and android/ directories
npx create-expo-app@latest MyApp --template bare-minimum
```

What they actually give you on SDK 57:

| Template | Router | Language | `ios/` and `android/` | Dependencies |
| --- | --- | --- | --- | --- |
| `default` | Expo Router 57 | TypeScript | Generated (git-ignored) | ~20, including `expo-image`, `expo-font`, `expo-splash-screen`, Reanimated, Gesture Handler, `react-native-web` |
| `blank` | none | JavaScript | Generated | 4: `expo`, `expo-status-bar`, `react`, `react-native` |
| `blank-typescript` | none | TypeScript | Generated | the same 4, plus `typescript` and `@types/react` |
| `tabs` | Expo Router 57 | TypeScript | Generated | between `blank` and `default` |
| `bare-minimum` | none | TypeScript | **Committed** | minimal, with the native projects in the repo |

> [!NOTE] `bare-minimum` is a different maintenance model, not just a different template
> It ships `ios/` and `android/` in the repo. That is the committed-native-directories
> strategy, and it changes how you upgrade and how you make native changes for the life of
> the project. Read
> [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md)
> before choosing it rather than after.

### Examples

`--example` clones a working app from the `expo/examples` repository rather than a template.
These are demonstrations of a specific integration — a particular auth provider, a particular
data layer — not project skeletons.

```bash
# List the available examples interactively
npx create-expo-app@latest --example

# Clone a specific one by name
npx create-expo-app@latest MyApp --example with-router
```

Examples are pinned to whatever SDK they were last updated for, which is not necessarily 57.
Check the example's `package.json` before building on it, and run
`npx expo install --check` after cloning.

## How it works

### What the default template contains

The SDK 57 default template is a working demo app, not an empty project. Its `package.json`
pins `expo` at `~57.0.22`, `react-native` at `0.86.3` and `react` at `19.2.3` — the exact
trio SDK 57 is built around — and its `app.json` looks like this:

```json title=app.json
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "myapp",
    "userInterfaceStyle": "automatic",
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

Two things there are worth noticing on day one:

- **`experiments.typedRoutes`** generates route types from your file tree, so navigation is
  type-checked. See [Typed Routes](../expo-router/typed-routes.md).
- **`experiments.reactCompiler`** is on by default in this template. It changes memoisation
  behaviour, which is usually invisible and occasionally not.

Routes live under `src/app/` in the SDK 57 default template, with a `@/*` path alias pointing
at `src/`. Its `package.json` sets `"main": "expo-router/entry"` — there is no `index.js` or
`index.ts`, because the router provides the entry point. [Project Structure](project-structure.md)
walks through the rest.

The default template's dependency set is larger than people expect, and includes
`@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-system-ui` and `expo-device` alongside
the familiar `expo-image` / `expo-font` / `expo-splash-screen` trio, plus `react-dom` and
`react-native-web` so the web target works out of the box.

### What else gets generated

`create-expo-app` also runs `git init` and writes a first commit, adds `.vscode/` with
recommended extensions, and generates `AGENTS.md`, `CLAUDE.md` and `.claude/settings.json`
for coding agents. Pass `--no-agents-md` if you do not want that last group.

### Resetting the demo content

The default template includes a script for exactly the moment you want the demo gone:

```bash
npm run reset-project
```

It moves the starter code to an `app-example` directory and leaves you a blank `app`
directory to build in. Run it before your first real commit rather than deleting files by
hand and discovering later that you removed something the config referenced.

### Naming

`create-expo-app` writes the directory name into `expo.name` and derives `expo.slug`. Neither
is the app's identity on a store — that comes from `ios.bundleIdentifier` and
`android.package`, which the default template does not set. You add those before your first
native build; see [The App Config](../expo-core-concepts/app-config.md).

## Common patterns

### Add the packages you need with `expo install`

```bash
npx expo install expo-image expo-secure-store
```

Not a bare package-manager install. `npx expo install` reads the SDK's own version map and
installs the release built for SDK 57 — `expo-image@~57.0.5`, `expo-secure-store@~57.0.4` —
whereas fetching `latest` gives you whatever the package publishes today, which is routinely
built against a different SDK. That mismatch fails at runtime, not at install time. The full
reasoning is in
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

### Verify the project before you build on it

```bash
npx expo install --check
npx expo-doctor
```

Thirty seconds, and it catches a version skew that would otherwise surface as an
unexplainable native crash a week later.

### Choose `blank-typescript` when you are learning the mechanics

The default template's demo app is a good showcase and a poor teaching surface — there is a
lot of code in it that is not about your app. If you are working through this section to
understand how the pieces fit, `--template blank-typescript` gives you a single `App.tsx`:

```tsx title=App.tsx
import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View} from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

You give up Expo Router, which you will want back later. Adding it to a blank project is
straightforward; see [Expo Router Fundamentals](../expo-router/fundamentals.md).

## Common mistakes

- **Installing SDK packages with a bare package-manager command.** You get `latest`, built
  for a different SDK, and the failure appears at runtime. Always `npx expo install`.
- **Creating with one package manager and installing with another.** The CLI detects the
  package manager from the lockfile. Two lockfiles in one repo is a reliable way to get two
  different dependency trees.
- **Building on an `--example` without checking its SDK.** Examples track whatever SDK they
  were last updated for. Run `npx expo install --check` immediately after cloning one.
- **Choosing `bare-minimum` to "keep the option open".** It commits you to maintaining the
  native directories by hand from the first commit. That is a decision, not a hedge.
- **Deleting the template's demo screens by hand.** Use `npm run reset-project`; it knows
  which files the config references.
- **Expecting `expo.name` to be the store identity.** It is not.
  `ios.bundleIdentifier` and `android.package` are, and the default template leaves them
  unset.

## Related topics

- [Prerequisites](prerequisites.md) — what has to be installed first.
- [Project Structure](project-structure.md) — what every file in the new project is for.
- [The Dev Server and Fast Refresh](dev-server-and-fast-refresh.md) — what `npx expo start` gives you.
- [The App Config](../expo-core-concepts/app-config.md) — `app.json`, `app.config.ts` and every key above.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why the install command matters.
- [Expo Router Fundamentals](../expo-router/fundamentals.md) — the router the default template ships with.
- [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md) — the choice `bare-minimum` makes for you.
- [Removed Commands](../expo-migration/removed-commands.md) — if a tutorial gives you a command that no longer exists.
