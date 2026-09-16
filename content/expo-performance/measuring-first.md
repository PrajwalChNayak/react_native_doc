---
title: Measuring Before Optimising
description: An unmeasured optimisation is a guess. How to get a baseline number on an Expo SDK 57 app before you change anything, and which build to measure.
status: current
toolchain: expo
sdk: 57
---

An unmeasured optimisation is a guess. Sometimes the guess is right; often it moves a cost
somewhere you are not looking, and sometimes it makes the app slower while making the code
harder to read. This page is about getting a number **before** you change anything, so that
every other page in this section has something to be compared against.

The rule for the whole section: **write down the number, change one thing, measure again.**
If the number did not move, revert the change.

## Why it exists / when to use it — and when NOT to

Performance work on React Native attracts folklore. "Wrap everything in `useMemo`", "never use
inline styles", "`FlatList` is slow" — each was true for somebody, on some version, in some
build. None of it is a substitute for a trace of **your** app on **your** target device.

Measure first when:

- A user or tester reports something specific: slow launch, janky scroll, a screen that takes a
  beat to appear.
- You are about to add a dependency or architectural change justified by "performance".
- You are preparing a release and want a baseline to catch regressions later.

Do **not** start a performance project when nothing is slow. Code that is fast enough is done.
Time spent shaving milliseconds off a screen nobody complains about is time not spent on the
screen they do complain about.

## Basic example

The smallest useful measurement is a timestamp at two points you care about. This logs how long
a screen takes from mount to having its data:

```tsx title=app/orders.tsx
import {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';

async function fetchOrders(): Promise<string[]> {
  const res = await fetch('https://api.example.com/orders');
  return (await res.json()) as string[];
}

export default function Orders() {
  const mountedAt = useRef(Date.now());
  const [orders, setOrders] = useState<string[] | null>(null);

  useEffect(() => {
    fetchOrders().then((result) => {
      setOrders(result);
      // One number, logged in a form you can grep and compare between builds.
      console.log(`[perf] orders-ready ${Date.now() - mountedAt.current}ms`);
    });
  }, []);

  return (
    <View>
      <Text>{orders ? `${orders.length} orders` : 'Loading'}</Text>
    </View>
  );
}
```

That is crude, and it is still better than no number. For anything more precise, use the
Performance panel in React Native DevTools — see [Profiling](profiling.md).

## How it works

### Measure the build your users run

A development build running against Metro is **not** representative. In development:

- JavaScript is served unminified from the dev server rather than loaded as precompiled Hermes
  bytecode from the app binary.
- React runs its development-mode checks, which make renders measurably slower.
- Fast Refresh and the debugger connection add their own overhead.

So a screen that stutters in development may be fine in release, and a startup regression can
hide completely behind development-mode noise. Use development builds to **find** where time is
going, and release builds to **measure** how much.

Build a release variant locally, without EAS:

:::tabs
@tab Android
```bash
npx expo run:android --variant release
```
@tab iOS
```bash
# Requires macOS with Xcode.
npx expo run:ios --configuration Release
```
:::

Both flags are read from the installed `@expo/cli` for SDK 57. `run:android` and `run:ios` run
prebuild to generate native projects if they are missing — see the warning below.

> [!DANGER] `expo run` and `expo prebuild` regenerate native directories
> In SDK 57, `npx expo prebuild` **clears and regenerates** `ios/` and `android/` by default. If you
> hand-edited either directory, those edits are lost. Pick one strategy — fully generated, or
> committed native directories without prebuild — and do not mix them. See
> [expo prebuild](../expo-core-concepts/prebuild.md).

### Measure on the slowest device you support

A recent flagship phone hides nearly every problem. Keep a low-end Android device (or at least
an emulator with limited CPU and RAM) as the reference. Startup and list scroll are the two
measurements most sensitive to device class.

### Record the baseline somewhere durable

A number in a terminal scrollback is lost by tomorrow. Keep a short table in the repository or
the pull request:

| Metric | Device | Build | Before | After |
| --- | --- | --- | --- | --- |
| Cold start to first screen | Low-end Android | release | — | — |
| JS bundle size (`.hbc`) | — | `npx expo export` | — | — |
| Orders screen ready | Low-end Android | release | — | — |

Repeat each timing several times and take the median. A single run is noise.

## Common patterns

### Know the four numbers that matter most

| What | How to get it | Page |
| --- | --- | --- |
| Startup time | Native launch timing on a release build | [Startup Time](startup-time.md) |
| Bundle size | `npx expo export` output size, Expo Atlas | [Bundle Size](bundle-size.md) |
| Render cost | React Profiler in React Native DevTools | [Profiling](profiling.md) |
| Scroll smoothness | Performance panel while scrolling | [List Performance](list-performance.md) |

### Account for React Compiler before hand-memoising

The SDK 57 default template enables React Compiler: `experiments.reactCompiler` is `true` in the
generated `app.json` (read from `expo-template-default@57.0.24`). The Expo CLI passes that flag to
the Babel transform, and the compiler inserts memoisation automatically.

That changes the advice you will find online. Before adding `useMemo`, `useCallback` or `memo`
to fix a slow render, profile first — on a compiled project the component may already be
memoised, and a manual wrapper adds code without changing the number.

## Performance considerations

Measurement itself has a cost. `console.log` in a hot path (a list row, an animation frame) is
slow enough to distort what you are measuring, and it is not free in release builds either.
Remove temporary logging once you have your number, or gate it behind `__DEV__`.

## Common mistakes

- **Optimising in a development build.** Development-mode React and unbundled JavaScript make
  everything slower in ways that do not exist in release. Find problems in development; measure
  them in `--variant release` / `--configuration Release`.
- **Changing several things at once.** If you swap the list component, add memoisation and
  shrink images in one commit, you cannot tell which one helped — or which one hurt.
- **Measuring once.** Launch times vary by hundreds of milliseconds between runs. Take the median
  of several runs.
- **Hand-memoising on a React Compiler project.** Wrong: wrap every callback in `useCallback`
  because a blog post said so. Right: check whether `experiments.reactCompiler` is on, profile,
  and memoise only what the profile points at.
- **Testing only on a fast phone.** The users who notice performance problems are on the slow
  ones.
- **Treating Expo Go as a performance baseline.** Expo Go is a sandbox with its own binary and a
  development-mode bundle. It says nothing about your release build.

## Related topics

- [Profiling](profiling.md) — React Native DevTools, the Performance panel and React Profiler.
- [Startup Time and the Splash Screen](startup-time.md) — the first number most users notice.
- [Bundle Size and Tree Shaking](bundle-size.md) — measuring what ships.
- [Debugging Development Builds](../expo-development-builds/debugging.md) — the tooling that profiling builds on.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — why Expo Go is not a benchmark.
