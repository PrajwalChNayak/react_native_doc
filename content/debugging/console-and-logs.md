---
title: Console and Logs
description: Where console output actually goes in 0.87 — the DevTools console, LogBox, adb logcat and the iOS device console — and what changed for unhandled promise rejections.
status: current
toolchain: cli
---

`console.log` is the first debugging tool anyone reaches for, and in React Native it is also the one
with the most surprising plumbing. The same call can land in four different places depending on how
the app was built and what is attached to it, and in 0.87 one of those places — the Metro terminal —
is off by default.

This page is about where output goes, which log surface answers which question, and the
behavioural change in 0.82 that made rejected promises loud.

## Why it exists / when to use it — and when NOT to

A log line is the cheapest possible instrument. It survives a reload, it works on a physical device
with no cable attached, and it costs nothing to add. That is genuinely useful for questions of the
form "did this code run, and with what".

It is the wrong tool for three things:

- **"What is the value of this right now."** The [React Native DevTools](react-native-devtools.md)
  console evaluates expressions against the live runtime. Reading state there beats adding a log and
  reloading.
- **"Why is this slow."** Timing with logs measures the logging as well. See
  [The Profiler and React Native DevTools](../performance/profiling.md).
- **"What did the app do before it crashed in the field."** Device logs are not collected for you.
  That is [Crash Reporting](crash-reporting.md).

And there is one hard rule that belongs at the top rather than the bottom: **`console.*` calls are
not removed from a release build.** Everything you log ships, runs, and writes to the platform log
on a user's device. [Safe Logging in Release Builds](../security/safe-logging.md) is the page that
deals with that properly.

## Basic example

The console methods React Native's polyfill provides are `log`, `info`, `warn`, `error`, `debug`,
`trace`, `table`, `group`, `groupCollapsed` and `groupEnd`. `warn` and `error` are special: they
also feed LogBox.

```ts title=src/screens/cartLogging.ts
import {Platform} from 'react-native';

type CartLine = {sku: string; quantity: number};

export function describeCart(lines: CartLine[]): void {
  // `table` renders as a real table in the DevTools console and degrades to a
  // plain dump in the platform log, so it is safe to use either way.
  console.table(lines);

  // Grouping keeps a multi-line dump readable when several screens log at once.
  console.group('cart');
  console.log('platform', Platform.OS);
  console.log('lines', lines.length);
  console.groupEnd();
}
```

> [!NOTE] `console.time` is not part of the polyfill
> React Native's console does not declare `time` / `timeEnd`. Measure with `Date.now()` deltas, a
> `Systrace` region, or the Performance panel — see
> [The Profiler and React Native DevTools](../performance/profiling.md).

## How it works

### The four destinations

| Destination | When it receives output | Notes |
| --- | --- | --- |
| **DevTools Console panel** | Debugger attached | Full objects, expandable, evaluable. The richest view. |
| **LogBox overlay** | Development build, on `console.warn` / `console.error` | On-device, no cable, no debugger. |
| **Platform log** (`logcat` / device console) | **Always**, including release builds | Plain text. This is the one that leaks. |
| **Metro terminal** | Only with `--client-logs` | Off by default in 0.87, and deprecated. |

The first three are independent. A `console.error` in a development build with the debugger attached
appears in all three at once, which is why the same message can look like it fired three times.

### Metro no longer streams your logs

The CLI's `start` command declares a `--client-logs` option. Its default is `false`, and its own
description marks it deprecated and slated for removal:

```bash
# Plain-text JS log streaming in the Metro terminal. Deprecated; off by default.
npm start -- --client-logs
```

If you are following an older tutorial that says "your logs appear in the terminal where you ran
`npm start`", this is why they do not. The replacement is the DevTools Console panel, which shows
structured objects rather than a stringified approximation of them.

### LogBox

`LogBox` is the on-device overlay: a yellow box for warnings, a red box for errors, with a stack
trace resolved through the source map. It is a **development-only** surface — it is not installed in
a release build, so a red box can never be something a user sees.

It is also the reason a noisy third-party library can make an app unusable in development. The
escape hatch is a pattern list:

```ts title=src/logbox.ts
import {LogBox} from 'react-native';

/**
 * Silence only the specific warnings you have read, understood and decided to
 * live with. A pattern here is a promise that you checked.
 */
LogBox.ignoreLogs([
  'Require cycle:',
  /Non-serializable values were found in the navigation state/,
]);
```

Patterns are `string | RegExp`; a string matches as a substring. There is also
`LogBox.ignoreAllLogs()`, which turns the overlay off entirely — useful for a demo or a screenshot
run, and a bad default, because it hides the next real error too.

> [!WARNING] Ignoring a log does not fix it
> `ignoreLogs` removes the overlay. The underlying `console.warn` still runs, still costs whatever
> building its message costs, and still writes to the platform log. Fix the cause; use the list for
> warnings you cannot fix because they come from a dependency.

### Unhandled promise rejections raise `console.error` — since 0.82

This is the change most worth knowing about, because it inverts an old failure mode.

Before 0.82, a promise that rejected with nothing attached to catch it was **silently swallowed**. A
failed `await` inside a `useEffect` with no `try` / `catch` produced no output at all. The
symptom was a screen that stayed on its loading state forever with a completely clean log, and the
standard advice was to install a rejection-tracking polyfill.

Since 0.82 an unhandled rejection raises `console.error`. Concretely, that means it now reaches
LogBox as a red box in development, the platform log in every build, and any crash reporter that
hooks `console.error`.

```tsx title=src/screens/ProfileScreen.tsx
import * as React from 'react';
import {Text} from 'react-native';

type Profile = {name: string};

async function loadProfile(): Promise<Profile> {
  const response = await fetch('https://api.example.com/profile');
  if (!response.ok) {
    // Before 0.82 this rejection vanished if nothing caught it. Now it surfaces
    // as a console.error — which is an improvement, and not a substitute for
    // handling it.
    throw new Error(`profile request failed: ${response.status}`);
  }
  return (await response.json()) as Profile;
}

export function ProfileScreen(): React.ReactNode {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadProfile().then(
      (value) => {
        if (!cancelled) {
          setProfile(value);
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Text>Could not load your profile.</Text>;
  }
  return <Text>{profile?.name ?? 'Loading'}</Text>;
}
```

Two consequences to plan for:

- **Upgrading to 0.82 or later can make an app look newly broken.** Errors that were always
  happening now print. They are not new; they are newly visible. Read them before you silence them.
- **A rejection reaching `console.error` is not the same as being handled.** The component above
  still needs its rejection callback. See [Error Boundaries](error-boundaries.md) for what catches
  what.

### What survives into a release build

| Thing | In a release build |
| --- | --- |
| `console.log` and friends | **Run**, and write to the platform log |
| LogBox overlay | Not installed |
| DevTools console | Not available — there is no debugger to attach |
| `__DEV__` branches | Removed at build time by constant folding |

That first row is the one people get wrong. If you want logging gone from release, you have to
remove it — with `__DEV__` guards, a Babel transform, or both. The mechanics are in
[Safe Logging in Release Builds](../security/safe-logging.md).

## Platform differences

The platform log is the only surface that differs, and it is the only one available on a release
build.

:::tabs
@tab Android

JavaScript console output is written under the `ReactNativeJS` tag.

```bash
# Just the JavaScript logs, all levels.
adb logcat -s ReactNativeJS:V

# Everything from one app, which also catches native module output.
adb logcat --pid="$(adb shell pidof -s com.example.app)"

# Crashes and fatal exceptions only.
adb logcat -b crash

# Clear the buffer first so you are reading only what you just reproduced.
adb logcat -c
```

With more than one device attached, `adb -s <serial> logcat` picks one; `adb devices` lists the
serials.

The ring buffer is finite. A chatty app overwrites its own history in seconds, so clear, reproduce,
then read — in that order.

@tab iOS

There is no `logcat`. The unified logging system is the equivalent, and `console.*` output appears
in it as messages from your process.

```bash
# Stream from an attached device.
log stream --device --predicate 'processImagePath CONTAINS "YourApp"'

# Simulator: no --device flag needed.
xcrun simctl spawn booted log stream --predicate 'processImagePath CONTAINS "YourApp"'

# Read back from a captured archive rather than live.
log show --archive sysdiagnose.logarchive --predicate 'eventMessage CONTAINS "cart"'
```

Console.app on macOS shows the same stream with a search field, which is usually easier than
building a predicate. Select the device in its sidebar and filter by process.

Xcode's console shows the same output when you run the app from Xcode, which is the fastest route
when you are already building there.

:::

## Common patterns

### Log an identifier, look the rest up

`console.log('order', order)` prints a structure you then read by eye. `console.log('order', order.id)`
gives you something to grep for in the server log, the crash report and the network panel. The
second is almost always the more useful line, and it is the one that does not leak a customer
address into `logcat`.

### One logger, not scattered `console` calls

Route everything through a single module. That gives you one place to add a `__DEV__` guard, one
place to redact, one place to swap in a crash reporter's breadcrumb API, and one lint rule
(`no-console`) that keeps it true. The implementation is in
[Safe Logging in Release Builds](../security/safe-logging.md).

### Clear, reproduce, read

Applies to both platforms. `adb logcat -c` or a fresh `log stream` before you reproduce means the
output you read is the output you caused.

### Use `console.error` deliberately

`console.error` is not a louder `console.log`. It triggers a LogBox red box in development, and many
crash reporters treat it as a reportable event. Use it for conditions you would want to know about
in production, and `console.warn` or a dev-only log for everything else.

### Keep `ignoreLogs` patterns narrow and commented

A pattern like `'Require cycle:'` silences a whole class. Write down which dependency it belongs to
and revisit it at upgrade time, or it will still be there hiding a real problem two years later.

## Performance considerations

- **Arguments are evaluated even when nothing reads them.** `console.log(JSON.stringify(bigState))`
  serialises the object on every call regardless of whether a debugger is attached. Put the
  `__DEV__` guard around the call site, not inside a helper.
- **Logging inside `renderItem` is a measurable cost.** A log per row in a list runs per row, per
  render, and the platform log write is synchronous.
- **The DevTools console retains what you log.** Logging large objects in a tight loop grows the
  frontend's retained set and can make the panel unresponsive. That is the tooling, not your app.
- **Attaching the debugger changes timing.** Never compare a timing taken with DevTools open against
  one taken without it.

## Security considerations

**Threat.** The platform log is readable by anyone with the device and a cable, and it is captured
wholesale into bug reports and sysdiagnoses that users are routinely asked to send.

**Exploit.** On a release build, with the app signed in:

```bash
adb logcat -c
# Sign in on the device, then:
adb logcat -d | grep -iE 'bearer |eyJ|refresh_token|password|"email"'
```

Anything that matches is recoverable by anyone who can attach to that device.

**Fix.** Guard development logging behind `__DEV__`, strip `console.*` at build time as a backstop,
log identifiers rather than payloads, and audit what your crash reporter captures automatically.

**Verification.** Re-run the command above against a release build and confirm nothing matches, then
confirm the strip actually ran by counting `console.log` occurrences in the shipped bundle. Both
procedures are written out in [Safe Logging in Release Builds](../security/safe-logging.md).

## Common mistakes

- **Expecting logs in the Metro terminal.** Wrong: running `npm start` and waiting for output.
  Right: streaming is off by default and deprecated in 0.87 — use the DevTools Console panel, or opt
  in with `--client-logs` if you genuinely need plain text.
- **Assuming release builds drop `console.*`.** Wrong: leaving logs in because "they only run in
  development". Right: they run, and they write to the device log.
- **Treating a newly visible rejection as a new bug.** Wrong: reverting an upgrade because errors
  appeared. Right: unhandled rejections raise `console.error` since 0.82 — those failures were
  already happening silently.
- **Believing `console.error` on a rejection means it is handled.** Wrong: seeing the log and moving
  on. Right: the promise still rejected and no state was updated; attach a rejection handler.
- **`LogBox.ignoreAllLogs()` as a default.** Wrong: silencing the overlay to get a clean screen.
  Right: ignore specific patterns you have read; the next red box is the one you needed.
- **Logging whole objects.** Wrong: `console.log(response)`. Right: log the status and a request id;
  the object contains headers, and headers contain tokens.
- **Reading `logcat` without clearing it.** Wrong: scrolling back hoping to find your line. Right:
  `adb logcat -c`, reproduce, then read.
- **Using `console.log` to time things.** Wrong: two logs and a subtraction. Right: the Performance
  panel, or a `Systrace` region — the logging itself is part of what you measured.
- **Reaching for `console.time`.** Wrong: assuming the web console API in full. Right: React
  Native's polyfill does not provide it.

## Related topics

- [React Native DevTools](react-native-devtools.md) — the Console panel and evaluating against live state.
- [Error Boundaries](error-boundaries.md) — what catches an error that a log only reports.
- [Crash Reporting](crash-reporting.md) — collecting what device logs cannot give you from the field.
- [Native Crash Logs](native-crash-logs.md) — reading the platform log when the crash is below JavaScript.
- [Safe Logging in Release Builds](../security/safe-logging.md) — guarding, stripping and redacting.
- [Source Maps](source-maps.md) — why a LogBox stack trace shows your original files.
- [The Profiler and React Native DevTools](../performance/profiling.md) — measuring instead of timing with logs.
- [Dev Menu and Fast Refresh](../getting-started/dev-menu-and-fast-refresh.md) — the on-device surfaces around LogBox.
