---
title: Certificate Pinning Options
description: What certificate pinning protects against, the platform mechanisms an Expo SDK 57 app can reach through config plugins, and the operational cost — a pinned app with no backup pin stops working when your certificate rotates.
status: current
toolchain: expo
sdk: 57
---

Certificate pinning makes your app refuse a TLS connection unless the server presents a specific
public key (or one issued by a specific certificate authority), **in addition to** the normal
certificate validation the operating system already performs.

It closes one gap: a certificate that the device trusts but that is not yours. It opens another:
if your server's key changes and the app does not know the new one, **every installed copy of your
app stops talking to your server** until users install an update.

Read the operational cost section before you ship this. Most teams that regret pinning did not
plan for rotation.

## Why it exists / when to use it — and when NOT to

Ordinary TLS already protects you from a passive network attacker and from a random attacker-run
server. Pinning adds protection against a certificate the device **trusts** but you did not issue:

- A user-installed or MDM-installed root CA on a corporate or compromised device, used to intercept
  traffic.
- A mis-issued certificate from a public CA.
- An attacker who has persuaded the user to install a proxy's CA certificate.

Consider pinning when a successful interception is severe and specific: banking, health data,
high-value authentication endpoints.

Do **not** pin when:

- You do not control the certificate lifecycle for the domain (a SaaS API, a CDN that rotates keys
  on its own schedule, a third-party auth provider). You will be broken by someone else's change.
- You cannot guarantee a release process that ships new pins **before** old keys are retired.
- The goal is to stop users from inspecting your app's traffic. On a device the user controls,
  pinning is bypassable with instrumentation tools. It raises effort; it does not hide your API.

## Basic example

An Expo SDK 57 app has no pinning API in JavaScript. `fetch` goes through the platform networking
stack, so pinning is configured **natively** — which for an app using Continuous Native Generation
means through the app config and config plugins.

Both platforms have a built-in, declarative mechanism:

| Platform | Mechanism | Configured in |
| --- | --- | --- |
| iOS 14+ | `NSPinnedDomains` under `NSAppTransportSecurity` | `Info.plist` — reachable through `ios.infoPlist` in `app.json` |
| Android | `<pin-set>` in a network security configuration file | `res/xml/network_security_config.xml` plus `android:networkSecurityConfig` in the manifest — needs a config plugin |

### Android: a local config plugin

Android's mechanism needs a resource file and a manifest attribute, which `app.json` cannot express
directly. A small local plugin can, using `withAndroidManifest` and `withDangerousMod` from
`expo/config-plugins` (both verified as exports of the installed SDK 57 package):

```js title=plugins/with-android-pinning.js
const fs = require('fs');
const path = require('path');
const {AndroidConfig, withAndroidManifest, withDangerousMod} = require('expo/config-plugins');

/**
 * Writes res/xml/network_security_config.xml and points the manifest at it.
 * `pins` MUST contain at least two SPKI SHA-256 hashes: the current key and a backup key
 * that is not yet deployed. See "Operational cost" before changing this.
 */
function withAndroidPinning(config, {domain, pins, expiration}) {
  if (!Array.isArray(pins) || pins.length < 2) {
    throw new Error('with-android-pinning: provide at least two pins (current + backup)');
  }

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await fs.promises.mkdir(dir, {recursive: true});
      const pinXml = pins.map((p) => `      <pin digest="SHA-256">${p}</pin>`).join('\n');
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config>
    <domain includeSubdomains="true">${domain}</domain>
    <pin-set expiration="${expiration}">
${pinXml}
    </pin-set>
  </domain-config>
</network-security-config>
`;
      await fs.promises.writeFile(path.join(dir, 'network_security_config.xml'), xml);
      return cfg;
    },
  ]);
}

module.exports = withAndroidPinning;
```

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "./plugins/with-android-pinning.js",
        {
          "domain": "api.example.com",
          "pins": [
            "CURRENT_KEY_SPKI_SHA256_BASE64=",
            "BACKUP_KEY_SPKI_SHA256_BASE64="
          ],
          "expiration": "2027-06-30"
        }
      ]
    ]
  }
}
```

The XML shape — `domain-config`, `pin-set` with an `expiration` date in `yyyy-MM-dd` format, and
`pin digest="SHA-256"` holding a base64 SPKI hash — is Android's documented format. Android's
documentation says to always include a backup key, and that **after the expiration date pinning is
not performed** for that domain.

> [!WARNING] This replaces any existing network security config
> If another plugin in your project already sets `android:networkSecurityConfig` (some SDKs do, for
> example to allow cleartext traffic to a local host in debug), this plugin overwrites it. Check
> the generated `android/app/src/main/AndroidManifest.xml` after prebuild and merge by hand if
> needed.

### iOS: `NSPinnedDomains`

Apple's App Transport Security supports pinning declaratively on **iOS 14.0 and later**, through
`NSAppTransportSecurity` → `NSPinnedDomains` in `Info.plist`. Each pinned domain is a dictionary
with `NSIncludesSubdomains`, and either `NSPinnedCAIdentities`, `NSPinnedLeafIdentities`, or both.
Apple's documentation says you must include one or more expected CA certificates, one or more
expected leaf certificates, or both.

You set `Info.plist` values from `ios.infoPlist` in `app.json`. Build the exact entry from Apple's
[NSPinnedDomains reference](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nspinneddomains)
— this page does not reproduce the element format of the identity arrays, because we could not
verify it against Apple's documentation at the time of writing. After prebuild, inspect the
generated `ios/<App>/Info.plist` to confirm the structure is what Apple documents.

> [!NOTE] Expo Go vs development build
> Pinning is native configuration. Expo Go cannot apply it. You need a
> [development build](../expo-development-builds/why-you-need-one.md) or a release build, and every
> change to pins requires a **new binary** — an EAS Update cannot change them.

## How it works

### What is pinned: the public key, not the certificate

Both mechanisms above pin a **SHA-256 hash of the SubjectPublicKeyInfo (SPKI)**, not the whole
certificate. A certificate can be re-issued (renewed) with the **same key pair** and the pin still
matches. A pin breaks when the **key** changes.

Compute the pin for a live server:

```bash
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Compute the pin for a key you have generated but **not yet deployed** — this is your backup pin:

```bash
openssl pkey -in backup-key.pem -pubout -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

### Leaf, intermediate or CA

| Pin to | Breaks when | Protects against |
| --- | --- | --- |
| Your leaf key | Your server key changes | Any certificate that is not yours, including one from your own CA |
| Your CA's intermediate or root | That CA changes its key, or you change CA | Certificates from other CAs; not mis-issuance by your own CA |

Pinning to the CA is operationally gentler and weaker. Pinning to the leaf is stronger and ties
your mobile release schedule to your server key schedule.

### Which traffic is covered

Platform-level configuration applies to the platform networking stack for the pinned domain. On
both platforms that includes `fetch` in React Native. It does not cover:

- Other domains — including your image CDN, analytics, and crash reporting, unless you pin those
  too.
- A native SDK that ships its own TLS stack or networking library that does not honour the platform
  configuration. Check any such SDK individually.
- WebView content on a domain you did not pin.

Do not assume. Verify with the interception test below.

## Operational cost

This is the section that decides whether pinning helps or hurts you.

### A pinned app bricks itself on rotation without a backup pin

```text
day 0     app ships with pin A (current key)
day 300   ops rotates the server certificate — new key B
          every installed app: TLS handshake fails, pin mismatch
          users cannot sign in, cannot load data, cannot see an "update your app" message
          (that message would come from the server they cannot reach)
day 300+  fix requires a new binary with pin B, store review, and every user updating
          users who do not update stay broken
```

An EAS Update cannot rescue this: pins live in native configuration, and even if they did not, the
app cannot reach the update server if that domain is pinned too.

### The rotation plan that works

1. **Generate the next key pair now**, before you ship. Store the private key securely offline.
2. **Ship both pins**: the current key (A) and the next key (B).
3. **Wait** until enough of your active users are on a build containing pin B. Measure this — see
   [Monitoring](../expo-build-and-release/monitoring.md).
4. **Rotate the server to key B.** Apps with the A+B build keep working.
5. **Generate key C.** Ship a build with pins B and C.
6. Repeat.

The Android `expiration` attribute is a safety valve: after that date the app stops enforcing pins
rather than failing closed. Android's documentation notes the trade-off — an expiration date can
let an attacker bypass pinning on old installs. Set it to a date beyond your planned rotation, and
ship new builds long before it.

### Other costs

- **Debugging proxies stop working** against pinned domains, including in development. Scope pins
  to release builds or to production domains.
- **Corporate networks that inspect TLS** break your app for those users. That is pinning working
  as intended, and it will generate support tickets.
- **An outage caused by pinning is total and slow to fix.** Weigh that against the interception
  risk you are removing.

## Platform differences

:::tabs
@tab iOS
`NSPinnedDomains` requires iOS 14.0 or later. It is declarative in `Info.plist` and reachable from
`ios.infoPlist`, so no custom plugin is needed — but verify the generated plist against Apple's
reference, because a malformed entry is not a build error.
@tab Android
The network security configuration is an XML resource plus a manifest attribute, so it needs a
config plugin. Android enforces the `expiration` date, after which pinning is not performed for
that domain. If you commit native directories instead of using CNG, edit the XML and manifest
directly — see [CNG vs Committed Native Directories](../expo-core-concepts/cng-vs-committed-native.md).
:::

## Common patterns

### Third-party pinning libraries

Community native modules offer a JavaScript API for pinning with a pin list per domain. Before
adopting one for SDK 57, confirm three things yourself: that it is compatible with React Native
0.86 and the New Architecture, that it provides a config plugin or works with autolinking in a
development build, and that it **enforces a backup pin**.

This page does not name one, because none was verified against SDK 57 for this page. See
[Using Community Config Plugins](../expo-config-plugins/using-community-plugins.md) for how to
evaluate one.

### Pin only what you own

Pin `api.example.com`, the domain you control the keys for. Leave third-party domains unpinned
unless the provider publishes pins and a rotation schedule.

## Security considerations

**Threat.** An attacker who can get a certificate trusted by the device — through a user-installed
CA, an MDM profile, or a mis-issued certificate — intercepts and reads or modifies your app's HTTPS
traffic.

**Exploit.** Reproduce it on a test device with an intercepting proxy such as mitmproxy:

```bash
mitmproxy --listen-port 8080
```

Configure the device or emulator to use the proxy and install the proxy's CA certificate as a
trusted certificate. On Android 7 and later, apps do not trust user-installed CAs by default, so the
interception usually only works in a debug build that opts in, or on a device where the CA is
installed at the system level (a rooted emulator). On iOS, install the profile and enable full trust
for the certificate in Settings.

Without pinning, the proxy shows your API requests and responses in clear text.

**Fix.** Pin the SPKI hash of your API's key **and** a backup key, using the platform mechanisms
above, shipped in a new binary. Have a written rotation plan before release.

**Verification.**

1. With the proxy active and its CA trusted, open the pinned build. Requests to the pinned domain
   must **fail**, and the proxy must show a failed TLS handshake, not decrypted traffic.
2. Requests to unpinned domains should still appear in the proxy — which also proves your test setup
   is intercepting at all.
3. Rehearse rotation on staging: point a staging domain at a certificate using the **backup** key and
   confirm the app still connects. If it does not, your backup pin is wrong, and you found out
   before production did.

## Common mistakes

- **Shipping one pin.** The first key rotation takes your app offline for every user. Always ship a
  backup pin for a key that already exists.
- **Pinning the certificate hash instead of the public key hash.** A routine renewal breaks it. Pin
  the SPKI SHA-256.
- **Pinning a domain you do not control.** Your provider rotates keys on its own schedule; you find
  out from your crash reports.
- **Expecting an EAS Update to change pins.** Pins are native configuration. Changing them requires
  a new binary.
- **Testing in Expo Go.** The native configuration is not applied there.
- **Assuming pinning hides your API from the user.** On a device they control, pinning can be
  bypassed. It protects the user from a third party, not your API from the user.
- **Forgetting the backup pin's private key.** A backup pin for a key you have lost is not a backup.
- **Letting a plugin silently overwrite another network security config.** Inspect the generated
  manifest after prebuild.

## Related topics

- [What Ships Inside the Bundle](what-ships-in-the-bundle.md) — pinning does not protect anything stored in the app.
- [EAS Update Signing](update-signing.md) — the equivalent integrity control for updates, with its own key rotation cost.
- [What Config Plugins Are](../expo-config-plugins/what-they-are.md) — how a local plugin like the one above runs.
- [expo prebuild](../expo-core-concepts/prebuild.md) — when native configuration is regenerated.
- [Monitoring](../expo-build-and-release/monitoring.md) — measuring adoption before you rotate a key.
- [Versioning and Runtime Versions](../expo-build-and-release/versioning.md) — why pin changes need a new binary.
