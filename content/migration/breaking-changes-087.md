---
title: 0.87 Breaking Changes
description: The complete list of what React Native 0.87 removed and deprecated, each with its replacement and a before/after pair — usable as an upgrade checklist.
status: current
toolchain: cli
---

This is the definitive list for React Native 0.87.1. Every removal and every deprecation is below,
with the replacement and, where code is involved, a before/after pair. Work through it top to bottom
as a checklist.

Two of the changes here are large enough to have their own pages:
[Migrating to the Strict TypeScript API](strict-typescript-api.md) for the deep-import and ref-type
changes, and [CocoaPods to Swift Package Manager](cocoapods-to-spm.md) for the experimental iOS
build path. This page gives the short form of both and links out.

> [!LEGACY] Legacy code appears on this page on purpose
> Every "before" block below shows code that no longer works. It is here so you can recognise it in
> your own project. None of it is a pattern to copy, and none of it compiles against 0.87.

## How to use this page

1. Run `npx tsc --noEmit`. Under the Strict TypeScript API this catches the type-level removals —
   deep imports, `*Properties` aliases, ref types — as hard errors, which is most of section 1.
2. Grep for the runtime removals, which the compiler cannot always see.
3. Build both platforms. The native removals in sections 4 and 5 surface there.
4. Run the app. The behavioural changes in section 3 do not break the build.

A grep pass that finds most of it:

```bash
grep -rn --include=*.ts --include=*.tsx --include=*.js --include=*.jsx \
  -e "react-native/Libraries/" \
  -e "react-native/src/private/" \
  -e "InteractionManager" \
  -e "rn-get-polyfills" \
  -e "InitializeCore" \
  -e "useTurboModules" \
  -e "NativeMethods" \
  -e "Properties\b" \
  -e "NativeDialogManagerAndroid" \
  -e "@react-native/core-cli-utils" \
  -e "@react-native/assets-registry" \
  src/
```

---

## 1. Removed — type-level and import-level

### 1.1 Deep imports into `react-native/Libraries/` and `react-native/src/private/`

**Replacement:** import from the package root.

This is enforced by the `exports` map in `react-native` itself, which sets `"types": null` for
`./Libraries/*`. It is a type error, not a lint rule.

```diff
-import StyleSheet from 'react-native/Libraries/StyleSheet/StyleSheet';
-import Platform from 'react-native/Libraries/Utilities/Platform';
-import type {ViewProps} from 'react-native/Libraries/Components/View/ViewPropTypes';
+import {StyleSheet, Platform} from 'react-native';
+import type {ViewProps} from 'react-native';
```

Imports from `react-native/src/private/` were **removed**, not merely untyped. Everything that used
to be reached that way and is still public is re-exported from the root — `HostInstance`,
`AssetRegistry`, `DevMenu`, `VirtualViewMode` and the `unstable_Virtual*` family all come from
`'react-native'` now.

Full treatment, including the temporary opt-out:
[Migrating to the Strict TypeScript API](strict-typescript-api.md).

### 1.2 `*Properties` type aliases

**Replacement:** the `*Props` name.

`ViewProperties`, `TextProperties`, `ImageProperties`, `ScrollViewProperties`,
`TextInputProperties`, `TouchableOpacityProperties` and the rest were long-standing aliases. They
are gone.

```diff
-import type {ViewProperties, TextProperties} from 'react-native';
+import type {ViewProps, TextProps} from 'react-native';

-type Props = ViewProperties & {title: string};
+type Props = ViewProps & {title: string};
```

The compiler names the missing type, so `tsc --noEmit` finds every one.

### 1.3 `NativeMethods` and `NativeMethodsMixin`

**Replacement:** `HostInstance`.

```diff
-import type {NativeMethods} from 'react-native';
+import type {HostInstance} from 'react-native';

-function measure(ref: React.RefObject<NativeMethods | null>) {
+function measure(ref: React.RefObject<HostInstance | null>) {
   ref.current?.measureInWindow((x, y, width, height) => {
     console.log(x, y, width, height);
   });
 }
```

For a ref to a specific component, prefer that component's own instance type —
`ViewInstance`, `TextInputInstance`, `ScrollViewInstance`, `FlatListInstance`, `TextInstance`,
`PressableInstance`, `ModalInstance`, `SectionListInstance` and so on. `HostInstance` is the generic
fallback for helpers that accept any host element.

The working form:

```tsx title=After — per-component instance types
import {useRef} from 'react';
import {View, TextInput, ScrollView} from 'react-native';
import type {ViewInstance, TextInputInstance, ScrollViewInstance} from 'react-native';

export function Form() {
  const row = useRef<ViewInstance | null>(null);
  const input = useRef<TextInputInstance | null>(null);
  const scroller = useRef<ScrollViewInstance | null>(null);

  return (
    <ScrollView ref={scroller}>
      <View ref={row}>
        <TextInput ref={input} inputMode="email" autoCapitalize="none" />
      </View>
    </ScrollView>
  );
}
```

---

## 2. Removed — JavaScript APIs

### 2.1 `InteractionManager`

**Replacement:** the `requestIdleCallback` global.

`InteractionManager.runAfterInteractions` existed to defer work until touch interactions and
animations finished, which mattered when everything shared one serialised queue. It is removed.

```diff
-import {InteractionManager} from 'react-native';
-
-useEffect(() => {
-  const handle = InteractionManager.runAfterInteractions(() => {
-    prefetchNextScreen();
-  });
-  return () => handle.cancel();
-}, []);
+useEffect(() => {
+  // requestIdleCallback is a global; there is nothing to import.
+  const id = requestIdleCallback(() => {
+    prefetchNextScreen();
+  });
+  return () => cancelIdleCallback(id);
+}, []);
```

> [!NOTE] `requestIdleCallback` has no type declaration in 0.87.1
> It is a runtime global, but `react-native`'s `globals.d.ts` in 0.87.1 does not declare it
> (`requestAnimationFrame`, `setImmediate` and `fetch` are declared; `requestIdleCallback` is not).
> Until it is, declare it once in your own `globals.d.ts`:
>
> ```ts-fragment
> declare function requestIdleCallback(
>   callback: () => void,
>   options?: {timeout: number},
> ): number;
> declare function cancelIdleCallback(handle: number): void;
> ```

### 2.2 `Modal`'s `animated` prop

**Replacement:** `animationType`.

```diff
-<Modal visible={open} animated onRequestClose={close}>
+<Modal visible={open} animationType="slide" onRequestClose={close}>
   <Content />
 </Modal>
```

`animationType` takes `'none' | 'slide' | 'fade'`. The old boolean meant "slide", so `'slide'` is
the like-for-like replacement.

### 2.3 `StatusBar` props `backgroundColor`, `translucent`, `networkActivityIndicatorVisible`

**Replacement:** edge-to-edge layout and native theming. The matching setter methods
(`StatusBar.setBackgroundColor`, `StatusBar.setTranslucent`,
`StatusBar.setNetworkActivityIndicatorVisible`) are removed with them.

```diff
-<StatusBar
-  barStyle="light-content"
-  backgroundColor="#101418"
-  translucent
-  networkActivityIndicatorVisible={loading}
-/>
+<StatusBar barStyle="light-content" />
```

`backgroundColor` and `translucent` were Android-only, and Android's edge-to-edge model made them
meaningless: the app draws behind the system bars and you handle the insets. Colour the area
yourself with a `View` sized to the top inset from `react-native-safe-area-context`.
`networkActivityIndicatorVisible` controlled an iOS status-bar spinner that iOS itself removed.

```tsx title=After — colour the inset area yourself
import {View, StatusBar, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function StatusBarBackdrop() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar barStyle="light-content" />
      {/* A plain View under the status bar replaces the removed prop, and works
          the same way on both platforms instead of being Android-only. */}
      <View style={[styles.backdrop, {height: insets.top}]} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {backgroundColor: '#101418'},
});
```

### 2.4 Boolean `keyboardShouldPersistTaps` on `ScrollView`

**Replacement:** the string form, `'never' | 'always' | 'handled'`.

```diff
-<ScrollView keyboardShouldPersistTaps={true}>
+<ScrollView keyboardShouldPersistTaps="always">

-<ScrollView keyboardShouldPersistTaps={false}>
+<ScrollView keyboardShouldPersistTaps="never">
```

`'handled'` — dismiss the keyboard unless a child handled the tap — is usually what you actually
want for a form inside a scroll view, and had no boolean equivalent.

### 2.5 `useColorScheme()` no longer returns an "unspecified" string

**Replacement:** the return type is now `ColorSchemeName | null`, that is `'light' | 'dark' | null`.
`null` appears only when the native Appearance module is unavailable, which in practice means an
out-of-tree platform.

```diff
-const scheme = useColorScheme();
-const isDark = scheme === 'dark';
-const isUnset = scheme === 'unspecified';   // this value no longer exists
+const scheme = useColorScheme();
+const isDark = scheme === 'dark';
+// null means "no Appearance module", not "user has not chosen".
```

```tsx title=After — handling the null case
import {View, Text, useColorScheme, StyleSheet} from 'react-native';

export function ThemedBanner() {
  const scheme = useColorScheme();
  // Treat null as light rather than as a third theme.
  const dark = scheme === 'dark';

  return (
    <View style={[styles.root, dark ? styles.dark : styles.light]}>
      <Text style={dark ? styles.textDark : styles.textLight}>Welcome back</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {padding: 16},
  light: {backgroundColor: '#ffffff'},
  dark: {backgroundColor: '#101418'},
  textLight: {color: '#101418'},
  textDark: {color: '#f5f7fa'},
});
```

### 2.6 The `useTurboModules` feature flag

**Replacement:** nothing. TurboModules are always on and there is no switch.

```diff
-ReactNativeFeatureFlags.override({useTurboModules: () => true});
```

Related: `ReactNativeFeatureFlags` became **private API** in 0.82. Do not read or override it.

### 2.7 `NativeDialogManagerAndroid` export, and the undocumented `Touchable` root export

**Replacement:** `Alert` for dialogs; `Pressable` for touch.

```diff
-import {NativeDialogManagerAndroid} from 'react-native';
+import {Alert} from 'react-native';

-import {Touchable} from 'react-native';   // was never documented
+import {Pressable} from 'react-native';
```

Neither appears in the 0.87.1 export surface. `Alert` covers both platforms;
`TouchableHighlight`, `TouchableOpacity`, `TouchableNativeFeedback` and
`TouchableWithoutFeedback` are still exported, but `Pressable` is the primitive to build on.

### 2.8 `react-native/rn-get-polyfills`

**Replacement:** `@react-native/js-polyfills`.

```diff
 // babel.config.js / metro.config.js, wherever you reached for it
-const polyfills = require('react-native/rn-get-polyfills');
+const polyfills = require('@react-native/js-polyfills');
```

### 2.9 `@react-native/core-cli-utils`

**Replacement:** none — the package is no longer published. If a script of yours imports it, or a
dependency does, it must be removed or replaced with the equivalent `@react-native-community/cli`
command.

```bash
npm ls @react-native/core-cli-utils     # find who depends on it
```

### 2.10 Standalone `react-devtools` WebSocket support

**Replacement:** **React Native DevTools**, opened from the Dev Menu.

```diff
-npx react-devtools
+# Open the Dev Menu (Ctrl+M on Android, Cmd+D on the iOS simulator)
+# and choose "Open DevTools".
```

The standalone app connected over a WebSocket the runtime no longer serves.

### 2.11 Metro: YAML config files and `.es6` extensions

**Replacement:** a JavaScript, TypeScript or ESM config; the `.js` / `.ts` extension.

```diff
-// metro.config.yaml  — no longer read
+// metro.config.js, metro.config.mjs or metro.config.mts
```

Metro 0.87 added stable TypeScript and ESM config files, so `metro.config.mts` is now a supported
option. If any source file in your project ends in `.es6`, rename it.

---

## 3. Removed — Android native

### 3.1 `UIBlock` and `UIManagerModule.addUIBlock` / `prependUIBlock`

**Replacement:** `UIManagerListener`, or View Commands for imperative calls into a view.

```diff
-uiManagerModule.addUIBlock(new UIBlock() {
-  @Override
-  public void execute(NativeViewHierarchyManager nvhm) {
-    View view = nvhm.resolveView(reactTag);
-    // ... touch the view on the UI thread
-  }
-});
+// Register a UIManagerListener for mount-phase callbacks, or declare a View
+// Command in your component spec and call it from JavaScript.
```

Under Fabric there is no `NativeViewHierarchyManager` to resolve a tag against. A View Command,
declared with `codegenNativeCommands`, is the supported way to tell a specific view to do something.

### 3.2 New-architecture-flag constructors on `DefaultReactActivityDelegate`

**Replacement:** the constructor without the flag arguments.

```diff
 override fun createReactActivityDelegate(): ReactActivityDelegate =
-  DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled = true)
+  DefaultReactActivityDelegate(this, mainComponentName)
```

The flags described a choice that no longer exists. See
[New Architecture Migration](new-architecture-migration.md).

---

## 4. Removed — iOS native

### 4.1 `TimingModule`, `RCTTurboModuleEnabled()`, `RCTEnableTurboModule()`

**Replacement:** none needed — TurboModules are unconditionally enabled.

```diff
-#if RCT_NEW_ARCH_ENABLED
-  RCTEnableTurboModule(YES);
-#endif
-  if (RCTTurboModuleEnabled()) {
-    // ...
-  }
+// Nothing. TurboModules are always on in 0.82+.
```

These names appear in both the removed and the deprecated lists in the 0.87 release material. Treat
them as gone: they do nothing useful, and the compatibility shims are scheduled to disappear.

### 4.2 The `RCTAppDelegate.h` import path

**Replacement:** the framework-qualified form.

```diff
-#import <RCTAppDelegate.h>
+#import <React/RCTAppDelegate.h>
```

This lands with the Swift Package Manager work, and applies whether or not you adopt SPM. See
[CocoaPods to Swift Package Manager](cocoapods-to-spm.md).

---

## 5. Deprecated — still present, do not build on them

Deprecated means the export still exists in 0.87.1 and your code still runs. It also means the
replacement exists today and the deprecated form will be removed. Migrate on your schedule, but do
not write new code against any of these.

### 5.1 `react-native/Libraries/Core/InitializeCore`

**Replacement:** `react-native/setup-env`.

```diff
-import 'react-native/Libraries/Core/InitializeCore';
+import 'react-native/setup-env';
```

`setup-env` is a real subpath export in `react-native@0.87.1`'s `exports` map, so it resolves under
the Strict API. The old path is a deep import, which means it is also caught by section 1.1.

### 5.2 `@react-native/assets-registry`

**Replacement:** `AssetRegistry` exported from `react-native`, plus `@react-native/asset-utils` for
the helper functions.

```diff
-import AssetRegistry from '@react-native/assets-registry/registry';
+import {AssetRegistry} from 'react-native';
```

`AssetRegistry` is part of the 0.87.1 root export surface. `@react-native/asset-utils` is a direct
dependency of `react-native@0.87.1`, so it is already installed.

### 5.3 `ImageBackground`

**Replacement:** a `View` with an absolutely positioned `Image`.

The type definition in 0.87.1 states it plainly: "ImageBackground is deprecated and will be removed
in a future release. Use a `View` with an absolutely positioned `Image` instead."

```diff
-<ImageBackground source={hero} style={styles.hero} resizeMode="cover">
-  <Text style={styles.title}>Summer sale</Text>
-</ImageBackground>
+<View style={styles.hero}>
+  <Image source={hero} style={StyleSheet.absoluteFill} resizeMode="cover" />
+  <Text style={styles.title}>Summer sale</Text>
+</View>
```

```tsx title=After — the replacement in full
import {View, Image, Text, StyleSheet} from 'react-native';
import type {ImageSourcePropType} from 'react-native';

export function Hero({source}: {source: ImageSourcePropType}) {
  return (
    <View style={styles.hero}>
      {/* absoluteFill puts the image behind the content without affecting layout,
          which is exactly what the deprecated component did internally. */}
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Text style={styles.title}>Summer sale</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {height: 220, justifyContent: 'flex-end', padding: 16, overflow: 'hidden'},
  title: {color: '#ffffff', fontSize: 24, fontWeight: '700'},
});
```

### 5.4 The `NativeMethods` interface

**Replacement:** `HostInstance`. Covered in section 1.3 — it is listed in both the removed and the
deprecated material because the type is gone from the strict surface while the concept lives on as
`HostInstance`.

### 5.5 `Appearance.setColorScheme` with an "unspecified" argument

**Replacement:** `'auto'`.

```diff
-Appearance.setColorScheme('unspecified');   // reset to system
+Appearance.setColorScheme('auto');
```

The 0.87.1 type documents the new behaviour directly: "Pass `'auto'` to reset and follow the system
default (removes any override)."

```tsx title=After — a working theme override
import {Appearance, Button, View, StyleSheet} from 'react-native';

export function ThemeControls() {
  return (
    <View style={styles.row}>
      <Button title="Light" onPress={() => Appearance.setColorScheme('light')} />
      <Button title="Dark" onPress={() => Appearance.setColorScheme('dark')} />
      {/* 'auto' removes the override and follows the system again. */}
      <Button title="System" onPress={() => Appearance.setColorScheme('auto')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 8},
});
```

### 5.6 `DrawerLayoutAndroid`

**Replacement:** `react-native-drawer-layout`. Android-only to begin with; the type definition
points at React Navigation's drawer documentation.

```diff
-import {DrawerLayoutAndroid} from 'react-native';
+import {Drawer} from 'react-native-drawer-layout';
```

If you are already using React Navigation, `@react-navigation/drawer` (7.13.10) is the higher-level
answer and works on both platforms. See [Drawer](../navigation/drawer.md).

### 5.7 iOS: `TimingModule`, `RCTTurboModuleEnabled()`, `RCTEnableTurboModule()`

Listed here as well as in section 4.1. Same instruction: delete the calls, there is nothing to
replace them with.

---

## 6. Behaviour changes that do not break the build

These landed in 0.82 and still catch people upgrading to 0.87. Nothing fails to compile; the app
behaves differently.

| Change | What you will notice |
| --- | --- |
| Uncaught promise rejections now raise `console.error` | Errors that were silently swallowed for years suddenly appear in your logs and in LogBox. They were always there. |
| Bridgeless by default; the Bridge is removed | Any code holding an `RCTBridge`, or a library that expects one, fails at runtime rather than at build time. |
| `newArchEnabled` / `RCT_NEW_ARCH_ENABLED` are ignored | Setting either changes nothing. A "fix" that sets them is not a fix. |
| Android Gradle Plugin 9.0.0 | New DSL and built-in Kotlin; see the opt-outs below. |
| C++ backward-compatibility headers removed | Native code must include the real header, for example `#include <react/bridging/LongLivedObject.h>`. |
| `ReactNativeFeatureFlags` is private API | Do not depend on it; it can change without notice. |
| Metro 0.87 source maps | About twice as fast to generate, roughly half the memory. Nothing to do. |

Android Gradle Plugin 9 opt-outs, recommended while the ecosystem catches up:

```properties title=android/gradle.properties
# Opt out of built-in Kotlin and the new DSL that ship with AGP 9.
# These opt-outs are removed starting with AGP 10.x, so this is a deadline, not a setting.
android.builtInKotlin=false
android.newDsl=false
```

---

## 7. The upgrade checklist

Copy this into your upgrade ticket.

```text
TYPES (tsc --noEmit finds these)
[ ] No imports from react-native/Libraries/
[ ] No imports from react-native/src/private/
[ ] No *Properties type aliases  -> *Props
[ ] No NativeMethods / NativeMethodsMixin  -> HostInstance or a *Instance type
[ ] Refs typed with per-component instance types

JAVASCRIPT
[ ] No InteractionManager  -> requestIdleCallback global
[ ] No <Modal animated>  -> animationType
[ ] No StatusBar backgroundColor / translucent / networkActivityIndicatorVisible
[ ] No StatusBar.setBackgroundColor / setTranslucent / setNetworkActivityIndicatorVisible
[ ] keyboardShouldPersistTaps is a string, not a boolean
[ ] No comparison of useColorScheme() against a third value; handle null
[ ] No useTurboModules flag, no ReactNativeFeatureFlags use
[ ] No NativeDialogManagerAndroid, no Touchable root import
[ ] No rn-get-polyfills  -> @react-native/js-polyfills
[ ] No @react-native/core-cli-utils
[ ] No InitializeCore import  -> react-native/setup-env
[ ] No @react-native/assets-registry  -> AssetRegistry from react-native
[ ] No ImageBackground  -> View + absolutely positioned Image
[ ] No Appearance.setColorScheme with the old reset value  -> 'auto'
[ ] No DrawerLayoutAndroid  -> react-native-drawer-layout

BUILD CONFIG
[ ] metro.config is .js/.mjs/.mts, not YAML
[ ] No .es6 source files
[ ] android/gradle.properties has the AGP 9 opt-outs (or the project builds without them)
[ ] Node >= 22.13.0, Kotlin >= 2.0, compileSdk 37, minCompileSdk 34

NATIVE — ANDROID
[ ] No UIBlock / addUIBlock / prependUIBlock  -> UIManagerListener or View Commands
[ ] DefaultReactActivityDelegate constructed without arch flags

NATIVE — iOS  (requires macOS to verify)
[ ] #import <React/RCTAppDelegate.h>, not the bare form
[ ] No TimingModule, RCTTurboModuleEnabled(), RCTEnableTurboModule()
[ ] C++ includes use real header paths

RUNTIME
[ ] App launches on both platforms
[ ] New console.error output from previously silent promise rejections triaged
[ ] Every native dependency verified for Fabric / TurboModule support
```

## Common mistakes

- **Trusting a green build.** Wrong: shipping because Gradle and Xcode succeeded. Right: work the
  runtime half of the checklist too. `useColorScheme` comparisons, promise rejections and removed
  `StatusBar` props do not fail a build — they fail on a device.
- **Adding the legacy deep-import opt-out and calling the migration done.** Wrong:
  `customConditions: ["react-native", "react-native-legacy-deep-imports"]` as a permanent setting.
  Right: use it to unblock a build, then remove it. It works only through 0.88 and is intended for
  removal in 0.89. See [Migrating to the Strict TypeScript API](strict-typescript-api.md).
- **Replacing `translucent` with a library that re-adds it.** Wrong: hunting for a package that
  restores the removed prop. Right: adopt edge-to-edge and draw your own inset background. The prop
  was removed because the platform model changed, not because it was unpopular.
- **Swapping boolean `keyboardShouldPersistTaps={true}` for `"handled"` without testing.** Wrong:
  assuming they are the same. Right: `true` mapped to `"always"`. `"handled"` is usually better, but
  it is a behaviour change — verify that taps on your form controls still register.
- **Setting the architecture flags to roll something back.** Wrong: `newArchEnabled=false` when a
  library misbehaves. Right: fix or replace the library. The flags have been ignored since 0.82;
  setting them changes nothing and wastes the afternoon.
- **Deleting `ImageBackground` usage without `overflow: 'hidden'`.** Wrong: a `View` plus
  `absoluteFill` image with rounded corners and no clipping. Right: add `overflow: 'hidden'` to the
  container. The deprecated component clipped for you.
- **Grepping only `src/`.** Wrong: assuming your own code is the whole problem. Right: check
  `node_modules` for libraries doing deep imports, and check your own Metro, Babel, Jest and build
  scripts.

## Related topics

- [Migrating to the Strict TypeScript API](strict-typescript-api.md) — the mechanism behind section 1 and the migration order for a large codebase.
- [New Architecture Migration](new-architecture-migration.md) — for projects still on 0.81 or earlier.
- [CocoaPods to Swift Package Manager](cocoapods-to-spm.md) — the experimental iOS build path and the header change.
- [Native Dependency Compatibility](native-dependency-compatibility.md) — checking whether your libraries survive the upgrade.
- [The Upgrade Helper Workflow](upgrade-helper-workflow.md) — the process this checklist plugs into.
- [The New Architecture](../core-concepts/new-architecture.md) — why so much of this changed at once.
- [Troubleshooting](../reference/troubleshooting.md) — the specific errors these removals produce.
