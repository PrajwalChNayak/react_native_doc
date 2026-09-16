---
title: JS Thread vs UI Thread
description: Which thread runs your JavaScript, which one draws, where layout actually happens, and what changed now that the Bridge is gone.
status: current
toolchain: cli
---

A React Native app runs your code on more than one thread, and knowing which one is busy is the
difference between fixing jank and guessing at it. There are three places work happens: the **JS
thread**, the **main (UI) thread**, and **C++ renderer work** that runs on neither of them.

The mental model most articles give you is from before React Native 0.82, when everything crossed
a serialised, asynchronous Bridge. That description is now wrong in ways that will send you
optimising the wrong thing.

> [!LEGACY] "Everything is async over the bridge" is no longer true
> The Bridge was removed in React Native 0.82. There is no serialised message queue between
> JavaScript and native, no batching schedule to minimise, and no per-call JSON encoding cost.
> Synchronous calls in both directions are possible and routinely used. If advice you are reading
> is built on "minimise bridge traffic", it predates 0.82 and its conclusions do not transfer.
> See [The New Architecture](new-architecture.md).

## Why it exists / when to use it — and when NOT to

You need this model when something is janky and you have to decide *what* to fix: a slow render is
a JS thread problem, a slow scroll with an idle JS thread is a main thread problem, and they have
disjoint solutions. You also need it before touching animation, because the entire point of
Reanimated is moving work off one of these threads.

You do not need it to build screens. Nothing on this page changes how you write a component.

## The three places work happens

| Where | What runs there | What it means when it is busy |
| --- | --- | --- |
| **JS thread** | Your JavaScript: components, hooks, effects, event handlers, promises, timers, data parsing. React's reconciler | Handlers feel laggy, state updates arrive late, `setTimeout` drifts. Native scrolling and native-driven animation keep running, which makes this easy to misdiagnose |
| **Main / UI thread** | Mounting views, drawing, platform touch dispatch, native scrolling, `UIView` / `android.view.View` work, and Reanimated's UI runtime | Everything freezes, including scrolling. There is no second chance — this is the thread that draws |
| **C++ renderer work** | Building the shadow tree, Yoga layout, commit and diffing, off the main thread | Rarely your bottleneck directly. It is where the framework spends time so the other two do not |

There is only **one** JS thread for your application code. JSI removed serialisation; it did not
make JavaScript concurrent. A 200 ms synchronous loop is still 200 ms in which nothing else
JavaScript-driven happens.

## Basic example

The classic misdiagnosis: a screen where sorting a large array "breaks scrolling on Android but not
iOS", or "only sometimes".

```tsx title=Work that blocks the JS thread and nothing else
import {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';

type Row = {id: string; score: number};

export function BlockingWork({rows}: {rows: Row[]}) {
  const [sorted, setSorted] = useState<Row[]>(rows);

  // Runs on the JS thread. While it runs, no touch handler, no timer and no
  // React update can run — but the ScrollView keeps scrolling, because the
  // platform drives that on the main thread. That is exactly why a blocked
  // JS thread is easy to miss until a press does not respond.
  const sortNow = () => {
    setSorted([...rows].sort((a, b) => b.score - a.score));
  };

  return (
    <ScrollView>
      <Pressable onPress={sortNow} style={styles.button}>
        <Text>{`Sort ${sorted.length}`}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({button: {padding: 12}});
```

The symptom is not "scrolling stutters". The symptom is "I tapped and nothing happened for half a
second". Those are different threads and different fixes.

## How it works

### An update, end to end

1. **A touch lands on the main thread.** The platform view hands it to Fabric's C++ event
   pipeline, which finds the target in the shadow tree and delivers it to JavaScript.
2. **Your handler runs on the JS thread** and calls `setState`.
3. **React reconciles on the JS thread**, producing a new C++ shadow tree. Untouched subtrees are
   shared by pointer with the previous tree, so cost scales with what changed.
4. **Yoga computes layout** over that tree. This is pure C++ arithmetic that touches no platform
   view, so it runs off the main thread.
5. **The commit publishes the new tree atomically** — a compare-and-swap on the root, retried if
   another commit landed first. An abandoned render never commits and therefore never affects the
   screen, which is what makes React's concurrent features safe here.
6. **The mount phase runs on the main thread.** Fabric diffs the committed tree against the last
   mounted one and applies an ordered list of `Create` / `Insert` / `Update` / `Remove` / `Delete`
   instructions to real platform views.

Only step 6 *must* be on the main thread. See [The Render Pipeline](render-pipeline.md) for the
detail of steps 3 to 6.

### Not everything is asynchronous any more

This is the part that pre-0.82 material gets wrong. Under the current architecture:

- **JavaScript can call native synchronously.** A TurboModule method declared to return a value
  returns it in the same tick. `getLocaleSync(): string` is expressible; over the Bridge it was
  not.
- **Native can enter the JavaScript runtime synchronously on the calling thread.** The C++
  `RuntimeScheduler` exposes `executeNowOnTheSameThread`, documented in the installed headers as
  granting "access to the runtime synchronously on the caller's thread" — the mechanism behind
  synchronously dispatched events from a native component.
- **Some renders and mounts are synchronous.** The renderer supports mounting synchronously, and
  `UIManager` exposes `synchronouslyUpdateViewOnUIThread` for updating a mounted view's props
  directly on the UI thread. This is how a discrete, latency-critical interaction — text input
  echo is the canonical one — avoids a round trip through an asynchronous commit.
- **Measurement no longer queues behind a message batch.** The shadow tree is C++ and reachable
  through [JSI](jsi.md), so a measure is a read rather than a request.

The correct summary is not "everything is synchronous now". It is: **the thread boundary still
costs something, but it is a function call across threads rather than a message on a queue**, and
the framework uses synchronous paths where latency matters and asynchronous ones everywhere else.

### Priorities, not a flush schedule

The `RuntimeScheduler` orders JavaScript tasks by priority rather than draining a batch on a
timer. A discrete user event outranks a background transition, and React's concurrent rendering
can yield between units of work so a high-priority update is not stuck behind a low-priority one.

The practical consequence: a long **synchronous** function is still unyieldable. Scheduling helps
React interleave *its* work; it cannot interrupt your `for` loop. Breaking up genuinely expensive
work is still your job.

### The second JavaScript runtime

Reanimated adds a JavaScript runtime that lives on the **UI thread**. Worklets are functions
extracted at build time and rebuilt inside that runtime, so per-frame animation logic evaluates on
the thread that draws, without asking the JS thread for anything.

```tsx title=Work that deliberately avoids the JS thread
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function CrossThread({onSettled}: {onSettled: (at: number) => void}) {
  const progress = useSharedValue(0);

  // Evaluated on the UI thread's own JavaScript runtime, every frame.
  const style = useAnimatedStyle(() => ({opacity: progress.value}));

  const start = () => {
    // Assigning the animation happens on the JS thread. Every frame after
    // that needs no JavaScript-thread involvement at all.
    progress.value = withTiming(1, {duration: 300}, (finished) => {
      'worklet';
      if (finished) {
        // Crossing back to the JS thread is explicit, and costs something.
        scheduleOnRN(onSettled, Date.now());
      }
    });
  };

  return <Animated.View onTouchEnd={start} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({box: {width: 64, height: 64}});
```

The trade is symmetric and worth stating plainly: work moved to the UI runtime no longer competes
with React, and instead competes with drawing. A slow worklet freezes the interface outright. See
[The UI Thread and Worklets](../animation/worklets.md).

## Common patterns

### Telling the two threads apart

| Observation | Busy thread | Where to look |
| --- | --- | --- |
| Scrolling is smooth, but a tap does nothing for a moment | JS | Expensive handler, large re-render, JSON parsing, a synchronous storage read |
| Scrolling itself stutters while JavaScript is idle | Main | Too many mounted views, shadow or elevation cost, large images decoding, overdraw |
| An animation stutters only while a list is loading | JS | The animation is JS-driven. Move it to the native driver or Reanimated |
| An animation stutters with nothing else happening | Main | The animation itself is too expensive per frame, or it animates a layout prop |
| Everything freezes including scroll | Main | A blocking worklet, a synchronous native call from the UI thread, or a main-thread native module |

The React Native DevTools performance panel shows the JS thread directly. For the main thread, use
the platform profilers — Instruments on iOS, the Android Studio profiler or Perfetto on Android.
See [The Profiler and React Native DevTools](../performance/profiling.md).

### Getting expensive work off the JS thread

In rough order of preference:

1. **Do less.** Paginate, index the data once instead of scanning it per render, memoise the
   derived value. Most "we need a worker thread" problems are an algorithm problem.
2. **Move it to native.** A TurboModule that returns a `Promise` does its work on a native thread
   and resolves back on the JS thread. This is the right answer for image processing, crypto, file
   scanning and database queries.
3. **Move it to a worklet runtime.** `createWorkletRuntime` from `react-native-worklets` gives you
   a JavaScript runtime on a separate thread, which is appropriate for CPU-bound JavaScript that
   must stay in JavaScript. It is not appropriate for anything touching React.
4. **Chunk it.** Splitting a long loop across frames keeps the app responsive at the cost of total
   throughput. It is a last resort, not a first move.

### Synchronous native calls are a loaded gun

A synchronous TurboModule method is cheap once and ruinous in a loop, because each call blocks the
JS thread for the whole duration of the native work. Reading a preference at startup: fine.
Reading one per row while rendering a list: a stall proportional to the row count. Batch, or use
the asynchronous form.

## Platform differences

:::tabs
@tab iOS
The main thread is the UIKit main thread. Everything that touches a `UIView` happens there, and
blocking it stops touch handling and rendering outright. Reanimated's UI runtime also lives here.
@tab Android
The main thread is the Android UI thread, with the same properties. Android additionally does its
own work on that thread — measure/layout/draw for any non-Fabric views, and the choreographer's
frame callbacks — so it has slightly less headroom for your work than iOS does.
:::

The C++ renderer — shadow tree, Yoga, commit and diffing — is the same code on both platforms.
That is deliberate: layout behaviour should not depend on which phone you are holding.

## Performance considerations

- **Frame budget is 16.7 ms at 60 Hz and 8.3 ms at 120 Hz.** Modern devices ship 120 Hz displays,
  so the budget you are actually working against is often half what you assume.
- **JS thread work does not block drawing; it blocks responding.** Native scrolling continues
  during a long JavaScript task, which makes a blocked JS thread feel like an unrelated bug.
- **Main thread work blocks everything.** Prefer any other thread when you have a choice.
- **"Fewer crossings" is obsolete advice.** With the Bridge gone, the cost is no longer per-message
  serialisation. The costs that remain are re-render count, layout work, mount instruction volume
  and per-frame worklet cost. Optimise those.
- **Measure before you move anything.** Both of the expensive options above — native code and extra
  runtimes — add permanent complexity. See
  [Measuring Before Optimising](../performance/measuring-first.md).

## Common mistakes

- **Repeating the Bridge story.** Wrong: "batch your calls to avoid bridge traffic". Right: there
  is no Bridge in 0.82 and later. Find the actual cost — usually renders, layout or mounts.
- **Assuming JSI made JavaScript concurrent.** It did not. There is one JS thread for your app.
  Removing serialisation did not remove the single-threaded execution model.
- **Blaming the renderer for a blocked JS thread.** Wrong: reducing view depth because a tap feels
  slow. Right: profile the JS thread — the handler is probably doing the work.
- **Putting expensive work in a worklet to "get it off the main thread".** A worklet runs *on* the
  UI thread. Wrong: parsing JSON in a worklet. Right: a background worklet runtime, a native
  module, or not doing it at all.
- **Calling `runOnJS` / `scheduleOnRN` every frame.** That schedules a JS-thread task and
  serialises its arguments sixty or a hundred and twenty times a second. Drive a shared value and
  react to it once at the end instead.
- **Using a synchronous TurboModule call inside a render or a list row.** Each call blocks the JS
  thread. Read once, cache, or go asynchronous.
- **Benchmarking a debug build.** Development builds run unoptimised JavaScript with assertions on
  and a live Metro connection. The thread balance is not the same as in release.

## Related topics

- [The New Architecture](new-architecture.md) — why the Bridge went away and what replaced it.
- [The Render Pipeline](render-pipeline.md) — render, commit and mount in detail.
- [Fabric](fabric.md) — the C++ shadow tree and synchronous access to it.
- [JSI](jsi.md) — how synchronous calls across the boundary are possible at all.
- [TurboModules](turbomodules.md) — synchronous and asynchronous native methods.
- [The UI Thread and Worklets](../animation/worklets.md) — the second JavaScript runtime.
- [Animation Performance Rules](../animation/animation-performance.md) — keeping the drawing thread free.
- [Measuring Before Optimising](../performance/measuring-first.md) — find the busy thread first.
- [The Profiler and React Native DevTools](../performance/profiling.md) — the tools that show you.
