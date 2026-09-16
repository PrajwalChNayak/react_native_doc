---
title: ScrollView
description: Scrollable content that renders all of its children at once — when that is correct, and the keyboard and inset props that need care in 0.87.
status: current
toolchain: cli
---

`ScrollView` is a scrolling container that mounts **every one of its children immediately**.
It maps to a `UIScrollView` on iOS and a `ScrollView` / `HorizontalScrollView` on Android, and
it is the base that [FlatList](flatlist.md) and [SectionList](sectionlist.md) are built on.

The mount-everything behaviour is the whole story. It makes `ScrollView` the simplest thing
that works for a settings screen, and the wrong choice for anything that grows.

## Why it exists / when to use it — and when NOT to

Use `ScrollView` when the content is **bounded and small**: a form, a settings page, a detail
screen, an onboarding step, a horizontal row of five cards.

Use a virtualized list instead when:

- **The item count is driven by data.** Anything backed by an API response can grow. A hundred
  rows is already noticeable on a low-end Android device; a thousand is a frozen screen.
- **Items are expensive.** Even twenty rows, each with an image and a nested list, cost more to
  mount at once than they do to mount lazily.
- **You need per-item lifecycle.** Virtualized lists give you `onViewableItemsChanged`;
  `ScrollView` gives you a scroll offset and nothing else.

> [!WARNING] The cost is paid on mount, not on scroll
> A `ScrollView` with 500 children feels fine once it is on screen. The damage is a blocked JS
> thread during the transition into the screen, which reads to users as "the app froze when I
> tapped". Profiling a smooth-looking scroll will not find it.

## Basic example

```tsx title=src/screens/SettingsScreen.tsx
import {ScrollView, View, Text, Switch, StyleSheet} from 'react-native';
import {useState} from 'react';

export function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);

  return (
    <ScrollView
      style={styles.host}
      contentContainerStyle={styles.content}
      // Let a tap on a row work while the keyboard is up, instead of being
      // swallowed by the dismiss gesture.
      keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Notifications</Text>
      <View style={styles.row}>
        <Text>Push notifications</Text>
        <Switch value={notifications} onValueChange={setNotifications} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
  content: {padding: 16, gap: 12},
  heading: {fontSize: 18, fontWeight: '700'},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
```

## How it works

### `style` versus `contentContainerStyle`

This is the single most common source of confusion, and it is worth being precise.

- **`style`** applies to the scroll view itself — the window you look through. `flex: 1` belongs
  here. So does a background colour that should cover the whole viewport.
- **`contentContainerStyle`** applies to the inner view that holds the children. Padding,
  `gap`, `alignItems` and `justifyContent` for the content belong here.

Putting `padding` on `style` clips the content instead of insetting it. Putting `flex: 1` on
`contentContainerStyle` makes the content exactly one screen tall and it stops scrolling.

> [!TIP] Centring content that is sometimes shorter than the screen
> `contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}` centres when the content is
> short and scrolls normally when it is tall. `flex: 1` would break the tall case; `flexGrow`
> does not.

### Scrolling programmatically

Take a ref typed as `ScrollViewInstance`. In 0.87 `scrollTo` takes an options object; the old
positional form still exists but its parameters are named `deprecatedX` and
`deprecatedAnimated` in the type definition, which tells you where it is heading.

```tsx title=Scrolling to the top and bottom
import {useRef} from 'react';
import {ScrollView, View, Text, Pressable, StyleSheet} from 'react-native';
import type {ScrollViewInstance} from 'react-native';

export function JumpableList({lines}: {lines: ReadonlyArray<string>}) {
  const scroller = useRef<ScrollViewInstance | null>(null);

  return (
    <View style={styles.host}>
      <Pressable onPress={() => scroller.current?.scrollTo({y: 0, animated: true})}>
        <Text>Back to top</Text>
      </Pressable>
      <ScrollView ref={scroller} style={styles.host}>
        {lines.map(line => (
          <Text key={line}>{line}</Text>
        ))}
      </ScrollView>
      <Pressable onPress={() => scroller.current?.scrollToEnd({animated: true})}>
        <Text>Jump to end</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {flex: 1},
});
```

`ScrollViewInstance` also exposes `flashScrollIndicators()`, `getScrollResponder()` and
`getNativeScrollRef()`.

### Scroll events and `scrollEventThrottle`

`onScroll` fires as the user drags. On iOS it fires at most once per `scrollEventThrottle`
milliseconds; `16` gives you roughly one event per frame at 60Hz. Setting it to `0` (the
default) means iOS sends the event only once per scroll on some paths, which is why
scroll-linked UI appears frozen until you set it.

On Android the events are sent continuously and `scrollEventThrottle` has historically had
little effect, so a value that feels right on Android may still be too sparse on iOS. Set
`16` and check both.

Every `onScroll` event is a JavaScript callback on the JS thread. If you are driving an
animation from scroll position, use `Animated.event` with `useNativeDriver` or Reanimated's
scroll handler instead, so the work stays off the JS thread entirely.

### Keyboard behaviour

Two props, often confused:

- **`keyboardDismissMode`** — what happens when the user *drags*. `'none'` (default),
  `'on-drag'`, or `'interactive'` (iOS only; behaves as `'none'` on Android).
- **`keyboardShouldPersistTaps`** — what happens when the user *taps* while the keyboard is up.

> [!WARNING] `keyboardShouldPersistTaps` no longer accepts a boolean
> In React Native 0.87 the boolean form is removed. The only valid values are
> `'never'` (default), `'always'` and `'handled'`. Code copied from an older tutorial that
> passes `keyboardShouldPersistTaps={true}` is now a type error.

| Value | Behaviour |
| --- | --- |
| `'never'` | A tap outside the focused input dismisses the keyboard, and the child does **not** receive the tap. |
| `'always'` | The keyboard stays up, the scroll view catches nothing, children receive taps. |
| `'handled'` | The keyboard stays up if a child (or an ancestor) handled the tap. |

`'handled'` is what you want on almost every form: tapping a button works on the first tap,
and tapping empty space still dismisses the keyboard.

### Sticky headers

`stickyHeaderIndices={[0]}` pins the child at index 0 to the top as you scroll past it.
The indices refer to direct children of the `ScrollView`, so they shift if you conditionally
render an element above them. `invertStickyHeaders` flips the behaviour for inverted lists,
and `stickyHeaderHiddenOnScroll` hides the sticky header while scrolling down.

## Platform differences

:::tabs
@tab iOS
- **Bouncing:** `bounces`, `bouncesZoom`, `alwaysBounceVertical`, `alwaysBounceHorizontal`.
  There is no Android equivalent — Android shows an over-scroll glow instead.
- **Zoom:** `minimumZoomScale`, `maximumZoomScale`, `zoomScale` and `pinchGestureEnabled` are
  iOS-only. There is no pinch-to-zoom on a core Android `ScrollView`.
- **Insets:** `contentInset`, `scrollIndicatorInsets`, `automaticallyAdjustContentInsets`,
  `automaticallyAdjustsScrollIndicatorInsets` and `contentInsetAdjustmentBehavior`
  (`'automatic'` / `'scrollableAxes'` / `'never'` / `'always'`) all exist only here. They are
  how iOS accounts for navigation bars and the home indicator.
- **`automaticallyAdjustKeyboardInsets`** makes the scroll view inset itself when the keyboard
  appears, which often removes the need for
  [KeyboardAvoidingView](keyboardavoidingview.md) entirely on iOS.
- **`indicatorStyle`** (`'default'` / `'black'` / `'white'`) sets the scrollbar colour.
- **`scrollsToTop`** wires the status-bar tap to scroll to top. Only one scroll view on screen
  should have it enabled.
- **`keyboardDismissMode="interactive"`** is the drag-to-dismiss gesture; Android treats it as
  `'none'`.
@tab Android
- **`nestedScrollEnabled`** allows a scroll view inside another scroll view to take over the
  gesture. Without it, the outer one wins. There is no iOS equivalent because iOS handles
  nesting natively.
- **`overScrollMode`** (`'auto'` / `'always'` / `'never'`) controls the stretch/glow at the
  edges — the counterpart to iOS `bounces`.
- **`persistentScrollbar`** keeps the scrollbar visible instead of fading it out.
- **`fadingEdgeLength`** fades the content at the edges to hint that more is available. Takes a
  number, or `{start, end}` for different lengths at each end.
- **`endFillColor`** paints the area below the content when the content is shorter than the
  view.
- **`scrollsChildToFocus`** (default `true`) auto-scrolls to a child that requests focus; set
  it to `false` when you want to control scroll position yourself.
- **`scrollPerfTag`** tags the scroll view for native performance logging.
:::

## Common patterns

### A horizontal card carousel that snaps

```tsx title=src/components/Carousel.tsx
import {ScrollView, View, StyleSheet} from 'react-native';

const CARD_WIDTH = 280;
const GAP = 12;

export function Carousel({items}: {items: ReadonlyArray<string>}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // snapToInterval must include the gap, or the cards drift out of alignment
      // after a few pages.
      snapToInterval={CARD_WIDTH + GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={styles.content}>
      {items.map(id => (
        <View key={id} style={styles.card} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: 16, gap: GAP},
  card: {width: CARD_WIDTH, height: 160, borderRadius: 12, backgroundColor: '#e5e7eb'},
});
```

`pagingEnabled` is the simpler option when each page is exactly one screen wide.
`snapToInterval` / `snapToOffsets` is what you need when pages are narrower than the viewport.

### Keeping position while content loads above

A chat thread that loads older messages at the top will otherwise jump under the user's finger.

```tsx title=Anchoring the scroll position
import {ScrollView, Text} from 'react-native';

export function Thread({messages}: {messages: ReadonlyArray<string>}) {
  return (
    <ScrollView
      maintainVisibleContentPosition={{
        // Skip index 0 if it is a loading spinner you do not want anchored.
        minIndexForVisible: 1,
        autoscrollToTopThreshold: 100,
      }}>
      {messages.map(message => (
        <Text key={message}>{message}</Text>
      ))}
    </ScrollView>
  );
}
```

The 0.87 type definition carries two caveats worth repeating: reordering children while this is
enabled causes jank, and visibility is computed from raw frames, so transforms and occlusion
are ignored.

### Pull to refresh

Pass a [RefreshControl](refreshcontrol.md) through the `refreshControl` prop. It is not a
child.

```tsx title=Pull to refresh on a ScrollView
import {useState, useCallback} from 'react';
import {ScrollView, RefreshControl, Text} from 'react-native';

export function Refreshable({onReload}: {onReload: () => Promise<void>}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onReload();
    } finally {
      setRefreshing(false);
    }
  }, [onReload]);

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <Text>Pull down to reload</Text>
    </ScrollView>
  );
}
```

## Performance considerations

**Every child mounts.** That is the cost model. Ten children is nothing; two hundred children
each with an image is a visible freeze on transition. The fix is not a prop — it is
[FlatList](flatlist.md).

**`scrollEventThrottle={16}` is not free.** It means roughly 60 JS callbacks per second while
scrolling. If the handler does anything more than `setState` on a single number, you will see
it in the frame graph. Drive animations natively instead.

**`removeClippedSubviews`** detaches offscreen children from the native hierarchy. It can help
a long `ScrollView`, but the 0.87 type comment is blunt about it: it "may have bugs (missing
content) in some circumstances". Treat it as a last resort before switching to a real list.

**Avoid nesting a `ScrollView` inside a `ScrollView` on the same axis.** Both are mounting all
their children, and on Android you need `nestedScrollEnabled` for the gesture to work at all.
Restructure instead, usually with a `FlatList` whose `ListHeaderComponent` holds what you were
going to put above it.

**Inline `contentContainerStyle` objects re-render the inner view.** Hoist them into
`StyleSheet.create` like any other style.

## Common mistakes

- **Passing a boolean to `keyboardShouldPersistTaps`.** Removed in 0.87. Use
  `'never' | 'always' | 'handled'`.
  ```tsx title=Wrong, and now a type error
  import {ScrollView} from 'react-native';
  export const Wrong = () => <ScrollView keyboardShouldPersistTaps="always" />;
  ```
  The snippet above shows the *correct* replacement for `keyboardShouldPersistTaps={true}`.
- **Putting `padding` on `style` instead of `contentContainerStyle`.** The content is clipped
  rather than inset, and the scrollbar sits in the wrong place.
- **Putting `flex: 1` on `contentContainerStyle`.** The content is pinned to one viewport and
  will not scroll. Use `flexGrow: 1` if you wanted "at least one screen tall".
- **Using a `ScrollView` with `.map()` over API data.** It works with the ten rows in your test
  fixture and dies with the four hundred in production.
- **Forgetting `scrollEventThrottle` on iOS.** Your scroll-linked header does not move and the
  bug looks like a layout problem.
- **Expecting `bounces` or `zoomScale` to do anything on Android.** They are iOS-only. Use
  `overScrollMode` for the edge behaviour; there is no core pinch-zoom on Android.
- **Nesting a `FlatList` inside a vertical `ScrollView`.** The inner list has unbounded height,
  so it renders every row and virtualization is disabled. React Native warns about this at
  runtime for a reason.

## Related topics

- [FlatList](flatlist.md) — the virtualized replacement once content is data-driven.
- [Virtualization and FlashList](virtualization-and-flashlist.md) — how the windowing actually works.
- [RefreshControl](refreshcontrol.md) — the pull-to-refresh control passed through `refreshControl`.
- [KeyboardAvoidingView](keyboardavoidingview.md) — keeping inputs above the keyboard.
- [Safe Areas](safe-areas.md) — insets around notches, status bars and home indicators.
- [Scroll-Driven Animation](../animation/scroll-driven-animation.md) — moving scroll work off the JS thread.
