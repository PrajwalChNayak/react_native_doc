---
title: Nesting Navigators
description: Combining stacks, tabs and drawers — how nested state works, navigating across boundaries with NavigatorScreenParams, and the tab-bar-hiding problem.
status: current
toolchain: cli
---

A real app is rarely one navigator. The usual shape is a stack at the root, tabs inside it, and
another stack inside each tab. Nesting is how you express that: a navigator is a component, so it
can be the `component` of a screen in another navigator.

The mechanics are simple. The parts that bite are navigating from a screen in one navigator to a
screen in another, typing that call, and deciding which navigator a given screen belongs to.

## Why it exists / when to use it — and when NOT to

Each navigator type answers one question: a stack answers "where did I come from", tabs answer
"which area am I in", a drawer answers "what else is there". An app that needs more than one of
those answers needs more than one navigator.

Nest when the structures are genuinely different. Do not nest to group screens that share options —
`Stack.Group` does that without a second navigator, and a group keeps the state tree flat, which
keeps deep links and state restoration simpler.

Every level of nesting adds a level to the state tree, a level to the linking config and a level to
`getParent()` chains. Two levels is normal. Four is a sign that some of those navigators should be
groups.

## Basic example

The common shape: a root stack that owns full-screen and modal presentations, with a tab navigator
as its first screen, and a stack inside one tab.

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import type {NavigatorScreenParams} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

type FeedStackParamList = {
  FeedList: undefined;
  Post: {postId: string};
};

type TabParamList = {
  // A nested navigator's params are the union of "which screen" and "its params".
  FeedTab: NavigatorScreenParams<FeedStackParamList>;
  ProfileTab: undefined;
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Compose: undefined;
};

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

function FeedNavigator() {
  return (
    <FeedStack.Navigator>
      <FeedStack.Screen name="FeedList" component={Placeholder} />
      <FeedStack.Screen name="Post" component={Placeholder} />
    </FeedStack.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator>
      {/* The inner stack draws its own headers, so the tab must not draw one too. */}
      <Tab.Screen name="FeedTab" component={FeedNavigator} options={{headerShown: false}} />
      <Tab.Screen name="ProfileTab" component={Placeholder} />
    </Tab.Navigator>
  );
}

export function App() {
  return (
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen name="Tabs" component={TabNavigator} options={{headerShown: false}} />
        <RootStack.Screen
          name="Compose"
          component={Placeholder}
          options={{presentation: 'modal'}}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
```

## How it works

Nesting produces a nested state object. The root stack's route for `Tabs` carries a `state` of its
own, whose route for `FeedTab` carries another. Serialise it and you get exactly that shape — which
is why deep links and state restoration have to describe the whole path, not just the destination.

Only one navigator is focused at a time, and focus flows down. A screen is focused when it is the
active route in its navigator *and* every navigator above it is focused too. That is why a tab
screen's `useFocusEffect` does not fire when a modal from the root stack covers the tabs.

Actions bubble up. When you call `navigation.navigate('Compose')` from a screen three navigators
deep, the innermost router is asked first; it does not know `Compose`, so the action moves to its
parent, and so on until a router handles it. If none does, `onUnhandledAction` fires on the
container. This is why you can often navigate to a distant screen without naming the path — and why
a typo in a screen name is a silent no-op at runtime rather than an error.

### Headers stack up

Every navigator that can draw a header will draw one. A stack inside tabs inside a stack means
three headers unless you turn two of them off. The rule: `headerShown: false` on the screen whose
`component` is another navigator, and let the innermost navigator own the header. That is what the
two `headerShown: false` options in the example above are doing.

## Navigating across navigators

Passing a screen name alone lets the action bubble, which works but gives up control. To target a
specific screen inside a specific nested navigator, pass the nested form:

```tsx title=src/components/OpenPostButton.tsx
import {Button} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NavigatorScreenParams} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

type FeedStackParamList = {
  FeedList: undefined;
  Post: {postId: string};
};

type TabParamList = {
  FeedTab: NavigatorScreenParams<FeedStackParamList>;
  ProfileTab: undefined;
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Compose: undefined;
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

export function OpenPostButton({postId}: {postId: string}) {
  const navigation = useNavigation<RootNavigation>();

  return (
    <Button
      title="Open post"
      onPress={() =>
        navigation.navigate('Tabs', {
          screen: 'FeedTab',
          params: {
            screen: 'Post',
            params: {postId},
            // Without this, FeedList is skipped and there is nothing to go back to.
            initial: false,
          },
        })
      }
    />
  );
}
```

`initial: false` is the option people miss. By default a nested navigator opens directly on the
requested screen with no history behind it, so the back button leaves the tab entirely. Setting it
to `false` places the navigator's `initialRouteName` underneath, so back goes to `FeedList` as the
user expects.

`NavigatorScreenParams<T>` is what makes that object type-check: it expands to
`{screen, params, initial?, merge?, pop?, path?}` for every screen in `T`, plus a raw `{state}`
form. Without it, the nested params are `any` and a wrong screen name compiles.

### Typing a screen that reaches both ways

A screen inside tabs that also navigates to a root-stack screen needs both param lists on its
`navigation` prop. `CompositeScreenProps` combines them, and the order matters: the screen's own
navigator first, the parent second.

```tsx title=src/screens/ProfileScreen.tsx
import {Button} from 'react-native';
import type {CompositeScreenProps, NavigatorScreenParams} from '@react-navigation/native';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type TabParamList = {
  FeedTab: undefined;
  ProfileTab: {userId: string};
};

type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Compose: undefined;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'ProfileTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function ProfileScreen({route, navigation}: Props) {
  // `route` is the tab screen's own route.
  const {userId} = route.params;

  // `navigation` accepts both tab screens and root stack screens.
  return <Button title={userId} onPress={() => navigation.navigate('Compose')} />;
}
```

With three levels, compose twice: the innermost props, then `CompositeScreenProps` of that with the
middle, then with the root. There is a way to avoid writing this on every screen — a global
declaration — described in [Params and Typed Routes](params-and-typed-routes.md).

## Common patterns

**Hide the tab bar for one screen.** The temptation is to compute the focused route name in the tab
navigator and set `tabBarStyle: {display: 'none'}`. That works, and it flickers: the option changes
only after the inner stack has already begun its push animation, so the bar is still visible for
part of the transition.

The correct structure is to move that screen out of the tabs and into the parent stack. A
full-screen media viewer or a checkout flow is not a tab screen that happens to hide the bar; it is
a root-stack screen pushed over the tabs. The bar disappears because it is genuinely covered.

**Read the focused child route.** When you do need to know which screen inside a nested navigator is
active — to change a parent header title, for instance — `getFocusedRouteNameFromRoute` reads it
from the parent's route object without subscribing to the child's state:

```tsx title=src/navigation/tabOptions.ts
import {getFocusedRouteNameFromRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';

export function headerTitleForTab(route: RouteProp<Record<string, object | undefined>, string>) {
  // Undefined until the nested navigator has rendered once, so supply the initial route name.
  const name = getFocusedRouteNameFromRoute(route) ?? 'FeedList';

  switch (name) {
    case 'Post':
      return 'Post';
    default:
      return 'Feed';
  }
}
```

**Reach a parent navigator imperatively.** `navigation.getParent()` returns the parent's navigation
object, and `getParent('SomeId')` finds a specific ancestor by the `id` prop set on that navigator.
Use the id form: an unqualified `getParent()` breaks the moment someone inserts a navigator between
the two.

**Keep modals at the root.** A modal presented from a screen inside tabs is drawn inside the tab's
bounds, under the tab bar. Put modal screens on the root stack in a `Stack.Group` with
`presentation: 'modal'`, and navigate to them from anywhere — the action bubbles up on its own.

## Performance considerations

Nesting multiplies mount cost. A tab navigator with four tabs, each containing a stack, is four
navigators plus their screens. `lazy` on the tabs means only the visited ones are built, which is
the default and should stay on.

Every navigator between the container and a screen re-renders when navigation state changes.
Context providers placed between navigators run on every navigation; hoist them above the container
or push them below the screen, but do not leave expensive work in the middle.

Deeply nested state also makes state restoration heavier, since the whole tree is serialised on
every state change. See [State Persistence](state-persistence.md).

## Common mistakes

- **Forgetting `initial: false`.** Wrong: `navigate('Tabs', {screen: 'FeedTab', params: {screen: 'Post', params: {postId}}})`
  from a push notification. The user lands on the post with an empty stack under it and back exits
  the tab. Right: add `initial: false` so the tab's initial screen sits underneath.
- **Two headers.** Nesting a stack inside tabs without `headerShown: false` on the tab screen gives
  you the tab navigator's header and the stack's header, one above the other. Turn off the outer one.
- **Hiding the tab bar with `tabBarStyle` from a nested screen.** It animates at the wrong time.
  Move the screen to the parent stack instead.
- **Typing a nested screen with only its own param list.** `NativeStackScreenProps<FeedStackParamList, 'Post'>`
  on a screen that also calls `navigate('Compose')` compiles — `navigate` falls back to a looser
  signature — and then fails silently if the name is wrong. Use `CompositeScreenProps`.
- **Using `NavigatorScreenParams` on a screen that is not a navigator.** It makes the params object
  accept `{screen, params}` shapes that the router will try to apply to a plain component, producing
  a route with params it does not understand.
- **Relying on unqualified `getParent()`.** It returns the immediate parent, which changes whenever
  the tree changes. Give the navigator an `id` and ask for it by name.
- **Nesting to share options.** Wrong: a whole extra stack so four screens can share a header
  colour. Right: `Stack.Group` with `screenOptions`, which adds no state.

## Related topics

- [Params and Typed Routes](params-and-typed-routes.md) — the global declaration that removes `CompositeScreenProps` from most screens.
- [Tabs](tabs.md) — `lazy`, `popToTopOnBlur` and the tab bar.
- [Native Stack](native-stack.md) — groups, `presentation` and stack actions.
- [Drawer](drawer.md) — wrapping tabs in a drawer.
- [Modals](modals.md) — why modal screens belong on the root stack.
- [Deep Linking and Universal Links](deep-linking.md) — writing a linking config for a nested tree.
- [State Persistence](state-persistence.md) — serialising a nested state tree.
