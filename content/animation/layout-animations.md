---
title: Layout Animations
description: Entering, exiting and layout transitions with Reanimated 4 — the animations you get without writing a single frame of motion yourself.
status: current
toolchain: cli
---

Layout animations are the ones you declare rather than drive. You say "this view fades in when it
mounts, slides out when it unmounts, and moves smoothly when its position changes", and Reanimated
measures the before and after and interpolates between them.

They are the highest value-per-line feature in the whole library, because the alternative —
measuring a view, storing the old position, animating the delta, and cleaning up on unmount — is
tedious and easy to get subtly wrong.

This page assumes Reanimated 4.6.0 with `react-native-worklets` 0.12.2 and the
**`react-native-worklets/plugin`** Babel plugin configured; see
[The UI Thread and Worklets](worklets.md#installing-reanimated-4-and-worklets).

## Why it exists / when to use it — and when NOT to

Use a layout animation when a component **appears**, **disappears** or **changes size or position
because something else changed**. Those three cases cover most of the motion in a normal app: list
insertions, a disclosure expanding, a validation message appearing, a chip being removed.

Do not use them for motion you control frame by frame. A drag that follows a finger is a shared
value and a gesture, not a layout animation — see [Gesture Handler](gesture-handler.md).

Do not use them on a screen that is already scrolling fast with hundreds of mounting rows. Every
entering animation is a measurement plus a per-frame worklet, and a burst of them at once is
visible.

### What core `LayoutAnimation` gives you, and why it is not enough

React Native ships `LayoutAnimation` in the box. It is one global switch that animates **every**
view that moved in the next commit:

```tsx title=Core LayoutAnimation — coarse, but free
import {useState} from 'react';
import {LayoutAnimation, Pressable, StyleSheet, Text, View} from 'react-native';

export function CoreLayoutAnimation() {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    // Configures the NEXT commit. Everything that moves in that commit
    // animates, whether you meant it to or not.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={[styles.box, expanded && styles.boxExpanded]}>
      <Pressable onPress={toggle}>
        <Text>Toggle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {height: 60, overflow: 'hidden'},
  boxExpanded: {height: 200},
});
```

| | Core `LayoutAnimation` | Reanimated layout animations |
| --- | --- | --- |
| Scope | The whole next commit | Per component |
| Control | Three presets and a config object | Duration, easing, spring, delay, callback, custom keyframes |
| Entering / exiting | Create and delete only, same config for all | Sixty-odd named animations, plus your own |
| Composability | None — one global config | Each component declares its own |
| Cost | Zero install | Two packages, a Babel plugin, a native build |

If you need one expanding panel and nothing else, `LayoutAnimation` is a reasonable answer. If
motion is part of the design, Reanimated is.

## Basic example

Three props do everything: `entering`, `exiting` and `layout`.

```tsx title=Entering, exiting and layout in one component
import {useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import Animated, {FadeIn, FadeOut, LinearTransition, ReduceMotion} from 'react-native-reanimated';

export function Disclosure() {
  const [open, setOpen] = useState(false);

  return (
    // layout: this card resizes smoothly when its children change.
    <Animated.View layout={LinearTransition.duration(200)} style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        <Text>{open ? 'Hide details' : 'Show details'}</Text>
      </Pressable>

      {open ? (
        <Animated.View
          // entering: plays when this view mounts.
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          // exiting: Reanimated keeps the view mounted until this finishes.
          exiting={FadeOut.duration(120)}>
          <Text>Details</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({card: {padding: 16, gap: 8}});
```

The `exiting` prop is the part with no hand-rolled equivalent: React has already decided to unmount
that subtree, and Reanimated keeps the native views alive long enough to animate them out.

## How it works

### The three props

| Prop | Fires when | Takes |
| --- | --- | --- |
| `entering` | The component mounts | A builder, a `Keyframe`, or a custom worklet function |
| `exiting` | The component unmounts | The same |
| `layout` | The component's position or size changes in a commit | A transition builder or a custom function |

All three live on `Animated.*` components. A plain `View` ignores them silently, which is the
single most common "layout animations do not work" report.

### The builder API

Every named animation is a chainable builder. The modifiers come from `BaseAnimationBuilder` and
`ComplexAnimationBuilder` in the installed types:

| Modifier | Effect |
| --- | --- |
| `.duration(ms)` | Length of the animation |
| `.delay(ms)` | Wait before starting |
| `.easing(fn)` | An easing curve, for the timing-based form |
| `.springify(duration?)` | Switch to a spring instead of a curve |
| `.damping(n)` / `.dampingRatio(n)` / `.mass(n)` / `.stiffness(n)` | Spring parameters, after `.springify()` |
| `.withInitialValues(values)` | Override the starting state of an entering animation |
| `.withCallback(fn)` | Called with `finished: boolean` when it ends |
| `.reduceMotion(mode)` | `ReduceMotion.System` (default), `.Always`, `.Never` |

Each call returns a new builder, so they chain in any order:
`SlideInRight.springify().damping(18).delay(60)`.

> [!NOTE] `.randomDelay()` is deprecated
> The installed types mark it `@deprecated Use .delay() with Math.random() instead`. Staggering a
> list by index is usually what you actually wanted anyway — see the pattern below.

### The named animations

Reanimated 4.6.0 exports a large family, all following the same naming scheme:

| Family | Examples |
| --- | --- |
| Fade | `FadeIn`, `FadeInUp`, `FadeInDown`, `FadeInLeft`, `FadeInRight`, and `FadeOut*` |
| Slide | `SlideInUp`, `SlideInDown`, `SlideInLeft`, `SlideInRight`, and `SlideOut*` |
| Zoom | `ZoomIn`, `ZoomInRotate`, `ZoomInEasyUp`, and `ZoomOut*` |
| Bounce | `BounceIn`, `BounceInDown`, and `BounceOut*` |
| Flip | `FlipInXUp`, `FlipInEasyX`, and `FlipOut*` |
| Stretch | `StretchInX`, `StretchInY`, `StretchOutX`, `StretchOutY` |
| Roll / Pinwheel / LightSpeed / Rotate | `RollInLeft`, `PinwheelIn`, `LightSpeedInRight`, `RotateInDownLeft`, and their outs |

And for the `layout` prop specifically: `LinearTransition`, `FadingTransition`,
`SequencedTransition`, `JumpingTransition`, `CurvedTransition` and `EntryExitTransition`.
`LinearTransition` is the right default; it interpolates position and size directly and is what
"this moved smoothly" should look like.

### Lists

`Animated.FlatList` adds two props that plain `FlatList` does not have:

```tsx title=Animating list insertions and reordering
import {useCallback} from 'react';
import {StyleSheet, Text} from 'react-native';
import Animated, {FadeOutLeft, LinearTransition, SlideInRight} from 'react-native-reanimated';

type Row = {id: string; label: string};

export function AnimatedRows({rows}: {rows: Row[]}) {
  const renderItem = useCallback(
    ({item}: {item: Row}) => (
      <Animated.View entering={SlideInRight} exiting={FadeOutLeft} style={styles.row}>
        <Text>{item.label}</Text>
      </Animated.View>
    ),
    [],
  );

  return (
    <Animated.FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      // Applies a layout transition to every cell, so reordering and
      // removal slide rather than jump.
      itemLayoutAnimation={LinearTransition}
      // Without this, every visible row animates in when the list mounts,
      // which looks like a bug rather than a flourish.
      skipEnteringExitingAnimations
    />
  );
}

const styles = StyleSheet.create({row: {padding: 16}});
```

Two constraints from the installed types, both easy to hit:

- `itemLayoutAnimation` **only works with a single-column list**. `numColumns` greater than 1 is
  not supported.
- `CellRendererComponent` is typed `never` on `Animated.FlatList` — it is not supported, because
  the layout animation uses that slot itself.

### `Keyframe` for something the named animations do not cover

```tsx title=A custom entering animation
import {StyleSheet, Text} from 'react-native';
import Animated, {Keyframe, LayoutAnimationConfig} from 'react-native-reanimated';

// Keys are percentages of the total duration.
const Pop = new Keyframe({
  0: {opacity: 0, transform: [{scale: 0.8}]},
  70: {opacity: 1, transform: [{scale: 1.05}]},
  100: {opacity: 1, transform: [{scale: 1}]},
}).duration(260);

export function Toast({message}: {message: string}) {
  return (
    // Suppresses the entering animation of children when this boundary
    // itself mounts — useful when a whole screen appears at once.
    <LayoutAnimationConfig skipEntering>
      <Animated.View entering={Pop} style={styles.toast}>
        <Text>{message}</Text>
      </Animated.View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({toast: {padding: 12, borderRadius: 8}});
```

### `LayoutAnimationConfig`

`LayoutAnimationConfig` takes `skipEntering` and `skipExiting` and applies them to its children. Its
two real uses:

- **Screen mount.** Without it, every animated child plays its entering animation the moment the
  screen appears, which reads as chaos rather than polish.
- **Screen unmount.** `skipExiting` stops a navigation transition from fighting a dozen exit
  animations at once.

## Common patterns

### Stagger a list by index

```tsx-fragment title=Entering, offset per row
<Animated.View entering={FadeInDown.delay(index * 40).duration(200)} />
```

Cap the index so row 40 does not wait 1.6 seconds: `Math.min(index, 8) * 40`.

### Respect the accessibility setting

Every builder has `.reduceMotion()`, and the default is `ReduceMotion.System`, which means
**layout animations already honour the device setting without you doing anything.** Use
`.reduceMotion(ReduceMotion.Never)` only for motion that carries meaning the user would otherwise
lose, and `.Always` essentially never. See [Respecting Reduce Motion](reduce-motion.md).

### Animate presence, not `height`

The instinct from the web is to animate `height` from 0. Do not. Height changes re-run layout on
every frame for the whole subtree. Mount and unmount the content instead, and let `entering`,
`exiting` and the parent's `layout` do the work — which is exactly what the disclosure example
above does.

## Platform differences

The mechanism is the same on both platforms, and so is the API. Two practical differences:

:::tabs
@tab iOS
`overflow: 'visible'` is honoured, so a view can animate outside its parent's bounds — a
`ZoomIn` that briefly overshoots looks right.
@tab Android
Every view clips its children. An animation that overshoots its parent's bounds is cut off at the
edge, which makes `BounceIn`-family animations look wrong inside a tightly sized parent. Give the
parent room, or use an animation that stays within bounds.
:::

On both platforms, exiting animations require the view to still exist natively after React has
unmounted it. If a parent is removed in the same commit, there is nothing to keep alive and the
exit is skipped — that is expected, not a bug.

## Performance considerations

- **Every entering animation costs a measurement plus a worklet.** A handful is free. A hundred
  mounting at once, on a list that is also scrolling, is visible.
- **`skipEnteringExitingAnimations` on lists is almost always right.** Entering animations are for
  items that arrive *after* the list is on screen, not for the first screenful.
- **`layout` on a deeply nested container is more expensive than it looks.** The transition applies
  to that view, but the layout pass that triggered it applies to its whole subtree.
- **Do not put a `layout` transition on a list's container and its rows.** Pick one. Both fight
  each other and double the work.
- **Measure on a real device in release mode.** Layout animation cost shows up on low-end Android
  long before it shows up on a simulator. See
  [Animation Performance Rules](animation-performance.md).

## Common mistakes

- **Putting `entering` on a plain `View`.** Wrong: `<View entering={FadeIn} />` — the prop is
  ignored and nothing happens. Right: `<Animated.View entering={FadeIn} />`.
- **Expecting `exiting` to run when a parent unmounts too.** If the whole subtree goes in one
  commit there is no surviving host view to animate. Animate the parent's exit instead.
- **Animating `height` to expand a panel.** Wrong: `height` from 0 to 200 every frame, re-running
  layout for the subtree. Right: mount the content and let `layout` on the parent interpolate the
  size change.
- **Leaving entering animations on for the first render of a list.** Wrong: twenty rows fading in
  when the screen appears. Right: `skipEnteringExitingAnimations`, or a
  `LayoutAnimationConfig skipEntering` boundary.
- **Using `itemLayoutAnimation` with `numColumns` greater than 1.** The types document that it
  works only with a single-column `Animated.FlatList`.
- **Passing `CellRendererComponent` to `Animated.FlatList`.** It is typed `never`; the layout
  animation implementation owns that slot.
- **Unstable keys.** A `keyExtractor` based on the array index makes every reorder look like a
  delete plus an insert, so rows animate out and back in rather than moving.
- **Overriding `reduceMotion` to `Never` by default.** The default already honours the system
  setting. Overriding it is a deliberate accessibility decision, not a tidy-up.
- **Using `.randomDelay()`.** Deprecated in the installed types. Use `.delay()` with your own
  arithmetic, which is also more predictable.

## Related topics

- [Animated vs Reanimated](animated-vs-reanimated.md) — core `LayoutAnimation` and when it suffices.
- [The UI Thread and Worklets](worklets.md) — the install, and what a worklet is.
- [Shared and Derived Values](shared-values.md) — for motion you drive yourself.
- [Gesture Handler](gesture-handler.md) — finger-driven motion, which this is not.
- [Animation Performance Rules](animation-performance.md) — what these animations cost.
- [Respecting Reduce Motion](reduce-motion.md) — the `reduceMotion` modifier in context.
- [FlatList](../components/flatlist.md) — keys, and why they matter here.
- [List Performance in Depth](../performance/list-performance.md) — before adding motion to a list.
