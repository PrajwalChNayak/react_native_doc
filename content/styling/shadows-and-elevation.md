---
title: Shadows and Elevation
description: The real 0.87 state of shadows — iOS-only shadow props, Android-only elevation, and the cross-platform boxShadow and filter props that now exist on both.
status: current
toolchain: cli
---

Shadows used to be the textbook React Native platform split: four `shadow*` props that only did
anything on iOS, and an `elevation` number that only did anything on Android. That split is still
in the type definitions, and most existing code is written against it.

It is no longer the whole story. React Native 0.87 ships `boxShadow` and `filter` as **ordinary,
cross-platform style props**, registered in the base view configuration for both iOS and Android.
This page reports what is actually supported where, read from the installed 0.87.1 types and the
Android sources that ship inside the package.

## Why it exists / when to use it — and when NOT to

| Approach | Platforms | Use it when |
| --- | --- | --- |
| `boxShadow` | iOS and Android | You want one declaration, multiple shadows, or an inset shadow |
| `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` | iOS only | You are maintaining existing code, or need fine iOS-only control |
| `elevation` | Android only | You need Android's z-ordering behaviour, not just a shadow |
| `filter: [{dropShadow}]` | iOS, and Android 12+ | The shadow should follow the *pixels* (a transparent PNG, an icon) rather than the box |

When **not** to use a shadow at all: on a long list. A shadow is an extra draw pass per view, and
a `FlatList` of 200 shadowed cards is one of the reliable ways to make an Android mid-range
device stutter. A hairline border or a background-colour step reads almost as well and costs
nothing.

## Basic example

```tsx title=src/components/ShadowCard.tsx
import {StyleSheet, Text, View} from 'react-native';

export function ShadowCard({title}: {title: string}) {
  return (
    <View style={styles.card}>
      <Text>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    // A shadow needs something to cast from. Without an opaque background the
    // shadow renders behind a transparent box and you see the edge of it.
    backgroundColor: '#ffffff',
    // One declaration, both platforms. The array form is the typed one; the
    // CSS string form is also accepted.
    boxShadow: [
      {offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0, 0, 0, 0.12)'},
    ],
  },
});
```

## How it works

### What the 0.87 type surface actually contains

Verified by reading `types_generated/Libraries/StyleSheet/StyleSheetTypes.d.ts`:

| Style prop | Type | Platform annotation in the types |
| --- | --- | --- |
| `shadowColor` | `ColorValue` | `@platform ios` |
| `shadowOffset` | `{width?: number; height?: number}` | `@platform ios` |
| `shadowOpacity` | `number` | `@platform ios` |
| `shadowRadius` | `number` | `@platform ios` |
| `elevation` | `number` | `@platform android` |
| `boxShadow` | `ReadonlyArray<BoxShadowValue> \| string` | **none — cross-platform** |
| `filter` | `ReadonlyArray<FilterFunction> \| string` | **none — cross-platform** |
| `textShadowColor` / `textShadowOffset` / `textShadowRadius` | on `TextStyle` | **none — cross-platform** |

The absence of a `@platform` tag is not a guess: `boxShadow` and `filter` are both registered in
`Libraries/NativeComponent/BaseViewConfig.ios.js` **and**
`Libraries/NativeComponent/BaseViewConfig.android.js` in the installed package. They are real on
both platforms.

The four `shadow*` props carry `@platform ios` and are ignored on Android. `elevation` carries
`@platform android` and is ignored on iOS. Both statements are unchanged from previous versions.

### `BoxShadowValue`

```ts title=The shape, from the installed types
import type {BoxShadowValue} from 'react-native';

// offsetX and offsetY are required; everything else is optional.
export const shadow: BoxShadowValue = {
  offsetX: 0,
  offsetY: 4,
  blurRadius: 12,
  spreadDistance: 0,
  color: 'rgba(0, 0, 0, 0.15)',
  // `inset: true` draws the shadow inside the box rather than around it.
  inset: false,
};
```

`offsetX`, `offsetY`, `blurRadius` and `spreadDistance` accept a `number` or a `string`. Numbers
are density-independent points, the same as every other length in a style object.

Because the prop is an array, you can stack shadows — a tight dark one for contact and a wide
soft one for depth, the way a design system usually specifies it:

```tsx title=src/theme/shadows.ts
import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  raised: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    // Listed nearest-first, the same order as CSS.
    boxShadow: [
      {offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0, 0, 0, 0.10)'},
      {offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0, 0, 0, 0.08)'},
    ],
  },
});
```

### `filter` and `dropShadow`

`filter` takes a list of effects. `FilterFunction` is a union of single-key objects:
`brightness`, `blur`, `contrast`, `grayscale`, `hueRotate`, `invert`, `opacity`, `saturate`,
`sepia` and `dropShadow`.

`dropShadow` differs from `boxShadow` in an important way: it follows the rendered alpha of the
view rather than its bounding box. For a transparent-background icon, `boxShadow` draws a
rectangle's shadow and `dropShadow` draws the icon's shadow.

```tsx title=src/components/Logo.tsx
import {Image, StyleSheet} from 'react-native';

export function Logo() {
  return <Image source={{uri: 'https://example.com/logo.png'}} style={styles.logo} />;
}

const styles = StyleSheet.create({
  logo: {
    width: 64,
    height: 64,
    // standardDeviation is the blur parameter here, not `blurRadius`.
    filter: [
      {dropShadow: {offsetX: 0, offsetY: 2, standardDeviation: 3, color: 'rgba(0,0,0,0.4)'}},
    ],
  },
});
```

## Platform differences

:::tabs
@tab iOS
The four `shadow*` props map onto `CALayer`'s shadow properties.

- **`shadowOpacity` defaults to 0.** Setting `shadowColor` and `shadowRadius` without
  `shadowOpacity` produces nothing at all. This is the single most common "my shadow does not
  show up" cause on iOS.
- **The shadow is drawn outside the view's bounds**, so a parent with `overflow: 'hidden'` clips
  it away.
- **`borderRadius` is respected** — the shadow follows the rounded shape.
- **A transparent background leaks.** With `backgroundColor: 'transparent'` the shadow is drawn
  under the whole box and is visible through it.
- **`boxShadow` and `filter` both work**, with no version gate.

```tsx title=The legacy iOS-only form, for reference
import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 2},
    // Without this line the other three do nothing.
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});
```

@tab Android
`elevation` is the historical mechanism and it is more than a shadow: it also decides draw order
among overlapping siblings, which is why removing it sometimes makes a floating button disappear
behind a list.

- **You do not control the shadow's colour, offset or blur** through `elevation`. It is one
  number and the platform decides the rest.
- **Elevation needs a background.** With no `backgroundColor` there is no outline for the
  platform to derive a shadow from, and nothing is drawn.
- **`boxShadow` works, with version floors.** Read from
  `ReactAndroid/.../drawable/OutsetBoxShadowDrawable.kt` and `InsetBoxShadowDrawable.kt` in the
  installed package: an outset shadow requires **API 28** (Android 9) and an inset shadow
  requires **API 29** (Android 10). Below those levels the shadow is skipped silently — no
  warning, no error, no shadow.
- **`filter` is split by API level.** From `BaseViewManager.java` and `FilterHelper.kt`: filters
  that are pure colour-matrix operations (`brightness`, `contrast`, `grayscale`, `sepia`,
  `saturate`, `hueRotate`, `invert`, `opacity`) are applied through a `ColorMatrixColorFilter` and
  work broadly. **`blur` and `dropShadow` go through `RenderEffect` and require API 31**
  (Android 12); below that they are dropped.
- **Elevation and `boxShadow` on the same view is a mistake.** You get both shadows.

```tsx title=The legacy Android-only form, for reference
import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    // Also raises this view above its siblings in draw order.
    elevation: 4,
  },
});
```
:::

## Common patterns

### One cross-platform shadow token

If your minimum Android version is 28 or higher, `boxShadow` alone is the whole answer and there
is no platform branch to write.

```ts title=src/theme/elevation.ts
import {StyleSheet} from 'react-native';

/**
 * A small scale rather than arbitrary numbers per screen. Naming the levels is
 * what stops a codebase acquiring nine slightly different card shadows.
 */
export const elevation = StyleSheet.create({
  level1: {
    boxShadow: [{offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.12)'}],
  },
  level2: {
    boxShadow: [{offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(0,0,0,0.14)'}],
  },
  level3: {
    boxShadow: [{offsetX: 0, offsetY: 12, blurRadius: 28, color: 'rgba(0,0,0,0.18)'}],
  },
});
```

### Keeping `elevation` for z-ordering

If a floating action button has to sit above a sibling list, `elevation` is doing two jobs and
you still want the second one. Keep it, and use `boxShadow` for the visual so the two platforms
match.

```ts title=src/theme/floating.ts
import {Platform, StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  fab: {
    backgroundColor: '#2563eb',
    borderRadius: 28,
    width: 56,
    height: 56,
    boxShadow: [{offsetX: 0, offsetY: 6, blurRadius: 16, color: 'rgba(0,0,0,0.25)'}],
    // Android only: raises this view above overlapping siblings. The visual
    // shadow comes from boxShadow above, so keep this small.
    ...Platform.select({android: {elevation: 1}, default: {}}),
  },
});
```

### A border instead of a shadow

Worth saying because it is usually the right call in a list. A hairline border separates a card
from its background at a fraction of the cost, and it is identical on both platforms.

```ts title=src/theme/flatCard.ts
import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
  },
});
```

## Performance considerations

- **Shadows are a separate draw pass.** Both platforms have to render the view, then render a
  blurred copy underneath it. Multiply that by every visible row of a list.
- **Blur radius drives cost.** A 24-point blur is meaningfully more expensive than a 4-point one,
  on both platforms.
- **Stacked shadows multiply the cost.** Two entries in a `boxShadow` array is two passes.
- **`filter` with `blur` or `dropShadow` on Android forces a hardware layer.** `BaseViewManager`
  sets `LAYER_TYPE_HARDWARE` when a paint-based filter is applied, which means an off-screen
  buffer per filtered view. Avoid it inside scrolling content.
- **Animating a shadow is the expensive version of animating anything.** The blur has to be
  recomputed per frame, and none of these props are native-driver eligible. Animate `opacity` or
  `transform` on a pre-rendered shadow layer instead. See
  [Animation Performance Rules](../animation/animation-performance.md).
- **Prefer one shadowed container over many shadowed children.** A single shadow around a group
  usually reads the same and costs a fraction.

## Common mistakes

- **Setting the iOS shadow props without `shadowOpacity`.** Wrong:
  `{shadowColor: '#000', shadowRadius: 8}`. Right: add `shadowOpacity: 0.12`. The default is 0,
  so the first version is fully invisible.
- **Expecting `shadowColor` to do anything on Android.** It carries `@platform ios` in the 0.87
  types and is ignored on Android. Use `boxShadow` if you want a coloured shadow on both.
- **Expecting `elevation` to do anything on iOS.** It carries `@platform android`. A card styled
  only with `elevation` is flat on iOS.
- **Using `boxShadow` and assuming it renders on every Android device.** Outset needs API 28 and
  inset needs API 29. On older devices it is silently skipped, so test on your real minimum.
- **Using `filter: [{blur}]` or `filter: [{dropShadow}]` on Android below API 31.** Both are
  dropped without a warning. The colour-matrix filters are fine; those two are not.
- **Shadowing a view with a transparent background.** There is nothing to cast from on Android,
  and on iOS the shadow shows through the box. Give it a `backgroundColor`.
- **Clipping the shadow with the parent.** A parent with `overflow: 'hidden'` cuts the shadow off
  at its bounds. Move the shadow to a wrapper outside the clipping view.
- **Putting a shadow on every row of a `FlatList`.** This is the most common cause of a list that
  scrolls smoothly on iOS and drops frames on Android.
- **Combining `elevation` and `boxShadow` at full strength.** On Android you get two shadows
  stacked. Pick one for the visual and, if you need `elevation` for ordering, set it to a value
  that draws almost nothing.

## Related topics

- [StyleSheet](stylesheet.md) — where these props live and how the style prop is flattened.
- [Platform-Specific Styles](platform-specific-styles.md) — `Platform.select` for the cases that still need a branch.
- [Units and Density](units-and-density.md) — what the offset and blur numbers mean on a real screen.
- [Dark Mode](dark-mode.md) — shadows read very differently on a dark background; usually you want a border instead.
- [List Performance in Depth](../performance/list-performance.md) — why per-row shadows show up in a profile.
- [Animation Performance Rules](../animation/animation-performance.md) — why shadow properties are a bad animation target.
