---
title: View
description: The base layout primitive — what it maps to natively, how it lays out children, and when an extra View costs you.
status: current
toolchain: cli
---

`View` is the container everything else sits in. It maps to a `UIView` on iOS and an
`android.view.ViewGroup` on Android, it lays its children out with flexbox, and it carries the
touch, layout and accessibility props that most other components inherit.

If you come from the web, treat `View` as `<div>` with three differences: it has no default
scrolling, it has no text rendering (text must live inside [Text](text.md)), and its flex
defaults are not the web's.

## Why it exists / when to use it — and when NOT to

Use a `View` when you need a box: to group children, to apply a background, border or padding,
to position something absolutely, or to give flexbox something to lay out.

Do **not** reach for `View` when:

- **The content scrolls.** Use [ScrollView](scrollview.md) for a small, bounded amount of
  content, or [FlatList](flatlist.md) once the list can grow.
- **You need text.** A bare string cannot be a child of `View`. It must be wrapped in `Text`.
- **You only need it to hold a style you could put on the child.** Every extra `View` is an
  extra native view. React Native removes *some* layout-only views automatically
  (`collapsable`), but it cannot remove one that paints a background or handles a touch.

## Basic example

```tsx title=src/components/Card.tsx
import {View, Text, StyleSheet} from 'react-native';

type Props = {
  title: string;
  body: string;
};

export function Card({title, body}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {fontSize: 16, fontWeight: '600'},
  body: {fontSize: 14, lineHeight: 20},
});
```

## How it works

### Flex defaults are not the web's

A `View` is `display: flex` with `flexDirection: 'column'`, `alignContent: 'flex-start'` and
`flexShrink: 0`. On the web the defaults are `display: block`, `flexDirection: 'row'` and
`flexShrink: 1`. That single difference accounts for most of the "why is my layout wrong"
confusion when moving from web to native.

There is no `display: block` and no float. There is `display: 'none'`, `'flex'` and
`'contents'`.

### Layout-only view removal

If a `View` does nothing but position its children — no background, no border, no touch
handler, no `testID` — React Native may drop it from the native hierarchy entirely and hoist
its layout onto the parent. That is the `collapsable` prop, and it defaults to `true`.

You will notice it when you try to find the view in a native inspector and it is not there, or
when a native library needs a real view to attach to. Set `collapsable={false}` to force it to
exist. `collapsableChildren={false}` does the same for every direct child at once.

> [!NOTE] `testID`, `id` and `nativeID` disable the optimisation
> Setting any of them means the view has to be findable, so it is kept. That is useful, but it
> also means a screen full of `testID`s is a screen full of extra native views.

### Measuring a view

Two ways, and they answer different questions.

`onLayout` gives you the size and position relative to the parent, on mount and on every layout
change. It is the one you want almost always.

```tsx title=Reading a view's size with onLayout
import {useState} from 'react';
import {View, Text} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';

export function MeasuredBox() {
  const [width, setWidth] = useState(0);

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  return (
    <View onLayout={handleLayout} style={{padding: 12}}>
      <Text>{`I am ${Math.round(width)}pt wide`}</Text>
    </View>
  );
}
```

For an imperative measurement, take a ref. Under the Strict TypeScript API each component has
its own instance type — `View`'s is `ViewInstance`.

```tsx title=Measuring imperatively with a ref
import {useCallback, useRef} from 'react';
import {View, Text, Pressable} from 'react-native';
import type {ViewInstance} from 'react-native';

export function MeasureOnDemand() {
  const boxRef = useRef<ViewInstance | null>(null);

  const measure = useCallback(() => {
    // measureInWindow gives coordinates relative to the whole window, which is
    // what you need when positioning an overlay or a tooltip.
    boxRef.current?.measureInWindow((x, y, width, height) => {
      console.log({x, y, width, height});
    });
  }, []);

  return (
    <View ref={boxRef}>
      <Pressable onPress={measure}>
        <Text>Measure me</Text>
      </Pressable>
    </View>
  );
}
```

Where a helper has to accept a ref to *any* host component rather than a `View` specifically,
the generic type is `HostInstance`:

```tsx title=A helper that measures any host component
import type {HostInstance} from 'react-native';

export type Rect = {x: number; y: number; width: number; height: number};

export function measureToWindow(node: HostInstance | null): Promise<Rect | null> {
  return new Promise(resolve => {
    if (node == null) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      resolve({x, y, width, height});
    });
  });
}
```

### Touch targets: `hitSlop` and `pointerEvents`

`hitSlop` extends the touchable area beyond the visual bounds without changing layout. It is
the correct fix for a small icon button, and it beats adding padding because padding moves
everything around it.

`pointerEvents` decides whether a view and its subtree can be touched at all:

| Value | The view itself | Its children |
| --- | --- | --- |
| `'auto'` (default) | touchable | touchable |
| `'none'` | not touchable | not touchable |
| `'box-none'` | not touchable | touchable |
| `'box-only'` | touchable | not touchable |

`'box-none'` is what you want for a full-screen overlay container that should let touches
through except where its children sit.

> [!WARNING] `hitSlop` is clipped by the parent
> The expanded touch area never extends past the parent view's bounds. If your icon sits flush
> against the edge of a tight container, `hitSlop` on the icon does nothing — give the
> container room instead.

## Platform differences

:::tabs
@tab iOS
- `shouldRasterizeIOS` renders the view to a bitmap once and reuses it while compositing. It
  helps when you translate a static subtree. It costs an offscreen drawing pass and memory, so
  measure before and after.
- Shadows come from `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`, and they
  follow the view's alpha channel, so a transparent view casts a shaped shadow.
- `borderCurve: 'continuous'` gives the squircle corner radius that matches the rest of iOS.
  It has no effect on Android.
@tab Android
- `renderToHardwareTextureAndroid` is the Android equivalent of rasterisation, intended for
  opacity/transform animations. Set it back to `false` when the animation ends — it holds video
  memory.
- The elevation shadow comes from `elevation`, which also affects draw order. The iOS `shadow*`
  props do not produce a shadow here.
- Focus for hardware keyboards and TV remotes is controlled by `focusable`, `tabIndex` and the
  `nextFocusUp` / `nextFocusDown` / `nextFocusLeft` / `nextFocusRight` / `nextFocusForward`
  props, which take the `nativeID` of the target view.
- `needsOffscreenAlphaCompositing` fixes the case where `opacity` on a parent makes overlapping
  children blend incorrectly. It is expensive; only set it where you see the artefact.
:::

`boxShadow` is a newer cross-platform style property that takes a CSS-like shadow list. Where
you need one shadow that looks the same on both platforms, prefer it to hand-writing
`shadow*` plus `elevation`.

## Common patterns

### An absolutely positioned overlay

This is also the supported way to put content on top of an image, since `Image` accepts no
children.

```tsx title=src/components/Overlay.tsx
import {View, Text, StyleSheet} from 'react-native';

export function Badge({count}: {count: number}) {
  return (
    <View style={styles.host}>
      <View style={styles.content} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {width: 48, height: 48},
  content: {flex: 1, borderRadius: 8, backgroundColor: '#e5e7eb'},
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
  },
  badgeText: {color: '#ffffff', fontSize: 11, fontWeight: '700'},
});
```

`position: 'absolute'` is relative to the nearest ancestor with `position: 'relative'` (the
default) — every `View` qualifies, so the containing `View` is the reference frame. There is no
`position: 'fixed'`.

### Spacing with `gap` instead of margins

`gap`, `rowGap` and `columnGap` work on `View`. They remove the classic "margin on every child
except the last" problem, and they survive conditional children without leaving a dangling gap.

```tsx title=Gap beats per-child margins
import type {ReactNode} from 'react';
import {View, StyleSheet} from 'react-native';

export function Row({children}: {children: ReactNode}) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
});
```

## Performance considerations

**Inline style objects re-render children.** `style={{padding: 16}}` creates a new object on
every render. For a plain `View` the cost is a shallow prop diff, which is cheap. Inside a list
row rendered hundreds of times, or on a `React.memo`'d child, it defeats memoisation entirely
because the object identity changes every time. Put static styles in `StyleSheet.create` and
compose arrays only where the value genuinely changes.

**Arrow-function props have the same problem.** `onPress={() => remove(id)}` is a new function
each render. On a memoised child this makes the memo useless. Hoist with `useCallback` and pass
the id through the child, or bind the id inside the row component.

**Depth costs more than width.** Each nested `View` is a native view with its own layout pass.
Flattening three wrappers into one with the right padding and `gap` is a real win on low-end
Android. Use React Native DevTools to see the tree you actually shipped, not the one you think
you wrote.

**`removeClippedSubviews` is a scroll optimisation, not a general one.** It only helps on a
view whose children extend outside its bounds with `overflow: 'hidden'`, and it has known
blank-content bugs. Do not set it speculatively.

## Common mistakes

- **Putting a raw string inside a `View`.** `<View>Hello</View>` throws
  "Text strings must be rendered within a `<Text>` component" at runtime, not at build time,
  which is why it survives review. The right version is `<View><Text>Hello</Text></View>`. It
  bites most often with a stray `{' '}` or a conditional like `{count && <Row />}`, where a
  falsy `0` renders as the string `0`. Use `{count > 0 && <Row />}`.
- **Expecting `overflow: 'hidden'` to clip on Android like it does on iOS.** It works, but a
  child with `elevation` draws above the clip on older Android versions. If you need a clipped
  card with a shadow, put the shadow on an outer view and the clipping on an inner one.
- **Using `flex: 1` on a child of a container with no height.** `flex: 1` means "take the
  remaining space of the parent". If the parent's height is content-sized, there is no
  remaining space and the child collapses to zero. Give the chain of parents a height, usually
  by putting `flex: 1` on the screen root.
- **Adding a wrapper `View` just to hold a margin.** The margin belongs on the child. The extra
  view is a real native view in the tree.
- **Assuming `zIndex` works across siblings with different parents.** `zIndex` only orders
  siblings within the same stacking context, and on Android `elevation` also affects draw
  order. Reorder the JSX instead where you can.
- **Trying to touch a child through a parent with `pointerEvents="none"`.** `'none'` blocks the
  whole subtree. `'box-none'` is the one that lets children stay touchable.

## Related topics

- [Text](text.md) — the only place strings can live.
- [Flexbox in React Native](../styling/flexbox.md) — the layout defaults that differ from the web.
- [StyleSheet](../styling/stylesheet.md) — why `StyleSheet.create` beats inline objects.
- [Shadows and Elevation](../styling/shadows-and-elevation.md) — the per-platform shadow story in full.
- [Pressable and Touchables](pressable-and-touchables.md) — making a `View` respond to touch.
- [Render Performance](../performance/render-performance.md) — measuring what the extra views cost.
