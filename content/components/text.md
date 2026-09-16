---
title: Text
description: The only component that renders strings — nesting, truncation, font scaling, and the platform differences that actually bite.
status: current
toolchain: cli
---

`Text` is the only component that can render a string. It lays out with text layout rather than
flexbox, so nested elements flow and wrap at the end of a line instead of being positioned as
rectangles. It maps to `UITextView`-family rendering on iOS and to a `TextView` on Android.

Every visible word in your app goes through this component, which makes its accessibility and
font-scaling behaviour worth understanding once rather than rediscovering per screen.

## Why it exists / when to use it — and when NOT to

Use `Text` for any string. There is no alternative in core.

Do not use it when:

- **You want a tappable region larger than the glyphs.** `Text` has `onPress`, but the hit area
  is the text box. For a button, wrap it in [Pressable](pressable-and-touchables.md), which
  gives you `hitSlop`, pressed state and correct accessibility roles.
- **You need an editable field.** That is [TextInput](textinput.md).
- **You need rich text with images inline.** React Native has no inline-image support in
  `Text`. Lay out separate elements, or render with `react-native-svg`.

## Basic example

```tsx title=src/components/PostHeader.tsx
import {View, Text, StyleSheet} from 'react-native';

type Props = {
  title: string;
  author: string;
  excerpt: string;
};

export function PostHeader({title, author, excerpt}: Props) {
  return (
    <View style={styles.host}>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.meta}>
        by <Text style={styles.author}>{author}</Text>
      </Text>
      <Text style={styles.excerpt} numberOfLines={3} ellipsizeMode="tail">
        {excerpt}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {gap: 4},
  title: {fontSize: 20, fontWeight: '700', lineHeight: 26},
  meta: {fontSize: 13, color: '#6b7280'},
  author: {fontWeight: '600', color: '#111827'},
  excerpt: {fontSize: 15, lineHeight: 21},
});
```

## How it works

### Nesting and style inheritance

`Text` is the one place in React Native where style inherits, and it inherits only from a
parent `Text`, not from a parent `View`. A nested `Text` picks up the outer font family, size,
colour and weight, then overrides what it sets itself. That is how you get a bold word inside a
sentence without breaking the line box.

There is no global "app font". If you want one, you build it yourself with a wrapper component
that applies your base text style — not by setting `fontFamily` on a `View`, which does
nothing.

```tsx title=src/components/AppText.tsx
import type {TextProps} from 'react-native';
import {Text, StyleSheet} from 'react-native';

// One place to set the app's default typography. Everything else composes on top,
// so a later font change is a one-line diff instead of a codebase-wide search.
export function AppText({style, ...rest}: TextProps) {
  return <Text {...rest} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {fontFamily: 'System', fontSize: 15, color: '#111827'},
});
```

### Truncation: `numberOfLines` and `ellipsizeMode`

`numberOfLines` clamps the rendered line count and truncates the rest; `0` means no limit.
`ellipsizeMode` decides where the ellipsis goes: `'clip'`, `'head'`, `'middle'` or `'tail'`
(the default).

`numberOfLines` truncates. It does not shrink the text. If you need the text to shrink to fit a
fixed box, that is `adjustsFontSizeToFit`, and the two interact — see the platform tabs below.

### Font scaling and accessibility

`allowFontScaling` defaults to `true`, so your text grows when the user raises the OS text
size. That is the correct default and you should almost never turn it off.

What you often *do* want is a ceiling, so a user at 300% text size does not turn a two-line
card into a scrolling wall. `maxFontSizeMultiplier` sets that ceiling:

- `undefined` inherits from the parent `Text` or the global default.
- `0` means no maximum.
- Any value `>= 1` caps the multiplier at that value.

```tsx title=Capping growth without disabling it
import {Text, StyleSheet} from 'react-native';

export function CompactLabel({children}: {children: string}) {
  // The label lives in a fixed-height chip, so cap growth at 1.4x rather than
  // switching scaling off and breaking accessibility outright.
  return (
    <Text style={styles.label} maxFontSizeMultiplier={1.4} numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {fontSize: 12, fontWeight: '600'},
});
```

> [!BEST-PRACTICE] Cap, do not disable
> `allowFontScaling={false}` makes your app unusable for people who need large type. A
> `maxFontSizeMultiplier` keeps the layout intact while still honouring the user's setting.

### Measuring rendered lines

`onTextLayout` fires with the geometry of every rendered line, which is how you build a
"Read more" control that only appears when the text was actually truncated.

```tsx title=Show "Read more" only when the text overflows
import {useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import type {TextLayoutEvent} from 'react-native';

const COLLAPSED_LINES = 3;

export function Expandable({body}: {body: string}) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  function handleTextLayout(event: TextLayoutEvent) {
    // Only trust the first measurement, taken while still collapsed.
    if (!expanded) {
      setTruncated(event.nativeEvent.lines.length >= COLLAPSED_LINES);
    }
  }

  return (
    <View>
      <Text
        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        onTextLayout={handleTextLayout}>
        {body}
      </Text>
      {truncated ? (
        <Pressable onPress={() => setExpanded(value => !value)}>
          <Text>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

## Platform differences

These are real, verified differences — not stylistic preferences.

:::tabs
@tab iOS
- **`ellipsizeMode` works with any `numberOfLines`.** `'head'`, `'middle'` and `'tail'` all
  behave as documented on multi-line text.
- **`adjustsFontSizeToFit`** shrinks the font to fit the constraints, with
  `minimumFontScale` (0.01–1.0) as the floor. In the 0.87 types `minimumFontScale` is marked
  `@platform ios`.
- **`dynamicTypeRamp`** opts a text node into a named iOS Dynamic Type ramp (`'body'`,
  `'headline'`, `'largeTitle'`, and so on) so it scales the way system text does.
- **`suppressHighlighting`** turns off the grey oval that iOS draws on press-down for a `Text`
  with `onPress`. There is no Android equivalent because Android does not draw one.
- **`lineBreakStrategyIOS`** (`'none'` by default) controls hyphenation and line breaking;
  `'push-out'` and `'hangul-word'` matter for CJK and Korean text.
@tab Android
- **`ellipsizeMode` is limited.** With `numberOfLines` greater than 1, only `'tail'` works
  correctly. The 0.87 type definition says so explicitly. If your design calls for a middle
  ellipsis on wrapped text, it will look wrong on Android — truncate the string yourself.
- **`textBreakStrategy`** (`'highQuality'` by default) trades layout time for better line
  breaks. `'simple'` is measurably faster in long lists.
- **`android_hyphenationFrequency`** (`'none'` by default) enables automatic hyphenation.
- **`dataDetectorType`** turns phone numbers, links or emails into tappable spans. iOS has the
  equivalent on `TextInput`, not on `Text`.
- **`selectionColor`** sets the highlight colour when `selectable` text is selected. There is
  no iOS counterpart on `Text`.
- **`includeFontPadding`** (a style property, not a prop) is on by default and adds the font's
  ascender/descender padding. Setting it to `false` is the usual fix when Android text sits a
  few pixels lower than the iOS build.
:::

The most common cross-platform surprise is vertical alignment. iOS centres text in its line
box differently from Android's font padding, so a `lineHeight` that looks right on one platform
often needs `includeFontPadding: false` on the other.

## Common patterns

### Selectable text

`selectable` lets the user long-press to select and copy. It is off by default because
selection interferes with scroll and press gestures.

```tsx title=Copyable identifiers
import {Text, StyleSheet} from 'react-native';

export function OrderId({value}: {value: string}) {
  return (
    <Text selectable style={styles.mono}>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  mono: {fontVariant: ['tabular-nums'], fontSize: 13},
});
```

### A link inside a sentence

Nesting keeps the link in the text flow, which wrapping in a `Pressable` would break.

```tsx title=An inline link
import {Text, Linking, StyleSheet} from 'react-native';

export function Consent() {
  return (
    <Text style={styles.body}>
      By continuing you accept our{' '}
      <Text
        style={styles.link}
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL('https://example.com/terms');
        }}>
        terms of service
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  body: {fontSize: 14, lineHeight: 20},
  link: {color: '#2563eb', textDecorationLine: 'underline'},
});
```

Note `accessibilityRole="link"` on the inner `Text`. Without it, a screen reader announces the
whole paragraph as plain text and the user has no way to know the link is there.

## Performance considerations

**Text measurement is not free.** Every `Text` node is measured on the layout pass, and complex
nesting multiplies the work. In a list row, prefer one `Text` with a nested span over three
sibling `Text` nodes stacked in a `View` — you save both measurement and native views.

**`textBreakStrategy="simple"` on Android** is a genuine win in long scrolling lists, where
high-quality line breaking is recomputed for every recycled row and no one reads the text
closely enough to notice.

**Avoid `adjustsFontSizeToFit` in list rows.** It forces a measure-shrink-remeasure cycle per
row. Design the row so the text fits at one size, and truncate with `numberOfLines` instead.

**Do not compute derived data inside JSX in a hot list.** A template string is cheap, but
`{items.filter(predicate).length}` written inline is a full array pass on every render of every
row. Compute derived values once, above the return.

**Inline style arrays defeat memoisation.** `style={[styles.base, {color}]}` allocates a new
array every render. If the row is `React.memo`'d, hoist the two combinations into
`StyleSheet.create` entries and pick between them.

## Common mistakes

- **Setting `fontFamily` on a `View` and expecting children to inherit it.** Only `Text`
  inherits, and only from a parent `Text`. Build an `AppText` wrapper instead.
- **Using `ellipsizeMode="middle"` with `numberOfLines={2}` on Android.** Only `'tail'` is
  correct there for multi-line text. The iOS build will look right and the Android build will
  not, which is why it reaches production.
- **`allowFontScaling={false}` to "fix" a layout.** It fixes the layout by breaking
  accessibility. Cap with `maxFontSizeMultiplier` instead, or let the container grow.
- **Expecting `numberOfLines` to shrink text.** It truncates. Shrinking is
  `adjustsFontSizeToFit`, and the two together mean "shrink, then truncate what still does not
  fit".
- **Wrapping a whole paragraph in `Pressable` to make one phrase tappable.** The hit area
  becomes the paragraph. Nest a `Text` with `onPress` and `accessibilityRole="link"` instead.
- **Forgetting that `lineHeight` is in points, not a multiplier.** `lineHeight: 1.4` produces
  1.4 points of line height and overlapping glyphs, not 140% leading.
- **Assuming vertical centring matches across platforms.** Android's `includeFontPadding`
  shifts the baseline. Set it to `false` when you need pixel parity.

## Related topics

- [View](view.md) — the container `Text` usually sits in.
- [TextInput](textinput.md) — the editable counterpart.
- [Fonts and Icons](../styling/fonts-and-icons.md) — loading custom fonts on both platforms.
- [Accessibility APIs](../platform-apis/accessibility.md) — roles, labels and screen reader behaviour.
- [Dark Mode](../styling/dark-mode.md) — colour tokens for text that works in both schemes.
- [List Performance](../performance/list-performance.md) — why text measurement shows up in list profiles.
