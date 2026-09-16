---
title: How RN Differs from the Web
description: What a web developer has to unlearn — no DOM, no CSS files, no cascade, nothing scrolls by default, and units that are not pixels.
status: current
toolchain: cli
---

React Native uses React, JSX and JavaScript, which makes it look far more like web development
than it is. The component model transfers. Almost nothing below the component model does.

This page is the list of assumptions that will cost you an afternoon each if you carry them over.
Every claim here was checked against the installed `react-native@0.87.1` type definitions and the
official `@react-native/typescript-config`, not against memory.

## Why it exists / when to use it — and when NOT to

Read this if you are coming from React on the web. It is the shortest path to understanding why
your first screen looked wrong and why the fix was not the CSS you expected.

Skip it if you have never done web development. Nothing here is a prerequisite for the rest of the
handbook — it is a translation guide, and without the source language it is just a list of facts
you already have to learn anyway.

## There is no DOM

`View` is not a `div`. It is a handle on a real `UIView` on iOS and a real `android.view.View` on
Android. There is no document, no element, no `querySelector`, and no way to reach a component
except through a ref.

This is not a stylistic difference — the DOM globals genuinely do not exist. The official
`@react-native/typescript-config` that every project extends declares a curated `lib` list of
ECMAScript libraries and **deliberately omits `dom`**:

```ts-fragment title=Not a missing polyfill — a missing type
// error TS2584: Cannot find name 'document'.
// Do you need to change your target library? Try changing the 'lib'
// compiler option to include 'dom'.
export const el = document.getElementById('root');
```

Adding `"dom"` to `lib` would silence the compiler and change nothing at runtime, which is worse
than the error. Do not.

### What the runtime does give you

React Native's own global type declarations define a specific, small set of web-shaped APIs:

| Available | Notes |
| --- | --- |
| `console` | Logs go to Metro and to React Native DevTools |
| `setTimeout`, `setInterval`, `setImmediate`, `requestAnimationFrame` | Plus their `clear`/`cancel` counterparts |
| `fetch`, `Headers`, `Request`, `Response` | A `whatwg-fetch` polyfill over `XMLHttpRequest` |
| `XMLHttpRequest` | The real transport underneath `fetch` |
| `WebSocket` | |
| `URL`, `URLSearchParams` | |
| `FormData`, `Blob`, `File`, `FileReader` | `FormData` here has a `getParts()` method the web's does not |
| `AbortController`, `AbortSignal` | |
| `DOMRect` | The measurement shape, not a DOM node |
| `__DEV__` | `true` in development builds, `false` in release |
| `HermesInternal` | Present when running on Hermes |

Not present, and not polyfillable in any way that means anything: `document`, `window`, any
element type, `localStorage`, `sessionStorage`, `history`, `location`, `alert`, CSS object models,
or the `navigator` surface web code reaches for.

For persistence, use [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md) or
[Secure Storage](../state-and-data/secure-storage.md). For routing, there are no URLs — see
[React Navigation Fundamentals](../navigation/fundamentals.md).

## There are no CSS files

There is no stylesheet to link, no `class`, no `className`, no preprocessor step and nothing to
minify. Styles are JavaScript objects, and the `style` prop takes one, or an array of them.

Four consequences follow, and they are the ones that matter:

**No cascade, no selector engine, no specificity.** There is nothing to select with. No descendant
selectors, no `:hover`, no `!important`, no `@media`. Style resolution is array merging,
left to right, and nothing else. The last object that sets a property wins.

**No inheritance — with exactly one exception.** Setting `color` or `fontSize` on a `View` does
nothing to the `Text` inside it. The exception is a `Text` nested inside another `Text`, which does
inherit the parent's text styles:

```tsx title=The one place inheritance exists
import {StyleSheet, Text, View} from 'react-native';

export function Inheritance() {
  return (
    <View style={styles.wrapper}>
      {/* The wrapper's styles reach nothing. The nested Text inherits. */}
      <Text style={styles.paragraph}>
        Regular <Text style={styles.strong}>and emphasised</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {padding: 16},
  paragraph: {fontSize: 16, color: '#202124'},
  strong: {fontWeight: '700'},
});
```

The nested `Text` is size 16, colour `#202124` **and** bold. That is the whole inheritance story.

**No global reset, and no need for one.** Nothing arrives with browser default styles, so there is
nothing to normalise away.

**No `display: grid`, no `float`, no `inline-block`.** `display` accepts `none`, `flex` and
`contents`. Build grids from wrapped flex rows or a `FlatList` with `numColumns`.

See [StyleSheet](../styling/stylesheet.md) for how styles are declared and merged, and
[Flexbox in React Native](../styling/flexbox.md) for the layout system in detail.

## Layout is flexbox, and the defaults are not the web's

Every view is a flex container. `flexDirection` defaults to **`column`**, not `row`, which is the
single most common cause of "why is everything stacked vertically". Three other defaults differ —
`alignContent`, `flexShrink` and `boxSizing` — and
[Flexbox in React Native](../styling/flexbox.md) has the full table with the reason each one bites.

Media queries do not exist. Read the window size at runtime instead; see
[Dimensions and useWindowDimensions](../styling/dimensions.md).

## Nothing scrolls by default

On the web, a block whose content overflows gets a scrollbar or at least a way to reach the rest.
In React Native a `View` whose content is taller than itself simply **clips**. No scrollbar, no
warning, no overflow indicator.

```tsx title=One of these scrolls and one of them does not
import {ScrollView, StyleSheet, Text, View} from 'react-native';

export function Clipped() {
  // Content taller than 200 is invisible and unreachable.
  return (
    <View style={styles.box}>
      <Text>Long content…</Text>
    </View>
  );
}

export function Scrollable() {
  return (
    <ScrollView style={styles.box} contentContainerStyle={styles.content}>
      <Text>Long content…</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: {height: 200},
  content: {padding: 16},
});
```

Scrolling is a component you choose deliberately:

| Component | For |
| --- | --- |
| `ScrollView` | Bounded content — a form, a settings page. Every child is rendered and retained |
| `FlatList` | Data of any length. Only the visible window plus a buffer is rendered |
| `SectionList` | The same, with section headers |

The `ScrollView` / `FlatList` distinction has no web equivalent, because the browser virtualises
nothing for you and also never renders offscreen DOM you did not create. Getting it wrong is the
most common React Native performance mistake there is — see
[Virtualization and FlashList](../components/virtualization-and-flashlist.md).

`ScrollView` also splits styling in two: `style` sizes the scroll container, `contentContainerStyle`
styles the scrolling content. Putting `padding` in the wrong one produces a layout that looks
almost right.

## Units are density-independent pixels

Numbers in styles have no unit suffix, and they are not CSS pixels. `padding: 16` means 16
density-independent pixels — points on iOS, dp on Android — which is roughly the same physical size
on every device regardless of screen density.

There is no `px`, `rem`, `em`, `vh`, `vw`, `pt`, `ch` or `%` on most properties. Percentages work
on a subset of layout props as strings (`width: '50%'`). `fontSize` is in the same
density-independent units and scales separately with the user's font-size accessibility setting.

See [Units and Density](../styling/units-and-density.md) for `PixelRatio`, `hairlineWidth`, and why
you should not build a "scale to design width" helper.

## Text is a component, not a tag

Every string must have a `Text` ancestor. A bare string inside a `View` is an error, not a
rendering quirk. There is also no inline flow *between* components — an `<Image>` cannot sit inside
a paragraph of `Text` the way an `<img>` sits inside a `<p>`. Inline layout exists only inside a
single `Text` subtree.

`Text` also has no block/inline distinction to reason about, no `line-height: normal`, and no text
node concept you can manipulate.

## Events are not DOM events

`onPress` is not `onClick`. There is no `event.target` DOM node, no `preventDefault`, and no
capture/bubble phase over a document. Touch handling goes through the responder system, and
`pointerEvents` — either as a prop or a style — controls whether a subtree participates at all.

Hover, focus rings and the keyboard interaction model are largely absent, because most devices have
neither a mouse nor a hardware keyboard. Do not build interactions that depend on hover.

### The web-shaped aliases that do exist

React Native accepts a set of deliberately web-shaped props as aliases for its accessibility API.
They exist to make shared code and muscle memory work, not because there is a DOM underneath:

```tsx title=Web-shaped props, native behaviour
import {Pressable, StyleSheet, Text, View} from 'react-native';

export function WebShapedProps({label}: {label: string}) {
  return (
    <View id="card" style={styles.card} pointerEvents="box-none">
      <Pressable role="button" aria-label={label} tabIndex={0} style={styles.hit}>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {padding: 12},
  hit: {paddingVertical: 10},
  label: {fontSize: 16},
});
```

`id`, `role`, `aria-label`, `aria-hidden`, `aria-checked`, `tabIndex` and their siblings are all in
the 0.87 type surface. They map onto the platform accessibility APIs — VoiceOver and TalkBack —
and have nothing to do with HTML semantics.

## What does transfer

It is worth being explicit about the parts that are genuinely the same, because people over-correct:

- **React itself.** Components, props, state, hooks, context, `memo`, Suspense, error boundaries,
  the reconciler's rules. All identical.
- **JavaScript and TypeScript.** Modules, async/await, generators, the standard library.
- **`fetch` and promise-based data flow.** Including most data-fetching libraries.
- **Testing philosophy.** `@testing-library/react-native` mirrors the web library's API closely.
- **The component design instincts** you already have: composition, prop drilling versus context,
  when to lift state.

## Platform differences

The web is a single, forgiving target. React Native is two platforms with genuinely different
behaviour, and pretending otherwise is the second-biggest source of bugs after the layout defaults.

:::tabs
@tab iOS
The keyboard overlays the app rather than resizing it. `overflow: 'visible'` is honoured. Shadows
come from the `shadow*` props. Safe areas matter at both the top and the bottom.
@tab Android
The system resizes the window for the keyboard. Every view clips its children regardless of
`overflow`. Shadows come from `elevation`, which also affects z-ordering. The hardware back button
exists and must be handled.
:::

There is no browser-compatibility layer to hide this. See
[Platform Differences](platform-differences.md) for `Platform.OS`, `Platform.select` and the
platform-specific file extensions.

## Performance considerations

The performance model is different in kind, not degree:

- **There is no repaint/reflow model to optimise around.** The equivalent concepts are the render,
  commit and mount phases — see [The Render Pipeline](render-pipeline.md).
- **Offscreen content costs you.** A browser does not render DOM you did not create; a `ScrollView`
  renders and retains every child you gave it. Virtualization is your job.
- **There is no CSS-driven animation to fall back to.** Motion either runs on the native side or it
  runs on the JavaScript thread and competes with your app. See
  [Animated vs Reanimated](../animation/animated-vs-reanimated.md).
- **Bundle size matters differently.** There is no incremental download over a network; the bundle
  ships inside the app and is parsed (or, with Hermes, loaded as bytecode) at startup. See
  [Hermes and Bytecode](../performance/hermes-and-bytecode.md).

## Common mistakes

- **Reaching for `document` or `window`.** Wrong: `document.getElementById`, `window.innerWidth`.
  Right: a ref for the first, `useWindowDimensions()` for the second. The DOM globals are not
  merely unavailable — they are not in the type surface either.
- **Adding `"dom"` to `lib` in `tsconfig.json` to silence errors.** That makes the compiler agree
  with code that will throw at runtime. If a dependency needs the DOM, it is a web library.
- **Expecting a `View` to scroll.** Wrong: a tall column inside a `View`, then hunting for the
  missing content. Right: `ScrollView` for bounded content, `FlatList` for data.
- **Setting `color` on a container and expecting the text to pick it up.** There is no inheritance
  outside a `Text` subtree. Put the style on the `Text`, or make a themed `Text` component.
- **Assuming `flexDirection` is `row`.** It is `column`. Your row is stacked because you did not ask
  for a row.
- **Writing `padding: '16px'` or `fontSize: '1rem'`.** Numbers, no units. Strings are only valid for
  percentages on the properties that accept them.
- **Putting a string directly in a `View`.** Wrong: `<View>Hello</View>`. Right:
  `<View><Text>Hello</Text></View>`.
- **Using `ScrollView` with `.map()` over an array from an API.** It works with ten items and
  degrades badly with a thousand, and the fix is a rewrite rather than a prop.
- **Designing an interaction around hover or focus rings.** Most users have neither a pointer nor a
  keyboard. Design for touch, then add pointer affordances if you target tablets with trackpads.

## Related topics

- [The New Architecture](new-architecture.md) — what is actually running underneath.
- [The Render Pipeline](render-pipeline.md) — render, commit and mount instead of reflow and repaint.
- [JS Thread vs UI Thread](threading-model.md) — why there is more than one thread to think about.
- [Platform Differences](platform-differences.md) — iOS and Android are not one target.
- [Flexbox in React Native](../styling/flexbox.md) — the layout defaults in full.
- [StyleSheet](../styling/stylesheet.md) — how styles are declared, merged and typed.
- [Units and Density](../styling/units-and-density.md) — what a number in a style means.
- [Your First Screen](../getting-started/your-first-screen.md) — all of this applied at once.
