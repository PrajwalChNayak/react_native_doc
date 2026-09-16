---
title: Platform Differences
description: Platform.OS, Platform.select, Platform.Version and platform file extensions — plus the behaviours that genuinely differ between iOS and Android.
status: current
toolchain: cli
---

React Native shares your JavaScript across two platforms. It does not make those platforms behave
the same, and the places where they differ are not edge cases — the keyboard, the back button,
shadows, clipping and safe areas all differ in ways that are visible on the first screen you build.

This page covers the API for branching on platform, the file-extension mechanism for splitting
whole modules, and the specific behavioural differences worth knowing before you meet them in a
bug report.

## Why it exists / when to use it — and when NOT to

Branch on platform when the platforms genuinely differ: a native affordance, a system behaviour, a
design-language convention. Do not branch to paper over a layout you have not understood — a
`Platform.select` that adds 8 points of padding on Android to fix a misaligned row is almost always
hiding a flexbox mistake that will come back on the next device.

The order of preference is: write one implementation that works on both, then a conditional style,
then a `Platform.select`, then separate files. Separate files are the most powerful and the most
expensive, because they double what you have to keep in sync.

## The `Platform` API

Verified against `types_generated/Libraries/Utilities/PlatformTypes.d.ts` in the installed
`react-native@0.87.1`.

| Member | Type | Notes |
| --- | --- | --- |
| `Platform.OS` | `'ios' \| 'android' \| 'macos' \| 'windows' \| 'web'` | A literal per platform build, so it narrows |
| `Platform.Version` | `string` on iOS, `number` on Android | On Android it is the **API level** (34, 35…), not a version name |
| `Platform.select(spec)` | `<T>(spec) => T` | Keys are platform names plus `default` |
| `Platform.constants` | Object, platform-specific shape | `reactNativeVersion` on every platform; `Model`, `Manufacturer`, `Release`, `Brand`, `uiMode` on Android; `interfaceIdiom`, `osVersion`, `systemName`, `forceTouchAvailable` on iOS |
| `Platform.isTV` | `boolean` | Present on both |
| `Platform.isTesting` | `boolean` | True under the test environment |
| `Platform.isPad` | `boolean` | **iOS only** |
| `Platform.isVision` | `boolean` | iOS and Android members; true only on Apple Vision Pro |
| `Platform.isMacCatalyst` | `boolean` | **iOS only** |

> [!WARNING] `Platform` is a union type, and that changes how you write the check
> In 0.87 `Platform` is typed as a union of per-platform shapes (`IOSPlatform | AndroidPlatform |
> …`). Accessing a member that only one of them has is a **compile error** until you narrow:
>
> ```text
> error TS2339: Property 'isPad' does not exist on type 'PlatformType'.
>   Property 'isPad' does not exist on type 'AndroidPlatform'.
> ```
>
> Checking `Platform.OS === 'ios'` first narrows the union and unlocks `isPad`, `isMacCatalyst` and
> the iOS shape of `constants`. This is a feature — it stops you reading an iOS-only value on
> Android — but it surprises people upgrading from older type definitions.

### Basic example

```ts title=src/platform/device.ts
import {Platform} from 'react-native';

/** Android's Version is the API level; iOS's is an OS version string. */
export function supportsPredictiveBack(): boolean {
  return Platform.OS === 'android' && Platform.Version >= 33;
}

export function describeDevice(): string {
  switch (Platform.OS) {
    case 'ios':
      // Narrowed to the iOS shape: isPad and the iOS constants are available.
      return Platform.isPad ? `iPadOS ${Platform.Version}` : `iOS ${Platform.Version}`;
    case 'android':
      return `${Platform.constants.Manufacturer} ${Platform.constants.Model} (API ${Platform.Version})`;
    default:
      return Platform.OS;
  }
}
```

Without the narrowing, `Platform.Version >= 33` is comparing `string | number` and `Platform.isPad`
does not compile at all.

### `Platform.select`

`select` takes an object keyed by platform and returns the matching value. Include `default` unless
you have covered every platform your app can run on, or the return type will not be what you want.

```tsx title=Selecting styles, not layouts
import {Platform, StyleSheet, Text, View} from 'react-native';

export function Card({title}: {title: string}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    // Shadows are genuinely two systems, not one system with two names.
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {elevation: 3},
      default: {},
    }),
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    // Font family names do not overlap between the platforms.
    fontFamily: Platform.select({ios: 'Helvetica Neue', android: 'sans-serif-medium'}),
  },
});
```

`select` is not limited to styles — it returns any value, including a component or a function. Note
that **every branch is evaluated** when the object literal is constructed, so it is the wrong tool
for anything with a side effect or an expensive construction.

## Platform-specific files

When the difference is larger than a value, split the module. Metro resolves platform extensions
automatically, and the import site stays platform-agnostic:

```text
src/components/
  StatusBanner.tsx          # shared fallback
  StatusBanner.ios.tsx      # iOS implementation
  StatusBanner.android.tsx  # Android implementation
```

```ts-fragment title=The import never mentions a platform
import {StatusBanner} from './components/StatusBanner';
```

### The exact resolution order

Read from `metro-resolver`'s `resolveSourceFileForAllExts`, for a request with a source extension
`.tsx` on the `ios` platform:

1. `StatusBanner.ios.tsx`
2. `StatusBanner.native.tsx` — when `preferNativePlatform` is on, which it is in React Native
3. `StatusBanner.tsx`

The first match wins; the others are not bundled. Metro's default platform list is
`["ios", "android", "windows", "web"]`.

`.native.tsx` is the one people forget. It is for code shared between iOS and Android but **not**
web, which matters if any part of your codebase is also built for the browser. In an app that only
ships to iOS and Android it adds a file for no benefit.

> [!NOTE] TypeScript resolves these differently from Metro
> `tsc` does not know about platform extensions. It type-checks every variant as its own module,
> which is what you want — but it means the shared `.tsx` file is what an importer is checked
> against. Keep the exported signature identical across variants, or the checker and the bundler
> will disagree.

## The differences that actually matter

### Keyboard

:::tabs
@tab iOS
The keyboard **overlays** the app. Nothing moves unless you move it, which is why
`KeyboardAvoidingView` needs `behavior="padding"` (or `"position"`) to be useful.
@tab Android
The system **resizes the window** according to the activity's soft-input mode, so content above
the keyboard usually stays visible on its own. Passing `behavior="padding"` on Android often
double-compensates and pushes content too far up.
:::

The idiomatic form is therefore `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.

### Hardware back button

Android has one; iOS does not. Anything that must intercept it is Android-only code, and a
subscription registered on iOS simply never fires.

```tsx title=Android-only, and explicitly so
import {useEffect} from 'react';
import {BackHandler, Platform, Text} from 'react-native';

export function ConfirmOnBack({onBack}: {onBack: () => boolean}) {
  useEffect(() => {
    // There is no hardware back button on iOS. Returning early makes the
    // platform assumption visible instead of leaving a dead subscription.
    if (Platform.OS !== 'android') {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [onBack]);

  return <Text>Editing</Text>;
}
```

Returning `true` from the handler consumes the event; returning `false` lets the default behaviour
run. Getting that backwards is the classic cause of "back button does nothing".

### Shadows

Two unrelated systems. iOS uses `shadowColor`, `shadowOffset`, `shadowOpacity` and `shadowRadius`,
which draw a real blurred shadow. Android uses `elevation`, a single number that also participates
in **z-ordering** — raising elevation can bring a view in front of siblings that `zIndex` alone
would not. Neither set has any effect on the other platform. See
[Shadows and Elevation](../styling/shadows-and-elevation.md).

### Clipping and overflow

According to the 0.87 type definitions, `overflow: 'visible'` is honoured on iOS and has no effect
on Android, where every view clips its children. A badge that overhangs its parent works on iOS and
is cut off on Android. The portable pattern is a shared parent large enough to contain both the
avatar and the badge.

### Safe areas

iOS has notches, Dynamic Islands and a home indicator. Android has status bars, cutouts and either
a gesture bar or a three-button navigation bar. Both need insets and the values are different.

Core `SafeAreaView` is **deprecated in 0.87** and annotated iOS-only in the type definitions — it
does nothing on Android. Use `react-native-safe-area-context`, which reports insets on both.

### Status bar

`StatusBar`'s `backgroundColor`, `translucent` and `networkActivityIndicatorVisible` props — and
their setter methods — were **removed in 0.87**. On Android, edge-to-edge is the model now, and the
status bar background is configured natively in the theme rather than from JavaScript. `barStyle`
and `hidden` remain and work on both platforms.

### Text rendering

The platforms use different text engines, so the same `fontSize` and `lineHeight` produce slightly
different metrics. Android applies additional font padding by default. Never assume a string
occupies the same number of lines on both — `numberOfLines` with an ellipsis is portable; a fixed
height around text is not.

Font family names do not overlap. `'System'` and the San Francisco variants on iOS;
`'sans-serif'`, `'sans-serif-medium'` and friends on Android. A custom font you add yourself is the
only genuinely portable option — see [Fonts and Icons](../styling/fonts-and-icons.md).

### Touch feedback

iOS convention is an opacity change; Android convention is a ripple. `Pressable` supports both:
`android_ripple` configures the ripple, and the `style` callback's `pressed` flag drives the
opacity. Using only one of them makes the app feel foreign on the other platform.

### Permissions

Fundamentally different models. iOS asks once, at the point of use, with a usage-description string
that **must** be in `Info.plist` or the app crashes on request. Android declares permissions in
`AndroidManifest.xml` and requests dangerous ones at runtime, with a "don't ask again" state that
has no iOS equivalent. See [Permissions](../platform-apis/permissions.md).

### Native configuration lives in different files

This is the category that catches people out most, because the JavaScript compiles fine and the
feature simply does not work:

| Need | iOS | Android |
| --- | --- | --- |
| Permission rationale strings | `ios/<App>/Info.plist` usage descriptions | `android/app/src/main/AndroidManifest.xml` permissions |
| Custom URL scheme | `Info.plist` `CFBundleURLTypes` | Manifest `intent-filter` |
| Cleartext or pinned HTTP | App Transport Security in `Info.plist` | `network_security_config.xml` |
| Background capability | Xcode capabilities / `Info.plist` | Manifest services and permissions |
| Minimum OS version | Podfile / Xcode deployment target | `minSdk` in `android/build.gradle` |

## Common patterns

### Push the branch as low as possible

A platform check inside a small component is maintainable. A platform check that selects an entire
screen is a second screen to maintain. Prefer branching at the level of a style, then a prop, then
a component, and only then a file.

### Make the platform assumption explicit

```ts-fragment title=Wrong — silently does nothing on the other platform
const insetTop = Platform.OS === 'ios' ? 44 : 0;
```

```ts-fragment title=Right — read the real value on both
import {useSafeAreaInsets} from 'react-native-safe-area-context';
const {top} = useSafeAreaInsets();
```

Hard-coded platform constants are the most common source of layouts that break on the next device
generation. If a real API reports the value, use it.

### Test both, early

A platform difference found on the day before release is a redesign. Run the app on both platforms
from the first week, even if one of them is not the priority — the cost of keeping them in step is
much lower than the cost of reconciling them later.

## Performance considerations

- **`Platform.OS` is a constant.** Checking it is free, and the comparison is often eliminated at
  build time. There is no reason to cache it in a module-level variable for speed.
- **`Platform.select` builds its whole object.** Every branch's value is constructed before one is
  chosen. Keep them cheap, and never put a side effect in one.
- **Platform files are the only form that shrinks the bundle.** `Platform.select` ships both
  branches; `Component.ios.tsx` ships only on iOS. That matters for a large platform-specific
  dependency and not at all for a padding value. See [Bundle Size](../performance/bundle-size.md).

## Common mistakes

- **Reading `Platform.isPad` without narrowing.** Wrong: `if (Platform.isPad)`. Right:
  `if (Platform.OS === 'ios' && Platform.isPad)`. The first is a compile error in 0.87 because
  `Platform` is a union.
- **Treating `Platform.Version` as one type.** It is a `string` on iOS and the API level `number`
  on Android. Comparing it numerically without narrowing to Android does not type-check, and
  parsing it as a version name on Android gives you nonsense.
- **Using `Platform.select` without `default`.** On a platform you did not list you get
  `undefined`, and the failure shows up as a missing style rather than an error.
- **Putting side effects in a `Platform.select`.** Wrong:
  `Platform.select({ios: startTracking(), android: noop()})` — both run. Right: select the function,
  then call the result.
- **Hard-coding inset heights.** A 44-point status bar assumption predates notches, Dynamic Island
  and every Android cutout. Read the insets.
- **Expecting `elevation` to draw a shadow on iOS, or `shadowOpacity` to do anything on Android.**
  Set both, in a `Platform.select`.
- **Expecting `overflow: 'visible'` to work on Android.** It does not. Restructure so the child
  fits inside a parent that is large enough.
- **Setting `backgroundColor` or `translucent` on `StatusBar`.** Both props were removed in 0.87.
  Configure the Android status bar natively in the theme.
- **Adding a platform branch to fix a layout.** If a row is misaligned on one platform, the layout
  is usually wrong on both and one of them is hiding it. Fix the flexbox first.

## Related topics

- [How RN Differs from the Web](differences-from-web.md) — the other set of assumptions to drop.
- [The New Architecture](new-architecture.md) — what is the same on both platforms, and why.
- [Platform-Specific Styles](../styling/platform-specific-styles.md) — style-level branching in depth.
- [Shadows and Elevation](../styling/shadows-and-elevation.md) — the two shadow systems.
- [Safe Areas](../components/safe-areas.md) — insets on both platforms.
- [KeyboardAvoidingView](../components/keyboardavoidingview.md) — the keyboard difference in practice.
- [Permissions](../platform-apis/permissions.md) — two genuinely different models.
- [Platform Folders](../native-modules/platform-folders.md) — how native code is organised per platform.
- [Bundle Size](../performance/bundle-size.md) — when platform files are worth it.
