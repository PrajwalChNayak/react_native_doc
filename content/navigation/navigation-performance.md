---
title: Navigation Performance
description: Why native screen containers matter, what freezeOnBlur and lazy actually do, keeping work out of screen bodies, and the cost of re-rendering a navigator.
status: current
toolchain: cli
---

Navigation is where an app feels fast or slow, because it is the only interaction that puts a
transition animation and a screen's first render on the same thread at the same moment. Everything
on this page is about reducing what happens during that window.

Four things account for nearly all of it: whether screens are native containers, whether invisible
screens are still rendering, when a screen is first built, and how often the navigator itself
re-renders.

## Why it exists / when to use it — and when NOT to

Measure before you change anything. A transition that stutters has a cause — a large image decoding,
a list rendering 200 rows, a context provider recomputing — and the options on this page are
ineffective against the wrong cause. `freezeOnBlur` does nothing for a screen that is slow the first
time it opens.

Start with the profiler, identify which of the four categories below your problem is in, then apply
the matching fix. [Measuring Before Optimising](../performance/measuring-first.md) is the method.

## Native screen containers

`react-native-screens` is a peer dependency of every navigator, and it is not optional plumbing. It
is what makes each screen a real native container — a `UIViewController` on iOS, a Fragment on
Android — instead of a `View` that JavaScript positions.

That buys three things:

- **The transition runs natively.** A busy JavaScript thread does not stutter the animation, which
  matters because the thread is busiest precisely when a new screen is mounting.
- **Inactive screens are detached from the native view hierarchy.** A screen five pushes down is not
  laid out, not composited, and its views are not measured. Without screens, every screen in the
  stack is a mounted `View` the platform still walks on every layout pass.
- **The platform's own behaviours come for free.** The iOS swipe-back gesture, the Android back
  dispatch, and the system's handling of memory pressure on offscreen controllers.

It is enabled by default. Reading the installed source, `ENABLE_SCREENS` is initialised to
`isNativePlatformSupported`, so on iOS and Android screens are on without you calling anything.
`enableScreens(false)` exists to turn them **off**, which is a debugging step, not a configuration
you should ship.

`detachInactiveScreens` on the tab and drawer navigators controls the detaching described above. It
defaults to `true`. Turning it off is a workaround for a specific measurement bug in a third-party
view, not a tuning option — an inactive screen that stays attached costs layout on every pass.

## Freezing screens that are not visible

Detaching a screen from the native hierarchy does not stop React from rendering it. A pushed-over
screen whose props change still re-renders, still runs its hooks, still diffs a tree nobody can see.

`freezeOnBlur` stops that. It is a per-screen option on all three navigators, and it wraps the screen
so React suspends rendering it while it is blurred, without unmounting it — so state survives and
going back is still instant.

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator<{Feed: undefined; Chart: undefined}>();

const Placeholder = () => <Text>Screen</Text>;

// Hoisted: a new object here on every render would re-evaluate every screen's options.
const screenOptions = {freezeOnBlur: true} as const;

export function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Feed" component={Placeholder} />
        <Stack.Screen name="Chart" component={Placeholder} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

There is also a global switch. `enableFreeze()` from `react-native-screens` changes the **default**
for `freezeOnBlur` across the app — in the installed source, `freezeOnBlur` falls back to
`freezeEnabled()`, which is `false` until you call it:

```ts title=index.js
import {enableFreeze} from 'react-native-screens';

// Every screen now freezes on blur unless it opts out with freezeOnBlur: false.
enableFreeze(true);
```

Freezing is not free of consequences. A frozen screen does not re-render, so it will not pick up a
store update while it is blurred — it catches up when it is focused again, which is usually what you
want but is visible if the screen animates something continuously. And it does not stop side
effects: timers, subscriptions and network requests started in `useEffect` keep running. Work that
must genuinely stop belongs in `useFocusEffect`.

| Tool | Stops re-renders | Stops effects | Keeps state |
| --- | --- | --- | --- |
| `freezeOnBlur` | Yes | No | Yes |
| `useFocusEffect` | No | Yes, on blur | Yes |
| `popToTopOnBlur` | By unmounting | Yes | No |
| Unmounting the screen | Yes | Yes | No |

## Lazy screens

`lazy` defaults to `true` on both the tab and drawer navigators: a screen's component is not created
until its tab or drawer item is first visited. With five tabs, startup mounts one screen instead of
five.

Leave it on. The only reason to set `lazy: false` is a tab that must be warm the instant the user
first taps it and is cheap enough that mounting it at startup costs nothing — which is a rare
combination, because a screen that is cheap to mount does not need warming.

The targeted alternative is `preload`, which exists on every navigation object:

```tsx title=src/screens/FeedScreen.tsx
import {useEffect} from 'react';
import {Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Feed: undefined;
  Post: {postId: string};
};

declare function requestIdleCallback(
  callback: (deadline: {didTimeout: boolean; timeRemaining: () => number}) => void,
  options?: {timeout: number},
): number;

export function FeedScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Feed'>) {
  useEffect(() => {
    let cancelled = false;

    // Build the next screen off-screen, once the thread has nothing better to do.
    requestIdleCallback(() => {
      if (!cancelled) {
        navigation.preload('Post', {postId: 'first'});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return <Text>{route.name}</Text>;
}
```

`requestIdleCallback` is the global React Native 0.87 provides for deferring work until the thread
is idle. It is installed by the runtime setup but is not in the shipped type definitions, so a
TypeScript file needs its own declaration as above.

Preloading is worth it for one very likely next destination; preloading a list of candidates costs
more than it saves, because each one mounts, runs its effects and holds its memory.

## Keeping work out of screen bodies

A screen component's body runs synchronously during the transition. Anything expensive there is
visible as a dropped frame in the animation itself.

Things that belong somewhere else:

- **Derived data.** Sorting, filtering or grouping a list in the component body runs on every render.
  `useMemo` it, or do it where the data arrives.
- **Large synchronous reads.** A synchronous storage read of a big blob blocks the first frame. Read
  it in an effect and render a skeleton, or move it off the startup path.
- **Data fetching on mount for a screen that is not visible yet.** A preloaded or blurred screen's
  `useEffect` fires. `useFocusEffect` is the focus-aware version.
- **Work that can wait a frame.** Analytics, warming a cache, prefetching an image — hand those to
  `requestIdleCallback` so the transition finishes first.

```tsx title=src/screens/ReportScreen.tsx
import {useCallback, useMemo, useState} from 'react';
import {Text} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

type Row = {id: string; total: number};

export function ReportScreen({rows}: {rows: Row[]}) {
  const [visits, setVisits] = useState(0);

  // Runs when the inputs change, not on every render during the transition.
  const sorted = useMemo(() => [...rows].sort((a, b) => b.total - a.total), [rows]);

  // Runs on focus and cleans up on blur, unlike useEffect which runs once on mount.
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setVisits((n) => n + 1), 5000);
      return () => clearInterval(id);
    }, []),
  );

  return <Text>{`${sorted.length} rows, ${visits} polls`}</Text>;
}
```

The `useCallback` around the `useFocusEffect` body is required rather than stylistic: the hook
re-subscribes whenever the callback identity changes, so an inline function re-runs the effect on
every render.

## The cost of re-rendering a navigator

This is the one most often missed, because nothing about it looks like a navigation problem.

When a component that renders `<Stack.Navigator>` re-renders, React Navigation walks every child
`Screen` element, re-reads its props and re-evaluates its options. With twenty screens that is
twenty option evaluations — each of which may call an `options` function, build a `headerRight`
element and diff it.

Three consequences:

**Keep state out of the component that renders the navigator.** A `useState` in the same component
as `<Stack.Navigator>` turns every state change into a full navigator re-render. Push the state down
into the screen that needs it, or up above the container.

**Hoist option objects and functions.** An inline `screenOptions={{...}}` object literal is a new
identity on every render. Define it at module scope when it does not depend on props, and `useMemo`
it when it does.

**Watch what sits between the container and the navigator.** Context providers placed there run on
every navigation, because the container re-renders its subtree when state changes. A provider whose
value is an object literal re-renders every consumer in the app on every navigation. Either hoist it
above the container or memoise its value.

Selecting from navigation state has the same shape of problem. `useNavigationState` re-renders the
component whenever its selector's result changes, so select the narrowest thing you need:

```tsx title=src/components/StackDepth.tsx
import {Text} from 'react-native';
import {useNavigationState} from '@react-navigation/native';

export function StackDepth() {
  // Selecting a number re-renders only when the number changes.
  // Selecting `state` would re-render on every navigation.
  const depth = useNavigationState((state) => state.routes.length);

  return <Text>{depth}</Text>;
}
```

## Platform differences

:::tabs
@tab Android
Screens are Fragments, and Android's memory pressure handling can destroy the ones that are not
visible. That makes `freezeOnBlur` and detaching more valuable here than on iOS, and it is why the
Fragment factory setup in [Fundamentals](fundamentals.md) is not optional.

Transitions are driven by the Fragment transaction, so a blocked JavaScript thread does not stall
the animation — but it does stall the incoming screen's first paint, which reads as a blank screen
sliding in.
@tab iOS
The stack is a `UINavigationController`, and the interactive swipe-back gesture runs on the UI
thread throughout. A screen that does heavy work on mount shows as a gesture that completes and then
sits on an empty screen.

Large titles and blur effects are composited natively and cost little; a custom JavaScript header on
every screen costs more, because it renders during the transition.
:::

## Common mistakes

- **Reaching for `freezeOnBlur` when the problem is the first render.** Freezing helps screens that
  stay mounted. A screen that is slow the first time it opens needs less work in its body, or a
  `preload`.
- **Turning `lazy` off to make tab switching feel fast.** It moves the cost to startup, where it is
  more visible, and it pays for tabs the user never opens.
- **Assuming a frozen screen has stopped.** `freezeOnBlur` stops rendering, not effects. A polling
  interval in `useEffect` keeps firing. Move it to `useFocusEffect`.
- **Inline `screenOptions`.** Wrong: `<Stack.Navigator screenOptions={{headerRight: () => <Actions />}}>`
  inside a component that re-renders. Every render re-evaluates every screen's options. Right: hoist
  or memoise.
- **Putting a context provider between the container and the navigator.** It re-renders on every
  navigation, and so does everything below it.
- **`useNavigationState((state) => state)`.** That selector's result changes on every navigation, so
  the component re-renders every time regardless of what it actually uses.
- **Preloading several screens "to be safe".** Each preloaded screen mounts, runs its effects and
  holds memory. Preload at most the one destination you are confident about.
- **Optimising without measuring.** The categories on this page do not overlap; applying the wrong
  one changes nothing and adds a footgun. Profile first.

## Related topics

- [Measuring Before Optimising](../performance/measuring-first.md) — how to find out which category your problem is in.
- [React Navigation Fundamentals](fundamentals.md) — `react-native-screens` setup and the Android Fragment factory.
- [Tabs](tabs.md) — `lazy`, `popToTopOnBlur` and tab bar cost.
- [Native Stack](native-stack.md) — `preload`, stack actions and screen lifetime.
- [Nesting Navigators](nesting.md) — how nesting multiplies mount cost.
- [Render Performance and Memoization](../performance/render-performance.md) — the general version of the re-render problem.
- [List Performance in Depth](../performance/list-performance.md) — the usual reason a screen is slow to open.
- [The Profiler and React Native DevTools](../performance/profiling.md) — the tools to measure with.
