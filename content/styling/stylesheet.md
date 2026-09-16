---
title: StyleSheet
description: How StyleSheet.create works in 0.87, what it actually does, and how to type styles under the Strict API.
status: current
allow-banned: deep-import-libraries
toolchain: cli
---

`StyleSheet` is the styling entry point in React Native. You declare style objects in
JavaScript, pass them to a component's `style` prop, and the renderer applies them to the
underlying native view. There is no CSS file, no selector engine and no cascade.

Under the Strict TypeScript API in 0.87 you import it from the package root. The old
`react-native/Libraries/StyleSheet/StyleSheet` deep import is a type error.

## Why it exists / when to use it — and when NOT to

`StyleSheet.create` gives you three things that a bare object literal does not:

1. **A stable reference.** Styles declared once at module scope keep the same identity across
   renders, so `React.memo` and `PureComponent` comparisons do not see a changed prop.
2. **Type checking against the real style surface.** A typo such as `paddingHorizontl` is a
   compile error inside `create`, where a plain `Record<string, unknown>` would swallow it.
3. **A single place to look.** Styles collected at the bottom of a file read as a unit.

Reach for an inline object only when a value genuinely depends on props or state, and even then
prefer combining a static base style with a small dynamic override.

> [!NOTE] `create` is an identity function
> The 0.87 type definitions describe `StyleSheet.create` as "An identity function for creating
> style sheets". It returns the object you passed. The pre-Fabric behaviour where `create`
> registered styles and handed back opaque numeric IDs to send across the Bridge is gone; the
> Bridge itself went away in 0.82. Advice that tells you `create` is faster because it "avoids
> serialising objects" is describing an architecture that no longer exists. The reasons above
> still hold, but they are about references and types, not serialisation.

## Basic example

```tsx title=src/components/Card.tsx
import {StyleSheet, Text, View} from 'react-native';

type Props = {title: string; body: string};

export function Card({title, body}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    // hairlineWidth is the thinnest line the display can draw crisply.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d0d0d0',
  },
  title: {fontSize: 17, fontWeight: '600', marginBottom: 4},
  body: {fontSize: 15, lineHeight: 21, color: '#444444'},
});
```

## How it works

### The `style` prop takes more than one object

Every core component accepts a single style object, an array, `null`, `false` or an empty
string, and arrays may nest. React Native flattens the structure left to right, so later entries
win. That is the entire "cascade" — there are no selectors and no specificity rules.

```tsx title=Later entries override earlier ones
import {StyleSheet, Text} from 'react-native';

export function Label({muted}: {muted: boolean}) {
  // `muted && styles.muted` yields `false` when muted is off, which the style
  // prop accepts and ignores. No conditional spread needed.
  return <Text style={[styles.base, muted && styles.muted]}>Status</Text>;
}

const styles = StyleSheet.create({
  base: {fontSize: 15, color: '#111111'},
  muted: {color: '#8a8a8a'},
});
```

### What `StyleSheet` exports in 0.87

Read from the installed `react-native@0.87.1` type definitions:

| Export | What it is |
| --- | --- |
| `create` | Identity function that types and groups your styles. |
| `flatten` | Collapses a style prop (including nested arrays) into one object. Returns `null` or `undefined` for empty input, so the result needs a null check. |
| `compose` | Merges two styles, with the second overriding the first. |
| `hairlineWidth` | The width of the thinnest crisp line on this device. |
| `absoluteFill` | `{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0}`. |
| `setStyleAttributePreprocessor` | Marked experimental in the types. Avoid it. |

> [!WARNING] `absoluteFillObject` does not exist
> Many older snippets use `StyleSheet.absoluteFillObject`. It is not part of the 0.87 export
> surface. Use `StyleSheet.absoluteFill`, or write the four offsets yourself if you need to
> spread them into a larger object.

### Typing styles

Three type names cover almost everything: `ViewStyle`, `TextStyle` and `ImageStyle`. Use them
with `satisfies` inside `create` so you keep the inferred literal types while still catching
invalid props.

```tsx title=src/theme/styles.ts
import {StyleSheet} from 'react-native';
import type {ImageStyle, TextStyle, ViewStyle} from 'react-native';

export const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8} satisfies ViewStyle,
  heading: {fontSize: 20, fontWeight: '700'} satisfies TextStyle,
  avatar: {width: 40, height: 40, borderRadius: 20, resizeMode: 'cover'} satisfies ImageStyle,
});
```

When a component of your own forwards a style down to a `View`, type the prop with
`StyleProp<ViewStyle>` rather than `ViewStyle`. `StyleProp` is the type that also permits arrays
and falsy entries, which is what callers actually pass.

```tsx title=src/components/Panel.tsx
import type {ReactNode} from 'react';
import {View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

type Props = {
  children: ReactNode;
  // Accepts an object, an array, or a falsy value — the same as View's own prop.
  style?: StyleProp<ViewStyle>;
};

export function Panel({children, style}: Props) {
  return <View style={[{padding: 12}, style]}>{children}</View>;
}
```

### There is no cascade and almost no inheritance

Setting `color` on a `View` does nothing to the `Text` inside it. The one exception is text
subtrees: a `Text` nested inside another `Text` inherits the parent's text styles. This is
covered in detail in [Flexbox in React Native](flexbox.md#what-react-native-does-not-have).

## Platform differences

`StyleSheet` itself behaves the same on both platforms, but individual style props do not.
`hairlineWidth` resolves to a different number per device because it depends on pixel density,
and several props are single-platform. `overflow: 'visible'` works on iOS; Android always clips
children. Shadow props split across platforms entirely — see
[Shadows and Elevation](shadows-and-elevation.md).

## Common patterns

### Derive a dynamic style from a static base

```tsx title=src/components/ProgressBar.tsx
import {StyleSheet, View} from 'react-native';

export function ProgressBar({fraction}: {fraction: number}) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <View style={styles.track}>
      {/* Only the one changing value is inline; everything static stays in create. */}
      <View style={[styles.fill, {width: `${clamped * 100}%`}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {height: 4, borderRadius: 2, backgroundColor: '#e4e4e7', overflow: 'hidden'},
  fill: {height: '100%', backgroundColor: '#2563eb'},
});
```

### Reading a merged style back

`StyleSheet.flatten` is useful when a component needs to inspect what it was handed — for
example to pull a background colour out and pass it somewhere else. Its return type includes
`null | undefined`, so narrow it.

```tsx title=src/components/Tinted.tsx
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

export function Tinted({style}: {style?: StyleProp<ViewStyle>}) {
  const flat = StyleSheet.flatten(style);
  // flatten can return null/undefined when the style prop was empty.
  const background = flat?.backgroundColor ?? '#ffffff';
  return <View style={[style, {borderColor: background}]} />;
}
```

> [!NOTE] Prefer an array over `StyleSheet.compose`
> Under the Strict API, `compose` is declared as `composeStyles<T, U extends T, V extends T>`.
> `T` cannot be inferred from the arguments, so calling it without explicit type arguments
> resolves `T` to `unknown` and the result fails to assign to a `style` prop. Writing
> `StyleSheet.compose<ViewStyle, ViewStyle, ViewStyle>(a, b)` works, but `[a, b]` is shorter and
> means the same thing.

## Performance considerations

- **Declare styles at module scope.** A `StyleSheet.create` call inside a component body runs on
  every render and produces a new object every time, which defeats memoisation on any child that
  receives it.
- **Inline objects break prop equality.** `style={{margin: 8}}` allocates a fresh object per
  render. For a leaf `View` that is usually immaterial; for a `FlatList` item wrapped in
  `React.memo` it forces re-renders of every visible row.
- **Under Fabric the cost is in the diff, not the transport.** Fabric compares the previous and
  next props for each node and commits only what changed. A stable style reference short-circuits
  that comparison; a newly allocated identical object does not.
- **Do not over-split.** Deeply nested style arrays have to be flattened on every commit.
  Two or three entries are fine; twenty is a smell.

## Common mistakes

- **Deep-importing StyleSheet.**
  Wrong: `import StyleSheet from 'react-native/Libraries/StyleSheet/StyleSheet';`
  Right: `import {StyleSheet} from 'react-native';`
  The `exports` map in `react-native` sets `"types": null` for `./Libraries/*`, so the deep
  import is a hard type error in 0.87, not a lint warning.
- **Calling `StyleSheet.create` inside the component.** It returns a new object each render, so
  every memoised child below it re-renders. Move it to module scope.
- **Using `StyleSheet.absoluteFillObject`.** It is not in the 0.87 export surface. Use
  `absoluteFill`.
- **Expecting styles to inherit.** `<View style={{color: 'red'}}><Text>Hi</Text></View>` leaves
  the text black. Colour and font styles only apply to `Text`, and only inherit within a `Text`
  subtree.
- **Assuming the result of `flatten` is non-null.** The type is nullable. `flat.backgroundColor`
  fails to compile; `flat?.backgroundColor` does not.
- **Using `%` where the parent has no resolved size.** A percentage resolves against the
  parent's computed dimension. If the parent is sized by its children, the percentage has nothing
  to resolve against and collapses.

## Related topics

- [Flexbox in React Native](flexbox.md) — the layout half of styling, and where the web defaults diverge.
- [Units and Density](units-and-density.md) — what the numbers in a style object actually mean.
- [Platform-Specific Styles](platform-specific-styles.md) — `Platform.select`, `.ios.tsx` files and per-platform props.
- [Styling Approaches Compared](styling-approaches.md) — StyleSheet against the library alternatives.
- [Fabric](../core-concepts/fabric.md) — why a stable style reference short-circuits the commit diff.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — why the deep import stopped working.
