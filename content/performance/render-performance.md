---
title: Render Performance and Memoization
description: Cutting render-phase cost with React.memo, useMemo and useCallback — including the cases where they make your app slower.
status: current
toolchain: cli
---

The render phase is the JavaScript React runs to work out what changed: your component functions,
the reconciliation, and the shadow nodes Fabric creates from the result. It runs on the JS thread,
so while it runs nothing else in your JavaScript does. Cutting it is the most common performance
fix in a React Native app.

Memoization is the usual tool, and it is the most over-applied technique in React. It is not free,
and applied wrongly it is a net loss. This page is about both halves.

## Why it exists — and when NOT to reach for it

React re-renders a component when its state changes, when its context changes, or when its parent
re-renders. That last one is the expensive default: a state update near the root calls every
component function beneath it, even the ones whose props are identical.

`React.memo` interrupts that. It compares the new props with the old ones, shallowly, and skips the
component if they match.

The reason not to reach for it automatically is that the comparison itself has a cost, and so do
the `useCallback` and `useMemo` calls you will add to make the comparison succeed. Each one
allocates a dependency array, stores it on the fiber, and compares it element by element on every
render — including the renders you were trying to skip.

> [!BEST-PRACTICE] The rule
> Memoize a component when it is **expensive to render** and its props are **actually stable**.
> A memo on a cheap component that receives a new prop object every render is strictly worse than
> no memo: you pay the comparison, it fails, and you render anyway.

Before applying any of this, open the Profiler and find out which components render and how often.
See [The Profiler and React Native DevTools](profiling.md).

## Basic example

The case where memoization pays: a list row that is not trivial, receiving a stable item and a
stable callback.

```tsx title=src/components/ProductRow.tsx
import {memo, useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

export type Product = {id: string; name: string; pennies: number};

type RowProps = {
  product: Product;
  onPress: (id: string) => void;
};

// Worth memoizing: `product` only changes when the data does, and the parent
// passes a `useCallback`-stabilised `onPress`. The shallow compare succeeds on
// every render caused by a sibling, so this subtree is skipped entirely.
export const ProductRow = memo(function ProductRow({product, onPress}: RowProps) {
  // Stabilised against `product.id` rather than `product`, so an unrelated
  // field changing on the product does not invalidate the handler.
  const handlePress = useCallback(() => onPress(product.id), [onPress, product.id]);

  return (
    <Pressable onPress={handlePress} style={styles.row} accessibilityRole="button">
      <View style={styles.text}>
        <Text numberOfLines={1}>{product.name}</Text>
        <Text>{(product.pennies / 100).toFixed(2)}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {paddingHorizontal: 16, paddingVertical: 12},
  text: {gap: 4},
});
```

## How it works

### What `memo` actually compares

`memo` does an `Object.is` comparison of each prop, one level deep. That means:

- Primitives (`string`, `number`, `boolean`) compare as you expect.
- Objects, arrays and functions compare **by identity**. A structurally identical object created
  fresh in the parent's render is a different object.

So `memo` succeeds only if every non-primitive prop keeps the same identity across the parent's
renders. One unstable prop defeats all of them.

### The memo that never hits

This is the most common way to spend effort for nothing:

```tsx title=src/screens/MemoThatNeverHits.tsx
import {memo, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import type {StyleProp, TextStyle} from 'react-native';

const Badge = memo(function Badge(props: {style: StyleProp<TextStyle>; label: string}) {
  return <Text style={props.style}>{props.label}</Text>;
});

export function Header() {
  const [count, setCount] = useState(0);

  return (
    <View>
      {/* The inline array literal is a NEW value on every render of Header, so
          memo's shallow compare always fails. The cost is the comparison plus
          the render you were going to do anyway. */}
      <Badge style={[{fontWeight: 'bold'}]} label="New" />
      <Pressable onPress={() => setCount(c => c + 1)} accessibilityRole="button">
        <Text>{count}</Text>
      </Pressable>
    </View>
  );
}
```

Two fixes, in order of preference: hoist the style into a `StyleSheet.create` object so it is
created once, or drop the `memo` because `Badge` is a single `Text` and rendering it costs less
than comparing it.

### When `useMemo` earns its keep

`useMemo` is for two things:

1. **An expensive computation** — sorting or grouping a few thousand items, building an index.
2. **Referential stability** for a value that feeds a memoized child, a context, or a dependency
   array.

It is not for `const total = a + b`. The bookkeeping costs more than the addition.

The second use is the one people under-apply. A context value is the classic case, because every
consumer re-renders when the provider's value changes identity:

```tsx title=src/state/CartContext.tsx
import {createContext, useContext, useMemo, useState} from 'react';
import type {ReactNode} from 'react';

type CartActions = {add: (id: string) => void; clear: () => void};

// Two contexts, deliberately. Components that only dispatch never re-render
// when the item list changes, because the actions object never changes.
const CartItemsContext = createContext<readonly string[]>([]);
const CartActionsContext = createContext<CartActions | null>(null);

export function CartProvider({children}: {children: ReactNode}) {
  const [items, setItems] = useState<readonly string[]>([]);

  const actions = useMemo<CartActions>(
    () => ({
      // The functional updater form is what lets the dependency list stay empty.
      add: id => setItems(prev => [...prev, id]),
      clear: () => setItems([]),
    }),
    [],
  );

  return (
    <CartActionsContext.Provider value={actions}>
      <CartItemsContext.Provider value={items}>{children}</CartItemsContext.Provider>
    </CartActionsContext.Provider>
  );
}

export function useCartItems(): readonly string[] {
  return useContext(CartItemsContext);
}

export function useCartActions(): CartActions {
  const actions = useContext(CartActionsContext);
  if (actions == null) {
    throw new Error('useCartActions must be used inside a CartProvider');
  }
  return actions;
}
```

A single context holding `{items, add, clear}` in one object would re-render every consumer on
every item change, including the ones that only ever call `add`.

### Where memoization does nothing at all

- **The component whose own state changed.** `memo` guards against a parent's render, not your own
  `setState`.
- **A context consumer whose context changed.** `memo` does not stop a context update.
- **Mount cost.** Skipping a re-render never helps the first render. If a screen is slow to appear,
  the problem is mount and layout volume, not re-render count.
- **Main-thread work.** If the profile shows an idle JS thread and a stuttering UI, the cost is in
  mount or in native code. See [The Render Pipeline](../core-concepts/render-pipeline.md).

### Cheaper than memoization: move the state down

Memoization is a way to survive a render you did not need. Not causing the render is better.

If a header's open/closed state lives at the screen root, every change re-renders the whole screen
and you then memoize twelve children to contain the damage. Moving that state into the header
itself removes the problem instead of managing it. The same applies to a text input whose value
sits three levels above where it is used.

Composition does the same job for subtrees you cannot move state out of: passing an already-created
element as `children` means it is not re-created when the wrapper re-renders.

### React 19 details worth knowing

- **`ref` is an ordinary prop on function components.** `forwardRef` is no longer required, which
  removes a wrapper component from every render path that used it.
- **Updates are batched across async boundaries.** Two `setState` calls in a `then` or after an
  `await` produce one render, not two. Splitting a handler in two to "avoid a double render" is
  solving a problem that no longer exists.

## Common patterns

### Stabilise from the top of the chain

`memo` on a row is only as good as the props the list gives it. Stabilise in this order: the
callback in the screen, then the item object, then the row. Memoizing the row first and the
callback never produces no improvement and a confusing diff.

### Keep style objects out of render

`StyleSheet.create` at module scope creates each style once. An inline object or array literal in
JSX creates a new one per render, which both defeats `memo` and adds allocation. Where a style
genuinely depends on state, `useMemo` the combination.

### Split large components

A 400-line screen component re-renders entirely for any of its state. Four 100-line components each
re-render for a quarter of it. This is usually a bigger win than any amount of memoization, and it
costs nothing but a file move.

### Let the profiler, not a rule, decide

The Profiler's "why did this render" information turns this whole page from guesswork into a list
of two or three specific components. Everything else is speculative.

## Performance considerations

- **Every `useCallback` and `useMemo` has a fixed cost** on every render: an allocation and a
  dependency comparison. Hundreds of them in a hot list row add up to something you can see.
- **`memo` on a leaf is usually a loss.** Comparing two props costs about what rendering a `Text`
  costs.
- **An unstable dependency array is worse than no memo.** `useMemo(..., [someObject])` where
  `someObject` is recreated each render recomputes every time *and* pays the comparison.
- **Render count and render duration are different problems.** Twenty commits of 2 ms and one commit
  of 40 ms both show 40 ms, and they have opposite fixes.
- **Do not memoize to fix mount cost.** Reduce the number of nodes, or virtualize. See
  [List Performance in Depth](list-performance.md).

## Common mistakes

- **Memoizing everything on principle.** Wrong: wrapping every component in `memo` and every
  function in `useCallback` as a house style. Right: profile, find the components that re-render
  needlessly and are expensive, memoize those.
- **Memoizing a component that receives an inline object.** Wrong:
  `<Row style={{padding: 8}} item={item} />` on a `memo`-wrapped `Row`. Right: `StyleSheet.create`
  the style once, or drop the memo.
- **`useCallback` with an unstable dependency.** Wrong: `useCallback(fn, [props.config])` where
  `config` is built inline by the parent. Right: stabilise `config` first, or depend on the
  primitive fields you actually use.
- **Expecting `memo` to stop a context update.** Wrong: memoizing a consumer to avoid re-rendering
  when the theme changes. Right: split the context, or select a narrower value.
- **Putting all state at the screen root.** Wrong: one `useState` per field at the top, then twelve
  memos below. Right: move the state to the component that owns it.
- **Measuring memoization in a debug build.** Wrong: concluding memo helped from development
  timings. Right: development builds add per-render bookkeeping that changes the ratio; confirm in
  release.

## Related topics

- [The Render Pipeline](../core-concepts/render-pipeline.md) — what "render phase" means concretely.
- [Measuring Before Optimising](measuring-first.md) — getting the number first.
- [The Profiler and React Native DevTools](profiling.md) — finding the components that re-render.
- [List Performance in Depth](list-performance.md) — where render cost multiplies by row count.
- [Context](../state-and-data/context.md) — splitting providers and selecting narrow values.
- [Common Performance Mistakes](common-performance-mistakes.md) — the advice to stop following.
