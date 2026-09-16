---
title: Switch
description: The platform boolean control — controlled-component rules, the colour props that only work on one platform, and how to label it for screen readers.
status: current
toolchain: cli
---

`Switch` renders the system on/off control: a `UISwitch` on iOS, a `SwitchCompat` on Android. It is
a controlled component — it shows whatever `value` you give it and does not change on its own, so a
switch whose `value` never updates will not move no matter how many times it is tapped.

It is one of the few core components where using the real thing matters more than styling it.
Users recognise it, screen readers announce it correctly, and the platforms animate it differently
on purpose.

## Why it exists / when to use it — and when NOT to

Use a `Switch` for a setting that takes effect immediately: notifications on or off, dark mode,
location sharing.

Do **not** use it when:

- **The change needs confirming or saving.** A switch implies "this is now on". If the user has to
  press Save afterwards, a checkbox-style row is the honest control — and there is no core
  checkbox, so that is a `Pressable` with your own mark.
- **It is one of several mutually exclusive options.** That is a radio group or a segmented
  control, not three switches.
- **The design demands a custom look.** You can tint a `Switch` but you cannot restyle it. If the
  design needs a bespoke track and thumb, build it from a `Pressable` and an animated `View` — and
  accept that you now own `accessibilityRole="switch"`, `accessibilityState` and the animation.

## Basic example

```tsx title=src/components/SettingRow.tsx
import {View, Text, Switch, StyleSheet} from 'react-native';

type Props = {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

export function SettingRow({label, value, onValueChange, disabled = false}: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        // The switch itself carries no text, so it needs its own label.
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  label: {flex: 1, fontSize: 16},
});
```

## How it works

### Controlled, strictly

`value` drives the visual state. The switch does not keep its own. If the handler is asynchronous
and fails, do not leave the state optimistically flipped — either revert it or hold the switch in
its old position until the write succeeds.

```tsx title=An async toggle that reverts on failure
import {useState, useCallback} from 'react';
import {Switch, View, Text, StyleSheet} from 'react-native';

type Props = {
  initial: boolean;
  save: (next: boolean) => Promise<void>;
};

export function SyncedSwitch({initial, save}: Props) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(
    async (next: boolean) => {
      // Move immediately so the control feels responsive, then undo on failure.
      setValue(next);
      setBusy(true);
      try {
        await save(next);
      } catch {
        setValue(!next);
      } finally {
        setBusy(false);
      }
    },
    [save],
  );

  return (
    <View style={styles.row}>
      <Text>Sync over cellular</Text>
      <Switch
        value={value}
        onValueChange={toggle}
        disabled={busy}
        accessibilityLabel="Sync over cellular"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
```

### `onValueChange` versus `onChange`

Both fire on the same interaction. `onValueChange` receives the new boolean, which is what you want
almost always. `onChange` receives the full event, typed `SwitchChangeEvent`, whose
`nativeEvent.value` is the same boolean and whose `nativeEvent.target` is the node id. Use it only
when you need the target — for instance one shared handler across a row of switches.

```tsx title=Using the event form
import {useCallback} from 'react';
import {Switch} from 'react-native';
import type {SwitchChangeEvent} from 'react-native';

export function EventSwitch({value, onNext}: {value: boolean; onNext: (v: boolean) => void}) {
  const handleChange = useCallback(
    (event: SwitchChangeEvent) => {
      onNext(event.nativeEvent.value);
    },
    [onNext],
  );

  return <Switch value={value} onChange={handleChange} accessibilityLabel="Setting" />;
}
```

Both callbacks may return a `Promise` in the 0.87 types, so an `async` handler is accepted without
a wrapper.

### Sizing

`Switch` has a fixed intrinsic size set by each platform, and it ignores `width` and `height`.
`transform: [{scale: 0.8}]` is the only way to change its apparent size, and it scales the whole
control including its touch target — which is usually a reason not to.

### Refs

The ref type is `SwitchInstance`, an alias for the generic host type. There are no switch-specific
imperative methods; the ref is for measuring or for focus on hardware-keyboard platforms.

## Platform differences

The colour props are the clearest example in the core component set of props that only do something
on one platform. All of them type-check on both; only some of them have an effect.

:::tabs
@tab iOS
- `trackColor.true` tints the filled track. `trackColor.false` tints the track in the off state —
  but on iOS the off-state track shrinks into a thin border, so the effect is subtle and often
  invisible.
- `ios_backgroundColor` is the colour *behind* the track. It is what you actually see in the off
  state and while the switch is disabled and translucent. This prop is iOS-only; the name says so.
- `thumbColor` works, with a side effect the type definition calls out: setting it removes the
  thumb's drop shadow, which is a noticeable departure from the system look.
- `onTintColor`, `thumbTintColor` and `tintColor` still exist and are marked deprecated in the 0.87
  types. They are the pre-`trackColor` API. Do not use them in new code.

```tsx title=iOS tinting
import {Switch} from 'react-native';

export function IosTinted({value, onChange}: {value: boolean; onChange: (v: boolean) => void}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{true: '#34c759'}}
      // What shows through in the off state on iOS.
      ios_backgroundColor="#e5e5ea"
      accessibilityLabel="Enabled"
    />
  );
}
```
@tab Android
- `trackColor.false` and `trackColor.true` both take effect and are clearly visible; the Android
  track is a full-width bar in both states.
- `thumbColor` tints the thumb in whichever state it is in. To tint the two states differently you
  have to pass a different value based on `value`.
- `ios_backgroundColor` is ignored.
- The Material ripple around the thumb is drawn by the platform and is not configurable from the
  `Switch` props.

```tsx title=Android tinting, including the thumb per state
import {Switch} from 'react-native';

export function AndroidTinted({value, onChange}: {value: boolean; onChange: (v: boolean) => void}) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{false: '#cbd5e1', true: '#93c5fd'}}
      // One prop, two states: pick the colour yourself.
      thumbColor={value ? '#2563eb' : '#f1f5f9'}
      accessibilityLabel="Enabled"
    />
  );
}
```
:::

A component that wants to look deliberate on both platforms passes all of the props at once and
lets each platform ignore what it does not use:

```tsx title=src/components/ThemedSwitch.tsx
import {Switch} from 'react-native';

type Props = {value: boolean; onValueChange: (next: boolean) => void; label: string};

export function ThemedSwitch({value, onValueChange, label}: Props) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      // iOS reads trackColor.true and ios_backgroundColor;
      // Android reads both trackColor entries and thumbColor.
      trackColor={{false: '#cbd5e1', true: '#2563eb'}}
      thumbColor={value ? '#ffffff' : '#f8fafc'}
      ios_backgroundColor="#cbd5e1"
    />
  );
}
```

## Common patterns

### Making the whole row tappable

A 50pt-wide switch is a small target in a full-width row. Wrapping the row in a `Pressable` that
toggles the same state is standard, and it is what both platforms' own settings apps do.

```tsx title=A row where the label toggles the switch
import {Pressable, View, Text, Switch, StyleSheet} from 'react-native';

type Props = {label: string; value: boolean; onValueChange: (next: boolean) => void};

export function ToggleRow({label, value, onValueChange}: Props) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      // The row is the control now; announce it as one and hide the inner switch
      // from assistive tech so it is not announced twice.
      accessibilityRole="switch"
      accessibilityState={{checked: value}}
      accessibilityLabel={label}
      style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  label: {flex: 1, fontSize: 16},
});
```

`accessibilityElementsHidden` is the iOS side of that and `importantForAccessibility` is the
Android side; both are needed to avoid a double announcement.

### A list of settings

```tsx title=Settings driven by one state object
import {useState, useCallback} from 'react';
import {View, Text, Switch, StyleSheet} from 'react-native';

type Settings = {notifications: boolean; analytics: boolean; darkMode: boolean};

const LABELS: Array<[keyof Settings, string]> = [
  ['notifications', 'Push notifications'],
  ['analytics', 'Share usage data'],
  ['darkMode', 'Dark mode'],
];

export function SettingsList() {
  const [settings, setSettings] = useState<Settings>({
    notifications: true,
    analytics: false,
    darkMode: false,
  });

  const update = useCallback((key: keyof Settings, next: boolean) => {
    setSettings(current => ({...current, [key]: next}));
  }, []);

  return (
    <View>
      {LABELS.map(([key, label]) => (
        <View key={key} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Switch
            value={settings[key]}
            onValueChange={next => update(key, next)}
            accessibilityLabel={label}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  label: {flex: 1, fontSize: 16},
});
```

## Performance considerations

A `Switch` is a single native view and costs nothing to render. The only thing worth watching is
what happens *around* it: a settings screen that keeps all switches in one state object re-renders
every row on every toggle. With a handful of rows that is irrelevant. With fifty, memoise the row
component and pass only its own boolean.

An `async` `onValueChange` that writes to storage on every toggle can queue writes faster than they
complete if the user flicks a switch repeatedly. Debounce the write, or disable the switch while it
is in flight as in the example above.

## Common mistakes

- **Not passing `value`.** The switch renders in the off state and never moves. Wrong:
  `<Switch onValueChange={setEnabled} />`. Right:
  `<Switch value={enabled} onValueChange={setEnabled} />`.
- **Setting state in `onValueChange` but never reading it back into `value`.** Same symptom: a
  switch that snaps back. It is a controlled component all the way down.
- **No `accessibilityLabel`.** A switch has no text of its own. Without a label, VoiceOver and
  TalkBack announce "switch, on" with no indication of what is on. The nearby `Text` is a separate
  element and is not automatically associated.
- **Expecting `ios_backgroundColor` to do something on Android.** It is ignored. The prop name is
  the documentation.
- **Using `onTintColor` / `thumbTintColor` / `tintColor`.** They are deprecated in the 0.87 types.
  `trackColor` and `thumbColor` replace them.
- **Trying to resize it with `width` and `height`.** The control has a fixed platform size. Only a
  `scale` transform changes it, and that shrinks the touch target too.
- **Using a switch for something that needs saving.** A switch announces a change that already
  happened. If a Save button follows, the control is lying about the state of the world.

## Related topics

- [View](view.md) — the row layout around the control.
- [Text](text.md) — the label that the switch needs and does not provide.
- [Pressable and Touchables](pressable-and-touchables.md) — making the whole row toggle.
- [Accessibility APIs](../platform-apis/accessibility.md) — `accessibilityRole="switch"` and state.
- [Dark Mode](../styling/dark-mode.md) — the setting a switch most often controls.
- [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) — persisting what the switch changed.
