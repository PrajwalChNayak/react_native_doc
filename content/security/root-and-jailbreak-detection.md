---
title: Root and Jailbreak Detection
description: A check that runs on the attacker's hardware and is routinely defeated — useful as a risk signal, useless as enforcement.
status: current
toolchain: cli
---

Root and jailbreak detection asks the device whether the device has been compromised. Stated that
way, the problem is obvious: the code doing the asking, the code doing the answering and the
result all live on hardware the attacker owns. Every detection technique is a check the attacker
can find, and a check the attacker can find is a check the attacker can change.

That does not make it worthless. It makes it a **signal**, not a **control**. This page is about
keeping those two words apart, because most of the damage done by this feature comes from teams
treating the second as if it were the first.

## Threat

A rooted or jailbroken device gives an attacker capabilities your app cannot take away:

- Read and write every file your app owns, including anything in
  [AsyncStorage](secure-storage-keychain-keystore.md).
- Attach a debugger or a dynamic instrumentation toolkit to your running process.
- Hook any function — yours, the platform's, or a library's — and change its return value.
- Install a CA and intercept traffic, defeating [certificate pinning](certificate-pinning.md).
- Modify and repackage your app.

This is not a hypothetical set. It is the standard toolkit, it is free, and it is documented in
tutorials aimed at beginners.

## Exploit: the check is defeated by changing its answer

Detection libraries look for the usual traces — the `su` binary, known root-manager package
names, writable system paths, Cydia and Substrate artefacts on iOS, test-keys build tags. All of
those are findable. All of them are also hideable, and the detection function's return value is
directly modifiable.

### Hiding the evidence

Modern root solutions ship a deny-list feature specifically to hide root from selected apps. The
user adds your package to a list in a settings screen; your checks then look at a device that
presents as stock. This requires no reverse engineering of your app at all — it is a toggle.

### Changing the answer

When hiding is not enough, hooking is. This is the standard workflow, and you can run it against
your own build in a few minutes:

```bash
# Start the app with a Frida server running on a rooted test device.
frida -U -f com.example.app -l bypass.js
```

```js title=bypass.js — the entire attack
// Replace the native implementation with one that always says "clean".
Java.perform(() => {
  const JailMonkeyModule = Java.use('com.gantix.JailMonkey.JailMonkeyModule');
  JailMonkeyModule.isJailBroken.implementation = () => false;
});
```

A generic tool does the same thing without you writing anything:

```bash
# objection ships root/jailbreak bypasses as built-in commands.
objection --gadget com.example.app explore
# then, at the prompt:
#   android root disable
#   ios jailbreak disable
```

And if the attacker prefers a permanent result, they patch the check out of the binary and
resign — at which point your detection code is not running at all.

### The JavaScript layer is even softer

If your gate is written in JavaScript, an attacker with Frida does not need to touch the native
module. They hook the function in the Hermes runtime, or they patch the bundle and repackage. The
bundle is the easiest part of your app to modify.

```ts-fragment title=src/security/naiveGate.ts — a check that stops nobody determined
import JailMonkey from 'jail-monkey';

/**
 * One boolean, evaluated on the attacker's device, controlling whether the
 * app works. Hooking this function is a one-line script.
 */
export function blockIfCompromised(exitApp: () => void): void {
  if (JailMonkey.isJailBroken()) {
    exitApp();
  }
}
```

## What it is actually good for

Detection has real, modest value in three places.

### 1. As a risk signal sent to your server

The server is the only party in this exchange that is not running on attacker hardware. It cannot
trust the signal, but it can *use* it: a device reporting as rooted is a device whose requests
deserve more scrutiny, lower limits, or a step-up authentication challenge.

The critical property is that the **decision** happens server-side. The client reports; the server
decides. An attacker who suppresses the signal gets treated as a clean device, which is the same
place you were before — no worse.

```ts-fragment title=src/security/deviceSignals.ts
import {Platform} from 'react-native';
import JailMonkey from 'jail-monkey';

/**
 * Collects integrity signals as data. Nothing here decides anything; it is a
 * report, sent with the session, for the server to weigh. Every field is
 * attacker-controllable, which is why none of them gate a feature locally.
 */
export type DeviceSignals = {
  platform: string;
  jailBroken: boolean;
  hookDetected: boolean;
  canMockLocation: boolean;
  onExternalStorage: boolean;
  adbEnabled: boolean;
  debugged: boolean;
};

export async function collectDeviceSignals(): Promise<DeviceSignals> {
  return {
    platform: Platform.OS,
    jailBroken: JailMonkey.isJailBroken(),
    hookDetected: JailMonkey.hookDetected(),
    canMockLocation: JailMonkey.canMockLocation(),
    onExternalStorage: JailMonkey.isOnExternalStorage(),
    adbEnabled: JailMonkey.AdbEnabled(),
    debugged: await JailMonkey.isDebuggedMode(),
  };
}
```

`jail-monkey` 3.0.0 is the usual choice. It ships a `codegenConfig` block and a
`specs/NativeJailMonkey.ts` TurboModule spec, so it works under the New Architecture. The API
above is its real surface; `isDebuggedMode` and `isDevelopmentSettingsMode` return promises while
the rest are synchronous.

> [!NOTE] Fail loudly when the module is missing
> `jail-monkey` returns a proxy that throws a linking error if the native module did not link,
> rather than returning `false`. That is the right default: a missing install should not look
> like a clean device. If you wrap it, preserve that behaviour instead of swallowing the error
> into a `false`.

### 2. As telemetry that tells you something about your user base

Reporting the proportion of sessions that look compromised is genuinely useful. It tells you
whether the threat you are designing against exists in your population, and it changes shape when
something new happens — a wave of modified builds, an automation farm, a fraud ring.

### 3. As a warning, not a wall

Showing the user a dismissible message — "this device appears to be modified; some features may
be limited" — is defensible. It informs users who did not know, it costs nothing when wrong, and
it does not lock out a legitimate developer or someone on a custom ROM.

## Where enforcement actually belongs

Everything that must be true has to be checked where you control the CPU.

| You want to prevent | Client-side detection gives you | Where it actually belongs |
| --- | --- | --- |
| Token theft from a compromised device | Nothing reliable | Short-lived tokens, server-side revocation, re-auth on anomalies |
| A modified client calling your API | Nothing reliable | Server-side validation of every request; never trust client-computed values |
| Cheating in a game | A signal | Server-authoritative game state |
| Fraudulent transactions | A signal to feed a risk model | Server-side risk scoring, limits, manual review |
| Location spoofing | `canMockLocation`, itself spoofable | Server-side plausibility checks against other signals |

The pattern repeats: **client-side detection feeds a server-side decision, and never is one.**

### Platform attestation is the stronger version

Both platforms offer an attestation service where the **operating system**, not your code, signs a
statement about the device and app, and your server verifies that signature against the vendor.
That moves the trust boundary off the device, which is exactly the change that matters.

:::tabs
@tab Android
The Play Integrity API returns a signed verdict about the device, the app binary and the account.
Your backend sends the token to Google's servers for decoding, so the answer does not come through
the app at all.

It needs a native integration; there is no core React Native API for it. Write it as a TurboModule
following [TurboModules End to End](../native-modules/turbomodules-end-to-end.md), or evaluate a
third-party wrapper against the criteria in
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

@tab iOS
App Attest generates a hardware-backed key in the Secure Enclave and produces assertions your
server verifies with Apple. DeviceCheck provides a smaller per-device flag that persists across
reinstalls.

As on Android, this is native work: a TurboModule wrapping `DCAppAttestService`, with the
verification implemented on your backend.
:::

Attestation is meaningfully stronger than a local boolean, because the verdict is signed by a key
your app does not hold and checked by a server the attacker does not control. It is still not
absolute — attestation has been circumvented, and it adds a dependency on a vendor service that
can fail or reject legitimate devices. Deploy it the same way: as a strong input to a server-side
decision, with a defined behaviour for when it is unavailable.

## Costs you are taking on

Detection is not free, and the costs land on real users rather than on attackers.

- **False positives.** Custom ROMs, older devices with unusual build properties, corporate-managed
  devices and some emulator-based accessibility tools all trip heuristics. If you block, you have
  lost a user who did nothing wrong.
- **Developers on your own team.** `AdbEnabled` and `isDebuggedMode` are true on every engineer's
  phone.
- **An arms race you cannot win.** Every detection library is public, so every bypass is public.
  Each update you ship is analysed faster than you shipped it.
- **Support load.** "The app says my phone is hacked" is a support ticket with no good answer when
  the detection is wrong.
- **A false sense of completion.** The worst cost. A team that ships root detection and considers
  device security handled has spent effort on the least effective control on the list while the
  cheap ones went undone.

## Verification

### 1. Bypass your own build

The only meaningful test. On a rooted test device, run the objection or Frida bypass above against
your own app and confirm the check now reports clean. Do this before anyone in the organisation
describes root detection as a security control, because the demonstration ends that conversation
in about two minutes.

### 2. Confirm nothing breaks when the signal is suppressed

With the bypass active, walk through the app. Nothing should behave differently from a clean
device — because nothing client-side should have been gated on the check in the first place.
Anything that *does* change is a control you thought you had and do not.

### 3. Confirm the server is doing the enforcing

Take a valid session from a rooted device, replay a privileged request with the integrity fields
removed or set to `false`, and confirm your backend's decision does not change in a way that
grants access. The server's behaviour should depend on its own policy and the session, not on a
client-supplied boolean.

### 4. Confirm a missing native module is not silently "clean"

Build a variant without the native module linked and confirm the app errors loudly rather than
reporting a clean device. A detection library that fails open is worse than none, because it
reports reassuring data that is not measurement.

### 5. Measure your false-positive rate before you act on it

Ship the signal in report-only mode first. Look at how many sessions it flags and what those
accounts do. If the flag correlates with nothing, blocking on it would have cost you users and
bought you nothing.

## Common mistakes

- **Blocking the app on a local check.** Wrong: `if (JailMonkey.isJailBroken()) exitApp()`. Right:
  report the signal and let the server decide what to allow. The block is bypassed in one line and
  it locks out legitimate users.
- **Treating the signal as trustworthy input.** It arrived from the attacker's device. It is a
  hint, weighted accordingly, never a fact.
- **Combining detection with client-side authorisation.** "Rooted devices cannot see the admin
  screen" is two client-side controls stacked, which is still zero server-side controls.
- **Failing open when the module is missing.** A wrapper that catches the linking error and
  returns `false` turns a build mistake into silent, permanent "everything is fine".
- **Shipping detection instead of the cheaper controls.** Secrets out of the bundle, credentials
  in the Keystore, deep links validated, logs stripped — all of those are worth more, and all of
  them are less interesting to build.
- **Escalating the arms race.** Adding more heuristics after a bypass is published produces a
  slightly larger app and a slightly longer bypass script.
- **Assuming attestation makes it enforcement on the client.** Attestation is strong because the
  verification happens on your server. Checking an attestation result inside the app reintroduces
  exactly the problem this page is about.

## Related topics

- [Threat Model](threat-model.md) — why the device is hostile territory, and where this control ranks.
- [Certificate Pinning](certificate-pinning.md) — the other control a rooted device defeats.
- [Keychain and Keystore](secure-storage-keychain-keystore.md) — what hardware-backed storage still gives you on a rooted device.
- [Obfuscation and Its Limits](obfuscation.md) — the same gap between perceived and real value.
- [TurboModules End to End](../native-modules/turbomodules-end-to-end.md) — how to build the attestation module described above.
- [Native Dependency Compatibility](../migration/native-dependency-compatibility.md) — evaluating a third-party wrapper for the New Architecture.
