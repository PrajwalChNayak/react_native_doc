---
title: State Persistence
description: Saving and restoring the navigation state across app restarts and Android process death — the wiring, the versioning, and why restored state is untrusted input.
status: current
toolchain: cli
---

Navigation state is a plain serialisable object, so it can be written to disk when it changes and
handed back to the container the next time the app starts. The user returns to the screen they left
instead of the home screen.

That is the entire mechanism: `onStateChange` out, `initialState` in. The work is in deciding when
restoring is right, versioning what you store, and remembering that a file on disk is not something
you can trust.

## Why it exists / when to use it — and when NOT to

There are two quite different reasons to do this.

**Development.** Android and iOS both kill backgrounded apps, and Fast Refresh does not survive a
full reload. Persisting state in development means editing a screen five pushes deep without
re-navigating to it every time. This is a near-universal win and costs nothing in production.

**Production.** Android reclaims memory by killing the process; when the user returns, the app
starts cold and lands on the home screen having lost their place. Restoring state fixes that. It is
the right call for an app where the user is in the middle of something — a long form, a reading
position, a multi-step flow.

It is the wrong call when restoring can put the user somewhere that no longer makes sense: a screen
behind an authentication wall after the session expired, a checkout for an order that has since been
placed, a detail screen for a record that was deleted. Restoring blind into any of those is worse
than the home screen.

The pragmatic default is: on in development always, on in production selectively, with the restored
state validated before it is used.

> [!WARNING] Restoring disables initial deep link handling
> `NavigationContainer` documents this directly: when `initialState` is provided, deep links and
> URLs are not handled on the initial render. If the app was launched by a link, that link must win
> over the saved state — the example below checks for one first.

## Basic example

```tsx title=src/App.tsx
import {useCallback, useEffect, useState} from 'react';
import {Linking, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import type {InitialState} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump the version whenever the navigator shape changes.
const PERSISTENCE_KEY = 'NAVIGATION_STATE_V1';

const Stack = createNativeStackNavigator<{Home: undefined; Details: {id: string}}>();

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  // In production, start ready and skip restoration entirely.
  const [isReady, setIsReady] = useState(!__DEV__);
  const [initialState, setInitialState] = useState<InitialState | undefined>();

  useEffect(() => {
    if (isReady) {
      return;
    }

    const restore = async () => {
      try {
        // A launch URL takes precedence over saved state.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl !== null) {
          return;
        }

        const saved = await AsyncStorage.getItem(PERSISTENCE_KEY);
        if (saved !== null) {
          setInitialState(JSON.parse(saved) as InitialState);
        }
      } catch {
        // Corrupt or unreadable state must never block startup.
      } finally {
        setIsReady(true);
      }
    };

    void restore();
  }, [isReady]);

  const onStateChange = useCallback((state: Readonly<object> | undefined) => {
    void AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state));
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <NavigationContainer initialState={initialState} onStateChange={onStateChange}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Placeholder} />
        <Stack.Screen name="Details" component={Placeholder} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

Three details that are not decorative. The container must not mount until restoration has finished,
because `initialState` is only read on the first render — that is what the `isReady` gate is for.
The `try`/`catch` is mandatory: corrupt JSON on disk would otherwise throw during startup and leave
the app on a blank screen forever. And the persistence key carries a version.

## How it works

`onStateChange` fires with the full state tree after every navigation. `JSON.stringify` of that tree
is what you store — it is the same nested object described in [Fundamentals](fundamentals.md), with
route names, keys and params at every level.

On the next launch, `initialState` replaces the state the navigators would have built from their
`initialRouteName` props. The routers accept a `PartialState`, so a tree that is missing keys still
works; React Navigation fills in what it can.

Nothing validates that the restored tree matches the current navigators. If a route name no longer
exists, you get a state referencing a screen that is not registered, and the behaviour ranges from a
blank screen to an unhandled action. That is what the version in the key is for: change the
navigator structure, change the version, and yesterday's state is ignored rather than half-applied.

### Versioning against app upgrades

A version in the key handles your own structural changes. Pair it with the app version so a user who
updates mid-flow does not get restored into the old shape:

```ts title=src/navigation/persistence.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'NAVIGATION_STATE_V1';

type Stored = {
  appVersion: string;
  state: unknown;
};

export async function saveState(appVersion: string, state: unknown): Promise<void> {
  const payload: Stored = {appVersion, state};
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function loadState(appVersion: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    // Discard state written by a different build rather than trying to migrate it.
    if (parsed.appVersion !== appVersion) {
      await AsyncStorage.removeItem(KEY);
      return undefined;
    }
    return parsed.state;
  } catch {
    await AsyncStorage.removeItem(KEY);
    return undefined;
  }
}
```

### Storing it synchronously with MMKV

`AsyncStorage` is asynchronous, which means the restore path is a promise and the app has to wait
for it. `react-native-mmkv` reads synchronously, so the state is available during the first render
and there is no gate at all:

```ts title=src/navigation/persistence.mmkv.ts
import {createMMKV} from 'react-native-mmkv';

const storage = createMMKV({id: 'navigation'});
const KEY = 'NAVIGATION_STATE_V1';

export function saveState(state: unknown): void {
  storage.set(KEY, JSON.stringify(state));
}

export function loadState(): unknown {
  const raw = storage.getString(KEY);
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    storage.remove(KEY);
    return undefined;
  }
}
```

MMKV 4 is built on Nitro Modules, so `react-native-nitro-modules` is a required peer install. The
comparison in full is in [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md).

## Platform differences

:::tabs
@tab Android
This is where persistence earns its keep. Android kills backgrounded processes routinely, and the
system then recreates the Activity from a saved bundle — so the app appears to resume but the
JavaScript context is new.

`react-native-screens` renders screens as Fragments, and Android restores Fragments on that path.
Without the `RNScreensFragmentFactory` set in `MainActivity.kt` — see
[Fundamentals](fundamentals.md) — restored fragments come back in a state that was never persisted,
which surfaces as a crash the first time a user returns to a long-backgrounded app. Persisting
navigation state does not remove that requirement; the two work together.

Reproduce it without waiting for the system to do it:

```bash
adb shell am kill com.awesomeproject
```

Then reopen the app from the recents list.
@tab iOS
iOS terminates backgrounded apps too, though less aggressively, and it does not recreate view
controllers from a saved hierarchy the way Android does with Fragments. A cold start is genuinely
cold, so `initialState` is the only path back.

Simulate it by killing the app from the app switcher and reopening it, or:

```bash
xcrun simctl terminate booted com.awesomeproject
```
:::

## Security considerations

### Threat

The persisted state is a plaintext JSON file in your app's data directory containing every route in
the tree and every param on it. Params are where ids live — and, in codebases that treat them as a
convenient bag, sometimes more than ids.

On a rooted or jailbroken device the file is readable by any process running as the user. It may
also leave the device: Android's auto-backup uploads the app's data directory to the user's Google
account by default, and iOS includes it in iCloud and iTunes backups unless it is excluded.

Restored state is also an *input*. Anyone who can write that file chooses which screen your app
opens with and what params it opens with.

### Exploit

Read it on an emulator or a rooted device:

```bash
adb shell "run-as com.awesomeproject cat /data/data/com.awesomeproject/files/persistStore/..."
```

Anything a screen was navigated to with is in there. A password reset token passed as a param, an
account number, an email address used as a route key — all of it in plain text, and all of it
restored into the app the next time it starts.

### Fix

Three rules, in order of importance.

**Do not put sensitive values in params.** This is the real fix and it is cheap: pass an id, look up
the record. Nothing that would matter in a leaked file should be in the navigation tree at all.
[Params and Typed Routes](params-and-typed-routes.md) covers the same rule from the serialisability
side.

**Validate the restored tree before using it.** Treat it as untrusted, because it is:

```ts title=src/navigation/restore.ts
import type {InitialState} from '@react-navigation/native';

// Only these routes may appear at the root of a restored tree.
const RESTORABLE_ROUTES = new Set(['Home', 'Details', 'Search']);

type RestoreContext = {isSignedIn: boolean};

export function sanitizeState(raw: unknown, context: RestoreContext): InitialState | undefined {
  // A signed-out user is never restored into the signed-in tree.
  if (!context.isSignedIn) {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const state = raw as InitialState;
  const routes = state.routes;

  if (!Array.isArray(routes) || routes.length === 0) {
    return undefined;
  }
  // One unknown route name means the whole tree is from another build. Discard it.
  if (!routes.every((route) => RESTORABLE_ROUTES.has(route.name))) {
    return undefined;
  }

  return state;
}
```

Discarding is the correct failure mode. Trying to repair a partially valid tree produces states that
are hard to reason about and impossible to test.

**Keep it out of backups.** On Android, exclude the file with a backup rules XML referenced from
`android:dataExtractionRules`, or turn `android:allowBackup="false"` on the application element if
your app should not be backed up at all. On iOS, set the "do not back up" resource value on the
file, or store it in `Library/Caches`, which is not backed up. Encrypting the store — MMKV accepts
an `encryptionKey` — raises the cost of reading it, but the key still ships inside the app, so treat
that as defence in depth rather than protection. See
[Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).

### Verification

Prove the file contains nothing you care about, and prove the sanitiser bites:

```bash
# 1. Navigate through the app, background it, then read what was written.
adb shell "run-as com.awesomeproject find . -name '*NAVIGATION*'"

# 2. Corrupt it and confirm the app still starts, on the home screen.
adb shell "run-as com.awesomeproject sh -c 'echo not-json > files/navigation-state.json'"
```

Then add unit tests for `sanitizeState` over a table of trees: a valid one, one with an unknown
route name, one that is not an object, one that is `null`, and one captured while signed in and
replayed while signed out. Those tests run without a device and keep working when someone adds a
screen.

## Performance considerations

`onStateChange` fires on every navigation, and `JSON.stringify` of a deeply nested tree is not free
on the JavaScript thread — it runs at exactly the moment a transition has started.

For a shallow tree this is not measurable. For a deep one, or one with large params, write on a
delay so a burst of navigations produces one write:

```ts title=src/navigation/debouncedSave.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'NAVIGATION_STATE_V1';
const DELAY_MS = 500;

let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleSave(state: unknown): void {
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  // Coalesce a burst of navigations into a single write.
  timer = setTimeout(() => {
    void AsyncStorage.setItem(KEY, JSON.stringify(state));
  }, DELAY_MS);
}
```

The trade is that a process killed inside the delay window loses the last navigation. Half a second
is usually the right balance; pair it with a flush when the app backgrounds, using `AppState`.

Keeping params small helps twice over: the state is faster to serialise and the file is smaller to
read back.

## Common mistakes

- **Mounting the container before restoration finishes.** Wrong: rendering `NavigationContainer`
  while the `AsyncStorage.getItem` promise is still pending. `initialState` is read once, on the
  first render, so the saved state is simply ignored. Right: gate the render on an `isReady` flag.
- **No `try`/`catch` around `JSON.parse`.** One corrupt write — an app killed mid-`setItem` — and the
  app throws during startup, every time, with no way for the user to recover but reinstalling.
- **Persisting in production without validating.** A user whose session expired is restored into a
  screen that immediately 401s, or worse, briefly shows cached private content.
- **Forgetting that `initialState` suppresses the launch deep link.** A notification tap opens the
  app on the saved screen instead of the linked one. Check `Linking.getInitialURL()` first.
- **Never versioning the key.** The navigator is refactored, route names change, and the next
  release restores users into a tree that references screens that no longer exist.
- **Putting sensitive values in params and then persisting them.** The file is plaintext and, by
  default on Android, backed up off-device.
- **Assuming persistence replaces the Android Fragment factory setup.** They solve different halves
  of the same problem. `react-native-screens` still needs `RNScreensFragmentFactory` in
  `MainActivity.kt`.

## Related topics

- [React Navigation Fundamentals](fundamentals.md) — the state tree being serialised, and the Android Fragment factory.
- [Params and Typed Routes](params-and-typed-routes.md) — why params must survive `JSON.stringify`.
- [Deep Linking and Universal Links](deep-linking.md) — the other source of state from outside the app.
- [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) — choosing the store.
- [App Lifecycle and AppState](../state-and-data/app-lifecycle.md) — flushing on background, and Android process death.
- [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md) — why an embedded encryption key is not protection.
- [Navigation Performance](navigation-performance.md) — the cost of work on every state change.
