---
title: Accessibility APIs
description: The accessibility props React Native actually exports in 0.87, what AccessibilityInfo can tell you, and where TalkBack and VoiceOver genuinely differ.
status: current
toolchain: cli
---

Accessibility is the one area in this section where core covers the ground properly. There is no
library to evaluate and no native module to write: the props are on every component, and
`AccessibilityInfo` reports the user's settings.

What core cannot do is decide what your UI means. A `Pressable` with an icon inside it is a
button to you and an unlabelled tap target to a screen reader. Every prop on this page exists to
close that gap, and every one of them is something only you know.

Everything below was verified against
`types_generated/Libraries/Components/View/ViewAccessibility.d.ts` and
`types_generated/Libraries/Components/AccessibilityInfo/AccessibilityInfo.d.ts` in the installed
react-native 0.87.1.

## Why it exists — and when NOT to use it

Use these props whenever the rendered output does not describe itself. Icon-only controls,
custom toggles, progress indicators, anything built from `View` and `Pressable` rather than from
a platform control — all of it is opaque to assistive technology until you label it.

The part people get wrong is the opposite direction: **do not annotate what is already clear.**
A `Text` node with visible words already has an accessible name. Adding
`accessibilityLabel="Order total"` to a `Text` reading "Order total" makes the screen reader say
it, and nothing else changes. Adding a label that differs from the visible text is worse — a
voice-control user says what they see, and if the accessible name does not match, the command
fails.

## Native configuration

There are **no permissions and no `Info.plist` keys** for accessibility. That is worth stating
plainly, because it is the exception in this section. What the tabs below cover is the
configuration that does affect accessibility, and how to turn the screen reader on to test.

:::tabs
@tab iOS

Nothing is required. Two settings do affect what is announced:

```xml title=ios/AwesomeProject/Info.plist
<!-- The name VoiceOver reads for the app itself. -->
<key>CFBundleDisplayName</key>
<string>Awesome Project</string>

<!-- The languages the bundle is localised for. This is what makes the
     accessibilityLanguage prop resolve to a real voice rather than being
     ignored. -->
<key>CFBundleLocalizations</key>
<array>
  <string>en</string>
  <string>fr</string>
</array>
```

To test, enable VoiceOver in Settings → Accessibility → VoiceOver. Bind it to the triple-click
Accessibility Shortcut, because navigating a device with VoiceOver on in order to turn it off is
itself a lesson.

The simulator supports VoiceOver poorly. The Accessibility Inspector (Xcode → Open Developer
Tool) works against the simulator and is the fastest way to audit labels, roles and traits; the
actual announcement behaviour needs a device.

@tab Android

Nothing is required. The manifest `android:label` is the app name TalkBack announces, and
`android:supportsRtl` affects layout direction, which matters for screen-reader traversal order:

```xml title=android/app/src/main/AndroidManifest.xml
<application
  android:label="@string/app_name"
  android:supportsRtl="true"
  ...>
  <!-- … -->
</application>
```

To test, install TalkBack (preinstalled on most devices, in the Play Store as Android
Accessibility Suite) and enable it under Settings → Accessibility. From a terminal:

```bash
# List the accessibility services the device knows about.
adb shell settings get secure enabled_accessibility_services

# Turn TalkBack on and off without navigating the device with it running.
adb shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb shell settings put secure enabled_accessibility_services ""
```

Android Studio's Layout Inspector and the Accessibility Scanner app both audit a running screen
for missing labels and small touch targets.

:::

## Basic example

```tsx title=src/components/FavouriteButton.tsx
import {Pressable, StyleSheet, Text, View} from 'react-native';

type Props = {isFavourite: boolean; title: string; onToggle: () => void};

export function FavouriteButton({isFavourite, title, onToggle}: Props) {
  return (
    <Pressable
      onPress={onToggle}
      // Treat the whole control as one element rather than announcing the
      // icon and the label separately.
      accessible
      // What it is. Without this, an icon-only control announces nothing.
      accessibilityLabel={isFavourite ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
      // What activating it will do, when that is not obvious from the label.
      accessibilityHint="Double tap to change"
      // How assistive technology should treat it.
      accessibilityRole="button"
      // The current state, so the reader can say "selected".
      accessibilityState={{selected: isFavourite}}
      style={styles.button}>
      <View style={[styles.dot, isFavourite && styles.dotOn]} />
      <Text>{isFavourite ? 'Saved' : 'Save'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12},
  dot: {width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#444'},
  dotOn: {backgroundColor: '#444'},
});
```

## The props, and what each one is for

### `accessible`

Marks a subtree as a **single** accessibility element. Without it, a `Pressable` containing an
icon and two `Text` nodes is announced as three separate things and focused three times.

Touchables are accessible by default. Custom composites built from `View` usually are not, and
that is the most common reason a control "reads wrong".

### `accessibilityLabel`

The accessible name. By default it is built by concatenating descendant `Text` nodes, which is
correct surprisingly often — set it explicitly when the visible text is insufficient (an icon)
or when it would read badly ("3" for a badge, when "3 unread messages" is meant).

Keep it short, do not include the role ("Save button" becomes "Save button button"), and keep it
consistent with the visible text so voice control works.

### `accessibilityHint`

What happens on activation, when the label does not already say. "Opens your order history".
Announced after a pause, and only when the user has hints enabled. It is optional detail, never
the primary information.

### `accessibilityRole`

How the element behaves. The union in 0.87 includes `button`, `link`, `header`, `image`,
`imagebutton`, `search`, `text`, `adjustable`, `checkbox`, `radio`, `radiogroup`, `switch`,
`togglebutton`, `combobox`, `menu`, `menubar`, `menuitem`, `progressbar`, `scrollbar`,
`spinbutton`, `summary`, `alert`, `tab`, `tablist`, `tabbar`, `timer`, `list`, `toolbar`,
`grid`, `none` and more — plus `string`, so an arbitrary value compiles and is quietly ignored
by the platform. Spelling matters and nothing warns you.

`role` is the newer alias using web values (`heading` rather than `header`, `img` rather than
`image`). Pick one convention per codebase.

### `accessibilityState`

The five state flags: `disabled`, `selected`, `checked` (which also accepts `'mixed'`), `busy`
and `expanded`. This is how a screen reader says "selected", "checked", "collapsed".

```tsx title=src/components/Disclosure.tsx
import {useState} from 'react';
import {Pressable, Text, View} from 'react-native';

export function Disclosure({title, children}: {title: string; children: React.ReactNode}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={title}
        // Announced as "expanded" / "collapsed". Without it the control reads
        // identically in both states and the user cannot tell what happened.
        accessibilityState={{expanded: open}}
        onPress={() => setOpen(v => !v)}>
        <Text>{title}</Text>
      </Pressable>
      {open && <View>{children}</View>}
    </View>
  );
}
```

### `accessibilityValue`

For anything with a range — sliders, progress bars, steppers. `{min, max, now}` for numbers, or
`text` to override the spoken form entirely ("4 of 10 steps" rather than "4").

### `accessibilityActions` and `onAccessibilityAction`

Custom actions surfaced in the screen reader's rotor or menu, so a gesture your app implements
has a non-gestural equivalent. The built-in action names are `activate`, `increment`,
`decrement`, `longpress` (Android), `magicTap` (iOS) and `escape` (iOS); any other string is a
custom action and needs a `label`.

```tsx title=src/components/SwipeableRow.tsx
import {Pressable, Text, View} from 'react-native';
import type {AccessibilityActionEvent} from 'react-native';

type Props = {title: string; onArchive: () => void; onDelete: () => void};

export function SwipeableRow({title, onArchive, onDelete}: Props) {
  const onAction = (event: AccessibilityActionEvent) => {
    // A swipe gesture is unreachable with a screen reader on. These actions
    // are the equivalent, exposed through the reader's own menu.
    if (event.nativeEvent.actionName === 'archive') onArchive();
    if (event.nativeEvent.actionName === 'delete') onDelete();
  };

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityActions={[
        {name: 'archive', label: 'Archive'},
        {name: 'delete', label: 'Delete'},
      ]}
      onAccessibilityAction={onAction}>
      <Pressable>
        <Text>{title}</Text>
      </Pressable>
    </View>
  );
}
```

### `importantForAccessibility` — Android

`'auto' | 'yes' | 'no' | 'no-hide-descendants'`. The last one is the useful one: it removes an
element **and its whole subtree** from the accessibility tree. Use it for decorative layers and
for content behind an open overlay.

Its iOS counterpart is `accessibilityElementsHidden`, and the two must be set together or you
have fixed the bug on one platform only.

### `accessibilityLiveRegion` — Android

`'none' | 'polite' | 'assertive'`. Announces a change to content **without** moving focus.
`polite` waits for the current utterance to finish; `assertive` interrupts. Use it for a
validation message or a status that updates in place.

There is no iOS equivalent prop. On iOS the same job is done by
`AccessibilityInfo.announceForAccessibility`, below.

### The `aria-*` aliases

0.87 exports web-style aliases alongside the native names: `aria-label`, `aria-labelledby`,
`aria-live`, `aria-modal`, `aria-hidden`, `aria-busy`, `aria-checked`, `aria-disabled`,
`aria-expanded`, `aria-selected`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`,
`aria-valuetext`. They are aliases, not additions. Do not set both forms on one element.

## `AccessibilityInfo`

Query the user's settings, and subscribe to changes. All the query methods return promises.

| Method | Reports |
| --- | --- |
| `isScreenReaderEnabled()` | VoiceOver or TalkBack is running |
| `isReduceMotionEnabled()` | The user asked for less animation |
| `isBoldTextEnabled()` | iOS bold text |
| `isGrayscaleEnabled()` / `isInvertColorsEnabled()` | Colour filters |
| `isReduceTransparencyEnabled()` | iOS reduced transparency |
| `isHighTextContrastEnabled()` | Android high-contrast text |
| `isDarkerSystemColorsEnabled()` | iOS increased contrast |
| `prefersCrossFadeTransitions()` | Prefer a fade over a slide |
| `isAccessibilityServiceEnabled()` | Any accessibility service, not only a screen reader |
| `getRecommendedTimeoutMillis(original)` | A timeout adjusted for the user's preference |

```tsx title=src/a11y/useAccessibilitySettings.ts
import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

export function useAccessibilitySettings() {
  const [screenReader, setScreenReader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Read the current values once…
    void AccessibilityInfo.isScreenReaderEnabled().then(v => {
      if (!cancelled) setScreenReader(v);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (!cancelled) setReduceMotion(v);
    });

    // …then track changes. The user can toggle these while the app is open.
    const readerSub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      cancelled = true;
      readerSub.remove();
      motionSub.remove();
    };
  }, []);

  return {screenReader, reduceMotion};
}
```

Event names: `change` and `screenReaderChanged` (both platforms), `reduceMotionChanged`,
`grayscaleChanged`, `invertColorsChanged`, plus `boldTextChanged`, `reduceTransparencyChanged`,
`darkerSystemColorsChanged` and `announcementFinished` on iOS, and
`accessibilityServiceChanged` and `highTextContrastChanged` on Android.

### Announcing a change

```tsx title=src/a11y/announce.ts
import {AccessibilityInfo, Platform} from 'react-native';

export function announce(message: string): void {
  // Speaks the message without moving focus. On Android a live region on the
  // element that changed is usually better; use this when there is no element.
  AccessibilityInfo.announceForAccessibility(message);
}

export function announceUrgently(message: string): void {
  if (Platform.OS === 'ios') {
    // iOS supports queueing and priority; Android ignores the options.
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: false,
      priority: 'high',
    });
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}
```

`setAccessibilityFocus(reactTag)` moves focus to a specific element — use it sparingly, after a
navigation or a modal opening, because unrequested focus movement is disorienting.

## Platform differences

The two screen readers are genuinely different products, and testing on one does not test the
other.

:::tabs
@tab iOS — VoiceOver

- **Traversal follows the view hierarchy** and, within a container, the visual order. Reordering
  elements visually with absolute positioning changes the reading order in ways that surprise
  people.
- **`accessibilityViewIsModal`** is how you trap focus in a modal — it makes VoiceOver ignore
  sibling views. Without it, a user can swipe straight out of your dialog into the screen behind
  it. There is no Android equivalent prop; `importantForAccessibility="no-hide-descendants"` on
  the background is the Android answer.
- **`accessibilityElementsHidden`** hides a subtree, matching Android's
  `importantForAccessibility="no-hide-descendants"`.
- **`accessibilityLanguage`** sets the BCP 47 language for an element so a French phrase in an
  English app is read with a French voice.
- **`accessibilityIgnoresInvertColors`** stops an image being inverted when the user has Smart
  Invert on. Photos and logos want this; UI chrome does not.
- **`accessibilityRespondsToUserInteraction`** and the large-content-viewer props
  (`accessibilityShowsLargeContentViewer`, `accessibilityLargeContentTitle`) have no Android
  counterpart.
- Custom actions appear in the **rotor**, which the user reaches by rotating two fingers.
- `magicTap` (two-finger double tap) and `escape` (two-finger scrub) are iOS-only conventions
  worth implementing for a primary action and a dismiss.

@tab Android — TalkBack

- **Traversal follows the view hierarchy** too, but TalkBack groups more aggressively and its
  linear order is derived differently. A layout that reads correctly under VoiceOver can read out
  of order here.
- **`accessibilityLiveRegion`** exists here and not on iOS. It is the better mechanism for
  in-place updates because it does not require you to call an announcement API at the right
  moment.
- **`accessibilityLabelledBy`** points at another element's `nativeID` so a field takes its name
  from a separate label element. iOS has no equivalent.
- **`screenReaderFocusable`** makes an element reachable by the screen reader without making it
  keyboard-focusable.
- **`importantForAccessibility`** is the visibility control, including the subtree-hiding value.
- Custom actions appear in TalkBack's **local context menu**.
- **`isAccessibilityServiceEnabled()`** is broader than `isScreenReaderEnabled()` here: switch
  access and other services count.
- Minimum touch target is 48dp; TalkBack users and the Accessibility Scanner both notice when it
  is not met.

:::

The practical consequence: **budget for testing on both.** The prop set overlaps but the two
readers make different choices about grouping, ordering and what they announce, and roughly
every non-trivial screen has at least one difference.

## Common patterns

### Hide decoration, expose meaning

```tsx title=src/components/StatusBadge.tsx
import {StyleSheet, Text, View} from 'react-native';

export function StatusBadge({count}: {count: number}) {
  return (
    <View
      accessible
      // The number alone is meaningless out of visual context.
      accessibilityLabel={`${count} unread ${count === 1 ? 'message' : 'messages'}`}
      accessibilityRole="text"
      style={styles.badge}>
      <View
        // Decorative. Remove it from the tree on both platforms.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.dot}
      />
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {flexDirection: 'row', alignItems: 'center', gap: 4},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#c33'},
  count: {fontSize: 12, fontWeight: '600'},
});
```

### Adapt behaviour, not just labels

```tsx title=src/components/Toast.tsx
import {useEffect} from 'react';
import {AccessibilityInfo, StyleSheet, Text, View} from 'react-native';

export function Toast({message, onDismiss}: {message: string; onDismiss: () => void}) {
  useEffect(() => {
    // Ask the platform how long this user needs, rather than hard-coding 3s.
    // A screen-reader or motor-impairment user gets a longer value back.
    let timer: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.getRecommendedTimeoutMillis(3000).then(ms => {
      timer = setTimeout(onDismiss, ms);
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [onDismiss]);

  return (
    <View
      style={styles.toast}
      accessible
      accessibilityRole="alert"
      // Android announces the change in place; iOS needs announceForAccessibility.
      accessibilityLiveRegion="polite">
      <Text>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {padding: 12, borderRadius: 8, backgroundColor: '#222'},
});
```

## Security considerations

Accessibility itself is not a security boundary, but two things are worth knowing.

**Threat.** On Android, an accessibility service can read the content of every view in every
app. That is the whole point of TalkBack, and it is also the mechanism a class of Android
malware uses. Anything you put in an accessible label is readable by any enabled accessibility
service, including one the user installed for an unrelated reason.

**Exploit.** A "helpful" label on a secret defeats the masking:

```tsx title=Wrong — the masked value is announced in full
import {Text, TextInput, View} from 'react-native';

export function OneTimeCodeField({code}: {code: string}) {
  return (
    <View>
      <Text>Enter the code we sent you</Text>
      {/* secureTextEntry hides it on screen; the label reads it out loud
          and exposes it to every accessibility service on the device. */}
      <TextInput value={code} secureTextEntry accessibilityLabel={`Code is ${code}`} />
    </View>
  );
}
```

An enabled service reads that label. So does anyone within earshot, since a screen reader speaks
it aloud.

**Fix.** Label the field, never the value:

```tsx title=Right — the label describes the field
import {Text, TextInput, View} from 'react-native';

export function OneTimeCodeField({value, onChange}: {value: string; onChange: (v: string) => void}) {
  return (
    <View>
      <Text nativeID="otp-label">Enter the code we sent you</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        accessibilityLabel="One-time code"
        accessibilityHint="Six digits from the message we sent"
        // Android: take the name from the visible label element.
        accessibilityLabelledBy="otp-label"
      />
    </View>
  );
}
```

**Verification.** Turn the screen reader on and walk the screen with your eyes closed. Anything
spoken that you would not want printed on a poster is a finding. Then check the same screens
with `secureTextEntry` fields focused — the reader should describe the field, never its contents.

The related concern is that verbose labels leak business information: "Account balance 4,210.33"
announced in a shop is the same disclosure as displaying it. Where the visible UI masks
something by default, the accessible name should mask it too.

## Common mistakes

- **Labelling an icon-only button with nothing.** Wrong: `<Pressable><Icon /></Pressable>`.
  Right: add `accessibilityLabel` and `accessibilityRole="button"`. This is the single most
  common accessibility defect in React Native apps.
- **Repeating the role in the label.** Wrong: `accessibilityLabel="Save button"`. Right: `"Save"`
  with `accessibilityRole="button"` — otherwise the reader says "Save button button".
- **A label that differs from the visible text.** Wrong: a button reading "Send" labelled
  "Submit form". Right: keep them the same, or voice control users cannot activate it by name.
- **Hiding on one platform only.** Wrong: `accessibilityElementsHidden` with no
  `importantForAccessibility`. Right: set both; each one only works on its own platform.
- **Forgetting `accessibilityState`.** Wrong: a toggle that reads identically on and off. Right:
  `{checked}`, `{selected}` or `{expanded}` — state is invisible to a screen reader unless you
  declare it.
- **Not trapping focus in a modal.** Wrong: an overlay a VoiceOver user can swipe straight out
  of. Right: `accessibilityViewIsModal` on iOS and
  `importantForAccessibility="no-hide-descendants"` on the background for Android.
- **Announcing a secret.** Wrong: putting a one-time code or a balance into an
  `accessibilityLabel`. Right: label the field, never the value.
- **Testing on one platform.** Wrong: auditing with VoiceOver and shipping. Right: TalkBack
  groups and orders differently; most non-trivial screens read differently under each.
- **Assuming a screen reader is always off.** Wrong: animations and timeouts tuned only for sighted
  use. Right: `isScreenReaderEnabled()` and `getRecommendedTimeoutMillis()` exist for this.

## Related topics

- [Reduce Motion](../animation/reduce-motion.md) — acting on `isReduceMotionEnabled`.
- [Pressable and Touchables](../components/pressable-and-touchables.md) — where most labels belong.
- [Modal](../components/modal.md) — focus trapping and the modal props.
- [Text](../components/text.md) — how the default accessible name is built.
- [Haptics](haptics.md) — the non-visual feedback channel that pairs with announcements.
- [Testing Library](../testing/testing-library.md) — querying by accessible role and label in tests.
