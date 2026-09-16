---
title: Offline-First
description: Detecting connectivity with NetInfo 12, optimistic updates, a durable mutation queue, persisting and rehydrating a query cache, resolving conflicts, and the limits you cannot engineer away.
status: current
toolchain: cli
---

A mobile app is offline regularly and briefly: a lift, a tunnel, a basement, a handover between
cells, a plane. "Offline-first" is not a feature you bolt on for the rare user with no signal — it
is the assumption that **the network is an optimisation, not a precondition**, applied to an app
that most of the time has a perfectly good connection.

That assumption produces four concrete pieces of work, and this page covers them in order:

1. **Know the connection state** — and know how little that tells you.
2. **Read from a cache that survives a restart**, so a cold launch is not a spinner.
3. **Accept writes while offline**, durably, and replay them in order later.
4. **Resolve the conflicts** that step 3 makes inevitable.

There is also a fifth thing you cannot do, and the honest limits section at the end says what it is.

## Why it exists / when to use it — and when NOT to

Full offline-first is real work. It is worth it when the user creates content, when sessions are
long, or when the app is used somewhere with bad signal by definition — field work, travel,
warehouses, transit.

It is **not** worth it when the data is meaningless offline. A live auction, a payment
confirmation, a video call, a real-time dashboard: for these, detecting offline and saying so
clearly is the whole feature, and queueing a bid to send later is actively harmful.

| App | Right level |
| --- | --- |
| Note taking, task list, journal | Full: local writes, queue, sync, conflict resolution |
| Feed reader, documentation, catalogue | Read cache only — persist queries, no write queue |
| Messaging | Full, with per-message delivery state visible to the user |
| Banking, payments, ticketing | Cache reads; **refuse** writes offline and say why |
| Live auction, live scores, trading | Neither. Show a clear disconnected state |

## Detecting the connection: NetInfo 12

`@react-native-community/netinfo` **12.0.1** is the verified library. There is no `navigator.onLine`
in React Native, and there is no core API for this.

:::tabs
@tab npm
```bash
npm install @react-native-community/netinfo@12.0.1
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add @react-native-community/netinfo@12.0.1
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add @react-native-community/netinfo@12.0.1
cd ios && bundle exec pod install
```
:::

### Three states, not two

The state object distinguishes three things that people routinely collapse into one boolean, and
getting this wrong is the most common offline-first bug.

| Field | Type | Means |
| --- | --- | --- |
| `isConnected` | `boolean \| null` | Attached to **a** network. Says nothing about the internet |
| `isInternetReachable` | `boolean \| null` | That network actually reaches the internet — the captive-portal case |
| `type` | `NetInfoStateType` | `wifi`, `cellular`, `ethernet`, `bluetooth`, `vpn`, `wimax`, `other`, `none`, `unknown` |
| `details.isConnectionExpensive` | `boolean` | Metered. Present on every connected state |

`isInternetReachable` is **`null` while the reachability probe is still in flight**, which it is on
every cold launch. Treating `null` as offline means the app opens into an offline state every single
time.

```tsx title=src/components/OfflineBanner.tsx
import {useNetInfo} from '@react-native-community/netinfo';
import {StyleSheet, Text, View} from 'react-native';

export function OfflineBanner() {
  const {isConnected, isInternetReachable, type} = useNetInfo();

  // Only an explicit `false` counts. `null` means "not known yet", and the
  // answer arrives a moment later.
  const offline = isConnected === false || isInternetReachable === false;
  if (!offline) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — changes will sync when you reconnect ({type})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {backgroundColor: '#663300', padding: 8},
  text: {color: 'white'},
});
```

`useNetInfo()` subscribes to the library's global singleton. `useNetInfoInstance()` creates an
isolated checker with its own configuration — useful when one screen needs an aggressive
reachability check and the rest of the app does not.

> [!WARNING] "Online" is not "your API is up"
> NetInfo answers a question about the device's network stack. It cannot tell you that your server
> is reachable, that DNS resolves, that the corporate proxy will allow the request, or that the
> response will not be a 503. Use it to **avoid pointless requests and to explain failures**, never
> as the only failure path. Every request still needs its own error handling.

## Reading offline: persist the query cache

This page assumes [Data Fetching and Caching](data-fetching.md) is already wired — in particular
the `focusManager` and `onlineManager` bridges, which are the prerequisite for everything below.
`@tanstack/react-query` 5.102.8 keeps its cache in memory, so it is empty on every cold start. The
fix is to write it to disk and read it back.

The official persistence plugins are separate packages. The hand-rolled version below is about
thirty lines, uses only `dehydrate` and `hydrate` from the core, and — importantly — makes the
versioning and expiry decisions explicit rather than hiding them in configuration.

```ts title=src/api/persistedClient.ts
import {dehydrate, hydrate, QueryClient} from '@tanstack/react-query';
import type {DehydratedState} from '@tanstack/react-query';
import {createMMKV} from 'react-native-mmkv';

// MMKV because reads are synchronous: the cache can be restored before the
// first render, so there is no flash of empty state. See
// AsyncStorage vs MMKV for the install trap.
const store = createMMKV({id: 'query-cache'});
const CACHE_KEY = 'tanstack.cache.v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // gcTime must be longer than the persisted data's useful life, or a
      // query is garbage-collected out of memory before you ever dehydrate it.
      gcTime: 24 * 60 * 60 * 1000,
      staleTime: 30_000,
      // 'offlineFirst' runs the queryFn once even when offline, so a Metro-
      // level or service-worker-level cache can answer. The default 'online'
      // would not even try.
      networkMode: 'offlineFirst',
    },
    mutations: {networkMode: 'offlineFirst'},
  },
});

type Envelope = {version: number; savedAt: number; state: DehydratedState};

/** Bump when a queryFn's shape changes. A stale shape is a crash, not a miss. */
const VERSION = 1;
const MAX_AGE = 24 * 60 * 60 * 1000;

export function persistCache(): void {
  const envelope: Envelope = {
    version: VERSION,
    savedAt: Date.now(),
    state: dehydrate(queryClient, {
      // Persist only settled data, and never anything sensitive. A dehydrated
      // cache is a plain JSON file in the app's data directory.
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && query.queryKey[0] !== 'session',
    }),
  };
  store.set(CACHE_KEY, JSON.stringify(envelope));
}

export function restoreCache(): void {
  const raw = store.getString(CACHE_KEY);
  if (raw === undefined) {
    return;
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(raw) as Envelope;
  } catch {
    // Corrupt entry — a half-written file after a kill. Drop it and move on.
    store.remove(CACHE_KEY);
    return;
  }

  if (envelope.version !== VERSION || Date.now() - envelope.savedAt > MAX_AGE) {
    store.remove(CACHE_KEY);
    return;
  }

  hydrate(queryClient, envelope.state);
}
```

Call `restoreCache()` once at module scope before the first render, and `persistCache()` when the
app backgrounds — which is the only reliable moment, and is explained in
[App Lifecycle and AppState](app-lifecycle.md).

Three things this deliberately does:

- **Versions the payload.** A persisted cache outlives an app update. Without a version check, the
  new code reads last week's shape and crashes on a field that no longer exists.
- **Expires it.** Week-old data presented as current is worse than a spinner.
- **Filters what is written.** `shouldDehydrateQuery` is the security boundary. See below.

## Writing offline: optimistic updates

An optimistic update applies the change to the cache immediately and reconciles later. On mobile
this is not a nicety — a three-second round trip on a bad connection is the difference between an
app that feels broken and one that does not.

```ts title=src/api/useToggleTodo.ts
import {useMutation, useQueryClient} from '@tanstack/react-query';

type Todo = {id: string; title: string; done: boolean; updatedAt: number};

const todosKey = ['todos'] as const;

async function toggleOnServer(input: {id: string; done: boolean}): Promise<Todo> {
  const response = await fetch(`https://api.example.com/todos/${input.id}`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({done: input.done}),
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return (await response.json()) as Todo;
}

export function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleOnServer,
    onMutate: async (input) => {
      // Cancel in-flight refetches first. A response that was already on the
      // wire can land after the optimistic write and silently undo it.
      await queryClient.cancelQueries({queryKey: todosKey});

      const previous = queryClient.getQueryData<Todo[]>(todosKey);

      queryClient.setQueryData<Todo[]>(todosKey, (current) =>
        current?.map((todo) =>
          todo.id === input.id ? {...todo, done: input.done, updatedAt: Date.now()} : todo,
        ),
      );

      // The return value becomes the `context` argument of onError/onSettled.
      return {previous};
    },
    onError: (_error, _input, context) => {
      // Roll back to the exact snapshot, not to a recomputed value.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(todosKey, context.previous);
      }
    },
    onSettled: () => {
      // Always refetch, success or failure. The server is the arbiter, and the
      // optimistic value was a guess.
      void queryClient.invalidateQueries({queryKey: todosKey});
    },
  });
}
```

React 19's `useOptimistic` covers the same ground for local, transient state, and is the right
tool when the optimistic value does not need to be in a cache other screens read. For anything
that touches shared server state, do it in the mutation as above.

> [!WARNING] An optimistic update is a promise you might have to break
> The user saw the change. If the request later fails, you rolled it back — and unless you tell
> them, they now believe something that is not true. Every optimistic path needs a visible failure
> story: a toast, a per-row error state, a retry affordance. Silently reverting is the worst
> possible outcome.

## The mutation queue

Optimistic updates handle a request that is *in flight*. A queue handles a request that cannot be
made at all.

### The built-in version

With the `onlineManager` bridge wired, mutations made while offline are **paused** rather than
failed. Resuming them is one call, and the natural trigger is reconnecting.

```ts title=src/api/onlineBridge.ts
import NetInfo from '@react-native-community/netinfo';
import {onlineManager} from '@tanstack/react-query';
import type {QueryClient} from '@tanstack/react-query';

/** Call once at startup with the client from persistedClient.ts. */
export function wireOnlineBridge(queryClient: QueryClient): void {
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);

      if (online) {
        // Paused mutations do not resume on their own after a cold start.
        void queryClient.resumePausedMutations();
      }
    });
  });
}
```

For a paused mutation to survive a **restart**, two more things are needed: it must be included
when you dehydrate (`defaultShouldDehydrateMutation` already selects paused ones), and the app must
be able to find its `mutationFn` again after hydration — a function cannot be serialised.

```ts title=src/api/mutationDefaults.ts
import type {QueryClient} from '@tanstack/react-query';

async function toggleOnServer(input: {id: string; done: boolean}): Promise<void> {
  const response = await fetch(`https://api.example.com/todos/${input.id}`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({done: input.done}),
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
}

/**
 * Call at startup, before restoring the cache. Registering the function
 * against a mutation key is what lets a mutation restored from disk know what
 * to run — the serialised form carries the key and the variables, never the
 * function.
 */
export function registerMutationDefaults(client: QueryClient): void {
  client.setMutationDefaults(['todos', 'toggle'], {
    mutationFn: toggleOnServer,
    retry: 3,
  });
}
```

The mutation itself then has to be created with that same `mutationKey`, or the default will not
be found.

### The explicit version

Once the queue has requirements the library does not cover — strict ordering, collapsing duplicate
operations, an idempotency key per entry, a visible pending count, a poison-message policy — write
it. It is not much code, and it is much easier to reason about than a configuration that almost
does what you want.

```ts title=src/sync/outbox.ts
import {createMMKV} from 'react-native-mmkv';

type Operation =
  | {kind: 'todo.toggle'; id: string; done: boolean}
  | {kind: 'todo.rename'; id: string; title: string};

type QueuedOperation = {
  /** Generated on the device, so a retry is recognisable as the same request. */
  id: string;
  op: Operation;
  createdAt: number;
  attempts: number;
};

const store = createMMKV({id: 'outbox'});
const KEY = 'outbox.v1';

function read(): QueuedOperation[] {
  const raw = store.getString(KEY);
  if (raw === undefined) {
    return [];
  }
  try {
    return JSON.parse(raw) as QueuedOperation[];
  } catch {
    store.remove(KEY);
    return [];
  }
}

function write(queue: QueuedOperation[]): void {
  // MMKV writes synchronously, so the entry is on disk when this returns.
  // With AsyncStorage there is a window where a process kill loses the write.
  store.set(KEY, JSON.stringify(queue));
}

export function enqueue(op: Operation): void {
  const queue = read();

  // Collapse: toggling the same row twice should send one request, not two the
  // server has to reconcile in order.
  const withoutDuplicate = queue.filter(
    (entry) => !(entry.op.kind === op.kind && entry.op.id === op.id),
  );

  withoutDuplicate.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    op,
    createdAt: Date.now(),
    attempts: 0,
  });
  write(withoutDuplicate);
}

async function send(entry: QueuedOperation): Promise<Response> {
  return fetch('https://api.example.com/operations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The server stores this key and replays the original result for a
      // repeat, so a retry after a timeout cannot double-apply the operation.
      'Idempotency-Key': entry.id,
    },
    body: JSON.stringify(entry.op),
  });
}

const MAX_ATTEMPTS = 5;

/** Drains in order and stops at the first failure, so causality is preserved. */
export async function drain(): Promise<void> {
  let queue = read();

  while (queue.length > 0) {
    const entry = queue[0];

    let response: Response;
    try {
      response = await send(entry);
    } catch {
      // A network failure. Keep the entry and stop; the next reconnect retries.
      return;
    }

    if (response.status >= 400 && response.status < 500) {
      // Permanently rejected. Retrying never helps, and leaving it at the head
      // of the queue blocks every later operation forever. Drop it and report.
      queue = queue.slice(1);
      write(queue);
      continue;
    }

    if (!response.ok) {
      const attempts = entry.attempts + 1;
      queue =
        attempts >= MAX_ATTEMPTS ? queue.slice(1) : [{...entry, attempts}, ...queue.slice(1)];
      write(queue);
      return;
    }

    queue = queue.slice(1);
    write(queue);
  }
}

export function pendingCount(): number {
  return read().length;
}
```

Four decisions in there are worth calling out, because they are the ones people leave out:

1. **An idempotency key generated on the device.** Without it, "request sent, response lost" is
   indistinguishable from "request never arrived", and the retry double-applies.
2. **Stop at the first failure.** Skipping ahead reorders operations, and a rename applied after a
   delete is a bug that is very hard to reproduce.
3. **A poison-message policy.** A 4xx that will never succeed must leave the queue, or one bad
   entry blocks sync permanently. Drop it *and tell the user*.
4. **A bounded attempt count** on 5xx, so a broken server does not drain the battery.

## Resolving conflicts

Offline writes make concurrent edits possible, and no library resolves that for you. Pick a
strategy per data type — the question is "what does the user lose if we get it wrong".

| Strategy | How | Right for |
| --- | --- | --- |
| Last write wins | Compare timestamps, newest wins | Preferences, toggles, read state |
| Server wins | Discard the local change on conflict | Data the server computes — prices, balances, availability |
| Client wins | Force the local change | Single-device data the server only stores |
| Field-level merge | Merge non-overlapping fields, ask on overlap | Documents, profiles, forms |
| Append-only | Never update; write events and fold them | Messages, logs, comments, activity feeds |

**Append-only is the one to reach for first.** A conflict requires two writers editing one value;
if there is no value to edit, there is no conflict. Restructuring "the todo is done" as "a
completion event at time T" removes the whole problem for a surprising range of features.

For the cases where you genuinely have a mutable record, a three-way merge with a server version
number is the workhorse:

```ts title=src/sync/mergeNote.ts
type Note = {id: string; title: string; body: string; version: number; updatedAt: number};

/**
 * Three-way merge against the version the device last saw.
 *
 * `base`   — what we had when the offline edit started.
 * `local`  — the edit made offline.
 * `remote` — what the server has now.
 *
 * Returns null when the two edits genuinely overlap and only a human can
 * decide. Do not guess in that case; show both.
 */
export function mergeNote(base: Note, local: Note, remote: Note): Note | null {
  if (remote.version === base.version) {
    // Nobody else touched it while we were away. The local edit is authoritative.
    return {...local, version: remote.version};
  }

  const titleChangedLocally = local.title !== base.title;
  const titleChangedRemotely = remote.title !== base.title;
  const bodyChangedLocally = local.body !== base.body;
  const bodyChangedRemotely = remote.body !== base.body;

  if (
    (titleChangedLocally && titleChangedRemotely) ||
    (bodyChangedLocally && bodyChangedRemotely)
  ) {
    return null;
  }

  return {
    ...remote,
    title: titleChangedLocally ? local.title : remote.title,
    body: bodyChangedLocally ? local.body : remote.body,
    updatedAt: Date.now(),
  };
}
```

Note what the version number is doing: it is the **server's** counter, so it is the only value both
sides agree on. Comparing device timestamps instead is unreliable — see the honest limits.

## Security considerations

### Threat

A persisted cache and an outbox are files in the app's data directory. An attacker with file-level
access — a rooted or jailbroken device, a debuggable build, a device backup on a laptop — reads
them as plain text. Whatever your API returned is now at rest, indefinitely, with none of the
protections the network transport had.

### Exploit

On a debuggable Android build, no root is required:

```bash
# The dehydrated query cache, and the outbox with its request bodies.
adb shell run-as com.example.app cat files/mmkv/query-cache | strings | head -40
adb shell run-as com.example.app cat files/mmkv/outbox | strings
```

Read the output. A cache of `['user', 'me']` holds an email address and probably more; an outbox
entry holds the full body of every queued request, which may include a password change or a payment
instruction.

### Fix

1. **`shouldDehydrateQuery` is an allow-list, not a tidy-up.** Persist the queries you decided to
   persist. Never persist a session, a token, payment details or anything you would not put in a
   backup.
2. **Never queue a credential.** An outbox entry containing a password or a card number is a
   plaintext credential on disk with an unbounded lifetime. Operations that carry secrets must fail
   offline rather than queue.
3. **Clear both on logout.** A cache that outlives the session leaks the previous user's data to
   the next one on a shared device.
4. **Bound the age.** `MAX_AGE` limits how long the data is on disk as well as how stale it may be.
5. **Encrypt only with an on-device key.** MMKV's encryption is worth having for bulk data at rest,
   and only if the key is generated on the device and stored in the Keychain or Keystore. A key in
   the source is in the bundle — see
   [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

### Verification

```bash
# 1. What did we actually write?
adb shell run-as com.example.app cat files/mmkv/query-cache | strings > /tmp/cache.txt
grep -i "token\|password\|email\|card\|ssn\|authorization" /tmp/cache.txt

# 2. Does it survive logout?
#    Log out in the app, then re-run step 1. Anything still there is a finding.

# 3. Can it leave the device?
grep -n "allowBackup\|dataExtractionRules" android/app/src/main/AndroidManifest.xml
```

## Honest limits

These are the things you cannot engineer away. Design around them; do not promise around them.

**You cannot sync in the background.** This is the big one. A suspended app runs no JavaScript at
all — your queue does not drain, your timers do not fire, your promises do not settle. Sync happens
when the app is open. [Background Refresh](background-refresh.md) explains exactly what the OS does
and does not allow.

**Optimistic UI is a claim you may have to retract.** Plan the retraction. A user who acted on a
value that was later rolled back, and was not told, has been misled by your app.

**A persisted cache is not a database.** No queries, no indexes, no partial loads, no transactions.
The whole envelope is parsed on startup, so a large cache is a slow cold start and a memory spike.
If you need to query local data, you need a local database, and that is a different architecture.

**The device clock is not trustworthy.** Users change it; time zones change; the OS adjusts it.
Ordering and expiry that depend on `Date.now()` across devices will be wrong for someone. Use a
server-assigned version or sequence number for anything that matters, and treat device timestamps
as display-only.

**The auth token expires while you are offline.** The queue drains on reconnect and every request
401s at once. Refresh before draining, and make the queue tolerate a refresh failure without
dropping its contents.

**"Connected" does not mean "your API works".** Captive portals, corporate proxies, DNS failures,
your own outage. NetInfo cannot see any of these.

**The persisted format outlives the app version.** Users skip releases. Version the envelope, and
on a mismatch discard rather than migrate — a cache is reconstructible, and a migration bug in a
cache is a crash loop on launch.

**Conflicts are a product decision, not a technical one.** If the automatic answer is wrong, the
user loses work. Where you cannot merge confidently, show both versions and ask.

**iOS and Android kill the process differently.** Android kills backgrounded processes without
warning and without running any JavaScript. A synchronous MMKV write is on disk when the call
returns; an in-flight asynchronous write is not. This is the strongest practical argument for MMKV
in this specific role — see [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md).

## Platform differences

:::tabs
@tab iOS
NetInfo reports `type: 'cellular'` with `details.cellularGeneration` and `carrier`. Wi-Fi SSID
details need `shouldFetchWiFiSSID` in the configuration **and** location permission — iOS treats
the SSID as location data.

The process is suspended shortly after backgrounding, so the outbox stops draining mid-queue. The
idempotency key is what makes resuming safe. `URLSession` background transfers are the only
exception, and reaching them requires native code.

`isInternetReachable` is derived from the system's reachability API plus the library's own probe.
@tab Android
NetInfo reports `isWifiEnabled` in addition to `type`. Reading the Wi-Fi SSID needs
`ACCESS_FINE_LOCATION`, and the value is `null` without it.

Android can kill a backgrounded process at any moment with no callback of any kind. Treat every
write to the outbox as the last code that will run, which is why `enqueue` persists immediately
rather than batching.

Doze mode and vendor battery managers also delay or drop background network activity entirely,
which is another reason the queue drains on foreground rather than on a schedule.
:::

## Common mistakes

- **Treating `isInternetReachable === null` as offline.** It is `null` while the probe is in
  flight, which it is on every cold start. Wrong: `if (!state.isInternetReachable)`. Right:
  `if (state.isInternetReachable === false)`.
- **Treating `isConnected` as "the internet works".** It means "attached to a network". A captive
  portal is `isConnected: true` and useless.
- **Gating the request on the connection state.** Wrong: `if (online) fetch(...)`. Right: make the
  request and handle the failure; use the state to avoid retry storms and to explain what happened.
  The state can be stale by the time you read it.
- **Persisting the cache without a version.** An app update changes the shape, the old envelope
  hydrates, and the app crashes on launch for everyone who updated. Version it and discard on
  mismatch.
- **Persisting everything.** `shouldDehydrateQuery` defaults to "all successful queries", which
  includes the one holding the user's session. Allow-list.
- **`gcTime` shorter than the persistence window.** The query is evicted from memory before you
  dehydrate, so nothing is saved and the bug looks like persistence not working at all.
- **Forgetting `cancelQueries` in `onMutate`.** A refetch already on the wire lands after the
  optimistic write and reverts it. The symptom is a checkbox that flicks back a second later.
- **Rolling back by recomputing instead of snapshotting.** Keep the previous value in the context
  object and restore exactly that. Inverting the change is wrong the moment two mutations overlap.
- **No idempotency key on queued writes.** "Sent but no response" is the normal failure on a bad
  connection. Without a key, the retry creates a second record.
- **Skipping a failed entry to keep the queue moving.** That reorders operations. Stop at the
  first failure, unless the failure is permanent — in which case drop it and tell the user.
- **No poison-message policy.** One permanently-rejected entry at the head of the queue blocks
  every later operation forever, and the user has no idea why nothing syncs.
- **Queueing a credential or a payment.** Those operations must fail offline. A plaintext password
  sitting in an outbox on disk is a much worse outcome than a failed request.
- **Resolving conflicts with `Date.now()` from two devices.** The clocks disagree. Use a
  server-assigned version.
- **Promising background sync.** Nothing runs while the app is suspended. If the UI says "syncing
  in the background", the UI is lying.
- **Not clearing the cache and outbox on logout.** The next user of the device inherits both.

## Related topics

- [Data Fetching and Caching](data-fetching.md) — the `focusManager` and `onlineManager` bridges this builds on.
- [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) — why the synchronous store is the right one here.
- [App Lifecycle and AppState](app-lifecycle.md) — when to persist, and why "on exit" is not a hook.
- [Background Refresh](background-refresh.md) — what the OS actually permits while the app is closed.
- [Secure Storage](secure-storage.md) — where anything sensitive goes instead of a persisted cache.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — why a hard-coded encryption key is not a key.
- [Zustand and Redux Toolkit](zustand-and-redux.md) — the client state that sits alongside this.
- [Hooks in a Native Context](hooks-in-react-native.md) — `useOptimistic` and the rest of React 19.
- [RefreshControl](../components/refreshcontrol.md) — the manual sync gesture users expect.
- [Startup Time](../performance/startup-time.md) — where hydrating a large cache shows up.
