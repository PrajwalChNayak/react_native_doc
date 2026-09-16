---
title: Styling Approaches Compared
description: StyleSheet, inline objects, styled-components-style libraries and utility libraries — what each costs per render, and what Fabric does and does not care about.
status: current
toolchain: cli
---

React Native ships one styling primitive: a plain object handed to a `style` prop. Everything
else — `StyleSheet.create`, template-literal libraries, utility-class libraries — is a way of
producing that object. Knowing that is most of the analysis, because it tells you where the cost
of each approach actually lands: in the JavaScript that builds the object, not in the renderer
that consumes it.

This page compares the options honestly, including the ones this handbook does not recommend.

## Why it exists / when to use it — and when NOT to

The decision matters more in React Native than on the web, for two reasons. There is no CSS file
to cache and no selector engine, so every style is computed by your JavaScript on the JS thread —
the same thread that handles touches. And screens stay mounted in a navigator, so an approach
that re-renders broadly re-renders screens the user cannot see.

If you are starting a project and have no strong requirement, use `StyleSheet` plus a theme
object. It is in core, it has no peers to keep compatible across React Native upgrades, and it is
the baseline every other option is measured against. Reach past it when you have a concrete
problem it does not solve.

## The comparison

Versions were read with `npm view <pkg> version peerDependencies` on 2026-09-12. Only packages
whose manifests were actually checked are listed; see the note after the table about what a peer
range does and does not prove.

| | `StyleSheet` | Inline objects | `styled-components` | `@shopify/restyle` | `react-native-unistyles` | `nativewind` / `twrnc` |
| --- | --- | --- | --- | --- | --- | --- |
| Ships with React Native | Yes | Yes | No | No | No | No |
| Version checked | core 0.87.1 | core 0.87.1 | 6.5.3 | 2.4.5 | 3.3.0 | 4.2.6 / 4.16.0 |
| Declared `react-native` peer | — | — | `>= 0.68.0` | `*` | `>= 0.76.0` | none / `>= 0.62.2` |
| Extra required peers | none | none | `react-dom`, `css-to-react-native` | none | Nitro Modules, Reanimated, edge-to-edge, normalize-colors | `tailwindcss` (nativewind) |
| Style identity across renders | Stable (module scope) | New object every render | New object when props change | New object per render unless memoised | Library-managed | Cached by class string |
| Type safety | `ViewStyle` / `TextStyle` | `ViewStyle` / `TextStyle` | Template literal, weak | Strong — theme-typed props | Typed theme | String literals, weak |
| Theming | Bring your own | Bring your own | Built in via context | Built in, the main feature | Built in | Via config file |
| Native configuration needed | No | No | No | No | **Yes** (Nitro) | Build-time step |
| Debuggability | Plain objects in the profiler | Plain objects | Extra component layer in the tree | Plain objects | Opaque | Class string in props |

> [!NOTE] What a peer range proves, and what it does not
> `styled-components` declares `react-native: >= 0.68.0`. That range *admits* 0.87, but an
> open-ended lower bound with no upper bound is not the maintainers asserting they tested against
> it. `nativewind` declares no `react-native` peer at all, so its manifest asserts nothing about
> React Native versions in either direction. `react-native-unistyles` is the one entry whose
> manifest is unambiguous about the architecture: it requires `react-native-nitro-modules`, and
> Nitro only exists on the New Architecture. Check the peers yourself before adopting any of
> them, and check them again at every React Native upgrade.

None of the third-party libraries above are installed in this handbook's type-check harness, so
their code samples below are marked as fragments and are **not** compiled. The `StyleSheet` and
inline-object samples are compiled against the real 0.87.1 types.

## Basic example

The same card, four ways.

```tsx title=StyleSheet — the baseline
import {StyleSheet, Text, View} from 'react-native';

export function Card({title}: {title: string}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {padding: 16, borderRadius: 12, backgroundColor: '#ffffff'},
  title: {fontSize: 17, fontWeight: '600'},
});
```

```tsx title=Inline — correct, and the one to use sparingly
import {Text, View} from 'react-native';

export function Card({title}: {title: string}) {
  // Both objects are allocated on every render of Card.
  return (
    <View style={{padding: 16, borderRadius: 12, backgroundColor: '#ffffff'}}>
      <Text style={{fontSize: 17, fontWeight: '600'}}>{title}</Text>
    </View>
  );
}
```

```tsx-fragment title=styled-components — a template-literal library
import styled from 'styled-components/native';

const CardView = styled.View`
  padding: 16px;
  border-radius: 12px;
  background-color: ${(props) => props.theme.surface};
`;

const CardTitle = styled.Text`
  font-size: 17px;
  font-weight: 600;
`;

export function Card({title}: {title: string}) {
  return (
    <CardView>
      <CardTitle>{title}</CardTitle>
    </CardView>
  );
}
```

```tsx-fragment title=A utility-class library
import {Text, View} from 'react-native';

export function Card({title}: {title: string}) {
  return (
    <View className="p-4 rounded-xl bg-white">
      <Text className="text-base font-semibold">{title}</Text>
    </View>
  );
}
```

## How it works

### Every approach ends at the same place

Whatever you write, the renderer receives a style object. `StyleSheet.create` is documented in the
0.87 types as an identity function — it returns the object you gave it. A template-literal library
parses its CSS string into that same object. A utility library maps a class string to it.

The differences are therefore entirely about **when** and **how often** that object is produced,
and what else the approach drags in.

### Where the cost lands under Fabric

Fabric compares the previous and next props of each shadow node and commits only what changed.
Two consequences that decide this whole comparison:

1. **A newly allocated but identical style object does not produce a native update.** Fabric
   compares values, not references, so `{padding: 16}` built fresh each render results in an empty
   commit. The inline-object penalty is not "it re-renders the native view".
2. **The penalty is upstream, in React.** A new object identity is a changed prop, so
   `React.memo` on the receiving component does not short-circuit and that subtree re-renders on
   the JS thread. In a `FlatList` that is the difference between re-rendering one row and
   re-rendering every visible row.

So the rule "do not use inline styles" is true, but the reason usually given for it — Bridge
serialisation — describes an architecture that was removed in 0.82. The real reason is React
render cost and memo defeat. On a leaf `View` that nothing memoises, an inline style is fine.

### What a template-literal library adds

`styled-components` and its relatives produce a **component** per style, not a style object. That
has two effects that do not show up in a micro-benchmark:

- **An extra fibre per styled element.** `<CardView>` is a component that renders a `View`. A
  screen with forty styled elements has forty extra components in the tree, each with its own
  render, reconciliation and profiler row.
- **Interpolation runs per render.** `${(props) => props.theme.surface}` is a function call on
  every render of that component, and the resulting CSS string has to be parsed into a style
  object. Libraries cache this, but the cache key includes the interpolated values, so a style
  that depends on a frequently changing prop misses the cache every time.

The upside is real: co-located styles, theme access without a hook at every call site, and a
familiar authoring model for people coming from the web. Weigh it against a profiler that is now
twice as noisy.

### What a utility-class library adds

`className="p-4 rounded-xl"` is not a React Native concept, so these libraries have to add one.
The two approaches differ:

- **`nativewind` 4** does the work at build time through a Metro/Babel step, so the class string
  is turned into styles during bundling. That means a build-tool integration you have to keep
  working across React Native and Metro upgrades — and Metro's config surface changed in 0.87
  (stable TypeScript and ESM config files, YAML config dropped).
- **`twrnc` 4** resolves classes at runtime through a function call, with an internal cache. No
  build step, but the resolution is JavaScript executed during render.

Both trade type safety for terseness: `className="p-4"` is a string, and a typo is a class that
silently does nothing rather than a compile error.

### What a theme-typed library adds

`@shopify/restyle` takes a different angle: instead of replacing the style syntax, it types your
theme and exposes it as props. `<Box padding="m" backgroundColor="surface">` fails to compile if
`m` or `surface` is not in your theme. Its peers are `react` and `react-native` at `*`, which
constrains nothing — so, as with the others, verify it against your React Native version rather
than trusting the range.

The cost is a component layer (`Box`, `Text`) and a props-to-style computation per render.

## Platform differences

None of these approaches changes platform behaviour; they all produce the same style objects and
hit the same platform splits. What differs is how easily each expresses a platform branch.

| Approach | Expressing a platform difference |
| --- | --- |
| `StyleSheet` | `Platform.select` inline in the style object — see [Platform-Specific Styles](platform-specific-styles.md) |
| Inline | Same, but recomputed per render |
| Template-literal | A conditional interpolation, which defeats the style cache |
| Utility-class | A conditional class string, or a platform-specific config entry |

The one genuine platform consideration is `react-native-unistyles`: its Nitro peer means it
requires native module support on both platforms, so it is a `pod install` and a Gradle sync, not
a JavaScript-only dependency.

## Common patterns

### `StyleSheet` plus a typed theme, read through a hook

This is the approach the rest of this handbook uses, and it covers the common case without a
dependency.

```tsx title=src/theme/useStyles.ts
import {useMemo} from 'react';
import {StyleSheet} from 'react-native';
import type {ViewStyle} from 'react-native';

type Theme = {surface: string; text: string};

/**
 * Builds a stylesheet from a theme, memoised on the theme object. The styles
 * are rebuilt only when the theme actually changes — twice a day for dark
 * mode — rather than on every render.
 */
export function useCardStyles(theme: Theme): {card: ViewStyle} {
  return useMemo(
    () =>
      StyleSheet.create({
        card: {padding: 16, borderRadius: 12, backgroundColor: theme.surface},
      }),
    [theme],
  );
}
```

### A static base plus one dynamic override

The pattern that gets you most of the benefit of both. Everything static lives in a module-scope
stylesheet; only the value that genuinely varies is inline.

```tsx title=src/components/Bar.tsx
import {StyleSheet, View} from 'react-native';

export function Bar({fraction, color}: {fraction: number; color: string}) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <View style={styles.track}>
      {/* One small object per render, with one changing value in it. */}
      <View style={[styles.fill, {width: `${clamped * 100}%`, backgroundColor: color}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {height: 6, borderRadius: 3, backgroundColor: '#e4e4e7', overflow: 'hidden'},
  fill: {height: '100%'},
});
```

### Do not mix three approaches in one codebase

The worst outcome is not any single choice; it is a codebase with `StyleSheet` in the old
screens, a template-literal library in the middle-aged ones and utility classes in the new ones.
Every new contributor has to learn three conventions and no tooling can check across them.

## Performance considerations

- **Declare stylesheets at module scope.** A `StyleSheet.create` call inside a component body
  runs every render and returns a new object, which defeats memoisation on every child below it.
  This is true of every approach's equivalent.
- **The cost is React render time, not native commit time.** Fabric diffs values. Profile the JS
  thread, not the renderer. See [The Profiler and React Native DevTools](../performance/profiling.md).
- **Extra components are extra reconciliation.** Every wrapper component a library adds is a
  fibre React has to render, reconcile and profile. In a list row this multiplies by the number of
  visible rows.
- **A style that depends on a fast-changing value should not be a style at all.** Scroll offsets,
  gesture positions and animation progress belong in Reanimated shared values, which update on the
  UI thread without a React render. See [Shared and Derived Values](../animation/shared-values.md).
- **Measure before switching.** "Our styling library is slow" is almost never what a profile
  shows. Unnecessary re-renders and unvirtualised lists are.

## Common mistakes

- **Avoiding inline styles for the wrong reason.** The Bridge-serialisation argument has been
  obsolete since 0.82. Avoid them because a new object identity defeats `React.memo`, and only
  where something is actually memoised.
- **Calling `StyleSheet.create` inside a component.** Wrong: `const styles = StyleSheet.create({...})`
  in the function body. Right: at module scope, or inside a `useMemo` keyed on the theme.
- **Adopting a styling library before a theme.** The hard part is deciding your tokens. A library
  does not do that for you, and switching library later is much cheaper than switching token
  vocabulary.
- **Trusting an open-ended peer range as a compatibility claim.** `react-native: ">= 0.68.0"`
  means the package will install. It does not mean anyone ran it on 0.87.
- **Installing `react-native-unistyles` as if it were a JavaScript-only dependency.** Its peers
  include `react-native-nitro-modules`, `react-native-reanimated` and others — a native build and
  several extra installs, not an `npm install` and done.
- **Installing `react-native-mmkv`-style Nitro libraries without their peer.** The same trap in
  a different place; see [AsyncStorage vs MMKV](../state-and-data/asyncstorage-vs-mmkv.md).
- **Assuming a utility class that does nothing is a bug in your styles.** With a string API, an
  unrecognised class is silently dropped. There is no compile error and no runtime warning.
- **Mixing approaches per file.** Pick one per codebase and migrate deliberately, not organically.

## Related topics

- [StyleSheet](stylesheet.md) — the baseline in detail, including what `create` actually does in 0.87.
- [Platform-Specific Styles](platform-specific-styles.md) — how each approach expresses a platform branch.
- [Dark Mode](dark-mode.md) — the theme object every approach here needs.
- [Flexbox in React Native](flexbox.md) — the layout half, which none of these approaches changes.
- [Fabric](../core-concepts/fabric.md) — why a style object's identity matters to React and not to the renderer.
- [Render Performance and Memoization](../performance/render-performance.md) — measuring the re-renders this page keeps referring to.
- [The Profiler and React Native DevTools](../performance/profiling.md) — proving which approach is actually costing you.
