---
title: Background Tasks
description: Running deferrable JavaScript work in the background with expo-background-task and expo-task-manager in Expo SDK 57 — defining and registering tasks, what WorkManager and BGTaskScheduler actually promise, testing, and why a scheduled task is a request, not a guarantee.
status: current
toolchain: expo
sdk: 57
---

`expo-background-task` asks the operating system to run a piece of your JavaScript periodically while the
app is in the background — on Android through WorkManager, on iOS through `BGTaskScheduler`. The task
itself is defined with `expo-task-manager`, which is also the mechanism behind background location and
geofencing.

```bash
npx expo install expo-background-task expo-task-manager
```

That resolves `expo-background-task@~57.0.17` and `expo-task-manager@~57.0.17` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

> [!WARNING] A scheduled task is a request, not a promise
> Registering a background task tells the OS "please run this at some point, no more often than every N
> minutes". The OS decides whether and when. It weighs battery level, network availability, whether the
> device is charging and how often the user opens your app. A task can run hours late, run rarely, or not
> run at all — and on both platforms it stops entirely if the user force-quits the app. Design every
> feature so that it still works when the task never ran.

## Why it exists / when to use it — and when NOT to

Use it for **opportunistic, deferrable** work where "sometime in the next few hours" is fine:

- Pre-fetching content so the next launch is fast.
- Uploading queued analytics or logs.
- Syncing a local [SQLite](sqlite.md) database with the server.
- Cleaning up caches.

Do **not** use it for:

- **Anything time-critical or exact.** Reminders at 9:00 belong in a scheduled
  [local notification](notifications.md). Server-side events belong in a push notification.
- **Continuous work.** Tracking a run or playing music needs a foreground service / background mode of its
  own: see [Location](location.md) and [Audio and Video](audio-and-video.md).
- **Guaranteeing data reaches the server.** Also sync on app launch and on foreground; the background task is
  a bonus.
- **Long computation.** The OS gives the task a limited window and can stop it at any time.

> [!DEPRECATED] expo-background-fetch
> `expo-background-fetch` still appears in the SDK 57 bundled module map (`~57.0.17`), but Expo's
> documentation marks it as being replaced by `expo-background-task`, not receiving patches, and due to be
> removed in an upcoming release. Use `expo-background-task` for new code and migrate existing tasks.

## Expo Go vs development build

**Included in Expo Go, but test real behaviour in a development build on a physical device.**

The Expo documentation lists `expo-background-task` as included in Expo Go. Two limits matter more than
that:

- **The Background Tasks API is unavailable on iOS simulators.** It only works on a physical iOS device.
- **Scheduling behaviour depends on your app's `Info.plist`** (`UIBackgroundModes` and
  `BGTaskSchedulerPermittedIdentifiers`) and on the OS's view of *your* app's usage. Expo Go is a different
  app with a different history, so its timing tells you nothing about production. Use a
  [development build](../expo-development-builds/why-you-need-one.md).

## Basic example

```ts title=tasks/sync.ts
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const SYNC_TASK = 'background-sync';

// 1. Define at MODULE SCOPE, and import this file from your app's entry point.
//    When the OS wakes the app for a background task, no component is
//    mounted. A task defined inside a component or effect does not exist.
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const response = await fetch('https://api.example.com/sync', {method: 'POST'});
    return response.ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// 2. Register, from app code, once the user has opted in or on launch.
export async function registerSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    // The OS or the user has disabled background work for this app.
    return;
  }
  if (!(await TaskManager.isTaskRegisteredAsync(SYNC_TASK))) {
    // A MINIMUM interval, in minutes. The OS treats it as a floor, not a schedule.
    await BackgroundTask.registerTaskAsync(SYNC_TASK, {minimumInterval: 60});
  }
}
```

```tsx-fragment title=app/_layout.tsx
// Importing for its side effect: defineTask runs at bundle load, before any
// component, which is exactly when a headless background launch needs it.
import '../tasks/sync';

import {Stack} from 'expo-router';
import {useEffect} from 'react';
import {registerSync} from '../tasks/sync';

export default function RootLayout() {
  useEffect(() => {
    void registerSync();
  }, []);
  return <Stack />;
}
```

## How it works

### Defining vs registering

These are two separate steps, and confusing them is the most common bug:

| Step | API | Where | Persists |
| --- | --- | --- | --- |
| **Define** what the task does | `TaskManager.defineTask(name, executor)` | Module scope, on every bundle load | No — it is code |
| **Register** it with the OS | `BackgroundTask.registerTaskAsync(name, options?)` | App code, typically once | Yes — survives restarts |

Registration is stored persistently and restored when the app initialises. If a registered task's name has no
definition when the OS runs it, nothing happens.

### `expo-background-task` API

| Function | Behaviour |
| --- | --- |
| `getStatusAsync()` | `BackgroundTaskStatus.Available` (2) or `Restricted` (1). Always `Restricted` on web. |
| `registerTaskAsync(taskName, {minimumInterval?})` | Registers a defined task. `minimumInterval` is in **minutes**. |
| `unregisterTaskAsync(taskName)` | Stops the OS from running it. |
| `triggerTaskWorkerForTestingAsync()` | Runs registered tasks now. **Debug builds only.** |
| `addExpirationListener(listener)` | iOS: called when the system is about to stop the task. Returns `{remove}`. |

The executor should resolve `BackgroundTaskResult.Success` (1) or `BackgroundTaskResult.Failed` (2).

`minimumInterval` defaults to **12 hours**. The minimum is **15 minutes** — WorkManager's own floor on
Android. On iOS, the installed type documentation notes that short intervals are often ignored and the
system typically runs tasks in specific windows, such as overnight.

### `expo-task-manager` API

| Function | Behaviour |
| --- | --- |
| `defineTask<T>(taskName, executor)` | Defines the task. Executor receives `{data, error, executionInfo}`. |
| `isTaskDefined(taskName)` | Synchronous. |
| `isTaskRegisteredAsync(taskName)` | Whether it is registered with the OS. |
| `getRegisteredTasksAsync()` | All registered tasks, including location and geofencing tasks. |
| `unregisterTaskAsync(taskName)` / `unregisterAllTasksAsync()` | Unregister. |
| `isAvailableAsync()` | Whether TaskManager is available on this platform. |

`executionInfo` carries `taskName`, `eventId` and, when known, `appState` (`'active'`, `'background'`,
`'inactive'`).

### What each OS does

:::tabs
@tab iOS

`expo-background-task` submits a `BGProcessingTask` request to `BGTaskScheduler`.

- The system chooses when to run it, considering battery, network and the user's usage patterns.
- Tasks often run when the device is idle and charging — frequently overnight.
- The system can interrupt the task at any time. `addExpirationListener` gives you a chance to save state;
  the task runner is rescheduled automatically.
- If the user swipes the app away in the app switcher, it is fully terminated and background tasks stop until
  the app is opened again.
- Low Power Mode and the **Background App Refresh** setting can prevent tasks from running at all.
- Not available on the iOS Simulator.

@tab Android

`expo-background-task` enqueues periodic work with WorkManager.

- The minimum periodic interval is 15 minutes; the actual interval is usually longer.
- WorkManager honours Doze, App Standby Buckets and battery optimisation. A rarely-opened app is placed in a
  lower bucket and runs far less often.
- Some manufacturers add aggressive battery management that delays or kills background work beyond stock
  Android behaviour.
- If the user force-stops the app from system settings, scheduled work does not run until the app is launched
  again.
:::

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": ["expo-background-task"]
  }
}
```

The `expo-background-task` plugin has no options. It writes to `Info.plist`:

- `UIBackgroundModes` gains `processing`.
- `BGTaskSchedulerPermittedIdentifiers` gains `com.expo.modules.backgroundtask.processing`.

`BGTaskScheduler` refuses to schedule an identifier that is not listed in
`BGTaskSchedulerPermittedIdentifiers`, so the task silently never runs without the plugin. If you hand-edit
`Info.plist` or run a CNG project without the plugin entry, check both keys.

`expo-task-manager` has its own plugin, which adds `fetch` to `UIBackgroundModes`. No usage-description
string is required for background tasks.

Only declare background modes you use: App Review asks about unused ones.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": ["expo-background-task"]
  }
}
```

The plugin makes no Android changes. WorkManager needs no runtime permission, and the package's manifest adds
none. `expo-task-manager`'s library manifest contributes the service and receiver it uses to run tasks; those
are merged automatically.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Scheduler | `BGTaskScheduler` (`BGProcessingTask`) | WorkManager periodic work |
| Minimum interval | Treated as a hint; often ignored for short values | 15 minutes |
| Typical real timing | Idle windows, often overnight | Varies with standby bucket and battery optimisation |
| User kills the app | Swipe-away stops tasks until relaunch | Force stop stops tasks until relaunch |
| Simulator / emulator | **Not supported** on the iOS Simulator | Works on an emulator |
| Expiration callback | `addExpirationListener` | Not available |
| Testing trigger | `triggerTaskWorkerForTestingAsync()` invokes `BGTaskScheduler` | `triggerTaskWorkerForTestingAsync()` runs tasks directly |

## Common patterns

### A testing button in debug builds

```tsx title=components/DebugBackgroundTask.tsx
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import {useEffect, useState} from 'react';
import {Button, Text, View} from 'react-native';

// In a real app, import this from the module that calls defineTask.
const SYNC_TASK = 'background-sync';

export function DebugBackgroundTask() {
  const [registered, setRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    TaskManager.isTaskRegisteredAsync(SYNC_TASK).then(setRegistered);
  }, []);

  if (!__DEV__) {
    // triggerTaskWorkerForTestingAsync only works in debug builds.
    return null;
  }

  return (
    <View>
      <Text>{`Registered: ${String(registered)}`}</Text>
      <Button
        title="Run background tasks now"
        onPress={() => BackgroundTask.triggerTaskWorkerForTestingAsync()}
      />
    </View>
  );
}
```

On Android you can also inspect scheduled work with `adb shell dumpsys jobscheduler`. There is no reliable way to
reproduce production scheduling in a test — you can only confirm that the task is registered and that it works
when it runs.

### Record when the task last ran

Because you cannot predict execution, measure it: have the executor write a timestamp (to
[SQLite](sqlite.md) or the file system), and surface "last synced" in your UI and your telemetry. That is how you
find out how often the OS actually runs your task for real users.

### Keep the work small and idempotent

The OS may stop the task mid-way and run it again later. Process a bounded batch, commit progress as you go, and
make every step safe to repeat.

## Performance considerations

- **Keep tasks short.** The OS gives a limited window and penalises apps that use a lot of background time.
- **Do not wake the network for nothing.** Check whether there is work before making requests.
- **Choose the longest `minimumInterval` that serves the feature.** Frequent tasks cost battery and push the app
  into stricter scheduling buckets.
- **Avoid loading your whole app in the task path.** Keep the task module's imports minimal; a headless launch
  still evaluates everything it imports.

## Security considerations

**Threat.** A background task runs without the user watching and often with the device locked. Two things go
wrong: the task needs credentials that are unreadable while locked, and the app quietly keeps doing work — often
network requests with user data — the user believes stopped when they signed out.

**Exploit.** A user signs out, but the registered sync task persists across restarts and keeps posting the last
cached data with a still-valid refresh token. On iOS, a token stored with the default `WHEN_UNLOCKED`
accessibility makes the task fail every night while the phone is locked, so developers "fix" it by switching to the
deprecated `ALWAYS` accessibility, which removes lock-state protection entirely.

**Fix.**

- **Unregister on sign-out** with `BackgroundTask.unregisterTaskAsync(SYNC_TASK)`, and clear the credentials the
  task would use.
- For tokens a background task must read, use `expo-secure-store` with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` —
  readable after the first unlock since boot, never migrated to another device — not `ALWAYS`. See
  [Secure Store](secure-store.md).
- Send only what the server needs, over HTTPS, and treat a failed background request as normal.

**Verification.** Sign out, then call `TaskManager.getRegisteredTasksAsync()` and confirm the sync task is not in the
list. Then run `BackgroundTask.triggerTaskWorkerForTestingAsync()` in a debug build and confirm (with your server logs
or a network proxy) that no request is sent.

## Common mistakes

- **Expecting the task to run on schedule.** The interval is a minimum, and the OS decides. Design for "never ran".
- **Defining the task inside a component.** It does not exist during a headless launch. Define at module scope and
  import the file from the entry point.
- **Registering before defining.** Import the task module before calling `registerTaskAsync`.
- **Testing on the iOS Simulator.** The API is unavailable there; use a physical device.
- **Judging timing in Expo Go or with the debugger attached.** Real scheduling depends on your built app and its usage.
- **Setting `minimumInterval` below 15.** Android's floor is 15 minutes.
- **Forgetting the plugin.** Without `BGTaskSchedulerPermittedIdentifiers`, iOS never runs the task.
- **Not unregistering on sign-out.** Registration persists across restarts.
- **Using `ALWAYS` keychain accessibility so the task can read a token.** Use `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`.
- **Using a background task for a reminder.** Schedule a local notification instead.
- **Starting new work with `expo-background-fetch`.** Use `expo-background-task`.

## Related topics

- [Notifications](notifications.md) — for anything that must happen at a specific time.
- [Location](location.md) — background location and geofencing, also built on TaskManager.
- [SQLite](sqlite.md) — storing what the task syncs and when it last ran.
- [Secure Store](secure-store.md) — keychain accessibility for tokens read in the background.
- [Audio and Video](audio-and-video.md) — continuous background playback, which is a different mechanism.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — testing real background behaviour.
