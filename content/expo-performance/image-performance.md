---
title: Image Performance with expo-image
description: Finding and fixing slow image screens in Expo SDK 57 — decode size, cache policy, recycling in lists, prefetching, and the SDK 57 cache read/write functions.
status: current
toolchain: expo
sdk: 57
---

Images are the most common cause of a screen that feels slow, uses too much memory, or flickers
while scrolling. On SDK 57 the tool is `expo-image@~57.0.5`. This page is about using it
**fast**: the API reference lives in [Images with expo-image](../expo-sdk/images.md).

```bash
npx expo install expo-image
```

## Why it exists / when to use it — and when NOT to

Reach for this page when a profile or a user report points at images:

- A screen of photos janks while scrolling.
- Memory climbs as the user browses and the app is eventually killed.
- Images visibly pop in or show the wrong picture briefly in a list.
- The same image downloads again every time a screen opens.

If none of those is happening, image tuning is not your bottleneck. Measure first — see
[Measuring Before Optimising](measuring-first.md).

## Expo Go vs development build

`expo-image` ships in Expo Go, so everything here runs there. **Measure** in a release build,
though: decoding and caching behaviour in a development build is real, but the rest of the app
around it is not representative.

## Basic example

The single most effective fix is decoding images at the size they are displayed, not the size they
were uploaded:

```tsx title=components/Thumbnail.tsx
import {Image} from 'expo-image';

type Props = {id: string; uri: string};

export function Thumbnail({id, uri}: Props) {
  return (
    <Image
      source={{uri}}
      style={{width: 96, height: 96}}
      contentFit="cover"
      // Memory and disk: repeat renders in a scrolling list skip both network and decode.
      cachePolicy="memory-disk"
      // In a recycled list row, drop the previous image immediately instead of
      // showing it until the new one decodes.
      recyclingKey={id}
      transition={150}
    />
  );
}
```

And request a thumbnail-sized file from your image server if it supports resizing. A 4000px photo
decoded for a 96pt thumbnail wastes memory no matter how well the view is configured.

## How it works

### Where the time goes

| Cost | Symptom | Fix |
| --- | --- | --- |
| Network download | Images appear late | `cachePolicy`, `prefetch`, smaller files |
| Decode | Jank when images appear | Smaller source files, `maxWidth` on `useImage`/`loadAsync` |
| Memory | App killed after browsing | Smaller decodes, avoid `'memory'` for huge images |
| Recycling | Wrong image flashes in list rows | `recyclingKey` |
| Layout shift | Content jumps as images load | Fixed dimensions, a `placeholder` hash |

### Cache policy is a trade-off

`cachePolicy` is one of `'none'`, `'disk'` (the default), `'memory'` or `'memory-disk'`.
`'memory-disk'` gives the fastest repeat render and costs memory. Use it for small images seen
repeatedly — avatars, thumbnails. Leave large hero images on `'disk'`.

### Constrain decoded size when you load into memory

`useImage` and `Image.loadAsync` accept `maxWidth` and `maxHeight`. Without them, a full-resolution
photo is decoded at native size:

```tsx title=components/PhotoPreview.tsx
import {Image, useImage} from 'expo-image';

export function PhotoPreview({uri}: {uri: string}) {
  // 1080 is roughly the width of a phone screen in pixels; decoding more is waste.
  const image = useImage(uri, {maxWidth: 1080});
  if (!image) {
    return null;
  }
  return (
    <Image
      source={image}
      style={{width: '100%', aspectRatio: image.width / image.height}}
    />
  );
}
```

### Prefetch the next screen, not the whole catalogue

```ts title=lib/prefetchDetail.ts
import {Image} from 'expo-image';

export async function prefetchDetail(urls: string[]): Promise<void> {
  // Resolves false if ANY url failed. Treat it as best effort, never as a guarantee.
  await Image.prefetch(urls.slice(0, 6), {cachePolicy: 'disk'});
}
```

Prefetching hundreds of images competes with what the user is looking at right now, for both
network and decode.

### New in SDK 57: seed the cache from a local file

`writeToCacheAsync` and `readFromCacheAsync` are new in SDK 57. Signatures verified from the
installed `expo-image@57.0.5` types:

```ts-fragment
static writeToCacheAsync(source: string | ImageRef, cacheKey: string): Promise<void>;
static readFromCacheAsync(cacheKey: string): Promise<ImageRef | null>;
```

They matter for performance when you already have the image on the device — a photo the user just
picked or captured, which you are also uploading. Seed the cache under the key the server URL will
use, and the image renders from cache instead of downloading the file you already had:

```ts title=lib/seedUploadedPhoto.ts
import {Image} from 'expo-image';

export async function showUploadedPhotoWithoutRedownload(
  localUri: string,
  remoteCacheKey: string,
): Promise<void> {
  // Pass the file URI, not an ImageRef: an ImageRef of an animated image is
  // flattened to a single frame when written.
  await Image.writeToCacheAsync(localUri, remoteCacheKey);
}
```

Render it later with `source={{uri: remoteUrl, cacheKey: remoteCacheKey}}`. Both functions are
Android and iOS only.

## Platform differences

| | iOS | Android |
| --- | --- | --- |
| Backing library | SDWebImage | Glide |
| `Image.configureCache` | Sets disk and memory limits | No-op |
| `writeToCacheAsync` / `readFromCacheAsync` | Available | Available |

Neither is available on web.

## Common patterns

### Stable cache keys for signed URLs

If your CDN signs URLs with an expiring query string, set `cacheKey` to the stable part of the URL.
Otherwise every re-signed URL is a cache miss and a fresh download.

### Placeholders instead of spinners

A `blurhash` or `thumbhash` placeholder renders instantly from a short string in your API response,
and prevents the layout shift a spinner causes.

## Performance considerations

- Always give images explicit dimensions (or an `aspectRatio`). Layout that depends on the loaded
  image size forces a second layout pass when it arrives.
- `blurRadius` is applied to the decoded bitmap and is not cheap. Avoid it on list rows.
- `priority` (`'low' | 'normal' | 'high'`) orders queued loads. It is a hint, not a fix for a slow
  network.
- Profile memory with the Memory panel of React Native DevTools, and native memory with Android
  Studio or Xcode Instruments — decoded bitmaps live in native memory, not the JS heap.

## Common mistakes

- **Shipping full-resolution images to thumbnail views.** The decode cost and memory are paid in
  full. Request a smaller file and constrain decodes.
- **No `recyclingKey` in list rows.** Recycled cells show the previous item's image until the new
  one decodes.
- **`'memory-disk'` on everything.** Large images held in memory lead to memory pressure and
  eviction churn. Reserve it for small, repeated images.
- **Unstable `cacheKey` on signed URLs.** The cache grows but is never hit.
- **Writing an `ImageRef` to the cache for an animated image.** It is stored as one frame. Pass the
  file URI.
- **Using the core React Native `Image` for remote images in lists.** It has no cache policy or
  recycling key to tune.

## Related topics

- [Images with expo-image](../expo-sdk/images.md) — the full API reference.
- [List Performance](list-performance.md) — images are usually inside a list.
- [Asset Strategy](asset-strategy.md) — bundled versus remote images.
- [Profiling](profiling.md) — finding out whether images are actually the problem.
- [Camera and Media](../expo-sdk/camera-and-media.md) — where local images come from.
