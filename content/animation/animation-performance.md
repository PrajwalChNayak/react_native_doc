---
title: Animation Performance Rules
description: Which properties are cheap and why, how to keep a worklet inside its frame budget, what runOnJS really costs per frame, and how to measure instead of guessing.
status: current
toolchain: cli
---

An animation has a hard deadline. At 60 Hz you have about 16.7 milliseconds to produce a frame; at
120 Hz, about 8.3. Miss it and the user sees a stutter — and they see it during the interaction they
are paying the most attention to, which is why animation jank feels worse than equally slow work
elsewhere.

Every rule below is a consequence of that deadline plus one fact about how React Native draws. None
of them are style preferences.

## The bridge story is over

Most animation performance advice on the internet is built on a component that no longer exists.

> [!WARNING] Ignore every "minimise bridge crossings" article you find
> The Bridge was removed in React Native 0.82. There is no message queue between JavaScript and
> native any more, no JSON serialisation of every call, and no batching schedule to fight. Advice
> framed around "reduce bridge traffic" is describing a component that is not in the version you are
> running, and the fixes it recommends are frequently the wrong ones now. See
> [The New Architecture](../core-concepts/new-architecture.md) for what replaced it.

The two boundaries that are real today are different, and knowing which one you are up against is
most of the diagnosis:

| The old framing | What it actually is in 0.87 |
| --- | --- |
| "The bridge is slow, batch your calls" | JSI calls are direct C++ calls. There is nothing to batch |
| "`useNativeDriver` avoids the bridge" | It moves ownership of the frame loop to native, which still matters — the reason is scheduling, not serialisation |
| "Fewer native module calls means faster animation" | TurboModules are lazily loaded and called synchronously. Call count is not the animation's problem |
| "Keep payloads small across the boundary" | **Still true, but for a different boundary:** `scheduleOnRN` / `runOnJS` serialise arguments between the two *JavaScript* runtimes. That is Rule 3 |

So the two constraints that actually bind are **the frame deadline** and **the serialisation
boundary between the React Native runtime and the UI runtime**. Every rule below comes from one of
those two.

## Rule 1: animate `transform` and `opacity`, not layout

This is the rule that matters most, and it is about which pipeline stages a change re-runs.

| You animate | What has to happen every frame |
| --- | --- |
| `transform`, `opacity` | A property update on an existing view. No layout, no re-render |
| `width`, `height`, `top`, `left`, `margin`, `padding`, `flex` | **Yoga re-computes layout for the view and its whole subtree**, then everything is re-positioned |
| `backgroundColor`, `borderRadius` | No layout, but a repaint |
| `shadowRadius`, `elevation`, `filter` | A repaint plus a separate blur pass |
| Anything that changes what React renders | A render, a commit, a layout pass and a mount, sixty times a second |

The cost of a layout prop is not fixed — it scales with how much is underneath the view. A header
with no children resizing itself is fine. The same header with a title, a subtitle and two buttons
re-lays out all of them, every frame.

```tsx title=Wrong — width re-runs layout for the subtree each frame
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

export function GrowWrong() {
  const width = useSharedValue(100);
  const style = useAnimatedStyle(() => ({width: width.value}));
  const run = () => {
    width.value = withTiming(300);
  };
  return <Animated.View onTouchEnd={run} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({box: {width: 100, height: 40, backgroundColor: '#3355ff'}});
```

```tsx title=Right — scaleX is a transform, so nothing is laid out again
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

export function GrowRight() {
  const scale = useSharedValue(1);
  // Anchor the scale so it grows from the left edge rather than the centre.
  const style = useAnimatedStyle(() => ({
    transform: [{translateX: (100 * (scale.value - 1)) / 2}, {scaleX: scale.value}],
  }));
  const run = () => {
    scale.value = withTiming(3);
  };
  return <Animated.View onTouchEnd={run} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({box: {width: 100, height: 40, backgroundColor: '#3355ff'}});
```

`scaleX` is not always a substitute — it stretches text and borders along with the box. When the
content must not distort, the alternatives in order of preference are: translate a fixed-size view
behind a clipping parent; mount and unmount the content and let a `layout` transition interpolate
the size change (see [Layout Animations](layout-animations.md)); or, last, accept the layout cost on
a subtree you have deliberately kept shallow.

### The exception, stated honestly

Animating `height` on a single leaf view with no children — a progress bar, a collapsing header
band, a divider — is usually fine. The layout pass is over one node. Know that you are making the
trade, keep the subtree empty, and measure on a low-end Android device rather than assuming.

## Rule 2: a worklet runs on the thread that draws

The UI runtime is not a background thread. On both platforms it lives on the **main** thread, the
one that renders and handles touch. A worklet that takes 20 ms does not delay your animation; it
delays the frame.

That gives every per-frame worklet — `useAnimatedStyle`, `useDerivedValue`, a gesture's `onUpdate`,
a scroll handler — the same budget as the frame itself, shared with everything else the platform
needs to do.

**Keep them arithmetic.** Concretely:

- No allocation in a loop. A new array or object per frame is 60–120 allocations a second feeding
  Hermes' garbage collector, and a GC pause is a dropped frame.
- No string building beyond a short template literal. Percentage widths and colour strings are the
  usual offenders.
- No `JSON.parse` or `JSON.stringify`. Ever, in a worklet.
- No `Array.prototype.map` / `filter` / `reduce` over anything that is not tiny. They allocate.
- No `measure()` in a style worklet. It reads the shadow tree synchronously; call it once from an
  event, not on every frame.
- Hoist constants out. A `[0, 100]` input array written inline in `useAnimatedStyle` is rebuilt each
  time it runs.

```tsx title=Wrong — allocates and builds a string on every frame
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';

export function BarWrong() {
  const progress = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    // Two allocations and a string, sixty times a second, plus `width` as a
    // percentage — which is a layout property.
    const stops = [0, 0.5, 1];
    const colors = ['#c00', '#cc0', '#0c0'];
    return {
      width: `${Math.round(progress.value * 100)}%`,
      backgroundColor: colors[stops.findIndex((s) => progress.value <= s)],
    };
  });
  return <Animated.View style={style} />;
}
```

```tsx title=Right — constants hoisted, transform instead of width, no strings
import {StyleSheet} from 'react-native';
import Animated, {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';

// Module scope: allocated once for the life of the app, not once per frame.
const STOPS = [0, 0.5, 1];
const COLORS = ['#cc0000', '#cccc00', '#00cc00'];

export function BarRight() {
  const progress = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    // scaleX with a left anchor: a transform, so no layout pass.
    transform: [{translateX: -0.5 * (1 - progress.value) * 200}, {scaleX: progress.value}],
    backgroundColor: interpolateColor(progress.value, STOPS, COLORS),
  }));
  return <Animated.View style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({bar: {width: 200, height: 8}});
```

## Rule 3: never call back into JavaScript per frame

`runOnJS(fn)(...)` and `scheduleOnRN(fn, ...)` are the same mechanism: they **serialise every
argument** and schedule a task on the React Native runtime. In a `onUpdate` or `onScroll` handler
that is 60 to 120 serialisations plus 60 to 120 JS-thread tasks per second — and each of those
tasks, if it calls a React setter, is a render.

The cost is not the boundary being slow. It is that you have re-created exactly the JS-thread
dependency the worklet existed to remove: when the JS thread stalls, your callbacks queue up and
arrive in a burst.

**Reduce before you cross.** `useAnimatedReaction` takes a prepare worklet and a reaction worklet,
and only calls the reaction when the prepared value changes.

```tsx title=Wrong — a JS task and a render on every frame
import {useState} from 'react';
import {Text} from 'react-native';
import Animated, {useAnimatedScrollHandler, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function ScrollPercentWrong() {
  const [percent, setPercent] = useState(0);
  const y = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    y.value = event.contentOffset.y;
    // Every frame: serialise a number, schedule a task, run a setState,
    // re-render this component and its children.
    scheduleOnRN(setPercent, event.contentOffset.y);
  });

  return (
    <Animated.ScrollView onScroll={onScroll}>
      <Text>{percent}</Text>
    </Animated.ScrollView>
  );
}
```

```tsx title=Right — reduce on the UI thread, cross only when the answer changes
import {useState} from 'react';
import {Text} from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function ScrollPercentRight() {
  const [percent, setPercent] = useState(0);
  const y = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    y.value = event.contentOffset.y;
  });

  useAnimatedReaction(
    // Rounding to whole percent turns ~120 events per second into at most
    // 100 over the whole scroll.
    () => Math.round(y.value / 10),
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setPercent, next);
      }
    },
  );

  return (
    <Animated.ScrollView onScroll={onScroll}>
      <Text>{percent}</Text>
    </Animated.ScrollView>
  );
}
```

If the value needs to appear on screen but not in React's tree, skip the boundary entirely:
`useAnimatedProps` updates a component's props on the UI thread without a render.

Two related points:

- **`runOnJS` and `runOnUI` re-exported from `react-native-reanimated` are deprecated in 4.6.0**,
  pointing at `react-native-worklets`. The current names there are `scheduleOnRN` and
  `scheduleOnUI`.
- **A gesture with `runOnJS: true` in its config moves the whole recogniser's callbacks to the JS
  thread.** That is a reasonable choice for a tap that only navigates, and a bad one for anything
  that also moves pixels.

## Rule 4: shadows and blurs are the expensive pixels

A shadow is a second draw pass: the platform renders the view, then renders a blurred copy beneath
it. Cost rises with the blur radius, and stacked shadows multiply.

Animating a shadow means recomputing that blur every frame, and none of the shadow properties are
transform-or-opacity cheap. The fix is nearly always the same shape:

```tsx-fragment title=Right — animate opacity on a pre-rendered shadow layer
// The shadow is drawn once, at full strength, on its own absolutely
// positioned sibling. Fading it in is an opacity animation.
<Animated.View pointerEvents="none" style={[styles.shadowLayer, fadeStyle]} />
```

On Android, `filter` with `blur` or `dropShadow` forces a hardware layer — an off-screen buffer per
filtered view — so it is particularly bad inside scrolling content.
[Shadows and Elevation](../styling/shadows-and-elevation.md) has the full picture, including which
props exist on which platform in 0.87.

## Rule 5: cost multiplies by count

A single animated view is almost never the problem. The problems are:

- **A style worklet per row in a long list.** Each `useAnimatedStyle` registers a mapper on the UI
  runtime, and every one of them is evaluated when a value it reads changes. Animate the container,
  or a small number of visible decorations.
- **Entering animations on a whole screenful at once.** `skipEnteringExitingAnimations` exists for
  this; see [Layout Animations](layout-animations.md).
- **A shadow on every card in a list.** The most common cause of a list that is smooth on iOS and
  drops frames on Android.
- **A derived value per item.** `useDerivedValue` is cheap once and not cheap forty times.

## Rule 6: measure, then change one thing

Every rule above is a prior, not a diagnosis. Animation cost is dominated by the device, and the
device your users have is slower than yours.

### `PerformanceMonitor` — two frame rates, not one

Reanimated ships an overlay that reports the JS-thread and UI-thread frame rates separately. That
separation is the diagnosis: **UI-thread FPS low means your worklets are too expensive or the
platform is doing too much drawing. JS-thread FPS low with UI-thread FPS fine means the animation is
healthy and something else is stalling React.**

```tsx title=src/App.tsx
import {Text, View, StyleSheet} from 'react-native';
import {PerformanceMonitor} from 'react-native-reanimated';

export default function App() {
  return (
    <View style={styles.fill}>
      {/* Development only: it renders an overlay and costs a frame callback. */}
      {__DEV__ ? <PerformanceMonitor /> : null}
      <Text>Screens go here</Text>
    </View>
  );
}

const styles = StyleSheet.create({fill: {flex: 1}});
```

### `useFrameCallback` — the actual frame deltas

When you want numbers rather than a smoothed average, `useFrameCallback` gives you every frame's
timestamp and the gap since the previous one.

```ts title=src/debug/useWorstFrame.ts
import {useFrameCallback, useSharedValue} from 'react-native-reanimated';
import type {SharedValue} from 'react-native-reanimated';

/**
 * Records the longest gap between frames during an interaction. At 60 Hz a
 * healthy value is ~16.7; anything over ~33 is a dropped frame the user saw.
 */
export function useWorstFrame(): SharedValue<number> {
  const worst = useSharedValue(0);

  useFrameCallback((frame) => {
    // Null on the very first frame, when there is no previous one.
    const delta = frame.timeSincePreviousFrame;
    if (delta !== null && delta > worst.value) {
      worst.value = delta;
    }
  });

  return worst;
}
```

### Turn Reanimated's own warnings into errors

```ts title=src/setupReanimated.ts
import {configureReanimatedLogger, ReanimatedLogLevel} from 'react-native-reanimated';

/**
 * Import once, before anything else touches Reanimated. `strict: true` turns
 * the library's advisory warnings — reading `.value` during render, animating
 * a property it cannot animate — into loud failures instead of console noise
 * nobody reads.
 */
configureReanimatedLogger({level: ReanimatedLogLevel.warn, strict: true});
```

### And the platform tools

A frame-rate overlay tells you *that* you are slow. Perfetto on Android and Instruments on iOS tell
you *where* — including in native drawing, which no JavaScript tool can see. The workflow, and how
to build a baseline before you change anything, is in
[Measure First](../performance/measuring-first.md) and [Profiling](../performance/profiling.md).

Three habits that matter more than any tool:

1. **Release mode, real device, worst device you support.** A debug build on a simulator measures
   nothing about animation.
2. **One change at a time**, re-measured. Two changes at once tell you nothing about either.
3. **Write the number down before and after.** "It feels smoother" is not a result.

## Platform differences

:::tabs
@tab iOS
The UI runtime runs on the main thread, which is also the render thread. A blocking worklet freezes
touch handling outright.

ProMotion devices run at up to 120 Hz, which **halves** the frame budget to about 8.3 ms. An
animation that is comfortable on a 60 Hz device can drop frames on a newer, faster one — this is
the one case where testing on better hardware finds bugs.

Instruments' Core Animation and Time Profiler instruments show the main-thread work that includes
your worklets.
@tab Android
The UI runtime runs on the main thread here too. Android additionally has a separate RenderThread
doing the actual GPU submission, so main-thread time and frame time are not the same number.

The device spread is the real issue. A mid-range Android phone can be several times slower than the
flagship on your desk, and thermal throttling makes the same device slower after a few minutes of
use. Test with the battery warm.

Perfetto traces show Choreographer frame deadlines directly, which is the closest thing to ground
truth about dropped frames.
:::

## Common mistakes

- **Repeating "minimise bridge crossings".** The Bridge was removed in 0.82. The cost that is real
  today is serialising arguments across the two JavaScript runtimes, and it applies to
  `scheduleOnRN` / `runOnJS`, not to native module calls in general.
- **Animating `width` or `height` when a transform would do.** Wrong: `width` from 100 to 300.
  Right: `scaleX` with a compensating `translateX`. The first re-runs Yoga for the subtree every
  frame.
- **Animating `top` / `left` out of habit from CSS.** Wrong: `left: offset.value`. Right:
  `transform: [{translateX: offset.value}]`. Same visual result, one re-lays out and one does not.
- **`scheduleOnRN` or `runOnJS` inside `onUpdate` or `onScroll`.** Wrong: a setter called on every
  frame. Right: `useAnimatedReaction` with a prepare function that rounds or thresholds, so the
  boundary is crossed only when the answer actually changes.
- **Allocating inside a style worklet.** Wrong: `const range = [0, 100]` inside
  `useAnimatedStyle`. Right: hoist it to module scope. Sixty allocations a second is a GC pause you
  will see.
- **Calling `measure()` in `useAnimatedStyle`.** It reads the shadow tree synchronously. Measure
  once from a layout or gesture event and keep the result in a shared value.
- **Animating a shadow's radius or elevation.** The blur is recomputed every frame. Fade a
  pre-rendered shadow layer's opacity instead.
- **Putting an animated style on every row of a list.** Each one is a mapper on the UI runtime.
  Animate the container.
- **Profiling a debug build.** Development builds run unoptimised JavaScript, keep development-only
  checks, and on Hermes do not use precompiled bytecode. Measure release.
- **Testing only on your own phone.** It is faster than your median user's, and it is not warm.
- **Deciding by feel.** Use `PerformanceMonitor` for a quick read and a platform trace for a real
  answer; record the number before and after.

## Related topics

- [The UI Thread and Worklets](worklets.md) — why a worklet's cost lands on the drawing thread.
- [Shared and Derived Values](shared-values.md) — mappers, and how many is too many.
- [Gesture Handler](gesture-handler.md) — per-frame callbacks with the tightest budget.
- [Scroll-Driven Animation](scroll-driven-animation.md) — the other per-frame input path.
- [Layout Animations](layout-animations.md) — what entering and exiting animations cost.
- [Respecting Reduce Motion](reduce-motion.md) — the cheapest animation is the one you did not run.
- [The New Architecture](../core-concepts/new-architecture.md) — why bridge-era advice is wrong now.
- [JS Thread vs UI Thread](../core-concepts/threading-model.md) — the two threads the monitor reports on.
- [Measure First](../performance/measuring-first.md) — building a baseline before changing anything.
- [Profiling](../performance/profiling.md) — reading a trace once the overlay says you are slow.
- [Shadows and Elevation](../styling/shadows-and-elevation.md) — the most expensive pixels in the app.
- [List Performance in Depth](../performance/list-performance.md) — fix the list before animating it.
