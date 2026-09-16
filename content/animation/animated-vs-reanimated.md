---
title: Animated vs Reanimated
description: What core Animated actually gives you, where useNativeDriver stops, and why Reanimated 4 needs a separate worklets package.
status: current
toolchain: cli
---

React Native ships an animation library in the box. `Animated`, `Easing`, `useAnimatedValue`,
`useAnimatedValueXY` and `LayoutAnimation` are all real exports of `react-native` in 0.87 — you
can verify that against the export list in the
[API Reference](../reference/api-reference.md). Nothing has to be installed to fade a view in.

Reanimated is a third-party library that solves a different problem. It is not "Animated but
faster"; it runs your animation logic as JavaScript on a second runtime pinned to the UI thread,
so an animation keeps running while the React thread is busy. That difference in kind is what
this page is about.

> [!WARNING] Reanimated 4 does not bundle its worklets runtime
> `react-native-reanimated@4.6.0` declares `react-native-worklets@0.12.x` as a **required peer
> dependency**, and the Babel plugin you add to `babel.config.js` is
> **`react-native-worklets/plugin`**. Reanimated 3 shipped its own runtime and its own
> `react-native-reanimated/plugin`; almost every tutorial predates the split and gives you an
> install that fails at runtime. The full install is in
> [The UI Thread and Worklets](worklets.md#installing-reanimated-4-and-worklets).

## Why it exists / when to use it — and when NOT to

Core `Animated` is enough more often than the internet suggests. Use it when:

- The animation is driven entirely by React state or a timer — a fade, a press scale, a spinner.
- You only animate `transform` and `opacity`, which is what `useNativeDriver: true` supports.
- You do not want another native dependency in a project you have to upgrade twice a year.

Reach for Reanimated when:

- The animation follows a **gesture** frame by frame. A drag that goes through React state will
  stutter the moment a render takes longer than a frame.
- You need to animate **layout** properties (`width`, `height`, `top`, `flex`) smoothly.
- You want **entering, exiting and layout transitions** on mount/unmount without hand-rolling
  measurement.
- You need per-frame logic — clamping, snapping, physics — that has to run on the UI thread.

A one-off 200 ms fade does not justify a native dependency, a Babel plugin and a peer package.
Write it with `Animated` and move on.

## Basic example

The same fade, written both ways.

```tsx title=Core Animated — no dependencies
import {useEffect} from 'react';
import type {ReactNode} from 'react';
import {Animated, Easing, StyleSheet, Text, useAnimatedValue} from 'react-native';

export function FadeInCore({children}: {children: ReactNode}) {
  // useAnimatedValue keeps the Animated.Value stable across renders. It is a
  // real react-native export; it replaces the useRef(new Animated.Value(0)) dance.
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      // Not optional. The type requires it, and leaving it false drives the
      // animation from JavaScript one frame at a time.
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.box, {opacity}]}>
      <Text>{children}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {padding: 16},
});
```

```tsx title=Reanimated — the same thing, for comparison
import {useEffect} from 'react';
import type {ReactNode} from 'react';
import {StyleSheet, Text} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

export function FadeInReanimated({children}: {children: ReactNode}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {duration: 200});
  }, [opacity]);

  // The updater is a worklet. It runs on the UI thread, not here.
  const style = useAnimatedStyle(() => ({opacity: opacity.value}));

  return (
    <Animated.View style={[styles.box, style]}>
      <Text>{children}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {padding: 16},
});
```

The Reanimated version is not shorter and not visibly smoother. That is the point: for this
animation the dependency buys you nothing.

## How it works

### What `useNativeDriver` actually does

With `useNativeDriver: true`, `Animated` serialises the animation graph — the value, the
interpolations, the target node — to the native side once, at `start()`. Native then advances it
every frame without asking JavaScript anything. If the JS thread stalls, the animation still
runs.

The catch is what native can advance. The native driver supports **`opacity` and the `transform`
properties only**. Everything else is animated by JavaScript setting the prop each frame.

| You animate | `useNativeDriver: true` | What happens otherwise |
| --- | --- | --- |
| `opacity` | Supported | — |
| `transform` (`translateX/Y`, `scale`, `rotate`, `skew`) | Supported | — |
| `width`, `height`, `top`, `left`, `margin`, `padding`, `flex` | **Not supported** | Must run with `useNativeDriver: false`, one JS frame at a time |
| `backgroundColor`, `borderColor` | **Not supported** | Same |
| Arbitrary component props | Not supported | Same |

This is not a bug to route around. Layout props change the layout, and layout has to be
recomputed and committed through the renderer; the native driver has no shadow-tree access to do
that.

### Why Reanimated is different in kind

Reanimated does not serialise an animation graph. It ships your **function** to a second
JavaScript runtime that lives on the UI thread. On every frame that runtime executes your code
and writes the resulting props straight into the shadow tree.

The consequences are what matter:

- A Reanimated animation can contain **logic** — branches, clamps, `Math.min`, reading three
  other values. A native-driver animation can only contain a pre-declared interpolation.
- It can animate **any** style prop, layout included, because it commits through the renderer.
- It can react to gesture events on the UI thread, so a drag never round-trips through React.
- In exchange you accept the worklet model: a serialisation boundary, a Babel plugin, and rules
  about what your functions may touch. See [The UI Thread and Worklets](worklets.md).

> [!NOTE] The "bridge" framing is obsolete
> Older comparisons explain the native driver as "avoiding the bridge". The Bridge was removed in
> 0.82; everything is JSI and Fabric now. The native driver still matters, but the reason is
> ownership of the frame loop, not serialisation across a message queue. See
> [Animation Performance Rules](animation-performance.md#the-bridge-story-is-over).

## Honest comparison

| | Core `Animated` | Reanimated 4.6.0 |
| --- | --- | --- |
| Install cost | Zero — in `react-native` | 2 packages, a Babel plugin, a native rebuild |
| Animatable props off the JS thread | `opacity`, `transform` | Any style prop, plus component props |
| Per-frame custom logic | No | Yes, in worklets |
| Gesture-driven motion | Poor — state round-trips | The reason it exists |
| Entering / exiting / layout transitions | `LayoutAnimation` only, coarse | First class |
| Mental model | Declarative graph, plain JS | Two runtimes, serialisation boundary |
| Debugging | Normal JS debugging | Worklet stack traces, `console.log` from the UI runtime |
| Upgrade exposure | Follows React Native | Peer range `0.83 - 0.87`; must track both packages |
| Web support | Partial | Yes, with plugin options |

## Common patterns

### Start with core Animated, escalate deliberately

Write the first version with `Animated` and `useNativeDriver: true`. If you hit one of these
walls, that is your signal to escalate:

1. You need to animate a layout prop and `useNativeDriver: false` visibly janks.
2. You are calling `setState` inside `onScroll` or a pan handler.
3. You want mount/unmount transitions and `LayoutAnimation` is too blunt.

### `useAnimatedValue` over `useRef`

`useAnimatedValue(0)` and `useAnimatedValueXY({x: 0, y: 0})` are core hooks that own the value
for you. The older `useRef(new Animated.Value(0)).current` pattern still works but constructs a
throwaway `Animated.Value` on every render.

```tsx title=A press-scale with the native driver
import {useCallback} from 'react';
import {Animated, Pressable, StyleSheet, Text, useAnimatedValue} from 'react-native';

export function PressScale({label}: {label: string}) {
  const scale = useAnimatedValue(1);

  const to = useCallback(
    (value: number) => () => {
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: true,
        speed: 30,
      }).start();
    },
    [scale],
  );

  return (
    <Pressable onPressIn={to(0.96)} onPressOut={to(1)}>
      {/* transform is native-driver safe, so the press stays smooth under load. */}
      <Animated.View style={[styles.button, {transform: [{scale}]}]}>
        <Text>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10},
});
```

### Do not mix the two on one value

An `Animated.Value` and a Reanimated shared value are different objects owned by different
systems. A component can use both libraries, but a single animated property must be driven by
exactly one of them.

## Performance considerations

- `useNativeDriver: false` means a JavaScript callback per frame per value. Two or three of those
  on a busy screen is where "the app feels cheap" comes from.
- Animating `width`/`height` re-runs layout every frame in both libraries. Prefer
  `transform: [{scaleX}]` where the visual result is acceptable.
- Reanimated's cost is not free either: every worklet runs on the UI thread, so an expensive
  worklet drops frames exactly the way an expensive render does.

Measure before you switch libraries. [Animation Performance Rules](animation-performance.md) has
the method.

## Common mistakes

- **Assuming `useNativeDriver: true` works for layout props.** It does not, and depending on the
  platform you get a runtime warning or a silently unanimated property.

  ```tsx title=Wrong — height is not native-driver capable
  import {Animated, useAnimatedValue} from 'react-native';

  export function Wrong() {
    const height = useAnimatedValue(0);
    // Throws/warns at runtime: height is not supported by the native driver.
    Animated.timing(height, {toValue: 100, useNativeDriver: true}).start();
    return <Animated.View style={{height}} />;
  }
  ```

  ```tsx title=Right — scale the view instead
  import {Animated, useAnimatedValue} from 'react-native';

  export function Right() {
    const scaleY = useAnimatedValue(0);
    Animated.timing(scaleY, {toValue: 1, useNativeDriver: true}).start();
    // transform is supported, and the surrounding layout is not recomputed.
    return <Animated.View style={{height: 100, transform: [{scaleY}]}} />;
  }
  ```

- **Installing Reanimated 4 without `react-native-worklets`.** The peer dependency is required,
  not optional. The app builds and then fails when the first worklet runs.
- **Adding `react-native-reanimated/plugin` from memory.** In 4.6.0 that path is a thin
  re-export of `react-native-worklets/plugin`. Write the worklets path; it is the one the pair
  actually documents and the one that keeps working when the shim goes.
- **Reaching for Reanimated for a fade.** A dependency with a native build step, a Babel plugin
  and a peer package is a real maintenance cost. Core `Animated` handles a fade.
- **Leaving an `Animated` animation running after unmount.** `start()` returns nothing you can
  ignore safely — keep the `CompositeAnimation` and call `.stop()` in the effect cleanup.
- **Reading `.value` off a Reanimated shared value in render and expecting a re-render.** Shared
  values are mutations, not state. See
  [Shared and Derived Values](shared-values.md#mutation-not-state).

## Related topics

- [The UI Thread and Worklets](worklets.md) — the install, and what a worklet actually is.
- [Shared and Derived Values](shared-values.md) — `useSharedValue`, `useDerivedValue` and `.value`.
- [Layout Animations](layout-animations.md) — `LayoutAnimation` versus Reanimated's entering/exiting.
- [Animation Performance Rules](animation-performance.md) — what to animate, and how to measure.
- [The Threading Model](../core-concepts/threading-model.md) — which thread is which after 0.82.
- [Shadows and Elevation](../styling/shadows-and-elevation.md) — why shadows are expensive to animate.
