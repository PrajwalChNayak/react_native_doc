---
title: Params and Typed Routes
description: Declaring a param list, typing screen props and hooks, and the React Navigation 7 global declaration that makes every navigate call checked without a generic.
status: current
toolchain: cli
---

Params are the data a screen is opened with: an id, a filter, a draft key. In React Navigation they
live inside the navigation state, which means they are serialised, restored, and reconstructed from
deep links. That single fact explains every rule on this page.

This is also the page that decides whether the rest of your navigation code is checked or not.
React Navigation ships full TypeScript types, but they only do their job once you have told the
library what your routes are. Every pattern below was compiled against
`@react-navigation/native` 7.3.18 and the installed type definitions.

## Why it exists / when to use it — and when NOT to

Without types, `navigation.navigate('Detials', {id})` compiles, ships, and does nothing at runtime.
The action bubbles up, no router handles it, and — unless you happen to have `onUnhandledAction`
wired to something visible — nothing tells you. Typed routes turn that into a compile error.

Params are not a state container. Put in them what identifies the screen: an id, a query string, a
tab name. Do not put in them the object that id refers to. The fetched record belongs in a cache or
a store; duplicating it into params means a stale copy is restored days later when the app reopens.

## The param list

A param list is a plain type mapping each route name to its params. `undefined` means the screen
takes none.

```ts title=src/navigation/types.ts
export type RootStackParamList = {
  Home: undefined;
  // Required params: navigate('Post', {postId}) will not compile without them.
  Post: {postId: string};
  // Optional params: the whole object may be omitted.
  Search: {query?: string} | undefined;
};
```

The difference between `{query?: string}` and `{query?: string} | undefined` matters. The types
check whether `undefined extends ParamList[RouteName]`; if it does, the params argument to
`navigate` becomes optional. `{query?: string}` alone still requires you to pass an object, even an
empty one.

Pass the list to the navigator factory and the navigator's `name` props are checked against it:

```tsx title=src/navigation/RootNavigator.tsx
import {Text} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
  Search: {query?: string} | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const Placeholder = () => <Text>Screen</Text>;

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={Placeholder} />
      <Stack.Screen name="Post" component={Placeholder} initialParams={{postId: 'draft'}} />
      <Stack.Screen name="Search" component={Placeholder} />
    </Stack.Navigator>
  );
}
```

## Typing a screen component

A screen receives `navigation` and `route`. Each navigator package exports a props type that pairs
them for one route name.

```tsx title=src/screens/PostScreen.tsx
import {Button, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
  Search: {query?: string} | undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Post'>;

export function PostScreen({route, navigation}: Props) {
  // `postId` is a string here, not `any` and not possibly undefined.
  const {postId} = route.params;

  return (
    <View>
      <Text>{postId}</Text>
      {/* `Search` takes optional params, so no second argument is needed. */}
      <Button title="Search" onPress={() => navigation.navigate('Search')} />
      {/* Narrowing params on the current route. */}
      <Button title="Next" onPress={() => navigation.setParams({postId: 'next'})} />
    </View>
  );
}
```

The equivalents for the other navigators are `BottomTabScreenProps` from
`@react-navigation/bottom-tabs` and `DrawerScreenProps` from `@react-navigation/drawer`. Each is
`{navigation, route}` with that navigator's own navigation prop, so `replace` and `push` exist on a
stack's and `jumpTo` on a tab's.

`setParams` shallow-merges a partial. `replaceParams` takes the whole object and replaces it, which
is what you want when clearing a filter rather than adding to it.

## Typing the hooks

A component that is not a screen — a button in a list row, a header item — uses `useNavigation`.
Its type parameter is the navigation prop you expect:

```tsx title=src/components/OpenPostButton.tsx
import {Button} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
};

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
type PostRoute = RouteProp<RootStackParamList, 'Post'>;

export function OpenPostButton({postId}: {postId: string}) {
  const navigation = useNavigation<RootNavigation>();
  return <Button title="Open" onPress={() => navigation.navigate('Post', {postId})} />;
}

export function PostIdLabel() {
  // useRoute cannot infer which screen it is inside — say so explicitly.
  const route = useRoute<PostRoute>();
  return <Button title={route.params.postId} onPress={() => {}} />;
}
```

`useRoute` has no way to know which screen it was called from, so without the type parameter its
`params` are `ParamListBase`'s — effectively `object | undefined`. Passing the wrong `RouteProp`
type is not caught either: the hook trusts you. Prefer the screen's own `route` prop where you have
one, and use `useRoute` only for components that are genuinely reusable across screens.

## The global declaration — verified

Writing the generic on every `useNavigation` call gets old, and it is easy to forget one. React
Navigation 7 solves this by letting you register your root navigator once, globally. This is the
part that changed from version 6 and the part most remembered snippets get wrong.

In version 7 there is an exported interface named `RootNavigator` in `@react-navigation/core`, and
the global `ReactNavigation.RootParamList` is **derived from it**. The declaration in the installed
types is:

```text
declare global {
  namespace ReactNavigation {
    interface RootParamList extends ParamListForRootNavigator<RootNavigator> {}
  }
}
```

So you augment `RootNavigator` with your navigator's type, and the param list is extracted for you —
from either a dynamically typed navigator or a static config:

```tsx title=src/navigation/RootNavigator.tsx
import {Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

type RootStackType = typeof RootStack;

// Registers the root navigator globally. Do this exactly once in the app.
declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}

const Placeholder = () => <Text>Screen</Text>;

export function App() {
  return (
    <NavigationContainer>
      <RootStack.Navigator>
        <RootStack.Screen name="Home" component={Placeholder} />
        <RootStack.Screen name="Post" component={Placeholder} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
```

After that, `useNavigation()` with no type parameter is fully typed everywhere in the app:

```tsx title=src/components/OpenPostButton.tsx
import {Button} from 'react-native';
import {useNavigation} from '@react-navigation/native';

export function OpenPostButton({postId}: {postId: string}) {
  // No generic. The screen name and the params shape are both checked.
  const navigation = useNavigation();

  return <Button title="Open" onPress={() => navigation.navigate('Post', {postId})} />;
}
```

A wrong name or wrong params is now a compile error. This block proves it — the compiler is
required to produce an error on each marked line, and the page would fail to build if it did not:

```tsx title=src/components/Broken.tsx
import {Button} from 'react-native';
import {useNavigation} from '@react-navigation/native';

export function Broken() {
  const navigation = useNavigation();

  // @ts-expect-error 'Detials' is not a route in the registered param list.
  navigation.navigate('Detials', {postId: '1'});

  // @ts-expect-error 'Post' requires { postId: string }.
  navigation.navigate('Post', {postID: 1});

  return <Button title="x" onPress={() => {}} />;
}
```

### The other form, and which to use

The global namespace can also be augmented directly, which is the form most version 6 codebases
use. It still works in 7 — `ReactNavigation.RootParamList` is an interface, so your declaration
merges into it:

```ts title=src/navigation/types.ts
export type RootStackParamList = {
  Home: undefined;
  Post: {postId: string};
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
```

| | `declare module '@react-navigation/core'` on `RootNavigator` | `declare global` on `RootParamList` |
| --- | --- | --- |
| What you register | The navigator itself | A hand-written param list |
| Static API | Works — the list is inferred from the config | You would have to write `StaticParamList` by hand |
| Drift risk | None; the type follows the navigator | The list and the navigator can disagree silently |
| Version | 7 | 6 and 7 |

Prefer the `RootNavigator` form on a new version 7 app. Both are real and both compile; declare
only one of them, in one file, for one navigator.

> [!WARNING] It types the root, not every navigator
> The global declaration makes screens of the **root** navigator reachable without a generic.
> Screens that live only in a nested navigator are reachable through the nested form described in
> [Nesting Navigators](nesting.md), and a screen component that needs both its own params and the
> parent's still uses `CompositeScreenProps`.

### With the static API

If the navigator is built from a config object, there is no hand-written param list at all —
`StaticParamList` infers it:

```tsx title=src/navigation/RootNavigator.tsx
import {Text} from 'react-native';
import {createStaticNavigation} from '@react-navigation/native';
import type {StaticParamList, StaticScreenProps} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

function HomeScreen() {
  return <Text>Home</Text>;
}

// A static screen declares its params through its own props type.
function PostScreen({route}: StaticScreenProps<{postId: string}>) {
  return <Text>{route.params.postId}</Text>;
}

const RootStack = createNativeStackNavigator({
  screens: {
    Home: HomeScreen,
    Post: PostScreen,
  },
});

export type RootParamList = StaticParamList<typeof RootStack>;

const Navigation = createStaticNavigation(RootStack);

export function App() {
  return <Navigation />;
}
```

The same `declare module '@react-navigation/core' { interface RootNavigator extends typeof RootStack {} }`
augmentation works here, which is why it is the better of the two forms: one mechanism covers both
APIs.

## Params must be serialisable

The navigation state is serialised for state restoration and rebuilt from URLs for deep links.
Anything that does not survive `JSON.stringify` does not belong in params.

`checkSerializable` runs in development and logs a warning naming the offending path: "Non-serializable
values were found in the navigation state." It is a warning, not an error, so it is easy to ignore
until state restoration silently drops half a screen's params.

Do not pass:

- Functions, including callbacks such as `onSelect`. Use a store, a context, or the
  `navigate(..., {merge: true})` pattern where the child writes params back to the parent route.
- Class instances — `Date`, `Map`, `Set`, a model object. Pass an ISO string or an id instead.
- React elements or components.
- Large blobs. Params are re-serialised on every state change; a 200 KB object in params is a
  200 KB `JSON.stringify` per navigation.

```tsx title=src/screens/FilterScreen.tsx
import {Button} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  List: {sinceIso?: string};
  Filter: undefined;
};

export function FilterScreen({navigation}: NativeStackScreenProps<RootStackParamList, 'Filter'>) {
  const since = new Date();

  return (
    <Button
      title="Apply"
      onPress={() =>
        // A Date instance would warn; an ISO string round-trips through JSON unchanged.
        navigation.navigate('List', {sinceIso: since.toISOString()}, {merge: true})
      }
    />
  );
}
```

## Security considerations

Typed params protect you from your own typos. They protect you from nothing an attacker sends.

A param that arrives from a deep link is a string an attacker chose. TypeScript erases at build
time, so `route.params.postId` is typed `string` and can still be `../../admin` or a URL pointing at
a host you do not control. Validate params that can originate outside the app at the point of use,
not at the type level — the full treatment, including a vulnerable handler and its fix, is in
[Deep Linking and Universal Links](deep-linking.md) and
[Deep Link Validation](../security/deep-link-validation.md).

The same applies to state restoration: a persisted state file on a rooted device is editable, so
params restored from disk are also untrusted. See [State Persistence](state-persistence.md).

## Common mistakes

- **Typing the param list but never passing it to the factory.** Wrong:
  `const Stack = createNativeStackNavigator();` next to a perfectly good `RootStackParamList`. The
  generic defaults to `ParamListBase` and every name and param becomes `any`. Right:
  `createNativeStackNavigator<RootStackParamList>()`.
- **Using `{}` where `undefined` belongs.** `Home: {}` forces every caller to write
  `navigate('Home', {})`. `Home: undefined` is what "takes no params" means.
- **Expecting `useRoute()` to know where it is.** It returns `ParamListBase`'s route type unless you
  pass `RouteProp<ParamList, 'Name'>`, and it will happily accept the wrong one. It is an assertion,
  not an inference.
- **Declaring the global param list in more than one file.** Interfaces merge, so two declarations
  with conflicting shapes for the same route produce a confusing error far from either file — or,
  worse, merge cleanly and give you a union you did not intend.
- **Putting a callback in params.** Wrong: `navigate('Picker', {onSelect: setValue})`. It warns in
  development, breaks state restoration, and silently stops working after the app is restored from
  the background on Android. Right: navigate back with params, or use shared state.
- **Trusting `route.params` because it is typed.** Types are erased. A deep link fills params
  directly from a URL.
- **Reaching for `as` to silence a param error.** `route.params as Post` is the point at which the
  types stop helping. If the shape is wrong, the param list is wrong.

## Related topics

- [React Navigation Fundamentals](fundamentals.md) — the static and dynamic APIs these types follow.
- [Nesting Navigators](nesting.md) — `NavigatorScreenParams` and `CompositeScreenProps`.
- [Deep Linking and Universal Links](deep-linking.md) — where untrusted params come from.
- [Deep Link Validation](../security/deep-link-validation.md) — allow-listing param values.
- [State Persistence](state-persistence.md) — why params must survive `JSON.stringify`.
- [Native Stack](native-stack.md) — the navigation actions these types describe.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — the wider 0.87 typing change.
