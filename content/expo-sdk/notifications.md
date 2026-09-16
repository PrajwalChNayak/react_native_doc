---
title: Notifications
description: expo-notifications for local and push notifications in an Expo SDK 57 app — permissions, Android channels, foreground handling, scheduling triggers, push tokens, and what Expo Go can no longer do.
status: current
toolchain: expo
sdk: 57
---

`expo-notifications` covers both halves of notifications: **local** notifications your app schedules
on the device, and **push** notifications a server sends through APNs (iOS) or Firebase Cloud Messaging
(Android). It also handles permission prompts, Android notification channels, badges, categories with
action buttons, and responding when the user taps a notification.

```bash
npx expo install expo-notifications expo-device expo-constants
```

That resolves `expo-notifications@~57.0.18` on SDK 57. `expo-device` and `expo-constants` are used below
to detect a real device and read your EAS project ID. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use local notifications for reminders and timers the device can fire on its own. Use push notifications
when the event happens on your server: a message arrived, an order shipped.

Do **not** use them for:

- **Guaranteed delivery.** Push is best-effort. The OS may throttle, delay or drop notifications, and the
  user can revoke permission at any time. Anything that must arrive belongs in your app's own sync.
- **Running code on a schedule.** A notification shows something to the user. For work, see
  [Background Tasks](background-tasks.md).
- **Sensitive content in the payload.** Notification text appears on the lock screen and passes through
  Apple, Google and (if you use it) Expo's push service.

## Expo Go vs development build

**Local notifications work in Expo Go. Push notifications need a development build.**

The Expo documentation is explicit: remote (push) notification functionality is unavailable in Expo Go
on Android from SDK 53 onward, and local notifications remain available in Expo Go. In practice you
should treat push as development-build-only on both platforms, because push credentials (APNs, FCM),
the `aps-environment` entitlement and your notification icon all belong to **your** app binary, not
Expo Go's.

See [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md).

## Basic example

A local notification, shown in five seconds, that is also displayed if the app is in the foreground:

```ts title=lib/notify.ts
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

// Without a handler, a notification that arrives while the app is in the
// foreground is NOT shown. Set this once, at module scope.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function remindInFiveSeconds(): Promise<string | null> {
  if (Platform.OS === 'android') {
    // Android 8+ requires a channel, and on Android 13+ the permission prompt
    // does not appear until at least one channel exists.
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const {granted} = await Notifications.requestPermissionsAsync();
  if (!granted) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {title: 'Stretch', body: 'Time to stand up.', data: {screen: 'health'}},
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: 'reminders',
    },
  });
}
```

## How it works

### Permissions

| Function | Behaviour |
| --- | --- |
| `getPermissionsAsync()` | Reads the current state. No prompt. |
| `requestPermissionsAsync(request?)` | Prompts. Defaults to alert, badge and sound on iOS. |

Both resolve a `NotificationPermissionsStatus`: the standard `status` / `granted` / `canAskAgain`, plus an
`ios` object whose `status` is an `IosAuthorizationStatus` (`NOT_DETERMINED`, `DENIED`, `AUTHORIZED`,
`PROVISIONAL`, `EPHEMERAL`). On iOS, a `PROVISIONAL` authorisation delivers quietly to Notification Center
and **`granted` is `false`** — check `ios.status` if you request provisional access.

iOS only shows the system prompt **once**. After a denial, `requestPermissionsAsync` resolves immediately
without a dialog; the only path back is the Settings app. See
[Permissions Patterns](permissions-patterns.md).

### Android channels

Every notification on Android 8+ is posted to a channel, and the **user** controls each channel's
sound, vibration and importance in system settings.

```ts title=lib/channels.ts
import * as Notifications from 'expo-notifications';

export async function createChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    description: 'New direct messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}
```

After a channel exists, Android lets you change only its name and description. To change importance or
sound you must create a channel with a new ID. `setNotificationChannelAsync` resolves `null` on iOS,
where channels do not exist.

### Foreground behaviour

`setNotificationHandler` decides what happens to a notification that arrives **while the app is open**.
`handleNotification` must resolve a `NotificationBehavior` within three seconds or the notification is
discarded; with no handler set, foreground notifications are not shown at all.

| `NotificationBehavior` field | Meaning |
| --- | --- |
| `shouldShowBanner` | Present it as a banner. |
| `shouldShowList` | Add it to Notification Center / the shade. |
| `shouldPlaySound` | Play its sound. |
| `shouldSetBadge` | Apply its badge count. |

`shouldShowAlert` still exists in the types but is superseded by `shouldShowBanner` and `shouldShowList`.

### Triggers

`scheduleNotificationAsync({content, trigger})` resolves the notification's identifier, which you pass to
`cancelScheduledNotificationAsync`. `trigger: null` delivers immediately.

| `SchedulableTriggerInputTypes` | Required fields | Notes |
| --- | --- | --- |
| `TIME_INTERVAL` | `seconds` | `repeats: true` on iOS needs `seconds >= 60`, or it never fires. |
| `DATE` | `date` (`Date` or timestamp) | One-shot. |
| `DAILY` | `hour`, `minute` | |
| `WEEKLY` | `weekday` (1 = Sunday), `hour`, `minute` | |
| `MONTHLY` | `day`, `hour`, `minute` | |
| `YEARLY` | `day`, `month`, `hour`, `minute` | `month` is 0-based, like `Date`. |
| `CALENDAR` | any date components | iOS only. |

Every trigger accepts `channelId` for Android.

### Responding to taps

```tsx title=app/_layout.tsx
import * as Notifications from 'expo-notifications';
import {router, Stack} from 'expo-router';
import {useEffect} from 'react';

function isAllowedScreen(value: unknown): value is '/messages' | '/settings' {
  return value === '/messages' || value === '/settings';
}

export default function RootLayout() {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (
      lastResponse &&
      lastResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const target = lastResponse.notification.request.content.data?.url;
      // Push payloads are untrusted input. Route only to known screens.
      if (isAllowedScreen(target)) {
        router.push(target);
      }
      Notifications.clearLastNotificationResponse();
    }
  }, [lastResponse]);

  return <Stack />;
}
```

`useLastNotificationResponse()` returns `undefined` until it knows, `null` when there is no response, or
the `NotificationResponse`. It also covers the cold-start case — the user tapped a notification while the
app was not running — which a listener registered in `useEffect` can miss.

For events while the app runs, use `addNotificationReceivedListener` and
`addNotificationResponseReceivedListener`; both return a subscription you must `remove()`.

## Native configuration

Add the plugin even if you pass no options: it writes the `aps-environment` entitlement on iOS and the
notification icon metadata on Android.

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "mode": "production",
          "sounds": ["./assets/sounds/chime.wav"],
          "enableBackgroundRemoteNotifications": false
        }
      ]
    ]
  }
}
```

| Option | Effect |
| --- | --- |
| `mode` | Sets the `aps-environment` entitlement to `development` (default) or `production`. |
| `sounds` | Copies custom sound files into the Xcode project. |
| `enableBackgroundRemoteNotifications` | Adds `remote-notification` to `UIBackgroundModes`. Default `false`. |

Notifications need **no `Info.plist` usage-description string** — the permission prompt text is
system-provided. Push additionally requires APNs credentials for your bundle identifier, generated through
an Apple Developer account.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#1A73E8",
          "defaultChannel": "messages",
          "sounds": ["./assets/sounds/chime.wav"]
        }
      ]
    ]
  }
}
```

| Option | Effect |
| --- | --- |
| `icon` | A 96x96 all-white PNG with transparency, resized into `drawable-*` folders. |
| `color` | Tint applied to the icon in the notification tray. |
| `defaultChannel` | Default channel ID for FCM v1 messages that do not name one. |
| `sounds` | Copied into `res/raw`; filenames must be valid Android resource names. |

`android.permission.POST_NOTIFICATIONS` is the Android 13+ runtime permission that
`requestPermissionsAsync` prompts for. Push also needs FCM v1 credentials for your package name.
:::

> [!WARNING] A coloured notification icon renders as a white square
> Android draws the icon as a silhouette using only its alpha channel. A full-colour app icon passed as
> `icon` shows up as a solid white block. Supply a white-on-transparent glyph.

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Permission prompt | Once; afterwards Settings only | Android 13+ runtime prompt, shown only after a channel exists |
| Channels | None | Required; user controls each channel |
| Foreground display | Controlled by `setNotificationHandler` | Controlled by `setNotificationHandler` |
| Repeating interval minimum | 60 seconds | No such limit in the API |
| Provisional authorisation | Supported (`ios.status === PROVISIONAL`) | Not applicable |
| Push transport | APNs | Firebase Cloud Messaging |
| Push on simulator / emulator | iOS Simulator (Xcode 14+) | Emulator with Google Play services |

## Common patterns

### Registering for push

```ts title=lib/registerForPush.ts
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';

export async function registerForPushAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push needs a physical device, an iOS Simulator on Xcode 14+, or an
    // Android emulator with Google Play services. Bail out clearly otherwise.
    return null;
  }

  if (Platform.OS === 'android') {
    // Must happen BEFORE getExpoPushTokenAsync on Android 13+.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let {granted} = await Notifications.getPermissionsAsync();
  if (!granted) {
    ({granted} = await Notifications.requestPermissionsAsync());
  }
  if (!granted) {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('EAS projectId is missing from the app config.');
  }

  // This call makes a network request to Expo's servers; it can fail offline.
  const token = await Notifications.getExpoPushTokenAsync({projectId});
  return token.data;
}
```

If you send through APNs and FCM directly rather than Expo's push service, use
`getDevicePushTokenAsync()` instead; it returns the native token.

### Cancelling what you scheduled

```ts title=lib/cancelReminders.ts
import * as Notifications from 'expo-notifications';

export async function cancelReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    if (request.content.data?.kind === 'reminder') {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
}
```

## Security considerations

### Push tokens are send credentials

**Threat.** An attacker obtains Expo push tokens — from your logs, an analytics tool, or a leaky API —
and sends notifications to your users that look like they came from you: "Your account is locked, log in
here".

**Exploit.** Without push security enabled, anyone holding a token can send to it:

```bash
curl -H "Content-Type: application/json" \
  -X POST https://exp.host/--/api/v2/push/send \
  -d '{"to":"ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]","title":"Security alert","body":"Verify your account"}'
```

The Expo documentation says it directly: leaked tokens let a malicious user impersonate your server.

**Fix.**

1. Enable **enhanced push security** in the EAS dashboard. Sends then require your access token in an
   `Authorization: Bearer` header, and unauthenticated requests fail with `UNAUTHORIZED`.
2. Keep that access token on your **server**. Never ship it in the app — see
   [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md).
3. Treat push tokens as sensitive: do not log them, and associate them with an authenticated user on
   your backend.
4. When a receipt reports `DeviceNotRegistered`, stop sending to that token until the device registers
   again.

**Verification.** With push security enabled, re-run the `curl` above without an `Authorization` header
and confirm the response is an `UNAUTHORIZED` error rather than a ticket.

### Notification payloads are untrusted input

**Threat.** A notification's `data` routes the user somewhere. If your handler trusts it, a crafted
payload opens an arbitrary URL or screen.

**Fix.** Validate `data` against an allow-list before acting on it, exactly as the tap handler above does.
This is the same rule as [deep link validation](../expo-security/deep-link-validation.md).

**Verification.** Schedule a local notification with `data: {url: 'https://evil.example'}`, tap it, and
confirm the app ignores it.

### Lock-screen exposure

Notification text is visible on the lock screen and stored by the OS. Send "You have a new message", not
the message itself, for anything private.

## Common mistakes

- **Testing push in Expo Go.** Remote notifications are unavailable there on Android from SDK 53. Use a
  development build.
- **No notification handler.** Foreground notifications silently never appear. Call
  `setNotificationHandler` at module scope.
- **Requesting permission before creating a channel on Android 13+.** The prompt never shows. Create the
  channel first.
- **Changing a channel's importance in code.** Android ignores it once the channel exists. Use a new
  channel ID.
- **A repeating `TIME_INTERVAL` under 60 seconds on iOS.** It never fires.
- **A coloured Android notification icon.** It renders as a white square.
- **Calling `getExpoPushTokenAsync` without a `projectId`.** Pass it explicitly from the app config.
- **Trusting `content.data` in a tap handler.** Validate it against an allow-list.
- **Putting private content in the notification body.** It appears on the lock screen.
- **Treating push as guaranteed.** It is best-effort; sync the real data in the app.

## Related topics

- [Permissions Patterns](permissions-patterns.md) — asking at the right moment and recovering from a denial.
- [Background Tasks](background-tasks.md) — doing work, as opposed to showing a notification.
- [Linking](linking.md) — the URLs a notification tap usually routes to.
- [Deep Link Validation](../expo-security/deep-link-validation.md) — why payload data needs an allow-list.
- [Deep Links and Universal Links](../expo-router/deep-linking.md) — routing from a notification into Expo Router.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — why the push access token stays server-side.
- [Credentials Management](../expo-eas/credentials.md) — APNs and FCM credentials.
