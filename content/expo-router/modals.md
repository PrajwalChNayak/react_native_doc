---
title: Modals
description: Presenting routes as modals and form sheets in Expo Router 57 — presentation options, sheet detents, dismissing, deep-linked modals, web behaviour, and guarding unsaved changes.
status: current
toolchain: expo
sdk: 57
---

A modal in Expo Router is an ordinary route presented differently. You create a file, and in the
stack that owns it you set `presentation` in its screen options. There is no separate modal API,
which means a modal has a URL, can be deep-linked, and is dismissed with the same `router` methods
as any other stacked screen.

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{title: 'Home'}} />
      <Stack.Screen name="compose" options={{presentation: 'modal', title: 'New post'}} />
    </Stack>
  );
}
```

## Why it exists / when to use it — and when NOT to

A modal says "finish or abandon this, then return to exactly where you were". Composing a message,
picking a filter, confirming a purchase.

Use a route-based modal when the content is a destination: it has its own state, may be linked to,
and should survive a reload on web.

Do **not** use one for:

- **A transient confirmation.** An `Alert` is lighter and does not add a history entry.
- **A tooltip, popover or in-screen menu.** Those are views, not routes.
- **Content that must stay on top while the user navigates elsewhere.** A modal is part of the
  stack; navigating away from it dismisses or covers it.

React Native's own `Modal` component still exists and is appropriate for view-level overlays that
do not deserve a URL. The route-based modal is the right choice when they do.

## Basic example

```text
src/app/
├── _layout.tsx      # Stack — declares compose as a modal
├── index.tsx        # "/"
└── compose.tsx      # "/compose", presented modally
```

```tsx title=src/app/index.tsx
import {Link} from 'expo-router';
import {View} from 'react-native';

export default function Home() {
  return (
    <View>
      <Link href="/compose">Write a post</Link>
    </View>
  );
}
```

```tsx title=src/app/compose.tsx
import {router} from 'expo-router';
import {Button, StyleSheet, TextInput, View} from 'react-native';

export default function Compose() {
  return (
    <View style={styles.container}>
      <TextInput placeholder="What's happening?" style={styles.input} multiline />
      {/* dismiss() pops the modal; back() would too, but dismiss states the intent. */}
      <Button title="Cancel" onPress={() => router.dismiss()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16, gap: 12},
  input: {minHeight: 120, borderWidth: StyleSheet.hairlineWidth, padding: 8},
});
```

## How it works

### `presentation` values

`presentation` is a native stack option. The installed types allow `card` (the default push) and
the `react-native-screens` presentations:

| Value | Behaviour |
| --- | --- |
| `modal` | the platform's standard modal |
| `transparentModal` | modal whose background shows the previous screen |
| `containedModal` / `containedTransparentModal` | presented within the current context rather than full-window |
| `fullScreenModal` | covers the whole screen; no swipe-to-dismiss on iOS |
| `formSheet` | a sheet with detents |
| `pageSheet` | iOS page sheet |

### Form sheets and detents

A form sheet stops at heights you choose. `sheetAllowedDetents` takes fractions of the screen
height, or `'fitToContents'`:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="filters"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.4, 1],
          // Index into sheetAllowedDetents, or 'last'.
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: 16,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
```

The Expo documentation lists two constraints worth designing around: Android supports at most
three detents, and headers and nested navigators are not supported inside a form sheet.

### Dismissing

| Call | Effect in a modal |
| --- | --- |
| `router.dismiss()` | pops the modal |
| `router.dismiss(2)` | pops two screens — useful for a two-step modal flow |
| `router.dismissTo('/')` | pops until `/` is on top |
| `router.dismissAll()` | returns to the first screen of the closest stack |
| `router.back()` | the same as `dismiss()` when the modal is on top |
| `router.canDismiss()` | whether there is anything to dismiss |

### A modal with its own stack

When a modal flow has several steps, give it a directory with its own `Stack`, and present the
directory:

```text
src/app/
├── _layout.tsx          # root Stack — presents "checkout" modally
├── index.tsx
└── checkout/
    ├── _layout.tsx      # inner Stack — the steps
    ├── index.tsx        # "/checkout"
    └── payment.tsx      # "/checkout/payment"
```

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" />
      <Stack.Screen name="checkout" options={{presentation: 'modal', headerShown: false}} />
    </Stack>
  );
}
```

Pushing `/checkout/payment` from inside the modal stays inside it. `router.dismissAll()` from the
payment step returns to `/checkout`; `router.dismissTo('/')` closes the whole modal. Do not use
`formSheet` for this shape — nested navigators are not supported inside a sheet.

### Deep-linking straight into a modal

A cold-start deep link to `/compose` renders the modal with nothing underneath, so dismissing it
leaves an empty screen. Give the owning layout an anchor:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export const unstable_settings = {
  // Rendered beneath a modal that was opened directly by URL.
  anchor: 'index',
};

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" />
      <Stack.Screen name="compose" options={{presentation: 'modal'}} />
    </Stack>
  );
}
```

## Platform differences

:::tabs
@tab iOS
- `modal` slides up from the bottom as a card and is dismissed by swiping down.
- `fullScreenModal` disables the swipe; you must supply a close control.
- `formSheet` and `pageSheet` are real UIKit sheets, and `sheetAllowedDetents` maps to UIKit
  detents.
@tab Android
- `modal` is presented above the current screen and dismissed with the system back button. There
  is no swipe-down gesture by default.
- `formSheet` supports at most three detents.
- Edge-to-edge is on by default in SDK 57, so modal content must handle the status-bar and
  navigation-bar insets itself.
@tab Web
- A modal route is rendered as a separate page-like route. The Expo documentation notes that it
  needs an explicit dismiss control, because there is no gesture.
- A reload keeps the user on the modal's URL, which is correct but means the modal must be able to
  render with nothing beneath it.
:::

## Common patterns

### A dismiss control that works on every platform

```tsx title=src/components/close-button.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export function CloseButton() {
  // After a cold-start deep link there may be nothing to dismiss to.
  if (!router.canDismiss()) {
    return <Button title="Close" onPress={() => router.replace('/')} />;
  }
  return <Button title="Close" onPress={() => router.dismiss()} />;
}
```

### Guarding unsaved changes

The swipe-down gesture and the Android back button dismiss a modal without calling your code.
`usePreventRemove`, exported from `expo-router/react-navigation`, intercepts every removal path:

```tsx title=src/app/compose.tsx
import {useNavigation} from 'expo-router';
import {usePreventRemove} from 'expo-router/react-navigation';
import {useState} from 'react';
import {Alert, TextInput, View} from 'react-native';

export default function Compose() {
  const navigation = useNavigation();
  const [text, setText] = useState('');
  const dirty = text.length > 0;

  usePreventRemove(dirty, ({data}) => {
    Alert.alert('Discard post?', 'Your draft will be lost.', [
      {text: 'Keep editing', style: 'cancel'},
      // Re-dispatch the exact action the user attempted (swipe, back, dismiss).
      // Calling router.dismiss() here would be intercepted again while `dirty` is true.
      {text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action)},
    ]);
  });

  return (
    <View>
      <TextInput value={text} onChangeText={setText} placeholder="Write something" />
    </View>
  );
}
```

`fullScreenModal` plus an explicit close button is the blunter alternative, at the cost of the
gesture users expect on iOS.

### Returning a result from a modal

Params flow into a modal, not out of it. Write the result somewhere the presenting screen already
reads — a store or context in a layout — then dismiss. Encoding the result into a `dismissTo` URL
works, but puts user data into the history and, on web, the address bar.

## Performance considerations

- **The presenting screen stays mounted** under a modal. Anything it is polling or animating keeps
  running; use `useFocusEffect` for work that should pause.
- **`transparentModal` keeps the previous screen visible and drawing.** Heavy screens underneath a
  transparent modal cost frames during the presentation animation.
- **`fitToContents` measures the content.** A sheet whose content height changes repeatedly
  re-lays out the sheet; prefer fixed detents for dynamic content.

## Common mistakes

- **Declaring `presentation` inside the modal's own file only.** Options rendered from the screen
  are applied when that screen renders, which is too late to reliably choose how it is presented.
  Set `presentation` in the layout's `Stack.Screen`, where it is known before navigation.
- **Putting a modal route inside a tabs directory.** A `Tabs` navigator has no `presentation`
  option. Put modal routes in a directory whose layout is a `Stack`.
- **Nesting a navigator inside a `formSheet`.** Not supported. Use `modal` for multi-step flows.
- **Using `fullScreenModal` without a close control.** On iOS there is no gesture, and on web no
  gesture at all.
- **Relying on an `onPress` to catch dismissal.** Swipe and hardware back bypass it. Use
  `usePreventRemove`.
- **No anchor for a deep-linkable modal.** A cold start into `/compose` has nothing to dismiss back
  to. Export `unstable_settings` with an `anchor`.
- **Using a route-based modal for a yes/no question.** It adds a URL and a history entry for
  something `Alert` does in one line.

## Related topics

- [Stack](stack.md) — the navigator whose options control presentation.
- [Navigation and Params](navigation-and-params.md) — `dismiss`, `dismissTo` and `dismissAll`.
- [Nested Navigators](nested-navigators.md) — a stack inside a modal, and what back means there.
- [Layouts](layouts.md) — `unstable_settings` and the anchor route.
- [Deep Links and Universal Links](deep-linking.md) — how a user arrives at a modal cold.
