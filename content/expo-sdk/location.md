---
title: Location
description: expo-location in an Expo SDK 57 app — foreground position and watching, geocoding, and background location and geofencing through TaskManager, with the permission escalation and store review it triggers.
status: current
toolchain: expo
sdk: 57
---

`expo-location` reads the device's position, watches it as the user moves, converts between addresses
and coordinates, and — with `expo-task-manager` — keeps receiving locations and geofence events while the
app is in the background.

```bash
npx expo install expo-location
```

That resolves `expo-location@~57.0.17` on SDK 57. Background location also needs
`npx expo install expo-task-manager` (`~57.0.17`). See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use foreground location for "near me" search, filling in an address, or showing the user on a map.

Think hard before using **background** location. It is the most scrutinised permission on both
platforms: it needs a second, separate user grant, a visible indicator or foreground-service
notification, and an explicit justification in both App Store and Google Play review. If your feature
works with "while using the app", ship that.

Do **not** use location as:

- **An identity or anti-fraud signal.** The user controls the device, and `mocked` positions exist.
- **A precise trigger for time-critical work.** Background updates and geofence events are delivered when
  the OS decides, not instantly.

## Expo Go vs development build

**Foreground location works in Expo Go. Background location and geofencing need a development build.**

The Expo documentation states that background location is not available in Expo Go for Android and is
not supported in the Expo Go app on iOS. Background location depends on `UIBackgroundModes`, Android
foreground-service permissions and your own usage strings — all properties of your binary, not Expo Go's.
See [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md).

## Basic example

```ts title=lib/currentPosition.ts
import * as Location from 'expo-location';

export async function getCurrentCoords(): Promise<{latitude: number; longitude: number} | null> {
  const {granted} = await Location.requestForegroundPermissionsAsync();
  if (!granted) {
    return null;
  }

  // A cached fix is instant and often good enough. Fall back to a fresh one.
  const last = await Location.getLastKnownPositionAsync({maxAge: 60_000});
  const position =
    last ?? (await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced}));

  return {latitude: position.coords.latitude, longitude: position.coords.longitude};
}
```

## How it works

### Permissions come in two tiers

| Function | Grants |
| --- | --- |
| `requestForegroundPermissionsAsync()` / `useForegroundPermissions()` | Location while the app is in use. |
| `requestBackgroundPermissionsAsync()` / `useBackgroundPermissions()` | Location while the app is backgrounded. **Requires foreground first.** |

The foreground response carries platform detail: `ios.scope` (`'whenInUse'`, `'always'`, `'none'`) and
`android.accuracy` (`'fine'`, `'coarse'`, `'none'`). A user can grant **approximate** location only, so
check `android.accuracy` — or the size of `coords.accuracy` — before assuming street-level precision.

On Android 11+, the background grant is not a dialog button: the system sends the user to the app's
location settings to pick "Allow all the time". Explain why before you call it.

### Reading position

| Function | Use it for |
| --- | --- |
| `getLastKnownPositionAsync({maxAge?, requiredAccuracy?})` | A fast, possibly stale fix. May resolve `null`. |
| `getCurrentPositionAsync({accuracy?})` | A fresh fix. Can take several seconds. |
| `watchPositionAsync(options, callback, errorHandler?)` | Continuous updates while the app is foregrounded. |
| `getHeadingAsync()` / `watchHeadingAsync(cb)` | Compass heading. |
| `hasServicesEnabledAsync()` | Whether location services are on at all. |

`Accuracy` runs from `Lowest` through `Low`, `Balanced`, `High`, `Highest` to `BestForNavigation`. Higher
accuracy costs more battery and takes longer to settle.

A `LocationObject` is `{coords, timestamp, mocked?}`, where `coords` has `latitude`, `longitude`, and
nullable `altitude`, `accuracy`, `altitudeAccuracy`, `heading` and `speed`.

### Watching position

```tsx title=components/LiveDistance.tsx
import * as Location from 'expo-location';
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export function LiveSpeed() {
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const {granted} = await Location.requestForegroundPermissionsAsync();
      if (!granted || cancelled) {
        return;
      }
      subscription = await Location.watchPositionAsync(
        // Distance and time filters are what keep this from draining the
        // battery: without them you get every fix the chip produces.
        {accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000},
        (location) => setSpeed(location.coords.speed),
      );
      // The component may have unmounted while we awaited.
      if (cancelled) {
        subscription.remove();
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return <Text>{speed === null ? '—' : `${speed.toFixed(1)} m/s`}</Text>;
}
```

### Geocoding

`geocodeAsync(address)` resolves coordinates and `reverseGeocodeAsync({latitude, longitude})` resolves
`LocationGeocodedAddress` objects (`street`, `city`, `region`, `postalCode`, `country`, …, all nullable).
Both use the platform geocoder, need a network connection, and are rate-limited by the OS — do not call
them in a loop or on every position update.

### Background location and geofencing

Background delivery goes to a task defined with `TaskManager.defineTask`, not to a callback. The task must
be defined at **module scope**, because the OS can launch your app headless, straight into it.

```ts title=tasks/locationTask.ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK = 'background-location';

type LocationTaskData = {locations: Location.LocationObject[]};

// Module scope, imported from the app entry point. Defining this inside a
// component means it does not exist when the OS wakes the app headless.
TaskManager.defineTask<LocationTaskData>(LOCATION_TASK, async ({data, error}) => {
  if (error) {
    return;
  }
  const latest = data.locations.at(-1);
  if (latest) {
    await fetch('https://api.example.com/trips/points', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(latest.coords),
    });
  }
});

export async function startTripTracking(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    return false;
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) {
    return false;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    // iOS: show the blue status-bar indicator while tracking.
    showsBackgroundLocationIndicator: true,
    // Android: a foreground service with a visible notification is what
    // keeps updates flowing once the app is in the background.
    foregroundService: {
      notificationTitle: 'Recording your trip',
      notificationBody: 'Tap to return to the app.',
    },
  });
  return true;
}

export async function stopTripTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
```

Geofencing uses the same mechanism. The task receives `{eventType, region}`:

```ts title=tasks/geofenceTask.ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const GEOFENCE_TASK = 'store-geofence';

type GeofenceData = {eventType: Location.GeofencingEventType; region: Location.LocationRegion};

TaskManager.defineTask<GeofenceData>(GEOFENCE_TASK, async ({data, error}) => {
  if (error) {
    return;
  }
  if (data.eventType === Location.GeofencingEventType.Enter) {
    console.log('Entered', data.region.identifier);
  }
});

export async function watchStores(): Promise<void> {
  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    {identifier: 'store-12', latitude: 51.5074, longitude: -0.1278, radius: 150},
  ]);
}
```

The OS caps how many regions an app can monitor at once and fires events with a delay; small radii
are unreliable. Treat geofences as hints.

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Show stores near you.",
          "locationAlwaysAndWhenInUsePermission": "Record your route while the app is in the background during a trip.",
          "isIosBackgroundLocationEnabled": true
        }
      ]
    ]
  }
}
```

| Plugin option | Effect |
| --- | --- |
| `locationWhenInUsePermission` | `NSLocationWhenInUseUsageDescription` |
| `locationAlwaysAndWhenInUsePermission` | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| `locationAlwaysPermission` | `NSLocationAlwaysUsageDescription` — deprecated by Apple; set the key above instead |
| `motionUsagePermission` | `NSMotionUsageDescription`, for the motion-activity APIs |
| `isIosBackgroundLocationEnabled` | Adds `location` to `UIBackgroundModes` |

> [!DANGER] A missing location usage string is an instant crash
> Requesting location without `NSLocationWhenInUseUsageDescription` (and, for background,
> `NSLocationAlwaysAndWhenInUseUsageDescription`) in `Info.plist` terminates the app. The plugin writes
> generic defaults if you omit the options — replace them with a real reason, because App Review rejects
> vague location strings.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true,
          "androidForegroundServiceIcon": "./assets/location-service-icon.png"
        }
      ]
    ]
  }
}
```

| Plugin option | Adds |
| --- | --- |
| *(always)* | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` |
| `isAndroidBackgroundLocationEnabled` | `ACCESS_BACKGROUND_LOCATION` |
| `isAndroidForegroundServiceEnabled` | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` — defaults to the value of `isAndroidBackgroundLocationEnabled` |
| `isAndroidMotionActivityEnabled` | `ACTIVITY_RECOGNITION` |
| `androidForegroundServiceIcon` | A small icon for the foreground-service notification |

`ACCESS_BACKGROUND_LOCATION` triggers a declaration in the Google Play Console. Add it only if you really
track in the background.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Approximate location | User can turn off "Precise Location" | User can grant coarse only (`android.accuracy === 'coarse'`) |
| Background grant | Prompt, possibly deferred by iOS until later | Settings screen on Android 11+ |
| Keeping updates alive in background | `UIBackgroundModes` `location` | Foreground service with a notification |
| Background indicator | `showsBackgroundLocationIndicator` | The foreground-service notification |
| Store review | App Review justification for background use | Play Console background-location declaration |
| Expo Go background support | No | No |

## Common patterns

### Asking for background only when the feature starts

Ask for foreground location when the user opens a location feature; ask for background only when they
start the feature that needs it — "Start trip" — after a screen explaining why. Asking for both at launch
gets both refused. See [Permissions Patterns](permissions-patterns.md).

### Stop what you start

Background updates continue until you stop them, across app restarts. Call `stopLocationUpdatesAsync` when
the trip ends and on logout, and check `hasStartedLocationUpdatesAsync` on launch so a stale task from a
previous session does not run forever.

## Performance considerations

- **Use the lowest accuracy that works.** `Balanced` is usually enough for anything but navigation.
- **Always set `distanceInterval` and `timeInterval`** on watches and background updates.
- **Prefer `getLastKnownPositionAsync`** when a slightly stale fix is acceptable.
- **Batch network calls** in the background task; one request per fix wakes the radio constantly.

## Security considerations

**Threat.** Location history is among the most sensitive data an app holds: it reveals home, workplace,
routines and relationships. It leaks through analytics SDKs, logs, over-broad API responses, and apps
that keep tracking after the feature ends.

**Exploit.** A background task that posts every fix to an analytics endpoint, or a debug log line such as
`console.log(location)` left in a release build, sends a movement trace to anyone who can read those logs.
On Android, `adb logcat | grep -i latitude` on a device running such a build shows it directly.

**Fix.**

- Request background location only for a feature the user explicitly started, and stop it when that
  feature ends.
- Send the **minimum precision** the server needs; round coordinates for "nearby" features.
- Never pass raw coordinates to third-party analytics.
- Strip location logging from release builds.

**Verification.** Start and then stop your tracking feature, background the app, and confirm with
`Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)` that it resolves `false`. On Android, confirm the
foreground-service notification has disappeared, and run `adb logcat | grep -i -E "latitude|longitude"`
to confirm nothing is logged.

Also treat `mocked: true` on Android as a signal that the position is user-controlled — never as proof it
is not.

## Common mistakes

- **Testing background location in Expo Go.** It is not supported there on either platform.
- **Requesting background permission without foreground first.** It fails; foreground is a prerequisite.
- **Defining the task inside a component.** The OS wakes the app headless and the task does not exist.
  Define it at module scope and import it from the entry point.
- **No `foregroundService` on Android.** Updates stop shortly after the app is backgrounded.
- **Omitting `isIosBackgroundLocationEnabled`.** Without `location` in `UIBackgroundModes`, iOS stops
  delivering updates in the background.
- **Forgetting to remove a `watchPositionAsync` subscription.** It keeps the GPS on after the screen closes.
- **Assuming precise location.** The user may have granted approximate only.
- **Calling `reverseGeocodeAsync` on every update.** The OS geocoder is rate-limited.
- **Shipping generic usage strings.** App Review rejects them for location.
- **Never stopping background updates.** They survive app restarts until you call `stopLocationUpdatesAsync`.

## Related topics

- [Background Tasks](background-tasks.md) — `expo-task-manager` and what the OS actually guarantees.
- [Permissions Patterns](permissions-patterns.md) — staged requests, denials and the Settings screen.
- [Sensors](sensors.md) — heading, motion and step data without GPS.
- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — requesting the least you need.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — required for background location.
