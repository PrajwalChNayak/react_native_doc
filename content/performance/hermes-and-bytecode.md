---
title: Hermes and Bytecode
description: What ahead-of-time bytecode and the absence of a JIT mean when you are tuning a React Native app, and which of your instincts about JavaScript performance stop applying.
status: current
toolchain: cli
---

[Hermes](../core-concepts/hermes.md) explains what the engine is. This page is the part you need
when you are holding a profile and deciding what to change: how bytecode changes the cost model,
where the absence of a JIT actually shows up, and which JavaScript micro-optimisations are worth
nothing in a React Native app.

The short version: your JavaScript is compiled to bytecode at build time and interpreted at
runtime, with no tier-up to machine code. Startup and memory are cheap; sustained numeric
throughput is not.

## Why it matters for performance work

Most JavaScript performance intuition comes from V8, where a JIT observes hot code and compiles it.
Under that model, "make the function monomorphic so it optimises" is real advice. Under Hermes it
is not, because nothing is going to optimise it.

That cuts both ways, and the practical consequences are narrow:

| Instinct from a JIT engine | Under Hermes |
| --- | --- |
| Warm up a hot loop before measuring | There is no warm-up. First run is steady-state. |
| Keep object shapes monomorphic for inline caches | Hermes has caches, but there is no speculative optimisation to deoptimise. Shape discipline is worth far less. |
| Prefer `for` over `map` for speed | The difference is noise next to one avoidable re-render. |
| Big bundles cost parse time at startup | There is no parse phase. Bytecode is memory-mapped. |
| A tight numeric loop will get fast | It will not. Move it to native. |

The one instinct that survives intact: **allocation still costs**, and retention costs more. See
[Memory](memory.md).

## Basic example

Because there is no JIT to hoist work out of a hot function for you, hoisting it yourself is one of
the few source-level changes that reliably pays:

```ts title=src/format/currency.ts
// Built once at module evaluation. Constructing a formatter is not cheap, and
// under Hermes nothing will notice that the arguments never change and lift it
// out of the function for you.
const currency = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatPrice(pennies: number): string {
  return currency.format(pennies / 100);
}
```

Inside a list `renderItem` called for hundreds of rows, that is a real difference. Inside a
once-per-screen header, it is not worth the diff. Which one you have is a question for
[Measuring Before Optimising](measuring-first.md).

## How it works

### The build pipeline, and where its knobs are

A release build runs two stages. Metro produces minified JavaScript; `hermesc` compiles that to
bytecode. Both are visible from your project.

Metro's half, run directly:

```bash
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output build/index.android.bundle \
  --sourcemap-output build/index.android.bundle.map
```

`--dev false` is what turns on minification and strips development-only branches. There is also an
`--unstable-transform-profile` option that takes `hermes`, `hermes-canary` or `default`; it selects
the JavaScript syntax level the transformer targets for the engine. It is marked experimental in
the CLI itself, so treat it as such.

The `hermesc` half is driven by the platform build:

:::tabs
@tab iOS
`react-native-xcode.sh` resolves `hermesc` (via `HERMES_CLI_PATH`, falling back to the engine pod's
`destroot/bin/hermesc`) and invokes it with `-emit-binary`. If Hermes is enabled and the binary
cannot be found, the build fails loudly rather than shipping plain JavaScript.

Setting `SOURCEMAP_FILE` in the build phase's environment is what makes it pass
`-output-source-map` and compose the two maps into one. See [Source Maps](../debugging/source-maps.md).
@tab Android
The React Native Gradle plugin runs `hermesc` as part of the bundle task. Its flags come from the
`hermesFlags` property, whose default is `["-O", "-output-source-map"]` — so optimisation and a
bytecode source map are both on by default.

```gradle title=android/app/build.gradle
react {
    // The default is ["-O", "-output-source-map"]. Only change this if you have
    // a measured reason: dropping -O costs runtime speed, dropping the source
    // map costs you readable release stack traces.
    hermesFlags = ["-O", "-output-source-map"]
}
```
:::

### Memory-mapped bytecode, and what that buys

The compiled bundle is not read into the heap at startup. It is memory-mapped, and pages are
faulted in as functions execute. Two consequences you can rely on:

- **Adding a screen you never open costs disk, not launch time.** There is no parse cost
  proportional to bundle size.
- **The cost of a module is its top-level evaluation**, not its size. A 200 KB module that exports
  pure functions costs almost nothing until called; a 5 KB module that builds a lookup table at
  import time costs every launch. See [Startup Time](startup-time.md).

### Where "no JIT" actually shows up

It shows up in exactly one place: long-running, allocation-light, numeric or string-crunching
loops. Image pixel manipulation, cryptography, large parsers, physics.

It does not show up in event handlers, state updates, array transforms over tens or hundreds of
items, or anything else a typical screen does — because a JIT would never have had time to help
there either.

If you do have that kind of work, the answer is a [TurboModule](../core-concepts/turbomodules.md),
not a different engine. Native code is faster than an optimised JavaScript loop would have been
anyway, and it moves the work off the JS thread as a side effect.

### Garbage collection

Hermes uses a generational, mostly-concurrent collector. Short-lived garbage — the objects a render
produces and throws away — is cheap. The costs are:

- **Promotion.** An object that survives long enough moves to the old generation and is more
  expensive to collect from then on.
- **Retention.** A leak is not just memory; it lengthens collection work over the life of the
  process.

The practical rule is to avoid *keeping* things, not to avoid *creating* them. A module-level cache
keyed by user id that nothing ever evicts is a worse problem than any amount of per-render object
literal.

### Bytecode is version-locked

Bytecode compiled by one Hermes release is not loadable by another. That is why you cannot drop a
bundle built against a different React Native version into an existing binary, and it is the main
constraint on any over-the-air update scheme. See
[Over-the-Air Updates](../build-and-release/over-the-air-updates.md).

## Platform differences

The engine, the compiler and the bytecode format are the same on both platforms. What differs is
packaging, and it only matters for download size.

:::tabs
@tab iOS
The engine ships inside the app binary via the `hermes-engine` pod (or an `xcframework` under the
experimental Swift Package Manager path). One copy, one architecture set, handled by the App Store
thinning process.
@tab Android
The engine is a prebuilt `.so` per ABI. A universal APK carries every ABI's copy, which is pure
download weight for the user. Shipping an AAB lets Play deliver only the matching ABI. See
[AAB and Play Store Submission](../build-and-release/play-store-submission.md).
:::

## Performance considerations

- **Only release builds tell you anything.** In debug, Metro serves source and Hermes compiles it
  at load; you are measuring a different pipeline. This is the single most common cause of a bogus
  Hermes performance claim.
- **Do not micro-optimise the interpreter.** Rewriting `filter().map()` into one loop chases a cost
  you cannot measure next to a single unnecessary re-render.
- **Hoist work out of hot functions yourself.** Formatters, regular expressions, and constant
  lookup tables belong at module scope or in a `useMemo`, because nothing will lift them for you.
- **Keep top-level module work small.** Bytecode laziness means an unexecuted function is nearly
  free; a top-level side effect is not.
- **Move genuinely heavy computation off the JS thread.** Either into native code, or into a
  [worklet](../animation/worklets.md) if it is animation-shaped.
- **`-O` is on by default on Android and should stay on.** Turning it off to speed up a CI build
  changes what you are shipping.

## Security considerations

**Threat.** Developers assume bytecode is a form of protection and put secrets in the bundle.

**Exploit.** String literals survive compilation — the engine needs them at runtime — so they come
straight out of a release artifact:

```bash
unzip -o app-release.apk -d extracted
strings extracted/assets/index.android.bundle | grep -i "api[_-]\?key"
```

The bytecode itself can be disassembled with the Hermes tooling, which reconstructs control flow.
Minification renames your identifiers; it does not touch string contents.

**Fix.** Keep credentials server-side. Issue short-lived tokens to the client, authorise every
sensitive action on the server, and store device-side secrets in the Keychain or Keystore.

**Verification.** Run the command above against your own release artifact and grep for the names of
your secrets before every release. See
[Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

## Common mistakes

- **Benchmarking a debug build.** Wrong: "Hermes parses our bundle slowly" measured with Metro
  serving source. Right: measure a Release build, where the bundle is precompiled bytecode.
- **Treating bundle size as startup cost.** Wrong: aggressive code-splitting to speed up launch.
  Right: bundle size is download and disk; startup is module *evaluation*. See
  [Bundle Size](bundle-size.md) and [Startup Time](startup-time.md).
- **Micro-optimising JavaScript for the interpreter.** Wrong: replacing array methods with index
  loops across the codebase. Right: cut render count and work per item; the interpreter is not your
  bottleneck.
- **Expecting a hot numeric loop to get faster on its own.** Wrong: running a benchmark ten thousand
  times expecting a warm-up curve. Right: there is no tier-up; if the loop is the cost, move it
  native.
- **Disabling `-O` to shorten build times.** Wrong: changing `hermesFlags` in a release build to
  save CI minutes. Right: that ships unoptimised bytecode to users.
- **Assuming bytecode hides your code.** Wrong: shipping an API key because "it is compiled".
  Right: assume every string in the bundle is public.

## Related topics

- [Hermes](../core-concepts/hermes.md) — the engine itself and the trade it makes.
- [Startup Time](startup-time.md) — where module evaluation cost lands.
- [Bundle Size](bundle-size.md) — measuring the artifact, and Metro's tree-shaking limits.
- [Memory](memory.md) — retention, leaks and the concurrent collector.
- [Source Maps](../debugging/source-maps.md) — composing the Metro and bytecode maps.
- [Measuring Before Optimising](measuring-first.md) — how to get a number worth acting on.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — the full extraction walkthrough.
