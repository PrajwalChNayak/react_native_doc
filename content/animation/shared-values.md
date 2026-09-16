---
title: Shared and Derived Values
description: useSharedValue, what .value really means, useDerivedValue, the animation helpers, and why a shared value is a mutation rather than React state.
status: current
toolchain: cli
---

A shared value is one memory cell that both JavaScript runtimes can read and write. It is the only
thing in Reanimated that is genuinely shared across the thread boundary, and almost everything else
in the library is built on it.

Getting one idea right makes the rest of Reanimated straightforward: **a shared value is a
mutation, not state.** Writing to it does not re-render anything, and reading it during render
tells you nothing useful.

This page assumes Reanimated 4.6.0 and `react-native-worklets` 0.12.2 are installed with the Babel
plugin configured. If they are not, start at
[The UI Thread and Worklets](worklets.md#installing-reanimated-4-and-worklets).

## Why it exists / when to use it — and when NOT to

React state exists to trigger renders. That is exactly the wrong mechanism for animation: a value
that changes sixty or a hundred and twenty times a second must not re-render a tree each time, and
it must keep changing while the JS thread is busy with something else.

A shared value fills that gap. Use one when the value changes per frame, is driven by a gesture, or
has to be readable from a worklet.

Do **not** use one for anything the UI has to render as text or structure through React. If a
number appears in a `<Text>` and must be correct on screen, it is state. The bridge between the two
worlds is `useAnimatedReaction` plus `scheduleOnRN`, and it costs a JS-thread task each time —
which is the point at which you should ask whether you needed the animation to drive React at all.

## Basic example

```tsx title=A shared value driving a style
import {StyleSheet} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export function Box() {
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Runs on the JS thread. Assigning an animation object to .value hands the
  // per-frame work to the UI runtime; nothing here runs every frame.
  const nudge = () => {
    x.value = withSpring(x.value + 40);
    opacity.value = withTiming(0.5, {duration: 200});
  };

  // Runs on the UI thread, every frame, while either value is animating.
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{translateX: x.value}],
  }));

  return <Animated.View onTouchEnd={nudge} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({box: {width: 60, height: 60, backgroundColor: '#3355ff'}});
```

No `useState`, no re-render, and the animation keeps running if the JS thread stalls.

## How it works

### `useSharedValue`

```ts-fragment
function useSharedValue<Value>(initialValue: Value | (() => Value)): SharedValue<Value>;
```

The hook returns the **same object** for the life of the component. It is not recreated on
re-render, and the initial value is only used on mount — passing a different `initialValue` later
does nothing.

The initialiser can be a function, which is called once on mount. Use that form when computing the
initial value is expensive.

The returned object has this shape, read from `commonTypes.d.ts`:

| Member | What it does |
| --- | --- |
| `.value` | Read and write. The form you will use almost always |
| `.get()` | Equivalent to reading `.value` |
| `.set(v)` | Equivalent to writing `.value`; also accepts an updater function |
| `.modify(fn)` | Mutates in place. The right tool for arrays and objects |
| `.addListener` / `.removeListener` | Low-level; you will not normally call these |

```ts title=The less common forms
import {useSharedValue} from 'react-native-reanimated';

export function useTotals(rows: number[]) {
  // The initialiser form runs once on mount, not on every render.
  const total = useSharedValue(() => rows.reduce((a, b) => a + b, 0));

  const bump = () => {
    total.set(total.get() + 1);
  };

  const double = () => {
    // modify() avoids allocating a new object for array/object payloads.
    total.modify((value) => value * 2);
  };

  return {total, bump, double};
}
```

> [!WARNING] Never store a function in a shared value
> The `useSharedValue` documentation says so explicitly, and it is not a style preference. Shared
> values hold data that gets serialised across the runtime boundary; worklets hold behaviour and
> are serialised by an entirely different mechanism. Putting one inside the other produces a value
> that either throws or arrives as an unusable stub.

### Mutation, not state

This is the mental model, and every common mistake below is a consequence of it.

| | React state | Shared value |
| --- | --- | --- |
| Writing it | Schedules a render | Writes a memory cell. Nothing renders |
| Reading it in render | Gives the value for this render | Gives whatever is in the cell *right now*, which the renderer has no reason to be in step with |
| Who can read it | The JS thread | Both runtimes |
| Identity | New value each update | One stable object for the component's lifetime |
| Timing | Batched by React | Immediate |

```tsx-fragment title=Wrong — reading .value during render
export function Wrong() {
  const x = useSharedValue(0);

  // Read on the JS thread during render. React will not re-render when x
  // changes, so this number is frozen at whatever it happened to be when
  // this render ran — and Reanimated warns about reading .value in render.
  return <Text>{x.value}</Text>;
}
```

```tsx title=Right — mirror it into state deliberately, at a rate you control
import {useState} from 'react';
import {Text} from 'react-native';
import {useAnimatedReaction, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function Mirror() {
  const progress = useSharedValue(0);
  const [percent, setPercent] = useState(0);

  useAnimatedReaction(
    // Prepare: runs on the UI thread whenever its dependencies change.
    () => Math.round(progress.value * 100),
    // React: only called when the prepared value actually changes, so this
    // fires 100 times over the animation rather than once per frame.
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setPercent, next);
      }
    },
  );

  return <Text>{`${percent}%`}</Text>;
}
```

The rounding in the prepare function is the important part. Without it, every frame produces a new
value and you have re-created the per-frame JS-thread traffic you were avoiding.

Reanimated ships a development warning for reading `.value` inside a component body — it exports
`getUseOfValueInStyleWarning()` for exactly this case. Treat it as an error, not noise.

### `useDerivedValue`

A derived value is a **read-only** shared value computed by a worklet from other shared values. It
recomputes on the UI thread whenever its inputs change, with no render involved.

```tsx title=Deriving on the UI thread
import {StyleSheet} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

export function ProgressBar() {
  const progress = useSharedValue(0);

  // Each of these is recomputed on the UI thread when progress changes.
  const percent = useDerivedValue(() => Math.round(progress.value * 100));
  const isComplete = useDerivedValue(() => progress.value >= 1);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#c9ccd2', '#2f9e44']),
    width: `${percent.value}%`,
  }));

  // animatedProps updates non-style props without a re-render.
  const a11yProps = useAnimatedProps(() => ({
    accessibilityLabel: isComplete.value ? 'Complete' : `${percent.value} percent`,
  }));

  return <Animated.View animatedProps={a11yProps} style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({bar: {height: 8, borderRadius: 4}});
```

Use `useDerivedValue` when the computed value is needed by **more than one** consumer, or when it is
expensive enough that recomputing it in each `useAnimatedStyle` would be wasteful. For a single
style, computing inline in `useAnimatedStyle` is simpler and no slower.

### `useAnimatedStyle`

The callback is a worklet. It runs on the UI thread whenever any shared value it reads changes, and
its return value is applied to the component's style.

Two rules:

- **Return a style object, do not mutate one.** Reanimated diffs what you return.
- **Read shared values inside the worklet, not outside it.** Reading outside captures a frozen
  snapshot; see [The UI Thread and Worklets](worklets.md).

`Animated.View`, `Animated.Text`, `Animated.ScrollView`, `Animated.FlatList` and
`Animated.Image` exist out of the box. For anything else, wrap it with `createAnimatedComponent`.

### The animation helpers

Assigning an animation object to `.value` starts an animation instead of jumping. All of these are
exports of `react-native-reanimated` in 4.6.0.

| Helper | Signature sketch | Use it for |
| --- | --- | --- |
| `withTiming(to, config?, cb?)` | `duration` (default 300), `easing`, `reduceMotion` | Duration-based motion. The default easing is `Easing.inOut(Easing.quad)` |
| `withSpring(to, config?, cb?)` | `mass`, `damping`, `stiffness`, or `duration` + `dampingRatio` | Anything that should feel physical. Prefer this for gesture release |
| `withDecay(config, cb?)` | `velocity`, `deceleration` (default 0.998), `clamp`, `rubberBandEffect` | Continuing a fling after the finger lifts |
| `withDelay(ms, animation)` | | Staggering |
| `withSequence(...animations)` | | One after another |
| `withRepeat(animation, count?, reverse?)` | `-1` repeats forever | Pulses, shakes, loaders |
| `withClamp({min, max}, animation)` | | Bounding a spring that would otherwise overshoot past a limit |
| `cancelAnimation(sharedValue)` | Asynchronous | Stopping. See below |

Reanimated 4 also exports named spring presets — `GentleSpringConfig`, `SnappySpringConfig`,
`WigglySpringConfig`, `Reanimated3DefaultSpringConfig` and `…WithDuration` variants of each. Using a
preset is a better default than inventing `damping: 15, stiffness: 120` by trial and error.

```tsx title=Composing animations
import {StyleSheet} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withClamp,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export function Composed() {
  const shake = useSharedValue(0);
  const pulse = useSharedValue(1);
  const slide = useSharedValue(0);

  const run = () => {
    shake.value = withSequence(
      withTiming(-8, {duration: 50, easing: Easing.linear}),
      withRepeat(withTiming(8, {duration: 100}), 3, true),
      withTiming(0, {duration: 50}),
    );
    pulse.value = withDelay(200, withSpring(1.1));
    // The spring would settle past 120; withClamp stops it at the boundary.
    slide.value = withClamp({min: 0, max: 120}, withSpring(200));
  };

  const style = useAnimatedStyle(() => ({
    transform: [{translateX: shake.value + slide.value}, {scale: pulse.value}],
  }));

  return <Animated.View onTouchEnd={run} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({box: {width: 60, height: 60, backgroundColor: '#3355ff'}});
```

### Cancelling

`cancelAnimation(sharedValue)` stops a running animation and leaves the value where it was. The
documentation is explicit that **the cancellation is asynchronous** — the value does not
necessarily stop on the line after the call, so do not assume you can read a final value
immediately.

Assigning a new value to `.value` also cancels whatever was running, which is usually what you
want and is why you rarely need `cancelAnimation` explicitly. The cases where you do need it:

- A gesture starts while a release animation is still settling, and you want to take over from the
  current position rather than fight the spring.
- A component unmounts with an infinite `withRepeat` still running.

```tsx-fragment title=Taking over from a settling animation
const onBegin = () => {
  'worklet';
  cancelAnimation(offset);
  startOffset.value = offset.value;
};
```

## Common patterns

### One shared value per animated quantity

Resist the urge to pack a shape into a single shared value:

```tsx-fragment title=Wrong — the whole object is re-serialised on every write
const position = useSharedValue({x: 0, y: 0, scale: 1});
position.value = {...position.value, x: 10};
```

```tsx-fragment title=Right — independent cells, independent updates
const x = useSharedValue(0);
const y = useSharedValue(0);
const scale = useSharedValue(1);
```

Separate values are cheaper to write, cheaper to read, and let `useAnimatedStyle` recompute only
when the value it depends on actually changed. Use `.modify()` when you genuinely need an object or
an array.

### Keep a starting offset for gestures

The standard drag pattern needs two values: where the object is, and where it was when the gesture
began. Trying to do it with one produces a jump on the second drag.

```tsx-fragment title=The two-value drag
const offset = useSharedValue(0);
const start = useSharedValue(0);
// onBegin:  start.value = offset.value;
// onUpdate: offset.value = start.value + event.translationX;
```

[Gesture Handler](gesture-handler.md) has the complete version.

### Props that are not styles

`useAnimatedProps` updates a component's props on the UI thread, the way `useAnimatedStyle` updates
its style. It is how you animate an SVG path, a `ScrollView`'s scroll position, or an accessibility
label, without a render.

## Platform differences

Shared values behave identically on iOS and Android — the mechanism is the same C++ and the same
second runtime on both.

On the **web** there is no second runtime. Everything runs on the one thread, so a shared value is
just a mutable box, and code whose correctness depends on the UI thread being separate behaves
differently. This is also why `useDerivedValue`, `useAnimatedStyle` and friends accept an optional
`dependencies` array: without the Babel plugin's analysis, the web build needs to be told what a
worklet reads.

## Performance considerations

- **Writing a shared value is cheap. Reading it in the wrong place is not.** A write is a memory
  store. A `scheduleOnRN` in a per-frame path is a serialisation plus a JS-thread task, sixty or a
  hundred and twenty times a second.
- **`useDerivedValue` costs a mapper.** Each one registers a subscription on the UI runtime.
  Half a dozen is nothing; a derived value per row in a long list is not.
- **Keep the `useAnimatedStyle` worklet arithmetic-only.** No allocation in a loop, no string
  building beyond a template literal, no `JSON` work. It runs on the thread that draws.
- **Animate `transform` and `opacity` in preference to layout props.** `width`, `height`, `top` and
  `flex` re-run layout every frame. See [Animation Performance Rules](animation-performance.md).

## Common mistakes

- **Reading `.value` during render.** Wrong: `<Text>{x.value}</Text>`. Right: mirror through
  `useAnimatedReaction` + `scheduleOnRN`, or use `useAnimatedProps`. Reanimated warns about this in
  development because it is almost always a bug.
- **Expecting a write to re-render.** Wrong: `setVisible` replaced by `visible.value = 1` and
  waiting for the tree to update. Right: drive the style from the shared value, or keep real state.
- **Passing a changing `initialValue`.** `useSharedValue(props.startX)` uses `props.startX` once,
  on mount. If it must track a prop, write it in an effect.
- **Storing a function in a shared value.** Documented as unsupported. Shared values hold data.
- **Packing everything into one object shared value.** Every write re-serialises the whole object
  and wakes every reader. Use one value per animated quantity.
- **Capturing a plain variable in a worklet and expecting it to update.** Captured primitives are
  frozen at capture time. If it changes, it has to be a shared value — see
  [The UI Thread and Worklets](worklets.md).
- **Assuming `cancelAnimation` is synchronous.** It is documented as asynchronous. Do not read a
  "final" value on the next line.
- **Mixing an `Animated.Value` and a shared value on one property.** They are owned by different
  systems. A component may use both libraries; a single animated property may not.
- **Calling `scheduleOnRN` from `onUpdate`.** That is a per-frame JS-thread task with serialised
  arguments. Reduce first — round, threshold, or react only to a change.

## Related topics

- [The UI Thread and Worklets](worklets.md) — what a worklet is and what crosses the boundary.
- [Animated vs Reanimated](animated-vs-reanimated.md) — whether you need any of this.
- [Gesture Handler](gesture-handler.md) — the main producer of shared-value updates.
- [Layout Animations](layout-animations.md) — motion you do not drive by hand.
- [Scroll-Driven Animation](scroll-driven-animation.md) — shared values fed by a scroll offset.
- [Animation Performance Rules](animation-performance.md) — what is cheap and what is not.
- [Respecting Reduce Motion](reduce-motion.md) — the `reduceMotion` config on every helper above.
- [JS Thread vs UI Thread](../core-concepts/threading-model.md) — the two runtimes in context.
