---
title: Dynamic and Catch-All Routes
description: Square-bracket filenames in Expo Router — [id] for one segment, [...rest] for the remainder, how they are matched, and how to read them safely.
status: current
toolchain: expo
sdk: 57
---

A filename in square brackets captures part of the URL as a parameter. `[id].tsx` matches one path
segment; `[...rest].tsx` matches everything left.

```text
src/app/posts/[id].tsx       ->  /posts/42        params.id   === '42'
src/app/files/[...path].tsx  ->  /files/a/b/c.txt params.path === ['a', 'b', 'c.txt']
```

This is how a list screen and a detail screen share one file, and how an app answers URLs it has
never seen before.

## Why it exists / when to use it — and when NOT to

Use a dynamic segment when the URL identifies **which** of a set of things to show, and the set is
open-ended: posts, users, products, documents.

Use a catch-all when the shape of the remainder is genuinely unknown: a file browser, a
documentation site, a proxy for server-defined paths. Also use one for a global `+not-found` when
you want to inspect the unmatched path rather than just show a message.

Do **not** use a dynamic segment for a small, known set. `/settings/[section]` for exactly three
sections gives you a runtime check where you could have had three files and a compile-time one.

Do **not** put anything in a URL parameter that the user should not be able to change. A parameter
is attacker-controlled input on native, because deep links carry it. See
[Deep Links and Universal Links](deep-linking.md#security-considerations).

## Basic example

```text
src/app/
├── _layout.tsx
└── posts/
    ├── index.tsx        # "/posts"
    └── [id].tsx         # "/posts/42"
```

```tsx title=src/app/posts/[id].tsx
import {Stack, useLocalSearchParams} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';

export default function Post() {
  // The parameter name is the filename: [id].tsx -> params.id
  const {id} = useLocalSearchParams<{id: string}>();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{title: `Post ${id}`}} />
      <Text>Showing post {id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
});
```

Linking to it:

```tsx title=src/app/posts/index.tsx
import {Link} from 'expo-router';
import {View} from 'react-native';

export default function Posts() {
  return (
    <View>
      {/* Both forms produce /posts/42. */}
      <Link href="/posts/42">Post 42 (string)</Link>
      <Link href={{pathname: '/posts/[id]', params: {id: '42'}}}>Post 42 (object)</Link>
    </View>
  );
}
```

Prefer the object form. It survives a rename of the parameter, it is what typed routes check
against, and it handles escaping for you — an id containing `/` or `?` breaks the string form.

## How it works

### One segment versus the remainder

| File | Matches | Does not match | `params` |
| --- | --- | --- | --- |
| `[id].tsx` | `/posts/42` | `/posts/42/edit` | `{id: '42'}` |
| `[...rest].tsx` | `/files/a/b` | — | `{rest: ['a', 'b']}` |

A dynamic segment yields a **string**; a catch-all yields a **string array**. This trips people up
because both come out of the same hook.

### Matching order

More specific wins, regardless of the order the files happen to be read in:

```text
src/app/posts/new.tsx         /posts/new        static — wins
src/app/posts/[id].tsx        /posts/42         dynamic — next
src/app/posts/[...rest].tsx   /posts/42/edit    catch-all — last resort
```

So a route literally named `new` is not shadowed by `[id]`. You cannot configure this ordering; it
is the algorithm.

### Multiple dynamic segments

```text
src/app/[org]/projects/[projectId]/index.tsx   ->  /acme/projects/7
```

```tsx title=src/app/[org]/projects/[projectId]/index.tsx
import {useLocalSearchParams} from 'expo-router';
import {Text, View} from 'react-native';

export default function Project() {
  const {org, projectId} = useLocalSearchParams<{org: string; projectId: string}>();

  return (
    <View>
      <Text>
        {org} / {projectId}
      </Text>
    </View>
  );
}
```

Each bracketed directory or file contributes one key. Two segments in the same path must not use
the same name.

### Route parameters and query parameters arrive together

`useLocalSearchParams` merges both. Given `/posts/42?ref=email`:

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Post() {
  // id comes from the path, ref from the query string.
  const {id, ref} = useLocalSearchParams<{id: string; ref?: string}>();
  return <Text>{id} via {ref ?? 'direct'}</Text>;
}
```

They are the same shape to the hook, which is convenient until a query parameter shadows a route
parameter. Do not reuse a name.

### Every parameter is a string, and may be missing

Types you write on `useLocalSearchParams` are **assertions, not validation**. The hook does not
check them. A route parameter is `string | string[]` at runtime, and can be `undefined` if the URL
did not supply it. Parse before you use:

```tsx title=src/app/posts/[id].tsx
import {Redirect, useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<{id?: string}>();

  // A deep link can deliver anything here. Validate before using it as a number.
  const numericId = Number(id);
  if (!id || !Number.isInteger(numericId) || numericId <= 0) {
    return <Redirect href="/+not-found" />;
  }

  return <Text>Post {numericId}</Text>;
}
```

## Platform differences

The matching rules are identical on iOS, Android and web. What differs is where the URL comes
from:

| | Native | Web |
| --- | --- | --- |
| Source of a URL | a deep link or universal link | the address bar, a link, a bookmark |
| Who can craft it | any app or web page on the device | anyone |
| Cold start | the route is resolved before any screen mounts | the server or the SPA shell resolves it |

On both, the parameter is untrusted. On native people forget that, because the app "has no URL
bar" — but any installed app can fire an intent at your scheme.

## Common patterns

### A catch-all that inspects the path

```tsx title=src/app/files/[...path].tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function FileBrowser() {
  const {path} = useLocalSearchParams<{path?: string | string[]}>();
  // Normalise: a single-segment URL still gives a string on some entry points.
  const segments = Array.isArray(path) ? path : path ? [path] : [];

  return <Text>{segments.join(' / ') || 'root'}</Text>;
}
```

### A typed helper instead of repeating the assertion

```ts title=src/lib/params.ts
/** Narrow a router param to a single string, or undefined if absent or repeated. */
export function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
```

### Optional-looking segments are two files, not one

There is no `[[id]].tsx`. If a route is meaningful with and without the segment, write both:

```text
src/app/posts/index.tsx   # "/posts"
src/app/posts/[id].tsx    # "/posts/42"
```

## Security considerations

A route parameter is input from outside the app. The threat is that an attacker controls it.

**Threat.** Any app on the device, or any web page the user taps a link on, can open
`myapp://posts/<anything>`. The value reaches your screen as if the user had navigated there.

**Exploit.** A handler that passes the parameter straight into a request:

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {useEffect} from 'react';
import {Text} from 'react-native';

export default function Vulnerable() {
  const {id} = useLocalSearchParams<{id: string}>();

  useEffect(() => {
    // WRONG: `id` is attacker-controlled. A value like "../../admin/keys" or
    // "42@evil.example.com" changes which host or path is contacted.
    fetch(`https://api.example.com/posts/${id}`);
  }, [id]);

  return <Text>{id}</Text>;
}
```

**Fix.** Validate the shape, then encode:

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export default function Safe() {
  const {id} = useLocalSearchParams<{id?: string}>();
  const [title, setTitle] = useState('');

  useEffect(() => {
    // Accept only the shape this route actually supports.
    if (!id || !/^[0-9]{1,10}$/.test(id)) return;

    const controller = new AbortController();
    fetch(`https://api.example.com/posts/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: {title: string}) => setTitle(data.title))
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  return <Text>{title}</Text>;
}
```

**Verification.** Fire a hostile link at a device build and confirm the screen refuses it:

```bash
# Android
adb shell am start -a android.intent.action.VIEW -d "myapp://posts/..%2F..%2Fadmin"

# iOS simulator
xcrun simctl openurl booted "myapp://posts/..%2F..%2Fadmin"
```

The deeper treatment, including the case where the parameter is a URL you are about to open, is in
[Deep Link Validation](../expo-security/deep-link-validation.md).

## Common mistakes

- **Trusting the type argument.** `useLocalSearchParams<{id: string}>()` asserts; it does not
  check. At runtime `id` may be `undefined` or an array.
- **Expecting a number.** Every parameter is a string. `id === 42` is always false.
- **Building the href by string concatenation.** `` `/posts/${title}` `` breaks on any `/`, `?` or
  `#` in `title`. Use the object form, which encodes for you.
- **Expecting `[id]` to match `/posts/42/edit`.** It matches exactly one segment. Use `[...rest]`
  or add `src/app/posts/[id]/edit.tsx`.
- **Reusing a parameter name across segments.** `/[id]/items/[id]` — the second wins and the first
  is lost.
- **Reaching for `[[id]].tsx`.** Optional segments are not a filename convention. Write two files.
- **Using `useGlobalSearchParams` in a stack screen.** It keeps updating after you navigate away,
  so a background screen re-runs effects with the *new* screen's parameters. Use
  `useLocalSearchParams` unless you specifically need the global behaviour.

## Related topics

- [The app Directory](app-directory.md) — where bracket filenames sit among the conventions.
- [Navigation and Params](navigation-and-params.md) — `useLocalSearchParams` vs `useGlobalSearchParams` in full.
- [Typed Routes](typed-routes.md) — making the object href form compile-checked.
- [Deep Links and Universal Links](deep-linking.md) — where hostile parameters come from.
- [Deep Link Validation](../expo-security/deep-link-validation.md) — the allow-list pattern.
- [Groups](groups.md) — the other bracket-like filename, with different meaning.
