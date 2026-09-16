---
title: Background Tasks
description: What the OS actually lets a backgrounded app do, why the Community CLI has no first-party background API, and what doing it properly with BGTaskScheduler and WorkManager involves.
status: current
allow-banned: interaction-manager
toolchain: cli
---

There is no JavaScript API in React Native for "run this code later, in the background". There
is no scheduler, no periodic task, no first-party wrapper around either platform's mechanism.
That absence is not an oversight — it reflects the fact that both operating systems treat
background execution as something the **system** schedules, not something the app requests.

This page is about setting expectations correctly first, and then showing what the real
mechanisms are and where the boundary with native code falls.

## What "background" actually means

The word covers four different situations, and most confusion comes from treating them as one.

| Situation | What runs | Duration |
| --- | --- | --- |
| App visible | Everything | Unbounded |
| App backgrounded, not suspended | Briefly, then nothing | Seconds |
| App suspended | Nothing at all. Timers do not fire | — |
| OS-scheduled wake-up | A native entry point the OS calls | ~30 seconds |

The third row is the one that surprises people. **A suspended app runs no JavaScript.** Your
`setInterval` does not fire. A pending promise does not settle. A `fetch` in flight is not
resumed. The JavaScript context is frozen, and when the app returns to the foreground it
resumes mid-tick as though no time passed — which is why `Date.now()` jumps.

The fourth row is the only real background execution, and it is entirely native: the OS calls
into your app at a time **it** chooses, gives you a short window, and expects you to report
completion.

> [!NOTE] `requestIdleCallback` is not this
> 0.87 replaced `InteractionManager` with the `requestIdleCallback` global. That schedules work
> during idle frames **while your app is running**. It has nothing to do with background
> execution and does not fire when the app is suspended.

## What core does give you

Two things, and it is worth knowing exactly what each is.

### `AppState` — knowing which situation you are in

```tsx title=src/background/useAppStateTransition.ts
import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import type {AppStateStatus} from 'react-native';

export function useAppStateTransition(onForeground: (awaySeconds: number) => void): void {
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        leftAt.current = Date.now();
        return;
      }
      if (next === 'active' && leftAt.current != null) {
        // Reconcile on return. This is the pattern that replaces most of what
        // people want background tasks for: nothing ran while you were away,
        // so find out what changed and catch up.
        onForeground((Date.now() - leftAt.current) / 1000);
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [onForeground]);
}
```

`AppStateStatus` is `'active' | 'background' | 'inactive' | 'extension' | 'unknown'`. `'inactive'`
is the iOS in-between state — the app switcher, an incoming call, a system dialog.

**Reconciling on foreground solves most problems people bring to this page.** "Sync the user's
data periodically" almost always becomes "sync when they open the app, and show them how stale
it was" — which is cheaper, more reliable, and works identically on both platforms.

### Headless JS — Android only, and it needs native code

`AppRegistry.registerHeadlessTask` is real in 0.87 and is the only core primitive for running
JavaScript without a UI. It is Android-only: iOS has no equivalent, because iOS has no concept
of a background service your app can start.

```ts title=index.js — registering a headless task
import {AppRegistry} from 'react-native';

// The key must match the taskKey the native service passes.
AppRegistry.registerHeadlessTask('SyncTask', () => async (data: unknown) => {
  // Runs with no UI, in its own short-lived JS context. Do one thing and return.
  // Anything that touches the view tree or navigation will fail here.
  console.log('headless sync', data);
});
```

There is also `registerCancellableHeadlessTask(taskKey, taskProvider, taskCancelProvider)` for
tasks that need to abort cleanly.

Registering the JavaScript side does nothing on its own. Something native has to start the task,
and that something is a `Service` you write:

```kotlin title=android/app/src/main/java/com/awesomeproject/SyncTaskService.kt
package com.awesomeproject

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class SyncTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(
      // taskKey: must match AppRegistry.registerHeadlessTask
      "SyncTask",
      // data: passed to the JS task as its argument
      Arguments.createMap(),
      // timeout in ms: the React instance is torn down after this regardless.
      // A safeguard against keeping the device awake because JS hung.
      30_000,
      // isAllowedInForeground: leave false. The task shares the JS thread with
      // your UI, so running it in the foreground degrades the app.
      false,
    )
}
```

```xml title=android/app/src/main/AndroidManifest.xml
<service
  android:name=".SyncTaskService"
  android:exported="false" />
```

Note what this does **not** give you: a schedule. Headless JS is a way to run JavaScript when
something native starts the service. Deciding *when* is WorkManager's job, below.

## Native configuration

:::tabs
@tab iOS

iOS background work goes through **`BGTaskScheduler`**. Every task identifier must be declared
in `Info.plist` before it can be registered, and the matching background mode must be enabled.

```xml title=ios/AwesomeProject/Info.plist
<key>UIBackgroundModes</key>
<array>
  <!-- Short, opportunistic refresh windows. -->
  <string>fetch</string>
  <!-- Longer maintenance work, typically while charging overnight. -->
  <string>processing</string>
  <!-- Only if a server sends content-available (silent) pushes. -->
  <string>remote-notification</string>
</array>

<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.awesomeproject.refresh</string>
  <string>com.awesomeproject.cleanup</string>
</array>
```

Registration must happen **before** the app finishes launching, every launch, for every
identifier:

```swift title=ios/AwesomeProject/AppDelegate.swift — registration sketch
import BackgroundTasks

// In application(_:didFinishLaunchingWithOptions:), before returning.
BGTaskScheduler.shared.register(
  forTaskWithIdentifier: "com.awesomeproject.refresh",
  using: nil
) { task in
  guard let refresh = task as? BGAppRefreshTask else { return }

  // Always set this. If the OS reclaims the window you must clean up, or the
  // system penalises your app's future scheduling.
  refresh.expirationHandler = { /* cancel in-flight work */ }

  // …do the work, then report truthfully…
  refresh.setTaskCompleted(success: true)
}

// Submitting a request. earliestBeginDate is a hint, not a schedule.
let request = BGAppRefreshTaskRequest(identifier: "com.awesomeproject.refresh")
request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
try? BGTaskScheduler.shared.submit(request)
```

Constraints that are not negotiable:

- **The OS decides when.** `earliestBeginDate` says "not before this"; it does not say "at this".
  A task may run in ten minutes, in a day, or never.
- **Roughly 30 seconds** for a `BGAppRefreshTask`. `BGProcessingTask` gets more, but only under
  conditions the OS picks — typically charging and on Wi-Fi.
- **A task must be re-submitted** after each run. There is no repeating schedule.
- **Background App Refresh can be off.** The user can disable it globally or per app, and then
  none of this runs at all. This is not detectable as an error; your task simply never fires.
- **Frequency adapts to usage.** iOS learns when the user opens your app and schedules around
  that. An app opened once a month gets almost nothing.

@tab Android

Android background work goes through **`WorkManager`** (`androidx.work`), which is the single
supported answer across API levels and which survives process death and reboots.

```gradle title=android/app/build.gradle
dependencies {
  implementation "androidx.work:work-runtime-ktx:2.10.0"
}
```

```kotlin title=android/app/src/main/java/com/awesomeproject/SyncScheduler.kt
import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

fun schedulePeriodicSync(context: Context) {
  val request = PeriodicWorkRequestBuilder<SyncWorker>(
    // 15 minutes is the platform minimum for a periodic request. Asking for
    // less is silently clamped up to 15.
    15, TimeUnit.MINUTES,
  )
    .setConstraints(
      Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresBatteryNotLow(true)
        .build(),
    )
    .build()

  WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "sync",
    // KEEP means a re-schedule on every app start does not reset the timer.
    ExistingPeriodicWorkPolicy.KEEP,
    request,
  )
}
```

Permissions, for the cases that need them:

```xml title=android/app/src/main/AndroidManifest.xml
<!-- Re-schedule work after the device reboots. -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Only for work the user must see running: a download, a workout, a call. -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ requires a specific type alongside the general permission. -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<!-- Only for work that must fire at a precise time. Special-access, reviewed. -->
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

Constraints that are not negotiable:

- **15 minutes is the minimum periodic interval.** A shorter request is clamped.
- **Doze and App Standby** defer work for an idle device. Your interval is a floor, not a
  schedule.
- **Vendor battery managers** on several popular ROMs kill background work outright for apps the
  user has not exempted. This is not fixable in code, and it is why "it works on my Pixel" is not
  a test result.
- A `WorkRequest` that must run *now* and visibly needs a **foreground service** with a
  notification, plus the type-specific permission from Android 14.

:::

## Doing it properly means native code

Put the two halves together and the architecture is the same on both platforms:

1. A **native scheduler** — `BGTaskScheduler` or `WorkManager` — that the OS drives.
2. A **native worker** that does the work, or starts a JavaScript context to do it.
3. A **TurboModule** so your JavaScript can submit requests and read results.

There is no way to skip step 1 or step 2. A JavaScript timer is not a background task, and no
library can make it one — libraries in this space are wrappers around exactly these native
mechanisms, with exactly the same constraints.

If you are going to write that module, the end-to-end path — spec file, Codegen, Kotlin, Swift,
registration, autolinking, typed call site — is in
[TurboModules End to End](../native-modules/turbomodules-end-to-end.md). A background scheduler
is a good first real TurboModule, because the JavaScript surface is small: schedule, cancel,
query.

> [!WARNING] Evaluate any background library on these terms
> This handbook does not name a background-task package, because the ones in circulation vary
> widely in whether they have shipped Codegen support. If you evaluate one, check for
> `codegenConfig` in its `package.json` and a `TurboModuleRegistry` spec in its source before you
> depend on it — the method in
> [Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Common patterns that avoid the problem

Most background requirements dissolve under a slightly different design.

### Reconcile on foreground

Instead of syncing every 15 minutes, sync when the app opens and show staleness. The user only
ever sees data while the app is open, so work done while it is closed is only valuable if it
must be *ready instantly* — which is a much narrower requirement than it first appears.

### Let the server push

A silent push (`content-available` on iOS, a data message on Android) lets the server say "there
is something new". This inverts the polling and costs no battery while nothing is happening. It
is still not guaranteed delivery — reconcile on foreground as well — but it is far more
effective than periodic polling. See
[Push and Local Notifications](notifications.md).

### Schedule a local notification instead of a task

If the goal is to tell the user something at a time you can compute now, you do not need to run
code then. Schedule a local notification with a trigger and let the OS deliver it. No background
execution, no battery cost, no reliability problem.

### Finish the work before you are suspended

For the narrow case of "the upload must survive the user backgrounding the app", both platforms
have a **background transfer** mechanism: `URLSession` background configuration on iOS and
WorkManager on Android. The OS continues the transfer and wakes you when it is done. That is a
different thing from running your code in the background, and it is far more reliable. See
[File System](file-system.md) for the download side of this.

## Performance considerations

- **Battery is the budget.** Both platforms measure how much your background work costs and
  schedule you less when it costs more. An expensive task gets run less often, which is exactly
  the opposite of what you wanted.
- **Do one thing per window.** With ~30 seconds on iOS, a task that syncs three subsystems will
  be killed halfway through the second one, and a killed task counts against you.
- **Report completion honestly.** `setTaskCompleted(success:)` and WorkManager's `Result` feed
  the scheduler's model of your app. Reporting success for work that failed makes the schedule
  worse.
- **Headless JS shares the JS thread** when `isAllowedInForeground` is true. Leave it false.
- **Never hold a wake lock you do not need.** It is the fastest way to make a user uninstall.

## Security considerations

**Threat.** Background work runs when the user is not watching and cannot intervene. The
specific risks: it runs while the device is locked, so it must not need or expose decrypted
secrets; it is a network client nobody is observing, so a compromised endpoint has a quiet
channel; and on Android a `Service` or `BroadcastReceiver` that is exported can be started by
any other app on the device.

**Exploit.** An exported component is the concrete one. If your manifest declares the service
without `android:exported="false"`, any app can start it:

```bash
# Any app, or anyone with adb, can trigger the task.
adb shell am startservice -n com.awesomeproject/.SyncTaskService
adb shell dumpsys package com.awesomeproject | grep -A 3 "Service"
```

The second risk is credentials. A background task needs a token to call your API, so the token
must be readable **without the user present**. That rules out biometric-gated storage and means
the item's accessibility class has to be permissive — `AFTER_FIRST_UNLOCK` rather than
`WHEN_UNLOCKED`, on iOS.

**Fix.**

1. **Mark every background component `android:exported="false"`** unless another app genuinely
   must start it, and then require a signature-level permission.
2. **Use a narrowly-scoped credential.** A refresh token that can only call the one sync endpoint
   is a much smaller loss than a full session token. Do not use a biometric-gated item for
   background work — it cannot be read, and working around that by caching the unlocked value
   destroys the protection entirely. See [Biometrics](biometrics.md).
3. **Do not decrypt more than the task needs**, and do not write intermediate plaintext to disk
   where it will still be there when the task ends.
4. **Log nothing sensitive.** Background failures are exactly what people add verbose logging to
   diagnose, and that logging ships. See [Safe Logging](../security/safe-logging.md).

**Verification.** Enumerate what your app exports and confirm nothing background-related is
reachable:

```bash
# Every exported component in the installed app.
adb shell dumpsys package com.awesomeproject | grep -B 2 "exported=true"
```

Then trigger the task by hand and inspect what it left behind:

```bash
adb shell am startservice -n com.awesomeproject/.SyncTaskService
adb shell run-as com.awesomeproject find . -type f -newermt '-2 minutes'
```

Anything sensitive in that file list is a finding. On iOS, use the Xcode debugger's
`Simulate Background Fetch` and then download the app container to do the same inspection.

## Common mistakes

- **Expecting `setInterval` to fire.** Wrong: a 5-minute polling timer and a bug report that it
  stops. Right: a suspended app runs no JavaScript at all. Nothing in JS can schedule background
  work.
- **Treating `earliestBeginDate` as a schedule.** Wrong: "run in 15 minutes". Right: "not before
  15 minutes, and possibly never". iOS decides, based on how the user uses your app.
- **Asking WorkManager for a 1-minute period.** Wrong: `PeriodicWorkRequestBuilder(1, MINUTES)`.
  Right: 15 minutes is the floor; anything smaller is silently clamped.
- **Registering a headless task and expecting it to run.** Wrong: `registerHeadlessTask` in
  `index.js` and nothing else. Right: it is inert until a native `Service` starts it, and iOS has
  no equivalent at all.
- **Testing only on a Pixel.** Wrong: concluding background sync works. Right: several popular
  vendor ROMs kill it entirely. Test on the devices your users actually have.
- **Exporting the service.** Wrong: omitting `android:exported="false"`. Right: any other app can
  start an exported service, at any time, with any intent.
- **Doing too much in one window.** Wrong: a full multi-endpoint sync in a `BGAppRefreshTask`.
  Right: one bounded unit of work, completed and reported inside ~30 seconds.
- **Shipping a background feature with no foreground path.** Wrong: data that is only correct if
  the background task ran. Right: reconcile on foreground regardless; background work is an
  optimisation, never a guarantee.

## Related topics

- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — writing the native module a real background scheduler needs.
- [Background Refresh](../state-and-data/background-refresh.md) — the data-layer view of the same problem.
- [App Lifecycle](../state-and-data/app-lifecycle.md) — `AppState` and what each transition means.
- [Push and Local Notifications](notifications.md) — silent push as the alternative to polling.
- [When You Need Native Code](../native-modules/when-you-need-native-code.md) — deciding whether to cross the boundary.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — evaluating any library in this space.
