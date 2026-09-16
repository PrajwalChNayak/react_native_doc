---
title: Data Fetching and Caching
description: TanStack Query 5 in a native app — wiring focus refetch to AppState, online state to NetInfo, and retry behaviour that survives a real mobile network.
status: current
toolchain: cli
---

Fetching data in React Native is `fetch`, the same API as the browser. Everything hard about it
is what happens around the request: the screen is still mounted when the user comes back three
minutes later, the connection dropped halfway through, the process was suspended mid-flight, and
two screens want the same list.

A query cache solves all of that once. This page uses **TanStack Query 5.102.8**, which is
installed in this handbook's type-check harness, so every sample below is compiled against it and
the real react-native 0.87.1 types.

## Why it exists / when to use it — and when NOT to

### What goes wrong with `useEffect` fetching

The pattern everyone writes first looks reasonable and fails in five specific ways on mobile:

```tsx title=The version that does not scale
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

type Post = {id: string; title: string};

export function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.example.com/posts', {signal: controller.signal})
      .then((response) => response.json() as Promise<Post[]>)
      .then(setPosts)
      .catch(() => {
        // Swallowing the error is what makes this feel fine in development.
      });
    return () => controller.abort();
  }, []);

  return <Text>{posts?.length ?? 0}</Text>;
}
```

1. **No cache.** Navigate away and back and it fetches again, showing a spinner over data you
   already had.
2. **No deduplication.** Two components that need the same list issue two requests.
3. **No staleness model.** The data is either "fresh forever" or "refetched on every mount".
   Neither is what you want.
4. **No retry.** On a mobile network a request fails for ten seconds and then would have
   succeeded. This gives up.
5. **The screen stays mounted.** In a stack navigator, pushing another screen on top does not
   unmount this one, so the cleanup never runs and the data silently ages for as long as the user
   is elsewhere.

Fixing those by hand means writing a cache, a staleness clock, an in-flight registry and a
backoff policy. That is what a query library is.

### When not to use it

- **Client state.** A cart, a form draft, a toggled preference. See
  [Zustand and Redux Toolkit](zustand-and-redux.md).
- **A single one-off request** with no caching requirement — a form submission with no cached
  representation, a fire-and-forget analytics call.
- **Streaming or subscription data.** A websocket pushing updates is a different shape; feed it
  into the cache with `setQueryData` rather than modelling it as a query.

## Basic example

```tsx title=src/api/queryClient.ts
import {QueryClient} from '@tanstack/react-query';

/**
 * Defaults tuned for a phone rather than a desktop browser.
 * - staleTime > 0 so navigating back does not refetch instantly.
 * - gcTime is how long an unused cache entry survives; on mobile the user is
 *   away from a screen for minutes, not seconds.
 * - retry with backoff, because a mobile request failing once means nothing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});
```

```tsx title=src/screens/FeedScreen.tsx
import {ActivityIndicator, FlatList, Text} from 'react-native';
import {useQuery} from '@tanstack/react-query';

type Post = {id: string; title: string};

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch('https://api.example.com/posts');
  // fetch does not reject on a 4xx or 5xx. Without this check a 500 becomes a
  // successful query holding an error page's body.
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return (await response.json()) as Post[];
}

export function FeedScreen() {
  // v5 takes a single options object — the positional (key, fn) overloads
  // from v4 were removed.
  const {data, isPending, isError, refetch, isRefetching} = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  if (isPending) {
    return <ActivityIndicator />;
  }
  if (isError) {
    return <Text>Could not load posts</Text>;
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(post) => post.id}
      renderItem={({item}) => <Text>{item.title}</Text>}
      // Pull to refresh maps straight onto refetch.
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}
```

## How it works

### Version 5, not version 4

Most material online is written against v4 and does not compile against 5.102.8. The differences
that bite:

| v4 | v5 |
| --- | --- |
| `useQuery(key, fn, options)` positional overloads | One options object only |
| `isLoading` meaning "no data yet" | **`isPending`**. `isLoading` now means `isPending && isFetching` |
| `cacheTime` | **`gcTime`** |
| `useErrorBoundary` | **`throwOnError`** |
| `useInfiniteQuery` inferred the first page param | **`initialPageParam` is required** |
| `onSuccess` / `onError` / `onSettled` on `useQuery` | Removed from queries; still on mutations |
| `keepPreviousData: true` | `placeholderData: keepPreviousData` |

If a snippet you found calls `useQuery(['posts'], fetchPosts)`, it is v4.

### Focus refetch: `AppState`, not `window`

By default the library refetches stale queries when the window regains focus. There is no
`window` in React Native, so out of the box that never fires. The fix is to tell the library's
`focusManager` what "focused" means here.

```ts title=src/api/focusBridge.ts
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {focusManager} from '@tanstack/react-query';

/**
 * Import this once, at startup, before anything renders. `setEventListener`
 * replaces the library's own listener wholesale, so this is the single place
 * that decides what focus means in the app.
 *
 * Only 'active' counts. On iOS 'inactive' is a real state — the app switcher,
 * a pulled-down Notification Centre, an incoming call — and refetching during
 * it is work the user cannot see.
 */
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    setFocused(status === 'active');
  });
  // The returned function is the teardown. Returning nothing leaks the
  // subscription if the listener is ever replaced.
  return () => subscription.remove();
});
```

The effect is the behaviour users expect: come back to the app after lunch, and the screen you
left is refreshed rather than showing an hour-old list.

With that wired, `refetchOnWindowFocus` becomes meaningful — and worth tuning per query. A feed
should refetch on focus; a user's own profile probably should not.

### Online state: `NetInfo`, not `navigator.onLine`

The same problem in the other direction. The library's `onlineManager` decides whether to pause
retries and whether to refetch on reconnect, and its browser implementation does not apply here.

`@react-native-community/netinfo` **12.0.1** is the verified library for this.

```ts title=src/api/onlineBridge.ts
import NetInfo from '@react-native-community/netinfo';
import {onlineManager} from '@tanstack/react-query';

/**
 * `isConnected` means "attached to a network". `isInternetReachable` means
 * "that network actually reaches the internet" — the captive-portal case,
 * where a hotel wifi is connected and useless.
 *
 * isInternetReachable is `null` while the check is still in flight, so treat
 * only an explicit `false` as offline. Treating null as offline makes the app
 * start in an offline state on every cold launch.
 */
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });
});
```

Once this is wired, a query that fails while offline stops burning retries, and reconnecting
triggers a refetch instead of leaving the user staring at an error.

### Retry and backoff on a real mobile network

Defaults matter more here than on the web, because mobile failures are overwhelmingly transient:
a tunnel, a lift, a handover between cells. The two things to get right:

```ts title=src/api/retryPolicy.ts
import {QueryClient} from '@tanstack/react-query';

/** A 4xx will not succeed on retry. A 5xx or a network error might. */
function isRetriable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status >= 500;
  }
  // A thrown TypeError from fetch is a network failure, which is retriable.
  return true;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Request failed with ${status}`);
    this.status = status;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Give up after three attempts, and never retry a client error.
      retry: (failureCount, error) => failureCount < 3 && isRetriable(error),
      // Exponential backoff, capped. Without the cap, a long offline period
      // produces retries hours apart.
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      // Mutations are not idempotent by default. Retrying a "create order"
      // silently can charge someone twice.
      retry: 0,
    },
  },
});
```

The second half of that is the one people miss. Retrying a `GET` is free; retrying a `POST` is a
decision about your API's idempotency, and the safe default is not to.

### Query keys are the cache

A query key is an array, and it is the identity of the cached entry. Every input the query
depends on belongs in it.

```ts title=src/api/postKeys.ts
/**
 * A key factory keeps keys consistent and makes invalidation readable.
 * Prefix-matching means invalidating `['posts']` also invalidates every
 * `['posts', 'detail', id]` below it.
 */
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filter: string) => [...postKeys.lists(), filter] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};
```

A key missing a dependency is the classic bug: `queryKey: ['posts']` for a query that reads a
`filter` variable returns the first filter's data for every filter, forever.

## Platform differences

:::tabs
@tab iOS
The process is suspended shortly after backgrounding. An in-flight request does not complete and
its promise does not settle until the app is resumed — at which point it may resume, or may have
timed out at the network layer. Do not write code that assumes a request either succeeds or fails
within a bounded time while backgrounded.

Because iOS emits `inactive` as a real state, gating focus on `status === 'active'` also means the
app does not refetch when the user merely pulls down Notification Centre.
@tab Android
The process keeps running longer after backgrounding, so a request can complete while the app is
not visible, and a refetch you did not gate will run. That is where "the app drains battery in my
pocket" reports come from.

Android can also kill the process at any point with no callback, so an in-memory cache is gone on
the next launch. If the first screen must show something instantly, persist the cache or seed it
from local storage.
:::

## Common patterns

### Wire both bridges once, at startup

```tsx title=src/App.tsx
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppState, Text} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {focusManager, onlineManager} from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

// Both managers are global singletons, so these run once at module scope —
// not in an effect, where a remount would re-register them.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    setFocused(status === 'active');
  });
  return () => subscription.remove();
});

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {queries: {staleTime: 30_000, gcTime: 5 * 60_000, retry: 3}},
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Text>Screens go here</Text>
    </QueryClientProvider>
  );
}
```

### Mutations that invalidate

```tsx title=src/api/useCreatePost.ts
import {useMutation, useQueryClient} from '@tanstack/react-query';

type NewPost = {title: string; body: string};

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewPost): Promise<void> => {
      const response = await fetch('https://api.example.com/posts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
    },
    onSuccess: () => {
      // Prefix invalidation: every query whose key starts with ['posts'] is
      // marked stale, so the list refetches without naming each one.
      void queryClient.invalidateQueries({queryKey: ['posts']});
    },
  });
}
```

### Infinite lists

Mobile feeds are paginated, and `useInfiniteQuery` in v5 requires `initialPageParam` explicitly.

```ts title=src/api/useFeed.ts
import {useInfiniteQuery} from '@tanstack/react-query';

type Post = {id: string; title: string};
type Page = {items: Post[]; nextCursor: number | null};

export function useFeed() {
  return useInfiniteQuery({
    queryKey: ['feed'],
    // Required in v5. There is no inference from the queryFn signature.
    initialPageParam: 0,
    queryFn: async ({pageParam}): Promise<Page> => {
      const response = await fetch(`https://api.example.com/feed?cursor=${pageParam}`);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      return (await response.json()) as Page;
    },
    // Returning null or undefined here is what marks the end of the list.
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

Wire `fetchNextPage` to a `FlatList`'s `onEndReached`, and guard it with `hasNextPage` and
`isFetchingNextPage` so a fast scroll does not fire five page requests.

### Pair the query cache with a persistent one

A cold start shows a spinner unless something is on disk. That is the offline-first problem, and
it is covered in [Offline-First](offline-first.md).

## Performance considerations

- **`staleTime: 0` is the default and is wrong for mobile.** Every mount refetches. Pick a real
  number per query family: seconds for a live feed, minutes for a profile, hours for a
  configuration blob.
- **`gcTime` is not `staleTime`.** `staleTime` decides when to refetch; `gcTime` decides when to
  throw the entry away. On mobile, keep `gcTime` generous — memory pressure is real but a
  refetch on every back navigation is worse.
- **Structural sharing is on by default.** When a refetch returns data that is deeply equal to
  what is cached, the library keeps the old object identity, so memoised components do not
  re-render. Do not defeat it by mapping the response into a new shape inside `queryFn` unless the
  mapping is deterministic.
- **Deduplication happens per key.** Five components mounting with the same key issue one
  request. That only works if the key is genuinely identical, which is another reason for a key
  factory.
- **Do not `select` an object without memoising the selector.** The same `Object.is` problem as a
  store selector: a new object identity every render.
- **Parsing is JS-thread work.** A 2 MB JSON response blocks the thread while it parses,
  regardless of the library. Paginate.

## Security considerations

**Threat.** Requests carry credentials, and a device the user controls can read them. Two
concrete failures: a token logged to the console in a release build, and a token written into a
query key that then ends up in a persisted cache.

**Exploit.** A query key is serialised into the cache. If you persist the cache to disk and the
key contains a token, the token is in that file in plaintext:

```ts title=Do not do this
import {useQuery} from '@tanstack/react-query';

export function useProfileBadly(token: string) {
  return useQuery({
    // The token is now part of the cache key, and of anything the cache is
    // written to.
    queryKey: ['profile', token],
    queryFn: () => fetch('https://api.example.com/me').then((r) => r.json()),
  });
}
```

**Fix.** Keys identify *data*, not credentials. Put the token in the request, read it from secure
storage at request time, and key on something stable:

```ts title=src/api/useProfile.ts
import {useQuery} from '@tanstack/react-query';

type Profile = {id: string; displayName: string};

/** Supplied by the auth layer; reads from the Keychain or Keystore. */
declare function getAccessToken(): Promise<string | null>;

export function useProfile(userId: string) {
  return useQuery({
    // Keyed on identity, not on the credential.
    queryKey: ['profile', userId],
    queryFn: async (): Promise<Profile> => {
      const token = await getAccessToken();
      const response = await fetch(`https://api.example.com/users/${userId}`, {
        headers: token === null ? {} : {Authorization: `Bearer ${token}`},
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      return (await response.json()) as Profile;
    },
  });
}
```

**Verification.** Persist the cache to a file, then read that file off the device with
`adb shell run-as <package> cat <path>` and search it for anything resembling a token. If the
cache contains one, the key or the cached payload is wrong. The full technique is in
[Keychain and Keystore](../security/secure-storage-keychain-keystore.md).

Two further rules: never log a full request or response object in a release build — see
[Safe Logging in Release Builds](../security/safe-logging.md) — and remember that the API base URL
and every header name in your bundle are readable, as
[Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) demonstrates.

## Common mistakes

- **Using a v4 snippet.** Wrong: `useQuery(['posts'], fetchPosts)`. Right:
  `useQuery({queryKey: ['posts'], queryFn: fetchPosts})`. The positional form was removed in v5.
- **Checking `isLoading` when you mean `isPending`.** In v5 `isLoading` is
  `isPending && isFetching`, so a query that is pending but not currently fetching — paused
  offline, for instance — reports `isLoading: false` with no data. Render on `isPending`.
- **Expecting focus refetch to work out of the box.** There is no `window`. Without a
  `focusManager.setEventListener` bridge to `AppState`, `refetchOnWindowFocus` never fires.
- **Expecting offline detection to work out of the box.** Same reason. Wire `onlineManager` to
  NetInfo or the library never knows the device dropped off the network.
- **Treating `isInternetReachable === null` as offline.** It is `null` while the reachability
  check is in flight, which includes every cold start. Only `false` means offline.
- **Not checking `response.ok`.** `fetch` resolves for a 500. Without the check, the error page's
  body is cached as successful data and no retry happens.
- **Leaving a dependency out of the query key.** A filtered list keyed `['posts']` serves the
  first filter's results for every filter.
- **Retrying mutations by default.** A retried `POST` can duplicate a side effect. Set
  `retry: 0` for mutations unless the endpoint is idempotent.
- **Registering the focus and online bridges inside a component effect.** They are global
  singletons. Registering them per mount re-registers on every remount and the teardown of one
  listener removes the other's.
- **Putting a token in a query key.** It ends up wherever the cache ends up.

## Related topics

- [Hooks in a Native Context](hooks-in-react-native.md) — why the naive `useEffect` version fails, in more detail.
- [App Lifecycle and AppState](app-lifecycle.md) — the status union the focus bridge depends on.
- [Offline-First](offline-first.md) — persisting the cache and queueing mutations.
- [Zustand and Redux Toolkit](zustand-and-redux.md) — the client state that does not belong in the query cache.
- [Secure Storage](secure-storage.md) — where the token the request carries actually lives.
- [Network Inspection](../debugging/network-inspection.md) — watching these requests in React Native DevTools.
- [Certificate Pinning](../security/certificate-pinning.md) — the transport layer under all of this.
- [List Performance in Depth](../performance/list-performance.md) — rendering the paginated data you just fetched.
