---
title: Measuring Before Optimising
description: How to get a real number out of a React Native app — React Native DevTools, the React Profiler, Perfetto and Instruments — and why an unmeasured optimisation is a guess.
status: current
toolchain: cli
---

Every other page in this section assumes you already know which part of your app is slow. This
page is how you find out. An optimisation applied without a measurement is a guess, and guesses
in React Native are expensive: most of the advice you will find online was written for a runtime
that no longer exists, and applying it costs you complexity in exchange for nothing.

The discipline is small. Reproduce the problem, measure it in a build that resembles what users
run, form one hypothesis, change one thing, measure again.

## Why it exists — and what goes wrong without it

The three failure modes are all common enough to have a shape.

**Optimising the wrong phase.** "The list is janky" is a symptom, not a cause. It can be JS-thread
work during render, it can be mount volume on the main thread, it can be image decoding, it can be
a native module blocking the UI thread. Each has a different fix and the fixes do not overlap. See
[The Render Pipeline](../core-concepts/render-pipeline.md) for the phases.

**Optimising a cost that is not there.** Wrapping every component in `memo`, or rewriting `map`
into a `for` loop, is work you can do without any evidence. It adds code, it adds bugs, and in the
memo case it can make things measurably slower — see
[Render Performance and Memoization](render-performance.md).

**Measuring a build nobody ships.** A debug build compiles JavaScript at load, runs unminified,
keeps development-only assertions and ships the whole DevTools surface. Its numbers are not related
to release numbers by any fixed factor.

> [!WARNING] Debug numbers are not release numbers
> Before you report, compare or act on any timing, check which build produced it. The single most
> common "React Native is slow" report is a debug build.

## Basic example

The cheapest useful measurement is a named trace around a suspect block. `Systrace` is exported
from `react-native` and its markers show up in an Android system trace alongside the framework's
own, so you see your code in the same timeline as layout and mount.

```ts title=src/perf/trace.ts
import {Systrace} from 'react-native';

/**
 * Wraps a synchronous block in a trace marker. `trace` ends the marker even if
 * `fn` throws, which a manual beginEvent/endEvent pair does not.
 */
export function traced<T>(name: string, fn: () => T): T {
  return Systrace.trace(name, fn);
}

/**
 * `isEnabled` is the guard for anything expensive you would only compute in
 * order to label a trace. Calling the marker functions when tracing is off is
 * cheap; building the label is not.
 */
export function tracedWithDetail<T>(
  name: string,
  detail: () => Record<string, string>,
  fn: () => T,
): T {
  return Systrace.trace(name, fn, Systrace.isEnabled() ? detail() : undefined);
}
```

Markers are a scalpel, not a profiler. Use them once you have a suspect; use the tools below to
find the suspect.

## How it works — the four tools that matter

### 1. React Native DevTools

The built-in debugger, and the only supported one. Two ways to open it against a running app:

- Press <kbd>j</kbd> in the terminal running Metro.
- Open the Dev Menu (<kbd>Ctrl</kbd>+<kbd>M</kbd> on Android, <kbd>Cmd</kbd>+<kbd>D</kbd> on the
  iOS simulator) and choose the debugger entry.

Both are verified against React Native 0.87: the Metro key handler binds <kbd>r</kbd> to reload,
<kbd>d</kbd> to open the Dev Menu and <kbd>j</kbd> to open DevTools.

> [!WARNING] Do not run a standalone react-devtools
> Standalone `react-devtools` WebSocket support was removed in 0.87. The React DevTools Components
> and Profiler panels are inside React Native DevTools now. See
> [React Native DevTools](../debugging/react-native-devtools.md).

The panels you will use for performance work:

| Panel | Answers |
| --- | --- |
| **Performance** | Where JS-thread time went over a recorded window, as a flame chart |
| **Profiler** (React DevTools) | Which components rendered, how often, and why |
| **Memory** | Heap snapshots, retained size, what is holding an object alive |
| **Network** | Request timing and payload size |
| **Console** | Your own logs and counters |

### 2. The React Profiler

The Profiler panel records React's own work: a commit-by-commit view with every component that
rendered and how long it took. It is the only tool that answers "why did this render" directly,
which is the question memoization work depends on.

Two habits make it useful:

- **Record the interaction, not the app.** Start recording, do the one thing, stop. A thirty-second
  recording of everything is unreadable.
- **Read the commit count first.** Twenty commits for one tap is a different problem from one
  commit that took 200 ms, and the fixes are unrelated.

See [The Profiler and React Native DevTools](profiling.md) for the full workflow.

### 3. Platform tracing — Perfetto and Instruments

React Native DevTools sees the JavaScript side. When JavaScript looks idle and the UI still
stutters, the cost is native and you need the platform's own tools.

:::tabs
@tab Android
Capture a system trace with Perfetto. The simplest path with no extra tooling is the on-device
capture in **Developer options → System Tracing**, which writes a `.perfetto-trace` file you pull
with `adb pull` and open at `ui.perfetto.dev`. Android Studio's profiler can capture the same data
while attached.

The tracks that matter are the app's main (UI) thread, the `mqt_js` JavaScript thread, and the
render/mount work in between. `Systrace` markers from your JavaScript appear as slices on the JS
thread track, which is what makes them worth adding.

```bash
adb shell dumpsys gfxinfo <your.application.id> framestats
```

`gfxinfo` is a fast first look: it reports frame timing histograms for the app without any capture
workflow at all.
@tab iOS
Use **Instruments**, which ships with Xcode (Xcode → Open Developer Tool → Instruments). Attach to
a Release-configuration build on a real device.

- **Time Profiler** samples every thread. The main thread track tells you whether mount or native
  work is the cost; the JavaScript thread appears as its own thread.
- **Allocations** and **Leaks** answer memory questions — see [Memory](memory.md).

Profiling in the simulator is misleading in both directions: the simulator has desktop CPU and no
GPU driver equivalence. Use a device, preferably the oldest one you support.
:::

### 4. The clock in your own app

For end-to-end numbers that no profiler gives you directly — time to first meaningful screen, time
from tap to content — instrument your own code. React Native defines
`__BUNDLE_START_TIME__` as a global, set before your bundle evaluates, which gives you a
zero point on the JavaScript side.

```tsx title=src/perf/TimeToContent.tsx
import {useEffect, useRef} from 'react';
import {Text} from 'react-native';

// `__BUNDLE_START_TIME__` is a React Native global: the moment the JS bundle
// began evaluating. Anything before it (process start, native init) is not
// visible from JavaScript — see startup-time.md for that half.
export function TimeToContent({label}: {label: string}) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) {
      return;
    }
    reported.current = true;
    const msSinceBundleStart = Date.now() - __BUNDLE_START_TIME__;
    console.log(`[perf] ${label} visible at +${msSinceBundleStart}ms`);
  }, [label]);

  return <Text>{label}</Text>;
}
```

This is a measurement, not telemetry. Ship the aggregate to your analytics if you want a trend;
ship `console.log` to production and you have a
[logging problem](../security/safe-logging.md) instead.

## Common patterns

### Build a baseline before you touch anything

Write the number down. "Scroll from top to item 500 on a Pixel 6a, Release build, cold start" is a
measurement you can repeat. "It feels better" is not. Three runs, take the median — mobile hardware
is noisy enough that a single run can move 30 %.

### Change one thing

If you apply four optimisations and the screen gets faster, you have learned nothing about which
three to revert. Each change gets its own measurement.

### Measure on the worst device you support

A flagship hides almost every performance problem in this section. The devices where render volume,
image decoding and startup time actually bite are the cheap ones, and they are what most of your
users have.

### Prefer a reproducible script to a manual poke

A scripted scroll or a repeated navigation gives you a comparable number across runs. Manual
scrolling does not, because your thumb is not a controlled variable.

## Performance considerations

Profiling is not free, and the overhead is not uniform:

- **The Performance panel adds JS-thread overhead.** Absolute numbers in a recording run high.
  Use it to find the *shape* — which function dominates — and confirm the improvement with a
  timing you take outside the profiler.
- **The React Profiler adds per-commit overhead.** A component that renders 500 times will look
  worse under the profiler than it is. The render *count* is still exactly right, and that is
  usually the number you needed.
- **Attaching DevTools at all changes startup.** Never measure cold start with the debugger
  attached.
- **Systrace markers cost something when tracing is on and almost nothing when it is off.** Leaving
  a handful in a release build is fine; wrapping every function is not.

## Common mistakes

- **Profiling a debug build.** Wrong: concluding the app is slow from `npm run android` output.
  Right: build the Release variant, install it, then profile. Debug compiles JavaScript at load and
  keeps development assertions.
- **Profiling in the simulator.** Wrong: an iOS Simulator Time Profiler trace used to justify a
  rewrite. Right: a real device, ideally the slowest one in your support matrix.
- **Taking one measurement.** Wrong: 820 ms before, 790 ms after, ship it. Right: three runs each,
  compare medians — that difference is inside the noise.
- **Optimising because a blog post said to.** Wrong: adding `removeClippedSubviews` everywhere
  because a 2019 article recommended it. Right: reproduce the problem, find the phase, then look
  for the fix that targets that phase.
- **Measuring with the debugger attached.** Wrong: cold-start timings taken with React Native
  DevTools connected. Right: detach, kill the app, cold start, measure.
- **Trusting advice about the Bridge.** Wrong: "batch your bridge calls" — there is no Bridge as of
  0.82. Right: the costs now are JS-thread work, re-render volume, mount volume and image work. See
  [The New Architecture](../core-concepts/new-architecture.md).

## Related topics

- [The Profiler and React Native DevTools](profiling.md) — the recording workflow in detail.
- [React Native DevTools](../debugging/react-native-devtools.md) — opening it and what each panel does.
- [The Render Pipeline](../core-concepts/render-pipeline.md) — which phase your cost belongs to.
- [Render Performance and Memoization](render-performance.md) — acting on a Profiler result.
- [List Performance in Depth](list-performance.md) — the most common source of measurable jank.
- [Startup Time](startup-time.md) — the one number a profiler will not hand you.
- [Common Performance Mistakes](common-performance-mistakes.md) — the folklore, and what replaced it.
