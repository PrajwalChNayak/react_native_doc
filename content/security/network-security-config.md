---
title: Network Security Config and ATS
description: Android's network security config and iOS App Transport Security — what the defaults give you, and how a debug exception ends up in production.
status: current
toolchain: cli
---

Both platforms ship with a transport policy that is stricter than the network defaults of a
decade ago: cleartext HTTP is refused, and TLS below a minimum version is refused. Both also
provide a way to weaken that policy, because some app somewhere genuinely needs it. Almost every
transport security incident in a React Native app comes from someone using that escape hatch to
get past a development problem and never removing it.

This page covers both mechanisms, what the defaults actually are, and the two lines of
configuration that most often get shipped by mistake.

## Threat

An attacker on the network path — shared Wi-Fi, a hostile ISP, a compromised router, a rogue
access point with your café's name — wants to read or alter your traffic.

They win outright if any of the following is true:

1. **Any request goes over cleartext HTTP.** Reading it takes no skill; altering the response is
   only slightly harder.
2. **Your app accepts a downgrade.** An HTTPS request that silently falls back, or an HTTPS page
   that loads HTTP subresources.
3. **Your app trusts certificates it should not.** A build that trusts user-installed CAs turns
   every device with a proxy CA into an open window.

The defence is not code. It is two configuration files, and the discipline to keep the
development versions of them out of the release build.

## Exploit

### Step 1 — find out what your build actually permits

Read the shipped configuration rather than the one you remember writing.

```bash
# Android: every manifest that goes into the release merge.
grep -rn "usesCleartextTraffic\|networkSecurityConfig" android/app/src/

# The config file itself, if you have one.
cat android/app/src/main/res/xml/network_security_config.xml

# And any debug-only variant that must NOT be in the main source set.
ls android/app/src/debug/res/xml/ 2>/dev/null
```

```bash
# iOS: the whole ATS dictionary, printed from the plist.
plutil -p ios/YourApp/Info.plist | grep -A 30 NSAppTransportSecurity
```

The authoritative answer is in the built artifact, not the source:

```bash
# Read the merged manifest out of the release APK.
unzip -o app-release.apk -d extracted
# The binary manifest needs a decoder; aapt2 is in the Android build-tools.
aapt2 dump xmltree --file AndroidManifest.xml app-release.apk | grep -i "cleartext\|networkSecurityConfig"
```

### Step 2 — intercept the traffic that the exception allows

```bash
# Emulator pointed at a proxy on the host machine.
adb shell settings put global http_proxy 10.0.2.2:8080
```

With `cleartextTrafficPermitted="true"` anywhere that applies to your API host, the requests show
up in the proxy with no certificate involved at all. With user CA trust enabled, the HTTPS
requests show up too.

### Step 3 — the analytics endpoint nobody audited

The realistic version of this bug is not your main API. It is a third-party SDK's reporting
endpoint, an image host, or a legacy internal service, still on HTTP, that somebody unblocked
with a global switch instead of a scoped exception. Enumerate what your app actually talks to:

```bash
# Every absolute URL literal in the release bundle.
strings -n 8 extracted/assets/index.android.bundle \
  | grep -oE 'https?://[A-Za-z0-9._-]+' | sort -u
```

Anything on that list beginning with `http://` is a finding.

## Fix

:::tabs
@tab Android
Since Android 9 (API 28) cleartext traffic is disabled by default. The network security config
file is where you state exceptions, and where you must state them narrowly.

```xml title=android/app/src/main/res/xml/network_security_config.xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!--
      The default for everything. Keep cleartext off here; there is almost
      never a reason to turn it on globally, and doing so removes the
      protection for every host including ones added later by an SDK.
    -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <!-- System CAs only. Adding <certificates src="user" /> here is
                 the single most damaging line in this file. -->
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!--
      A scoped exception for one legacy host that has not been migrated yet.
      Name the host, do not include subdomains, and leave a comment saying who
      owns the migration and by when.
    -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">legacy-internal.example.com</domain>
    </domain-config>

    <!--
      Applied ONLY when the app is debuggable. This is the correct home for
      "let me proxy my own traffic", and it is inert in a release build
      because release builds are not debuggable.
    -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

Wire it up in the manifest:

```xml title=android/app/src/main/AndroidManifest.xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    android:usesCleartextTraffic="false">
</application>
```

Points that decide whether this file helps:

- **`debug-overrides` is only honoured when `android:debuggable="true"`.** That makes it the safe
  place for proxy CA trust. Putting the same `<certificates src="user" />` in `base-config`
  removes that safety entirely, and it is a one-line difference.
- **Metro serves over HTTP.** Development builds need cleartext to `localhost` and `10.0.2.2`.
  Put that in the **debug source set** — `android/app/src/debug/res/xml/` with a debug manifest
  pointing at it — not in `main`. Check what your project already does:
  `grep -rn "usesCleartextTraffic" android/app/src/`.
- **`android:usesCleartextTraffic`** is the coarse manifest attribute. The network security
  config supersedes it where both are present, and the config is what you want because it can be
  scoped per domain.
- **The config applies to the whole process**, including the WebView and any third-party SDK that
  uses the platform HTTP stack. That is the point: an SDK cannot opt itself out.

@tab iOS
App Transport Security is on by default. It requires HTTPS with TLS 1.2 or later, forward
secrecy, and a certificate signed with SHA-256 or better. Exceptions live under
`NSAppTransportSecurity` in `Info.plist`.

```xml title=ios/YourApp/Info.plist
<key>NSAppTransportSecurity</key>
<dict>
    <!--
      Do NOT add <key>NSAllowsArbitraryLoads</key><true/> here. It disables
      ATS for the entire app, and App Store review asks you to justify it.
    -->

    <key>NSExceptionDomains</key>
    <dict>
        <!-- One host, named explicitly, with the narrowest exception that works. -->
        <key>legacy-internal.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSIncludesSubdomains</key>
            <false/>
        </dict>

        <!--
          A host that only supports an older TLS version is a different
          problem from a host that only supports HTTP. Lower the floor for
          that host alone rather than allowing cleartext.
        -->
        <key>old-tls.example.com</key>
        <dict>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.2</string>
        </dict>
    </dict>
</dict>
```

Points that decide whether this file helps:

- **`NSAllowsArbitraryLoads` is all-or-nothing.** It switches ATS off for every connection the app
  makes. An exception domain alongside it does not narrow it; when `NSAllowsArbitraryLoads` is
  true, the listed domains become the ones ATS *is* applied to, which is the opposite of what
  most people intend when they add both.
- **Development needs a scoped exception too.** Metro runs on `localhost` over HTTP. Prefer
  `NSAllowsLocalNetworking` — which covers local hostnames without touching the rest of the
  policy — over a blanket switch, and prefer putting it in a debug-only `Info.plist` if your
  project has separate configurations.
- **`NSAllowsArbitraryLoadsInWebContent`** relaxes ATS for `WKWebView` content only, leaving your
  API calls protected. It is the right key when a WebView needs to load third-party pages you do
  not control — combined with the controls on
  [WebView Hardening](webview-hardening.md).
- **Apple asks for justification.** Adding `NSAllowsArbitraryLoads` triggers a review question.
  "We were debugging" is not an answer that ships.
:::

## The classic mistake: shipping the development exception

This is worth its own section because it is the most common way both of these files fail.

The sequence is always the same:

1. Something does not work in development — Metro over HTTP, a self-signed staging certificate, a
   proxy for debugging.
2. Somebody adds the broadest possible exception because it definitely fixes it:
   `NSAllowsArbitraryLoads` on iOS, `cleartextTrafficPermitted="true"` in `base-config` or
   `<certificates src="user" />` outside `debug-overrides` on Android.
3. It works. The change is committed to the main source set.
4. Nobody removes it, because nothing is broken.

The result is a shipped app that accepts cleartext, or that trusts any CA the user installs, on
every device it runs on. No attacker skill is required to exploit it; a proxy and an afternoon in
a café is enough.

Two structural fixes, both cheap:

- **Put development exceptions in a debug-only location.** Android: the `debug` source set and
  `debug-overrides`. iOS: a debug `Info.plist` or a build-configuration-specific setting.
- **Fail the build on the broad switches.** A grep in CI is more reliable than a review
  convention, because the change that introduces the problem never looks like a security change.

```bash title=scripts/check-transport-config.sh
#!/usr/bin/env bash
set -uo pipefail
fail=0

# Android: user CA trust or cleartext outside debug-only locations.
if grep -rn 'certificates src="user"' android/app/src/main/ >/dev/null 2>&1; then
  echo "FAIL: user CA trust in the main source set" >&2
  fail=1
fi
if grep -rn 'cleartextTrafficPermitted="true"' android/app/src/main/res/xml/ 2>/dev/null \
  | grep -v "domain-config" >/dev/null 2>&1; then
  echo "FAIL: cleartext permitted outside a scoped domain-config" >&2
  fail=1
fi

# iOS: the blanket switch, in any plist that ships.
if grep -rn "NSAllowsArbitraryLoads<" ios/ 2>/dev/null | grep -v "InWebContent\|ForMedia" >/dev/null 2>&1; then
  echo "FAIL: NSAllowsArbitraryLoads present" >&2
  fail=1
fi

# Any http:// literal in application source.
if grep -rnE "['\"]http://(?!localhost|127\.0\.0\.1|10\.0\.2\.2)" src/ 2>/dev/null >/dev/null; then
  echo "WARN: cleartext URL literal in src/" >&2
fi

exit "$fail"
```

Run it in the pipeline described in [CI for Mobile](../testing/ci-for-mobile.md).

## Enforcing HTTPS in the app as well

The platform configuration is the enforcement layer, but a cheap in-app check catches the
mistake earlier and makes the intent explicit in code review.

```ts title=src/api/requireHttps.ts
/**
 * Refuses to build a request URL that is not HTTPS. This does not defend
 * against a network attacker — the platform transport config does that — but
 * it turns "somebody pasted an http:// URL into a config file" into a failure
 * at the call site instead of a silent downgrade in production.
 */
export function requireHttps(url: string): string {
  if (!url.startsWith('https://')) {
    if (__DEV__ && /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)([:/]|$)/.test(url)) {
      // Metro and local backends during development only.
      return url;
    }
    throw new Error(`Refusing a non-HTTPS request URL: ${url}`);
  }
  return url;
}
```

Note the `__DEV__` guard: the allowance for local hosts does not exist in a release build,
because `__DEV__` is a compile-time constant that the release bundler replaces with `false` and
minification then removes the branch entirely. That is the same mechanism used in
[Safe Logging in Release Builds](safe-logging.md).

## Verification

### 1. Prove cleartext is actually refused

Add a temporary request to an HTTP URL in a release-configured build and confirm it fails:

```ts title=src/debug/transportProbe.ts
/**
 * Temporary probe. In a correctly configured build this rejects on both
 * platforms; if it resolves, cleartext is permitted somewhere it should not be.
 */
export async function probeCleartext(): Promise<'blocked' | 'allowed'> {
  try {
    await fetch('http://neverssl.com/');
    return 'allowed';
  } catch {
    return 'blocked';
  }
}
```

Remove the probe before shipping. Running it once tells you more than reading the config twice.

### 2. Prove the proxy cannot see HTTPS in a release build

Install a proxy CA as a user certificate on a test device, run the **release** build, and confirm
you see nothing but TLS handshakes that fail or opaque connections. Then run the **debug** build
and confirm you can see traffic. That pair of results proves `debug-overrides` is doing exactly
what it should: making development possible without weakening what ships.

### 3. Read the merged manifest, not the source

```bash
# Gradle writes the merged manifest for each variant.
cat android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml \
  | grep -i "cleartext\|networkSecurityConfig"
```

A library you depend on can add `android:usesCleartextTraffic="true"` through manifest merging.
The merged file is the only source of truth.

### 4. Enumerate the hosts the app talks to

```bash
strings -n 8 extracted/assets/index.android.bundle \
  | grep -oE 'https?://[A-Za-z0-9._-]+' | sort -u > hosts.txt
grep "^http://" hosts.txt
```

Keep `hosts.txt` between releases and diff it. A new host appearing after a dependency bump is
worth a question.

## Common mistakes

- **Turning off ATS globally to fix one host.** Wrong: `NSAllowsArbitraryLoads`. Right: an entry
  in `NSExceptionDomains` for that host only.
- **Adding `NSAllowsArbitraryLoads` *and* exception domains.** With the blanket key set, the
  exception list inverts in meaning. Use one or the other, and prefer the list.
- **Putting `<certificates src="user" />` in `base-config`.** That is the shipped configuration.
  It belongs in `debug-overrides`, which is inert in release builds.
- **Setting `cleartextTrafficPermitted="true"` in `base-config` for Metro.** Development needs
  it for `localhost` only, and the debug source set is where it goes.
- **Assuming a WebView is outside the policy.** Both platforms apply their transport rules to web
  content, with iOS offering a separate key to relax only that.
- **Reading the source manifest instead of the merged one.** A dependency can re-enable cleartext
  through manifest merging without a line changing in your repository.
- **Treating this as done once.** Every new SDK is a new set of hosts. The host enumeration in the
  verification section is the cheap recurring check.
- **Confusing this with pinning.** ATS and the network security config decide *which certificates
  are acceptable at all*. [Certificate Pinning](certificate-pinning.md) narrows that to one key,
  with a rotation cost this page does not have.

## Related topics

- [Certificate Pinning](certificate-pinning.md) — the next step up, and its operational cost.
- [Threat Model](threat-model.md) — where transport configuration ranks against other controls.
- [WebView Hardening](webview-hardening.md) — web content is covered by the same policy.
- [Network Inspection](../debugging/network-inspection.md) — how to keep debugging possible without weakening release builds.
- [CI for Mobile](../testing/ci-for-mobile.md) — where the configuration grep belongs.
- [Safe Logging in Release Builds](safe-logging.md) — the `__DEV__` mechanism used above.
