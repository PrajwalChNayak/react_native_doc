---
title: Permissions Patterns
description: How runtime permissions work across Expo SDK 57 libraries — the shared PermissionResponse shape and hooks, when to ask, handling denial and the Settings screen, Info.plist usage strings, Android permissions and blockedPermissions, and testing each state.
status: current
toolchain: expo
sdk: 57
---

Every Expo SDK library that touches something private — camera, microphone, location, photos,
notifications, motion — follows the same permission model. They return the same `PermissionResponse`
object, most ship a `use…Permissions` hook built from the same factory, and they are configured the same
way: a **usage string** on iOS and **manifest permissions** on Android, both written by config plugins.

This page is the pattern. Each library page covers its specific keys.

## Why it exists / when to use it — and when NOT to

Both platforms require explicit user consent for sensitive capabilities, and both let the user revoke it at
any time. Your app has to handle every state — not yet asked, granted, denied, permanently denied, partially
granted — or it breaks for real users.

Do **not**:

- **Ask for everything at launch.** Users refuse permissions they do not yet understand, and on iOS you usually
  get only one chance.
- **Request a permission to do something that does not need it.** The image picker on iOS needs no photo
  permission; see [Camera and Media](camera-and-media.md).
- **Treat a denial as an error.** It is a normal outcome. Degrade the feature.

## Expo Go vs development build

**Permission prompts work in Expo Go, but they are not your app's prompts.**

The Expo permissions guide notes that permissions in development and standalone builds require native
build-time configuration before JavaScript can request them, and that this is not required in Expo Go. Expo
Go's binary already declares every usage string and permission, with Expo Go's own wording. That has three
consequences:

- **You never see your own usage strings in Expo Go.** Verify them in a
  [development build](../expo-development-builds/why-you-need-one.md).
- **A missing config plugin does not crash in Expo Go** — and then crashes in your build. Test permission flows in a
  development build before release.
- **Permission state is Expo Go's.** Granting camera access to Expo Go grants it for every project you open in it.

## Basic example

The hook pattern every library shares, with all four states handled:

```tsx title=components/CameraGate.tsx
import {useCameraPermissions} from 'expo-camera';
import * as Linking from 'expo-linking';
import type {ReactNode} from 'react';
import {Button, Text, View} from 'react-native';

export function CameraGate({children}: {children: ReactNode}) {
  // The hook fetches the current status on mount (get defaults to true).
  const [permission, requestPermission] = useCameraPermissions();

  // 1. Still loading.
  if (permission === null) {
    return <View />;
  }

  // 2. Granted.
  if (permission.granted) {
    return <>{children}</>;
  }

  // 3. Can still ask: explain first, then show the system prompt.
  if (permission.canAskAgain) {
    return (
      <View>
        <Text>Scan a ticket by pointing your camera at its QR code.</Text>
        <Button title="Continue" onPress={requestPermission} />
      </View>
    );
  }

  // 4. Permanently denied: only the Settings app can change it now.
  return (
    <View>
      <Text>Camera access is off for this app. You can turn it on in Settings.</Text>
      <Button title="Open Settings" onPress={() => Linking.openSettings()} />
    </View>
  );
}
```

## How it works

### `PermissionResponse`

Every library's get and request functions resolve this shape, sometimes extended:

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | `PermissionStatus` | `'granted'`, `'denied'` or `'undetermined'`. |
| `granted` | `boolean` | Convenience for `status === 'granted'`. |
| `canAskAgain` | `boolean` | Whether a request can still show a prompt. `false` means Settings only. |
| `expires` | `'never' \| number` | Currently always `'never'`. |

`PermissionStatus` and `PermissionResponse` are exported from `expo` (and re-exported by most libraries).

Library-specific extensions carry the detail you need for partial grants:

| Library | Extra fields |
| --- | --- |
| `expo-location` | `ios.scope` (`'whenInUse'`, `'always'`, `'none'`), `android.accuracy` (`'fine'`, `'coarse'`, `'none'`) |
| `expo-media-library` | `accessPrivileges` (`'all'`, `'limited'`, `'none'`) |
| `expo-notifications` | `ios.status` (`IosAuthorizationStatus`, including `PROVISIONAL`), `android.importance` |

### The two functions and the hook

| Pattern | Example | Shows a prompt |
| --- | --- | --- |
| `get…PermissionsAsync()` | `Camera.getCameraPermissionsAsync()` | Never |
| `request…PermissionsAsync()` | `Location.requestForegroundPermissionsAsync()` | Only if `canAskAgain` |
| `use…Permissions(options?)` | `useCameraPermissions()` | Only when you call the returned `request` |

Hooks return `[permission | null, request, get]`. Their options include:

| Option | Default | Meaning |
| --- | --- | --- |
| `get` | `true` | Fetch the current status on mount. |
| `request` | `false` | Show the prompt on mount. **Leave it off**; asking on mount is asking without context. |

Some hooks accept library-specific options too, such as `MediaLibrary.usePermissions({writeOnly: true, granularPermissions: ['photo']})`.

### What the prompt looks like, and when it disappears

:::tabs
@tab iOS

- The system shows the prompt **once** per permission. After the user answers, `request…` resolves
  immediately with the stored answer. `canAskAgain` is `false` after a denial.
- The dialog shows **your usage string** from `Info.plist` as the explanation.
- Some permissions have intermediate states: "Allow Once" for location, "Limited" photo access, provisional
  notifications, approximate location.
- Location "Always" is a second, separate step after "While Using".

@tab Android

- Runtime ("dangerous") permissions prompt; normal permissions such as `VIBRATE` or `USE_BIOMETRIC` are granted
  at install with no prompt.
- On Android 11+, if the user denies the same permission twice, the system stops showing the dialog and
  `canAskAgain` becomes `false`.
- "Only this time" grants are revoked when the app is closed.
- Android auto-resets permissions for apps unused for months, so a previously granted permission can come back as
  `undetermined`.
- Background location opens a system settings screen instead of a dialog.
- Notifications (`POST_NOTIFICATIONS`) are a runtime permission from Android 13, and the prompt waits until a
  notification channel exists.
:::

Because permissions can change while your app is backgrounded — the user visits Settings and back — **re-check
with `get…` when the app returns to the foreground**; never cache a grant forever.

## Native configuration

Permissions are native configuration. They are compiled into the binary and cannot be changed by an OTA update:
the Expo permissions guide notes that `Info.plist` changes only ship with a new native binary.

:::tabs
@tab iOS

Every sensitive API needs a **usage-description string** in `Info.plist`. The normal way to set one is the
library's config plugin option:

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-camera", {"cameraPermission": "Scan QR codes on event tickets."}],
      ["expo-location", {"locationWhenInUsePermission": "Show events near you."}]
    ]
  }
}
```

You can also set keys directly with `ios.infoPlist`, which is useful for a library without a plugin option:

```json title=app.json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Scan QR codes on event tickets."
      }
    }
  }
}
```

Keys used by the Expo SDK libraries in this section, with the plugin option that writes each:

| `Info.plist` key | Plugin → option |
| --- | --- |
| `NSCameraUsageDescription` | `expo-camera` → `cameraPermission`; `expo-image-picker` → `cameraPermission` |
| `NSMicrophoneUsageDescription` | `expo-camera` / `expo-image-picker` / `expo-audio` → `microphonePermission` |
| `NSPhotoLibraryUsageDescription` | `expo-media-library` / `expo-image-picker` → `photosPermission` |
| `NSPhotoLibraryAddUsageDescription` | `expo-media-library` → `savePhotosPermission` |
| `NSLocationWhenInUseUsageDescription` | `expo-location` → `locationWhenInUsePermission` |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | `expo-location` → `locationAlwaysAndWhenInUsePermission` |
| `NSMotionUsageDescription` | `expo-sensors` → `motionPermission`; `expo-location` → `motionUsagePermission` |
| `NSFaceIDUsageDescription` | `expo-local-authentication` / `expo-secure-store` → `faceIDPermission` |

> [!DANGER] A missing usage string crashes the app on the first request
> For camera, microphone, photos, location and motion, requesting access when the matching key is absent from
> `Info.plist` terminates the app immediately — no JavaScript exception, no dialog. It passes in Expo Go and
> crashes in your build. After adding any library that touches these APIs, confirm its plugin entry is in
> `app.json` and rebuild.
>
> Face ID behaves differently per library: `expo-local-authentication` falls back to the passcode, while
> `expo-secure-store`'s biometric gating crashes. Ship the string either way.

Write the string as a reason ("Scan QR codes on event tickets"), not a label ("Camera access"). Plugins fall back
to generic text such as `"Allow $(PRODUCT_NAME) to access your camera"` when you omit the option — enough to stop the
crash, and a frequent App Review rejection.

@tab Android

Most Android permissions are added for you: the Expo permissions guide notes that libraries add them either
through config plugins or through their own package-level `AndroidManifest.xml`, which is merged into your app.

Two app config keys adjust the result:

```json title=app.json
{
  "expo": {
    "android": {
      "permissions": ["android.permission.HIGH_SAMPLING_RATE_SENSORS"],
      "blockedPermissions": ["android.permission.RECORD_AUDIO"]
    }
  }
}
```

| Key | Effect |
| --- | --- |
| `android.permissions` | Adds permissions no library added for you. |
| `android.blockedPermissions` | Removes permissions added by a library's manifest — for example `RECORD_AUDIO` merged in by a camera library in an app that never records. |

Several plugins expose the same control per library, such as `expo-camera`'s `recordAudioAndroid: false` or
`expo-image-picker`'s `microphonePermission: false`.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Prompt shown | Once per permission | Until denied twice (Android 11+) |
| Explanation text | Your `Info.plist` usage string | System text; explain in your UI first |
| Missing declaration | Crash on request (most permissions) | Request returns denied |
| One-time grants | "Allow Once" (location) | "Only this time" |
| Partial grants | Limited photos, approximate location, provisional notifications | Coarse location, selected photos (Android 14+) |
| Auto-revocation | No | Unused apps, after months |
| Background location | Second prompt | Settings screen |
| Recovery after permanent denial | `Linking.openSettings()` | `Linking.openSettings()` |

## Common patterns

### Ask in context, once, with a primer

Show your own explanation screen before the system prompt, and call `request…` only when the user taps the button
that needs it. A primer costs nothing when the answer is yes, and when the answer would be no it saves your one iOS
prompt for later.

### A reusable permission flow

```ts title=lib/ensurePermission.ts
import type {PermissionResponse} from 'expo';
import * as Location from 'expo-location';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

export async function ensurePermission(
  get: () => Promise<PermissionResponse>,
  request: () => Promise<PermissionResponse>,
): Promise<PermissionOutcome> {
  const current = await get();
  if (current.granted) {
    return 'granted';
  }
  if (!current.canAskAgain) {
    // No prompt will appear. The caller should offer Linking.openSettings().
    return 'blocked';
  }
  const next = await request();
  if (next.granted) {
    return 'granted';
  }
  return next.canAskAgain ? 'denied' : 'blocked';
}

// Usage: any library's get/request pair fits the same helper.
export function ensureForegroundLocation(): Promise<PermissionOutcome> {
  return ensurePermission(
    Location.getForegroundPermissionsAsync,
    Location.requestForegroundPermissionsAsync,
  );
}
```

Inside a component, the library's `use…Permissions()` hook is usually simpler.

### Re-check when the app returns to the foreground

```ts title=hooks/usePermissionOnForeground.ts
import type {PermissionResponse} from 'expo';
import {useEffect, useState} from 'react';
import {AppState} from 'react-native';

export function usePermissionOnForeground(
  get: () => Promise<PermissionResponse>,
): PermissionResponse | null {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);

  useEffect(() => {
    get().then(setPermission);
    // The user may have changed the permission in Settings while away.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        get().then(setPermission);
      }
    });
    return () => subscription.remove();
  }, [get]);

  return permission;
}
```

### Handling partial grants

Check the extended fields instead of `granted` alone: `android.accuracy === 'coarse'` means a "near me" radius, not
turn-by-turn; `accessPrivileges === 'limited'` means offer `presentPermissionsPicker()` to add photos rather than
showing an empty gallery.

## Security considerations

**Threat.** Every permission is attack surface. A permission your app holds but does not need is available to any
code running in your process — including a compromised dependency or an embedded SDK — and a broad permission set is
itself a privacy finding in store review and security audits.

**Exploit.** An app adds `expo-camera` for QR scanning. By default the camera plugin also adds `RECORD_AUDIO` on
Android. A third-party analytics SDK in the same app now runs inside a process that holds microphone permission the
moment the user grants the camera prompt — which on Android is a separate prompt the app never intended to show, but
the permission is declared and requestable.

```bash
npx expo prebuild --platform android --clean
grep -n "uses-permission" android/app/src/main/AndroidManifest.xml
```

The output lists every permission the build declares, including the ones merged from libraries.

> [!DANGER] `expo prebuild --clean` regenerates the native directories
> In SDK 57, `expo prebuild` clears and regenerates `ios/` and `android/`. Run it only in a project that keeps
> native directories as build output (Continuous Native Generation), or in a copy. Hand edits in those directories
> are lost. See [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).

**Fix.**

- Remove what you do not use: `recordAudioAndroid: false`, `microphonePermission: false`, or
  `android.blockedPermissions`.
- Request the narrowest form: write-only photo access for saving, foreground rather than background location,
  `granularPermissions: ['photo']`.
- Ask at the point of use, and stop using the capability when the feature ends.

**Verification.** Re-run the `grep` above after the fix and confirm the unwanted permission is gone. On iOS, inspect
the generated `ios/<App>/Info.plist` and confirm there is no usage string for a capability you do not use.

For the broader audit, see [Permissions Hygiene](../expo-security/permissions-hygiene.md).

## Testing permission flows

Permission state survives app restarts, so each state needs a deliberate reset:

| Goal | iOS | Android |
| --- | --- | --- |
| Back to "not asked" | Delete and reinstall the app | Uninstall and reinstall the app |
| Revoke a grant | Settings → your app | `adb shell pm revoke com.example.myapp android.permission.CAMERA` |
| Grant without prompting | Settings → your app | `adb shell pm grant com.example.myapp android.permission.CAMERA` |
| Reset a simulator's privacy settings | `xcrun simctl privacy booted reset all com.example.myapp` | — |

Test **every** state — granted, denied once, permanently denied, partial — in a development build, not Expo Go.

## Common mistakes

- **Requesting on launch.** Ask when the user taps the feature, after explaining why.
- **Ignoring `canAskAgain`.** After a permanent denial `request…` shows nothing; offer `Linking.openSettings()`.
- **Checking only `granted`.** Approximate location and limited photo access are partial grants you must handle.
- **Missing the config plugin.** It works in Expo Go and crashes your build on iOS.
- **Generic usage strings.** Write a reason; App Review rejects vague text.
- **Caching a grant forever.** Users change permissions in Settings; re-check on foreground.
- **Passing `request: true` to a permission hook.** It prompts on mount, without context.
- **Keeping permissions a library added but you never use.** Block them.
- **Expecting an OTA update to fix a usage string.** It is native configuration; ship a new binary.
- **Testing only the happy path.** Reset and test denied and permanently denied states too.

## Related topics

- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — auditing and minimising what your app declares.
- [Camera and Media](camera-and-media.md) — camera, microphone and photo library keys.
- [Location](location.md) — foreground and background location escalation.
- [Notifications](notifications.md) — notification permission and Android channels.
- [Linking](linking.md) — `openSettings()` for the permanently-denied state.
- [The App Config](../expo-core-concepts/app-config.md) — `ios.infoPlist`, `android.permissions` and `android.blockedPermissions`.
- [What a Config Plugin Is](../expo-config-plugins/what-they-are.md) — how plugin options become native configuration.
