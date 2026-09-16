---
title: Headers
description: Configuring the native stack header, the header options that are real on each platform, replacing it entirely, and laying out content under a transparent one.
status: current
toolchain: cli
---

The header is the bar at the top of a screen with a title, a back button and actions. On the native
stack it is a genuine platform header — a `UINavigationBar` on iOS, a Fragment's app bar on Android
— which is why it animates correctly during a push and why its options are a fixed list rather than
arbitrary styles.

On the tab and drawer navigators the header is instead a React component from
`@react-navigation/elements`, so those two share a different, more style-friendly option set. Most
of the confusion about header options comes from mixing the two lists up.

## Why it exists / when to use it — and when NOT to

The header answers three questions at once: where am I, how do I get back, and what can I do here.
Getting it from the navigator rather than rendering your own means the back button, the title
truncation, the safe-area inset and the transition are all handled.

Turn it off with `headerShown: false` when the screen has its own full-bleed design — a media
viewer, an onboarding screen, a map. Turn it off on the *outer* navigator when you nest, so you do
not get two.

Replace it with a custom `header` component when you need a shape the options cannot express: a
search field that is part of the bar, a segmented control, a two-line title with a subtitle. Accept
what you give up first — see the trade below.

## Basic example

```tsx title=src/App.tsx
import {Button, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  Library: undefined;
  Book: {bookId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          headerTintColor: '#1f6feb',
          headerStyle: {backgroundColor: '#ffffff'},
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="Library" component={Placeholder} options={{title: 'Library'}} />
        <Stack.Screen
          name="Book"
          component={Placeholder}
          options={({route, navigation}) => ({
            title: route.params.bookId,
            headerRight: () => <Button title="Share" onPress={() => navigation.goBack()} />,
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

`options` as a function receives `{route, navigation, theme}`, which is how a title derived from
params is written without an effect. Use `navigation.setOptions` only when the option depends on
state inside the screen.

## How it works

The native stack does not render a `View` for the header. It renders a configuration element that
`react-native-screens` translates into properties on the native navigation bar. That is the reason
for every restriction on this page: you are describing a native component, not styling a React one.

Consequences worth knowing:

- `headerStyle` on the native stack accepts `backgroundColor` and little else. Padding, borders and
  flex have no native counterpart and are ignored.
- `headerTitleStyle` accepts `fontFamily`, `fontSize`, `fontWeight` and a colour. It is a native
  label, not a `Text`.
- `headerLeft`, `headerRight`, `headerTitle` and `headerBackground` do take React elements — they are
  hosted inside the native bar as subviews.
- Changing options mid-transition is applied natively, so a title set in `useLayoutEffect` lands in
  the same frame; the same call in `useEffect` shows the old title for one frame first.

### Which options are real where

| Option | Native stack | Tabs / drawer |
| --- | --- | --- |
| `title`, `headerShown`, `headerTintColor` | Yes | Yes |
| `headerLeft`, `headerRight`, `headerTitle` | Yes | Yes |
| `headerStyle` | Background colour only | Full style object |
| `headerTitleStyle` | Font family, size, weight, colour | Full text style |
| `headerBackground`, `headerTransparent` | Yes | Yes |
| `headerLargeTitle`, `headerBlurEffect` | iOS only | Not available |
| `headerSearchBarOptions` | iOS, and Android via the screens search bar | Available on tabs and drawer |
| `headerBackTitle`, `headerBackButtonDisplayMode` | iOS only | Not applicable |
| `headerTitleContainerStyle`, `headerLeftContainerStyle` | Not available | Yes |

The second column is `HeaderOptions` from `@react-navigation/elements`, which the tab and drawer
navigators extend. If an option you remember is missing from the native stack, this table is usually
why.

## Platform differences

:::tabs
@tab iOS
`headerLargeTitle: true` gives the oversized title that collapses as the user scrolls — it only
works when the screen's scrollable is the first child, because the native bar needs to find it.

`headerBlurEffect` (with `headerTransparent: true`) produces the translucent bar that system apps
use. `headerBackTitle` sets the text next to the back chevron, and
`headerBackButtonDisplayMode` (`'default'`, `'generic'` or `'minimal'`) controls whether that text is
the previous screen's title, a generic "Back", or nothing.

`headerSearchBarOptions` mounts a real `UISearchController` into the bar:

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator<{Search: undefined}>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Search"
          component={Placeholder}
          options={{
            headerLargeTitle: true,
            headerSearchBarOptions: {
              placeholder: 'Search books',
              hideWhenScrolling: false,
              autoCapitalize: 'none',
              onChangeText: (event) => {
                // Native event, not a plain string.
                console.log(event.nativeEvent.text);
              },
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

@tab Android
There is no large title and no blur effect; both options are accepted and do nothing, which is worth
knowing before you build a design around them.

The header participates in the window's system-bar handling, so `statusBarStyle` and
`statusBarHidden` on the same screen options are the levers for the bar above it. Both are
Android-specific on the native stack.

Elevation rather than a hairline separates the header from content: `headerShadowVisible: false`
removes it, which is what a design with a coloured header usually wants.
:::

## Common patterns

**A header button that needs screen state.** Options evaluated at screen-registration time cannot
see the screen's state. `setOptions` in a layout effect can:

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
      headerRight: () => (
        <Button title="Save" disabled={text.trim().length === 0} onPress={() => {}} />
      ),
    });
    // Re-run whenever the enabled state changes, not on every keystroke's render.
  }, [navigation, text]);

  return <TextInput value={text} onChangeText={setText} multiline />;
}
```

Do not put a function in params to work around this. Params are serialised; a callback in them warns
in development and breaks state restoration. `setOptions` is the supported answer.

**Content under a transparent header.** With `headerTransparent: true` the header no longer takes
space, so content starts at the top of the screen and the first rows sit under the bar.
`useHeaderHeight` gives you the number to compensate with:

```tsx title=src/screens/DetailScreen.tsx
import {ScrollView, Text} from 'react-native';
import {useHeaderHeight} from '@react-navigation/elements';

export function DetailScreen() {
  const headerHeight = useHeaderHeight();

  return (
    <ScrollView
      // The header floats over the content, so reserve its height at the top.
      contentContainerStyle={{paddingTop: headerHeight}}
      contentInsetAdjustmentBehavior="automatic">
      <Text>Body</Text>
    </ScrollView>
  );
}
```

It already includes the status-bar inset, so do not add `insets.top` on top of it.

**Replace the header entirely.** `header` returns your own component and receives everything the
default one had. Use `getHeaderTitle` so a screen that set `title`, `headerTitle` or neither all
resolve the same way:

```tsx title=src/navigation/AppHeader.tsx
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getHeaderTitle} from '@react-navigation/elements';
import type {NativeStackHeaderProps} from '@react-navigation/native-stack';

export function AppHeader({navigation, route, options, back}: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, {paddingTop: insets.top}]}>
      {back ? (
        <Pressable onPress={navigation.goBack} accessibilityRole="button">
          <Text style={styles.action}>Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {getHeaderTitle(options, route.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  title: {flex: 1, fontSize: 17, fontWeight: '600'},
  action: {fontSize: 17},
});
```

Apply it with `options={{header: (props) => <AppHeader {...props} />}}`. Two things you now own:
the safe-area inset, as above, and the fact that this is a JavaScript view — it no longer animates
as part of the native transition, so on iOS it cross-fades with the screen rather than sliding with
the bar. For a header that must track the native transition, `headerBackground` plus the standard
title options keeps the native behaviour and still lets you draw whatever you like behind it.

**Theme the header from the navigation theme.** Options receive `theme`, so a header that follows
light and dark mode does not need a separate context:

```tsx title=src/App.tsx
import {Text, useColorScheme} from 'react-native';
import {DarkTheme, DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator<{Home: undefined}>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  const scheme = useColorScheme();

  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack.Navigator
        screenOptions={({theme}) => ({
          headerStyle: {backgroundColor: theme.colors.card},
          headerTintColor: theme.colors.text,
        })}>
        <Stack.Screen name="Home" component={Placeholder} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## Performance considerations

`headerRight` and `headerLeft` are functions called on every options evaluation, which happens on
every navigation and every `setOptions`. Keep them cheap: a button, not a component that fetches.

An inline arrow in `screenOptions` — `screenOptions={{headerRight: () => <Actions />}}` written in
the navigator's parent — creates a new function identity on every parent render, so the header
re-renders even when nothing about it changed. Hoist static option objects to module scope.

A custom `header` component renders on the JavaScript thread during the transition, which is
precisely when that thread is busiest. The native header does not. If your push transitions stutter
only on screens with a custom header, that is the cause.

## Common mistakes

- **Styling the native header with layout props.** Wrong: `headerStyle: {paddingHorizontal: 16, borderBottomWidth: 1}`.
  It is a native bar and those have no counterpart. Right: `headerShadowVisible` for the separator,
  `headerBackground` for custom content.
- **Setting options in `useEffect`.** The header paints once with the old value. `useLayoutEffect`
  is the fix, and options-as-a-function is better still when the value comes from params.
- **Passing a callback through params so the header can call it.** It warns in development and
  breaks state restoration. Use `setOptions` from inside the screen.
- **Adding safe-area padding on top of `useHeaderHeight`.** The returned height already includes the
  status-bar inset, so the content ends up pushed down twice.
- **Expecting `headerLargeTitle` to do something on Android.** It is a `UINavigationBar` feature. So
  are `headerBlurEffect`, `headerBackTitle` and `headerBackButtonDisplayMode`.
- **Two headers after nesting.** A stack inside tabs draws both navigators' headers. Set
  `headerShown: false` on the tab screen whose component is the stack.
- **Using `headerLargeTitle` with a non-scrollable first child.** The native bar has nothing to
  collapse against, so the title stays large and the screen looks broken on scroll.

## Related topics

- [Native Stack](native-stack.md) — where most of these options live.
- [Tabs](tabs.md) — the elements-based header the tab navigator uses.
- [Modals](modals.md) — headers on a presented screen, and the close button.
- [Nesting Navigators](nesting.md) — turning off the outer header.
- [Safe Areas](../components/safe-areas.md) — the insets a custom header has to handle itself.
- [Dark Mode](../styling/dark-mode.md) — driving the navigation theme from the colour scheme.
