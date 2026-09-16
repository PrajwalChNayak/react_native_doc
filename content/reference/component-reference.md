---
title: Component Reference
description: Every component React Native 0.87.1 exports, with its purpose, platform and status — read from the installed type definitions.
status: current
allow-banned: image-background, modal-animated, statusbar-translucent
toolchain: cli
---

This is the complete list of components exported from `react-native@0.87.1` under the Strict
TypeScript API. It was read from `types_generated/index.d.ts` in the installed package, not from
memory.

**If a component is not on this page, it is not in React Native core.** It is either from a
third-party package, or it was removed, or it never existed. That is a useful thing to be able to
check, because a large share of React Native advice online names components that core does not have.

The non-component exports — APIs, hooks, utilities — are in [API Reference](api-reference.md). The
two pages together cover the 92 values `react-native` exports.

## How to read the tables

- **Platform** is `both`, `iOS` or `Android`. An iOS-only component renders nothing useful on
  Android and vice versa.
- **Status** is `current` or `deprecated`. Deprecated means the export still exists in 0.87.1 and
  your code still runs, and also that the replacement exists today and this one will be removed.
- Every deprecation below is quoted from the `@deprecated` annotation in the installed type
  definitions, not inferred.

## Layout and content

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `View` | The base layout primitive. A flex container that maps to `UIView` / `android.view.View` | both | current |
| `Text` | The only component that renders text. Text cannot be a direct child of `View` | both | current |
| `Image` | Displays a local or remote image | both | current |
| `ImageBackground` | An image with children drawn over it | both | **deprecated** — "Use a `View` with an absolutely positioned `Image` instead" |
| `SafeAreaView` | Pads content inside the device's safe area | iOS | **deprecated** — "Use `react-native-safe-area-context` instead" |
| `experimental_LayoutConformance` | Opts a subtree into a specific layout conformance mode | both | current (experimental) |

> [!DEPRECATED] `ImageBackground`
> Replace it with a `View` containing an `Image` styled `StyleSheet.absoluteFill`. Remember
> `overflow: 'hidden'` on the container — the deprecated component clipped for you. The before/after
> pair is in [0.87 Breaking Changes](../migration/breaking-changes-087.md).

> [!DEPRECATED] `SafeAreaView`
> It was always iOS-only, and it cannot report inset values to your own layout code.
> `react-native-safe-area-context` (5.9.1) works on both platforms and exposes the insets as
> numbers, which is what most layouts actually need.

## Scrolling and lists

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `ScrollView` | Renders all children at once inside a scrollable container | both | current |
| `FlatList` | Virtualised list for a flat array of items | both | current |
| `SectionList` | Virtualised list with section headers | both | current |
| `VirtualizedList` | The lower-level engine behind `FlatList`; use when your data is not an array | both | current |
| `VirtualizedSectionList` | The lower-level engine behind `SectionList` | both | current |
| `RefreshControl` | Pull-to-refresh indicator, passed to a scrollable's `refreshControl` prop | both | current |

`ScrollView` mounts every child immediately. That is correct for a short form and wrong for a feed —
a hundred rows means a hundred mounted subtrees before the first frame. `FlatList` is the default
for anything whose length you do not control.

## Input and interaction

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `Pressable` | The modern touch primitive. Gives press state to children via a render callback | both | current |
| `TextInput` | Single- or multi-line text entry | both | current |
| `Switch` | A boolean toggle | both | current |
| `Button` | A minimal platform-styled button with no style props | both | current |
| `TouchableOpacity` | Touch wrapper that fades opacity on press | both | current |
| `TouchableHighlight` | Touch wrapper that shows an underlay colour on press | both | current |
| `TouchableNativeFeedback` | Touch wrapper using the Android ripple | Android | current |
| `TouchableWithoutFeedback` | Touch wrapper with no visual feedback | both | current |
| `InputAccessoryView` | A view docked above the keyboard | iOS | current |
| `KeyboardAvoidingView` | Moves its content out of the way of the keyboard | both | current |

`Pressable` is the one to build on. It handles press, long press, hover and focus, exposes the
pressed state to its children, and supports `hitSlop` and `pressRetentionOffset`. The `Touchable*`
family predates it and is still exported, but a new component has no reason to use one.

`Button` deliberately takes no `style` prop. If you need to style it, you want `Pressable`.

`TouchableWithoutFeedback` is the only member of the family with no corresponding `*Instance` type
in 0.87.1, because it clones its child rather than rendering a host view of its own.

## Overlays and status

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `Modal` | Presents content above the rest of the app | both | current |
| `StatusBar` | Controls the system status bar's appearance | both | current |

> [!WARNING] `StatusBar` lost three props in 0.87
> `backgroundColor`, `translucent` and `networkActivityIndicatorVisible` were removed, along with
> their setter methods. `barStyle`, `hidden` and `animated` remain. Colour the status bar area with
> a `View` sized to the top safe-area inset instead. `Modal`'s `animated` prop was also removed —
> use `animationType`.

## Android-specific

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `DrawerLayoutAndroid` | A side drawer using the Android drawer layout | Android | **deprecated** — "Use `react-native-drawer-layout` instead" |
| `ProgressBarAndroid` | The Android progress indicator | Android | **deprecated** — "has been extracted from react-native core and will be removed in a future release … install from `@react-native-community/progress-bar-android`" |
| `TouchableNativeFeedback` | Android ripple touch feedback | Android | current |

> [!DEPRECATED] `DrawerLayoutAndroid`
> Android-only to begin with, so it never gave you a cross-platform drawer. Use
> `react-native-drawer-layout`, or `@react-navigation/drawer` (7.13.10) if you are already using
> React Navigation. See [Drawer](../navigation/drawer.md).

## iOS-specific

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `InputAccessoryView` | A view docked above the keyboard | iOS | current |
| `SafeAreaView` | Safe-area padding | iOS | **deprecated** — use `react-native-safe-area-context` |

There is no `ActivityIndicator`-style iOS/Android split for most components; React Native
deliberately keeps one component with platform-specific props rather than two components.

## Feedback

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `ActivityIndicator` | A spinner | both | current |

`size` takes `'small' | 'large'` on both platforms and additionally accepts a number on Android.
`color` defaults to the system accent colour on Android and `#999999` on iOS.

## Unstable and internal components

These are exported with an `unstable_` prefix, which is the API telling you it may change in a minor
release. They are listed for completeness — if you are reaching for one, check whether a stable
component does the job first.

| Component | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `unstable_NativeView` | The raw host view component underneath `View` | both | current (unstable) |
| `unstable_NativeText` | The raw host text component underneath `Text` | both | current (unstable) |
| `unstable_VirtualView` | A view that reports when it enters or leaves a virtualisation window | both | current (unstable) |
| `unstable_VirtualColumn` | A column layout within the virtual-collection system | both | current (unstable) |
| `unstable_VirtualRow` | A row layout within the virtual-collection system | both | current (unstable) |

The rest of the virtual-collection family — `unstable_VirtualArray`,
`unstable_createVirtualCollectionView`, `unstable_VirtualColumnGenerator`,
`unstable_getScrollParent`, `unstable_DEFAULT_INITIAL_NUM_TO_RENDER` and `VirtualViewMode` — are
values rather than components and are listed in [API Reference](api-reference.md).

## Components people expect and core does not have

Every name below is absent from the 0.87.1 export surface. If a tutorial uses one, it is either
describing a third-party package or it is wrong.

| Name | Reality |
| --- | --- |
| `SafeAreaProvider`, `useSafeAreaInsets` | From `react-native-safe-area-context` (5.9.1) |
| `FlashList` | From `@shopify/flash-list` (2.3.2) |
| `Svg`, `Path`, `Circle` | From `react-native-svg` (15.15.5) |
| `WebView` | From `react-native-webview` (14.0.1) |
| `GestureDetector`, `GestureHandlerRootView` | From `react-native-gesture-handler` (3.3.0) |
| `Picker`, `DatePickerIOS`, `Slider`, `WebView`, `MaskedViewIOS`, `AsyncStorage` | Extracted from core years ago into community packages |
| `Touchable` | An undocumented root export, removed in 0.87. Use `Pressable` |
| `NativeDialogManagerAndroid` | Removed in 0.87. Use `Alert` |

## Basic example

Most screens are built from six of the components above:

```tsx title=src/screens/OrdersScreen.tsx
import {useCallback, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';

type Order = {id: string; title: string; cents: number};

export function OrdersScreen({
  orders,
  loading,
  onRefresh,
  onSelect,
}: {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  const renderItem = useCallback(
    ({item}: {item: Order}) => (
      // Pressable gives the pressed state to children, so no wrapper state is needed.
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelect(item.id)}
        style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
        <Text style={styles.title}>{item.title}</Text>
        <Text>{(item.cents / 100).toFixed(2)}</Text>
      </Pressable>
    ),
    [onSelect],
  );

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" accessibilityLabel="Loading orders" />
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListEmptyComponent={<Text style={styles.empty}>No orders yet</Text>}
    />
  );
}

const styles = StyleSheet.create({
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  row: {flexDirection: 'row', justifyContent: 'space-between', padding: 16},
  rowPressed: {backgroundColor: '#eef1f5'},
  title: {fontWeight: '600'},
  empty: {padding: 16, textAlign: 'center'},
});
```

## Platform differences

:::tabs
@tab iOS
`InputAccessoryView` and `DynamicColorIOS` are iOS-only. `SafeAreaView` exists but is deprecated.
Several components take iOS-only props typed in a `*PropsIOS` interface — for example
`ScrollViewPropsIOS` and `RefreshControlPropsIOS`, which are exported as types alongside the
component.
@tab Android
`DrawerLayoutAndroid`, `ProgressBarAndroid`, `ToastAndroid`, `PermissionsAndroid` and
`TouchableNativeFeedback` are Android-only, and the first two are deprecated. Android-only props are
grouped into `*PropsAndroid` interfaces — `ViewPropsAndroid`, `ImagePropsAndroid`,
`RefreshControlPropsAndroid` and so on.
:::

A component whose name ends in `Android` or `IOS` renders nothing useful on the other platform.
Wrap it in a `Platform.OS` check, or better, pick a component that works on both.

## Performance considerations

- **`ScrollView` mounts everything.** Anything with an unbounded item count needs `FlatList`.
- **`FlatList` is not free either.** `@shopify/flash-list` (2.3.2) is measurably faster for long,
  heterogeneous lists. See [Virtualization and FlashList](../components/virtualization-and-flashlist.md).
- **Every `Touchable*` wraps its child in an extra host view.** `Pressable` does too, but one
  component that handles press, long press, hover and focus beats nesting three.
- **`Modal` creates a new native window.** Mounting several at once is expensive; render one and
  switch its content.
- **`Text` cannot be nested inside `View` for inline layout.** Nesting `Text` inside `Text` is how
  you get mixed styles in one paragraph, and it produces one host node rather than several.

## Common mistakes

- **Putting a bare string inside `View`.** Wrong: `<View>Hello</View>`. Right:
  `<View><Text>Hello</Text></View>`. React Native has no anonymous text node; the bare form throws.
- **Reaching for `TouchableOpacity` by habit.** Wrong: wrapping everything in `TouchableOpacity`.
  Right: `Pressable`. It gives you the pressed state, hover and focus, and it is the primitive the
  others are being retired in favour of.
- **Using `ScrollView` for a list.** Wrong: mapping over a hundred items inside a `ScrollView`.
  Right: `FlatList`. The `ScrollView` mounts every subtree before the first frame.
- **Expecting `SafeAreaView` to work on Android.** Wrong: assuming it is cross-platform. Right:
  `react-native-safe-area-context`. `SafeAreaView` is iOS-only and deprecated.
- **Styling `Button`.** Wrong: `<Button style={...}>`. Right: build it from `Pressable` and `Text`.
  `Button` has no `style` prop by design.
- **Assuming a component exists because a tutorial used it.** Wrong: importing `Picker` or `Slider`
  from `react-native`. Right: check this page. Those left core years ago.
- **Using `<Modal animated>` or `<StatusBar translucent>`.** Both were removed in 0.87. Use
  `animationType`, and draw your own status-bar background.

## Related topics

- [API Reference](api-reference.md) — the other 60 exports: APIs, hooks and utilities.
- [Cheat Sheet](cheat-sheet.md) — the same list, condensed for daily lookup.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — what was removed and what replaced it.
- [View](../components/view.md) — the layout primitive in depth.
- [Pressable and Touchables](../components/pressable-and-touchables.md) — which touch component to use.
- [FlatList](../components/flatlist.md) — the default list component.
- [Virtualization and FlashList](../components/virtualization-and-flashlist.md) — when core lists stop scaling.
- [Safe Areas](../components/safe-areas.md) — the replacement for the deprecated `SafeAreaView`.
- [Troubleshooting](troubleshooting.md) — when a component does not render.
