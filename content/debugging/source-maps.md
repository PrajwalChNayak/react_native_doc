---
title: Source Maps
description: How Metro and Hermes produce maps, how the two are composed into one, where each build system writes them, and why you must keep the map as a build artifact.
status: current
toolchain: cli
---

A source map is a lookup table from a position in generated output back to a position in the code
you wrote. Without one, a stack trace from a shipped app is a list of offsets into a bundle nobody
can read. With one, it is a list of your files and line numbers.

React Native builds two maps per release bundle and composes them into a single file. Understanding
that two-stage shape is what makes the difference between "symbolication does not work" and knowing
exactly which of the two halves is missing.

## Why it exists / when to use it — and when NOT to

You need a map in exactly three situations:

1. **Reading a release stack trace** from a crash reporter or a bug report. See
   [Reading a Release Stack Trace](release-stack-traces.md).
2. **Analysing bundle size**, because the map is what attributes bytes to modules. See
   [Bundle Size](../performance/bundle-size.md).
3. **Debugging in the Sources panel**, where the map is why you see your own files rather than the
   bundle. That one is handled for you by the dev server.

You do not need to think about maps during normal development. Metro serves them to the debugger
automatically, and LogBox resolves its stack traces through the dev server. The work starts at the
moment you produce a build you cannot attach a debugger to.

> [!DANGER] The map is only useful if you kept it
> A source map is generated during the build and then, by default, thrown away with the rest of the
> build directory. If you have not archived it alongside the artifact that produced it, the crash
> report you get next week is unreadable and there is no way to reconstruct it. Treat the map as a
> release artifact with the same care as the signing key's fingerprint or the `.dSYM`.

## Basic example — generate a map by hand

The CLI's `bundle` command produces the JavaScript bundle and its map in one pass. These option
names are declared by the 0.87 bundle command itself:

```bash
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/index.android.bundle \
  --sourcemap-output build/index.android.bundle.map \
  --assets-dest build/res
```

`--dev false` is what makes it a production bundle: development-only branches are folded away and
`__DEV__` becomes `false`. The map that comes out maps **the bundle** back to your sources.

Two related options exist and are worth knowing:

| Option | What it does |
| --- | --- |
| `--sourcemap-sources-root <path>` | Makes the `sources` entries in the map relative to a given directory. Useful when build paths differ from checkout paths in CI. |
| `--sourcemap-use-absolute-path` | Reports the `sourceMappingURL` using its full path. |

That command alone is enough for a plain JavaScript bundle. It is **not** enough for a release
build, because a release build does not ship that JavaScript.

## How it works

### Two maps, because there are two compilers

A release build runs two stages, and each produces its own map.

| Stage | Tool | Map produced | Maps from → to |
| --- | --- | --- | --- |
| 1. Bundling | Metro | the *packager* map | bundle position → your source files |
| 2. Bytecode compilation | `hermesc` | the *compiler* map | bytecode offset → bundle position |

A stack trace from a shipped app carries **bytecode offsets**. Applying only the packager map to
those offsets produces confident nonsense — real-looking file names and line numbers that are
simply wrong. You need the composition of the two.

React Native ships the tool that does it:

```bash
node node_modules/react-native/scripts/compose-source-maps.js \
  build/index.android.bundle.packager.map \
  build/index.android.bundle.compiler.map \
  -o build/index.android.bundle.map
```

The argument order is packager map first, compiler map second, output via `-o`. Get it backwards and
you get a map that loads and resolves to the wrong places.

The result is one file that goes all the way from a bytecode offset to a line in your `.tsx`. That
composed file is the one to archive.

### Where each build system puts it

Both platforms already run this pipeline for you. The difference is that Android does it by default
and iOS needs one environment variable.

:::tabs
@tab Android

The React Native Gradle plugin runs it as part of the bundle task, because `hermesFlags` defaults to
`["-O", "-output-source-map"]` — the second flag is what makes `hermesc` emit the compiler map, and
the plugin then invokes `compose-source-maps.js` on its own.

Output paths, relative to `android/app/build/`:

```text
generated/sourcemaps/react/<variant>/index.android.bundle.map      <- the composed map. Keep this one.
intermediates/sourcemaps/react/<variant>/index.android.bundle.packager.map
intermediates/sourcemaps/react/<variant>/index.android.bundle.compiler.map
```

`<variant>` is the build variant, for example `release`. The two files under `intermediates/` are
the inputs; the one under `generated/` is the composed output and the only one you need to keep.

```gradle title=android/app/build.gradle
react {
    // Default: ["-O", "-output-source-map"]. Removing -output-source-map makes
    // the build marginally faster and your release stack traces unreadable.
    hermesFlags = ["-O", "-output-source-map"]
}
```

Archive it from CI:

```bash
cp android/app/build/generated/sourcemaps/react/release/index.android.bundle.map \
   artifacts/index.android.bundle-${VERSION_NAME}-${VERSION_CODE}.map
```

@tab iOS

Xcode's **Bundle React Native code and images** build phase runs `react-native-xcode.sh`, which
emits a map **only when `SOURCEMAP_FILE` is set**. Without it, no map is produced at all — this is
the single most common reason an iOS release trace cannot be read.

Set it in the build phase's script, above the line that runs the bundler:

```bash title=ios — Bundle React Native code and images
export SOURCEMAP_FILE="$CONFIGURATION_BUILD_DIR/main.jsbundle.map"

export NODE_BINARY=$(command -v node)
. "$REACT_NATIVE_PATH/scripts/react-native-xcode.sh"
```

With that set, the script passes `--sourcemap-output` to the bundler, tells `hermesc` to emit
`-output-source-map`, runs `compose-source-maps.js` on the pair, writes the composed result to
`SOURCEMAP_FILE`, and deletes both intermediates. So the file at that path is already the composed
map.

Archive it from CI by reading the same variable, or by pointing it at a path outside the build
directory in the first place.

:::

### Hermes changes what "minified" means

On a Hermes build, **the JavaScript is not minified**. The iOS script passes `--minify false`
whenever Hermes is enabled and `--dev false`; the Gradle plugin sets the bundler's minify flag to
the negation of whether Hermes is enabled. There is no point minifying source that is about to be
compiled to bytecode and discarded.

The practical consequence is that a release stack trace does not look like the mangled
`a.b.c is not a function` you may be expecting from web work. It looks like bytecode addresses. The
map you need is the compiler map, not a name-mangling map — which is exactly why composing the two
is non-negotiable. See [Hermes and Bytecode](../performance/hermes-and-bytecode.md).

### Metro 0.87 makes this cheaper

React Native 0.87 ships Metro 0.87, and source map generation is the part that improved most:
roughly **twice as fast**, with about **half the memory**. If you previously disabled map generation
in CI because it was the step that ran the build container out of memory, this is worth re-testing
before you accept unreadable crash reports as the cost of a green pipeline.

Two configuration changes landed alongside it:

- **TypeScript and ESM config files are stable.** `metro.config.mts` is a supported config file, so
  your bundler config can be type-checked like the rest of the project.
- **YAML config files and `.es6` file extensions were dropped.** If either appears in a project you
  are upgrading, it stops working rather than warning.

```ts-fragment title=metro.config.mts
import {getDefaultConfig, mergeConfig} from '@react-native/metro-config';

// In an ESM config file there is no __dirname; import.meta.dirname is available
// on every Node version React Native 0.87 supports (minimum 22.13.0).
const config = {
  // Project-specific overrides go here. Source maps need no configuration for
  // the release path — the CLI and the platform build drive that.
};

export default mergeConfig(getDefaultConfig(import.meta.dirname), config);
```

### The dev server symbolicates for you

Metro's dev server exposes a `POST /symbolicate` endpoint. LogBox and the CLI use it: they send a
stack of `{file, lineNumber, column, methodName}` frames and get back a symbolicated stack plus a
code frame. It only works while the dev server that built the bundle is still running, because it
resolves the map from its own live build.

```bash
curl -s -X POST http://localhost:8081/symbolicate \
  -H 'Content-Type: application/json' \
  -d '{"stack":[{"file":"http://localhost:8081/index.bundle?platform=android&dev=true","lineNumber":1,"column":12345,"methodName":"<unknown>"}]}'
```

This is a development convenience, not a release tool. For a release trace you hold the map
yourself; see [Reading a Release Stack Trace](release-stack-traces.md).

## Common patterns

### Name the map after the build that produced it

A map is only valid for the exact bundle it came from. One byte of difference and the offsets no
longer line up. Name it so that the pairing is unambiguous, and store it where your release process
will find it two months later:

```text
index.android.bundle-3.4.1-1042.map      <- versionName-versionCode
main.jsbundle-3.4.1-1042.map             <- CFBundleShortVersionString-CFBundleVersion
```

The version identifiers in the file name should be the ones the crash report will carry, so matching
a report to a map is a lookup rather than an investigation.

### Upload maps as part of the release job, not by hand

Whatever consumes your maps — a crash reporter, an internal store, an S3 bucket — the upload belongs
in the same CI job that produced the artifact. A manual step is a step that gets skipped on the
hotfix release, which is the release whose crashes you most need to read. See
[CI Pipelines](../build-and-release/ci-pipelines.md).

### Keep maps private

The map contains your original source paths and, depending on how it was generated, the source
content itself. That is not something to serve publicly next to your bundle. Store it as a private
build artifact.

### Verify the map before you need it

The test costs a minute and is worth doing once per pipeline change: take a known line from a release
build, look it up, and confirm you get the file you expect.

```bash
# Resolve one generated position back to the original source.
npx metro-symbolicate build/index.android.bundle.map 1 12345
```

That prints `source:line:name`. If it prints `null:null:null`, or a file you do not recognise, the
map is wrong or composed in the wrong order — and finding that out now is much cheaper than finding
it out from a crash report.

### Do not ship the map inside the app

The bundler writes the map to a path you choose; nothing puts it in the APK or the IPA unless you
do. Keep it that way — it is dead weight in the artifact and a gift to anyone reading your app.

## Performance considerations

- **Map generation costs build time and memory**, which is why it is sometimes disabled in CI. Metro
  0.87 halved the memory and doubled the speed, so re-measure before disabling it.
- **The composed map is large** — commonly tens of megabytes for a real app. Budget artifact storage
  accordingly; do not put it in the repository.
- **`hermesFlags` without `-output-source-map` makes the build faster** and the crash reports
  useless. This is not a trade worth making.

## Security considerations

**Threat.** A source map published next to your bundle hands an attacker your original file names,
directory structure and, when `sourcesContent` is included, your source code. It is a complete
de-obfuscation kit.

**Exploit.** The map is JSON. Anyone who can fetch it can read the structure directly:

```bash
node -e "const m=require('./index.android.bundle.map'); console.log(m.sources.slice(0,20)); console.log('has sourcesContent:', Array.isArray(m.sourcesContent));"
```

**Fix.** Never serve maps from a public URL, never include them in the app artifact, and store them
in a private artifact repository with access limited to the people who read crash reports. If you
upload maps to a third-party crash reporter, that vendor now holds your source; confirm that is
acceptable to whoever owns that decision.

**Verification.** After a release, try to fetch the map from wherever your bundle is reachable — a
CDN path, a static asset host — and confirm you get a 404. Then unzip the release artifact and
confirm no `.map` file is inside it:

```bash
unzip -l app-release.apk | grep -i "\.map"
```

Empty output is the expected result.

## Common mistakes

- **Not keeping the map.** Wrong: building, shipping, deleting `build/`. Right: archive the composed
  map with the artifact, named after the same version.
- **Forgetting `SOURCEMAP_FILE` on iOS.** Wrong: assuming iOS behaves like Android. Right: no map is
  produced at all unless that variable is set in the bundle build phase.
- **Using the packager map on a Hermes trace.** Wrong: symbolicating bytecode offsets with the map
  from step one. Right: compose the packager and compiler maps; the result is the only map that
  resolves a release trace.
- **Composing in the wrong order.** Wrong: `compose-source-maps.js compiler.map packager.map`.
  Right: packager map first, compiler map second, output with `-o`.
- **Removing `-output-source-map` from `hermesFlags`.** Wrong: trimming build time. Right: it costs
  you every future release stack trace.
- **Mixing a map with a different build.** Wrong: symbolicating yesterday's crash with today's map.
  Right: one map per build, matched by version, because offsets shift with any code change.
- **Expecting minified JavaScript names in a release trace.** Wrong: looking for mangled identifiers.
  Right: Hermes builds are not minified; the trace carries bytecode addresses.
- **Publishing the map next to the bundle.** Wrong: uploading the whole build output to a CDN.
  Right: the map is private; it reconstructs your source.
- **Keeping a YAML Metro config through an upgrade.** Wrong: assuming it still loads in 0.87. Right:
  YAML configs and `.es6` extensions were dropped — move to `metro.config.js` or `metro.config.mts`.

## Related topics

- [Reading a Release Stack Trace](release-stack-traces.md) — the workflow this page feeds.
- [Crash Reporting](crash-reporting.md) — what consumes the map you archived.
- [React Native DevTools](react-native-devtools.md) — the Sources panel, where maps work automatically.
- [Console and Logs](console-and-logs.md) — LogBox stack traces and the dev server's symbolicate endpoint.
- [Hermes and Bytecode](../performance/hermes-and-bytecode.md) — why there are two maps.
- [Bundle Size](../performance/bundle-size.md) — the other thing the map is for.
- [Native Crash Logs](native-crash-logs.md) — the native equivalents, `.dSYM` and debug symbols.
- [CI Pipelines](../build-and-release/ci-pipelines.md) — where archiving and upload belong.
