---
title: Drawer
description: The drawer navigator in Expo Router 57 — the expo-router/drawer entry point, the peer dependencies it needs, custom drawer content, and why it needs a development build.
status: current
toolchain: expo
sdk: 57
---

A drawer is a panel that slides in from the edge of the screen. In Expo Router it is a navigator
like any other: a directory whose `_layout.tsx` exports `Drawer`, with each route file in that
directory becoming a drawer item.

```tsx title=src/app/_layout.tsx
import Drawer from 'expo-router/drawer';

export default function DrawerLayout() {
  return <Drawer />;
}
```

Unlike `Stack` and `Tabs`, `Drawer` comes from a **separate entry point** and needs peer packages
installed. That is the part people get wrong.

## Why it exists / when to use it — and when NOT to

A drawer is for a long, flat list of destinations that do not deserve permanent screen space:
settings, archived items, account switching, an admin section.

Do **not** use it for primary navigation on a phone. It hides the destinations behind a gesture or
a hamburger button, which costs discoverability, and on Android it competes with the system back
gesture. Tabs are the better default for the three-to-five things people actually use.

A drawer earns its place when:

- there are more destinations than a tab bar can hold, **and**
- most of them are visited rarely, **and**
- you are on a tablet or the web, where the drawer can stay permanently open.

## Installation

`Drawer` is bundled inside `expo-router` — it uses `react-native-drawer-layout` internally, so
there is no `@react-navigation/drawer` package to install. What you do need are the gesture and
animation packages:

```bash
npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets
```

On SDK 57 that resolves `react-native-gesture-handler@~2.32.0`, `react-native-reanimated@4.5.1` and
`react-native-worklets@0.10.1` — the versions the SDK pins. Reanimated 4 does not bundle the
worklets runtime, which is why `react-native-worklets` is a separate install.

> [!WARNING] Expo Go vs development build
> All three of these are native modules. `react-native-gesture-handler`,
> `react-native-reanimated` and `react-native-screens` are included in Expo Go, so a drawer will
> run there — but the moment you add any other library with native code, Expo Go stops being an
> option. Plan on a
> [development build](../expo-development-builds/why-you-need-one.md).

Reanimated also needs its Babel plugin. In an SDK 57 project `babel-preset-expo` wires this up, so
check `babel.config.js` before adding it by hand.

## Basic example

```text
src/app/
├── _layout.tsx        # Drawer
├── index.tsx          # "/"
├── archive.tsx        # "/archive"
└── settings.tsx       # "/settings"
```

```tsx title=src/app/_layout.tsx
import Drawer from 'expo-router/drawer';

export default function DrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        drawerType: 'front',
        headerShown: true,
      }}>
      <Drawer.Screen name="index" options={{drawerLabel: 'Home', title: 'Home'}} />
      <Drawer.Screen name="archive" options={{drawerLabel: 'Archive', title: 'Archive'}} />
      <Drawer.Screen name="settings" options={{drawerLabel: 'Settings', title: 'Settings'}} />
    </Drawer>
  );
}
```

`drawerLabel` is the text in the panel; `title` is the header title. They are separate because they
usually differ — the drawer entry is a noun, the header is context.

## How it works

### The options that matter

| Option | What it does |
| --- | --- |
| `drawerLabel` | text in the drawer list |
| `drawerIcon` | `({focused, color, size}) => ReactNode` |
| `drawerType` | `front` (overlay), `back`, `slide`, `permanent` |
| `drawerPosition` | `left` or `right` |
| `drawerStyle` | style of the panel itself, e.g. `{width: 280}` |
| `swipeEnabled` | whether the edge swipe opens it |
| `headerShown` | whether each screen gets a header with a toggle button |

`drawerType: 'permanent'` is the one that makes a drawer worth using on a large screen: the panel
never closes and the content sits beside it.

### Opening and closing it

There is no `router.openDrawer()`. The drawer is a React Navigation navigator, and you reach it
through `useNavigation()`:

```tsx title=src/app/index.tsx
import {useNavigation} from 'expo-router';
import type {DrawerNavigationProp} from 'expo-router/drawer';
import {Button, View} from 'react-native';

export default function Home() {
  // The type argument is what makes openDrawer visible to TypeScript.
  const navigation = useNavigation<DrawerNavigationProp<Record<string, object | undefined>>>();

  return (
    <View>
      <Button title="Open menu" onPress={() => navigation.openDrawer()} />
    </View>
  );
}
```

`openDrawer`, `closeDrawer` and `toggleDrawer` all live on that navigation object. Typing it as
`DrawerNavigationProp` is what makes them visible to TypeScript — the untyped `useNavigation()`
returns the generic navigation shape, which does not have them.

`expo-router/drawer` also re-exports `useDrawerStatus`, which tells you whether the panel is open
without you tracking it yourself.

### `DrawerToggleButton` for the header

```tsx title=src/app/_layout.tsx
import Drawer, {DrawerToggleButton} from 'expo-router/drawer';

export default function DrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        headerLeft: () => <DrawerToggleButton />,
      }}
    />
  );
}
```

### Custom drawer content

The default panel is a list of the routes. Replace it with `drawerContent`:

```tsx title=src/app/_layout.tsx
import Drawer, {
  DrawerContentScrollView,
  DrawerItemList,
  DrawerItem,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import {router} from 'expo-router';
import {StyleSheet, Text} from 'react-native';

function CustomDrawerContent(props: DrawerContentComponentProps) {
  return (
    <DrawerContentScrollView {...props}>
      <Text style={styles.heading}>My App</Text>
      {/* Keeps the automatic list of routes... */}
      <DrawerItemList {...props} />
      {/* ...and adds an entry that is not a route in this navigator. */}
      <DrawerItem label="Help" onPress={() => router.push('/help')} />
    </DrawerContentScrollView>
  );
}

export default function DrawerLayout() {
  return <Drawer drawerContent={CustomDrawerContent} />;
}

const styles = StyleSheet.create({
  heading: {fontSize: 18, fontWeight: '600', padding: 16},
});
```

Spreading `props` into `DrawerContentScrollView` is not optional — it carries the safe-area insets
and the scroll configuration.

### Hiding a route from the drawer

Same mechanism as tabs: `drawerItemStyle: {display: 'none'}` hides the entry while leaving the
route reachable. If it should not be reachable at all, move it out of the directory or wrap it in
`Drawer.Protected`.

## Platform differences

:::tabs
@tab iOS
- There is no hardware back button, so an open drawer is dismissed by the swipe or by tapping the
  scrim. If you set `swipeEnabled: false`, make sure a visible control closes it.
- The drawer overlays the screen; it does not participate in the interactive back gesture, and the
  two gestures can compete at the screen edge. Test edge swipes on a real device.

@tab Android
- The system back button closes an open drawer before it pops the navigator. This is handled for
  you and is what users expect.
- Edge-to-edge is on by default in SDK 57, so custom drawer content must handle the status bar and
  navigation bar insets. `DrawerContentScrollView` does this when you spread `props` into it.
- The drawer sits above the app content, so a `drawerStyle` background that is partly transparent
  will show the screen behind it.
:::

On web, `drawerType: 'permanent'` above a breakpoint is the usual pattern, because a hamburger
menu on a 1400px-wide window is hiding navigation for no reason.

## Common patterns

### Permanent on large screens, overlay on small

```tsx title=src/app/_layout.tsx
import Drawer from 'expo-router/drawer';
import {useWindowDimensions} from 'react-native';

export default function DrawerLayout() {
  const {width} = useWindowDimensions();
  const isLarge = width >= 768;

  return (
    <Drawer
      screenOptions={{
        drawerType: isLarge ? 'permanent' : 'front',
        // A permanent drawer needs no toggle button.
        headerShown: !isLarge,
      }}
    />
  );
}
```

### A drawer wrapping tabs

```text
src/app/
├── _layout.tsx              # Drawer
├── settings.tsx             # a drawer destination
└── (tabs)/
    ├── _layout.tsx          # Tabs — one drawer destination containing tabs
    ├── index.tsx
    └── search.tsx
```

The drawer is the outer navigator, so its panel slides over the tab bar. Doing it the other way
round — a drawer inside one tab — gives each tab its own drawer, which is almost never intended.

## Performance considerations

- **The drawer panel mounts eagerly.** Custom `drawerContent` renders before the user opens the
  panel, so avoid fetching there; the request runs on cold start whether or not the drawer is used.
- **`drawerType: 'permanent'` keeps both trees mounted.** That is the point, but it doubles the
  work on a layout pass. Do not make the panel expensive.
- **Gesture Handler and Reanimated add to bundle and startup cost.** If the only reason you have
  them is a drawer you rarely use, a plain screen pushed onto the stack may be the better trade.

## Common mistakes

- **Importing `Drawer` from `expo-router`.** It is not exported there. The entry point is
  `expo-router/drawer`.
- **Installing `@react-navigation/drawer`.** Not needed on SDK 57 — the drawer is bundled inside
  `expo-router` on top of `react-native-drawer-layout`. Installing it separately gets you a second
  copy at a version the SDK did not pin.
- **Installing the peers with a bare package-manager command.** Use `npx expo install` so the
  versions match SDK 57. A `react-native-reanimated` built for a different SDK fails at runtime,
  not at install time.
- **Forgetting `react-native-worklets`.** Reanimated 4 does not bundle it. Without it, animations
  fail at runtime with an unhelpful error.
- **Calling `navigation.openDrawer()` on an untyped `useNavigation()`.** It exists at runtime but
  TypeScript will not admit it. Pass `DrawerNavigationProp` as the type argument.
- **Not spreading `props` into `DrawerContentScrollView`.** The panel then ignores safe-area
  insets and content ends up under the status bar.
- **Using a drawer as primary navigation on a phone.** Everything behind it is one gesture less
  discoverable. Prefer tabs.

## Related topics

- [Layouts](layouts.md) — `_layout.tsx` and how navigators are declared.
- [Tabs](tabs.md) — the navigator to prefer for primary navigation.
- [Stack](stack.md) — what usually sits inside each drawer destination.
- [Nested Navigators](nested-navigators.md) — drawer around tabs, and what back does.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — the native dependency question.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why the peers must come from `expo install`.
