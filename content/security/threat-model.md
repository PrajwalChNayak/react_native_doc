---
title: Threat Model
description: Who attacks a React Native app, what they control, and which defences are real rather than decorative.
status: current
toolchain: cli
---

Before you pick a defence you need to know what you are defending against. A mobile app is not
a server. It runs on hardware the attacker owns, in a process the attacker can inspect, on an
operating system the attacker can modify. Every line of code you ship, every string you embed
and every request you make is visible to someone who cares enough to look.

This page sets the ground rules for the rest of the section. Read it first, because almost
every "security feature" sold for mobile apps only makes sense once you accept that the client
is hostile territory.

## The one rule that governs everything

**The attacker controls the device.**

That is not a worst case, it is the normal case. Android emulators and rooted phones cost
nothing. Jailbroken iPhones are obtainable. Frida, `objection`, `apktool` and `lldb` are free
and well documented. There is no configuration you can ship in your app that changes who owns
the CPU it runs on.

The practical consequence: **a client-side control never stops a determined attacker. It raises
the cost of an attack.** Raising cost is worth doing — most attackers are not determined, and
cost is what turns a five-minute copy-paste attack into a two-day reverse-engineering project.
But if your security depends on the client behaving, you do not have security, you have a
convention.

Everything that must actually be enforced is enforced on your server.

## Who is actually attacking you

Not all of these people care about you, and the defences differ sharply.

| Actor | What they want | Effort they will spend | What actually stops them |
| --- | --- | --- | --- |
| Curious user | Free features, cheats | Minutes | Nothing client-side, reliably |
| Script-following attacker | Hardcoded API keys found by automated scanners | Minutes | Not shipping the key at all |
| Network attacker on shared Wi-Fi | Session tokens, request/response contents | Hours | TLS, correctly configured |
| Malicious app on the same device | Your files, your deep links, your clipboard | Hours | OS sandboxing, deep-link validation, Keystore/Keychain |
| Targeted reverse engineer | Your protocol, your business logic, your keys | Days to weeks | Server-side enforcement only |
| Attacker with a stolen, unlocked device | Whatever is on screen and in storage | Minutes | Biometric-gated storage, short sessions, server-side revocation |
| Supply-chain attacker | Code execution in every install | Weeks | Lockfiles, auditing, review of native dependencies |

Most real-world React Native incidents are in the top three rows: a key in the bundle, a token
in plaintext storage, or an unvalidated deep link. Those are the ones this section spends the
most time on, because they are common, cheap to exploit, and cheap to fix.

## The assets you are actually protecting

Write these down for your own app. The generic list:

- **Credentials that grant access to your backend** — refresh tokens, session cookies, API keys.
- **Third-party secrets** — payment provider keys, cloud storage credentials, analytics write keys.
- **User data at rest** — cached profile data, downloaded documents, message history.
- **User data in transit** — every request body and response body.
- **Your protocol** — undocumented endpoints, request signing schemes, pricing logic.
- **Integrity of the app itself** — whether the binary running on a device is the one you shipped.

The last one is the one people most often try to defend client-side, and the one where
client-side defence works least well. See
[Root and Jailbreak Detection](root-and-jailbreak-detection.md).

## Trust boundaries in a React Native app

A React Native app has more boundaries than a native one, because it carries a JavaScript
bundle and often a WebView.

| Boundary | Crossing it means | Page |
| --- | --- | --- |
| Your server → the app | Data leaves your control permanently | [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) |
| The app → the network | Anyone on the path can see or alter it unless TLS says otherwise | [Network Security Config and ATS](network-security-config.md) |
| The OS → your app (deep links) | An arbitrary other app chose this input | [Deep Link Validation](deep-link-validation.md) |
| Web content → your JS (`postMessage`) | Remote HTML is talking to native-capable code | [WebView Hardening](webview-hardening.md) |
| Your JS → the filesystem | Data may persist in a readable, backed-up location | [Keychain and Keystore](secure-storage-keychain-keystore.md) |
| npm → your binary | Third-party code runs with your app's full privileges | [Dependency Auditing](dependency-auditing.md) |

Anything crossing a boundary inbound is untrusted input. Anything crossing outbound is
published.

## Threat: the binary is not private

### Exploit

You do not need a rooted device to get the code of an app installed on your own phone. On
Android, the package manager will tell you where the APK lives and `adb` will pull it:

```bash
# List installed packages to find yours.
adb shell pm list packages | grep example

# Ask the package manager where the APK actually is on disk.
adb shell pm path com.example.app

# Pull it. Split APKs produce several paths; pull each one.
adb pull /data/app/~~abcdef==/com.example.app-xyz==/base.apk

# An APK is a zip. Nothing here requires root or a special tool.
unzip -o base.apk -d extracted
ls extracted/assets extracted/lib extracted/res
```

On iOS the equivalent starts from a decrypted IPA, which requires a jailbroken device or an
app-store-decryption tool — a higher bar than Android, but a bar that is routinely cleared. The
asymmetry matters for prioritisation, not for design: assume both are readable.

### Fix

There is no fix that makes the binary private, and any vendor telling you otherwise is selling
something. The fix is to **not put anything in the binary that must stay private**. Concretely:

- No API keys, no private keys, no service-account credentials, no shared secrets.
- Authentication is a token your server issues, scoped to one user, short-lived, revocable.
- Authorisation decisions are made by the server on every request, not by the app deciding
  which screens to show.

### Verification

Take your own release build and try to find a secret in it. If you can, so can everyone else.
The full procedure is on [Why Secrets in JS Are Readable](secrets-in-the-bundle.md); the short
version:

```bash
# From the extracted APK above.
strings -n 8 extracted/assets/index.android.bundle | grep -iE 'api[_-]?key|secret|bearer|AKIA'
```

Run this in CI on every release build and fail the build on a hit. That turns "we told people
not to" into an enforced rule.

## What each defence in this section actually buys you

Be honest with yourself about this table before you spend a sprint on any row.

| Defence | Stops | Does not stop | Honest value |
| --- | --- | --- | --- |
| Secrets kept server-side | Key extraction entirely | Abuse of your API by an authenticated user | The single highest-value change |
| Keychain / Keystore | Plaintext reads from backups and from other apps | A jailbroken device with the app unlocked | High, and cheap |
| TLS with a correct ATS / network config | Passive interception, downgrade to cleartext | A user who installs their own CA and roots the device | High, and mandatory |
| Certificate pinning | Interception via an attacker-added CA | A rooted device with a pinning bypass | Moderate, with real operational cost |
| Deep-link allow-listing | Other apps driving your navigation or leaking tokens | Nothing else | High, and cheap |
| WebView hardening | Remote pages reaching your filesystem and native bridge | A compromised origin you allow-listed | High if you ship a WebView |
| R8 / minification | Casual reading, scanner signatures | Anyone with a decompiler and an afternoon | Low to moderate |
| Root / jailbreak detection | Automated low-effort tooling | Anyone who reads the detection code | Low; useful as a signal only |
| Removing logs in release | Accidental token leakage into `logcat` | Deliberate instrumentation | Moderate, and cheap |

Note the pattern: the cheap, boring controls at the top are worth far more than the expensive,
exciting ones at the bottom.

## How to use this section

Work top to bottom. The order of the pages is roughly the order of value per hour spent.

1. Get secrets out of the bundle.
2. Put credentials in Keychain/Keystore instead of plaintext storage.
3. Get your transport configuration right on both platforms.
4. Validate every deep link and every WebView navigation.
5. Only then consider pinning, obfuscation and device-integrity signals.

Each page follows the same shape: the **threat**, an **exploit** you can reproduce, the **fix**,
and a **verification** step you can run on your own machine or in CI. If a claim in this section
is not accompanied by something you can run, treat it as an opinion.

## Common mistakes

- **Treating the app as a trusted client.** Wrong: the app checks `user.isAdmin` and hides the
  button. Right: the server rejects the request. Hiding UI is a usability decision, never an
  authorisation one.
- **Confusing obfuscation with encryption.** R8 renames symbols. It does not encrypt them, and
  string constants survive untouched. See [Obfuscation and Its Limits](obfuscation.md).
- **Buying one expensive control and skipping the cheap ones.** Certificate pinning on an app
  that still ships a third-party API key in its bundle is security theatre with an outage risk
  attached.
- **Assuming iOS is safe because extraction is harder.** The bar is higher, not high. Any design
  that only holds on iOS is a design that does not hold.
- **Writing a threat model once and never revisiting it.** A new WebView, a new deep-link route
  or a new native dependency each add a boundary. Re-read this list when you add one.
- **Believing a claim with no verification step.** If a library's README says it "secures" your
  data but gives you no way to prove it, you cannot tell whether it works.

## Related topics

- [Why Secrets in JS Are Readable](secrets-in-the-bundle.md) — the demonstration behind the rule above.
- [Keychain and Keystore](secure-storage-keychain-keystore.md) — where credentials actually belong.
- [Network Security Config and ATS](network-security-config.md) — transport settings on both platforms.
- [Deep Link Validation](deep-link-validation.md) — the cheapest high-value fix in this section.
- [Dependency Auditing](dependency-auditing.md) — the supply-chain boundary.
- [Release Checklist](../build-and-release/release-checklist.md) — where these checks get enforced.
