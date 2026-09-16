---
title: React Navigation Fundamentals
description: Installing React Navigation 7, the navigator/router/screen model, and the difference between the static and dynamic configuration APIs.
status: current
toolchain: cli
---

React Navigation is the routing library this handbook uses. It is written in JavaScript on top of
native primitives: `react-native-screens` supplies real native containers, and each navigator
package supplies the transitions and chrome that belong to a platform. There is no router built
into React Native itself, so something has to fill this role, and React Navigation is the option
with first-party New Architecture support across stack, tabs and drawer.

This page covers installation, the mental model, and the one decision you make before writing any
screens: static or dynamic configuration.

## Why it exists / when to use it — and when NOT to

A React Native app has no URL bar and no browser history. Whatever you build instead has to own a
serialisable state tree, map it onto native view containers, restore focus, handle the Android
hardware back button and answer incoming deep links. React Navigation does all of that.

You do not need it for a single-screen app, or for a React Native view embedded inside an existing
native app where the host app already owns navigation. In the embedded case, adding a navigator
means two navigation stacks fighting over the back button.

The main alternative is `react-native-navigation`, which uses native navigation controllers
directly rather than rendering screens inside a JavaScript-managed tree. It is a different trade:
more native fidelity, less flexibility, and a much smaller ecosystem. This handbook documents
React Navigation only.

> [!NOTE] Versions used throughout this section
> Every example was written against `@react-navigation/native` 7.3.18 and checked against the real
> installed type definitions. Version numbers on this page were read from the npm registry on
> 2026-09-12.

## Installing

Install the core package plus its two required peers. `react-native-screens` and
`react-native-safe-area-context` are peer dependencies of every navigator, not optional extras.

:::tabs
@tab npm
```bash
npm install @react-navigation/native@7.3.18
npm install react-native-screens@4.27.0 react-native-safe-area-context@5.9.1
```
@tab yarn
```bash
yarn add @react-navigation/native@7.3.18
yarn add react-native-screens@4.27.0 react-native-safe-area-context@5.9.1
```
@tab pnpm
```bash
pnpm add @react-navigation/native@7.3.18
pnpm add react-native-screens@4.27.0 react-native-safe-area-context@5.9.1
```
:::

Then install the native pods:

```bash
cd ios && bundle install && bundle exec pod install
```

A navigator package comes on top of that — see [Native Stack](native-stack.md),
[Tabs](tabs.md) and [Drawer](drawer.md). The navigator packages depend on
`@react-navigation/elements` 2.9.40 internally, so you do not install that yourself unless you
want to use its exported components directly.

### Native configuration

Two native changes are required and neither of them is optional on Android.

:::tabs
@tab Android
`react-native-screens` renders each screen as a Fragment. Android can restore Fragments after the
process is killed and the Activity is recreated, and without a fragment factory that restoration
produces screens whose state was never persisted. Set the factory before `super.onCreate`:

```kotlin title=android/app/src/main/java/com/awesomeproject/MainActivity.kt
import android.os.Bundle
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Must run before super.onCreate so Android uses it while restoring fragments.
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
  }
}
```

React Navigation does not yet support Android's predictive back gesture, so opt out of it in the
manifest. Leaving it on produces a back animation that previews the wrong screen:

```xml title=android/app/src/main/AndroidManifest.xml
<application
  android:enableOnBackInvokedCallback="false"
  >
  <!-- ... -->
</application>
```
@tab iOS
No Swift or Objective-C changes are needed for basic navigation. You do need the pods installed
after adding `react-native-screens`, because it ships native view managers:

```bash
cd ios && bundle exec pod install
```

iOS-specific native work starts when you add deep links — see
[Deep Linking and Universal Links](deep-linking.md) for the `AppDelegate.swift` changes and
Associated Domains setup.
:::

## Basic example

This is the whole shape of an app: a container, a navigator, and screens registered on it.

```tsx title=src/App.tsx
import {Button, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Details: {itemId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  return (
    <View>
      <Button title="Open item" onPress={() => navigation.navigate('Details', {itemId: '42'})} />
    </View>
  );
}

function DetailsScreen({route}: NativeStackScreenProps<RootStackParamList, 'Details'>) {
  return <Text>Item {route.params.itemId}</Text>;
}

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{title: 'Home'}} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## How it works

Three pieces do the work, and it helps to know which one to blame when something misbehaves.

| Piece | Responsibility |
| --- | --- |
| **Container** | Owns the navigation state tree, links it to the platform (back button, deep links), and exposes it to the rest of the app. |
| **Router** | A pure function. Given the current state and an action such as `NAVIGATE` or `GO_BACK`, it returns the next state. Stack, tab and drawer routers differ only here. |
| **View** | Renders the state. The native stack view maps the state onto `react-native-screens` containers so iOS and Android drive the transitions natively. |

The state is a plain serialisable object — an index and an array of routes, nested one navigator
inside another. That is what makes [State Persistence](state-persistence.md) and
[Deep Linking and Universal Links](deep-linking.md) possible at all: both are conversions to and
from that object.

A **screen** is registered with a name and a component. The name is the key you navigate to and
the key the linking config maps a URL onto. The component receives two props, `navigation` and
`route`, and every screen in the same navigator shares the navigator's `screenOptions` unless it
overrides them.

### Static or dynamic configuration

Version 7 added a second way to declare a navigator. Both are supported, both are current, and
they differ in where the screen list lives.

**Dynamic** builds the tree from JSX, as in the example above. Screens can be added, removed or
reordered at render time, which is how conditional authentication flows are usually written.

**Static** passes a configuration object to the navigator factory, and the param list is inferred
from it rather than declared by hand:

```tsx title=src/App.tsx (static)
import {Text} from 'react-native';
import {createStaticNavigation} from '@react-navigation/native';
import type {StaticParamList, StaticScreenProps} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

function HomeScreen() {
  return <Text>Home</Text>;
}

function DetailsScreen({route}: StaticScreenProps<{itemId: string}>) {
  return <Text>Item {route.params.itemId}</Text>;
}

const RootStack = createNativeStackNavigator({
  initialRouteName: 'Home',
  screens: {
    Home: HomeScreen,
    Details: {
      screen: DetailsScreen,
      options: {title: 'Details'},
      linking: {path: 'item/:itemId'},
    },
  },
});

// Inferred from the config above — there is no hand-written param list.
export type RootParamList = StaticParamList<typeof RootStack>;

const Navigation = createStaticNavigation(RootStack);

export function App() {
  return <Navigation />;
}
```

Note the two differences in the second example: `createStaticNavigation` replaces
`NavigationContainer`, and the deep-link path lives next to the screen instead of in a separate
linking config.

| | Dynamic | Static |
| --- | --- | --- |
| Screen list | JSX children, evaluated at render | Plain object, fixed at module load |
| Param list types | You write it, `createNativeStackNavigator<ParamList>()` | Inferred with `StaticParamList` |
| Conditional screens | Render them conditionally | `if:` on a screen or group, taking a hook |
| Deep link config | One `linking.config.screens` object | `linking` per screen, assembled for you |
| Container | `NavigationContainer` | `createStaticNavigation(tree)` |

Pick one per app. Mixing them in the same tree is possible — a static navigator can contain a
navigator built dynamically — but it makes the typing harder to follow for no benefit. This
handbook uses the dynamic API in most examples because it makes the param list explicit, which is
what most readers need to see.

## Platform differences

:::tabs
@tab iOS
The native stack uses `UINavigationController`, so the swipe-back gesture, the large-title
behaviour and the header blur come from the system rather than from JavaScript. Header options
that mention `headerLargeTitle`, `headerBlurEffect` or `headerSearchBarOptions` only do something
here.
@tab Android
The native stack uses Fragments. There is no edge swipe-back gesture; the hardware and gesture
back are wired to the navigator's `GO_BACK` action. Options such as `navigationBarColor` and
`statusBarStyle` map onto Android window flags. The predictive back gesture is unsupported and
must be disabled in the manifest as shown above.
:::

## Common patterns

**Navigate from a component that is not a screen.** Use the `useNavigation` hook rather than
threading the prop through. Give it an explicit type so the call is checked:

```tsx title=src/components/OpenItemButton.tsx
import {Button} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Details: {itemId: string};
};

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function OpenItemButton({itemId}: {itemId: string}) {
  const navigation = useNavigation<Navigation>();
  return <Button title="Open" onPress={() => navigation.navigate('Details', {itemId})} />;
}
```

There is a way to skip the generic on every call — see
[Params and Typed Routes](params-and-typed-routes.md).

**Navigate from outside React.** A push notification handler or a network interceptor has no
component to hook into. Create a container ref and check `isReady()` before using it, because
events can arrive before the tree mounts:

```tsx title=src/navigationRef.ts
import {createNavigationContainerRef} from '@react-navigation/native';

type RootStackParamList = {
  Home: undefined;
  Details: {itemId: string};
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openItem(itemId: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Details', {itemId});
  }
}
```

Pass it to the container with `<NavigationContainer ref={navigationRef}>`.

**Run work only while a screen is focused.** `useEffect` runs when the component mounts, and a
screen further down a stack stays mounted. `useFocusEffect` runs on focus and cleans up on blur:

```tsx title=src/screens/FeedScreen.tsx
import {useCallback, useState} from 'react';
import {Text} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

export function FeedScreen() {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setCount((c) => c + 1), 1000);
      // Stop polling when the screen is covered, not when it unmounts.
      return () => clearInterval(id);
    }, []),
  );

  return <Text>{count}</Text>;
}
```

The `useCallback` is required, not stylistic: `useFocusEffect` re-subscribes whenever the callback
identity changes, so an inline function re-runs the effect on every render.

## Performance considerations

The container re-renders its subtree when navigation state changes. Anything expensive placed
between the container and the navigator — a context provider that recomputes, a theme object built
inline — runs on every navigation. Hoist it or memoise it.

Screens stay mounted when you push on top of them. That is what makes going back instant, and it
is also why a screen that polls or subscribes keeps doing so while invisible. The full treatment,
including `freezeOnBlur` and lazy tabs, is in
[Navigation Performance](navigation-performance.md).

## Common mistakes

- **Forgetting the `RNScreensFragmentFactory` on Android.** Wrong: leaving `MainActivity.kt`
  untouched. The app works in development and then crashes after Android recreates the Activity
  from a killed process. Right: set `supportFragmentManager.fragmentFactory` before
  `super.onCreate`.
- **Leaving predictive back enabled.** `android:enableOnBackInvokedCallback` defaults to the
  platform behaviour on new projects; React Navigation does not support it yet, and the back
  preview shows the wrong screen.
- **Using `useEffect` where `useFocusEffect` belongs.** A pushed screen does not unmount, so
  `useEffect` cleanup never runs while the user is two screens deeper and your timer keeps firing.
- **Calling `navigation.navigate` for a screen that is already focused.** `navigate` goes to the
  existing route and merges params rather than pushing a new copy. When you genuinely want a
  second copy of the same screen — a thread of profiles, for instance — use `navigation.push`.
- **Installing a navigator without its peers.** `@react-navigation/native-stack` declares
  `react-native-screens` and `react-native-safe-area-context` as peer dependencies. Package
  managers that do not auto-install peers leave you with a red screen at first render.
- **Skipping `pod install` after adding a navigator.** The JavaScript resolves, the native view
  manager does not exist, and the error names a component you never wrote.

## Related topics

- [Native Stack](native-stack.md) — the navigator nearly every app starts with.
- [Params and Typed Routes](params-and-typed-routes.md) — the typing pattern that makes navigation calls checked.
- [Nesting Navigators](nesting.md) — combining a stack with tabs or a drawer.
- [Navigation Performance](navigation-performance.md) — screens, freezing and lazy rendering.
- [Deep Linking and Universal Links](deep-linking.md) — mapping URLs onto the state tree.
- [Your First Screen](../getting-started/your-first-screen.md) — what a screen component looks like before navigation exists.
