---
title: Tabs
description: The three tab implementations in Expo Router 57 — the JavaScript Tabs navigator, the alpha native tabs, and the headless UI primitives — and how to pick one.
status: current
toolchain: expo
sdk: 57
---

A tab layout is a directory whose `_layout.tsx` exports a tabs navigator. Each route file in that
directory becomes a tab.

Expo Router 57 ships **three** tab implementations, which is confusing until you know why: the
original JavaScript one, an alpha native one that uses the platform's real tab bar, and a headless
set of primitives for when you want to draw the bar yourself.

## Why it exists / when to use it — and when NOT to

Tabs are for **peer destinations**: places the user switches between, where each keeps its own
state and its own history. Feed, Search, Profile.

They are not for a flow. If step two only makes sense after step one, that is a stack. And a tab
bar with seven items is a menu that has been drawn badly — both platforms degrade past five.

Which implementation:

| | Import | Use when |
| --- | --- | --- |
| **JavaScript tabs** | `expo-router/js-tabs` | the default; full styling control, works on web |
| **Native tabs** | `expo-router/unstable-native-tabs` | you want the genuine platform tab bar (iOS liquid glass, Android Material) and can accept an alpha API |
| **Headless tabs** | `expo-router/ui` | you are drawing a completely custom bar and want only the routing |

> [!NOTE] Where `Tabs` is imported from changed
> In the installed `expo-router` 57.0.21 types, `import {Tabs} from 'expo-router'` is marked
> **deprecated** in favour of `import {Tabs} from 'expo-router/js-tabs'`. The old import still
> works and still appears in much of the published documentation. This page uses the non-deprecated
> path.

## Basic example

```text
src/app/
├── _layout.tsx              # Stack
└── (tabs)/
    ├── _layout.tsx          # Tabs
    ├── index.tsx            # "/"
    ├── search.tsx           # "/search"
    └── profile.tsx          # "/profile"
```

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';
import {Text} from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0a7ea4',
      }}>
      <Tabs.Screen
        name="index"
        options={{title: 'Feed', tabBarIcon: ({color}) => <Text style={{color}}>F</Text>}}
      />
      <Tabs.Screen
        name="search"
        options={{title: 'Search', tabBarIcon: ({color}) => <Text style={{color}}>S</Text>}}
      />
      <Tabs.Screen
        name="profile"
        options={{title: 'Profile', tabBarIcon: ({color}) => <Text style={{color}}>P</Text>}}
      />
    </Tabs>
  );
}
```

The `(tabs)` group keeps `/feed` out of the URLs — see [Groups](groups.md).

## How it works

### The tab bar is driven by screen options

| Option | What it does |
| --- | --- |
| `title` | the tab label and the header title |
| `tabBarIcon` | `({focused, color, size}) => ReactNode` |
| `tabBarBadge` | a badge value on the tab |
| `tabBarActiveTintColor` | colour of the focused tab |
| `tabBarShowLabel` | hide labels and show icons only |
| `headerShown` | whether each tab gets its own header |
| `href` | Expo Router addition — set to `null` to hide a route from the bar |

`href: null` is the Expo Router-specific one, and it is how you keep a route inside the tabs
directory without giving it a tab:

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Feed'}} />
      {/* Reachable by URL and by push, but not shown in the bar. */}
      <Tabs.Screen name="onboarding" options={{href: null}} />
    </Tabs>
  );
}
```

### Each tab keeps its own state

Switching tabs does not unmount the tab you left. That is the point — you can scroll the feed,
visit search, come back, and still be where you were. It also means a tab's effects keep running
while it is not visible. Use `useFocusEffect` when work should only happen while the tab is
focused.

### Native tabs use the platform's real tab bar

```tsx title=src/app/(tabs)/_layout.tsx
import {Badge, Icon, Label} from 'expo-router';
import {NativeTabs} from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>Feed</Label>
        <Icon sf="house.fill" drawable="ic_home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <Label>Inbox</Label>
        <Icon sf="tray.fill" drawable="ic_inbox" />
        <Badge>3</Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

`Label`, `Icon` and `Badge` are imported from `expo-router` itself, not from the native-tabs entry
point. `Icon` takes `sf` for an SF Symbol on iOS and `drawable` for an Android drawable resource.

> [!WARNING] Native tabs are alpha
> The import path is literally `expo-router/unstable-native-tabs`. The API is subject to change
> between SDK releases, and there is no non-`unstable` alias in 57.0.21. Use it when the native
> look genuinely matters and you are prepared to fix breakage on the next upgrade.

### Headless tabs give you routing without a bar

```tsx title=src/app/(tabs)/_layout.tsx
import {TabList, TabSlot, TabTrigger, Tabs} from 'expo-router/ui';
import {StyleSheet, Text} from 'react-native';

export default function TabLayout() {
  return (
    <Tabs>
      {/* Renders the active tab's screen. */}
      <TabSlot />
      {/* Your own bar — any layout you like. */}
      <TabList style={styles.bar}>
        <TabTrigger name="home" href="/">
          <Text>Home</Text>
        </TabTrigger>
        <TabTrigger name="profile" href="/profile">
          <Text>Profile</Text>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12},
});
```

You get the routing — state per tab, correct back behaviour, URL integration — and you draw
everything. The order matters: `TabList` after `TabSlot` puts the bar at the bottom; before it, the
top.

## Platform differences

:::tabs
@tab iOS
- The JavaScript tab bar is drawn in React Native and does not automatically pick up the system
  tab bar appearance.
- `NativeTabs` renders a `UITabBarController`, so it inherits the platform appearance, including
  the minimise-on-scroll behaviour where the OS supports it.
- Icons in `NativeTabs` come from SF Symbols via `Icon`'s `sf` prop.
- The safe-area inset under the bar is handled for you; do not add your own bottom padding on top
  of it.

@tab Android
- The system back button pops within the focused tab first, then leaves the tab navigator. This is
  `backBehavior`, and it is worth setting deliberately rather than inheriting the default.
- `NativeTabs` renders the Material tab bar; icons come from `Icon`'s `drawable` prop, naming an
  Android drawable resource.
- Edge-to-edge is on by default in SDK 57, so a custom `TabList` needs to account for the
  navigation bar inset itself.
:::

## Common patterns

### A stack inside each tab

```text
src/app/
└── (tabs)/
    ├── _layout.tsx          # Tabs
    ├── feed/
    │   ├── _layout.tsx      # Stack — pushes keep the tab bar visible
    │   ├── index.tsx
    │   └── [id].tsx
    └── profile.tsx
```

Pushing `/feed/42` from inside the feed tab stays inside that tab and keeps the bar on screen.
Pushing onto the **root** stack instead covers the bar. See
[Nested Navigators](nested-navigators.md).

### A badge driven by state

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';
import {useState} from 'react';

export default function TabLayout() {
  const [unread] = useState(3);

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Feed'}} />
      <Tabs.Screen
        name="inbox"
        options={{title: 'Inbox', tabBarBadge: unread > 0 ? unread : undefined}}
      />
    </Tabs>
  );
}
```

### Hiding the tab bar on a detail screen

Do not fight the tab navigator for this. Put the detail route **outside** the tabs directory so it
pushes onto the parent stack, which naturally covers the bar:

```text
src/app/
├── _layout.tsx          # Stack
├── (tabs)/              # tab bar lives here
│   ├── _layout.tsx
│   └── index.tsx
└── posts/[id].tsx       # pushes over the tab bar
```

## Performance considerations

- **Tabs are mounted lazily but not unmounted.** The first visit mounts the tab; leaving it does
  not tear it down. A tab that subscribes to a socket keeps that socket for the session.
- **A `tabBarIcon` that allocates per render is called on every navigation.** Keep the render
  function cheap, and do not build `StyleSheet` objects inside it.
- **Heavy lists in background tabs still hold memory.** If three tabs each hold a long list, the
  app holds three long lists. Virtualise them, and consider clearing offscreen data on blur for
  genuinely large datasets.

## Common mistakes

- **Importing `Tabs` from `expo-router`.** It still works but is deprecated in 57.0.21. Use
  `expo-router/js-tabs`.
- **Importing `Label`, `Icon` or `Badge` from `expo-router/unstable-native-tabs`.** They are not
  exported there — they come from `expo-router`.
- **Expecting `expo-router/native-tabs` to exist.** In 57.0.21 the only entry point is
  `expo-router/unstable-native-tabs`.
- **Using `href: null` when you meant to delete the route.** `href: null` hides the tab but the
  route is still reachable by URL and by deep link. If it should not be reachable, move it out of
  the directory or guard it.
- **Trying to hide the bar with `tabBarStyle: {display: 'none'}` on one screen.** It is fragile and
  animates badly. Move the screen to the parent stack instead.
- **Assuming a tab remounts on every switch.** It does not, so `useEffect(..., [])` runs once per
  session. Use `useFocusEffect` for per-visit work.
- **Putting more than five tabs in the bar.** Both platforms overflow or shrink to unreadable. Use
  a "More" route.

## Related topics

- [Layouts](layouts.md) — what a `_layout.tsx` is doing here.
- [Groups](groups.md) — why the directory is called `(tabs)`.
- [Stack](stack.md) — the navigator you nest inside or around tabs.
- [Nested Navigators](nested-navigators.md) — tab bar visible or covered, and why.
- [Navigation and Params](navigation-and-params.md) — `useFocusEffect` and per-visit work.
- [Drawer](drawer.md) — the other peer-destination navigator.
