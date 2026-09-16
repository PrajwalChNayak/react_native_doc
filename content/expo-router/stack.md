---
title: Stack
description: The native stack navigator in Expo Router — screen options, headers, the SDK 57 Stack.Toolbar API including Stack.Toolbar.Badge, and Stack.Protected.
status: current
toolchain: expo
sdk: 57
---

`Stack` is the default navigator and the one most screens live in. It renders a native stack —
`UINavigationController` on iOS, native fragments on Android — through `react-native-screens`, so
push animations, the back gesture and the header are the platform's, not a JavaScript imitation.

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

That is a complete root layout. Every route file in `app/` becomes a screen of it.

## Why it exists / when to use it — and when NOT to

A stack models "I went somewhere, and I can come back". It is the right default because it matches
what the platform back gesture and the Android back button already do.

Use something else when:

- **The destinations are peers, not a history** — a tab bar or drawer. See [Tabs](tabs.md) and
  [Drawer](drawer.md).
- **You need no chrome and no history at all** — use `<Slot />` (see [Layouts](layouts.md)).

> [!NOTE] There is also a JavaScript stack
> `expo-router/js-stack` exports a JavaScript-implemented stack with the same file conventions. Use
> it when you need a transition the native stack cannot express, or when you are running on web and
> want identical animations everywhere. It costs you the native feel; prefer the native `Stack`.

## Basic example

```text
src/app/
├── _layout.tsx
├── index.tsx
└── posts/
    ├── index.tsx
    └── [id].tsx
```

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="index" options={{title: 'Home'}} />
      <Stack.Screen name="posts/index" options={{title: 'Posts'}} />
      <Stack.Screen name="posts/[id]" options={{title: 'Post'}} />
    </Stack>
  );
}
```

Note how a nested route is named: `posts/[id]`, the path relative to this layout, not `[id]`.

## How it works

### Options come from three places

In increasing order of precedence:

1. **`screenOptions`** on `<Stack>` — the default for every screen.
2. **`options`** on `<Stack.Screen name="…">` in the layout — per route, known statically.
3. **`<Stack.Screen options={…} />` rendered inside the screen file** — per route, at render time,
   so it can depend on data.

```tsx title=src/app/posts/[id].tsx
import {Stack, useLocalSearchParams} from 'expo-router';
import {Text, View} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();

  return (
    <View>
      <Stack.Screen options={{title: `Post ${id}`, headerBackTitle: 'Posts'}} />
      <Text>Post {id}</Text>
    </View>
  );
}
```

### The options worth knowing

| Option | What it does |
| --- | --- |
| `title` | header title, and the default back label on iOS |
| `headerShown` | show or hide the native header |
| `headerTransparent` | header floats above content |
| `presentation` | `card`, `modal`, `transparentModal`, `fullScreenModal`, `formSheet`, `pageSheet`, `containedModal`, `containedTransparentModal` |
| `animation` | `default`, `fade`, `fade_from_bottom`, `flip`, `simple_push`, `slide_from_bottom`, `slide_from_right`, `slide_from_left`, `none`, and the `ios_from_*` variants |
| `gestureEnabled` | allow the interactive back gesture |
| `sheetAllowedDetents` | detent stops for `presentation: 'formSheet'` |
| `sheetGrabberVisible` | the drag handle on a form sheet |

`presentation` is how you get modals; that has its own page, [Modals](modals.md).

### Declarative header components

SDK 57's `Stack` exposes header pieces as components you render from inside a screen, which is
easier to read than assembling `headerRight` functions:

```tsx title=src/app/inbox.tsx
import {Stack} from 'expo-router';
import {Text, View} from 'react-native';

export default function Inbox() {
  return (
    <View>
      <Stack.Title large>Inbox</Stack.Title>
      <Stack.SearchBar placeholder="Search mail" onChangeText={() => {}} />
      <Text>Messages</Text>
    </View>
  );
}
```

- **`Stack.Title`** sets the title; `large` turns on the iOS large-title mode, and `asChild` lets
  you render a custom component as the title.
- **`Stack.SearchBar`** wraps the native header search bar. Rendering it forces `headerShown: true`,
  because it is part of the native header.
- **`Stack.Header`** replaces the header entirely when given `asChild`.
- **`Stack.Screen.BackButton`** customises the back button.

### `Stack.Toolbar` — buttons, menus and badges in the header

`Stack.Toolbar` places buttons, menus and custom views into the header's left or right area, or
into a bottom toolbar.

```tsx title=src/app/inbox.tsx
import {Stack} from 'expo-router';
import {Text, View} from 'react-native';

export default function Inbox() {
  return (
    <View>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="bell" onPress={() => {}}>
          <Stack.Toolbar.Badge>3</Stack.Toolbar.Badge>
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Menu icon="ellipsis.circle">
          <Stack.Toolbar.MenuAction onPress={() => {}}>Mark all read</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction onPress={() => {}}>Settings</Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Text>Messages</Text>
    </View>
  );
}
```

Verified against the installed `expo-router` 57.0.21 types, the children of `Stack.Toolbar` are
`Button`, `Menu`, `MenuAction`, `SearchBarSlot`, `Spacer`, `View`, `Label`, `Icon` and `Badge`.

> [!WARNING] `Stack.Toolbar` is experimental
> The installed types mark it `@experimental`. It is an alpha API — available on iOS from SDK 55
> and on Android from SDK 56 — and its shape can change between SDKs. Do not build a design system
> on it yet.

Two SDK 57 specifics, both confirmed in the installed package:

- **`Stack.Toolbar.Badge` works in the header placements** (`placement="left"` and
  `placement="right"`), not in the bottom toolbar.
- **Toolbar menu icons render on Android.** The Android implementation draws toolbar children as
  native Compose components and overlays a Material 3 badge on a badged icon, including a spoken
  description so TalkBack announces the badge value.

`placement="bottom"` is the default and can only be used inside a **page** component, not a layout.
`placement="left"` and `placement="right"` force `headerShown: true`, because they are part of the
native header.

### `Stack.Protected` gates screens declaratively

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import {useState} from 'react';

export default function RootLayout() {
  const [session] = useState<string | null>(null);

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
```

A screen inside a failing guard is not registered, so it cannot be navigated to at all — including
by deep link. This is the recommended auth pattern and is covered fully in
[Redirects and Auth-Gated Routes](redirects-and-auth.md).

## Platform differences

:::tabs
@tab iOS
- The interactive back gesture is an edge swipe and is on by default; `gestureEnabled: false`
  disables it, which also disables the only way back if you hide the header.
- `Stack.Title` with `large` gives the collapsing large-title header.
- `headerBackTitle` sets the text next to the chevron; with
  `headerBackButtonDisplayMode: 'minimal'` only the chevron shows.
- `presentation: 'formSheet'` and `'pageSheet'` are genuine UIKit sheet presentations, and
  `sheetAllowedDetents` maps to UIKit detents.
- `Stack.Toolbar.Button` accepts an SF Symbol name for `icon`.

@tab Android
- There is no edge-swipe back by default; the system back button is the primary affordance. If you
  hide the header, make sure the hardware back still leads somewhere sensible.
- `presentation: 'formSheet'` and `'pageSheet'` fall back to `modal`.
- `animation: 'slide_from_right'` / `'slide_from_left'` and the `ios_from_*` variants are
  Android-only; on iOS they resolve to the default transition.
- Toolbar icons must be image sources — `require('./icon.png')` or `{uri: '…'}` — because SF
  Symbols are an Apple API. Branch on `Platform.OS` if you want both.
:::

## Common patterns

### Hide the header globally, opt in per screen

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{headerShown: false}}>
      <Stack.Screen name="posts/[id]" options={{headerShown: true, title: 'Post'}} />
    </Stack>
  );
}
```

### A title that depends on fetched data

```tsx title=src/app/posts/[id].tsx
import {Stack, useLocalSearchParams} from 'expo-router';
import {useEffect, useState} from 'react';
import {Text, View} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();
  const [title, setTitle] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetch(`https://example.com/posts/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data: {title: string}) => {
        if (!cancelled) setTitle(data.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View>
      {/* Falls back to a neutral title until the fetch resolves. */}
      <Stack.Screen options={{title: title ?? 'Post'}} />
      <Text>{title}</Text>
    </View>
  );
}
```

### Per-platform animation without duplicating the layout

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import {Platform} from 'react-native';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      }}
    />
  );
}
```

## Performance considerations

- **Screens below the top stay mounted.** Pushing does not unmount the screen underneath; it is
  detached from the native view hierarchy but its React state and effects survive. A polling
  interval started in `useEffect` keeps polling. Use `useFocusEffect` for focus-scoped work.
- **`screenOptions` as a function runs per screen, per render.** Keep it cheap; do not fetch or
  allocate heavy objects in it.
- **A deep stack holds every screen's tree in memory.** If users can push the same route many times
  (a chat thread that links to another thread), consider `dismissTo` or `dangerouslySingular` so the
  history does not grow without bound.

## Common mistakes

- **Naming a nested screen `[id]` instead of `posts/[id]`.** `Stack.Screen`'s `name` is the route
  path relative to that layout. A wrong name silently configures nothing.
- **Passing `name` to `Stack.Screen` inside a screen file.** There, the component configures the
  current route and takes no `name`. Only the layout form registers routes.
- **Disabling `gestureEnabled` and hiding the header on iOS.** You have removed both ways back, and
  iOS has no hardware back button. Provide an explicit control.
- **Expecting `presentation: 'formSheet'` to look the same on Android.** It falls back to `modal`.
  Design for the fallback or branch.
- **Putting `Stack.Toolbar placement="bottom"` in a layout.** The bottom placement only works
  inside a page component.
- **Expecting `Stack.Toolbar.Badge` in the bottom toolbar.** Badges apply to the header placements.
- **Assuming SF Symbol names work on Android.** They do not; supply an image source there.

## Related topics

- [Layouts](layouts.md) — where `<Stack>` lives and how it nests.
- [Modals](modals.md) — `presentation` and the sheet options in depth.
- [Tabs](tabs.md) — when the destinations are peers rather than a history.
- [Nested Navigators](nested-navigators.md) — a stack inside a tab, and what `back()` then means.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — `Stack.Protected` in full.
- [Navigation and Params](navigation-and-params.md) — `push`, `replace`, `dismiss` and `dismissTo`.
