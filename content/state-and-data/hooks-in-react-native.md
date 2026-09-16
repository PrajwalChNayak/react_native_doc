---
title: Hooks in a Native Context
description: What changes about React hooks when there is no DOM — effect cleanup, screens that stay mounted, AppState, useLayoutEffect under Fabric, and the hooks React Native adds.
status: current
toolchain: cli
---

The hooks API is the same one you already know. `useState`, `useEffect`, `useMemo`,
`useCallback`, `useRef` and `useReducer` behave identically, because they are implemented in
`react`, not in the renderer. React Native 0.87 pins `react` to `^19.2.3`, so every React 19
hook is available to you.

What changes is everything the hooks *talk to*. There is no `window`, no `document`, no
`localStorage`, no `visibilitychange` event. A screen can stay mounted for the entire life of
the app while the user is looking at something else. And the process itself can be suspended
mid-effect when the user switches apps. Those three facts account for nearly every
native-specific hooks bug.

## What actually changes without a DOM

| Web assumption | React Native reality |
| --- | --- |
| `useEffect` cleanup runs when the user navigates away | It runs on unmount, and a stacked screen does **not** unmount when you push on top of it |
| `document.visibilityState` / `visibilitychange` tells you the app is hidden | `AppState` does, and it has states the web has no analogue for |
| `useLayoutEffect` runs before the browser paints | It runs before `useEffect`, but layout is computed in C++ and mounted on the UI thread — there is nothing to read yet |
| `window.innerWidth` read once is good enough | The window resizes on rotation, split screen and foldables — read it from a hook |
| `matchMedia('(prefers-color-scheme: dark)')` | `useColorScheme()` |
| `localStorage` is synchronous | Storage is a native module; see [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) |

## Basic example

The shape of a data-loading effect is the same as on the web, and so is the reason you need
the cleanup: the component can go away before the request finishes, and writing state after
that is a leak.

```tsx title=src/screens/ProfileScreen.tsx
import {useEffect, useState} from 'react';
import {ActivityIndicator, Text, View} from 'react-native';

type Profile = {id: string; name: string};

export function ProfileScreen({userId}: {userId: string}) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    // Abort rather than guard with a boolean: it also cancels the in-flight
    // socket, which matters on a metered mobile connection.
    const controller = new AbortController();

    fetch(`https://api.example.com/users/${userId}`, {signal: controller.signal})
      .then((response) => response.json() as Promise<Profile>)
      .then(setProfile)
      .catch((error: unknown) => {
        // Since 0.82 an unhandled rejection raises console.error, so swallow
        // only the abort and let everything else surface.
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          throw error;
        }
      });

    return () => controller.abort();
  }, [userId]);

  if (profile === null) {
    return <ActivityIndicator />;
  }
  return (
    <View>
      <Text>{profile.name}</Text>
    </View>
  );
}
```

In production you would not hand-roll this. See
[Data Fetching and Caching](data-fetching.md) for why `useEffect` fetching goes wrong once
there is more than one screen.

## How it works

### Mounted is not the same as visible

This is the single biggest difference from the web. In a native stack navigator, pushing
screen B on top of screen A leaves A **mounted**. Its effects never clean up, its intervals
keep firing, its subscriptions keep receiving events, and its state survives untouched. That
is deliberate — it is what makes the back gesture instant and preserves scroll position — but
it means "clean up on unmount" is the wrong lifecycle for anything periodic.

React Navigation exposes the right lifecycle as `useFocusEffect`, which runs on focus and
cleans up on blur.

```tsx title=src/screens/LivePriceScreen.tsx
import {useCallback, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Text} from 'react-native';

export function LivePriceScreen() {
  const [price, setPrice] = useState(0);

  // useCallback is required, not stylistic: useFocusEffect re-subscribes
  // whenever the callback identity changes, so an inline arrow would
  // resubscribe on every render.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        setPrice((current) => current + 1);
      }, 1000);
      return () => clearInterval(id);
    }, []),
  );

  return <Text>{price}</Text>;
}
```

Use `useEffect` for things tied to the component existing (creating a store, registering a
one-time listener). Use `useFocusEffect` for things tied to the user looking at the screen
(polling, camera, location, analytics screen views).

### The AppState interaction

Focus is not enough either. A focused screen with a one-second timer is still running when
the user switches to another app — on Android for as long as the process survives, on iOS
until the system suspends it, which is usually within seconds but is not a guarantee you can
build on. Timers that fire while backgrounded burn battery and produce a burst of stale
updates on resume.

The general pattern is to gate the subscription on both focus and foreground state.

```tsx title=src/hooks/useIsForeground.ts
import {useEffect, useState} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';

export function useIsForeground(): boolean {
  const [isForeground, setIsForeground] = useState(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => setIsForeground(next === 'active'),
    );
    return () => subscription.remove();
  }, []);

  return isForeground;
}
```

`AppState.currentState` is typed as `string | null | undefined` rather than `AppStateStatus`,
because it is `null` until the native module reports the first value. Compare it against a
literal as above rather than casting it.

The full state machine, including what the transitional states mean on each platform, is in
[App Lifecycle and AppState](app-lifecycle.md).

### useLayoutEffect under Fabric

On the web, `useLayoutEffect` exists to give you a synchronous window between the DOM
mutation and the paint, so you can measure and correct without flicker. React Native has no
equivalent window. Under Fabric, React commits a shadow tree, Yoga computes layout in C++,
and the mount phase applies the result on the UI thread. None of that has happened by the
time `useLayoutEffect` runs.

What `useLayoutEffect` still guarantees is ordering: it runs synchronously after the commit
and before `useEffect`, and before the component's children's `useEffect`. That is useful for
setting up something a child effect depends on. It is not useful for reading sizes.

To read a real measured size, use `onLayout`, which fires after the mount phase with the
values Yoga produced.

```tsx title=src/components/MeasuredCard.tsx
import {useState} from 'react';
import {Text, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';

export function MeasuredCard() {
  const [height, setHeight] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    // Fires after the mount phase, so these numbers are real.
    setHeight(event.nativeEvent.layout.height);
  };

  return (
    <View onLayout={onLayout} style={{padding: 16}}>
      <Text>Measured height: {height}</Text>
    </View>
  );
}
```

> [!WARNING] `useLayoutEffect` cannot prevent a flash of wrong layout
> If you are using `useLayoutEffect` to avoid a one-frame flicker, that pattern does not
> transfer. Render the correct thing the first time, or keep the element hidden until
> `onLayout` has reported.

### React 19 is in play

`react@19.2.3` is the pinned peer, so the React 19 hooks are all importable from `react`:

- **`ref` is a plain prop.** Function components receive `ref` in props; `forwardRef` is no
  longer needed for new code. Existing `forwardRef` components keep working.
- **`use`** reads a promise or a context conditionally, including inside a branch.
- **`useOptimistic`** is genuinely useful on mobile, where a request can take seconds on a
  bad connection. See [Offline-First](offline-first.md).
- **`useActionState`** is available from `react` and works with any async action function.
- **`useFormStatus` ships in `react-dom`** and has no React Native equivalent — there are no
  form actions here.

## The hooks React Native adds

These come from `react-native` itself. They are the complete set that is relevant to state
and data work; the full export list is in [API Reference](../reference/api-reference.md).

```tsx title=src/components/Banner.tsx
import {
  Animated,
  Text,
  useAnimatedValue,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import type {ColorSchemeName} from 'react-native';
import {useEffect} from 'react';

export function Banner() {
  // 'light' | 'dark' | null. null means the system has not reported a
  // preference yet, or the user is on a platform version that has none.
  const scheme: ColorSchemeName | null = useColorScheme();

  // Re-renders on rotation, split screen, and foldable unfold. Reading
  // Dimensions.get('window') once at module scope does not.
  const {width} = useWindowDimensions();

  // Equivalent to useRef(new Animated.Value(0)).current, without allocating
  // a throwaway Value on every render.
  const opacity = useAnimatedValue(0);

  useEffect(() => {
    Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}).start();
  }, [opacity]);

  return (
    <Animated.View style={{opacity, width}}>
      <Text>{scheme === 'dark' ? 'Dark' : 'Light'}</Text>
    </Animated.View>
  );
}
```

> [!WARNING] `useColorScheme()` no longer returns a third string
> Through 0.86 it could return a literal meaning "no preference". In 0.87 the return type is
> `ColorSchemeName | null`, where `ColorSchemeName` is `'light' | 'dark'`. Code that compared
> against the old third value now silently takes the wrong branch. Check for `null` instead.

Also exported and occasionally useful: `useAnimatedValueXY`, `useAnimatedColor` and
`usePressability`. Anything else you remember as a React Native hook is either from a library
or does not exist — the authoritative list is the `react-native` export surface.

## Platform differences

:::tabs
@tab iOS
`AppState` reports `inactive` as a real transitional state: during the app switcher, while
the Control Center or Notification Center is pulled down, and during an incoming call. A
screen can therefore be focused and not `active` for several seconds while remaining fully
visible.

The process is suspended shortly after entering `background`. Timers stop, effects do not
run, and promises do not settle until the app is resumed.
@tab Android
`inactive` is effectively not used; you see `active` and `background`. Android additionally
emits `focus` and `blur` events on `AppState`, which track window focus rather than process
state — those fire when a system dialog or the notification shade takes focus.

A backgrounded process keeps running until Android decides to kill it, which can be seconds
or minutes. Timers you forgot to clear keep firing for longer here than on iOS, which is why
Android is where battery-drain reports come from.
:::

## Common patterns

**Wrap the lifecycle in a hook, not in each screen.** `useIsForeground` above, or a
`useAppStateEffect(effect)` helper, keeps the subscription bookkeeping in one place and makes
it testable.

**Combine focus and foreground for anything expensive.** Camera preview, location watches and
websockets should be running only when `isFocused && isForeground`.

**Reach for `useSyncExternalStore` when a native source pushes updates.** It is the correct
primitive for subscribing to something outside React — a native module emitter, a storage
listener, a socket — and it gets tearing right under concurrent rendering, which a
`useState` + `useEffect` pair does not.

```ts title=src/hooks/useDimensionsSnapshot.ts
import {useSyncExternalStore} from 'react';
import {Dimensions} from 'react-native';
import type {DimensionsPayload} from 'react-native';

let snapshot = Dimensions.get('window').width;

function subscribe(onChange: () => void): () => void {
  // `addEventListener` types its handler as a bare `Function` in 0.87, so the
  // payload needs an explicit annotation or it is an implicit `any`. Note that
  // `window` on the payload is optional — a change event can carry only
  // `screen`, and reading through it blindly is a crash waiting to happen.
  const subscription = Dimensions.addEventListener('change', (payload: DimensionsPayload) => {
    if (!payload.window) return;
    snapshot = payload.window.width;
    onChange();
  });
  return () => subscription.remove();
}

// The snapshot must be cached, not recomputed: returning a fresh object each
// call makes React re-render forever.
export function useWindowWidth(): number {
  return useSyncExternalStore(subscribe, () => snapshot);
}
```

**Keep effect dependencies honest.** An effect that subscribes to a native module and lists
a non-memoised object in its dependency array tears the subscription down and rebuilds it on
every render. That is invisible on the web and audible on a phone — it shows up as dropped
frames and battery use.

## Performance considerations

Effects run on the JS thread, which is also the thread that drives touch responses and
non-native-driven animations. A synchronous 30 ms of work in an effect is a dropped frame the
user feels. Defer non-urgent work with the `requestIdleCallback` global rather than running
it inline; see [App Lifecycle and AppState](app-lifecycle.md) for the details and its typing
caveat.

`useMemo` and `useCallback` are not free, and on Hermes the allocation cost of a dependency
array is real. Memoise because a child is memoised or an effect depends on the identity — not
reflexively. [Render Performance and Memoization](../performance/render-performance.md) goes
into when it actually pays.

## Common mistakes

- **Assuming a pushed-over screen unmounts.** Wrong: `useEffect(() => { const id =
  setInterval(poll, 1000); return () => clearInterval(id); }, [])`. Right: the same body
  inside `useFocusEffect(useCallback(...))`. The `useEffect` version keeps polling behind
  every screen the user pushes on top of it.
- **Passing an inline arrow to `useFocusEffect`.** Wrong:
  `useFocusEffect(() => {...})`. Right: `useFocusEffect(useCallback(() => {...}, []))`. The
  inline version resubscribes on every render, so the cleanup runs constantly.
- **Using `useLayoutEffect` to measure.** It runs before the native mount phase, so refs have
  no layout yet and `measure` returns nothing useful. Use `onLayout`.
- **Reading `Dimensions.get('window')` at module scope.** The value is captured once at
  import and never updates on rotation or split screen. Use `useWindowDimensions()`.
- **Comparing `useColorScheme()` against a third string.** That return value was removed in
  0.87. The type is `ColorSchemeName | null`; treat `null` as "follow the light theme" or
  read `Appearance` for the override.
- **Treating `AppState.currentState` as `AppStateStatus`.** It is typed `string | null |
  undefined` because it is `null` before the first native report. A non-null assertion here
  crashes on a cold start on slow devices.
- **Forgetting `subscription.remove()`.** `AppState.addEventListener` returns an
  `EventSubscription`; there is no `removeEventListener` counterpart to call instead.

## Related topics

- [Context](context.md) — when a context is the right home for shared state, and its cost.
- [App Lifecycle and AppState](app-lifecycle.md) — the full state machine and what each platform does on background.
- [Data Fetching and Caching](data-fetching.md) — why hand-rolled `useEffect` fetching stops scaling.
- [How RN Differs from the Web](../core-concepts/differences-from-web.md) — the wider list of missing browser APIs.
- [JS Thread vs UI Thread](../core-concepts/threading-model.md) — what "blocking the JS thread" costs you.
- [Render Performance and Memoization](../performance/render-performance.md) — when `useMemo` and `useCallback` earn their keep.
- [Navigation Performance](../navigation/navigation-performance.md) — screen mounting, freezing and why screens stay alive.
