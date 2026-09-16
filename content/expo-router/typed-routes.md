---
title: Typed Routes
description: How experiments.typedRoutes turns the app directory into TypeScript types — what Expo CLI generates into .expo/types, why the tsconfig include is what makes it work, and what is and is not checked.
status: current
toolchain: expo
sdk: 57
---

Typed routes make an `href` that points at a route that does not exist a **compile error**. With
the feature on, `router.push('/pofile')` fails in your editor instead of opening a blank
`+not-found` screen at runtime.

The types are not written by hand. Expo CLI reads the `app` directory and generates a declaration
file into `.expo/types/`, and TypeScript picks it up through your `tsconfig.json` `include`. If
either half is missing, everything still compiles — it just stops checking anything.

## Why it exists / when to use it — and when NOT to

Routes in Expo Router are strings. Strings do not refactor: rename `src/app/profile.tsx` to
`account.tsx` and every `href="/profile"` in the codebase is now wrong, silently.

Typed routes close that gap by generating a union of every valid path from the file tree. Use them
in every TypeScript Expo Router project — `create-expo-app` on SDK 57 turns them on by default.

They are **not** runtime validation. The types describe which paths the *app* can build; they say
nothing about URLs arriving from outside through a deep link, and they do not check that a
parameter value is well-formed. See [Deep Links and Universal Links](deep-linking.md#security-considerations)
for that half.

Skip them only if the project is JavaScript, where there is nothing to check against.

## Basic example

The SDK 57 template already contains both halves. The flag lives in the app config:

```json title=app.json
{
  "expo": {
    "scheme": "router",
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

And `tsconfig.json` includes the generated files:

```json title=tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "@/assets/*": ["./assets/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Start the dev server once, and the types exist:

```bash
npx expo start
```

From then on, `Link`, `Redirect`, `router` and the search-param hooks are checked against your
routes:

```tsx title=src/app/index.tsx
import {Link, router} from 'expo-router';
import {Button, View} from 'react-native';

export default function Home() {
  return (
    <View>
      <Link href="/explore">Explore</Link>
      <Button title="Open post" onPress={() => router.push({pathname: '/posts/[id]', params: {id: '42'}})} />
    </View>
  );
}
```

## How it works

### What `npx expo start` generates

When the dev server starts and `experiments.typedRoutes` is `true`, Expo CLI does four things
(read from `@expo/cli`'s type-generation source in SDK 57):

| Effect | File |
| --- | --- |
| Writes a reference to Expo's global types | `expo-env.d.ts` in the project root |
| Adds that file to `.gitignore` | `.gitignore` |
| Adds `.expo/types/**/*.ts` and `expo-env.d.ts` to `include` if they are missing | `tsconfig.json` |
| Generates the route declarations, and regenerates them as files in `app/` change | `.expo/types/router.d.ts` |

`expo-env.d.ts` is one line and says it should not be edited:

```ts-fragment title=expo-env.d.ts
/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be in your git ignore
```

When you set `typedRoutes` to `false`, the next `npx expo start` does the reverse: it deletes
`expo-env.d.ts` and removes both entries from `include`.

### What the generated file contains

The generated `router.d.ts` augments one interface inside `expo-router`. Its shape, abbreviated:

```ts-fragment title=.expo/types/router.d.ts
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: /* one {pathname, params} object per route */;
      hrefOutputParams: /* the params each route receives */;
      href: /* every static path, every dynamic path template, and the object forms */;
    }
  }
}
```

That interface is the whole mechanism. In the installed `expo-router` types, `Href` is defined
conditionally on it:

```ts-fragment title=node_modules/expo-router/build/typed-routes/types.d.ts
export type Href<T extends ExpoRouter.__routes = ExpoRouter.__routes> = T extends {
  href: any;
}
  ? T['href']
  : string | HrefObject;
```

So **when the generated file is not part of the program, `Href` falls back to `string`**. Nothing
errors. Every path is accepted. This is why the `include` entries matter more than the flag: the
flag produces the file, but only `include` makes TypeScript read it.

### What is checked

| API | Checked |
| --- | --- |
| `<Link href>` and `<Redirect href>` | yes |
| `router.push`, `replace`, `navigate`, `dismissTo`, `prefetch` | yes |
| `useLocalSearchParams<'/posts/[id]'>()` | yes — returns that route's params |
| `useGlobalSearchParams<'/posts/[id]'>()` | yes |
| `useSegments()` | the segment tuple type is derived from route paths |
| The `Href` type in your own helpers | yes |

### Dynamic routes want the object form

For `src/app/posts/[id].tsx`, the generated `href` union accepts a concrete path such as
`/posts/42` and the object form with the template pathname. It does **not** accept the bracketed
template as a string, because that would navigate to a literal `[id]`:

```tsx-fragment title=src/app/index.tsx
// With typed routes on, the first two compile and the third is a type error.
<Link href="/posts/42">Post 42</Link>
<Link href={{pathname: '/posts/[id]', params: {id: '42'}}}>Post 42</Link>
<Link href="/posts/[id]">Broken</Link>
```

Prefer the object form: it survives a parameter rename (the old key becomes a type error), and it
encodes the value for you.

### Reading params by route

Pass the route path as the type argument and the hook returns that route's parameter shape — the
same types the generated file produced:

```tsx title=src/app/posts/[id].tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Post() {
  const {id} = useLocalSearchParams<'/posts/[id]'>();
  return <Text>Post {id}</Text>;
}
```

Query-string parameters are not part of the file tree, so they are not generated. Declare them
yourself:

```tsx title=src/app/search.tsx
import {useLocalSearchParams} from 'expo-router';
import {Text} from 'react-native';

export default function Search() {
  // `q` is a query parameter — typed routes cannot know about it.
  const {q} = useLocalSearchParams<{q?: string}>();
  return <Text>Results for {q ?? 'nothing'}</Text>;
}
```

The generic is still an assertion. It narrows the type; it does not validate the value.

## Platform differences

None. The types are produced at development time from the file tree and erased at build time, so
iOS, Android and web see identical behaviour. Platform-specific route files such as
`settings.ios.tsx` and `settings.tsx` both describe the single route `/settings`.

## Common patterns

### Typing your own navigation helpers with `Href`

```tsx title=src/components/nav-button.tsx
import {router, type Href} from 'expo-router';
import {Button} from 'react-native';

type Props = {title: string; href: Href};

export function NavButton({title, href}: Props) {
  // `href` carries the generated union, so callers get the same checking as <Link>.
  return <Button title={title} onPress={() => router.push(href)} />;
}
```

### Generating types in CI without starting the dev server

A CI job that runs `tsc` on a fresh clone has no `.expo/types` directory, because it is
git-ignored and generated. Generate it before type-checking. The Expo documentation recommends:

```bash
npx expo customize tsconfig.json
npx tsc --noEmit
```

If `tsc` passes in CI but not locally — or the other way round — check whether `.expo/types`
existed in both places.

### Restarting generation after a large move

The dev server watches `app/` and regenerates on add, delete and change. After a bulk rename done
outside the editor (a `git checkout` of another branch, for example), restart `npx expo start`
rather than trusting the watcher to have seen every event.

## Common mistakes

- **Removing `.expo/types/**/*.ts` from `include`.** Typed routes then silently turn off: `Href`
  falls back to `string` and every typo compiles. The dev server re-adds the entry, but a CI job
  that never starts it does not.
- **Committing `.expo/` or `expo-env.d.ts`.** They are machine output, and a stale
  `router.d.ts` from another branch will report routes that no longer exist. Both are git-ignored
  for this reason.
- **Editing `.expo/types/router.d.ts`.** It is overwritten on the next change to `app/`.
- **Writing the bracketed template as a string.** `href="/posts/[id]"` navigates to a literal
  segment. Use `{pathname: '/posts/[id]', params: {id}}`.
- **Silencing an error with `as Href`.** The cast defeats the only thing the feature does. If a
  path is genuinely dynamic — built from server data — validate it at runtime and keep the cast
  next to that check.
- **Expecting the types to protect you from deep links.** They check paths your code builds. A
  URL arriving from another app was never type-checked.
- **Trusting `useLocalSearchParams<{id: number}>()`.** Every parameter is a string at runtime. The
  generic is an assertion.

## Related topics

- [Navigation and Params](navigation-and-params.md) — the APIs these types check.
- [Dynamic and Catch-All Routes](dynamic-routes.md) — why the object href form matters.
- [The app Directory](app-directory.md) — the file tree the types are generated from.
- [The App Config](../expo-core-concepts/app-config.md) — where `experiments` lives.
- [Project Structure](../expo-getting-started/project-structure.md) — `tsconfig.json` and the `@/*` alias in a new project.
