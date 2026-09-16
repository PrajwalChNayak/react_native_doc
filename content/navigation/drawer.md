---
title: Drawer
description: The side drawer navigator — its real install cost (gesture-handler, Reanimated 4 and the separate worklets runtime), custom content, and when a drawer is the wrong answer.
status: current
toolchain: cli
---

A drawer is a panel that slides in from the side of the screen, usually holding a list of
destinations that would not fit in a tab bar. `@react-navigation/drawer` implements it on top of
`react-native-drawer-layout`, which means a real gesture and a real animation — and therefore the
heaviest install of the three navigators in this section.

Read the installation section carefully. The drawer is where most React Native projects first meet
the Reanimated 4 packaging change, and almost every tutorial written before it still gets this
wrong.

## Why it exists / when to use it — and when NOT to

A drawer buys screen space. Six or ten destinations, account switching, a settings link and a sign
out do not fit in a bottom bar, and a drawer holds all of them without stealing a row of pixels
from every screen.

It costs discoverability. Content behind an edge swipe or a hamburger button is content most users
never open. If your app has three or four main areas, [Tabs](tabs.md) are better: always visible,
one tap, no gesture to learn.

The honest rule is to use a drawer for secondary navigation — the things a user needs occasionally —
and tabs or a stack for the things they need constantly. Many apps use both, with the drawer
attached above the tabs.

> [!DEPRECATED] Not `DrawerLayoutAndroid`
> React Native core still exports `DrawerLayoutAndroid`, but it is deprecated in 0.87, and it is
> Android-only. `react-native-drawer-layout` — which the drawer navigator already depends on — is
> the cross-platform replacement. Do not build a drawer on the core component.

## Installing

This is four packages, not one, and the order of the traps matters.

:::tabs
@tab npm
```bash
npm install @react-navigation/drawer@7.13.10
npm install react-native-gesture-handler@3.3.0
npm install react-native-reanimated@4.6.0 react-native-worklets@0.12.2
```
@tab yarn
```bash
yarn add @react-navigation/drawer@7.13.10
yarn add react-native-gesture-handler@3.3.0
yarn add react-native-reanimated@4.6.0 react-native-worklets@0.12.2
```
@tab pnpm
```bash
pnpm add @react-navigation/drawer@7.13.10
pnpm add react-native-gesture-handler@3.3.0
pnpm add react-native-reanimated@4.6.0 react-native-worklets@0.12.2
```
:::

> [!WARNING] Reanimated 4 does not bundle its worklets runtime
> `react-native-reanimated@4.6.0` declares `react-native-worklets: 0.12.x` as a **peer dependency**.
> It is a separate install and a separate native build. Installing Reanimated alone gives you a
> build that fails the moment a worklet runs, with an error about a missing worklets module that
> does not name the package you are missing.

Then add the Babel plugin. This is the second half of the same trap: the plugin lives in the
worklets package now.

```js title=babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Must be last in the plugin list.
    'react-native-worklets/plugin',
  ],
};
```

`react-native-reanimated/plugin` still resolves — in 4.6.0 it is a four-line file that does
`require('react-native-worklets/plugin')` and re-exports it — but `react-native-worklets/plugin` is
the real name and the one to write. Restart Metro with `npm start -- --reset-cache` after editing
`babel.config.js`; Babel output is cached and the plugin will otherwise appear not to work.

Finally, `pod install`, and wrap the app in `GestureHandlerRootView`:

```bash
cd ios && bundle exec pod install
```

> [!NOTE] Gesture Handler 3 needs React Native 0.82 or newer
> `react-native-gesture-handler@3.3.0` supports React Native 0.82+, which 0.87 satisfies. On older
> projects you are on the 2.x line instead.

## Basic example

`GestureHandlerRootView` must wrap the whole app, above the navigation container, or the drawer's
swipe gesture never receives touches.

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationContainer} from '@react-navigation/native';
import {createDrawerNavigator} from '@react-navigation/drawer';
import type {DrawerScreenProps} from '@react-navigation/drawer';

type DrawerParamList = {
  Inbox: undefined;
  Folder: {folderId: string};
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

function InboxScreen() {
  return <Text>Inbox</Text>;
}

function FolderScreen({route}: DrawerScreenProps<DrawerParamList, 'Folder'>) {
  return <Text>{route.params.folderId}</Text>;
}

function SettingsScreen() {
  return <Text>Settings</Text>;
}

export function App() {
  return (
    // Required by react-native-gesture-handler; must be above the container.
    <GestureHandlerRootView style={{flex: 1}}>
      <NavigationContainer>
        <Drawer.Navigator
          screenOptions={{
            drawerType: 'front',
            drawerActiveTintColor: '#1f6feb',
            swipeEdgeWidth: 40,
          }}>
          <Drawer.Screen name="Inbox" component={InboxScreen} />
          <Drawer.Screen
            name="Folder"
            component={FolderScreen}
            initialParams={{folderId: 'archive'}}
            options={{drawerLabel: 'Archive'}}
          />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
        </Drawer.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
```

## How it works

The drawer router is the tab router with one extra piece of state: whether the drawer is open. That
is why `backBehavior` works the same way here, and why `navigation.openDrawer()`,
`closeDrawer()` and `toggleDrawer()` are actions on the router rather than component state.

The panel itself is `react-native-drawer-layout`. The swipe is a `PanGesture` from
`react-native-gesture-handler`, and the translation is a Reanimated shared value driven on the UI
thread — which is why the drawer keeps tracking your finger while the JavaScript thread is busy,
and why the dependency list is what it is.

`drawerType` changes the relationship between the panel and the content:

| Value | Behaviour |
| --- | --- |
| `'front'` | The drawer slides over the content. The default, and the safest. |
| `'back'` | The content slides away to reveal the drawer beneath it. |
| `'slide'` | Both move together, as one sheet. |
| `'permanent'` | The drawer is always visible and the content sits beside it. No gesture, no overlay. |

`'permanent'` is what makes a drawer work on a tablet: the same navigator, a different `drawerType`
chosen from the window width. See [Responsive and Tablet Layouts](../styling/responsive-layouts.md).

## Platform differences

:::tabs
@tab Android
Android users expect an edge swipe and a hamburger button, and expect the hardware back button to
close an open drawer before it does anything else — which the drawer router already does.

`drawerStatusBarAnimation` (`'slide'`, `'fade'` or `'none'`) applies when
`drawerHideStatusBarOnOpen` is set. Both are most relevant here, where a full-height drawer next to
a visible status bar looks unfinished.
@tab iOS
There is no system drawer on iOS, so the pattern is borrowed rather than native. The edge swipe also
competes with the system back gesture when a native stack sits inside the drawer: both live on the
left edge.

The practical fix is `swipeEdgeWidth`, which controls how far in from the edge a swipe is accepted,
or disabling `swipeEnabled` on screens inside a nested stack and leaving the drawer to the header
button.
:::

## Common patterns

**Custom drawer content.** The default content is the list of screens. Anything more — a header, a
sign-out row, a section divider — replaces it with your own component, reusing `DrawerItemList` so
you do not reimplement focus state:

```tsx title=src/navigation/DrawerContent.tsx
import {StyleSheet, Text, View} from 'react-native';
import {
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from '@react-navigation/drawer';
import type {DrawerContentComponentProps} from '@react-navigation/drawer';

export function DrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.header}>
        <Text style={styles.name}>Signed in</Text>
      </View>
      {/* Renders the navigator's screens with their focus state intact. */}
      <DrawerItemList {...props} />
      <DrawerItem label="Sign out" onPress={() => {}} />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header: {paddingHorizontal: 16, paddingVertical: 24},
  name: {fontSize: 18, fontWeight: '600'},
});
```

`DrawerContentScrollView` is not a plain `ScrollView` — it applies the safe-area insets for the
drawer's edges. Use it rather than rolling your own, or the first item ends up under the status bar.

**React to the drawer opening.** `useDrawerStatus` returns `'open'` or `'closed'` and re-renders on
change, which is the supported way to pause something while the drawer covers the screen:

```tsx title=src/screens/MapScreen.tsx
import {Text} from 'react-native';
import {useDrawerStatus} from '@react-navigation/drawer';

export function MapScreen() {
  const status = useDrawerStatus();
  const isOpen = status === 'open';

  // Stop following the user's location while the drawer covers the map.
  return <Text>{isOpen ? 'paused' : 'tracking'}</Text>;
}
```

**Open it from a button.** `navigation.toggleDrawer()` exists on any screen inside the drawer.
`DrawerToggleButton` from the same package is the ready-made header button, which is usually what
you want in `headerLeft`.

**Turn the drawer permanent on wide screens.** One navigator, one derived option:

```tsx title=src/App.tsx
import {Text, useWindowDimensions} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {NavigationContainer} from '@react-navigation/native';
import {createDrawerNavigator} from '@react-navigation/drawer';

type DrawerParamList = {
  Inbox: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  const {width} = useWindowDimensions();
  const isWide = width >= 768;

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <NavigationContainer>
        <Drawer.Navigator
          screenOptions={{
            drawerType: isWide ? 'permanent' : 'front',
            // A permanent drawer has no overlay to tap, so the button is pointless there.
            headerLeft: isWide ? () => null : undefined,
          }}>
          <Drawer.Screen name="Inbox" component={Placeholder} />
          <Drawer.Screen name="Settings" component={Placeholder} />
        </Drawer.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
```

## Performance considerations

`lazy` defaults to `true`: a drawer screen is not created until it is first opened. With ten
destinations that is the difference between mounting one screen at startup and mounting ten.

Screens stay mounted afterwards. `freezeOnBlur: true` stops React re-rendering the ones that are not
visible, and `popToTopOnBlur: true` resets a nested stack when its drawer screen is left. Both are
per-screen options.

`detachInactiveScreens` is on by default and removes inactive screens from the native view
hierarchy. Leaving it on is correct; turning it off is a workaround for a specific measurement bug,
not a tuning knob.

The gesture itself runs on the UI thread, so it does not benefit from anything you do in JavaScript
— but a screen doing heavy work on mount still makes the *first* open of that screen feel slow,
because the drawer animation and the screen's first render start at the same moment.

## Common mistakes

- **Installing Reanimated without `react-native-worklets`.** Wrong:
  `npm install react-native-reanimated@4.6.0` alone. Reanimated 4 declares
  `react-native-worklets: 0.12.x` as a peer and ships no worklets runtime. Right: install both, and
  rebuild the native app — a Metro restart is not enough for a new native dependency.
- **Adding the Babel plugin under its old name and stopping there.** `react-native-reanimated/plugin`
  still works because it re-exports the worklets plugin, but writing
  `react-native-worklets/plugin` is what matches the package that actually provides it. Either way
  the plugin must be **last** in the `plugins` array.
- **Forgetting to reset the Metro cache.** Babel transform output is cached. After editing
  `babel.config.js` the old, unplugged output is served and the drawer animates incorrectly or not
  at all. `npm start -- --reset-cache`.
- **Omitting `GestureHandlerRootView`.** The screens render, the header button works, and the swipe
  does nothing at all. There is no error — gesture handler simply never receives the touch.
- **Putting `GestureHandlerRootView` inside a screen.** It has to be the root, above
  `NavigationContainer`, and it needs `style={{flex: 1}}` or it collapses to zero height and the app
  renders blank.
- **Using a drawer as the only navigation.** Anything behind an edge swipe is effectively hidden.
  Primary destinations belong in tabs; a drawer is for the long tail.
- **Building on `DrawerLayoutAndroid`.** It is deprecated in 0.87 and Android-only.

## Related topics

- [Tabs](tabs.md) — the better choice for three to five primary destinations.
- [Nesting Navigators](nesting.md) — a drawer wrapping tabs, and each tab wrapping a stack.
- [Gesture Handler](../animation/gesture-handler.md) — what `GestureHandlerRootView` is doing.
- [The UI Thread and Worklets](../animation/worklets.md) — why the worklets package is separate.
- [Animated vs Reanimated](../animation/animated-vs-reanimated.md) — the wider Reanimated 4 setup.
- [Responsive and Tablet Layouts](../styling/responsive-layouts.md) — choosing `drawerType` by width.
- [Navigation Performance](navigation-performance.md) — `lazy`, `freezeOnBlur` and detaching screens.
