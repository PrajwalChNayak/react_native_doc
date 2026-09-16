---
title: Fonts and Icons
description: What a custom font actually needs on the CLI path — native asset registration on both platforms — and how to draw icons without a font at all.
status: current
toolchain: cli
---

A custom font in React Native is not a JavaScript concern. `fontFamily: 'Inter'` is a lookup
against fonts the **native** side already knows about, so the font file has to be registered with
the platform before any style can name it. On the Community CLI path that means real changes
inside `ios/` and `android/`, not an import.

Icons are the same problem wearing a different hat. An icon font is a custom font. A vector icon
is a component. This page covers both, and is honest about which parts of the tooling are stable.

## Why it exists / when to use it — and when NOT to

Use a custom font when the brand genuinely requires one. The cost is real: every font file is
bundle size on both platforms, a cold-start cost while the typeface is loaded, and a per-weight
file you have to remember to ship.

Do **not** ship four weights when you use two. Do **not** ship a font at all if the system font
is acceptable — San Francisco on iOS and Roboto on Android are optimised for their platforms'
rendering and cost nothing.

For icons, prefer **vector components** over an icon font. A font gives you one colour, one glyph
per code point, and the same native registration problem. A vector gives you multiple colours,
any size without hinting artefacts, and no native setup.

## Basic example

Once a font is registered natively, using it is unremarkable — and this is the only part that
lives in JavaScript:

```tsx title=src/components/Heading.tsx
import {StyleSheet, Text} from 'react-native';

export function Heading({children}: {children: string}) {
  return <Text style={styles.heading}>{children}</Text>;
}

const styles = StyleSheet.create({
  heading: {
    // The family name, not the filename. On iOS this is the font's PostScript
    // family name; on Android it is the name you registered.
    fontFamily: 'Inter',
    fontWeight: '700',
    fontSize: 24,
  },
});
```

## How it works

### Registering a font, per platform

This is the whole job. Both platforms need the file inside the native project and a declaration
that it exists.

:::tabs
@tab iOS
1. Add the font file to the Xcode project so it ends up in the app bundle's **Copy Bundle
   Resources** build phase.
2. List the filename under `UIAppFonts` in the Info.plist.

```xml title=ios/YourApp/Info.plist
<key>UIAppFonts</key>
<array>
    <string>Inter-Regular.ttf</string>
    <string>Inter-Bold.ttf</string>
    <string>Inter-Italic.ttf</string>
</array>
```

The string is the **filename** as it appears in the bundle. The `fontFamily` you write in a style
is the font's PostScript family name, which is often different. If a font silently falls back to
the system face, that mismatch is the usual cause — open the file in Font Book and read the
Family Name.

iOS derives the weight and italic variants from the family, so `fontFamily: 'Inter'` plus
`fontWeight: '700'` picks the bold file, provided you shipped it.
@tab Android
1. Put the files in `android/app/src/main/assets/fonts/`.
2. Name them according to the convention `ReactFontManager` expects.

```text title=android/app/src/main/assets/fonts/
Inter.ttf
Inter_bold.ttf
Inter_italic.ttf
Inter_bold_italic.ttf
```

Read from `ReactAndroid/.../common/assets/ReactFontManager.kt` in the installed 0.87.1 package:
the asset path is `fonts/`, the accepted extensions are `.ttf` and `.otf`, and the recognised
suffixes are exactly `_bold`, `_italic` and `_bold_italic`. The base name is what you write as
`fontFamily`. Anything not found in `assets/fonts` falls back to the best matching system
typeface, silently.

There is a second, newer mechanism: an XML font family in `res/font/` registered at startup.

```kotlin title=android/app/src/main/java/com/yourapp/MainApplication.kt
import com.facebook.react.common.assets.ReactFontManager

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    // Registers res/font/inter.xml under the family name "Inter", so a single
    // declaration covers every weight and style you listed in that XML.
    ReactFontManager.getInstance().addCustomFont(this, "Inter", R.font.inter)
  }
}
```

This is what the CLI's asset-linking command generates, and it is the better option: Android
resolves the weight from the XML family instead of from a filename suffix, which makes
`fontWeight: '500'` work properly rather than snapping to regular or bold.
:::

### The asset-linking command

There is a CLI command that does the file copying, the `project.pbxproj` edit, the `UIAppFonts`
entry, the `res/font` XML and the `MainApplication` registration for you. Verified against the
real published package rather than from memory:

- The package is **`@react-native-community/cli-link-assets`**, version **20.2.0** (matching
  `@react-native-community/cli` 20.2.0).
- The command it registers is **`link-assets`**.
- It is **not installed by a fresh project** and it is **not a dependency of
  `@react-native-community/cli`**. You add it yourself and register the command.

```bash title=Install it as a dev dependency
npm install --save-dev @react-native-community/cli-link-assets
```

```js title=react-native.config.js
const linkAssets = require('@react-native-community/cli-link-assets');

module.exports = {
  // Where your font files live. Both platforms.
  assets: ['./assets/fonts'],
  project: {
    android: {
      // Android-only assets, if you have any.
      assets: [],
    },
    ios: {
      assets: [],
    },
  },
  // Without this the `link-assets` command does not exist.
  commands: [linkAssets.commands.linkAssets],
};
```

```bash title=Run it after adding or removing a font file
npx react-native link-assets
```

> [!WARNING] The package's own README calls this a legacy mechanism
> Quoting the installed 20.2.0 README: the command "isn't shipped by default because it uses a
> legacy method of modifying Xcode and Gradle files", and an autolinking-based replacement is
> described as in development. That is the maintainers' own assessment, not this handbook's. It
> works today; treat it as something that will be replaced, keep the resulting diff in version
> control, and be prepared to do the two steps by hand if a future CLI drops it.

The command writes a `link-assets-manifest.json` into both `android/` and `ios/`. Those files
track what is currently linked so the next run can add and remove correctly. **Commit them** — a
missing manifest makes the next run behave as if nothing was ever linked.

### Why `fontWeight` sometimes does nothing

The two platforms resolve weights differently, and this accounts for most "my medium weight looks
regular" reports.

| | iOS | Android |
| --- | --- | --- |
| Weight source | The font family's own variants, as registered from `UIAppFonts` | The filename suffix (`assets/fonts` path) or the XML font family (`res/font` path) |
| Weights available | Whatever files you shipped | `_bold` only, unless you use the XML family |
| Missing weight | Falls back to the nearest shipped weight | Synthesises a fake bold, which looks wrong |

If you need more than regular and bold on Android, use the `res/font` XML path — which is what
`link-assets` generates — rather than the filename-suffix path.

### Icons without a font

`react-native-svg` (**15.15.5**, listed in the verified library table) renders SVG as real native
views. An icon becomes a component with props, which means it can take a colour from your theme
and a size from your type scale.

```tsx title=src/icons/ChevronRight.tsx
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export function ChevronRight({size = 24, color = '#111111'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* `stroke` takes any ColorValue, so a theme colour drops straight in. */}
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
```

Used with the theme from [Dark Mode](dark-mode.md), the same component works in both appearances
with no second asset:

```tsx-fragment title=src/components/Row.tsx
import {Text, View} from 'react-native';
import {ChevronRight} from '../icons/ChevronRight';
import {useTheme} from '../theme/ThemeProvider';

export function Row({label}: {label: string}) {
  const theme = useTheme();
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
      <Text style={{color: theme.text, flexShrink: 1}}>{label}</Text>
      <ChevronRight color={theme.muted} />
    </View>
  );
}
```

> [!NOTE] Icon-font packages
> Several icon-font packages exist and are widely used. This handbook only names libraries whose
> React Native 0.87 and New Architecture support it has verified, and the icon-font packages
> checked while writing this page declare peer dependencies on tooling outside this handbook's
> scope. If you adopt one, run `npm view <pkg> version peerDependencies` yourself and check that
> its peers are packages you actually want in your project. The `react-native-svg` route above
> needs no such check — it is in the verified table.

## Platform differences

:::tabs
@tab iOS
- The family name in `fontFamily` is the **PostScript family name**, not the filename.
- `fontWeight` maps onto real shipped weights. A weight you did not ship falls back to the
  nearest one you did.
- `fontVariant` gives access to OpenType features — `tabular-nums` is the one worth knowing, for
  numbers in a list that should not jitter as they change.
- Fonts are loaded when the app launches. A large family adds to cold start.
@tab Android
- `includeFontPadding` is an Android-only `TextStyle` prop. Android reserves extra vertical space
  above and below text for accents; setting it to `false` removes that and is usually what makes
  Android text line up with an iOS design.
- The filename-suffix path recognises only `_bold`, `_italic` and `_bold_italic`. Anything else is
  ignored.
- A font the platform cannot find falls back to the system typeface **silently**. There is no
  warning, so a typo in `fontFamily` looks like "the font did not install".
- `fontFamily` on Android is case-sensitive and must match the registered name exactly.
:::

## Common patterns

### A type scale, not scattered font sizes

Fonts are where design systems leak into components fastest. One module, named sizes, and no
`fontSize: 15` anywhere else.

```ts title=src/theme/typography.ts
import {StyleSheet} from 'react-native';

export const type = StyleSheet.create({
  title: {fontFamily: 'Inter', fontWeight: '700', fontSize: 24, lineHeight: 30},
  body: {fontFamily: 'Inter', fontWeight: '400', fontSize: 16, lineHeight: 22},
  caption: {fontFamily: 'Inter', fontWeight: '400', fontSize: 13, lineHeight: 18},
  // Numbers that must not shift width as they change — timers, prices, counters.
  numeric: {fontFamily: 'Inter', fontSize: 16, fontVariant: ['tabular-nums']},
});
```

### Always set `lineHeight` with a custom font

Default line heights differ between the platforms and between fonts. A design that looks right on
iOS and cramped on Android almost always has no explicit `lineHeight`.

### Keep icons in one directory with one prop shape

Every icon takes `size` and `color` and nothing else. That uniformity is what lets you swap an
icon set later without touching call sites.

## Performance considerations

- **Every font file is shipped to every user.** Four weights of a variable-width family is
  routinely more than a megabyte across both platforms. Subset the font to the characters you
  actually render if your tooling allows it.
- **Fonts load at startup.** They contribute to cold start on both platforms. See
  [Startup Time](../performance/startup-time.md).
- **SVG icons are native views, not images.** Each `Path` is a node in the view tree. A dozen
  icons on a screen is nothing; a hundred complex paths inside list rows is a real cost — flatten
  the path or export a raster for those.
- **`fontVariant: ['tabular-nums']` prevents layout thrash.** A counter in a proportional font
  changes width as the digits change, which re-lays out its row every tick.

## Common mistakes

- **Expecting `fontFamily` to work after only adding the file to the repo.** The file has to be
  in the native project and declared — `UIAppFonts` on iOS, `assets/fonts` or a `res/font`
  registration on Android. Nothing in JavaScript registers a font.
- **Using the filename as `fontFamily` on iOS.** Wrong: `fontFamily: 'Inter-Regular'` when the
  PostScript family name is `Inter`. The result is a silent fallback to the system font.
- **Naming Android files with a hyphen.** Wrong: `Inter-Bold.ttf`. Right: `Inter_bold.ttf`. The
  loader looks for exactly `_bold`, `_italic` and `_bold_italic`.
- **Assuming `npx react-native link-assets` works out of the box.** The command lives in
  `@react-native-community/cli-link-assets`, which a fresh project does not install and the CLI
  does not depend on. Install it and register the command in `react-native.config.js` first.
- **Not committing `link-assets-manifest.json`.** Without it the next run cannot tell what is
  already linked, and you get duplicated Xcode references.
- **Shipping every weight of a family.** Bundle size on both platforms, for weights nobody uses.
- **Using an icon font for a multi-colour icon.** A glyph has one colour. Two-tone icons need a
  vector.
- **Forgetting `includeFontPadding: false` on Android.** The extra vertical space is why a
  perfectly centred iOS label sits slightly high on Android.

## Related topics

- [StyleSheet](stylesheet.md) — where `fontFamily` and the rest of the text styles live.
- [Units and Density](units-and-density.md) — `fontSize` against the user's font-scale setting.
- [Dark Mode](dark-mode.md) — why recolourable icons beat two asset variants.
- [Platform-Specific Styles](platform-specific-styles.md) — branching the one or two font values that genuinely differ.
- [Text](../components/text.md) — the component every one of these styles ends up on.
- [Autolinking and react-native.config.js](../native-modules/autolinking.md) — the same config file, doing its other job.
- [Bundle Size](../performance/bundle-size.md) — what a font family actually costs you.
- [Startup Time](../performance/startup-time.md) — where font loading shows up.
