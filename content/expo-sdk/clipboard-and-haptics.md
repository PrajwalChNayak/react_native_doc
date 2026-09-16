---
title: Clipboard and Haptics
description: Copying and pasting with expo-clipboard and giving tactile feedback with expo-haptics in Expo SDK 57 — the iOS paste prompt and ClipboardPasteButton, Android's clipboard toast, haptic styles, and when haptics silently do nothing.
status: current
toolchain: expo
sdk: 57
---

Two small packages that make an app feel native:

| Package | SDK 57 | Covers |
| --- | --- | --- |
| `expo-clipboard` | `~57.0.2` | Reading and writing text, URLs and images on the system clipboard; the iOS paste button. |
| `expo-haptics` | `~57.0.3` | Impact, notification and selection feedback through the Taptic Engine or Android haptics. |

```bash
npx expo install expo-clipboard expo-haptics
```

See [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

> [!NOTE] Not React Native's `Clipboard`
> React Native 0.86 still exports a core `Clipboard` API. `expo-clipboard` is the maintained alternative with
> images, URLs, HTML, change listeners and the iOS paste button. Use `expo-clipboard`.

## Why it exists / when to use it — and when NOT to

Use the clipboard for explicit user actions: a "Copy" button next to a code, a share link, a one-time
password field that offers to paste.

Use haptics to confirm a physical-feeling action: a toggle flipping, a successful payment, a drag snapping
into place, a picker changing value.

Do **not**:

- **Read the clipboard on launch "to be helpful".** iOS shows a paste banner and Android 13+ shows a toast
  every time you read it. Users read that as spying.
- **Copy secrets to the clipboard casually.** Other apps, keyboards and cloud clipboard sync can see it.
- **Use haptics as the only feedback.** Haptics can be disabled by the user or the system; always pair them
  with a visual change.
- **Fire haptics continuously.** Constant vibration is noise, and it drains the battery.

## Expo Go vs development build

**`expo-clipboard` works in Expo Go.** The Expo documentation lists it as included in Expo Go. It has no
config plugin and needs no permissions.

**`expo-haptics` has no config plugin and needs no native configuration from you**, so there is nothing a
development build adds for it. The documentation pages consulted for this guide did not state its Expo Go
status explicitly; verify on your target Expo Go version before relying on it there.

Test haptics on a **real device**. Simulators have no Taptic Engine.

## Basic example

```tsx title=components/CopyCode.tsx
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {useState} from 'react';
import {Button, Text, View} from 'react-native';

export function CopyCode({code}: {code: string}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await Clipboard.setStringAsync(code);
    // Haptics confirm the action, but never on their own: the visual change
    // below is what users with haptics disabled will see.
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
  }

  return (
    <View>
      <Text selectable>{code}</Text>
      <Button title={copied ? 'Copied' : 'Copy'} onPress={copy} />
    </View>
  );
}
```

## How it works

### `expo-clipboard`

| Function | Behaviour |
| --- | --- |
| `setStringAsync(text, {inputFormat?})` | Writes text. `inputFormat` is `StringFormat.PLAIN_TEXT` (default) or `StringFormat.HTML`. Resolves `boolean`. |
| `getStringAsync({preferredFormat?})` | Reads text. Resolves `''` when empty **or when the user denied paste on iOS**. |
| `hasStringAsync()` | Whether text is present. |
| `setUrlAsync(url)` / `getUrlAsync()` / `hasUrlAsync()` | URLs. |
| `setImageAsync(base64)` / `getImageAsync({format, jpegQuality?})` / `hasImageAsync()` | Images. `getImageAsync` resolves `{data, size}` with a `data:` URI prefix, or `null`. |
| `addClipboardListener(listener)` | Fires with `{contentTypes}` when the clipboard changes. Returns a subscription; call `remove()`. No-op on web. |
| `isPasteButtonAvailable` | `true` when `ClipboardPasteButton` can render (iOS 16+). |

`removeClipboardListener(subscription)` still exists but is deprecated; call `subscription.remove()`.

### The iOS paste prompt and `ClipboardPasteButton`

On iOS 16+, a programmatic read with `getStringAsync()` or `getImageAsync()` triggers the system "Allow
Paste" prompt. If the user declines, `getStringAsync()` resolves an empty string, and there is no way to tell
that apart from an empty clipboard.

`ClipboardPasteButton` renders Apple's native `UIPasteControl`. Because the user taps a system-drawn button,
iOS treats it as consent and shows no prompt.

```tsx title=components/PasteOtp.tsx
import * as Clipboard from 'expo-clipboard';
import {ClipboardPasteButton} from 'expo-clipboard';
import {useState} from 'react';
import {Button, Platform, Text, View} from 'react-native';

export function PasteOtp({onCode}: {onCode: (code: string) => void}) {
  const [error, setError] = useState<string | null>(null);

  function accept(text: string) {
    const code = text.trim();
    // Clipboard content is untrusted: validate before using it.
    if (/^\d{6}$/.test(code)) {
      onCode(code);
      setError(null);
    } else {
      setError('The clipboard does not contain a 6-digit code.');
    }
  }

  return (
    <View>
      {Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable ? (
        <ClipboardPasteButton
          acceptedContentTypes={['plain-text']}
          displayMode="iconAndLabel"
          style={{width: 160, height: 44}}
          onPress={(data) => {
            if (data.type === 'text') {
              accept(data.text);
            }
          }}
        />
      ) : (
        <Button title="Paste code" onPress={async () => accept(await Clipboard.getStringAsync())} />
      )}
      {error !== null && <Text>{error}</Text>}
    </View>
  );
}
```

`ClipboardPasteButton`'s `style` must not set `backgroundColor`, `borderRadius` or `color`; use the
`backgroundColor`, `foregroundColor` and `cornerStyle` props. Do not put both `plain-text` and `html` in
`acceptedContentTypes`, or all text is treated as HTML.

### `expo-haptics`

| Function | Use it for | Values |
| --- | --- | --- |
| `impactAsync(style?)` | A physical collision: a button press, a snap. | `ImpactFeedbackStyle.Light`, `Medium`, `Heavy`, `Soft`, `Rigid` |
| `notificationAsync(type?)` | The outcome of a task. | `NotificationFeedbackType.Success`, `Warning`, `Error` |
| `selectionAsync()` | A value changing in a picker or slider. | — |
| `performAndroidHapticsAsync(type)` | Android system haptic constants. **Android only.** | `AndroidHaptics.Confirm`, `Reject`, `Toggle_On`, `Toggle_Off`, `Long_Press`, `Keyboard_Tap`, `Clock_Tick`, `Segment_Tick`, … |

On iOS these map directly to `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator` and
`UISelectionFeedbackGenerator`. On Android, `impactAsync`, `notificationAsync` and `selectionAsync` are
**simulated with the `Vibrator` API**, which the package itself does not recommend for haptics; it points to
`performAndroidHapticsAsync` instead, which uses the device's haptics engine and does not need `VIBRATE`.

## Native configuration

Neither package has a config plugin.

:::tabs
@tab iOS

No `Info.plist` keys are needed for either package. Clipboard access needs no usage string: the iOS 16+ paste
prompt is system text you cannot customise. Haptics need no entitlement.

@tab Android

`expo-clipboard` adds no permissions.

`expo-haptics`' library manifest declares `android.permission.VIBRATE`, which is merged into your app
automatically. It is a normal, install-time permission with no prompt. It is only used by the
`Vibrator`-simulated functions; `performAndroidHapticsAsync` does not require it.

If you use **only** `performAndroidHapticsAsync`, you can remove the permission:

```json title=app.json
{
  "expo": {
    "android": {
      "blockedPermissions": ["android.permission.VIBRATE"]
    }
  }
}
```
:::

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Reading the clipboard | "Allow Paste" prompt on iOS 16+ unless via `ClipboardPasteButton` | Toast on Android 13+ when an app reads it; reads only while the app is focused |
| Denied read | Resolves `''` | Not applicable |
| Paste button | `ClipboardPasteButton` (iOS 16+) | Not available — `isPasteButtonAvailable` is `false` |
| Haptic engine | Taptic Engine | Haptics engine via `performAndroidHapticsAsync`; `Vibrator` for the cross-platform calls |
| Haptics silently skipped | Low Power Mode, Taptic Engine off in Settings, camera active, dictation active | User's touch-feedback setting, device without a haptic motor |
| Permission | None | `VIBRATE` (install-time) for `Vibrator`-based calls |

## Common patterns

### Cross-platform haptics helper

```ts title=lib/feedback.ts
import * as Haptics from 'expo-haptics';
import {Platform} from 'react-native';

export async function tapFeedback(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      // Uses the haptics engine, not the vibrator motor.
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Feedback is decorative. Never let it break the action it decorates.
  }
}
```

### Copy, then clear a sensitive value

```ts title=lib/copyRecoveryCode.ts
import * as Clipboard from 'expo-clipboard';

const CLEAR_AFTER_MS = 60_000;

export async function copyTemporarily(value: string): Promise<void> {
  await Clipboard.setStringAsync(value);
  setTimeout(async () => {
    // Only clear if the user has not copied something else since. Reading
    // here can show the iOS prompt / Android toast, so do it once, late.
    if ((await Clipboard.getStringAsync()) === value) {
      await Clipboard.setStringAsync('');
    }
  }, CLEAR_AFTER_MS);
}
```

The timer only runs while your JS is alive; if the app is killed, the value stays. This reduces exposure;
it does not guarantee removal.

## Security considerations

### The clipboard is shared, and it is visible

**Threat.** Everything you copy is readable by other apps the user runs, by third-party keyboards with full
access, and — with Universal Clipboard on Apple devices or cloud clipboard sync on some Android keyboards —
by the user's other devices.

**Exploit.** Your app copies a recovery code or a password with `setStringAsync`. Any app the user opens next
calls its own clipboard read and gets the value; a malicious keyboard with full access logs it without a
paste at all.

**Fix.**

- Prefer designs that avoid copying secrets: show them, let the user type them, or use a share sheet to a
  password manager.
- If you must copy, clear it after a short delay (see above) and tell the user you did.
- Never auto-copy anything sensitive without an explicit tap.

**Verification.** On an Android 13+ device, copy the value, switch to another app that reads the clipboard,
and observe the system toast attributing the read. On iOS, open Notes and tap Paste; iOS shows which app the
content came from. After your clear delay, paste again and confirm the value is gone.

### Clipboard content is untrusted input

**Threat.** Pasted text may be anything — a malicious URL, a script, a lookalike code.

**Fix.** Validate what you read, as the OTP example does. Never open a URL read from the clipboard without
showing it to the user first.

### Reading on launch looks like surveillance

Apps that read the clipboard without the user asking have been publicly called out through the iOS paste
banner. Read only in response to a tap, and prefer `ClipboardPasteButton` on iOS.

## Common mistakes

- **Reading the clipboard on app start.** Users see the iOS prompt or Android toast. Read on a tap.
- **Treating `''` as "clipboard empty" on iOS.** It may mean the user denied paste.
- **Using `impactAsync` on Android for native-feeling haptics.** It is simulated with the vibrator; use
  `performAndroidHapticsAsync`.
- **Haptics as the only feedback.** Low Power Mode and user settings disable them silently.
- **Testing haptics on a simulator.** There is no engine; use a device.
- **Awaiting haptics before completing an action.** Fire them without letting a failure block the action.
- **Copying passwords without clearing them.** Other apps and keyboards can read the clipboard.
- **Setting `backgroundColor` in `ClipboardPasteButton`'s `style`.** Use the `backgroundColor` prop.
- **Using React Native core `Clipboard`.** Use `expo-clipboard`.

## Related topics

- [Secure Store](secure-store.md) — where secrets belong instead of the clipboard.
- [Sensors](sensors.md) — shake and tilt gestures to pair with haptic feedback.
- [Linking](linking.md) — validating URLs before opening them.
- [Permissions Hygiene](../expo-security/permissions-hygiene.md) — removing permissions you do not use.
- [Permissions Patterns](permissions-patterns.md) — `blockedPermissions` and the permission model.
