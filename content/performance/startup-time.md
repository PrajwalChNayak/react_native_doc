---
title: Startup Time
description: What happens between the app icon being tapped and the first useful screen, which parts you can influence, and what actually moves the number.
status: current
toolchain: cli
---

Startup is the one performance number every user experiences and almost nobody profiles, because
the tools that are easy to reach — the Performance panel, the React Profiler — are attached after
the interesting part is over.

The good news is that the cost model is simple and most of it is under your control. The bad news
is that the largest single cost in a typical app is module evaluation at the entry point, and that
is invisible unless you go looking for it.

## Why it matters — and what "startup" means

Three launches with very different costs share the word:

| Launch | Starting state | What you pay |
| --- | --- | --- |
| **Cold** | Process does not exist | Process creation, native init, React Native host setup, bundle load and evaluation, first render |
| **Warm** | Process exists, activity/scene destroyed | Some native init, full JavaScript re-init in most setups |
| **Hot** | App in the background | Essentially nothing — a resume |

Cold start is the number that matters. It is what a user gets after a reboot, after the system
reclaims memory, and on first install.

**Time to Interactive (TTI)** is the metric worth tracking: the moment the user can meaningfully
act, not the moment something is painted. A splash screen paints immediately and interacts never.

## Why it exists / when to optimise it — and when not

Startup work is worth doing when your cold start on a mid-range device exceeds roughly two seconds,
or when you have added a feature and want to know what it cost. It is not worth doing on a flagship
device, because a flagship hides the problem entirely.

It is also the one area where the improvement is permanent: unlike render tuning, which decays as
the screen grows, removing a module from the startup path stays removed.

## Basic example

React Native exposes its own startup markers on the `performance` global. They are not part of the
public type surface, so a TypeScript file declares what it uses:

```ts title=src/perf/startup.ts
type StartupTiming = {
  /** Set by the platform via a native start-time marker; may be null. */
  startTime: number | null;
  /** When the React Native runtime began initialising. */
  initializeRuntimeStart: number | null;
  /** When evaluation of the JS bundle began. */
  executeJavaScriptBundleEntryPointStart: number | null;
  endTime: number | null;
};

// Installed by React Native's runtime setup. It lives under a private module,
// so it is NOT declared in react-native's shipped types — declare it locally
// rather than deep-importing, which is a type error under the Strict API.
declare const performance: {now(): number; rnStartupTiming?: StartupTiming};

export function startupBreakdown(): Record<string, number> | null {
  const t = performance.rnStartupTiming;
  if (t?.startTime == null || t.endTime == null) {
    return null;
  }
  return {
    // Native side: process start through React Native host creation.
    nativeInitMs: (t.initializeRuntimeStart ?? t.startTime) - t.startTime,
    // Runtime setup: engine, TurboModule registry, globals.
    runtimeSetupMs:
      (t.executeJavaScriptBundleEntryPointStart ?? t.startTime) -
      (t.initializeRuntimeStart ?? t.startTime),
    // Your code: evaluating the bundle's entry point and everything it pulls in.
    bundleEvalMs: t.endTime - (t.executeJavaScriptBundleEntryPointStart ?? t.startTime),
  };
}

/** Milliseconds from the start of bundle evaluation to now. */
export function sinceBundleStart(): number {
  return Date.now() - __BUNDLE_START_TIME__;
}
```

`__BUNDLE_START_TIME__` is a documented React Native global and *is* typed. Use it for your own
"time to first screen" marks; use `rnStartupTiming` for the breakdown above, accepting that
`startTime` is only populated when the platform sets its native start marker.

## How it works — the cold start timeline

1. **Process creation.** The OS forks and starts your process. You cannot influence this.
2. **Native initialisation.** Your `Application`/`AppDelegate` runs, the React Native host is
   created, and any third-party SDK you initialise eagerly runs here. **This is often the largest
   avoidable cost**, and it is native code, so no JavaScript profiler will show it.
3. **Bundle load.** The Hermes bytecode file is memory-mapped. There is no parse phase, so this is
   close to constant regardless of bundle size.
4. **Bundle evaluation.** Your entry point runs. Every module it transitively pulls in is evaluated,
   meaning every top-level statement in every one of them executes. This is the largest
   *JavaScript* cost and the one you control most directly.
5. **First render.** React renders your root, Fabric lays it out and mounts it.
6. **Data.** Whatever the first screen needs to fetch.

### Bundle size is not startup time

Because bytecode is memory-mapped and faulted in lazily, adding a module that never executes costs
disk, not launch time. A 12 MB bundle whose entry point touches 400 KB of it starts about as fast
as a 2 MB bundle that touches the same 400 KB.

What costs launch time is **evaluation**: top-level code that runs. See
[Bundle Size](bundle-size.md) for why the two are separate problems.

### Lazy requires are already on

React Native's Metro preset enables `inlineRequires` by default in 0.87 — verified in
`@react-native/metro-config@0.87.1`, which sets `transform.inlineRequires: true`.

```js title=metro.config.js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// getDefaultConfig already sets transform.inlineRequires: true. Do not
// "enable" it again; check it is not being overridden by a custom
// getTransformOptions in your own config.
module.exports = mergeConfig(getDefaultConfig(__dirname), {});
```

What inline requires do: a top-level `import` is rewritten so the `require` happens at the point of
*use* rather than at the top of the file. A module you import but never call into is therefore never
evaluated.

What they do **not** do: rescue a module you actually use on the first screen, or defer a module
with import-time side effects that something on the first screen touches.

### Module evaluation is the thing to hunt

Anything at module scope runs during step 4:

```ts title=src/config/bad-startup-cost.ts
// Every one of these runs during bundle evaluation, on the JS thread, before
// your first screen renders — even if nothing on that screen uses them.

// 1. A parse. Cheap per call, expensive when the payload is large.
export const COUNTRIES: ReadonlyArray<{code: string; name: string}> = JSON.parse(
  '[{"code":"GB","name":"United Kingdom"}]',
);

// 2. A derived index built eagerly.
export const COUNTRY_BY_CODE = new Map(COUNTRIES.map(c => [c.code, c]));

// 3. A regular expression compiled at import time (cheap), used rarely.
export const SLUG = /^[a-z0-9-]+$/;
```

The fix for the expensive ones is to make them lazy:

```ts title=src/config/good-startup-cost.ts
type Country = {code: string; name: string};

let cache: ReadonlyMap<string, Country> | null = null;

// Nothing happens at import time. The first caller pays, and only if there is
// a first caller at all.
export function countryByCode(): ReadonlyMap<string, Country> {
  if (cache == null) {
    const countries: Country[] = JSON.parse(
      '[{"code":"GB","name":"United Kingdom"}]',
    );
    cache = new Map(countries.map(c => [c.code, c]));
  }
  return cache;
}
```

### TurboModules are lazy; your SDK initialisation is not

The registry creates a native module the first time JavaScript asks for it, so linking fifty
libraries costs nothing at startup for the forty-eight this screen does not touch. See
[TurboModules](../core-concepts/turbomodules.md).

That laziness is defeated the moment you call `SomeAnalytics.init()` at module scope, or initialise
an SDK from native code in `Application.onCreate` / `application:didFinishLaunchingWithOptions:`.
Most "React Native starts slowly" reports resolve to three or four SDKs initialised eagerly in
native code.

### Deferring work after first paint

For work that must happen but does not have to happen before the user sees something, use the
`requestIdleCallback` global. It is React Native's scheduling primitive for idle work in 0.87.

```ts title=src/startup/afterFirstPaint.ts
declare function requestIdleCallback(
  callback: (deadline: {didTimeout: boolean; timeRemaining: () => number}) => void,
  options?: {timeout: number},
): number;

/**
 * Runs non-critical startup work once the JS thread has slack. The timeout is
 * a ceiling, not a target: without it, a busy thread can starve the callback.
 */
export function afterFirstPaint(task: () => void): void {
  requestIdleCallback(
    () => {
      task();
    },
    {timeout: 3000},
  );
}
```

> [!WARNING] The old deferral API is gone
> The deferral helper that pre-0.87 tutorials use for this was removed in 0.87. `requestIdleCallback`
> is the replacement. See [Common Performance Mistakes](common-performance-mistakes.md).

## Platform differences

:::tabs
@tab Android
Measure cold start from the shell. Force-stop first, or you are measuring a warm start:

```bash
adb shell am force-stop com.example.app
adb shell am start -W -n com.example.app/.MainActivity
```

`am start -W` reports `ThisTime`, `TotalTime` and `WaitTime` in milliseconds. `TotalTime` is the
one to track. Run it five times and take the median; the first run after an install is always an
outlier.

Android-specific costs:

- Everything in `Application.onCreate` runs before React Native does anything. Audit it.
- Baseline Profiles and R8 affect native startup independently of anything JavaScript does. See
  [ProGuard and R8](../build-and-release/proguard-and-r8.md).
- The Hermes `.so` is loaded per ABI; a universal APK is larger but this does not change startup.
@tab iOS
Use Instruments' **App Launch** template (Xcode → Open Developer Tool → Instruments), attached to a
Release build on a device. It breaks the launch into system phases and your own initialisers.

Xcode Organizer also reports launch-time metrics aggregated from real users on the App Store, which
is the only number here that reflects your actual device mix.

iOS-specific costs:

- Work in `application:didFinishLaunchingWithOptions:` runs before the React Native host exists.
- Dynamic framework count affects pre-main time. This is a native-build concern rather than a React
  Native one, but it lands in the same number.
:::

In both cases: measure a Release build, on a device, with the debugger detached. A debug build loads
JavaScript over HTTP from Metro and compiles it at load — a completely different pipeline.

## Common patterns

### Render a real first screen, not a spinner

TTI is when the user can act. A skeleton of the actual screen, rendered from cached data, beats a
spinner that waits for the network. If you have local data, show it and reconcile later. See
[Offline-First](../state-and-data/offline-first.md).

### Move navigation state restoration off the critical path

Rehydrating persisted navigation state before the first render adds a storage read to every launch.
Render the default screen, then restore.

### Keep the root component small

Everything the root imports is evaluated at startup, transitively. A root that imports the whole
navigation tree, every screen, and every store pulls all of them into step 4. Screens loaded through
a navigator are already required lazily by inline requires — as long as nothing else imports them
eagerly.

### Budget it

Put a startup number in CI, or at least in a checklist. Startup regressions arrive one 40 ms SDK at
a time and nobody notices until it is three seconds.

## Performance considerations

- **Audit native initialisation first.** It is usually the biggest avoidable block and the least
  examined.
- **Hunt top-level side effects.** Parsing, index building, SDK construction and subscription setup
  at module scope all run before your first screen.
- **Do not confuse bundle size with startup.** Bytecode is mapped, not parsed.
- **Defer with `requestIdleCallback`**, not with a `setTimeout(…, 0)` — a zero timeout still runs on
  the next tick, competing with the first render.
- **Measure cold, on a device, in Release, detached.** Any other configuration measures something
  else.
- **Five runs, median.** Cold-start numbers are noisy.

## Common mistakes

- **Measuring a warm start.** Wrong: relaunching from the recents screen. Right: `am force-stop`
  first on Android; kill from the app switcher on iOS.
- **Measuring a debug build.** Wrong: timing `npm run android`. Right: install and launch a Release
  build.
- **"Enabling" lazy requires that are already on.** Wrong: adding `inlineRequires: true` as a fix.
  Right: confirm your custom `getTransformOptions` is not *disabling* the preset's default.
- **Code-splitting to fix startup.** Wrong: elaborate bundle splitting because the bundle is large.
  Right: bytecode is lazy already; find the modules that *evaluate*.
- **Initialising SDKs at module scope.** Wrong: `Analytics.init()` at the top of a file the root
  imports. Right: initialise on first use, or after first paint.
- **Treating first paint as TTI.** Wrong: shipping a fast splash screen and declaring victory.
  Right: measure when the user can actually do something.
- **Blaming JavaScript for a native cost.** Wrong: optimising imports when three native SDKs take
  700 ms in `Application.onCreate`. Right: profile the native launch first.

## Related topics

- [Hermes and Bytecode](hermes-and-bytecode.md) — why the bundle is mapped rather than parsed.
- [Bundle Size](bundle-size.md) — the separate problem of download and disk.
- [TurboModules](../core-concepts/turbomodules.md) — why linked modules are free until used.
- [Measuring Before Optimising](measuring-first.md) — the measurement discipline.
- [Memory](memory.md) — what eager initialisation also costs you.
- [App Icons and Splash Screens](../build-and-release/icons-and-splash-screens.md) — what the user sees during step 1.
- [Common Performance Mistakes](common-performance-mistakes.md) — including the removed deferral API.
