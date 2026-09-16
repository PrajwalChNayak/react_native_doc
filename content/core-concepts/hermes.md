---
title: Hermes
description: The default JavaScript engine — ahead-of-time bytecode, no JIT, and the trade it makes between peak throughput, startup time and memory.
status: current
toolchain: cli
---

Hermes is the JavaScript engine React Native runs on. It is the default, and as of 0.87 it is
effectively the only supported one: the `hermes_enabled` Podfile option is marked deprecated
in React Native's own build scripts, with the note that Hermes is the default engine and
JavaScriptCore has moved to community support under
`@react-native-community/javascriptcore`.

Two design decisions define it. Your JavaScript is compiled to **bytecode ahead of time**, and
the engine has **no JIT compiler**. Everything else about Hermes follows from those.

## Why it exists — and what it optimises for

Browser engines are tuned for a workload mobile apps do not have: a long-lived tab where a JIT
has minutes to observe hot code and generate optimised machine code, on a machine that is
plugged in. A phone app is the opposite. It starts, does a burst of work, and is killed.
Startup and memory dominate; peak throughput after thirty seconds of warm-up rarely matters.

Hermes takes the trade in that direction:

| Decision | You gain | You give up |
| --- | --- | --- |
| Bytecode compiled at build time | No parse or compile at startup; the bundle is memory-mapped and executed | Build-time cost, and a larger on-disk artifact than minified source |
| No JIT | Lower memory, smaller engine binary, no warm-up, no JIT-writable pages | Peak throughput on long-running numeric loops |
| Compact object model and a concurrent GC | Smaller heap, shorter pauses | Some allocation-heavy patterns cost more than on a JIT engine |

For an app whose JavaScript mostly reacts to events and updates a UI, that trade is strongly
positive. For an app doing sustained heavy computation in JavaScript, it is not — and the
right answer there is usually to move the computation into native code behind a
[TurboModule](turbomodules.md), not to swap engines.

## Basic example

You do not import Hermes. You observe it. The engine identifies itself through a global that
only exists when Hermes is running:

```ts title=Detecting the engine at runtime
type MaybeHermes = {HermesInternal?: object | null};

export function isHermes(): boolean {
  // `HermesInternal` is defined only when Hermes is the running engine.
  return Boolean((globalThis as unknown as MaybeHermes).HermesInternal);
}
```

This is a diagnostic, not something to branch application logic on. `HermesInternal` is not a
public API and its contents change between releases — check for its presence, do not read from
it.

## How it works

### Development: source over the wire

In a debug build, Metro serves your JavaScript as **source** over HTTP. Hermes compiles it to
bytecode in memory as it loads. That is what makes Fast Refresh possible — a changed module is
re-sent and re-evaluated without a rebuild.

The consequence is that debug performance is not release performance. Comparing them tells you
almost nothing.

### Release: bytecode in the bundle

In a release build the pipeline has two stages:

1. **Metro** bundles and minifies your JavaScript into a single file and, if source maps are
   enabled, emits a packager source map.
2. **`hermesc`** compiles that file with `-emit-binary -O` into Hermes bytecode, written to
   the file the app ships (`main.jsbundle` on iOS, `index.android.bundle` on Android). With
   source maps enabled it also emits a bytecode map, which is then **composed** with Metro's
   map so a single map takes you from a bytecode address back to your original source.

That composition step is why release stack traces need the *final* composed map, and why using
Metro's intermediate map alone produces frames that point at the wrong lines. See
[Source Maps](../debugging/source-maps.md).

At runtime the bytecode file is memory-mapped. Functions are not eagerly deserialised; pages
are faulted in as they execute. This is the startup win: there is no parse phase proportional
to bundle size, so adding a rarely-executed screen costs disk, not launch time.

### No JIT, concretely

Hermes interprets bytecode. There is no tier-up, no profiling of hot functions, no generation
of machine code.

- **A tight numeric loop** is slower than on a JIT engine — plausibly several times slower once
  a JIT would have warmed up.
- **Typical app code** — event handlers, state updates, array transforms over tens or hundreds
  of items — is not measurably slower, because it never runs long enough for a JIT to help.
- **Startup is faster and steadier**, because there is no compilation happening while your
  first screen is trying to render.
- **Memory is lower**, because there is no JIT code cache and no need for writable-executable
  pages.

If you have JavaScript that genuinely needs peak throughput — image processing, cryptography,
large parsing — move it to native. That is a better answer than an engine swap on every axis
including maintenance.

### Garbage collection

Hermes uses a generational, mostly-concurrent collector: most collection work happens on a
separate thread rather than stopping JavaScript. Short-lived allocations — the objects a render
produces and discards — are cheap.

What still hurts is *retention*. An object that survives into the old generation costs more to
collect, and a leak shows up as steadily growing memory and lengthening pauses. The usual
culprits are event subscriptions never removed, timers never cleared, and closures captured by
module-level caches. See [Memory](../performance/memory.md).

### Debugging

React Native DevTools connects to Hermes over the Chrome DevTools Protocol, which Hermes
implements directly. That gives you real breakpoints, stepping, a console bound to the actual
runtime, and a JavaScript sampling profiler — in the engine your app actually ships with.

> [!WARNING] Do not reach for the old remote-debugger workflow
> Standalone `react-devtools` WebSocket support was removed in 0.87. Use
> [React Native DevTools](../debugging/react-native-devtools.md). Any workflow that ran your
> JavaScript in a desktop browser engine was measuring a different engine than the one that
> ships, which made its performance numbers meaningless.

## Platform differences

Hermes is the same engine on both platforms, and the same bytecode format. The packaging
differs.

:::tabs
@tab iOS
The engine ships as a `hermes-engine` pod, or as an `hermes-engine.xcframework` under the
experimental Swift Package Manager path. `hermesc` is invoked by the `react-native-xcode.sh`
build phase; if `HERMES_CLI_PATH` cannot be resolved the release build fails loudly rather
than silently shipping plain JavaScript.
@tab Android
The engine ships as a prebuilt `.so` inside the APK/AAB, one per ABI. `hermesc` runs as part
of the React Native Gradle plugin's bundle task. Because the engine is a native library, it is
duplicated per ABI in a universal APK — shipping an AAB, where Play delivers only the matching
ABI, is what keeps that cost off the user's download.
:::

Bytecode is portable across both — it is the same compiler and the same format — but it is
**versioned**. Bytecode compiled by one Hermes release is not loadable by a different one, which
is why you cannot ship a bundle built against a different React Native version to an existing
binary.

## Performance considerations

- **Measure release builds only.** A debug build compiles source at runtime, runs unminified
  code, and has development-only checks. Numbers from it are not signal.
- **Bundle size affects disk and memory more than startup.** Because there is no parse phase,
  the startup cost of an extra module is close to zero until it executes. Bundle size still
  matters for download size and for the pages faulted in.
- **Lazy-require heavy modules.** The win is not parsing, it is avoiding the module's top-level
  side effects and the objects it allocates.
- **Do not micro-optimise for the interpreter.** Rewriting a `map` into a `for` loop chases
  noise. The wins in a React Native app are almost always fewer renders, fewer commits and less
  work per item — not tighter JavaScript.
- **Keep long work off the JS thread.** Hermes is single-threaded on the JS thread like any
  engine. A 300 ms function freezes the app regardless of how fast the engine is.

## Security considerations

**Threat.** Everything in your JavaScript bundle ships inside the app and is readable by anyone
who has the app. Bytecode is not encryption.

**Exploit.** An attacker unzips the release artifact and reads the bundle directly:

```bash
unzip -o app-release.apk -d extracted
strings extracted/assets/index.android.bundle | grep -i "api[_-]\?key"
```

String literals survive compilation to bytecode, because the engine needs them at runtime.
API keys, endpoint URLs, feature-flag names and developer comments in string form all come out.
The bytecode itself can be disassembled with the Hermes tooling, which reconstructs the control
flow of your code.

**Fix.** Do not put secrets in the app. Keep credentials server-side, issue short-lived tokens
to the client, and require the server to authorise every sensitive action rather than trusting
a client-side check. Where a value must be on the device — a session token — store it in the
Keychain or Keystore, not in the bundle and not in plain storage.

**Verification.** Run the `strings` command above against your own release artifact before you
ship, and grep for the names of your secrets. If any appear, they are compromised the moment
the app is published. See [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

> [!NOTE] What minification and R8 actually buy you
> They shrink the artifact and raise the effort required to read it. They are not encryption,
> and they do not remove string literals. See
> [Obfuscation and Its Limits](../security/obfuscation.md).

## Common mistakes

- **Benchmarking in a debug build.** Wrong: concluding Hermes is slow from a development
  build where JavaScript is compiled at load. Right: profile a release build.
- **Expecting a stack trace to be readable without source maps.** Wrong: pasting a release
  trace with bytecode offsets into a bug report. Right: symbolicate with the composed source
  map; see [Reading a Release Stack Trace](../debugging/release-stack-traces.md).
- **Swapping engines to fix a slow app.** Wrong: reaching for a different engine because one
  screen janks. Right: profile first — it is nearly always render volume or a blocked JS
  thread, neither of which an engine change fixes.
- **Treating `HermesInternal` as an API.** Wrong: branching behaviour on its contents. Right:
  use it for diagnostics only; it is unstable by design.
- **Assuming bytecode hides your code.** Wrong: shipping an API key because "it's compiled".
  Right: assume every string in your bundle is public.
- **Shipping a bundle built against a different React Native version.** Wrong: swapping a
  bundle into an existing binary. Right: bytecode is version-locked to the engine in that
  binary; rebuild both together.

## Related topics

- [JSI](jsi.md) — the C++ interface Hermes implements.
- [The New Architecture](new-architecture.md) — where the engine sits in the whole.
- [JS Thread vs UI Thread](threading-model.md) — what "single-threaded JavaScript" costs.
- [Hermes and Bytecode](../performance/hermes-and-bytecode.md) — the performance-focused treatment.
- [Startup Time](../performance/startup-time.md) — what actually happens during a cold start.
- [Source Maps](../debugging/source-maps.md) — composing the Metro and bytecode maps.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — the full extraction walkthrough.
