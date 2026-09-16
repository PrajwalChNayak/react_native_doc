---
title: Nested Navigators
description: How nested _layout.tsx files become nested navigators in Expo Router 57, and what that does to back, dismiss, headers, anchors and reaching a parent navigator.
status: current
toolchain: expo
sdk: 57
---

Every `_layout.tsx` that exports a navigator creates a navigator, and a directory inside another
directory creates a navigator inside another navigator. The file tree *is* the nesting. You never
register a child navigator as a screen of its parent, the way you do in React Navigation; Expo
Router does that from the directories.

```text
src/app/
├── _layout.tsx              # Stack (outer)
├── (tabs)/
│   ├── _layout.tsx          # Tabs — a screen of the outer Stack
│   ├── feed/
│   │   ├── _layout.tsx      # Stack (inner) — a screen of Tabs
│   │   ├── index.tsx        # "/feed"
│   │   └── [id].tsx         # "/feed/42"
│   └── profile.tsx          # "/profile"
└── settings.tsx             # "/settings" — pushed on the outer Stack
```

The navigation itself is path-based: `router.push('/feed/42')` works from anywhere. What nesting
decides is **which navigator the new screen lands in**, and therefore what is on screen around it
and what back does afterwards.

## Why it exists / when to use it — and when NOT to

Nesting is how you get both kinds of navigation at once: peers (tabs, a drawer) and history (a
stack). The two most common shapes each answer a real design question:

| Shape | Result |
| --- | --- |
| Stack **around** Tabs | detail screens pushed on the outer stack **cover** the tab bar |
| Stack **inside** each tab | detail screens stay **inside** the tab; the bar stays visible, and each tab keeps its own history |

Many apps use both: a stack inside each tab for browsing, and routes at the root for things that
should cover everything (settings, a full-screen player, modals).

Do **not** nest to organise files. Every navigator is a boundary that changes what `back()` and
`dismiss()` do, allocates native views, and adds a header. If a directory only needs grouping, use
a [group](groups.md) without a `_layout.tsx`. If it only needs a wrapper, use a component.

## Basic example

A stack inside a tab, so opening a post keeps the tab bar on screen:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{headerShown: false}} />
      <Stack.Screen name="settings" options={{title: 'Settings'}} />
    </Stack>
  );
}
```

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{headerShown: false}}>
      <Tabs.Screen name="feed" options={{title: 'Feed'}} />
      <Tabs.Screen name="profile" options={{title: 'Profile'}} />
    </Tabs>
  );
}
```

```tsx title=src/app/(tabs)/feed/_layout.tsx
import {Stack} from 'expo-router';

export default function FeedLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{title: 'Feed'}} />
      <Stack.Screen name="[id]" options={{title: 'Post'}} />
    </Stack>
  );
}
```

Two header decisions keep this from showing doubled headers: the outer stack hides its header for
`(tabs)`, and the tabs hide theirs, so the only visible header is the inner feed stack's.

## How it works

### A child navigator is a screen of its parent

In the tree above, the outer `Stack` has two screens: `(tabs)` and `settings`. The `Tabs` has two
screens: `feed` and `profile`. The inner `Stack` has `index` and `[id]`. That is why
`Stack.Screen name="(tabs)"` and `Tabs.Screen name="feed"` name a **directory** — from the parent's
point of view, the whole child navigator is one screen.

### Where a navigation lands

The router resolves the target path to a position in the tree and navigates the navigators on the
way there:

| From | Call | Result |
| --- | --- | --- |
| `/feed` | `router.push('/feed/42')` | pushed on the **inner** feed stack; tab bar visible |
| `/feed` | `router.push('/settings')` | pushed on the **outer** stack; covers the tabs |
| `/feed/42` | `router.push('/profile')` | switches tab; the feed stack keeps `/feed/42` for when the user returns |

### `back()` bubbles up

`router.back()` asks the closest navigator to go back. If it cannot — a stack showing its first
screen — the request goes to the parent. This is how React Navigation handles back, and
`expo-router` uses its own vendored copy of that React Navigation code:

- On `/feed/42`, back pops the inner stack to `/feed`.
- On `/feed`, the inner stack has nothing to pop, so the tab navigator handles it according to its
  back behaviour, and then the outer stack.
- On `/settings`, back pops the outer stack and reveals the tabs as they were.

### `dismiss` acts on the closest stack

`dismiss`, `dismissAll` and `canDismiss` look for the closest **stack**:

```tsx title=src/app/(tabs)/feed/[id].tsx
import {router} from 'expo-router';
import {Button, View} from 'react-native';

export default function Post() {
  return (
    <View>
      {/* Pops this tab's stack back to /feed; the other tabs are untouched. */}
      <Button title="Back to feed" onPress={() => router.dismissAll()} />
    </View>
  );
}
```

Calling `dismissAll()` here does not close the tab navigator or pop the outer stack.

### Anchors and cold starts

When a deep link opens `/feed/42` directly, the inner stack would otherwise contain only `[id]`,
and back would leave the tab. Nominate the route that should sit underneath:

```tsx title=src/app/(tabs)/feed/_layout.tsx
import {Stack} from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function FeedLayout() {
  return <Stack />;
}
```

The `withAnchor` option on `router.push` / `Link` asks for the same thing for a single navigation
into a navigator that is not mounted yet:

```tsx title=src/app/settings.tsx
import {Link} from 'expo-router';
import {View} from 'react-native';

export default function Settings() {
  return (
    <View>
      {/* Enters the feed stack with /feed rendered beneath /feed/42. */}
      <Link href="/feed/42" withAnchor>
        Latest post
      </Link>
    </View>
  );
}
```

### Reaching a parent navigator

`useNavigation()` returns the navigation object for the closest navigator. Its installed signature
also accepts an optional `parent` argument — a string or an `href` — to select an ancestor
navigator by its layout's path:

```tsx title=src/app/(tabs)/feed/[id].tsx
import {useNavigation} from 'expo-router';
import {useLayoutEffect} from 'react';
import {Text} from 'react-native';

export default function Post() {
  // The tab navigator that owns the feed stack.
  const tabs = useNavigation('/(tabs)');

  useLayoutEffect(() => {
    // Hide the tab bar only while this screen is shown.
    tabs.setOptions({tabBarStyle: {display: 'none'}});
    return () => tabs.setOptions({tabBarStyle: undefined});
  }, [tabs]);

  return <Text>Post</Text>;
}
```

That example is included because people reach for it; the better answer to "hide the tab bar on a
detail screen" is usually to put the detail route on the outer stack, as [Tabs](tabs.md) explains.

## Platform differences

:::tabs
@tab iOS
- The edge-swipe gesture pops the **closest** stack only. It never switches tabs.
- A stack inside a tab animates inside the tab's area, beneath the tab bar.
@tab Android
- The system back button bubbles exactly like `router.back()`: inner stack, then the tab
  navigator, then the outer stack, then the app exits.
- How the tab navigator handles back is its `backBehavior`; set it deliberately in nested setups
  so users can predict where back goes.
@tab Web
- The browser back button follows browser history, which is a single flat list. It does not
  bubble through navigators; it returns to the previous URL, whichever navigator that was in.
:::

## Common patterns

### Full-screen routes at the root, browsing inside tabs

```text
src/app/
├── _layout.tsx          # Stack
├── (tabs)/              # tabs, each with its own Stack
├── player.tsx           # covers the tab bar
└── compose.tsx          # presented as a modal from the root Stack
```

Anything that should cover the tab bar belongs at the root. Anything that is browsing within a tab
belongs in that tab's directory.

### Switching tab and resetting its stack

```tsx title=src/components/home-button.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export function HomeButton() {
  // dismissTo pops to /feed if it is in the stack, otherwise replaces with it.
  return <Button title="Home" onPress={() => router.dismissTo('/feed')} />;
}
```

## Performance considerations

- **Each tab's stack keeps its screens mounted.** Three tabs each three screens deep is nine mounted
  trees. Keep deep stacks shallow, or reset them when leaving a flow.
- **Every navigator allocates native views** and a header. Remove navigators that exist only for
  structure.
- **`setOptions` on a parent re-renders the parent navigator.** Calling it from an effect that runs
  often, such as on scroll, costs a navigator render each time.

## Common mistakes

- **Doubled headers.** The outer stack, the tabs and the inner stack each draw a header by default.
  Decide which one owns the header and set `headerShown: false` on the others.
- **Putting a detail route at the root and expecting the tab bar to stay.** Routes at the root push
  on the outer stack and cover the tabs. Move the route into the tab's directory.
- **Expecting `dismissAll()` to close everything.** It returns to the first screen of the closest
  stack only.
- **No anchor on a nested stack.** A cold-start deep link lands with no history in that stack, and
  back unexpectedly leaves the tab.
- **Naming a nested file in the parent's `Screen`.** `Tabs.Screen name="feed/index"` does not
  configure the `feed` tab; the tab is the `feed` directory, so the name is `feed`.
- **Nesting a stack only to share a background.** That is a component's job; a navigator changes
  back behaviour.
- **Assuming the web back button behaves like Android's.** Web back follows URL history, not the
  navigator tree.

## Related topics

- [Layouts](layouts.md) — the `_layout.tsx` files that create each navigator.
- [Stack](stack.md) — the navigator most often nested.
- [Tabs](tabs.md) — a stack inside each tab, and hiding the bar properly.
- [Modals](modals.md) — a stack presented modally.
- [Navigation and Params](navigation-and-params.md) — the `router` methods whose scope nesting decides.
- [Migrating from React Navigation](migrating-from-react-navigation.md) — nested navigators without registering them by hand.
