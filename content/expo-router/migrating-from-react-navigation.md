---
title: Migrating from React Navigation
description: Moving an app from hand-registered React Navigation navigators to Expo Router 57 — what stays the same because expo-router vendors React Navigation's code internally, what maps to a file, and where the two genuinely differ.
status: current
toolchain: expo
sdk: 57
---

Expo Router does not bring a different navigation engine. The installed `expo-router` 57.0.21
package **vendors React Navigation's code internally**: it has no `@react-navigation/*` dependency,
and instead ships its own copy under `build/react-navigation/` (`core`, `native`, `native-stack`,
`bottom-tabs`, `drawer`, `elements`, `routers` and more), with some files marked in their source as
forked from React Navigation. Its `useNavigation` is documented as mirroring React Navigation's
`navigation` object. So the navigation object, screen options, focus events and themes follow the
React Navigation API you already know. What Expo Router replaces is the *registration* — the
`NavigationContainer`, the `createXNavigator()` calls, the screen list and the `linking` config —
with the file system.

So most of a migration is moving code, not rewriting it. The part that needs thought is params,
because Expo Router's params are URL parameters.

> [!NOTE] Two React Navigation versions on this site
> The CLI half of this site documents **React Navigation 7** (`@react-navigation/native` 7.3.18)
> on **React Native 0.87**. This page is about **Expo SDK 57**, which ships **React Native 0.86.3**,
> and `expo-router` 57.0.21. In that version `expo-router` carries its own copy of the React
> Navigation code, exposed at `expo-router/react-navigation`, and does not depend on the
> `@react-navigation/*` packages. Do not copy version numbers or install commands from the
> [CLI navigation pages](../navigation/fundamentals.md) into an Expo project.

## Why it exists / when to use it — and when NOT to

Migrate when the costs of hand registration are the ones you are paying: screens registered in one
file, typed in another and linked in a third; a `linking` config that drifts from the navigator;
web URLs that do not exist.

Do **not** migrate when:

- **The project is on the React Native Community CLI** without Expo. Expo Router is an Expo SDK
  package. Stay on React Navigation, which is documented in the
  [CLI half of this site](../navigation/fundamentals.md).
- **Navigation is owned by native code** in a brownfield app. Expo Router expects to own the root.
- **Your navigation depends heavily on passing objects or callbacks as params.** That pattern does
  not survive the move to URLs, and the rewrite is the real cost. Price it before starting.

## Basic example

The same two-screen app, before and after.

**Before — React Navigation.** This is a fragment because `@react-navigation/*` is not installed in
an Expo SDK 57 project, which is the point of the migration:

```tsx-fragment title=App.tsx
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Profile: {userId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{title: 'Home'}} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**After — Expo Router:**

```text
src/app/
├── _layout.tsx             # replaces NavigationContainer + Stack.Navigator
├── index.tsx               # was HomeScreen
└── profile/
    └── [userId].tsx        # was ProfileScreen; the param is now part of the URL
```

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{title: 'Home'}} />
      <Stack.Screen name="profile/[userId]" options={{title: 'Profile'}} />
    </Stack>
  );
}
```

```tsx title=src/app/index.tsx
import {Link} from 'expo-router';
import {View} from 'react-native';

export default function Home() {
  return (
    <View>
      <Link href={{pathname: '/profile/[userId]', params: {userId: '42'}}}>Open profile</Link>
    </View>
  );
}
```

```tsx title=src/app/profile/[userId].tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Profile() {
  const {userId} = useLocalSearchParams<{userId: string}>();
  return <Text>User {userId}</Text>;
}
```

`package.json` `main` becomes `expo-router/entry`, which mounts the navigation container for you.

## How it works

### The concept map

| React Navigation | Expo Router 57 |
| --- | --- |
| `NavigationContainer` | provided by `expo-router/entry`; do not render one |
| `createNativeStackNavigator()` + `<Stack.Navigator>` | `_layout.tsx` exporting `Stack` from `expo-router` |
| bottom tabs navigator | `_layout.tsx` exporting `Tabs` from `expo-router/js-tabs` |
| drawer navigator | `_layout.tsx` exporting `Drawer` from `expo-router/drawer` |
| `<Stack.Screen name component>` | a file; `Stack.Screen name` is kept only to set options |
| nested navigator as a screen | a directory with its own `_layout.tsx` |
| `initialRouteName` | `export const unstable_settings = {anchor: '…'}` |
| `navigation.navigate('Profile', {userId})` | `router.navigate({pathname: '/profile/[userId]', params: {userId}})` |
| `navigation.push` / `replace` / `goBack` / `popToTop` | `router.push` / `replace` / `back` / `dismissAll` |
| `navigation.reset(...)` to a known state | `router.replace`, or `router.dismissTo` |
| `route.params` | `useLocalSearchParams()` |
| `RootStackParamList` type | generated by [typed routes](typed-routes.md) |
| `linking` prop and config | automatic — every file has a URL |
| screens rendered conditionally for auth | `Stack.Protected guard={…}` |
| `navigation.setOptions` | `<Stack.Screen options>` rendered in the screen, or `useNavigation().setOptions` |
| custom navigator | `withLayoutContext` |

### What you keep, imported from `expo-router`

These are exported from `expo-router` in 57.0.21, so the migration is usually a change of import
path:

| Export | Same role as in React Navigation |
| --- | --- |
| `useNavigation` | the navigation object for the current navigator |
| `useRoute` | the current route object |
| `useFocusEffect`, `useIsFocused` | focus-scoped work and state |
| `useScrollToTop` | scroll a list to the top when its tab is pressed again |
| `ThemeProvider`, `DefaultTheme`, `DarkTheme`, `useTheme` | navigation theming |

The vendored `native`, `core` and `elements` layers — including hooks such as `usePreventRemove` —
are exported from `expo-router/react-navigation`.

```tsx title=src/app/profile/[userId].tsx
import {useFocusEffect, useNavigation} from 'expo-router';
import {useCallback} from 'react';
import {Text} from 'react-native';

export default function Profile() {
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      // Same contract as React Navigation's useFocusEffect: runs on focus, cleans up on blur.
      navigation.setOptions({title: 'Profile'});
    }, [navigation]),
  );

  return <Text>Profile</Text>;
}
```

### Params are strings now

This is the one real behavioural change. React Navigation params are an in-memory JavaScript object;
Expo Router params are URL parameters.

| React Navigation param | Expo Router |
| --- | --- |
| `{userId: 42}` | arrives as `'42'` |
| `{user: {id, name}}` | not supported — pass `user.id`, load the user on the screen |
| `{onDone: () => …}` | not supported — use a store, context, or `dismissTo` a route that reads the result |
| `{items: ['a', 'b']}` | supported as a repeated query parameter, arrives as `string[]` |

A callback param was always fragile in React Navigation too — it breaks state persistence and
cannot be deep-linked. The migration forces the fix.

### Nested navigation becomes a path

```tsx-fragment title=before.tsx
// React Navigation: name the navigator, then the screen inside it.
navigation.navigate('Root', {screen: 'Settings', params: {screen: 'Media'}});
```

```tsx title=src/components/media-settings-link.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export function MediaSettingsLink() {
  // Expo Router: the path already says which navigators to go through.
  return <Button title="Media settings" onPress={() => router.push('/settings/media')} />;
}
```

### Auth: conditional screens become `Protected`

React Navigation's recommended auth flow renders a different set of screens depending on state.
`Stack.Protected` is the same idea expressed around files:

```tsx title=src/app/_layout.tsx
import {Stack} from 'expo-router';
import {useState} from 'react';

export default function RootLayout() {
  const [signedIn] = useState(false);

  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
```

See [Redirects and Auth-Gated Routes](redirects-and-auth.md) for the full pattern.

## Platform differences

Expo Router's navigators come from its vendored copy of React Navigation's native stack, tabs and
drawer code, so platform behaviour — the iOS back gesture, the Android back button, native stack
presentations — should be familiar after the migration. Test it anyway: the vendored copy is
maintained with `expo-router`, not released in step with the `@react-navigation/*` packages.
What changes is web: with React Navigation, URLs on web existed only if you wrote a `linking`
config; with Expo Router, every screen has one, including screens you never meant to expose. Audit
routes that should not be reachable directly and guard them.

## Common patterns

### Migrate in order

1. **Map the navigator tree to directories** on paper first. Each navigator becomes a `_layout.tsx`;
   each screen a file.
2. **Rename screens to URL segments.** `ProfileScreen` with a `userId` param becomes
   `profile/[userId].tsx`.
3. **Replace object and callback params** with ids and shared state. This is the step that takes
   time.
4. **Swap `navigation.navigate('Name')` calls** for `href`s, and turn on typed routes so the
   compiler finds the ones you missed.
5. **Delete the `linking` config** and test your existing deep links against the new paths, adding
   `+native-intent.tsx` rewrites for any old URL shapes you must keep.
6. **Replace the auth conditional** with `Stack.Protected`.

### Keeping an old URL working

```tsx title=src/app/+native-intent.tsx
import type {NativeIntent} from 'expo-router';

export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({path}) => {
  // The old React Navigation linking config used /user/:id.
  if (path.startsWith('/user/')) return path.replace('/user/', '/profile/');
  return path;
};
```

## Performance considerations

- **Screen mounting behaviour is unchanged.** Stack screens below the top stay mounted and tabs are
  not unmounted when you leave them, the same model React Navigation uses.
- **Route files are bundled eagerly on native by default.** A React Navigation app that lazily
  `require`d screens will now include every route in the bundle; async routes are opt-in and
  production-ready on web only.
- **Extra navigator boundaries cost the same as before.** A directory with a `_layout.tsx` is a
  navigator. Do not create directories that add layouts you did not have.

## Common mistakes

- **Rendering a `NavigationContainer` inside Expo Router.** The router already provides one. A
  second container breaks linking and the `router` API.
- **Installing `@react-navigation/*` packages for things `expo-router` already exports.** Theming,
  focus hooks and the navigation object come from `expo-router`; a second copy at a different
  version causes context mismatches.
- **Copying React Navigation 7 install steps from the CLI half.** Those pages target React Native
  0.87 with separately installed packages. SDK 57 is React Native 0.86 with navigation bundled in
  `expo-router`.
- **Passing objects as params.** They become `"[object Object]"`. Pass an id.
- **Keeping component names in `Stack.Screen name`.** `name` is now the route path relative to the
  layout — `profile/[userId]`, not `Profile`.
- **Leaving shared components in `app/`.** Every file there is a route. Move them to
  `src/components/`.
- **Forgetting old deep links.** The new URLs come from filenames and may not match the old
  `linking` config. Rewrite or redirect the old shapes.

## Related topics

- [Expo Router Fundamentals](fundamentals.md) — the file-based model you are migrating to.
- [Layouts](layouts.md) — where navigators are declared now.
- [Navigation and Params](navigation-and-params.md) — the `router` API and string params.
- [Typed Routes](typed-routes.md) — the replacement for a hand-written param list.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — `Stack.Protected` for auth flows.
- [Deep Links and Universal Links](deep-linking.md) — replacing the `linking` config.
- [React Navigation on the CLI](../navigation/fundamentals.md) — the React Navigation 7 / React Native 0.87 half of this site.
