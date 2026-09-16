---
title: What OTA Updates May Not Change
description: The technical boundary of an over-the-air update — JavaScript and assets only, never native code — and the App Store and Google Play rules that constrain how you use updates, stated without overclaiming.
status: current
toolchain: expo
sdk: 57
---

An over-the-air (OTA) update delivered by `expo-updates` replaces **the JavaScript bundle and the
assets** an installed app runs. It never replaces native code. That is a technical fact about how the
update client works, and it is the first of two boundaries on this page.

The second boundary is policy. Apple and Google both have rules about apps that download code, and an
update has to satisfy them whether or not it is technically possible. This page states what those
rules say and where the uncertainty is. It is not legal advice, and it cannot tell you how a reviewer
will read your specific app.

## Why it exists / when to use it — and when NOT to

Read this page before you rely on updates for anything beyond bug fixes. Teams get into trouble in
two ways: publishing an update that needs native code the binary does not have, which crashes the
app, and using updates to change what an app *is*, which is what store rules prohibit.

Use OTA updates for fixes and changes that stay inside the existing native binary and the app's
reviewed purpose. Ship a new binary for everything else.

## Basic example

A change that **can** ship as an update:

```tsx title=src/CheckoutButton.tsx
import {Pressable, StyleSheet, Text} from 'react-native';

type Props = {onPress: () => void};

// Fixing a label, a style or a JavaScript bug: bundle-only, safe for an update.
export default function CheckoutButton({onPress}: Props) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.label}>Place order</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {padding: 16, borderRadius: 8, backgroundColor: '#0b3d91'},
  label: {color: '#ffffff', fontWeight: '600', textAlign: 'center'},
});
```

A change that **cannot**:

```bash
# Adding a library with native code changes the binary. No update can deliver it.
npx expo install expo-camera
```

After that install you need a new build, a new runtime version, and — for store users — a store
release.

## How it works

### The technical boundary

Expo's EAS Update FAQ lists what an update can and cannot change. Summarised:

| Can change in an update | Needs a new binary |
| --- | --- |
| JavaScript code | Native code (Kotlin, Swift, Objective-C, C++) |
| UI, styling and layout implemented in JavaScript | Adding, removing or upgrading a library with native code |
| Copy and translations | App permissions (camera, location, and so on) |
| Images and other assets | The Expo SDK version |
| | Anything else that requires a new app binary |

The reason is structural. The binary contains the native code and a JavaScript runtime. An update
contains a bundle and assets. The update client swaps the bundle; nothing in it can compile or load new
native code.

Some less obvious members of the right-hand column:

- **App config values compiled into the native project.** Icons, splash screen, bundle identifier,
  URL schemes, `Info.plist` entries, Android manifest entries and entitlements are written into the
  native project at build time. Changing them in `app.json` does nothing for an installed binary.
- **Config plugin changes.** A plugin runs during prebuild. An update never re-runs it.
- **Changes to `expo-updates` configuration itself.** The update server URL, check behaviour and code
  signing certificate are embedded in the binary.
- **A JavaScript change that calls a native API the binary lacks.** The bundle is valid JavaScript;
  it fails when it reaches the missing native module.

That last case is what the [runtime version](runtime-versions.md) exists to prevent: an update is
served only to binaries whose runtime version matches, so an update built against different native
code does not reach them — provided the runtime version actually changed when the native code did.

### When an update goes wrong anyway

If a downloaded update fails to launch, `expo-updates` has fallback behaviour, and
`Updates.isEmergencyLaunch` reports when the app launched in that state. You also have server-side
tools: `eas update:rollback`, `eas update:roll-back-to-embedded`, and republishing an earlier update.
See [Rollouts and Rollbacks](rollouts-and-rollbacks.md).

### Apple's rules

The App Store Review Guidelines, **2.5.2**, say apps should be self-contained in their bundles and may
not download, install or execute code that introduces or changes features or functionality of the
app. Guideline **4.7** separately permits certain software not embedded in the binary — including
HTML5 and JavaScript mini apps and mini games — under conditions stated there, and makes you
responsible for that software complying with the guidelines.

What that means for OTA updates, stated as carefully as the sources allow:

- **Bug fixes to existing behaviour** are the use most consistent with 2.5.2's wording, because they do
  not introduce or change features.
- **Shipping a new feature, or changing what the app does, by update** is what 2.5.2's wording
  describes as not allowed. Apple does not publish a threshold for what counts as a feature change.
- **Using updates to show reviewers one app and users another** is the clearest violation, and the
  practice most likely to end in removal.
- Apple's Developer Program License Agreement also contains provisions about interpreted code. This
  page does not quote or interpret it; read the current agreement yourself if your use of updates is
  more than bug fixes.

Read the current text at developer.apple.com/app-store/review/guidelines/ — guideline numbering and
wording change between revisions.

### Google Play's rules

Google Play's **Device and Network Abuse** policy says an app distributed via Google Play may not
modify, replace or update itself using any method other than Google Play's update mechanism, and may
not download executable code such as dex, JAR or `.so` files from outside Google Play. It then states
that this restriction does not apply to code running in a virtual machine or an interpreter that
provides indirect access to Android APIs, giving JavaScript in a webview or browser as the example.

For OTA updates:

- An update never contains dex, JAR or `.so` files, because it contains no native code.
- `eas update` compiles the bundle to **Hermes bytecode** by default (there is a `--no-bytecode` flag).
  Whether a given reviewer treats Hermes bytecode as falling under the interpreter exception is not
  something Google's policy text or Expo's documentation settles. Do not assume a guarantee either way.
- The policy's purpose — no unreviewed change to what the app does — applies regardless of format.

Read the current policy in the Google Play Console Help Center under Device and Network Abuse.

### What Expo says

Expo's EAS Update FAQ says you must follow the rules of the platforms and app stores you build for,
including in the content of updates and how you use them. EAS Update being technically able to deliver
a change does not make that change permitted.

## Platform differences

:::tabs
@tab iOS
The constraint to design around is guideline 2.5.2's "introduces or changes features or
functionality". Keep feature launches in binaries that go through review; use updates to fix them.
@tab Android
The Device and Network Abuse policy is framed around self-updating outside Google Play and downloading
executable code. OTA updates never ship native executables, but the policy's intent — no changes that
bypass review of what the app does — is the safe reading.
:::

## Common patterns

**Fixes by update, features by release.** Ship feature work in a binary that goes through review. Use
updates to fix defects in what was reviewed. This is the pattern most consistent with both stores'
wording.

**Feature flags reviewed in the binary.** If a feature must be switched on later, ship the code in a
reviewed binary behind a flag and change the flag. Toggling reviewed behaviour is a different thing
from delivering unreviewed behaviour.

**Change the runtime version whenever native code changes.** Use the `fingerprint` policy, or bump a
manual runtime version in the same commit as any native change.

## Security considerations

**Threat.** An update is code that your app downloads and runs. Anyone who can publish to your update
channel can change your app's behaviour for every user on that runtime version, with no store review.

**Exploit.** A leaked `EXPO_TOKEN` or a compromised account publishes an update to `production` that
sends session tokens to an attacker's server.

**Fix.** Protect the account with two-factor authentication, use `eas channel:protect` on production
channels, use scoped robot tokens in CI, and enable update code signing so the app rejects updates not
signed with your key. See [EAS Update Signing](../expo-security/update-signing.md).

**Verification.** With code signing configured, publish an update without the private key to a test
branch that a test build follows, and confirm the app refuses to load it.

## Common mistakes

- **Shipping a native dependency change as an update.** The JavaScript imports a module the binary does
  not contain and fails at runtime. Build, and change the runtime version.
- **Changing permissions, icons or plist entries in `app.json` and publishing an update.** Those are
  compiled into the binary. Nothing changes for installed users.
- **Treating "technically possible" as "allowed".** Store policy is a separate constraint from what
  `expo-updates` can deliver.
- **Launching features by update to avoid review.** 2.5.2's wording covers exactly that.
- **Assuming Google Play's interpreter exception certainly covers your bundle.** The policy's example is
  JavaScript in a webview; it does not name Hermes bytecode.
- **Keeping the runtime version fixed across a native change.** Every update after that change is served
  to binaries that lack the native code it needs.

## Related topics

- [EAS Update](update.md) — how updates are published and applied.
- [Runtime Versions, Channels and Branches](runtime-versions.md) — the compatibility mechanism.
- [Rollouts and Rollbacks](rollouts-and-rollbacks.md) — limiting and undoing a bad update.
- [EAS Update Signing](../expo-security/update-signing.md) — making updates unforgeable.
- [Adding Native Dependencies](../expo-development-builds/adding-native-dependencies.md) — why native changes need a rebuild.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — an update is readable too.
