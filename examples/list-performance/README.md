# List performance: FlatList vs FlashList

Ten thousand rows, three list implementations, one toggle. The point is to make list
behaviour **observable on a real device** instead of arguing about it in the abstract.

| Mode | What it is |
| --- | --- |
| **FlatList** | A correctly configured `FlatList` — hoisted `renderItem`, memoised row, stable `keyExtractor`, tuned window |
| **FlatList (naive)** | The same data with the mistakes people actually make |
| **FlashList** | `@shopify/flash-list` 2.3.2 with no tuning at all |

The rows are identical in all three modes, so any difference you feel comes from the list,
not from the row.

## Run it

These example directories contain the JavaScript and TypeScript only. Generating a correct
0.87 `android/` and `ios/` project by hand is not feasible, so create the native projects with
the Community CLI and copy this source in:

```bash
npx @react-native-community/cli@20.2.0 init ListPerformance --version 0.87.1
```

Then copy `App.tsx`, `src/`, `__tests__/`, `jest.config.js` and the dependency entries from this
`package.json` into the generated project, and install:

```bash
npm install @shopify/flash-list@2.3.2 react-native-safe-area-context@5.9.1
```

iOS also needs its native dependencies (**macOS with Xcode only**):

```bash
cd ios && bundle install && bundle exec pod install && cd ..
```

Run it:

```bash
npm start
```

```bash
npm run android
```

```bash
npm run ios
```

## What you should see

Scroll each mode hard, with the Performance monitor open from the Dev Menu
(<kbd>Ctrl</kbd>+<kbd>M</kbd> on Android, <kbd>Cmd</kbd>+<kbd>D</kbd> on the iOS simulator).

- **FlatList** — steady, with brief blank space if you fling far faster than rows can render.
- **FlatList (naive)** — a long freeze on mount and dropped frames while scrolling. On a low-end
  Android device the mount stall is seconds, not milliseconds.
- **FlashList** — smooth, with less blank space on fast flings, because it recycles row views
  instead of mounting and unmounting them.

> A release build is the only honest measurement. In debug, the JS is unoptimised and
> development-only checks run on every render, so all three modes look worse than they are.

## What the naive mode gets wrong

All three mistakes are in `App.tsx`, kept together deliberately:

1. **`renderItem` defined inline.** A new closure on every parent render, so `memo` on `Row`
   never matches and every visible row re-renders.
2. **`keyExtractor` defined inline.** Same problem, and it runs per item.
3. **`windowSize={41}` and a huge `initialNumToRender`.** Mounts hundreds of rows before the
   first frame. This is the one that produces the visible startup freeze.

## Things worth knowing

- **FlashList 2.x has no `estimatedItemSize`.** It measures rows itself. If a tutorial tells
  you to set one, it is describing version 1.
- **FlashList rejects `windowSize`, `initialNumToRender` and `getItemLayout`** at the type
  level. Its recycler has no equivalent knob, so these are compile errors rather than
  silently-ignored props.
- **FlashList declares its own `ListRenderItemInfo`** without React Native's `separators`
  field, so React Native's `ListRenderItem` type is not assignable to it. `App.tsx` therefore
  has two `renderItem` callbacks with identical bodies — see the comment there.
- **`getItemLayout` is not usable in this dataset.** A third of the rows are deliberately
  taller. `getItemLayout` is the single biggest `FlatList` win, but only when every row height
  is known in advance without measuring — which is exactly the case this data does not meet.

## Verify

```bash
npm run tsc
```

```bash
npm test
```

Both pass on Node 22.13.0 or newer. The tests cover the dataset — determinism (so two
measurement runs are comparable), unique keys, and the mixed row heights that rule
`getItemLayout` out.

## Related reading

- [List Performance in Depth](../../content/performance/list-performance.md)
- [Virtualization and FlashList](../../content/components/virtualization-and-flashlist.md)
- [FlatList](../../content/components/flatlist.md)
