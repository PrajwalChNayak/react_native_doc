---
title: Sensors
description: expo-sensors in an Expo SDK 57 app — accelerometer, gyroscope, magnetometer, barometer, light sensor, device motion and pedometer, with update intervals, units, and the platform limits that decide what you can build.
status: current
toolchain: expo
sdk: 57
---

`expo-sensors` exposes the device's motion and environment sensors as event streams: accelerometer,
gyroscope, magnetometer, barometer, light sensor, a fused `DeviceMotion` stream, and a pedometer. You
subscribe with a listener, set an update interval, and remove the subscription when you are done.

```bash
npx expo install expo-sensors
```

That resolves `expo-sensors@~57.0.3` on SDK 57. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

Use it for shake gestures, tilt controls, a spirit level, a compass needle, step counting while a screen
is open, or orientation-aware UI.

Do **not** use it for:

- **Screen orientation.** Use the `useWindowDimensions` hook or `expo-screen-orientation`; they report
  what the UI actually did, which is what layout needs.
- **Location or heading on a map.** `expo-location`'s `watchHeadingAsync` gives a calibrated compass
  heading; raw magnetometer values need calibration you would have to build.
- **Background step tracking.** Pedometer updates are not delivered while the app is in the background.
  On Android the package points to Health Connect instead; on iOS, query history with `getStepCountAsync`.

## Expo Go vs development build

**Works in Expo Go.** `expo-sensors` is included in Expo Go, so you can prototype there.

Your own `NSMotionUsageDescription` string, and turning the motion permission off with
`motionPermission: false`, only take effect in a
[development build](../expo-development-builds/why-you-need-one.md). Sensors also need real hardware:
simulators report no or synthetic data, so test on a device.

## Basic example

```tsx title=components/TiltIndicator.tsx
import {Accelerometer, type AccelerometerMeasurement} from 'expo-sensors';
import {useEffect, useState} from 'react';
import {Text} from 'react-native';

export function TiltIndicator() {
  const [reading, setReading] = useState<AccelerometerMeasurement | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let subscription: {remove: () => void} | null = null;
    let cancelled = false;

    Accelerometer.isAvailableAsync().then((ok) => {
      if (cancelled) {
        return;
      }
      setAvailable(ok);
      if (!ok) {
        return;
      }
      // 100 ms is plenty for UI. Faster intervals cost battery and re-renders.
      Accelerometer.setUpdateInterval(100);
      subscription = Accelerometer.addListener(setReading);
    });

    return () => {
      cancelled = true;
      // An unremoved listener keeps the sensor running after unmount.
      subscription?.remove();
    };
  }, []);

  if (available === false) {
    return <Text>No accelerometer on this device.</Text>;
  }
  if (reading === null) {
    return <Text>…</Text>;
  }
  return <Text>{`x ${reading.x.toFixed(2)}g  y ${reading.y.toFixed(2)}g`}</Text>;
}
```

## How it works

### The shared sensor API

Every sensor export except `Pedometer` is an instance of `DeviceSensor` with the same methods:

| Method | Behaviour |
| --- | --- |
| `isAvailableAsync()` | Whether this device has the sensor. **Always check first.** |
| `addListener(listener)` | Starts updates; returns a subscription with `remove()`. |
| `setUpdateInterval(intervalMs)` | Requested interval between updates, in milliseconds. |
| `removeAllListeners()` | Removes every listener for that sensor. |
| `hasListeners()` / `getListenerCount()` | Inspect active listeners. |
| `getPermissionsAsync()` / `requestPermissionsAsync()` | Motion permission, where the platform has one. |

The interval is a **request**. The OS may deliver faster or slower, and on Android 12+ the system caps each
sensor at 200 Hz (a 5 ms interval) unless you add `HIGH_SAMPLING_RATE_SENSORS`.

### What each sensor measures

| Export | Measurement fields | Units | Platforms |
| --- | --- | --- | --- |
| `Accelerometer` | `x`, `y`, `z`, `timestamp` | g (1 g = 9.81 m/s²) | Android, iOS |
| `Gyroscope` | `x`, `y`, `z`, `timestamp` | rotation rate | Android, iOS |
| `Magnetometer` | `x`, `y`, `z`, `timestamp` | μT, calibrated | Android, iOS |
| `MagnetometerUncalibrated` | `x`, `y`, `z`, `timestamp` | μT, raw | Android, iOS |
| `Barometer` | `pressure`, `relativeAltitude?`, `timestamp` | hPa; `relativeAltitude` in metres, **iOS only** | Android, iOS |
| `LightSensor` | `illuminance`, `timestamp` | lux | **Android only** |
| `DeviceMotion` | see below | mixed | Android, iOS |

Note the unit trap: `Accelerometer` reports **g**, while `DeviceMotion.acceleration` reports **m/s²**.

### `DeviceMotion`

`DeviceMotion` fuses the raw sensors into higher-level values:

| Field | Meaning |
| --- | --- |
| `acceleration` | User acceleration without gravity, m/s². May be `null`. |
| `accelerationIncludingGravity` | Acceleration including gravity, m/s². |
| `rotation` | Orientation as `alpha` (Z), `beta` (X), `gamma` (Y). |
| `rotationRate` | Rotation rate in deg/s. May be `null`. |
| `orientation` | Screen orientation: `DeviceMotionOrientation.Portrait` (0), `RightLandscape` (90), `UpsideDown` (180), `LeftLandscape` (-90). |
| `interval` | Actual delivery interval, ms. |

`DeviceMotion.Gravity` is the standard gravity constant, useful for converting between the two units.

### `Pedometer`

`Pedometer` is a module of functions, not a `DeviceSensor`:

| Function | Platforms | Behaviour |
| --- | --- | --- |
| `isAvailableAsync()` | Android, iOS | Whether step counting is available. |
| `requestPermissionsAsync()` | Android, iOS | Motion / activity-recognition permission. |
| `watchStepCount(callback)` | Android, iOS | Steps since subscribing, **foreground only**. |
| `getStepCountAsync(start, end)` | **iOS only** | Steps between two dates; iOS keeps only the last seven days. |

```ts title=lib/steps.ts
import {Pedometer} from 'expo-sensors';
import {Platform} from 'react-native';

export async function stepsToday(): Promise<number | null> {
  if (Platform.OS !== 'ios') {
    // getStepCountAsync is iOS only. On Android, historical steps come
    // from Health Connect, not from this package.
    return null;
  }
  if (!(await Pedometer.isAvailableAsync())) {
    return null;
  }
  const {granted} = await Pedometer.requestPermissionsAsync();
  if (!granted) {
    return null;
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const {steps} = await Pedometer.getStepCountAsync(start, new Date());
  return steps;
}
```

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-sensors",
        {
          "motionPermission": "Count your steps during a workout."
        }
      ]
    ]
  }
}
```

`motionPermission` sets **`NSMotionUsageDescription`**. The default is
`"Allow $(PRODUCT_NAME) to access your device motion"`. Pass `false` to omit the key — and the plugin then
also sets `MOTION_PERMISSION` to `false` in `Podfile.properties.json` so the motion-permission code is not
built in. Only do that if you never use `Pedometer` or `DeviceMotion`.

> [!DANGER] Missing `NSMotionUsageDescription` is an instant crash
> Accessing motion data — the pedometer in particular — without `NSMotionUsageDescription` in
> `Info.plist` terminates the app with no JavaScript error. Keep the plugin entry whenever you use
> `Pedometer`.

@tab Android

The `expo-sensors` config plugin adds **no** Android permissions. The library's own manifest declares
`android.permission.ACTIVITY_RECOGNITION`, which is merged into your app automatically and is what
`Pedometer.requestPermissionsAsync()` prompts for.

For update intervals faster than 200 Hz on Android 12+, add the high-sampling permission through the app
config:

```json title=app.json
{
  "expo": {
    "android": {
      "permissions": ["android.permission.HIGH_SAMPLING_RATE_SENSORS"]
    }
  }
}
```

Only add it if you measured a need; very few apps require more than 200 updates per second.
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Light sensor | Not available | `LightSensor` |
| Barometer `relativeAltitude` | Provided | Not provided |
| Historical steps (`getStepCountAsync`) | Last seven days | Not available — use Health Connect |
| Step updates in background | Not delivered | Not delivered |
| Sampling limit | OS-managed | 200 Hz on Android 12+ without `HIGH_SAMPLING_RATE_SENSORS` |
| Motion permission | `NSMotionUsageDescription` | `ACTIVITY_RECOGNITION` runtime permission |

## Common patterns

### Detecting a shake

```ts title=hooks/useShake.ts
import {Accelerometer} from 'expo-sensors';
import {useEffect, useRef} from 'react';

const THRESHOLD_G = 1.8;
const COOLDOWN_MS = 1000;

export function useShake(onShake: () => void): void {
  // Keep the latest callback without resubscribing on every render.
  const callback = useRef(onShake);
  callback.current = onShake;

  useEffect(() => {
    let lastShake = 0;
    Accelerometer.setUpdateInterval(50);
    const subscription = Accelerometer.addListener(({x, y, z}) => {
      // At rest the magnitude is ~1 g (gravity). A shake spikes well above it.
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (magnitude > THRESHOLD_G && now - lastShake > COOLDOWN_MS) {
        lastShake = now;
        callback.current();
      }
    });
    return () => subscription.remove();
  }, []);
}
```

### Throttling what reaches React state

A sensor at 60 Hz calls `setState` 60 times per second. For values shown in text, sample into a ref and
update state on a slower timer, or raise the interval. For animation driven by a sensor, feed the values
into Reanimated shared values rather than component state.

## Performance considerations

- **Set the largest interval that works.** Every update wakes the JS thread.
- **Remove listeners on unmount and when the screen loses focus.** A forgotten subscription keeps the
  sensor powered.
- **Do not store every reading in state.** Re-rendering at sensor frequency drops frames.
- **Check `isAvailableAsync()` once**, not before each subscription.

## Security considerations

**Threat.** Motion sensors leak more than they appear to. Published research has shown accelerometer and
gyroscope streams can be used to infer taps and typed input, fingerprint a device, or reveal physical
activity and routines.

**Exploit.** An embedded SDK or a WebView-hosted script subscribes to motion data at a high rate while the
user types a PIN on another part of the screen, and ships the samples off-device for analysis.

**Fix.**

- Subscribe only while the feature that needs the data is on screen, and remove the subscription the
  moment it is not.
- Pause motion subscriptions while sensitive input (passwords, PINs, payment fields) is focused.
- Do not forward raw sensor streams to analytics or third-party SDKs; send derived results ("shake
  detected"), not samples.
- Omit the motion permission (`motionPermission: false`) if you do not use `Pedometer` or `DeviceMotion`.

**Verification.** Add a temporary log of `Accelerometer.getListenerCount()` in a screen-blur handler and
confirm it is `0` after navigating away from every sensor screen.

## Common mistakes

- **Not checking `isAvailableAsync()`.** Many devices lack a barometer, and iOS has no `LightSensor`.
- **Forgetting `subscription.remove()`.** The sensor keeps running after unmount.
- **Mixing units.** `Accelerometer` is in g; `DeviceMotion.acceleration` is in m/s².
- **Calling `getStepCountAsync` on Android.** It is iOS only.
- **Expecting pedometer updates in the background.** They are not delivered.
- **Dropping the `expo-sensors` plugin while using `Pedometer`.** iOS crashes without
  `NSMotionUsageDescription`.
- **Tiny update intervals "for accuracy".** They cost battery and frames, and Android caps them at 200 Hz.
- **Testing on a simulator.** Use a real device.

## Related topics

- [Location](location.md) — calibrated compass heading and movement.
- [Clipboard and Haptics](clipboard-and-haptics.md) — feedback to pair with a shake or tilt gesture.
- [Permissions Patterns](permissions-patterns.md) — requesting motion access at the right moment.
- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — not requesting what you do not use.
- [Why You Need a Development Build](../expo-development-builds/why-you-need-one.md) — when your own usage strings apply.
