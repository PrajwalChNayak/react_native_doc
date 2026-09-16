---
title: RefreshControl
description: Pull-to-refresh done with the platform's own control — the controlled `refreshing` prop, the split between iOS and Android styling, and why it belongs on the scroll view rather than inside it.
status: current
toolchain: cli
---

`RefreshControl` is the pull-to-refresh indicator. You do not render it as a child; you pass it to
a scrollable component through its `refreshControl` prop, and that component attaches it natively.

It is a controlled component with one required prop: `refreshing`. The spinner shows exactly when
`refreshing` is `true`, which means you have to set it to `true` yourself inside `onRefresh` and
back to `false` when the work finishes. Forgetting the second half leaves a spinner turning
forever.

## Why it exists / when to use it — and when NOT to

Use it wherever a scrollable list of remote data should be refreshable by pulling down. It is the
gesture both platforms' users already know, and using the real control gets you the platform's own
animation and haptics.

Do **not** use it when:

- **There is nothing to refresh.** A static settings screen with a pull-to-refresh spinner is
  confusing.
- **The list refreshes itself.** If a subscription or a query cache already keeps the data live,
  pull-to-refresh at best duplicates it and at worst fights it.
- **The content is short and always visible.** Pull-to-refresh needs a scroll gesture, and a screen
  with nothing to scroll gives the user nowhere to start one — unless the scroll view bounces, which
  is iOS-only by default.
- **You want a custom-looking refresh animation.** `RefreshControl` is the platform control. A
  bespoke animation means Gesture Handler and Reanimated, not this component.

## Basic example

```tsx title=src/screens/FeedScreen.tsx
import {useState, useCallback} from 'react';
import {FlatList, RefreshControl, Text, StyleSheet} from 'react-native';

type Post = {id: string; title: string};

type Props = {posts: Post[]; reload: () => Promise<void>};

export function FeedScreen({posts, reload}: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      // `finally`, not the happy path only — a failed reload must still stop
      // the spinner or the control never resets.
      setRefreshing(false);
    }
  }, [reload]);

  return (
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.title}</Text>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({row: {padding: 16}});
```

## How it works

### Where it attaches

`RefreshControl` is passed as an element to the `refreshControl` prop of
[ScrollView](scrollview.md), [FlatList](flatlist.md) or [SectionList](sectionlist.md). It is not a
child and it does not render in the layout — the scroll view hands it to the native
`UIRefreshControl` or `SwipeRefreshLayout`.

Only vertical scroll views support it. A `horizontal` list has no pull-down gesture to attach to.

### The short form

`FlatList` and `SectionList` also accept `refreshing` and `onRefresh` directly, and build the
`RefreshControl` for you. That is the shorter path when you do not need to style the control:

```tsx title=The short form on a FlatList
import {useState, useCallback} from 'react';
import {FlatList, Text} from 'react-native';

type Item = {id: string; label: string};

export function SimpleList({items, reload}: {items: Item[]; reload: () => Promise<void>}) {
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
      // The list builds a RefreshControl internally from these two props.
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}
```

Passing an explicit `refreshControl` element overrides that: the list's own `refreshing` and
`onRefresh` are then ignored, so put them on the `RefreshControl` instead.

### `refreshing` is controlled

The gesture does not start the spinner — your state does. Pulling down fires `onRefresh`; the
control only animates once `refreshing` becomes `true`. Two consequences:

- Setting `refreshing` to `true` from anywhere else (a button, a push notification handler) shows
  the spinner and pulls the list down, without any gesture.
- If `onRefresh` throws before you set `refreshing` back to `false`, the spinner stays up
  permanently. Always use `try` / `finally`.

### `progressViewOffset`

`progressViewOffset` pushes the indicator down from the top of the scroll view. In the 0.87 type
definition it sits in the shared props, not in the Android-only group, so it applies on both
platforms.

You need it whenever something is drawn over the top of the list — a translucent header, a search
bar, a tab strip. Without it the spinner appears underneath that header and the user never sees it.

### Refs

The ref type is `RefreshControlInstance`. There are no imperative methods worth calling on it;
control the spinner through `refreshing`.

## Platform differences

The control is the same idea on both platforms and almost nothing about its appearance is shared.
Every styling prop is single-platform, and passing the wrong one is silently ignored.

:::tabs
@tab iOS
A `UIRefreshControl` that lives inside the scroll view's bounce area. You pull past the top and it
appears in the gap.

| Prop | Effect |
| --- | --- |
| `tintColor` | Colour of the spinner itself |
| `title` | A line of text under the spinner — iOS only; there is no Android equivalent |
| `titleColor` | Colour of that text |

Because it relies on the bounce, a list shorter than the screen still works: iOS scroll views
bounce by default. If you have set `bounces={false}`, pull-to-refresh stops working entirely.

```tsx title=An iOS-styled refresh control
import {ScrollView, RefreshControl, Text} from 'react-native';

export function IosStyled({refreshing, onRefresh}: {refreshing: boolean; onRefresh: () => void}) {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#64748b"
          title="Pull to refresh"
          titleColor="#64748b"
        />
      }>
      <Text>Content</Text>
    </ScrollView>
  );
}
```
@tab Android
A `SwipeRefreshLayout`: a circular indicator on a coloured disc that drops in from the top edge and
overlays the content rather than sitting in a gap.

| Prop | Effect |
| --- | --- |
| `colors` | An array of colours the spinner cycles through while refreshing. At least one is required for a custom colour. |
| `progressBackgroundColor` | The colour of the disc behind the spinner |
| `size` | `'default'` or `'large'` |
| `enabled` | Whether the gesture works at all. Defaults to `true`. |

There is no `title`: Android's control shows no text, and passing `title` does nothing.

`enabled={false}` is the clean way to switch the gesture off temporarily — during an initial load,
for instance — without unmounting the control. iOS has no equivalent prop; there you conditionally
omit the `refreshControl`.

```tsx title=An Android-styled refresh control
import {ScrollView, RefreshControl, Text} from 'react-native';

export function AndroidStyled({refreshing, onRefresh}: {refreshing: boolean; onRefresh: () => void}) {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#2563eb', '#16a34a', '#dc2626']}
          progressBackgroundColor="#ffffff"
          size="default"
        />
      }>
      <Text>Content</Text>
    </ScrollView>
  );
}
```
:::

Passing every prop at once is fine and is what most shared components do — each platform reads what
it understands and ignores the rest:

```tsx title=src/components/AppRefreshControl.tsx
import {RefreshControl} from 'react-native';

type Props = {refreshing: boolean; onRefresh: () => void; headerHeight?: number};

export function AppRefreshControl({refreshing, onRefresh, headerHeight = 0}: Props) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      // Both platforms: push the indicator below a translucent header.
      progressViewOffset={headerHeight}
      // iOS reads these three.
      tintColor="#64748b"
      title="Pull to refresh"
      titleColor="#64748b"
      // Android reads these three.
      colors={['#2563eb']}
      progressBackgroundColor="#ffffff"
      size="default"
    />
  );
}
```

## Common patterns

### Keeping the spinner honest with a minimum duration

A refresh that resolves in 50ms flashes the spinner and looks broken. Holding it for a short floor
reads as "something happened".

```tsx title=src/hooks/useRefresh.ts
import {useState, useCallback} from 'react';

export function useRefresh(reload: () => Promise<void>, minimumMs = 500) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await reload();
    } finally {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, minimumMs - elapsed);
      setTimeout(() => setRefreshing(false), remaining);
    }
  }, [reload, minimumMs]);

  return {refreshing, onRefresh};
}
```

### Distinguishing a refresh from the initial load

They are different states and they should look different. An initial load has nothing to show, so a
full-screen spinner or a skeleton is right. A refresh has content already, so the pull indicator is
enough — replacing the list with a spinner throws away what the user was reading.

```tsx title=Separate initial and refresh states
import {FlatList, RefreshControl, ActivityIndicator, View, Text, StyleSheet} from 'react-native';

type Item = {id: string; label: string};

type Props = {
  items: Item[];
  initialLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

export function Screen({items, initialLoading, refreshing, onRefresh}: Props) {
  if (initialLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({item}) => <Text style={styles.row}>{item.label}</Text>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  row: {padding: 16},
});
```

### Refreshing a short screen

A `ScrollView` whose content is shorter than the viewport has no scroll to start. On iOS the bounce
saves you; on Android it does not. Give the content container `flexGrow: 1` so the scroll view
always has a full-height content area to work with.

```tsx title=Pull to refresh on a nearly empty screen
import {ScrollView, RefreshControl, Text, StyleSheet} from 'react-native';

export function EmptyState({refreshing, onRefresh}: {refreshing: boolean; onRefresh: () => void}) {
  return (
    <ScrollView
      // Without flexGrow the content is too short to drag on Android.
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.text}>Nothing here yet. Pull down to check again.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  text: {color: '#64748b', textAlign: 'center'},
});
```

## Performance considerations

The control itself is native and costs nothing. What costs is what `onRefresh` does.

**Refetching everything is the default mistake.** A refresh that replaces the whole array gives
every item a new object identity, so every memoised row re-renders even though nothing changed.
Merge by id, or let a query cache do it.

**The list re-renders while the spinner spins.** Setting `refreshing` is a state change on the
component that owns the list. If that component is the screen, the entire screen re-renders twice
per refresh — once to start and once to stop. Keep the refresh state as close to the list as you
can.

**Guard against overlapping refreshes.** A user can pull again while the first request is in
flight. Either ignore the second call while `refreshing` is true, or cancel the first request.

## Common mistakes

- **Never setting `refreshing` back to `false`.** The spinner turns forever. Wrong: setting it to
  `false` only after a successful response. Right: `try { await reload(); } finally {
  setRefreshing(false); }`.
- **Rendering it as a child.** `<ScrollView><RefreshControl … /></ScrollView>` puts it in the
  layout as an ordinary view and no pull gesture is attached. It goes in the `refreshControl` prop.
- **Putting it on a horizontal list.** There is no downward gesture to attach to.
- **Passing `title` and expecting it on Android.** It is iOS-only and silently ignored.
- **Passing `colors` and expecting it on iOS.** Equally ignored. iOS uses `tintColor`.
- **Forgetting `progressViewOffset` under a translucent header.** The spinner renders behind the
  header and the user sees nothing happen.
- **Supplying both a `refreshControl` element and the list's own `refreshing` / `onRefresh`.** The
  element wins and the list's props are ignored, which looks like a dead gesture.
- **Setting `bounces={false}` on iOS and then wondering why pull-to-refresh stopped working.** The
  control lives in the bounce area.

## Related topics

- [ScrollView](scrollview.md) — the `refreshControl` prop and the scroll behaviour it depends on.
- [FlatList](flatlist.md) — the `refreshing` / `onRefresh` short form.
- [SectionList](sectionlist.md) — same story with sections.
- [ActivityIndicator](activityindicator.md) — the spinner for the initial load, which is a different state.
- [Data Fetching and Caching](../state-and-data/data-fetching.md) — merging refreshed data instead of replacing it.
- [Offline-First](../state-and-data/offline-first.md) — what a refresh should do with no connection.
