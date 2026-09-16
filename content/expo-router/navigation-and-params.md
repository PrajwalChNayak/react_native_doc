---
title: Navigation and Params
description: Link, router and useRouter in Expo Router 57 — push versus navigate versus replace, dismissing, passing and reading URL parameters, and focus-scoped work.
status: current
toolchain: expo
sdk: 57
---

Expo Router gives you two ways to move between routes and a small set of hooks for reading where
you are. Every navigation target is an `href` — a path string or a `{pathname, params}` object —
because every screen has a URL.

- **Declarative:** `<Link href="…">`.
- **Imperative:** the `router` object, or the identical object returned by `useRouter()`.
- **Reading state:** `useLocalSearchParams`, `useGlobalSearchParams`, `usePathname`, `useSegments`.

Everything on this page was checked against the installed `expo-router` 57.0.21 type definitions.

## Why it exists / when to use it — and when NOT to

In React Navigation you navigate to a screen **name** and pass params as a JavaScript object. In
Expo Router you navigate to a **URL**, and params are URL parameters. That has consequences:

- A param is a **string** (or an array of strings) when you read it — never an object, function or
  class instance.
- Anything you pass must survive being written into a URL, because on web it is, and on native it
  can arrive the same way from a deep link.

So do **not** use params as a transport for data. Pass an identifier and load the data on the
destination screen, or share it through a store or context mounted in a layout.

Use `Link` when the thing on screen is a link. Use `router` when navigation is a consequence of
something else — a form submitting, a sign-in completing, a timer firing.

## Basic example

```tsx title=src/app/index.tsx
import {Link, router} from 'expo-router';
import {Button, StyleSheet, View} from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Link href="/settings">Settings</Link>
      <Link href={{pathname: '/posts/[id]', params: {id: '42'}}}>Post 42</Link>
      <Button title="New post" onPress={() => router.push('/posts/new')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, gap: 12, padding: 16},
});
```

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();
  return <Text>Post {id}</Text>;
}
```

## How it works

### The `router` methods

| Method | What it does |
| --- | --- |
| `push(href)` | pushes a new screen, even if that route is already in the stack |
| `navigate(href)` | pushes, **or unwinds** to an existing instance of the route if one is in the stack |
| `replace(href)` | swaps the current screen out; the old one leaves the history |
| `back()` | goes back one entry in the closest navigator that can |
| `canGoBack()` | whether `back()` has somewhere to go |
| `dismiss(count?)` | pops `count` screens (default 1) from the closest stack |
| `dismissTo(href)` | pops until `href` is reached; if it is not in the stack, replaces the current screen with it |
| `dismissAll()` | returns to the first screen of the closest stack — React Navigation's `popToTop` |
| `canDismiss()` | whether the closest stack has more than one screen |
| `setParams(params)` | updates the current route's params without navigating |
| `prefetch(href)` | loads a screen in the background before you navigate to it |

`push`, `navigate`, `replace` and `dismissTo` also take an options object. The ones exposed in the
types are `withAnchor`, `relativeToDirectory` and `dangerouslySingular`.

### `push` versus `navigate` versus `replace`

These three are the source of most navigation bugs, so pick deliberately:

```tsx title=src/app/posts/[id].tsx
import {router, useLocalSearchParams} from 'expo-router';
import {Button, View} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();
  const next = String(Number(id) + 1);

  return (
    <View>
      {/* Always adds a screen: back returns to this post. */}
      <Button title="Next (push)" onPress={() => router.push({pathname: '/posts/[id]', params: {id: next}})} />
      {/* May unwind instead of pushing if /posts is already below this screen. */}
      <Button title="All posts (navigate)" onPress={() => router.navigate('/posts')} />
      {/* Removes this screen from history: back will not return here. */}
      <Button title="Done (replace)" onPress={() => router.replace('/')} />
    </View>
  );
}
```

Use `replace` after sign-in, after completing a one-way flow, and anywhere back into the previous
screen would be wrong.

### `Link` takes the same instructions as props

`Link` navigates like `router.navigate` by default. Props change that:

```tsx title=src/app/checkout.tsx
import {Link} from 'expo-router';
import {Pressable, Text, View} from 'react-native';

export default function Checkout() {
  return (
    <View>
      <Link href="/orders" replace>View orders</Link>
      <Link href="/cart" push>Edit cart</Link>
      <Link href="/" dismissTo>Back to shop</Link>
      {/* asChild forwards press handling to your own component. */}
      <Link href="/help" asChild>
        <Pressable>
          <Text>Help</Text>
        </Pressable>
      </Link>
    </View>
  );
}
```

| Prop | Effect |
| --- | --- |
| `push` / `replace` / `dismissTo` | use that operation instead of `navigate` |
| `asChild` | render your child component, forwarding `onPress` and `href` to it |
| `withAnchor` | when entering a new navigator, render its anchor route underneath |
| `prefetch` | prefetch the target when the link renders |
| `relativeToDirectory` | resolve `./` and `../` against the directory rather than the document |
| `target`, `rel`, `download` | web only — passed to the rendered `<a>` |

### Passing params

Params go in the `params` object. The installed types accept strings, numbers, `null`,
`undefined`, and arrays of strings or numbers:

```tsx title=src/app/search.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export default function SearchLauncher() {
  return (
    <Button
      title="Search"
      onPress={() =>
        router.push({
          pathname: '/results',
          // Non-route keys become query parameters: /results?q=bikes&tags=red&tags=used
          params: {q: 'bikes', tags: ['red', 'used'], page: 1},
        })
      }
    />
  );
}
```

Keys that match a dynamic segment fill the segment. Everything else becomes a query parameter. On
the receiving side, numbers arrive as strings.

### Reading params: local versus global

Both hooks return route parameters and query parameters merged into one object. The difference is
**when they update**:

| Hook | Updates when |
| --- | --- |
| `useLocalSearchParams()` | the URL changes **and this screen is the one it describes** |
| `useGlobalSearchParams()` | the URL changes, **anywhere**, even while this screen is in the background |

In a stack, screens below the top stay mounted. A screen reading `useGlobalSearchParams()` re-renders
every time the user navigates anywhere — and receives the *new* screen's params. That is right for
analytics that track the current URL, and wrong for almost everything else.

```tsx title=src/app/_layout.tsx
import {Stack, useGlobalSearchParams, usePathname} from 'expo-router';
import {useEffect} from 'react';

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  useEffect(() => {
    // The one legitimate use: observe every navigation from a layout.
    console.log('screen_view', pathname, params);
  }, [pathname, params]);

  return <Stack />;
}
```

### Updating params without navigating

`router.setParams` rewrites the current route's params in place. It is the right tool for a filter
or a tab-within-a-screen that should be reflected in the URL:

```tsx title=src/app/results.tsx
import {router, useLocalSearchParams} from 'expo-router';
import {Button, Text, View} from 'react-native';

export default function Results() {
  const {sort = 'new'} = useLocalSearchParams<{sort?: string}>();

  return (
    <View>
      <Text>Sorted by {sort}</Text>
      <Button title="Sort by top" onPress={() => router.setParams({sort: 'top'})} />
    </View>
  );
}
```

No screen is pushed, so back does not undo the sort.

### Where you are: `usePathname` and `useSegments`

- `usePathname()` returns the URL path without query string or groups — `/posts/42`.
- `useSegments()` returns the **file** segments, groups included — `['(app)', 'posts', '[id]']`.

Use `usePathname` for display and analytics. Use `useSegments` when you need to know which part
of the file tree is active, which is the basis of the layout-level checks in
[Redirects and Auth-Gated Routes](redirects-and-auth.md).

### Running work only while a screen is focused

A screen that is not on top is still mounted, so `useEffect` does not re-run when the user comes
back and its cleanup does not run when they leave. `useFocusEffect` runs on focus and cleans up on
blur:

```tsx title=src/app/inbox.tsx
import {useFocusEffect} from 'expo-router';
import {useCallback, useState} from 'react';
import {Text} from 'react-native';

export default function Inbox() {
  const [ticks, setTicks] = useState(0);

  useFocusEffect(
    // Memoise the callback, or the effect re-runs on every render.
    useCallback(() => {
      const timer = setInterval(() => setTicks((t) => t + 1), 5000);
      return () => clearInterval(timer);
    }, []),
  );

  return <Text>Polled {ticks} times while visible</Text>;
}
```

`useFocusEffect` takes exactly one argument — the installed type names the second parameter
`do_not_pass_a_second_prop`. Put dependencies in `useCallback`, not in a second argument. For a
boolean rather than an effect, `useIsFocused()` is also exported from `expo-router`.

## Platform differences

:::tabs
@tab iOS
- `router.back()` and the edge-swipe gesture do the same thing in a stack.
- `Link` supports long-press previews through `Link.Preview`, `Link.Menu` and `Link.Trigger`.
@tab Android
- The system back button calls the same logic as `router.back()`. If `canGoBack()` is `false` at
  the root, back leaves the app.
- There is no link preview on long press; `Link` is a pressable text element.
@tab Web
- `Link` renders a real `<a href>`, so middle-click, "open in new tab" and crawlers work. A
  `Pressable` that calls `router.push` has none of that.
- `back()` uses browser history, which includes entries from before your app loaded.
- `target`, `rel` and `download` apply only here.
:::

## Common patterns

### Close a flow and land somewhere specific

```tsx title=src/app/onboarding/done.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export default function Done() {
  // Pops the whole onboarding stack back to the home route instead of pushing on top of it.
  return <Button title="Finish" onPress={() => router.dismissTo('/')} />;
}
```

### Only show a back control when there is something to go back to

```tsx title=src/components/back-button.tsx
import {router} from 'expo-router';
import {Button} from 'react-native';

export function BackButton() {
  // A screen opened from a cold-start deep link has no history.
  if (!router.canGoBack()) return null;
  return <Button title="Back" onPress={() => router.back()} />;
}
```

### Encode, don't concatenate

```tsx title=src/components/tag-link.tsx
import {Link} from 'expo-router';

export function TagLink({tag}: {tag: string}) {
  // A tag such as "c/c++" breaks a template string; the object form encodes it.
  return <Link href={{pathname: '/tags/[tag]', params: {tag}}}>{tag}</Link>;
}
```

## Performance considerations

- **`useGlobalSearchParams` re-renders on every navigation.** Mounted in several background
  screens, it multiplies render work on each transition.
- **`push` in a loop grows memory.** Every pushed screen keeps its tree. For "next item" flows,
  consider `replace`, or `dangerouslySingular` so repeated routes do not pile up.
- **`prefetch` is not free.** It mounts the target screen ahead of time. Use it for the one likely
  next screen, not every link in a list.

## Common mistakes

- **Passing an object as a param.** `params: {user}` becomes `"[object Object]"`. Pass `user.id`
  and load the user on the destination.
- **Comparing a param to a number.** `page === 2` is always false; the value is `'2'`.
- **Using `navigate` when you need a new copy.** `navigate` may unwind to an existing instance,
  discarding the screens above it. Use `push`.
- **Using `push` after sign-in.** Back then returns to the sign-in form. Use `replace`.
- **Calling `useGlobalSearchParams` in a screen.** It keeps updating while the screen is in the
  background and hands it another screen's params. Use `useLocalSearchParams`.
- **Passing a dependency array to `useFocusEffect`.** It takes one argument. Wrap the callback in
  `useCallback`.
- **Assuming `back()` always works.** After a cold-start deep link there may be no history. Check
  `canGoBack()` or give the layout an anchor.
- **Using `usePathname` to detect a group.** Groups are stripped from the pathname; use
  `useSegments`.

## Related topics

- [Typed Routes](typed-routes.md) — compile-time checking for every `href` on this page.
- [Dynamic and Catch-All Routes](dynamic-routes.md) — where route params come from.
- [Modals](modals.md) — `dismiss` and `dismissTo` in a presented stack.
- [Nested Navigators](nested-navigators.md) — which navigator `back()` acts on.
- [Redirects and Auth-Gated Routes](redirects-and-auth.md) — `replace`, `Redirect` and `Stack.Protected`.
- [Deep Links and Universal Links](deep-linking.md) — params that arrive from outside the app.
