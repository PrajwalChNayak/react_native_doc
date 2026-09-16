---
title: Modal
description: The core overlay component — how it presents on each platform, why onRequestClose is not optional, and what 0.87 removed from its prop list.
status: current
toolchain: cli
---

`Modal` presents its children in a native window above the rest of the app. It is not a styled
`View` with a high `zIndex`; on both platforms it is a separate presentation layer, which is why it
escapes parent clipping, parent transforms and the navigation header.

That separateness is also its main limitation. A `Modal` is outside your navigation tree, so the
back stack, deep links and the hardware back button do not know about it unless you wire them up.

## Why it exists / when to use it — and when NOT to

Use `Modal` for something short-lived and self-contained that must sit above everything: a
confirmation, a picker, a bottom sheet, a full-screen media viewer.

Do **not** use it when:

- **The overlay is a screen.** If the user can navigate within it, or should be able to reach it by
  a link, or expects the back gesture to return from it, it belongs in the navigator as a modal
  screen. See [Modals](../navigation/modals.md) in the navigation section.
- **You need a simple alert.** `Alert.alert()` gives you the real system dialog, with the platform's
  own button layout and accessibility behaviour, for one line of code.
- **You want a tooltip or popover anchored to a control.** A `Modal` is a full-window layer.
  Measure the anchor and render an absolutely positioned overlay instead.

> [!WARNING] The `animated` prop was removed in 0.87
> Older code sets a boolean prop named `animated` on this component. It no longer exists, and it
> is not a type error that shows up as a crash — the animation just never happens. The replacement
> is `animationType`, which takes `'none'` (the default), `'slide'` or `'fade'`.

## Basic example

```tsx title=src/components/ConfirmDialog.tsx
import {Modal, View, Text, Pressable, StyleSheet} from 'react-native';

type Props = {
  visible: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({visible, message, onConfirm, onCancel}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      // Required on Android: this is the hardware back button. Without it the
      // back button does nothing and the user is trapped.
      onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} accessibilityRole="button">
              <Text style={styles.confirm}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000080',
  },
  card: {
    width: '80%',
    padding: 20,
    borderRadius: 14,
    gap: 16,
    backgroundColor: '#ffffff',
  },
  message: {fontSize: 16},
  buttons: {flexDirection: 'row', justifyContent: 'flex-end', gap: 20},
  cancel: {color: '#64748b', fontWeight: '600'},
  confirm: {color: '#2563eb', fontWeight: '600'},
});
```

## How it works

### `visible` is the only control

There is no `show()` or `hide()`. `Modal` is declarative: render it with `visible={false}` and it
is not presented; flip the prop and it is. Keeping it mounted with `visible={false}` costs almost
nothing, and it is simpler than conditionally rendering the whole element.

### `onRequestClose` is not optional in practice

The type marks it optional, but the prop's own documentation says it is required on Android and on
TV. It fires when the user presses the Android hardware back button, presses the menu button on TV,
or dismisses an iOS modal by dragging when `allowSwipeDismissal` is on.

Omitting it produces a modal the Android back button cannot dismiss. That reads to a user as a
frozen app.

### `transparent` and `backdropColor`

`transparent` decides whether the modal's window has a background at all. With `transparent={false}`
(the default) the window is opaque and `backdropColor` controls its colour, defaulting to white.
With `transparent={true}` the window has no background of its own, `backdropColor` is ignored, and
any dimming is a `View` you render yourself.

Almost every custom dialog and bottom sheet wants `transparent` plus a full-screen semi-opaque
`View`, as in the example above.

### The lifecycle callbacks differ per platform

`onShow` fires on both platforms once the modal is presented. `onDismiss` is **iOS-only** and fires
after it has gone away — it is the hook for cleanup that must not run until the animation finishes,
such as presenting a second modal.

That last case is a real constraint on iOS: you cannot present a modal while another is still
dismissing. Chaining two modals means waiting for `onDismiss` rather than flipping both booleans in
the same tick.

### Refs

The ref type is `ModalInstance`. There is also a `modalRef` prop in the 0.87 type definition, which
is the same thing passed as a prop rather than through `ref`.

```tsx title=Taking a ref to a Modal
import {useRef} from 'react';
import {Modal, View, Text} from 'react-native';
import type {ModalInstance} from 'react-native';

export function MeasuredModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const modalRef = useRef<ModalInstance | null>(null);

  return (
    <Modal ref={modalRef} visible={visible} animationType="slide" onRequestClose={onClose}>
      <View>
        <Text>Content</Text>
      </View>
    </Modal>
  );
}
```

## Platform differences

This is one of the components where the platforms genuinely diverge, and the divergence is in the
presentation model rather than in styling.

:::tabs
@tab iOS
`presentationStyle` decides how the modal is presented:

| Value | Behaviour |
| --- | --- |
| `'fullScreen'` | Covers the whole screen. The default when `transparent` is `false`. |
| `'pageSheet'` | The card that leaves the previous screen visible behind and above it. Dismissible by dragging down. |
| `'formSheet'` | A centred, smaller sheet. On iPhone it behaves much like `pageSheet`. |
| `'overFullScreen'` | Covers the screen but lets the content underneath show through where your content is transparent. The default when `transparent` is `true`. |

Other iOS-only props:

- `supportedOrientations` — which orientations the modal may rotate to, defaulting to
  `['portrait']`. It is still bounded by `UISupportedInterfaceOrientations` in `Info.plist`; the
  prop cannot widen what the app itself allows.
- `onOrientationChange` — fires on rotation and also on the initial render.
- `allowSwipeDismissal` — lets the user drag the modal down to dismiss it. It requires
  `onRequestClose`, because that is the callback the gesture triggers.
- `onDismiss` — fires after dismissal completes.

```tsx title=An iOS page sheet
import {Modal, View, Text, StyleSheet} from 'react-native';

export function DetailSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      onDismiss={() => {
        // Safe place to present a second modal, or to release resources.
      }}>
      <View style={styles.body}>
        <Text>Details</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({body: {flex: 1, padding: 16}});
```
@tab Android
There is no `presentationStyle`. A modal is a window over the activity, and the three Android-only
props control how that window relates to the system bars:

- `statusBarTranslucent` — lets the modal draw under the status bar. Default `false`, so by default
  the modal starts below it.
- `navigationBarTranslucent` — lets it draw under the navigation bar. It requires
  `statusBarTranslucent` to be `true` as well.
- `hardwareAccelerated` — forces hardware acceleration on the underlying window. Default `false`.

If you set either translucent prop, you own the insets: content will otherwise sit underneath the
status bar. Pad with the values from [Safe Areas](safe-areas.md).

```tsx title=A full-bleed Android modal that handles its own insets
import {Modal, View, Text, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function FullBleedModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={[styles.body, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
        <Text>Edge to edge</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({body: {flex: 1, backgroundColor: '#0f172a'}});
```

The hardware back button routes to `onRequestClose`. It does **not** pop your navigator while a
modal is open, so if you also handle back elsewhere, make sure the modal wins.
:::

## Common patterns

### A bottom sheet

```tsx title=src/components/BottomSheet.tsx
import type {ReactNode} from 'react';
import {Modal, View, Pressable, StyleSheet} from 'react-native';

type Props = {visible: boolean; onClose: () => void; children: ReactNode};

export function BottomSheet({visible, onClose, children}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      {/* The backdrop is a sibling, not a parent, so a tap on the sheet
          itself does not bubble up and close it. */}
      <View style={styles.host}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066'},
  sheet: {
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#ffffff',
  },
});
```

`StyleSheet.absoluteFill` is the ready-made "cover the parent" style. Note that
`StyleSheet.absoluteFillObject` is **not** part of the 0.87 Strict API surface — reaching for it is
a compile error.

### A form inside a modal

A modal is its own window, so the keyboard-avoidance you set up on the screen behind it does not
apply. Put a [KeyboardAvoidingView](keyboardavoidingview.md) inside the modal.

```tsx title=Keyboard handling inside a modal
import {Modal, KeyboardAvoidingView, TextInput, View, Platform, StyleSheet} from 'react-native';

export function EditNameModal({visible, onClose}: {visible: boolean; onClose: () => void}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.host}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <TextInput placeholder="Name" autoFocus style={styles.input} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1, justifyContent: 'center', backgroundColor: '#00000066'},
  card: {margin: 24, padding: 16, borderRadius: 12, backgroundColor: '#ffffff'},
  input: {height: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12},
});
```

### Chaining two modals on iOS

```tsx title=Waiting for onDismiss before presenting the next modal
import {useState, useCallback} from 'react';
import {Modal, View, Text, Pressable} from 'react-native';

export function TwoStepFlow() {
  const [first, setFirst] = useState(false);
  const [wantsSecond, setWantsSecond] = useState(false);
  const [second, setSecond] = useState(false);

  // iOS refuses to present a modal while another is dismissing, so the second
  // one is opened from onDismiss rather than in the same tick as the close.
  const handleFirstDismissed = useCallback(() => {
    if (wantsSecond) {
      setWantsSecond(false);
      setSecond(true);
    }
  }, [wantsSecond]);

  return (
    <View>
      <Pressable onPress={() => setFirst(true)}>
        <Text>Start</Text>
      </Pressable>

      <Modal
        visible={first}
        animationType="slide"
        onRequestClose={() => setFirst(false)}
        onDismiss={handleFirstDismissed}>
        <Pressable
          onPress={() => {
            setWantsSecond(true);
            setFirst(false);
          }}>
          <Text>Next</Text>
        </Pressable>
      </Modal>

      <Modal visible={second} animationType="slide" onRequestClose={() => setSecond(false)}>
        <Text>Second</Text>
      </Modal>
    </View>
  );
}
```

## Performance considerations

**A mounted, invisible `Modal` still renders its children.** `visible={false}` hides the window; it
does not stop React from rendering what is inside. If the content is expensive — a list, a map, a
video — gate it: `{visible ? <Expensive /> : null}` inside the modal.

**Each `Modal` is a native window.** Several mounted at once on Android is several windows. Prefer
one modal whose content switches to five modals whose `visible` flags switch.

**The entrance animation competes with mounting.** Opening a modal that mounts a heavy tree at the
same moment produces a stuttering slide. Render the shell first and fill it in an effect, or
pre-mount the content while the modal is hidden.

## Common mistakes

- **Leaving out `onRequestClose`.** On Android the back button then does nothing. Wrong:
  `visible={open}` alone. Right: `visible={open} onRequestClose={close}`.
- **Still setting the removed `animated` prop.** It was removed in 0.87. Use `animationType`.
- **Wrapping the sheet in the backdrop `Pressable`.** If the backdrop is the parent, a tap anywhere
  inside the sheet bubbles up and closes it. Make the backdrop an absolutely positioned sibling.
- **Expecting `presentationStyle` to do anything on Android.** It is iOS-only. An Android modal is
  always a full window; the equivalent knobs are `statusBarTranslucent` and
  `navigationBarTranslucent`.
- **Opening a second modal in the same tick as closing the first, on iOS.** The second never
  appears. Wait for `onDismiss`.
- **Assuming the screen's `KeyboardAvoidingView` covers modal content.** It does not — the modal is
  a different window. Add one inside.
- **Putting navigation inside a modal.** The back gesture, deep links and the navigator's state are
  all outside it. Use a modal screen in the navigator instead.
- **Reaching for `StyleSheet.absoluteFillObject`.** Only `StyleSheet.absoluteFill` exists in the
  0.87 Strict API.

## Related topics

- [View](view.md) — the backdrop and card are ordinary views.
- [Pressable and Touchables](pressable-and-touchables.md) — dismiss-on-backdrop-tap.
- [KeyboardAvoidingView](keyboardavoidingview.md) — modal forms need their own instance.
- [Safe Areas](safe-areas.md) — insets when a modal draws under the system bars.
- [Modals](../navigation/modals.md) — when the overlay should be a route instead.
- [Accessibility APIs](../platform-apis/accessibility.md) — `accessibilityViewIsModal` and focus trapping.
