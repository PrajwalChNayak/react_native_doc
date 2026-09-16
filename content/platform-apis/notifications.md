---
title: Push and Local Notifications
description: The honest split between core PushNotificationIOS, Notifee for rich local notifications, and the provider plus server work that remote push actually requires.
status: current
toolchain: cli
---

"Notifications" is three different problems wearing one word, and most of the frustration on
this topic comes from treating them as one.

1. **Local notifications** — your app schedules something the OS shows later. No server.
2. **Remote push** — a server sends a payload to APNs or FCM, which wakes the device. Needs a
   provider, a certificate or key, a token pipeline, and backend code.
3. **Handling** — what happens when a notification arrives or is tapped, in the foreground, the
   background, and from a cold start.

React Native core covers a slice of (1) and (3) on iOS only. Everything else is a library plus
infrastructure you write.

## What exists where

| Need | Core 0.87 | Library | Server |
| --- | --- | --- | --- |
| iOS local notification, iOS permission prompt, badge count | `PushNotificationIOS` | — | — |
| Android notification channels | nothing | `@notifee/react-native` | — |
| Rich local notifications, triggers, actions, on both platforms | nothing | `@notifee/react-native` 9.1.8 | — |
| Cross-platform permission state | `PermissionsAndroid` (Android only) | `react-native-permissions` 5.6.1 | — |
| Remote push delivery | nothing | an APNs/FCM client | **required** |

`PushNotificationIOS` is genuinely in core — it is in the 0.87 export surface and it has a
complete type definition. It is also **iOS-only and old-shaped**: string-keyed event names,
`Function` callback types, and no Android story at all. It is the right tool for badge counts
and the iOS permission prompt, and the wrong tool for anything you want on both platforms.

> [!NOTE] Notifee runs through the interop layer
> `@notifee/react-native` 9.1.8 ships no `codegenConfig` and no `TurboModuleRegistry` spec —
> verified by inspecting the published package. It works on 0.87 through the New Architecture's
> interop layer for legacy modules, which is supported, but it is not a native TurboModule. Weigh
> that when you pick it, and watch its releases.

## Native configuration

:::tabs
@tab iOS

Notifications need no `Info.plist` usage description — the permission is requested at runtime
through the notification centre. What they do need is capabilities and, for `PushNotificationIOS`,
delegate forwarding.

**For remote push only**, enable the Push Notifications capability in Xcode (which writes the
`aps-environment` entitlement) and add the background mode if you send silent pushes:

```xml title=ios/AwesomeProject/Info.plist
<!-- Only if your server sends content-available (silent) pushes. -->
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

`PushNotificationIOS` only receives events if the app delegate forwards them. The class methods
below are the real, current API, read from `RCTPushNotificationManager.h` in react-native 0.87.1:

```objc title=ios/AwesomeProject/AppDelegate.mm
#import <React/RCTPushNotificationManager.h>

// Remote push registration results.
- (void)application:(UIApplication *)application
    didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  [RCTPushNotificationManager didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application
    didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  [RCTPushNotificationManager didFailToRegisterForRemoteNotificationsWithError:error];
}

// A notification arriving while the app is in the foreground.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
  [RCTPushNotificationManager didReceiveNotification:notification];
  // Pass UNNotificationPresentationOptionNone to keep the pre-iOS-10 behaviour
  // of not showing a banner while the app is open.
  completionHandler(UNNotificationPresentationOptionBanner);
}

// The user tapped a notification.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler {
  [RCTPushNotificationManager setInitialNotification:response.notification];
  [RCTPushNotificationManager didReceiveNotification:response.notification];
  completionHandler();
}
```

`setInitialNotification:` is what makes `getInitialNotification()` return the notification that
cold-started the app. Skip it and your deep-link-from-notification flow works from the
background and silently fails from a cold start.

@tab Android

Since **Android 13 (API 33)**, posting a notification requires a runtime permission. Declare it:

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

  <!-- Only if you schedule notifications that must fire at an exact time. -->
  <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

  <!-- Only if a notification must appear over the lock screen, e.g. an incoming call. -->
  <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />

  <!-- Re-schedule pending notifications after a reboot. -->
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

  <application ...>
    <!-- … -->
  </application>
</manifest>
```

Declaring it is not enough — it must also be **requested at runtime** on API 33 and above.
Below API 33 it is granted implicitly and the request resolves immediately.

`SCHEDULE_EXACT_ALARM` and `USE_FULL_SCREEN_INTENT` are special-access permissions: the user
grants them from a settings screen, not from a dialog, and Play reviews their use. Do not
declare them for an ordinary reminder.

:::

## Basic example

Requesting permission on both platforms with one call:

```tsx title=src/notifications/permission.ts
import {requestNotifications, checkNotifications, RESULTS} from 'react-native-permissions';

export async function ensureNotificationPermission(): Promise<boolean> {
  const {status} = await checkNotifications();
  if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return true;
  if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) return false;

  // On Android 13+ this maps to POST_NOTIFICATIONS; below that it resolves
  // immediately. On iOS the options decide which capabilities are requested.
  const result = await requestNotifications(['alert', 'badge', 'sound']);
  return result.status === RESULTS.GRANTED;
}
```

`checkNotifications()` also returns a `settings` object describing which capabilities are
actually enabled (`alert`, `badge`, `sound`, `lockScreen`, `notificationCenter`, and more). A
user can grant notifications but turn off sound; if your feature depends on being heard, check
the setting rather than the status.

> [!WARNING] On Android 13+, `checkNotifications` never returns `blocked`
> As with every Android runtime permission, the permanent-refusal state is only observable from
> the request. See [Permissions](permissions.md).

## How it works

### Android channels are mandatory

Since **Android 8 (API 26)**, every notification belongs to a channel, and a notification posted
to a channel that does not exist is dropped without an error. The channel — not your code —
owns the importance, sound, vibration and lock-screen visibility, because the user can change
all of them per channel and your app cannot override that.

Create your channels once, at startup, before anything can post:

```ts-fragment title=src/notifications/channels.ts
import notifee, {AndroidImportance} from '@notifee/react-native';
import {Platform} from 'react-native';

export async function createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await notifee.createChannels([
    {
      id: 'orders',
      name: 'Order updates',
      // HIGH means heads-up: the notification appears over the current app.
      importance: AndroidImportance.HIGH,
    },
    {
      id: 'marketing',
      name: 'Offers and news',
      // LOW is silent and does not interrupt. Use it for anything the user
      // did not ask for; it is also the honest default for promotional content.
      importance: AndroidImportance.LOW,
    },
  ]);
}
```

`AndroidImportance` is `NONE = 0`, `MIN = 1`, `LOW = 2`, `DEFAULT = 3`, `HIGH = 4`.

Two rules that bite later: a channel's importance **can only be lowered** after creation, never
raised, and the channel id is permanent. Separate channels per category is not a nicety — it is
what lets a user mute your marketing without muting your order updates, which is the difference
between a muted channel and a uninstalled app.

> [!NOTE] Why the Notifee blocks are not type-checked
> `@notifee/react-native` is not installed in this repository's type-check harness, so its blocks
> are tagged `ts-fragment` / `tsx-fragment`. The API shown was read from the published `9.1.8`
> type definitions.

### Displaying and scheduling

```ts-fragment title=src/notifications/display.ts
import notifee, {AndroidImportance, TriggerType, RepeatFrequency} from '@notifee/react-native';
import type {TimestampTrigger} from '@notifee/react-native';

export async function showNow(): Promise<void> {
  await notifee.displayNotification({
    title: 'Order shipped',
    body: 'Your order is on its way.',
    android: {
      // Must match a channel you created, or nothing is shown.
      channelId: 'orders',
      pressAction: {id: 'default'},
      importance: AndroidImportance.HIGH,
    },
    ios: {sound: 'default'},
    // Round-trips to your event handler. Keep it small and non-secret.
    data: {orderId: '1042'},
  });
}

export async function remindTomorrow(): Promise<void> {
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: Date.now() + 24 * 60 * 60 * 1000,
    repeatFrequency: RepeatFrequency.NONE,
  };

  await notifee.createTriggerNotification(
    {title: 'Still there?', body: 'Your basket is waiting.', android: {channelId: 'orders'}},
    trigger,
  );
}
```

Triggers come in two shapes: `TriggerType.TIMESTAMP` (a specific moment, optionally repeating
hourly, daily or weekly) and `TriggerType.INTERVAL` (every N seconds, minutes, hours or days).
Neither is exact by default — see the platform notes below.

### Handling events

Two listeners, and both are required. `onForegroundEvent` runs while the app is visible;
`onBackgroundEvent` must be registered **outside** React, at module scope in `index.js`, because
the OS may spin up the JavaScript context with no UI attached.

```ts-fragment title=index.js — background handler registration
import notifee, {EventType} from '@notifee/react-native';

// Registered at module scope so it exists before any React component mounts.
notifee.onBackgroundEvent(async ({type, detail}) => {
  if (type === EventType.PRESS) {
    // Record the intent. Do not try to navigate here — there may be no
    // navigator yet. Read it when the app finishes starting.
    console.log('pressed while backgrounded', detail.notification?.data);
  }
});
```

`EventType` values include `DISMISSED`, `PRESS`, `ACTION_PRESS`, `DELIVERED`, `APP_BLOCKED`,
`CHANNEL_BLOCKED` and `TRIGGER_NOTIFICATION_CREATED`. `APP_BLOCKED` and `CHANNEL_BLOCKED` are
worth handling: they tell you the user turned your notifications off, which is a better signal
than a delivery count that quietly goes to zero.

### Badge counts with core

This is the one place `PushNotificationIOS` is clearly the simplest answer:

```ts title=src/notifications/badge.ts
import {Platform, PushNotificationIOS} from 'react-native';

export function setBadge(count: number): void {
  // iOS-only. Android has no OS-level badge API; badges there are a
  // launcher-specific feature and require a different mechanism.
  if (Platform.OS === 'ios') {
    PushNotificationIOS.setApplicationIconBadgeNumber(count);
  }
}
```

## Remote push is mostly not a React Native problem

Nothing in React Native delivers a push. The chain is:

1. The app asks the OS to register for remote notifications and receives a **device token**.
2. The app sends that token to **your server**, tied to a user.
3. Your server calls **APNs** (iOS) or **FCM** (Android) with the token and the payload.
4. The OS wakes the device and shows or delivers the notification.

Steps 3 and 4 are outside the app entirely. What that means in practice:

- You need an **APNs authentication key** (a `.p8` from the Apple Developer portal) and an **FCM
  project**. Both are credentials that live on your server and must never be in the app bundle —
  see [Secrets in the Bundle](../security/secrets-in-the-bundle.md).
- You need token lifecycle handling: tokens rotate, get invalidated on reinstall, and must be
  removed on logout, or you will push one user's notifications to another user's device.
- You need delivery to be idempotent. Both services can deliver more than once, and neither
  guarantees delivery at all.

On iOS the token arrives through the `register` event:

```ts title=src/notifications/iosToken.ts
import {PushNotificationIOS} from 'react-native';

export function listenForDeviceToken(send: (token: string) => void): void {
  // The event name is a plain string and the handler type is loose — this is one
  // of the oldest APIs in core and it shows.
  PushNotificationIOS.addEventListener('register', (token: string) => send(token));
  PushNotificationIOS.addEventListener('registrationError', (error: unknown) => {
    console.warn('APNs registration failed', error);
  });
}
```

On Android the token comes from an FCM client library rather than from core. Pick one, check it
supports the New Architecture before you commit — see
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## Platform differences

:::tabs
@tab iOS

- Permission is requested through the notification centre, with options. A user can grant
  **provisional** authorization, where notifications arrive silently in Notification Center
  without a prompt; `AuthorizationStatus.PROVISIONAL` is a real state, not a denial.
- There are no channels. Grouping uses `threadId`, and the user's controls are per-app.
- Scheduled local notifications are capped at **64 pending** per app. Beyond that the oldest are
  dropped silently, so a "one reminder per item" design breaks at scale.
- A notification does not display while the app is in the foreground unless the delegate says so
  — that is the `completionHandler` in the app delegate snippet above.
- The badge is an OS feature and `setApplicationIconBadgeNumber` works.

@tab Android

- Channels are mandatory from API 26, and the user owns every channel's sound, vibration and
  importance once created.
- `POST_NOTIFICATIONS` is a runtime permission from API 33. On older versions it is implicit.
- Scheduled notifications are subject to Doze: an inexact alarm can slide by minutes or longer.
  Exact delivery needs `SCHEDULE_EXACT_ALARM`, which is special-access and reviewed.
- Pending notifications are lost on reboot unless you re-schedule them; `RECEIVE_BOOT_COMPLETED`
  is what lets a library do that for you.
- There is no OS badge API. Launcher badges are vendor-specific.
- Aggressive battery managers on some vendor ROMs kill background delivery entirely for apps the
  user has not whitelisted. This is not a bug you can fix in code.

:::

## Security considerations

**Threat.** A notification payload is displayed by the OS on a locked screen, is stored by the
platform's push service in transit, and — for remote push — passes through Apple's or Google's
infrastructure. Anything you put in the title or body is visible to someone holding the device
without unlocking it, and to anyone who compromises your server's push credentials.

**Exploit.** Two concrete failures.

First, sensitive content in the body. A notification reading "Your 2FA code is 481920" or
"Payment of $4,200 to Dr. Reed confirmed" is readable from a locked screen across a room, and
is logged by the system. On Android it is also visible to a notification-listener service the
user installed for some unrelated reason.

Second, trusting the payload. A notification's `data` is attacker-controllable if your push
credentials leak, and on Android an arbitrary app cannot post to your app but your own deep-link
handler will happily act on whatever the payload says:

```ts title=Vulnerable — acts on whatever the payload claims
import {Linking} from 'react-native';

export function openFromNotification(data: Record<string, unknown>): void {
  // The payload is untrusted input. This opens anything the sender names.
  void Linking.openURL(String(data.url));
}
```

**Fix.**

1. **Keep the payload uninteresting.** Send an identifier, fetch the content after the user
   opens the app and is authenticated. "You have a new message" plus an id is enough.
2. **Validate the payload like any other untrusted input.** Allow-list the routes a notification
   may open, exactly as with deep links — see
   [Deep Link Validation](../security/deep-link-validation.md).

```ts title=src/notifications/route.ts
// Only these destinations may be opened from a notification payload.
const ALLOWED = {order: /^[0-9]{1,12}$/, message: /^[a-z0-9-]{1,64}$/} as const;

export function routeFor(data: Record<string, unknown>): string | null {
  const kind = data.kind;
  const id = data.id;
  if (typeof kind !== 'string' || typeof id !== 'string') return null;
  if (!(kind in ALLOWED)) return null;
  const pattern = ALLOWED[kind as keyof typeof ALLOWED];
  return pattern.test(id) ? `/${kind}/${id}` : null;
}
```

3. **Keep APNs keys and FCM service accounts server-side.** A `.p8` or service-account JSON
   shipped in the app is extractable from the bundle in minutes.
4. **Set visibility deliberately.** On Android, a channel or notification can be marked private
   so the content is hidden on the lock screen while the notification still appears.

**Verification.** Lock the device, trigger each notification your app can send, and read what is
visible without unlocking. Then extract your release bundle and search it for credentials:

```bash
unzip -o app-release.apk -d /tmp/apk
strings /tmp/apk/assets/index.android.bundle | grep -iE "BEGIN PRIVATE KEY|serviceaccount|apns"
```

Anything that matches is a key you have already shipped. See
[Secrets in the Bundle](../security/secrets-in-the-bundle.md).

## Common mistakes

- **Posting without creating the channel.** Wrong: calling `displayNotification` with
  `channelId: 'orders'` before `createChannel` ran. Right: create channels at startup. Android
  drops the notification with no error, which reads as "notifications do not work on Android".
- **Skipping the runtime `POST_NOTIFICATIONS` request.** Wrong: adding the `<uses-permission>`
  line and assuming that is the whole job. Right: request it at runtime on API 33+; the manifest
  entry alone posts nothing.
- **Registering the background handler inside a component.** Wrong: calling
  `notifee.onBackgroundEvent` in a `useEffect`. Right: register it at module scope in `index.js`
  — the OS may run the handler with no React tree mounted.
- **Forgetting `setInitialNotification:` on iOS.** Wrong: notification taps work from the
  background and do nothing from a cold start. Right: call it in the delegate so
  `getInitialNotification()` returns the notification.
- **Putting the content in the payload.** Wrong: sending the message text so the notification
  looks good. Right: send an id and fetch after authentication — the body is visible on a locked
  screen.
- **Assuming delivery.** Wrong: treating a push as a reliable trigger for state changes. Right:
  reconcile on app open. Neither APNs nor FCM guarantees delivery, and vendor battery managers
  drop background wakeups outright.
- **One channel for everything.** Wrong: a single `default` channel carrying both order updates
  and marketing. Right: separate channels, so muting the noise does not mute the signal.

## Related topics

- [Permissions](permissions.md) — the runtime permission flow, including `blocked`.
- [Background Tasks](background-tasks.md) — what a silent push can and cannot wake up.
- [Deep Link Validation](../security/deep-link-validation.md) — validating a payload that names a destination.
- [Linking](linking.md) — opening the destination once you have validated it.
- [Secrets in the Bundle](../security/secrets-in-the-bundle.md) — why APNs keys stay on the server.
- [App Lifecycle](../state-and-data/app-lifecycle.md) — foreground, background and cold start.
