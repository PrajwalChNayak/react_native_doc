---
title: Safe Areas
description: Keeping content clear of notches, status bars, home indicators and camera cutouts — what core SafeAreaView can and cannot do, and why react-native-safe-area-context is the real answer.
status: current
toolchain: cli
---

A phone screen is not a rectangle you own. Part of it is covered by the status bar, part by a
notch or a camera cutout, part by the home indicator or the gesture bar, and on Android part may be
under a translucent navigation bar. The *safe area* is what is left.

React Native ships a `SafeAreaView` in core, and it is not the component most apps should use. It
is effectively iOS-only, it has no way to say which edges you care about, and the 0.87 type
definition marks it deprecated in favour of `react-native-safe-area-context`. This page covers both
honestly, because you will meet the core one in existing code.

## Why it exists / when to use it — and when NOT to

You need safe-area handling on any screen that draws to the edges: a full-screen list, a custom
header, a bottom bar, a modal that covers the whole window.

You do **not** need it when:

- **A navigator is already handling it.** React Navigation's headers and tab bars apply the insets
  themselves. Adding another safe-area wrapper around a screen that already has a header produces
  a double gap.
- **The content is inset from the edges anyway.** A card with 24pt of margin on a centred screen is
  not going to collide with the home indicator.
- **You are inside a scroll view on iOS and only need the content inset.** `contentInsetAdjustmentBehavior`
  on [ScrollView](scrollview.md) already handles that case.

Applying insets twice is a more common bug than not applying them at all, and it is harder to
notice because it just looks like slightly wrong spacing.

## Basic example

`react-native-safe-area-context` 5.9.1 is the maintained solution and the one React Navigation
itself depends on. Install it and rebuild:

:::tabs
@tab npm
```bash
npm install react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install
```
:::

Wrap the app once in a provider, then use the hook or the component anywhere below it.

```tsx title=src/App.tsx
import type {ReactNode} from 'react';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';

export function App({children}: {children: ReactNode}) {
  return (
    // initialWindowMetrics gives the first frame real inset values instead of
    // zeros, which removes the visible jump on cold start.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>{children}</SafeAreaProvider>
  );
}
```

```tsx title=src/screens/HomeScreen.tsx
import {View, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.host, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      <Text>Content that never sits under the status bar or the home indicator</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, paddingHorizontal: 16},
});
```

## How it works

### Core `SafeAreaView`

The core component applies the safe-area insets as padding, on all four edges, with no
configuration. Its prop list is exactly `ViewProps` — there is no `edges` prop and no `mode` prop.
Two further limits matter:

- It is documented as iOS-only, and its 0.87 type definition carries `@platform ios`. On Android it
  is a plain `View`.
- The same type definition carries `@deprecated Use react-native-safe-area-context instead`.

It is still exported from `react-native` in 0.87, so nothing breaks today. But "pad all four edges
on one platform" is the wrong shape for most screens: a screen with a bottom tab bar wants the top
inset and not the bottom one, and a screen behind a header wants neither.

> [!DEPRECATED] Core `SafeAreaView`
> Still exported, still working, marked deprecated in the 0.87 types, and a no-op on Android. The
> block below is shown only so you recognise it in existing code — do not write new screens this
> way.

```tsx title=Not the recommended approach
import {SafeAreaView, Text, StyleSheet} from 'react-native';

export function LegacyScreen() {
  // Pads all four edges, on iOS only, with no way to choose which.
  // On Android this is an ordinary View and the status bar overlaps the text.
  return (
    <SafeAreaView style={styles.host}>
      <Text>Hello</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({host: {flex: 1}});
```

### `useSafeAreaInsets`

The hook returns `{top, right, bottom, left}` in points and re-renders the component when the
insets change — on rotation, when the keyboard changes the window, or when the system bars come and
go.

Returning numbers rather than a component is what makes it flexible: you decide whether an inset
becomes padding, margin, a scroll view's `contentContainerStyle`, or the height of a spacer.

```tsx title=Using an inset as content padding rather than view padding
import {FlatList, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

type Item = {id: string; label: string};

export function EdgeToEdgeList({items}: {items: Item[]}) {
  const insets = useSafeAreaInsets();

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.label}</Text>}
      // Padding on the content, not on the list: rows still scroll under the
      // status bar, which is what edge-to-edge is supposed to look like.
      contentContainerStyle={{paddingTop: insets.top, paddingBottom: insets.bottom}}
    />
  );
}

const styles = StyleSheet.create({row: {padding: 16}});
```

That distinction — inset the *content*, not the *container* — is what separates a screen that looks
designed from one that looks boxed in.

### The library's `SafeAreaView`

The component form takes two props the core one does not have:

- `edges` — which edges to apply. Either an array (`['top', 'bottom']`) or a record giving each
  edge a mode.
- `mode` — `'padding'` (default) or `'margin'`.

The record form's modes are `'off'`, `'additive'` and `'maximum'`. `'additive'` adds the inset on
top of whatever padding the style already has; `'maximum'` takes the larger of the two. `'maximum'`
is what you want when a design already specifies 16pt of bottom padding and the home indicator only
needs 34pt on some devices.

```tsx title=Choosing edges and modes
import {Text, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

export function TabScreen() {
  return (
    <SafeAreaView
      style={styles.host}
      // The tab bar already covers the bottom; only the top needs handling.
      edges={['top']}
      mode="padding">
      <Text>Screen content</Text>
    </SafeAreaView>
  );
}

export function Footer() {
  return (
    <SafeAreaView
      style={styles.footer}
      // 16pt of design padding, or the home indicator inset, whichever is larger.
      edges={{bottom: 'maximum'}}>
      <Text>Continue</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  footer: {padding: 16, backgroundColor: '#ffffff'},
});
```

### Reacting to inset changes without re-rendering

`useSafeAreaInsets` re-renders on every change. On a heavy screen, `SafeAreaListener` gives you a
callback instead, so you can write the value into an animated value or a ref without a React
render.

```tsx title=A listener instead of a hook
import {useRef} from 'react';
import {View} from 'react-native';
import {SafeAreaListener} from 'react-native-safe-area-context';
import type {EdgeInsets} from 'react-native-safe-area-context';

export function Tracked() {
  const latest = useRef<EdgeInsets>({top: 0, right: 0, bottom: 0, left: 0});

  return (
    <SafeAreaListener
      style={{flex: 1}}
      onChange={({insets}) => {
        // No re-render: useful when the value feeds an animation, not layout.
        latest.current = insets;
      }}>
      <View style={{flex: 1}} />
    </SafeAreaListener>
  );
}
```

There is also `SafeAreaInsetsContext` and `SafeAreaFrameContext` for class components, and a
`withSafeAreaInsets` higher-order component.

### The status bar in 0.87

`StatusBar` lost three props in 0.87, and they are exactly the ones most Android tutorials use:
`backgroundColor`, `translucent` and `networkActivityIndicatorVisible`, along with their imperative
setters.

> [!WARNING] Removed `StatusBar` props
> The status-bar background colour and translucency props no longer exist in 0.87. Code that sets
> them is now a type error, not a silent no-op. What remains is `barStyle`, `hidden`, `animated`
> and, on iOS, `showHideTransition`.
>
> Android status-bar colouring is now a native theme concern rather than a React prop — it belongs
> in the app's Android theme resources — and the edge-to-edge behaviour that the translucency prop
> used to switch on is the platform default on modern Android. Handle the resulting overlap with
> insets, which is what this page is about.

```tsx title=What StatusBar still does in 0.87
import {View, StatusBar, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function DarkHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, {paddingTop: insets.top}]}>
      {/* barStyle, hidden and animated are the surviving props. */}
      <StatusBar barStyle="light-content" animated />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {backgroundColor: '#0f172a', paddingHorizontal: 16, paddingBottom: 12},
});
```

`StatusBar.currentHeight` still exists and is still Android-only. Prefer `insets.top`: it accounts
for cutouts and for the case where the status bar is hidden, and it works on both platforms.

## Platform differences

:::tabs
@tab iOS
- The insets come from the window's `safeAreaInsets`. `top` covers the status bar and any notch or
  Dynamic Island; `bottom` covers the home indicator on devices that have one and is `0` on those
  that do not.
- In landscape on a notched device, `left` and `right` become non-zero. A landscape screen that
  only handles `top` and `bottom` will have content under the notch.
- Core `SafeAreaView` works here — this is the only platform where it does anything — but still
  pads all four edges unconditionally.
- Inside a [Modal](modal.md) the insets are available as normal, because the modal window is
  laid out in the same coordinate space.
@tab Android
- Core `SafeAreaView` is a plain `View` here. If a screen looks correct on iOS and has content
  under the status bar on Android, this is almost always why.
- `react-native-safe-area-context` reads the real window insets, so it works on both platforms —
  that is the main reason to use it.
- Display cutouts vary far more than on iOS: hole-punch cameras, curved edges, and gesture
  navigation versus three-button navigation give very different `bottom` values on the same phone.
  Test with gesture navigation switched off as well as on.
- `StatusBar.currentHeight` is Android-only and reports only the status bar, not cutouts.
- A [Modal](modal.md) that sets `statusBarTranslucent` or `navigationBarTranslucent` draws under
  the system bars, and then it is your job to apply the insets inside the modal.
:::

## Common patterns

### A custom header that respects the notch

```tsx title=src/components/Header.tsx
import {View, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function Header({title}: {title: string}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.host, {paddingTop: insets.top}]}>
      <View style={styles.bar}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {backgroundColor: '#ffffff'},
  // The bar's own height sits below the inset padding, so the header grows
  // taller on a notched device instead of squashing its content.
  bar: {height: 52, justifyContent: 'center', paddingHorizontal: 16},
  title: {fontSize: 17, fontWeight: '600'},
});
```

### A bottom action bar above the home indicator

```tsx title=src/components/ActionBar.tsx
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function ActionBar({onPress}: {onPress: () => void}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.host, {paddingBottom: Math.max(insets.bottom, 12)}]}>
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.button}>
        <Text style={styles.label}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  button: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  label: {color: '#ffffff', fontWeight: '600'},
});
```

`Math.max(insets.bottom, 12)` is the hand-written version of `edges={{bottom: 'maximum'}}`: a
device with no home indicator still gets 12pt of breathing room instead of none.

### Landscape, where `left` and `right` matter

```tsx title=Handling horizontal insets
import {View, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function LandscapeSafe() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.host,
        // Non-zero in landscape on a notched device; zero in portrait.
        {paddingLeft: insets.left + 16, paddingRight: insets.right + 16},
      ]}>
      <Text>Full-width content that clears the notch in landscape</Text>
    </View>
  );
}

const styles = StyleSheet.create({host: {flex: 1, paddingVertical: 16}});
```

### Testing it

There is no substitute for a device with a cutout. The checklist that catches most of it:

1. A notched iPhone in portrait and in landscape, both orientations of landscape.
2. An older iPhone with a home button, so you see `bottom: 0`.
3. An Android device with gesture navigation, then the same device with three-button navigation.
4. The status bar hidden, if any screen hides it.
5. A modal that draws under the system bars.

## Performance considerations

`useSafeAreaInsets` subscribes the component to inset changes. Those changes are rare — rotation,
keyboard, system bars — so the subscription itself costs nothing. What costs is calling it high in
the tree: a rotation then re-renders everything below.

Call it in the component that uses the value. If a deep component needs it, call it there rather
than threading it down from the root, so a rotation re-renders that component rather than the
screen.

`initialMetrics` matters more than it looks. Without it the first frame renders with zero insets
and then corrects itself, which is a visible jump on cold start — the kind of thing that reads as
"this app feels cheap" without the user being able to say why.

## Common mistakes

- **Using core `SafeAreaView` and testing only on iOS.** It does nothing on Android. The screen
  looks right on the simulator you were using and wrong on half your users' devices.
- **Padding both a container and its content.** A screen inside a navigator with a header, wrapped
  in a safe-area view, gets the top inset twice. Check what the navigator already applies.
- **Forgetting `left` and `right`.** They are zero in portrait, which is why this bug ships. Rotate
  a notched device and the content is under the notch.
- **Using `StatusBar.currentHeight` as the top inset.** It is Android-only, it ignores cutouts, and
  it is wrong when the status bar is hidden. Use `insets.top`.
- **Setting the removed `StatusBar` props.** The background-colour and translucency props were
  removed in 0.87. Android status-bar colour belongs in the theme; overlap belongs to insets.
- **Omitting `SafeAreaProvider`.** The hook has nothing to read from and the app crashes or reports
  zeros. It goes once, at the root, above the navigator.
- **Leaving out `initialMetrics`.** Cold start shows a frame with no insets and then snaps.
- **Assuming a safe-area view inside a `Modal` on Android is handled for you.** If the modal draws
  under the system bars you apply the insets yourself.

## Related topics

- [View](view.md) — padding, margin and the layout the insets feed into.
- [ScrollView](scrollview.md) — `contentInsetAdjustmentBehavior` and content padding.
- [Modal](modal.md) — modals that draw under the system bars.
- [KeyboardAvoidingView](keyboardavoidingview.md) — the other thing that changes the usable window.
- [Responsive and Tablet Layouts](../styling/responsive-layouts.md) — orientation changes that move the insets.
- [Headers](../navigation/headers.md) — what React Navigation already insets for you.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — checking a native library against 0.87.
