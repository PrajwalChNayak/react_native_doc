---
title: Units and Density
description: What the numbers in a style object mean physically, how PixelRatio and hairlineWidth work, and how @2x/@3x assets are picked.
status: current
toolchain: cli
---

Every size in a React Native style is a bare number. There is no `px`, no `rem`, no `em` and no
`pt` suffix, and adding one is a type error for most props. The number is a
**density-independent pixel**: a logical unit that the platform scales to real device pixels.

The consequence is that `width: 100` covers roughly the same physical distance on a low-density
tablet and a high-density phone, but occupies a different number of hardware pixels on each.

## Why it exists / when to use it — and when NOT to

Density independence is what lets one layout ship to a 1x tablet and a 3x phone without a
per-device stylesheet. You write one number and the platform maps it.

You need to think about density explicitly in three situations, and in no others:

1. **Drawing something that must land on the pixel grid** — a one-device-pixel divider. Use
   `StyleSheet.hairlineWidth`.
2. **Requesting a raster image or thumbnail at the right size from a server or a native API.**
   Use `PixelRatio.getPixelSizeForLayoutSize`.
3. **Respecting the user's text-size setting** in a layout that has to reserve space for text.
   Use `fontScale`.

Outside those cases, converting to device pixels yourself is a bug in the making. Write the
logical number and let the platform scale it.

## Basic example

```tsx title=src/components/Divider.tsx
import {PixelRatio, StyleSheet, Text, View} from 'react-native';

export function Divider() {
  return (
    <View>
      <View style={styles.rule} />
      {/* PixelRatio.get() is 2 on most phones, 3 on high-density ones. */}
      <Text style={styles.caption}>Density: {PixelRatio.get()}x</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // hairlineWidth is the thinnest line that renders crisply on this device.
  // Hardcoding 1 draws a line that looks heavy on a 3x screen.
  rule: {height: StyleSheet.hairlineWidth, backgroundColor: '#c4c4c4'},
  caption: {fontSize: 12, color: '#6b7280', marginTop: 4},
});
```

## How it works

### The unit on each platform

| Platform | Native name | `PixelRatio.get()` examples |
| --- | --- | --- |
| iOS | point (pt) | 2 on most iPhones, 3 on Plus/Pro Max class devices |
| Android | density-independent pixel (dp) | 1 at mdpi, 1.5 at hdpi, 2 at xhdpi, 3 at xxhdpi |

A density-independent pixel and a point are the same idea with different names, which is why one
number works for both. The conversion is `devicePixels = logicalPixels * PixelRatio.get()`.

### `PixelRatio`

All four methods below are read from the installed `react-native@0.87.1` type definitions.

| Method | Returns | Use it for |
| --- | --- | --- |
| `PixelRatio.get()` | Device pixel density as a number. | Deciding which asset variant to request. |
| `PixelRatio.getFontScale()` | The user's text-size multiplier. If no font scale is set, it returns the device pixel ratio. | Reserving vertical space for text that can grow. |
| `PixelRatio.getPixelSizeForLayoutSize(dp)` | An integer count of device pixels. | Asking a server or native API for a correctly sized bitmap. |
| `PixelRatio.roundToNearestPixel(dp)` | The nearest logical size that maps to a whole number of device pixels. | Avoiding a half-pixel seam between two adjacent views. |

```tsx title=Requesting a correctly sized remote image
import {Image, PixelRatio, StyleSheet} from 'react-native';

const LOGICAL_WIDTH = 200;
const LOGICAL_HEIGHT = 120;

export function RemoteThumbnail({id}: {id: string}) {
  // The server wants real pixels; the style prop wants logical ones.
  const w = PixelRatio.getPixelSizeForLayoutSize(LOGICAL_WIDTH);
  const h = PixelRatio.getPixelSizeForLayoutSize(LOGICAL_HEIGHT);

  return <Image source={{uri: `https://cdn.example.com/${id}?w=${w}&h=${h}`}} style={styles.thumb} />;
}

const styles = StyleSheet.create({
  thumb: {width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT, borderRadius: 8},
});
```

### Pixel grid snapping

The `PixelRatio` documentation in the type definitions explains the rounding policy: React Native
rounds positions and sizes when it hands them to the native view, and it rounds **relative to the
root** rather than to the parent, so errors do not accumulate down a deep tree. Layout inside
JavaScript and inside Yoga works at full precision.

That is why you should not pre-round values yourself. Mixing rounded and unrounded numbers in the
same layout reintroduces exactly the accumulation the platform is avoiding — a one-pixel border
that vanishes on some screens and doubles on others.

### Font scale is separate from pixel density

`fontScale` reflects the accessibility text-size setting, which the user changes in
Settings > Display > Font size on Android and Settings > Display and Brightness > Text Size on
iOS. It is exposed in three places: `PixelRatio.getFontScale()`, and the `fontScale` field on the
objects returned by `useWindowDimensions()` and `Dimensions.get()`.

`Text` scales with it automatically. The props that control that are on `Text` itself:

- `allowFontScaling` — set to `false` to opt a specific `Text` out. Do this rarely; it is an
  accessibility regression.
- `maxFontSizeMultiplier` — caps how far a `Text` can grow. This is the better tool when a label
  must stay inside a fixed-height control.
- `minimumFontScale` — the floor used when `adjustsFontSizeToFit` shrinks text.

```tsx title=Reserving space that survives a large text setting
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';

export function Banner() {
  const {fontScale} = useWindowDimensions();
  // The row has to stay tall enough for the label at the user's chosen size.
  const minHeight = 44 * Math.min(fontScale, 1.6);

  return (
    <View style={[styles.row, {minHeight}]}>
      <Text style={styles.label} maxFontSizeMultiplier={1.6}>
        Sync complete
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#f1f5f9'},
  label: {fontSize: 15},
});
```

### `@2x` and `@3x` asset resolution

Static images are resolved by the bundler, not at runtime. Put the variants next to each other:

```text
src/
└── img/
    ├── check.png
    ├── check@2x.png
    └── check@3x.png
```

Then reference only the base name:

```tsx title=src/components/Check.tsx
import {Image, StyleSheet} from 'react-native';

export function Check() {
  // The bundler substitutes check@2x.png or check@3x.png based on device density.
  // If no variant matches exactly, the closest one is used.
  return <Image source={require('./img/check.png')} style={styles.icon} />;
}

const styles = StyleSheet.create({
  icon: {width: 24, height: 24},
});
```

Two rules follow from this being a build-time mechanism:

- **The path inside `require` must be a static string literal.** A variable, a template literal or
  a ternary between two `require` calls defeats the resolver. Build a lookup object of `require`
  calls instead and index into it.
- **The `@2x` file should be twice the pixel dimensions of the base, `@3x` three times.** The
  style prop still uses the logical size, so all three variants render at the same physical size.

## Platform differences

:::tabs
@tab iOS
Densities are 2x and 3x on current hardware. Asset variants map directly onto the `@2x` / `@3x`
convention that Xcode already uses, so the same files work if you also ship them in an asset
catalogue for the launch screen or app icon.

`PixelRatio.get()` returns the screen scale. Note that it does not change when the user switches
Display Zoom; the window dimensions do.
@tab Android
Densities are bucketed: mdpi (1), hdpi (1.5), xhdpi (2), xxhdpi (3), xxxhdpi (4), and a device
may report a fractional value such as 3.5 between buckets. Expect `PixelRatio.get()` to return
non-integers.

`Dimensions.get('window')` on Android returns a `DisplayMetricsAndroid` object, which adds a
`densityDpi` field that iOS does not have. Reading it requires narrowing, since the return type
is a union.
:::

## Common patterns

### Do not build a "scale to design width" helper

A widespread snippet divides the window width by a design mock's width and multiplies every size
by the result. It is tempting and it is wrong for two reasons: it destroys pixel-grid alignment
(producing blurry borders), and it scales a phone layout onto a tablet instead of using the extra
space. Use flex, percentages and breakpoints. See
[Responsive and Tablet Layouts](responsive-layouts.md).

### A crisp one-device-pixel border

`StyleSheet.hairlineWidth` is the supported way. It is documented to always be a round number of
device pixels so the line looks sharp, and its value differs between devices — do not cache it as
a constant you also use for arithmetic elsewhere.

### Seamless adjacent views

When two views must touch exactly, round both positions with `PixelRatio.roundToNearestPixel`
rather than with `Math.round`. `Math.round` snaps to a logical pixel, which on a 3x screen is
three device pixels, and the seam moves visibly.

## Performance considerations

- **Shipping only `@3x` assets is not a shortcut.** The bundler will use them everywhere, so 1x
  and 2x devices decode a bitmap three times larger than they can display, costing memory and
  decode time.
- **`PixelRatio.get()` and `getFontScale()` are cheap synchronous reads**, but they do not update
  on their own. If the user changes the text-size setting while the app is running, a value you
  captured in a module constant is stale. Read `fontScale` from `useWindowDimensions()` instead,
  which re-renders on change.
- **Oversized remote images cost more than oversized layout numbers.** Requesting a
  density-correct size from the server is one of the highest-value image optimisations available.

## Common mistakes

- **Writing a unit suffix.** Wrong: `{width: '100px'}`. Right: `{width: 100}`. The style types
  accept strings only for percentages and a few ratio values.
- **Using `1` for a divider.** On a 3x screen a `1` logical pixel line is three device pixels
  thick and looks heavy next to the platform's own separators. Use `StyleSheet.hairlineWidth`.
- **Multiplying every dimension by `PixelRatio.get()`.** Style values are already logical; scaling
  them makes the UI three times too big on a 3x device. Only convert when you are talking to
  something that wants real pixels.
- **A dynamic `require` for an image.** Wrong: ``require(`./img/${name}.png`)``. Right: a literal
  path, or a map of literal `require` calls chosen by key. The density variants are resolved at
  bundle time and a dynamic path cannot be resolved then.
- **Disabling `allowFontScaling` app-wide.** It makes the app unusable for anyone relying on
  large text. Cap growth with `maxFontSizeMultiplier` on the specific labels that cannot grow.
- **Caching `fontScale` in a module constant.** It changes at runtime when the user changes the
  system setting. Read it from `useWindowDimensions()` so the component re-renders.

## Related topics

- [StyleSheet](stylesheet.md) — where `hairlineWidth` and the style types come from.
- [Flexbox in React Native](flexbox.md) — why percentages and flex beat computed pixel sizes.
- [Dimensions and useWindowDimensions](dimensions.md) — reading `scale` and `fontScale` reactively.
- [Responsive and Tablet Layouts](responsive-layouts.md) — the right alternative to a global scaling factor.
- [Image](../components/image.md) — the component that consumes the resolved asset.
- [Image Performance](../performance/image-performance.md) — decode cost, caching and sizing.
- [Accessibility APIs](../platform-apis/accessibility.md) — text scaling as an accessibility requirement.
