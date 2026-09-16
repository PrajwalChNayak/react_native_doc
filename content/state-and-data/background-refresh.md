---
title: Background Refresh
description: Keeping data fresh when the app is not in front of the user, and why the answer is usually to reconcile on foreground rather than to run in the background.
status: current
toolchain: cli
---

Background refresh is the problem of having fresh data ready the moment someone opens your app,
without them waiting for a network round trip. It is one of the most requested features and one
of the most commonly over-engineered.

This page is about the **data** question: what to fetch, when, and how to reconcile it. The
**platform** question — what the OS will actually let you execute while suspended — is covered
in [Background Tasks](../platform-apis/background-tasks.md), and the short version is that the
CLI path has no first-party background execution API and doing it properly means native code.

Read that page first if you have not. Almost everyone who asks for background refresh actually
wants what this page describes instead.

## Why it exists / when to use it — and when NOT to

Use a background-refresh strategy when **opening the app cold should not mean staring at a
spinner**: a feed, an inbox, a dashboard, a list of orders.

Do **not** reach for actual background execution when:

- **A foreground reconcile would do.** This covers the overwhelming majority of cases and costs
  you no native code, no entitlements, and no battery complaints. Start here.
- **The data must be current to the second.** Then you want a push, not a poll — the server
  tells the device when something changed. See
  [Push and Local Notifications](../platform-apis/notifications.md).
- **You are trying to sync writes.** That is an outbox problem, not a refresh problem. See
  [Offline-First](offline-first.md).
- **The value is low.** Both platforms ration background execution by how often the user opens
  your app. An app nobody opens gets almost no background time, which means the feature helps
  least exactly where it was supposed to help most.

## Basic example

The pattern that solves most of the problem: refetch when the app comes back to the foreground,
but only if the data is actually stale.

```tsx title=src/hooks/useForegroundRefresh.tsx
import {useCallback, useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

type Options = {
  /** Do not refetch if the last successful fetch was more recent than this. */
  staleAfterMs?: number;
  onRefresh: () => void;
};

export function useForegroundRefresh({staleAfterMs = 60_000, onRefresh}: Options) {
  const lastRefreshed = useRef(Date.now());

  // `AppState.currentState` is typed `null | undefined | string`, NOT
  // `AppStateStatus` — it can be unset before the app has settled into a
  // state. The ref has to admit that, or this does not compile.
  const appState = useRef<AppStateStatus | string | null | undefined>(
    AppState.currentState,
  );

  const markRefreshed = useCallback(() => {
    lastRefreshed.current = Date.now();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      const previous = appState.current;
      const wasBackgrounded = previous === 'background' || previous === 'inactive';
      appState.current = next;

      if (!wasBackgrounded || next !== 'active') return;

      // Coming back after ten seconds is not a reason to refetch. Coming back
      // the next morning is.
      if (Date.now() - lastRefreshed.current < staleAfterMs) return;

      onRefresh();
      markRefreshed();
    });

    return () => subscription.remove();
  }, [staleAfterMs, onRefresh, markRefreshed]);

  return {markRefreshed};
}
```

The staleness check is the part people leave out. Without it, every glance at the app — every
notification shade pull, every app switcher visit — fires a network request.

## How it works

There are three honest strategies, and they are not alternatives to each other so much as
layers.

### 1. Reconcile on foreground (start here)

Fetch when the app becomes active and the cache is stale. Costs nothing, works identically on
both platforms, and needs no native code or permissions.

The only thing it does not give you is data that is already fresh **before** the user opens the
app. In practice a fast request started at launch, with cached data rendered immediately
underneath it, is indistinguishable for most users.

### 2. Render stale data immediately, revalidate behind it

Never block a screen on a network request when you have something to show. Persist the cache,
hydrate it synchronously at launch, render it, and let the refetch replace it when it lands.

This is what makes an app feel instant, and it is far more impactful than any amount of
background execution.

```tsx title=src/query/client.ts
import {QueryClient} from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data straight away; refetch underneath it.
      staleTime: 30_000,
      // Mobile networks fail transiently far more often than desktop ones.
      retry: 3,
      // React Native has no window focus event, so the default focus-refetch
      // does nothing useful here. Wire it to AppState instead — see below.
      refetchOnWindowFocus: false,
    },
  },
});
```

If you use TanStack Query, connect its focus manager to `AppState` once at startup rather than
scattering `AppState` listeners through your screens:

```tsx title=src/query/focus.ts
import {AppState, type AppStateStatus} from 'react-native';
import {focusManager} from '@tanstack/react-query';

export function bindFocusToAppState(): () => void {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    // focusManager drives every query's refetchOnWindowFocus behaviour.
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
```

### 3. Actual background execution (last resort)

Only when the first two genuinely do not suffice. This requires native code on both platforms —
`BGTaskScheduler` on iOS, `WorkManager` on Android — and the OS decides whether your task ever
runs. Neither platform promises a schedule; both weigh battery, network, charging state and how
often the user opens your app.

See [Background Tasks](../platform-apis/background-tasks.md) for what each platform actually
permits, and [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) for the
native module you would need to expose it.

> [!WARNING] There is no first-party background-refresh API in the CLI path
> Core React Native does not ship one. Any solution is native code you write or a third-party
> library. Verify a library supports React Native 0.87 and the New Architecture before
> depending on it — see
> [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Platform differences

:::tabs
@tab iOS

Background App Refresh is a **user-facing setting** that can be switched off per app, and is off
entirely in Low Power Mode. Your task may never run, and you cannot detect the difference
between "not scheduled yet" and "the user disabled it" in a way that helps.

`BGAppRefreshTask` gives you a few tens of seconds. Exceeding it gets your task killed and
counts against you in future scheduling.

When the app is backgrounded you get a short window to finish in-flight work before suspension.
An unfinished network request is simply frozen — it does not fail, it resumes on next launch.

@tab Android

Background execution is governed by Doze, App Standby Buckets and, on many devices, aggressive
vendor battery managers that are more restrictive than stock Android.

`WorkManager` is the supported mechanism. It survives reboots and respects constraints, but the
timing is a request, not a promise — a "15 minute" periodic job is a floor, not a schedule.

Headless JS exists and is Android-only, but it still requires native registration. See
[Background Tasks](../platform-apis/background-tasks.md).

:::

Because the two platforms differ this much in what they will actually execute, **design so that
background refresh is an optimisation, never a correctness requirement**. The app must be
correct when the task never runs, because on a meaningful fraction of devices it never will.

## Common patterns

### Refresh on foreground, with a staleness floor

The `useForegroundRefresh` hook above. The single highest-value pattern on this page.

### Persist and hydrate the cache

Write the cache to storage so a cold launch renders instantly. MMKV is synchronous and therefore
suited to hydration at startup; AsyncStorage is async and will make you wait a frame.

See [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) for the trade-off, and note that neither is
a place for anything sensitive.

### Invalidate rather than refetch everything

On foreground, mark queries stale and let the screens that are actually mounted refetch. Firing
every request in the app on resume is how you get a thundering herd against your own API.

### Let the server decide

A silent push that tells the device "something changed, refetch when convenient" is more
reliable than any client-side schedule, and it costs the battery far less than polling.

## Performance considerations

- **Refetching on every `active` transition is the default mistake.** The app becomes active
  whenever the user dismisses a notification shade or returns from the app switcher. Always gate
  on staleness.
- **Hydrate synchronously if you hydrate at all.** An async read at launch adds a frame of
  blank screen, which is precisely what this whole exercise was meant to avoid.
- **Cap concurrency on resume.** Ten queries invalidating at once on a cold mobile connection is
  slower than three at a time.

## Security considerations

- **A cache is storage.** Anything you persist to make launches fast is readable on a rooted or
  jailbroken device if it is not encrypted. Do not persist tokens, personal data or anything you
  would not want extracted alongside the cache. See
  [Why Secrets in JS Are Readable](../security/secrets-in-the-bundle.md).
- **Refresh with a token that may have expired while suspended.** An app resuming after hours
  will have a stale access token. Refresh it before firing the queued requests, or every one of
  them fails at once and you log the user out for no reason.
- **Do not log refresh payloads.** Background and resume paths are exactly where debug logging
  gets left in, because nobody watches the console at that moment. See
  [Safe Logging in Release Builds](../security/safe-logging.md).

## Common mistakes

- **Assuming a background task will run.** Both platforms treat it as a hint. Building a feature
  that is only correct if the task fires produces bugs you cannot reproduce, on devices you do
  not own.
- **Using `refetchOnWindowFocus` as-is.** There is no window and no focus event in React Native.
  The option does nothing useful until you bind it to `AppState`.
- **Refetching on `inactive`.** On iOS `inactive` fires for a transient interruption — the app
  switcher, an incoming call, a system prompt. Only `active` after a genuine `background` means
  the user came back.
- **Treating `AppState.currentState` as reliable at module scope.** Read it inside the effect.
  At import time the app may not have settled into a state yet.
- **Refetching everything instead of invalidating.** Invalidation lets the screens that are
  mounted decide. A blanket refetch pays for data nobody is looking at.
- **Forgetting to remove the listener.** `AppState.addEventListener` returns a subscription;
  call `.remove()` in the effect cleanup or you accumulate one listener per mount.

## Related topics

- [Background Tasks](../platform-apis/background-tasks.md) — what each platform will actually execute, and the native work required.
- [App Lifecycle and AppState](app-lifecycle.md) — the state machine this page depends on.
- [Data Fetching and Caching](data-fetching.md) — TanStack Query in a native context.
- [Offline-First](offline-first.md) — syncing writes, which is the other half of the problem.
- [AsyncStorage vs MMKV](asyncstorage-vs-mmkv.md) — choosing where a persisted cache lives.
- [Push and Local Notifications](../platform-apis/notifications.md) — letting the server drive the refresh.
