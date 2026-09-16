---
title: FlatList
description: The virtualized list for flat, data-driven content — keys, item layout, pagination, viewability, and the props that actually change performance.
status: current
toolchain: cli
---

`FlatList` renders a long array of items while keeping only the ones near the viewport mounted.
It is a thin wrapper around `VirtualizedList`, which is itself built on
[ScrollView](scrollview.md), so every `ScrollView` prop is available on it too.

The whole point is that mounting cost stops scaling with `data.length`. A 10,000-row `ScrollView`
mounts 10,000 native subtrees at once and blocks for seconds. A 10,000-row `FlatList` mounts
roughly a screenful.

## Why it exists / when to use it — and when NOT to

Use `FlatList` when the content is an array and the array can grow. That is the whole test. Even a
"short" list of user-generated content is a candidate, because the length is not yours to decide.

Do **not** use it when:

- **The content is a fixed, small set of heterogeneous blocks.** A settings screen with eight
  hand-written rows is a `ScrollView`. `FlatList` would add virtualization machinery and take away
  the ability to just write the JSX.
- **The rows are grouped under headers.** That is [SectionList](sectionlist.md).
- **The list nests inside another scroll view along the same axis.** Two virtualized lists on the
  same axis break each other's windowing. Use the outer list's `ListHeaderComponent` instead.

## Basic example

```tsx title=src/screens/ContactsScreen.tsx
import {memo, useCallback} from 'react';
import {FlatList, View, Text, Pressable, StyleSheet} from 'react-native';
import type {ListRenderItemInfo} from 'react-native';

type Contact = {id: string; name: string; email: string};

type RowProps = {contact: Contact; onSelect: (id: string) => void};

// memo keeps untouched rows from re-rendering when the parent state changes.
const ContactRow = memo(function ContactRow({contact, onSelect}: RowProps) {
  return (
    <Pressable onPress={() => onSelect(contact.id)} style={styles.row}>
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.email}>{contact.email}</Text>
    </Pressable>
  );
});

type Props = {contacts: Contact[]; onSelect: (id: string) => void};

export function ContactsScreen({contacts, onSelect}: Props) {
  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<Contact>) => (
      <ContactRow contact={item} onSelect={onSelect} />
    ),
    [onSelect],
  );

  return (
    <FlatList
      data={contacts}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={<Text style={styles.empty}>No contacts yet</Text>}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  row: {paddingVertical: 12, paddingHorizontal: 16},
  name: {fontSize: 16, fontWeight: '600'},
  email: {fontSize: 13, color: '#64748b'},
  separator: {height: 1, backgroundColor: '#e2e8f0'},
  empty: {padding: 24, textAlign: 'center', color: '#64748b'},
});
```

## How it works

### The render window

`FlatList` keeps a window of mounted cells around the viewport and unmounts what falls outside it.
Four props control the window, and their real defaults in 0.87 are:

| Prop | Default | What it controls |
| --- | --- | --- |
| `initialNumToRender` | `10` | Cells rendered in the very first pass. These are never unmounted. |
| `maxToRenderPerBatch` | `10` | Cells added per incremental batch while scrolling. |
| `updateCellsBatchingPeriod` | `50` (ms) | Gap between those batches. |
| `windowSize` | `21` | Window height in units of viewport height — 21 means the viewport plus ten screens above and ten below. |

Raising `windowSize` trades memory for fewer blank frames during fast scrolls. Lowering it does the
opposite. Raising `maxToRenderPerBatch` fills blanks faster but blocks the JS thread for longer per
batch, which shows up as unresponsive taps.

[Virtualization and FlashList](virtualization-and-flashlist.md) goes through the mechanism in
detail, including how to choose these numbers instead of guessing.

### Keys

`keyExtractor` gives each item a stable identity. Without it, `FlatList` looks for `item.key`, then
`item.id`, then falls back to the array index.

Index keys are a bug waiting to happen: insert an item at the top and every key shifts, so React
believes every row changed, every memoised row re-renders, and any component state inside a row
lands on the wrong item. Always return a real id.

```tsx title=A stable key extractor
import {FlatList, Text} from 'react-native';

type Message = {messageId: string; body: string};

export function MessageList({messages}: {messages: Message[]}) {
  return (
    <FlatList
      data={messages}
      // Not the index. The id travels with the item when the array reorders.
      keyExtractor={item => item.messageId}
      renderItem={({item}) => <Text>{item.body}</Text>}
    />
  );
}
```

### `getItemLayout` — the single biggest win, when it applies

If every row is the same height, tell the list. `getItemLayout` lets `FlatList` compute any cell's
position arithmetically instead of waiting for it to be measured on the native side. That makes
`scrollToIndex` work for unmeasured rows, makes `initialScrollIndex` possible, and removes a whole
class of scroll jumpiness.

```tsx title=getItemLayout for fixed-height rows
import {FlatList, View, Text, StyleSheet} from 'react-native';

const ROW_HEIGHT = 64;
const SEPARATOR_HEIGHT = 1;
const STRIDE = ROW_HEIGHT + SEPARATOR_HEIGHT;

type Track = {id: string; title: string};

export function TrackList({tracks}: {tracks: Track[]}) {
  return (
    <FlatList
      data={tracks}
      keyExtractor={item => item.id}
      // The separator counts toward the stride, or every offset drifts.
      getItemLayout={(_data, index) => ({
        length: STRIDE,
        offset: STRIDE * index,
        index,
      })}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({item}) => (
        <View style={styles.row}>
          <Text>{item.title}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 16},
  separator: {height: SEPARATOR_HEIGHT, backgroundColor: '#e2e8f0'},
});
```

Do **not** supply `getItemLayout` if the heights are not actually fixed. A wrong offset is worse
than no offset: the list scrolls to the wrong place and the scrollbar lies.

### `extraData`

`FlatList` is a `PureComponent`. If `renderItem` reads something that is not in `data` — a selected
id, a multi-select set, a playing-track id — the list has no way to know it changed. `extraData`
is the escape hatch: pass the value, treat it immutably, and the list re-renders.

```tsx title=Re-rendering rows on external state
import {useState, useCallback} from 'react';
import {FlatList, Pressable, Text} from 'react-native';

type Item = {id: string; label: string};

export function SelectableList({items}: {items: Item[]}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelectedId(id), []);

  return (
    <FlatList
      data={items}
      // Without this, tapping a row would not repaint the previously selected one.
      extraData={selectedId}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <Pressable onPress={() => select(item.id)}>
          <Text style={{fontWeight: item.id === selectedId ? '700' : '400'}}>
            {item.label}
          </Text>
        </Pressable>
      )}
    />
  );
}
```

### Refs and imperative scrolling

`FlatList`'s ref type under the Strict TypeScript API is `FlatListInstance`. It exposes
`scrollToIndex`, `scrollToItem`, `scrollToOffset`, `scrollToEnd`, `recordInteraction`,
`getScrollResponder`, `getNativeScrollRef` and — on iOS — `flashScrollIndicators`.

```tsx title=Scrolling to an index safely
import {useRef, useCallback} from 'react';
import {FlatList, Text, Pressable, View} from 'react-native';
import type {FlatListInstance} from 'react-native';

type Row = {id: string; label: string};

export function JumpList({rows}: {rows: Row[]}) {
  const listRef = useRef<FlatListInstance | null>(null);

  const jumpToFiftieth = useCallback(() => {
    listRef.current?.scrollToIndex({index: 50, animated: true});
  }, []);

  return (
    <View style={{flex: 1}}>
      <Pressable onPress={jumpToFiftieth}>
        <Text>Jump</Text>
      </Pressable>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={item => item.id}
        renderItem={({item}) => <Text>{item.label}</Text>}
        // Without getItemLayout, an index outside the render window throws.
        // This recovers instead of crashing.
        onScrollToIndexFailed={info => {
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
          setTimeout(() => {
            listRef.current?.scrollToIndex({index: info.index, animated: true});
          }, 100);
        }}
      />
    </View>
  );
}
```

## Platform differences

:::tabs
@tab iOS
- `removeClippedSubviews` defaults to `false`. Turning it on is rarely a win here and is the usual
  cause of rows rendering blank.
- `flashScrollIndicators()` on the ref briefly shows the scroll indicators — a useful hint after
  programmatically loading more content. It does nothing on Android.
- Sticky headers via `stickyHeaderIndices` follow the iOS convention of pinning under the
  navigation bar.
@tab Android
- `removeClippedSubviews` defaults to `true` on Android. That is already the behaviour you get; you
  normally only touch this prop to turn it *off* while debugging blank cells.
- `persistentScrollbar` keeps the scrollbar visible instead of fading it out.
- `fadingEdgeLength` draws a fade at the scroll edges. It is Android-only and has no iOS
  equivalent; on iOS you would build the same effect with a gradient overlay.
- `overScrollMode` controls the stretch/glow at the ends.
:::

## Common patterns

### Infinite scroll

```tsx title=Paginated loading with onEndReached
import {useState, useCallback} from 'react';
import {FlatList, Text, ActivityIndicator} from 'react-native';

type Post = {id: string; title: string};

type Props = {
  posts: Post[];
  loadMore: () => Promise<void>;
  hasMore: boolean;
};

export function Feed({posts, loadMore, hasMore}: Props) {
  const [loading, setLoading] = useState(false);

  const handleEndReached = useCallback(async () => {
    // onEndReached can fire repeatedly; guard it or you will fire N requests.
    if (loading || !hasMore) {
      return;
    }
    setLoading(true);
    try {
      await loadMore();
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, loadMore]);

  return (
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text>{item.title}</Text>}
      onEndReached={handleEndReached}
      // Units of viewport height. 0.5 means "half a screen from the bottom".
      onEndReachedThreshold={0.5}
      // The 0.87 types accept an element or a component, not null.
      ListFooterComponent={loading ? <ActivityIndicator /> : undefined}
    />
  );
}
```

`onEndReachedThreshold` defaults to `2`, which is two viewport heights — quite early. Tighten it if
each page is expensive to fetch.

### Pull to refresh

The `refreshing` / `onRefresh` pair is the short form; pass a
[RefreshControl](refreshcontrol.md) through `refreshControl` when you need to style it.

```tsx title=Pull to refresh on a FlatList
import {useState, useCallback} from 'react';
import {FlatList, Text} from 'react-native';

type Item = {id: string; label: string};

export function RefreshableList({
  items,
  reload,
}: {
  items: Item[];
  reload: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text>{item.label}</Text>}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}
```

### Tracking what is on screen

`onViewableItemsChanged` plus `viewabilityConfig` is how you fire impression analytics or autoplay
a video when it scrolls into view.

```tsx title=Viewability tracking
import {useRef} from 'react';
import {FlatList, Text} from 'react-native';

type Card = {id: string; title: string};

export function TrackedList({
  cards,
  onImpression,
}: {
  cards: Card[];
  onImpression: (ids: string[]) => void;
}) {
  // Both of these must be referentially stable. Changing either on the fly
  // throws "Changing onViewableItemsChanged on the fly is not supported".
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 400,
  }).current;

  const onViewableItemsChanged = useRef(
    (info: {viewableItems: Array<{key: string}>}) => {
      onImpression(info.viewableItems.map(token => token.key));
    },
  ).current;

  return (
    <FlatList
      data={cards}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text>{item.title}</Text>}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
    />
  );
}
```

### A grid

```tsx title=Two-column grid
import {FlatList, View, Text, StyleSheet} from 'react-native';

type Photo = {id: string; caption: string};

export function PhotoGrid({photos}: {photos: Photo[]}) {
  return (
    <FlatList
      data={photos}
      numColumns={2}
      keyExtractor={item => item.id}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.content}
      renderItem={({item}) => (
        <View style={styles.cell}>
          <Text>{item.caption}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {padding: 8},
  column: {gap: 8},
  cell: {flex: 1, aspectRatio: 1, backgroundColor: '#e2e8f0', borderRadius: 8},
});
```

`numColumns` requires `horizontal={false}`, and changing it at runtime forces a full re-render of
the list — give the `FlatList` a `key` that includes the column count if the layout responds to
orientation.

## Performance considerations

**Measure before you tune.** The four window props are not free knobs; each one trades memory
against blank frames. Profile with React Native DevTools and change one at a time.

**Memoise the row, and memoise what you pass it.** `React.memo` on the row component does nothing
if `renderItem` builds a new object or arrow function for every row on every render. Hoist
`renderItem` with `useCallback`, pass primitives where you can.

**Keep the row shallow.** Every level of nesting inside a row is multiplied by the number of
mounted cells. Flattening a row from six views to three is the kind of change that shows up on a
low-end Android device immediately.

**Fixed heights beat measured heights.** `getItemLayout` removes a measurement round trip per cell.
If the design allows a fixed row height, take it.

**Do not turn off virtualization.** `disableVirtualization` exists and is marked deprecated in the
0.87 types — it is a debugging aid, not a fix for blank cells.

**Watch `removeClippedSubviews`.** It is on by default on Android and its known failure mode is
blank cells in nested or transformed lists. If rows go blank on Android only, this is the first
thing to switch off.

## Common mistakes

- **Using the array index as the key.** Wrong: `keyExtractor={(_item, index) => String(index)}`.
  Right: `keyExtractor={item => item.id}`. Index keys break every insert and reorder, and they
  silently move component state between rows.
- **Defining `renderItem` inline.** `renderItem={({item}) => <Row item={item} />}` is a new
  function on every parent render, which defeats `React.memo` on `Row`. Hoist it with
  `useCallback`.
- **Putting a `FlatList` inside a `ScrollView` on the same axis.** The list gets infinite height,
  virtualization stops working entirely, and you have mounted every row. Use `ListHeaderComponent`
  for the content that was above the list.
- **Forgetting that `onEndReached` fires more than once.** Without a loading guard you will fire
  several identical page requests before the first one lands.
- **Supplying `getItemLayout` for variable-height rows.** Every offset after the first
  differently-sized row is wrong, and `scrollToIndex` lands in the wrong place.
- **Changing `onViewableItemsChanged` between renders.** Passing an inline arrow throws at runtime.
  Keep it in a `useRef`.
- **Expecting `extraData` to deep-compare.** It is a shallow identity check. Mutating a `Set` in
  place and passing the same `Set` changes nothing. Create a new one.

## Related topics

- [ScrollView](scrollview.md) — the component underneath, and every scroll prop `FlatList` inherits.
- [SectionList](sectionlist.md) — the same machinery with section headers.
- [Virtualization and FlashList](virtualization-and-flashlist.md) — how the window really works and when to swap the list out.
- [RefreshControl](refreshcontrol.md) — styling pull-to-refresh.
- [Pressable and Touchables](pressable-and-touchables.md) — making rows tappable without breaking scroll.
- [List Performance in Depth](../performance/list-performance.md) — profiling a slow list end to end.
- [Render Performance](../performance/render-performance.md) — memoisation rules that rows depend on.
