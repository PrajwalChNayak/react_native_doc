---
title: Your First Screen
description: Replace the generated template with a real, typed screen — layout, text input, a list and press handling — using the 0.87 APIs that actually exist.
status: current
toolchain: cli
---

The screen `init` generates is a demo of the framework, not a starting point. This page replaces
it with something small but genuinely real: a task list with an input, a list, and press handling.
By the end you will have used every primitive that most screens are built from, and you will have
seen where React Native stops looking like the web.

Every code block on this page is type-checked against the installed React Native 0.87 types with
the Strict TypeScript API active. If it appears here, it compiles.

## Why it exists / when to use it — and when NOT to

This is the "hello world" that teaches something. It is deliberately not a navigation example, not
a state-management example and not a networking example — each of those has its own section, and
mixing them in makes it impossible to tell which part broke.

Skip to [Components](../components/view.md) instead if you already know React Native and just want
the reference for a specific primitive.

## What you need first

A project that builds and runs on at least one platform. If `npm run android` or `npm run ios` is
not working yet, fix that first — see [Running on Android](running-on-android.md) and
[Running on iOS](running-on-ios.md). Debugging a build failure and a layout bug at the same time is
twice as hard as debugging either alone.

One package is worth installing before you start, because the core alternative is deprecated:

:::tabs
@tab npm
```bash
npm install react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install && cd ..
```
@tab yarn
```bash
yarn add react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install && cd ..
```
@tab pnpm
```bash
pnpm add react-native-safe-area-context@5.9.1
cd ios && bundle exec pod install && cd ..
```
:::

Then rebuild: it contains native code, so restarting Metro is not enough.

> [!DEPRECATED] Core `SafeAreaView` is deprecated in 0.87
> The installed 0.87 type definitions mark `SafeAreaView` from `react-native` as
> `@deprecated Use react-native-safe-area-context instead`, and annotate it `@platform ios` — it
> does nothing on Android. Use `react-native-safe-area-context`, which handles both platforms and
> gives you the inset values directly when you need them.

## Basic example

Start by replacing the body of `App.tsx` with the smallest thing that renders. Get this on screen
before adding anything else, so that when something breaks later you know it was the thing you
just typed.

```tsx title=App.tsx
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <Text style={styles.heading}>Tasks</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  container: {flex: 1, padding: 16},
  heading: {fontSize: 28, fontWeight: '700'},
});
```

Four things in that file are worth pausing on, because each is a place a web developer's instinct
is wrong:

- **`View` is not a `div` and `Text` is not a `span`.** Every string has to be inside a `Text`.
  Putting a bare string in a `View` is an error, not a rendering quirk.
- **`flex: 1` on the root is what makes the screen fill the window.** Without it the container is
  as tall as its content. Nothing stretches by default.
- **`StyleSheet.create` returns plain style objects**, typed against the real style props. There is
  no cascade, no selectors and no inheritance from the `View` to the `Text`.
- **`SafeAreaProvider` goes at the very top, once.** `SafeAreaView` below it applies the insets.
  `edges` controls which ones — here the bottom is left alone so a list can scroll under the home
  indicator.

## How it works

### Layout is flexbox, with different defaults

`flexDirection` defaults to **`column`**, not `row`. That single difference accounts for most
"why is my layout stacked" confusion. The other defaults that differ from the web —
`alignContent`, `flexShrink`, `boxSizing` — are covered in
[Flexbox in React Native](../styling/flexbox.md).

Numbers in styles are **density-independent pixels**, not CSS pixels. There is no `px`, no `rem`,
no `em`, no `vh`. `padding: 16` means 16 dp, which is a similar physical size on every device
regardless of screen density. See [Units and Density](../styling/units-and-density.md).

### Text input, and holding its value

`TextInput` is controlled the same way a web input is: pass `value`, handle `onChangeText`.

```tsx title=A controlled input with a typed ref
import {useRef, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import type {TextInputInstance} from 'react-native';

export function Composer({onSubmit}: {onSubmit: (value: string) => void}) {
  const [value, setValue] = useState('');
  // Under the 0.87 Strict API each component has its own instance type.
  // There is no generic "native methods" type any more.
  const inputRef = useRef<TextInputInstance | null>(null);

  return (
    <View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        placeholder="What needs doing?"
        returnKeyType="done"
      />
      <Pressable
        onPress={() => {
          onSubmit(value);
          setValue('');
          // Keep the keyboard up so the next item can be typed immediately.
          inputRef.current?.focus();
        }}>
        <Text>Add</Text>
      </Pressable>
    </View>
  );
}
```

`onChangeText` gives you the string. There is also `onChange`, which gives you an event object —
use `onChangeText` unless you need something the event carries.

### Pressable, not a button element

`Pressable` is the touch primitive. Its `style` prop accepts a function that receives the current
press state, which is how you render a pressed appearance without any state of your own.

```tsx title=Press feedback and accessibility in one component
import {Pressable, StyleSheet, Text} from 'react-native';

type Task = {id: string; title: string; done: boolean};

export function TaskRow({task, onToggle}: {task: Task; onToggle: (id: string) => void}) {
  return (
    <Pressable
      onPress={() => onToggle(task.id)}
      // A row that toggles is a checkbox to a screen reader, not a button.
      accessibilityRole="checkbox"
      accessibilityState={{checked: task.done}}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={[styles.rowText, task.done && styles.rowTextDone]}>{task.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {paddingVertical: 14, paddingHorizontal: 16},
  rowPressed: {backgroundColor: '#f1f3f5'},
  rowText: {fontSize: 16},
  rowTextDone: {textDecorationLine: 'line-through', color: '#8a8f98'},
});
```

The `style` array with `condition && style` is the idiomatic conditional style. `false` entries are
ignored, so there is no need for a ternary with an empty object.

### Lists scroll; `View` does not

This is the difference that surprises people most. A `View` whose content is taller than the screen
**clips**. It does not scroll, it does not show a scrollbar, and nothing warns you. Scrolling is a
component you choose:

| Component | Use when |
| --- | --- |
| `ScrollView` | A small, bounded set of children — a form, a settings page. Every child is rendered and kept in memory |
| `FlatList` | A list of data of any length. Only the visible window plus a buffer is rendered |
| `SectionList` | The same, with section headers |

`FlatList` needs three props to work properly: `data`, `keyExtractor` and `renderItem`. The key
comes from your data, not from the index — using the index breaks reordering and deletion in ways
that look like a rendering bug.

## The complete screen

Everything above, assembled. This is a single self-contained file so you can paste it and run it;
in a real project the row would live in its own module.

```tsx title=src/screens/TaskScreen.tsx
import {useCallback, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {TextInputInstance} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type Task = {id: string; title: string; done: boolean};

export function TaskScreen() {
  const [draft, setDraft] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const inputRef = useRef<TextInputInstance | null>(null);

  const addTask = useCallback(() => {
    const title = draft.trim();
    if (title.length === 0) {
      return;
    }
    setTasks((prev) => [{id: `${Date.now()}`, title, done: false}, ...prev]);
    setDraft('');
    inputRef.current?.focus();
  }, [draft]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? {...t, done: !t.done} : t)));
  }, []);

  const remaining = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);

  // renderItem is memoised so FlatList does not see a new function identity
  // on every render of the screen.
  const renderItem = useCallback(
    ({item}: {item: Task}) => <TaskRow task={item} onToggle={toggleTask} />,
    [toggleTask],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.fill}
        // Android resizes the window for the keyboard already; iOS does not.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.heading}>{`${remaining} to do`}</Text>

        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addTask}
            placeholder="What needs doing?"
            returnKeyType="done"
            submitBehavior="submit"
            style={styles.input}
            accessibilityLabel="New task"
          />
          <Pressable
            onPress={addTask}
            disabled={draft.trim().length === 0}
            accessibilityRole="button"
            style={({pressed}) => [styles.add, pressed && styles.addPressed]}>
            <Text style={styles.addLabel}>Add</Text>
          </Pressable>
        </View>

        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          // Without this, the first tap only dismisses the keyboard and the
          // row never receives the press.
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TaskRow({task, onToggle}: {task: Task; onToggle: (id: string) => void}) {
  return (
    <Pressable
      onPress={() => onToggle(task.id)}
      accessibilityRole="checkbox"
      accessibilityState={{checked: task.done}}
      style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={[styles.rowText, task.done && styles.rowTextDone]}>{task.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#ffffff'},
  fill: {flex: 1},
  heading: {fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingTop: 8},
  composer: {flexDirection: 'row', gap: 8, padding: 16},
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9aa0a6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  add: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3355ff',
  },
  addPressed: {opacity: 0.7},
  addLabel: {color: '#ffffff', fontWeight: '600'},
  row: {paddingVertical: 14, paddingHorizontal: 16},
  rowPressed: {backgroundColor: '#f1f3f5'},
  rowText: {fontSize: 16},
  rowTextDone: {textDecorationLine: 'line-through', color: '#8a8f98'},
  empty: {textAlign: 'center', marginTop: 48, color: '#8a8f98'},
});
```

Wire it into the app:

```tsx-fragment title=App.tsx
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TaskScreen} from './src/screens/TaskScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <TaskScreen />
    </SafeAreaProvider>
  );
}
```

Save, and Fast Refresh puts the new screen on the device without losing your place. See
[Dev Menu and Fast Refresh](dev-menu-and-fast-refresh.md) for when it will and will not keep your
state.

## Platform differences

:::tabs
@tab iOS
The keyboard **overlays** the app rather than resizing it, which is why `KeyboardAvoidingView`
needs `behavior="padding"` here. Safe-area insets matter at the top (notch or Dynamic Island) and
at the bottom (home indicator).

`TextInput` respects `returnKeyType` fully, and `submitBehavior="submit"` keeps the keyboard open
after submitting so the next item can be typed straight away.
@tab Android
The window is resized for the keyboard by the system, so `KeyboardAvoidingView` usually needs no
`behavior` at all — passing `padding` on Android often double-compensates and pushes content too
far. Hence the `Platform.OS === 'ios' ? 'padding' : undefined`.

Insets come from the status bar and the gesture navigation bar. `react-native-safe-area-context`
reports both; core `SafeAreaView` reports neither, because it is iOS-only.
:::

`StyleSheet.hairlineWidth` used on the input border is the thinnest line the device can draw. It
resolves to a different number per device because it depends on pixel density — see
[Units and Density](../styling/units-and-density.md).

## Performance considerations

Nothing on this screen needs optimising at this size, but two of the choices above become
important as the list grows, and it is easier to learn them now:

- **`renderItem` is wrapped in `useCallback`.** An inline arrow creates a new function on every
  render of the screen, which defeats `FlatList`'s ability to skip re-rendering rows.
- **`toggleTask` has an empty dependency array** because it uses the updater form of `setTasks`.
  Reading `tasks` inside it would force a new identity on every change and re-render every row.
- **`FlatList`, not `ScrollView` with `map`.** `ScrollView` renders and retains every child. At a
  few dozen rows you will not notice; at a few hundred you will, and the fix is a rewrite rather
  than a tweak.

See [List Performance in Depth](../performance/list-performance.md) once the list is real.

## Common mistakes

- **Putting a bare string inside a `View`.** Wrong: `<View>Tasks</View>`. Right:
  `<View><Text>Tasks</Text></View>`. Every string needs a `Text` ancestor.
- **Expecting a `View` to scroll.** Wrong: a tall column of rows inside a `View`, then wondering
  where the rest went. Right: `FlatList` for data, `ScrollView` for a bounded form.
- **Setting `color` on a `View` and expecting the `Text` to pick it up.** There is no inheritance
  from a `View` to its children. The one exception is a `Text` nested inside another `Text`.
- **Forgetting `flex: 1` on the root.** Without it the screen is as tall as its content, so a
  centred layout centres inside a zero-height box.
- **Using the array index as `keyExtractor`.** Wrong: `keyExtractor={(_, i) => String(i)}`. Right:
  a stable id from the data. Index keys break as soon as you delete or reorder.
- **Omitting `keyboardShouldPersistTaps`.** With the keyboard open, the first tap on a row is
  swallowed by the dismiss gesture and the row never fires. `"handled"` is the usual value — and
  note that the boolean form of this prop was **removed in 0.87**; it takes
  `'never' | 'always' | 'handled'`.
- **Reaching for `SafeAreaView` from `react-native`.** It is deprecated in 0.87 and iOS-only, so
  your Android layout quietly sits under the status bar. Use `react-native-safe-area-context`.
- **Installing a native package and only restarting Metro.** `react-native-safe-area-context`
  contains native code. Run `pod install` on iOS and rebuild on both platforms.

## Related topics

- [View](../components/view.md) — the layout primitive in detail.
- [Text](../components/text.md) — text, nesting and the one place inheritance exists.
- [TextInput](../components/textinput.md) — controlled input, keyboards and submission.
- [Pressable and Touchables](../components/pressable-and-touchables.md) — the modern touch primitive.
- [FlatList](../components/flatlist.md) — virtualization, keys and the props that matter.
- [Flexbox in React Native](../styling/flexbox.md) — the defaults that differ from the web.
- [StyleSheet](../styling/stylesheet.md) — how styles are declared, merged and typed.
- [Safe Areas](../components/safe-areas.md) — insets, notches and gesture bars.
- [Dev Menu and Fast Refresh](dev-menu-and-fast-refresh.md) — the loop you just used.
- [Learning Path](learning-path.md) — where to go next, and what to skip.
