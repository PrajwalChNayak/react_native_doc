---
title: Geolocation
description: Getting the device's position with @react-native-community/geolocation, plus the foreground/background split and the extra justification iOS demands for "Always".
status: current
toolchain: cli
---

**React Native 0.87 does not export a geolocation API.** There is no `Geolocation` value in the
Strict API type surface, and no `navigator.geolocation` polyfill installed for you. Grep the
installed types yourself if you want to confirm it:

```bash
grep -ri "geolocation" tools/typecheck/node_modules/react-native/types_generated/
```

That search returns nothing. The API used to live in core and was extracted to the community
long before 0.82. Any tutorial that calls `navigator.geolocation.getCurrentPosition` in a fresh
project is describing a React Native that no longer exists.

The maintained replacement is **`@react-native-community/geolocation` 3.4.0**. It ships a
Codegen spec (`RNCGeolocationSpec`) and a `TurboModuleRegistry` entry, so it is a real
TurboModule rather than a legacy module running through the interop layer.

## Why it exists — and when NOT to use it

Location is the permission users are most suspicious of, and the one platform vendors police
hardest. Both app stores require a written justification for background access, and iOS
re-prompts users about apps that keep taking location in the background.

Use it when the position genuinely changes the product: finding nearby things, attaching a
place to a record, showing the user where they are. Do not use it for analytics, for
"personalisation", or to infer a country — an IP-based country guess on your server costs no
permission and no review friction.

If all you need is a coarse region, request `ACCESS_COARSE_LOCATION` only. It is a
meaningfully smaller ask, users grant it more often, and iOS exposes the same idea as reduced
accuracy.

## Installation

:::tabs
@tab npm
```bash
npm install @react-native-community/geolocation
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add @react-native-community/geolocation
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add @react-native-community/geolocation
cd ios && bundle exec pod install
```
:::

## Native configuration

:::tabs
@tab iOS

Foreground use needs one key. If the keys are missing, authorization requests **fail
immediately and silently** — no dialog, no error you can see, just an error callback you will
probably have ignored.

```xml title=ios/AwesomeProject/Info.plist
<key>NSLocationWhenInUseUsageDescription</key>
<string>Used to show shops near you while the app is open.</string>
```

Background or "Always" access needs a second key **and** a background mode. iOS treats this as
a separate, higher-cost grant and the string is shown in a distinct dialog, often days later.

```xml title=ios/AwesomeProject/Info.plist
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Used to remind you about a delivery when you arrive, even if the app is closed.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

For the temporary precise-location escalation (asking a user on reduced accuracy for one full
fix), add a purpose dictionary. The key you invent here is the string you pass at runtime:

```xml title=ios/AwesomeProject/Info.plist
<key>NSLocationTemporaryUsageDescriptionDictionary</key>
<dict>
  <key>PreciseDeliveryPin</key>
  <string>Used once to place your delivery pin accurately.</string>
</dict>
```

@tab Android

Declare the accuracy level you need. `ACCESS_FINE_LOCATION` implies coarse; declaring both is
the conventional pairing because Android 12+ lets the user downgrade a fine request to coarse
from the dialog itself.

```xml title=android/app/src/main/AndroidManifest.xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

  <!-- Only for location while the app is not in the foreground. -->
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

  <!-- Android 14+: a foreground service that uses location needs its own type. -->
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

  <application ...>
    <!-- … -->
  </application>
</manifest>
```

`ACCESS_BACKGROUND_LOCATION` cannot be requested in the same dialog as the foreground
permission. Android requires the foreground grant first, then a separate request that sends
the user to a settings screen to pick "Allow all the time".

:::

> [!DANGER] Both stores review background location by hand
> Declaring `ACCESS_BACKGROUND_LOCATION` or the `location` background mode triggers a manual
> review with a written justification and, on Google Play, often a demo video. Declaring it
> "just in case" will hold up a release for a feature you do not ship.

## Basic example

```ts-fragment title=src/location/currentPosition.ts
import Geolocation from '@react-native-community/geolocation';
import type {GeolocationResponse, GeolocationError} from '@react-native-community/geolocation';

export function getCurrentPosition(): Promise<GeolocationResponse> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position: GeolocationResponse) => resolve(position),
      (error: GeolocationError) => reject(error),
      {
        // High accuracy means GPS: slower, and a visible battery cost.
        enableHighAccuracy: false,
        // Give up rather than hanging forever when there is no fix.
        timeout: 15_000,
        // Accept a fix up to a minute old instead of waking the radio.
        maximumAge: 60_000,
      },
    );
  });
}
```

The callback API is the original browser-style one, so wrapping it in a promise as above is the
first thing most projects do.

> [!NOTE] Why these blocks are not type-checked
> `@react-native-community/geolocation` is not installed in this repository's type-check
> harness, so its blocks are tagged `ts-fragment` / `tsx-fragment`. The signatures shown were
> read from the published `3.4.0` type definitions.

## How it works

### The API surface

| Function | Purpose |
| --- | --- |
| `getCurrentPosition(success, error?, options?)` | One fix, via callbacks |
| `watchPosition(success, error?, options?)` | Subscribe to updates; returns a numeric watch id |
| `clearWatch(watchID)` | Stop a subscription |
| `requestAuthorization(success?, error?)` | Trigger the permission prompt without asking for a fix |
| `setRNConfiguration(config)` | Set `skipPermissionRequests`, `authorizationLevel`, `locationProvider`, `enableBackgroundLocationUpdates` |

`GeolocationOptions` accepts `timeout`, `maximumAge`, `enableHighAccuracy`, `distanceFilter`,
`useSignificantChanges` (iOS) and `interval` / `fastestInterval` (Android).

A `GeolocationResponse` is `{coords: {latitude, longitude, altitude, accuracy, altitudeAccuracy,
heading, speed}, timestamp}`. Note that `altitude`, `altitudeAccuracy`, `heading` and `speed`
are nullable — a fix from a cell tower has none of them.

### Watching, and cleaning up

`watchPosition` keeps the location hardware engaged. An unmatched watch is a battery bug that
survives navigation, and it is the single most common mistake on this page.

```tsx-fragment title=src/location/useWatchPosition.ts
import {useEffect, useState} from 'react';
import Geolocation from '@react-native-community/geolocation';
import type {GeolocationResponse} from '@react-native-community/geolocation';

export function useWatchPosition(enabled: boolean) {
  const [position, setPosition] = useState<GeolocationResponse | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const watchId = Geolocation.watchPosition(
      setPosition,
      error => console.warn('location error', error.message),
      {
        enableHighAccuracy: true,
        // Only deliver an update once the device has moved 25 metres. This does
        // far more for battery than lowering the update interval.
        distanceFilter: 25,
      },
    );

    return () => Geolocation.clearWatch(watchId);
  }, [enabled]);

  return position;
}
```

`enabled` exists so the watch stops when the screen loses focus. Tie it to your navigator's
focus state rather than leaving it on for the lifetime of the component.

### Errors are a code, not an exception

The error callback receives `{code, message, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT}`.
The three named constants are the values `code` can take. Handle them separately — a timeout
indoors is normal and should retry or degrade, while a permission denial should change the UI.

```ts-fragment title=Distinguishing the three failures
import type {GeolocationError} from '@react-native-community/geolocation';

export function describe(error: GeolocationError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access is off. Turn it on in Settings.';
    case error.POSITION_UNAVAILABLE:
      return 'No location signal here. Try again outdoors.';
    case error.TIMEOUT:
      return 'Getting your location took too long.';
    default:
      return error.message;
  }
}
```

## Foreground versus background

These are different features with different costs, and conflating them is how apps get
rejected.

| | Foreground | Background |
| --- | --- | --- |
| iOS permission | When In Use | Always (a second, separate prompt) |
| iOS config | `NSLocationWhenInUseUsageDescription` | Also `NSLocationAlwaysAndWhenInUseUsageDescription` and `UIBackgroundModes: location` |
| Android permission | `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Also `ACCESS_BACKGROUND_LOCATION`, granted only from a settings screen |
| Store review | Routine | Manual, with written justification |
| Battery | Bounded by screen time | Unbounded; the usual cause of a one-star review |

**iOS "Always" is not something you request up front.** The supported flow is to get When In
Use first, ship the feature, and let iOS escalate: after the app has used location in the
background a few times, the system shows its own prompt asking whether to keep allowing it. An
app that demands Always on first launch gets denied by users and questioned in review.

On the library, `setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse'})`
controls which level is requested on iOS. Leave it at `'whenInUse'` unless the app has a
shipped background feature.

**Android background is a separate trip.** The foreground permission must be granted first;
only then can `ACCESS_BACKGROUND_LOCATION` be requested, and the system sends the user to a
settings page rather than showing an in-app dialog. Getting a location fix while the app is
backgrounded for any sustained period also means a foreground service with the `location`
type — which is native work, not a JavaScript timer. See
[Background Tasks](background-tasks.md).

## Platform differences

:::tabs
@tab iOS

- Users can grant **reduced accuracy**, which returns a fix deliberately blurred to a few
  kilometres. Your code still gets a position; check `coords.accuracy` before trusting it for
  anything like "nearest store".
- The one-time precise escalation needs `NSLocationTemporaryUsageDescriptionDictionary` with
  your own purpose key. If you use `react-native-permissions`, `requestLocationAccuracy({purposeKey})`
  drives it.
- `useSignificantChanges: true` switches to the significant-location-change service: far
  cheaper, updates roughly every 500 metres, and can relaunch a terminated app.
- Missing usage-description keys make authorization fail silently rather than throwing.

@tab Android

- `locationProvider` picks between Google Play Services fused location (`'playServices'`) and
  the platform API (`'android'`). `'auto'` defaults to the platform API. Fused location is more
  accurate and more power-efficient where Play Services exists — which is not everywhere, and
  not on many devices sold in China.
- Android 12+ lets the user downgrade a fine-location request to coarse from inside the dialog.
  A granted `ACCESS_FINE_LOCATION` request can still yield coarse fixes.
- The device-wide location toggle is separate from the app permission. A granted app permission
  with location services off produces `POSITION_UNAVAILABLE`, not a permission error.
- Doze and app standby throttle updates aggressively for a backgrounded app. Update intervals
  are a request, not a guarantee.

:::

## Performance considerations

- **`distanceFilter` beats a shorter interval.** Filtering by movement means the radio stays
  idle while the user is stationary, which is most of the time.
- **`enableHighAccuracy: false` is the right default.** GPS is the expensive path. Turn it on
  for the screen that needs a precise pin, not for the app.
- **Use `maximumAge`.** Accepting a cached fix avoids waking the hardware at all for the common
  case of "roughly where am I".
- **One watch, one owner.** Multiple components each starting a watch multiply the cost.
  Subscribe once, share through context or a store — see [Context](../state-and-data/context.md).
- **Stop on blur.** A watch that keeps running on a screen the user navigated away from is pure
  battery waste with no product benefit.

## Security considerations

**Threat.** Location is the most sensitive routine data a phone app handles. A history of
positions reveals home address, workplace, place of worship, and medical appointments. The
threat is not only an attacker reading it — it is your own app storing or transmitting more of
it than the feature requires, where a breach or a careless third-party SDK then exposes it.

**Exploit.** The common failure is location written into ordinary storage or logs. Coordinates
in `AsyncStorage` are unencrypted plaintext on disk; on a rooted device, or via a backup, they
are trivially readable:

```bash
# AsyncStorage is a plain database in the app sandbox.
adb shell run-as com.awesomeproject \
  sqlite3 databases/RKStorage "select * from catalystLocalStorage;"
```

The second exploit is a log line. `console.log(position)` in a release build writes coordinates
to the system log, where other diagnostics tooling collects them.

**Fix.**

1. **Do not persist a track you do not need.** Keep the current fix in memory. If you must
   store history, store the minimum — the last known coarse region rather than a timestamped
   trail.
2. **Reduce precision before it leaves the device.** Rounding to three decimal places is about
   110 metres, which is enough for "shops near me" and is not enough to identify a house.

```ts title=src/location/coarsen.ts
/** Round to ~110m so a stored or transmitted fix cannot identify an address. */
export function coarsen(latitude: number, longitude: number) {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {latitude: round(latitude), longitude: round(longitude)};
}
```

3. **If a precise trail must be stored, store it in the Keychain/Keystore**, not AsyncStorage —
   see [Secure Storage](../state-and-data/secure-storage.md).
4. **Strip location before sharing.** Photo EXIF and analytics payloads both leak it by
   accident; see [Camera](camera.md).

**Verification.** Run the flow, then inspect what landed on disk and on the wire. For storage,
the `run-as` command above; for the network, capture your own traffic with a proxy and confirm
that no request carries full-precision coordinates you did not intend to send — see
[Network Inspection](../debugging/network-inspection.md). Then grep a release bundle for your
logging calls to be sure none of them print a position.

## Common mistakes

- **Reaching for `navigator.geolocation`.** Wrong: assuming core still provides it. Right: there
  is no geolocation API in `react-native` 0.87 — install the community package.
- **Never calling `clearWatch`.** Wrong: starting a watch in `useEffect` with no cleanup. Right:
  return `() => Geolocation.clearWatch(id)`. The symptom is battery drain that nobody attributes
  to your screen.
- **Requesting Always on first launch.** Wrong: asking for background location before the user
  has used the app. Right: ship the When In Use feature first and let iOS escalate.
- **Requesting background location in the same call as foreground on Android.** Wrong: putting
  `ACCESS_BACKGROUND_LOCATION` in the same `requestMultiple` array. Right: foreground first,
  then a separate request that opens a settings screen.
- **Trusting `accuracy` without reading it.** Wrong: rendering a precise pin from a fix with
  `accuracy: 3000`. Right: check `coords.accuracy` — iOS reduced accuracy and Android coarse
  location both return real-looking coordinates that are kilometres off.
- **`enableHighAccuracy: true` everywhere.** Wrong: turning on GPS for a "nearby" list. Right:
  reserve it for the one screen that needs metre-level precision.
- **Treating a timeout as an error state.** Wrong: showing "location failed" when the user is
  indoors. Right: distinguish `TIMEOUT` from `PERMISSION_DENIED` and degrade rather than block.

## Related topics

- [Permissions](permissions.md) — check, request, and the blocked-to-Settings flow.
- [Background Tasks](background-tasks.md) — why sustained background location needs native code.
- [Camera](camera.md) — location tagging on captures.
- [Secure Storage](../state-and-data/secure-storage.md) — where a location history belongs if you keep one.
- [Permissions Hygiene](../security/permissions-hygiene.md) — least privilege applied to the manifest.
- [Background Refresh](../state-and-data/background-refresh.md) — what the OS lets a backgrounded app do.
