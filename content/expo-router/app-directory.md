---
title: The app Directory
description: Every filename convention Expo Router understands in SDK 57 — index, dynamic segments, catch-alls, groups, layouts, the plus-prefixed special files, and platform-specific routes.
status: current
toolchain: expo
sdk: 57
---

The `app` directory is the route table. Expo Router reads it through a bundler context module,
converts each filename into a route, and hands the result to React Navigation. Learning the
filename vocabulary is most of learning Expo Router.

> [!NOTE] Where the directory lives
> `npx create-expo-app@latest` on SDK 57 generates **`src/app/`**, with `src/components/`,
> `src/hooks/` and `src/constants/` beside it and a `@/*` alias pointing at `src/`. A root-level
> `app/` also works — the router finds either. The conventions on this page are identical in both
> layouts; only the prefix differs.

This page is the reference for that vocabulary. The concepts each get a fuller treatment on their
own pages, linked below.

## Why it exists / when to use it — and when NOT to

The directory is a convention, not configuration, which means there is no second place for a route
to be defined and therefore no way for the two to disagree. The cost is that **the directory is
load-bearing**: a file you drop in `app/` to "keep it near the screen that uses it" becomes a
route, appears in the sitemap, and gets bundled as a screen.

So the rule is narrow: `app/` holds routes and layouts, and nothing else. Components, hooks,
utilities and tests live beside it — in the generated template, `src/components/`, `src/hooks/`
and `src/constants/`.

The `expo-router` config plugin exposes a `root` option that points the router at some other
directory. The option's own documentation says to avoid it, and the two standard locations
(`src/app/` and root-level `app/`) are found without it. Leave it alone.

## Basic example

```text
src/app/
├── _layout.tsx              # root layout — wraps everything
├── index.tsx                # "/"
├── about.tsx                # "/about"
├── +not-found.tsx           # fallback for unmatched URLs
├── posts/
│   ├── _layout.tsx          # layout for "/posts/*"
│   ├── index.tsx            # "/posts"
│   └── [id].tsx             # "/posts/42"
├── (tabs)/                  # a group: no URL segment
│   ├── _layout.tsx
│   ├── feed.tsx             # "/feed"   — not "/(tabs)/feed"
│   └── profile.tsx          # "/profile"
└── settings+api.ts          # server route at "/settings", not a screen
```

## How it works

### The full filename vocabulary

| Filename | Route | Notes |
| --- | --- | --- |
| `index.tsx` | the directory itself | `app/index.tsx` is `/`; `app/posts/index.tsx` is `/posts` |
| `about.tsx` | `/about` | the ordinary case |
| `[id].tsx` | `/anything` | one dynamic segment — see [Dynamic Routes](dynamic-routes.md) |
| `[...rest].tsx` | `/a/b/c` | catch-all, matches the remaining path |
| `(group)/` | no segment | organisational only — see [Groups](groups.md) |
| `(a,b)/` | duplicated | an array group generates one route tree per name |
| `_layout.tsx` | not a route | the navigator for its directory — see [Layouts](layouts.md) |
| `+not-found.tsx` | unmatched URLs | one per directory; the root one is the global fallback |
| `+html.tsx` | not a route | wraps the HTML document for static web rendering |
| `+native-intent.tsx` | not a route | intercepts and rewrites incoming native URLs |
| `+api.ts` | a server endpoint | see [API Routes](api-routes.md) |
| `+middleware.ts` | not a route | experimental server middleware; needs `web.output: 'server'` |

A leading `+` marks a file as special rather than a screen. Route files themselves may contain `+`
elsewhere in the name — it just cannot start the final segment, with `+not-found` as the exception.

### `index` versus a named file

These two produce different URLs, and mixing them up is the most common early confusion:

```text
src/app/posts/index.tsx   ->  /posts
src/app/posts.tsx         ->  /posts
src/app/posts/[id].tsx    ->  /posts/42
```

`app/posts.tsx` and `app/posts/index.tsx` both answer `/posts`. Use the directory form when the
route has children, because a directory can also hold `_layout.tsx`. Do not create both — the
router will resolve one and silently ignore the other.

### Generated routes you did not write

Two routes exist even in an empty project:

- **`/_sitemap`** — a development-time index of every route. It is generated automatically; disable
  it with the `expo-router` config plugin's `sitemap: false` option.
- **`+not-found`** — a default fallback. Override it by creating `app/+not-found.tsx`.

```tsx title=src/app/+not-found.tsx
import {Link, Stack} from 'expo-router';
import {StyleSheet, Text, View} from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{title: 'Not found'}} />
      <View style={styles.container}>
        <Text style={styles.title}>This page does not exist.</Text>
        <Link href="/">Go home</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12},
  title: {fontSize: 16, fontWeight: '600'},
});
```

A `+not-found.tsx` inside a subdirectory scopes the fallback to that subtree, so `/posts/nope` can
render inside the posts layout instead of replacing the whole screen.

### Route ordering and specificity

When more than one file could match a URL, Expo Router prefers the more specific one:

```text
src/app/posts/index.tsx      matches /posts
src/app/posts/new.tsx        matches /posts/new       (static beats dynamic)
src/app/posts/[id].tsx       matches /posts/42
src/app/posts/[...rest].tsx  matches /posts/42/edit   (catch-all is last resort)
```

So a static segment always wins over a dynamic one at the same depth, and a catch-all only runs
when nothing else matched. You do not configure this; it falls out of the file names.

## Platform differences

### Platform-specific route files

A route may have a platform extension, and the router picks the right one at bundle time:

```text
src/app/
├── settings.tsx          # fallback for every platform
├── settings.ios.tsx      # used on iOS
├── settings.android.tsx  # used on Android
└── settings.web.tsx      # used on web
```

This is on by default. The `expo-router` config plugin's `platformRoutes` option turns it off if
you want a single implementation enforced.

> [!WARNING] API routes cannot be platform-specific
> `+api.ts` files do **not** support platform extensions. A file named `hello+api.web.ts` is not
> picked up as an API route. Server routes run on a server, where "platform" does not apply.

### Web-only special files

`+html.tsx` customises the HTML shell for static web rendering, and `+middleware.ts` runs
server-side before a request reaches a route. Neither does anything on iOS or Android. Both are
covered in [API Routes](api-routes.md).

## Common patterns

### Colocate nothing; export from outside

```text
src/
├── app/
│   └── posts/[id].tsx      # a route
├── components/PostCard.tsx # not a route
└── hooks/usePosts.ts       # not a route
```

The generated template already sets up the alias that makes this read well, so `[id].tsx` imports
`@/components/PostCard` rather than `../../components/PostCard`:

```json title=tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {"@/*": ["./src/*"]}
  }
}
```

Metro honours `compilerOptions.paths` by default in SDK 57 — the app config's
`experiments.tsconfigPaths` flag now defaults to on, so you do not need to set it.

### Use a group for the authenticated area

```text
src/app/
├── _layout.tsx
├── sign-in.tsx             # "/sign-in"
└── (app)/
    ├── _layout.tsx
    ├── index.tsx           # "/"
    └── settings.tsx        # "/settings"
```

The `(app)` group gives the signed-in area its own layout without putting `/app` in every URL. This
is the shape [Redirects and Auth-Gated Routes](redirects-and-auth.md) builds on.

### Name dynamic segments after what you read

The filename is the parameter name. `app/posts/[id].tsx` gives you `params.id`; `[postId].tsx`
gives you `params.postId`. Pick the one you want to read in the screen — renaming later means
touching every `href` that targets it.

## Common mistakes

- **Putting components in `app/`.** `app/components/Card.tsx` is the route `/components/Card`. It
  appears in `/_sitemap`, it is reachable by URL, and it ships as a screen. Keep `app/` for routes.
- **Creating both `app/posts.tsx` and `app/posts/index.tsx`.** Both claim `/posts`. One wins,
  without an error, and which one is not something to rely on. Pick the directory form.
- **Expecting `(group)` to appear in the URL.** It never does. If you wanted `/app/settings` you
  need a real directory named `app`, not `(app)`.
- **Naming an API route with a platform extension.** `hello+api.web.ts` is silently not an API
  route. Use `hello+api.ts`.
- **Assuming `_layout.tsx` is a route.** It is not. It has no URL, it cannot be navigated to, and
  it does not need a `Stack.Screen` entry of its own.
- **Starting a normal route filename with `+`.** Reserved. Only `+not-found`, `+html`,
  `+native-intent`, `+api` and `+middleware` are meaningful, and anything else starting with `+` in
  the final segment is skipped.

## Related topics

- [Expo Router Fundamentals](fundamentals.md) — the mental model this vocabulary serves.
- [Layouts](layouts.md) — what `_layout.tsx` actually does.
- [Dynamic and Catch-All Routes](dynamic-routes.md) — `[id]` and `[...rest]` in depth.
- [Groups](groups.md) — `(group)` and array groups.
- [API Routes](api-routes.md) — `+api.ts`, `+middleware.ts` and the hosting story.
- [Error Boundaries](error-boundaries.md) — `+not-found` versus a thrown error.
- [Project Structure](../expo-getting-started/project-structure.md) — where `app/` sits alongside everything else.
