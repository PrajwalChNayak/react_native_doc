---
title: Bundle Size
description: Measuring the JavaScript bundle with a source map, what Metro will and will not eliminate, and why the APK or IPA the user downloads is a different number entirely.
status: current
toolchain: cli
---

Two numbers get called "bundle size" and they behave differently. The **JavaScript bundle** is one
asset inside your app. The **APK, AAB or IPA** is what the user downloads, and the JavaScript bundle
is usually a small part of it.

Neither one is startup time. Because Hermes bytecode is memory-mapped and faulted in lazily, code
that never executes costs disk rather than launch. See [Startup Time](startup-time.md) for that
distinction, which is the most useful thing to get straight before spending a day on this page.

## Why it matters — and when it does not

Bundle size matters for:

- **Download and install size**, which affects conversion on store pages and matters a lot on
  metered connections and cheap devices.
- **Disk footprint**, which matters on 32 GB devices where the OS evicts apps.
- **Review time and CI**, indirectly.

It does *not* meaningfully affect:

- **Startup**, except through the small cost of faulting in pages that execute.
- **Runtime speed** of code you never call.

So: optimise it when the download is large enough that a user might notice, and do not optimise it
as a proxy for performance.

## Basic example — measuring the JavaScript bundle

Produce a production bundle and its source map, outside of any platform build:

```bash
mkdir -p build
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/index.android.bundle \
  --sourcemap-output build/index.android.bundle.map
```

Every flag there is real: `--platform`, `--dev`, `--entry-file`, `--bundle-output` and
`--sourcemap-output` are all declared by the CLI's bundle command in 0.87. `--dev false` is what
turns on minification.

Then attribute the bytes back to your source files with the source map:

```bash
npx source-map-explorer@2.5.3 \
  build/index.android.bundle \
  build/index.android.bundle.map
```

`source-map-explorer` is a general source-map tool with no React Native coupling, which is why it
works here at all. It opens a treemap: each rectangle is a source file, sized by how many bytes of
the minified bundle it accounts for.

> [!NOTE] What you are measuring
> This is Metro's minified JavaScript, before `hermesc`. The shipped artifact is bytecode compiled
> from this file, so the two sizes differ — but the *proportions* between your modules are what you
> are looking at, and those carry over.

`react-native-bundle-visualizer` (4.0.0) wraps this workflow and shells out to the same tool. It
declares no peer dependency on `react-native`, so there is nothing to verify against 0.87 either
way; it is a convenience script, not an integration.

## How it works

### Reading the treemap

Three shapes account for most surprises:

| What you see | What it usually means |
| --- | --- |
| A single dependency larger than all your code | A date, i18n or icon library pulling in data you do not use |
| `node_modules` dominating | Normal. Your own code is rarely the problem. |
| The same library appearing twice | Two versions installed. Check with `npm ls <pkg>`. |
| A large block with no source file | Polyfills and the Metro runtime, or a dependency shipped without a source map |

### Metro's tree-shaking limits — this is the important part

Metro does **not** do the whole-program dead-code elimination that a web bundler does. The reason is
in the default transform configuration: `@react-native/metro-config@0.87.1` sets
`experimentalImportSupport: false`, so ES module syntax is compiled to CommonJS before bundling.

Once a module is CommonJS, `import {a} from 'lib'` becomes a property access on a `require('lib')`
result. The bundler has no way to know that `b`, `c` and `d` are unused, because a property access
is not statically analysable in general. The whole module is included and evaluated.

What you actually get:

- **Module-level elimination.** A module nothing requires is not bundled.
- **Minification-level elimination.** The minifier removes code that is unreachable *within a
  module*, and `--dev false` strips `if (__DEV__)` branches.
- **No cross-module named-export elimination.** Importing one function from a 300 KB library
  includes the library.

The practical consequence is that **barrel files are expensive**:

```ts-fragment title=src/icons/index.ts
// A barrel re-exports everything from one place. Importing a single icon from
// here pulls the whole directory into the bundle, because Metro cannot prove
// the other exports are unused.
export {ChevronIcon} from './ChevronIcon';
export {SearchIcon} from './SearchIcon';
export {TrashIcon} from './TrashIcon';
// ... forty more
```

Import the specific module instead (`import {ChevronIcon} from '../icons/ChevronIcon'`), or choose
libraries that publish one module per entry point.

### The app package is a different measurement

The JavaScript bundle sits inside the app alongside things that are usually much larger:

- The **Hermes engine** — a native library, one copy per ABI on Android.
- **React Native's own native code**, and every native dependency you link.
- **Images, fonts and other assets**, at every density you ship.
- Platform resources, localisations and manifests.

For most apps, native code plus assets dwarfs the JavaScript bundle. Shrinking a 2 MB bundle to
1.6 MB on a 60 MB download is not a user-visible change.

:::tabs
@tab Android
Build the artifacts and look inside them:

```bash
cd android
./gradlew :app:assembleRelease   # APK, for local inspection
./gradlew :app:bundleRelease     # AAB, what you upload
```

The quickest breakdown with no extra tooling:

```bash
unzip -l app/build/outputs/apk/release/app-release.apk | sort -k1 -n | tail -20
```

Android Studio's **Analyze APK** (Build → Analyze APK) gives the same data with a UI, and shows the
download size estimate next to the raw size.

Two levers specific to Android:

- **Ship an AAB, not a universal APK.** Play delivers only the ABI, density and language the device
  needs. A universal APK carries every ABI's copy of the Hermes engine and of React Native's native
  code. See [AAB and Play Store Submission](../build-and-release/play-store-submission.md).
- **R8 shrinking** removes unused Java/Kotlin code and resources. See
  [ProGuard and R8](../build-and-release/proguard-and-r8.md).
@tab iOS
The number that matters is the **App Store download size after thinning**, which App Store Connect
reports per device class once you have uploaded a build. Local `.ipa` size overstates it, because
the store strips architectures and unused asset catalogue variants.

For a local look, an `.ipa` is a zip:

```bash
unzip -l MyApp.ipa | sort -k1 -n | tail -20
```

Bitcode is gone, so there is no equivalent of Android's per-ABI split to configure — thinning is
automatic. The levers are asset catalogues, unused frameworks, and not shipping debug symbols in the
app itself. See [TestFlight and App Store Submission](../build-and-release/app-store-submission.md).
:::

## Common patterns

### Track it, do not audit it once

A size number in CI, compared against the previous build, catches the dependency that added 800 KB
on the day it lands. A one-off audit finds the same thing six months later when nobody remembers
why it is there.

### Check for duplicate dependencies

```bash
npm ls react-native-svg
npm dedupe
```

Two copies of the same library in the tree is common with transitive dependencies and is pure waste.

### Look at assets before JavaScript

A single unoptimised 3 MB PNG outweighs a lot of careful import surgery. Ship images at the
densities you use, prefer vectors where they work, and audit fonts — a full icon font is often
larger than the handful of glyphs you render. See
[Fonts and Icons](../styling/fonts-and-icons.md).

### Prefer narrow entry points over configuration

Libraries that let you import a submodule cost you what you use. Libraries with one giant entry
point cost you all of it, whatever your bundler config says.

## Performance considerations

- **Size is not speed.** Bytecode is mapped lazily; unexecuted code is nearly free at runtime.
- **`--dev false` is what enables minification.** A bundle built with the default `--dev true` is
  several times larger and is not what you ship.
- **Keep the source map as a build artifact.** You need it to measure size *and* to symbolicate
  release crashes. See [Source Maps](../debugging/source-maps.md).
- **Metro 0.87 generates source maps about twice as fast as before and uses roughly half the
  memory**, which makes producing one in CI cheaper than it used to be.
- **Measure the download, not the build output.** Play Console and App Store Connect both report the
  number the user actually sees; local artifact sizes overstate it.

## Security considerations

**Threat.** The source map you generated to measure size reconstructs your original source,
including file paths, comments and unminified identifiers.

**Exploit.** A source map shipped inside the app — or served publicly next to a bundle — hands an
attacker your code layout for free. It is not a secret leak on its own, but it removes every ounce
of friction that minification added.

**Fix.** Generate the map, upload it to your crash reporter or artifact store, and keep it out of
the app package. Check it is not in the artifact:

```bash
unzip -l app-release.apk | grep -i "\.map"
```

**Verification.** That command should print nothing. If it prints a `.map` entry, your build is
copying the map into the assets directory — fix the build step, not the map. See
[Obfuscation and Its Limits](../security/obfuscation.md).

## Common mistakes

- **Confusing bundle size with startup time.** Wrong: splitting the bundle to speed up launch.
  Right: find the modules that *evaluate* at startup.
- **Measuring a dev bundle.** Wrong: running `source-map-explorer` on a bundle built without
  `--dev false`. Right: the minified production bundle, or your numbers are meaningless.
- **Expecting tree shaking.** Wrong: assuming `import {one} from 'huge-lib'` costs one function.
  Right: Metro's default transform compiles to CommonJS; the whole module ships.
- **Optimising JavaScript while shipping a universal APK.** Wrong: 300 KB of import surgery on a
  build that carries four copies of the native engine. Right: ship an AAB first.
- **Shipping the source map inside the app.** Wrong: a `.map` file in `assets/`. Right: keep it as a
  CI artifact and upload it to your crash reporter.
- **Deleting a dependency without measuring.** Wrong: removing a library because it "feels heavy".
  Right: the treemap tells you what it actually costs.

## Related topics

- [Startup Time](startup-time.md) — why a big bundle can still start fast.
- [Hermes and Bytecode](hermes-and-bytecode.md) — what happens to the bundle after Metro.
- [Source Maps](../debugging/source-maps.md) — producing and keeping the map you need anyway.
- [ProGuard and R8](../build-and-release/proguard-and-r8.md) — shrinking the native half on Android.
- [AAB and Play Store Submission](../build-and-release/play-store-submission.md) — per-device delivery.
- [Fonts and Icons](../styling/fonts-and-icons.md) — assets that are often larger than the code.
- [Obfuscation and Its Limits](../security/obfuscation.md) — what minification does and does not buy.
