---
title: Groups
description: Parenthesised directories in Expo Router — organising routes and attaching layouts without adding a URL segment, plus array groups and shared routes.
status: current
toolchain: expo
sdk: 57
---

A directory whose name is wrapped in parentheses is a **group**. It organises files and gives them
a layout, but it contributes nothing to the URL.

```text
src/app/(tabs)/feed.tsx   ->  /feed      not  /(tabs)/feed
src/app/(auth)/login.tsx  ->  /login     not  /(auth)/login
```

That is the whole feature. Its usefulness comes from what a directory implies: a directory can have
its own `_layout.tsx`, so a group is how you give a set of routes their own navigator without
pushing a segment into every URL.

## Why it exists / when to use it — and when NOT to

Without groups, every layout boundary would show up in the URL. An app with a tab bar would have
`/tabs/feed` and `/tabs/profile`, and a signed-in area would be `/app/settings`. Those segments
carry no meaning for the user and would be baked into every link, bookmark and deep link.

Use a group when:

- **A set of routes needs a shared layout** — a tab bar, a drawer, an auth-only stack.
- **A set of routes needs a shared provider** — attach it in the group's `_layout.tsx`.
- **You want to separate concerns in the file tree** — `(marketing)` and `(app)` at the root, with
  nothing in the URL to show for it.

Do **not** use a group when you actually want the segment. `/settings/profile` needs a real
`settings` directory, not `(settings)`. And do not add a group whose `_layout.tsx` is only
`<Slot />` wrapped in a `View` — that is a component, and an extra navigator boundary changes back
behaviour for no gain.

## Basic example

```text
src/app/
├── _layout.tsx              # Stack — the root
├── (tabs)/
│   ├── _layout.tsx          # Tabs
│   ├── index.tsx            # "/"
│   ├── search.tsx           # "/search"
│   └── profile.tsx          # "/profile"
└── posts/
    └── [id].tsx             # "/posts/42" — pushes over the tab bar
```

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{headerShown: false}}>
      <Tabs.Screen name="index" options={{title: 'Feed'}} />
      <Tabs.Screen name="search" options={{title: 'Search'}} />
      <Tabs.Screen name="profile" options={{title: 'Profile'}} />
    </Tabs>
  );
}
```

The URLs are `/`, `/search` and `/profile`. `(tabs)` never appears.

## How it works

### Groups are invisible to URLs, visible to layouts

Expo Router strips group segments when building the URL, but keeps them when building the
navigator tree. So a group is simultaneously:

- **absent** from `href`s, from `usePathname()`, and from the address bar on web;
- **present** in `useSegments()`, which reports the file path, not the URL.

That asymmetry is the basis of the auth pattern: `useSegments()` tells you *which part of the file
tree* the user is in, even though the URL does not.

```tsx title=src/app/(app)/settings.tsx
import {usePathname, useSegments} from 'expo-router';
import {Text, View} from 'react-native';

export default function Settings() {
  const pathname = usePathname(); // "/settings"
  const segments = useSegments(); // ["(app)", "settings"]

  return (
    <View>
      <Text>{pathname}</Text>
      <Text>{segments.join(' / ')}</Text>
    </View>
  );
}
```

### Two groups can both claim the root

Each group may have its own `index.tsx`, and both are `/`. That is a collision, and the router
cannot pick for you:

```text
src/app/(tabs)/index.tsx    ->  "/"
src/app/(auth)/index.tsx    ->  "/"   collision
```

Only one route may answer a given URL. Give one of them a real name, or gate them so only one is
registered at a time — see [Redirects and Auth-Gated Routes](redirects-and-auth.md), where
`Stack.Protected` makes exactly this arrangement legal by registering only one group at a time.

### `unstable_settings` and the anchor route

A group's layout can nominate which of its routes is the anchor — the screen rendered underneath
when the user arrives directly at a sibling:

```tsx title=src/app/(tabs)/_layout.tsx
import {Tabs} from 'expo-router/js-tabs';

export const unstable_settings = {
  anchor: 'index',
};

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{title: 'Feed'}} />
      <Tabs.Screen name="profile" options={{title: 'Profile'}} />
    </Tabs>
  );
}
```

Without this, a deep link straight to `/profile` can open with an empty history, and the user has
nowhere to go back to.

### Array groups share one set of files across several trees

A directory named `(a,b)` generates the routes **once per name**. Expo Router calls these shared
routes:

```text
src/app/(app,admin)/dashboard.tsx
```

This produces a `dashboard` route inside both the `(app)` tree and the `(admin)` tree, from one
file. Each tree gets its own layout, so the same screen can render inside two different navigators.

```tsx title=src/app/(app,admin)/dashboard.tsx
import {useSegments} from 'expo-router';
import {Text} from 'react-native';

export default function Dashboard() {
  const segments = useSegments();
  // segments[0] is "(app)" or "(admin)" depending on which tree rendered it.
  const isAdmin = segments[0] === '(admin)';

  return <Text>{isAdmin ? 'Admin dashboard' : 'Dashboard'}</Text>;
}
```

Array groups are powerful and easy to over-use. Reach for one only when the screen is genuinely
identical and the difference is which layout wraps it. Two files that share a component are simpler
to read.

### Targeting a group explicitly

You normally never write a group in an `href`, but you can, and occasionally you must — when two
trees would otherwise be ambiguous:

```tsx title=src/app/index.tsx
import {Link} from 'expo-router';
import {View} from 'react-native';

export default function Home() {
  return (
    <View>
      {/* Disambiguates which tree to enter when a plain "/dashboard" is ambiguous. */}
      <Link href="/(admin)/dashboard">Admin dashboard</Link>
    </View>
  );
}
```

The group still does not appear in `usePathname()` afterwards. It is a routing instruction, not
part of the address.

## Platform differences

Groups behave identically on iOS, Android and web — they are a build-time naming convention, not a
runtime feature. The one thing to watch is web: because the group is stripped, two routes that
collide at `/` produce a genuinely ambiguous URL that a user can bookmark. Native hides the
symptom; web makes it obvious.

## Common patterns

### Split the app into signed-out and signed-in trees

```text
src/app/
├── _layout.tsx              # Stack with Stack.Protected
├── sign-in.tsx              # "/sign-in"
└── (app)/
    ├── _layout.tsx          # the signed-in chrome
    ├── index.tsx            # "/"
    └── settings.tsx         # "/settings"
```

The `(app)` group keeps `/app` out of every authenticated URL while giving the whole signed-in area
one layout to hang the session provider and the guard on.

### Attach a provider to part of the app only

```tsx title=src/app/(shop)/_layout.tsx
import {Slot} from 'expo-router';
import {createContext, useMemo, useState, type ReactNode} from 'react';

type Cart = {count: number; add: () => void};
const CartContext = createContext<Cart>({count: 0, add: () => {}});

function CartProvider({children}: {children: ReactNode}) {
  const [count, setCount] = useState(0);
  const value = useMemo(() => ({count, add: () => setCount((c) => c + 1)}), [count]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default function ShopLayout() {
  return (
    <CartProvider>
      <Slot />
    </CartProvider>
  );
}
```

Routes outside `(shop)` never mount the provider, so its state does not exist on screens that do
not need it.

### Group by chrome, not by feature

If `posts` and `profile` share a tab bar and `checkout` does not, the grouping is `(tabs)` versus
outside it — not `(posts)`, `(profile)`, `(checkout)`. Groups are a layout tool; the file tree
under them can still be organised by feature.

## Performance considerations

- **Each group with a `_layout.tsx` is a navigator boundary.** Native navigators allocate native
  views, so a chain of four groups that exist only for tidiness costs four boundaries.
- **Array groups multiply route count.** `(a,b,c)/x.tsx` generates three routes. On a large tree
  this grows the generated route table and the typed-routes declaration file.
- **A provider in a group layout mounts as soon as any route in the group is visited** and stays
  mounted for as long as the user is in that subtree.

## Common mistakes

- **Expecting the group in the URL.** `(settings)/profile` is `/profile`. If you wanted
  `/settings/profile`, drop the parentheses.
- **Two groups each with `index.tsx`.** Both claim `/`. Only one can win. Gate them with
  `Stack.Protected`, or rename one.
- **Using `usePathname()` to work out which group you are in.** The group is stripped from the
  pathname. `useSegments()` is the hook that still sees it.
- **Adding a group purely to nest a `View`.** An extra `_layout.tsx` is an extra navigator, which
  changes what `router.back()` and `dismiss()` do. Use a plain component.
- **Reaching for an array group when a shared component would do.** `(a,b)/screen.tsx` couples two
  trees to one file. If the screens diverge later, splitting them is a refactor.
- **Assuming a group isolates state.** It does not by itself. State is isolated by the provider you
  mount in its layout, not by the parentheses.

## Related topics

- [The app Directory](app-directory.md) — groups alongside every other filename convention.
- [Layouts](layouts.md) — the `_layout.tsx` that makes a group worth having.
- [Tabs](tabs.md) — the most common reason to create a group.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — the `(app)` / `sign-in` split in full.
- [Nested Navigators](nested-navigators.md) — what all these boundaries do to back behaviour.
- [Navigation and Params](navigation-and-params.md) — `useSegments()` and `usePathname()`.
