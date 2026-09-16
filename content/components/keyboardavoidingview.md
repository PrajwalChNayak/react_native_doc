---
title: KeyboardAvoidingView
description: Keeping inputs above the software keyboard — what each `behavior` actually does, why the right value differs by platform, and the Android manifest setting that changes everything.
status: current
toolchain: cli
---

`KeyboardAvoidingView` is a `View` that watches the keyboard and resizes, pads or shifts itself so
its contents stay visible. It has four props — `behavior`, `enabled`, `keyboardVerticalOffset` and
`contentContainerStyle` — and getting `behavior` wrong is the single most common cause of "the
keyboard covers my button" bugs.

It is also the component most likely to be unnecessary. On iOS a `ScrollView` with
`automaticallyAdjustKeyboardInsets` often does the job on its own, and on Android the activity's
`windowSoftInputMode` may already be resizing the window before React Native sees anything.

## Why it exists / when to use it — and when NOT to

Use it when a form has content that must stay on screen while the keyboard is up: the field being
typed into, the submit button, an autocomplete list.

Do **not** use it when:

- **The screen already scrolls and the platform already insets it.** Check what happens with no
  `KeyboardAvoidingView` at all before adding one. Two mechanisms fighting each other produces
  double padding and a jumping layout.
- **The content is a single centred field with plenty of room.** Nothing is covered; nothing needs
  avoiding.
- **The input is inside a [Modal](modal.md) and you put the `KeyboardAvoidingView` on the screen
  behind it.** A modal is a separate window. The avoiding view has to be inside the modal.
- **You need per-frame tracking of the keyboard animation.** This component reacts to the keyboard
  show/hide events. A toolbar that follows the keyboard frame exactly is a Reanimated job, or
  `InputAccessoryView` on iOS.

## Basic example

```tsx title=src/screens/LoginScreen.tsx
import {
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  Pressable,
  Text,
  Platform,
  StyleSheet,
} from 'react-native';

export function LoginScreen({onSubmit}: {onSubmit: () => void}) {
  return (
    <KeyboardAvoidingView
      style={styles.host}
      // The two platforms need different strategies. See below.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.content}
        // Lets the submit button work on the first tap while the keyboard is up.
        keyboardShouldPersistTaps="handled">
        <TextInput placeholder="Email" style={styles.input} autoComplete="email" />
        <TextInput placeholder="Password" style={styles.input} secureTextEntry />
        <Pressable onPress={onSubmit} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonLabel}>Sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  content: {flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12},
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  buttonLabel: {color: '#ffffff', fontWeight: '600'},
});
```

## How it works

The component subscribes to the keyboard events, measures the keyboard's frame, and applies one of
three strategies. The strategy is `behavior`, and it is **not** defaulted — with no `behavior` the
component renders as a plain `View` and does nothing.

### The three behaviors

| Value | What it changes | Works best when |
| --- | --- | --- |
| `'padding'` | Adds bottom padding equal to the keyboard height | The child fills the available space and can shrink — a `ScrollView`, or a flex column |
| `'height'` | Reduces the view's own height by the keyboard height | The child is laid out with flex and should compress |
| `'position'` | Wraps the children in an inner view and translates the whole thing upward | A fixed-size block that must move as a unit; styles the inner view with `contentContainerStyle` |

`'position'` is the one to be careful with. It moves everything, including content that was above
the fold, so the top of the screen can slide off. It is also the only behavior that uses
`contentContainerStyle` — that prop has no effect with `'padding'` or `'height'`.

### `keyboardVerticalOffset`

The component measures from the top of its own window. If something is drawn above it that it
cannot see — a navigation header, a status bar it does not account for — its maths is off by that
height, and the result is a gap under the keyboard or content still hidden behind it.

`keyboardVerticalOffset` is the correction, in points. With React Navigation the value is the
header height, which the navigation library can give you. Hard-coding it is a bug waiting for the
next device.

### `enabled`

`enabled` defaults to `true`. Set it to `false` to switch the behaviour off without changing the
tree — useful on a screen where only some states should avoid the keyboard, or to disable the whole
thing on one platform:

```tsx title=Disabling on one platform without changing the tree
import {KeyboardAvoidingView, TextInput, Platform, StyleSheet} from 'react-native';

export function MaybeAvoiding() {
  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior="padding"
      // Android's window resizing already handles this screen.
      enabled={Platform.OS === 'ios'}>
      <TextInput placeholder="Message" style={styles.input} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, justifyContent: 'flex-end'},
  input: {height: 48, borderWidth: 1, borderColor: '#cbd5e1', margin: 12, paddingHorizontal: 12},
});
```

### Refs

The ref type is `KeyboardAvoidingViewInstance`. It is a class component, and there is nothing
imperative worth calling on it — the interesting state is internal.

## Platform differences

This is the component where the platform difference is the whole story. The two systems deliver
keyboard information differently, and the same `behavior` value produces different results.

:::tabs
@tab iOS
The keyboard slides over the app's window; the window does not resize. React Native gets
`keyboardWillShow` and `keyboardWillHide` **before** the animation, along with its duration and
easing, so the avoiding view can animate in step with the keyboard.

- **`'padding'` is the usual choice.** It adds space underneath, the child `ScrollView` shrinks,
  and the animation matches the keyboard's.
- **`'position'`** works but can push the top of the screen out of view.
- **`'height'`** works and is less smooth than `'padding'` here, because shrinking a view's height
  re-lays-out its children mid-animation.
- **You may not need this component at all.** `automaticallyAdjustKeyboardInsets` on a
  [ScrollView](scrollview.md) makes the scroll view inset itself when the keyboard appears. For a
  scrolling form that is often the whole fix, with no `KeyboardAvoidingView` involved.
- **`InputAccessoryView`** is the iOS-only way to pin a toolbar directly above the keyboard. It
  tracks the keyboard exactly, which `KeyboardAvoidingView` does not.

```tsx title=The iOS-only alternative: let the ScrollView inset itself
import {ScrollView, TextInput, StyleSheet} from 'react-native';

export function IosForm() {
  return (
    <ScrollView
      // iOS-only, and often removes the need for KeyboardAvoidingView entirely.
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <TextInput placeholder="Subject" style={styles.input} />
      <TextInput placeholder="Body" style={styles.input} multiline />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {padding: 16, gap: 12},
  input: {borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12},
});
```
@tab Android
The activity's `android:windowSoftInputMode` decides what happens before React Native is involved,
and it changes which `behavior` makes sense. Check `android/app/src/main/AndroidManifest.xml`:

```xml title=android/app/src/main/AndroidManifest.xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize">
</activity>
```

- **`adjustResize`** — the system shrinks the window when the keyboard opens. Your root view is
  already smaller, so a `'height'` behavior composes with it correctly and `'padding'` tends to
  double-count, leaving a gap the size of the keyboard.
- **`adjustPan`** — the system scrolls the whole window up instead of resizing. The avoiding view
  then has much less to do, but you lose control of what stays visible.
- **`adjustNothing`** — the system does nothing and `KeyboardAvoidingView` is fully responsible.

Two further constraints:

- Android delivers only `keyboardDidShow` and `keyboardDidHide` — there is no "will" event and no
  animation duration, so the adjustment lands **after** the keyboard is up rather than alongside
  it. A small visible jump is normal.
- The 0.87 `Keyboard` type notes that on API levels below 30 the events are derived from observing
  layout changes, and that only works when `windowSoftInputMode` is `adjustResize` or `adjustPan`.
  With `adjustNothing` on an older device you may get no events at all.

If the app draws edge to edge, the window insets change what "the bottom of the screen" means; pair
this component with the inset values from [Safe Areas](safe-areas.md).
:::

The practical upshot is the conditional every React Native form ends up with:

```tsx title=The standard platform fork
import {KeyboardAvoidingView, Platform, ScrollView, TextInput, StyleSheet} from 'react-native';

export function Form() {
  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // Nothing is drawn above this view, so no correction is needed.
      keyboardVerticalOffset={0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput placeholder="Name" style={styles.input} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  content: {flexGrow: 1, padding: 16, gap: 12},
  input: {height: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12},
});
```

## Common patterns

### Correcting for a navigation header

```tsx title=Offsetting by the header height
import {KeyboardAvoidingView, ScrollView, TextInput, Platform, StyleSheet} from 'react-native';
import {useHeaderHeight} from '@react-navigation/elements';

export function ScreenWithHeader() {
  // Measured, not hard-coded: it varies by device, orientation and header options.
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput placeholder="Title" style={styles.input} />
        <TextInput placeholder="Notes" style={styles.input} multiline />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  content: {padding: 16, gap: 12},
  input: {minHeight: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12},
});
```

### A chat composer pinned above the keyboard

```tsx title=src/screens/ChatScreen.tsx
import {
  KeyboardAvoidingView,
  FlatList,
  View,
  TextInput,
  Text,
  Platform,
  StyleSheet,
} from 'react-native';

type Message = {id: string; body: string};

export function ChatScreen({messages}: {messages: Message[]}) {
  return (
    <KeyboardAvoidingView
      style={styles.host}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({item}) => <Text style={styles.message}>{item.body}</Text>}
        // Inverted so new messages sit at the bottom and the list grows upward.
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />
      <View style={styles.composer}>
        <TextInput placeholder="Message" style={styles.input} multiline />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  message: {padding: 12},
  composer: {borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 8},
  input: {maxHeight: 120, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f1f5f9'},
});
```

`keyboardDismissMode="interactive"` is iOS-only and behaves as `'none'` on Android; it is the
drag-down-to-dismiss gesture users expect in a chat.

### Inside a modal

```tsx title=A form inside a Modal needs its own avoiding view
import {Modal, KeyboardAvoidingView, View, TextInput, Platform, StyleSheet} from 'react-native';

export function EditModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* The screen's KeyboardAvoidingView is in a different window and does
          nothing for this content. */}
      <KeyboardAvoidingView
        style={styles.host}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <TextInput placeholder="Rename" autoFocus style={styles.input} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, justifyContent: 'center', backgroundColor: '#00000066'},
  card: {margin: 24, padding: 16, borderRadius: 12, backgroundColor: '#ffffff'},
  input: {height: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12},
});
```

## Performance considerations

The adjustment is a layout change on the whole subtree. On iOS it animates alongside the keyboard;
on Android it happens in one step after the keyboard is up. Either way, the deeper and heavier the
subtree inside the `KeyboardAvoidingView`, the more that layout pass costs — and it happens at the
exact moment the user is watching.

Keep the avoiding view as low in the tree as it can be. Wrapping the whole app in one so that a
single form works means re-laying-out the whole app every time the keyboard appears.

If the form is long, the `ScrollView` inside is doing the real work. Its children all mount
regardless; a form with fifty fields is a list, not a form, and belongs in a
[FlatList](flatlist.md).

## Common mistakes

- **Omitting `behavior`.** With no behavior the component is an ordinary `View`. Wrong:
  `<KeyboardAvoidingView style={{flex: 1}}>`. Right: add
  `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`.
- **Using `'padding'` on Android with `adjustResize`.** The window has already shrunk, so the
  padding is added on top of the shrink and you get a keyboard-sized gap.
- **No `flex: 1` on the `KeyboardAvoidingView`.** It sizes to its content, so there is nothing to
  shrink or pad and nothing appears to happen.
- **Hard-coding `keyboardVerticalOffset`.** A value tuned on one device is wrong on the next.
  Measure the header.
- **Using `contentContainerStyle` with `'padding'` or `'height'`.** It only applies to
  `'position'`. It is not an error; it is silently ignored.
- **Putting the avoiding view outside a `Modal`.** The modal is a separate window and is
  unaffected. Put one inside the modal.
- **Forgetting `keyboardShouldPersistTaps="handled"` on the inner `ScrollView`.** The first tap
  dismisses the keyboard and the button never fires, so the submit button appears to need two
  taps. Note that in 0.87 this prop no longer accepts a boolean — the values are `'never'`,
  `'always'` and `'handled'`.
- **Nesting two of them.** A screen-level one plus a component-level one apply their adjustments
  independently and the content jumps twice as far.

## Related topics

- [TextInput](textinput.md) — focus, submit behaviour and the keyboard itself.
- [ScrollView](scrollview.md) — `keyboardShouldPersistTaps`, `keyboardDismissMode` and `automaticallyAdjustKeyboardInsets`.
- [Modal](modal.md) — why modal forms need their own avoiding view.
- [Safe Areas](safe-areas.md) — insets that interact with keyboard padding on edge-to-edge Android.
- [Headers](../navigation/headers.md) — where the header height for `keyboardVerticalOffset` comes from.
- [Platform-Specific Styles](../styling/platform-specific-styles.md) — cleaner ways to write the platform fork.
