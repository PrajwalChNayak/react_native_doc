# Forms and keyboard handling

A four-field sign-up form that behaves correctly on both platforms: the keyboard does not cover
the field you are typing in, the return key moves down the form, submit focuses the first
problem instead of just refusing, and the OS can offer a saved password.

Form logic lives in `src/validation.ts` as pure functions, separate from the component. That is
what makes it testable without rendering anything — and validation that can only be exercised
through the UI is the kind that rots.

## Run it

This directory holds the JavaScript and TypeScript only. Generating a correct 0.87 `android/`
and `ios/` project by hand is not feasible, so create the native projects with the Community CLI
and copy this source in:

```bash
npx @react-native-community/cli@20.2.0 init FormsAndKeyboard --version 0.87.1
```

Copy `App.tsx`, `src/`, `__tests__/` and `jest.config.js` into the generated project, then:

```bash
npm install react-native-safe-area-context@5.9.1
```

iOS also needs its native dependencies (**macOS with Xcode only**):

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

Run it:

```bash
npm start
```

```bash
npm run android
```

```bash
npm run ios
```

## Android needs one native setting

`KeyboardAvoidingView` with `behavior="height"` cooperates with the window resizing that Android
does itself. That only happens when the activity asks for it, so check
`android/app/src/main/AndroidManifest.xml`:

```xml title=android/app/src/main/AndroidManifest.xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize">
```

If the value is `adjustPan` or `adjustNothing` the keyboard will cover the lower fields no
matter what the JavaScript does. Check yours rather than assuming — this example does not ship
a native project, and the value in a freshly generated app is whatever that CLI version sets.

## What you should see

- Tapping the last field scrolls it clear of the keyboard on both platforms.
- The return key reads **next** on the first three fields and moves focus down; on the last it
  reads **done** and submits.
- Submitting an incomplete form marks every field and **focuses the first invalid one**.
- Errors appear on blur, not on every keystroke, and clear as soon as the field becomes valid.
- The password fields offer the platform password manager, because `autoComplete` and
  `textContentType` are both set.

## Platform differences this example handles

| Concern | iOS | Android |
| --- | --- | --- |
| `KeyboardAvoidingView` `behavior` | `padding` — iOS does not resize the window, so the view adds the inset itself | `height` — the window already resizes when the activity uses `adjustResize` |
| Autofill hint | `textContentType` | `autoComplete` |
| Keyboard timing | Reports before the animation, so layout can lead it | Reports after the keyboard is shown |

Using one `behavior` on both platforms is the usual cause of a form that jumps twice or not at
all.

## 0.87 details worth noting

- Refs are typed **`TextInputInstance`**. `NativeMethods` and `NativeMethodsMixin` were removed
  in 0.87; the generic host type is now `HostInstance`.
- `keyboardShouldPersistTaps` no longer accepts a boolean. This form uses `"handled"`, which
  lets a tap on the submit button register on the first press while a tap on empty space still
  dismisses the keyboard.
- `submitBehavior` replaces the old `blurOnSubmit` prop.

## Security note

The password is held in component state and sent nowhere. A real implementation must send it
over HTTPS and **never** write it to `AsyncStorage`, a log line, or a crash report — see
[Safe Logging in Release Builds](../../content/security/safe-logging.md) and
[Keychain and Keystore](../../content/security/secure-storage-keychain-keystore.md).

The 12-character minimum is deliberate: length raises an attacker's work far more reliably than
composition rules, which mostly push people towards `Password1!` and a sticky note.

## Verify

```bash
npm run tsc
```

```bash
npm test
```

Both pass on Node 22.13.0 or newer — 11 tests covering the validation rules and the
focus-the-first-problem ordering.

## Related reading

- [TextInput](../../content/components/textinput.md)
- [KeyboardAvoidingView](../../content/components/keyboardavoidingview.md)
- [Accessibility APIs](../../content/platform-apis/accessibility.md)
