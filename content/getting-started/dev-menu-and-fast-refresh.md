---
title: Dev Menu and Fast Refresh
description: The in-app Dev Menu, what Fast Refresh does and does not preserve, and how to open React Native DevTools in 0.87.
status: current
toolchain: cli
---

The development loop in React Native is: save a file, see the change, keep your place in the app.
Fast Refresh is what makes that work, the Dev Menu is where you control it, and React Native
DevTools is where you inspect what happened. All three are development-only — none of them exists
in a release build.

Most of the frustration people report with this loop comes from one thing: **Fast Refresh
sometimes resets your state, and the reason is never random.** This page is mostly about making
that predictable.

## Why it exists / when to use it — and when NOT to

Fast Refresh replaces the edited modules inside the running app and asks React to re-render,
instead of restarting the app. That keeps you inside the screen you are working on — three levels
deep in a form, with a modal open — which is exactly where a reload hurts.

It is on by default and you should leave it on. Turn it off temporarily when you are debugging
something that Fast Refresh itself perturbs: module-level initialisation, a subscription set up at
import time, or a bug you can only reproduce from a cold start. Then reload rather than refresh.

## Basic example

Open the Dev Menu:

:::tabs
@tab iOS
<kbd>Cmd</kbd>+<kbd>D</kbd> on the simulator, or shake a physical device.
@tab Android
<kbd>Ctrl</kbd>+<kbd>M</kbd> on the emulator, or shake a physical device.
:::

From the Metro terminal, without touching the device at all:

| Key | Effect |
| --- | --- |
| <kbd>r</kbd> | Reload the connected app(s) |
| <kbd>d</kbd> | Open the Dev Menu on the connected app(s) |
| <kbd>j</kbd> | Open React Native DevTools |

These are the three keys Metro registers in interactive mode; it prints them itself when it
starts. On the device, reload by pressing <kbd>R</kbd> twice.

## How it works

Fast Refresh is React Native's integration of **React Refresh**. Metro compiles each module with a
Babel transform that registers every React component it finds and records a **signature** for it —
a key derived from the hooks that component calls, including custom hooks. When you save, Metro
sends only the changed modules over the Hot Module Replacement socket, and the runtime decides,
per component, whether it can re-render in place or must remount.

`haveEqualSignatures(previous, next)` is the whole decision. Equal signature means re-render and
keep state. Different signature, or a component that opted out, means remount and lose it.

### What is preserved

- **Local state in function components**, including `useState` and `useReducer`, as long as the
  component's hook signature has not changed.
- **The navigation stack and the currently mounted screens.** You stay where you were.
- **Refs**, since they live on the same fiber as the preserved state.
- **Anything you changed inside a component**: JSX, styles, event handlers, effects, rendering
  logic. Editing a file that exports only React components is the case Fast Refresh handles best.

### What is not preserved

This is the list worth memorising.

| Situation | What happens | Why |
| --- | --- | --- |
| **Module-level state** — a `let`, a counter, a cache, a singleton outside any component | Reset to its initial value | The module is re-executed. Fast Refresh replaces modules; it does not migrate their top-level bindings |
| **A changed hook order or hook list** in the component you edited | That component remounts, state lost | Adding, removing or reordering a hook changes the component's signature, and React Refresh cannot know the new state layout matches the old |
| **Class components** | State reset on every edit | React Refresh only preserves state for function components and hooks |
| **A module that exports something other than components** | That module and every module importing it re-run | Fast Refresh cannot know what depends on the non-component export, so it re-runs the importers |
| **A module imported from outside the React tree** | Full app reload | There is no component boundary to re-render at |
| **An anonymous default export** — `export default () => <View />` | State reset on every edit | There is no stable identity for the runtime to match against |
| **A higher-order component returning a class** | State reset | Same class-component rule, one level removed |
| **`// @refresh reset` anywhere in the file** | That file's components always remount | You asked for it — see below |

The first two rows are the ones that produce "Fast Refresh is broken" bug reports.

```tsx title=Module-level state does not survive a refresh
import {useState} from 'react';
import {Pressable, Text, View} from 'react-native';

// Re-initialised on every Fast Refresh of this file. If you are counting
// renders or caching something here, your numbers restart without warning.
let renderCount = 0;

export function Counter() {
  // Preserved across a Fast Refresh — until you add or remove a hook above it.
  const [count, setCount] = useState(0);
  renderCount += 1;

  return (
    <View>
      <Pressable onPress={() => setCount((c) => c + 1)}>
        <Text>{`${count} taps, ${renderCount} renders`}</Text>
      </Pressable>
    </View>
  );
}
```

Save that file after changing the text and `count` survives while `renderCount` restarts at zero.
Now add a `useRef` above the `useState` and save: the signature changes, the component remounts,
and `count` goes back to zero too.

### Forcing a remount on purpose

Sometimes remounting is what you want — a component with expensive setup in a `useEffect`, or a
form you would rather see fresh on every edit. Put this anywhere in the file:

```tsx title=Opting a file out of state preservation
// @refresh reset

import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export function Timer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text>{seconds}</Text>;
}
```

Every edit to that file now remounts its components from scratch.

### Error resilience

A syntax error does not kill the session. Metro shows the error, and when you fix it the app
recovers without a reload. A runtime error thrown during render shows a red screen, and the next
successful edit re-renders over it.

The exception is an error thrown at module scope — outside any component — during the refresh. The
module has already been half-executed and there is no safe state to re-render from, so the runtime
falls back to a full reload. That is correct behaviour, not a bug.

### When Fast Refresh silently stops

Two warnings are worth recognising, because both come from the connection rather than from your
code:

- **"Fast Refresh disconnected. Reload app to reconnect."** The HMR socket to Metro closed. Metro
  was restarted, the machine slept, or the network dropped. Reload the app.
- **"Metro has restarted since the last edit. Reload to reconnect."** You restarted Metro under a
  running app. The app is talking to a server that no longer has its module graph.

Neither is fixed by editing more files. Reload, and if the problem recurs after every edit, check
that only one Metro is running on the port your app is configured for.

## Common patterns

### Adding your own Dev Menu entry

`DevSettings` lets you put a project-specific action in the Dev Menu. This is a much better
developer experience than a debug button you have to remember to delete before shipping, because
the whole module is a no-op in production builds.

```ts title=src/dev/devMenu.ts
import {DevSettings} from 'react-native';

export function registerDevMenuItems(resetOnboarding: () => void): void {
  // DevSettings is a no-op in release builds, but guard anyway so the
  // callback and anything it closes over are never reachable in production.
  if (__DEV__) {
    DevSettings.addMenuItem('Reset onboarding state', () => {
      resetOnboarding();
      // The reason string shows up in the reload log, which is genuinely
      // useful when you are staring at a terminal wondering who reloaded.
      DevSettings.reload('onboarding reset');
    });
  }
}
```

The title doubles as the item's identity, so keep the strings unique.

### Structuring files so Fast Refresh keeps working

The "module with non-component exports" rule is the one you can design around. A file that exports
a component *and* a constant re-runs its importers on every edit.

```tsx title=Wrong — the constant drags every importer into the refresh
import {Text} from 'react-native';

export const ROW_HEIGHT = 56;

export function Row({label}: {label: string}) {
  return <Text style={{height: ROW_HEIGHT}}>{label}</Text>;
}
```

```tsx-fragment title=Right — constants in their own module
import {Text} from 'react-native';
import {ROW_HEIGHT} from './layoutConstants';

export function Row({label}: {label: string}) {
  return <Text style={{height: ROW_HEIGHT}}>{label}</Text>;
}
```

```ts title=src/ui/layoutConstants.ts
export const ROW_HEIGHT = 56;
```

The same reasoning applies to types — a file exporting only types and components is fine, because
types vanish at compile time.

### Reload versus refresh versus rebuild

Knowing which hammer to pick saves a lot of waiting.

| You changed | What you need |
| --- | --- |
| A component, a style, a hook body | Nothing — Fast Refresh handles it |
| Module-level constants or initialisation | A reload (<kbd>r</kbd>) so the module re-runs from a clean start |
| `babel.config.js` or `metro.config.js` | Restart Metro with `npm start -- --reset-cache` |
| A `package.json` dependency with no native code | Restart Metro |
| A dependency **with** native code | A full native rebuild: `npm run android` / `npm run ios` |
| Anything under `android/` or `ios/` | A full native rebuild |
| A Codegen spec in `src/specs/` | A full native rebuild — Codegen runs at build time |

## React Native DevTools

React Native DevTools is the debugger that ships with 0.87. It is a Chrome DevTools frontend
attached to Hermes, and it gives you the console, breakpoints, a network panel, the memory tools
and the React Components and Profiler panels in one window.

Open it with <kbd>j</kbd> in the Metro terminal, or **Open DevTools** in the Dev Menu.

> [!WARNING] Do not run `npx react-devtools` — standalone support was removed in 0.87
> React Native 0.87 **removed** the WebSocket support that the standalone `react-devtools` package
> used to connect through. Instructions telling you to run it in a second terminal and then open
> the Dev Menu predate 0.87 and will simply hang. The React Components and Profiler panels live
> inside React Native DevTools now; there is no separate process to start.

A few things that catch people out:

- It attaches to the **Hermes** runtime. Breakpoints, the console and the profiler all reflect
  what Hermes is executing, not a browser.
- Only one debugger frontend can attach at a time. If <kbd>j</kbd> appears to do nothing, an old
  DevTools window is probably still holding the connection.
- It is a development-only surface. There is nothing to disable before release, and nothing in it
  proves anything about release performance.

See [React Native DevTools](../debugging/react-native-devtools.md) for the panel-by-panel detail.

## Platform differences

:::tabs
@tab iOS
Dev Menu: <kbd>Cmd</kbd>+<kbd>D</kbd> on the simulator, or shake the device. If the shortcut does
nothing, check **I/O → Send Keyboard Shortcuts to Device** in the Simulator menu, and make sure
the simulator window has focus.
@tab Android
Dev Menu: <kbd>Ctrl</kbd>+<kbd>M</kbd> on the emulator, or shake the device. You can also trigger
it over `adb` without touching the emulator window at all:

```bash
adb shell input keyevent 82
```
:::

Shaking is disabled on some devices and by some accessibility settings, so learn the keyboard and
Metro routes rather than relying on it.

## Performance considerations

- **Fast Refresh has no release cost.** The transform, the HMR client and the Dev Menu are
  development-only. There is nothing to strip.
- **A large module graph slows the refresh, not the app.** If a save takes seconds to appear, the
  usual cause is a file whose non-component export drags a large subtree into the update. Splitting
  constants and utilities out shrinks the affected set.
- **Never measure performance in a Fast Refresh session.** The app has accumulated re-mounted
  subtrees, stale timers from earlier edits, and dev-mode assertions. Reload before you measure,
  and measure a release build for anything that matters. See
  [Measuring Before Optimising](../performance/measuring-first.md).

## Common mistakes

- **Expecting module-level state to survive.** Wrong: caching an expensive value in a
  module-scope `let` and wondering why it resets. Right: put it in a ref, a store, or accept the
  reload. The module is re-executed.
- **Blaming Fast Refresh for a remount you caused.** Adding or removing a hook changes the
  component's signature, and the runtime deliberately remounts rather than guess. If state matters
  for what you are testing, make the hook change first and set up the state afterwards.
- **Editing a class component and expecting preserved state.** Only function components and hooks
  preserve state. This is a React Refresh limitation, not a configuration you can turn on.
- **`export default () => <View />`.** An anonymous arrow function has no stable identity, so state
  resets on every edit. Give the component a name and export it by name.
- **Running `npx react-devtools`.** Standalone WebSocket support was removed in 0.87. Use
  <kbd>j</kbd> in Metro, or Open DevTools in the Dev Menu.
- **Restarting Metro and then editing files.** The running app is still attached to the old server.
  You get "Metro has restarted since the last edit" and no updates until you reload the app.
- **Editing `babel.config.js` and only saving a component.** Babel output is cached. Restart Metro
  with `npm start -- --reset-cache`, or the old transform keeps being served and the symptoms make
  no sense.
- **Installing a native library and pressing <kbd>r</kbd>.** Reload only re-runs JavaScript. Native
  code arrives through a Gradle or Xcode build.

## Related topics

- [Running on Android](running-on-android.md) — Metro, ports and the Android build loop.
- [Running on iOS](running-on-ios.md) — simulators, devices and the iOS build loop.
- [Your First Screen](your-first-screen.md) — something worth refreshing.
- [React Native DevTools](../debugging/react-native-devtools.md) — the debugger in depth.
- [Console and Logs](../debugging/console-and-logs.md) — where `console.log` actually goes.
- [Project Structure](project-structure.md) — `babel.config.js`, `metro.config.js` and what caches what.
- [Measuring Before Optimising](../performance/measuring-first.md) — why a dev build tells you nothing.
