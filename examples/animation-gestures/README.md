# Reanimated 4 + Gesture Handler 3

A swipeable card driven by a pan gesture, animated entirely on the UI thread. Drag it sideways:
past ~110 dp, or with a fast enough flick, it commits and flies off; otherwise it springs back.

The decision rules live in `src/swipe.ts` as pure functions. A gesture callback runs as a
worklet on the UI thread where nothing is observable from a test, so pulling the arithmetic out
lets the behaviour that matters be tested directly and leaves the worklet holding only what has
to touch shared values.

## The install trap

**Reanimated 4 does not bundle its worklets runtime.** `react-native-worklets` is a separate,
required peer dependency, and its Babel plugin is what turns a function marked `'worklet'` into
something that can run off the JS thread. Most tutorials online predate the Reanimated 3 → 4
split and get this wrong.

```bash
npm install react-native-reanimated@4.6.0 react-native-worklets@0.12.2 react-native-gesture-handler@3.3.0 react-native-safe-area-context@5.9.1
```

```js title=babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Must be LAST — it needs to see the output of every other transform.
    'react-native-worklets/plugin',
  ],
};
```

`react-native-reanimated/plugin` still resolves; in 4.6.0 that file is a four-line re-export of
the worklets one. The worklets name is canonical, so prefer it, and do not be surprised by the
other spelling in older projects.

If the plugin is missing or not last, symptoms are confusing rather than obvious: animations run
on the JS thread and stutter, or you get a runtime error about a value not being a worklet.

## Run it

This directory holds the JavaScript and TypeScript only. Generating a correct 0.87 `android/`
and `ios/` project by hand is not feasible, so create the native projects with the Community CLI
and copy this source in:

```bash
npx @react-native-community/cli@20.2.0 init AnimationGestures --version 0.87.1
```

Copy `App.tsx`, `src/`, `__tests__/`, `babel.config.js`, `jest.config.js` and `index.js`, install
the four dependencies above, then (**macOS with Xcode only**):

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

```bash
npm start
```

```bash
npm run android
```

```bash
npm run ios
```

## Gesture Handler's native requirements

Two things are easy to miss and both cause gestures to silently do nothing:

1. **`import 'react-native-gesture-handler'` must be the first import in `index.js`**, before
   anything else in the app. It is already at the top of this example's `index.js`.
2. **`GestureHandlerRootView` must wrap the app**, above everything that uses a gesture. It is
   the outermost component in `App.tsx`.

Gesture Handler 3.x requires React Native 0.82 or newer, which 0.87 satisfies.

## What you should see

- The card tracks your finger exactly, and keeps tracking it even while the JS thread is busy —
  that is the whole point of a worklet.
- It tilts into the swipe, up to 12 degrees, and fades as it travels.
- Released short and slow, it springs back. Released past the threshold, or flicked, it flies
  off and the next card appears.
- Flicking *against* the direction you dragged does **not** commit — releasing mid-spring-back
  should not count as a swipe.

## The rules this example follows

- **Animate `transform` and `opacity` only.** Both are handled off the JS thread. Animating
  `width`, `height` or `margin` forces layout every frame and is the usual cause of a janky card.
- **`runOnJS` once per gesture, never per frame.** It appears in `onEnd`, inside the animation
  callback, to advance React state. Calling it from `onChange` would put a thread hop in the
  per-frame path and undo the benefit of the worklet.
- **Mutating `.value` does not re-render.** Shared values are mutable state on the UI thread;
  treating them like React state is the most common conceptual mistake.

## Verify

```bash
npm run tsc
```

```bash
npm test
```

Both pass on Node 22.13.0 or newer — 13 tests covering commit thresholds, direction, the
opposite-direction flick case, rotation clamping and the opacity floor.

## Related reading

- [The UI Thread and Worklets](../../content/animation/worklets.md)
- [Gesture Handler](../../content/animation/gesture-handler.md)
- [Animation Performance Rules](../../content/animation/animation-performance.md)
- [Shared and Derived Values](../../content/animation/shared-values.md)
