---
title: View Components
description: Exporting a native view with the Expo Modules API — the View definition, props, view events, imperative view functions, and the React component that wraps it.
status: current
toolchain: expo
sdk: 57
---

A module can export a **view** as well as functions. The native view is an ordinary
`UIView` subclass on iOS and an ordinary Android `View` subclass, declared inside the module
definition with a `View { ... }` block, and consumed from React with `requireNativeView`.

This is Expo's equivalent of a Fabric native component, and the same trade-off applies as for
modules: there is no Codegen spec, so the prop list is declared once in native code and mirrored
by hand in TypeScript.

> [!NOTE] Expo Go vs development build
> A custom view is native code. Expo Go cannot render it; you need a
> [development build](../expo-development-builds/why-you-need-one.md), rebuilt whenever the
> native view changes.

> [!WARNING] The native code here was not compiled
> The Kotlin and Swift below were written against the installed `expo-modules-core@57.0.18`
> sources and the SDK 57 module template, not built on this machine. The TypeScript is
> type-checked against expo 57 and React Native 0.86.3.

## Why it exists / when to use it — and when NOT to

Export a view when the thing you need **is** a piece of platform UI: a map, a camera preview, a
chart rendered by a native library, a video surface, a platform control with behaviour React
Native cannot reproduce.

Do **not** export a view when:

- **A React Native composition would do.** A `View` with `borderRadius` and a `LinearGradient`
  from an existing library is cheaper to build, cheaper to maintain, and works on web.
- **You only need to call into native code.** Functions do not need a view.
- **The "view" is really a modal or an alert.** Those are presented imperatively; a module
  function that presents them is simpler than a zero-size view that renders nothing.

A native view carries a real cost: it participates in layout, it has a lifecycle, and every prop
is a conversion on every update.

## Basic example

The example is a tappable gradient: it takes a list of colours, and emits an event carrying the
index of the band that was tapped.

### The native view

:::tabs
@tab Kotlin
```kotlin title=modules/expo-gradient/android/src/main/java/expo/modules/gradient/ExpoGradientView.kt
package expo.modules.gradient

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Extending ExpoView rather than View is what gives you border radius, shadows
// and the rest of the React Native view styling for free.
class ExpoGradientView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {

  // The property name is the event name. `by EventDispatcher()` creates a
  // callback that sends to the JS prop of the same name.
  private val onColorTap by EventDispatcher<Map<String, Any>>()

  private var colors: List<Int> = emptyList()

  init {
    setOnClickListener {
      onColorTap(mapOf("index" to 0))
    }
  }

  fun setColors(values: List<String>) {
    colors = values.map { Color.parseColor(it) }
    background = GradientDrawable(
      GradientDrawable.Orientation.TOP_BOTTOM,
      colors.toIntArray()
    )
  }
}
```
@tab Swift
```swift title=modules/expo-gradient/ios/ExpoGradientView.swift
import ExpoModulesCore
import UIKit

// Inheriting from ExpoView applies the React Native styling (border radius,
// shadows, background) that a plain UIView would not get.
class ExpoGradientView: ExpoView {
  // A property of type EventDispatcher becomes a callback prop of the same name.
  let onColorTap = EventDispatcher()

  private let gradient = CAGradientLayer()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    layer.addSublayer(gradient)
    addGestureRecognizer(
      UITapGestureRecognizer(target: self, action: #selector(handleTap))
    )
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    gradient.frame = bounds
  }

  func setColors(_ values: [String]) {
    gradient.colors = values.map { UIColor(named: $0)?.cgColor ?? UIColor.clear.cgColor }
  }

  @objc private func handleTap() {
    onColorTap(["index": 0])
  }
}
```
:::

### The view definition inside the module

:::tabs
@tab Kotlin
```kotlin title=modules/expo-gradient/android/src/main/java/expo/modules/gradient/ExpoGradientModule.kt
package expo.modules.gradient

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGradientModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoGradient")

    View(ExpoGradientView::class) {
      // Inside a View block, Name() sets the VIEW's JavaScript name. Omit it
      // and the name falls back to the Kotlin class name.
      Name("ExpoGradientView")

      // Prop names that JavaScript should treat as callbacks. Each one must
      // match an EventDispatcher property on the view.
      Events("onColorTap")

      // The lambda's parameter type drives conversion; `colors` arrives as a
      // List<String> already converted from the JS array.
      Prop("colors") { view: ExpoGradientView, colors: List<String> ->
        view.setColors(colors)
      }

      // Called once after every batch of prop updates, rather than per prop —
      // the right place for work that depends on more than one prop.
      OnViewDidUpdateProps { view: ExpoGradientView ->
        view.invalidate()
      }
    }
  }
}
```
@tab Swift
```swift title=modules/expo-gradient/ios/ExpoGradientModule.swift
import ExpoModulesCore

public class ExpoGradientModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoGradient")

    View(ExpoGradientView.self) {
      // Inside a View block the view's JavaScript name is set with ViewName,
      // not Name. Omit it and the name falls back to the Swift type name.
      ViewName("ExpoGradientView")

      Events("onColorTap")

      Prop("colors") { (view: ExpoGradientView, colors: [String]) in
        view.setColors(colors)
      }

      OnViewDidUpdateProps { (view: ExpoGradientView) in
        view.setNeedsLayout()
      }
    }
  }
}
```
:::

> [!NOTE] `Name` vs `ViewName` — check against your SDK
> This split is read from the installed `expo-modules-core@57.0.18` sources: Kotlin's
> `ViewDefinitionBuilder` exposes `Name(viewName: String)`, while Swift's result builder only
> accepts a `ViewNameDefinition`, which the `ViewName(_:)` factory produces. The published API
> reference lists `Name` for both platforms. If your SDK differs the compiler will say so on the
> first build — this is a compile error, not a silent one.

### The React component

```tsx title=modules/expo-gradient/src/ExpoGradientView.tsx
import {requireNativeView} from 'expo';
import * as React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';

export type GradientTapEvent = {
  index: number;
};

export type ExpoGradientViewProps = {
  colors: string[];
  // A view event arrives as a prop whose argument is wrapped in nativeEvent.
  onColorTap?: (event: {nativeEvent: GradientTapEvent}) => void;
  style?: StyleProp<ViewStyle>;
};

// The first argument is the MODULE name. The optional second argument selects a
// specific view when a module defines more than one; omitted, you get the first.
const NativeView: React.ComponentType<ExpoGradientViewProps> =
  requireNativeView('ExpoGradient');

export default function ExpoGradientView(props: ExpoGradientViewProps) {
  return <NativeView {...props} />;
}
```

Using it:

```tsx title=app/gradient.tsx
import {requireNativeView} from 'expo';
import * as React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {StyleSheet, View} from 'react-native';

type ExpoGradientViewProps = {
  colors: string[];
  onColorTap?: (event: {nativeEvent: {index: number}}) => void;
  style?: StyleProp<ViewStyle>;
};

// Normally imported from the module; inlined so this snippet stands alone.
const ExpoGradientView: React.ComponentType<ExpoGradientViewProps> =
  requireNativeView('ExpoGradient');

export default function GradientScreen() {
  return (
    <View style={styles.container}>
      <ExpoGradientView
        colors={['#0b3d91', '#8ecae6']}
        // A native view has no intrinsic size. Without an explicit style it
        // measures as zero and renders nothing, which reads as "it is broken".
        style={styles.gradient}
        onColorTap={({nativeEvent}) => {
          console.log('tapped band', nativeEvent.index);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  gradient: {height: 160, borderRadius: 12},
});
```

## How it works

### Props

Each `Prop("name") { view, value -> }` registers a setter. The value type on the closure is the
conversion contract, exactly as it is for module functions. Props are applied in a batch, and
`OnViewDidUpdateProps` runs once after the batch — which is where anything depending on two
props at once belongs, because a per-prop setter cannot know whether its sibling has arrived yet.

Kotlin has two extras iOS does not: a `Prop` overload taking a **default value**, applied when
JavaScript omits the prop, and `PropGroup`, which registers several related prop names against
one setter (the pattern `borderTopWidth` / `borderLeftWidth` and friends use).

### View events

A view event is a **prop**, not a module event. On the native side it is an `EventDispatcher`
(a property on the view); on the JavaScript side it is a callback prop. Two rules:

1. The `EventDispatcher` property name, the string in `Events(...)`, and the JavaScript prop
   name must all be identical.
2. The payload arrives wrapped: a native payload of `{"index": 0}` reaches JavaScript as
   `event.nativeEvent.index`.

Kotlin's `EventDispatcher` also accepts a **coalescing key**, which lets React Native drop
intermediate events within a gesture. Use it for anything that fires per frame.

### Imperative view functions

A `View` block can contain `AsyncFunction` components. They are bound to the view instance
rather than the module, and they always run on the main queue, because they touch a view.

```kotlin
View(ExpoGradientView::class) {
  Name("ExpoGradientView")

  // Reachable from JS on the view's ref rather than on the module object.
  AsyncFunction("flashAsync") { view: ExpoGradientView ->
    view.alpha = 0.5f
    view.animate().alpha(1f).setDuration(150).start()
  }
}
```

Prefer a prop over an imperative function where you can. A prop is declarative, survives a
re-render, and does not need a ref; an imperative call has to be re-issued after remount.

### Multiple views in one module

`requireNativeView(moduleName)` returns the module's first (default) view.
`requireNativeView(moduleName, viewName)` selects one by name, which is the reason
`Name` / `ViewName` inside the view block exists. A module defining two views must name at least
the second one, and the JavaScript side must pass that name.

### Why `ExpoView`, not `View` / `UIView`

`ExpoView` is the base class that applies React Native's view styling. On Android it extends
`LinearLayout` and handles background, border radius and clipping; on iOS it is a typealias for
`ExpoFabricView`. Subclassing the platform view directly means `borderRadius`, `backgroundColor`
and shadows from your JavaScript `style` prop are silently ignored.

## Platform differences

:::tabs
@tab Android
- The view constructor is `(context: Context, appContext: AppContext)` and both are required.
- View events use `by EventDispatcher<T>()`, which reads the event name from the property name.
- `PropGroup`, `OnViewDestroys`, `GroupView` and the child-management components exist here only.
- `shouldUseAndroidLayout` on `ExpoView` opts the view into Android's layout pass rather than
  Yoga's. It exists for views that measure themselves; do not set it by default.
@tab iOS
- The view's initialiser is `required init(appContext: AppContext? = nil)` and must call `super`.
- View events are `let onSomething = EventDispatcher()` properties, called as functions.
- Layout work belongs in `layoutSubviews`; the frame is not final in `init`.
- Use `ViewName(...)` inside the `View` block.
:::

## Common patterns

**Give the view a size.** A native view has no intrinsic dimensions in Yoga. Every example that
"renders nothing" is a view with no `height` and no `flex`.

**Keep the view dumb.** Prop setters should assign and invalidate. Anything expensive — decoding,
network, layout maths — belongs behind a class the view calls, so the setter stays cheap under
rapid prop updates.

**Batch-dependent work in `OnViewDidUpdateProps`.** Rebuilding a gradient inside each colour
setter rebuilds it twice when two props change together.

**Coalesce high-frequency events.** A scroll or gesture event per frame will saturate the
JavaScript thread. Use a coalescing key on Android, and throttle in Swift.

## Performance considerations

Each prop update is a conversion plus a native setter call. A view with fifteen props re-rendered
on every keystroke is fifteen conversions per keystroke; memoise the props you pass.

View events cost a crossing into JavaScript and usually a re-render. A view that emits on every
touch move is the most common way to make a screen feel heavy.

Creating a native view is more expensive than creating a React Native `View`. In a list, a native
view per row is a real cost — measure it before committing to that design.

## Common mistakes

- **No style with a size.** The view mounts, measures as zero and is invisible. Give it a
  `height` or a `flex`.
- **Subclassing `UIView` / `View` instead of `ExpoView`.** Border radius, background colour and
  shadows from the `style` prop stop working, with nothing in the logs.
- **Event name mismatch.** The `EventDispatcher` property, the `Events(...)` string and the
  JavaScript prop must all be the same word. A mismatch means the callback is never called and
  there is no warning.
- **Forgetting `nativeEvent`.** Wrong: `onColorTap={(e) => e.index}`. Right:
  `onColorTap={({nativeEvent}) => nativeEvent.index}`.
- **Using `Name` inside a Swift `View` block.** `Name` builds a module-name definition, which the
  view result builder does not accept. Use `ViewName`.
- **Passing the view name to `requireNativeView` as the first argument.** The first argument is
  the **module** name; the view name is the optional second one.
- **Expecting a native view on web.** `requireNativeView` has no web implementation for your
  view. Provide a `.web.tsx` file if the app runs on web.
- **Rebuilding only JavaScript after changing the view.** Native changes need a rebuild.

## Related topics

- [The Expo Modules API](expo-modules-api.md) — the module definition this lives inside.
- [Writing a Module in Kotlin](module-in-kotlin.md) — the Android conventions in full.
- [Writing a Module in Swift](module-in-swift.md) — the iOS conventions in full.
- [Expo Modules vs TurboModules](vs-turbomodules.md) — how this compares to a Fabric component.
- [Local Modules](local-modules.md) — where to put a view module in an app.
- [Fabric Native Components](../native-modules/fabric-native-components.md) — the React Native CLI equivalent, on 0.87.
- [List Performance](../expo-performance/list-performance.md) — before putting a native view in every row.
