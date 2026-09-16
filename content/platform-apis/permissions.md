---
title: Permissions
description: Checking and requesting runtime permissions on both platforms, the result states that actually matter, and the native configuration that decides whether your app crashes or prompts.
status: current
toolchain: cli
---

Every interesting platform API in this section is gated by a permission, and both platforms
gate them differently. Android asks at runtime and lets the user say "never ask again". iOS
asks once, ever, and then the only way back is the Settings app. Get this page right and the
rest of the section is mostly plumbing.

There is a second half that is easy to miss: **a permission prompt only appears if the native
project declares it.** On Android an undeclared permission is silently denied. On iOS a missing
usage-description string is not a denial — it is an immediate crash the moment your code
touches the API.

## Why it exists — and when NOT to use it

React Native ships `PermissionsAndroid`, which is exactly what its name says: an Android-only
wrapper around `ActivityCompat.requestPermissions`. It does not exist on iOS in any useful
form, and it has no concept of the iOS permission states.

`react-native-permissions` (5.6.1) is the cross-platform answer. One `check`, one `request`,
one result vocabulary for both platforms, plus the states that iOS has and Android does not
(`limited`, `unavailable`).

Use `PermissionsAndroid` when your app is Android-only and you want no extra dependency. Use
`react-native-permissions` for anything shipping on both platforms. Do not mix them for the
same permission — they report different vocabularies for the same underlying state and you
will write two incompatible branches.

The best time to use either is **as late as possible**. A permission requested on first launch,
before the user knows what the app does, gets denied at a far higher rate than the same
permission requested at the moment the feature needs it.

## Basic example

```tsx title=src/permissions/camera.ts
import {Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import type {Permission, PermissionStatus} from 'react-native-permissions';

// Resolve the platform-specific constant once. The two platforms use different
// identifier strings for the same capability.
const CAMERA: Permission =
  Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

export async function ensureCameraPermission(): Promise<PermissionStatus> {
  const current = await check(CAMERA);

  // `denied` is the only state where requesting can still change anything.
  // Requesting while `blocked` resolves immediately with `blocked` again.
  if (current !== RESULTS.DENIED) {
    return current;
  }

  return request(CAMERA, {
    // Android only: shown before the system dialog, and only when Android says
    // the user has already refused once.
    title: 'Camera access',
    message: 'Scanning a receipt needs the camera. Nothing is uploaded.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
}
```

The Android-only equivalent, using core, for comparison:

```tsx title=src/permissions/camera.android.ts
import {PermissionsAndroid, Platform} from 'react-native';

export async function requestCameraAndroid(): Promise<boolean> {
  // PermissionsAndroid is a no-op stub off Android. Guard so the call site
  // does not silently believe it was denied.
  if (Platform.OS !== 'android') {
    throw new Error('requestCameraAndroid is Android-only');
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera access',
    message: 'Scanning a receipt needs the camera.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}
```

Note the difference in return types. Core's `request` resolves to
`'granted' | 'denied' | 'never_ask_again'`; `react-native-permissions` resolves to a five-state
union. That difference is the whole reason the library exists.

## Native configuration

Nothing above prompts anyone until the native projects declare the permission. This is the
step that turns into a bug report titled "the dialog never appears".

:::tabs
@tab iOS

Two separate things are required, and both are easy to do halfway.

First, tell the library's Podfile helper which permission handlers to compile in. By default
**none** are compiled — this is deliberate, because App Store review rejects binaries that link
frameworks the app does not use.

```ruby title=ios/Podfile
def node_require(script)
  # Resolve script with node to allow for hoisting
  require Pod::Executable.execute_command('node', ['-p',
    "require.resolve(
      '#{script}',
      {paths: [process.argv[1]]},
    )", __dir__]).strip
end

node_require('react-native/scripts/react_native_pods.rb')
node_require('react-native-permissions/scripts/setup.rb')

platform :ios, min_ios_version_supported
prepare_react_native_project!

# Only the handlers listed here are compiled into the binary.
setup_permissions([
  'Camera',
  'LocationWhenInUse',
  'Notifications',
])
```

Re-run `bundle exec pod install` every time you change that list.

Second, add a usage description for each permission. The string is shown verbatim in the
system dialog, so write it for a human, not for the compiler.

```xml title=ios/AwesomeProject/Info.plist
<key>NSCameraUsageDescription</key>
<string>Used to scan receipts. Photos stay on your device.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to find stores near you while the app is open.</string>
```

@tab Android

Every permission you intend to request must be declared in the manifest. A permission that is
not declared is treated as permanently denied, with no dialog and no error.

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <uses-permission android:name="android.permission.CAMERA" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

  <application ...>
    <!-- … -->
  </application>
</manifest>
```

There is no per-permission Gradle step and no equivalent of `setup_permissions` — the manifest
is the whole of it. Libraries merge their own `<uses-permission>` entries into your manifest at
build time, which is why a release build can request something you never wrote down. Check the
merged manifest, not your source file: `android/app/build/intermediates/merged_manifests/`.

:::

> [!DANGER] A missing iOS usage description is a crash, not a denial
> If `NSCameraUsageDescription` is absent and your code opens the camera, iOS terminates the
> process immediately with `This app has crashed because it attempted to access privacy-sensitive
> data without a usage description`. It is not catchable from JavaScript, it does not reproduce
> on Android, and it will reach production if nobody runs the iOS build of that screen.

## How it works

### Check and request are not interchangeable

`check` reads the current state without showing anything to the user. `request` may show the
system dialog — **once**. After the OS has recorded a decision, `request` resolves immediately
with the recorded value and shows nothing.

That means `request` is not a way to "ask again". Calling it in a retry loop produces an
invisible loop that always resolves the same way.

### The five result states

`react-native-permissions` reports one of five values, exported as `RESULTS`:

| State | Meaning | What you should do |
| --- | --- | --- |
| `unavailable` | The feature is not available on this device, or the handler was not compiled in | Hide the feature. Do not show an error |
| `denied` | Not requested yet, or refused but still requestable | This is the only state where `request` can do anything |
| `granted` | Granted | Use the feature |
| `limited` | Granted with limits — iOS only, for Contacts, PhotoLibrary, PhotoLibraryAddOnly and Notifications | Use the feature with the subset the user chose |
| `blocked` | Refused and not requestable | Send the user to Settings, or hide the feature |

`unavailable` deserves attention because it is the state people forget. On iOS it is what you
get when the permission was not listed in `setup_permissions`, so a missing Podfile entry looks
exactly like a device without a camera.

### `blocked` is where the user experience goes wrong

Once a permission is `blocked`, no API call can bring the dialog back. The only path is the
system Settings app:

```tsx title=src/permissions/openAppSettings.ts
import {Alert} from 'react-native';
import {openSettings} from 'react-native-permissions';

export function promptToOpenSettings(feature: string): void {
  Alert.alert(
    `${feature} is turned off`,
    `Turn it back on in Settings to use this. You can turn it off again at any time.`,
    [
      {text: 'Not now', style: 'cancel'},
      {text: 'Open Settings', onPress: () => void openSettings()},
    ],
  );
}
```

`openSettings()` leaves your app. When the user comes back, your cached permission state is
stale — re-check it on `AppState` change rather than trusting what you read before.

```tsx title=src/permissions/useRecheckOnForeground.ts
import {useEffect} from 'react';
import {AppState} from 'react-native';

export function useRecheckOnForeground(recheck: () => void): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        recheck();
      }
    });
    return () => sub.remove();
  }, [recheck]);
}
```

### Rationale is an Android-only mechanism

The second argument to `request` is a `Rationale`. It is only used on Android, and only when
the platform reports that the user has already refused once. It can be the built-in `Alert`
shape, or a function returning `Promise<boolean>` so you can render your own screen:

```tsx title=src/permissions/requestWithCustomRationale.ts
import {request, PERMISSIONS} from 'react-native-permissions';
import type {PermissionStatus} from 'react-native-permissions';

export function requestMicrophone(
  showExplainer: () => Promise<boolean>,
): Promise<PermissionStatus> {
  // The function form lets you show a real screen instead of a system Alert.
  // Resolve false to skip the system dialog entirely.
  return request(PERMISSIONS.ANDROID.RECORD_AUDIO, showExplainer);
}
```

On iOS there is no equivalent hook, because iOS shows its dialog exactly once. The
`NSCameraUsageDescription` string **is** your rationale, and you get one attempt at writing it.

## Platform differences

:::tabs
@tab iOS

- The system dialog appears **once per install**. A second `request` resolves with the stored
  answer and shows nothing.
- A user who denies is `blocked` from then on. There is no `never_ask_again` state because
  every denial is permanent.
- `limited` is real and common: with Photos, a user can grant access to selected images only.
  Treat it as granted-with-a-smaller-set, not as a failure. `openPhotoPicker()` lets them
  extend the selection.
- Location has two separate permissions (`LOCATION_WHEN_IN_USE` and `LOCATION_ALWAYS`) and
  a separate accuracy dimension — see [Geolocation](geolocation.md).
- Deleting and reinstalling the app resets the state, which is the only reliable way to
  re-test the first-run flow on a device.

@tab Android

- `check` **never** returns `blocked`. Android cannot distinguish "not asked yet" from
  "permanently refused" without attempting the request, so you only learn about `blocked` from
  `request`.
- Core `PermissionsAndroid` calls the same state `never_ask_again`.
- Refusing twice sets the permanent state on modern Android. The first refusal is recoverable
  and is when the rationale is shown.
- Some capabilities are not runtime permissions at all — `POST_NOTIFICATIONS` only became one
  in Android 13 (API 33), and on older versions it is granted implicitly. See
  [Push and Local Notifications](notifications.md).
- Permission groups no longer grant each other. Requesting `ACCESS_FINE_LOCATION` does not
  give you `ACCESS_BACKGROUND_LOCATION`.

:::

## Common patterns

### Request a group in one dialog sequence

```tsx title=src/permissions/requestCall.ts
import {requestMultiple, PERMISSIONS, RESULTS} from 'react-native-permissions';

export async function requestVideoCallPermissions(): Promise<boolean> {
  const result = await requestMultiple([
    PERMISSIONS.ANDROID.CAMERA,
    PERMISSIONS.ANDROID.RECORD_AUDIO,
  ]);

  return (
    result[PERMISSIONS.ANDROID.CAMERA] === RESULTS.GRANTED &&
    result[PERMISSIONS.ANDROID.RECORD_AUDIO] === RESULTS.GRANTED
  );
}
```

`requestMultiple` is typed so the returned record is keyed by exactly the permissions you
passed, which means a typo in the lookup is a compile error rather than an `undefined` at
runtime.

### Model the three outcomes, not two

A permission is not a boolean. Code that branches on `granted` versus everything else produces
the classic dead end where the user taps a button that silently does nothing.

```tsx title=src/screens/ScanScreen.tsx
import {useCallback, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {check, request, openSettings, PERMISSIONS, RESULTS} from 'react-native-permissions';

type Gate = 'unknown' | 'ready' | 'ask' | 'settings' | 'unsupported';

export function ScanScreen() {
  const [gate, setGate] = useState<Gate>('unknown');

  const evaluate = useCallback(async () => {
    const status = await check(PERMISSIONS.IOS.CAMERA);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return setGate('ready');
    if (status === RESULTS.DENIED) return setGate('ask');
    if (status === RESULTS.BLOCKED) return setGate('settings');
    return setGate('unsupported');
  }, []);

  const ask = useCallback(async () => {
    const status = await request(PERMISSIONS.IOS.CAMERA);
    setGate(status === RESULTS.GRANTED ? 'ready' : 'settings');
  }, []);

  return (
    <View style={styles.wrap}>
      {gate === 'unknown' && (
        <Pressable onPress={evaluate} accessibilityRole="button">
          <Text>Check camera access</Text>
        </Pressable>
      )}
      {gate === 'ask' && (
        <Pressable onPress={ask} accessibilityRole="button">
          <Text>Allow camera access</Text>
        </Pressable>
      )}
      {gate === 'settings' && (
        <Pressable onPress={() => void openSettings()} accessibilityRole="button">
          <Text>Camera access is off. Open Settings</Text>
        </Pressable>
      )}
      {gate === 'unsupported' && <Text>This device has no usable camera.</Text>}
      {gate === 'ready' && <Text>Ready to scan.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24},
});
```

### Ask in context, not at launch

Show a plain screen explaining the benefit, with your own "Continue" button, and call `request`
from that button. The system dialog then arrives with context already established. This costs
one extra screen and measurably raises grant rates, and on iOS it is the difference between
one shot and one wasted shot.

## Security considerations

**Threat.** A permission is a capability granted to your process, not to a feature. If the app
is compromised — a malicious dependency in the bundle, a stolen signing key, a supply-chain
attack on a transitive package — the attacker inherits every permission the user granted. An
app with `ACCESS_FINE_LOCATION`, `RECORD_AUDIO` and `READ_CONTACTS` is a far richer target than
one with none, regardless of how carefully your own code uses them.

**Exploit.** Permissions are also visible before installation and are trivially enumerable
afterwards. Anyone can read what your app asks for straight out of the APK:

```bash
# Pull the APK off a connected device and list what it declares.
adb shell pm path com.awesomeproject
adb pull /data/app/.../base.apk
aapt dump permissions base.apk
```

If that list contains permissions no feature uses — because a dependency merged them in, or
because someone copied a manifest from a tutorial — you are carrying risk and review friction
for nothing. The same applies on iOS: the usage-description strings are readable in the app
bundle's `Info.plist`.

**Fix.** Least privilege, enforced at build time.

1. Declare only what a shipped feature uses. Delete the rest from `AndroidManifest.xml` and
   from `setup_permissions`.
2. Prefer the narrower permission. `ACCESS_COARSE_LOCATION` instead of `ACCESS_FINE_LOCATION`
   when a city-level fix is enough; `PHOTO_LIBRARY_ADD_ONLY` instead of `PHOTO_LIBRARY` when you
   only save images.
3. Remove a permission that a library merged in but you do not use, with an explicit override:

```xml title=android/app/src/main/AndroidManifest.xml
<manifest
  xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools">

  <!-- A dependency declares this; this app never records audio. -->
  <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove" />
</manifest>
```

**Verification.** Build a release APK and diff the merged manifest against the list you
intended. Anything that appears and is not on your list came from a dependency, and you should
know which one:

```bash
cd android && ./gradlew :app:assembleRelease
# The merged manifest is written next to the build outputs.
grep uses-permission app/build/intermediates/merged_manifests/release/AndroidManifest.xml
```

On iOS, `plutil -p ios/build/.../AwesomeProject.app/Info.plist` prints the shipped keys; every
`NS*UsageDescription` in there is a permission your users will see you ask for.

## Common mistakes

- **Requesting everything on first launch.** Wrong: a wall of four dialogs before the user has
  seen a screen. Right: request each permission at the moment the feature needs it. On iOS a
  denial at that point is permanent, so you get exactly one chance per permission.
- **Treating the result as a boolean.** Wrong: `if (status === 'granted') { … } else { retry() }`.
  Right: branch on all of `granted`, `denied`, `blocked` and `unavailable`. The retry branch is
  invisible to the user and resolves identically every time.
- **Calling `check` on Android and expecting `blocked`.** Wrong: assuming `check` can tell you
  the user permanently refused. Right: `check` never returns `blocked` on Android — only
  `request` can report it.
- **Forgetting `setup_permissions` on iOS.** Wrong: adding `NSCameraUsageDescription` and
  wondering why every check returns `unavailable`. Right: the handler must also be listed in
  the Podfile and `pod install` re-run.
- **Shipping without the iOS usage description.** Wrong: testing only on Android and finding
  out in review. Right: run the iOS build of every permission-gated screen at least once — the
  failure mode is a hard crash, not a denial.
- **Caching the status across a trip to Settings.** Wrong: reading the status once at mount.
  Right: re-check when `AppState` returns to `active`, because the user may have changed it
  while your app was backgrounded.
- **Mixing `PermissionsAndroid` and `react-native-permissions` for the same permission.**
  Wrong: `never_ask_again` in one code path and `blocked` in another. Right: pick one vocabulary
  per app.

## Related topics

- [Camera](camera.md) — the permission-heaviest API in the section.
- [Geolocation](geolocation.md) — foreground, background and the iOS "Always" escalation.
- [Push and Local Notifications](notifications.md) — the Android 13 `POST_NOTIFICATIONS` runtime permission.
- [Biometrics](biometrics.md) — Face ID needs its own usage description.
- [Permissions Hygiene](../security/permissions-hygiene.md) — least privilege as a review item.
- [Threat Model](../security/threat-model.md) — what an attacker inherits when the app is compromised.
- [Platform Differences](../core-concepts/platform-differences.md) — the general shape of iOS/Android divergence.
