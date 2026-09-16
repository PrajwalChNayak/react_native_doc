---
title: SectionList
description: The virtualized list for grouped data — section shape, sticky headers, per-section renderers, and the index maths that trips people up.
status: current
toolchain: cli
---

`SectionList` is [FlatList](flatlist.md) with a second level: instead of one flat array you give it
an array of sections, each holding its own `data` array. It renders a header before each section's
items and, on iOS by default, sticks that header to the top while its section is on screen.

Underneath it is `VirtualizedSectionList`, which flattens everything — headers, items, separators
and footers — into a single virtualized stream. Knowing that explains most of its odd corners.

## Why it exists / when to use it — and when NOT to

Use it when the data genuinely has groups that the user needs to see: contacts by first letter,
transactions by day, settings by category, search results by type.

Do **not** use it when:

- **There is only one group.** Use `FlatList` and put the header in `ListHeaderComponent`.
- **The "sections" are really just two or three static blocks.** A `ScrollView` with three
  `FlatList`-free chunks is simpler and has no virtualization to reason about.
- **The grouping is purely visual and changes with a filter.** Regrouping on every keystroke
  rebuilds the section array and throws away the render window. Consider a flat list with inline
  divider rows.

## Basic example

```tsx title=src/screens/DirectoryScreen.tsx
import {SectionList, View, Text, StyleSheet} from 'react-native';

type Contact = {id: string; name: string};
type Section = {title: string; data: Contact[]};

export function DirectoryScreen({sections}: {sections: Section[]}) {
  return (
    <SectionList<Contact, Section>
      sections={sections}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <View style={styles.row}>
          <Text>{item.name}</Text>
        </View>
      )}
      renderSectionHeader={({section}) => (
        <View style={styles.header}>
          <Text style={styles.headerText}>{section.title}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<Text style={styles.empty}>Nothing here</Text>}
    />
  );
}

const styles = StyleSheet.create({
  row: {paddingVertical: 12, paddingHorizontal: 16},
  header: {paddingVertical: 6, paddingHorizontal: 16, backgroundColor: '#f1f5f9'},
  headerText: {fontSize: 12, fontWeight: '700', color: '#475569'},
  separator: {height: 1, marginLeft: 16, backgroundColor: '#e2e8f0'},
  empty: {padding: 24, textAlign: 'center', color: '#64748b'},
});
```

The explicit `<SectionList<Contact, Section>>` type arguments are worth writing. Without them both
`item` and `section` infer as `any`, and every typo inside `renderItem` compiles.

## How it works

### The section shape

A section is any object with a `data` array. Everything else on it is yours — `title` is a
convention, not a requirement. The type that describes it in the 0.87 exports is
`SectionListData<ItemT, SectionT>`, and `SectionBase<ItemT, SectionT>` is the part
`SectionList` insists on.

Three optional fields on a section override the list-level behaviour for that section only:

| Field | Effect |
| --- | --- |
| `key` | Identity for the section itself. Without it the array index is used, so reordering sections reshuffles state. |
| `renderItem` | Renders this section's items instead of the list-level `renderItem`. |
| `ItemSeparatorComponent` | Separator used inside this section only. |
| `keyExtractor` | Key function for this section's items only. |

That per-section `renderItem` is the reason `SectionList` handles heterogeneous data well: a
search screen can render "people" rows and "files" rows from one list without a discriminated union
inside a single renderer.

### Sticky headers

`stickySectionHeadersEnabled` defaults to `true` on iOS and `false` on Android, because that is
each platform's convention. If you want the same behaviour everywhere, set it explicitly — do not
rely on the default.

A sticky header is repositioned natively as you scroll. It must therefore have an opaque
background; a transparent header will show the rows sliding underneath it.

### Keys, at two levels

There are two identity questions and they are answered separately. `keyExtractor` identifies items
*within* a section. The section's own `key` field identifies the section. Omitting the section key
is the common oversight: filter a list so that section 2 disappears, and every section after it
shifts index, which React reads as "these sections changed".

### Refs and `scrollToLocation`

`SectionList` does not have `scrollToIndex`. It has `scrollToLocation`, which takes a
`sectionIndex` and an `itemIndex` — and `itemIndex` counts the section header as index `0`, so the
first real row is `itemIndex: 1` when you render a header.

```tsx title=Scrolling to a section
import {useRef, useCallback} from 'react';
import {SectionList, Text, Pressable, View} from 'react-native';

type Item = {id: string; label: string};
type Section = {title: string; data: Item[]};

export function JumpToSection({sections}: {sections: Section[]}) {
  // SectionListInstance is the unparameterised alias. When the element carries
  // explicit type arguments, the ref has to carry the same ones.
  const listRef = useRef<SectionList<Item, Section> | null>(null);

  const jumpToThird = useCallback(() => {
    listRef.current?.scrollToLocation({
      sectionIndex: 2,
      // 0 is the section header itself; 1 is the first row under it.
      itemIndex: 1,
      viewPosition: 0,
      animated: true,
    });
  }, []);

  return (
    <View style={{flex: 1}}>
      <Pressable onPress={jumpToThird}>
        <Text>Go to third section</Text>
      </Pressable>
      <SectionList<Item, Section>
        ref={listRef}
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({item}) => <Text>{item.label}</Text>}
        renderSectionHeader={({section}) => <Text>{section.title}</Text>}
        // Without getItemLayout, scrolling to an unmeasured location fails here.
        onScrollToIndexFailed={() => {
          listRef.current?.scrollToLocation({
            sectionIndex: 2,
            itemIndex: 0,
            animated: false,
          });
        }}
      />
    </View>
  );
}
```

`SectionListInstance` is exported and is the right type when the element has no explicit type
arguments. As soon as you write `<SectionList<Item, Section>>`, the ref must be
`SectionList<Item, Section>` — the unparameterised alias is not assignable to it.

### `getItemLayout` is harder here than on FlatList

`SectionList` inherits `getItemLayout`, but the `index` it receives is an index into the
*flattened* stream: headers, items, item separators and section footers all occupy slots. Writing a
correct implementation means modelling every one of those heights. Unless you have measured a real
problem, leave it off — and if you do write one, verify it by scrolling to the last section and
checking that the scrollbar and content agree.

## Platform differences

:::tabs
@tab iOS
- `stickySectionHeadersEnabled` defaults to `true`. Headers pin to the top of the scroll view.
- `flashScrollIndicators()` on the ref briefly reveals the indicators. It is a no-op on Android.
- An index bar down the right edge (as in the system Contacts app) is not part of `SectionList`.
  There is no core component for it; you build it as an absolutely positioned overlay that calls
  `scrollToLocation`.
@tab Android
- `stickySectionHeadersEnabled` defaults to `false`. Set it to `true` explicitly if the design
  calls for pinned headers.
- `removeClippedSubviews` defaults to `true`, and a sticky header plus clipping is a known source
  of headers briefly disappearing. Turn clipping off for that list if you see it.
- `overScrollMode` and `persistentScrollbar` are inherited from `ScrollView` and are Android-only.
:::

## Common patterns

### Grouping a flat array

The list wants sections; your API almost certainly returns a flat array. Do the grouping in a
`useMemo` so it does not run on every render.

```tsx title=src/utils/groupByDay.ts
export type Transaction = {id: string; day: string; amount: number};
export type DaySection = {title: string; key: string; data: Transaction[]};

export function groupByDay(transactions: Transaction[]): DaySection[] {
  const byDay = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const bucket = byDay.get(transaction.day);
    if (bucket) {
      bucket.push(transaction);
    } else {
      byDay.set(transaction.day, [transaction]);
    }
  }

  return [...byDay.entries()].map(([day, data]) => ({
    title: day,
    // A stable section key, so filtering does not reshuffle section identity.
    key: day,
    data,
  }));
}
```

```tsx title=src/screens/TransactionsScreen.tsx
import {useMemo} from 'react';
import {SectionList, Text, View, StyleSheet} from 'react-native';

type Transaction = {id: string; day: string; amount: number};
type DaySection = {title: string; key: string; data: Transaction[]};

function groupByDay(transactions: Transaction[]): DaySection[] {
  const byDay = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const bucket = byDay.get(transaction.day);
    if (bucket) {
      bucket.push(transaction);
    } else {
      byDay.set(transaction.day, [transaction]);
    }
  }
  return [...byDay.entries()].map(([day, data]) => ({title: day, key: day, data}));
}

export function TransactionsScreen({rows}: {rows: Transaction[]}) {
  // Regrouping on every render would rebuild the section array and reset the
  // render window on every keystroke of an unrelated state change.
  const sections = useMemo(() => groupByDay(rows), [rows]);

  return (
    <SectionList<Transaction, DaySection>
      sections={sections}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.amount}</Text>}
      renderSectionHeader={({section}) => (
        <View style={styles.header}>
          <Text>{section.title}</Text>
        </View>
      )}
      renderSectionFooter={({section}) => (
        <Text style={styles.footer}>{section.data.length} transactions</Text>
      )}
      stickySectionHeadersEnabled
    />
  );
}

const styles = StyleSheet.create({
  row: {paddingVertical: 10, paddingHorizontal: 16},
  header: {padding: 8, backgroundColor: '#f8fafc'},
  footer: {padding: 8, color: '#64748b', fontSize: 12},
});
```

### Different rows per section

```tsx title=Heterogeneous sections
import {SectionList, Text, StyleSheet} from 'react-native';
import type {SectionListData} from 'react-native';

type Person = {id: string; name: string};
type FileHit = {id: string; filename: string};
type Row = Person | FileHit;
// Only the fields that are yours. `data`, `key`, `renderItem` and
// `ItemSeparatorComponent` come from SectionListData.
type Section = {title: string};

export function SearchResults({people, files}: {people: Person[]; files: FileHit[]}) {
  const sections: Array<SectionListData<Row, Section>> = [
    {
      title: 'People',
      key: 'people',
      data: people,
      // A per-section renderer beats a type guard inside one shared renderer.
      renderItem: ({item}) => <Text style={styles.row}>{(item as Person).name}</Text>,
    },
    {
      title: 'Files',
      key: 'files',
      data: files,
      renderItem: ({item}) => <Text style={styles.row}>{(item as FileHit).filename}</Text>,
    },
  ];

  return (
    <SectionList<Row, Section>
      sections={sections}
      keyExtractor={item => item.id}
      renderSectionHeader={({section}) => <Text style={styles.header}>{section.title}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  row: {padding: 12},
  header: {padding: 8, fontWeight: '700', backgroundColor: '#f1f5f9'},
});
```

### Separators between sections

`ItemSeparatorComponent` goes between items *inside* a section. `SectionSeparatorComponent` goes
between a section and the header or footer that borders it. They are different slots and you often
want both.

```tsx title=Both separator slots
import {SectionList, View, Text, StyleSheet} from 'react-native';

type Item = {id: string; label: string};
type Section = {title: string; key: string; data: Item[]};

export function SeparatedList({sections}: {sections: Section[]}) {
  return (
    <SectionList<Item, Section>
      sections={sections}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.label}</Text>}
      renderSectionHeader={({section}) => <Text style={styles.header}>{section.title}</Text>}
      ItemSeparatorComponent={() => <View style={styles.thin} />}
      SectionSeparatorComponent={() => <View style={styles.thick} />}
    />
  );
}

const styles = StyleSheet.create({
  row: {padding: 12},
  header: {padding: 8, fontWeight: '700', backgroundColor: '#f1f5f9'},
  thin: {height: 1, backgroundColor: '#e2e8f0'},
  thick: {height: 8},
});
```

## Performance considerations

**Grouping is the usual bottleneck, not rendering.** Building the section array is O(n) work on the
JS thread on every render unless it is memoised. On a 5,000-row dataset that is the frame you
dropped.

**Sections are not a virtualization boundary.** The whole thing is one stream, so a list with two
sections of 5,000 items each behaves exactly like a 10,000-item `FlatList`. Section count does not
change the window maths; `windowSize`, `initialNumToRender` and `maxToRenderPerBatch` work the same
way and are described on [FlatList](flatlist.md#the-render-window).

**Sticky headers cost a little.** The header view is kept mounted and repositioned while its
section is visible. With very many small sections you are keeping many headers alive; consider
fewer, larger groups.

**Keep headers cheap.** A sticky header re-lays-out as it moves. A header containing an image, a
shadow and three nested views is noticeably worse than a header containing one `Text`.

## Common mistakes

- **No `key` on the section objects.** Wrong: `[{title: 'A', data}, {title: 'B', data}]`. Right:
  add `key: 'A'` / `key: 'B'`. Without it, removing a section makes every later section change
  identity and lose state.
- **Assuming `itemIndex: 0` is the first row.** In `scrollToLocation`, index `0` is the section
  header when you render one. Scrolling "to the first item" lands on the header.
- **Rebuilding `sections` inline in JSX.** `sections={groupByDay(rows)}` creates a new array every
  render, so the `PureComponent` check always fails and the entire list re-renders. Wrap it in
  `useMemo`.
- **A transparent sticky header.** Rows scroll visibly underneath it. Give the header an opaque
  `backgroundColor`.
- **Expecting `stickySectionHeadersEnabled` to behave the same on both platforms.** It defaults to
  `true` on iOS and `false` on Android. Set it explicitly.
- **Writing `getItemLayout` as if indices were item indices.** They index the flattened stream
  including headers and separators. A naive `ITEM_HEIGHT * index` is wrong from the first section
  boundary onwards.
- **Leaving off the type arguments.** `<SectionList sections={...}>` infers `any` for both `item`
  and `section`, and TypeScript stops helping exactly where the shape is most confusing.

## Related topics

- [FlatList](flatlist.md) — the flat case, and where the window props are explained.
- [ScrollView](scrollview.md) — the scroll props both lists inherit.
- [Virtualization and FlashList](virtualization-and-flashlist.md) — the mechanism, and the third-party alternative.
- [RefreshControl](refreshcontrol.md) — pull to refresh on a section list.
- [List Performance in Depth](../performance/list-performance.md) — profiling grouped lists.
- [Pressable and Touchables](pressable-and-touchables.md) — tappable rows.
