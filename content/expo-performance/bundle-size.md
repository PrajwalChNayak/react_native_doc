---
title: Bundle Size and Tree Shaking
description: Measuring what npx expo export actually ships for Expo SDK 57, inspecting it with Expo Atlas, and what Metro tree shaking can and cannot remove.
status: current
toolchain: expo
sdk: 57
---

The JavaScript bundle is every module your app imports, compiled into one file per platform. On
a release build it ships as Hermes bytecode inside the binary (and in every OTA update you
publish). A smaller bundle means less to download, less to load at startup, and fewer modules
to initialise.

This page shows a real measurement first, then the tools to find out what is in your own bundle.

## Why it exists / when to use it — and when NOT to

Look at bundle size when:

- Startup time regressed and you suspect a new dependency.
- An OTA update is larger than you expect.
- You are choosing between two libraries and want to know what each costs.

Do **not** chase bundle size for its own sake. A few hundred kilobytes of bytecode is rarely the
reason an app is slow; images, network waterfalls and heavy first renders usually matter more.
Measure startup first — see [Startup Time](startup-time.md).

## Basic example

Export a production bundle and look at the file:

```bash
npx expo export --platform android
```

A **real run** of that command on the minimal SDK 57 app in
[`examples/expo-minimal`](../../examples/expo-minimal/README.md) on this handbook's build machine
bundled **580 modules** into a single **1.4 MB** Hermes bytecode file at:

```text
dist/_expo/static/js/android/index-<hash>.hbc
```

That is the floor: React, React Native 0.86.3, the Expo runtime and one screen. Everything you
add is measured against it. Run the same command on your project and compare the `.hbc` size.

The extension is `.hbc` because `expo export` compiles to Hermes bytecode by default. The
`--no-bytecode` flag (present in SDK 57's `@expo/cli`) skips that step if you need to read the
plain JavaScript output.

## How it works

### What `expo export` flags help with measurement

Read from the installed `@expo/cli@57` argument parser:

| Flag | What it does |
| --- | --- |
| `--platform <android\|ios\|web\|all>` | Export only the platform you are measuring. |
| `--source-maps` | Emit source maps alongside the bundle, which source-map explorers read. |
| `--dump-assetmap` | Write the asset map, so you can see which assets are referenced. |
| `--no-minify` | Skip minification — useful for reading output, wrong for measuring size. |
| `--no-bytecode` | Emit JavaScript instead of Hermes bytecode. |
| `--clear` | Clear the Metro cache first, so you are not measuring a stale result. |

### Expo Atlas: see what is in the bundle

Expo Atlas visualises the module graph Metro built: which packages are included, how large each
one is, and which import pulled it in. The SDK 57 CLI enables it with the `EXPO_ATLAS`
environment variable (`EXPO_UNSTABLE_ATLAS` is still accepted as the older name).

```bash
npx expo install expo-atlas --dev
```

:::tabs
@tab macOS / Linux
```bash
EXPO_ATLAS=true npx expo start
```
@tab Windows (PowerShell)
```powershell
$env:EXPO_ATLAS = "true"; npx expo start
```
:::

When Atlas is enabled on the dev server, the CLI mounts the Atlas UI at `/_expo/atlas` on the
Metro server. The published `expo-atlas` package (`0.4.3` at the time of writing) also provides
an `expo-atlas` command.

> [!NOTE]
> The dev server graph is a development bundle. Use it to find **which** dependencies are large,
> then confirm the effect of removing one with `npx expo export`.

### Tree shaking in SDK 57

Metro can remove unused exports from ES modules. In SDK 57 the pieces are:

- `@expo/metro-config` already sets `experimentalImportSupport: true` in its default transform
  options (read from the installed package), so ES module `import`/`export` is kept intact long
  enough to analyse.
- The actual tree shaking is gated behind two environment variables that the SDK 57 CLI reads,
  both **off by default**:

```bash title=.env
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

> [!WARNING] Unstable, and production-only
> Both variables carry the `UNSTABLE` prefix in SDK 57. Tree shaking only runs when exporting a
> production bundle, never in development. Re-test the whole app after enabling it: code that
> relies on import side effects is exactly what tree shaking can break.

Tree shaking removes unused **exports**. It cannot remove:

- A module that does work at import time (side effects), because removing it would change
  behaviour.
- CommonJS modules using `require` / `module.exports`, which cannot be statically analysed.
- Code you import and then do not call in practice — it is still referenced.

## Common patterns

### Import the function, not the library

```ts title=lib/dates.ts
// Named imports from an ES module package give tree shaking something to work with.
// A namespace or default import of a huge utility object usually pulls in all of it.
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
```

Often the cheapest bundle win is writing a ten-line helper instead of importing a utility
library for one function.

### Measure a dependency before you adopt it

1. `npx expo export --platform android` on a clean branch. Note the `.hbc` size.
2. Add the dependency and one real use of it.
3. Export again and compare.

That difference is the actual cost, including its transitive dependencies.

### Keep secrets out of the bundle

Size aside, remember that everything in the bundle is readable. String constants survive Hermes
compilation intact. See [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md).

## Performance considerations

- Bundle size affects **every** OTA update you publish, not only the store binary.
- A smaller bundle helps startup less than you might expect on Hermes, because bytecode is not
  parsed at launch. Module **initialisation** — code that runs at import time — usually costs
  more than raw size.
- Large JSON files imported with `require` or `import` are part of the bundle. Fetch big data
  sets or ship them as assets instead. See [Asset Strategy](asset-strategy.md).

## Common mistakes

- **Measuring the development bundle.** It is unminified and includes development-only code.
  Measure `npx expo export` output.
- **Measuring with `--no-minify` or `--no-bytecode`.** Useful for reading the output, wrong for
  judging what ships.
- **Enabling tree shaking and not re-testing.** Code with import side effects can silently
  disappear from a production bundle.
- **Assuming tree shaking removes a whole library you imported once.** It removes unused exports
  of ES modules, not modules with side effects or CommonJS packages.
- **Installing SDK tooling with a bare package-manager command.** Use `npx expo install`, which
  resolves versions against your SDK.
- **Importing a large JSON file into JavaScript.** It becomes part of every bundle and every
  update.

## Related topics

- [Hermes](hermes.md) — what the `.hbc` file is and why bytecode matters.
- [Startup Time and the Splash Screen](startup-time.md) — the number bundle size is meant to improve.
- [Asset Strategy](asset-strategy.md) — keeping images and data out of the JavaScript bundle.
- [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) — everything in the bundle is readable.
- [EAS Update](../expo-eas/update.md) — where bundle size is paid again on every update.
