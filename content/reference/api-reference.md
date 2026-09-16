---
title: API Reference
description: Every non-component value React Native 0.87.1 exports — modules, hooks, utilities and Codegen helpers — read from the installed type definitions.
status: current
allow-banned: interaction-manager, image-background, rn-get-polyfills, core-cli-utils
toolchain: cli
---

This page lists the 60 non-component values exported from `react-native@0.87.1`, plus the namespace
exports and the one function declared directly in the entry point. It was read from
`types_generated/index.d.ts` in the installed package.

Components are on [Component Reference](component-reference.md). Together the two pages cover the
92 named value exports of the package root.

**If an API is not on this page or that one, it is not in React Native core.** Check before you
assume; a great deal of React Native advice online names APIs that were extracted into community
packages years ago.

## How to read the tables

- **Platform** is `both`, `iOS` or `Android`.
- **Status** is `current` or `deprecated`, and every deprecation is quoted from the `@deprecated`
  annotation in the installed types rather than inferred.
- Types (as opposed to values) are listed separately at the end — `HostInstance`, `ViewProps`,
  `ColorSchemeName` and so on are type-only exports and cannot be imported as values.

## Device and environment

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `Platform` | `Platform.OS`, `Platform.Version`, `Platform.select`, `Platform.isTV` | both | current |
| `Dimensions` | Window and screen size, scale and font scale. Prefer `useWindowDimensions` in components | both | current |
| `PixelRatio` | Device pixel density and conversions between dp and physical pixels | both | current |
| `DeviceInfo` | Raw device constants, including the dimensions payload | both | current |
| `I18nManager` | Right-to-left layout state and forcing | both | current |
| `Settings` | Read and write native user preferences | iOS (documented as iOS-only; the 0.87.1 types carry no platform annotation) | current |
| `ReactNativeVersion` | The running React Native version as `{major, minor, patch, prerelease}` | both | current |
| `AppState` | Foreground/background state and change events | both | current |
| `BackHandler` | Hardware back button handling | Android | current |

## Styling and colour

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `StyleSheet` | `create`, `flatten`, `compose`, `absoluteFill`, `absoluteFillObject`, `hairlineWidth` | both | current |
| `processColor` | Converts a colour value to the platform's internal representation | both | current |
| `PlatformColor` | References a named system colour by platform | both | current |
| `DynamicColorIOS` | A colour that resolves differently in light and dark mode | iOS | current |
| `useColorScheme` | Hook returning `'light' | 'dark' | null`. `null` only when the native Appearance module is unavailable | both | current |
| `Appearance` | Namespace: `getColorScheme()`, `setColorScheme()`, `addChangeListener()` | both | current |

`StyleSheet.absoluteFill` is the replacement for the deprecated `ImageBackground` pattern — see
[Component Reference](component-reference.md).

`Appearance.setColorScheme` takes `'light'`, `'dark'` or `'auto'`. The 0.87.1 type documents
`'auto'` directly: "Pass `'auto'` to reset and follow the system default (removes any override)."

## Layout measurement

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `useWindowDimensions` | Hook returning the current window size; re-renders on change | both | current |
| `findNodeHandle` | Returns the native tag for a component instance | both | current |
| `UIManager` | Low-level view manager access | both | current |

Prefer a ref's `measure` / `measureInWindow` over `UIManager` and `findNodeHandle`. The 0.87.1 types
mark the `UIManager` measurement methods deprecated in favour of `ref.measure`,
`ref.measureInWindow` and `ref.measureLayout`.

## Interaction and gestures

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `PanResponder` | The built-in gesture recogniser, built on the responder system | both | current |
| `usePressability` | Hook exposing the press-handling machinery `Pressable` uses internally | both | current |
| `Keyboard` | Keyboard show/hide events and `dismiss()` | both | current |

For anything beyond a simple drag, `react-native-gesture-handler` (3.3.0) is the practical choice —
it runs recognition on the UI thread. `PanResponder` runs in JavaScript.

## Animation

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `Animated` | The built-in animation library: `Value`, `timing`, `spring`, `Animated.View` and friends | both | current |
| `Easing` | Easing functions for `Animated` | both | current |
| `useAnimatedValue` | Hook creating a stable `Animated.Value` | both | current |
| `useAnimatedValueXY` | Hook creating a stable `Animated.ValueXY` | both | current |
| `useAnimatedColor` | Hook creating a stable animated colour value | both | current |
| `LayoutAnimation` | Declares an animation to apply to the next layout change | both | current |

`react-native-reanimated` (4.6.0) is the ecosystem default for anything non-trivial. Remember it
requires `react-native-worklets` (0.12.x) as a **separate install**; see
[Native Dependency Compatibility](../migration/native-dependency-compatibility.md).

## System UI and user feedback

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `Alert` | Native alert dialogs with buttons | both | current |
| `ActionSheetIOS` | The iOS action sheet and share sheet | iOS | current |
| `ToastAndroid` | A short Android toast message | Android | current |
| `Share` | The system share sheet | both | current |
| `Vibration` | Vibrate the device. Requires `android.permission.VIBRATE` on Android | both | current |
| `Linking` | Open URLs and handle incoming deep links | both | current |
| `Clipboard` | Read and write the clipboard | both | **deprecated** — "extracted from react-native core … install and import from `@react-native-clipboard/clipboard`" |
| `PushNotificationIOS` | Local and remote notification handling | iOS | **deprecated** — "Use `@react-native-community/push-notification-ios` instead" |
| `PermissionsAndroid` | Runtime permission requests | Android | current |
| `AccessibilityInfo` | Screen reader state, reduce-motion state and announcements | both | current |

`Vibration.vibrate` takes a duration on iOS that is effectively fixed at about 400 ms; on Android an
array alternates wait and vibrate durations. Read the platform note before assuming a pattern works
on both.

## App lifecycle and registration

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `AppRegistry` | Registers the root component and headless tasks | both | current |
| `registerCallableModule` | Registers a JavaScript module callable from native | both | current |
| `RootTagContext` | React context carrying the root tag of the current surface | both | current |

## Events

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `EventEmitter` | The generic emitter implementation | both | current |
| `NativeEventEmitter` | Emitter bound to a native module's events | both | current |
| `DeviceEventEmitter` | The global device event emitter | both | current |
| `NativeAppEventEmitter` | The legacy app-level emitter, still exported | both | current |

Subscriptions returned by these are `EventSubscription`. The older `EmitterSubscription` and
`NativeEventSubscription` type aliases are marked deprecated in the 0.87.1 types in favour of
`EventSubscription`.

## Native module access and Codegen

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `TurboModuleRegistry` | Namespace: `get`, `getEnforcing`. **This is how you obtain a native module** | both | current |
| `codegenNativeComponent` | Declares a Fabric native component from a props type | both | current |
| `codegenNativeCommands` | Declares imperative View Commands on a native component | both | current |
| `requireNativeComponent` | The legacy way to reach a native component | both | current |
| `NativeComponentRegistry` | Namespace: lower-level native component registration | both | current |
| `NativeModules` | The legacy native module object. Still exported; **not** how a TurboModule is obtained | both | current |
| `Networking` | The low-level networking module behind `fetch` and `XMLHttpRequest` | both | current |
| `AssetRegistry` | Registers and resolves packaged assets. Replaces `@react-native/assets-registry` | both | current |

> [!WARNING] `NativeModules` is exported but is not the modern path
> A TurboModule is obtained with `TurboModuleRegistry.getEnforcing<Spec>('Name')` from a Codegen
> spec. `NativeModules` remains exported for compatibility, and mocking a property on it does not
> affect a TurboModule — a common and confusing test failure. See
> [Mocking Native Modules](../testing/mocking-native-modules.md).

## Development and debugging

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `LogBox` | Controls the in-app error and warning overlay; `ignoreLogs`, `ignoreAllLogs` | both | current |
| `DevSettings` | Add Dev Menu items and reload the app from code | both | current |
| `DevMenu` | `show()` — opens the Dev Menu programmatically | both | current |
| `Systrace` | Namespace: performance tracing. Several members are no-ops in 0.87 | both | current |

## Text and miscellaneous

| Export | Purpose | Platform | Status |
| --- | --- | --- | --- |
| `UTFSequence` | Named Unicode constants: `BULLET`, `MDASH`, `NBSP`, `NEWLINE` and more | both | current |
| `unstable_TextAncestorContext` | Context indicating whether the tree is already inside a `Text` | both | current (unstable) |
| `unstable_batchedUpdates` | Batches state updates into one render pass | both | current (unstable) |

## The virtual-collection family

An experimental collection system, exported with `unstable_` prefixes. The components are in
[Component Reference](component-reference.md); the values are here.

| Export | Purpose |
| --- | --- |
| `VirtualViewMode` | The mode enum reported by `unstable_VirtualView` |
| `unstable_VirtualArray` | An array-backed virtual collection |
| `unstable_createVirtualCollectionView` | Factory producing a virtual collection view component |
| `unstable_VirtualColumnGenerator` | Generator driving column layout |
| `unstable_getScrollParent` | Finds the nearest scrolling ancestor of a node |
| `unstable_DEFAULT_INITIAL_NUM_TO_RENDER` | The default initial render count constant |

An `unstable_` prefix is the API telling you it can change in a minor release. Do not build a
product surface on one without a plan for it moving.

## Type-only exports worth knowing

These cannot be imported as values. They are the types you will reach for most often.

| Type | Use |
| --- | --- |
| `HostInstance` | A generic host element with `measure`, `measureInWindow`, `measureLayout`, `focus`, `blur` |
| `ViewInstance`, `TextInstance`, `TextInputInstance`, `ScrollViewInstance`, `FlatListInstance`, … | Per-component ref types; prefer these over the generic one |
| `ViewProps`, `TextProps`, `ImageProps`, `ScrollViewProps`, `TextInputProps`, … | Component prop types (the `*Properties` aliases were removed in 0.87) |
| `ViewStyle`, `TextStyle`, `ImageStyle`, `StyleProp<T>` | Style types |
| `ColorValue`, `DimensionValue`, `OpaqueColorValue` | Style value types |
| `ColorSchemeName` | `'light' | 'dark'` |
| `TurboModule` | The base interface every TurboModule spec extends |
| `CodegenTypes` | Namespace of Codegen helper types: `Double`, `Int32`, `WithDefault`, `DirectEventHandler`, `BubblingEventHandler` |
| `HostComponent<P>` | The type of a native component |
| `LayoutChangeEvent`, `GestureResponderEvent`, `NativeSyntheticEvent<T>`, `NativeScrollEvent` | Event types |
| `EventSubscription` | What every emitter's `addListener` returns |

## Basic example

Half a dozen of these appear in almost every app:

```tsx title=src/screens/SettingsScreen.tsx
import {useEffect, useState} from 'react';
import {
  View,
  Text,
  Switch,
  Alert,
  Linking,
  Platform,
  AppState,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import type {AppStateStatus} from 'react-native';

export function SettingsScreen() {
  const scheme = useColorScheme();
  const {width} = useWindowDimensions();
  const [notifications, setNotifications] = useState(false);
  // AppState.currentState is typed `null | undefined | string`, not
  // AppStateStatus — it may be unset before the app settles. Narrow it.
  const [state, setState] = useState<AppStateStatus>(
    (AppState.currentState as AppStateStatus | null) ?? 'unknown',
  );

  useEffect(() => {
    // addEventListener returns an EventSubscription; remove() is the only cleanup.
    const sub = AppState.addEventListener('change', setState);
    return () => sub.remove();
  }, []);

  async function openSystemSettings() {
    // Linking.openSettings exists on both platforms; the destination differs.
    const supported = await Linking.canOpenURL('app-settings:');
    if (!supported && Platform.OS === 'ios') {
      Alert.alert('Unavailable', 'Open Settings manually to change permissions.');
      return;
    }
    await Linking.openSettings();
  }

  return (
    <View style={[styles.root, scheme === 'dark' && styles.dark]}>
      <Text>Width: {Math.round(width)}dp</Text>
      <Text>App state: {state}</Text>
      <Switch
        value={notifications}
        onValueChange={setNotifications}
        accessibilityLabel="Enable notifications"
      />
      <Text onPress={openSystemSettings} accessibilityRole="link">
        Open system settings
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 16, gap: 12, backgroundColor: '#ffffff'},
  dark: {backgroundColor: '#101418'},
});
```

## APIs people expect and core does not have

| Name | Reality |
| --- | --- |
| `AsyncStorage` | `@react-native-async-storage/async-storage` (3.1.1), or `react-native-mmkv` (4.3.2) |
| `NetInfo` | `@react-native-community/netinfo` (12.0.1) |
| `Geolocation` | Extracted; use a community package |
| `CameraRoll`, `ImagePickerIOS` | Extracted |
| `InteractionManager` | **Removed in 0.87.** Use the `requestIdleCallback` global |
| `NativeDialogManagerAndroid` | **Removed in 0.87.** Use `Alert` |
| `Touchable` (root export) | **Removed in 0.87.** Use `Pressable` |
| `rn-get-polyfills` | **Removed.** Use `@react-native/js-polyfills` |
| `@react-native/core-cli-utils` | **No longer published** |

## Platform differences

:::tabs
@tab iOS
iOS-only: `ActionSheetIOS`, `DynamicColorIOS`, `PushNotificationIOS` (deprecated), and `Settings` as
documented. `Alert` takes an iOS-only button style; `Share` takes iOS-only options.
`PushNotificationIOS` still exists but its replacement is a community package.
@tab Android
Android-only: `ToastAndroid`, `PermissionsAndroid`, `BackHandler`. `BackHandler` exists in the type
surface on both platforms but the hardware back button is an Android concept — an iOS-only build has
nothing to handle. `Vibration` requires `android.permission.VIBRATE` in `AndroidManifest.xml`.
:::

## Performance considerations

- **`Dimensions.get()` is a snapshot.** It does not update on rotation or on a foldable. Use
  `useWindowDimensions` in components so the value is reactive.
- **`Animated` without the native driver runs on the JS thread.** A blocked JS thread drops the
  animation. Reanimated runs on the UI thread instead.
- **Every `addEventListener` returns a subscription you must `remove()`.** Leaked listeners are one
  of the more common memory problems in a long-lived app.
- **`LayoutAnimation` applies to the next layout pass globally.** Two components configuring it in
  the same tick fight each other.
- **`findNodeHandle` and `UIManager` force a round trip.** A ref's `measure` is the supported path
  and the types say so.

## Common mistakes

- **Reaching into `NativeModules` for a TurboModule.** Wrong: `NativeModules.MyModule.doThing()`.
  Right: `TurboModuleRegistry.getEnforcing<Spec>('MyModule')`. The legacy object is still exported,
  which makes the mistake compile.
- **Comparing `useColorScheme()` against a third value.** Wrong: checking for a "not set" string.
  Right: it returns `'light'`, `'dark'` or `null`, and `null` only when the native Appearance module
  is missing. Treat `null` as your default theme.
- **Calling `Dimensions.get('window')` at module scope.** Wrong: a constant captured at import time.
  Right: `useWindowDimensions()`. The module-scope value is wrong after the first rotation.
- **Forgetting to remove a subscription.** Wrong: `AppState.addEventListener('change', fn)` with no
  cleanup. Right: keep the returned subscription and call `remove()` in the effect's cleanup.
- **Assuming an API exists because it used to.** Wrong: importing `AsyncStorage` or
  `InteractionManager` from `react-native`. Right: check this page. Both are gone from core.
- **Using `Clipboard` or `PushNotificationIOS` in new code.** Both are deprecated in the 0.87.1
  types with named replacement packages. They work today and will be removed.

## Related topics

- [Component Reference](component-reference.md) — the other 32 exports.
- [Cheat Sheet](cheat-sheet.md) — the condensed daily-lookup version.
- [Migrating to the Strict TypeScript API](../migration/strict-typescript-api.md) — why the root of `react-native` is now the only import path.
- [0.87 Breaking Changes](../migration/breaking-changes-087.md) — what was removed from this surface.
- [TurboModules](../core-concepts/turbomodules.md) — what `TurboModuleRegistry` gives you.
- [Codegen and Spec Files](../native-modules/codegen-specs.md) — `codegenNativeComponent` and `codegenNativeCommands` in use.
- [Dark Mode](../styling/dark-mode.md) — `useColorScheme` and `Appearance` in practice.
- [Troubleshooting](troubleshooting.md) — when an API is undefined at runtime.
