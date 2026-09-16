---
title: Fabric
description: React Native's renderer — the C++ shadow tree, Yoga layout off the main thread, atomic commits, and why it makes concurrent React work.
status: current
toolchain: cli
---

Fabric is React Native's renderer. It is the code that turns the element tree your components
return into real `UIView` and `android.view.View` objects, and it is written in C++ and shared
by both platforms.

The part worth internalising: Fabric owns a **shadow tree** — a C++ description of your UI,
independent of both JavaScript and the platform view system. Layout happens on that tree, off
the main thread. Only the final mount step touches platform views.

## Why it exists — and what it changed

The previous renderer kept its shadow tree in Java on Android and Objective-C on iOS, and
drove it with asynchronous messages from JavaScript. Three consequences followed:

- **Measurement was asynchronous.** Asking how tall a view was meant a round trip, so layouts
  that depended on measured size flashed.
- **React could not be interrupted safely.** Updates were applied as they arrived, so a render
  React later abandoned had already touched the screen.
- **Two implementations drifted.** Every layout fix had to be made twice, and the platforms
  disagreed in the gaps.

Fabric replaces all three: one C++ implementation, layout on a background thread, and commits
that are atomic so a half-finished render is never visible.

You do not call Fabric. You get it by rendering components. It matters because it explains
what is fast, what is not, and why some things that were impossible are now possible.

## Basic example

Nothing here opts into Fabric — this is just a component. It is included to anchor the
vocabulary used below.

```tsx title=src/components/PriceRow.tsx
import {View, Text, StyleSheet} from 'react-native';

type Props = {label: string; amount: string; emphasis?: boolean};

export function PriceRow({label, amount, emphasis = false}: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.amount, emphasis && styles.emphasis]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  label: {flex: 1, fontSize: 15},
  amount: {fontVariant: ['tabular-nums'], fontSize: 15},
  emphasis: {fontWeight: '600'},
});
```

Rendering this produces **three** trees, and keeping them distinct is most of the battle:

| Tree | Lives in | Contains |
| --- | --- | --- |
| React element tree | JavaScript | `PriceRow`, `View`, `Text` — including your own components |
| Shadow tree | C++ | Only host components (`View`, `Text`), each with props and computed layout |
| Host view tree | Platform | `UIView` / `android.view.View` instances |

`PriceRow` exists only in the first. By the time Fabric sees the update there is no
`PriceRow` — just the `View` and two `Text` nodes it produced.

## How it works

### Shadow nodes are immutable

A shadow node holds a component type, its props, its children and its layout result. Nodes are
**immutable**: an update does not mutate a node, it creates a new one. Ancestors of a changed
node are recreated to point at it; every untouched subtree is **shared by pointer** with the
previous tree.

This is why the cost of an update tracks the size of the change rather than the size of the
screen, and it is also what makes an atomic commit possible — the old tree stays perfectly
valid while the new one is built.

### Three phases

Fabric processes an update in three phases. They are covered in depth in
[The Render Pipeline](render-pipeline.md); the short version:

1. **Render.** React reconciles and Fabric builds the new shadow tree. Yoga computes layout
   over it. This runs on the JS thread or on a background thread, never on the main thread.
2. **Commit.** The new tree is promoted to be the current one — a pointer swap, guarded so
   concurrent commits from different sources are ordered rather than lost. Layout may be
   finished here if it was not already.
3. **Mount.** The committed tree is diffed against the previously mounted tree, producing
   mutation instructions (`Create`, `Insert`, `Update`, `Remove`, `Delete`). Those are applied
   to platform views **on the main thread**.

Only the third phase requires the main thread, and it does no layout arithmetic — it applies a
precomputed list.

### Why concurrent React works here

React 19's concurrent features depend on being able to start a render, abandon it, and start
again with nothing observable having happened. With the old renderer that was not true,
because updates were applied as they arrived. With Fabric, a render that never commits never
touches a view — the tree it built is simply dropped.

That is also what makes Suspense boundaries and transitions behave the way they do on the web
rather than producing flashes of half-applied UI.

### Synchronous access, when it is warranted

Because the shadow tree is C++ reachable through [JSI](jsi.md), some operations that used to
require a round trip can now return in the same tick. Measurement is the common one:

```tsx title=Measuring a mounted view
import {useCallback, useRef} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import type {ViewInstance} from 'react-native';

export function MeasureOnDemand() {
  // Refs to host components use the dedicated per-component instance types
  // under the 0.87 Strict API.
  const boxRef = useRef<ViewInstance | null>(null);

  const report = useCallback(() => {
    boxRef.current?.measureInWindow((x, y, width, height) => {
      console.log(`box at ${x},${y} sized ${width}x${height}`);
    });
  }, []);

  return (
    <View style={styles.wrap}>
      <View ref={boxRef} style={styles.box} />
      <Pressable onPress={report} accessibilityRole="button">
        <Text>Measure</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {gap: 12, padding: 16},
  box: {height: 80, borderRadius: 8, backgroundColor: '#dfe3e8'},
});
```

`measureInWindow` still takes a callback because the value is read from the mounted view, but
under Fabric the read no longer queues behind a message batch. Prefer `onLayout` when you can:
it gives you layout as part of the commit rather than as a separate query.

### View flattening

Fabric removes shadow nodes that contribute nothing to the rendered result — a `View` with no
background, no border, no touch handling and no other visual effect is collapsed into its
parent rather than becoming a platform view. Deeply nested layout wrappers therefore cost less
than the JSX suggests.

Flattening is not free to reason about: giving a wrapper a `collapsable={false}` prop, a
background colour, or a ref forces it to become a real view. If a measurement or a native
animation target unexpectedly reports the wrong node, flattening is usually why.

## Platform differences

:::tabs
@tab iOS
Mounting creates `UIView` subclasses through component view classes registered in a component
view registry. Views are recycled between mounts, so a native component must fully reset its
state in its recycle hook — a stale value from a previous cell is the classic symptom.
@tab Android
Mounting creates `android.view.View` subclasses via view managers, driven by a mount-item
queue on the UI thread. Android additionally has to reconcile with its own measure/layout
pass, so a custom `ViewGroup` that overrides `onMeasure` without deferring to the values
Fabric supplied will fight the renderer.
:::

Layout itself — Yoga — is the same code on both platforms, which is why flexbox results agree
between them far more closely than they used to. Text measurement is still platform text
engine work and can differ by a fraction of a point.

## Performance considerations

- **Fewer, smaller commits beat fewer components.** The diff cost is proportional to what
  changed. A screen with 400 static nodes and one changing node is cheap; 40 nodes all
  changing every frame is not.
- **Keep state low in the tree.** State at the root recreates every node on the path to the
  leaf that actually changed. That is reconciliation cost plus diff cost you did not need.
- **`onLayout` fires during mount.** Setting state from `onLayout` schedules another render
  and another commit. One extra pass is acceptable; a chain of them is a layout loop.
- **Animating through state animates the pipeline.** Every frame becomes render, layout, diff
  and mount. Use the native driver or Reanimated worklets so the animation runs without
  involving React at all — see [Animated vs Reanimated](../animation/animated-vs-reanimated.md).
- **Long lists still need virtualization.** Fabric makes each node cheaper; it does not make
  10,000 of them free. See [Virtualization and FlashList](../components/virtualization-and-flashlist.md).

## Common mistakes

- **Expecting `measure` to work on a composite component.** Wrong: putting a ref on your own
  `PriceRow` and calling `measureInWindow` on it. Right: forward the ref to the host `View`
  inside it — only host components have an instance with measurement methods.
- **Reading layout immediately after `setState`.** Wrong: calling `setState` and then measuring
  on the next line, expecting the new size. Right: read it in `onLayout`, or after the commit
  that applied the change. The render has not happened yet when your line runs.
- **Assuming a wrapper `View` exists natively.** Wrong: attaching a native effect to a
  style-less wrapper and wondering why it targets the parent. Right: give it
  `collapsable={false}` if it must survive view flattening.
- **Fighting Fabric with direct manipulation.** Wrong: calling `setNativeProps` on a value that
  props also control, so React overwrites it on the next commit. Right: keep one owner per
  property — props or imperative, not both.
- **Blaming Fabric for a slow JS thread.** Wrong: assuming a dropped frame is a renderer
  problem. Right: profile. Most jank is JavaScript work blocking the JS thread before the
  render even starts.

## Related topics

- [The Render Pipeline](render-pipeline.md) — render, commit and mount step by step.
- [The New Architecture](new-architecture.md) — how Fabric fits with JSI and TurboModules.
- [JSI](jsi.md) — why the shadow tree is reachable from JavaScript at all.
- [JS Thread vs UI Thread](threading-model.md) — which thread runs layout and which runs mount.
- [Fabric Native Components](../native-modules/fabric-native-components.md) — writing your own host component.
- [Flexbox in React Native](../styling/flexbox.md) — the layout algorithm Fabric runs.
- [Render Performance and Memoization](../performance/render-performance.md) — reducing commit volume.
