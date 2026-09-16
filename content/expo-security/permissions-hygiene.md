---
title: Permissions Hygiene
description: Requesting only the permissions your Expo app uses, writing honest usage descriptions, removing permissions libraries add behind your back, and proving what the shipped binary actually declares.
status: current
toolchain: expo
sdk: 57
---

Every permission your app declares is a capability an attacker inherits if they ever run code
inside it. That can happen through a compromised dependency, an unsigned update, or a WebView
bug. It is also a line on a store review checklist, and a reason for a user to decline an install.

Permissions hygiene is three habits:

1. Declare only what a shipped feature uses.
2. Request at the moment of use, with an explanation that is true.
3. Check the **built binary**, because libraries add permissions you never wrote.

## Why it exists / when to use it — and when NOT to

Do this for every release build. It matters most when you add an SDK package with native code:
`expo-camera`, `expo-location`, `expo-notifications`, `expo-media-library` and third-party SDKs
all bring permissions with them.

This page is about **declared** permissions and when you ask for them. For the request API of each
module, see [Permissions Patterns](../expo-sdk/permissions-patterns.md).

## Basic example

### Configure permission strings through the module's config plugin

SDK modules with sensitive permissions accept their usage strings as plugin options. Verified
against the installed SDK 57 plugin types:

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Scan the QR code on your parcel to track it.",
          "microphonePermission": false,
          "recordAudioAndroid": false
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Show pickup points near you.",
          "isIosBackgroundLocationEnabled": false,
          "isAndroidBackgroundLocationEnabled": false
        }
      ]
    ]
  }
}
```

What each option does here:

| Option | Package | Effect |
| --- | --- | --- |
| `cameraPermission` | `expo-camera` | iOS camera usage description |
| `microphonePermission: false` | `expo-camera` | Type is `string \| false`; `false` opts out of the microphone description for an app that never records audio |
| `recordAudioAndroid: false` | `expo-camera` | Do not add Android's audio recording permission |
| `locationWhenInUsePermission` | `expo-location` | iOS when-in-use usage description |
| `isIosBackgroundLocationEnabled` / `isAndroidBackgroundLocationEnabled` | `expo-location` | Leave `false` unless a shipped feature tracks location in the background |

### Remove permissions you did not ask for

`android.blockedPermissions` removes a permission from the final merged `AndroidManifest.xml`, even
when a library's own manifest adds it. The SDK 57 config types document that it uses
`tools:node="remove"` internally and is not available in Expo Go.

```json title=app.json
{
  "expo": {
    "android": {
      "permissions": ["android.permission.CAMERA"],
      "blockedPermissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.SYSTEM_ALERT_WINDOW"
      ]
    }
  }
}
```

`android.permissions` **adds** permissions during prebuild. `blockedPermissions` **removes** them
from the merged result. Use the second one to fix a library that over-declares.

### Ask at the moment of use

```tsx title=app/scan.tsx
import {CameraView, useCameraPermissions} from 'expo-camera';
import {Button, Linking, Text, View} from 'react-native';

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <View />; // permission state is still loading
  }

  if (!permission.granted) {
    return (
      <View style={{padding: 24, gap: 12}}>
        <Text>Scanning needs the camera. It is used only while this screen is open.</Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          // The OS will not show the prompt again. Send the user to settings instead of
          // calling requestPermission in a loop that does nothing.
          <Button title="Open settings" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    );
  }

  return <CameraView style={{flex: 1}} facing="back" />;
}
```

The permission is requested when the user opens the scanner — not at launch, not during onboarding
for a feature they may never use.

> [!NOTE] Expo Go vs development build
> Expo Go ships with its own fixed set of declared permissions and its own usage strings, so it
> tells you nothing about what **your** binary declares. Plugin options and `blockedPermissions` take
> effect only in a [development build](../expo-development-builds/why-you-need-one.md) or a release
> build.

## How it works

### Where permissions come from

```text
app.json android.permissions ─┐
config plugin options ────────┼─▶ prebuild ─▶ your AndroidManifest.xml ─┐
                              │                                          ├─▶ Gradle manifest merge ─▶ shipped manifest
library AndroidManifest.xml files (every native dependency) ────────────┘        ▲
                                                                                   │
android.blockedPermissions ── tools:node="remove" ────────────────────────────────┘
```

On Android the merge step is where surprises happen: a native dependency can declare a permission
in its own manifest, and it ends up in yours without appearing in `app.json`.

On iOS there is no merged permission list. Access is gated at runtime, and the binary must contain
a **usage description string** in `Info.plist` for each protected resource it touches. A missing
string crashes the app when the API is called; an unnecessary one invites review questions.

### Why a vague usage string is a real problem

The usage description is the only thing the user reads before deciding. "This app needs access to
your camera" gives them nothing. It also fails the practical test for store review, which expects
the string to explain the purpose.

Write what the feature does, in the user's terms: "Scan the QR code on your parcel to track it."

## Platform differences

:::tabs
@tab iOS
- Usage strings live in `Info.plist`. Set them with the module's plugin options, or with
  `ios.infoPlist` for keys no plugin covers.
- A string for a resource the app never uses is still visible to App Review.
- `ios.privacyManifests` exists in the SDK 57 config types for declaring privacy manifest
  information. Third-party SDKs may ship their own manifests too.
- Once denied, the prompt does not reappear. `canAskAgain` tells you; send the user to Settings.
@tab Android
- Declared permissions are in the merged `AndroidManifest.xml`. Inspect the final one, not the one
  prebuild writes.
- Runtime ("dangerous") permissions need a request at runtime; normal permissions are granted at
  install.
- `blockedPermissions` is the tool for removing what a library adds.
- Background location is requested separately from foreground location, and only after the
  foreground permission is granted.
:::

## Common patterns

### Audit what an SDK package brings before you add it

Before installing a package, read its plugin options and its Android manifest in `node_modules`:

```bash
npx expo install expo-location
find node_modules/expo-location/android -name AndroidManifest.xml -exec grep -H "uses-permission" {} \;
```

Decide which of those your feature needs, then block the rest.

### Keep a permissions inventory in the repository

A short table in your repository — permission, feature that uses it, screen that requests it —
makes a new permission in a pull request something a reviewer notices rather than a surprise at
store review.

### Foreground before background, and background only with a reason

```ts title=app/lib/location.ts
import * as Location from 'expo-location';

/** Asks only for foreground access. Background access is a separate, later, explained request. */
export async function ensureForegroundLocation(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const result = await Location.requestForegroundPermissionsAsync();
  return result.granted;
}
```

## Security considerations

**Threat.** Code running inside your app — a compromised dependency, an attacker-published update,
an injected script in a WebView bridge — uses permissions your app holds but does not need:
recording audio, reading precise location in the background, reading the photo library.

**Exploit.** Find what a shipped Android build actually declares:

```bash
apkanalyzer manifest permissions app-release.apk
```

`apkanalyzer` ships with the Android SDK command-line tools. Every line in that output is a
capability any code in your app can request. A `RECORD_AUDIO` line in an app with no audio feature
is attack surface you are shipping for free.

For iOS, list the usage strings in a built app:

```bash
unzip -o MyApp.ipa -d ipa-contents
plutil -p ipa-contents/Payload/MyApp.app/Info.plist | grep UsageDescription
```

**Fix.**

1. Remove plugin options and `android.permissions` entries for features you do not ship.
2. Set module plugin options to opt out (`microphonePermission: false`,
   `recordAudioAndroid: false`, background location `false`).
3. Add `android.blockedPermissions` for anything a library adds that you do not use.
4. Rebuild — permissions are native configuration, so an EAS Update cannot change them.

**Verification.** Re-run `apkanalyzer manifest permissions` and the `plutil` check against the new
build and compare with the previous output. Keep the output in CI as an artifact, and fail the
pipeline when the list changes without a matching change to your permissions inventory:

```bash
apkanalyzer manifest permissions app-release.apk | sort > permissions.txt
diff -u permissions.expected.txt permissions.txt
```

## Common mistakes

- **Requesting every permission at launch.** Users decline, and on iOS a declined prompt does not
  return. Request at the moment of use.
- **Trusting `app.json` as the list of permissions.** Library manifests merge in more. Inspect the
  built APK.
- **Leaving `recordAudioAndroid` and the microphone description at their defaults in a scan-only
  camera feature.** Opt out explicitly.
- **Writing "This app needs access to your camera".** Explain the purpose in the user's terms.
- **Calling `requestPermission` again when `canAskAgain` is `false`.** Nothing happens. Offer
  `Linking.openSettings()` instead.
- **Checking permissions in Expo Go.** Expo Go's declarations are not yours.
- **Expecting an EAS Update to remove a permission.** Declarations are in the binary. Ship a new
  build.
- **Enabling background location "in case".** It is the most scrutinised permission on both stores
  and the most valuable to an attacker.

## Related topics

- [Permissions Patterns](../expo-sdk/permissions-patterns.md) — the request APIs across SDK modules.
- [Camera and Media](../expo-sdk/camera-and-media.md) — `expo-camera` and media library permissions.
- [Location](../expo-sdk/location.md) — foreground and background location.
- [The App Config](../expo-core-concepts/app-config.md) — `android.permissions`, `blockedPermissions` and `ios.infoPlist`.
- [Submission Checklists](../expo-build-and-release/submission-checklists.md) — permissions as a review item.
- [Dependency Auditing](dependency-auditing.md) — the code that could misuse a permission.
