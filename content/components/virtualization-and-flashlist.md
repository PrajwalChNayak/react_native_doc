---
title: Virtualization and FlashList
description: How FlatList's render window actually works, which props move which number, and an honest account of where @shopify/flash-list wins and where it does not.
status: current
toolchain: cli
---

Virtualization is the reason a list of 50,000 rows can open instantly. Instead of mounting a native
view subtree per row, the list mounts a window of rows around the viewport and unmounts the rest as
they scroll away. Everything that makes lists fast or slow in React Native follows from that one
idea.

This page explains the mechanism, then covers `@shopify/flash-list` 2.3.2, which replaces
unmount-and-remount with view recycling.

## Why it exists / when to use it — and when NOT to

You are already using virtualization if you use [FlatList](flatlist.md) or
[SectionList](sectionlist.md). This page is about tuning it and about knowing when to swap the
implementation.

Reach for `FlashList` when you have measured a `FlatList` problem that is specifically about cell
mounting: blank cells while scrolling fast, a visible hitch as each batch lands, or memory that
climbs with scroll distance.

Do **not** swap the list out when:

- **You have not profiled.** Most "slow list" reports are a slow *row* — an unoptimised image, a
  shadow on every cell, a re-render storm from a missing `React.memo`. Changing the list component
  does not fix any of those, and you will carry a dependency for nothing.
- **The list is short.** Under a few hundred simple rows, `FlatList` with sensible props is
  indistinguishable.
- **You need a core-only dependency footprint.** `FlashList` is a native library. It has to build,
  it has to be kept compatible across React Native upgrades, and it is one more thing between you
  and an upgrade.

## Basic example

A `FlatList` with the window props stated explicitly rather than left at their defaults, so the
trade-offs are visible in the code.

```tsx title=src/screens/TunedListScreen.tsx
import {memo, useCallback} from 'react';
import {FlatList, View, Text, StyleSheet} from 'react-native';
import type {ListRenderItemInfo} from 'react-native';

type Item = {id: string; title: string};

const ROW_HEIGHT = 72;

const Row = memo(function Row({title}: {title: string}) {
  return (
    <View style={styles.row}>
      <Text numberOfLines={1}>{title}</Text>
    </View>
  );
});

export function TunedListScreen({items}: {items: Item[]}) {
  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<Item>) => <Row title={item.title} />,
    [],
  );

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      // Fixed height: the list can compute every offset without measuring.
      getItemLayout={(_data, index) => ({
        length: ROW_HEIGHT,
        offset: ROW_HEIGHT * index,
        index,
      })}
      // Enough to fill one screen, not more. Extra here is startup cost.
      initialNumToRender={12}
      // Smaller batches keep the JS thread responsive; more of them are needed.
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      // ~5 screens of buffer instead of the default 21.
      windowSize={11}
    />
  );
}

const styles = StyleSheet.create({
  row: {height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 16},
});
```

## How it works

### The lifecycle of a cell

1. On mount, the list renders `initialNumToRender` cells synchronously. These are special: they
   are never unmounted, so scrolling back to the top is always instant.
2. As you scroll, the list schedules low-priority batches. Each batch renders at most
   `maxToRenderPerBatch` more cells, and batches are separated by `updateCellsBatchingPeriod`
   milliseconds.
3. Cells outside the window are unmounted. Their React state is gone — this is why a text input or
   an expanded/collapsed flag inside a row must live in the item data or a store, never in row
   state alone.
4. Scrolling back re-mounts them from scratch.

Step 4 is the cost model that `FlashList` attacks.

### The four window props, and what each one actually trades

| Prop | Default | Raise it to | Pay for it with |
| --- | --- | --- | --- |
| `initialNumToRender` | `10` | Fill the first screen with no gap | Slower time to first paint |
| `maxToRenderPerBatch` | `10` | Fill blanks faster during fast scroll | Longer JS blocks; taps feel laggy |
| `updateCellsBatchingPeriod` | `50` ms | Lower it to fill blanks sooner | The same JS pressure, spread differently |
| `windowSize` | `21` | Fewer blanks at high scroll speed | Memory, and more mounted views |

The defaults are read from the installed 0.87 sources, not from folklore. `windowSize` is measured
in viewport heights, so `21` means the visible screen plus ten screens above and ten below — which
is a lot of mounted content for a tall row.

There is no universally correct set. The honest procedure is: reproduce the problem on the slowest
device you support, change **one** number, measure again.

### `getItemLayout`: the one that is not a trade-off

Every other prop trades one cost for another. `getItemLayout` removes work outright. When the list
knows each cell's size in advance it can:

- compute the content size immediately, so the scrollbar is correct from the first frame,
- jump to any index without having measured it (`scrollToIndex`, `initialScrollIndex`),
- skip the native measurement round trip per cell.

It only applies when the geometry is genuinely fixed, and it must account for separators. Getting
it wrong is worse than omitting it: offsets drift and scrolling lands in the wrong place.

### `keyExtractor` is a performance prop

It is usually filed under correctness, but identity is what lets React reuse a cell's element tree
rather than tear it down. An index-based key changes on every insert, so every row below the
insertion point is treated as a different row and re-renders. A stable id makes an insert cost one
row.

### `removeClippedSubviews`

This detaches the native views of cells that are scrolled out of the visible bounds while leaving
the React components mounted. It defaults to `true` on Android and `false` on iOS.

It is not a general-purpose switch. Its documented failure mode — repeated in the 0.87 type
definitions — is missing content: cells that render blank, particularly inside nested lists,
transformed parents or lists with sticky headers. If rows go blank on Android only, turn this off
first and see whether the symptom disappears.

### Blank cells

A blank cell means the list scrolled past the point where the next batch had been rendered. The
JS thread could not keep up with the fill rate. The fixes, in order of how much they usually help:

1. Make the row cheaper — fewer views, smaller images, `React.memo`.
2. Add `getItemLayout` if heights are fixed.
3. Raise `windowSize` so there is more buffer.
4. Raise `maxToRenderPerBatch` / lower `updateCellsBatchingPeriod`, accepting the responsiveness
   cost.
5. Switch to a recycling list.

Deferring non-critical work until the scroll settles helps too. The global `requestIdleCallback`
is the 0.87 way to do that — it replaced the scheduling helper that older tutorials use, which no
longer exists.

## FlashList

`@shopify/flash-list` 2.3.2 keeps a pool of mounted cell views and **recycles** them: when a cell
scrolls off, its views are handed to a cell scrolling on, and only the props change. No unmount, no
remount, no new native views.

Version 2 is a rewrite for the New Architecture. The most visible consequence for anyone porting
from version 1: **there is no `estimatedItemSize`**. It is not in the 2.3.2 type definitions at all.
Version 2 measures on its own, so the single most-copied FlashList snippet on the internet no
longer applies.

```tsx title=src/screens/FeedScreen.tsx
import {useCallback} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import type {ListRenderItemInfo} from '@shopify/flash-list';

type Post =
  | {id: string; kind: 'text'; body: string}
  | {id: string; kind: 'photo'; caption: string};

export function FeedScreen({posts}: {posts: Post[]}) {
  const renderItem = useCallback(({item}: ListRenderItemInfo<Post>) => {
    if (item.kind === 'text') {
      return (
        <View style={styles.card}>
          <Text>{item.body}</Text>
        </View>
      );
    }
    return (
      <View style={styles.photo}>
        <Text>{item.caption}</Text>
      </View>
    );
  }, []);

  return (
    <FlashList
      data={posts}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      // Recycle text cells with text cells and photo cells with photo cells.
      // Without this, every recycle swaps between two different layouts.
      getItemType={item => item.kind}
    />
  );
}

const styles = StyleSheet.create({
  card: {padding: 16},
  photo: {height: 220, backgroundColor: '#e2e8f0'},
});
```

### What recycling changes about your row code

Recycling is the reason a `FlashList` row is not quite a `FlatList` row.

- **Row state survives the swap.** A `useState` inside a cell is not reset when the cell is reused
  for a different item, because the component never unmounted. `useRecyclingState` exists for
  exactly this: it takes a dependency list and resets the value when the cell is handed a
  different item.
- **Mixed layouts fight the pool.** If alternating rows have wildly different shapes, a recycled
  view has to be reconfigured every time. `getItemType` partitions the pool so like is reused with
  like. It is the single highest-value FlashList prop.
- **`maxItemsInRecyclePool` caps the pool.** Setting it to `0` disables recycling entirely, which
  turns FlashList back into an unmounting list. There is no limit by default.

```tsx title=Row state that survives recycling
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useRecyclingState} from '@shopify/flash-list';

type Item = {id: string; title: string; body: string};

export function ExpandableRow({item}: {item: Item}) {
  // Resets to false whenever this view is recycled for a different item.
  // Plain useState would leak the previous row's expanded state.
  const [expanded, setExpanded] = useRecyclingState(false, [item.id]);

  return (
    <Pressable onPress={() => setExpanded(value => !value)} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text>
      {expanded ? <View><Text>{item.body}</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {padding: 16},
  title: {fontWeight: '600'},
});
```

### The ref API is different

`FlashList`'s ref is `FlashListRef<T>`, not `FlatListInstance`, and the methods do not line up
one-for-one.

| `FlatList` | `FlashList` |
| --- | --- |
| `scrollToIndex({index})` | `scrollToIndex({index})` — returns a `Promise` |
| `scrollToOffset({offset})` | `scrollToOffset({offset})` |
| `scrollToEnd()` | `scrollToEnd()` |
| — | `scrollToTop()` |
| — | `getLayout(index)`, `computeVisibleIndices()`, `getFirstVisibleIndex()` |
| `recordInteraction()` | `recordInteraction()` |

```tsx title=Typing a FlashList ref
import {useRef, useCallback} from 'react';
import {Text, Pressable, View} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import type {FlashListRef} from '@shopify/flash-list';

type Item = {id: string; label: string};

export function ScrollableFeed({items}: {items: Item[]}) {
  const listRef = useRef<FlashListRef<Item>>(null);

  const toTop = useCallback(() => {
    listRef.current?.scrollToTop({animated: true});
  }, []);

  return (
    <View style={{flex: 1}}>
      <Pressable onPress={toTop}>
        <Text>Back to top</Text>
      </Pressable>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={item => item.id}
        renderItem={({item}) => <Text>{item.label}</Text>}
      />
    </View>
  );
}
```

### Where FlashList wins, and where it does not

**It wins when:**

- Cells are expensive to mount — nested views, images, several `Text` nodes — and the user scrolls
  far. Recycling turns a mount into a prop update.
- The list is long enough that memory matters. The mounted view count stays roughly constant
  instead of growing with the window.
- Rows are heterogeneous *and* you can classify them with `getItemType`.
- You need a chat-style list. Its `maintainVisibleContentPosition` config, with
  `startRenderingFromBottom` and the autoscroll thresholds, is more capable than the `ScrollView`
  prop of the same name.
- You need masonry. `masonry` plus `optimizeItemArrangement` has no core equivalent.

**It does not win when:**

- The row itself is the bottleneck. A 400ms image decode is 400ms in either list.
- Rows are simple and few. The recycling machinery has its own overhead.
- Row components hold local state and you have not adopted `useRecyclingState` — you will trade a
  performance problem for a correctness one.
- You need `getItemLayout`-style exact offsets. FlashList has no equivalent prop; it measures.
- The team's upgrade budget is tight. It is a native dependency that must track React Native
  releases.

Be sceptical of benchmark numbers, including the library's own. They are measured with cheap cells
where mounting dominates, which is exactly the case that flatters recycling. Measure your list.

## Platform differences

:::tabs
@tab iOS
- `removeClippedSubviews` defaults to `false` on `FlatList`. Enabling it here is rarely the win it
  looks like, and it is a common source of blank cells.
- Scroll deceleration is faster, so the list has less time to fill the window during a fling. If
  blank cells appear on one platform only, it is usually this one.
- `flashScrollIndicators()` exists on both `FlatListInstance` and `FlashListRef`; it is a no-op on
  Android.
@tab Android
- `removeClippedSubviews` defaults to `true` on `FlatList`. It is doing work for you already, and
  it is the first thing to disable when cells render blank.
- Low-end Android is where window tuning actually pays. A device with a slow JS thread and little
  memory is the one that punishes `windowSize: 21` with tall rows.
- `FlashList` requires the New Architecture, which is the only architecture in 0.82 and later, so
  there is nothing to enable — but the library still needs a native rebuild after installing.
:::

## Common patterns

### Deciding what to change, in order

1. Profile with React Native DevTools. Find out whether the cost is in `renderItem`, in the row's
   children, or in native layout.
2. Memoise the row and hoist `renderItem`.
3. Flatten the row's view tree.
4. Add `getItemLayout` if heights are fixed.
5. Tune `windowSize` and the batch props, one at a time.
6. Only then consider `FlashList`.

### Migrating a FlatList to FlashList

```tsx title=src/screens/MigratedList.tsx
import {Text, StyleSheet} from 'react-native';
import {FlashList} from '@shopify/flash-list';

type Item = {id: string; label: string; kind: 'a' | 'b'};

export function MigratedList({items}: {items: Item[]}) {
  return (
    <FlashList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.label}</Text>}
      // getItemLayout has no FlashList equivalent — drop it, do not port it.
      getItemType={item => item.kind}
      onEndReached={() => {}}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({row: {padding: 12}});
```

The props that carry over unchanged are `data`, `renderItem`, `keyExtractor`, `numColumns`,
`ListHeaderComponent`, `ListFooterComponent`, `ListEmptyComponent`, `ItemSeparatorComponent`,
`onEndReached`, `onEndReachedThreshold`, `refreshing`, `onRefresh`, `horizontal`, `inverted`,
`extraData` and the `ScrollView` props. The ones that do not exist — they are compile errors on a
`FlashList` — are `getItemLayout`, `initialNumToRender`, `maxToRenderPerBatch`,
`updateCellsBatchingPeriod` and `windowSize`. FlashList replaces all of them with `drawDistance`
and the recycle pool. `removeClippedSubviews` still type-checks, because it is a `ScrollView` prop
rather than a list prop, but it plays no part in FlashList's recycling.

## Performance considerations

**Virtualization does not make a slow row fast.** It reduces how many slow rows exist at once. If
one row takes 30ms to render, ten of them still take 300ms.

**Memory is the other half.** Each mounted cell is native views, and images inside them hold
decoded bitmaps. `windowSize: 21` with 300pt rows on a tall phone can keep a hundred images
decoded. Lowering `windowSize` is often a memory fix before it is a speed fix.

**The JS thread is the bottleneck, not the UI thread.** Batching exists because rendering cells
happens in JS. Anything else on that thread — a heavy reducer, JSON parsing, an unthrottled scroll
handler — steals from the fill rate and shows up as blank cells.

**Scroll handlers cost per frame.** An `onScroll` that calls `setState` re-renders on every scroll
event. Move scroll-driven animation off the JS thread entirely; see
[Scroll-Driven Animation](../animation/scroll-driven-animation.md).

## Common mistakes

- **Tuning before measuring.** Changing four props at once and declaring victory teaches you
  nothing and usually trades a blank-cell problem for a startup-time problem.
- **Raising `windowSize` to fix blank cells caused by a slow row.** More buffer means more slow
  rows to render. Fix the row.
- **Porting `estimatedItemSize` to FlashList 2.** It does not exist in 2.3.2. Delete it; the
  library measures for you.
- **Using `useState` in a FlashList row.** Recycled views keep their state, so the previous item's
  expanded/checked/selected flag shows up on a different item. Use `useRecyclingState`.
- **Skipping `getItemType` on a mixed list.** Without it every recycle reconfigures a view into a
  different shape, which is most of the benefit gone.
- **Keeping row state anywhere in a virtualized list.** In `FlatList` it is destroyed on unmount; in
  `FlashList` it survives onto the wrong row. Both are wrong. Put it in the item data or a store.
- **Setting `removeClippedSubviews` speculatively.** It has real, documented blank-content bugs.
  Turn it on only when you have measured that it helps, and test scrolling in both directions.
- **Nesting a virtualized list inside a same-axis `ScrollView`.** The inner list gets unbounded
  height and mounts everything. Virtualization is off, silently.

## Related topics

- [FlatList](flatlist.md) — the props in their normal context.
- [SectionList](sectionlist.md) — the same window, with headers in the stream.
- [ScrollView](scrollview.md) — the non-virtualized base and when it is the right call.
- [List Performance in Depth](../performance/list-performance.md) — a full profiling walkthrough.
- [Image Performance and Caching](../performance/image-performance.md) — usually the real cost inside a row.
- [Render Performance](../performance/render-performance.md) — memoisation that rows depend on.
- [Measuring Before Optimising](../performance/measuring-first.md) — the step this page keeps insisting on.
