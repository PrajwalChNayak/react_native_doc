---
title: Flexbox in React Native
description: How Yoga's flexbox differs from the web's, the four defaults that catch everyone, and what React Native's layout engine does not implement.
status: current
toolchain: cli
---

React Native lays out every view with **Yoga**, a cross-platform implementation of flexbox
written in C++. Yoga runs on the native side, not in a browser engine, so what you get is
flexbox-shaped but not flexbox-identical: a subset of the properties, four different defaults,
and none of the surrounding CSS machinery.

If you come from the web, the defaults are the thing that will cost you an afternoon. Learn them
first.

## Why it exists / when to use it — and when NOT to

Flexbox is the only general-purpose layout system React Native has. There is no grid, no float,
no `inline-block`. Every screen you build is nested flex containers, so the question is never
whether to use flexbox but how to structure it.

The one thing to avoid is reaching for `position: 'absolute'` to escape a layout you have not
understood. Absolute children are removed from the flow, do not contribute to their parent's
size, and stop responding to text scaling. They are correct for overlays, badges and floating
buttons, and wrong for the main structure of a screen.

## The four defaults that differ from the web

This is the whole reason a web developer's first React Native layout looks wrong. Verified
against the `react-native` 0.87 type definitions and the layout-props reference on
reactnative.dev.

| Property | React Native | CSS on the web | Why it bites |
| --- | --- | --- | --- |
| `flexDirection` | `column` | `row` | Children stack vertically unless you say otherwise. |
| `alignContent` | `flex-start` | `stretch` | Wrapped lines bunch at the start of the cross axis instead of filling it. |
| `flexShrink` | `0` | `1` | Children overflow their container instead of shrinking. Long text does not compress; it gets clipped. |
| `boxSizing` | `border-box` | `content-box` | `width: 100` includes padding and border, so a padded box is not wider than you asked for. |

Everything else matches the web's defaults: `alignItems` is `stretch`, `justifyContent` is
`flex-start`, `alignSelf` is `auto`, `flexWrap` is `nowrap`, `flexGrow` is `0`, and `display` is
`flex`.

> [!WARNING] `flexShrink: 0` is the one that produces "my text is cut off"
> On the web, a flex child shrinks below its content size by default. In React Native it does
> not. A `Text` in a row next to a fixed-width icon will run past the edge of the screen rather
> than wrapping. The fix is to set `flexShrink: 1` on the child that should give way, and usually
> `minWidth: 0` is not needed because Yoga has no equivalent of the web's automatic minimum size.

```tsx title=The row that overflows, and the fix
import {StyleSheet, Text, View} from 'react-native';

export function Row({label}: {label: string}) {
  return (
    <View style={styles.row}>
      {/* Without flexShrink: 1 this Text pushes the badge off-screen. */}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.badge} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  label: {flexShrink: 1, fontSize: 15},
  badge: {width: 24, height: 24, borderRadius: 12, backgroundColor: '#2563eb'},
});
```

## Basic example

```tsx title=src/screens/DashboardScreen.tsx
import {StyleSheet, Text, View} from 'react-native';

export function DashboardScreen() {
  return (
    // flex: 1 makes this View fill its parent. Without it the screen collapses
    // to the height of its content.
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
      </View>

      <View style={styles.body}>
        <View style={[styles.tile, {backgroundColor: '#dbeafe'}]} />
        <View style={[styles.tile, {backgroundColor: '#dcfce7'}]} />
      </View>

      <View style={styles.footer}>
        <Text>2 items</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  header: {padding: 16},
  title: {fontSize: 24, fontWeight: '700'},
  // flex: 1 on the middle section is what pins the footer to the bottom:
  // the body absorbs all remaining space.
  body: {flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16},
  tile: {flex: 1, borderRadius: 12},
  footer: {padding: 16, alignItems: 'center'},
});
```

## How it works

### `flex` is one number, not the CSS shorthand

On the web, `flex: 1 1 auto` sets grow, shrink and basis together. React Native's `flex` takes a
single number and Yoga interprets it:

- **Positive** — the view is flexible and sized in proportion to the number. `flex: 2` takes
  twice the free space of a sibling with `flex: 1`.
- **`0`** — the view is sized by `width` and `height` and does not flex.
- **`-1`** — the view is normally sized by `width` and `height`, but shrinks to `minWidth` and
  `minHeight` when there is not enough room.

`flexGrow`, `flexShrink` and `flexBasis` are also available individually and behave as they do
in CSS. Use them when you need grow and shrink to differ; use `flex` when you want the common
case.

### The main axis follows `flexDirection`

`justifyContent` always works along the main axis and `alignItems` along the cross axis. Because
`flexDirection` defaults to `column`, `justifyContent: 'center'` centres vertically by default —
the opposite of the web. Set `flexDirection: 'row'` and the same value centres horizontally.

### `gap` replaces margin arithmetic

`gap`, `rowGap` and `columnGap` are supported and are the right way to space siblings. They
avoid the classic "every item has `marginRight` except the last one" problem. The types accept a
number or a string; the layout-props reference notes that only pixel-style values are supported,
so pass a plain number.

### Percentages and `aspectRatio`

`width`, `height`, `flexBasis` and the inset props accept a percentage string. A percentage
resolves against the parent's *computed* size, so it does nothing useful if the parent is itself
sized by its children.

`aspectRatio` sizes whichever dimension you left undefined, and accepts a number (`16 / 9`) or a
ratio string (`'16 / 9'`).

```tsx title=A 16:9 media box that fills the available width
import {StyleSheet, View} from 'react-native';

export function MediaBox() {
  return <View style={styles.media} />;
}

const styles = StyleSheet.create({
  // Height is derived from width; no Dimensions call required.
  media: {width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111827', borderRadius: 12},
});
```

### Positioning

`position` accepts `relative` (the default), `absolute` and `static`.

- **`relative`** keeps the view in the flow and offsets it visually by `top` / `right` /
  `bottom` / `left` without affecting siblings.
- **`absolute`** removes the view from the flow and positions it against its nearest
  non-`static` ancestor.
- **`static`** lays the view out in the normal flow and ignores insets. A `static` view does not
  form a containing block for absolute descendants, so it is the tool for positioning a child
  against a grandparent rather than its parent. The type definitions note that `static` is
  available only on the new renderer, which is the only renderer from 0.82 onwards.

`start` and `end` are direction-aware equivalents of `left` and `right`, and take precedence over
them. Prefer them in any layout that has to support right-to-left languages.

## What React Native does not have

Being explicit about the gaps saves more time than listing what works.

| Missing | What to do instead |
| --- | --- |
| `display: grid` | `display` accepts only `none`, `flex` and `contents`. Build grids from wrapped flex rows, or from a `FlatList` with `numColumns`. |
| `float` / `clear` | Not implemented. Use `flexDirection: 'row'` or absolute positioning. |
| The CSS cascade and selectors | There is no selector engine, no specificity and no `!important`. Style resolution is left-to-right array merging and nothing else. |
| Style inheritance | Styles do not flow from a `View` to its children. The single exception is text: a `Text` nested inside another `Text` inherits the parent's text styles. A `Text` cannot be a direct child of a `View` — it has to be wrapped. |
| `inline` / `block` / `inline-block` | Layout is flex-only. Inline text flow exists inside a `Text`, not between components. |
| Media queries | Read the window size at runtime; see [Dimensions and useWindowDimensions](dimensions.md). |
| `em`, `rem`, `vh`, `vw`, `pt`, `px` units | Numbers are density-independent pixels. See [Units and Density](units-and-density.md). |
| `z-index` stacking contexts as on the web | `zIndex` exists, but siblings paint in tree order by default. On Android `elevation` also affects z-order. |

```tsx title=Text inheritance is the one exception
import {StyleSheet, Text, View} from 'react-native';

export function Inheritance() {
  return (
    <View style={styles.box}>
      {/* The nested Text is bold AND red. The View's own styles reach neither. */}
      <Text style={styles.bold}>
        I am bold <Text style={styles.red}>and red</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {padding: 12},
  bold: {fontWeight: '700'},
  red: {color: '#dc2626'},
});
```

## Platform differences

Most of Yoga is identical across platforms, because it is the same C++ library on both. Two
props are not:

:::tabs
@tab iOS
`overflow: 'visible'` is honoured, so a child can paint outside its parent's bounds — which is
how badges that hang off the corner of an avatar work.

The installed type definitions annotate `direction` (`inherit` / `ltr` / `rtl`) as iOS-only. The
online layout-props reference does not repeat that annotation, so treat cross-platform behaviour
as unverified and drive right-to-left layout through `I18nManager` plus the `start` / `end`
props instead.
@tab Android
`overflow: 'visible'` has no effect according to the 0.87 type definitions: every view clips its
children. A badge that needs to overhang has to be a sibling positioned absolutely over the
avatar, inside a shared parent large enough to contain both.

`elevation` participates in z-ordering as well as drawing a shadow, so raising a view's elevation
can bring it in front of siblings that `zIndex` alone would not. See
[Shadows and Elevation](shadows-and-elevation.md).
:::

## Common patterns

### Centring

```tsx title=Centre a child in both axes
import {StyleSheet, Text, View} from 'react-native';

export function Centred() {
  return (
    <View style={styles.fill}>
      <Text>Centred</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // With the default column direction: justifyContent is the vertical axis,
  // alignItems the horizontal one.
  fill: {flex: 1, justifyContent: 'center', alignItems: 'center'},
});
```

### Push one item to the far end of a row

`justifyContent: 'space-between'` handles two items. For an uneven split, give the element before
the gap `flex: 1`, or insert a spacer `View` with `flex: 1`.

### A wrapping tag list

```tsx title=src/components/Tags.tsx
import {StyleSheet, Text, View} from 'react-native';

export function Tags({items}: {items: string[]}) {
  return (
    <View style={styles.wrap}>
      {items.map(item => (
        <Text key={item} style={styles.tag}>
          {item}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // alignContent defaults to flex-start in React Native, so wrapped rows sit at
  // the top of the container rather than spreading. That is usually what you want
  // here; set it explicitly if it is not.
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start'},
  tag: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#eef2ff'},
});
```

### A full-bleed overlay

```tsx title=src/components/Overlay.tsx
import {StyleSheet, View} from 'react-native';

export function Overlay() {
  // absoluteFill is {position:'absolute', left:0, right:0, top:0, bottom:0}.
  return <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  scrim: {backgroundColor: 'rgba(0,0,0,0.4)'},
});
```

## Performance considerations

- **Yoga runs on every commit, off the JS thread under Fabric.** Layout cost scales with the
  number of nodes, not with how complex each style object is. Flattening a tree of wrapper
  `View`s helps more than trimming style properties.
- **Deeply nested `flex: 1` chains are cheap; deeply nested views are not.** Each extra wrapper
  is another Yoga node measured on every layout pass.
- **`flexWrap: 'wrap'` costs more than `nowrap`** because Yoga has to run a second pass to place
  lines. It is fine for a tag list and wrong for a long scrolling feed — use a list component
  with `numColumns` there.
- **Percentage sizes force the parent to be measured first.** In a long chain of percentage-sized
  views this serialises the measurement passes. Prefer `flex` where you can.

## Common mistakes

- **Forgetting `flex: 1` on the root view.** Wrong: `<View style={{backgroundColor: 'red'}}>` as
  a screen root — it collapses to the height of its content. Right: `<View style={{flex: 1,
  backgroundColor: 'red'}}>`.
- **Assuming `flexDirection` is `row`.** Copying a web layout and wondering why everything is
  stacked. Set `flexDirection: 'row'` explicitly whenever you want a row.
- **Expecting text to shrink.** `flexShrink` is `0`, so a long label in a row overflows instead
  of compressing. Add `flexShrink: 1` to the element that should yield, and `numberOfLines` if
  you want an ellipsis.
- **Using `alignItems: 'center'` when you meant `justifyContent: 'center'`.** With the default
  column direction, `alignItems` centres horizontally and `justifyContent` centres vertically.
  The mapping flips when you set `flexDirection: 'row'`.
- **Reaching for `display: 'grid'`.** It does not exist. `display` accepts `none`, `flex` and
  `contents`.
- **Styling a `View` and expecting the `Text` inside it to change colour.** There is no
  inheritance across component types. Put text styles on the `Text`.
- **Using `overflow: 'visible'` for an overhanging badge.** It works on iOS and, per the 0.87
  type definitions, does nothing on Android. Restructure so the overhang stays inside a parent
  that is big enough.
- **Percentage height inside a content-sized parent.** `height: '50%'` resolves to nothing when
  the parent has no fixed or flexed height of its own.

## Related topics

- [StyleSheet](stylesheet.md) — how style objects are declared, merged and typed.
- [Units and Density](units-and-density.md) — what a layout number means physically.
- [Dimensions and useWindowDimensions](dimensions.md) — reading the window size, the replacement for media queries.
- [Responsive and Tablet Layouts](responsive-layouts.md) — applying all of this across form factors.
- [How RN Differs from the Web](../core-concepts/differences-from-web.md) — the wider set of web assumptions that do not carry over.
- [The Render Pipeline](../core-concepts/render-pipeline.md) — where the Yoga layout pass sits in a Fabric commit.
- [Text](../components/text.md) — the one component with style inheritance.
