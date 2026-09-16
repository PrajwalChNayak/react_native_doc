---
title: Images with expo-image
description: expo-image replaces the core Image component with caching, placeholders, transitions and a shared-reference API — plus the SDK 57 cache read/write functions.
status: current
toolchain: expo
sdk: 57
---

`expo-image` is a drop-in replacement for React Native's core `Image` that adds a real disk and
memory cache, blurhash and thumbhash placeholders, cross-fade transitions, and a native image
reference type you can pass around without re-decoding. On SDK 57 it is `expo-image@~57.0.5`.

```bash
npx expo install expo-image
```

`npx expo install` resolves the version that matches your installed SDK from
`expo/bundledNativeModules.json`. A plain package-manager install fetches `latest`, which is
routinely built for a different SDK — and native module mismatches fail at runtime, not at
install time. See [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md).

## Why it exists / when to use it — and when NOT to

React Native's core `Image` has no meaningful disk cache you can control, no placeholder story,
and no way to hold a decoded image in memory and hand it to another view. `expo-image` gives you
all three, backed by SDWebImage on iOS and Glide on Android.

Use it for essentially every remote image, and for any local image you show in a list.

Do **not** reach for it when:

- **You need the image as pixel data for processing.** `expo-image` hands you an opaque
  `ImageRef` (a `Drawable` on Android, a `UIImage` on iOS), not a buffer. Decode it yourself.
- **You are rendering SVG.** Use `react-native-svg` (`15.15.4` on SDK 57 — a different version
  from the CLI half of this site).
- **You only ever show one bundled `require()`d asset.** Core `Image` is fine and costs you no
  extra native code.

## Expo Go vs development build

**Works in Expo Go.** `expo-image` ships in the Expo Go module set, and none of its features
require a config-plugin change on a default project.

The one exception is the config plugin option below (`disableLibdav1d`). That changes how the
native iOS target links, so it only takes effect in a build you produce yourself — a development
build or a release build. Setting it changes nothing about Expo Go.

## Basic example

```tsx title=components/Avatar.tsx
import {Image} from 'expo-image';
import {StyleSheet, View} from 'react-native';

// A tiny blurhash shown while the real image loads. Generate one per image
// server-side, or with Image.generateBlurhashAsync at build time.
const PLACEHOLDER = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export function Avatar({uri}: {uri: string}) {
  return (
    <View style={styles.frame}>
      <Image
        source={{uri}}
        placeholder={{blurhash: PLACEHOLDER}}
        contentFit="cover"
        // Cross-dissolve for 200ms once the real image decodes. Without this the
        // placeholder is replaced in a single frame, which reads as a flicker.
        transition={200}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {width: 64, height: 64, borderRadius: 32, overflow: 'hidden'},
  image: {width: '100%', height: '100%'},
});
```

## How it works

### `source` accepts more than a URL

`source` takes a URL string, a `require()`d number, an `ImageSource` object, an array of sources,
an `ImageRef`, or an `sf:` prefixed SF Symbol name on iOS. When you pass an array, the source that
best fits the container and screen scale is chosen — so supply `width`, `height` and `scale`.

The `ImageSource` object is where the interesting fields live: `headers` for authenticated images,
`cacheKey` to decouple the cache entry from the URL, and `blurhash` / `thumbhash` for
placeholders.

### Caching is a policy, not a boolean

`cachePolicy` is one of `'none'`, `'disk'`, `'memory'` or `'memory-disk'`. The default is `'disk'`.

| Policy | Behaviour |
| --- | --- |
| `'none'` | Never cached. Every render refetches. |
| `'disk'` | Written to and read from the disk cache. The default. |
| `'memory'` | Held in the in-memory cache only; gone on process restart. |
| `'memory-disk'` | Both. The fastest repeat render, at the cost of memory pressure. |

Cache entries are keyed by the source URL unless you set `cacheKey`. That matters when a URL
carries a signature or expiry query parameter: without a stable `cacheKey`, every re-signed URL is
a cache miss.

### Static methods on `Image`

All of the following are statics on the `Image` class, not hooks:

| Method | Signature |
| --- | --- |
| `prefetch` | `(urls: string \| string[], options?: ImagePrefetchOptions) => Promise<boolean>` |
| `clearMemoryCache` | `() => Promise<boolean>` |
| `clearDiskCache` | `() => Promise<boolean>` |
| `getCachePathAsync` | `(cacheKey: string) => Promise<string \| null>` |
| `loadAsync` | `(source, options?: ImageLoadOptions) => Promise<ImageRef>` |
| `generateBlurhashAsync` | `(source, numberOfComponents) => Promise<string \| null>` |
| `generateThumbhashAsync` | `(source) => Promise<string>` |
| `configureCache` | `(config: ImageCacheConfig) => void` — iOS only |

`prefetch` resolves to `false` as soon as **any** image in the batch fails, even if the rest
succeeded. Do not read a `true` as "all cached" without checking.

### New in SDK 57: `writeToCacheAsync` and `readFromCacheAsync`

These two let you seed and read the disk cache directly, without a network fetch. Verified
signatures from the installed package:

```ts title=lib/imageCache.ts
import {Image} from 'expo-image';
import type {ImageRef} from 'expo-image';

// source is a local file URI or an ImageRef; cacheKey is what you later put in
// the `cacheKey` field of the image source.
export async function seedCache(localUri: string, cacheKey: string): Promise<void> {
  await Image.writeToCacheAsync(localUri, cacheKey);
}

// Resolves to null when nothing is cached under that key.
export async function readCache(cacheKey: string): Promise<ImageRef | null> {
  return Image.readFromCacheAsync(cacheKey);
}
```

The use case is an image you already have on the device — one returned by `expo-image-picker`, or
downloaded with `expo-file-system` — that you want the image view to serve from cache rather than
re-fetching over the network.

> [!WARNING] Writing an `ImageRef` flattens animation
> `writeToCacheAsync` accepts a local file URI **or** an `ImageRef`. Caching an animated image
> (GIF, APNG, animated WebP) from an `ImageRef` stores a single frame, because the reference holds
> the decoded image rather than the original encoded bytes. To seed an animated image losslessly,
> pass its local file URI.

Both are Android and iOS only. On web they are not available.

### `useImage` for a decoded reference

`useImage(source, options?, dependencies?)` returns an `ImageRef | null` — `null` until the first
successful load. The reference carries `width`, `height`, `scale`, `mediaType` (iOS) and
`isAnimated`, so you can size a view from the real image dimensions.

```tsx title=components/NaturalSizeImage.tsx
import {Image, useImage} from 'expo-image';
import {Text} from 'react-native';

export function NaturalSizeImage({uri}: {uri: string}) {
  // maxWidth is not cosmetic: loading a very large image with no size constraint
  // can exhaust memory and crash the app.
  const image = useImage(uri, {
    maxWidth: 800,
    onError(error) {
      console.error('Image failed to load', error.message);
    },
  });

  if (!image) {
    return <Text>Loading…</Text>;
  }

  return (
    <Image
      source={image}
      style={{width: image.width / image.scale, height: image.height / image.scale}}
    />
  );
}
```

## Native configuration

`expo-image` needs no permissions and no usage-description strings. Its config plugin exists only
for one iOS linking option.

:::tabs
@tab iOS

```json title=app.json
{
  "expo": {
    "plugins": [
      [
        "expo-image",
        {
          "disableLibdav1d": false
        }
      ]
    ]
  }
}
```

`disableLibdav1d` (default `false`) skips linking the bundled libdav1d AV1 decoder. Set it to
`true` only when another dependency already provides libdav1d and the duplicate symbols break
your build. Turning it on drops AVIF decoding support.

`configureCache({maxDiskSize, maxMemoryCost, maxMemoryCount})` is iOS-only and maps onto
SDWebImage's `SDImageCacheConfig`. All three default to `0`, meaning no limit.

@tab Android

No plugin configuration, no manifest permissions. `configureCache` is a no-op — the Glide-backed
cache is not configurable from JavaScript.
:::

> [!NOTE] Plugin changes need a rebuild
> A `plugins` entry is applied during prebuild, so it only affects a binary you build after the
> change. Editing `app.json` and restarting the dev server does nothing on its own. See
> [expo prebuild](../expo-core-concepts/prebuild.md).

## Platform differences

| Behaviour | iOS | Android | Web |
| --- | --- | --- | --- |
| Backing library | SDWebImage | Glide | `<img>` |
| `configureCache` | Works | No-op | No-op |
| `clearMemoryCache` / `clearDiskCache` | Works | Works (resolves `false` if the activity is gone) | Resolves `false` |
| `writeToCacheAsync` / `readFromCacheAsync` | Works | Works | Not available |
| SF Symbols via `sf:` source | Works | Not available | Not available |
| `blurRadius`, `tintColor` | Works | Works | Partial |
| `loading` prop | Ignored | Ignored | Sets the `<img>` `loading` attribute |

## Common patterns

### Authenticated images

```tsx title=components/PrivateImage.tsx
import {Image} from 'expo-image';

export function PrivateImage({uri, token}: {uri: string; token: string}) {
  return (
    <Image
      source={{
        uri,
        headers: {Authorization: `Bearer ${token}`},
        // Without an explicit cacheKey the signed URL is the key, so a
        // re-signed URL for the same asset is a fresh download every time.
        cacheKey: uri.split('?')[0],
      }}
      style={{width: 200, height: 200}}
    />
  );
}
```

### Prefetching the next screen's images

```ts title=lib/prefetch.ts
import {Image} from 'expo-image';

export async function warmDetailScreen(urls: string[]): Promise<void> {
  // Resolves false if ANY url failed, so treat it as best-effort.
  const ok = await Image.prefetch(urls, {cachePolicy: 'memory-disk'});
  if (!ok) {
    console.warn('at least one image failed to prefetch');
  }
}
```

### Stable identity in a recycling list

Pass `recyclingKey` when the same image view is reused for different data, as in a `FlatList` row.
It tells `expo-image` to drop the previous image immediately rather than showing it until the new
one decodes.

```tsx title=components/Row.tsx
import {Image} from 'expo-image';

export function Row({id, uri}: {id: string; uri: string}) {
  return <Image source={{uri}} recyclingKey={id} style={{width: 48, height: 48}} />;
}
```

## Performance considerations

- **Always constrain size when loading into memory.** `useImage` and `loadAsync` accept `maxWidth`
  and `maxHeight`. A full-resolution photo decoded at native size is tens of megabytes; a screen
  of them is an out-of-memory crash.
- **Prefer a placeholder hash over a spinner.** A blurhash or thumbhash is a few dozen bytes
  embedded in your own API response, renders instantly, and removes the layout shift a spinner
  causes.
- **`transition` is cheap, `blurRadius` is not.** The blur is applied per frame on the decoded
  bitmap; it is not applied to placeholders.
- **`priority`** (`'low' | 'normal' | 'high'`) is best-effort ordering for queued loads, not a
  guarantee. Use it to demote off-screen prefetches, not to fix a slow network.
- **Clear the disk cache deliberately, not defensively.** `clearDiskCache()` throws away work you
  paid for. If you are clearing it to fix a stale image, the real fix is a correct `cacheKey`.

See [Image Performance](../expo-performance/image-performance.md) for measurement.

## Security considerations

**Threat.** Headers you attach to an image source travel with every request the native layer
makes, including retries and redirects. A bearer token in `headers` pointed at a URL you do not
control leaks that token to whoever controls the redirect target.

**Exploit.** `source={{uri: userSuppliedUrl, headers: {Authorization: token}}}` where
`userSuppliedUrl` came from an API response an attacker can influence. The native HTTP client
follows the redirect and re-sends the `Authorization` header to the new host.

**Fix.** Validate the host before attaching credentials:

```ts title=lib/imageSource.ts
import type {ImageSource} from 'expo-image';

const ALLOWED_HOSTS = new Set(['cdn.example.com', 'images.example.com']);

export function authenticatedSource(uri: string, token: string): ImageSource {
  const host = new URL(uri).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    // Load it, but without credentials.
    return {uri};
  }
  return {uri, headers: {Authorization: `Bearer ${token}`}};
}
```

**Verification.** Point the app at a URL on a host you control that issues a 302 to
`https://httpbin.org/headers`, and confirm the `Authorization` header does not appear in the
echoed response.

Second point: **the disk cache is not encrypted.** Cached images sit in the app's cache directory
as ordinary files, readable on a rooted or jailbroken device and potentially included in device
backups. Do not cache images that are themselves secrets (a scanned ID, a one-time QR code) — set
`cachePolicy: 'none'` for those.

## Common mistakes

- **Installing with a bare package-manager command.** You get whatever `latest` is, which is built
  against a different SDK. Wrong: a plain `add expo-image`. Right: `npx expo install expo-image`.
- **Leaving `cacheKey` unset on signed URLs.** Every re-signed URL is a fresh cache entry, so your
  cache grows without ever being hit. Set `cacheKey` to the stable part of the URL.
- **Reading `prefetch`'s `true`/`false` as per-image.** It resolves `false` if any single image in
  the batch failed. It tells you nothing about which one.
- **Calling `useImage` on a full-size photo with no constraint.** Wrong:
  `useImage(uri)`. Right: `useImage(uri, {maxWidth: 800})`. The unconstrained version is the most
  common `expo-image` crash report.
- **Expecting `writeToCacheAsync` to preserve a GIF from an `ImageRef`.** It stores one frame. Pass
  the local file URI instead.
- **Expecting `configureCache` to do something on Android.** It is iOS-only.
- **Assuming a `plugins` change applies to a running dev server.** It applies at prebuild, so you
  need a new build.

## Related topics

- [Image Performance](../expo-performance/image-performance.md) — measuring and fixing slow image screens.
- [Asset Strategy](../expo-performance/asset-strategy.md) — bundled versus remote assets.
- [File System and Storage](file-system-and-storage.md) — downloading the files you feed to the cache.
- [Camera and Media](camera-and-media.md) — where locally captured images come from.
- [app.json and app.config.js](../expo-core-concepts/app-config.md) — where `plugins` entries live.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why the install command matters.
