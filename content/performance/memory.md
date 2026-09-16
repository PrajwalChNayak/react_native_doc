---
title: Memory
description: The two heaps a React Native app has, how Hermes collects the JavaScript one, the leaks that actually happen, and how to see each kind of memory.
status: current
toolchain: cli
---

A React Native app has two separate pools of memory and almost every confusing memory investigation
starts with mixing them up. The **JavaScript heap** holds your objects, closures and component
state, and is collected by Hermes. **Native memory** holds views, decoded images, native module
state and the engine itself, and is not visible from JavaScript at all.

A heap snapshot that shows 12 MB while the process uses 600 MB is not a broken tool. It is the
correct answer to a different question.

## Why it matters

Running out of memory is not a slowdown, it is a kill. Android's low-memory killer terminates your
process; iOS's jetsam does the same. To the user both look like "the app closed itself", and neither
produces a JavaScript stack trace.

Before that point, memory pressure shows up as:

- Background termination, so every app switch becomes a cold start.
- More frequent and longer garbage collections.
- Images being evicted and re-decoded while scrolling.

## Basic example — the leak that actually happens

Subscriptions outliving their component is the most common JavaScript leak in React Native, and it
is entirely preventable with a cleanup function:

```tsx title=src/hooks/useAppForeground.ts
import {useEffect, useRef} from 'react';
import {AppState, Dimensions, Keyboard} from 'react-native';
import type {AppStateStatus, EventSubscription} from 'react-native';

export function useAppForeground(onForeground: () => void): void {
  // The ref keeps the callback current without making it a dependency, so the
  // subscription is created once rather than on every render of the caller.
  const latest = useRef(onForeground);
  latest.current = onForeground;

  useEffect(() => {
    const subscriptions: EventSubscription[] = [
      AppState.addEventListener('change', (status: AppStateStatus) => {
        if (status === 'active') {
          latest.current();
        }
      }),
      Dimensions.addEventListener('change', () => {}),
      Keyboard.addListener('keyboardDidHide', () => {}),
    ];

    // Every one of these returns an EventSubscription, and every one of them
    // holds a reference to the closure — and therefore to everything it
    // captures — until it is removed.
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, []);
}
```

The leak is not the subscription object; it is the closure it holds, and whatever that closure
captured. A handler that captures a component's whole props object pins that object, its children
and any data hanging off it for the life of the subscription.

## How it works

### The Hermes heap

Hermes uses a generational, mostly-concurrent collector. Most collection work happens on its own
thread rather than stopping JavaScript, and short-lived allocations are cheap — the objects a render
produces and discards cost very little.

What costs:

- **Promotion.** An object that survives long enough is moved to the old generation, where
  collecting it is more expensive.
- **Retention.** Anything still reachable is not collected, however long ago you stopped caring
  about it. This is the entire cause of JavaScript-side memory growth.

The rule follows directly: worry about what you *keep*, not what you *create*. A per-render object
literal is noise. A module-level `Map` that nothing evicts from is a leak with a schedule.

### Native memory

None of the following appears in a JavaScript heap snapshot:

| Kind | Where it lives | Typical size |
| --- | --- | --- |
| Decoded images | Platform image cache (Fresco on Android, the iOS image loader) | Megabytes each — see [Image Performance and Caching](image-performance.md) |
| Mounted views | `UIView` / `android.view.View` plus Fabric shadow nodes | Small each, large in aggregate for a long list |
| Native module state | Whatever the module allocates | Varies |
| The engine and native libraries | Process | Tens of megabytes, fixed |

For most apps that hit an out-of-memory kill, the cause is decoded images, not JavaScript objects.

### The leaks worth knowing

**Unremoved subscriptions.** `AppState`, `Dimensions`, `Keyboard`, `NativeEventEmitter`,
navigation listeners, store subscriptions. Each returns something with a `remove()`; call it in the
effect's cleanup.

**Uncleared timers.** `setInterval` without `clearInterval` keeps running after the component is
gone, keeps its closure alive, and keeps calling `setState` on an unmounted tree.

**Module-level caches.** A `const cache = new Map()` at module scope is never collected. It is fine
if it is bounded; it is a leak if it is keyed by user, session, request or image URL and never
evicted.

**Closures capturing more than they need.** A handler that reads `props.item.id` captures `props`,
which captures everything on it. Destructure the one field you need before creating the closure.

**Retained navigation state.** Holding a large result set on a screen that stays mounted in a stack
means it is alive for as long as the user can go back to it.

**Detached native views.** Less common, and usually a bug in a native module rather than in your
code — but it is why a "leak" can be invisible to JavaScript tooling entirely.

### Seeing each kind

| Question | Tool |
| --- | --- |
| What is retaining this JavaScript object? | Memory panel in React Native DevTools — take two heap snapshots, compare |
| Is the JavaScript heap growing over time? | Repeated snapshots across the same navigation cycle |
| Is native memory growing? | Instruments (Allocations) on iOS; Android Studio's memory profiler |
| How much memory does the process use right now? | `adb shell dumpsys meminfo <package>` on Android |

The two-snapshot comparison is the technique that finds real leaks: snapshot, perform a full cycle
(open a screen, close it, return to where you started), snapshot again, and look at what is larger.
A single snapshot tells you what exists, not what should have been freed.

## Platform differences

:::tabs
@tab Android
Memory limits are per-app and lower than the device's RAM suggests. The low-memory killer terminates
background processes first, so a memory-heavy app is the first thing evicted when the user switches
away — which turns every return into a cold start.

```bash
# Total PSS, and the split between Java heap, native heap and graphics.
adb shell dumpsys meminfo com.example.app
```

The `Graphics` and `Native Heap` lines are where decoded bitmaps show up. If those grow while the
Java heap is flat, your problem is images.

Android Studio's memory profiler can capture both a Java/Kotlin heap dump and native allocations
while attached to a debuggable build.
@tab iOS
Use Instruments' **Allocations** template for growth over time and **Leaks** for cycles that are
unreachable but not freed. Attach to a Release build on a device; the simulator has the host
machine's memory and will hide the problem completely.

Jetsam terminations are recorded on the device and appear as `JetsamEvent` reports — these are the
crashes with no stack trace that correlate with heavy screens. See
[Native Crash Logs](../debugging/native-crash-logs.md).
:::

## Common patterns

### Clean up in every effect that subscribes

If an effect creates anything — a subscription, a timer, an observer, an in-flight request — its
return value should destroy it. This is a mechanical rule and it removes most JavaScript leaks
without any investigation.

### Bound every cache

A cache without an eviction policy is a leak you have named. Cap the entry count, key it by
something that turns over, or clear it on a lifecycle event.

### Keep list windows small

`windowSize` on `FlatList` directly controls how many rows are mounted, and mounted rows hold
views, shadow nodes and images. Dropping from the default `21` to `11` roughly halves the mounted
cell count. See [List Performance in Depth](list-performance.md).

### Release large data when you navigate away

A screen holding a 5 MB parsed response keeps it while it remains in the navigation stack. If the
data is re-fetchable and cached elsewhere, drop the local copy on blur.

### Abort in-flight work on unmount

An `AbortController` cancelled in cleanup stops both the request and the closure chain waiting on
it. Since 0.82 an uncaught rejection raises `console.error`, so the abort rejection must be caught
rather than ignored.

## Performance considerations

- **Test on a low-memory device.** A 3 GB Android phone is where memory problems are visible; a
  flagship will absorb nearly anything.
- **Profile a Release build.** Development builds hold extra data structures and inflate every
  number.
- **Look at images first.** For a list-heavy app, decoded bitmaps are almost always the largest
  single allocation.
- **Compare snapshots, do not read one.** Absolute heap size means little; growth across an
  identical cycle means a leak.
- **Do not micro-manage allocation.** Hermes collects short-lived garbage cheaply. Rewriting code to
  avoid intermediate arrays is effort spent on the wrong half of the problem.
- **Watch memory while scrolling, not while idle.** Idle memory is the floor; scrolling a long list
  is where the ceiling is.

## Common mistakes

- **Looking for image memory in a JS heap snapshot.** Wrong: concluding there is no leak because the
  heap is 10 MB. Right: bitmaps are native; use the platform tools.
- **Subscribing without cleanup.** Wrong: `AppState.addEventListener(...)` in an effect with no
  return. Right: `return () => subscription.remove()`.
- **`setInterval` in a component without `clearInterval`.** Wrong: a polling timer started in an
  effect and never cleared. Right: clear it in cleanup; otherwise it outlives the screen.
- **Unbounded module-level caches.** Wrong: `const byId = new Map()` at module scope, written to per
  request. Right: cap it, or scope it to something that gets destroyed.
- **Capturing whole props in a long-lived closure.** Wrong: a subscription handler reading
  `props.item.title`. Right: destructure `title` outside the closure so only it is captured.
- **Profiling memory in the iOS Simulator.** Wrong: Allocations against the simulator. Right: a
  device, in Release — the simulator has your Mac's memory.
- **Reading one snapshot and declaring a leak.** Wrong: "150 000 objects, that seems like a lot".
  Right: take two snapshots around a complete cycle and compare.

## Related topics

- [Hermes](../core-concepts/hermes.md) — the collector and the heap it manages.
- [Image Performance and Caching](image-performance.md) — the largest native allocation in most apps.
- [List Performance in Depth](list-performance.md) — `windowSize` as a memory lever.
- [The Profiler and React Native DevTools](profiling.md) — taking and comparing heap snapshots.
- [Native Crash Logs](../debugging/native-crash-logs.md) — reading an out-of-memory termination.
- [App Lifecycle and AppState](../state-and-data/app-lifecycle.md) — subscriptions with a lifecycle.
- [Measuring Before Optimising](measuring-first.md) — confirming memory is your problem.
