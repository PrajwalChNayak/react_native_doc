---
title: Tabs
description: Bottom tabs with @react-navigation/bottom-tabs 7 — lazy screens, badges, per-tab stacks, hiding the bar and the tabPress event.
status: current
toolchain: cli
---

A tab navigator shows several sibling destinations at once and switches between them without a
history. `@react-navigation/bottom-tabs` renders the bar in JavaScript and each tab's content in a
`react-native-screens` container, which is why it can keep inactive tabs mounted and still avoid
paying for their renders.

Tabs are a flat structure. Nothing in a tab navigator pushes or pops — that is the job of a stack
inside each tab, which is the subject of [Nesting Navigators](nesting.md).

## Why it exists / when to use it — and when NOT to

Tabs are for three to five top-level areas that a user moves between constantly and in no
particular order: a feed, search, a profile. The value is that all of them are one tap away and
each remembers where it was.

They stop working past about five items, because the labels stop fitting and the tap targets get
too small. At that point the answer is a [Drawer](drawer.md), or a "More" tab that opens a list.

Do not use tabs for a linear flow. Checkout steps, onboarding and anything with a required order
belong in a stack, where back means something.

> [!NOTE] Material top tabs are a separate package
> `@react-navigation/material-top-tabs` provides the swipeable tabs that sit under a header. This
> handbook covers bottom tabs; the concepts below (lazy, `tabPress`, nesting) transfer, but the
> options do not.

## Installing

```bash
npm install @react-navigation/bottom-tabs@7.18.18
```

It depends on `@react-navigation/elements` 2.9.40 internally and declares
`@react-navigation/native` 7.3.18, `react-native-screens` 4.27.0 and
`react-native-safe-area-context` 5.9.1 as peers. Unlike the drawer, it needs no gesture or
animation library — the bar is a row of pressables, not a gesture surface.

## Basic example

```tsx title=src/TabNavigator.tsx
import {Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';

type TabParamList = {
  Feed: undefined;
  Search: {query?: string};
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function FeedScreen() {
  return <Text>Feed</Text>;
}

function SearchScreen({route}: BottomTabScreenProps<TabParamList, 'Search'>) {
  return <Text>{route.params.query ?? 'Search'}</Text>;
}

function ProfileScreen() {
  return <Text>Profile</Text>;
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#1f6feb',
        tabBarInactiveTintColor: '#6e7781',
        // Do not render a tab until it is first visited.
        lazy: true,
      }}>
      <Tab.Screen name="Feed" component={FeedScreen} options={{tabBarBadge: 3}} />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        initialParams={{}}
        options={{title: 'Search'}}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
```

## How it works

The tab router holds an array of routes and an index, plus a `history` of visited route keys. There
is no push: switching tabs changes the index and records the move in that history, which is what
the Android back button walks through.

`backBehavior` on the navigator controls that walk. The values the router accepts are
`'firstRoute'` (the default), `'initialRoute'`, `'order'`, `'history'`, `'fullHistory'` and
`'none'`. `'history'` drops duplicate entries; `'fullHistory'` keeps them, matching how a web page
behaves. Pick `'history'` unless you have a reason to want repeats.

Each tab's content is wrapped in a screen container. With `lazy: true` — the default — a tab's
component is not created until the tab is first focused, and after that it stays mounted. So the
first visit to a tab is the only slow one, and switching back to it is instant.

### Icons

`tabBarIcon` is a function of `{focused, color, size}`. There is no icon set in React Native core,
so this is where an icon library or your own vector component goes:

```tsx title=src/TabNavigator.tsx
import {Text, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

type TabParamList = {
  Feed: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// Stand-in for a real vector icon component.
function Dot({color, size, filled}: {color: string; size: number; filled: boolean}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: filled ? color : 'transparent',
      }}
    />
  );
}

const Placeholder = () => <Text>Screen</Text>;

export function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Feed"
        component={Placeholder}
        options={{
          tabBarIcon: ({color, size, focused}) => <Dot color={color} size={size} filled={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={Placeholder}
        options={{
          tabBarIcon: ({color, size, focused}) => <Dot color={color} size={size} filled={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
```

`color` already reflects `tabBarActiveTintColor` / `tabBarInactiveTintColor`, so pass it through
rather than branching on `focused` for colour. Use `focused` for a shape change — filled versus
outlined — which reads better than colour alone for users who cannot distinguish the two tints.

## Platform differences

The bar is drawn in JavaScript on both platforms, so it looks the same by default — but two options
exist specifically to match platform conventions.

:::tabs
@tab iOS
`tabBarVariant` defaults to `'uikit'`: icon above label, centred. Safe-area insets are read from
`react-native-safe-area-context`, so the bar sits above the home indicator automatically. Do not add
your own bottom padding on top of that.

`tabBarBackground` is where a blurred bar goes — render a blur view behind the bar and set
`tabBarStyle: {position: 'absolute'}` so content scrolls underneath it. Screens then need
`useBottomTabBarHeight()` for their bottom content inset.
@tab Android
`tabBarVariant: 'material'` switches to the Material layout, and `tabBarLabelVisibilityMode`
(`'auto'`, `'labeled'` or `'unlabeled'`) controls whether inactive labels are shown, matching the
Material navigation bar behaviour.

`tabBarHideOnKeyboard: true` is close to mandatory here. The Android soft keyboard resizes the
window, so without it the tab bar is pushed up and sits directly on top of the keyboard.
:::

## Common patterns

**Reset a tab's stack when the user taps its tab again.** This is the behaviour people expect from
every native app, and it is not the default. Listen for `tabPress` and prevent it:

```tsx title=src/TabNavigator.tsx
import {Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

type TabParamList = {
  Feed: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Feed"
        component={Placeholder}
        listeners={({navigation}) => ({
          tabPress: (e) => {
            // Only intercept a tap on the tab that is already focused.
            if (navigation.isFocused()) {
              e.preventDefault();
              navigation.navigate('Feed');
            }
          },
        })}
      />
      <Tab.Screen name="Profile" component={Placeholder} />
    </Tab.Navigator>
  );
}
```

`tabPress` is one of the few events with `canPreventDefault: true`; the others on this navigator
(`tabLongPress`, `transitionStart`, `transitionEnd`) are notifications only.

There is also a declarative version of the most common case: `popToTopOnBlur: true` on a screen
pops that tab's nested stack to its first route whenever the tab loses focus, so returning to the
tab always starts at the top.

**Give scrollable content room for an absolutely positioned bar.** When the bar floats over the
content, nothing tells a list how tall it is except `useBottomTabBarHeight`:

```tsx title=src/screens/FeedScreen.tsx
import {FlatList, Text} from 'react-native';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';

export function FeedScreen() {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <FlatList
      data={[1, 2, 3]}
      keyExtractor={(item) => String(item)}
      // Keeps the last rows reachable instead of hidden behind the bar.
      contentContainerStyle={{paddingBottom: tabBarHeight}}
      renderItem={({item}) => <Text>{item}</Text>}
    />
  );
}
```

**Hide the bar on one screen inside a tab.** Do not do this by toggling `tabBarStyle` from a nested
screen — that is the pattern that produces a bar which animates in and out at the wrong time. Put
the screen that should have no tab bar in the root stack *above* the tabs instead. Full worked
example in [Nesting Navigators](nesting.md).

**A custom bar.** `tabBar` on the navigator replaces the whole component and receives `state`,
`descriptors`, `navigation` and `insets`. Reach for it when you need a shape the options cannot
express — a centre action button, for instance. Reuse `BottomTabBar` as a starting point rather
than reimplementing focus and accessibility from scratch.

## Performance considerations

`lazy` defaults to `true`, and leaving it on is the single biggest win: with three tabs, two of
them cost nothing until they are opened. Turn it off only for a tab that must be warm the instant
the app starts, and accept the startup cost.

Once a tab has been visited it stays mounted, so its timers and subscriptions keep running.
`freezeOnBlur: true` stops React re-rendering it while it is not visible, which cuts the cost of
keeping it around without losing its state. Work that must actually stop belongs in `useFocusEffect`.

`animation` on the navigator defaults to `'none'` — tabs switch instantly. `'fade'` and `'shift'`
are available, and both mean the outgoing and incoming tabs render together for the duration, so
they cost more than the default on a busy screen.

`tabBarStyle` accepts an animated value, which means a style object literal in the navigator body
is re-created and re-diffed on every parent render. Hoist it.

## Common mistakes

- **Toggling `tabBarStyle: {display: 'none'}` from a nested screen.** Wrong: reading the focused
  route name in the tab navigator and hiding the bar for one of them. The bar hides after the push
  animation has already started, so it flickers. Right: move that screen out of the tabs into the
  parent stack.
- **Assuming `navigate` inside a tab pushes.** Tabs have no history of their own beyond
  `backBehavior`. `navigation.navigate('Profile')` jumps to the tab; if `Profile` is a nested stack
  it resumes wherever it was, which surprises people who expected a fresh screen. `popToTopOnBlur`
  is the fix.
- **Padding for the home indicator by hand.** The bar already consumes the bottom safe-area inset.
  Adding `paddingBottom: 34` on top produces a bar that is visibly too tall on a notched device and
  wrong everywhere else.
- **Forgetting `tabBarHideOnKeyboard` on Android.** A text input on a tab screen pushes the bar up
  to sit on the keyboard. It is one option and it is Android-specific in effect.
- **Putting six tabs in the bar.** Labels truncate and tap targets fall below the recommended
  minimum. Use a drawer or a "More" screen.
- **Using `tabBarBadge` for a number that changes every second.** Each change re-renders the bar.
  Throttle the source, or show a dot rather than a count.

## Related topics

- [Nesting Navigators](nesting.md) — a stack inside each tab, and hiding the bar correctly.
- [Drawer](drawer.md) — the alternative when there are too many destinations for a bar.
- [Native Stack](native-stack.md) — what goes inside each tab.
- [Navigation Performance](navigation-performance.md) — lazy, `freezeOnBlur` and screen freezing.
- [Safe Areas](../components/safe-areas.md) — how the bottom inset is computed.
- [Params and Typed Routes](params-and-typed-routes.md) — typing a tab screen that also reaches the parent stack.
