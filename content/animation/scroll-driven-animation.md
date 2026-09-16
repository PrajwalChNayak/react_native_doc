---
title: Scroll-Driven Animation
description: useAnimatedScrollHandler, Animated.ScrollView and Animated.FlatList, collapsing headers and parallax, and what scrollEventThrottle actually does under Reanimated in 0.87.
status: current
toolchain: cli
---

A scroll offset is the second great source of per-frame input, after a finger. Collapsing headers,
parallax banners, progress bars, fading toolbars and page indicators are all the same shape: read
the offset every frame, map it through `interpolate`, apply it as a style.

The reason to do this with Reanimated rather than `useState` is the same reason as everywhere else
in this section. A scroll event that goes through React re-renders the tree once per frame while
the user is scrolling, which is the worst possible moment to be doing extra work. A scroll handler
that is a worklet never touches the JS thread at all.

This page assumes Reanimated 4.6.0 and `react-native-worklets` 0.12.2 are installed with the Babel
plugin configured — see
[The UI Thread and Worklets](worklets.md#installing-reanimated-4-and-worklets).

## Why it exists / when to use it — and when NOT to

Use a scroll-driven animation when the thing you are animating must stay **locked** to the scroll
position — moving with it, frame for frame, in both directions, and stopping exactly where the
finger stops.

Do not use one when the animation is a **reaction** to scrolling rather than a function of it. "Hide
the tab bar once the user has scrolled past 200 points" is a threshold, and a threshold is better
served by `useAnimatedReaction` firing a `withTiming` once than by recomputing a style sixty times a
second for an animation that only has two states.

| Goal | Approach |
| --- | --- |
| Header height shrinks as you scroll | Interpolate the offset |
| Banner moves at half scroll speed | Interpolate the offset |
| Toolbar fades in past a threshold | `useAnimatedReaction` + `withTiming` |
| "Back to top" button appears past a threshold | `useAnimatedReaction` + `scheduleOnRN`, or an animated style with a clamped interpolation |
| Pull-to-refresh | `RefreshControl` — it is a platform control, not an animation |
| Sticky section headers | `stickyHeaderIndices` on `ScrollView` — the platform already does it |

## Basic example

A collapsing header. The header is a sibling of the scroll view, not a child of it, so it can
shrink without the list re-laying out.

```tsx title=src/screens/CollapsingHeaderScreen.tsx
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const HEADER_MAX = 200;
const HEADER_MIN = 88;

export function CollapsingHeaderScreen() {
  const scrollY = useSharedValue(0);

  // The object form. Every handler in it is workletised by the Babel plugin
  // and runs on the UI thread — the JS thread never sees a scroll event.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerStyle = useAnimatedStyle(() => ({
    // CLAMP stops the header growing past HEADER_MAX during an iOS rubber-band
    // overscroll, where contentOffset.y goes negative.
    height: interpolate(
      scrollY.value,
      [0, HEADER_MAX - HEADER_MIN],
      [HEADER_MAX, HEADER_MIN],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.header, headerStyle]} />
      <Animated.ScrollView onScroll={onScroll} contentContainerStyle={styles.content}>
        <Text>rows</Text>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  header: {height: HEADER_MAX, backgroundColor: '#3355ff'},
  content: {paddingTop: HEADER_MAX},
});
```

This example animates `height`, which
[Animation Performance Rules](animation-performance.md) tells you not to do. It is the one common
exception and it is a deliberate trade: the header is a single leaf view with nothing below it in
the same layout pass, so the cost is bounded. The cheaper version — translating and scaling a
fixed-height header — is in Common patterns below, and it is what you want as soon as the header
has children.

## How it works

### `useAnimatedScrollHandler` has two forms

Read from the installed `hook/useAnimatedScrollHandler.d.ts`:

```ts-fragment
export interface ScrollHandlers<Context extends Record<string, unknown>> {
  onScroll?: ScrollHandler<Context>;
  onBeginDrag?: ScrollHandler<Context>;
  onEndDrag?: ScrollHandler<Context>;
  onMomentumBegin?: ScrollHandler<Context>;
  onMomentumEnd?: ScrollHandler<Context>;
}
```

Pass a **single function** and it becomes `onScroll`. Pass an **object** and you get the five
lifecycle points. Those five are the complete set; there is no `onScrollEnd`, and no
`onContentSizeChange`.

`onEndDrag` fires when the finger lifts; `onMomentumEnd` fires when the fling finishes coasting. A
scroll that is dragged and released without a fling produces `onEndDrag` and **no** momentum
events, which is why "snap when scrolling stops" logic that only listens to `onMomentumEnd` misses
half the cases.

Each handler also receives a second `context` argument — a mutable object that persists across
calls on the UI runtime. It is the right place to keep the previous offset for a direction check,
because a shared value would be read by other worklets you did not intend.

### `Animated.ScrollView` and `Animated.FlatList`

`onScroll` must go on a Reanimated component. `Animated.ScrollView`, `Animated.FlatList`,
`Animated.View`, `Animated.Text` and `Animated.Image` exist out of the box; anything else needs
`Animated.createAnimatedComponent`.

`Animated.FlatList` is generic. The ref type is `Animated.FlatList<ItemT>`, and `renderItem`
infers the item type from `data` the way core `FlatList` does.

### `scrollEventThrottle`, and why you should stop copying `16`

This is the single most repeated piece of stale advice about scroll animation, and the installed
sources contradict it twice over.

**First**, the prop's meaning in 0.87. From `ScrollView`'s type definitions:

> Limits how often scroll events will be fired while scrolling, specified as a time interval in ms.
> This may be useful when expensive work is performed in response to scrolling. Values `<= 16` will
> disable throttling, regardless of the refresh rate of the device.
>
> `@default 0`

So `scrollEventThrottle={16}` does not mean "sixty times a second". It means "do not throttle" —
identical in effect to `1`, and identical to the default. The prop is no longer documented as
iOS-only either.

**Second**, Reanimated already sets it. `react-native-reanimated/src/component/ScrollView.tsx` and
`FlatList.tsx` both contain:

```ts-fragment
// Set default scrollEventThrottle, because user expects
// to have continuous scroll events.
// We set it to 1 so we have peace until
// there are 960 fps screens.
if (!('scrollEventThrottle' in restProps)) {
  restProps.scrollEventThrottle = 1;
}
```

Note the guard: the default is applied **only when you do not pass the prop**. Passing
`scrollEventThrottle={100}` on an `Animated.ScrollView` therefore does exactly what it says and
gives you a stuttering header.

The practical rules:

- **On `Animated.ScrollView` and `Animated.FlatList`, do not pass `scrollEventThrottle` at all.**
- **On a component you wrapped yourself** with `createAnimatedComponent` — a `FlashList`, a
  third-party carousel — the default is not applied, so pass `scrollEventThrottle={1}` explicitly.
- Core `ScrollView` forces `1` internally when `stickyHeaderIndices` is set, regardless of what you
  passed.

### `useScrollOffset`, when you do not need a handler

If all you want is the offset, you do not need a handler at all. `useScrollOffset(animatedRef)`
returns a shared value that tracks a scrollable's offset, and `Animated.ScrollView` has a
`scrollViewOffset` prop that wires it for you.

```tsx title=src/components/ScrollProgressBar.tsx
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

export function ScrollProgressBar() {
  const offset = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, 120], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.bar, style]} />
      {/* scrollViewOffset takes the shared value and keeps it in sync.
          No handler, no worklet to write, no onScroll prop. */}
      <Animated.ScrollView scrollViewOffset={offset}>
        <Text>rows</Text>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  bar: {height: 4, backgroundColor: '#3355ff'},
});
```

> [!NOTE] `useScrollViewOffset` is the old name
> In 4.6.0 it is still exported, marked `@deprecated`, aliased to `useScrollOffset`. Use the new
> name; the old one will go.

## Common patterns

### Parallax without animating layout

The cheap version of a parallax banner: a fixed-height view that is **translated**, never resized.
`translateY` and `scale` are transform properties, so no layout pass runs.

```tsx title=src/screens/ParallaxScreen.tsx
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';

const BANNER = 240;

type Row = {id: string; title: string};

export function ParallaxScreen({data}: {data: Row[]}) {
  const ref = useAnimatedRef<Animated.FlatList<Row>>();
  const offset = useScrollOffset(ref);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [
      // Half speed going up, so the banner lags behind the content.
      {translateY: interpolate(offset.value, [0, BANNER], [0, -BANNER / 2], Extrapolation.CLAMP)},
      // Overscroll on iOS makes the offset negative; grow the banner instead
      // of leaving a gap at the top. CLAMP keeps it at 1 scrolling down.
      {scale: interpolate(offset.value, [-BANNER, 0], [2, 1], Extrapolation.CLAMP)},
    ],
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.banner, bannerStyle]} />
      <Animated.FlatList
        ref={ref}
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => <Text>{item.title}</Text>}
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  banner: {position: 'absolute', left: 0, right: 0, height: BANNER, backgroundColor: '#3355ff'},
  content: {paddingTop: BANNER},
});
```

### Hide on scroll down, show on scroll up

The pattern every messaging and news app uses. It needs direction, which needs the previous offset
— and that is what the handler's `context` argument is for.

```tsx title=src/components/HidingToolbar.tsx
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const BAR = 56;

export function HidingToolbar() {
  const hidden = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler<{previous?: number}>({
    onScroll: (event, context) => {
      const y = event.contentOffset.y;
      const previous = context.previous ?? 0;

      // A dead zone: without it, a one-point jitter flips the bar constantly.
      if (Math.abs(y - previous) > 6 && y > BAR) {
        // withTiming here, not an interpolation: this is a two-state
        // reaction to scrolling, not a function of the scroll position.
        hidden.value = withTiming(y > previous ? 1 : 0, {duration: 180});
      }
      context.previous = y;
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{translateY: hidden.value * -BAR}],
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.bar, style]} />
      <Animated.ScrollView onScroll={onScroll}>
        <Text>rows</Text>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  bar: {height: BAR, backgroundColor: '#3355ff'},
});
```

### Telling React about a threshold

When the scroll position must change something React renders — a button appearing, a screen title
swapping in — reduce first and cross the boundary once.

```tsx title=src/components/BackToTop.tsx
import {useState} from 'react';
import {Button, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedReaction, useAnimatedScrollHandler, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function BackToTop() {
  const y = useSharedValue(0);
  const [showButton, setShowButton] = useState(false);

  const onScroll = useAnimatedScrollHandler((event) => {
    y.value = event.contentOffset.y;
  });

  useAnimatedReaction(
    // Prepare: a boolean, so this changes twice over a long scroll rather
    // than sixty times a second.
    () => y.value > 600,
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setShowButton, next);
      }
    },
  );

  return (
    <View style={styles.fill}>
      <Animated.ScrollView onScroll={onScroll}>
        <Text>rows</Text>
      </Animated.ScrollView>
      {showButton ? <Button title="Back to top" onPress={() => {}} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({fill: {flex: 1}});
```

Note what the prepare function returns: a **boolean**, not the offset. Returning `y.value` would
call the reaction on every frame and put you back on the JS thread.

## Platform differences

:::tabs
@tab iOS
`contentOffset.y` goes **negative** during a rubber-band overscroll at the top, and past
`contentSize - layoutMeasurement` at the bottom. Every interpolation needs
`Extrapolation.CLAMP` or a deliberate negative input range, or the header inverts itself when the
user pulls down.

The bounce is also what makes the "scale the banner on overscroll" pattern above look right — there
is no equivalent gesture to hook on Android.
@tab Android
There is no rubber band by default, so the offset is bounded by the content. The overscroll effect
is a stretch or a glow drawn by the platform, and it does not move `contentOffset`.

Momentum events fire differently: a fling on Android produces `onMomentumBegin` and
`onMomentumEnd` reliably, but the deceleration curve is the platform's, not the one iOS uses, so a
snap threshold tuned on one platform will feel wrong on the other.
:::

On both platforms, a `FlatList` reports offsets in points, not in rows. If you need the current row
index, compute it from the offset and a known row height, or use `onViewableItemsChanged` — which
is a JS-thread callback and therefore not a per-frame tool.

## Performance considerations

- **The handler is a worklet on the drawing thread.** Everything in
  [Animation Performance Rules](animation-performance.md) applies. No allocation, no string
  building, no `scheduleOnRN` per frame.
- **Interpolate; do not branch.** `interpolate` is arithmetic. A chain of `if` statements computing
  different styles is the same arithmetic plus branch misprediction and more code to ship to the
  UI runtime.
- **Animating `height` re-runs layout every frame for the whole subtree.** A header that only
  changes its own height is usually acceptable; a header containing a title, a subtitle and two
  buttons is not. Translate and scale instead.
- **Do not put an animated style on every row.** A style worklet per row in a long list means a
  mapper per row on the UI runtime. Animate the container, or a handful of visible decorations.
- **`useScrollOffset` is cheaper to write than a handler and does the same work.** Prefer it when
  you only need the offset.
- **Shadows on a scrolling header are expensive on both platforms.** See
  [Shadows and Elevation](../styling/shadows-and-elevation.md) before adding one to something that
  resizes every frame.

## Common mistakes

- **Putting `onScroll` on a core `ScrollView`.** Wrong: `<ScrollView onScroll={handler}>` with a
  handler from `useAnimatedScrollHandler`. Right: `<Animated.ScrollView>`. The core component
  treats it as a normal JS callback, so it runs on the JS thread — or does not type-check at all.
- **Copying `scrollEventThrottle={16}`.** On an `Animated.ScrollView` it is at best redundant: the
  component already defaults to `1`, and the 0.87 types document any value `<= 16` as "no
  throttling". Pass nothing.
- **Forgetting `scrollEventThrottle` on a hand-wrapped component.** Reanimated's default is applied
  only inside its own `ScrollView` and `FlatList` wrappers. A `createAnimatedComponent(FlashList)`
  needs `scrollEventThrottle={1}` from you.
- **Interpolating without `Extrapolation.CLAMP`.** Wrong: a header height that grows unbounded
  when the user pulls down on iOS. Right: clamp, or give the input range a negative lower bound on
  purpose.
- **Driving the animation from React state.** Wrong: `onScroll={(e) => setY(e.nativeEvent.contentOffset.y)}`.
  Right: a shared value written by a worklet. The state version re-renders the entire screen once
  per frame during the exact interaction the user is watching most closely.
- **Using `onMomentumEnd` alone to detect "scrolling stopped".** A slow drag-and-release produces
  no momentum events at all. Handle `onEndDrag` as well.
- **Reading the offset in render.** `<Text>{scrollY.value}</Text>` is a frozen snapshot and
  Reanimated warns about it. Mirror through `useAnimatedReaction`, or use `useAnimatedProps`.
- **Making the header a child of the scroll view.** It then scrolls away, and animating its height
  re-lays out the entire content. Make it a sibling and pad the content instead.
- **Using `useScrollViewOffset`.** Deprecated in 4.6.0 in favour of `useScrollOffset`.

## Related topics

- [Shared and Derived Values](shared-values.md) — the shared value the offset lands in.
- [The UI Thread and Worklets](worklets.md) — why the handler cannot call ordinary functions.
- [Animation Performance Rules](animation-performance.md) — what a per-frame handler may and may not do.
- [Gesture Handler](gesture-handler.md) — the other per-frame input source, and how to stop the two fighting.
- [Layout Animations](layout-animations.md) — motion triggered by mounting rather than by scrolling.
- [Respecting Reduce Motion](reduce-motion.md) — parallax is exactly the effect the setting exists for.
- [ScrollView](../components/scrollview.md) — the underlying component and its props.
- [FlatList](../components/flatlist.md) — the list this wraps.
- [List Performance in Depth](../performance/list-performance.md) — fix the list before animating it.
