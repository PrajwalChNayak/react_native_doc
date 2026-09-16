---
title: List Performance
description: How FlatList virtualisation works on React Native 0.86, the props that actually change scroll performance, and when FlashList (2.0.2 on Expo SDK 57) is worth adding.
status: current
toolchain: expo
sdk: 57
---

Long lists are where React Native performance problems become visible: blank areas while
scrolling fast, dropped frames, and rows that take a moment to appear. There are two tools on
SDK 57: React Native's own `FlatList`, and Shopify's `FlashList`.

Neither is fast by default if each row is expensive. The row component is almost always the thing
to fix first.

## Why it exists / when to use it — and when NOT to

Use a virtualised list (`FlatList` or `FlashList`) for any list whose length you do not control —
anything from an API, a database or user content.

Do **not** use one for a short, fixed set of items like a settings screen with eight rows. A
`ScrollView` renders them all at once, which is simpler and fine.

Do **not** add `FlashList` before you have measured `FlatList` with a cheap row component. Swapping
list libraries does not fix a row that re-renders on every scroll event.

## Expo Go vs development build

Both work in Expo Go. `FlatList` is core React Native. `FlashList` v2 is a JavaScript-only library
built for the New Architecture (its README states it moved to a JS-only implementation), so it
needs no custom native code. **Measure** scroll performance in a release build on a low-end device.

## Basic example

A `FlatList` with a memoisable row, a stable key and fixed row height:

```tsx title=components/ContactList.tsx
import {FlatList, StyleSheet, Text, View} from 'react-native';

type Contact = {id: string; name: string};

const ROW_HEIGHT = 56;

function ContactRow({name}: {name: string}) {
  return (
    <View style={styles.row}>
      <Text>{name}</Text>
    </View>
  );
}

export function ContactList({contacts}: {contacts: Contact[]}) {
  return (
    <FlatList
      data={contacts}
      keyExtractor={(item) => item.id}
      renderItem={({item}) => <ContactRow name={item.name} />}
      // Rows are a fixed height, so FlatList can compute offsets instead of measuring.
      getItemLayout={(_, index) => ({length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index})}
    />
  );
}

const styles = StyleSheet.create({
  row: {height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 16},
});
```

## How it works

### Virtualisation

`FlatList` does not render every item. It renders a **window** of items around the visible area
and replaces the rest with empty space of the right size. As you scroll, it renders new items in
batches and unmounts ones that leave the window.

Blank areas appear when scrolling outruns rendering: the JS thread cannot produce rows fast enough.
The fix is almost always cheaper rows, not bigger windows.

### The props that matter

Verified from React Native 0.86.3's `FlatList` and `VirtualizedList` types:

| Prop | Default behaviour | When to change it |
| --- | --- | --- |
| `keyExtractor` | Uses `item.key`, then index | Always provide a stable id. Index keys break state and recycling. |
| `getItemLayout` | Measures each row | Fixed-height rows: provide it, and skip measurement entirely. |
| `initialNumToRender` | A small first batch | Raise only if the first screen shows blanks; it costs startup. |
| `maxToRenderPerBatch` | Items rendered per batch | Lower for smoother scrolling, higher for less blank space. |
| `windowSize` | Window measured in screen-heights | Lower to save memory; higher to reduce blanks on fast scroll. |
| `updateCellsBatchingPeriod` | Delay between batches | Rarely needed; tune after the others. |
| `removeClippedSubviews` | Platform-dependent | Can reduce memory on long lists; can cause missing content bugs. Test it. |

Each is a trade-off between memory, blank space and JS work. Change one at a time and measure.

### React Compiler and row memoisation

The classic advice is to wrap the row in `memo` and the `renderItem` callback in `useCallback`, so
a parent re-render does not re-render every visible row. The SDK 57 default template enables
**React Compiler** (`experiments.reactCompiler: true`), which inserts that memoisation for
components that follow the Rules of React.

On a compiled project, profile before adding manual `memo`/`useCallback`. Use the React Profiler
in React Native DevTools to check whether rows actually re-render when the parent does — see
[Profiling](profiling.md). If the project has React Compiler off, manual memoisation of rows is
still the first thing to try.

### FlashList

`@shopify/flash-list` **recycles** row components instead of unmounting and remounting them: a row
that scrolls off the top is reused, with new props, for a row appearing at the bottom. That avoids
repeated mount costs.

The version in SDK 57's `bundledNativeModules.json` is **`2.0.2`** (the npm `latest` is 2.3.2 at
the time of writing; use the SDK's version):

```bash
npx expo install @shopify/flash-list
```

```tsx title=components/FeedList.tsx
import {FlashList} from '@shopify/flash-list';
import {Text, View} from 'react-native';

type FeedItem =
  | {id: string; kind: 'post'; body: string}
  | {id: string; kind: 'ad'; sponsor: string};

export function FeedList({items}: {items: FeedItem[]}) {
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      // Separate recycle pools per type: a post cell is never reused to draw an ad.
      getItemType={(item) => item.kind}
      renderItem={({item}) =>
        item.kind === 'post' ? (
          <View style={{padding: 16}}>
            <Text>{item.body}</Text>
          </View>
        ) : (
          <View style={{padding: 16}}>
            <Text>Sponsored by {item.sponsor}</Text>
          </View>
        )
      }
    />
  );
}
```

FlashList v2 facts, from its installed 2.0.2 package:

- **New Architecture only.** That is not a restriction on SDK 57, which runs on React Native
  0.86's New Architecture.
- **No size estimates.** v1's `estimatedItemSize` prop is gone; v2 measures items itself. Most
  FlashList tutorials online are for v1.
- `getItemType`, `drawDistance`, `maxItemsInRecyclePool`, `masonry` and
  `maintainVisibleContentPosition` are all v2 props.

### Recycling changes how you write rows

Because a FlashList row component is reused, **local state in a row leaks between items**. A row
that stores "expanded" in `useState` will show the wrong item expanded after scrolling. Keep
per-item state keyed by item id outside the row, or reset it when the item changes.

## Common patterns

### Images in rows

Pass `recyclingKey` to `expo-image` in list rows — both `FlatList` and `FlashList` reuse views. See
[Image Performance](image-performance.md).

### Choosing between them

| Situation | Use |
| --- | --- |
| Hundreds of simple, fixed-height rows | `FlatList` with `getItemLayout` |
| Thousands of rows, or heterogeneous rows | Measure `FlashList` against `FlatList` |
| Masonry / staggered grid | `FlashList` with `masonry` |
| Short fixed list | `ScrollView` |

## Performance considerations

- The most expensive thing in a list is usually the row: nested views, shadows, synchronous date
  formatting, inline image decoding. Simplify the row before tuning the list.
- Anonymous objects and functions created in `renderItem` are cheap on their own; they matter when
  they defeat memoisation of an expensive row. Profile before refactoring.
- Scroll performance problems show up on the JS thread in the Performance panel. If the JS thread
  is idle and scrolling still stutters, look at native rendering (shadows, transparency, image
  sizes) instead.

## Common mistakes

- **Using the array index as the key.** Reordering or inserting items reuses the wrong state.
  Wrong: `keyExtractor={(_, i) => String(i)}`. Right: a stable id.
- **Copying FlashList v1 code.** `estimatedItemSize` does not exist in v2. Remove it.
- **Installing FlashList at npm `latest`.** Use `npx expo install @shopify/flash-list`, which
  resolves the SDK 57 version `2.0.2`.
- **Keeping row state in `useState` inside a recycled row.** It shows up on the wrong item.
- **Raising `windowSize` and `initialNumToRender` to hide blanks.** It trades blank space for
  memory and startup cost. Make rows cheaper first.
- **Nesting a vertical list inside a vertical `ScrollView`.** Virtualisation cannot work when the
  parent renders everything. Use `ListHeaderComponent` / `ListFooterComponent`.
- **Adding `memo` everywhere on a React Compiler project without profiling.** It may already be
  done for you.

## Related topics

- [Image Performance with expo-image](image-performance.md) — images inside list rows.
- [Profiling](profiling.md) — the React Profiler and Performance panel.
- [Measuring Before Optimising](measuring-first.md) — which build and device to measure on.
- [expo install and SDK Alignment](../expo-core-concepts/expo-install-and-sdk-alignment.md) — why FlashList should come from `npx expo install`.
