---
title: Running on a Device
description: Getting an Expo SDK 57 app onto a physical phone — QR codes, LAN and tunnel hosting, and what a real iPhone needs that a simulator does not.
status: current
toolchain: expo
sdk: 57
---

Physical devices are the only place some things are observable: real touch latency, real
thermal behaviour, real camera and sensor hardware, real push notifications. They are also
the only iOS target available if you do not have a Mac.

The mechanics are the same as a simulator — a dev server plus an installed app — with one
extra problem to solve: the phone has to be able to reach the dev server.

## Basic example

```bash
npx expo start
```

The terminal prints a QR code and a URL. What you do with it depends on which app is on the
phone:

| Installed app | How to connect |
| --- | --- |
| **Expo Go** | Scan the QR code with the Expo Go app on Android, or the Camera app on iOS. The terminal says "Scan the QR code above to open in Expo Go." |
| **A development build** | Scan the QR code with the system camera, or open the dev client's launcher screen and pick the server. The terminal says "Scan the QR code above to open in a development build." |

The CLI also prints the Metro URL, which you can type into the dev client's launcher by hand
when scanning is inconvenient.

> [!NOTE] The QR code is not the same thing in both cases
> Under Expo Go the QR encodes a URL Expo Go knows how to open. Under a development build it
> encodes a link in **your app's own URL scheme**, which is why `expo.scheme` has to be set
> in the app config for a dev build to be reachable this way. If the scheme cannot be
> resolved the CLI prints "Linking is disabled because the client scheme cannot be resolved."
> and only shows the Metro URL.

## Why it exists / when to use it — and when NOT to

Use a device when the thing you are testing is a property of hardware: camera, biometrics,
GPS, push notifications, haptics, Bluetooth, thermals, or real-world performance. Use a
simulator for everything else, because the iteration loop is faster and the tooling is
better integrated.

One exception makes devices mandatory rather than preferable: **if you are on Windows or
Linux, a physical iPhone is your only way to run the iOS build of your app.** You cannot
compile it locally — the binary has to come from a Mac or from a cloud build — but once
installed, the dev server workflow is identical.

## How it works

### Getting the dev server onto the phone's network

Three hosting modes, selected with `-m, --host` or the shorthand flags:

| Mode | Flag | What it does | When |
| --- | --- | --- | --- |
| **LAN** (default) | `--lan` | Serves on your machine's local network address | Phone and computer on the same Wi-Fi, no client isolation |
| **Tunnel** | `--tunnel` | Routes through an ngrok tunnel, reachable from any network | Corporate Wi-Fi with client isolation, VPN, phone on cellular |
| **Localhost** | `--localhost` | Serves on `localhost` only | USB-attached Android with `adb reverse`, or a simulator |

```bash
npx expo start --tunnel
```

Tunnel mode is the answer to "the QR code scans but the app never loads". It is noticeably
slower than LAN because every bundle request crosses the internet twice, so use it when LAN
does not work rather than by default.

`--offline` skips network requests and uses anonymous manifest signatures, which is useful on
a flaky connection or when you have no Expo account.

### What the phone has to have installed

The same three-way distinction as the simulator, and it is the important one:

- **Expo Go** — from the App Store or Play Store. Contains a fixed set of native modules. The
  moment your project uses a native module Expo Go was not built with, the app throws at
  runtime.
- **A development build** — your own binary, containing your own native dependencies. This is
  the normal way to develop a real app.
- **A release build** — for testing what users will get.

[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) is
the page that matters here.

## Platform differences

:::tabs
@tab Android
The simpler side. No signing account is required to install a debug build on your own device.

**Over USB:**

```bash
# Enable Developer options and USB debugging on the phone first
adb devices              # confirm the phone is listed and authorised
npx expo run:android -d  # build, install and launch on the device
```

**Over the network:** start the dev server, then scan the QR code. If the phone cannot reach
the LAN address, use `--tunnel`.

**Over USB without Wi-Fi:** `adb reverse tcp:8081 tcp:8081` maps the phone's port 8081 to
your machine's, after which `--localhost` works. Useful on networks that block device-to-device
traffic.

If `adb devices` shows the phone as `unauthorized`, unlock it and accept the USB debugging
prompt.
@tab iOS
Installing a build on a physical iPhone requires code signing, which means an Apple account.

- **A free Apple ID** can sign development builds. The provisioning profile expires after 7
  days, so the app stops launching a week later and has to be reinstalled.
- **A paid Apple Developer Program membership** gives a one-year profile and is what you need
  for internal distribution or TestFlight.

To build and install from a Mac:

```bash
npx expo run:ios --device
```

The CLI prompts you to pick the connected device. Xcode must already have the signing
identity configured for the bundle identifier in your app config.

If you are not on a Mac, produce the build elsewhere — see
[Creating One with EAS](../expo-development-builds/creating-with-eas.md) and
[Internal Distribution](../expo-eas/internal-distribution.md) — and install the resulting
build on the device. After that, `npx expo start` on your Windows or Linux machine connects
to it normally.

Scanning the QR code with the iOS Camera app works for both Expo Go and a development build;
the dev build case needs `expo.scheme` set.
:::

## Common patterns

### Fix "the QR code scans but nothing loads" in order

1. Confirm the phone and computer are on the **same network**, and that it is not a guest
   network with client isolation.
2. Check your machine's firewall is not blocking port 8081.
3. Try `npx expo start --tunnel`. If that works, the problem was the network, not the project.
4. For Android over USB, `adb reverse tcp:8081 tcp:8081` and `--localhost`.

### Set a scheme before you need it

```json title=app.json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

`expo.scheme` is what makes deep links and development-build QR codes work. It requires a
native rebuild to take effect, so setting it early costs nothing and setting it late costs a
rebuild. See [Deep Links and Universal Links](../expo-router/deep-linking.md).

### Open the dev menu on hardware

Shake the device. That is the gesture on both platforms for a physical phone. You can also
press `m` in the terminal to toggle the menu remotely, which is more reliable than shaking
and does not risk dropping the phone.

### Test notifications and permissions on hardware only

Push notifications, background tasks and several permission flows behave differently or not
at all on simulators. Anything in
[Notifications](../expo-sdk/notifications.md) or
[Permissions Patterns](../expo-sdk/permissions-patterns.md) should be verified on a device
before you believe it.

## Common mistakes

- **Assuming LAN mode will work on corporate Wi-Fi.** Client isolation is common and silently
  breaks device-to-dev-server traffic. `--tunnel` is the diagnostic and the workaround.
- **Using `--tunnel` permanently.** Every bundle request goes through a remote relay. It is a
  fallback, not a default.
- **Scanning a development build's QR code with Expo Go.** Different app, different link.
  Use the system camera or the dev client's own launcher.
- **Forgetting `expo.scheme`.** Without it, a development build cannot be opened by link and
  the CLI tells you linking is disabled.
- **Expecting a free-Apple-ID build to keep working.** The profile expires after 7 days and
  the app stops launching with a signing error that does not mention expiry.
- **Testing push notifications on a simulator.** They do not behave the same. Use hardware.
- **Believing a device-only bug is a device-only bug.** Check whether the device has a
  different build installed from the one you think — a stale development build is a common
  cause of "it works on the simulator".

## Related topics

- [Running on a Simulator](running-on-a-simulator.md) — the faster loop, and the flags shared with this page.
- [The Dev Server and Fast Refresh](dev-server-and-fast-refresh.md) — hosting modes and the terminal UI in more detail.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — which app should be on the phone.
- [Installing It on a Device](../expo-development-builds/installing-on-a-device.md) — getting a dev build onto hardware.
- [Creating One with EAS](../expo-development-builds/creating-with-eas.md) — building iOS without a Mac.
- [Internal Distribution](../expo-eas/internal-distribution.md) — handing builds to testers.
- [Deep Links and Universal Links](../expo-router/deep-linking.md) — what `expo.scheme` unlocks.
- [Notifications](../expo-sdk/notifications.md) — a feature you cannot test without hardware.
