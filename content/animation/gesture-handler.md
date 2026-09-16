---
title: Gesture Handler
description: react-native-gesture-handler 3.3.0 — the hook-based gesture API, GestureHandlerRootView, composition and relations, and how gesture callbacks become Reanimated worklets.
status: current
toolchain: cli
---

React Native's built-in touch system — the gesture responder system behind `PanResponder` and the
`Touchable` components — runs on the JavaScript thread. Every move event is a JS callback, so a drag
is only as smooth as your slowest render.

`react-native-gesture-handler` replaces that with platform gesture recognisers that run on the UI
thread and report through Reanimated worklets. The finger keeps its grip on the object even when the
JS thread is busy, which is the entire point.

This page documents **version 3.3.0**, which reshaped the API. If a snippet you found uses
`<PanGestureHandler onGestureEvent={...}>` it is two major versions out of date; if it uses
`Gesture.Pan()` it is one, and every symbol on that path is marked `@deprecated` in the installed
type definitions.

## Installing

`react-native-gesture-handler` 3.x requires **React Native 0.82 or newer** — stated in the
package's own README, not in its `peerDependencies`, which are unconstrained. Since 0.82 is the
first version that is New-Architecture-only, that is the same as saying 3.x is a New Architecture
library.

:::tabs
@tab npm
```bash
npm install react-native-gesture-handler@3.3.0
cd ios && bundle install && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-gesture-handler@3.3.0
cd ios && bundle install && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-gesture-handler@3.3.0
cd ios && bundle install && bundle exec pod install
```
:::

There is no Babel plugin for this package and no side-effect import to add at the top of
`index.js`: `react-native-gesture-handler/src/index.ts` calls its own `initialize()` at module
scope, so importing anything from it starts the native event listener.

What you do have to add is the root view.

### `GestureHandlerRootView` is mandatory

Every `GestureDetector` must have a `GestureHandlerRootView` above it. This is not a
recommendation you can skip and get degraded behaviour — in 3.x the detector reads a context and
**throws in development** when it is missing:

> GestureDetector must be used as a descendant of GestureHandlerRootView.

```tsx title=src/App.tsx
import {Text} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

export default function App() {
  // The default style is {flex: 1}. Pass your own only if you mean to override
  // that — a root view without flex collapses to zero height and the app
  // renders blank, which looks nothing like a gesture problem.
  return (
    <GestureHandlerRootView>
      <Text>Screens go here</Text>
    </GestureHandlerRootView>
  );
}
```

Put it at the true root, outside your navigation container. One per app. Nesting a second one is
harmless but pointless, and wrapping only the screen that happens to need a gesture guarantees a
crash the first time someone adds a gesture elsewhere.

## Why it exists / when to use it — and when NOT to

Use gesture handler when the interaction is **continuous**: a drag, a swipe-to-dismiss, a pinch, a
pull-down sheet, a slider. Those need per-frame position updates, and per-frame updates belong on
the UI thread.

Do **not** reach for it when a press is all you need. `Pressable` from core is a TurboModule-backed
component with the correct platform press behaviour, accessibility roles and ripple. A
`useTapGesture` reimplementation of a button is more code and worse accessibility.

| Interaction | Use |
| --- | --- |
| Button, row, list item press | Core `Pressable` |
| Swipe-to-delete, drag, pinch, pan-to-dismiss | Gesture handler |
| A gesture that drives an animation every frame | Gesture handler + Reanimated |
| Scroll position driving an animation | `useAnimatedScrollHandler` — see [Scroll-Driven Animation](scroll-driven-animation.md) |
| A gesture whose result is a navigation or a network call | Gesture handler, with the result marshalled back to JS |

## Basic example

The canonical drag. Two shared values per axis: where the object is, and where it was when the
gesture began.

```tsx title=src/components/DragBox.tsx
import {StyleSheet} from 'react-native';
import {GestureDetector, usePanGesture} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

export function DragBox() {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = usePanGesture({
    // Configuration and callbacks live in one object. Every callback below is
    // turned into a worklet by the Babel plugin and runs on the UI thread.
    minDistance: 4,
    onBegin: () => {
      // Without this the second drag would jump back to the origin, because
      // translationX is measured from the start of the current gesture.
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    },
    onUpdate: (event) => {
      offsetX.value = startX.value + event.translationX;
      offsetY.value = startY.value + event.translationY;
    },
    onFinalize: () => {
      offsetX.value = withSpring(0);
      offsetY.value = withSpring(0);
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{translateX: offsetX.value}, {translateY: offsetY.value}],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.box, style]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({box: {width: 80, height: 80, backgroundColor: '#3355ff'}});
```

No `useState`, no re-render, and the box keeps following the finger if the JS thread stalls.

## How it works

### The hooks are the API in 3.x

Read from the installed `lib/typescript/v3/index.d.ts`, version 3 exports one hook per recogniser,
each taking a single optional config object and returning a gesture:

| Hook | Returns | Continuous? |
| --- | --- | --- |
| `useTapGesture(config?)` | `TapGesture` | No |
| `useLongPressGesture(config?)` | `LongPressGesture` | No |
| `useFlingGesture(config?)` | `FlingGesture` | No |
| `usePanGesture(config?)` | `PanGesture` | Yes |
| `usePinchGesture(config?)` | `PinchGesture` | Yes |
| `useRotationGesture(config?)` | `RotationGesture` | Yes |
| `useHoverGesture(config?)` | `HoverGesture` | Yes |
| `useNativeGesture(config?)` | `NativeGesture` | — wraps a native scrollable |
| `useManualGesture(config?)` | `ManualGesture` | — you drive the state machine |

Because they are hooks, the rules of hooks apply: call them unconditionally, at the top level of a
component. That is the practical difference from the old builder, which you could construct
anywhere and had to remember to wrap in `useMemo`.

### The callback names changed

This is the migration trap, because the old names still *look* plausible.

| Version 2 builder | Version 3 config key | Fires when |
| --- | --- | --- |
| `.onBegin()` | `onBegin` | Recogniser saw a touch and started evaluating |
| `.onStart()` | **`onActivate`** | The gesture was recognised |
| `.onUpdate()` | `onUpdate` | Every frame while active (continuous gestures only) |
| `.onEnd()` | **`onDeactivate`** | The gesture stopped being active |
| `.onFinalize()` | `onFinalize` | Always last, activated or not |
| `.onTouchesDown()` etc. | `onTouchesDown` / `Move` / `Up` / `Cancel` | Raw pointer stream |

`onDeactivate` and `onFinalize` receive a `GestureEndEvent`, which adds a `canceled: boolean` to
the usual payload. `onFinalize` runs even when the gesture never activated, which makes it the
right place to reset UI state you set in `onBegin`.

The event payload also differs by callback. `onBegin` and `onFinalize` get the base data (`x`,
`y`, `absoluteX`, `absoluteY`, plus `numberOfPointers` and `pointerType`); `onActivate`,
`onUpdate` and `onDeactivate` get the *extended* data, which for a pan adds `translationX`,
`translationY`, `velocityX`, `velocityY`, `changeX` and `changeY`. If TypeScript says
`translationX` does not exist, you are in a base-data callback.

### The callbacks are worklets, automatically

You do not write `'worklet'` in them. The `react-native-worklets` Babel plugin carries a list of
gesture hooks — verified in the installed `plugin/index.js`, which contains `useTapGesture`,
`usePanGesture`, `usePinchGesture`, `useRotationGesture`, `useFlingGesture`,
`useLongPressGesture`, `useNativeGesture`, `useManualGesture` and `useHoverGesture` — and
workletises argument `0` of each, including every callback nested inside the config object.

Two consequences follow, and they are the same two from
[The UI Thread and Worklets](worklets.md):

1. **A plain helper called from a callback throws.** Mark it `'worklet'`, inline it, or marshal it
   back with `scheduleOnRN`.
2. **React state setters must be marshalled.** They cannot be serialised into a worklet closure.

```tsx title=src/components/DoubleTapLike.tsx
import {useState} from 'react';
import {Text} from 'react-native';
import {GestureDetector, useTapGesture} from 'react-native-gesture-handler';
import {scheduleOnRN} from 'react-native-worklets';

export function DoubleTapLike() {
  const [liked, setLiked] = useState(false);

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    // maxDelay is the gap allowed between the two taps; the default is 500ms.
    maxDelay: 250,
    onActivate: () => {
      // setLiked lives on the JS runtime. Calling it directly from this
      // worklet throws; scheduleOnRN hops the boundary for you.
      scheduleOnRN(setLiked, true);
    },
  });

  return (
    <GestureDetector gesture={doubleTap}>
      <Text>{liked ? 'Liked' : 'Tap twice'}</Text>
    </GestureDetector>
  );
}
```

If the gesture's only job is to call JS, set `runOnJS: true` in the config and skip the hop. That
is correct for a gesture that triggers navigation and animates nothing, and wrong for anything
that also moves pixels.

### Composition

Three composition hooks, one per policy. Each takes gestures as varargs and returns a
`ComposedGesture` you pass to a single `GestureDetector`.

| Hook | Policy | Use it for |
| --- | --- | --- |
| `useSimultaneousGestures(...)` | All of them run together | Pan + pinch + rotate on a photo |
| `useExclusiveGestures(...)` | First one to activate wins; earlier arguments have priority | Double tap before single tap |
| `useCompetingGestures(...)` | The first to activate cancels the rest | Two alternatives that cannot both be true |

Order matters for `useExclusiveGestures`. Put the more specific gesture first, or it never gets a
chance: `useExclusiveGestures(doubleTap, singleTap)` recognises both, while the reverse recognises
only single taps.

```tsx title=src/components/PhotoViewer.tsx
import {StyleSheet} from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import Animated, {clamp, useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

export function PhotoViewer() {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const savedX = useSharedValue(0);

  const pinch = usePinchGesture({
    onBegin: () => {
      savedScale.value = scale.value;
    },
    onUpdate: (event) => {
      // event.scale is relative to the start of this gesture, not absolute.
      scale.value = clamp(savedScale.value * event.scale, 1, 4);
    },
    onFinalize: () => {
      scale.value = withSpring(clamp(scale.value, 1, 4));
    },
  });

  const pan = usePanGesture({
    // Two fingers, so a one-finger swipe still belongs to whatever is behind.
    minPointers: 2,
    onBegin: () => {
      savedX.value = x.value;
    },
    onUpdate: (event) => {
      x.value = savedX.value + event.translationX;
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan);

  const style = useAnimatedStyle(() => ({
    transform: [{translateX: x.value}, {scale: scale.value}],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.photo, style]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  photo: {width: 300, height: 300, backgroundColor: '#222'},
});
```

### Relations: gestures in *different* detectors

Composition only covers gestures that share a detector. When the two gestures live in different
components — a swipeable row inside a scrolling list, a drag handle inside a sheet — you declare a
relation in the config instead. Read from `v3/types/GestureTypes.d.ts`, the keys are:

| Key | Meaning |
| --- | --- |
| `simultaneousWith` | Both may be active at once |
| `requireToFail` | This gesture waits until the named one fails |
| `block` | This gesture prevents the named one from activating |

Each accepts one gesture or an array.

```tsx title=src/components/SwipeableRow.tsx
import {ScrollView, Text} from 'react-native';
import {
  GestureDetector,
  useNativeGesture,
  usePanGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';

export function SwipeableRow() {
  // useNativeGesture lets the platform scroll view join RNGH's arbitration
  // instead of fighting it. Its direct child must be the scrollable.
  const native = useNativeGesture();

  const pan = usePanGesture({
    // Activate only on a clearly horizontal drag, and give up the moment the
    // finger moves vertically — otherwise the row steals every scroll.
    activeOffsetX: [-12, 12],
    failOffsetY: [-8, 8],
    simultaneousWith: native,
  });

  const gesture = useSimultaneousGestures(native, pan);

  return (
    <GestureDetector gesture={gesture}>
      <ScrollView>
        <Text>rows</Text>
      </ScrollView>
    </GestureDetector>
  );
}
```

`activeOffsetX` / `failOffsetY` are the pair that makes nested scrolling feel right, and they are
worth more than any amount of relation tuning. A number or a `[min, max]` tuple, in points.

### The deprecated `Gesture` builder

`Gesture.Pan()`, `Gesture.Tap()`, `Gesture.LongPress()`, `Gesture.Simultaneous()`,
`Gesture.Exclusive()` and `Gesture.Race()` still exist in 3.3.0 and still work. They are also every
one of them annotated `@deprecated` in `handlers/gestures/gestureObjects.d.ts`, with the object
itself carrying:

> `Gesture` builder API is deprecated and will be removed in a future version of Gesture Handler.
> Please migrate to the new, hook-based API.

> [!DEPRECATED] Do not start new code on the builder
> Every tutorial published between 2022 and 2025 uses it, so you will read a lot of it. The
> mapping is mechanical: `Gesture.Pan()` becomes `usePanGesture({...})`, chained
> `.minDistance(4).onUpdate(fn)` calls become config keys, `.onStart` becomes `onActivate`,
> `.onEnd` becomes `onDeactivate`, and `Gesture.Race(...)` becomes `useCompetingGestures(...)`.
> The `useMemo` the builder docs told you to add is no longer needed — the hook owns the identity.

The older `<PanGestureHandler>` / `<TapGestureHandler>` component API is a layer older still. It is
also still exported, and the buttons and wrapped components from that era have been renamed with a
`Legacy` prefix (`LegacyRectButton`, `LegacyScrollView`, `LegacyPressable`) — which is a reliable
way to date a snippet.

## Platform differences

:::tabs
@tab iOS
`GestureHandlerRootView` renders a **plain `View`** on iOS; the gesture system attaches to the
window through `UIGestureRecognizer`, so no special host view is needed. Native setup is
CocoaPods — run `bundle exec pod install` after installing.

`cancelsTouchesInView` (default `true`) controls whether an activating RNGH gesture cancels touches
already delivered to UIKit views underneath. Set it to `false` when a native component below must
keep receiving them.

`enableTrackpadTwoFingerGesture` on a pan makes two-finger trackpad swipes activate on iPad with a
Magic Keyboard; without it the user has to click and drag.
@tab Android
`GestureHandlerRootView` renders a **real native view** (`RNGestureHandlerRootView`) on Android,
because the gesture system has to intercept touch dispatch inside a `ViewGroup`. Forgetting it here
is the difference between working and silently dead gestures — hence the development-mode throw.

Android needs a Gradle rebuild after install; restarting Metro is not enough.

`delaysChildPressedState` on `useNativeGesture` maps to `ViewGroup.shouldDelayChildPressedState`,
and the installed types note it **requires React Native 0.87 or newer** and is a no-op below that.
:::

## Common patterns

### Swipe to dismiss, with velocity

Decide on release using both distance and velocity. A fast short flick should dismiss; a slow long
drag that stops short should not.

```tsx title=src/components/SwipeToDismiss.tsx
import {StyleSheet, useWindowDimensions} from 'react-native';
import {GestureDetector, usePanGesture} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function SwipeToDismiss({onDismiss}: {onDismiss: () => void}) {
  const {width} = useWindowDimensions();
  const x = useSharedValue(0);

  const pan = usePanGesture({
    activeOffsetX: [-16, 16],
    onUpdate: (event) => {
      x.value = event.translationX;
    },
    onDeactivate: (event) => {
      const past = Math.abs(event.translationX) > width * 0.35;
      const flicked = Math.abs(event.velocityX) > 800;

      if (past || flicked) {
        const target = Math.sign(event.translationX || event.velocityX) * width;
        // The third argument of withTiming is a worklet callback that runs when
        // the animation settles — `finished` is false if something cancelled it.
        x.value = withTiming(target, {duration: 180}, (finished) => {
          if (finished) {
            scheduleOnRN(onDismiss);
          }
        });
        return;
      }
      x.value = withSpring(0);
    },
  });

  const style = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, style]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({card: {height: 96, backgroundColor: '#eee'}});
```

### Continue the motion after the finger lifts

`withDecay` takes the release velocity straight from the event and applies the platform's
deceleration curve, with an optional `clamp`. This is what makes a custom scrollable feel native
rather than snapped.

```tsx title=src/components/Flingable.tsx
import {StyleSheet} from 'react-native';
import {GestureDetector, usePanGesture} from 'react-native-gesture-handler';
import Animated, {clamp, useAnimatedStyle, useSharedValue, withDecay} from 'react-native-reanimated';

export function Flingable() {
  const offset = useSharedValue(0);
  const start = useSharedValue(0);

  const pan = usePanGesture({
    onBegin: () => {
      start.value = offset.value;
    },
    onUpdate: (event) => {
      offset.value = clamp(start.value + event.translationX, -200, 200);
    },
    onDeactivate: (event) => {
      // velocityX is points per second, which is exactly what withDecay wants.
      offset.value = withDecay({velocity: event.velocityX, clamp: [-200, 200]});
    },
  });

  const style = useAnimatedStyle(() => ({transform: [{translateX: offset.value}]}));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.box, style]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({box: {width: 80, height: 80, backgroundColor: '#3355ff'}});
```

### Enable and disable without remounting

Every gesture config accepts `enabled`, and it accepts a shared value. Driving it from a shared
value changes behaviour without a re-render and without rebuilding the recogniser.

```tsx-fragment title=A gesture switched off from the UI thread
const canDrag = useSharedValue(true);
const pan = usePanGesture({enabled: canDrag, onUpdate: (e) => { x.value = e.translationX; }});
```

## Performance considerations

- **The callbacks run on the thread that draws.** Everything in
  [Animation Performance Rules](animation-performance.md) applies to `onUpdate` with extra force:
  it fires on every frame of every gesture.
- **`scheduleOnRN` inside `onUpdate` is a per-frame JS task with serialised arguments.** Reduce
  first — round the value, threshold it, or react to it with `useAnimatedReaction` instead.
- **`runOnJS: true` moves the whole gesture to the JS thread.** Correct for a gesture that only
  navigates; ruinous for one that animates.
- **Prefer `activeOffset*` / `failOffset*` over arbitration.** Failing a gesture early is cheaper
  than resolving a conflict between two active ones, and it feels better.
- **One detector per interactive element, not per screen.** A detector wrapping a whole list means
  the recogniser evaluates touches for every row.
- **Do not recreate the config object's callbacks from changing closures needlessly.** The hook
  handles identity, but a callback that captures a value which changes every render re-serialises
  its closure each time. Capture shared values instead.

## Common mistakes

- **Omitting `GestureHandlerRootView`.** Wrong: a `GestureDetector` anywhere under a plain
  `View` root. Right: one `GestureHandlerRootView` at the app root, outside the navigation
  container. In 3.x this throws in development rather than failing quietly.
- **Overriding the root view's style without `flex: 1`.** Wrong:
  `<GestureHandlerRootView style={{backgroundColor: 'white'}}>`. Right: include `flex: 1`, or omit
  `style` entirely. The default is only applied when you pass nothing.
- **Using `onStart` and `onEnd`.** Those are the version 2 builder's names. In the version 3 config
  they are `onActivate` and `onDeactivate`, and the unknown keys are silently ignored — so the
  gesture works and your callback never runs.
- **Forgetting the start offset.** Wrong: `onUpdate: (e) => { x.value = e.translationX; }` with no
  `onBegin`. Right: save `x.value` in `onBegin` and add `translationX` to it. Without it the
  second drag snaps back to zero before moving.
- **Reading `translationX` in `onBegin` or `onFinalize`.** Those callbacks get the base payload,
  not the extended one. TypeScript catches it; the version-2 muscle memory does not.
- **Calling a plain function from a callback.** The callbacks are worklets. A helper without
  `'worklet'` throws at the first touch, and a React setter must go through `scheduleOnRN`.
- **Wrapping a `ScrollView` in a pan without `useNativeGesture`.** Wrong: a bare pan around a
  scrollable, which then cannot scroll. Right: compose a `useNativeGesture` with the pan and bound
  the pan with `activeOffsetX` / `failOffsetY`.
- **Reimplementing a button with `useTapGesture`.** Wrong: a tap gesture on a `View` with a label.
  Right: `Pressable`, which brings the platform press behaviour, the accessibility role and the
  Android ripple with it.
- **Starting new code on `Gesture.Pan()`.** It compiles, and every symbol on it is `@deprecated` in
  3.3.0. Use the hooks.
- **Calling a gesture hook conditionally.** They are React hooks. `if (editable) { … usePanGesture
  … }` breaks the hook order the same way any other hook would.

## Related topics

- [The UI Thread and Worklets](worklets.md) — why the callbacks cannot call ordinary functions.
- [Shared and Derived Values](shared-values.md) — the values a gesture writes to.
- [Animation Performance Rules](animation-performance.md) — keeping `onUpdate` cheap.
- [Scroll-Driven Animation](scroll-driven-animation.md) — the other main source of per-frame input.
- [Layout Animations](layout-animations.md) — motion you do not drive with a finger.
- [Respecting Reduce Motion](reduce-motion.md) — what a gesture-driven animation owes an
  accessibility setting.
- [Pressable and Touchables](../components/pressable-and-touchables.md) — the right tool for a press.
- [ScrollView](../components/scrollview.md) — the component `useNativeGesture` is usually wrapping.
- [Navigation Performance](../navigation/navigation-performance.md) — the back gesture this library sits underneath.
