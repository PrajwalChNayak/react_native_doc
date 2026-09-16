---
title: List Performance in Depth
description: How FlatList virtualization actually works, what every windowing prop does, why inline renderItem closures cost you renders, and where FlashList wins and where it does not.
status: current
toolchain: cli
---

Lists are where React Native performance problems concentrate. A screen renders once; a list
renders its row component for every visible item, re-renders it on every data change, and mounts
and unmounts views continuously while the user's thumb is moving. Every cost on every other page in
this section gets multiplied by the row count here.

This page is the long version: what `FlatList` does internally, what each windowing prop actually
controls, the two mistakes that cause most list jank, and an honest account of when
`@shopify/flash-list` is the answer and when it is not.

## Why virtualization exists

A `ScrollView` mounts all of its children. A thousand rows is a thousand mounted view hierarchies,
their images, their text, and their shadow nodes — all created before the first frame and all held
in memory for the life of the screen.

`FlatList` mounts a window instead. It keeps the visible rows plus a configurable buffer above and
below, and replaces everything outside that window with a pair of blank spacer views sized to the
content it is standing in for. Scrolling moves the window: rows entering it mount, rows leaving it
unmount.

That is the whole idea, and everything else on this page is a consequence of it.

> [!NOTE] When a ScrollView is the right answer
> Virtualization has overhead: measurement bookkeeping, batched rendering, and mount/unmount churn.
> For a short, bounded list — a settings screen, a form, twenty items — a `ScrollView` is simpler
> and faster. The crossover is roughly "more than fits in two or three screens", not a fixed number.

## Basic example

A list configured the way a list should be: a memoized row, a stable `renderItem`, a `keyExtractor`
that returns a real identity, and `getItemLayout` because the rows are a fixed height.

```tsx title=src/screens/FeedList.tsx
import {memo, useCallback} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import type {ListRenderItemInfo} from 'react-native';

type Post = {id: string; title: string; author: string};

const ROW_HEIGHT = 72;

const Row = memo(function Row({post}: {post: Post}) {
  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={styles.title}>
        {post.title}
      </Text>
      <Text numberOfLines={1}>{post.author}</Text>
    </View>
  );
});

export function FeedList({posts}: {posts: readonly Post[]}) {
  // Defined once. An arrow function written inline in JSX is a new value on
  // every render of FeedList, which makes FlatList re-render every cell.
  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<Post>) => <Row post={item} />,
    [],
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

  // Rows are a known fixed height, so the list never has to measure them.
  const getItemLayout = useCallback(
    (_data: Readonly<ArrayLike<Post>> | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  return (
    <FlatList
      data={posts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      initialNumToRender={8}
      windowSize={11}
      maxToRenderPerBatch={8}
    />
  );
}

const styles = StyleSheet.create({
  row: {height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 16, gap: 2},
  title: {fontWeight: '600'},
});
```

## How it works

`FlatList` is a thin wrapper over `VirtualizedList`. The interesting behaviour is all in
`VirtualizedList`, and it comes down to three mechanisms.

### 1. The render window

The list tracks a contiguous range of indices that should be mounted. It grows and shifts as scroll
position changes, and cells outside it are unmounted. Two spacer `View`s — one above, one below —
carry the height of the unmounted regions so the scroll bar and content size stay correct.

The size of that window is `windowSize`, measured in **viewport heights**, not items.

### 2. Measurement

To place the spacers correctly, the list needs to know how tall the unmounted rows are. It learns
this by measuring each cell's `onLayout` as it mounts and caching the result.

Before a row has ever been mounted, its height is a guess based on the average of what has been
measured so far. This is why scrolling quickly into unmeasured territory can jump, and why
`scrollToIndex` into an unmeasured region can land in the wrong place.

`getItemLayout` removes the guessing entirely — see below.

### 3. Batched rendering

Rendering the whole new window in one synchronous pass would block the JS thread and drop frames.
Instead the list renders the highest-priority cells first and then fills in the rest in low-priority
batches, spaced out in time. `maxToRenderPerBatch` and `updateCellsBatchingPeriod` control that
trade-off.

The visible symptom of the trade-off is **blank cells while scrolling fast**: the window moved
faster than the batches could fill it.

### The props, with their real defaults

Every default below was read from the installed React Native 0.87.1 source, not from memory.

| Prop | Default | What it controls | When to change it |
| --- | --- | --- | --- |
| `initialNumToRender` | `10` | Cells rendered in the very first pass | Set it to what actually fits on screen. Higher delays first paint; lower shows a short blank. These cells are never unmounted by windowing. |
| `windowSize` | `21` | Mounted area in viewport heights: the visible screen plus 10 above and 10 below | Lowering to `7`–`11` cuts memory and mount work noticeably; too low and fast scrolling shows blanks. |
| `maxToRenderPerBatch` | `10` | Cells rendered per incremental batch | Raise for better fill rate on fast scrolls, lower for better touch responsiveness. |
| `updateCellsBatchingPeriod` | `50` ms | Delay between low-priority batches | Lower fills faster and steals more JS-thread time; raise to keep the thread free for interaction. |
| `removeClippedSubviews` | `true` on Android, `false` on iOS | Detaches offscreen native views from the hierarchy | Its own documentation warns it "may have bugs (missing content)". Measure before enabling on iOS; revert if content disappears. |
| `onEndReachedThreshold` | `2` | How close to the end, in viewport lengths, `onEndReached` fires | Lower it if you are fetching too eagerly. |
| `getItemLayout` | none | Supplies each row's size so nothing is measured | Set it whenever rows are a fixed or computable height. |
| `keyExtractor` | `item.key`, then `item.id`, then the index | React's identity for each row | Always set it explicitly unless your items really have `key` or `id`. |

### Why `getItemLayout` matters so much

With it, the list knows every offset up front. That removes per-cell measurement, makes
`scrollToIndex` exact, makes `initialScrollIndex` work, and removes the scroll-position corrections
that cause content to visibly shift.

Without it, every cell measures on mount and the list continually revises its estimate of total
content size.

The catch is that it must be **correct**. If your `getItemLayout` says 72 and the row renders at 90,
the list will place spacers wrong and the scroll position will drift. Rows with variable-height text
or optional images are exactly the case where you should not fake it.

```tsx title=src/screens/SectionedListLayout.tsx
import {FlatList, Text, View} from 'react-native';
import type {ListRenderItemInfo} from 'react-native';

type Entry = {id: string; label: string; kind: 'header' | 'row'};

const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 56;

// Variable heights are fine as long as they are DERIVABLE without measuring.
// Precomputing a cumulative offset table keeps getItemLayout O(1).
function buildOffsets(entries: readonly Entry[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const entry of entries) {
    offsets.push(running);
    running += entry.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;
  }
  return offsets;
}

export function SectionedList({entries}: {entries: readonly Entry[]}) {
  const offsets = buildOffsets(entries);

  return (
    <FlatList
      data={entries}
      keyExtractor={(item: Entry) => item.id}
      getItemLayout={(_data: Readonly<ArrayLike<Entry>> | undefined, index: number) => ({
        length: entries[index].kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT,
        offset: offsets[index],
        index,
      })}
      renderItem={({item}: ListRenderItemInfo<Entry>) => (
        <View style={{height: item.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT}}>
          <Text>{item.label}</Text>
        </View>
      )}
    />
  );
}
```

(That example builds the offset table on every render for clarity. In a real screen it belongs in a
`useMemo` keyed on `entries`, or in the code that produced `entries` in the first place.)

### The two mistakes that cause most list jank

**Inline `renderItem`.** `FlatList` is a `PureComponent`. An arrow function written directly in JSX
is a new function identity on every render of the parent, so the shallow prop comparison fails and
the entire list re-renders — every mounted cell, every time the screen re-renders for any reason.

```tsx title=src/screens/InlineRenderItem.tsx
import {useState} from 'react';
import {FlatList, Text, TextInput, View} from 'react-native';
import type {ListRenderItemInfo} from 'react-native';

type Item = {id: string; label: string};

export function SearchScreen({items}: {items: readonly Item[]}) {
  const [query, setQuery] = useState('');

  return (
    <View>
      <TextInput value={query} onChangeText={setQuery} />
      <FlatList
        data={items}
        // WRONG: a new function on every keystroke, plus a new style object.
        // Every character typed re-renders every mounted cell.
        renderItem={({item}: ListRenderItemInfo<Item>) => (
          <View style={{padding: 12}}>
            <Text>{item.label}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

Every keystroke in that `TextInput` re-renders `SearchScreen`, which produces a new `renderItem`,
which re-renders every mounted cell. Hoist `renderItem` with `useCallback`, memoize the row
component, and move the style into `StyleSheet.create`.

**Inline styles inside the row.** A style object literal in a row's JSX is allocated once per row
per render, and it defeats `memo` on anything it is passed to. `StyleSheet.create` at module scope
creates each style exactly once. See
[Render Performance and Memoization](render-performance.md).

### `extraData` and the stale-row trap

Because `FlatList` is a `PureComponent`, anything your `renderItem` closes over that is *not* a prop
of the list will not trigger an update. A row that reads a `selectedId` from the enclosing scope
will render stale.

The fix is either to pass it through `extraData`, or — better — to make the row read it from a
context or store so the list does not need to know about it at all. `extraData` invalidates every
cell; a context subscription in the row invalidates one.

### `keyExtractor` and identity

The default extractor checks `item.key`, then `item.id`, then falls back to the array index. The
index fallback is the problem: when the data reorders or an item is removed from the middle, React
matches the wrong rows, which means wrong recycling, wrong animations and wrong internal state.

Always return a stable, unique id.

### List state does not survive the window

A row unmounted by windowing loses its component state. A checkbox's `useState`, a collapsed/expanded
flag, a video's playback position — all gone when you scroll past and back. Row state has to live in
the data or in a store, not in the row.

## FlashList — when it wins and when it does not

`@shopify/flash-list` is at **2.3.2**, and version 2 **requires the New Architecture** — the package
carries an explicit error for running without it. Its peer range on `react-native` is `*`, so verify
against your own build rather than trusting the range.

The architectural difference is **recycling**. `FlatList` unmounts a row leaving the window and
mounts a fresh one entering it. FlashList keeps a pool of mounted row components and re-points them
at new data, so scrolling costs a prop update instead of a mount/unmount pair. That is why it holds
up where `FlatList` blanks.

```tsx title=src/screens/ChatList.tsx
import {FlashList, useRecyclingState} from '@shopify/flash-list';
import {Pressable, Text, View} from 'react-native';

type Message = {id: string; body: string; kind: 'text' | 'image'};

function MessageRow({message}: {message: Message}) {
  // Component instances are RECYCLED, so ordinary useState would carry the
  // previous message's expanded flag onto the next one. useRecyclingState
  // resets when the dependency changes.
  const [expanded, setExpanded] = useRecyclingState(false, [message.id]);

  return (
    <Pressable onPress={() => setExpanded(v => !v)} accessibilityRole="button">
      <View>
        <Text numberOfLines={expanded ? undefined : 2}>{message.body}</Text>
      </View>
    </Pressable>
  );
}

export function ChatList({messages}: {messages: Message[]}) {
  return (
    <FlashList
      data={messages}
      keyExtractor={(item: Message) => item.id}
      // Rows of different shapes should recycle only into their own kind.
      getItemType={(item: Message) => item.kind}
      renderItem={({item}) => <MessageRow message={item} />}
    />
  );
}
```

**Where it wins**

- Long lists of similar rows scrolled fast — the case it was built for.
- Chat and feed screens, where the mount/unmount churn of `FlatList` is the dominant cost.
- Heterogeneous lists, because `getItemType` keeps each shape in its own recycle pool.
- Grids and masonry layouts, which `FlatList`'s `numColumns` handles poorly.

**Where it does not**

- Short lists. The recycling machinery is overhead you do not need for thirty rows.
- Lists that are not the bottleneck. If your profile shows image decoding or a blocked JS thread,
  swapping list implementations changes nothing.
- Rows whose cost is the row itself. Recycling removes mount cost, not render cost. A row that does
  400 ms of work is 400 ms in either list.
- Codebases that cannot take a dependency, or where per-row component state is deeply assumed —
  recycling requires you to think about reset, which `FlatList` does not.

> [!WARNING] Version 2 changed the contract
> FlashList v2 measures rows itself; the `estimatedItemSize` prop that every v1 tutorial opens with
> is not part of the v2 prop surface. If a guide tells you to set it, the guide is for v1.

See [Virtualization and FlashList](../components/virtualization-and-flashlist.md) for the component-level
comparison, and [FlatList](../components/flatlist.md) for the API itself.

## Platform differences

:::tabs
@tab Android
`removeClippedSubviews` defaults to **true**. Android's view system benefits more from detaching
offscreen views, and the default reflects that.

Overdraw is a real cost here in a way it is not on iOS: a row with a background, a card, and an
image all painting the same pixels shows up in Developer options → "Debug GPU overdraw". Flattening
the row's view hierarchy helps mount time and draw time together.
@tab iOS
`removeClippedSubviews` defaults to **false**. Turning it on can help a heavy list, but it is the
prop most likely to produce missing content, so change it only with a before/after measurement.

Fabric recycles platform views during mount. A custom native row component that does not fully reset
its state when reused will show the previous row's content — this is a native-side reset bug, not a
list bug. See [The Render Pipeline](../core-concepts/render-pipeline.md).
:::

## Performance considerations

- **Cut the work per row before you tune windowing props.** Ten props of tuning will not rescue a
  row that renders forty nodes and decodes a full-resolution image.
- **`windowSize` is the biggest memory lever.** Going from the default `21` to `11` roughly halves
  the mounted cell count. Test fast scrolling afterwards.
- **`initialNumToRender` is the biggest first-paint lever.** Set it to what fits on screen plus one,
  not to a round number.
- **Flatten the row hierarchy.** Each nested `View` is a shadow node, a layout node and a mount
  instruction. A row that goes from twelve nodes to six halves the mount cost of every scroll.
- **Fix the images.** Full-size images in a list are usually the real cost, not the list. See
  [Image Performance and Caching](image-performance.md).
- **Never nest a `VirtualizedList` inside a `ScrollView` of the same orientation.** Virtualization
  needs a bounded viewport; inside a scrolling parent it has none, so every row mounts and you have
  reinvented `ScrollView` with extra steps. Use `ListHeaderComponent` instead.
- **Measure the JS thread while scrolling.** If it is idle and the UI still stutters, your cost is
  mount or native, and windowing props will not touch it.

## Common mistakes

- **Inline `renderItem`.** Wrong: `renderItem={({item}) => <Row item={item} />}` written in the JSX.
  Right: `useCallback` it, or define it outside the component. `FlatList` is a `PureComponent`, so a
  new function identity re-renders every cell.
- **Index as the key.** Wrong: `keyExtractor={(item, index) => String(index)}`. Right: a stable id.
  Index keys break reordering, deletion and recycling in ways that look like random UI corruption.
- **A `getItemLayout` that lies.** Wrong: returning a fixed 80 for rows whose text sometimes wraps to
  two lines. Right: only supply it when the height is genuinely derivable; otherwise let the list
  measure.
- **Row state in `useState`.** Wrong: an expanded flag in the row that resets when you scroll away.
  Right: keep it in the item data or a store — cells are unmounted by windowing and recycled by
  FlashList.
- **Nesting a list in a `ScrollView`.** Wrong: `<ScrollView><FlatList …/></ScrollView>` to add a
  header. Right: `ListHeaderComponent`, or make the outer content part of the list's data.
- **Reaching for FlashList before measuring.** Wrong: swapping the list implementation as the first
  move. Right: find out whether the cost is mount churn (FlashList helps) or per-row render and
  images (it does not).
- **Setting `removeClippedSubviews` on iOS without checking.** Wrong: turning it on everywhere
  because it is on by default on Android. Right: measure, then scroll the whole list looking for
  missing content.
- **Tuning windowing props by copying a blog post's numbers.** Wrong: `windowSize={5}` because
  someone's article said so. Right: those numbers depend on your row height, row cost and target
  device.

## Related topics

- [FlatList](../components/flatlist.md) — the component API.
- [Virtualization and FlashList](../components/virtualization-and-flashlist.md) — choosing between the two.
- [SectionList](../components/sectionlist.md) — sections and sticky headers.
- [Render Performance and Memoization](render-performance.md) — making rows cheap to re-render.
- [Image Performance and Caching](image-performance.md) — the most common hidden list cost.
- [The Render Pipeline](../core-concepts/render-pipeline.md) — why mount volume is a separate problem.
- [Measuring Before Optimising](measuring-first.md) — deciding which of these applies to you.
