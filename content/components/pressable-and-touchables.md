---
title: Pressable and Touchables
description: The modern touch primitive, the four legacy Touchable wrappers, and how to pick between them without shipping a dead tap target.
status: current
toolchain: cli
---

`Pressable` is the component you wrap around anything that should respond to a tap. It renders a
[View](view.md), attaches the press-recogniser to it, and hands you the press state so you can
style the pressed appearance yourself.

The four `Touchable*` components predate it. They still ship in 0.87 and they still work, but each
one bakes in one fixed visual effect, and `Pressable` was added precisely because that set turned
out to be too narrow. Treat them as legacy-leaning: fine in existing code, not the thing you reach
for in new code.

## Why it exists / when to use it — and when NOT to

Use `Pressable` for buttons, list rows, chips, icon targets — anything where a tap does something.
It gives you `onPressIn`, `onPress`, `onPressOut`, `onLongPress` and `onPressMove`, plus a
`pressed` flag you can feed into styles, so the feedback is yours to define rather than the
component's.

Do **not** use it when:

- **The gesture is more than a tap.** Pans, pinches, swipe-to-delete and anything that must run on
  the UI thread during a drag belong to
  [Gesture Handler](../animation/gesture-handler.md), not to the JS responder system.
- **A platform control already exists.** A [Switch](switch.md) is a switch. Do not build one out of
  a `Pressable` and lose the platform's accessibility behaviour.
- **You want a plain, unstyled system button.** `Button` exists for that, at the cost of almost no
  styling control.

> [!WARNING] The undocumented `Touchable` root export is gone
> 0.87 removed the bare `Touchable` export from `react-native`. It was never documented and it was
> never meant to be imported. `TouchableOpacity`, `TouchableHighlight`,
> `TouchableNativeFeedback` and `TouchableWithoutFeedback` are all still exported.

## Basic example

```tsx title=src/components/Button.tsx
import {Pressable, Text, StyleSheet} from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function Button({label, onPress, disabled = false}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // Without a role the screen reader announces this as plain text.
      accessibilityRole="button"
      accessibilityState={{disabled}}
      // Grows the touch area without moving anything in the layout.
      hitSlop={8}
      style={({pressed}) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  pressed: {backgroundColor: '#1d4ed8'},
  disabled: {backgroundColor: '#94a3b8'},
  label: {color: '#ffffff', fontSize: 16, fontWeight: '600'},
});
```

## How it works

### `style` and `children` can both be functions

Both accept a callback that receives `{pressed: boolean}`. The style callback is the normal way to
render feedback. The children callback is for when the *content* changes — a label that swaps, an
icon that fills in.

```tsx title=Children as a function of press state
import {Pressable, Text} from 'react-native';

export function SaveToggle({onPress}: {onPress: () => void}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({pressed}) => <Text>{pressed ? 'Saving…' : 'Save'}</Text>}
    </Pressable>
  );
}
```

The flag flips on press-in and back on press-out, so it is genuinely "is a finger down right now",
not "was this tapped".

### The press lifecycle, and why `onPress` sometimes never fires

A press moves through `onPressIn` → (`onPressMove` while the finger travels) → `onPressOut` →
`onPress`. `onPress` fires **after** `onPressOut`, and only if the gesture was not cancelled.

Two things cancel it. A scroll ancestor can steal the responder mid-gesture — that is what
`cancelable` controls, and it defaults to `true` so that a press started during a scroll does not
fight the scroll. And the finger can travel outside the retention area, which is
`pressRetentionOffset` (default `{top: 20, left: 20, right: 20, bottom: 30}`) measured outward from
the view plus its `hitSlop`.

`delayLongPress` (default 500ms) decides when `onLongPress` replaces `onPress`.

### `hitSlop` versus `pressRetentionOffset`

They sound similar and solve different problems. `hitSlop` grows the area where a press can
**start**. `pressRetentionOffset` grows the area the finger may wander into before the press is
**abandoned**. A 24pt icon usually wants both: `hitSlop` so it can be hit at all, retention offset
so a slightly sloppy tap still counts.

Neither extends past the parent's bounds. If the icon is flush against the edge of a tight
container, give the container room instead.

### `unstable_pressDelay`

`unstable_pressDelay` is how long to wait after touch-down before `onPressIn` runs. Set it to a
small value (around 50–100ms) inside a scrollable list so a row does not flash highlighted the
instant a scroll begins. It is prefixed `unstable_` in the 0.87 types; treat the name as
provisional.

Note that `Pressable` has no `delayPressOut`. The `Touchable*` components do — that is one of the
small API differences between the two families.

### Refs

Under the Strict TypeScript API `Pressable`'s ref type is `PressableInstance`. It is an alias for
the generic host type, so the usual `measure` / `measureInWindow` / `focus` methods are there.

```tsx title=Measuring a Pressable
import {useRef, useCallback} from 'react';
import {Pressable, Text} from 'react-native';
import type {PressableInstance} from 'react-native';

export function MeasuredButton() {
  const ref = useRef<PressableInstance | null>(null);

  const showAnchor = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      console.log('anchor a popover at', {x, y, width, height});
    });
  }, []);

  return (
    <Pressable ref={ref} onPress={showAnchor} accessibilityRole="button">
      <Text>Open menu</Text>
    </Pressable>
  );
}
```

## Platform differences

The visual language of a press differs, and `Pressable` does not paper over it. On iOS the
convention is an opacity or colour change you provide. On Android the convention is a ripple, which
is drawn natively.

:::tabs
@tab iOS
There is no `ios_ripple`. Style the pressed state yourself through the `style` callback — a
background change, an opacity change, or a scale transform.

```tsx title=iOS-style press feedback
import {Pressable, Text, StyleSheet} from 'react-native';

export function Row({title, onPress}: {title: string; onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <Text>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {padding: 16, backgroundColor: '#ffffff'},
  rowPressed: {backgroundColor: '#f1f5f9'},
});
```
@tab Android
`android_ripple` configures the native ripple: `color`, `borderless`, `radius`, `foreground` and
`alpha`. `borderless: true` lets the ripple spill past the view's bounds, which is what you want
for a circular icon button. `foreground: true` draws the ripple over the child instead of behind
it — necessary when the child paints its own opaque background, otherwise the ripple is invisible.

`android_disableSound` suppresses the system click sound.

```tsx title=Android ripple on an icon button
import {Pressable, Text, StyleSheet} from 'react-native';

export function IconButton({onPress}: {onPress: () => void}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      android_ripple={{color: '#00000022', borderless: true, radius: 24}}
      style={styles.icon}>
      <Text>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
});
```
:::

Passing `android_ripple` on iOS is harmless — it is ignored — so a single component can carry both
the ripple config and a `style` callback and look right on each platform.

## Common patterns

### One button that looks native on both platforms

```tsx title=src/components/PlatformButton.tsx
import {Pressable, Text, Platform, StyleSheet} from 'react-native';

type Props = {label: string; onPress: () => void};

export function PlatformButton({label, onPress}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{color: '#ffffff33'}}
      style={({pressed}) => [
        styles.base,
        // Android draws its own ripple, so only dim on iOS.
        pressed && Platform.OS === 'ios' ? styles.pressed : null,
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    overflow: 'hidden', // clips the Android ripple to the rounded corners
    backgroundColor: '#2563eb',
  },
  pressed: {opacity: 0.75},
  label: {color: '#ffffff', fontWeight: '600'},
});
```

`overflow: 'hidden'` matters on Android: without it the ripple is a rectangle drawn over your
rounded corners.

### A list row that does not fight the scroll

```tsx title=A pressable row inside a list
import {Pressable, Text, StyleSheet} from 'react-native';

type Props = {id: string; title: string; onSelect: (id: string) => void};

export function ListRow({id, title, onSelect}: Props) {
  return (
    <Pressable
      // Wait a beat before highlighting so a scroll does not flash the row.
      unstable_pressDelay={80}
      onPress={() => onSelect(id)}
      android_ripple={{color: '#00000011'}}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <Text>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {paddingVertical: 14, paddingHorizontal: 16},
  pressed: {backgroundColor: '#f1f5f9'},
});
```

### Choosing among the legacy wrappers

| Component | What it does | Where it still makes sense |
| --- | --- | --- |
| `TouchableOpacity` | Fades the child to `activeOpacity` (default `0.2`) by wrapping it in an `Animated.View` | Existing code. The extra animated view is a real view in the tree. |
| `TouchableHighlight` | Shows `underlayColor` behind the child at `activeOpacity` (default `0.85`); fires `onShowUnderlay` / `onHideUnderlay` | Rows that want a solid highlight. Requires **exactly one** child. |
| `TouchableNativeFeedback` | Android-only native ripple via `background` | Android-only code that needs `TouchableNativeFeedback.Ripple(...)` or `SelectableBackground()` |
| `TouchableWithoutFeedback` | No visual feedback at all | Dismissing a keyboard or an overlay by tapping the backdrop — the one case where "no feedback" is correct |

All four take `delayPressIn`, `delayPressOut` and `delayLongPress`, and all four route through the
same press-recogniser as `Pressable`.

```tsx title=A legacy TouchableOpacity, for reference
import {TouchableOpacity, Text, StyleSheet} from 'react-native';

export function LegacyButton({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      style={styles.button}>
      <Text>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {padding: 12, alignItems: 'center'},
});
```

The equivalent `Pressable` is the same component with `style={({pressed}) => [styles.button,
pressed && {opacity: 0.6}]}` and no wrapper view added to the tree.

### Dismissing the keyboard by tapping the background

This is the legitimate use of `TouchableWithoutFeedback`: a full-screen backdrop that must not look
like a button.

```tsx title=Tap-to-dismiss backdrop
import {TouchableWithoutFeedback, Keyboard, View, TextInput} from 'react-native';

export function Form() {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{flex: 1, padding: 16}}>
        <TextInput placeholder="Email" />
      </View>
    </TouchableWithoutFeedback>
  );
}
```

`accessible={false}` keeps the whole screen from being announced as one giant control.

## Performance considerations

**A press handler that changes state re-renders the subtree.** `onPressIn`/`onPressOut` fire on
every touch. If they call `setState`, every touch causes a React render. The `style` callback does
not — it is evaluated by `Pressable` itself without re-rendering your component — so prefer it over
hand-rolling `const [pressed, setPressed] = useState(false)`.

**Inline arrow props defeat memoisation.** `onPress={() => onSelect(id)}` is a fresh function every
render. In a list of 500 rows on a memoised row component this makes the memo useless. Pass `id`
into the row and build the handler inside it, or hoist it with `useCallback`.

**Every `Touchable*` adds a view; `Pressable` does not.** `TouchableOpacity` wraps its children in
an `Animated.View`, and `TouchableHighlight` wraps them in a plain `View` to paint the underlay.
`Pressable` attaches handlers to a single `View`. Across a long list that difference is thousands
of native views.

**`android_ripple` is drawn natively.** It costs nothing on the JS thread, unlike an opacity change
driven from JS. On Android it is the cheaper feedback as well as the more native-looking one.

## Common mistakes

- **Forgetting `accessibilityRole="button"`.** A `Pressable` is a `View` as far as the
  accessibility tree is concerned. Without the role, VoiceOver and TalkBack announce the label but
  give no hint that it is actionable, and the "double-tap to activate" affordance is missing.
- **Touch targets smaller than 44pt.** A 20pt icon is a 20pt target. Use `hitSlop`, not padding —
  padding shifts everything around it. Both platforms' guidelines land near 44pt / 48dp.
- **Using `disabled` without telling assistive tech.** `disabled` stops the press but does not set
  the accessibility state. Wrong: `<Pressable disabled={busy}>`. Right:
  `<Pressable disabled={busy} accessibilityState={{disabled: busy}}>`.
- **Expecting `onPress` after a scroll steals the gesture.** With `cancelable` left at its default,
  a press that begins and then turns into a scroll never calls `onPress`. Put analytics and side
  effects in `onPress`, never in `onPressIn`, or you will log taps that never happened.
- **Giving `TouchableHighlight` more than one child.** It wraps its child to paint the underlay and
  accepts exactly one. Wrap several children in a `View` first.
- **Reaching for `TouchableNativeFeedback` in shared code.** It is Android-only. On iOS you need a
  different component, which means a `Platform.OS` fork. `Pressable` with `android_ripple` covers
  both in one component.
- **Setting a background on the child and wondering where the ripple went.** An opaque child hides
  a background ripple. Pass `android_ripple={{foreground: true}}` so it draws on top.

## Related topics

- [View](view.md) — what `Pressable` renders, and where `hitSlop` and `pointerEvents` come from.
- [Text](text.md) — the label inside the button.
- [FlatList](flatlist.md) — where press delay and memoised handlers start to matter.
- [Modal](modal.md) — a backdrop that needs a press handler.
- [Gesture Handler](../animation/gesture-handler.md) — for anything richer than a tap.
- [Accessibility APIs](../platform-apis/accessibility.md) — roles, states and announcements in full.
- [Render Performance](../performance/render-performance.md) — why inline handlers break memoisation.
