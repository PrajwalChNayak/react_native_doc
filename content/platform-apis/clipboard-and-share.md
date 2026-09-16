---
title: Clipboard and Share
description: Core Clipboard, Share and ActionSheetIOS — what each one actually does on each platform, and the paste-transparency and file-sharing details that are not in the API.
status: current
toolchain: cli
---

These are two of the few platform APIs React Native still ships in core, and both are small
enough to learn in a minute. `Clipboard` has exactly two methods. `Share` has one.

The interesting part is not the API — it is that both behave meaningfully differently on each
platform, and that both are privacy-relevant in ways the method signatures do not hint at. Core
`Share` silently discards the `url` you pass on Android. Reading the clipboard on iOS 14+ shows
the user a banner naming your app.

## Why it exists — and when NOT to use it

A "Copy" button is the cheapest useful affordance in a mobile app: no permission, no dialog, no
network. The system share sheet is nearly as cheap and hands your content to every other app on
the device without you integrating with any of them.

What core does not cover: sharing **files**, sharing to a specific app, reading or writing
images, and knowing when the clipboard changes. Those need a library or native code. Reach for
one only when you actually need that; the core APIs cover the common cases without a dependency.

## Native configuration

Neither API needs a permission on either platform. What native configuration exists is for the
cases just past the edge of core.

:::tabs
@tab iOS

Nothing in `Info.plist` is required for `Clipboard`, `Share` or `ActionSheetIOS`.

Two entries become relevant nearby:

```xml title=ios/AwesomeProject/Info.plist
<!-- Only if you offer a share shortcut to a specific app and want to hide it
     when that app is not installed. canOpenURL returns false for any scheme
     not listed here. -->
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>whatsapp</string>
  <string>tg</string>
</array>
```

See [Linking](linking.md) for why that array is required and what happens without it.

Since **iOS 14**, reading the pasteboard shows the user a transient banner — `AwesomeProject
pasted from Notes`. This is not configurable and cannot be suppressed. What you can do is avoid
reading at all: the detection APIs (`hasString`, `hasURL`, `hasNumber`, `hasWebURL` in the
community clipboard package) answer "is there something pasteable?" without triggering the
banner. Core `Clipboard` has no such method.

@tab Android

No permission is needed for `Clipboard` or `Share`.

Handing a **file** to another app does need configuration, because Android forbids passing a
raw `file://` URI across app boundaries. You declare a `FileProvider` and share a `content://`
URI instead:

```xml title=android/app/src/main/AndroidManifest.xml
<application ...>
  <provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
      android:name="android.support.FILE_PROVIDER_PATHS"
      android:resource="@xml/file_paths" />
  </provider>
</application>
```

```xml title=android/app/src/main/res/xml/file_paths.xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
  <!-- Expose only the subdirectory you intend to share from, never the root. -->
  <cache-path name="shared_exports" path="exports/" />
</paths>
```

Core `Share` cannot use this — it only forwards `title` and `message` on Android. The provider
is what a file-sharing library or your own TurboModule will need.

Since **Android 13**, the system shows a confirmation UI when an app writes to the clipboard,
including a preview of the copied text. Marking a copy as sensitive so the preview is hidden
requires setting `ClipDescription.EXTRA_IS_SENSITIVE` on the native side; core `Clipboard` does
not expose it.

:::

## Basic example

```tsx title=src/components/CopyableCode.tsx
import {useCallback, useState} from 'react';
import {Clipboard, Platform, Pressable, StyleSheet, Text, ToastAndroid, View} from 'react-native';

export function CopyableCode({code}: {code: string}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    Clipboard.setString(code);
    if (Platform.OS === 'android') {
      // Android 13+ shows its own system confirmation, so a second toast is
      // redundant there. Older versions show nothing, so feedback is on you.
      ToastAndroid.show('Copied', ToastAndroid.SHORT);
    } else {
      // iOS shows nothing at all. Without in-app feedback the tap looks broken.
      setCopied(true);
    }
  }, [code]);

  return (
    <View style={styles.row}>
      <Text style={styles.code} selectable>
        {code}
      </Text>
      <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel="Copy code">
        <Text>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16},
  code: {flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'},
});
```

Sharing:

```tsx title=src/share/shareArticle.ts
import {Platform, Share} from 'react-native';

export async function shareArticle(title: string, url: string): Promise<boolean> {
  const result = await Share.share(
    {
      title,
      // On Android, `url` is dropped entirely — only `title` and `message` are
      // forwarded. Put the link in the message so both platforms carry it.
      message: Platform.OS === 'android' ? `${title}\n${url}` : title,
      url,
    },
    {
      dialogTitle: 'Share this article', // Android
      subject: title, // iOS, used when sharing by email
    },
  );

  // Android always resolves with 'sharedAction' regardless of what the user did.
  return result.action === Share.sharedAction;
}
```

## How it works

### `Clipboard` is two methods

```ts title=The whole of core Clipboard
import {Clipboard} from 'react-native';

export async function readClipboard(): Promise<string> {
  // Asynchronous because the pasteboard read crosses to native.
  return Clipboard.getString();
}

export function writeClipboard(value: string): void {
  // Synchronous, fire-and-forget. There is no failure signal.
  Clipboard.setString(value);
}
```

There is no `hasString`, no change listener, no image support and no way to clear it other than
setting an empty string. If you need any of those, `@react-native-clipboard/clipboard` 1.16.3
adds `getStrings`, `setStrings`, `hasString`, `hasImage`, `hasURL`, `hasNumber`, `hasWebURL`,
`getImage`, `getImagePNG`, `getImageJPG`, `setImage`, `addListener` and `removeAllListeners`. It
ships a Codegen spec (`rnclipboard`), so it is a real TurboModule.

The `has*` family is the reason most apps eventually add it: on iOS 14+ they let you enable a
"Paste" button only when there is something to paste, without triggering the paste banner that
an actual read would.

### `Share` opens the system sheet

`Share.share(content, options)` takes content where **at least one of `url` or `message` is
required**, and resolves with `{action, activityType}`.

| Field | iOS | Android |
| --- | --- | --- |
| `content.message` | used | used |
| `content.url` | used | **discarded** |
| `content.title` | ignored | used |
| `options.dialogTitle` | ignored | used |
| `options.subject` | used (email subject) | ignored |
| `options.excludedActivityTypes` | used | ignored |
| `options.tintColor` | used | ignored |
| `options.anchor` | used (iPad popover) | ignored |

That `url` row is verified in the core implementation: on Android the module builds a new object
containing only `title` and `message` before calling native. A share that "loses the link on
Android" is not a device quirk — it is this.

`result.action` is `'sharedAction'` or `'dismissedAction'`. **On Android it is always
`'sharedAction'`**, even when the user backed out, because the platform does not report the
outcome. Do not build analytics or a reward on it.

### `ActionSheetIOS` for iOS-native menus

When you need a menu of options rather than a share sheet, `ActionSheetIOS` is the native one —
and it is iOS-only, so it needs an Android branch.

```tsx title=src/components/useOptionsMenu.tsx
import {ActionSheetIOS, Alert, Platform} from 'react-native';

type Option = {label: string; destructive?: boolean; run: () => void};

export function showOptions(title: string, options: Option[]): void {
  if (Platform.OS === 'ios') {
    const labels = [...options.map(o => o.label), 'Cancel'];
    const destructiveButtonIndex = options.findIndex(o => o.destructive === true);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        // -1 would be read as a real index, so omit the key when there is none.
        ...(destructiveButtonIndex >= 0 ? {destructiveButtonIndex} : {}),
      },
      index => options[index]?.run(),
    );
    return;
  }

  // Android has no action-sheet primitive in core. Alert is the closest thing
  // core offers; a bottom sheet component is the better product answer.
  Alert.alert(title, undefined, [
    ...options.map(o => ({
      text: o.label,
      style: o.destructive === true ? ('destructive' as const) : undefined,
      onPress: o.run,
    })),
    {text: 'Cancel', style: 'cancel'},
  ]);
}
```

`ActionSheetIOS` also has `showShareActionSheetWithOptions`, which is what `Share.share` calls
internally on iOS. Use `Share` unless you need the callback-based error handling.

## Platform differences

:::tabs
@tab iOS

- Reading the pasteboard shows the user a banner from iOS 14. There is no opt-out.
- The universal clipboard syncs between a user's Apple devices, so a copied value may leave the
  phone entirely.
- `Share` reports the real outcome: `dismissedAction` when the user cancels, and
  `activityType` naming the target app.
- On iPad, a share sheet or action sheet presented without `anchor` is undefined behaviour — it
  must be anchored to a view or it can crash.
- `ActionSheetIOS` is native and looks it. There is no Android equivalent in core.

@tab Android

- `Share` drops `content.url`. Put the link in `message`.
- `Share` always resolves `'sharedAction'`; the outcome is not observable.
- From Android 13, the system shows its own copy confirmation with a preview of the text.
  Hiding that preview for a password or token needs the native `EXTRA_IS_SENSITIVE` flag.
- From Android 12, reading the clipboard from the background produces a visible toast naming
  your app.
- `ToastAndroid` is the idiomatic "Copied" feedback, and is Android-only.
- Sharing a file needs a `FileProvider` and a `content://` URI. A `file://` URI thrown at
  another app raises `FileUriExposedException`.

:::

## Common patterns

### Paste only when there is something to paste

```tsx title=src/components/PasteButton.tsx
import {useCallback} from 'react';
import {Clipboard, Pressable, Text} from 'react-native';

export function PasteButton({onPaste}: {onPaste: (value: string) => void}) {
  const paste = useCallback(async () => {
    const value = await Clipboard.getString();
    // Core has no `hasString`, so guard on the value. This read still costs the
    // iOS paste banner — only the community package can check without one.
    if (value.length > 0) onPaste(value.trim());
  }, [onPaste]);

  return (
    <Pressable onPress={paste} accessibilityRole="button">
      <Text>Paste</Text>
    </Pressable>
  );
}
```

Never read the clipboard on mount or on screen focus. It is a privacy-hostile pattern, it costs
a user-visible banner every time, and it is the behaviour that made iOS add the banner in the
first place.

### Give feedback yourself

Neither platform gives you a completion signal you can trust for "copied". iOS shows nothing at
all; Android 13 shows a system confirmation but older versions do not. Render your own state
change — a label swap, a checkmark, a toast — and do not rely on the OS to tell the user
anything happened.

## Security considerations

**Threat.** The clipboard is **shared, global, and not access-controlled**. Any app the user
opens next can read it. On iOS it also syncs to their other Apple devices. Putting a password,
a one-time code, an API token or a recovery phrase there hands it to every app on the device
and, for the universal clipboard, to every device on the account.

**Exploit.** On Android the clipboard is readable with one command, and on older versions any
foreground app could poll it silently:

```bash
# Read whatever the last app copied.
adb shell service call clipboard 1
```

A crypto wallet that offers "Copy recovery phrase", or a banking app that copies a one-time
code "for convenience", has just published that secret to the device.

**Fix.**

1. **Do not offer a copy affordance for secrets.** This is a product decision, not a code one.
   If a value must never reach another app, do not put a Copy button next to it.
2. **If you must copy something short-lived, clear it.** There is no expiring clipboard, so do
   it yourself and be honest that it is best-effort:

```ts title=src/clipboard/copyEphemeral.ts
import {Clipboard} from 'react-native';

/**
 * Copy a short-lived value and clear it after `ms`. Best-effort only: another
 * app may read it within the window, and the clear does not run if the process
 * is killed first. Never use this for a long-lived secret.
 */
export function copyEphemeral(value: string, ms = 30_000): () => void {
  Clipboard.setString(value);
  const timer = setTimeout(() => {
    void Clipboard.getString().then(current => {
      // Only clear if it is still ours — the user may have copied something else.
      if (current === value) Clipboard.setString('');
    });
  }, ms);
  return () => clearTimeout(timer);
}
```

3. **Treat pasted content as untrusted input.** A pasted string can be a deep link, a script, a
   path traversal or 10 MB of text. Validate and bound it exactly as you would a network
   response — see [Deep Link Validation](../security/deep-link-validation.md).
4. **Do not log what you copy or paste.** `console.log(pasted)` in a release build writes it to
   the system log; see [Safe Logging](../security/safe-logging.md).

**Verification.** Copy a value from the screen in question, background your app, and read the
clipboard from the shell with the command above. If a secret comes back, the feature is the
finding. Then wait past your clear timeout and repeat to confirm the clear actually ran.

## Common mistakes

- **Expecting `url` to survive on Android.** Wrong: `Share.share({url})` and a bug report that
  the link is missing. Right: put the link in `message` on Android — core drops `url` before it
  reaches native.
- **Trusting `result.action` on Android.** Wrong: counting shares, or unlocking a reward, from
  `'sharedAction'`. Right: it is always `'sharedAction'` there, including on cancel.
- **Reading the clipboard automatically.** Wrong: `getString()` on mount to pre-fill a coupon
  field. Right: read only in response to an explicit tap. On iOS every read shows the user a
  banner with your app's name on it.
- **Offering "Copy" for a secret.** Wrong: a Copy button beside a recovery phrase or a one-time
  code. Right: do not put it on the clipboard at all; the clipboard is shared with every app.
- **No feedback after copying.** Wrong: assuming the OS confirms it. Right: iOS shows nothing,
  and Android only shows its confirmation from 13. Change something on screen.
- **Presenting a share sheet on iPad without `anchor`.** Wrong: calling `Share.share` from a
  button with no anchor on iPad. Right: pass `options.anchor` — an unanchored popover is
  undefined behaviour.
- **Sharing a `file://` URI on Android.** Wrong: handing another app a raw file path. Right:
  declare a `FileProvider` and share a `content://` URI; core `Share` cannot do this at all.

## Related topics

- [Linking](linking.md) — opening another app, and the `LSApplicationQueriesSchemes` requirement.
- [File System](file-system.md) — producing the file you want to share.
- [Deep Link Validation](../security/deep-link-validation.md) — validating pasted or incoming URLs.
- [Safe Logging](../security/safe-logging.md) — keeping copied values out of release logs.
- [Modal](../components/modal.md) — when a bottom sheet is the better answer than an action sheet.
- [Platform Differences](../core-concepts/platform-differences.md) — the general shape of this divergence.
