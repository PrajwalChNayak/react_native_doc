---
title: Context
description: How React Context behaves in a React Native app, where to place providers relative to navigators, and the re-render cost that makes people reach for a store instead.
status: current
toolchain: cli
---

React Context is the built-in way to pass a value down a tree without threading it through
every component. The API is identical to React on the web, and React 19 simplifies it: you
render `<MyContext>` directly instead of `<MyContext.Provider>`.

What is different in a React Native app is the tree it sits in. Navigators keep screens
mounted, so a context update repaints screens the user cannot see. And the things people
usually put in context — theme, auth session, feature flags — are exactly the things that
change rarely but are consumed everywhere, which is the worst possible shape for a naive
implementation.

## When to use it — and when not to

Context is a **dependency injection** mechanism. It answers "how does this deeply nested
component get hold of that object". It is not a state manager, and it does nothing to help
with update granularity.

| Use context for | Use a store for |
| --- | --- |
| Values that change rarely: theme, locale, auth session | Values that change often: form drafts, live data, selections |
| Injecting a service instance (an API client, a storage handle) | Anything where components need to subscribe to a *slice* |
| Scoping a value to a subtree (a form, a modal, a wizard) | Global state read from unrelated corners of the app |
| Test seams — swap a real client for a fake in one place | State you also want to read outside React |

The rule of thumb: if you find yourself writing `useContext` and then immediately destructuring
one field out of a large object, you have outgrown context. See
[Zustand and Redux Toolkit](zustand-and-redux.md).

## Basic example

```tsx title=src/theme/ThemeContext.tsx
import {createContext, useContext, useMemo} from 'react';
import type {ReactNode} from 'react';
import {useColorScheme} from 'react-native';

type Theme = {
  background: string;
  text: string;
  isDark: boolean;
};

const LIGHT: Theme = {background: '#ffffff', text: '#111111', isDark: false};
const DARK: Theme = {background: '#111111', text: '#f5f5f5', isDark: true};

// A real default rather than undefined, so a component rendered outside the
// provider (a test, a storybook entry) still works instead of crashing.
const ThemeContext = createContext<Theme>(LIGHT);

export function ThemeProvider({children}: {children: ReactNode}) {
  const scheme = useColorScheme();

  // Without useMemo this object is a new identity on every render of the
  // provider, so every consumer re-renders even when the theme is unchanged.
  const theme = useMemo(() => (scheme === 'dark' ? DARK : LIGHT), [scheme]);

  // React 19: the context itself is the provider component.
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
```

Consuming it is unremarkable, which is the point:

```tsx-fragment title=src/components/Card.tsx
import {Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';

export function Card({title}: {title: string}) {
  const theme = useTheme();
  return (
    <View style={{backgroundColor: theme.background, padding: 16}}>
      <Text style={{color: theme.text}}>{title}</Text>
    </View>
  );
}
```

## How it works

When a provider's `value` changes by `Object.is` comparison, React re-renders **every**
consumer of that context, regardless of which part of the value they read. There is no
selector, no shallow compare and no way to opt out. `React.memo` on an intermediate component
does not stop it — context propagation goes straight past memo boundaries to the consumers.

That is fine for a theme that flips twice a day. It is a problem for a context holding a
counter, a form draft or a websocket message, because every consumer in the app re-renders on
every change.

Two consequences specific to React Native:

1. **Screens you cannot see re-render too.** A stack navigator keeps the screens beneath the
   top one mounted, so a context update re-renders five screens' worth of components to
   produce one visible frame of work. On a mid-range Android device that is a visible stutter.
2. **The re-render happens on the JS thread**, the same thread handling touches. See
   [JS Thread vs UI Thread](../core-concepts/threading-model.md).

### Provider placement

Order matters, and the failures are confusing rather than loud. The usual arrangement:

```tsx-fragment title=src/App.tsx
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {Text} from 'react-native';
import {ThemeProvider} from './theme/ThemeContext';

function RootNavigator() {
  return <Text>Screens go here</Text>;
}

export default function App() {
  return (
    // Outermost: things every screen and every modal needs, including any
    // native modal rendered outside the navigator's own tree.
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

Put a provider **above** `NavigationContainer` when screens need it. Put it **inside** a
specific screen when only that subtree needs it — a wizard's step state has no business being
global, and scoping it means it is torn down automatically when the user leaves.

> [!NOTE] A `Modal` renders in its own native container
> React Native's `Modal` is a separate native view hierarchy, but it stays part of the React
> tree, so context still flows into it. Native modals presented by other libraries may not —
> check before assuming a provider reaches inside one.

## Common patterns

### Split state from actions

The single most effective fix for context re-renders. Actions are stable for the life of the
provider; state is not. Split them and components that only dispatch stop re-rendering.

```tsx title=src/session/SessionContext.tsx
import {createContext, useContext, useMemo, useState} from 'react';
import type {ReactNode} from 'react';

type Session = {userId: string} | null;

type SessionActions = {
  signIn: (userId: string) => void;
  signOut: () => void;
};

const SessionStateContext = createContext<Session>(null);
const SessionActionsContext = createContext<SessionActions>({
  signIn: () => {},
  signOut: () => {},
});

export function SessionProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<Session>(null);

  // Empty dependency array: setState is stable, so these callbacks never
  // change identity and consumers of the actions context never re-render.
  const actions = useMemo<SessionActions>(
    () => ({
      signIn: (userId: string) => setSession({userId}),
      signOut: () => setSession(null),
    }),
    [],
  );

  return (
    <SessionActionsContext value={actions}>
      <SessionStateContext value={session}>{children}</SessionStateContext>
    </SessionActionsContext>
  );
}

export function useSession(): Session {
  return useContext(SessionStateContext);
}

// A sign-out button uses this and never re-renders when the session changes.
export function useSessionActions(): SessionActions {
  return useContext(SessionActionsContext);
}
```

### Fail loudly when the provider is missing

For a context with no sensible default — a service handle, say — the useful pattern is a
hook that throws with a readable message, instead of components silently receiving
`undefined`.

```tsx title=src/api/ApiClientContext.tsx
import {createContext, useContext} from 'react';
import type {ReactNode} from 'react';

type ApiClient = {get: (path: string) => Promise<unknown>};

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: ApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext value={client}>{children}</ApiClientContext>;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) {
    throw new Error('useApiClient must be used inside <ApiClientProvider>');
  }
  return client;
}
```

This is also the seam that makes tests pleasant: render the subtree with a fake client and
nothing else has to change.

### Keep a store in context, not the state

If you want context's scoping and a store's update granularity, put the *store instance* in
context. The context value never changes, so nothing re-renders on its account; components
subscribe to the store and re-render only for the slice they read. That is the pattern
[Zustand and Redux Toolkit](zustand-and-redux.md) describes for per-screen stores.

## Performance considerations

- **Memoise the provider value.** An unmemoised object literal makes every consumer re-render
  on every provider render. This is the number one cause of "context is slow" reports.
- **Split by update frequency, not by domain.** One context per thing that changes at its own
  rate beats one big `AppContext`.
- **Do not put rapidly changing values in context at all.** Scroll offsets, gesture positions
  and animation progress belong in Reanimated shared values or `Animated.Value`s, which never
  trigger a React render. See [Shared and Derived Values](../animation/shared-values.md).
- **Measure before restructuring.** React Native DevTools' profiler shows you which components
  re-rendered and why; guessing about context cost usually leads to the wrong refactor. See
  [The Profiler and React Native DevTools](../performance/profiling.md).

## Common mistakes

- **Passing an unmemoised object as `value`.** Wrong:
  `<ThemeContext value={{background, text}}>`. Right: build the object with `useMemo` keyed on
  its real dependencies. The wrong version re-renders every consumer on every provider render,
  which includes every re-render caused by anything else in the provider.
- **Putting high-frequency state in context.** A text input's value in a context re-renders
  every consumer on every keystroke, across every mounted screen. Keep it local, or use a
  store with selectors.
- **Using `undefined` as the default and not checking for it.** Consumers get `undefined` when
  the provider is missing, and the error surfaces far from the cause. Either give a real
  default or throw in the hook.
- **Assuming `React.memo` blocks context updates.** It does not. Memo compares props; context
  reaches consumers directly.
- **Nesting providers in the wrong order.** A provider that reads navigation state must be
  inside `NavigationContainer`; a provider every screen needs must be outside it. Getting this
  backwards produces "cannot read property of null" during the first render, not a clear error.
- **Reaching for context to avoid prop drilling two levels.** Two props is not a problem worth
  a provider, an extra indirection and an untestable seam.

## Related topics

- [Hooks in a Native Context](hooks-in-react-native.md) — the hook behaviour context is built on.
- [Zustand and Redux Toolkit](zustand-and-redux.md) — what to use when context's granularity runs out.
- [Dark Mode](../styling/dark-mode.md) — the theme context in its most common real use.
- [React Navigation Fundamentals](../navigation/fundamentals.md) — where `NavigationContainer` sits in the provider stack.
- [Render Performance and Memoization](../performance/render-performance.md) — measuring and fixing re-render cost.
- [The Profiler and React Native DevTools](../performance/profiling.md) — proving which renders context caused.
