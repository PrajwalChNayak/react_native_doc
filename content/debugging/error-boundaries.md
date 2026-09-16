---
title: Error Boundaries
description: What a React error boundary actually catches — and the much longer list of what it does not — plus the global JavaScript handler and what a production fallback should do.
status: current
toolchain: cli
---

An error boundary is a React component that catches an error thrown while rendering its subtree and
renders a fallback instead of unmounting the whole app. Without one, a single thrown error in one
component tears down the entire React tree and leaves the user looking at a blank screen.

That is a real and worthwhile protection. It is also much narrower than most people assume, and the
gap between what boundaries catch and what people think they catch is where a lot of bad error
handling lives.

## Why it exists / when to use it — and when NOT to

React's recovery model is all-or-nothing by default: if rendering throws and nothing catches it,
React unmounts the tree rather than leaving a half-rendered UI on screen. On the web that shows a
blank page; in a native app it shows a blank screen inside your chrome, which looks like a freeze.

A boundary converts that into a bounded failure: this screen is broken, the rest of the app is not.

**What an error boundary catches:**

- Errors thrown during **rendering** anywhere in its subtree.
- Errors thrown in **lifecycle methods** of class components below it.
- Errors thrown in **constructors** below it.
- Errors thrown **synchronously in the body of an effect**, because effects run as part of the
  commit React is already inside.

**What an error boundary does NOT catch:**

| Not caught | Why | What to use instead |
| --- | --- | --- |
| **Event handlers** | An `onPress` runs outside React's rendering work | `try` / `catch` in the handler |
| **Asynchronous code** | `setTimeout`, `await`, a `.then` callback — the stack has left React | `try` / `catch` around the `await`, or a rejection handler |
| **Rejected promises** | Same reason. Since 0.82 these raise `console.error`, which is visibility, not handling | Handle the rejection; put the failure in state |
| **Errors thrown by the boundary itself** | It cannot catch its own render | A boundary above it, kept trivially simple |
| **Native crashes** | A signal in native code is not a JavaScript exception; the process is gone | [Native Crash Logs](native-crash-logs.md) |
| **Native module errors surfaced as rejections** | They arrive as rejected promises | Handle the rejection |
| **Errors during the initial render of the boundary's own parent** | Outside its subtree | A boundary higher up |

> [!WARNING] "Async errors" is the one that bites
> The overwhelming majority of errors in a real app come from data fetching, and **none of them
> reach an error boundary**. If your only error handling is a root boundary, your app is unprotected
> against its most common failure mode. Put failed requests into component state and render from
> that.

**When not to use one:** as a substitute for handling a specific, expected failure. A boundary is
for the errors you did not anticipate. A 404 from your API is not an unanticipated error — render an
empty state for it.

## Basic example

There is no hook form. An error boundary must be a class component, because
`getDerivedStateFromError` and `componentDidCatch` have no hook equivalents in React 19.

```tsx title=src/components/ErrorBoundary.tsx
import * as React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

type Props = {
  children: React.ReactNode;
  /** Reported to your crash reporter so you know which boundary tripped. */
  name: string;
  /** Changing any value here remounts the subtree — see "resetting" below. */
  resetKeys?: ReadonlyArray<unknown>;
};

type State = {error: Error | null};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};

  /**
   * Runs during the render phase. It may only compute state — no logging, no
   * network calls, no side effects of any kind.
   */
  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  /**
   * Runs during the commit phase, which is where side effects belong. This is
   * the hook for reporting, and the only place the component stack is
   * available.
   */
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportBoundaryError(this.props.name, error, info.componentStack ?? undefined);
  }

  componentDidUpdate(prev: Props): void {
    // Clear the error when the caller says the inputs changed, so the user is
    // not stuck on the fallback after navigating somewhere else.
    if (this.state.error !== null && !sameKeys(prev.resetKeys, this.props.resetKeys)) {
      this.setState({error: null});
    }
  }

  private readonly retry = (): void => {
    this.setState({error: null});
  };

  render(): React.ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This part of the app could not be displayed. You can try again, or go back and continue.
        </Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

function sameKeys(a?: ReadonlyArray<unknown>, b?: ReadonlyArray<unknown>): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined || a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => Object.is(value, b[index]));
}

/** Replace the body with your crash reporter's call. */
function reportBoundaryError(name: string, error: Error, componentStack?: string): void {
  if (__DEV__) {
    console.error(`[boundary:${name}]`, error, componentStack);
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12},
  title: {fontSize: 18, fontWeight: '600'},
  body: {textAlign: 'center', opacity: 0.8},
  button: {paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1},
  buttonLabel: {fontWeight: '600'},
});
```

Two details that matter and are easy to get wrong:

- **`getDerivedStateFromError` is a render-phase method.** Putting your crash-reporter call there
  means it runs during a phase React may replay. Report from `componentDidCatch`.
- **`info.componentStack` is typed as possibly `null`.** It is the most useful thing in the whole
  callback — the React tree path to the component that threw — so guard it rather than assuming it.

## How it works

### Where to put boundaries

One boundary at the root is the minimum and the worst version of this. It turns every error into
"the whole app is broken", which is exactly the outcome you were trying to avoid.

A boundary per screen, plus one around each independently failing region, gives you graceful
degradation:

```tsx title=src/screens/HomeScreen.tsx
import * as React from 'react';
import {ScrollView} from 'react-native';

/** The component defined above, imported in a real project. */
declare const ErrorBoundary: React.ComponentType<{
  children: React.ReactNode;
  name: string;
  resetKeys?: ReadonlyArray<unknown>;
}>;

declare function Header(): React.ReactNode;
declare function RecommendationCarousel(): React.ReactNode;
declare function OrderList(): React.ReactNode;

export function HomeScreen(): React.ReactNode {
  return (
    <ScrollView>
      <Header />
      {/*
        The carousel is nice to have. If its data shape changes under us, the
        user should still see their orders rather than an error screen.
      */}
      <ErrorBoundary name="home/recommendations">
        <RecommendationCarousel />
      </ErrorBoundary>
      <ErrorBoundary name="home/orders">
        <OrderList />
      </ErrorBoundary>
    </ScrollView>
  );
}
```

A useful rule: **put a boundary wherever you would accept a degraded screen instead of a broken
one.** If the answer is "nowhere on this screen", one boundary around the screen is right.

If you use React Navigation, the natural placement is around each screen component, so a broken
screen leaves the navigator, the header and the tab bar intact and the user can navigate away. See
[React Navigation Fundamentals](../navigation/fundamentals.md).

### Resetting, and the retry loop trap

A fallback with a "Try again" button that only clears the boundary's state re-renders the same
component with the same props and the same broken data. It throws again immediately, and the user
taps a button that appears to do nothing.

Retry has to change something. Two workable patterns:

1. **Remount the subtree** by changing a `key`, so the children rebuild from scratch.
2. **Reset the state that caused the failure** — refetch the query, clear the cache entry, drop the
   corrupt persisted value — and then clear the boundary.

```tsx title=src/screens/OrdersScreen.tsx
import * as React from 'react';

declare const ErrorBoundary: React.ComponentType<{
  children: React.ReactNode;
  name: string;
  resetKeys?: ReadonlyArray<unknown>;
}>;

declare function OrderList(props: {attempt: number}): React.ReactNode;

export function OrdersScreen(): React.ReactNode {
  const [attempt, setAttempt] = React.useState(0);

  return (
    // Both the key and resetKeys change together: the subtree is rebuilt and
    // the boundary clears its error at the same time.
    <ErrorBoundary key={attempt} name="orders" resetKeys={[attempt]}>
      <OrderList attempt={attempt} />
    </ErrorBoundary>
  );
}
```

Also cap it. A boundary that retries automatically and unconditionally against a permanently broken
response is a battery-draining render loop. Count attempts and show a terminal fallback after two or
three.

### The global JavaScript error handler

React Native installs a global handler for errors that escape everything else. You can replace it
through the `ErrorUtils` global:

```ts title=src/errors/globalHandler.ts
import 'react-native';

/**
 * Install once, as early as possible — at the top of index.js, before the app
 * registers. Errors thrown before this runs are handled by the default handler.
 */
export function installGlobalErrorHandler(): void {
  const previous = ErrorUtils.getGlobalHandler();

  // `isFatal` is declared optional in the type, so treat a missing value as
  // non-fatal rather than annotating it as a required boolean.
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const normalised = error instanceof Error ? error : new Error(String(error));
    report(normalised, isFatal === true);

    // Always chain. The default handler is what shows the LogBox red box in
    // development and what produces the crash in release. Replacing it without
    // calling it turns fatal errors into silent no-ops, which is far worse than
    // a crash you can see.
    previous(error, isFatal);
  });
}

declare function report(error: Error, isFatal: boolean): void;
```

Be honest about what this gives you, because it is widely oversold:

- **It is a last resort, not a recovery mechanism.** By the time it runs, the error has already
  escaped every boundary and every `try`. There is no safe way to continue.
- **`isFatal` distinguishes the two cases.** A fatal error means the runtime cannot continue; a
  non-fatal one is a reported error that did not stop execution.
- **It does not catch native crashes.** Nothing in JavaScript does.
- **It does not catch unhandled promise rejections.** Those raise `console.error` (since 0.82) and
  do not pass through this handler.
- **Not chaining is a real bug.** A handler that swallows without calling the previous one removes
  LogBox in development and can leave a release build in an undefined state rather than crashing
  cleanly. Crashing cleanly is better: it produces a report.

Its legitimate job is to attach one final report before the app goes down, and then get out of the
way. That report is the subject of [Crash Reporting](crash-reporting.md).

### Unhandled rejections, precisely

Since React Native 0.82, a promise that rejects with no handler attached raises `console.error`.
That is a genuine improvement over the previous behaviour, where such rejections were silently
swallowed and a stuck loading spinner was your only clue.

What it is not:

- It is **not** caught by an error boundary.
- It does **not** go through `ErrorUtils`.
- It does **not** put your component into an error state, update any UI, or retry anything.

So the visible symptom is unchanged — the spinner still spins — but now there is a red box in
development and a line in the device log. Treat it as a diagnostic, and handle the rejection
properly:

```tsx title=src/screens/SettingsScreen.tsx
import * as React from 'react';
import {Text} from 'react-native';

declare function loadSettings(): Promise<{theme: string}>;

type Status =
  | {kind: 'loading'}
  | {kind: 'ready'; theme: string}
  | {kind: 'failed'; message: string};

export function SettingsScreen(): React.ReactNode {
  const [status, setStatus] = React.useState<Status>({kind: 'loading'});

  React.useEffect(() => {
    let cancelled = false;
    // The try/catch is what an error boundary cannot do for you. Without it,
    // this rejects, console.error fires, and the screen stays on 'loading'
    // forever.
    (async () => {
      try {
        const settings = await loadSettings();
        if (!cancelled) {
          setStatus({kind: 'ready', theme: settings.theme});
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setStatus({kind: 'failed', message: 'Settings could not be loaded.'});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  switch (status.kind) {
    case 'loading':
      return <Text>Loading</Text>;
    case 'failed':
      return <Text>{status.message}</Text>;
    case 'ready':
      return <Text>{status.theme}</Text>;
  }
}
```

The general rule: **an error boundary handles "this component cannot render"; your code handles
"this operation failed".** They are different problems and only one of them has a React feature.

### What a production fallback should do

A fallback is a user-facing screen that appears at the worst moment. Design it as one.

| Do | Do not |
| --- | --- |
| Say what is broken, in the app's voice | Show the error message or stack trace |
| Offer an action that can actually succeed — retry, go back, go home | Offer a dead "Try again" that re-renders the same failure |
| Report the error, with enough context to find it | Report the user's data along with it |
| Keep navigation usable so the user is not trapped | Replace the whole app chrome |
| Preserve unsaved work where you can | Silently discard a half-completed form |
| Look like your app | Look like a system error dialog |

Two more that are easy to miss:

- **Different fallbacks in development and release.** In development, showing `error.message` on
  screen saves you a trip to the logs. In release, a stack trace is both meaningless to the user and
  an information leak — gate it on `__DEV__`.
- **The fallback must not be able to throw.** Keep it to static text, one or two buttons and
  styles. No data access, no formatting of the failed value, no third-party components. A fallback
  that throws takes down the boundary above it, and then you are back to a blank screen.

## Platform differences

Error boundaries are pure React and behave identically on both platforms. The difference appears
only in what happens when an error escapes everything:

- **In development**, either platform shows the LogBox red box with a symbolicated stack.
- **In release**, an escaped fatal JavaScript error ends the process. Android reports it through the
  platform's crash pipeline; iOS produces a crash report. Either way it is a crash in your store
  console, and the JavaScript stack in it is only readable if you kept the source map. See
  [Reading a Release Stack Trace](release-stack-traces.md).

## Common patterns

### One boundary per screen, plus one per optional region

Cheap, and it converts "the app is broken" into "one card is missing".

### Report from `componentDidCatch`, render from `getDerivedStateFromError`

The split exists because the render phase has no side effects. Keeping to it also means your
reporting is not duplicated when React replays a render.

### Use the boundary name in the report

`componentDidCatch` gives you the component stack, but a boundary identifier tells you immediately
which region failed and how many users hit it. It is the difference between a crash report you can
triage and one you have to investigate.

### Pair every boundary with a state machine for async failure

A discriminated union of `loading | ready | failed`, as in the settings example above, covers the
failures boundaries cannot. Most "error boundary does not work" reports are this gap.

### Test the fallback

It is a screen, so test it like one: render a child that throws and assert the fallback appears.
This is also the only way to find out that your fallback itself throws.

```tsx-fragment title=src/components/ErrorBoundary.test.tsx
import * as React from 'react';
import {Text} from 'react-native';
import {render, screen} from '@testing-library/react-native';
import {ErrorBoundary} from './ErrorBoundary';

function Exploding(): React.ReactNode {
  throw new Error('boom');
}

test('renders the fallback instead of unmounting the tree', () => {
  render(
    <ErrorBoundary name="test">
      <Exploding />
    </ErrorBoundary>,
  );

  expect(screen.getByText('Something went wrong')).toBeTruthy();
});

test('renders children when nothing throws', () => {
  render(
    <ErrorBoundary name="test">
      <Text>fine</Text>
    </ErrorBoundary>,
  );

  expect(screen.getByText('fine')).toBeTruthy();
});
```

React logs the caught error to the console during the test. That is expected, not a failing test.

## Performance considerations

- **A boundary costs nothing when nothing throws.** It is an ordinary component; adding several per
  screen is not a performance decision.
- **Automatic retry without a cap is the expensive failure.** A boundary that resets and immediately
  re-throws renders in a loop and drains the battery. Count attempts.
- **Do not do work in `getDerivedStateFromError`.** It runs during rendering, and anything expensive
  there runs while the UI is already in a bad state.
- **Remounting via `key` rebuilds the whole subtree.** That is the point, and on a heavy screen it
  is a visible cost — use it deliberately rather than as the default reset.

## Common mistakes

- **Expecting a boundary to catch a failed request.** Wrong: wrapping a screen and calling error
  handling done. Right: async failures never reach a boundary — put them in component state.
- **Expecting a boundary to catch an `onPress` error.** Wrong: assuming React wraps event handlers.
  Right: `try` / `catch` inside the handler.
- **Treating the 0.82 `console.error` on a rejection as handling.** Wrong: seeing the red box and
  moving on. Right: the promise still rejected and nothing updated the UI.
- **Reporting from `getDerivedStateFromError`.** Wrong: side effects in the render phase. Right:
  report from `componentDidCatch`.
- **A single root boundary.** Wrong: one boundary for the whole app. Right: per screen and per
  optional region, so a failure degrades instead of replacing everything.
- **A "Try again" button that only clears the error.** Wrong: re-rendering the same broken input.
  Right: change a `key`, refetch, or clear the bad state — then clear the boundary.
- **Retrying without a limit.** Wrong: automatic reset on every error. Right: cap the attempts and
  show a terminal fallback.
- **Showing the stack trace to users.** Wrong: `<Text>{error.stack}</Text>` in release. Right: a
  plain message; gate diagnostics on `__DEV__`.
- **A fallback that can throw.** Wrong: formatting the failed data in the fallback. Right: static
  text and a button — it is the last thing standing.
- **Replacing the global handler without chaining.** Wrong: `ErrorUtils.setGlobalHandler(myHandler)`
  with nothing else. Right: capture `getGlobalHandler()` first and call it, or you lose LogBox and
  turn fatal errors into silence.
- **Expecting the global handler to catch native crashes.** Wrong: assuming full coverage from
  JavaScript. Right: a native signal never reaches the JavaScript runtime.

## Related topics

- [Crash Reporting](crash-reporting.md) — where the errors a boundary catches should end up.
- [Console and Logs](console-and-logs.md) — the 0.82 unhandled-rejection change in context.
- [Native Crash Logs](native-crash-logs.md) — the failures no JavaScript handler can see.
- [Reading a Release Stack Trace](release-stack-traces.md) — making a reported error readable.
- [React Native DevTools](react-native-devtools.md) — breaking on the throw rather than reading about it.
- [React Navigation Fundamentals](../navigation/fundamentals.md) — where per-screen boundaries fit.
- [Data Fetching and Caching](../state-and-data/data-fetching.md) — the layer that owns async failure.
- [React Native Testing Library](../testing/testing-library.md) — testing the fallback like any other screen.
