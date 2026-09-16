---
title: Haptics
description: Why core Vibration is not haptics, what react-native-haptic-feedback 3 gives you instead, and the permission and hardware realities on each platform.
status: current
toolchain: cli
---

React Native core ships `Vibration`, and it is not a haptics API. It has two methods —
`vibrate(pattern?, repeat?)` and `cancel()` — and on iOS it is implemented as
`AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)`: a single, fixed, roughly 400 ms buzz
with **no pattern support and no intensity control**. That is verified in the 0.87.1 source,
which says so in the doc comment.

Real haptics — the crisp tick when a picker snaps, the distinct success and error taps — come
from UIKit feedback generators and Core Haptics on iOS, and from `HapticFeedbackConstants` and
`VibrationEffect` on Android. None of that is in core. You need a library or native code.

## Why it exists — and when NOT to use it

Haptics are confirmation you feel rather than read. They earn their place on a small set of
interactions: a selection snapping into position, a long-press being recognised, a destructive
action completing, a form failing validation. In each case the feedback removes a glance.

They are noise everywhere else. A tap on every button, a buzz on every list scroll, a vibration
on every notification — users turn haptics off system-wide because of apps that do this, and
then your genuinely useful feedback goes with it.

Two hard rules: never use haptics as the **only** channel for information, because a user with
haptics disabled or a device without hardware gets nothing; and never buzz for something the
user did not initiate.

## What core gives you

```ts title=src/feedback/vibrate.ts
import {Platform, Vibration} from 'react-native';

export function crudeBuzz(): void {
  if (Platform.OS === 'android') {
    // A pattern: [wait, vibrate, wait, vibrate, …] in milliseconds.
    Vibration.vibrate([0, 60, 40, 60]);
  } else {
    // iOS ignores the pattern entirely. Every call is the same ~400ms buzz.
    Vibration.vibrate();
  }
}

export function stop(): void {
  // Only meaningful for a repeating pattern on Android.
  Vibration.cancel();
}
```

`Vibration` is the right tool for exactly one thing: a deliberate, attention-grabbing buzz, such
as an alarm. It is the wrong tool for interface feedback, because a 400 ms motor spin is not a
tick — it is the opposite of subtle.

## Which library

**`react-native-haptic-feedback` 3.0.0.** Verified from the published package: it declares
`codegenConfig` with the spec name `RNHapticFeedbackSpec` and ships a `TurboModuleRegistry` spec,
so it is a real TurboModule. Peer dependencies are `react >=18.0.0` and `react-native >=0.71.0`.

It maps a named haptic type onto the best mechanism each device has, with a documented fallback
chain rather than a silent no-op.

:::tabs
@tab npm
```bash
npm install react-native-haptic-feedback
cd ios && bundle exec pod install
```
@tab yarn
```bash
yarn add react-native-haptic-feedback
cd ios && bundle exec pod install
```
@tab pnpm
```bash
pnpm add react-native-haptic-feedback
cd ios && bundle exec pod install
```
:::

## Native configuration

:::tabs
@tab iOS

Nothing in `Info.plist`. Feedback generators and Core Haptics need no permission and no usage
description.

What does matter is the audio session. If your app holds an active `AVAudioSession` — because
it is recording, or running a camera capture — haptics are suppressed by default while it is
active. Libraries that own an audio session usually expose a flag for this; VisionCamera, for
example, has `allowHapticsAndSystemSoundsPlayback` on the camera session.

Haptics are also silently disabled when the device is in **Low Power Mode**, and when the user
turns off System Haptics in Settings. Neither is detectable from JavaScript, which is why
haptics must always be an enhancement.

@tab Android

Vibration requires an install-time permission, and **core React Native does not declare it** —
the `ReactAndroid` manifest contains only a `<uses-sdk>` element. If you use core `Vibration`,
add it yourself:

```xml title=android/app/src/main/AndroidManifest.xml
<uses-permission android:name="android.permission.VIBRATE" />
```

`react-native-haptic-feedback` declares it in its own manifest, so the merger adds it for you
when you install that library. It will then appear in your merged manifest whether or not you
wrote it — see [Permissions](permissions.md) for how to audit that.

There is no runtime permission. `VIBRATE` is granted at install.

:::

## Basic example

```ts-fragment title=src/feedback/haptics.ts
import {trigger} from 'react-native-haptic-feedback';

const options = {
  // iOS: fall back to the system vibration on devices with no Taptic Engine.
  enableVibrateFallback: true,
  // Android: respect the user's system vibration setting. Overriding it is
  // almost never the right call.
  ignoreAndroidSystemSettings: false,
};

export const selectionTick = () => trigger('selection', options);
export const confirmTap = () => trigger('notificationSuccess', options);
export const failureTap = () => trigger('notificationError', options);
export const pressTap = () => trigger('impactMedium', options);
```

> [!NOTE] Why these blocks are not type-checked
> `react-native-haptic-feedback` is not installed in this repository's type-check harness, so its
> blocks are tagged `ts-fragment` / `tsx-fragment`. The API shown was read from the published
> `3.0.0` type definitions.

There is also a hook that binds the default options once:

```tsx-fragment title=src/components/QuantityStepper.tsx
import {useCallback, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {useHaptics} from 'react-native-haptic-feedback';

export function QuantityStepper({max}: {max: number}) {
  const haptics = useHaptics({enableVibrateFallback: true});
  const [value, setValue] = useState(1);

  const bump = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(value + delta, 1), max);
      // A tick only when the value actually moved. Buzzing at the boundary
      // says "that worked" about something that did not.
      if (next !== value) haptics.trigger('selection');
      else haptics.trigger('notificationWarning');
      setValue(next);
    },
    [value, max, haptics],
  );

  return (
    <View>
      <Pressable onPress={() => bump(-1)} accessibilityRole="button">
        <Text>Less</Text>
      </Pressable>
      <Text>{value}</Text>
      <Pressable onPress={() => bump(1)} accessibilityRole="button">
        <Text>More</Text>
      </Pressable>
    </View>
  );
}
```

## How it works

### Types are semantic, not physical

You ask for a meaning and the library picks the mechanism. The commonly useful set:

| Type | Use for |
| --- | --- |
| `selection` | A value snapping into place — pickers, sliders, steppers |
| `impactLight` / `impactMedium` / `impactHeavy` | Something landed. Weight suggests significance |
| `soft` / `rigid` | Material character — a soft cushion versus a hard stop |
| `notificationSuccess` / `notificationWarning` / `notificationError` | An outcome |
| `clockTick`, `keyboardTap`, `longPress`, `contextClick`, `virtualKey` | Android system constants, approximated on iOS |
| `effectClick`, `effectTick`, `effectDoubleClick`, `effectHeavyClick` | Android API 29+ effects, approximated on iOS |

Prefer the semantic ones (`selection`, `notification*`) over the physical ones. They map onto
the correct native generator on each platform, so they feel native rather than approximated.

### There is a fallback chain, and it is documented

This is the reason to use a library rather than a hand-rolled native module. On iOS, each
`trigger` walks three tiers and stops at the first that works:

1. **Core Haptics** (`CHHapticEngine`) on iPhone 8 and later — full per-type patterns with
   intensity and sharpness.
2. **UIKit generators** on any device with a Taptic Engine — `UIImpactFeedbackGenerator`,
   `UINotificationFeedbackGenerator`, `UISelectionFeedbackGenerator`, semantically mapped.
3. **System vibration** (`AudioServicesPlaySystemSound`) — only when
   `enableVibrateFallback: true`, and only on devices with no Taptic Engine at all.

On Android there are two tiers: the activity's `performHapticFeedback` with a
`HapticFeedbackConstants` value, falling back to the `Vibrator` API with `VibrationEffect`
waveforms (and `VibrationEffect.Composition` primitives on API 31+).

`isSupported()` tells you whether tier 1 is available, which is the honest input to a settings
toggle.

### Intensity and custom patterns

```ts-fragment title=src/feedback/custom.ts
import {impact, triggerPattern, Patterns} from 'react-native-haptic-feedback';

// A softer tap than any named type gives you. Intensity is 0.0-1.0; on iOS it
// drives Core Haptics directly, on Android it maps to VibrationEffect amplitude.
export const gentle = () => impact('impactMedium', 0.35);

// A built-in sequence. Patterns exposes success, error, warning, heartbeat,
// tripleClick and notification.
export const celebrate = () => triggerPattern(Patterns.success);

// Or your own: time offsets in ms, with intensity and sharpness per event.
export const knock = () =>
  triggerPattern([
    {time: 0, intensity: 0.8, sharpness: 0.9},
    {time: 120, intensity: 0.8, sharpness: 0.9},
    {time: 380, type: 'continuous', duration: 200, intensity: 0.4, sharpness: 0.2},
  ]);
```

Custom patterns are where haptics stop being free. A 600 ms sequence occupies the actuator for
600 ms, during which nothing else can fire. Keep them short and rare.

### Give the user a switch

```ts-fragment title=src/feedback/preference.ts
import {setEnabled, isEnabled, getSystemHapticStatus} from 'react-native-haptic-feedback';

/**
 * Library-wide on/off. The setting is in-memory only — persist it yourself and
 * re-apply it at startup.
 */
export function applyHapticPreference(enabled: boolean): void {
  setEnabled(enabled);
}

export const hapticsAreOn = (): boolean => isEnabled();

/** Android reports the ringer mode; iOS returns null for it. */
export async function describeSystemHaptics(): Promise<string> {
  const status = await getSystemHapticStatus();
  if (!status.vibrationEnabled) return 'Vibration is off in system settings.';
  return status.ringerMode === 'silent' ? 'Device is silent.' : 'Haptics available.';
}
```

An in-app toggle is worth having even though both platforms have a system-wide one, because a
user who finds your haptics excessive will otherwise disable them everywhere.

## Platform differences

:::tabs
@tab iOS

- Core `Vibration` ignores patterns entirely and produces a fixed ~400 ms buzz. `Vibration.cancel()`
  does nothing useful.
- Core Haptics needs iPhone 8 or later. Older Taptic Engine devices get UIKit generators; iPads
  and iPod touch get nothing but the system vibration fallback.
- **Low Power Mode silently disables haptics.** So does the System Haptics switch in Settings.
  Neither is observable from JavaScript.
- An active `AVAudioSession` suppresses haptics unless the session opts in.
- The simulator produces no haptics at all. This is expected, not a bug in your code.

@tab Android

- `VIBRATE` is required and core does not declare it for you.
- Tier 1 (`performHapticFeedback`) respects the user's system vibration setting.
  `ignoreAndroidSystemSettings: true` overrides that — treat it as a last resort for genuine
  accessibility needs, not as a default.
- Hardware quality varies enormously. A flagship with a linear resonant actuator produces a
  crisp tick; a budget device with a rotating-mass motor produces a buzz for the same call.
- `VibrationEffect.Composition` primitives (API 31+) are what makes modern Android haptics feel
  close to iOS. Below that, everything is a waveform.
- `getSystemHapticStatus()` reports the ringer mode here; on iOS that field is always null
  because the OS does not expose it.

:::

## Performance considerations

- **Haptics are a shared, serialised resource.** The actuator does one thing at a time. Firing
  on every frame of a gesture queues work that arrives late and feels disconnected.
- **Do not trigger from a scroll or drag handler directly.** Gate on a value actually changing —
  the stepper example above only ticks when the number moved.
- **Each call crosses into native.** That is cheap individually and expensive in a loop. If you
  find yourself throttling haptic calls, the interaction probably should not have haptics.
- **Long custom patterns block later ones.** A 600 ms sequence means the next `trigger` in that
  window is dropped or delayed.

## Accessibility considerations

Haptics are an accessibility feature and an accessibility hazard at the same time.

- For a user who cannot see the screen well, a tick confirming selection is genuinely useful.
- For a user with a vestibular or sensory sensitivity, constant vibration is painful, and they
  will have turned it off system-wide.

So: never carry information **only** in a haptic, respect the system setting by default, and
pair every haptic with a visible or announced change. See
[Accessibility APIs](accessibility.md) for the announcement side, and
[Reduce Motion](../animation/reduce-motion.md) for the related motion preference.

## Common mistakes

- **Using `Vibration` for interface feedback.** Wrong: `Vibration.vibrate()` when a button is
  pressed. Right: a haptic library. On iOS core gives a fixed 400 ms buzz, which reads as a
  malfunction rather than a confirmation.
- **Passing a pattern and expecting iOS to honour it.** Wrong: `Vibration.vibrate([0, 50, 30, 50])`
  as a cross-platform tick. Right: iOS ignores the array. Verified in the core source.
- **Forgetting `VIBRATE` on Android.** Wrong: assuming core declares it. Right: `ReactAndroid`'s
  manifest has no permissions; add it, or install a library that declares it.
- **Setting `ignoreAndroidSystemSettings: true` by default.** Wrong: overriding the user's
  explicit choice so your feedback "works". Right: respect it. That switch exists because your
  app is not the only one buzzing.
- **Haptics as the only signal.** Wrong: a silent failure that only vibrates. Right: pair with a
  visible change and, where it matters, an accessibility announcement.
- **Buzzing on scroll.** Wrong: a tick per list item passing under the finger. Right: reserve
  haptics for discrete, user-initiated state changes.
- **Testing only in the simulator.** Wrong: concluding the library is broken because nothing is
  felt. Right: simulators have no actuator; test on hardware, and on a cheap Android device as
  well as a flagship.

## Related topics

- [Accessibility APIs](accessibility.md) — the other non-visual feedback channel.
- [Reduce Motion](../animation/reduce-motion.md) — respecting sensory preferences.
- [Permissions](permissions.md) — auditing the merged manifest where `VIBRATE` appears.
- [Pressable and Touchables](../components/pressable-and-touchables.md) — where interface haptics belong.
- [Camera](camera.md) — an audio session that can suppress haptics.
- [Platform Differences](../core-concepts/platform-differences.md) — the general shape of this divergence.
