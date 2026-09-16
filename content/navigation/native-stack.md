---
title: Native Stack
description: The push/pop navigator built on UINavigationController and Fragments — options, actions, and the difference between navigate, push and replace.
status: current
toolchain: cli
---

The native stack is the navigator most apps start with. It models navigation as a pile of screens:
you push a new one on top, and going back pops it off. `@react-navigation/native-stack` implements
that by handing the stack to the platform through `react-native-screens`, so the transition, the
swipe-back gesture and the header are the real system ones rather than JavaScript imitations.

This page assumes you have read [React Navigation Fundamentals](fundamentals.md) and have the
container installed.

## Why it exists / when to use it — and when NOT to

Every app that has a list and a detail view needs a stack. It is the only navigator that keeps a
history, so it is also the only one that can answer "go back" meaningfully.

Use the native stack unless you have a specific reason not to. Because the transition runs on the
native side, it does not stutter when the JavaScript thread is busy — which is exactly when a
JavaScript-driven transition looks worst, since a busy thread is usually the result of the screen
you are navigating to doing its initial work.

The trade is customisation. `@react-navigation/stack`, the JavaScript stack, lets you write an
arbitrary transition with an interpolator because it animates in JavaScript. The native stack gives
you a fixed set of platform animations instead. If you need a shared-element transition or a
bespoke curve for the whole app, the JavaScript stack is the escape hatch; for everything else the
native one is faster and more correct.

Do not reach for a stack when the destinations are siblings rather than a hierarchy. Five top-level
areas of an app are [Tabs](tabs.md) or a [Drawer](drawer.md), not five pushes.

## Installing

```bash
npm install @react-navigation/native-stack@7.18.10
```

`@react-navigation/native` 7.3.18, `react-native-screens` 4.27.0 and
`react-native-safe-area-context` 5.9.1 are peer dependencies — they are declared in the package's
`peerDependencies`, so a package manager that does not auto-install peers leaves you with a missing
module at first render. Run `pod install` afterwards.

## Basic example

```tsx title=src/App.tsx
import {Button, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Library: undefined;
  Book: {bookId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function LibraryScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  return (
    <View>
      <Button title="Open book" onPress={() => navigation.navigate('Book', {bookId: 'dune'})} />
    </View>
  );
}

function BookScreen({route}: NativeStackScreenProps<RootStackParamList, 'Book'>) {
  return <Text>{route.params.bookId}</Text>;
}

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Library"
        screenOptions={{headerTitleAlign: 'center', headerShadowVisible: false}}>
        <Stack.Screen name="Library" component={LibraryScreen} options={{title: 'Library'}} />
        <Stack.Screen
          name="Book"
          component={BookScreen}
          options={({route}) => ({title: route.params.bookId})}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

Two things to notice. `screenOptions` on the navigator applies to every screen; `options` on a
screen overrides it. And `options` can be a function of the screen's own `route` and `navigation`,
which is how a title derived from params is written without an effect.

## How it works

`createNativeStackNavigator` returns an object with `Navigator`, `Screen` and `Group`. The
`Navigator` runs the stack router — a pure function from state plus action to new state — and hands
the resulting route array to `NativeStackView`, which renders one `react-native-screens` container
per route.

From there the platform owns it. On iOS those containers become a `UINavigationController` stack;
on Android they become Fragments in a fragment container. The header is a native header, not a
`View` you are styling from JavaScript, which is why the header options are a fixed list rather
than arbitrary style props.

### Actions that change the stack

These are the methods on `navigation` that a stack adds or reinterprets. Getting the difference
between the first three right removes most navigation bugs.

| Call | What happens |
| --- | --- |
| `navigate('Book', {bookId})` | If `Book` is already in the stack, go back to it and merge params. Otherwise push it. |
| `navigate('Book', {bookId}, {pop: true})` | Same, but pop the screens above the existing `Book` instead of leaving them. |
| `push('Book', {bookId})` | Always add another copy, even if `Book` is already showing. |
| `replace('Book', {bookId})` | Swap the current route for `Book`. The current screen is gone from history. |
| `goBack()` | Pop one. |
| `pop(2)` | Pop two. |
| `popTo('Library')` | Pop until `Library` is on top. Adds it if it is not in the stack. |
| `popToTop()` | Pop everything above the first route. |
| `setParams({bookId})` | Shallow-merge params into the current route. |
| `replaceParams({bookId})` | Replace the current route's params outright. |
| `preload('Book', {bookId})` | Mount `Book` off-screen so the eventual push is instant. |

`navigate` is the right default. `push` is for genuinely recursive navigation — a profile that
links to another profile. `replace` is for flows where going back would be wrong, such as swapping
a splash screen for the app or a sign-in screen for the home screen.

> [!NOTE] `preload` is not free
> Preloading mounts the screen, runs its effects and holds its memory before the user has asked for
> it. It pays off for one very likely next destination. Preloading a list of candidates costs more
> than it saves.

## Platform differences

:::tabs
@tab iOS
The stack is a `UINavigationController`. The edge swipe-back gesture is the system one and is on by
default; `gestureEnabled: false` turns it off for a screen. `headerLargeTitle`, `headerBlurEffect`,
`headerSearchBarOptions` and `headerBackButtonDisplayMode` map onto real `UINavigationBar` features
and do nothing on Android.

`fullScreenGestureEnabled: true` extends the back gesture from the screen edge to the whole screen
width, which matches what several system apps do.
@tab Android
The stack is a set of Fragments. There is no edge swipe-back gesture, so `gestureEnabled` has no
effect; back comes from the hardware or gesture back, routed to the stack's `GO_BACK` action.

`statusBarStyle`, `statusBarHidden`, `navigationBarColor` and `navigationBarTranslucent` are
Android-only options that set window flags per screen — useful when one screen has a dark photo
under the status bar and the rest of the app does not.

The predictive back gesture is not supported; `android:enableOnBackInvokedCallback="false"` must be
set in the manifest, as covered in [Fundamentals](fundamentals.md).
:::

Animations differ too. `animation: 'default'` resolves to the platform's own push transition. The
named values — `'fade'`, `'slide_from_bottom'`, `'slide_from_right'`, `'slide_from_left'`,
`'fade_from_bottom'`, `'flip'`, `'simple_push'`, `'ios_from_right'`, `'ios_from_left'`, `'none'` —
are the set `react-native-screens` 4.27.0 supports, and a few of them (`'flip'`, the `ios_from_*`
pair) are iOS-only in practice.

## Common patterns

**Set options from inside the screen.** When the option depends on state rather than params, call
`setOptions`. Do it in a layout effect so the header updates in the same frame as the content:

```tsx title=src/screens/EditorScreen.tsx
import {useLayoutEffect, useState} from 'react';
import {Button, TextInput} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Editor: {draftId: string};
};

export function EditorScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Editor'>) {
  const [text, setText] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      // Disabling the button is state-dependent, so options cannot be static here.
      headerRight: () => <Button title="Save" disabled={text.length === 0} onPress={() => {}} />,
    });
  }, [navigation, text]);

  return <TextInput value={text} onChangeText={setText} multiline />;
}
```

**Stop a screen being dismissed with unsaved work.** `usePreventRemove` intercepts every removal —
back button, swipe gesture and a programmatic `goBack` alike — and hands you the action to dispatch
once you have confirmation:

```tsx title=src/screens/DraftScreen.tsx
import {Alert, TextInput} from 'react-native';
import {usePreventRemove} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Draft: undefined;
};

export function DraftScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Draft'>) {
  const hasUnsavedChanges = true;

  usePreventRemove(hasUnsavedChanges, ({data}) => {
    Alert.alert('Discard draft?', 'Your changes will be lost.', [
      {text: 'Keep editing', style: 'cancel'},
      // Re-dispatch the original action; the guard is bypassed for it.
      {text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action)},
    ]);
  });

  return <TextInput multiline />;
}
```

On iOS this also blocks the swipe-back gesture rather than letting the screen slide half away and
snap back.

**Share options across a subset of screens.** `Stack.Group` applies `screenOptions` to its children
without adding a navigator, which keeps the state tree flat:

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  Feed: undefined;
  Compose: undefined;
  Filters: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Feed" component={Placeholder} />
        {/* Both of these present modally without repeating the option twice. */}
        <Stack.Group screenOptions={{presentation: 'modal'}}>
          <Stack.Screen name="Compose" component={Placeholder} />
          <Stack.Screen name="Filters" component={Placeholder} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**Conditional screens instead of imperative redirects.** An authentication flow is a change in
which screens exist, not a navigation action. Render the set that matches the state and React
Navigation works out the transition:

```tsx title=src/RootNavigator.tsx
import {Text} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  SignIn: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function RootNavigator({token}: {token: string | null}) {
  return (
    <Stack.Navigator>
      {token === null ? (
        <Stack.Screen name="SignIn" component={Placeholder} options={{headerShown: false}} />
      ) : (
        <Stack.Screen name="Home" component={Placeholder} />
      )}
    </Stack.Navigator>
  );
}
```

There is no `navigation.replace('Home')` to forget, and no window where a signed-out user can press
back into a signed-in screen, because the signed-in screen is not in the tree at all.

## Performance considerations

Pushed screens stay mounted. That is deliberate — it is what makes back instant — but it means a
screen five pushes deep still holds its component tree, its subscriptions and its images.

`freezeOnBlur: true` stops React from re-rendering a screen that is not visible without unmounting
it, which removes most of the cost while keeping the instant back. It is the single most useful
option on this page for a stack with heavy screens. The details are in
[Navigation Performance](navigation-performance.md).

Rendering the navigator itself is also not free. If `screenOptions` is an object literal created in
the parent component's body, it is a new object on every parent render, and every screen's options
are recomputed. Hoist it to module scope when it does not depend on props.

## Common mistakes

- **Using `push` where `navigate` belongs.** Wrong: `onPress={() => navigation.push('Book', ...)}`
  on a row the user can reach twice. Right: `navigate`, which reuses the existing route. `push`
  stacks duplicates, so the back button walks through a history the user does not remember creating.
- **Expecting `navigate` to clear the screens above.** `navigate('Library')` from three screens
  deep goes back to `Library` but leaves nothing behind it; `navigate('Library', undefined, {pop: true})`
  or `popTo('Library')` is what actually collapses the stack.
- **Calling `setOptions` in `useEffect` instead of `useLayoutEffect`.** The header renders one frame
  with the old value first, which is visible as a flicker on a fast device and as a full title swap
  on a slow one.
- **Styling the native header with arbitrary props.** `headerStyle` accepts
  `backgroundColor` only on this navigator — it is a native header. Wrong: passing padding,
  borders or flex to `headerStyle` and wondering why nothing changes. Right: `headerBackground` for
  custom content, or a full custom `header`, covered in [Headers](headers.md).
- **Assuming `gestureEnabled` does something on Android.** It is an iOS gesture. On Android, control
  back with `usePreventRemove` instead.
- **Mounting the navigator inside a component that re-renders often.** Every re-render of the
  component that renders `<Stack.Navigator>` walks the whole screen config again. Keep the navigator
  in its own component and keep state that changes frequently below it.

## Related topics

- [React Navigation Fundamentals](fundamentals.md) — installation, the container, and the static vs dynamic choice.
- [Params and Typed Routes](params-and-typed-routes.md) — making `navigate` calls type-checked.
- [Headers](headers.md) — every header option the native stack supports, and custom headers.
- [Modals](modals.md) — `presentation`, form sheets and dismissal.
- [Nesting Navigators](nesting.md) — putting a stack inside tabs, and tabs inside a stack.
- [Navigation Performance](navigation-performance.md) — `freezeOnBlur`, screens and re-render cost.
