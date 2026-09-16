---
title: App Lifecycle and AppState
description: The AppState status union in 0.87, what each platform actually does when your app is backgrounded, when to save state, and what replaced InteractionManager.
status: current
allow-banned: interaction-manager
toolchain: cli
---

A web page is either loaded or gone. A mobile app is neither: it is foregrounded, transitioning,
backgrounded, suspended, or killed without warning — and the transitions between those are where a
surprising share of mobile bugs live. Unsaved drafts, timers that never stop, sockets that stay
open, stale data presented as current, `Date.now()` jumping forward by an hour.

`AppState` is the only lifecycle API React Native gives you, and it is smaller than people expect.
This page is about what it reports, what it does not, and what each platform actually does behind
it.

## Why it exists / when to use it — and when NOT to

Use `AppState` for things that must react to the app leaving or returning: pausing a camera or a
location watch, closing a websocket, persisting a draft, refreshing data that is now stale,
re-checking authentication, clearing a sensitive screen before it is snapshotted.

Do **not** use it as a navigation lifecycle. A screen that is not visible because the user pushed
another one on top of it is still `active`; React Navigation's `useFocusEffect` is the tool for
that, and the distinction is covered in
[Hooks in a Native Context](hooks-in-react-native.md#mounted-is-not-the-same-as-visible).

And do not use it as a background scheduler. Nothing you register here runs while the app is
suspended.

| Need | Tool |
| --- | --- |
| App went to the background / came back | `AppState` |
| This screen became visible / hidden | `useFocusEffect` from React Navigation |
| Defer non-urgent work until the JS thread is idle | The `requestIdleCallback` global |
| Run code while the app is closed | Not possible from JavaScript — see [Background Refresh](background-refresh.md) |
| The device lost connectivity | NetInfo — see [Offline-First](offline-first.md) |

## The status union, exactly

Read from the installed `types_generated/Libraries/AppState/AppState.d.ts`:

```ts-fragment
export type AppStateStatus =
  | 'inactive'
  | 'background'
  | 'active'
  | 'extension'
  | 'unknown';
```

Five members, and the last two are the ones nobody handles.

| Status | Means | Where you see it |
| --- | --- | --- |
| `active` | Running in the foreground, receiving events | Both |
| `background` | In the background: another app, the home screen, or (Android) another Activity including system ones like an autofill picker | Both |
| `inactive` | A transitional state — moving between foreground and background, the multitasking view, Notification Centre, an incoming call | **iOS** (the type carries `@platform ios inactive`) |
| `extension` | The code is running in an app extension, not the app | iOS |
| `unknown` | The platform did not report a state | Both, rarely |

Two more members of the class are worth knowing:

```ts-fragment
declare class AppStateImpl {
  /** The current app state. Can be `null` until the initial value is set. */
  currentState: null | undefined | string;
  isAvailable: boolean;
  addEventListener<K extends AppStateEvent>(type: K, handler): EventSubscription;
}
```

`currentState` is typed **`null | undefined | string`**, not `AppStateStatus`. That is deliberate:
it is `null` before the native module has reported the first value, which on a slow device can be
after your first render. Compare it against a literal (`AppState.currentState === 'active'`) rather
than casting or asserting it — a non-null assertion here crashes on cold start exactly on the
devices you test least.

### The events

```ts-fragment
type AppStateEventDefinitions = {
  change: [AppStateStatus];
  memoryWarning: [];
  blur: [];
  focus: [];
};
```

| Event | Payload | Platform |
| --- | --- | --- |
| `change` | `AppStateStatus` | Both |
| `memoryWarning` | none | Both |
| `focus` / `blur` | none | **Android** (the type carries `@platform android focus, blur`) |

`focus` and `blur` track **window focus**, not process state. They fire when a system dialog, the
notification shade or a permission prompt takes focus while your app is still in the foreground —
which is a real distinction on Android and has no iOS analogue.

There is no `resume`, no `pause`, no `willTerminate`, and no "app is about to be killed" event of
any kind. That absence is the single most important fact on this page.

## Basic example

The shape you want almost everywhere: a hook that reports transitions, not raw states, and that
tells you how long the user was away.

```ts title=src/lifecycle/useAppStateTransitions.ts
import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus, EventSubscription} from 'react-native';

export function useAppStateTransitions(handlers: {
  onEnterBackground?: () => void;
  onEnterForeground?: (awayMs: number) => void;
}): void {
  // currentState is `null | undefined | string`, so compare, do not cast.
  const previous = useRef<AppStateStatus>(
    AppState.currentState === 'active' ? 'active' : 'unknown',
  );
  const leftAt = useRef<number | null>(null);

  // Keeping the handlers in a ref means the subscription is created once. An
  // inline object in the dependency array would tear it down every render.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const subscription: EventSubscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        const before = previous.current;
        previous.current = next;

        // Guard on the transition, not the state. On iOS you get
        // active -> inactive -> background, so a naive check on 'background'
        // can fire twice, and a check on 'active' fires when the user merely
        // dismisses Control Centre.
        if (next === 'background' && before !== 'background') {
          leftAt.current = Date.now();
          latest.current.onEnterBackground?.();
          return;
        }

        if (next === 'active' && before !== 'active' && leftAt.current !== null) {
          latest.current.onEnterForeground?.(Date.now() - leftAt.current);
          leftAt.current = null;
        }
      },
    );

    // addEventListener returns an EventSubscription. There is no
    // removeEventListener to call instead.
    return () => subscription.remove();
  }, []);
}
```

## How it works

### There is no "app is closing" callback

You cannot run code when the app is killed. Neither platform guarantees you a callback, and Android
does not even try — the process is killed and that is the end of it. No `beforeunload`, no
`onDestroy` that reaches JavaScript, nothing.

The consequence is the central rule of this page:

> **Save on the way out, not at the end.** Persist on the transition to `inactive` or `background`,
> which is the last moment you are reliably running.

And save **synchronously** if you can. A synchronous MMKV write is on disk when the call returns; an
`await`ed AsyncStorage write may not survive a process kill that arrives a moment later. This is the
strongest practical argument for MMKV in this one role — see
[AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md).

```ts title=src/lifecycle/draftPersistence.ts
import {AppState, Platform} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {createMMKV} from 'react-native-mmkv';

const store = createMMKV({id: 'draft'});

let draft = '';

export function setDraft(next: string): void {
  draft = next;
}

export function installDraftPersistence(): () => void {
  const changeSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    // Include 'inactive': on iOS it is the earliest warning you get, and the
    // user may never come back from it.
    if (next === 'inactive' || next === 'background') {
      // Synchronous. On Android the process can be killed immediately after
      // this callback returns, and an in-flight async write would be lost.
      store.set('draft.body', draft);
    }
  });

  // Android only. `blur` fires when a system dialog or the notification shade
  // takes focus without the app leaving the foreground. On iOS it never fires.
  const blurSub =
    Platform.OS === 'android'
      ? AppState.addEventListener('blur', () => {
          store.set('draft.body', draft);
        })
      : null;

  return () => {
    changeSub.remove();
    blurSub?.remove();
  };
}
```

### Time does not pass, and then it does

While the app is suspended, JavaScript does not run. Your `setInterval` does not fire, a pending
`fetch` does not settle, a promise chain stops mid-link. When the app resumes, execution continues
from exactly where it stopped — and `Date.now()` has jumped forward by however long the user was
away.

That produces a specific family of bugs:

- A countdown timer that shows the wrong time until its next tick.
- A token expiry check that used a `setTimeout` scheduled an hour ago and fires immediately on
  resume, all at once.
- Rate limiting or debouncing measured in timer ticks rather than wall-clock time.
- A burst of queued callbacks arriving in one frame, dropping the first frame after resume.

**Recompute from wall-clock time on resume rather than trusting anything schedule-based.** The
`awayMs` value from the hook above is what you use to decide whether the data on screen is still
worth showing.

### `InteractionManager` is gone

> [!DEPRECATED] Removed in 0.87
> `InteractionManager` — `runAfterInteractions`, `createInteractionHandle`, `clearInteractionHandle`
> — was **removed in React Native 0.87** and is absent from the installed strict type surface.
> Every tutorial that defers work with `InteractionManager.runAfterInteractions(() => …)` predates
> 0.87, and the import is now a type error.

The replacement is the **`requestIdleCallback` global**, set up by React Native's own timers module
(`Libraries/Core/setUpTimers.js` installs `requestIdleCallback` and `cancelIdleCallback`
alongside `setTimeout` and `requestAnimationFrame`).

It is a different shape, and better: instead of "after animations finish", you get "during a frame
that has time left", with the remaining budget handed to you.

```ts title=src/lifecycle/idleQueue.ts
// The global is installed by React Native's runtime but is not in the type
// surface, and the Strict API ships no DOM lib — so declare it. One declaration
// in a `globals.d.ts` serves the whole app.
type IdleDeadline = {
  timeRemaining: () => number;
  didTimeout: boolean;
};

declare function requestIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  options?: {timeout?: number},
): number;

declare function cancelIdleCallback(handle: number): void;

type Event = {name: string; at: number};

const pending: Event[] = [];
let scheduled: number | null = null;

export function trackEvent(event: Event): void {
  pending.push(event);
  if (scheduled !== null) {
    return;
  }

  scheduled = requestIdleCallback(
    (deadline) => {
      scheduled = null;
      // timeRemaining() counts down the spare budget in the current frame.
      // Stop when it runs out and let the next idle period take the rest.
      while (pending.length > 0 && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
        const next = pending.shift();
        if (next !== undefined) {
          void fetch('https://analytics.example.com/e', {
            method: 'POST',
            body: JSON.stringify(next),
          });
        }
      }
    },
    // Without a timeout, a permanently busy JS thread means this never runs.
    // With one, `didTimeout` is true and you are told to run anyway.
    {timeout: 2000},
  );
}

export function cancelPendingFlush(): void {
  if (scheduled !== null) {
    cancelIdleCallback(scheduled);
    scheduled = null;
  }
}
```

One behavioural note, read from `Libraries/Core/Timers/JSTimers.js`: `timeRemaining()` is computed
against a 60 Hz frame duration, so on a 120 Hz display the budget it reports is optimistic. Treat
it as a hint, keep each unit of work small, and check it between units rather than assuming you can
use all of it.

## Platform differences

:::tabs
@tab iOS

**The sequence.** Backgrounding produces `active` → `inactive` → `background`. Returning produces
`background` → `inactive` → `active`. Handle transitions, not states, or your "went to background"
code runs during a pulled-down Control Centre.

**`inactive` is a real, visible state.** The app switcher, Notification Centre, Control Centre, an
incoming call, a system permission dialog, a Face ID prompt. The app is on screen and not `active`,
sometimes for several seconds.

**Suspension follows quickly.** After entering `background`, iOS gives the app a short window —
seconds — and then suspends the process. Suspended means frozen: no JavaScript, no timers, no
network callbacks. There is no notification that it is about to happen.

**The system takes a snapshot** of your UI when you background, for the app switcher. If a screen
shows sensitive content, blank or blur it on `inactive` — by the time you see `background` the
snapshot may already be taken.

**Termination is silent.** iOS kills suspended apps under memory pressure with no callback. To the
app, the next launch is simply a cold start.

`memoryWarning` does fire on iOS, and it is worth handling: drop image caches and non-essential
data rather than being killed.

@tab Android

**The sequence.** Effectively `active` ↔ `background`. `inactive` is documented as an iOS state and
you should not build logic around seeing it here.

**`focus` and `blur` exist here and not on iOS.** They track window focus: a system dialog, the
notification shade, a permission prompt, a split-screen sibling taking focus. The app has not left
the foreground, so `change` does not fire. If you need "the user is no longer interacting",
`blur` is the Android half of that answer.

**`background` covers more.** Another Activity — including transient system ones like an autofill
credential picker — puts you in `background`, so you can be backgrounded and returned within a
second without the user perceiving that they left.

**A backgrounded process keeps running, until it does not.** Android does not suspend on a
schedule; it lets the process run and then kills it when it wants memory, anywhere from seconds to
minutes later. Timers you forgot to clear keep firing for longer here than on iOS, which is why
battery-drain reports come from Android.

**The kill is unannounced and total.** No callback of any kind reaches JavaScript. Additionally,
Android may restore the Activity later with saved instance state while your JavaScript context is
brand new — so navigation state you did not persist yourself is gone. See
[Navigation State Persistence](../navigation/state-persistence.md).

**Vendor battery managers** on several popular ROMs background and kill apps far more aggressively
than stock Android. "It works on my Pixel" is not a test result.

`memoryWarning` fires here too, mapped from the platform's trim-memory callbacks.

:::

## Common patterns

### Refresh on return, if enough time passed

The transition to `active` is the natural moment to reconcile. Gate it on elapsed time so that
dismissing a notification does not trigger a full refresh.

```ts title=src/lifecycle/useRefreshOnReturn.ts
import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';

export function useRefreshOnReturn(refresh: () => void, staleAfterMs = 60_000): void {
  const leftAt = useRef<number | null>(null);
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (next === 'active' && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        // A two-second trip to the notification shade is not a reason to
        // refetch the whole screen.
        if (away > staleAfterMs) {
          latest.current();
        }
      }
    });
    return () => subscription.remove();
  }, [staleAfterMs]);
}
```

In an app already using `@tanstack/react-query`, do not write this per screen — wire the
`focusManager` bridge once and let every query's own staleness rules decide. That is in
[Data Fetching and Caching](data-fetching.md#focus-refetch-appstate-not-window).

### Stop expensive work when you leave

Camera preview, location watching, a websocket, an audio session, a `useFrameCallback` loop. Each
one should be gated on **both** foreground and screen focus. The combined hook is in
[Hooks in a Native Context](hooks-in-react-native.md).

On iOS the work stops anyway a few seconds after backgrounding, because the process suspends. On
Android it does not, and that is where the battery goes.

### Blank sensitive screens before the snapshot

On iOS the system screenshots your UI for the app switcher. Clearing or blurring on `inactive` —
not `background` — is what gets ahead of it.

```tsx-fragment title=Hide content during the transitional state
const state = useAppStateStatus();          // your own hook
const hide = state !== 'active';            // covers 'inactive' and 'background'
return hide ? <BlankCover /> : <AccountDetails />;
```

### Subscribe once, share via context

`AppState.addEventListener` in fifty components is fifty subscriptions and fifty re-renders per
transition. Subscribe once near the root and distribute through context — see
[Context](context.md). `useSyncExternalStore` is the right primitive if you want a store-shaped
version; the pattern is in [Hooks in a Native Context](hooks-in-react-native.md).

## Security considerations

**Threat.** Two things happen when your app leaves the foreground that an attacker can use. iOS
takes a snapshot of the current screen and stores it in the app's container for the app switcher —
so a bank balance, a message thread or a one-time code is written to disk as an image. And the
device may be handed to someone else, or picked up later, while the app is still logged in and
showing whatever was last on screen.

**Exploit.** The snapshot is an ordinary file. On a device you control:

```bash
# iOS simulator: the snapshots live in the app container.
xcrun simctl get_app_container booted com.example.app data
find "$(xcrun simctl get_app_container booted com.example.app data)" -name "*.ktx" -o -name "Snapshots" -type d
```

Open what you find. If the account screen is legible, it is legible to anyone with file access to a
backup or a jailbroken device.

On Android the equivalent is the Recents thumbnail, which is held by the system rather than your
app, but is equally visible to whoever holds the phone.

**Fix.**

1. **Cover sensitive screens on `inactive`** (iOS) and on `blur` / `background` (Android). Render a
   blank or branded cover rather than the content.
2. **On Android, set `FLAG_SECURE`** on the Activity for screens that must never be captured. It
   blocks screenshots and the Recents thumbnail at the platform level. It requires touching native
   code or a small TurboModule — see
   [TurboModules End to End](../native-modules/turbomodules-end-to-end.md).
3. **Lock on return after a timeout.** Use the `awayMs` value: beyond a threshold, require
   re-authentication rather than restoring the previous screen. See
   [Biometrics](../platform-apis/biometrics.md).
4. **Do not hold decrypted secrets across a background transition.** Clear them on the way out and
   re-read from the Keychain or Keystore on return — [Secure Storage](secure-storage.md).

**Verification.** Background the app on a sensitive screen, then open the app switcher and look at
the card. Whatever you can read there is what an attacker can read. Repeat on Android with Recents.
Then confirm the lock: background for longer than your timeout and check that returning demands
authentication rather than showing the previous screen for even one frame.

## Common mistakes

- **Treating `AppState.currentState` as `AppStateStatus`.** It is typed `null | undefined | string`
  because it is `null` until the native module reports. Wrong:
  `AppState.currentState as AppStateStatus`. Right:
  `AppState.currentState === 'active'`.
- **Reacting to states instead of transitions.** On iOS `active` fires when the user dismisses
  Control Centre. Refreshing the whole screen then is wasted work the user did not ask for. Track
  the previous value.
- **Ignoring `inactive`.** Skipping it means your "hide sensitive content" code runs after the iOS
  snapshot was already taken, and your "save the draft" code may never run if the user never
  reaches `background`.
- **Not handling `extension` or `unknown`.** They are in the union, so a `switch` without a default
  is incomplete. Treat both as "not active".
- **Expecting an "app is closing" event.** There is none, on either platform. Persist on the way
  out.
- **Persisting asynchronously on background.** An `await`ed AsyncStorage write can lose the race
  with an Android process kill. Write synchronously.
- **Assuming timers ran while you were away.** They did not on iOS, and they may or may not have on
  Android. Recompute from `Date.now()` on resume.
- **Using `InteractionManager`.** Removed in 0.87 and absent from the type surface. The replacement
  is the `requestIdleCallback` global, and it needs an inline type declaration.
- **Calling `requestIdleCallback` without a `timeout`.** On a permanently busy JS thread the
  callback simply never fires. Pass a timeout and honour `didTimeout`.
- **Forgetting `subscription.remove()`.** `addEventListener` returns an `EventSubscription`; there
  is no `removeEventListener` counterpart, and the leak keeps the component and its closure alive.
- **Subscribing in every component.** One subscription near the root, distributed through context.
- **Using `AppState` where `useFocusEffect` belongs.** A screen buried under three others is still
  `active`. Focus and foreground are different questions.
- **Listening for `focus` / `blur` on iOS.** They are Android-only. Code that depends on them
  silently does nothing on half your users' devices.

## Related topics

- [Hooks in a Native Context](hooks-in-react-native.md) — focus versus foreground, and combining the two.
- [Offline-First](offline-first.md) — what to persist on the way out, and reconciling on return.
- [Background Refresh](background-refresh.md) — why none of this runs while the app is closed.
- [Data Fetching and Caching](data-fetching.md) — the `focusManager` bridge that uses these events.
- [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) — why a synchronous write matters on the way out.
- [Secure Storage](secure-storage.md) — clearing secrets across a background transition.
- [Context](context.md) — subscribing once and sharing the result.
- [Navigation State Persistence](../navigation/state-persistence.md) — restoring where the user was after a kill.
- [Background Tasks](../platform-apis/background-tasks.md) — the platform mechanisms, and why they need native code.
- [Memory](../performance/memory.md) — handling `memoryWarning` before the system kills you.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — the full removal list, including the one named above.
