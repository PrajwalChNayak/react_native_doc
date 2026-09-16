---
title: Error Boundaries
description: Catching render errors per route in Expo Router 57 — the ErrorBoundary export, its error and retry props, how boundaries nest through layouts, the navigator-level fallback, and what a boundary does not catch.
status: current
toolchain: expo
sdk: 57
---

Any route or layout file can export a component named `ErrorBoundary`. If rendering that route
throws, Expo Router renders your `ErrorBoundary` in its place instead of taking down the whole app.

```tsx title=src/app/posts/[id].tsx
import {type ErrorBoundaryProps, useLocalSearchParams} from 'expo-router';
import {Button, Text, View} from 'react-native';

export function ErrorBoundary({error, retry}: ErrorBoundaryProps) {
  return (
    <View>
      <Text>Could not show this post: {error.message}</Text>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();
  return <Text>Post {id}</Text>;
}
```

It is a React error boundary with the class boilerplate removed: the router wraps the route in one
for you and passes your component the error and a way to recover.

## Why it exists / when to use it — and when NOT to

An uncaught render error unmounts the React tree above it up to the nearest boundary. With no
boundary, that is the whole app: in a release build the user sees a blank screen. A per-route
boundary limits the damage to one screen, keeps the navigator and tab bar working, and gives the
user a way out.

Add one where a screen renders data you do not control — server responses, user content, parsed
params — and at the root as a last resort.

It is **not** a general error-handling mechanism:

- **Errors in event handlers** (`onPress`, `onSubmit`) do not reach it. React boundaries only
  catch errors thrown while rendering, in lifecycle methods and in constructors.
- **Rejected promises** in `useEffect` or a `fetch` chain do not reach it unless you turn them into
  render state and throw during render.
- **A URL that matches no route** is not an error. That is `+not-found`, covered in
  [The app Directory](app-directory.md).

## Basic example

A root-level boundary catches anything no closer boundary handled:

```tsx title=src/app/_layout.tsx
import {type ErrorBoundaryProps, Stack} from 'expo-router';
import {Button, StyleSheet, Text, View} from 'react-native';

export function ErrorBoundary({error, retry}: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text>{error.message}</Text>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  return <Stack />;
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
  title: {fontSize: 18, fontWeight: '600'},
});
```

## How it works

### The props

Verified from the installed `expo-router` 57.0.21 types:

```ts-fragment title=node_modules/expo-router/build/views/Try.d.ts
export type ErrorBoundaryProps = {
  /** A function that will re-render the route component by clearing the `error` state. */
  retry: () => Promise<void>;
  /** The error that was thrown. */
  error: Error;
};
```

`retry` clears the error and renders the route again. If the cause is still there — the same bad
data — it throws again and the boundary shows again. Retry is for transient failures; for anything
else, pair it with a way to leave the screen.

### Boundaries nest through the React tree

A route file's `ErrorBoundary` wraps that route. A layout's `ErrorBoundary` wraps the layout, and
everything the layout renders — including its child routes. An error propagates upward to the
nearest boundary:

```text
src/app/
├── _layout.tsx          # ErrorBoundary — catches everything below that has no closer boundary
├── index.tsx
└── posts/
    ├── _layout.tsx      # ErrorBoundary — catches errors in /posts/* screens
    ├── index.tsx
    └── [id].tsx         # ErrorBoundary — catches errors in this screen only
```

Which boundary catches decides what disappears. The screen-level boundary replaces one screen and
leaves the header and back button working. A layout-level boundary replaces the layout's navigator,
so the whole posts stack is gone until retry.

### A default for every screen in a navigator

To give every screen of a navigator the same fallback without exporting it from each file, pass a
component to the navigator's `unstable_screenErrorBoundary` prop. It is present on `Stack`, the JS
tabs, `Drawer` and navigators built with `withLayoutContext` in the installed types:

```tsx title=src/app/posts/_layout.tsx
import {type ErrorBoundaryProps, Stack} from 'expo-router';
import {Button, Text, View} from 'react-native';

function PostsFallback({error, retry}: ErrorBoundaryProps) {
  return (
    <View>
      <Text>{error.message}</Text>
      <Button title="Retry" onPress={retry} />
    </View>
  );
}

export default function PostsLayout() {
  return <Stack unstable_screenErrorBoundary={PostsFallback} />;
}
```

According to the Expo documentation, a screen's own `ErrorBoundary` export takes precedence over the
navigator prop. The `unstable_` prefix means the API can change between SDKs.

### The built-in fallback

`expo-router` also exports a ready-made `ErrorBoundary` component with the same props. Re-exporting
it gives a route the default UI with one line:

```tsx title=src/app/settings.tsx
import {Text} from 'react-native';

export {ErrorBoundary} from 'expo-router';

export default function Settings() {
  return <Text>Settings</Text>;
}
```

## Platform differences

:::tabs
@tab Development (all platforms)
LogBox reports the error as well as your boundary rendering it. The red error overlay can cover
the boundary; dismiss it to see what a user would see. Do not judge a boundary's design from a
development build alone.
@tab Release iOS / Android
No overlay. Without a boundary, a render error leaves a blank screen; with one, the user sees your
fallback. This is the case the boundary exists for, so test it in a release build.
@tab Web
Boundaries work the same way. Separately, an unmatched URL renders `+not-found` and is served with
a 404 status by a server build — a different mechanism from an error boundary.
:::

## Common patterns

### Report the error once

```tsx title=src/app/_layout.tsx
import {type ErrorBoundaryProps, Stack} from 'expo-router';
import {useEffect} from 'react';
import {Button, Text, View} from 'react-native';

export function ErrorBoundary({error, retry}: ErrorBoundaryProps) {
  useEffect(() => {
    // Send to your crash reporter here. Do not include user data or tokens in the report.
    console.error('route render error', error.name, error.message);
  }, [error]);

  return (
    <View>
      <Text>Something went wrong.</Text>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  return <Stack />;
}
```

Keep the side effect in `useEffect`, not in the render body, so it runs once per error rather than
on every render of the fallback.

### Give the user a way out, not only retry

```tsx title=src/app/posts/[id].tsx
import {type ErrorBoundaryProps, router} from 'expo-router';
import {Button, Text, View} from 'react-native';

export function ErrorBoundary({error, retry}: ErrorBoundaryProps) {
  return (
    <View>
      <Text>{error.message}</Text>
      <Button title="Try again" onPress={retry} />
      <Button title="Go home" onPress={() => router.replace('/')} />
    </View>
  );
}

export default function Post() {
  return <Text>Post</Text>;
}
```

### Surfacing an async failure to the boundary

A boundary only sees errors thrown during render. To route a failed request to it, store the error
and throw it on the next render:

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export {ErrorBoundary} from 'expo-router';

export default function Post() {
  const {id} = useLocalSearchParams<{id: string}>();
  const [title, setTitle] = useState<string>();
  const [failure, setFailure] = useState<Error>();

  useEffect(() => {
    fetch(`https://example.com/posts/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{title: string}>;
      })
      .then((data) => setTitle(data.title))
      .catch((e: unknown) => setFailure(e instanceof Error ? e : new Error(String(e))));
  }, [id]);

  // Throwing during render is what hands the error to the boundary.
  if (failure) throw failure;

  return <Text>{title ?? 'Loading…'}</Text>;
}
```

Retrying remounts the route, which runs the effect again.

## Security considerations

An error message can contain things a user should not see: an internal URL, a SQL fragment from a
server error body, a token in a request that failed. Showing `error.message` verbatim is fine while
developing; in production, show a generic message and send the detail only to your crash reporter.
Check reports for tokens and personal data before they leave the device.

## Common mistakes

- **Exporting it as `default`.** The default export is the screen. The boundary must be the named
  export `ErrorBoundary`.
- **Expecting it to catch an error thrown in `onPress`.** Event-handler errors never reach a React
  boundary. Catch them in the handler.
- **Expecting it to catch a rejected `fetch`.** Promise rejections are not render errors. Store the
  error in state and throw during render, or handle it in place.
- **Offering only retry for a deterministic error.** If bad data causes the crash, retry crashes
  again. Add a way to navigate away.
- **Relying on the root boundary alone.** It replaces the root navigator, so the user loses all
  navigation. Add boundaries to screens that render untrusted data.
- **Judging the fallback in development.** LogBox overlays it. Check the release behaviour.
- **Showing `error.message` to users in production.** It may leak internals. Show a generic message.
- **Using a boundary for an unknown URL.** That is `+not-found`, not an error.

## Related topics

- [Layouts](layouts.md) — why a layout's boundary covers its whole subtree.
- [The app Directory](app-directory.md) — `+not-found` for unmatched URLs.
- [Dynamic and Catch-All Routes](dynamic-routes.md) — validating params before they cause render errors.
- [Stack](stack.md) — the navigator that accepts `unstable_screenErrorBoundary`.
- [Navigation and Params](navigation-and-params.md) — `router.replace` for the way out.
