---
title: Dimensions and useWindowDimensions
description: Reading the window and screen size in 0.87, why the hook is the default choice, and the type changes the Strict API introduced.
status: current
toolchain: cli
---

React Native has no media queries, so any layout decision that depends on how much room you have
is a runtime read. Two APIs expose it: the `useWindowDimensions` hook and the `Dimensions` module.

In a React component, use the hook. `Dimensions` exists for the code that cannot use a hook —
module-level constants, utility functions and non-React code — and it does not re-render anything
on its own.

## Why it exists / when to use it — and when NOT to

Use one of these when you need a **number** in JavaScript: a breakpoint decision, a column count,
a carousel page width, an animation distance.

Do not use them to size a view that flex could size. `flex: 1`, `width: '100%'` and `aspectRatio`
are handled inside Yoga on the native side and stay correct through rotation, split-screen and
foldable transitions without a single re-render. A layout built from measured window widths
re-renders the whole subtree every time the window changes.

Also do not use them for insets. The window size tells you nothing about the notch, the home
indicator or the status bar. That is `react-native-safe-area-context` — see
[Safe Areas](../components/safe-areas.md).

## Basic example

```tsx title=src/components/Gallery.tsx
import {StyleSheet, useWindowDimensions, View} from 'react-native';

export function Gallery() {
  // Re-renders automatically on rotation, font-scale change and window resize.
  const {width} = useWindowDimensions();
  const columns = width >= 600 ? 3 : 2;

  return (
    <View style={styles.grid}>
      {Array.from({length: 6}, (_, i) => (
        <View key={i} style={[styles.cell, {width: `${100 / columns}%`}]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {aspectRatio: 1, padding: 4},
});
```

## How it works

### What comes back

Both APIs return the same shape. Read from the installed 0.87 type definitions:

| Field | Meaning |
| --- | --- |
| `width` | Logical width in density-independent pixels. |
| `height` | Logical height. |
| `scale` | Device pixel density, the same value as `PixelRatio.get()`. |
| `fontScale` | The user's text-size multiplier. |
| `densityDpi` | Android only. Present on `DisplayMetricsAndroid`, absent from `DisplayMetrics`. |

Because Android adds a field, the return type is the union
`DisplayMetrics | DisplayMetricsAndroid`. Destructuring the four common fields works without
narrowing; reading `densityDpi` does not.

> [!DEPRECATED] `ScaledSize` is deprecated in 0.87
> The type definitions mark `ScaledSize` as deprecated with the note "Use DisplayMetrics". It is
> still exported, so old code compiles, but new code should import `DisplayMetrics` (or
> `DisplayMetricsAndroid`) instead.

```tsx title=Typing the result explicitly
import {Dimensions, Text} from 'react-native';
import type {DisplayMetrics} from 'react-native';

// DisplayMetrics replaces the deprecated ScaledSize.
const window: DisplayMetrics = Dimensions.get('window');

export function Readout() {
  return (
    <Text>
      {window.width} x {window.height} at {window.scale}x
    </Text>
  );
}
```

### `window` versus `screen`

`Dimensions.get` takes either. They differ on Android and are usually identical on iOS.

- **`window`** is the area your app can draw in. On Android the type definitions note that it
  excludes the status bar and the navigation bar. In split-screen or freeform multi-window mode it
  is the size of your window, not the device.
- **`screen`** is the physical display.

Almost every layout decision wants `window`. `useWindowDimensions` only exposes `window`, which
is one more reason to prefer it.

### Subscribing without the hook

`Dimensions.addEventListener('change', handler)` fires on rotation, on foldable state changes and
on multi-window resizes. It returns an `EventSubscription`; call `.remove()` on it. The handler
parameter is typed loosely in 0.87 (`Function`), so annotate the argument yourself to get type
safety back.

```tsx title=src/hooks/useScreenSize.ts
import {useEffect, useState} from 'react';
import {Dimensions} from 'react-native';
import type {DimensionsPayload, DisplayMetrics} from 'react-native';

/** `screen` is not exposed by useWindowDimensions, so subscribe manually. */
export function useScreenSize(): DisplayMetrics {
  const [size, setSize] = useState<DisplayMetrics>(() => Dimensions.get('screen'));

  useEffect(() => {
    // Annotating the payload restores typing: the handler parameter is `Function`.
    const sub = Dimensions.addEventListener('change', ({screen}: DimensionsPayload) => {
      if (screen) {
        setSize(screen);
      }
    });
    return () => sub.remove();
  }, []);

  return size;
}
```

### Why the hook is the default

`useWindowDimensions` subscribes on mount and unsubscribes on unmount for you, and it re-renders
only the components that call it. A module-scope `const {width} = Dimensions.get('window')` is
captured once at import time and is wrong after the first rotation — a bug that never shows up in
portrait-only manual testing.

## Platform differences

:::tabs
@tab iOS
`window` and `screen` normally match, because an iOS app owns the whole display. Slide Over and
Split View on iPad are the exception: there `window` is your app's share and `screen` is the
iPad's display.

Rotation fires a `change` event. If the app is locked to portrait in the Xcode project settings,
no event fires and the values never change.
@tab Android
`window` excludes the status bar and navigation bar; `screen` does not. The gap between them is
the system chrome, and it is not a safe-area inset — use `react-native-safe-area-context` for
that.

Multi-window and freeform mode resize the window without a configuration change you would notice
in JavaScript, so subscribing rather than reading once matters more here. Foldables emit `change`
when the device is folded or unfolded.

`Dimensions.get('window')` returns `DisplayMetricsAndroid`, which carries `densityDpi`. Reading it
means narrowing the union:

```tsx title=Reading the Android-only field
import {Dimensions, Platform, Text} from 'react-native';
import type {DisplayMetricsAndroid} from 'react-native';

export function Dpi() {
  if (Platform.OS !== 'android') {
    return <Text>n/a</Text>;
  }
  // Safe only after the platform check — DisplayMetrics has no densityDpi.
  const metrics = Dimensions.get('window') as DisplayMetricsAndroid;
  return <Text>{metrics.densityDpi} dpi</Text>;
}
```
:::

## Common patterns

### Orientation from the dimensions you already have

There is no core orientation API. Derive it.

```tsx title=src/hooks/useOrientation.ts
import {useWindowDimensions} from 'react-native';

export type Orientation = 'portrait' | 'landscape';

export function useOrientation(): Orientation {
  const {width, height} = useWindowDimensions();
  return width >= height ? 'landscape' : 'portrait';
}
```

### Measure the view, not the window

When you need the size of one specific view rather than the whole window, `onLayout` is the right
tool. It reports the view's own box, it is correct inside a modal or a split pane, and it does not
depend on the window at all.

```tsx title=src/components/MeasuredBox.tsx
import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';

export function MeasuredBox() {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    // nativeEvent.layout is in logical pixels, relative to the parent.
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.box} onLayout={onLayout}>
      <Text>{Math.round(width)} wide</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {flex: 1, padding: 16},
});
```

### A carousel page width

This is the case where a measured number is genuinely the right answer, because the value has to
go into a scroll offset rather than a style.

```tsx title=src/components/Carousel.tsx
import {ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';

export function Carousel() {
  const {width} = useWindowDimensions();

  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.page, {width}]} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {flex: 1},
});
```

## Performance considerations

- **Every `useWindowDimensions` call is a subscription.** Calling it in fifty list items means
  fifty components re-render on rotation. Read it once high in the tree and pass the derived
  value (a column count, a breakpoint name) down through context or props.
- **Derive coarse values, not fine ones.** Re-rendering because a boolean `isTablet` flipped is
  cheap. Re-rendering because `width` changed by one point during an animated resize is not.
- **Prefer flex over measured sizes.** A `flex: 1` view is re-laid out by Yoga on the native side
  with no JavaScript involvement. A `width: measuredWidth` view re-renders in JavaScript first.
- **Do not read `Dimensions.get` in a render body.** It is a synchronous native read and it does
  not subscribe, so you pay the cost and still get a stale value.

## Common mistakes

- **Capturing the width at module scope.**
  Wrong: `const {width} = Dimensions.get('window');` at the top of a file, used in a
  `StyleSheet.create` call.
  Right: `const {width} = useWindowDimensions();` inside the component.
  The module-scope version is frozen at import time and never updates.
- **Using `screen` when you meant `window`.** On Android `screen` includes the system bars, so a
  full-height view sized from it runs under the navigation bar.
- **Treating window height as safe area.** Notches and home indicators are not part of these
  numbers. Use `react-native-safe-area-context`.
- **Importing `ScaledSize` in new code.** It is deprecated in 0.87. Use `DisplayMetrics`.
- **Reading `densityDpi` without narrowing.** The return type is
  `DisplayMetrics | DisplayMetricsAndroid`, and only the Android member has the field. It is a
  compile error until you narrow.
- **Assuming a `change` event means rotation.** It also fires for split-screen resizes, foldable
  posture changes and font-scale changes. Compare the values rather than inferring the cause.

## Related topics

- [Responsive and Tablet Layouts](responsive-layouts.md) — turning these numbers into breakpoints.
- [Units and Density](units-and-density.md) — what `scale` and `fontScale` mean.
- [Flexbox in React Native](flexbox.md) — the layout you should reach for before measuring.
- [Safe Areas](../components/safe-areas.md) — insets, which these APIs do not give you.
- [ScrollView](../components/scrollview.md) — paging and offsets that need a measured width.
- [Hooks in a Native Context](../state-and-data/hooks-in-react-native.md) — subscription lifecycles in React Native.
