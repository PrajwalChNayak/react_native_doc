---
title: ActivityIndicator
description: The platform spinner — its four props, why a numeric size only works on one platform, and when a spinner is the wrong loading UI.
status: current
toolchain: cli
---

`ActivityIndicator` is the system spinner: a `UIActivityIndicatorView` on iOS, a circular
`ProgressBar` on Android. It has four props and no state of its own. It spins whenever it is
mounted and `animating` is true.

It is the smallest component in the core set, and the interesting questions about it are not about
its API — they are about when a spinner is the right thing to show at all.

## Why it exists / when to use it — and when NOT to

Use it for an indeterminate wait whose duration you cannot estimate: a network request in flight, a
form submitting, a page of a list loading.

Do **not** use it when:

- **You know the progress.** A determinate bar tells the user something; a spinner tells them
  nothing. There is no cross-platform progress bar in core — `ProgressBarAndroid` is Android-only —
  so a determinate bar is a styled `View` with a width you control.
- **The content has a known shape.** A skeleton placeholder that matches the layout reads as faster
  than a spinner, because the screen does not jump when content arrives.
- **The wait is under about 200ms.** A spinner that appears and vanishes is a flash of noise.
  Delay it, or do not show it.
- **The whole screen is blocked by it every time.** A full-screen spinner on every navigation makes
  an app feel slower than it is. Prefer keeping the previous content and showing the spinner
  in place.

## Basic example

```tsx title=src/components/LoadingBlock.tsx
import {View, Text, ActivityIndicator, StyleSheet} from 'react-native';

export function LoadingBlock({label}: {label: string}) {
  return (
    <View style={styles.host}>
      <ActivityIndicator size="large" />
      {/* The spinner itself is not announced usefully; the text is. */}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  label: {color: '#64748b'},
});
```

## How it works

### The four props

| Prop | Type | Notes |
| --- | --- | --- |
| `animating` | `boolean` | Whether it spins. Defaults to `true`, so an `ActivityIndicator` with no props is already spinning. |
| `color` | `ColorValue` | Foreground colour. Defaults to `'#999999'` on iOS and to the system accent colour on Android. |
| `size` | `'small' \| 'large' \| number` | `'small'` is 20pt tall, `'large'` is 36pt. A number is **Android-only**. |
| `hidesWhenStopped` | `boolean` | **iOS-only.** Whether the view disappears when `animating` is false. |

Everything else is inherited from `View`, so `style`, `accessibilityLabel` and the layout props all
work.

### `animating` versus conditional rendering

Two ways to stop showing a spinner, and they are not equivalent.

`animating={false}` keeps the view mounted. On iOS `hidesWhenStopped` defaults to `true`, so the
view becomes invisible but still occupies its layout space. On Android the stopped indicator
remains visible as a static circle, which is usually not what you want.

`{loading ? <ActivityIndicator /> : null}` removes it entirely and reclaims the space. That is the
more predictable option and the one to reach for by default. Use `animating` when you specifically
want the layout to stay stable — a fixed-height footer, for instance — and then set
`hidesWhenStopped` explicitly rather than relying on the per-platform default.

### Size

`'small'` and `'large'` are the platform sizes and the only values that work everywhere. A numeric
`size` type-checks on both platforms, because the type is `number | 'small' | 'large'`, but the
0.87 type definition marks the numeric form as Android-only. On iOS it is ignored and you get the
platform's own size.

If you need an exact size on both platforms, scale it:

```tsx title=A spinner at a size both platforms respect
import {ActivityIndicator, View, StyleSheet} from 'react-native';

export function BigSpinner() {
  return (
    <View style={styles.scaled}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  // A transform scales the rendered view on both platforms, unlike a numeric size.
  scaled: {transform: [{scale: 1.4}]},
});
```

### Accessibility

A spinner conveys "wait" visually and nothing at all to a screen reader — it has no text. Pair it
with a `Text`, or give the container an accessibility label and mark it as busy.

```tsx title=A spinner a screen reader can describe
import {View, ActivityIndicator, StyleSheet} from 'react-native';

export function BusyRegion({busy}: {busy: boolean}) {
  return (
    <View
      accessible
      accessibilityLabel="Loading results"
      accessibilityState={{busy}}
      style={styles.host}>
      {busy ? <ActivityIndicator /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {padding: 16, alignItems: 'center'},
});
```

## Platform differences

:::tabs
@tab iOS
- `hidesWhenStopped` applies here and defaults to `true`: with `animating={false}` the indicator
  becomes invisible but keeps its layout box.
- The default `color` is `'#999999'`, a fixed grey, so it does not follow the system accent colour
  or adapt to dark mode on its own. If you support dark mode, pass a colour.
- A numeric `size` has no effect. Only `'small'` and `'large'` do anything.
@tab Android
- `hidesWhenStopped` does nothing. With `animating={false}` the indicator stays visible and static.
  Conditionally render it instead.
- The default `color` is the system accent colour from the theme, so a spinner with no `color` prop
  already matches the app's Material theme.
- A numeric `size` works and sets the diameter in density-independent pixels.
- `ProgressBarAndroid` exists for determinate progress, and it is Android-only — there is no iOS
  counterpart in core.
:::

## Common patterns

### A button that shows its own progress

Keeping the spinner inside the button, at the button's own size, avoids a layout jump and keeps the
feedback next to the thing the user pressed.

```tsx title=src/components/SubmitButton.tsx
import {Pressable, Text, ActivityIndicator, StyleSheet} from 'react-native';

type Props = {label: string; busy: boolean; onPress: () => void};

export function SubmitButton({label, busy, onPress}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{disabled: busy, busy}}
      style={({pressed}) => [styles.button, pressed && styles.pressed]}>
      {busy ? (
        // 'small' keeps the button the same height as its text label.
        <ActivityIndicator size="small" color="#ffffff" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  pressed: {opacity: 0.85},
  label: {color: '#ffffff', fontWeight: '600'},
});
```

### A list footer while the next page loads

```tsx title=Paging spinner in a list footer
import {FlatList, ActivityIndicator, Text, View, StyleSheet} from 'react-native';

type Item = {id: string; label: string};

type Props = {items: Item[]; loadingMore: boolean; onEndReached: () => void};

export function PagedList({items, loadingMore, onEndReached}: Props) {
  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.label}</Text>}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator />
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {padding: 12},
  footer: {paddingVertical: 16, alignItems: 'center'},
});
```

### Not flashing for fast responses

```tsx title=src/components/DelayedSpinner.tsx
import {useEffect, useState} from 'react';
import {ActivityIndicator} from 'react-native';

type Props = {busy: boolean; delayMs?: number};

// Shows nothing for the first `delayMs`. A request that resolves in 80ms then
// never causes a visible flash of spinner.
export function DelayedSpinner({busy, delayMs = 250}: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [busy, delayMs]);

  return show ? <ActivityIndicator /> : null;
}
```

### An overlay that blocks interaction

```tsx title=A blocking overlay
import {View, ActivityIndicator, StyleSheet} from 'react-native';

export function BlockingOverlay({busy}: {busy: boolean}) {
  if (!busy) {
    return null;
  }
  return (
    <View style={styles.overlay} accessible accessibilityLabel="Working" accessibilityState={{busy: true}}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000066',
  },
});
```

Note `StyleSheet.absoluteFill` — `absoluteFillObject` is not part of the 0.87 Strict API surface.

## Performance considerations

An `ActivityIndicator` is one native view with a platform-driven animation. The animation runs
natively, not on the JS thread, so a spinner keeps spinning smoothly even while JS is busy — which
is exactly what you need, since JS is usually busy for the reason you are showing a spinner.

That also makes it a useful diagnostic. If the spinner stutters, the **UI thread** is blocked, not
the JS thread. That points at native work: image decoding, a heavy layout pass, or a synchronous
native module call.

The only real cost is mounting and unmounting it rapidly. A spinner that toggles on every keystroke
of a search box adds a mount/unmount per character; gate it behind a debounce.

## Common mistakes

- **Relying on `animating={false}` to hide it on Android.** `hidesWhenStopped` is iOS-only, so on
  Android you get a frozen circle. Wrong: `<ActivityIndicator animating={loading} />`. Right:
  `{loading ? <ActivityIndicator /> : null}`.
- **Passing a numeric `size` and expecting it on iOS.** It compiles and is ignored there. Use a
  `scale` transform if you need an exact size on both.
- **A spinner with no accompanying text.** It is invisible to screen readers. Add a `Text`, or an
  `accessibilityLabel` and `accessibilityState={{busy: true}}` on the container.
- **Showing it immediately for fast operations.** A 60ms flash of spinner looks like a glitch.
  Delay it by a couple of hundred milliseconds.
- **A full-screen spinner on every navigation.** It hides content the user already had and makes
  the app feel slower. Keep the old content and show progress in place.
- **Leaving `color` unset in dark mode on iOS.** The default is a fixed grey, not a theme colour.
  It will look wrong on one of the two themes.
- **Using it for determinate progress.** If you know the percentage, show it. A spinner discards
  information you already have.

## Related topics

- [View](view.md) — the container and overlay styles around it.
- [Pressable and Touchables](pressable-and-touchables.md) — buttons that show their own progress.
- [FlatList](flatlist.md) — footer spinners while paging.
- [RefreshControl](refreshcontrol.md) — the pull-to-refresh spinner, which is a different control.
- [Modal](modal.md) — blocking overlays presented as their own window.
- [Data Fetching and Caching](../state-and-data/data-fetching.md) — where the loading flag comes from.
- [Accessibility APIs](../platform-apis/accessibility.md) — announcing busy states.
