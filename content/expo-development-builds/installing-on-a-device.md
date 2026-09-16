---
title: Installing It on a Device
description: Getting a development build onto an emulator, a simulator or real hardware — adb, eas build:run, internal distribution links, and the iOS device registration rule.
status: current
toolchain: expo
sdk: 57
---

A development build is a binary. Once it exists, installing it is a separate problem from building
it, and the route depends on where the binary came from and what hardware you are targeting.

This page covers the install step only. [Creating One Locally](creating-locally.md) and
[Creating One with EAS](creating-with-eas.md) cover producing the artifact.

## Why it exists / when to use it — and when NOT to

You need this page when the build finished somewhere other than the device you want to run it on —
a cloud build, a colleague's machine, a CI artifact. If you built with `npx expo run:android` or
`npx expo run:ios` on the machine holding the device, installation already happened as part of the
command and there is nothing more to do.

## Basic example

### From a local build

`npx expo run:android` and `npx expo run:ios` build, install and launch in one step.

```bash
npx expo run:android --device
```

`--device` lets you pick which connected device or emulator to target.

### From an EAS build

```bash
eas build:run --platform android --latest
```

`eas build:run` runs simulator and emulator builds from EAS CLI. `--latest` takes the most recent
build for that platform; `--id`, `--url` and `--path` select a specific build, a build archive URL,
or a local archive. `--profile` narrows the search to builds made with a given profile.

### From a file you already have

```bash
npx expo run:android --binary ./app-debug.apk
```

`--binary` installs an existing `.apk` or `.aab` instead of building one. The iOS command accepts
`--binary` too, for an app bundle.

## How it works

Once the app is installed, you start the dev server and connect:

```bash
npx expo start --dev-client
```

The dev launcher screen inside the app looks for bundlers on your local network and lists them. If
it finds none, scan the QR code Expo CLI prints — with the system camera on iOS, or from the
launcher's own scanner on Android.

While the server runs, the interactive command table offers:

| Key | Action |
| --- | --- |
| <kbd>a</kbd> | open Android |
| <kbd>shift</kbd>+<kbd>a</kbd> | select an Android device or emulator |
| <kbd>i</kbd> | open iOS simulator (macOS only) |
| <kbd>shift</kbd>+<kbd>i</kbd> | select an iOS simulator (macOS only) |
| <kbd>r</kbd> | reload app |
| <kbd>j</kbd> | open debugger |
| <kbd>m</kbd> | toggle menu |
| <kbd>s</kbd> | switch between Expo Go and development build |

The header above the table prints which target is active — `Using development build` or
`Using Expo Go`. If you are staring at a launcher that will not connect, check that line first.

> [!WARNING] The device and the dev server must be on the same network
> The launcher discovers bundlers on the local network. Corporate Wi-Fi with client isolation,
> a VPN on the laptop, or a phone on cellular will all produce a launcher that finds nothing and an
> error that says nothing useful. `npx expo start --tunnel` routes through a relay and works around
> this at the cost of latency.

## Platform differences

:::tabs
@tab Android
Installing an APK needs no registration and no developer account.

On an emulator, drag the `.apk` onto the emulator window, or:

```bash
adb install -r ./app-debug.apk
```

`-r` reinstalls over an existing copy, keeping the app's data. If the signing key differs from what
is installed, the install fails and you must uninstall first:

```bash
adb uninstall com.example.myapp
```

On a physical device, enable **Developer options** and **USB debugging**, or download the build's
APK directly on the device from the EAS build page and allow installation from that browser.

A debug build is signed with a locally generated debug keystore. That is fine for development and
useless for store distribution.
@tab iOS
iOS is the constrained platform, and the constraint is device registration.

**Simulator.** A simulator build (`ios.simulator: true` in the EAS profile, or a local
`npx expo run:ios`) installs with no account and no registration. It runs only in the simulator.

**Physical device.** An internal-distribution build embeds the list of registered devices at build
time. Register devices before building:

```bash
eas device:create
```

That command registers Apple devices for internal distribution. A device registered *after* the
build cannot install it — you register, then build again. This surprises people once per team.

Installing a local `npx expo run:ios --device` build onto hardware needs a signing identity. A free
Apple ID can sign for personal devices, but the provisioning profile is short-lived and the app
stops launching when it expires. A paid Apple Developer account is what removes that friction.
:::

## Common patterns

### Give testers a link, not a file

EAS internal distribution produces a page testers open on the device itself: Android downloads and
installs the APK, iOS installs through the provisioning profile. That avoids emailing binaries and
avoids the "which build is this" question, because the page records which build it is. See
[Internal Distribution](../expo-eas/internal-distribution.md).

### Keep one development build per project on the device

Development builds from different projects can have the same app name and different bundle
identifiers, or worse, the same identifier. Give each project a distinct `ios.bundleIdentifier` and
`android.package` in the app config so they install side by side and you can tell them apart.

### Reinstall rather than debug a stale binary

If the app behaves as though your last native change never happened, it probably did not. Uninstall
and install the new build before spending time on the symptom. A development build only picks up
JavaScript changes live; native changes need the new binary.

## Security considerations

**Threat.** An internal-distribution build is installable by anyone who obtains the artifact. On
Android that is a URL and an APK — there is no device allow-list, and the link is the only control.

**Exploit.** A development build typically points at development backends, ships with development
tooling, and may embed non-production configuration. Anyone with the APK can unzip it and read the
bundled JavaScript:

```bash
unzip -o app-debug.apk -d extracted
strings extracted/assets/index.android.bundle | grep -i "api"
```

Anything in the bundle is readable. That includes any URL, key or token you put there.

**Fix.** Treat development-build distribution links as sensitive. Do not put production credentials
in a development build at all. Keep secrets server-side and hand the app short-lived tokens. See
[What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) and
[Expo Public Env Vars](../expo-security/expo-public-env-vars.md).

**Verification.** Run the `unzip` and `strings` commands above on your own APK. If you find anything
you would not paste into a public issue, it does not belong in the bundle.

## Common mistakes

- **Registering an iOS device after the build.** The device list is baked in at build time. Run
  `eas device:create`, then build.
- **Expecting an iOS simulator build to run on a phone.** `ios.simulator: true` produces a
  simulator-only binary. It is a different artifact.
- **`adb install` failing with a signature mismatch and reinstalling anyway.** Uninstall the old
  copy first; the app's data goes with it, which is usually what you want.
- **Phone on cellular, laptop on Wi-Fi.** The launcher finds no bundler and the error is unhelpful.
  Same network, or `--tunnel`.
- **Leaving a VPN running on the development machine.** Same symptom, harder to spot, because
  everything else on the laptop works.
- **Blaming JavaScript for a native change that did not take.** Reinstall the binary before
  debugging further.
- **Sharing an internal-distribution link outside the team.** It is a working install link with no
  device check on Android.

## Related topics

- [Creating One Locally](creating-locally.md) — building on your own machine.
- [Creating One with EAS](creating-with-eas.md) — building on Expo's servers.
- [expo-dev-client Features](dev-client-features.md) — what the launcher can do once installed.
- [Debugging a Development Build](debugging.md) — connecting DevTools.
- [Internal Distribution](../expo-eas/internal-distribution.md) — distributing to testers.
- [Running on a Device](../expo-getting-started/running-on-a-device.md) — the general device setup.
- [What Ships in the Bundle](../expo-security/what-ships-in-the-bundle.md) — what an APK reveals.
