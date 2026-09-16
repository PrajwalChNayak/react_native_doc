---
title: Image Performance and Caching
description: Why decoded size — not file size — dominates image cost, how to request the right resolution, and how the two platform image caches actually behave.
status: current
toolchain: cli
---

Images are the largest single source of memory pressure in most React Native apps, and one of the
most common causes of list jank. The reason is a number people rarely compute: a JPEG's file size
tells you about the download, and nothing at all about what it costs once it is on screen.

[Image](../components/image.md) covers the component. This page is about the cost model and what to
do with it.

## Why it matters — the decode arithmetic

An image in memory is uncompressed pixels. Four bytes per pixel for RGBA:

| Source | File size | Decoded size |
| --- | --- | --- |
| 4000 × 3000 photo | ~2 MB JPEG | 4000 × 3000 × 4 ≈ **48 MB** |
| 1080 × 1080 avatar | ~200 KB | 1080 × 1080 × 4 ≈ **4.4 MB** |
| 96 × 96 avatar | ~6 KB | 96 × 96 × 4 ≈ **37 KB** |

Displaying that first photo in a 120 pt thumbnail costs the same 48 MB as displaying it full
screen, because the decoder does not know or care how large your view is. Ten of those in a list is
half a gigabyte, which is an out-of-memory kill on a mid-range Android device.

Compression ratio is irrelevant to this number. Resolution is the only thing that changes it.

## Basic example

Ask the server for the size you are going to display, in device pixels:

```tsx title=src/components/Avatar.tsx
import {memo, useMemo} from 'react';
import {Image, PixelRatio, StyleSheet} from 'react-native';

type Props = {userId: string; sizeDp: number};

export const Avatar = memo(function Avatar({userId, sizeDp}: Props) {
  const source = useMemo(() => {
    // Layout units are density-independent; the decoder works in real pixels.
    // On a 3x device a 48dp avatar needs a 144px image, not a 48px one.
    const px = PixelRatio.getPixelSizeForLayoutSize(sizeDp);
    return {
      uri: `https://images.example.com/u/${userId}?w=${px}&h=${px}&fit=cover`,
      // Declaring the intrinsic size lets the layout reserve space immediately.
      width: px,
      height: px,
    };
  }, [userId, sizeDp]);

  return (
    <Image
      source={source}
      style={[styles.avatar, {width: sizeDp, height: sizeDp}]}
      // Android's default 300ms fade re-runs for every recycled row and reads
      // as flicker in a fast list.
      fadeDuration={0}
      accessibilityIgnoresInvertColors
    />
  );
});

const styles = StyleSheet.create({
  avatar: {borderRadius: 999, backgroundColor: '#e5e5e5'},
});
```

Three things are happening: the URL requests a correctly sized image, `useMemo` keeps the `source`
object identity stable so `memo` on the row above still works, and the placeholder background gives
the layout something to show while the request is in flight.

## How it works

### The pipeline for a remote image

1. **Request.** The image loader fetches the URL, subject to the HTTP cache.
2. **Decode.** Compressed bytes become a bitmap. This is CPU work and it allocates the full
   decoded size.
3. **Cache.** The bitmap goes into a memory cache; the compressed bytes usually go into a disk
   cache.
4. **Upload and draw.** The bitmap is handed to the GPU and composited.

Step 2 is where the time goes on a cold load and step 2's allocation is where the memory goes. Both
scale with pixel count, which is why "serve the right size" is the whole technique.

### The three caches

There are three layers, and confusing them is the source of most "why is my image cache not
working" questions.

| Layer | Holds | Survives |
| --- | --- | --- |
| Memory (bitmap) cache | Decoded bitmaps | Until memory pressure or app termination |
| Disk cache | Compressed bytes | App restarts, subject to HTTP cache headers |
| Your own storage | Files you downloaded yourself | Whatever you decide |

A memory-cache hit is close to free. A disk-cache hit still pays the decode. A miss pays
everything.

**The disk layer obeys your server's HTTP headers.** If your image responses send
`Cache-Control: no-store`, no client-side tuning will keep them. Fixing image caching is very often
a server change, not an app change.

### Controlling the cache from the source

`source.cache` takes `'default'`, `'reload'`, `'force-cache'` or `'only-if-cached'`. In 0.87 this is
honoured on both platforms — Android maps it onto its own image-cache control values rather than
ignoring it, which older guides claim.

```tsx title=src/components/CachedBanner.tsx
import {Image, StyleSheet} from 'react-native';

export function CachedBanner({uri}: {uri: string}) {
  return (
    <Image
      // 'force-cache' uses whatever is cached regardless of age. Right for
      // immutable, content-addressed URLs; wrong for anything that changes
      // under a stable URL.
      source={{uri, cache: 'force-cache'}}
      style={styles.banner}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({banner: {width: '100%', aspectRatio: 16 / 9}});
```

The clean pattern is to make image URLs immutable — include a content hash or version in the path —
and then cache them aggressively. Mutable URLs plus aggressive caching is how you ship a stale
avatar for a week.

### Prefetching

`Image.prefetch(url)` downloads into the cache and resolves when it lands. `Image.queryCache(urls)`
tells you which urls are already cached and where. Both are useful and both are easy to misuse.

```tsx title=src/screens/prefetchNext.ts
import {Image} from 'react-native';

declare function requestIdleCallback(
  callback: (deadline: {didTimeout: boolean; timeRemaining: () => number}) => void,
  options?: {timeout: number},
): number;

/**
 * Warms the cache for the next screen's images without competing with the
 * current screen's own requests. `requestIdleCallback` is the global that
 * replaced the removed deferral API in 0.87.
 */
export function prefetchWhenIdle(urls: readonly string[]): void {
  requestIdleCallback(
    () => {
      for (const url of urls) {
        // A failed prefetch is not an error worth surfacing — and since 0.82 an
        // unhandled rejection raises console.error, so it must be caught.
        Image.prefetch(url).catch(() => {});
      }
    },
    {timeout: 2000},
  );
}
```

Prefetch a handful of images for the *next* screen. Prefetching a hundred at mount contends with
the requests the current screen needs and makes the visible content slower.

> [!NOTE] `requestIdleCallback` is not in the public type surface
> It is installed as a global by React Native's runtime setup but React Native's shipped type
> definitions do not declare it, so a TypeScript file needs its own declaration as above.

### Reserving space

An `Image` with no dimensions is zero-sized until the load completes, then jumps to its intrinsic
size and reflows everything below it. That reflow is a full render–commit–mount cycle for the
subtree.

Give every image a size. `aspectRatio` plus a width handles the case where you know the shape but
not the pixels:

```tsx title=src/components/ArticleHero.tsx
import {Image, StyleSheet, View} from 'react-native';

export function ArticleHero({uri}: {uri: string}) {
  return (
    // The container reserves the exact final height before the image exists,
    // so nothing below it moves when the load completes.
    <View style={styles.frame}>
      <Image source={{uri}} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {width: '100%', aspectRatio: 3 / 2, backgroundColor: '#eee', overflow: 'hidden'},
});
```

### Vector and static assets

A bundled PNG shipped at `@1x`, `@2x` and `@3x` is resolved at build time, so the device only
decodes the density it needs. That is why a bundled asset usually costs less than the same artwork
fetched remotely at one size.

For icons and simple shapes, `react-native-svg` (15.15.5) draws vectors with no decode step and no
per-density assets at all. For a photograph it is the wrong tool.

## Platform differences

:::tabs
@tab Android
The image pipeline is **Fresco**, which is still the loader in 0.87. Its bitmap cache is
independent of the JavaScript heap, which means image memory does not show up in a JavaScript heap
snapshot — you have to look at native memory.

Android-only props that matter:

- `resizeMethod` (`'auto' | 'resize' | 'scale' | 'none'`, default `'auto'`). `'resize'` downsamples
  during decode, so a much-larger-than-the-view image never allocates at full size. This is the
  single most effective memory fix on Android when you cannot control the server.
- `resizeMultiplier` (default `1.0`) tunes how far `'resize'` goes before `'scale'` takes over.
- `fadeDuration` (default `300` ms). Set it to `0` in lists.
- `progressiveRenderingEnabled` (default `false`) streams progressive JPEGs.

`'none'` for `resizeMethod` is documented as unsafe: Android throws at runtime when a bitmap is too
large to render.
@tab iOS
The loader is React Native's own image loader over `NSURLCache`, so the disk layer follows standard
HTTP caching semantics closely.

iOS-only props:

- `defaultSource` — a static image shown while the real one loads. There is no Android equivalent;
  Android has `loadingIndicatorSource` instead.
- `onProgress` — download progress, useful for large assets.
- `onPartialLoad` — fires for progressive JPEG loads.

iOS has no `resizeMethod`, so downsampling has to happen server-side or before the image reaches the
component.
:::

Because the two loaders differ, an image strategy that works on one platform can fail on the other.
Test memory on a mid-range Android device specifically — it is where images kill apps.

## Common patterns

### Ask the server for the right size

A thumbnailing service or CDN transform (`?w=…&h=…`) is the highest-leverage change available. It
fixes download size, decode time and memory in one move, and it works identically on both platforms.

### Keep `source` identity stable

`source={{uri: item.avatarUrl}}` written inline is a new object every render. It usually still hits
the cache, but it defeats `memo` on the wrapping row. Build the source once with `useMemo`, or
derive it in the data layer.

### Placeholder, then image

A solid background colour behind the image costs nothing and removes the flash of empty space.
A blurred low-resolution preview costs a second request — worth it for a hero image, not for a list
row.

### Cap what is on screen

Virtualization already limits mounted rows; make sure the row's image is sized to the row. A list
that shows 8 rows at a time with correctly sized 96 px avatars holds about 300 KB of bitmaps. The
same list with unsized originals can hold hundreds of megabytes.

## Performance considerations

- **Decoded size, not file size.** Repeat the arithmetic before blaming the network.
- **Serve at display size.** Everything else on this page is a mitigation for not doing this.
- **`resizeMethod="resize"` on Android** when the source is much larger than the view and you cannot
  change the server.
- **`fadeDuration={0}` in lists on Android.** The default fade repeats on every recycled row.
- **Reserve space.** An unsized image costs an extra full render pass when it loads.
- **Prefetch narrowly and late.** Next screen, a handful of urls, on idle.
- **Avoid `blurRadius` on scrolling content.** Pre-blur the asset if the blur is static.
- **Watch native memory, not the JS heap.** Bitmaps live outside the JavaScript heap on both
  platforms, so a heap snapshot will not show them. Use Instruments' Allocations or Android
  Studio's memory profiler. See [Memory](memory.md).

## Security considerations

**Threat.** An image URL is attacker-controlled whenever it comes from user-generated content, and
`source.headers` lets you attach credentials to a request.

**Exploit.** A row that renders `{uri: item.imageUrl, headers: {Authorization: token}}` sends your
bearer token to whatever host the attacker put in `imageUrl`. Plain `http://` URLs additionally leak
the request and allow content substitution on a hostile network.

**Fix.** Never attach credentials to an image request whose host you did not choose. Validate the
host against an allow-list before rendering, and require `https`:

```ts title=src/net/safeImageUri.ts
const ALLOWED_IMAGE_HOSTS = new Set(['images.example.com', 'cdn.example.com']);

export function safeImageUri(candidate: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  // Scheme and host are both checked: https alone does not stop exfiltration.
  if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    return null;
  }
  return parsed.toString();
}
```

**Verification.** Point a proxy at the device, render a screen with a hostile URL in the data, and
confirm no request carries your `Authorization` header to an unexpected host. See
[Network Security Config and ATS](../security/network-security-config.md).

## Common mistakes

- **Judging cost by file size.** Wrong: "it is only 2 MB". Right: 4000 × 3000 × 4 bytes is what the
  device allocates, regardless of compression.
- **Rendering originals in a list.** Wrong: full-resolution uploads in 64 pt thumbnails. Right: a
  CDN transform, or `resizeMethod="resize"` on Android as a fallback.
- **Inline `source` objects in rows.** Wrong: `source={{uri: item.url}}` in a memoized row's JSX.
  Right: memoize the source, so the memo actually holds.
- **Unsized remote images.** Wrong: an `Image` with no width or height and a remote `uri`. Right:
  explicit dimensions, or `aspectRatio` on a wrapper.
- **`force-cache` on mutable URLs.** Wrong: caching `/avatar/current.jpg` forever. Right: make the
  URL content-addressed, then cache it hard.
- **Prefetching everything at mount.** Wrong: `urls.forEach(Image.prefetch)` in a screen effect.
  Right: a handful for the next screen, on idle.
- **Looking for image memory in a JS heap snapshot.** Wrong: concluding there is no image problem
  because the heap is small. Right: bitmaps are native allocations; use the platform memory tools.
- **Sending auth headers to a URL from user content.** Wrong: attaching a token to any image
  request. Right: allow-list the host first.

## Related topics

- [Image](../components/image.md) — the component, its props and the load lifecycle.
- [List Performance in Depth](list-performance.md) — where image cost multiplies.
- [Memory](memory.md) — native versus JavaScript memory, and how to see each.
- [Measuring Before Optimising](measuring-first.md) — confirming images are actually your problem.
- [Bundle Size](bundle-size.md) — bundled assets and what they add to the download.
- [Network Security Config and ATS](../security/network-security-config.md) — enforcing https for media.
