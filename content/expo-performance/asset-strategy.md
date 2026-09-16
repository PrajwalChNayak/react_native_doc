---
title: Asset Strategy
description: Deciding which images, fonts and data ship inside an Expo SDK 57 app, which are embedded at build time, and which are fetched at runtime — and what each choice costs.
status: current
toolchain: expo
sdk: 57
---

Every image, font, sound and data file in your app is either **bundled** with it, **embedded** in
the native binary at build time, or **fetched** at runtime. Each choice moves a cost — app size,
startup time, update size, offline behaviour — somewhere different.

The relevant SDK 57 packages are `expo-asset@~57.0.17` and `expo-font@~57.0.4`.

```bash
npx expo install expo-asset expo-font
```

## Why it exists / when to use it — and when NOT to

Think about asset strategy when:

- The app download is large and you do not know why.
- OTA updates are large, or slow to apply.
- The first screen shows a flash of missing images or system fonts.
- The app must work offline.

It is not worth a strategy for a handful of small icons. Bundle them and move on.

## Expo Go vs development build

`require()`d assets and the `useAssets` / `useFonts` hooks work in Expo Go. **Embedding** assets
through the `expo-asset` or `expo-font` config plugins changes the native project at prebuild, so
it only takes effect in a development or release build you create yourself.

## Basic example

A bundled image referenced with `require`:

```tsx title=components/EmptyState.tsx
import {Image} from 'expo-image';
import {Text, View} from 'react-native';

export function EmptyState() {
  return (
    <View style={{alignItems: 'center', padding: 24}}>
      {/* Bundled: always available offline, but part of every build and update. */}
      <Image source={require('../assets/images/empty.png')} style={{width: 160, height: 160}} />
      <Text>Nothing here yet</Text>
    </View>
  );
}
```

## How it works

### Three ways an asset reaches the device

| Strategy | How | Available offline | Cost paid in |
| --- | --- | --- | --- |
| **Bundled with JS** | `require('./x.png')` | Yes | App size, and OTA update size when it changes |
| **Embedded at build time** | `expo-asset` / `expo-font` config plugin | Yes, immediately | App size; needs a new native build to change |
| **Fetched at runtime** | A URL rendered with `expo-image` | Only once cached | Network on first view |

Metro recognises asset extensions including images (`png`, `jpg`, `webp`, `gif`, `svg`), and Expo's
Metro config adds `heic`, `avif` and `db` — the same list `jest-expo`'s preset mirrors so tests can
import them.

### Loading bundled assets before use

`useAssets` downloads (in development) or locates (in release) a set of bundled assets and tells you
when they are ready. Signature from the installed types:
`useAssets(moduleIds: number | number[]): [Asset[] | undefined, Error | undefined]`.

```tsx title=components/Onboarding.tsx
import {useAssets} from 'expo-asset';
import {Image} from 'expo-image';
import {ActivityIndicator} from 'react-native';

export function Onboarding() {
  const [assets, error] = useAssets([
    require('../assets/images/onboarding-1.png'),
    require('../assets/images/onboarding-2.png'),
  ]);

  if (error) {
    return null;
  }
  if (!assets) {
    return <ActivityIndicator />;
  }
  return <Image source={assets[0]} style={{width: '100%', height: 320}} />;
}
```

> [!NOTE]
> `Asset.downloadAsync()` stores files in the caches directory. The installed type docs state there
> is no guarantee they persist between sessions — the OS may clear that folder.

### Embedding at build time with config plugins

Both `expo-asset` and `expo-font` accept an array in their config plugin options — `assets` and
`fonts` respectively — to copy files into the native project during prebuild:

```json title=app.json
{
  "expo": {
    "plugins": [
      ["expo-font", {"fonts": ["./assets/fonts/Inter.ttf"]}],
      ["expo-asset", {"assets": ["./assets/images/onboarding-1.png"]}]
    ]
  }
}
```

An embedded font is available at launch without a `useFonts` load, which removes one reason to hold
the splash screen. The cost: changing that font requires a new native build, not an OTA update. See
[Fonts and Splash Screens](../expo-sdk/fonts-and-splash-screens.md).

> [!DANGER] Plugin changes regenerate native directories
> Plugins are applied by `npx expo prebuild`, which in SDK 57 **clears and regenerates** `ios/` and
> `android/` by default. Hand-edits to those directories are lost. See
> [expo prebuild](../expo-core-concepts/prebuild.md).

## Common patterns

### A decision rule

- **Needed on the first screen, rarely changes** (logo, brand font): embed at build time.
- **Needed offline, changes with app releases** (onboarding art, empty states): bundle with `require`.
- **Large, numerous, or content-driven** (product photos, avatars, articles): fetch at runtime with
  `expo-image` and a sensible cache policy.
- **Large data sets:** never `import` a big JSON file into JavaScript. It lands in the bundle and in
  every update. Fetch it, or ship it as a file asset (for example an SQLite `.db`).

### Right-size images before they ship

Export bundled images at the resolutions you display them, and prefer modern formats (`webp`, `avif`)
where your target platforms decode them. An oversized PNG costs app size **and** decode time.

### Watch update size

Bundled assets that change are re-downloaded by users with the update. If marketing art changes
weekly, it belongs on a server, not in the bundle. See [EAS Update](../expo-eas/update.md).

## Platform differences

:::tabs
@tab iOS
Embedded fonts are registered through the generated `Info.plist` during prebuild. The `expo-font`
plugin also accepts an iOS-specific `fonts` list.
@tab Android
Embedded fonts are copied into the Android project's font resources. The `expo-font` plugin accepts
an Android-specific `fonts` list, including object definitions for XML font families with a custom
family name.
:::

## Performance considerations

- Every bundled asset increases the download size of the app from the store.
- `useFonts` and `useAssets` at the root delay the first render. Embedding fonts removes that wait.
- Remote images cost nothing at install, and a network round trip on first view. Prefetch the next
  screen's images, not the whole catalogue — see [Image Performance](image-performance.md).

## Common mistakes

- **Importing large JSON into the bundle.** It is loaded as part of the JavaScript and shipped in
  every update. Fetch it or ship it as a file.
- **Embedding assets that change often.** Each change needs a new store build. Keep them remote or
  bundled.
- **Editing plugin `assets`/`fonts` and expecting a running dev server to pick it up.** Plugins apply
  at prebuild; build again.
- **Relying on `Asset.downloadAsync()` output persisting.** It lives in the caches directory, which
  the OS can clear.
- **Shipping print-resolution images.** Resize to display size before bundling.
- **Installing SDK packages without `npx expo install`.** You get versions built for another SDK.

## Related topics

- [Image Performance with expo-image](image-performance.md) — remote images, caching and decode size.
- [Bundle Size and Tree Shaking](bundle-size.md) — what ends up in the JavaScript bundle.
- [Startup Time and the Splash Screen](startup-time.md) — fonts and assets that gate the first frame.
- [Fonts and Splash Screens](../expo-sdk/fonts-and-splash-screens.md) — the `expo-font` API.
- [EAS Update](../expo-eas/update.md) — assets and update size.
- [What OTA Updates May Not Change](../expo-eas/ota-limits-and-policy.md) — embedded assets need a native build.
