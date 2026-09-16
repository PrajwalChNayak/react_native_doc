---
title: Internal Distribution
description: Getting builds onto testers' devices without the stores — distribution internal, iOS ad hoc device registration, Android APKs, and the TestFlight alternative.
status: current
toolchain: expo
sdk: 57
---

Internal distribution means handing a build to people who are not using the app stores: QA, a
designer, a client, the person who filed the bug. In `eas.json` it is one field:

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal"
    }
  }
}
```

That single setting changes what gets built on both platforms, and the two platforms behave very
differently. Android is nearly friction-free. iOS requires registering every device before the
build.

## Why it exists / when to use it — and when NOT to

Use internal distribution when you need a build in someone's hands today and a store review would
take days, or when the build is not something you would submit at all — a staging build pointed at
test infrastructure, for example.

Do **not** use it as your main tester channel on iOS if you have more than a handful of testers.
The ad hoc device limit and the rebuild-per-device rule make it painful at scale; TestFlight exists
for that and is covered in [EAS Submit](submit.md).

## Basic example

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

```bash
# Register iOS test devices first — this is not optional
eas device:create
eas device:list

eas build --platform all --profile preview
```

When the build finishes, EAS gives you a shareable install page and a QR code. Opening it on a
registered device installs the app.

## How it works

### What `distribution: "internal"` changes

:::tabs
@tab Android

The default Gradle task changes so the build produces an **APK instead of an AAB**. That matters
because an AAB cannot be installed on a device — Google Play processes it into device-specific
APKs. An APK installs directly.

Testers need to allow installation from the browser or file manager they use. That prompt is an OS
security feature, not a bug in your build, and it is worth telling testers about in advance.

No device registration, no per-tester limit, no Apple account involved.

@tab iOS

The build is signed with either an **ad hoc** or an **enterprise** provisioning profile.

An ad hoc profile contains an allow-list of device UDIDs. A device not on that list cannot install
the build — it fails at install time with an unhelpful message. The allow-list is fixed when the
build is signed, so registering a device afterwards does nothing for builds that already exist.

Both paths need a **paid Apple Developer Program membership**. Enterprise provisioning additionally
requires membership in the Apple Developer Enterprise Program, which has its own eligibility rules.

:::

### Registering iOS devices

```bash
eas device:create
```

The command is interactive and offers several ways to collect a UDID — sending a registration URL
to the tester, showing a QR code, or entering the UDID by hand. The tester installs a small profile
and their UDID is added to your Expo account.

Then rebuild:

```bash
eas build --platform ios --profile preview
```

If the build is otherwise unchanged and you only need the device list refreshed:

```bash
eas build --platform ios --profile preview --refresh-ad-hoc-provisioning-profile
```

Other device commands: `eas device:list`, `eas device:view`, `eas device:rename`,
`eas device:delete`.

### Enterprise provisioning

```json title=eas.json
{
  "build": {
    "enterprise": {
      "distribution": "internal",
      "ios": {
        "enterpriseProvisioning": "universal"
      }
    }
  }
}
```

`enterpriseProvisioning` accepts `"adhoc"` or `"universal"`. `"universal"` uses an enterprise
in-house distribution profile, which installs on any device without UDID registration. It is only
available to organisations in the Apple Developer Enterprise Program, and Apple restricts that
program to distributing apps to your own employees. Using it to distribute to the public violates
the agreement.

### Re-signing an existing build

```bash
eas build:resign
```

Re-signs an existing build with different credentials — for example to add newly registered devices
to an ad hoc build without recompiling. Faster than a full rebuild when the JavaScript and native
code have not changed.

## Platform differences

| | Android | iOS |
| --- | --- | --- |
| Artifact | APK | IPA |
| Device pre-registration | Not needed | **Required** for ad hoc |
| Adding a tester later | Send them the link | Register UDID, then rebuild or re-sign |
| Paid developer account | Not needed to build | **Required** |
| Practical tester ceiling | High | Limited by Apple's per-account device allowance |

This asymmetry catches people out on the first release. Plan iOS tester onboarding as a step with
lead time, not something you do during the demo.

## Common patterns

### One preview profile, one channel

```json title=eas.json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_API_URL": "https://staging.example.com" }
    }
  }
}
```

Giving the preview build its own channel means you can push
[EAS updates](update.md) to testers without touching production. That is the main reason to bother
with channels on a non-production build.

> [!WARNING] `EXPO_PUBLIC_` variables ship inside the bundle
> Anything with that prefix is inlined into the JavaScript at build time and is readable by anyone
> with the binary. It is fine for a staging URL and wrong for anything secret. See
> [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md).

### Simulator builds for people with Macs

```json title=eas.json
{
  "build": {
    "preview-simulator": {
      "distribution": "internal",
      "ios": { "simulator": true }
    }
  }
}
```

Unsigned, no device registration, no Apple account. A designer with a Mac can run the build in the
iOS Simulator immediately. This sidesteps the entire ad hoc problem when the tester does not need a
physical device.

### Make the build identifiable

Internal builds accumulate. Attach a message so the list is readable later:

```bash
eas build --platform android --profile preview -m "fixes checkout crash, PR #412"
eas build:list --limit 10
```

## Security considerations

**Threat.** An internal-distribution link is a URL. Anyone who has it can download the binary, and
your staging build typically points at infrastructure with weaker protections than production.

**Exploit.** A tester forwards the install link outside the company. On Android there is no device
allow-list, so it installs anywhere. Whoever has it can extract the JavaScript bundle and read
every `EXPO_PUBLIC_` value, every embedded URL, and every string constant in your code.

**Fix.**

- Treat internal build links as semi-public. Do not post them where they will outlive their
  usefulness.
- Keep real secrets out of the client entirely — the bundle is readable, which
  [What Ships Inside the Bundle](../expo-security/what-ships-in-the-bundle.md) demonstrates.
- Point staging builds at staging infrastructure that requires its own authentication, so a leaked
  build is not a leaked environment.
- Prefer TestFlight or Play internal testing when you want the store's identity checks around
  tester access.

**Verification.** Unzip a preview APK and grep the bundle for strings you believe are not exposed:

```bash
unzip -o app.apk -d app-extracted
grep -R --binary-files=text "api.example.com" app-extracted | head
```

If a value you expected to be private appears, it is in the binary.

## Common mistakes

- **Registering a device after the build and expecting it to install.** The UDID allow-list is
  baked into the provisioning profile at signing time. Register first, then build or re-sign.
- **Sending an AAB to a tester.** An AAB is not installable. Set `"buildType": "apk"` for internal
  Android builds — `distribution: "internal"` already does this by default, so an explicit
  `"app-bundle"` on a preview profile is usually a mistake.
- **Using `distribution: "internal"` for the production profile.** You then cannot submit the
  result to Google Play, which requires an AAB.
- **Assuming enterprise provisioning is a shortcut past the App Store.** It is restricted to
  distributing to your own employees. Using it for public distribution breaks the agreement and
  Apple does revoke enterprise certificates.
- **Not giving the preview profile a `channel`.** Testers then cannot receive EAS updates, so every
  fix costs a full rebuild.
- **Treating the install link as private.** It is a URL. Anyone with it has the binary.

## Related topics

- [eas.json and Build Profiles](eas-json.md) — `distribution`, `buildType`, `enterpriseProvisioning`.
- [Building on EAS](building.md) — the build command and `--refresh-ad-hoc-provisioning-profile`.
- [Credentials Management](credentials.md) — ad hoc profiles and device registration.
- [EAS Submit](submit.md) — TestFlight and Play internal testing as the alternative.
- [Installing It on a Device](../expo-development-builds/installing-on-a-device.md) — the same install flow for dev builds.
- [EXPO_PUBLIC_ Variables and the Leak They Cause](../expo-security/expo-public-env-vars.md) — what a tester build exposes.
- [Build Profiles per Environment](../expo-build-and-release/environments.md) — preview and staging profiles.
