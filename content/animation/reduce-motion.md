---
title: Respecting Reduce Motion
description: Reading AccessibilityInfo.isReduceMotionEnabled and its change event, configuring Reanimated's ReduceMotion behaviour, and designing so that removing the motion does not remove the meaning.
status: current
toolchain: cli
---

Both platforms ship a system setting that says "I do not want animation". People turn it on for
concrete medical reasons — vestibular disorders, where large or parallax motion causes genuine
nausea and dizziness, and migraine and seizure triggers — and for ordinary ones like battery and
attention. When it is on, your app is being asked a direct question, and shipping the full motion
anyway is the wrong answer.

This is an accessibility requirement, not a polish item. The WCAG success criterion "Animation from
Interactions" exists precisely for motion triggered by scrolling and other interaction, and the
platform setting is how a mobile user expresses it.

The good news is that React Native and Reanimated make honouring it almost free. The work is
**designing so that removing the motion does not remove any information** — which is the part this
page spends most of its time on.

## Why it exists / when to use it — and when NOT to

Honour the setting for anything that is decoration or emphasis: entrance animations, parallax,
bouncing springs, spinning loaders, sliding panels, zooming transitions, anything with a large
travel distance or a scale change.

You do **not** have to remove motion that *is* the interaction. A view that follows the user's
finger during a drag is direct manipulation: the user is causing the movement, frame by frame, and
freezing it would break the control. Apple's and Google's own system UIs keep drag tracking under
reduced motion and remove the flourishes around it.

| Motion | Under reduce motion |
| --- | --- |
| Screen transition slide | Replace with a cross-fade, or nothing |
| Parallax header | Turn off — this is the canonical trigger |
| Entrance animation on a list | Skip; render in final state |
| Spring bounce on a button press | Remove the overshoot; keep the state change |
| An object following the finger | **Keep it** — that is direct manipulation |
| A spinner indicating loading | Keep it, but consider a non-spinning indicator |
| Auto-playing video or a looping background | Turn off, and give a play control |
| A shake to signal an invalid field | Remove, and make sure the error is stated in text |

## Basic example

Read the setting once, then track changes — the user can toggle it from Control Centre or the
notification shade while your app is open.

```tsx title=src/a11y/useReduceMotion.ts
import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/**
 * Live-tracking version of the setting. `isReduceMotionEnabled()` is a Promise,
 * so there is one frame before the first value arrives — default to `false` and
 * let the first render be the animated one, rather than flashing motion off.
 */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) {
        setEnabled(value);
      }
    });

    // The handler is (boolean) => void, so the setter can be passed directly.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);

    return () => {
      cancelled = true;
      // addEventListener returns an EventSubscription. There is no
      // removeEventListener counterpart.
      subscription.remove();
    };
  }, []);

  return enabled;
}
```

Verified from the installed `types_generated/Libraries/Components/AccessibilityInfo/AccessibilityInfo.d.ts`:

| API | Signature | Platform |
| --- | --- | --- |
| `AccessibilityInfo.isReduceMotionEnabled()` | `() => Promise<boolean>` | Both |
| `AccessibilityInfo.addEventListener('reduceMotionChanged', handler)` | `handler: (value: boolean) => void`, returns `EventSubscription` | Both |
| `AccessibilityInfo.prefersCrossFadeTransitions()` | `() => Promise<boolean>` | **iOS only** |
| `AccessibilityInfo.isReduceTransparencyEnabled()` | `() => Promise<boolean>` | **iOS only** |

`prefersCrossFadeTransitions()` is the more precise question for a navigation transition: it tells
you the user has asked for cross-fades specifically, which is a better answer than removing the
transition entirely. It does not exist on Android, so treat `false` there as "no opinion", not
"no".

## How it works

### Reanimated already honours it, by default

Every animation helper takes a `reduceMotion` option, and the default is `ReduceMotion.System`.
The enum, read from `commonTypes.d.ts`, has exactly three members:

| `ReduceMotion` | Behaviour |
| --- | --- |
| `System` | **Default.** Follow the device setting |
| `Always` | Behave as if reduced motion is on, regardless of the device |
| `Never` | Behave as if it is off, regardless of the device |

So `withTiming`, `withSpring`, `withDecay`, `withDelay`, `withRepeat`, `withSequence`, every layout
animation builder and every `Keyframe` respect the setting without you writing a line. This is worth
stating plainly because the usual assumption is the opposite.

```tsx-fragment title=Overriding, for the rare motion that carries meaning
// Never: this motion is information, not decoration — for example a progress
// bar whose movement IS the status. Use it deliberately and rarely.
progress.value = withTiming(1, {duration: 400, reduceMotion: ReduceMotion.Never});

// Layout builders take a chained modifier instead of a config key.
<Animated.View entering={FadeIn.reduceMotion(ReduceMotion.Never)} />
```

### What "reduced" actually does, exactly

This is the fact that determines how you design. Read from
`react-native-reanimated/src/animation/utilCommon.ts`, when an animation is reduced:

```ts-fragment
if (animation.reduceMotion) {
  if (animation.toValue !== undefined) {
    animation.current = animation.toValue;
  } else {
    // if there is no `toValue`, then the base function is responsible for
    // setting the current value
    baseOnStart(animation, value, timestamp, previousAnimation);
  }
  animation.startTime = 0;
  animation.onFrame = () => true;
  return;
}
```

The animation **jumps straight to its target value and reports itself finished on the first
frame.** It is not cancelled, not skipped, not left at the start. The completion callback still
runs, with `finished === true`.

Three consequences:

1. **The end state is always reached.** Code that waits for a `withTiming` callback still fires.
2. **The transition is what disappears, not the result.** If your UI is correct at the end of every
   animation, it is correct under reduced motion for free.
3. **`withDecay` has no `toValue`.** A fling therefore has nothing to jump to; it simply does not
   coast. That is usually what you want, and it is worth knowing rather than discovering.

### `useReducedMotion()` is a snapshot, and says so

```ts-fragment
/**
 * Lets you query the reduced motion system setting.
 *
 * Changing the reduced motion system setting doesn't cause your components to
 * rerender.
 *
 * @returns A boolean indicating whether the reduced motion setting was enabled
 *   when the app started.
 */
export declare function useReducedMotion(): boolean;
```

That doc comment is from the installed 4.6.0 types, and it is a real limitation. Use
`useReducedMotion()` for branching inside animation code, where the value being one launch stale is
tolerable. Use the `AccessibilityInfo` hook above whenever a **React render** has to change — a
different component, a different control, an auto-play that must stop now.

### `ReducedMotionConfig` — changing the default globally

```tsx title=src/App.tsx
import {StyleSheet, Text, View} from 'react-native';
import {ReducedMotionConfig, ReduceMotion} from 'react-native-reanimated';

export default function App() {
  return (
    <View style={styles.fill}>
      {/* Renders null. It sets the library-wide default that every
          ReduceMotion.System animation resolves against. */}
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <Text>Screens go here</Text>
    </View>
  );
}

const styles = StyleSheet.create({fill: {flex: 1}});
```

`ReduceMotion.System` is already the default, so mounting this with `System` is a no-op you can use
as documentation. The two other modes are for specific jobs:

- **`Always`** is genuinely useful in **end-to-end tests**: animations complete instantly, so Detox
  does not have to wait or flake on timing. Wire it to a test flag, not to a build type.
- **`Never`** globally is almost always wrong. It overrides the user's medical accessibility
  setting for your entire app.

> [!WARNING] Reanimated's setting does not cover everything that moves
> `ReduceMotion` only reaches animations Reanimated drives. It does **not** touch: core `Animated`
> and `LayoutAnimation`; navigation transitions; auto-playing video or animated images; a `Lottie`
> or GIF asset; a WebView's own CSS animations; or a loop you wrote yourself with
> `useFrameCallback`. Each of those needs its own check against the boolean.

## Platform differences

:::tabs
@tab iOS
**Settings → Accessibility → Motion → Reduce Motion.** The same screen has **Prefer Cross-Fade
Transitions**, which is a separate toggle and is what `prefersCrossFadeTransitions()` reports.

`isReduceTransparencyEnabled()` is a third, related setting — the user has asked for fewer blurs and
translucent materials. If your design leans on frosted-glass effects, check it alongside reduce
motion.

Enable Reduce Motion on a simulator through the same Settings app, or with
`xcrun simctl` accessibility settings, and confirm your screens still make sense.
@tab Android
**Settings → Accessibility → Remove animations** (the exact wording varies by OEM and Android
version; it has also appeared as "Remove animations" under Colour and motion).

There is a second, less obvious source. The installed `AccessibilityInfo` types document
`reduceMotionChanged` as firing:

> The boolean is `true` when a reduce motion is enabled (**or when "Transition Animation Scale" in
> "Developer options" is "Animation off"**) and `false` otherwise.

That is worth knowing because developers frequently turn animation scales off to speed up their own
device, then wonder why the app has no animations. It is the setting working correctly.

There is no Android equivalent of `prefersCrossFadeTransitions()` or
`isReduceTransparencyEnabled()`; both resolve to `false`.
:::

## Common patterns

### Swap the motion, do not just delete it

The best reduced-motion treatment is usually a **cross-fade** rather than nothing. A change with no
transition at all can be harder to follow, not easier — the user may not notice the screen changed.

```tsx title=src/components/Toast.tsx
import {useEffect} from 'react';
import {StyleSheet} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export function Toast({visible}: {visible: boolean}) {
  const reduced = useReducedMotion();
  const y = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // The fade stays: it is small, has no travel, and keeps the change legible.
    opacity.value = withTiming(visible ? 1 : 0, {duration: 150});

    // The 80-point spring slide is what we drop. Assigning the target directly
    // is equivalent to what a reduced withSpring would do, and is explicit.
    y.value = reduced ? (visible ? 0 : -80) : withSpring(visible ? 0 : -80);
  }, [visible, reduced, opacity, y]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{translateY: y.value}],
  }));

  return <Animated.View style={[styles.toast, style]} />;
}

const styles = StyleSheet.create({toast: {height: 56, backgroundColor: '#3355ff'}});
```

### Design so the final frame is the whole story

This is the rule that makes everything else easy. Ask of each animation: **if it did not run at
all, and the view simply appeared in its end state, would the user know what happened?**

If the answer is no, the animation is carrying information, and the information needs another home:

| Animation carrying meaning | Give the meaning a permanent home |
| --- | --- |
| Row slides away to show it was deleted | A "Deleted. Undo" snackbar with text |
| Field shakes to show it is invalid | An error message under the field, and `accessibilityState` |
| Card flips to reveal the back | A visible label saying which side is showing |
| Item flies to the cart to show it was added | A cart badge with a count |
| Progress inferred from a moving bar | A numeric percentage, and `accessibilityValue` |

Every row in that right-hand column is also what a screen reader user needs. Reduced motion and
screen-reader support push you toward the same design, which is a good sign you are doing it right.

### Never gate content on an animation

```tsx-fragment title=Wrong — content that only appears when an animation completes
// Under reduced motion the completion fires on the first frame, which happens
// to work here. Under an interrupted animation it never fires at all, and the
// content is lost forever.
opacity.value = withTiming(1, {duration: 300}, () => {
  scheduleOnRN(setContentVisible, true);
});
```

```tsx-fragment title=Right — render the content, animate its appearance
// The content exists regardless. The animation only decorates it.
setContentVisible(true);
opacity.value = withTiming(1, {duration: 300});
```

### Let gestures keep tracking

Do not branch on reduced motion inside a gesture's `onUpdate`. The movement there is the user's own
finger, and freezing it makes the control unusable. What you should reduce is the *release*
behaviour: skip the overshoot on the settle spring, or drop the `withDecay` fling.

### Auto-play needs its own check

`ReduceMotion` cannot reach a video player or an animated image. Check the boolean and default to
paused.

```tsx-fragment title=Auto-play gated on the setting
const reduced = useReduceMotion(); // the AccessibilityInfo version, not Reanimated's
<VideoPlayer autoPlay={!reduced} loop={!reduced} />
```

## Performance considerations

Respecting the setting is a performance win as well as an accessibility one — a reduced animation
does no per-frame work at all, because `onFrame` returns `true` on the first call.

Two small costs to be aware of:

- **The `AccessibilityInfo` hook subscribes per component.** Read it once near the root and pass it
  down through context rather than subscribing in fifty components. See
  [Context](../state-and-data/context.md).
- **`useReducedMotion()` is free** — it reads a value captured at startup, with no subscription.
  That is the trade for it being stale.

## Common mistakes

- **Assuming you have to implement this.** Reanimated's helpers already default to
  `ReduceMotion.System`. Adding a manual `if (reduced)` around a `withTiming` is redundant, and
  worse, it usually forgets one of the four other animations on the same screen.
- **Setting `ReduceMotion.Never` to "fix" a test or an animation that looked wrong.** That override
  applies on real users' devices too, and it overrides a medical accessibility setting.
- **Using `useReducedMotion()` for something React renders.** It is documented as a startup
  snapshot that does not trigger a re-render. For a render decision, subscribe to
  `reduceMotionChanged`.
- **Forgetting `subscription.remove()`.** `AccessibilityInfo.addEventListener` returns an
  `EventSubscription`; there is no `removeEventListener` to call instead, and the leak keeps the
  component alive.
- **Treating the initial `false` as the answer.** `isReduceMotionEnabled()` is a Promise. A
  component that renders an auto-playing video on the first frame has already started it before the
  value arrives. Default auto-play to off and turn it on when the answer says you may.
- **Removing motion the user is causing.** Wrong: freezing a drag because reduce motion is on.
  Right: the object keeps following the finger; the release spring loses its bounce.
- **Expecting `ReduceMotion` to cover video, Lottie, GIFs, navigation transitions or core
  `Animated`.** It reaches Reanimated's own animations only. Everything else needs its own check.
- **Deleting the transition instead of replacing it.** An instant swap can be more disorienting
  than a 150 ms cross-fade. Reduce the *travel and scale*, not necessarily the whole change.
- **Shipping meaning that only exists in the motion.** A shake that is the only error indicator, a
  fly-to-cart that is the only confirmation. Under reduced motion — and for a screen-reader user —
  that information is simply gone.
- **Testing only with animations on.** Turn the setting on and walk the whole app. On Android,
  remember that "Transition animation scale: off" in Developer options reports as reduce motion.

## Related topics

- [Layout Animations](layout-animations.md) — the `.reduceMotion()` modifier on every builder.
- [Shared and Derived Values](shared-values.md) — the `reduceMotion` config on `withTiming` and friends.
- [Scroll-Driven Animation](scroll-driven-animation.md) — parallax, the canonical thing to switch off.
- [Gesture Handler](gesture-handler.md) — direct manipulation, which stays.
- [Animation Performance Rules](animation-performance.md) — the animation you skip is the cheapest one.
- [Accessibility](../platform-apis/accessibility.md) — the full `AccessibilityInfo` surface and screen-reader support.
- [Context](../state-and-data/context.md) — where to put the subscription so it is read once.
- [End-to-End Testing](../testing/end-to-end.md) — where `ReduceMotion.Always` genuinely helps.
