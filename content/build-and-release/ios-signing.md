---
title: iOS Signing and Provisioning
description: Certificates, identifiers, devices and provisioning profiles — what each one is, how they combine, and how to sign an iOS build on a CI runner.
status: current
toolchain: cli
---

iOS code signing is four separate things that must agree with each other: a **certificate** that
proves who you are, an **identifier** that names your app, a list of **devices** that may run a
non-store build, and a **provisioning profile** that binds the three together. Every signing error
you will ever see is one of those four disagreeing with another.

It is not conceptually hard. It is unforgiving, the error messages describe the symptom rather
than the cause, and the state lives in three places at once — your Keychain, the Apple Developer
portal, and your Xcode project.

> [!WARNING] This page requires macOS
> Code signing an iOS app requires Xcode's toolchain and the macOS Keychain. There is no supported
> path on Windows or Linux: not a VM you can license, not a cross-compiler, not a container. If
> your team is on Windows or Linux you can build the entire Android app and all the shared
> JavaScript, but signing, archiving and uploading an iOS build needs a Mac — your own, a
> colleague's, or a hosted macOS CI runner. See
> [Environment Setup](../getting-started/environment-setup.md).

## The four pieces

| Piece | What it is | Where it lives | Expires |
| --- | --- | --- | --- |
| **Certificate** | A public/private key pair asserting your identity as a developer or as a distributor | The private key in your Keychain; the certificate in the Developer portal | Yes |
| **Identifier (App ID)** | Your bundle identifier, plus the capabilities it is allowed to use | Developer portal | No |
| **Device** | A UDID registered to your team | Developer portal | Renewed annually |
| **Provisioning profile** | A signed file binding a certificate, an App ID and (for non-store builds) a device list | Downloaded to your Mac; embedded in the app | Yes, typically one year |

The profile is the part that gets embedded in your `.app` as `embedded.mobileprovision`. iOS
checks it at install time: the app's bundle identifier must match the profile, the signature must
come from a certificate the profile lists, the entitlements must be a subset of the profile's,
and — for development and ad hoc builds — the device must be in the profile's device list.

### Certificate types

| Type | Signs | Used for |
| --- | --- | --- |
| **Apple Development** | Builds that run on registered devices | Day-to-day development |
| **Apple Distribution** | Builds for TestFlight, the App Store, and ad hoc distribution | Releases |

The **private key is the thing that matters**. A certificate without its private key is useless,
and the private key only exists where it was generated unless you deliberately exported it. This
is why "it signs on my machine and not on my colleague's" is the single most common iOS signing
complaint, and why `match` (below) exists.

### Profile types

| Profile | Device list | Distribution |
| --- | --- | --- |
| **Development** | Registered devices only | Running from Xcode |
| **Ad Hoc** | Registered devices only, up to the annual device limit | Direct `.ipa` distribution, device farms |
| **App Store** | None — any device | TestFlight and the App Store |

An App Store profile embeds no device list, which is why a TestFlight build installs on any
device and an ad hoc build does not.

## Automatic signing

For a single developer or a small team, let Xcode manage it. Select the target → **Signing &
Capabilities** → tick **Automatically manage signing** and choose your team. Xcode creates the App
ID, requests the certificate, registers the device you have plugged in, and generates a matching
profile.

The corresponding build settings:

```text title=Build settings under automatic signing
CODE_SIGN_STYLE = Automatic
DEVELOPMENT_TEAM = ABCDE12345
PRODUCT_BUNDLE_IDENTIFIER = com.awesomeapp
```

Automatic signing stops being enough at a predictable point:

- More than a couple of people sign builds, and their certificates drift apart.
- CI needs to sign, and a CI runner has no Xcode UI and no Apple ID session.
- You ship several bundle identifiers from one project (dev, staging, prod) and need to control
  which profile each configuration uses.

## Manual signing

Manual signing means you create the App ID, the certificate and the profile in the Developer
portal, install them, and name them explicitly.

```text title=Build settings under manual signing
CODE_SIGN_STYLE = Manual
DEVELOPMENT_TEAM = ABCDE12345
PRODUCT_BUNDLE_IDENTIFIER = com.awesomeapp
CODE_SIGN_IDENTITY = Apple Distribution
PROVISIONING_PROFILE_SPECIFIER = AwesomeApp App Store
CODE_SIGN_ENTITLEMENTS = AwesomeApp/AwesomeApp.entitlements
```

Set `PRODUCT_BUNDLE_IDENTIFIER` and `PROVISIONING_PROFILE_SPECIFIER` **per build configuration**
so each environment gets its own identifier and profile — the same mechanism described in
[Build Variants and Flavours](build-variants.md):

| Configuration | Bundle identifier | Profile |
| --- | --- | --- |
| `Debug` | `com.awesomeapp` | AwesomeApp Development |
| `Release` | `com.awesomeapp` | AwesomeApp App Store |
| `Debug Staging` | `com.awesomeapp.staging` | AwesomeApp Staging Development |
| `Release Staging` | `com.awesomeapp.staging` | AwesomeApp Staging Ad Hoc |

### Entitlements must match the profile

The entitlements file declares what your app is allowed to do — push notifications, App Groups,
Keychain sharing, associated domains for universal links. The profile grants a set of
entitlements, and **the app's entitlements must be a subset of the profile's**.

```xml title=ios/AwesomeApp/AwesomeApp.entitlements
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>production</string>
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:awesomeapp.example.com</string>
    </array>
</dict>
</plist>
```

Adding a capability in Xcode edits this file **and** updates the App ID in the portal. Adding an
entitlement by hand edits only the file, and the build then fails with a message about a
provisioning profile that does not include the entitlement. Use the Signing & Capabilities tab,
then regenerate the profile.

## Inspecting what you actually have

The single most useful habit in iOS signing is checking state instead of guessing at it.

```bash
# Which signing identities does this Mac hold, and are their private keys present?
security find-identity -v -p codesigning

# What is inside a provisioning profile? (It is a signed plist.)
security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/PROFILE.mobileprovision

# What did the built app actually get signed with?
codesign -dvvv --entitlements :- "build/AwesomeApp.app"

# Which profile is embedded in the built app?
security cms -D -i "build/AwesomeApp.app/embedded.mobileprovision"
```

The decoded profile shows its `TeamIdentifier`, `ExpirationDate`, `Entitlements`, the
`DeveloperCertificates` it accepts, and `ProvisionedDevices` if it has any. Comparing that against
`security find-identity` output resolves most signing failures in under a minute.

## Archiving and exporting

Signing is applied at archive and export time. The Community CLI's build command wraps
`xcodebuild`; for a release you usually drive `xcodebuild` directly, because you need the export
step as well.

```bash
cd ios

xcodebuild -workspace AwesomeApp.xcworkspace \
           -scheme "AwesomeApp" \
           -configuration "Release" \
           -destination "generic/platform=iOS" \
           -archivePath build/AwesomeApp.xcarchive \
           archive

xcodebuild -exportArchive \
           -archivePath build/AwesomeApp.xcarchive \
           -exportOptionsPlist ExportOptions.plist \
           -exportPath build/export
```

```xml title=ios/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>ABCDE12345</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>com.awesomeapp</key>
        <string>AwesomeApp App Store</string>
    </dict>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

> [!NOTE] The `method` value has changed names across Xcode versions
> Older documentation uses `app-store`; newer Xcode releases use `app-store-connect`, and the ad
> hoc and enterprise values have shifted similarly. Check the values your Xcode accepts with
> `xcodebuild -help` and search for `exportOptionsPlist`, rather than copying a value from a blog
> post. An unrecognised `method` fails the export with a message that does not name the key.

`uploadSymbols` matters for React Native: it uploads the `.dSYM` files so crash reports from
TestFlight and the App Store are symbolicated. Keep the `.dSYM` from every shipped archive
regardless — it is the iOS counterpart to Android's `mapping.txt`.

## Signing on CI

A CI runner is a fresh macOS machine with an empty Keychain and no Apple ID. Two problems to
solve: getting the signing material onto the machine, and authenticating to App Store Connect.

### Authenticate with an App Store Connect API key

Do not use an Apple ID and password on CI. Apple ID authentication involves two-factor prompts
that a headless runner cannot answer, and session tokens that expire at inconvenient times.

Create an **App Store Connect API key** (App Store Connect → Users and Access → Integrations →
Keys). You get three values and one file:

| Value | Where it comes from |
| --- | --- |
| Key ID | Shown next to the key |
| Issuer ID | Shown above the key list, shared across your team's keys |
| `.p8` private key file | Downloadable **exactly once** |

The `.p8` file is a credential. Store it in your CI secret store, base64-encoded, and never in the
repository.

> [!DANGER] The `.p8` is downloadable once and grants API access to your App Store Connect account
> There is no second download. If you lose it, revoke the key and create a new one. If it leaks,
> revoke it immediately — an attacker with it can, depending on the key's role, read your app
> metadata, manage TestFlight, and submit builds.

### Getting certificates onto the runner

Two approaches, and they are genuinely different in kind.

**Fastlane `match`** stores your certificates and profiles encrypted in a private git repository
(or a cloud bucket), and installs them on any machine with the passphrase. It makes every machine
and every runner use the *same* certificate, which is the actual fix for signing drift rather
than a workaround. Setup is on [Fastlane](fastlane.md).

**Manual Keychain import** works without Fastlane and is worth understanding because `match` does
the same thing underneath:

```yaml title=.github/workflows/ios-release.yml (excerpt)
      - name: Import the signing certificate
        env:
          CERT_P12_BASE64: ${{ secrets.IOS_DIST_CERT_P12_BASE64 }}
          CERT_PASSWORD: ${{ secrets.IOS_DIST_CERT_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.IOS_KEYCHAIN_PASSWORD }}
        run: |
          set -euo pipefail
          CERT_PATH="$RUNNER_TEMP/dist.p12"
          KEYCHAIN="$RUNNER_TEMP/build.keychain-db"

          echo "$CERT_P12_BASE64" | base64 --decode > "$CERT_PATH"

          # A dedicated, ephemeral keychain. Never touch the login keychain.
          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
          security set-keychain-settings -lut 21600 "$KEYCHAIN"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

          security import "$CERT_PATH" -k "$KEYCHAIN" -P "$CERT_PASSWORD" \
            -T /usr/bin/codesign -T /usr/bin/security

          # Without this, codesign triggers a GUI password prompt that a
          # headless runner cannot answer, and the build hangs until timeout.
          security set-key-partition-list -S apple-tool:,apple: \
            -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

          security list-keychain -d user -s "$KEYCHAIN"
          rm -f "$CERT_PATH"

      - name: Install the provisioning profile
        env:
          PROFILE_BASE64: ${{ secrets.IOS_APPSTORE_PROFILE_BASE64 }}
        run: |
          set -euo pipefail
          PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
          mkdir -p "$PROFILE_DIR"
          echo "$PROFILE_BASE64" | base64 --decode > "$PROFILE_DIR/appstore.mobileprovision"
```

`set-key-partition-list` is the line everyone omits and then spends an afternoon on. Without it
`codesign` asks the Keychain for permission through the GUI, and a headless runner simply stops.

## Expiry, and planning for it

Certificates and provisioning profiles expire. Nothing warns you until a build fails.

- **Provisioning profiles** typically last a year. A profile that expires does not break installed
  apps distributed through the App Store — those are stapled — but it does break your ability to
  build, and it does break ad hoc and development installs.
- **Certificates** expire too, on a different schedule from profiles, and revoking one
  invalidates every profile that lists it.
- **Push certificates and keys** have their own lifetimes.

> [!NOTE] Check the exact lifetimes in the Developer portal, not in documentation
> Apple has changed certificate validity periods more than once, and they differ between
> development and distribution certificates. The portal shows the real expiry date for each item
> you hold — put those dates in a shared calendar. A signing certificate that expires the week of
> a release is a genuinely bad week.

## Common mistakes

- **Expecting to sign on Windows or Linux.** Xcode and the macOS Keychain are required. Plan for a
  Mac or a hosted macOS runner before you commit to an iOS release date.
- **Sharing a certificate without the private key.** Exporting a `.cer` from the portal gives a
  certificate with no key, and it signs nothing. Export a `.p12`, which contains both — or use
  `match`.
- **Everyone generating their own distribution certificate.** Teams hit Apple's certificate limit
  and then start revoking each other's, which invalidates profiles. One shared distribution
  identity, managed by `match` or an equivalent.
- **Adding an entitlement by hand.** Editing the `.entitlements` file without updating the App ID
  produces a profile mismatch. Use Signing & Capabilities, then regenerate the profile.
- **Using an Apple ID and password on CI.** Two-factor prompts cannot be answered headlessly. Use
  an App Store Connect API key.
- **Importing a certificate into the login keychain on CI.** Use a dedicated ephemeral keychain so
  the runner's state is clean and nothing persists between jobs.
- **Forgetting `security set-key-partition-list`.** `codesign` blocks on a GUI prompt and the job
  hangs until it times out, with no useful log line.
- **Committing the `.p8` App Store Connect key or a `.p12`.** Both are credentials. Base64 them
  into a secret store, and revoke immediately if either leaks.
- **Assuming automatic signing will work on CI.** It needs an authenticated Xcode session. Either
  use manual signing with an explicit profile, or use `match`.
- **Not tracking expiry dates.** The failure arrives as a build error on the day you least want
  one. Put the dates in a calendar.

## Related topics

- [TestFlight and App Store Submission](app-store-submission.md) — what you do with the signed archive.
- [Build Variants and Flavours](build-variants.md) — a bundle identifier and profile per configuration.
- [Fastlane](fastlane.md) — `match`, `gym` and the App Store Connect API key in practice.
- [CI Pipelines](ci-pipelines.md) — why the iOS job needs a macOS runner.
- [Android Signing](android-signing.md) — the Android equivalent, which is simpler than this.
- [Environment Setup](../getting-started/environment-setup.md) — Xcode, and why iOS needs macOS.
- [Deep Linking and Universal Links](../navigation/deep-linking.md) — the associated-domains entitlement.
- [Release Checklist](release-checklist.md) — signing checks before an upload.
