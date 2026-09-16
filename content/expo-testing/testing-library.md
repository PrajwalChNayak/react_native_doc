---
title: React Native Testing Library
description: Testing Expo SDK 57 components with @testing-library/react-native 14 — the async render API, queries, userEvent, built-in matchers, and the test-renderer peer.
status: current
toolchain: expo
sdk: 57
---

React Native Testing Library (RNTL) renders components in Jest and lets you query them the way a user
finds things — by role, label and text — rather than by component internals. The current version is
**`@testing-library/react-native@14.0.1`**.

Version 14 changed the API in a way most online examples have not caught up with: **`render`,
`fireEvent`, `renderHook` and friends are async and return promises.**

## Why it exists / when to use it — and when NOT to

Use RNTL for component behaviour: "when the user types a wrong password and presses Sign in, an error
appears". Tests written this way survive refactors because they do not depend on state names or
component structure.

Do **not** use it for:

- Pixel-level appearance. There is no real rendering; there is no layout.
- Real navigation transitions, gestures and animations. Use [end-to-end tests](end-to-end.md).
- Pure functions. Test those directly with Jest.

## Basic example

### Install

RNTL 14's peer dependencies, from `npm view @testing-library/react-native peerDependencies`:
`jest >=29.0.0`, `react >=19.0.0`, `react-native >=0.78`, `test-renderer ^1.0.0`. SDK 57 satisfies the
first three (Jest 29.7, React 19.2.3, React Native 0.86.3). **`test-renderer` must be installed
explicitly** — it is a separate package, not `react-test-renderer`.

```bash
npx expo install @testing-library/react-native test-renderer --dev
```

Neither package is in the SDK 57 version map, so `npx expo install` resolves them from npm. You need
[jest-expo set up](jest-expo.md) first.

### A test

```tsx title=components/__tests__/Counter.test.tsx
import {describe, expect, it} from '@jest/globals';
import {render, screen, userEvent} from '@testing-library/react-native';
import {useState} from 'react';
import {Pressable, Text, View} from 'react-native';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <View>
      <Text>Count: {count}</Text>
      <Pressable role="button" aria-label="Increment" onPress={() => setCount((c) => c + 1)}>
        <Text>+</Text>
      </Pressable>
    </View>
  );
}

describe('Counter', () => {
  it('increments when pressed', async () => {
    const user = userEvent.setup();
    // render is async in RNTL 14. Forgetting await is the most common v14 bug.
    await render(<Counter />);

    await user.press(screen.getByRole('button', {name: 'Increment'}));

    expect(screen.getByText('Count: 1')).toBeTruthy();
  });
});
```

## How it works

### The v14 async API

Verified from the installed `@testing-library/react-native@14.0.1` type definitions:

| API | Returns |
| --- | --- |
| `render(element, options?)` | `Promise<RenderResult>` |
| `rerender(element)` / `unmount()` (on the result) | `Promise<void>` |
| `renderHook(hook, options?)` | `Promise<RenderHookResult>` |
| `fireEvent(instance, eventName, ...data)` | `Promise<undefined>` |
| `fireEvent.press` / `fireEvent.changeText` / `fireEvent.scroll` | Promises |
| `userEvent.setup()` then `user.press(instance)`, `user.type(instance, text)` | Promises |

Code from RNTL 13 and earlier that calls `render(...)` without `await` compiles, but the tree may not
be ready when you query it. RNTL publishes migration codemods for the v14 async change; see its
documentation.

### Queries

`screen` holds the result of the most recent `render`. Queries come in families:

| Prefix | Not found | Found many | Async |
| --- | --- | --- | --- |
| `getBy…` | Throws | Throws | No |
| `queryBy…` | Returns `null` | Throws | No |
| `findBy…` | Rejects | Rejects | Yes — waits |
| `getAllBy…` / `queryAllBy…` / `findAllBy…` | As above, for arrays | — | — |

Prefer them in this order: `ByRole` (with `name`), `ByLabelText`, `ByPlaceholderText`, `ByText`,
`ByDisplayValue`, and `ByTestId` only as a last resort. Role and label queries also check that your
UI is accessible.

### `userEvent` vs `fireEvent`

`userEvent` simulates the sequence of events a real interaction produces (press in, press out, press;
focus, key presses, text change). `fireEvent` calls one handler directly. Prefer `userEvent`; use
`fireEvent` for events `userEvent` does not model.

### Built-in Jest matchers

Importing from `@testing-library/react-native` extends `expect` automatically (its entry point loads
`matchers/extend-expect`). The installed package includes `toBeOnTheScreen`, `toBeVisible`,
`toBeDisabled`, `toBeChecked`, `toBePartiallyChecked`, `toBeSelected`, `toBeExpanded`, `toBeBusy`,
`toBeEmptyElement`, `toContainElement`, `toHaveTextContent`, `toHaveDisplayValue`, `toHaveProp`,
`toHaveStyle`, `toHaveAccessibleName` and `toHaveAccessibilityValue`:

```tsx-fragment
await render(<LoginForm />);
await user.press(screen.getByRole('button', {name: 'Sign in'}));

expect(await screen.findByText('Password is required')).toBeOnTheScreen();
expect(screen.getByRole('button', {name: 'Sign in'})).toBeDisabled();
```

This block is a fragment because `LoginForm` and `user` come from surrounding test code, and because
the matcher types augment the global Jest types from `@types/jest`, which the handbook's type-check
harness does not load.

The `@testing-library/react-native/pure` entry exports the same API without those side effects: it
neither registers automatic cleanup after each test nor extends `expect`. With the main entry, setting
the `RNTL_SKIP_AUTO_CLEANUP` environment variable disables only the automatic cleanup.

## Common patterns

### Waiting for async UI

```tsx title=components/__tests__/Greeting.test.tsx
import {describe, expect, it} from '@jest/globals';
import {render, screen} from '@testing-library/react-native';
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

function Greeting({load}: {load: () => Promise<string>}) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    load().then(setName);
  }, [load]);
  return <Text>{name ? `Hello, ${name}` : 'Loading'}</Text>;
}

describe('Greeting', () => {
  it('shows the loaded name', async () => {
    await render(<Greeting load={() => Promise.resolve('Ada')} />);
    // findBy waits (with a timeout) instead of asserting before the effect resolves.
    expect(await screen.findByText('Hello, Ada')).toBeTruthy();
  });
});
```

### Testing a hook

```tsx title=hooks/__tests__/useToggle.test.tsx
import {describe, expect, it} from '@jest/globals';
import {act, renderHook} from '@testing-library/react-native';
import {useState} from 'react';

function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return {on, toggle: () => setOn((v) => !v)};
}

describe('useToggle', () => {
  it('toggles', async () => {
    const {result} = await renderHook(() => useToggle());
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.on).toBe(true);
  });
});
```

### Expo Router screens

`expo-router` ships `expo-router/testing-library`, which re-exports RNTL and adds `renderRouter` for
rendering a mock file-system route tree with an initial URL. See
[Expo Router Fundamentals](../expo-router/fundamentals.md).

## Performance considerations

- A deep provider tree (theme, query client, navigation) in every test adds up. Build a `wrapper` once
  and pass it through `render`'s `wrapper` option.
- `findBy…` polls until timeout on failure, so a missing element makes a test slow as well as red.
  Use `queryBy…` when asserting absence.

## Common mistakes

- **Not awaiting `render`.** Wrong: `render(<Screen />); screen.getByText(...)`. Right:
  `await render(<Screen />)`. RNTL 14 made it async.
- **Not installing `test-renderer`.** It is a required peer in v14, and it is not
  `react-test-renderer`.
- **Querying by `testID` first.** It passes even when the UI is inaccessible. Prefer `ByRole` with a
  `name`.
- **Using `getBy…` to assert something is absent.** It throws. Use `queryBy…` and `not.toBeOnTheScreen()`.
- **Asserting before async work finishes.** Use `findBy…` or `waitFor`.
- **Testing implementation details** — state variable names, child component props. The test breaks
  on refactors while the behaviour is unchanged.
- **Copying RNTL 12/13 examples.** Their synchronous `render` and `fireEvent` calls need `await` now.

## Related topics

- [Jest with jest-expo](jest-expo.md) — the preset these tests run under.
- [Mocking Expo Modules](mocking-expo-modules.md) — components that call native modules.
- [End-to-End on Development Builds](end-to-end.md) — what component tests cannot cover.
- [Testing in CI](ci.md) — running the suite on every pull request.
