---
title: Layouts
description: What _layout.tsx does, how Slot differs from a navigator, how nesting works, and where providers, auth gates and shared chrome belong.
status: current
toolchain: expo
sdk: 57
---

A `_layout.tsx` file wraps every route in its directory. It is where the navigator lives, where
providers are mounted, and where anything that must survive navigation between sibling routes
belongs.

Layouts are the piece that turns a flat list of files into a navigation tree. A directory with a
`_layout.tsx` exporting `<Stack>` is a stack; the same directory exporting `<Tabs>` is a tab bar.
Nothing else about the files changes.

## Why it exists / when to use it — and when NOT to

Without layouts, every screen would have to render its own chrome and its own providers, and state
would be destroyed on every navigation because each screen is a separate React tree. A layout
stays mounted while its children come and go.

Write a `_layout.tsx` when you need:

- **A navigator** — `Stack`, `Tabs`, `Drawer`, or a custom one.
- **Persistent state or providers** — a session context, a query client, a theme.
- **Shared chrome** — a header, a background, a safe-area wrapper.
- **A guard** — see [Redirects and Auth-Gated Routes](redirects-and-auth.md).

Do **not** write one just to add padding to a group of screens. A layout that only renders
`<Slot />` inside a styled `View` is a component; put it in the screens or in a shared wrapper. Each
layout is a real React Navigation navigator boundary, and unnecessary boundaries make
`router.back()` and `dismiss()` behave in ways nobody predicted.

## Basic example

Every route file in `app/` renders inside `app/_layout.tsx`.

```text
src/app/
├── _layout.tsx     # this file
├── index.tsx       # "/"
└── settings.tsx    # "/settings"
```

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        // Applies to every screen in this stack unless a screen overrides it.
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="index" options={{title: 'Home'}} />
      <Stack.Screen name="settings" options={{title: 'Settings'}} />
    </Stack>
  );
}
```

## How it works

### A layout is rendered above its routes, and stays mounted

When you navigate from `/` to `/settings`, `app/_layout.tsx` does **not** unmount. Its state
survives; only the screen below it changes. That is the entire reason providers go here.

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import {createContext, useMemo, useState, type ReactNode} from 'react';

type Theme = {dark: boolean; toggle: () => void};
const ThemeContext = createContext<Theme>({dark: false, toggle: () => {}});

function ThemeProvider({children}: {children: ReactNode}) {
  const [dark, setDark] = useState(false);
  // Memoised: a fresh object here re-renders every screen on every layout render.
  const value = useMemo(() => ({dark, toggle: () => setDark((d) => !d)}), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack />
    </ThemeProvider>
  );
}
```

### `Slot` renders the child route without a navigator

`<Slot />` is the layout equivalent of `{children}`. It renders whichever child route is active and
adds no navigator, no header and no animation.

```tsx title=src/app/(marketing)/_layout.tsx
import {Slot} from 'expo-router';
import {StyleSheet, View} from 'react-native';

export default function MarketingLayout() {
  return (
    <View style={styles.container}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
});
```

Use `Slot` when the directory needs a wrapper but not a navigator — most commonly at the root of a
web-first layout, or in a group that exists only to attach a provider. Because there is no
navigator, there is no back stack: navigating between siblings replaces the content outright.

### `Stack.Screen` in a layout configures; in a screen it overrides

Two places can set screen options, and they mean different things.

In the layout, `<Stack.Screen name="..." />` **declares and configures** a route:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{title: 'Home'}} />
      <Stack.Screen name="modal" options={{presentation: 'modal', title: 'New post'}} />
    </Stack>
  );
}
```

In the screen file, the same component **overrides options for that screen only**, at render time,
so the options can depend on data the layout does not have:

```tsx title=src/app/posts/[id].tsx
import {Stack, useLocalSearchParams} from 'expo-router';
import {Text, View} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();

  return (
    <View>
      {/* No `name` prop here — it applies to the current screen. */}
      <Stack.Screen options={{title: `Post ${id}`}} />
      <Text>Post {id}</Text>
    </View>
  );
}
```

You do not have to list every route as a `<Stack.Screen>`. Files are discovered automatically; the
element exists so you can give a route options, initial params, listeners, or a guard.

### Layouts nest, and so do navigators

```text
src/app/
├── _layout.tsx              # Stack
└── (tabs)/
    ├── _layout.tsx          # Tabs — nested inside the Stack
    ├── feed.tsx
    └── profile.tsx
```

The result is a stack whose first screen is a tab navigator. Pushing from inside a tab pushes onto
the **outer** stack, so the new screen covers the tab bar. Pushing onto a stack that lives *inside*
a tab keeps the tab bar visible. Which one you get is decided entirely by where the `_layout.tsx`
files sit. [Nested Navigators](nested-navigators.md) works through the consequences.

### `unstable_settings` picks the anchor route

A stack's first screen is normally the first route it finds, which for a group is not always what
you want. Export `unstable_settings` from the layout to say otherwise:

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';

export const unstable_settings = {
  // The route rendered underneath when the user deep-links straight into a sibling.
  anchor: 'feed',
};

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="feed" options={{title: 'Feed'}} />
      <Tabs.Screen name="profile" options={{title: 'Profile'}} />
    </Tabs>
  );
}
```

`anchor` is the SDK 57 name; `initialRouteName` is still accepted for compatibility. It matters for
deep links: without an anchor, opening `/profile` from a cold start can leave the user with no way
back, because nothing was pushed underneath.

### Error boundaries are a layout-adjacent export

Any route or layout file may export an `ErrorBoundary`, which catches render errors in that subtree.
See [Error Boundaries](error-boundaries.md).

## Platform differences

`Slot` behaves identically everywhere because it does nothing platform-specific. Navigators do not:

| | iOS | Android | Web |
| --- | --- | --- | --- |
| `Stack` | native `UINavigationController` screens | native fragments | DOM, history API |
| Back gesture | edge swipe, built in | system back button | browser back |
| `Drawer` | gesture-driven overlay | gesture-driven overlay, plus hardware back closes it | overlay |

A layout that assumes a hardware back button exists will misbehave on iOS, and one that assumes an
edge-swipe gesture will misbehave on Android. Where you need per-platform chrome, branch inside the
layout rather than creating two layouts.

## Common patterns

### Root layout that mounts providers and nothing else

```tsx title=src/app/_layout.tsx
import {Stack, ThemeProvider, DarkTheme, DefaultTheme} from 'expo-router';
import {useColorScheme} from 'react-native';

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{headerShown: false}} />
    </ThemeProvider>
  );
}
```

`ThemeProvider`, `DarkTheme` and `DefaultTheme` are re-exported from `expo-router` itself — you do
not install a `@react-navigation/*` package to get them.

### A group layout that adds chrome without a navigator

```tsx title=src/app/(app)/_layout.tsx
import {Slot} from 'expo-router';
import {SafeAreaView, StyleSheet} from 'react-native';

export default function AppLayout() {
  return (
    <SafeAreaView style={styles.safe}>
      <Slot />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
});
```

### Hiding a screen's header only when it has one

Set `headerShown` on the navigator, not on every screen, and override where it differs:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{headerShown: false}}>
      {/* Only this route wants the native header. */}
      <Stack.Screen name="posts/[id]" options={{headerShown: true, title: 'Post'}} />
    </Stack>
  );
}
```

## Performance considerations

- **A layout render re-renders every screen under it.** Keep derived values memoised and avoid
  putting fast-changing state (scroll position, text input values) in a layout-level context.
- **Every `_layout.tsx` is a navigator boundary with real cost.** Native navigators allocate native
  views. Four nested navigators to express "these screens share a background" is four times the
  work for no benefit — use a plain wrapper component instead.
- **Do not fetch in a layout unless every child needs it.** A layout mounts before any of its
  children and stays mounted, so a fetch there runs on cold start whether or not the user visits
  the screens that need the data.

## Common mistakes

- **Fetching or subscribing in a layout and expecting it to stop.** Layouts do not unmount when you
  navigate between their children. A subscription started there lives for the life of the subtree.
- **Creating a context value inline.** `<Ctx.Provider value={{user, signOut}}>` allocates a new
  object every render, so every consumer re-renders on every layout render. Wrap it in `useMemo`.
- **Using `<Slot />` and then expecting a back stack.** `Slot` is not a navigator. `router.back()`
  will act on whichever navigator is actually above it.
- **Putting `<Stack.Screen name="..." />` in the screen file.** Inside a screen, `Stack.Screen`
  takes no `name` — it configures the current route. Passing `name` there does not register a route.
- **Wrapping the navigator in a `View` without `flex: 1`.** The navigator collapses to zero height
  and you get a blank screen with no error.
- **Adding a layout per directory out of habit.** Only add one where you need a navigator, a
  provider, or a guard. Extra layouts change back behaviour.

## Related topics

- [The app Directory](app-directory.md) — where `_layout.tsx` fits among the other conventions.
- [Stack](stack.md) — the stack navigator and its options.
- [Tabs](tabs.md) — the three tab implementations in SDK 57.
- [Drawer](drawer.md) — the drawer navigator and its peer dependencies.
- [Nested Navigators](nested-navigators.md) — what nesting does to back, dismiss and params.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — why the guard belongs in the layout.
- [Error Boundaries](error-boundaries.md) — the `ErrorBoundary` export.
