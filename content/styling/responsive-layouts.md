---
title: Responsive and Tablet Layouts
description: Breakpoints without media queries, honest tablet detection in 0.87, and layouts that survive rotation, split-screen and foldables.
status: current
toolchain: cli
---

A React Native app has to fit a 320-point phone in portrait, a 1366-point tablet in landscape,
an app occupying a third of an iPad screen, and a foldable that changes size mid-session. There
are no media queries and no CSS container queries, so responsiveness is ordinary React: read the
size, derive a decision, render accordingly.

The goal is not to make the phone layout bigger. It is to use the extra space for extra content.

## Why it exists / when to use it — and when NOT to

Build a responsive layout when the **information architecture** should change with the available
space: a list that becomes a list-plus-detail, one column that becomes three, a bottom sheet that
becomes a sidebar.

Do not build one when flex already handles it. A row of `flex: 1` cards, a `width: '100%'` image
with an `aspectRatio`, and a `FlatList` with `numColumns` all adapt on their own, inside Yoga, with
no re-render. Every breakpoint you add is a subtree that re-renders on rotation.

## Basic example

```tsx title=src/layout/breakpoints.ts
import {useWindowDimensions} from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

/**
 * Widths are in density-independent pixels. 600 and 900 are the thresholds
 * Android's own window size classes use, so they line up with platform
 * conventions rather than being invented.
 */
export function useBreakpoint(): Breakpoint {
  const {width} = useWindowDimensions();
  if (width >= 900) {
    return 'expanded';
  }
  if (width >= 600) {
    return 'medium';
  }
  return 'compact';
}
```

```tsx-fragment title=src/screens/InboxScreen.tsx
import {StyleSheet, Text, View} from 'react-native';
import {useBreakpoint} from '../layout/breakpoints';

export function InboxScreen() {
  const breakpoint = useBreakpoint();
  const showDetailPane = breakpoint !== 'compact';

  return (
    <View style={styles.root}>
      <View style={showDetailPane ? styles.listPane : styles.fullPane}>
        <Text>Message list</Text>
      </View>

      {showDetailPane ? (
        <View style={styles.detailPane}>
          <Text>Message detail</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, flexDirection: 'row'},
  fullPane: {flex: 1},
  // A fixed-width list beside a flexible detail pane is the standard
  // master-detail shape; the list should not grow without limit.
  listPane: {width: 320, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#d4d4d8'},
  detailPane: {flex: 1},
});
```

## How it works

### Width is the breakpoint, not the device

Branch on the current **window width**, never on a device identity. A phone in landscape, a tablet
in portrait and an iPad running your app in Split View can all report the same width, and in every
one of those cases you want the same layout. Device checks get this wrong; width checks do not.

### Tablet detection, honestly

There is no `isTablet` in core React Native. What exists in the 0.87 type definitions is
`Platform.isPad`, and it comes with a Strict-API catch.

`Platform` is typed as a **union** of per-platform shapes (`IOSPlatform | AndroidPlatform | ...`).
`isPad` exists only on the iOS member, so reading it without narrowing on `Platform.OS` is a
compile error. There is no Android equivalent at all.

```tsx title=src/layout/device.ts
import {Platform, useWindowDimensions} from 'react-native';

/** iOS only. `isPad` is not present on the Android member of the Platform union. */
export function isIpad(): boolean {
  return Platform.OS === 'ios' ? Platform.isPad : false;
}

/**
 * Cross-platform approximation. The shortest side is stable across rotation,
 * and 600dp is Android's own large-screen threshold. This is a heuristic, not
 * a device identity: a phone in a large window can satisfy it.
 */
export function useIsLargeScreen(): boolean {
  const {width, height} = useWindowDimensions();
  return Math.min(width, height) >= 600;
}
```

> [!NOTE] Prefer the size check even where `isPad` works
> `Platform.isPad` is `true` for an iPad even when your app is running in a narrow Slide Over
> window where a phone layout is correct. Use it for genuinely device-specific behaviour (an
> iPad-only feature, a pointer affordance) and use width for layout.

### Orientation

Also derived, not read. Compare width and height; there is no core orientation module.

Locking orientation is a native setting, not a JavaScript one, so it belongs in the platform
projects rather than in a style.

:::tabs
@tab iOS
Supported orientations live in `ios/<App>/Info.plist` under `UISupportedInterfaceOrientations`
(and `UISupportedInterfaceOrientations~ipad` for iPad). Xcode's target editor writes the same
keys.

An iPad app that declares all four orientations and does not opt out of multitasking will be
placed in Split View and Slide Over, so it must handle arbitrary widths.
@tab Android
Orientation is an activity attribute in `android/app/src/main/AndroidManifest.xml`:

```xml title=android/app/src/main/AndroidManifest.xml
<activity
  android:name=".MainActivity"
  android:screenOrientation="portrait"
  android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode" />
```

The generated `configChanges` list is what stops Android from recreating the activity on rotation.
Removing entries from it causes a full remount and loses in-memory state, which reads as a crash
to users even though nothing crashed.
:::

### Layout that adapts without a breakpoint

Before adding a breakpoint, check whether one of these solves it:

| Need | Flex-only solution |
| --- | --- |
| Columns that fill the width | `flexDirection: 'row'` with `flex: 1` children |
| A grid | `FlatList` with `numColumns`, or `flexWrap: 'wrap'` with percentage widths |
| Media that keeps its shape | `width: '100%'` plus `aspectRatio` |
| Content that should not stretch across a wide screen | `maxWidth` with `alignSelf: 'center'` |
| Equal spacing between items | `gap` |

```tsx title=Capping line length on a wide screen with no breakpoint
import {ScrollView, StyleSheet, Text} from 'react-native';

export function Article({body}: {body: string}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.body}>{body}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // maxWidth + alignSelf keeps text readable on a tablet without any
  // width measurement or conditional rendering.
  content: {padding: 24, alignItems: 'center'},
  body: {maxWidth: 680, fontSize: 16, lineHeight: 24},
});
```

## Platform differences

:::tabs
@tab iOS
iPad multitasking means your window width changes while the app is running, with no rotation
involved. Anything that branches on width must be reactive; a value captured at mount is wrong
after the user drags the Split View divider.

`Platform.isPad` and `Platform.isVision` are available on the iOS member of the `Platform` union
only. `Platform.Version` is a string on iOS (for example `'26.0'`).
@tab Android
`Platform.Version` is a number — the API level — so code that compares it against a string does
not type-check. Narrow on `Platform.OS` before touching `Version`.

Large-screen behaviour is governed by resource qualifiers and the manifest. Multi-window mode is
on by default for apps targeting modern SDK levels, and foldables emit dimension changes on fold
and unfold. Treat both as ordinary resizes.

Android also has its own layout resource buckets (`res/values-sw600dp`), but those configure
native resources such as themes and launcher metadata, not your React views.
:::

## Common patterns

### Put the decision in one place

Compute the breakpoint once near the root and pass it down through context. Calling
`useWindowDimensions` in every leaf means every leaf re-renders on rotation.

```tsx title=src/layout/LayoutContext.tsx
import {createContext, useContext, useMemo} from 'react';
import type {ReactNode} from 'react';
import {useWindowDimensions} from 'react-native';

type Layout = {isWide: boolean; columns: number};

const LayoutContext = createContext<Layout>({isWide: false, columns: 1});

export function LayoutProvider({children}: {children: ReactNode}) {
  const {width} = useWindowDimensions();

  // Memoise on the derived booleans, not on width, so a one-point change
  // during an animated resize does not produce a new context value.
  const isWide = width >= 600;
  const columns = width >= 900 ? 3 : width >= 600 ? 2 : 1;
  const value = useMemo(() => ({isWide, columns}), [isWide, columns]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): Layout {
  return useContext(LayoutContext);
}
```

### Responsive columns in a list

`numColumns` is the supported way to change a `FlatList` into a grid. Changing it at runtime
requires a `key` change so the list rebuilds its layout.

```tsx title=src/screens/PhotoGrid.tsx
import {FlatList, StyleSheet, useWindowDimensions, View} from 'react-native';

const DATA = Array.from({length: 30}, (_, i) => ({id: String(i)}));

export function PhotoGrid() {
  const {width} = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;

  return (
    <FlatList
      data={DATA}
      // Changing numColumns without changing key leaves stale cell metrics behind.
      key={`cols-${columns}`}
      numColumns={columns}
      keyExtractor={item => item.id}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      renderItem={() => <View style={styles.cell} />}
    />
  );
}

const styles = StyleSheet.create({
  row: {gap: 8, paddingHorizontal: 8},
  cell: {flex: 1, aspectRatio: 1, marginBottom: 8, borderRadius: 8, backgroundColor: '#e4e4e7'},
});
```

### Do not scale everything by a design width

The most common piece of bad advice in this area is a helper that divides the current width by the
width of the design mock and multiplies every size by the ratio. It produces blurry borders
because the results no longer land on the pixel grid, it makes text ignore the user's accessibility
text size, and on a tablet it gives you a phone layout with oversized fonts rather than more
content. Use breakpoints, `maxWidth` and flex.

### Accessibility text size is part of responsiveness

A user at the largest text setting has less effective room than a user at the default, on the same
device. Test with the system text size turned up. Cap growth per label with `maxFontSizeMultiplier`
rather than disabling scaling; see [Units and Density](units-and-density.md).

## Performance considerations

- **A breakpoint change re-renders a subtree.** Keep the branch as high as possible and as coarse
  as possible so a resize flips one boolean instead of recomputing dozens of derived numbers.
- **Memoise on the decision, not the measurement.** `useMemo(..., [width])` recomputes on every
  pixel of an animated iPad resize; `useMemo(..., [isWide])` recomputes twice.
- **Avoid remounting on rotation.** Changing a `FlatList` `key` rebuilds the list, which is
  correct for a column-count change and wasteful for anything else.
- **Prefer `maxWidth` over conditional rendering** when the difference is only how wide something
  is allowed to get. Yoga handles it with no JavaScript work.

## Common mistakes

- **Reading `Platform.isPad` without narrowing.**
  Wrong: `const pad = Platform.isPad;`
  Right: `const pad = Platform.OS === 'ios' ? Platform.isPad : false;`
  `Platform` is a union type in 0.87 and `isPad` exists only on the iOS member.
- **Branching on device instead of width.** An iPad in Slide Over is 320 points wide and wants
  the phone layout. Width is the property you actually care about.
- **Capturing dimensions once.** A module-scope `Dimensions.get('window')` is frozen at import
  time, so the layout is wrong after the first rotation or resize.
- **Comparing `Platform.Version` without narrowing.** It is a `string` on iOS and a `number` on
  Android, so the union rejects both a numeric and a string comparison until you narrow on
  `Platform.OS`.
- **Scaling every dimension by a design-width ratio.** Blurry borders, broken text scaling, and a
  stretched phone layout on tablets.
- **Changing `numColumns` without changing the list `key`.** The list keeps stale cell metrics and
  renders a broken grid.
- **Editing `android:configChanges` out of the manifest.** The activity is then recreated on
  rotation and the app appears to restart.

## Related topics

- [Dimensions and useWindowDimensions](dimensions.md) — the reactive source of the numbers used here.
- [Flexbox in React Native](flexbox.md) — what adapts without a breakpoint.
- [Units and Density](units-and-density.md) — text scaling as part of available space.
- [Platform-Specific Styles](platform-specific-styles.md) — branching on platform rather than size.
- [Safe Areas](../components/safe-areas.md) — insets that change with orientation.
- [FlatList](../components/flatlist.md) — `numColumns` and grid layout.
- [Platform Differences](../core-concepts/platform-differences.md) — the wider platform split.
