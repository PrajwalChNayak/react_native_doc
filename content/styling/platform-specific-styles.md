---
title: Platform-Specific Styles
description: Platform.OS, Platform.select and the .ios.tsx / .android.tsx file extensions — which of the three to reach for, and the typing traps in each.
status: current
toolchain: cli
---

React Native gives you one component tree and two sets of platform conventions. Sometimes the
difference is a number — 8 points of padding on Android, 12 on iOS. Sometimes it is a whole
component. The three mechanisms below cover both ends of that range, and picking the wrong one
is how a codebase ends up with `Platform.OS === 'ios' ?` scattered through two hundred lines of
JSX.

The rule that keeps this manageable: **branch on values, not on structure.** If the difference
is a style value, use `Platform.select`. If the difference is the component, use a platform file
extension and let Metro pick.

## Why it exists / when to use it — and when NOT to

| Mechanism | Use it for | Cost |
| --- | --- | --- |
| `Platform.OS` | A one-off boolean check, usually inside a hook or helper | Easy to over-use; reads as noise in JSX |
| `Platform.select` | Per-platform *values*: a number, a colour, a style object | None worth mentioning |
| `Foo.ios.tsx` / `Foo.android.tsx` | Per-platform *implementations* of a whole module | Two files to keep in sync; no shared logic unless you extract it |

When **not** to reach for any of them: when the real difference is not the platform but the
screen, the density or the user's settings. A tablet is not a platform — see
[Responsive and Tablet Layouts](responsive-layouts.md). A larger font because the user asked for
one is not a platform difference either; that is `PixelRatio.getFontScale()`, covered in
[Units and Density](units-and-density.md).

## Basic example

```tsx title=src/components/Card.tsx
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
    // A value that genuinely differs by platform convention. `default` is what
    // any platform not listed gets, including web and macOS builds.
    marginHorizontal: Platform.select({ios: 16, android: 12, default: 12}),
  },
  title: {
    fontSize: 17,
    // Platform.select is not limited to primitives — it returns whatever you
    // put in it, including a partial style object you spread.
    ...Platform.select({
      ios: {fontWeight: '600' as const, letterSpacing: -0.2},
      android: {fontWeight: '700' as const, letterSpacing: 0},
      default: {fontWeight: '600' as const},
    }),
  },
});
```

## How it works

### `Platform` is a union type, not one object

This is the part that surprises people coming from older type definitions. Read from the
installed 0.87 types, `Platform` is typed as
`IOSPlatform | AndroidPlatform | WindowsPlatform | MacOSPlatform | WebPlatform`, and each member
has a literal `OS` field. That makes `OS` a discriminant, and it means several properties only
exist on one member.

```tsx title=src/device/deviceInfo.ts
import {Platform} from 'react-native';

/**
 * `Platform.isPad` exists only on the iOS member of the union, so reading it
 * unconditionally is a compile error. Narrowing on `OS` first is what makes it
 * reachable — TypeScript treats `OS` as the discriminant.
 */
export function isTablet(): boolean {
  if (Platform.OS === 'ios') {
    return Platform.isPad;
  }
  return false;
}

/**
 * `Version` is a string on iOS ('26.0') and a number on Android (the API
 * level, e.g. 34). Across the union it is `string | number`, so comparing it
 * numerically without narrowing does not type-check.
 */
export function supportsPredictiveBack(): boolean {
  return Platform.OS === 'android' && Platform.Version >= 33;
}
```

`isTV`, `isTesting` and `isDisableAnimations` are on every member, so they need no narrowing.
`isPad` and `isVision` are iOS-only. `constants` exists everywhere but has a different shape on
each platform — `Release`, `Model`, `Manufacturer` and `uiMode` on Android; `interfaceIdiom`,
`osVersion` and `forceTouchAvailable` on iOS.

### `Platform.select` picks the first key that matches

The lookup order is the concrete platform key (`ios`, `android`, `windows`, `macos`, `web`),
then `native` for anything that is not web, then `default`. The spec type permits any subset of
those keys.

```tsx title=src/theme/elevationTokens.ts
import {Platform} from 'react-native';

/**
 * `native` catches iOS, Android, macOS and Windows in one key. It is the right
 * key when the split you care about is "a real device" versus "a browser".
 */
export const hitSlopPadding = Platform.select({
  native: 12,
  default: 4,
});
```

> [!WARNING] `Platform.select` without `default` is typed as if it always returns a value
> The type definition models a spec with no `default` as `{[key in PlatformOSType]?: T}` and
> still returns `T`. So `Platform.select({ios: 20, android: 12})` has type `number`, even though
> at runtime it returns `undefined` on any platform you did not list. That is fine for an
> iOS/Android-only app; it is a silent `undefined` the moment someone adds a web or macOS target.
> Include `default` whenever the value is load-bearing.

### Platform file extensions

Metro resolves `./Widget` against the current platform before it falls back to the bare name.
With the React Native defaults, the order is:

1. `Widget.ios.tsx` (or `.android.tsx`) — the requested platform
2. `Widget.native.tsx` — any non-web platform, when `preferNativePlatform` is on, which it is
   in the React Native Metro config
3. `Widget.tsx`

The default `platforms` list in Metro is `['ios', 'android', 'windows', 'web']` and the default
`sourceExts` are `['js', 'jsx', 'json', 'ts', 'tsx']`, so every combination of those works.

```text title=src/components/ProgressBar/ — one import, two implementations
src/components/
  ProgressBar.ios.tsx      // uses an iOS-idiomatic bar
  ProgressBar.android.tsx  // uses the Android one
  ProgressBar.types.ts     // the shared prop type, imported by both
```

```ts title=src/components/ProgressBar.types.ts
/**
 * Both platform files import this, so a prop added on one platform and
 * forgotten on the other is a compile error rather than a runtime surprise.
 */
export type ProgressBarProps = {
  /** 0 to 1. Values outside the range are clamped by the implementation. */
  fraction: number;
  color?: string;
};
```

```tsx-fragment title=src/components/ProgressBar.ios.tsx
import {StyleSheet, View} from 'react-native';
import type {ProgressBarProps} from './ProgressBar.types';

export function ProgressBar({fraction, color = '#0a84ff'}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, {width: `${clamped * 100}%`, backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS convention: a thin, fully rounded bar.
  track: {height: 4, borderRadius: 2, backgroundColor: '#e5e5ea', overflow: 'hidden'},
  fill: {height: '100%'},
});
```

The import site never mentions a platform:

```tsx-fragment title=src/screens/DownloadScreen.tsx
import {ProgressBar} from '../components/ProgressBar';

export function DownloadScreen() {
  return <ProgressBar fraction={0.4} />;
}
```

> [!NOTE] Type resolution follows the same rule
> TypeScript resolves `./ProgressBar` to `ProgressBar.tsx` if one exists, and otherwise reports
> that the module cannot be found — it does not know about Metro's platform extensions. The fix
> used in practice is to keep a `ProgressBar.tsx` that re-exports one of the two, or to declare
> the shared prop type in its own file (as above) and let each platform file be the entry point
> for its own build. Do not paper over it with a wildcard module declaration; that turns every
> typo into `any`.

## Platform differences

The reason to branch is usually a genuine platform convention, not a bug. The ones that come up
constantly in styling:

:::tabs
@tab iOS
- **Shadows** use `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`. See
  [Shadows and Elevation](shadows-and-elevation.md).
- **`overflow: 'visible'`** works, so a badge can hang outside its parent's bounds.
- **Fonts** default to the system font (San Francisco). `fontWeight` maps onto real weights
  rather than synthesising them.
- **Text** has no extra vertical padding around the glyph box.
- **`borderCurve: 'continuous'`** is an iOS-only style prop that gives the squircle corner shape
  the platform uses in its own UI.
@tab Android
- **Shadows** have historically used `elevation`, which also affects z-ordering among siblings.
- **`overflow: 'visible'` is ignored** — children are always clipped to the parent's bounds. A
  badge that hangs outside its parent disappears. Restructure the layout instead of fighting it.
- **Fonts** default to Roboto, and `includeFontPadding: false` is often needed to remove the
  extra vertical space Android reserves above and below text.
- **Ripple** is the touch feedback convention; `TouchableNativeFeedback` and `Pressable`'s
  `android_ripple` prop are the way to get it.
:::

`Platform.OS === 'android'` is the right test for the `includeFontPadding` case. It is the wrong
test for shadows, because the correct answer there changed in recent versions — read that page
rather than assuming.

## Common patterns

### Put the branch in a token, not in the JSX

One module owns every platform difference; screens read named values. This is the difference
between a codebase you can audit and one where nobody knows how many platform checks there are.

```ts title=src/theme/tokens.ts
import {Platform} from 'react-native';

export const tokens = {
  // Android's touch targets are conventionally slightly tighter.
  screenPadding: Platform.select({ios: 20, android: 16, default: 16}),
  // iOS lists have hairline separators; Android uses a 1dp divider colour.
  separatorColor: Platform.select({ios: '#c6c6c8', android: '#e0e0e0', default: '#e0e0e0'}),
  headerHeight: Platform.select({ios: 44, android: 56, default: 56}),
} as const;
```

### Branch once, at the top of a hook

When the difference is behavioural rather than visual, the check belongs in the hook that owns
the behaviour, not in the component that calls it.

```tsx title=src/hooks/useKeyboardOffset.ts
import {Platform} from 'react-native';

/**
 * KeyboardAvoidingView wants different behaviour per platform. Callers should
 * not have to know that, so the decision lives here once.
 */
export function useKeyboardBehavior(): 'padding' | 'height' {
  return Platform.OS === 'ios' ? 'padding' : 'height';
}
```

### Extension files for anything with its own imports

The moment a platform branch pulls in a platform-only import, move to file extensions. A module
that imports an iOS-only native module inside an `if (Platform.OS === 'ios')` still has the
import at the top of the file, so it is still bundled and still evaluated on Android.

## Performance considerations

`Platform.OS` is a plain string constant read from native constants at startup, and
`Platform.select` is an object lookup. Neither is measurable. Do not memoise them.

What does cost you is calling `Platform.select` inside a render to build a style object:

```tsx title=Two versions of the same thing
import {Platform, StyleSheet, View} from 'react-native';

// Wrong: a new object every render, so any memoised child below re-renders.
export function Slow() {
  return <View style={{padding: Platform.select({ios: 16, default: 12})}} />;
}

// Right: resolved once at module scope.
export function Fast() {
  return <View style={styles.box} />;
}

const styles = StyleSheet.create({
  box: {padding: Platform.select({ios: 16, default: 12})},
});
```

Platform extension files are resolved at bundle time, so only the chosen file ends up in the
bundle for that platform. That makes them the cheaper option for a large difference — the
Android bundle never carries the iOS implementation.

## Common mistakes

- **Reading an iOS-only property without narrowing.** Wrong: `const tablet = Platform.isPad;`
  Right: `const tablet = Platform.OS === 'ios' && Platform.isPad;`. `Platform` is a union in
  0.87, so `isPad` does not exist on the Android member and the unnarrowed read is a compile
  error.
- **Comparing `Platform.Version` without narrowing.** It is `string | number` across the union:
  a version string on iOS, an API level number on Android. `Platform.Version >= 33` only
  type-checks after `Platform.OS === 'android'`.
- **Omitting `default` from `Platform.select`.** The type says you get a value; the runtime gives
  you `undefined` on any platform you did not list. Wrong:
  `Platform.select({ios: 16, android: 12})`. Right: add `default: 12`.
- **Using `Platform.OS` where the real question is screen size.** `Platform.OS === 'ios'` does
  not tell you whether you are on an iPad, a phone in split screen, or a folded foldable. Use
  `useWindowDimensions()`.
- **Branching on platform inside JSX, repeatedly.** Ten `Platform.OS === 'ios' ? a : b`
  expressions in one screen means the difference belongs in a token module or a platform file.
- **Assuming `.native.tsx` beats `.ios.tsx`.** It does not. The concrete platform extension wins;
  `.native` is the fallback for "any non-web platform".
- **Keeping a platform-only import behind a runtime check.** `if (Platform.OS === 'ios')` does
  not stop the module at the top of the file from being bundled and evaluated. Use file
  extensions.

## Related topics

- [StyleSheet](stylesheet.md) — where the values produced here end up.
- [Shadows and Elevation](shadows-and-elevation.md) — the biggest genuine styling split between the two platforms.
- [Dark Mode](dark-mode.md) — `PlatformColor` and `DynamicColorIOS`, which are platform branching pushed down into the native layer.
- [Responsive and Tablet Layouts](responsive-layouts.md) — why screen size is a better question than platform.
- [Units and Density](units-and-density.md) — the other axis on which a number in a style means different things.
- [Platform Differences](../core-concepts/platform-differences.md) — the wider behavioural list beyond styling.
- [Platform Folders](../native-modules/platform-folders.md) — the same idea at the native-source level.
