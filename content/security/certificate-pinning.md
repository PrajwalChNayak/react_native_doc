---
title: Certificate Pinning
description: What pinning actually defends against, how to configure it on both platforms, and the outage it causes when a certificate rotates.
status: current
toolchain: cli
---

Certificate pinning tells your app to accept only a specific key for a specific host, on top of
normal TLS validation. It defends against one thing: an attacker who can get a certificate your
device already trusts. That is a narrower threat than most teams assume, and pinning carries an
operational cost that no other control on this list has — **a pinned app that outlives its pins
stops working, for everyone, until they install an update.**

Read the cost section before the configuration sections. Pinning is the one security control in
this handbook that has caused more outages than it has prevented breaches, and that is a
statement about how it is deployed rather than about the technique.

## Threat

Normal TLS already stops a passive eavesdropper and an active attacker without a trusted
certificate. Pinning addresses what is left:

1. **A user-installed CA.** The classic case: an attacker (or an analyst, or a curious user)
   installs their own root certificate and runs an intercepting proxy. On Android 7 and later,
   apps do not trust user CAs by default, so this is mostly an iOS and older-Android concern —
   but it is also exactly what your own QA team does.
2. **A compromised or coerced public CA.** Rare, historically real.
3. **A misissued certificate for your domain.** Certificate Transparency makes this detectable
   after the fact; pinning makes it unusable in the moment.

What pinning does **not** stop, and this needs saying every time:

- **A rooted or jailbroken device.** `objection` has a one-command pinning bypass. Frida scripts
  that hook the platform trust evaluation are maintained and public. If the attacker controls the
  device, pinning is a speed bump measured in minutes.
- **Anything your API does with a valid request.** Pinning is about the transport, not about
  authorisation.

So pinning raises the cost of casual interception and makes automated scraping of your protocol
inconvenient. It does not make your API private.

## The cost, stated first

A pin is a promise about a key that will change. When it changes and your app does not know the
new one, every pinned request fails — not degrades, fails — on every installed copy of the app.

Things that trigger this:

- Your certificate is renewed with a new key pair. Short-lived certificates make this frequent.
- Your CDN or load balancer rotates certificates on its own schedule, possibly without telling
  you.
- Your provider changes intermediate CAs.
- Your certificate is revoked and reissued in an incident — precisely when you least want your app
  offline.

And the recovery path is the problem: you cannot fix it from the server. You ship an update, wait
for review, wait for users to install it. For an app with a meaningful tail of old versions, that
is days to weeks of broken installs.

> [!DANGER] Do not pin without an answer to these three questions
> 1. Who is told, automatically, when the certificate for this host changes?
> 2. What is the oldest app version still in the field, and does it hold a pin that is still valid?
> 3. If the pin breaks tomorrow, what is the plan that does not involve the app stores?
>
> If any answer is "we would notice", do not pin yet.

## Fix: pin to an SPKI hash, with backups

Three decisions make pinning survivable.

### 1. Pin the public key, not the certificate

A **Subject Public Key Info (SPKI) hash** is a hash of the public key, not of the certificate. If
you renew a certificate while keeping the same key pair, the SPKI hash does not change and your
pins keep working. Pinning a whole certificate breaks on every renewal, including routine ones.

Every mechanism described below pins an SPKI hash. Compute one from a live host:

```bash
# The leaf certificate's public key hash.
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

To pin higher up the chain, dump the whole chain and take the hash of the intermediate instead:

```bash
# Print every certificate the server sends, with subjects, so you can pick one.
openssl s_client -connect api.example.com:443 -servername api.example.com -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' > chain.pem

# Split and hash each certificate in the chain.
csplit -z -f cert- -b '%02d.pem' chain.pem '/-----BEGIN CERTIFICATE-----/' '{*}'
for f in cert-*.pem; do
  echo -n "$f  "
  openssl x509 -in "$f" -noout -subject
  openssl x509 -in "$f" -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
done
```

### 2. Pin the intermediate, not the leaf

| Pin target | Breaks when | Attack surface |
| --- | --- | --- |
| Leaf certificate key | Every key rotation | Narrowest |
| Intermediate CA key | Your CA changes intermediates | Any certificate that CA issues for your domain |
| Root CA key | Almost never | Every certificate that root chains to |

Pinning the leaf is the strictest and the most fragile. Pinning the intermediate is the choice
most teams should make: it survives certificate renewal entirely, and the residual risk — that
your CA issues another certificate for your domain to someone else — is the risk Certificate
Transparency monitoring is for.

Pinning the root is close to pointless, because it is barely narrower than the trust store.

### 3. Always ship a backup pin

A backup pin is the hash of a key you are not using yet. Generate a second key pair, keep it
offline, and pin both. When you need to rotate, you switch to the backup key, ship an update that
adds a *new* backup, and you were never offline.

An app with one pin has no rotation path that does not involve downtime. Every pinning guide says
this and it is routinely skipped.

## Configuration

:::tabs
@tab Android
Android enforces pinning declaratively through the network security config. The platform trust
manager applies it, so the networking stack React Native uses on Android is covered without any
JavaScript changes.

```xml title=android/app/src/main/res/xml/network_security_config.xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Everything else keeps the platform defaults: system CAs, no cleartext. -->
    <base-config cleartextTrafficPermitted="false" />

    <domain-config>
        <domain includeSubdomains="false">api.example.com</domain>

        <!--
          expiration is a deliberate safety valve: after this date the pins stop
          being enforced instead of bricking the app. Set it to a date you will
          definitely have shipped a new build by, and treat it as a deadline
          rather than as a substitute for rotation planning.
        -->
        <pin-set expiration="2027-06-01">
            <!-- Current intermediate CA public key. -->
            <pin digest="SHA-256">REPLACE_WITH_YOUR_PRIMARY_SPKI_SHA256_BASE64=</pin>
            <!-- Backup key, not yet in use. Rotation depends on this line. -->
            <pin digest="SHA-256">REPLACE_WITH_YOUR_BACKUP_SPKI_SHA256_BASE64=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

Reference it from the manifest:

```xml title=android/app/src/main/AndroidManifest.xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    android:allowBackup="false">
</application>
```

Notes specific to this mechanism:

- `includeSubdomains="true"` applies the same pins to every subdomain, which is usually wrong —
  subdomains often sit behind different infrastructure with different certificates.
- The pin values above are deliberately not valid base64. Replace them with hashes you computed
  from your own host using the commands above; a copied pin fails closed on the first request.
- The config applies to the WebView as well, so a pinned domain loaded in a
  [WebView](webview-hardening.md) is pinned too.

@tab iOS
iOS 14 and later support declarative pinning through App Transport Security, under
`NSPinnedDomains`. It applies to `URLSession`, which is what React Native's networking uses, so
again no JavaScript change is needed.

```xml title=ios/YourApp/Info.plist
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSPinnedDomains</key>
    <dict>
        <key>api.example.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <false/>
            <!--
              NSPinnedCAIdentities pins a CA in the chain (the intermediate).
              NSPinnedLeafIdentities pins the leaf certificate's key instead
              and is the fragile option.
            -->
            <key>NSPinnedCAIdentities</key>
            <array>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>REPLACE_WITH_YOUR_PRIMARY_SPKI_SHA256_BASE64=</string>
                </dict>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>REPLACE_WITH_YOUR_BACKUP_SPKI_SHA256_BASE64=</string>
                </dict>
            </array>
        </dict>
    </dict>
</dict>
```

Notes specific to this mechanism:

- There is **no expiration escape hatch**. Unlike Android's `pin-set expiration`, an iOS pin stays
  enforced until you ship a new `Info.plist`. This is the platform where a missed rotation hurts
  most.
- Pinning here does not relax any other ATS requirement. You still need a TLS configuration that
  satisfies ATS; see [Network Security Config and ATS](network-security-config.md).
- If you need behaviour these keys cannot express — pinning a host resolved at runtime, or
  reporting a pin failure before failing the request — that is a `URLSessionDelegate`
  implementation in native code, not a JavaScript-level change.
:::

### The cross-platform library option

`react-native-ssl-public-key-pinning` (1.2.6) configures pinning from JavaScript on both
platforms. It ships a `codegenConfig` block, so it is a TurboModule and works under the New
Architecture.

Two honest caveats before you reach for it over the platform configuration:

- **It does not remove the rotation problem.** A pin set from JavaScript is still compiled into
  the app you shipped. Unless you fetch the pin list at runtime — which reintroduces the attack
  you were defending against — you are still shipping an update to rotate.
- **Platform configuration is enforced by the OS.** A JavaScript-level configuration is enforced
  by library code inside your process, which is a slightly easier thing for an attacker on a
  rooted device to disable. Both are bypassable; one is marginally less so.

Use the declarative platform mechanisms unless you have a concrete requirement they cannot meet.

## Rotation planning

Write this down before you turn pinning on, and keep it where the on-call engineer will find it.

1. **Own the certificate lifecycle.** If a CDN or hosting provider can rotate your certificate
   without telling you, either take that ability away or pin the intermediate that survives it.
2. **Generate the backup key at the same time as the primary**, store it where you store signing
   keys, and pin both from the first release.
3. **Alert on the expiry date**, not on the day it happens. The alert should fire far enough ahead
   that an app release, including store review, fits comfortably.
4. **Know your version tail.** Check how many active installs are on each version. Your pin
   deadline is set by the oldest version you still care about, not by the latest.
5. **Have a kill switch that is not the pin.** A server-side flag your app reads on launch —
   over an unpinned connection to a different host — that can tell the app to stop enforcing
   pins is the only in-band recovery mechanism that exists. It is also, plainly, a control an
   attacker would love to flip, so it needs its own authentication and it needs to fail closed.
6. **Rehearse the rotation.** Switch to the backup key in staging, confirm the app keeps working,
   then ship the new backup.

## Verification

Pinning is one of the few controls you can prove works in ten minutes, so there is no excuse for
shipping it untested.

### 1. Prove an intercepting proxy is refused

```bash
# Start mitmproxy and install its CA on the device/emulator as a user CA.
mitmproxy --listen-port 8080

# Point the emulator at it.
adb shell settings put global http_proxy 10.0.2.2:8080
```

With the CA installed and pinning off, you see your API traffic in the proxy. Turn pinning on and
rebuild: requests to the pinned host must fail, and requests to unpinned hosts must still work.
If you see pinned traffic in the proxy, your configuration is not being applied — a very common
outcome when the manifest reference is missing or the file is in the wrong resource folder.

### 2. Prove a wrong pin fails closed

Deliberately corrupt one character of the pin, rebuild, and confirm the app cannot reach the
host. This proves the mechanism is live. A build where a wrong pin still connects is a build
where the right pin is doing nothing.

### 3. Prove the backup pin works on its own

Comment out the primary pin, leave only the backup, and point the app at a staging host using the
backup key. If that fails, your rotation plan does not exist yet.

### 4. Check the pins in CI against the live host

```bash title=scripts/check-pins.sh
#!/usr/bin/env bash
set -euo pipefail
HOST="${1:?usage: check-pins.sh <host>}"
CONFIG="android/app/src/main/res/xml/network_security_config.xml"

LIVE="$(openssl s_client -connect "$HOST:443" -servername "$HOST" -showcerts </dev/null 2>/dev/null \
  | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64)"

if grep -qF "$LIVE" "$CONFIG"; then
  echo "OK: live key for $HOST is pinned"
else
  echo "FAIL: live key for $HOST ($LIVE) is not in $CONFIG" >&2
  exit 1
fi
```

Run it on a schedule, not only on commit. The failure you care about happens when nobody is
pushing code.

### 5. Demonstrate the bypass, once

Install `objection` on a rooted test device and run its pinning bypass against your own build.
Watching your pinned traffic appear in the proxy is the fastest way to calibrate what this
control is worth, and it stops anyone on the team describing pinning as something it is not.

## Should you pin at all

A defensible position for most apps:

| Situation | Recommendation |
| --- | --- |
| Consumer app, standard REST API, tokens are short-lived and revocable | Probably not. Spend the effort on the items above pinning in the [threat model](threat-model.md) table. |
| Payments, health data, or a regulator asking for it | Yes, pinned to an intermediate, with backup pins and alerting. |
| You cannot reliably learn when your certificate changes | No. You will cause an outage. |
| High-value protocol you want to keep out of automated scrapers | Yes, understanding it buys hours against a real attacker. |

Pinning is a legitimate control. It is far down the list, and it is the only one on the list
that can take your app offline.

## Common mistakes

- **Pinning the leaf certificate.** Wrong: a pin that changes every renewal. Right: pin the SPKI
  of the intermediate, or of a leaf key you control and reuse across renewals.
- **Shipping a single pin.** There is no rotation path. The first renewal is an outage.
- **Copying the example hashes.** The values in this page and in the platform documentation are
  placeholders. A copied pin fails closed on the first request.
- **Setting `includeSubdomains="true"` reflexively.** Your static asset host, your analytics
  subdomain and your API rarely share a certificate.
- **Assuming pinning survives a rooted device.** It does not. Anyone claiming pinning stops
  reverse engineering has not tried to bypass it.
- **Relying on Android's `expiration` as a rotation plan.** It prevents a permanent brick; it does
  not prevent a broken release, and iOS has no equivalent.
- **Pinning a host you do not control.** A third-party API's certificate schedule is not yours to
  manage, and they have no obligation to tell you.
- **Turning pinning on without testing the failure path.** If you never saw the app fail with a
  wrong pin, you do not know pinning is switched on.

## Related topics

- [Network Security Config and ATS](network-security-config.md) — the transport configuration pinning sits on top of.
- [Threat Model](threat-model.md) — where pinning ranks against cheaper controls.
- [Root and Jailbreak Detection](root-and-jailbreak-detection.md) — the other control people reach for after pinning, with the same limits.
- [WebView Hardening](webview-hardening.md) — WebView traffic is covered by the same platform configuration.
- [Network Inspection](../debugging/network-inspection.md) — the debugging workflow pinning breaks, and how to keep it in debug builds.
- [Release Checklist](../build-and-release/release-checklist.md) — where the pin check belongs.
