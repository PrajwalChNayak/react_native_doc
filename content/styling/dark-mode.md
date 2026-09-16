---
title: Dark Mode
description: useColorScheme in 0.87, the Appearance override API, and PlatformColor / DynamicColorIOS for colours the OS resolves for you.
status: current
toolchain: cli
---

Dark mode in React Native is a value you read and branch on. `useColorScheme()` tells you which
appearance the OS is in, you pick a palette, and the tree re-renders. There is no media query, no
CSS variable and no automatic inversion of your colours.

Two things changed in 0.87 that break existing code in quiet ways: the hook's return type lost
its third value, and the `Appearance` override API renamed its "follow the system" argument. Both
are covered below.

## Why it exists / when to use it — and when NOT to

Support dark mode because the OS-level setting is now a system-wide user preference, and an app
that ignores it is a white rectangle at 2am. It is also an accessibility setting for some users,
not a style choice.

Do **not** build a dark mode by inverting your existing palette programmatically. Dark themes are
not light themes with the luminance flipped: shadows stop working, brand colours lose contrast,
and pure black backgrounds with pure white text are harder to read than a dark grey with a soft
white. Define both palettes explicitly.

Do **not** reach for `PlatformColor` when you have a brand palette. It is the right tool when you
want the platform's own colours — a system background, a separator, a system blue — so your
screen matches the OS chrome around it. It is the wrong tool for colours a designer chose.

## Basic example

```tsx title=src/theme/ThemeProvider.tsx
import {createContext, useContext, useMemo} from 'react';
import type {ReactNode} from 'react';
import {useColorScheme} from 'react-native';

type Theme = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  isDark: boolean;
};

const LIGHT: Theme = {
  background: '#ffffff',
  surface: '#f4f4f5',
  text: '#111111',
  muted: '#6b7280',
  isDark: false,
};

// Not an inversion of LIGHT. A near-black surface and an off-white text colour
// read better than #000 on #fff reversed.
const DARK: Theme = {
  background: '#0b0b0f',
  surface: '#17171c',
  text: '#f2f2f5',
  muted: '#9ca3af',
  isDark: true,
};

const ThemeContext = createContext<Theme>(LIGHT);

export function ThemeProvider({children}: {children: ReactNode}) {
  // 'light' | 'dark' | null. Anything that is not 'dark' falls back to light.
  const scheme = useColorScheme();
  const theme = useMemo(() => (scheme === 'dark' ? DARK : LIGHT), [scheme]);
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
```

## How it works

### `useColorScheme()` returns `ColorSchemeName | null`

Verified from the installed 0.87.1 types:

```ts title=The signature, from types_generated
import type {ColorSchemeName} from 'react-native';

// ColorSchemeName is exactly 'light' | 'dark'.
export const example: ColorSchemeName = 'dark';

// useColorScheme() is declared as: () => ColorSchemeName | null
```

> [!WARNING] The third return value was removed in 0.87
> Through 0.86 the hook could return a third string meaning "the system has expressed no
> preference". In 0.87 the type is `ColorSchemeName | null` and that string is gone. Code written
> as `scheme === 'light' ? light : scheme === 'dark' ? dark : fallback` still compiles — the
> middle branch just stops being reachable in the way you expected. Compare against `'dark'` and
> treat everything else, `null` included, as light.

The `null` case is narrow. The type definition says it occurs only when the native `Appearance`
module is unavailable, which in practice means an out-of-tree platform. You still have to handle
it, because the type forces you to, but it is not a case you will see on iOS or Android.

### The `Appearance` module

`Appearance` is exported from the package root as a namespace. Its three functions, read from the
installed types:

| Function | Signature |
| --- | --- |
| `getColorScheme()` | `() => ColorSchemeName \| null` |
| `setColorScheme(colorScheme)` | takes `'light' \| 'dark' \| 'auto'` |
| `addChangeListener(listener)` | `(preferences: {colorScheme: ColorSchemeName \| null}) => void`, returns an `EventSubscription` |

`setColorScheme` overrides the appearance for **your app only**; it does not touch the system
setting. Pass `'auto'` to drop the override and follow the system again.

> [!DEPRECATED] The old "follow the system" argument
> `Appearance.setColorScheme` used to take a fourth string meaning "no override". That argument
> is deprecated in 0.87 and the current value is **`'auto'`**. The old value still appears in the
> `ColorSchemeOverride` union for compatibility and still maps to follow-the-system in the
> Android module, but new code should pass `'auto'`.

```tsx title=src/theme/useThemePreference.ts
import {useCallback, useEffect, useState} from 'react';
import {Appearance} from 'react-native';
import type {ColorSchemeName} from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'auto';

/**
 * A three-way preference — the shape almost every app's settings screen wants.
 * 'auto' is the only value that lets the OS decide.
 */
export function useThemePreference(): {
  scheme: ColorSchemeName | null;
  setPreference: (preference: ThemePreference) => void;
} {
  const [scheme, setScheme] = useState<ColorSchemeName | null>(
    Appearance.getColorScheme(),
  );

  useEffect(() => {
    // Fires for both system changes and your own setColorScheme calls.
    const subscription = Appearance.addChangeListener((preferences) => {
      setScheme(preferences.colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setPreference = useCallback((preference: ThemePreference) => {
    Appearance.setColorScheme(preference);
  }, []);

  return {scheme, setPreference};
}
```

`useColorScheme()` is a thin wrapper over `addChangeListener` and is what you should use inside
components. Reach for `Appearance` directly only when you are outside React — reading the initial
value before the tree mounts, or setting an override from a settings handler.

### `PlatformColor`

`PlatformColor(...names: string[])` returns a `NativeColorValue`, an opaque value the native side
resolves per platform. The point is that the OS, not you, decides what the colour is in each
appearance — so it tracks dark mode with no code of yours involved.

```ts title=src/theme/systemColors.ts
import {Platform, PlatformColor} from 'react-native';
import type {ColorValue} from 'react-native';

/**
 * Platform.select infers its type argument from the first entry, and
 * PlatformColor returns an opaque NativeColorValue rather than a string. Give
 * it an explicit ColorValue so the '#ffffff' default is assignable.
 */
export const systemBackground: ColorValue = Platform.select<ColorValue>({
  // iOS: UIKit semantic colour names.
  ios: PlatformColor('systemBackground'),
  // Android: a resource path or a theme attribute, not a bare name.
  android: PlatformColor('?android:attr/colorBackground'),
  default: '#ffffff',
});

export const separator: ColorValue = Platform.select<ColorValue>({
  ios: PlatformColor('separator'),
  android: PlatformColor('?android:attr/listDivider'),
  default: '#d4d4d8',
});
```

The two platforms take different name spaces, and this is the part people get wrong:

- **iOS** takes UIKit semantic colour names — `systemBackground`, `label`, `secondaryLabel`,
  `separator`, `systemBlue`, and so on.
- **Android** takes resource paths. `ColorPropConverter.kt` in the installed package resolves
  either a resource (`@color/name`, `@android:color/name`) or a theme attribute (`?attr/name`,
  `?android:attr/name`). A bare word is not a valid Android name.

Passing several names makes them a fallback chain: the native side resolves them in order and
uses the first one that exists. If **none** resolve it throws, so a typo is a runtime crash, not
a silently wrong colour. Test every `PlatformColor` name on a real device.

### `DynamicColorIOS`

`DynamicColorIOS` is **iOS only** — the name says so and the types mark it `@platform ios`. It
takes your own colours and hands them to UIKit to switch between, which means the switch happens
natively without a React re-render.

```ts title=src/theme/dynamicColors.ts
import {DynamicColorIOS, Platform} from 'react-native';
import type {ColorValue} from 'react-native';

/**
 * The tuple type is {light, dark, highContrastLight?, highContrastDark?}.
 * The two high-contrast slots are used when the user has turned on Increase
 * Contrast in iOS accessibility settings.
 */
export const cardBackground: ColorValue =
  Platform.OS === 'ios'
    ? DynamicColorIOS({
        light: '#ffffff',
        dark: '#17171c',
        highContrastLight: '#ffffff',
        highContrastDark: '#000000',
      })
    : '#ffffff';
```

Use it when you want your own brand colours but want iOS to do the switching — for example in a
style that is handed to a native component you do not re-render. On Android the equivalent is a
`values-night` resource referenced through `PlatformColor`.

## Platform differences

:::tabs
@tab iOS
The appearance comes from `UITraitCollection`. `Appearance.setColorScheme` sets the app's
override; the system setting is untouched.

To opt your app **out** of dark mode entirely, set the appearance in the Info.plist rather than
fighting it in JavaScript:

```xml title=ios/YourApp/Info.plist
<key>UIUserInterfaceStyle</key>
<string>Light</string>
```

With that key present, the OS reports light to your app regardless of the system setting, and
`useColorScheme()` returns `'light'`. Remove the key to support both.

Colour changes are live: a `DynamicColorIOS` value or a `PlatformColor` value updates when the
user flips the setting without any React work.
@tab Android
The appearance comes from the configuration's night mode. `AppearanceModule.kt` in the installed
package implements `setColorScheme` by calling `AppCompatDelegate.setDefaultNightMode` —
`MODE_NIGHT_YES` for `'dark'`, `MODE_NIGHT_NO` for `'light'`, and `MODE_NIGHT_FOLLOW_SYSTEM` for
`'auto'`.

That has a consequence with no iOS equivalent: changing night mode can **recreate the activity**.
Anything you hold only in memory across that transition has to be restorable, which is the same
requirement rotation already imposes.

Native-side colours — the splash screen, the status bar area, anything drawn before JavaScript
runs — come from resource qualifiers, not from your theme object:

```xml title=android/app/src/main/res/values-night/colors.xml
<resources>
    <color name="splash_background">#0b0b0f</color>
</resources>
```

Android also has a "force dark" feature that inverts an app's colours automatically. Do not rely
on it: it produces poor results on a React Native tree and it is not applied consistently.
:::

## Common patterns

### One theme object, read through a hook

The pattern in the basic example above is the whole architecture. Screens never call
`useColorScheme()` themselves; they call `useTheme()`. That means adding a third theme later — a
high-contrast one, a brand variant — touches one file.

### Respect the user's explicit choice over the system

Most apps want three states, not two: light, dark, and follow-the-system. Persist the choice and
apply it on startup.

```tsx title=src/theme/applyStoredPreference.ts
import {Appearance} from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'auto';

/**
 * Call this once during startup, after reading the stored preference. Passing
 * 'auto' removes any previous override rather than guessing a scheme.
 */
export function applyStoredPreference(preference: ThemePreference): void {
  Appearance.setColorScheme(preference);
}
```

Where to persist it: a small key-value store, not a secure one. See
[AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md).

### Shadows do not survive the switch

A drop shadow on a dark background is invisible — there is nothing darker to shade against. The
usual substitute is a lighter surface colour plus a subtle border.

```ts title=src/theme/elevationForScheme.ts
import {StyleSheet} from 'react-native';
import type {ViewStyle} from 'react-native';

const light: ViewStyle = {
  backgroundColor: '#ffffff',
  boxShadow: [{offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.12)'}],
};

// In dark mode, depth comes from a lighter surface and a hairline, not a shadow.
const dark: ViewStyle = {
  backgroundColor: '#17171c',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: '#2a2a32',
};

export function surfaceStyle(isDark: boolean): ViewStyle {
  return isDark ? dark : light;
}
```

### Images and logos need a variant

A dark logo on a dark background disappears. Either ship two assets and pick one from the theme,
or use a vector you can recolour — see [Fonts and Icons](fonts-and-icons.md).

## Performance considerations

- **A scheme change re-renders everything below the provider.** That is correct and unavoidable;
  it happens twice a day at most. Do not memoise defensively around it.
- **Memoise the theme object.** An unmemoised object literal in the provider re-renders every
  consumer on every provider render, not only on a scheme change. See [Context](../state-and-data/context.md).
- **`PlatformColor` and `DynamicColorIOS` avoid the re-render entirely.** The switch happens in
  the native layer. For a screen made mostly of system-coloured chrome that is measurably
  cheaper, and it makes the transition animate the way the OS animates its own.
- **Do not compute colours per render.** Building a palette with a colour-manipulation function
  inside a component body runs on every render on the JS thread. Precompute both palettes at
  module scope.

## Common mistakes

- **Comparing against the removed third value.** Wrong:
  `scheme === 'light' ? l : scheme === 'dark' ? d : systemDefault`. Right:
  `scheme === 'dark' ? d : l`. The middle value no longer exists in 0.87, so the third branch is
  reachable only for `null`.
- **Treating `null` as an error.** It means the native module did not report, which on iOS and
  Android does not happen. Fall back to light rather than rendering a spinner.
- **Passing the old override string to `setColorScheme`.** Use `'auto'`. The old value is
  deprecated.
- **Assuming `setColorScheme` changes the device setting.** It sets an app-level override only.
  Users who then change the system setting do not see your app follow unless you pass `'auto'`.
- **Using a bare name with `PlatformColor` on Android.** Wrong: `PlatformColor('colorBackground')`.
  Right: `PlatformColor('?android:attr/colorBackground')`. Android needs a resource path or a
  theme attribute, and an unresolvable name throws at runtime.
- **Using `DynamicColorIOS` without a platform check.** It is iOS-only. Calling it on Android
  produces a value the Android side cannot resolve.
- **Inverting the light palette to make the dark one.** Pure white text on pure black is harsher
  than the platforms' own dark themes, and brand colours tuned for a white background usually
  fail contrast on black.
- **Forgetting the native side.** The splash screen, the launch background and any native view
  you host come from resource qualifiers and Info.plist keys, not from your JavaScript theme.

## Related topics

- [Context](../state-and-data/context.md) — the provider the theme lives in, and its re-render cost.
- [Platform-Specific Styles](platform-specific-styles.md) — `Platform.select`, used above to pick a colour source.
- [Shadows and Elevation](shadows-and-elevation.md) — why the dark theme usually wants a border instead.
- [Fonts and Icons](fonts-and-icons.md) — recolourable icons so a logo survives the switch.
- [StyleSheet](stylesheet.md) — where the resolved colours end up.
- [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) — persisting the user's choice.
- [Accessibility APIs](../platform-apis/accessibility.md) — the high-contrast settings `DynamicColorIOS` exposes.
