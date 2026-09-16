---
title: App Icons and Splash Screens
description: Produce the real native assets both stores require — Android mipmap densities and adaptive icons, the iOS AppIcon catalog, and the Android 12+ system splash screen.
status: current
toolchain: cli
---

Icons and splash screens are pure native configuration. There is no React Native API for either:
they are resources compiled into the app, read by the launcher and the window manager before any
JavaScript exists. That is also why they are the last thing anyone does and the first thing that
fails review.

Two things changed materially and invalidate most older guidance. **Android 12 (API 31) made the
system splash screen mandatory** — your app gets one whether you configure it or not, which is
why old custom splash implementations now produce two splashes in a row. And **Xcode generates
every iOS icon size from a single 1024×1024 image**, so the twenty-file icon sets in older
tutorials are unnecessary.

## Android icons

### The two icon systems, and why you need both

| | Legacy launcher icon | Adaptive icon |
| --- | --- | --- |
| Since | Always | API 26 (Android 8.0) |
| Files | One PNG per density bucket | Two or three layers plus an XML descriptor |
| Shape | Whatever you draw | Masked by the launcher into a circle, squircle, teardrop… |
| Lives in | `res/mipmap-<density>/` | `res/mipmap-anydpi-v26/` |

`minSdk` for React Native 0.87 is 24, so devices below API 26 still exist in your install base
and still need the legacy PNGs. Ship both. Android picks `mipmap-anydpi-v26` on API 26 and above
and falls back to the density buckets below it.

> [!NOTE] `mipmap`, not `drawable`
> Launcher icons belong in `res/mipmap-*/`. `drawable-*` resources are stripped by density when
> you build a density-split APK, and the launcher may ask for a density your APK does not carry.
> `mipmap` directories are exempt from that stripping. This is the reason the directory exists.

### Legacy density buckets

The base launcher icon is 48 dp, scaled by the density multiplier for each bucket:

| Directory | Density multiplier | Pixel size |
| --- | --- | --- |
| `mipmap-mdpi` | 1x | 48 × 48 |
| `mipmap-hdpi` | 1.5x | 72 × 72 |
| `mipmap-xhdpi` | 2x | 96 × 96 |
| `mipmap-xxhdpi` | 3x | 144 × 144 |
| `mipmap-xxxhdpi` | 4x | 192 × 192 |

A generated project ships `ic_launcher.png` and `ic_launcher_round.png` in each. Replace both.
`ic_launcher_round.png` is what circular-icon launchers use on API 25 and below; above that the
adaptive icon takes over.

### Adaptive icons

An adaptive icon is two drawable layers plus an optional monochrome layer, described by XML. The
launcher applies its own mask, and animates the layers independently on some launchers.

The geometry is fixed and is the part people get wrong:

- Each layer is **108 × 108 dp**.
- The launcher masks down to the centre **72 × 72 dp**.
- The guaranteed-visible **safe zone is the central 66 × 66 dp**. Keep your logo inside it.
- That leaves **18 dp of margin on each side** for masking and parallax.
- Android's own guidance puts the logo between 48 dp and 66 dp.

At each density bucket, a 108 dp layer is:

| Directory | Pixel size of each layer |
| --- | --- |
| `mipmap-mdpi` | 108 × 108 |
| `mipmap-hdpi` | 162 × 162 |
| `mipmap-xhdpi` | 216 × 216 |
| `mipmap-xxhdpi` | 324 × 324 |
| `mipmap-xxxhdpi` | 432 × 432 |

Vector drawables avoid the whole table — one file, every density. Use them when your mark is
vector art.

```xml title=android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <!-- API 33+ themed icons. Without this layer the launcher either leaves
         your icon untouched or, from Android 16 QPR 2, themes it for you —
         and an automatic result is rarely the one you wanted. -->
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

Create `ic_launcher_round.xml` with the same content in the same directory. Both are referenced
from the manifest:

```xml title=android/app/src/main/AndroidManifest.xml
<application
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:label="@string/app_name">
```

The monochrome layer must be a **single-colour silhouette on transparency**. Reusing a full-colour
foreground there produces a flat blob, because the system discards your colours and fills the
opaque pixels with the user's theme colour.

### A different icon per flavour

Per-flavour source sets do this without any conditional logic. Put the shared icon in
`src/main/` and override it only where it differs:

```text title=android/app/src/
android/app/src/
├── main/res/
│   ├── mipmap-anydpi-v26/ic_launcher.xml
│   └── mipmap-*/ic_launcher.png
├── dev/res/
│   └── mipmap-*/ic_launcher.png        Overrides main for the dev flavour
└── staging/res/
    └── mipmap-*/ic_launcher.png
```

Resource merging prefers the flavour's copy. You only have to supply the files that differ,
though you do have to supply **every density** of the ones you override.

### The Play Store listing icon

Separate from anything in your APK: the Play Console wants a **512 × 512 32-bit PNG** for the
store listing. It is uploaded in the console, not built into the app, and it is not masked the
same way — Play applies its own rounding.

## iOS icons

### One image, every size

Icons live in an asset catalog: `ios/AwesomeApp/Images.xcassets/AppIcon.appiconset/`, described
by `Contents.json`. Since Xcode 14 the catalog accepts a **single 1024 × 1024 PNG** and Xcode
generates every other size at build time. Older tutorials listing twenty filenames from 20×20 up
are describing a workflow you no longer need.

Hard requirements for the 1024 image, all of which App Store Connect enforces at upload:

- **PNG**, 1024 × 1024 pixels, at 72 dpi.
- **No alpha channel and no transparency.** This is the single most common upload rejection.
- **No rounded corners.** iOS applies the mask; baking one in gives you a double-rounded icon.

Strip the alpha channel if your export tool adds one:

```bash
# Verify: this prints the colour type. 6 means RGBA (has alpha), 2 means RGB.
sips -g hasAlpha icon-1024.png

# Remove it.
sips -s format png --setProperty hasAlpha false icon-1024.png --out icon-1024-noalpha.png
```

### Appearance variants and Icon Composer

iOS 18 added **light, dark and tinted** appearance variants, supplied as additional 1024 × 1024
images in the same app icon set. Xcode 26 adds **Icon Composer**, which produces a single
`.icon` file describing a layered icon, and generates the appearance variants from it rather
than having you supply each one.

> [!NOTE] Check the Icon Composer workflow against your Xcode version
> Icon Composer and the `.icon` file format are new in Xcode 26, and the exact project
> integration (drag the `.icon` into the project, then select it under **Target → General → App
> Icons and Launch Screen**) is the part most likely to have changed by the time you read this.
> The asset-catalog route with a single 1024 × 1024 PNG still works and is the safer default if
> you are not adopting the layered icon design. Confirm against Xcode's own documentation before
> committing to one.

### A different icon per configuration

Add a second app icon set — for example `AppIcon-Staging` — then set the build setting
per configuration:

| Build setting | Configuration | Value |
| --- | --- | --- |
| `ASSETCATALOG_COMPILER_APPICON_NAME` | `Debug`, `Release` | `AppIcon` |
| `ASSETCATALOG_COMPILER_APPICON_NAME` | `Debug Staging`, `Release Staging` | `AppIcon-Staging` |

This is the iOS equivalent of an Android flavour source set, and it is why an environment split
usually wants its own build configurations. See
[Build Variants and Flavours](build-variants.md).

## Splash screens

### What Android 12 changed, and why your old splash is wrong

Before Android 12, a splash screen was something you built: a themed activity, or an activity
whose `windowBackground` was a full-screen image, shown until React Native finished loading.

From Android 12 (API 31), **the system draws a splash screen for every app launch**, using the
app icon on the `windowBackground` colour, and it cannot be removed. If your app also shows its
own splash afterwards, users see two — the system's, then yours, often with a flash between them.
That is the symptom that tells you a project is still on a pre-Android-12 approach.

The correct model on Android 12 and above is to **customise the system splash screen** rather than
draw your own, and to hold it on screen until your first frame is ready.

| Theme attribute | What it sets |
| --- | --- |
| `android:windowSplashScreenBackground` | The background colour |
| `android:windowSplashScreenAnimatedIcon` | The centre icon (static drawable or animated vector) |
| `android:windowSplashScreenIconBackgroundColor` | A circle behind the icon, for contrast |
| `android:windowSplashScreenAnimationDuration` | Animation length in milliseconds |
| `android:windowSplashScreenBrandingImage` | An optional image at the bottom edge |
| `android:postSplashScreenTheme` | The theme to switch to once the splash is dismissed |

The icon geometry mirrors adaptive icons:

- **With** an icon background: the icon is **240 × 240 dp**, artwork inside a **160 dp** circle.
- **Without** an icon background: the icon is **288 × 288 dp**, artwork inside a **192 dp** circle.
- An animated vector drawable uses a **432 dp** canvas with a **288 dp** visible area.

> [!WARNING] Google advises against the branding image
> `windowSplashScreenBrandingImage` exists, and Android's own guidance discourages using it. It is
> listed here so you recognise it, not as a recommendation.

`androidx.core:core-splashscreen` backports the API to older releases, so one implementation
covers your whole `minSdk` 24 range instead of two code paths.

### iOS launch screens

iOS has always had a launch screen and it works differently in an important way: it is a
**storyboard rendered before your app runs**, so it cannot contain images loaded at runtime,
cannot run code, and cannot be animated. It exists to make launch feel instant, not to show a
brand animation.

A React Native 0.87 project ships `ios/AwesomeApp/LaunchScreen.storyboard`, referenced from
`Info.plist` via `UILaunchStoryboardName`. Static launch images are long gone; the storyboard (or
the `UILaunchScreen` dictionary) is the only supported route.

Keep it to a background colour and a centred logo. A storyboard that tries to replicate your
first screen looks wrong on every device size you did not test.

### Doing both with `react-native-bootsplash`

Writing the Android 12 splash theme, the storyboard, and every density of the splash logo by hand
is a long afternoon. `react-native-bootsplash` generates all of it from one logo file and gives
you a `hide()` call for the handover to JavaScript.

Verified on 2026-09-12: **`react-native-bootsplash@7.3.2`**, `peerDependencies` of `react: *` and
`react-native: *`. It declares a `codegenConfig` TurboModule spec (`RNBootSplashSpec`), so it is a
New Architecture module rather than an interop shim, and its README states it follows the React
Native releases support policy — the latest version plus the two previous minor series, which
covers 0.87.

```bash
npm install react-native-bootsplash
cd ios && bundle exec pod install
```

Generate the assets from a single logo. The CLI writes the Android drawables and theme, the iOS
storyboard, and a `manifest.json` your JavaScript can read:

```bash
npx react-native-bootsplash generate assets/logo.svg \
  --platforms=android,ios \
  --background=FFFFFF \
  --logo-width=100 \
  --assets-output=assets/bootsplash \
  --flavor=main
```

`--flavor` writes into `android/app/src/<flavor>/res`, so run it once per flavour when each
environment has its own splash.

:::tabs
@tab Android
```kotlin title=android/app/src/main/java/com/awesomeapp/MainActivity.kt
import android.os.Bundle
import com.zoontek.rnbootsplash.RNBootSplash

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Must run before super.onCreate, which is when the window is created.
    RNBootSplash.init(this, R.style.BootTheme)
    super.onCreate(savedInstanceState)
  }
}
```

With `react-native-screens` 4.16.0 or newer, set the fragment factory first:

```kotlin title=android/app/src/main/java/com/awesomeapp/MainActivity.kt
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

override fun onCreate(savedInstanceState: Bundle?) {
  supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
  RNBootSplash.init(this, R.style.BootTheme)
  super.onCreate(savedInstanceState)
}
```
@tab iOS
```swift title=ios/AwesomeApp/AppDelegate.swift
import ReactAppDependencyProvider
import RNBootSplash

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {

  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }
}
```
:::

Then hide it once your app is genuinely ready — after the auth check, after the store rehydrates,
after whatever else would otherwise show an empty screen:

```tsx-fragment title=App.tsx
import {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import BootSplash from 'react-native-bootsplash';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      // Restore the session, rehydrate the store, load fonts — whatever must
      // happen before the first screen is correct rather than merely present.
    }

    prepare().finally(async () => {
      await BootSplash.hide({fade: true});
      setReady(true);
    });
  }, []);

  return (
    <View style={{flex: 1}}>{ready ? <Text>Ready</Text> : null}</View>
  );
}
```

> [!WARNING] Hiding the splash in a `useEffect` with no work in it
> `BootSplash.hide()` called immediately just moves the blank frame later. The splash is the only
> tool you have for hiding startup work, so hide it when the work is done, not when the component
> mounts. If nothing needs to happen at startup, that is fine — but then measure, because a blank
> frame usually means something *is* happening.

## Platform differences

| | Android | iOS |
| --- | --- | --- |
| Icon source | Density buckets plus adaptive layers | One 1024 × 1024, Xcode generates the rest |
| Icon masking | Launcher applies an arbitrary mask | System applies a fixed mask |
| Themed icon | `<monochrome>` layer, API 33+ | Light / dark / tinted variants, iOS 18+ |
| Splash mechanism | System splash screen, API 31+; backported by `core-splashscreen` | `LaunchScreen.storyboard`, rendered before the app runs |
| Splash can animate | Yes, via an animated vector drawable | No |
| Per-variant assets | Flavour source sets | `ASSETCATALOG_COMPILER_APPICON_NAME` per configuration |
| Store listing image | 512 × 512 PNG in Play Console | The 1024 icon in the build is used |

## Common patterns

### Badge non-production icons

Give dev and staging a visibly different icon — a corner ribbon, a different background colour.
The cost is one extra export per density; the benefit is that nobody files a production bug from
a staging build.

### Keep the source art, not just the exports

Commit the SVG or the layered source alongside the generated PNGs. Regenerating from a 192 px PNG
because the original is on someone's old laptop is a bad afternoon.

### Regenerate rather than hand-edit

Both `react-native-bootsplash generate` and Xcode's single-size icon slot are idempotent. Treat
the generated resources as build output you happen to commit, and change the input.

### Match the splash background to your first screen

The handover from splash to first frame is visible when the two backgrounds differ. Use the same
colour token for `windowSplashScreenBackground`, the storyboard background, and your root view.

## Performance considerations

The splash screen is the only part of startup where a longer time is sometimes *better* — it hides
work that would otherwise be a blank screen. But it is not free:

- **Do not gate the splash on network calls.** A user on a bad connection sits on your logo until
  a timeout. Gate it on local work only, and let the first screen handle its own loading state.
- **Vector splash icons cost nothing extra.** An animated vector drawable is parsed on the main
  thread before your app runs; keep it short and simple.
- **Icons contribute to install size.** Five densities of two 432 px layers is more than one
  vector drawable. Where your mark is vector art, ship vectors.

## Common mistakes

- **Keeping a pre-Android-12 custom splash activity.** On API 31+ the system splash runs first and
  yours runs second, so users see two. Customise the system splash instead.
- **Putting launcher icons in `drawable-*`.** Density-split builds strip them and the launcher can
  ask for a bucket your build does not include. Use `mipmap-*`.
- **Shipping an adaptive icon and no legacy PNGs.** `minSdk` is 24; API 24 and 25 devices have no
  adaptive icon support and fall back to `mipmap-<density>/ic_launcher.png`.
- **Filling the whole 108 dp adaptive layer.** The launcher masks to 72 dp and only the central
  66 dp is guaranteed. Wrong: logo edge-to-edge. Right: logo inside the 66 dp safe zone.
- **Reusing the colour foreground as the `<monochrome>` layer.** The system discards colour and
  fills every opaque pixel, so a full-colour artwork becomes a solid blob. Supply a silhouette.
- **Uploading an iOS icon with an alpha channel.** App Store Connect rejects the build at upload
  with a message about transparency. Strip it with `sips` before archiving.
- **Baking rounded corners into the iOS icon.** iOS masks it again and you get a visibly
  double-rounded icon.
- **Building twenty iOS icon sizes by hand.** One 1024 × 1024 in the app icon set is enough since
  Xcode 14.
- **Calling `BootSplash.hide()` on mount with no work behind it.** The blank frame simply moves
  later. Hide when your first screen can actually render.
- **Regenerating splash assets for `main` only when you have flavours.** `--flavor` defaults to
  `main`, so the other flavours keep the previous logo and nobody notices until release.

## Related topics

- [Build Variants and Flavours](build-variants.md) — flavour source sets and per-configuration icon names.
- [Environment Configuration](environment-configuration.md) — the other half of making a variant recognisable.
- [Units and Density](../styling/units-and-density.md) — why dp and density buckets exist at all.
- [Startup Time](../performance/startup-time.md) — what the splash screen is hiding.
- [AAB and Play Store Submission](play-store-submission.md) — the 512 × 512 listing icon and store assets.
- [TestFlight and App Store Submission](app-store-submission.md) — where an icon with alpha gets rejected.
- [Release Checklist](release-checklist.md) — the icon and splash checks before you ship.
