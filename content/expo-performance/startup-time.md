---
title: Startup Time and the Splash Screen
description: What happens between tapping the icon and the first real frame in an Expo SDK 57 app, how to measure it, and how to use expo-splash-screen without hiding a slow start.
status: current
toolchain: expo
sdk: 57
---

Startup time is the gap between the user tapping your icon and seeing a usable screen. It is the
first performance number anyone experiences, and the one most often made worse by well-meaning
work at launch.

`expo-splash-screen` (`~57.0.9` on SDK 57) controls when the native splash screen goes away. Used
well, it removes a flash of empty UI. Used badly, it hides a slow start behind a logo and makes
the start feel slower still.

```bash
npx expo install expo-splash-screen
```

## Why it exists / when to use it — and when NOT to

Hold the splash screen when the first screen genuinely cannot render without something async:
custom fonts, a restored auth session, a cached theme. Showing a half-styled screen for 100ms and
then snapping to the real one looks broken.

Do **not** hold the splash screen while you:

- Fetch data from the network. The network can take seconds, or fail. Render the screen with a
  loading state instead.
- Run migrations, warm caches or prefetch images for later screens. Defer that until after the
  first frame.
- Wait for anything with no timeout. A splash screen that never hides is indistinguishable from a
  crash.

## Expo Go vs development build

The splash screen **API** (`preventAutoHideAsync`, `hide`) works in Expo Go. The splash screen
**appearance** — image, background colour, size — is configured through the `expo-splash-screen`
config plugin and baked into the native project at prebuild, so it only changes in a build you
produce yourself. Startup **timing** must be measured in a release build, never in Expo Go.

## Basic example

```tsx title=app/_layout.tsx
import {useFonts} from 'expo-font';
import {Stack} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {useEffect} from 'react';

// Call at module scope, not inside a component: by the time a component
// renders, the splash screen may already have been hidden automatically.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: require('../assets/fonts/Inter.ttf'),
  });

  useEffect(() => {
    // Hide on error too. A missing font should degrade to the system font,
    // not trap the user on the splash screen.
    if (fontsLoaded || fontError) {
      SplashScreen.hide();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <Stack />;
}
```

## How it works

### The phases of a cold start

1. **Native process start.** The OS launches the process and loads the app binary and native
   libraries. You influence this mostly by how many native modules you link.
2. **JavaScript load.** Hermes loads the bundle. On a release build this is precompiled
   **bytecode** embedded in the binary, so there is no parse-and-compile step at launch — see
   [Hermes](hermes.md). Bundle size still matters: more bytecode to map and more modules to
   initialise.
3. **Module initialisation.** Every top-level `import` runs its module body. A heavy import in
   your root layout runs before anything renders.
4. **First render.** React renders the root layout and first route.
5. **Splash hide.** The native splash screen stays until the first frame is ready, or until you
   call `hide()` if you called `preventAutoHideAsync()`.

Holding the splash screen does not make any of phases 1–4 faster. It only decides what the user
looks at while they happen.

### The API surface

Verified from the installed `expo-splash-screen@57.0.9` types:

| Function | Signature | Notes |
| --- | --- | --- |
| `preventAutoHideAsync` | `() => Promise<boolean>` | Call at module scope, without awaiting. |
| `hide` | `() => void` | Hides immediately. |
| `hideAsync` | `() => Promise<void>` | Kept for backwards compatibility. |
| `setOptions` | `(options: SplashScreenOptions) => void` | `duration` (ms, default 400) and `fade` (iOS only, default `false`). |

```ts title=lib/splash.ts
import * as SplashScreen from 'expo-splash-screen';

// A short fade reads as intentional; the default hide can look abrupt on iOS.
SplashScreen.setOptions({duration: 250, fade: true});
```

### Configure the appearance in app config

The SDK 57 default template configures the splash screen through the plugin:

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ]
    ]
  }
}
```

A plugin change only takes effect in a new native build. See
[Fonts and Splash Screens](../expo-sdk/fonts-and-splash-screens.md).

## Platform differences

:::tabs
@tab Android
Android 12 and later use the system splash screen API: an icon on a background colour, shown by
the OS before your process has drawn anything. You cannot replace it with an arbitrary
full-screen image.

Measure cold start with `adb` against a **release** build. `-W` waits for launch and prints
timing, including total time to the first drawn frame of the activity:

```bash
adb shell am force-stop com.example.myapp
adb shell am start -W -n com.example.myapp/.MainActivity
```

Replace the package name with your `android.package`. Note that the activity's first frame is the
splash screen, not your first React screen — add your own mark for "first screen ready".
@tab iOS
iOS shows the launch screen storyboard generated from your config. `fade` in `setOptions` is
iOS-only.

Measure with Xcode Instruments' App Launch template against a Release build on a physical device
(requires macOS). Simulator launch times are not representative.
:::

## Common patterns

### Defer non-critical work until after the first frame

`requestIdleCallback` is available as a global on React Native 0.86:

```ts title=lib/deferred.ts
export function afterFirstFrame(work: () => void): void {
  // Runs when the JS thread is idle, so it does not compete with the first render.
  requestIdleCallback(() => work());
}
```

Use it for analytics initialisation, cache warming and prefetching the images of screens the
user has not opened yet.

### Keep the root layout's imports light

Everything imported by `app/_layout.tsx` is initialised before the first frame. A charting
library, a large date-locale bundle, or an SDK that does work at import time all land in startup.
Import them from the screen that uses them instead.

### Always have a timeout on anything that gates `hide()`

```ts title=lib/withTimeout.ts
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
```

## Performance considerations

- Startup is the measurement most sensitive to build type. A development build loads JavaScript
  from Metro over the network; a release build loads embedded bytecode. Never compare the two.
- Removing an unused native dependency can cut native start time; removing an unused JS
  dependency cuts bundle size and module initialisation. Measure both — see
  [Bundle Size](bundle-size.md).
- React Compiler (on by default in the SDK 57 template) does not speed up startup; it reduces
  re-renders after the first render.

## Common mistakes

- **Calling `preventAutoHideAsync()` inside a component or effect.** It may run after the splash
  screen has already hidden. Call it at module scope.
- **Only hiding on success.** Wrong: `if (fontsLoaded) hide()`. Right: hide when loaded **or**
  errored, and render a fallback.
- **Holding the splash screen for a network request.** A slow network then looks like a hung app.
  Render a loading state instead.
- **Measuring startup in Expo Go or a development build.** Neither loads your release bytecode.
- **Editing the splash image and expecting the running app to change.** Plugin configuration is
  applied at prebuild; you need a new build.
- **Doing heavy work at import time in the root layout.** It runs before the first frame, no
  matter how quickly you hide the splash screen.

## Related topics

- [Measuring Before Optimising](measuring-first.md) — which build to measure, and how.
- [Hermes](hermes.md) — why a release build does not parse JavaScript at launch.
- [Bundle Size and Tree Shaking](bundle-size.md) — less code to load and initialise.
- [Fonts and Splash Screens](../expo-sdk/fonts-and-splash-screens.md) — configuring the splash screen and fonts.
- [Layouts](../expo-router/layouts.md) — the root layout where this code lives.
- [App Icons and Splash Screens](../expo-build-and-release/icons-and-splash-screens.md) — release assets.
