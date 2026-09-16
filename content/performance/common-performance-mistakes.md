---
title: Common Performance Mistakes
description: The React Native performance advice that stopped being true, the APIs that no longer exist, and what replaced each of them in 0.87.
status: current
allow-banned: interaction-manager
toolchain: cli
---

React Native's runtime changed fundamentally between 0.76 and 0.87. Most performance advice online
predates that change, and a lot of it is not merely outdated — it tells you to optimise a component
that has been deleted.

This page is the list. Each entry is a piece of advice you will find in tutorials, why it was
correct once, and what the current answer is.

## Why this page exists

Stale performance advice is worse than no advice. It costs you the time to implement it, the
complexity it adds to your code, and the time you did not spend on the thing that was actually slow.
It is also convincing: it was written by people who had measured something real, on a runtime that
no longer ships.

Before acting on anything you read — including this page — get a measurement. See
[Measuring Before Optimising](measuring-first.md).

## The removed APIs

These do not exist in 0.87. Code using them does not run, and advice built on them is dead.

### `InteractionManager` — removed

**The old advice:** wrap non-urgent work in `InteractionManager.runAfterInteractions()` so it waits
for animations and touches to finish.

**Why it existed:** it was React Native's only deferral primitive, tied to the old touch and
animation bookkeeping.

**What to use now:** the **`requestIdleCallback` global**. It is installed by React Native's runtime
setup and schedules a callback when the JavaScript thread has slack, with an optional timeout
ceiling.

```ts title=src/startup/deferred.ts
// React Native's shipped types do not declare this global, so declare what you
// use rather than deep-importing anything.
declare function requestIdleCallback(
  callback: (deadline: {didTimeout: boolean; timeRemaining: () => number}) => void,
  options?: {timeout: number},
): number;
declare function cancelIdleCallback(handle: number): void;

/** Runs `task` when the JS thread is idle, or at the latest after `timeoutMs`. */
export function runWhenIdle(task: () => void, timeoutMs = 2000): () => void {
  const handle = requestIdleCallback(() => task(), {timeout: timeoutMs});
  return () => cancelIdleCallback(handle);
}
```

`check.mjs` fails the build on any mention of the removed API outside a page like this one that
exists to warn about it.

### Standalone `react-devtools` — removed

**The old advice:** run `npx react-devtools` in a second terminal to inspect the component tree.

**Why it existed:** the component inspector lived outside the debugger.

**What to use now:** React Native DevTools. The **Components ⚛** and **Profiler ⚛** panels are inside
it. Open it with <kbd>j</kbd> in the Metro terminal or from the Dev Menu. See
[React Native DevTools](../debugging/react-native-devtools.md).

### The architecture flags — ignored

**The old advice:** toggle the New Architecture flags in `gradle.properties` or the Podfile to
compare performance, or to roll back when a library misbehaves.

**What is true now:** those flags have been ignored since 0.82, and from 0.83 the legacy classes are
being deleted. There is nothing to toggle. See
[The New Architecture](../core-concepts/new-architecture.md).

### FlashList's `estimatedItemSize` — not a v2 prop

**The old advice:** always set `estimatedItemSize` on `FlashList`, and tune it carefully.

**What is true now:** `@shopify/flash-list` v2 (2.3.2 at the time of writing) measures rows itself.
A guide that opens with `estimatedItemSize` is a v1 guide, and the rest of its advice is probably v1
too.

## The Bridge advice

This is the largest category, because the Bridge was the dominant cost for a decade and the entire
performance literature was organised around it.

> [!LEGACY] There is no Bridge
> As of 0.82 React Native runs bridgeless. JavaScript holds real C++ host objects through JSI and
> calls them directly; Fabric runs layout in C++ on a shared shadow tree; TurboModules are created
> on first use. The serialised, batched, asynchronous message queue that all of the advice below was
> about has been removed. See [The New Architecture](../core-concepts/new-architecture.md).

| Advice you will find | Why it was true | What is true now |
| --- | --- | --- |
| "Minimise bridge crossings" | Every crossing was a JSON serialise/parse pair | Crossings are virtual calls. Count is not the metric; **JS-thread work** is. |
| "Batch your bridge calls" | The queue flushed on a schedule, so many small messages were worse than one large one | There is no queue to batch into. Batch only to avoid repeated synchronous native work. |
| "The bridge is the bottleneck" | Often literally true | The bottlenecks are re-render volume, mount volume, image decode, list virtualization and startup module evaluation. |
| "Avoid passing large objects across the bridge" | Serialisation cost scaled with payload size | Data is shared, not copied. Passing a large array is not the problem it was. |
| "Use `setNativeProps` to skip the bridge" | It bypassed the React update path | Use an animation library that runs off the JS thread; `setNativeProps` fights the renderer. |
| "Linking many native modules slows startup" | Modules were constructed eagerly | TurboModules are created on first use. Linking fifty costs nothing for the forty-eight you do not call. |

The one piece of bridge-era advice that survives: **do not do long synchronous work on the JS
thread**. That was true then for different reasons and it is true now because JavaScript is still
single-threaded.

## The memoization folklore

**"Wrap everything in `React.memo` / `useCallback` / `useMemo`."**

Each of those has a cost on every render: an allocation, a stored dependency array, and a
comparison. A `memo` on a cheap component that receives a new object prop every render is strictly
worse than no `memo` — you pay the comparison, it fails, and you render anyway.

Memoize what the Profiler shows re-rendering needlessly *and* is expensive. See
[Render Performance and Memoization](render-performance.md).

**"Inline styles are always a performance problem."**

Partly true, for a reason people usually get wrong. The cost is not that the style is "inline"; it
is that an object literal in JSX is a new value every render, which defeats `memo` on anything
receiving it and adds allocation in hot paths. In a component that renders once, it does not
matter. In a list row, it does. Use `StyleSheet.create` and move on.

## The list folklore

**"Use `ScrollView` instead of `FlatList` for lists under 100 items."**

The number is invented. The real trade-off is that virtualization has bookkeeping overhead, so a
short bounded list is cheaper in a `ScrollView` — but "short" depends on how expensive each row is,
not on a row count someone picked.

**"Set `removeClippedSubviews` on everything."**

It defaults to `true` on Android and `false` on iOS, and React Native's own documentation for it
says it "may have bugs (missing content)". Turning it on without measuring trades a real
correctness risk for an unmeasured gain.

**"Copy these `windowSize` / `maxToRenderPerBatch` numbers."**

Those numbers depend on your row height, row cost and target device. Copying someone else's is a
coin flip. See [List Performance in Depth](list-performance.md).

## The measurement folklore

**"React Native is slow — look at these numbers."** Check which build produced them. A debug build
compiles JavaScript at load from Metro over HTTP, runs unminified code, keeps development
assertions, and hosts the whole developer tooling surface.

**"It felt faster after the change."** Mobile timings move 30 % run to run. Three runs, median,
same device, same starting state.

**"It's fast on my phone."** Your phone is not the median user's phone. Test on the slowest device
you support.

## The animation folklore

**"Animations are slow in React Native."**

Animations driven by React state are slow, because every frame runs the full render–commit–mount
pipeline. Animations that update view properties directly do not touch React at all.

```tsx title=src/components/FadeIn.tsx
import {useEffect} from 'react';
import {Animated, useAnimatedValue} from 'react-native';
import type {ReactNode} from 'react';

export function FadeIn({children}: {children: ReactNode}) {
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      // Without this, every frame is a JavaScript round trip and a re-render.
      // With it, the animation runs off the JS thread entirely.
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return <Animated.View style={{opacity}}>{children}</Animated.View>;
}
```

`useNativeDriver` works for `opacity` and `transform`, not for layout properties like `height` or
`width` — those have to go through layout. See
[Animation Performance Rules](../animation/animation-performance.md).

## Common mistakes

A condensed reference. Each is wrong → right.

- **Optimising the Bridge.** Wrong: restructuring code to reduce "bridge traffic". Right: the Bridge
  was removed in 0.82; profile the JS thread, render count and mount volume instead.
- **Deferring work with the removed `InteractionManager`.** Wrong: `runAfterInteractions`. Right:
  the `requestIdleCallback` global.
- **Running `npx react-devtools`.** Wrong: the standalone inspector. Right: the Components ⚛ and
  Profiler ⚛ panels in React Native DevTools.
- **Toggling architecture flags to compare.** Wrong: `newArchEnabled` in `gradle.properties`.
  Right: the flags are ignored; there is one architecture.
- **Memoizing on principle.** Wrong: `memo` on every component as a house style. Right: memoize what
  the Profiler shows is both frequent and expensive.
- **Inline `renderItem` in a `FlatList`.** Wrong: an arrow function in JSX. Right: `useCallback`, or
  define it outside the component — `FlatList` is a `PureComponent`.
- **`key={index}` in a list.** Wrong: index keys. Right: a stable id, or reordering and deletion
  corrupt row identity.
- **Benchmarking a debug build.** Wrong: any timing from `npm run android`. Right: Release, on a
  device, debugger detached.
- **Benchmarking in the simulator.** Wrong: an iOS Simulator trace. Right: real hardware — the
  simulator runs your Mac's CPU.
- **Animating layout properties through state.** Wrong: `setState` on `height` every frame. Right:
  animate `transform` and `opacity` with `useNativeDriver`, or use a worklet-based library.
- **Judging image cost by file size.** Wrong: "it is only 2 MB". Right: decoded size is
  width × height × 4 bytes regardless of compression.
- **Leaving `console.log` in release code.** Wrong: logging in a render or a scroll handler. Right:
  strip logs from release builds — each call is real work on the JS thread, and it leaks data. See
  [Safe Logging in Release Builds](../security/safe-logging.md).
- **Fixing bundle size to fix startup.** Wrong: splitting the bundle. Right: bytecode is mapped
  lazily; find the modules that *evaluate* at startup.
- **Changing four things at once.** Wrong: a "performance PR" with eight optimisations. Right: one
  change, one measurement.

## Related topics

- [Measuring Before Optimising](measuring-first.md) — the discipline that makes this page unnecessary.
- [The New Architecture](../core-concepts/new-architecture.md) — what replaced the Bridge, and when.
- [Render Performance and Memoization](render-performance.md) — where memoization pays and where it costs.
- [List Performance in Depth](list-performance.md) — the real virtualization model.
- [Startup Time](startup-time.md) — module evaluation, not bundle size.
- [Image Performance and Caching](image-performance.md) — the decode arithmetic.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — the full removal list.
- [Animation Performance Rules](../animation/animation-performance.md) — animating without the pipeline.
