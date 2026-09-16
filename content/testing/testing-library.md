---
title: React Native Testing Library
description: Render and query components with @testing-library/react-native 14, including the renderer peer dependency that changed and trips up most upgrades.
status: current
toolchain: cli
---

React Native Testing Library (RNTL) renders a component tree in Jest and lets you query it the way
a user perceives it — by visible text, by accessibility label, by role — rather than by internal
structure. Tests written that way survive refactors, because they assert what the screen offers
rather than which component produced it.

The version this handbook targets is `@testing-library/react-native@14.0.1`. Its peer dependencies
changed in a way that is easy to get wrong, so read the installation section carefully even if you
have used RNTL before.

## Why it exists / when to use it — and when NOT to

A component test is worth writing when the component makes a decision: it shows an error when a
field is empty, it disables a button while a request is in flight, it renders an empty state when
the list is empty. Those are behaviours a refactor should not change, and a query-by-text
assertion pins them without pinning the markup.

It is not worth writing when the component only forwards props to a `View`. There is no decision to
assert, and the test becomes a second copy of the implementation that has to be edited every time
the implementation is.

RNTL cannot tell you whether something is visible on a real screen. Layout runs in native code that
does not exist under Jest, so a view that is 0 pixels tall, behind a modal, or off-screen still
counts as rendered. Anything that depends on actual pixels belongs in
[an end-to-end run](end-to-end.md).

## Installation — the part that changed

RNTL 14 declares these peer dependencies, read from the npm registry:

| Peer | Range |
| --- | --- |
| `jest` | `>=29.0.0` |
| `react` | `>=19.0.0` |
| `react-native` | `>=0.78` |
| `test-renderer` | `^1.0.0` |

The last row is the trap. `test-renderer` is **not** `react-test-renderer`. It is a separate
package (current version `1.2.0`) described on npm as "a lightweight test renderer for React and a
modern replacement for the deprecated React Test Renderer". It depends on `react-reconciler` and
peers on `react ^19.0.0`. React Test Renderer was deprecated by React, and RNTL 14 moved off it.

Meanwhile, a project created by `@react-native-community/cli@20.2.0 init` still ships
`react-test-renderer@19.2.3` and `@types/react-test-renderer` in `devDependencies`, and its
generated `__tests__/App.test.tsx` uses them. So a fresh 0.87 project that adds RNTL 14 ends up
with both renderers installed and an unmet peer warning for the one RNTL actually wants.

A working install:

:::tabs
@tab npm
```bash
npm install --save-dev @testing-library/react-native@14.0.1 test-renderer
```
@tab yarn
```bash
yarn add --dev @testing-library/react-native@14.0.1 test-renderer
```
@tab pnpm
```bash
pnpm add -D @testing-library/react-native@14.0.1 test-renderer
```
:::

Then remove the renderer you are no longer using, along with its types and the generated test that
imports it:

```bash
npm uninstall react-test-renderer @types/react-test-renderer
rm __tests__/App.test.tsx   # replace it with an RNTL test, below
```

Verify the peer is satisfied rather than assuming:

```bash
npm ls test-renderer @testing-library/react-native
npm view @testing-library/react-native@14.0.1 peerDependencies
```

> [!WARNING] Symptoms of getting this wrong
> If `test-renderer` is missing, `render()` fails at import time with a module-not-found error
> naming `test-renderer` — not a helpful message about renderers. If you leave
> `react-test-renderer` installed *and* keep the template's `App.test.tsx`, the suite still passes,
> which hides the fact that you now maintain two renderers.

RNTL 14 depends on `jest-matcher-utils` and `pretty-format` directly and ships its own matchers, so
there is no separate matcher package to install and nothing extra to add to `setupFilesAfterEnv`.

## Basic example

The component under test — this compiles against the real 0.87 types:

```tsx title=src/components/LoginForm.tsx
import {useState} from 'react';
import {View, Text, TextInput, Pressable, StyleSheet} from 'react-native';

type Props = {
  onSubmit: (email: string) => void;
};

export function LoginForm({onSubmit}: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    // The decision this component makes is the thing worth asserting.
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setError(null);
    onSubmit(email);
  }

  return (
    <View style={styles.root}>
      <Text nativeID="emailLabel">Email</Text>
      <TextInput
        accessibilityLabel="Email"
        accessibilityLabelledBy="emailLabel"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      {error === null ? null : <Text accessibilityRole="alert">{error}</Text>}
      <Pressable accessibilityRole="button" onPress={submit}>
        <Text>Sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 8, padding: 16},
});
```

The test:

```tsx-fragment title=src/components/__tests__/LoginForm.test.tsx
import {render, screen, userEvent} from '@testing-library/react-native';
import {LoginForm} from '../LoginForm';

test('rejects an address with no @ and does not submit', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Email'), 'nope');
  await user.press(screen.getByRole('button', {name: 'Sign in'}));

  // Query by what the user perceives, not by component type.
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits a valid address', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.press(screen.getByRole('button', {name: 'Sign in'}));

  expect(onSubmit).toHaveBeenCalledWith('ada@example.com');
  expect(screen.queryByRole('alert')).toBeNull();
});
```

## How it works

`render()` mounts your element with `test-renderer` and returns a handle; `screen` is a
module-level reference to the most recently rendered tree, so you rarely need the return value.
Cleanup between tests is automatic.

Queries come in three prefixes, and the prefix is a statement about intent:

| Prefix | Missing element | Use it when |
| --- | --- | --- |
| `getBy*` | throws immediately | The element must already be there. |
| `queryBy*` | returns `null` | You are asserting absence. |
| `findBy*` | returns a promise that retries, then rejects | The element appears after an async update. |

`getAllBy*` / `queryAllBy*` / `findAllBy*` are the plural forms, and they throw if exactly one match
is not what you wanted.

Prefer queries in this order, because the order matches how discoverable the element is to a real
user and to assistive technology:

1. `getByRole(role, {name})` — role plus accessible name.
2. `getByLabelText` — the accessibility label.
3. `getByText` — visible text.
4. `getByPlaceholderText`, `getByDisplayValue` — inputs with no better handle.
5. `getByTestId` — last resort, and a sign the component has no accessible handle.

`userEvent.setup()` returns an interaction object whose methods (`press`, `type`, `scrollTo`) fire
the same sequence of events the real component would receive, including focus and key events for
typing. `fireEvent` still exists and dispatches a single event directly. Prefer `userEvent`: a
component that only works when a lone `onChangeText` is fired is a component that will not work
under a real keyboard.

Every `userEvent` method returns a promise. Forgetting to `await` is the single most common cause
of a test that passes locally and fails on a slower CI runner.

## Common patterns

### Waiting for something asynchronous

```tsx-fragment title=Waiting correctly
import {render, screen} from '@testing-library/react-native';
import {ProfileScreen} from '../ProfileScreen';

test('shows the name once the request resolves', async () => {
  render(<ProfileScreen userId="42" />);

  // findBy* retries until the element exists or the timeout elapses.
  expect(await screen.findByText('Ada Lovelace')).toBeOnTheScreen();

  // The spinner should be gone by then. queryBy* is how you assert absence.
  expect(screen.queryByLabelText('Loading')).toBeNull();
});
```

### Rendering inside the providers the component needs

A component that reads a navigation context or a query client will throw without one. Wrap once
rather than in every test:

```tsx-fragment title=test/renderWithProviders.tsx
import type {ReactElement, ReactNode} from 'react';
import {render} from '@testing-library/react-native';
import {NavigationContainer} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

function Providers({children}: {children: ReactNode}) {
  // A fresh client per render keeps one test's cache out of the next test.
  const client = new QueryClient({
    defaultOptions: {queries: {retry: false, gcTime: 0}},
  });
  return (
    <QueryClientProvider client={client}>
      <NavigationContainer>{children}</NavigationContainer>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, {wrapper: Providers});
}
```

### Asserting on a list without asserting on every row

```tsx-fragment title=Lists
import {render, screen} from '@testing-library/react-native';
import {OrderList} from '../OrderList';

test('renders a row per order', () => {
  render(<OrderList orders={[{id: 'a'}, {id: 'b'}, {id: 'c'}]} />);

  // FlatList virtualises, so asserting "all three are mounted" is asserting an
  // implementation detail of the windowing maths. Assert the first page instead.
  expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  expect(screen.getByText('Order a')).toBeOnTheScreen();
});
```

## Platform differences

RNTL runs entirely in Node and needs neither a simulator nor macOS, so the suite is identical on
macOS, Linux and Windows.

What does differ is which platform's code you are testing. The Jest preset defaults to resolving
`.ios` files, so a component with an `.android.tsx` variant is never exercised unless you configure
a second Jest project. See [Jest Setup](jest-setup.md).

## Performance considerations

- **`findBy*` is a retry loop.** Each call polls until it succeeds or times out. A test that uses
  `findBy*` for something already present pays the first poll interval for nothing; use `getBy*`.
- **Build providers per test, not per file.** A shared `QueryClient` leaks cached data between
  tests and produces order-dependent failures that cost far more time than they save.
- **`debug()` prints the whole tree.** Useful once, expensive in a loop, and never worth leaving in
  a committed test.
- **Do not render a whole navigator to test one screen.** Mounting the navigation tree pulls in
  every screen module. Render the screen component and supply its params directly.

## Common mistakes

- **Installing `react-test-renderer` and expecting RNTL 14 to use it.** Wrong:
  `npm i -D react-test-renderer`. Right: `npm i -D test-renderer`. RNTL 14's peer is the
  `test-renderer` package; the similarly named React package is deprecated and is not the same
  thing.
- **Not awaiting `userEvent`.** Wrong: `user.press(button); expect(onPress).toHaveBeenCalled();`.
  Right: `await user.press(button);`. Without the await the assertion frequently runs before React
  has committed, which shows up as a flaky CI failure rather than a local one.
- **Using `getBy*` to assert absence.** Wrong: `expect(() => screen.getByText('Error')).toThrow()`.
  Right: `expect(screen.queryByText('Error')).toBeNull()`. The `getBy*` form throws a query error
  whose message describes the whole tree, which is noise, not a failure explanation.
- **Querying by test ID first.** Wrong: `getByTestId('submit-btn')`. Right:
  `getByRole('button', {name: 'Sign in'})`. A test ID passes even when the control has no
  accessible name, which means a screen-reader user cannot use the control and the test cannot
  tell you.
- **Believing a rendered element is a visible element.** Layout does not run under Jest. A view
  with `height: 0`, `opacity: 0` or a covering modal is still "rendered". If visibility is the
  thing you care about, assert it end to end.
- **Testing a component that makes no decisions.** A test that only re-states the JSX has to be
  rewritten every time the JSX is, and it has never once caught a bug.

## Related topics

- [Jest Setup](jest-setup.md) — the preset and configuration RNTL runs on top of.
- [Mocking Native Modules](mocking-native-modules.md) — what to do when the component under test imports a native module.
- [Snapshot Testing](snapshot-testing.md) — why query-based assertions usually beat snapshots.
- [End-to-End with Detox or Maestro](end-to-end.md) — the layer that can assert on real pixels.
- [Accessibility APIs](../platform-apis/accessibility.md) — roles and labels are both an accessibility feature and your test handles.
- [CI for Mobile](ci-for-mobile.md) — running the suite on a hosted runner.
