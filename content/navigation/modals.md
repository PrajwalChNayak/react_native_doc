---
title: Modals
description: Presenting a screen modally with the native stack — presentation modes, form sheets and detents, transparent modals, and when the core Modal component is the better tool.
status: current
toolchain: cli
---

A modal is a screen presented over the current one rather than pushed beside it. On the native stack
this is one option, `presentation`, and everything else follows from it: the transition comes from
the top, the screen underneath stays visible, and dismissal is a swipe down rather than a swipe from
the edge.

Because a modal is still a screen in the navigator, it has a route, params, a linking path and a
place in the state tree. That is the difference between this and React Native's `Modal` component,
which is covered at the end of this page.

## Why it exists / when to use it — and when NOT to

Present modally when the task interrupts the current one and ends by being finished or cancelled:
composing a message, picking a filter, signing in, confirming a destructive action. The visual
language tells the user the same thing — the screen behind is still there and they are coming back
to it.

Do not present modally when the destination is a place rather than a task. A detail screen reached
from a list is a push; making it a modal breaks the back gesture people expect and leaves the list
visible behind it for no reason.

Do not stack modals. A modal presenting another modal works, and on both platforms it looks
wrong — the second sheet sits a few points below the first and there is no way back to the content
without dismissing twice.

## Basic example

Modal screens belong on the root stack, grouped so the option is written once.

```tsx title=src/App.tsx
import {Button, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Feed: undefined;
  Compose: {replyToId?: string};
  Filters: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function FeedScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Feed'>) {
  return <Button title="Compose" onPress={() => navigation.navigate('Compose', {})} />;
}

function ComposeScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Compose'>) {
  return <Button title="Cancel" onPress={() => navigation.goBack()} />;
}

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Feed" component={FeedScreen} />
        {/* Everything in this group is presented modally. */}
        <Stack.Group screenOptions={{presentation: 'modal'}}>
          <Stack.Screen name="Compose" component={ComposeScreen} />
          <Stack.Screen name="Filters" component={Placeholder} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## How it works

`presentation` is passed through to `react-native-screens`, which maps it onto the platform's own
presentation style. The whole set, verified against `react-native-screens` 4.27.0:

| Value | iOS | Android |
| --- | --- | --- |
| `'card'` | Normal push | Normal push |
| `'modal'` | Sheet over the previous screen | Modal presentation |
| `'fullScreenModal'` | `UIModalPresentationFullScreen` | Falls back to `'modal'` |
| `'pageSheet'` | `UIModalPresentationPageSheet` | Falls back to `'modal'` |
| `'formSheet'` | `UIModalPresentationFormSheet`, with detents | Falls back to a bottom sheet |
| `'transparentModal'` | Previous screen stays visible behind a translucent screen | Same |
| `'containedModal'` | `UIModalPresentationCurrentContext` | Falls back to `'modal'` |
| `'containedTransparentModal'` | `UIModalPresentationOverCurrentContext` | Falls back to `'transparentModal'` |

The fallbacks are the point: four of these are iOS presentation styles with no Android equivalent,
and the navigator quietly substitutes `'modal'`. Design for the fallback, not only for iOS.

A modal screen is dismissed by `goBack`, by the swipe-down gesture, or by the hardware back button
on Android. All three go through the router's `GO_BACK` action, so anything that guards dismissal
guards all three.

### Form sheets and detents

`presentation: 'formSheet'` is the sheet that rests at a fraction of the screen height and can be
dragged between stops. The stops are `sheetAllowedDetents`, expressed as fractions in ascending
order:

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  Map: undefined;
  PlaceDetails: {placeId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Map" component={Placeholder} />
        <Stack.Screen
          name="PlaceDetails"
          component={Placeholder}
          options={{
            presentation: 'formSheet',
            // Ascending fractions of the available height. Android accepts at most three.
            sheetAllowedDetents: [0.3, 0.6, 1],
            sheetInitialDetentIndex: 0,
            sheetGrabberVisible: true,
            sheetCornerRadius: 20,
            // Leave the map interactive while the sheet rests at its smallest size.
            sheetLargestUndimmedDetentIndex: 0,
            headerShown: false,
          }}
          listeners={{
            sheetDetentChange: (e) => {
              // `stable` is false on Android while the user is still dragging.
              if (e.data.stable) {
                console.log(e.data.index);
              }
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

`sheetAllowedDetents` also accepts `'fitToContents'`, which sizes the sheet to what it renders. That
is the right choice for a short action list and the wrong one for anything that grows, because the
sheet re-measures and jumps.

`sheetLargestUndimmedDetentIndex` is what makes a map-style sheet usable: up to and including that
index the content behind is not dimmed and stays interactive. Above it, the sheet takes over.

> [!NOTE] Android detent support is narrower
> `react-native-screens` 4.27.0 supports at most three detents on Android, and
> `sheetLargestUndimmedDetentIndex` behaves differently there. Test the sheet on both platforms
> before committing to four stops.

## Platform differences

:::tabs
@tab iOS
`'modal'` gives the card that leaves the previous screen visible and slightly scaled behind it. The
swipe-down gesture is the system one; `gestureEnabled: false` removes it, which you want on a form
with unsaved input — although `usePreventRemove` is the better tool because it also covers the back
button.

`'pageSheet'` and `'formSheet'` are distinct native styles, not names for the same thing:
`pageSheet` always leaves a strip of the previous screen at the top, `formSheet` is the one with
detents.
@tab Android
There is no card stack behind a modal. `'modal'` presents a full-screen screen with a bottom-up
transition, and `'formSheet'` is the Material bottom sheet.

The hardware and gesture back dismiss a modal, so a modal with unsaved content needs
`usePreventRemove` — there is no gesture to disable instead.

Set `navigationBarColor` on a full-screen modal if the screen behind it has a different system bar
colour, or the bar keeps the previous screen's colour through the transition.
:::

## Common patterns

**Guard dismissal of a form.** This is the case that makes a modal a screen worth having, because
the guard covers every dismissal route at once:

```tsx title=src/screens/ComposeScreen.tsx
import {useState} from 'react';
import {Alert, TextInput} from 'react-native';
import {usePreventRemove} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Compose: {replyToId?: string};
};

export function ComposeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Compose'>) {
  const [body, setBody] = useState('');

  // Covers the swipe-down gesture, the back button and any goBack() call.
  usePreventRemove(body.trim().length > 0, ({data}) => {
    Alert.alert('Discard message?', undefined, [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action)},
    ]);
  });

  return <TextInput value={body} onChangeText={setBody} multiline autoFocus />;
}
```

**Return a result from a modal.** A modal cannot hand a value back through a callback — params must
be serialisable. Write the result onto the calling screen's params instead, merging so the rest of
its params survive:

```tsx title=src/screens/FiltersScreen.tsx
import {Button} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Feed: {sort?: 'new' | 'top'};
  Filters: undefined;
};

export function FiltersScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Filters'>) {
  return (
    <Button
      title="Sort by top"
      onPress={() =>
        // merge keeps Feed's other params; pop closes the modal on the way.
        navigation.navigate('Feed', {sort: 'top'}, {merge: true, pop: true})
      }
    />
  );
}
```

The calling screen reads `route.params.sort` and reacts to it — no callback in params, and the
result survives state restoration.

**A translucent overlay.** `presentation: 'transparentModal'` keeps the previous screen rendered, so
a dimmed backdrop with a card on top is a normal screen with a transparent `contentStyle`:

```tsx title=src/screens/ConfirmScreen.tsx
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Confirm: {message: string};
};

export function ConfirmScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Confirm'>) {
  return (
    <Pressable style={styles.backdrop} onPress={() => navigation.goBack()}>
      <View style={styles.card}>
        <Text>{route.params.message}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000088'},
  card: {borderRadius: 16, padding: 20, backgroundColor: '#ffffff'},
});
```

Register it with `options={{presentation: 'transparentModal', headerShown: false, animation: 'fade', contentStyle: {backgroundColor: 'transparent'}}}`.
Without the transparent `contentStyle` the screen paints an opaque background and the previous
screen is hidden anyway.

**Modals from inside a nested navigator.** Present from the root stack, not from a stack inside a
tab. A modal presented by a tab's stack is bounded by the tab's frame, so the tab bar stays on top
of it. Put the screen on the root stack and navigate to it from anywhere — the action bubbles up.

## When to use the core `Modal` component instead

React Native's `Modal` renders a native window over the whole app, outside the navigation tree.
Neither tool is a replacement for the other.

| | Navigator modal | Core `Modal` |
| --- | --- | --- |
| Has a route, params, deep link | Yes | No |
| Survives state restoration | Yes | No |
| Back button and swipe handled | By the router | You write it |
| Can appear over anything, including another modal screen | No | Yes |
| Good for | Tasks, flows, anything a user might link to | Transient UI: a loading blocker, a picker, an alert you cannot build with `Alert` |

Rule of thumb: if the user could bookmark it, it is a screen. If it is a moment, it is a `Modal`.
Details of the component itself are in [Modal](../components/modal.md).

> [!DEPRECATED] `Modal`'s `animated` prop
> Removed in React Native 0.87. Use `animationType` instead. Anything still passing `animated` is
> pre-0.87 code.

## Performance considerations

A modal screen is mounted when it is navigated to and stays mounted while it is showing, with the
screen underneath also mounted. That is two screens' worth of work live at once, so a heavy modal
over a heavy screen is the worst case for memory in a stack.

`'transparentModal'` is the most expensive presentation, because the screen below must keep
rendering rather than being detached. Use it for a small overlay, not for a full second screen.

A `formSheet` that resizes with `sheetAllowedDetents: 'fitToContents'` re-measures its content on
every layout change. A list inside such a sheet re-measures constantly; give it explicit detents
instead.

## Common mistakes

- **Presenting a modal from a stack nested inside tabs.** Wrong: `navigate('Compose')` where
  `Compose` lives in the feed tab's stack. The tab bar draws over the modal. Right: register modal
  screens on the root stack.
- **Using `transparentModal` without a transparent `contentStyle`.** The screen underneath is kept
  alive and then covered by an opaque background, so you pay the cost and see nothing.
- **Disabling the gesture instead of guarding it.** `gestureEnabled: false` stops the iOS swipe and
  does nothing on Android, where the back button still dismisses. `usePreventRemove` covers both.
- **Putting a callback in the modal's params.** Params are serialised; a function warns in
  development and does not survive restoration. Navigate back with `{merge: true}` instead.
- **Assuming `formSheet` detents behave identically on both platforms.** Android supports at most
  three, and the undimmed behaviour differs. Test both.
- **Stacking modals.** Two sheets deep is visually broken on both platforms. Replace the first, or
  make the second step a push inside the modal's own stack.
- **Reaching for the core `Modal` for a full task flow.** It has no route, so it cannot be deep
  linked, cannot be restored, and the Android back button does nothing unless you wire it yourself.

## Related topics

- [Native Stack](native-stack.md) — `Stack.Group`, stack actions and `usePreventRemove`.
- [Nesting Navigators](nesting.md) — why modal screens belong on the root stack.
- [Headers](headers.md) — the close button and header options on a presented screen.
- [Modal](../components/modal.md) — the core component and its remaining uses.
- [Params and Typed Routes](params-and-typed-routes.md) — returning results without callbacks.
- [Navigation Performance](navigation-performance.md) — the cost of keeping two screens alive.
