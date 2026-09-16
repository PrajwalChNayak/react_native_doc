---
title: TextInput
description: Controlled and uncontrolled text entry, keyboard configuration, autofill on both platforms, and why controlled inputs drop characters.
status: current
toolchain: cli
---

`TextInput` is the editable text field. It wraps `UITextField` / `UITextView` on iOS and
`EditText` on Android, and it is the component where the two platforms diverge most: keyboard
types, autofill hints, return-key behaviour and multiline layout all differ.

It is also the component most likely to feel laggy if you wire it up naively, because every
keystroke can become a React render.

## Why it exists / when to use it — and when NOT to

Use `TextInput` for any text the user types: search fields, forms, chat composers, one-time
codes.

Do not use it when:

- **The value is a choice, not free text.** A picker, a [Switch](switch.md) or a segmented
  control communicates the constraint and avoids validation.
- **You need rich text editing.** Core `TextInput` has no bold/italic spans. That needs a
  native editor or a WebView.
- **You want a read-only label.** `editable={false}` still renders a focusable input on some
  paths. Use [Text](text.md) with `selectable` instead.

## Basic example

```tsx title=src/components/EmailField.tsx
import {useState} from 'react';
import {View, Text, TextInput, StyleSheet} from 'react-native';

export function EmailField() {
  const [email, setEmail] = useState('');

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        // inputMode picks the keyboard and takes precedence over keyboardType.
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        placeholderTextColor="#9ca3af"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {gap: 6},
  label: {fontSize: 13, fontWeight: '600', color: '#374151'},
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
```

## How it works

### Controlled versus uncontrolled

A **controlled** input passes `value` and updates it from `onChangeText`. React owns the
truth, and the native field is forced to match on every render.

An **uncontrolled** input passes `defaultValue` and reads the current text from
`onChangeText` into a ref, or not at all. The native field owns the truth.

Controlled is the right default because validation, formatting and "clear the form" all become
trivial. It has one real failure mode: if the state update is slow — a heavy parent re-render,
an expensive validation on every keystroke, a state library with a deep subscription — the
native field can get ahead of React, and React then forces the value back, which looks like
dropped or reordered characters.

The fix is not to abandon controlled inputs. It is to keep the update path cheap:

```tsx title=Keeping a controlled input cheap
import {useState, useMemo, useCallback} from 'react';
import {View, Text, TextInput, StyleSheet} from 'react-native';

export function SearchField({onQuery}: {onQuery: (q: string) => void}) {
  const [text, setText] = useState('');

  // Derive, do not re-validate the world on every keystroke.
  const tooShort = useMemo(() => text.trim().length > 0 && text.trim().length < 3, [text]);

  const handleChange = useCallback(
    (next: string) => {
      setText(next);
      // The expensive part is debounced by the caller, not run per character.
      onQuery(next);
    },
    [onQuery],
  );

  return (
    <View style={styles.field}>
      <TextInput value={text} onChangeText={handleChange} style={styles.input} />
      {tooShort ? <Text style={styles.hint}>Type at least 3 characters</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {gap: 4},
  input: {borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10},
  hint: {fontSize: 12, color: '#b45309'},
});
```

> [!NOTE] The `value` prop is also how you block edits without flicker
> The 0.87 type comment says it plainly: setting the same `value` to prevent edits causes
> flickering. Use `editable={false}` or `readOnly`, or cap with `maxLength`.

### Choosing the keyboard

There are two props and one of them wins.

- **`inputMode`** is the web-style spelling: `'none'`, `'text'`, `'decimal'`, `'numeric'`,
  `'tel'`, `'search'`, `'email'`, `'url'`. **It takes precedence over `keyboardType`.**
- **`keyboardType`** is the older, platform-flavoured set. Cross-platform values are
  `'default'`, `'numeric'`, `'number-pad'`, `'decimal-pad'`, `'email-address'`, `'phone-pad'`
  and `'url'`. Only `keyboardType` gives you the iOS-only and Android-only keyboards.

Use `inputMode` unless you specifically need one of the platform keyboards. Do not set both —
`keyboardType` will be ignored and the next reader will waste time on it.

### The return key

`enterKeyHint` (`'enter'`, `'done'`, `'go'`, `'next'`, `'previous'`, `'search'`, `'send'`)
labels the key. `returnKeyType` is the older equivalent with a larger platform-specific set.

`submitBehavior` decides what pressing it does:

| Value | Single line | Multiline |
| --- | --- | --- |
| `undefined` | behaves as `'blurAndSubmit'` | behaves as `'newline'` |
| `'submit'` | fires `onSubmitEditing`, keeps focus | same |
| `'blurAndSubmit'` | blurs **and** fires `onSubmitEditing` | same |
| `'newline'` | behaves as `'blurAndSubmit'` | inserts a newline |

> [!DEPRECATED] `blurOnSubmit` is superseded
> `blurOnSubmit` still exists and still works, but it is marked deprecated in the 0.87 types
> and `submitBehavior` overrides whatever it says. Write new code with `submitBehavior`.

### Focus management

`TextInputInstance` gives you `focus()`, `blur()`, `clear()`, `isFocused()` and
`setSelection(start, end)`.

```tsx title=Moving focus to the next field on submit
import {useRef} from 'react';
import {View, TextInput, StyleSheet} from 'react-native';
import type {TextInputInstance} from 'react-native';

export function LoginForm() {
  const passwordRef = useRef<TextInputInstance | null>(null);

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        inputMode="email"
        autoCapitalize="none"
        autoComplete="email"
        enterKeyHint="next"
        // 'submit' keeps focus in this field until we move it ourselves,
        // which avoids the keyboard closing and reopening between fields.
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextInput
        ref={passwordRef}
        style={styles.input}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        enterKeyHint="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {gap: 12},
  input: {borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10},
});
```

### Autofill, on both platforms

Password managers and the OS credential stores need hints, and the two platforms read
different props:

- **`autoComplete`** is the cross-platform prop. It is a long enumerated list
  (`'email'`, `'username'`, `'current-password'`, `'new-password'`, `'one-time-code'`,
  `'cc-number'`, `'postal-code'`, …) plus `'off'` to disable. On Android the system will try
  autofill by heuristic even without it, which is why `'off'` matters.
- **`textContentType`** is iOS-only and feeds the same information to iOS in Apple's
  vocabulary (`'emailAddress'`, `'password'`, `'newPassword'`, `'oneTimeCode'`, …).
- **`importantForAutofill`** is Android-only and controls whether the field appears in the
  autofill view structure at all (`'auto'`, `'no'`, `'noExcludeDescendants'`, `'yes'`,
  `'yesExcludeDescendants'`).

Set `autoComplete` always, add `textContentType` for the iOS-specific meanings, and reach for
`importantForAutofill` only to *exclude* a field.

For SMS one-time codes, `autoComplete="sms-otp"` on Android and
`textContentType="oneTimeCode"` on iOS together give you the keyboard suggestion strip.

## Platform differences

:::tabs
@tab iOS
- **`keyboardAppearance`** (`'default'` / `'light'` / `'dark'`) matches the keyboard to your
  theme. There is no Android equivalent — Android follows the system theme.
- **`clearButtonMode`** (`'never'` / `'while-editing'` / `'unless-editing'` / `'always'`) adds
  the native clear "x". Android has no built-in one; you render your own.
- **`clearTextOnFocus`** empties the field when it gains focus.
- **`enablesReturnKeyAutomatically`** greys out the return key while the field is empty.
- **`inputAccessoryViewID`** links the field to an `InputAccessoryView` rendered above the
  keyboard — the standard place for a "Done" toolbar. `inputAccessoryViewButtonLabel`
  overrides the default button label.
- **`textContentType`** and **`passwordRules`** drive the iOS strong-password generator.
- **`dataDetectorTypes`** turns phone numbers, links and addresses into tappable spans, but
  only when `multiline` is `true` **and** `editable` is `false`.
- **`spellCheck`** controls the red underline; it inherits from `autoCorrect` by default.
- **`scrollEnabled`** only applies when `multiline` is `true`.
- **`smartInsertDelete`** governs iOS's automatic space handling around cut and paste.
@tab Android
- **`underlineColorAndroid`** sets (or removes, with `'transparent'`) the Material underline.
  This is the first prop most people need, because the underline is not in the iOS design.
- **`cursorColor`** and **`selectionHandleColor`** style the caret and the selection handles
  independently of `selectionColor`.
- **`disableFullscreenUI`** stops Android from opening a full-screen editor in landscape. Set
  it to `true` for anything that is part of a larger layout.
- **`importantForAutofill`** controls participation in the autofill view structure
  (API 26+).
- **`textBreakStrategy`** and **`textAlignVertical`** (`'auto'` / `'top'` / `'bottom'` /
  `'center'`) matter for multiline fields. `textAlignVertical: 'top'` is almost always what you
  want on a multiline input, because Android vertically centres by default and iOS does not.
- **`showSoftInputOnFocus={false}`** focuses the field without raising the keyboard — used for
  custom numeric pads.
- **`inlineImageLeft`** draws a drawable from `android/app/src/main/res/drawable` inside the
  field, with `inlineImagePadding` for spacing.
- **`returnKeyLabel`** sets an arbitrary string on the return key, which iOS cannot do.
- **`rows`** and **`numberOfLines`** size a multiline field; on iOS you size it with `height`
  or by tracking `onContentSizeChange`.
:::

The multiline case is where the platforms most visibly disagree. On Android, text starts
vertically centred; on iOS it starts at the top. Setting `textAlignVertical: 'top'` in the
style aligns them.

## Common patterns

### An auto-growing multiline composer

```tsx title=src/components/Composer.tsx
import {useState} from 'react';
import {TextInput, StyleSheet} from 'react-native';
import type {TextInputContentSizeChangeEvent} from 'react-native';

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 120;

export function Composer() {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [text, setText] = useState('');

  function handleContentSizeChange(event: TextInputContentSizeChangeEvent) {
    const next = event.nativeEvent.contentSize.height;
    setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next)));
  }

  return (
    <TextInput
      multiline
      value={text}
      onChangeText={setText}
      onContentSizeChange={handleContentSizeChange}
      // Android centres multiline text vertically; iOS does not. This aligns them.
      style={[styles.input, {height}]}
      // Keep Enter as a newline in a composer; send with an explicit button.
      submitBehavior="newline"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
    fontSize: 16,
  },
});
```

### Formatting as the user types

Format in the change handler and write the formatted value back, so the controlled value and
the displayed value never disagree.

```tsx title=A card-number field
import {useState, useCallback} from 'react';
import {TextInput, StyleSheet} from 'react-native';

function groupDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function CardNumberField() {
  const [value, setValue] = useState('');

  const handleChange = useCallback((next: string) => {
    setValue(groupDigits(next));
  }, []);

  return (
    <TextInput
      value={value}
      onChangeText={handleChange}
      inputMode="numeric"
      autoComplete="cc-number"
      // 19 = 16 digits + 3 separating spaces.
      maxLength={19}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16},
});
```

### Dismissing the keyboard

`Keyboard.dismiss()` closes it from anywhere. Inside a scrolling form, combine it with
`keyboardShouldPersistTaps="handled"` on the [ScrollView](scrollview.md) so buttons still work
on the first tap.

```tsx title=Dismissing on submit
import {TextInput, Keyboard} from 'react-native';

export function DismissOnSubmit() {
  return (
    <TextInput
      enterKeyHint="search"
      submitBehavior="blurAndSubmit"
      onSubmitEditing={() => Keyboard.dismiss()}
    />
  );
}
```

## Performance considerations

**Every keystroke is a render in a controlled input.** Keep the component that owns the state
small. A `TextInput` bound to state near the root of a screen re-renders the whole screen per
character. Push the state into the smallest component that needs it.

**Debounce the side effect, not the input.** Debouncing `setText` makes typing feel broken.
Debounce the search request or the validation that follows it.

**Do not run regular expressions over long text on every keystroke.** Validate on blur, or on
submit, or on a debounced timer.

**`onChange` and `onChangeText` both fire.** Subscribe to one. `onChangeText` is the simpler
one; `onChange` gives you the event with `eventCount`, which the native side uses for
reconciliation.

**Avoid inline style arrays on inputs inside lists.** The same memoisation rule as everywhere
else: `style={[styles.input, {height}]}` allocates per render, which is fine for one field and
costly in a list of fifty.

## Security considerations

**Threat.** Text inputs are where credentials and payment data enter the app. Three concrete
risks: the OS screenshotting the field into the app-switcher thumbnail, the keyboard's own
learning dictionary retaining what was typed, and the value being logged.

**Exploit.** A password field without `secureTextEntry` and with autocorrect on teaches the
device keyboard the password, which then appears as a suggestion in other apps. A debug
`console.log(values)` left in a form handler writes the password to logcat, where any app with
log-read access on an older Android — or anyone with the device attached to `adb` — can read
it:

```bash
adb logcat | grep -i password
```

**Fix.** Mark secret fields correctly and never log the values.

```tsx title=A password field configured correctly
import {useState} from 'react';
import {TextInput, StyleSheet} from 'react-native';

export function PasswordField() {
  const [password, setPassword] = useState('');

  return (
    <TextInput
      value={password}
      onChangeText={setPassword}
      // secureTextEntry also keeps the value out of the keyboard's learned dictionary.
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="current-password"
      textContentType="password"
      // Keep the field out of Android's autofill structure if you manage credentials
      // yourself and do not want them mirrored into a third-party autofill service.
      importantForAutofill="no"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10},
});
```

`secureTextEntry` and `multiline` do not combine: on iOS the secure masking is lost. Keep
secret fields single-line.

**Verification.** Two checks you can run yourself:

1. Type a unique string into the field, then open any other app's text field and confirm it is
   not offered as a suggestion.
2. With the app in a release build, run `adb logcat` while submitting the form and grep for the
   value you typed. Nothing should appear.

Screenshot protection in the app switcher is a native concern, not a `TextInput` prop — see
[Threat Model](../security/threat-model.md).

> [!DANGER] A masked field is not encrypted storage
> `secureTextEntry` hides the characters on screen. The value is a plain JavaScript string in
> memory, and anything you persist it to is only as safe as that store. Credentials belong in
> Keychain / Keystore — see [Secure Storage](../state-and-data/secure-storage.md).

## Common mistakes

- **Setting both `inputMode` and `keyboardType`.** `inputMode` wins, so the `keyboardType` you
  carefully chose is dead code.
- **Leaving `autoCapitalize` at its default on an email or username field.** The default is
  `'sentences'`, so the first character is capitalised and the login fails.
- **Using `blurOnSubmit` in new code.** Deprecated in 0.87, and overridden by `submitBehavior`.
- **Forgetting `textAlignVertical: 'top'` on Android multiline fields.** The text sits in the
  middle of the box and looks like a layout bug.
- **Debouncing `setText` itself.** The field becomes unresponsive. Debounce what happens
  *after* the state update.
- **Combining `secureTextEntry` with `multiline`.** Masking breaks on iOS.
- **Expecting `clearButtonMode` to do anything on Android.** It is iOS-only; render your own
  clear button.
- **Validating on every keystroke with a heavy regular expression.** This is the usual cause of
  "typing feels laggy on Android" reports.

## Related topics

- [Text](text.md) — the read-only counterpart.
- [KeyboardAvoidingView](keyboardavoidingview.md) — keeping the focused field visible.
- [ScrollView](scrollview.md) — `keyboardShouldPersistTaps` and `keyboardDismissMode`.
- [Secure Storage](../state-and-data/secure-storage.md) — where credentials go after the form.
- [Accessibility APIs](../platform-apis/accessibility.md) — labelling fields for screen readers.
- [Safe Logging](../security/safe-logging.md) — keeping user input out of logs.
