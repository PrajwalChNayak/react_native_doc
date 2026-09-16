---
title: The Render Pipeline
description: What happens between setState and a pixel changing — render, commit and mount, which thread runs each, and where jank actually comes from.
status: current
toolchain: cli
---

Between calling `setState` and a pixel changing, React Native does a fixed sequence of work.
Knowing that sequence is what turns "the list feels janky" into a specific question with a
specific answer.

There are three phases — **render**, **commit** and **mount** — and they do not all run on the
same thread.

## Why it matters

Most performance advice for React Native is folklore attached to the wrong phase. "Reduce
re-renders" is good advice for the render phase and irrelevant if your cost is in mount.
"Flatten your view hierarchy" targets mount and does nothing for a slow reducer.

The pipeline is also the only way to answer questions that otherwise sound like magic: why
`onLayout` fires when it does, why reading a measurement right after `setState` gives you the
old value, and why an animation driven from JavaScript state is categorically more expensive
than one driven natively.

> [!LEGACY] What this replaced
> Under the old Bridge, updates were serialised into JSON messages, batched, and applied to
> platform-specific shadow trees as they arrived. There was no atomic commit, so an update
> React later abandoned had already reached the screen, and every measurement was a round
> trip. That architecture was removed in 0.82 and is described here only so you can recognise
> advice written for it. See
> [New Architecture Migration](../migration/new-architecture-migration.md).

## Basic example

A concrete update to trace through the phases:

```tsx title=src/components/Counter.tsx
import {useCallback, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';

export function Counter() {
  const [count, setCount] = useState(0);
  const [width, setWidth] = useState<number | null>(null);

  const increment = useCallback(() => {
    setCount(c => c + 1);
    // `count` here is still the OLD value. The render has not run yet — the
    // update was scheduled, not applied.
  }, []);

  // onLayout is delivered after the commit that produced this layout, so it is
  // the correct place to read a measured size.
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <Text>
        {count} taps, {width ?? '?'}pt wide
      </Text>
      <Pressable onPress={increment} accessibilityRole="button">
        <Text>Tap</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({wrap: {padding: 16, gap: 8}});
```

## How it works

### Phase 1 — Render

Runs on the **JS thread** (or, for a concurrent update, on the JS thread in interruptible
slices).

1. React reconciles: it calls your components, compares the element tree with the previous
   one, and determines which host elements changed.
2. For each change, Fabric creates a new **shadow node** in C++. Shadow nodes are immutable, so
   an update creates new nodes along the path from the root to the change and **shares
   untouched subtrees by pointer** with the previous tree.
3. **Layout** runs over the new tree with Yoga, computing an absolute position and size for
   every node. This is C++ work that does not touch platform views, so it can and does run off
   the main thread.

Two things follow. First, the cost of this phase scales with *what changed*, plus the cost of
every component function React had to call. Second, nothing is visible yet — the tree exists,
but the screen still shows the previous one.

Text is the exception to "layout needs no platform work": measuring a string requires the
platform text engine, so text measurement calls into the platform even during this phase.

### Phase 2 — Commit

The new tree is promoted to be the current tree. Under the hood this is a compare-and-swap on
the root, with retry if another commit landed first, so concurrent commits from different
sources are ordered rather than lost.

The commit is **atomic**. Either the whole tree is the new one or it is the old one; there is
no state in which half your update is live. This is exactly what React's concurrent features
require: a render that is interrupted and thrown away never commits, so it never affects
anything.

Layout that could not be completed during render is finished here.

### Phase 3 — Mount

Runs on the **main thread** — this is the only phase that must.

1. Fabric **diffs** the newly committed tree against the last mounted tree, producing an
   ordered list of mutation instructions: `Create`, `Insert`, `Update`, `Remove`, `Delete`.
2. Those instructions are applied to real `UIView` / `android.view.View` objects: creating
   views, setting props, positioning them at the coordinates layout already computed.
3. The platform draws.

Mount does no layout arithmetic. It applies precomputed values. That is why a screen with many
nodes can still mount quickly if few of them changed — the diff produced a short list.

### Putting it together

| Phase | Thread | Cost scales with | Typical smell when it is slow |
| --- | --- | --- | --- |
| Render | JS thread | Components called + nodes created + layout nodes | Handler feels laggy; JS thread frame drops |
| Commit | Background / JS | Tree depth at the change | Rarely the bottleneck on its own |
| Mount | Main thread | Number of mutation instructions | UI stutters while JS looks idle |

### Events run the pipeline backwards

A touch enters on the main thread, is matched to a shadow node by Fabric's event machinery,
and is delivered to your JavaScript handler. Most events are delivered asynchronously and are
**coalesced** — a stream of scroll events is collapsed so JavaScript is not handed sixty
identical updates per second.

Some events are delivered **synchronously** or with a blocking guarantee where correctness
demands it, which is why controlled `TextInput` under Fabric no longer exhibits the character
reordering the old architecture was notorious for.

### Why `setState` then measure gives the old value

Follow the phases: `setState` schedules an update. Your function keeps running. Render has not
happened, commit has not happened, mount has not happened. A measurement taken on the next line
reads the currently mounted view, which is still the previous one.

The correct places to read a post-update layout are `onLayout`, which is delivered after the
commit that produced it, or an effect, which runs after React has committed.

### State-driven animation versus native animation

An animation driven by React state runs the entire pipeline every frame: reconcile, build
nodes, layout, commit, diff, mount. At 60 fps you have 16.7 ms for all of it plus whatever
else the app is doing.

An animation driven by the native driver or by a Reanimated worklet updates the view's
properties without involving React at all. That is the whole reason those tools exist — not
that they are "faster", but that they are not in this diagram. See
[Animated vs Reanimated](../animation/animated-vs-reanimated.md).

## Platform differences

:::tabs
@tab iOS
Mount instructions are applied to `UIView` subclasses through registered component view
classes. Views are **recycled**: a view removed from one position may be handed back for a
different node later, so a custom component must reset all of its state when it is recycled.
Stale content in a reused cell is almost always a missing reset.
@tab Android
Mount instructions go through a mount-item queue drained on the UI thread, applied by view
managers. Android's own measure/layout pass still runs afterwards, so a custom `ViewGroup`
that computes its own child positions instead of honouring the ones Fabric supplied will
visibly fight the renderer.
:::

Layout itself is Yoga on both platforms, so flexbox results agree. Text metrics come from each
platform's text engine and can differ by a fraction of a point, which is why a line that wraps
on one platform sometimes does not on the other.

## Performance considerations

- **Find the phase before you optimise.** The JavaScript profiler in
  [React Native DevTools](../debugging/react-native-devtools.md) shows render-phase cost. A
  stuttering UI while JavaScript looks idle points at mount or at main-thread native work.
- **Cut the number of components React calls.** Memoization helps by shortening the render
  phase, not by making anything else faster. Apply it where the profiler shows repeated work.
- **Keep state close to where it is used.** State at the root rebuilds shadow nodes all the way
  down to the leaf that changed, adding both render and diff cost.
- **Avoid `setState` in `onLayout` when you can.** Each one costs an extra full pass. One is
  usually fine; a chain of layout-driven state updates is a loop that shows up as a visible
  reflow.
- **Reduce mutation volume, not node count.** Ten thousand static nodes cost memory; a hundred
  nodes changing every frame cost frames.
- **Virtualize long lists.** Rendering only what is visible is the single largest reduction in
  every phase at once. See [List Performance in Depth](../performance/list-performance.md).

## Common mistakes

- **Reading a measurement immediately after `setState`.** Wrong: `setCount(1)` then
  `measureInWindow`, expecting new geometry. Right: read it in `onLayout`, or in an effect
  after the commit.
- **Blaming the renderer for JS-thread work.** Wrong: "mount is slow" when the profiler shows
  a 200 ms JSON parse before the render even started. Right: measure which phase, then act.
- **Animating layout properties through state.** Wrong: `setState` on `height` every frame.
  Right: animate `transform` and `opacity` off the JS thread; layout animation belongs to a
  library built for it.
- **Chaining layout-driven state.** Wrong: `onLayout` sets state, which changes layout, which
  fires `onLayout` again. Right: derive the value once, or guard the update with a comparison.
- **Assuming a `View` in JSX is a view on screen.** Wrong: attaching a native effect to a
  style-less wrapper that view flattening removed. Right: `collapsable={false}` when the node
  must survive.
- **Optimising re-render count with no measurement.** Wrong: wrapping everything in `memo`.
  Right: memoize what the profiler shows re-rendering needlessly; the rest is added complexity
  for nothing.

## Related topics

- [Fabric](fabric.md) — the renderer that owns the shadow tree.
- [JS Thread vs UI Thread](threading-model.md) — which thread runs each phase and what blocks.
- [The New Architecture](new-architecture.md) — the whole picture.
- [Render Performance and Memoization](../performance/render-performance.md) — shortening the render phase.
- [List Performance in Depth](../performance/list-performance.md) — the biggest single win.
- [Animated vs Reanimated](../animation/animated-vs-reanimated.md) — animating without running the pipeline.
- [The Profiler and React Native DevTools](../performance/profiling.md) — measuring which phase is slow.
