---
title: Profiling
description: Profiling an Expo SDK 57 app with React Native DevTools — the Performance panel, React Profiler and Memory panel — plus when to reach for native profilers.
status: current
toolchain: expo
sdk: 57
---

Profiling answers the question measurement raises: **where** is the time going? On Expo SDK 57
(React Native 0.86.3) the primary tool is **React Native DevTools**, the debugger and profiler that
ships with React Native and connects to the Hermes engine.

This page covers opening it from the Expo dev server, which panel answers which question, and when
the answer lies outside JavaScript.

## Why it exists / when to use it — and when NOT to

Profile when you have a number that is too slow and do not know why — a screen that takes 800ms to
appear, a list that drops frames. Profiling without a specific question produces a large trace and
no conclusion.

Profiling is **not** measurement. A profiler adds overhead, and a development build is slower than
release. Use the profiler to find the cause; use a release build to measure the fix. See
[Measuring Before Optimising](measuring-first.md).

## Basic example

Start the dev server, open the app on a device or emulator, and press <kbd>j</kbd>:

```bash
npx expo start
```

The SDK 57 dev server's key commands include <kbd>j</kbd> "open debugger", <kbd>m</kbd> "toggle
menu" and <kbd>Shift</kbd>+<kbd>M</kbd> "more tools" (read from the installed `@expo/cli`). The
debugger is React Native DevTools, opened in Chrome or Edge.

If no app is connected, or the app is not running Hermes, the CLI warns that React Native DevTools
can only be used with Hermes.

## Expo Go vs development build

React Native DevTools connects to Expo Go and to development builds. Profile in a **development
build** of your own app: it contains your native dependencies and matches what you ship. Expo Go's
native layer is not yours.

## How it works

### Which panel answers which question

React Native DevTools provides these panels. Performance and Network have been available since
React Native 0.83, so they are present on SDK 57's 0.86:

| Question | Panel |
| --- | --- |
| What is the JS thread doing during this interaction? | **Performance** |
| Which components rendered, how often, and how long did each take? | **React Profiler** |
| What is on screen and with which props? | **React Components** |
| Is memory growing? What is retaining it? | **Memory** (heap snapshots) |
| Are requests slow, duplicated or waterfalling? | **Network** |
| What was logged? | **Console** |

SDK 57 also adds **light/dark appearance emulation** in React Native DevTools, so you can profile
both themes without changing the device setting.

### Performance panel

Record a session, perform the slow interaction, stop. The timeline shows JavaScript execution, React
performance tracks, network events and your own User Timings together.

Look for:

- **Long tasks on the JS thread** during a tap or a scroll — that is where frames are dropped.
- **Repeated identical work**, such as the same function called on every scroll event.
- **Gaps** where the JS thread is idle but the UI is still slow — the problem is native, see below.

You can annotate a trace and download it to share with a teammate.

### React Profiler

Record, interact, stop, and read the flame graph of React commits. Each bar is a component render and
its duration.

Look for components that render when their inputs did not change, and commits that take longer than a
frame. On an SDK 57 default-template project, **React Compiler** (`experiments.reactCompiler: true`)
already memoises components that follow the Rules of React. If a component still re-renders
unexpectedly, the profiler tells you, and that is the point to investigate — not before.

### Adding your own marks

Custom User Timings show up in the Performance panel next to React's own tracks, so you can mark "feed
request start" and "feed rendered":

```ts-fragment
performance.mark('feed-start');
// ...fetch and render...
performance.mark('feed-rendered');
performance.measure('feed', 'feed-start', 'feed-rendered');
```

This block is not type-checked: the `performance` global is not declared in the legacy React Native
0.86 type surface that SDK 57 projects resolve, so a strict TypeScript project needs its own
declaration to call it.

### When the problem is native

If the JS thread is idle during the slow part, JavaScript is not the bottleneck. Common native causes:
decoding large images, expensive shadows and transparency, or a native module doing work on the main
thread.

:::tabs
@tab Android
Use Android Studio's profiler (CPU, memory) against a debuggable build. Open the generated `android/`
project, or attach to the running process.
@tab iOS
Use Xcode Instruments (Time Profiler, Allocations, Animation Hitches) against the app. Requires macOS.
Profile on a physical device for realistic numbers.
:::

## Common patterns

### Profile, fix, then measure in release

1. Reproduce the slow interaction in a development build.
2. Record it in the Performance panel or React Profiler.
3. Fix the largest single cost.
4. Build a release variant (`npx expo run:android --variant release`) and measure the number again.

### Memory leaks

Take a heap snapshot, navigate into and out of a screen several times, take another. Objects that grow
with each visit — listeners never removed, intervals never cleared, caches with no bound — are leaks.

## Performance considerations

- DevTools itself slows the app. Never read absolute durations from a profiled development build as
  what users experience; compare relative costs within the trace.
- `console.log` of large objects is expensive while DevTools is attached, because objects are
  serialised for display.

## Common mistakes

- **Profiling with no question.** Record one specific slow interaction.
- **Reporting development-build durations as user-facing numbers.** Measure the fix in release.
- **Looking only at JavaScript.** If the JS thread is idle and the UI stutters, use the native
  profilers.
- **Hand-memoising before looking at the React Profiler** on a project with React Compiler enabled.
- **Expecting DevTools to connect to a non-Hermes runtime.** It requires Hermes.
- **Following React Native 0.87 DevTools docs literally.** SDK 57 is on 0.86.3; check that a feature
  existed by 0.86 before relying on it.

## Related topics

- [Measuring Before Optimising](measuring-first.md) — get the number before profiling.
- [Debugging Development Builds](../expo-development-builds/debugging.md) — breakpoints, logs and the dev menu.
- [Hermes](hermes.md) — the engine React Native DevTools connects to.
- [List Performance](list-performance.md) — what to look for in scroll traces.
- [Image Performance with expo-image](image-performance.md) — native decode costs.
