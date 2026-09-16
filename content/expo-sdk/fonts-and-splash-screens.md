---
title: Fonts and Splash Screens
description: Loading custom fonts with expo-font at build time or runtime, and controlling the native splash screen with expo-splash-screen so the two do not fight each other.
status: current
toolchain: expo
sdk: 57
---

Fonts and splash screens are one topic because they share one problem: the first frame. A custom
font that is not ready yet renders as the system font and then reflows; a splash screen hidden too
early shows that reflow to the user. `expo-font` and `expo-splash-screen` are the two halves of
getting the first frame right.

```bash
npx expo install expo-font expo-splash-screen
```

On SDK 57 that resolves `expo-font@~57.0.4` and `expo-splash-screen@~57.0.9`. Always use
`npx expo install` — it reads `expo/bundledNativeModules.json` and picks the SDK-matched version,
which a plain package-manager install does not. See
[expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

React Native has no built-in way to register a font family at runtime, and no API for the native
launch screen. `expo-font` covers both build-time linking (the config plugin) and runtime loading
(`loadAsync` / `useFonts`). `expo-splash-screen` gives you `preventAutoHideAsync` and `hideAsync`
so you decide when the splash disappears.

Prefer the **config plugin** for fonts you ship with the app. It links the font into the native
project, so the family is available on the very first frame with no loading state at all.

Reach for **runtime loading** only when the font is not known at build time — a font downloaded per
tenant in a white-label app, or one chosen from a remote config.

Do not use `expo-splash-screen` to build a branded animated intro. It controls the native launch
screen, which is a static image by design on both platforms. An animated intro is a normal React
component you render after the splash is hidden.

## Expo Go vs development build

| Package | Expo Go | Notes |
| --- | --- | --- |
| `expo-font` runtime loading (`useFonts`, `loadAsync`) | Works | Nothing native changes. |
| `expo-font` config plugin (`fonts` array) | **Needs a development build** | The plugin copies font files into the native project at prebuild. Expo Go's binary has no idea your fonts exist. |
| `expo-splash-screen` JS API (`preventAutoHideAsync`, `hideAsync`, `setOptions`) | Works | Expo Go shows its own splash image, not yours. |
| `expo-splash-screen` config plugin (your image, background colour) | **Needs a development build** | Same reason: the image is baked into the native project. |

The pattern is consistent and worth internalising: **any config plugin that puts an asset or a key
into the native project requires a build you produce yourself.** Testing your real splash image or
a plugin-linked font in Expo Go is not possible. See
[Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md).

## Basic example

### Fonts at build time (recommended)

Put the font files somewhere in your project, then list them in the plugin:

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "fonts": ["./assets/fonts/Inter-Regular.ttf", "./assets/fonts/Inter-Bold.ttf"]
        }
      ]
    ]
  }
}
```

Rebuild, and the family is usable immediately:

```tsx title=app/index.tsx
import {StyleSheet, Text, View} from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Ready on the first frame</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  // The family name comes from the font file's internal name on iOS and from
  // the file name on Android — see "Platform differences" below.
  heading: {fontFamily: 'Inter-Bold', fontSize: 24},
});
```

### Fonts at runtime

```tsx title=app/_layout.tsx
import {useFonts} from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {useEffect} from 'react';
import {Text} from 'react-native';

// Called at module scope so the splash is held from the very first moment the
// JS bundle evaluates, not after the first render.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  });

  useEffect(() => {
    // Hide on success OR failure. If you only hide on success, a corrupt font
    // file leaves the user staring at the splash screen forever.
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return <Text style={{fontFamily: 'Inter-Regular'}}>Loaded</Text>;
}
```

`useFonts(map)` returns `[loaded: boolean, error: Error | null]`. That is the whole API — there is
no progress value and no retry.

## How it works

### The `expo-font` API surface

| Export | Signature | Notes |
| --- | --- | --- |
| `useFonts` | `(map: string \| Record<string, FontSource>) => [boolean, Error \| null]` | Hook form of `loadAsync`. |
| `loadAsync` | `(familyOrMap, source?) => Promise<void>` | Imperative form. Wrap in `try`/`catch`. |
| `isLoaded` | `(fontFamily: string) => boolean` | Synchronous. Includes plugin-linked fonts. |
| `isLoading` | `(fontFamily: string) => boolean` | Synchronous. |
| `getLoadedFonts` | `() => string[]` | Every family available, plugin-linked and runtime-loaded. |

`FontSource` is a string URL, a `require()`d number, an `expo-asset` `Asset`, or a `FontResource`
object (`{uri, display, default, testString}`). `FontDisplay` (`AUTO`, `SWAP`, `BLOCK`,
`FALLBACK`, `OPTIONAL`) mirrors CSS `font-display` and only has an effect on web.

`getLoadedFonts()` is the fastest way to debug a font that "does not work": if the family name you
are styling with is not in that array, the name is wrong, not the file.

### The `expo-splash-screen` API surface

| Export | Signature |
| --- | --- |
| `preventAutoHideAsync` | `() => Promise<boolean>` |
| `hideAsync` | `() => Promise<void>` |
| `hide` | `() => void` |
| `setOptions` | `(options: {duration?: number; fade?: boolean}) => void` |

`setOptions` is the only way to get a fade-out; call it before `hideAsync`:

```ts title=lib/splash.ts
import * as SplashScreen from 'expo-splash-screen';

export async function finishBoot(): Promise<void> {
  // duration is in milliseconds and only applies when fade is true.
  SplashScreen.setOptions({duration: 400, fade: true});
  await SplashScreen.hideAsync();
}
```

Without `preventAutoHideAsync()`, the native splash hides itself as soon as the first React frame
is committed — which is usually before your fonts, your auth check or your database migration have
finished.

> [!WARNING] `preventAutoHideAsync` must run early
> Call it at module scope in your root layout, not inside a `useEffect`. By the time an effect
> runs, the first frame has already been committed and the splash may already be gone.

## Native configuration

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "fonts": ["./assets/fonts/Inter-Regular.ttf"],
          "ios": {
            "fonts": ["./assets/fonts/Inter-Italic.ttf"]
          }
        }
      ],
      [
        "expo-splash-screen",
        {
          "image": "./assets/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff",
          "dark": {
            "image": "./assets/splash-icon-dark.png",
            "backgroundColor": "#000000"
          },
          "ios": {
            "tabletImage": "./assets/splash-icon-tablet.png"
          }
        }
      ]
    ]
  }
}
```

The iOS font plugin links files listed under `ios.fonts` (or the top-level `fonts`) into the
target's resources and adds them to `UIAppFonts`. **The family name iOS uses is the font's internal
PostScript family name, not the file name.** A file called `Inter-Bold.ttf` whose internal family
is `Inter` must be styled as `fontFamily: 'Inter'` with `fontWeight: '700'`.

iOS splash options accept `image`, `imageWidth`, `resizeMode` (`'cover' | 'contain'`),
`backgroundColor`, `tabletImage`, `tabletBackgroundColor`, `dark`, and the transitional
`enableFullScreenImage_legacy`.

@tab Android

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "android": {
            "fonts": [
              {
                "fontFamily": "Inter",
                "fontDefinitions": [
                  {"path": "./assets/fonts/Inter-Regular.ttf", "weight": 400},
                  {"path": "./assets/fonts/Inter-Bold.ttf", "weight": 700},
                  {"path": "./assets/fonts/Inter-Italic.ttf", "weight": 400, "style": "italic"}
                ]
              }
            ]
          }
        }
      ],
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff",
          "android": {
            "image": "./assets/splash-icon.png",
            "imageWidth": 200,
            "resizeMode": "contain",
            "backgroundColor": "#ffffff"
          }
        }
      ]
    ]
  }
}
```

Android's font plugin accepts either a plain array of paths (each file becomes its own family,
named after the file) **or** the object form above, which generates an XML font family so a single
`fontFamily: 'Inter'` responds correctly to `fontWeight` and `fontStyle`. The object form is what
you want for a multi-weight family.

Android splash options additionally accept per-density images (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`,
`xxxhdpi`), a `drawable` object (`{icon, darkIcon}`), and `resizeMode: 'native'`.
:::

> [!DANGER] The plugin edits native directories
> These plugins take effect during `npx expo prebuild`, which **clears and regenerates** `ios/` and
> `android/` in SDK 57. Any hand edits in those directories are lost. See
> [expo prebuild](../expo-core-concepts/prebuild.md) before you run it.

## Platform differences

| Concern | iOS | Android |
| --- | --- | --- |
| Family name source | Font file's internal PostScript family name | File name (array form) or your `fontFamily` (object form) |
| Multi-weight family from one name | Native — iOS resolves weights within a family | Only via the object form's generated XML font family |
| Splash resize modes | `'cover'`, `'contain'` | `'cover'`, `'contain'`, `'native'` |
| Per-density splash images | Not applicable | `mdpi`…`xxxhdpi` keys |
| Tablet-specific splash | `tabletImage`, `tabletBackgroundColor` | Not available |

The family-name mismatch is the single most common font bug. On Android the array form gives you
one family per file, so `Inter-Bold.ttf` becomes `fontFamily: 'Inter-Bold'`. On iOS the same file
is usually `fontFamily: 'Inter'` plus `fontWeight: '700'`. A style block that works on one platform
silently falls back to the system font on the other.

## Common patterns

### Holding the splash for more than fonts

```tsx title=app/_layout.tsx
import {useFonts} from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {useCallback, useEffect, useState} from 'react';
import {View} from 'react-native';

void SplashScreen.preventAutoHideAsync();

async function restoreSession(): Promise<void> {
  // read a token, run a migration, fetch remote config…
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  });
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    restoreSession()
      // A failed session restore must not block the app forever — record it and move on.
      .catch((e: unknown) => console.warn('session restore failed', e))
      .finally(() => setSessionReady(true));
  }, []);

  const ready = (fontsLoaded || fontError !== null) && sessionReady;

  // onLayout fires after the first real frame is laid out, so hiding here means
  // the user never sees an empty white flash between splash and content.
  const onLayout = useCallback(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return <View style={{flex: 1}} onLayout={onLayout} />;
}
```

### Loading a font you only learn about at runtime

```ts title=lib/brandFont.ts
import * as Font from 'expo-font';

export async function loadBrandFont(url: string): Promise<boolean> {
  if (Font.isLoaded('BrandFont')) {
    return true;
  }
  try {
    await Font.loadAsync({BrandFont: url});
    return true;
  } catch {
    // Fall back to the system font rather than failing the screen.
    return false;
  }
}
```

### Checking what actually loaded

```ts title=lib/debugFonts.ts
import * as Font from 'expo-font';

export function logFonts(): void {
  // If your family name is not in here, the name is wrong — not the file.
  console.log(Font.getLoadedFonts());
}
```

## Performance considerations

- **Build-time beats runtime, always.** A plugin-linked font has zero loading state and no network
  or disk read on the first frame. Runtime loading adds at least one asset read before you can
  render text.
- **Ship the weights you use, and only those.** Each TTF/OTF is typically 100–300 KB, and they are
  not compressed further in the app binary. Four weights plus italics is a megabyte.
- **Do not hold the splash on network work.** The splash is a hard block on interactivity. Anything
  that can fail or hang — remote config, a feature-flag fetch — belongs behind a rendered loading
  state, not in front of one.
- **`useFonts` re-renders once.** It does not poll. If your root layout is expensive to render,
  that single re-render is still a full tree render — keep the root layout thin.

See [Startup Time](../expo-performance/startup-time.md).

## Common mistakes

- **Hiding the splash only on success.** Wrong: `if (loaded) hideAsync()`. Right:
  `if (loaded || error) hideAsync()`. A missing or corrupt font file otherwise pins the user on the
  splash screen with no way out.
- **Calling `preventAutoHideAsync` inside `useEffect`.** By then the first frame is committed and
  the splash may already have auto-hidden. Call it at module scope.
- **Using the file name as the iOS family name.** iOS uses the font's internal family name.
  `getLoadedFonts()` tells you the truth.
- **Using the Android array form for a multi-weight family.** Each file becomes its own family, so
  `fontWeight: '700'` on `fontFamily: 'Inter'` does nothing. Use the object form with
  `fontDefinitions`.
- **Expecting your splash image in Expo Go.** Expo Go shows its own. You need a development build
  to see yours.
- **Editing `app.json` and restarting Metro.** Plugin changes apply at prebuild. Restarting the
  bundler does not rebuild the native project.
- **Awaiting `preventAutoHideAsync` at module scope with a floating promise.** It returns a promise;
  an unhandled rejection is now a `console.error` in React Native 0.82 and later. Use `void` or a
  `.catch`.

## Related topics

- [Icons and Splash Screens](../expo-build-and-release/icons-and-splash-screens.md) — the store-facing asset set.
- [Startup Time](../expo-performance/startup-time.md) — what the splash screen is hiding.
- [app.json and app.config.js](../expo-core-concepts/app-config.md) — where `plugins` entries live.
- [expo prebuild](../expo-core-concepts/prebuild.md) — how plugin config reaches the native projects.
- [Expo Go vs Development Builds](../expo-core-concepts/expo-go-vs-development-builds.md) — why plugin-driven assets need a build.
- [Layouts](../expo-router/layouts.md) — where the root layout that holds the splash lives.
