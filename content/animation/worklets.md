---
title: The UI Thread and Worklets
description: What a worklet really is, how the Babel plugin transforms it, what crosses the serialisation boundary, and why calling a normal function from a worklet breaks.
status: current
toolchain: cli
---

A worklet is a JavaScript function that has been marked for extraction so it can be sent to and
executed on a **second JavaScript runtime** that lives on the UI thread. It is not a thread, not
a web worker, and not a native callback. It is your function, compiled into a form that a
different runtime can rebuild and run.

Getting this model right is the difference between Reanimated feeling obvious and Reanimated
feeling haunted. Most confusing Reanimated bugs — a value that never updates, a callback that
never fires, a crash that says something cannot be cloned — are the serialisation boundary
telling you that your mental model has one runtime in it when there are two.

## Installing Reanimated 4 and worklets

> [!WARNING] This is the single most misreported fact about Reanimated 4
> Reanimated 3 bundled its own worklets runtime and its own Babel plugin. **Reanimated 4 does
> not.** `react-native-worklets` is a separate, required peer dependency, and the Babel plugin
> lives in that package.

Verified from the installed packages:
`react-native-reanimated@4.6.0` declares `"react-native-worklets": "0.12.x"` in
`peerDependencies` with no `peerDependenciesMeta` marking it optional, and
`react-native-reanimated/plugin/index.js` contains nothing but
`module.exports = require('react-native-worklets/plugin')`.

:::tabs
@tab npm
```bash
npm install react-native-reanimated@4.6.0 react-native-worklets@0.12.2
cd ios && bundle install && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-reanimated@4.6.0 react-native-worklets@0.12.2
cd ios && bundle install && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-reanimated@4.6.0 react-native-worklets@0.12.2
cd ios && bundle install && bundle exec pod install
```
:::

Then add the plugin. The name is **`react-native-worklets/plugin`**:

```js title=babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reanimated 4's worklet transform lives in react-native-worklets.
    // Keep it last: it has to see the code other plugins have already produced.
    'react-native-worklets/plugin',
  ],
};
```

With plugin options:

```js title=babel.config.js with options
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'react-native-worklets/plugin',
      {
        // Identifiers that must NOT be copied into a worklet's closure.
        globals: ['myGlobalObject'],
        disableInlineStylesWarning: false,
      },
    ],
  ],
};
```

Restart Metro with a cleared cache after changing `babel.config.js`, or the old transform stays
in the cache and the symptoms make no sense:

```bash
npm start -- --reset-cache
```

| Version | Worklets runtime | Babel plugin |
| --- | --- | --- |
| Reanimated 3.x | Bundled | `react-native-reanimated/plugin` |
| **Reanimated 4.6.0** | **Separate package `react-native-worklets@0.12.x`** | **`react-native-worklets/plugin`** |

`react-native-reanimated/plugin` still resolves in 4.6.0 — it re-exports the worklets plugin —
so a copied-from-a-blog config may appear to work. Write the worklets path. It is the one the
pair is built around, and the shim is a compatibility courtesy, not the contract.

## Why it exists / when to use it — and when NOT to

React renders on the JS thread. If that thread is busy — a long list re-render, JSON parsing, a
state update cascade — anything driven from it stops. A gesture-following drag driven by React
state will visibly hitch on exactly the frames where the user is paying most attention.

Worklets move the per-frame work off that thread. The UI runtime does not run your React tree; it
runs only worklets, so it is idle almost all the time and can hit every frame.

You do **not** need a worklet when the animation is fire-and-forget and only touches `opacity` or
`transform`. Core `Animated` with the native driver already runs those without JavaScript. See
[Animated vs Reanimated](animated-vs-reanimated.md).

## Basic example

```tsx title=src/components/DragBox.tsx
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';

export function DragBox() {
  const x = useSharedValue(0);

  // This arrow function is a worklet. The Babel plugin finds it because
  // useAnimatedStyle's argument is on the plugin's auto-workletisation list.
  const style = useAnimatedStyle(() => {
    return {transform: [{translateX: x.value}]};
  });

  // This is NOT a worklet. It runs on the JS thread, and that is correct:
  // assigning an animation to .value is a normal JS-side operation.
  const nudge = () => {
    x.value = withSpring(x.value + 40);
  };

  return <Animated.View onTouchEnd={nudge} style={[styles.box, style]} />;
}

const styles = StyleSheet.create({
  box: {width: 80, height: 80, borderRadius: 12, backgroundColor: '#3355ff'},
});
```

## How it works

### The `'worklet'` directive and what the plugin does

A function becomes a worklet when its body starts with the string directive `'worklet'`, or when
it is passed to an API the plugin already knows workletises its argument (`useAnimatedStyle`,
`useDerivedValue`, `useAnimatedScrollHandler`, `useAnimatedReaction`, `useFrameCallback`,
gesture callbacks, and the `runOn*` / `scheduleOn*` family).

```tsx title=An explicit worklet
import {useSharedValue} from 'react-native-reanimated';
import {runOnUI} from 'react-native-worklets';

export function useClampedProgress() {
  const progress = useSharedValue(0);

  function clampOnUI(next: number) {
    'worklet';
    // Runs on the UI runtime. `progress` is captured; see the closure rules below.
    progress.value = Math.min(1, Math.max(0, next));
  }

  return {progress, setProgress: runOnUI(clampOnUI)};
}
```

At build time the plugin rewrites that function into an object carrying three things:

1. **`__initData`** — the function's source code as a string (or Hermes bytecode in production
   when `hermesBytecode` is enabled), plus its location and source map for stack traces.
2. **`__closure`** — an object holding every outer-scope identifier the function body references.
3. **`__workletHash`** — an identity used to cache the compiled function on the UI runtime.

At runtime the UI runtime evaluates the code once, caches it by hash, and calls it with the
closure rebuilt from serialised values. Your function is **re-created** on the other side; the
original function object never leaves the JS runtime.

You can confirm at runtime which side you are on:

```tsx title=Which runtime am I on
import {getRuntimeKind, RuntimeKind} from 'react-native-worklets';

export function describeRuntime(): string {
  'worklet';
  return getRuntimeKind() === RuntimeKind.UI ? 'UI runtime' : 'React Native runtime';
}
```

### The serialisation boundary — what can be captured

Everything in `__closure` is serialised. That means the rules are about **values, not scope**.

| Captured thing | Crosses? | What actually happens |
| --- | --- | --- |
| `number`, `string`, `boolean`, `null`, `undefined` | Yes | Copied by value, **frozen** at capture time |
| Plain objects and arrays of the above | Yes | Deep-copied, frozen |
| Shared values (`useSharedValue`) | Yes | Passed by reference — both runtimes see one cell |
| Another worklet | Yes | Serialised the same way |
| A **normal** JS function | Yes, but broken | Arrives as a stub that throws when called |
| React state setters, `console` methods you wrapped, class instances | No | Throws, or arrives unusable |
| Hermes internals, native host objects, DOM-ish globals | No | Not serialisable |

The frozen part is the one that bites. A captured plain value is a snapshot from the render in
which the worklet was created:

```tsx title=Captured primitives are snapshots; shared values are live
import {useState} from 'react';
import {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';

export function useBadAndGoodCapture() {
  const [multiplier, setMultiplier] = useState(1); // plain JS state
  const liveMultiplier = useSharedValue(1); // shared value
  const progress = useSharedValue(0);

  // `multiplier` is frozen into this worklet's closure. useAnimatedStyle does
  // re-create the worklet when the component re-renders, so this one is fine —
  // but the same capture inside a runOnUI call made once would never update.
  const fromState = useAnimatedStyle(() => ({opacity: progress.value * multiplier}));

  // Always current, no re-render needed, no re-capture needed.
  const fromShared = useAnimatedStyle(() => ({
    opacity: progress.value * liveMultiplier.value,
  }));

  return {fromState, fromShared, setMultiplier};
}
```

### Crossing back: `runOnJS` and `scheduleOnRN`

A worklet cannot call a normal JS function. It can only ask the React Native runtime to call one.

```tsx title=Calling back into React from a worklet
import {useState} from 'react';
import {useAnimatedReaction, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

export function useCrossedThreshold() {
  const offset = useSharedValue(0);
  const [crossed, setCrossed] = useState(false);

  useAnimatedReaction(
    () => offset.value > 100,
    (isPast, wasPast) => {
      // This whole callback is a worklet on the UI runtime.
      if (isPast !== wasPast) {
        // setCrossed is a React setter: it MUST be marshalled back.
        scheduleOnRN(setCrossed, isPast);
      }
    },
  );

  return {offset, crossed};
}
```

`scheduleOnRN(fn, ...args)` schedules `fn` on the React Native runtime with serialised arguments.
`runOnJS(fn)` returns a wrapper you call later; in worklets 0.12.2 it is implemented as
`(...args) => scheduleOnRN(fn, ...args)`, so the two are the same mechanism.

> [!NOTE] Import the threading helpers from `react-native-worklets`
> In Reanimated 4.6.0, `runOnJS`, `runOnUI`, `runOnRuntime`, `createWorkletRuntime`,
> `executeOnUIRuntimeSync` and `isWorkletFunction` re-exported from `react-native-reanimated` are
> all marked `@deprecated`, pointing at `react-native-worklets`. The current names there are
> `scheduleOnRN` (JS-bound) and `scheduleOnUI` (UI-bound); `runOnJS` and `runOnUI` remain
> undeprecated in the worklets package itself.

### Going the other way: `runOnUI` and `scheduleOnUI`

```tsx title=Measuring on the UI thread
import {useCallback} from 'react';
import {View} from 'react-native';
import Animated, {measure, useAnimatedRef, useSharedValue} from 'react-native-reanimated';
import {scheduleOnUI} from 'react-native-worklets';

export function MeasuredCard() {
  const ref = useAnimatedRef<View>();
  const height = useSharedValue(0);

  const remeasure = useCallback(() => {
    // measure() is UI-thread only: it reads the shadow tree synchronously.
    // Calling it from JS returns nothing useful, so hop first.
    scheduleOnUI(() => {
      'worklet';
      const measured = measure(ref);
      if (measured !== null) {
        height.value = measured.height;
      }
    });
  }, [ref, height]);

  return <Animated.View ref={ref} onLayout={remeasure} />;
}
```

`scheduleOnUI(worklet, ...args)` enqueues immediately. `runOnUI(worklet)` returns a function you
call with the arguments later. `runOnUISync` and `runOnUIAsync` exist for the rare cases where
you need the return value; prefer the fire-and-forget forms.

### Why calling a normal function from a worklet misbehaves

This is the failure everyone hits once:

```tsx title=Wrong — formatLabel is a plain JS function
import {useDerivedValue, useSharedValue} from 'react-native-reanimated';

function formatLabel(value: number): string {
  return `${Math.round(value)}%`;
}

export function useLabelWrong() {
  const progress = useSharedValue(0);
  return useDerivedValue(() => {
    // formatLabel is serialised as a non-worklet stub. Calling it throws
    // "Tried to synchronously call a non-worklet function on the UI thread".
    return formatLabel(progress.value * 100);
  });
}
```

There are exactly three fixes, and which one you want depends on where the work belongs:

```tsx title=Right — mark the helper as a worklet
import {useDerivedValue, useSharedValue} from 'react-native-reanimated';

function formatLabel(value: number): string {
  'worklet';
  return `${Math.round(value)}%`;
}

export function useLabelRight() {
  const progress = useSharedValue(0);
  return useDerivedValue(() => formatLabel(progress.value * 100));
}
```

```tsx title=Right — inline it, if it is small and used once
import {useDerivedValue, useSharedValue} from 'react-native-reanimated';

export function useLabelInline() {
  const progress = useSharedValue(0);
  return useDerivedValue(() => `${Math.round(progress.value * 100)}%`);
}
```

```tsx title=Right — marshal it back, if it genuinely belongs on the JS thread
import {useAnimatedReaction, useSharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

function reportToAnalytics(percent: number) {
  // Touches a JS-only SDK. It cannot and should not run on the UI runtime.
  console.log('progress', percent);
}

export function useReportedProgress() {
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => Math.round(progress.value * 100),
    (percent) => {
      scheduleOnRN(reportToAnalytics, percent);
    },
  );
  return progress;
}
```

The "silently misbehaves" variant is worse than the crash. If the helper closes over something
unserialisable, or the plugin is missing so no function is workletised at all, you get code that
runs on the JS thread at unpredictable times instead of failing loudly. If an animation works but
stutters under load, check that the Babel plugin is actually configured before you optimise
anything.

## Platform differences

:::tabs
@tab iOS
The UI runtime runs on the main thread. A blocking worklet freezes touch handling and rendering
outright — there is no second chance. Native setup is CocoaPods; run `bundle exec pod install`
after installing both packages.
@tab Android
The UI runtime also runs on the main (UI) thread. Reanimated requires the New Architecture, which
is the only architecture from 0.82 onwards, so no Gradle flag is involved. A Gradle rebuild is
required after install — Metro restarting is not enough.
:::

On the web the plugin still workletises, but there is no second runtime; everything runs on the
one thread. Code that depends on UI-thread synchrony behaves differently, and hooks take an
optional `dependencies` array specifically for the web case.

## Performance considerations

- A worklet runs on the thread that draws. Anything slow in it is a dropped frame, in the most
  visible possible place.
- Keep per-frame worklets arithmetic-only. No allocation in a loop, no string building, no
  `JSON.parse`.
- `scheduleOnRN` / `runOnJS` in an `onUpdate` handler fires once per frame and serialises its
  arguments each time. Batch through a shared value and react to it instead.
- Capturing a large object copies it into the closure. Capture the two numbers you need.

## Common mistakes

- **Installing Reanimated 4 without `react-native-worklets`.** It is a required peer. The build
  succeeds and the first worklet fails.
- **Configuring `react-native-reanimated/plugin`.** In 4.6.0 that file is a one-line re-export of
  `react-native-worklets/plugin`. Configure the real one.
- **Forgetting to clear the Metro cache after editing `babel.config.js`.** Babel output is
  cached; the old, unworkletised transform will keep being served.
- **Calling a plain helper from a worklet.** Add `'worklet'` to the helper, inline it, or
  marshal it back with `scheduleOnRN`. There is no fourth option.
- **Expecting a captured variable to update.** Primitives are frozen into the closure at capture
  time. If it has to change, it has to be a shared value.

  ```tsx title=Wrong — `limit` never changes after the first run
  import {useSharedValue} from 'react-native-reanimated';
  import {runOnUI} from 'react-native-worklets';

  export function useWrongCapture(limit: number) {
    const x = useSharedValue(0);
    // Created once. `limit` is frozen at whatever it was then.
    const clamp = runOnUI(() => {
      x.value = Math.min(x.value, limit);
    });
    return clamp;
  }
  ```

  ```tsx title=Right — put the changing value in a shared value
  import {useEffect} from 'react';
  import {useSharedValue} from 'react-native-reanimated';
  import {runOnUI} from 'react-native-worklets';

  export function useRightCapture(limit: number) {
    const x = useSharedValue(0);
    const limitSv = useSharedValue(limit);
    useEffect(() => {
      limitSv.value = limit;
    }, [limit, limitSv]);

    const clamp = runOnUI(() => {
      x.value = Math.min(x.value, limitSv.value);
    });
    return clamp;
  }
  ```

- **Storing a function inside a shared value.** The `useSharedValue` documentation says plainly
  not to. Shared values hold data; worklets hold behaviour.
- **Assuming `'worklet'` makes something asynchronous.** It makes it run somewhere else. A slow
  worklet is still slow, on the thread that can least afford it.

## Related topics

- [Animated vs Reanimated](animated-vs-reanimated.md) — whether you need any of this.
- [Shared and Derived Values](shared-values.md) — the one thing that is genuinely shared.
- [Gesture Handler](gesture-handler.md) — the main consumer of worklets.
- [Animation Performance Rules](animation-performance.md) — keeping worklets cheap.
- [The Threading Model](../core-concepts/threading-model.md) — JS, UI and background threads after 0.82.
- [JSI](../core-concepts/jsi.md) — how a second runtime can talk to native at all.
