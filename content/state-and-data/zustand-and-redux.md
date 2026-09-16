---
title: Zustand and Redux Toolkit
description: When a store beats context, how Zustand 5 and Redux Toolkit 2 differ in practice, and the native-specific concerns — selectors, persistence and reading state outside React.
status: current
toolchain: cli
---

You reach for a store when [Context](context.md) runs out of granularity: a value changes often,
is read from unrelated corners of the app, and every consumer re-rendering on every change is no
longer acceptable. A store solves exactly that problem by letting components subscribe to a
*slice* rather than to the whole value.

Two options are worth knowing in 2026. **Zustand** is a small subscription store with no
boilerplate. **Redux Toolkit** is the modern Redux, with a structured architecture and the best
devtools in the ecosystem. This page compares them on the axes that matter in a React Native app,
which are not quite the axes web articles compare them on.

## Why it exists / when to use it — and when NOT to

Do not start here. Most state in a React Native app belongs somewhere else:

| State | Where it belongs |
| --- | --- |
| Server data — lists, details, anything fetched | A query cache. See [Data Fetching and Caching](data-fetching.md) |
| Which screen you are on, and route params | The navigator |
| Form input, a toggle, a selected tab in one screen | `useState` in that screen |
| Theme, locale, an injected service | [Context](context.md) |
| Animation and gesture values | Reanimated shared values, which never trigger a React render |

What is left is genuinely global client state: an auth session, a cart, a multi-step draft, a
queue of pending offline mutations, feature flags the user can toggle. That is the store's job,
and it is usually a much smaller surface than people expect.

## The comparison

Versions read with `npm view <pkg> version peerDependencies` on 2026-09-12.

| | Zustand | Redux Toolkit |
| --- | --- | --- |
| Version | **5.0.15** | **2.12.0** (plus `react-redux` **9.3.0**) |
| Peers | `react` (optional bindings) | `react-redux ^7.2.1 \|\| ^8.1.3 \|\| ^9.0.0`, and `react-redux` needs `redux ^5.0.0` |
| Packages to install | 1 | 2 (`@reduxjs/toolkit`, `react-redux`) |
| Provider required | No | Yes — `<Provider store={store}>` |
| Boilerplate per feature | A hook | A slice, plus wiring into the root reducer |
| Subscription granularity | Per selector, opt-in | Per selector, opt-in |
| Shallow comparison | `useShallow` from `zustand/react/shallow` | `shallowEqual` from `react-redux` |
| Reading state outside React | `useStore.getState()` — trivial | `store.getState()` — needs a store reference |
| Writing state outside React | `useStore.setState()` | `store.dispatch()` |
| Immutable updates | You write them (or add Immer) | Immer is built in |
| Devtools | Via a middleware, Redux DevTools protocol | First class |
| Async | Whatever you want, in the action | Thunks, with `createAsyncThunk` |
| Server cache included | No | Yes — RTK Query |
| Bundle cost | Small | Larger; matters on mobile |
| Typical failure mode | A store that has grown into a dumping ground with no structure | Ceremony that discourages small changes |

The honest summary: **Zustand for most React Native apps**, because a mobile app's genuinely
global client state is small and the ceremony-to-value ratio of Redux does not pay off at that
size. **Redux Toolkit when you have a large team, a complex domain, or you specifically want RTK
Query and the time-travel devtools.** Neither is a wrong answer; picking one and applying it
consistently matters more than which.

> [!NOTE] Which blocks on this page compile
> `zustand` 5.0.15 is installed in this handbook's type-check harness, so the Zustand samples are
> compiled against it and the real react-native 0.87.1 types. `@reduxjs/toolkit` and `react-redux`
> are not installed, so the Redux samples are marked as fragments and are **not** compiled. They
> are written against the 2.12.0 / 9.3.0 API.

## Basic example

### Zustand

```ts title=src/store/useSessionStore.ts
import {create} from 'zustand';

type Session = {userId: string; displayName: string};

type SessionState = {
  session: Session | null;
  isRestoring: boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
  finishRestoring: () => void;
};

/**
 * `create<T>()(...)` — note the two call signatures. The curried form is what
 * lets TypeScript infer middleware types correctly; `create<T>(...)` in one
 * call works only when there is no middleware.
 */
export const useSessionStore = create<SessionState>()((set) => ({
  session: null,
  isRestoring: true,
  signIn: (session) => set({session}),
  signOut: () => set({session: null}),
  finishRestoring: () => set({isRestoring: false}),
}));
```

Consuming it, with a selector so the component re-renders only when that slice changes:

```tsx-fragment title=src/components/SignOutButton.tsx
import {Button} from 'react-native';
import {useSessionStore} from '../store/useSessionStore';

export function SignOutButton() {
  // Selecting the action alone means this component never re-renders when the
  // session changes — the function identity is stable for the store's life.
  const signOut = useSessionStore((state) => state.signOut);
  return <Button title="Sign out" onPress={signOut} />;
}
```

### Redux Toolkit

```ts-fragment title=src/store/sessionSlice.ts
import {createSlice} from '@reduxjs/toolkit';
import type {PayloadAction} from '@reduxjs/toolkit';

type Session = {userId: string; displayName: string};

type SessionState = {
  session: Session | null;
  isRestoring: boolean;
};

const initialState: SessionState = {session: null, isRestoring: true};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    // Immer is built in, so this mutation is applied to a draft and produces
    // a new immutable state. Writing it this way is correct here and wrong in
    // a plain reducer.
    signedIn(state, action: PayloadAction<Session>) {
      state.session = action.payload;
    },
    signedOut(state) {
      state.session = null;
    },
    finishedRestoring(state) {
      state.isRestoring = false;
    },
  },
});

export const {signedIn, signedOut, finishedRestoring} = sessionSlice.actions;
export default sessionSlice.reducer;
```

```tsx-fragment title=src/store/index.ts
import {configureStore} from '@reduxjs/toolkit';
import {useDispatch, useSelector} from 'react-redux';
import sessionReducer from './sessionSlice';

export const store = configureStore({
  reducer: {session: sessionReducer},
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks, so call sites do not have to annotate. react-redux 9 also
// exposes `withTypes` helpers for the same purpose.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

## How it works

### Subscription, not propagation

Both libraries do the same fundamental thing, and it is the thing context cannot do. The store
holds state outside React. A component subscribes with a **selector**. When state changes, the
store runs each subscriber's selector, compares the result with the previous one, and re-renders
only the components whose slice actually changed.

That comparison is where the whole performance argument lives:

```tsx title=src/components/CartBadge.tsx
import {Text} from 'react-native';
import {create} from 'zustand';

type CartState = {items: Record<string, number>; total: number};

const useCartStore = create<CartState>()(() => ({items: {}, total: 0}));

export function CartBadge() {
  // Selecting a number: re-renders only when the number changes, no matter
  // how often `items` is mutated.
  const total = useCartStore((state) => state.total);
  return <Text>{total}</Text>;
}
```

Without the selector — `const state = useCartStore()` — the component subscribes to the whole
store and re-renders on every change, which is exactly the behaviour you were trying to escape.

### Selectors that return new objects

The default comparison is `Object.is`. A selector that builds an object or array returns a new
identity every time, so the comparison always fails and the component re-renders on every store
change. This is the single most common store bug in both libraries.

```tsx title=src/components/CartSummary.tsx
import {Text, View} from 'react-native';
import {create} from 'zustand';
import {useShallow} from 'zustand/react/shallow';

type CartState = {items: Record<string, number>; total: number; currency: string};

const useCartStore = create<CartState>()(() => ({items: {}, total: 0, currency: 'GBP'}));

export function CartSummary() {
  // useShallow compares the returned object one level deep, so this re-renders
  // only when `total` or `currency` actually changes. Without it, the fresh
  // object literal fails Object.is every single time.
  const {total, currency} = useCartStore(
    useShallow((state) => ({total: state.total, currency: state.currency})),
  );

  return (
    <View>
      <Text>
        {total} {currency}
      </Text>
    </View>
  );
}
```

The Redux Toolkit equivalent is `useSelector(selectFn, shallowEqual)` from `react-redux`, or a
memoised selector built with `createSelector` from Redux Toolkit.

### Reading and writing outside React

This matters more on mobile than on the web, because so much happens outside the component tree:
an `AppState` listener, a push-notification handler, a background callback, a network interceptor
that needs the current token.

```ts title=src/api/authorizedFetch.ts
import {create} from 'zustand';

type SessionState = {token: string | null; setToken: (token: string | null) => void};

export const useSessionStore = create<SessionState>()((set) => ({
  token: null,
  setToken: (token) => set({token}),
}));

/**
 * No hook, no provider, no React. getState() reads the current value
 * synchronously, which is what an interceptor or a notification handler needs.
 */
export async function authorizedFetch(path: string): Promise<Response> {
  const token = useSessionStore.getState().token;
  return fetch(`https://api.example.com${path}`, {
    headers: token === null ? {} : {Authorization: `Bearer ${token}`},
  });
}
```

With Redux Toolkit the same thing requires a reference to the store object, which means either
importing the singleton (and accepting the import cycle risk) or injecting it. It is not harder,
but it is one more decision.

### Persistence

Both stores are in-memory. Surviving a process kill needs a persistence layer, and on mobile that
layer is asynchronous.

```ts title=src/store/usePreferencesStore.ts
import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PreferencesState = {
  theme: 'light' | 'dark' | 'auto';
  hasSeenOnboarding: boolean;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  completeOnboarding: () => void;
};

// Only the data is persisted; the actions are recreated on each launch.
type PersistedPreferences = Pick<PreferencesState, 'theme' | 'hasSeenOnboarding'>;

export const usePreferencesStore = create<PreferencesState>()(
  persist<PreferencesState, [], [], PersistedPreferences>(
    (set) => ({
      theme: 'auto',
      hasSeenOnboarding: false,
      setTheme: (theme) => set({theme}),
      completeOnboarding: () => set({hasSeenOnboarding: true}),
    }),
    {
      name: 'preferences',
      // AsyncStorage is asynchronous, so rehydration finishes after the first
      // render. Gate anything that depends on it rather than assuming.
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
    },
  ),
);
```

> [!WARNING] Persisted state is not available on the first render
> With an asynchronous storage backend, the store starts at its initial values and is rehydrated
> a tick later. An onboarding screen that checks `hasSeenOnboarding` on the first render shows
> onboarding to every returning user for one frame. Track a `hasHydrated` flag and render a
> splash until it flips. A synchronous backend removes the problem entirely — see
> [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md).

**Never persist credentials this way.** A persisted store is a plaintext file. Tokens belong in
[Secure Storage](secure-storage.md).

## Platform differences

Neither library has platform-specific behaviour — they are plain JavaScript. What differs is the
environment around them:

:::tabs
@tab iOS
The process is suspended shortly after backgrounding, so any write you scheduled but did not
flush may not complete. Persist on state change rather than on an app-exit handler, and prefer a
synchronous store for anything you cannot afford to lose.

Redux DevTools connects through React Native DevTools rather than a browser extension.
@tab Android
A backgrounded process survives longer but can be killed at any moment with no callback. The same
conclusion applies: there is no reliable "save on exit" hook.

Android's low-memory kill also means a store rehydrated from disk is a normal path, not an edge
case. Test it by force-stopping the app from the system settings rather than reloading from Metro.
:::

## Common patterns

### One store per concern, not one store for everything

Zustand makes several small stores cheap, and they are easier to reason about than one large one.
A session store, a cart store and a preferences store have different lifetimes, different
persistence needs and different testing requirements.

Redux pushes the other way — one store, many slices — which is a deliberate trade for a single
devtools timeline.

### Keep actions in the store, not in components

A component that reads three values, computes a fourth and writes two has put business logic in
the view layer. Put it in the store as a named action; the component calls one function.

```ts title=src/store/useCartStore.ts
import {create} from 'zustand';

type CartState = {
  items: Record<string, number>;
  addItem: (id: string) => void;
  removeItem: (id: string) => void;
  itemCount: () => number;
};

export const useCartStore = create<CartState>()((set, get) => ({
  items: {},
  addItem: (id) =>
    set((state) => ({items: {...state.items, [id]: (state.items[id] ?? 0) + 1}})),
  removeItem: (id) =>
    set((state) => {
      const next = {...state.items};
      const current = next[id] ?? 0;
      if (current <= 1) {
        delete next[id];
      } else {
        next[id] = current - 1;
      }
      return {items: next};
    }),
  // A derived value computed on demand. Note this is a function on the store,
  // not a subscribed value — components that call it do not re-subscribe.
  itemCount: () => Object.values(get().items).reduce((sum, n) => sum + n, 0),
}));
```

### Do not put server data in the store

This is the mistake that turns a 200-line store into a 2,000-line one. A store has no concept of
staleness, no deduplication of in-flight requests, no background refetch and no cache eviction —
and you will end up writing all four badly. Use a query cache and keep the store for client state.
See [Data Fetching and Caching](data-fetching.md).

### Select actions separately from state

A component that only dispatches should not subscribe to state at all. Selecting the action
function alone gives you a stable reference and zero re-renders, which is the same idea as
splitting a context into state and actions.

## Performance considerations

- **Always pass a selector.** `useStore()` with no argument subscribes to everything. In a
  navigator where five screens stay mounted, one store write then re-renders all five.
- **Wrap object-returning selectors in `useShallow`.** Otherwise the `Object.is` comparison fails
  every time and the selector buys you nothing.
- **Keep selectors cheap.** They run on every store change for every subscriber. A selector that
  sorts an array runs that sort once per subscriber per write.
- **Derive at read time, not at write time.** Storing both `items` and `itemCount` means two
  writes to keep in sync and two chances to diverge. A selector or a getter is cheaper and
  correct by construction.
- **Watch the bundle.** Redux Toolkit plus `react-redux` plus Immer is meaningfully larger than
  Zustand, and on mobile the bundle is parsed on every cold start. See
  [Bundle Size](../performance/bundle-size.md).
- **Neither library helps with animation.** A store write is a React render. Sixty of them a
  second is sixty renders. Use Reanimated shared values for anything per-frame.

## Common mistakes

- **Subscribing to the whole store.** Wrong: `const state = useCartStore();`. Right:
  `const total = useCartStore((s) => s.total);`. The first re-renders on every write to any field.
- **Returning a fresh object from a selector without `useShallow`.** Wrong:
  `useCartStore((s) => ({a: s.a, b: s.b}))`. Right: wrap it in `useShallow`. Without it the new
  object identity fails `Object.is` on every store change.
- **Using `create<T>(...)` with middleware.** Zustand 5 exposes a curried signature —
  `create<T>()(middleware(...))` — and the uncurried one loses middleware type information.
  The extra `()` is not a typo.
- **Assuming persisted state is present on the first render.** With an asynchronous backend it is
  not. Gate on a hydration flag or you will flash the wrong screen.
- **Persisting a token in the store.** A persisted store is an unencrypted file. Use the Keychain
  or Keystore; see [Secure Storage](secure-storage.md).
- **Mutating state outside Immer.** In Zustand, `set((s) => { s.items[id] = 1; return s; })` keeps
  the same object identity, so no subscriber sees a change. Return a new object, or add the Immer
  middleware. In Redux Toolkit the mutation is correct *only* inside `createSlice` reducers.
- **Putting fetched server data in the store.** You will reimplement caching, staleness and
  request deduplication. Use a query cache.
- **Creating the store inside a component.** `create(...)` at module scope gives one store for
  the app's life. Inside a component body it creates a new store on every render and every
  subscriber loses its state.

## Related topics

- [Context](context.md) — what a store is replacing, and when context is still the right answer.
- [Data Fetching and Caching](data-fetching.md) — where server state belongs instead.
- [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) — the persistence backend, and why synchronous matters.
- [Secure Storage](secure-storage.md) — where credentials go instead of a persisted store.
- [Offline-First](offline-first.md) — the queue of pending mutations a store is genuinely good at holding.
- [Hooks in a Native Context](hooks-in-react-native.md) — `useSyncExternalStore`, the primitive both libraries build on.
- [Render Performance and Memoization](../performance/render-performance.md) — measuring the re-renders selectors are meant to prevent.
- [Bundle Size](../performance/bundle-size.md) — the cost difference between the two options.
