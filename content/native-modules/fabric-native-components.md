---
title: Fabric Native Components
description: The complete path for a native view — spec, Codegen, the Android ViewManager, the iOS component view, registration, autolinking and the JSX call site.
status: current
toolchain: cli
---

A Fabric native component is a platform view that takes part in React's render pipeline: it has
props diffed by C++, a shadow node that Yoga lays out, an event emitter, and a mounting layer
that creates and recycles the real `View` or `UIView`. This page builds one from an empty
folder to a `<ColorWheel />` in JSX, with nothing skipped.

The example is a colour wheel: a custom-drawn control that the user drags. The drag has to be
handled on the platform's UI thread — round-tripping every touch into JavaScript would tie the
control's responsiveness to the JavaScript thread — and it has to lay out like any other view.
That combination is what a Fabric component is for.

## Why a component rather than a module

A component costs more than a [TurboModule](turbomodules-end-to-end.md). Codegen emits a props
struct, a state struct, a shadow node, a component descriptor and an event emitter on each
platform, and you write a view manager on Android and a component view on iOS. Take that cost
only when all three of these are true:

| Condition | Why it forces a component |
| --- | --- |
| Something must appear on screen | Only a component participates in mounting |
| It must take part in layout | Only a shadow node is measured by Yoga |
| It owns gestures, accessibility or recycling | Those live on the platform view, not in a method call |

If the platform work can happen off-screen and hand back data, write a module. If you can draw
it acceptably with `View`, `Text` and `Image`, write JavaScript.

## Step 1 — the spec file

A component spec describes **props, events and commands**. It never describes methods — there
is no object to call methods on.

Codegen finds it by filename: a component spec's name ends with `NativeComponent`.

```ts title=src/specs/ColorWheelNativeComponent.ts
import {codegenNativeCommands, codegenNativeComponent} from 'react-native';
import type {CodegenTypes, HostInstance, ViewProps} from 'react-native';

export interface NativeProps extends ViewProps {
  // WithDefault records the default on the NATIVE side. A prop you omit in JSX
  // is filled in by generated code, not by a JavaScript default parameter.
  hue?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  saturation?: CodegenTypes.WithDefault<CodegenTypes.Double, 1>;
  showsAlpha?: CodegenTypes.WithDefault<boolean, false>;

  // Ring thickness in points. No default, so it arrives as an optional on the
  // native side and you have to decide what "absent" means.
  ringWidth?: CodegenTypes.Float;

  // A direct event goes straight to this view's handler. A bubbling event
  // propagates up the tree the way a press does.
  onColorChange?: CodegenTypes.DirectEventHandler<
    Readonly<{hue: CodegenTypes.Double; saturation: CodegenTypes.Double}>
  >;
  onCommitted?: CodegenTypes.BubblingEventHandler<
    Readonly<{hue: CodegenTypes.Double}>
  >;
}

// Commands are imperative one-way calls into a mounted view. Use them for
// things that are genuinely imperative — focus, scroll, reset — not for state.
interface NativeCommands {
  reset: (viewRef: HostInstance) => void;
}

export const Commands: NativeCommands = codegenNativeCommands<NativeCommands>({
  supportedCommands: ['reset'],
});

// The string is the name both platforms register the view under.
export default codegenNativeComponent<NativeProps>('ColorWheel');
```

Two naming rules fall out of that string and that filename:

- The **filename** must end in `NativeComponent` or Codegen will not parse it.
- The **component name** passed to `codegenNativeComponent` is what every generated C++, Java
  and Objective-C name is built from. `'ColorWheel'` gives you `ColorWheelProps`,
  `ColorWheelComponentDescriptor`, `ColorWheelManagerInterface` and
  `RCTColorWheelViewProtocol`. Naming it `'ColorWheelView'` would give you
  `RCTColorWheelViewViewProtocol`, which is legal and ugly.

## Step 2 — Codegen configuration and output

```json title=package.json
{
  "codegenConfig": {
    "name": "AppSpecs",
    "type": "all",
    "jsSrcsDir": "src/specs",
    "android": {
      "javaPackageName": "com.awesomeproject.specs"
    },
    "ios": {
      "components": {
        "ColorWheel": {
          "className": "RCTColorWheelComponentView"
        }
      }
    }
  }
}
```

`ios.components` maps the component name to the Objective-C++ class that implements it.
React Native 0.87 also accepts the older flat `ios.componentProvider` map; prefer
`ios.components` in new code. There is no Android equivalent — Android finds the view manager
through the `ReactPackage`.

:::tabs
@tab Android
```text
android/app/build/generated/source/codegen/
├── java/
│   └── com/facebook/react/viewmanagers/
│       ├── ColorWheelManagerInterface.java
│       └── ColorWheelManagerDelegate.java
└── jni/
    └── react/renderer/components/AppSpecs/
        ├── ComponentDescriptors.h / .cpp
        ├── Props.h / .cpp
        ├── EventEmitters.h / .cpp
        ├── ShadowNodes.h / .cpp
        └── States.h / .cpp
```

The interface and the delegate land in `com.facebook.react.viewmanagers` — **not** in your
`javaPackageName`. That surprises everyone once. `javaPackageName` controls where module specs
go; view manager scaffolding always goes to the React Native package.

`ColorWheelManagerInterface<T>` declares one `void setHue(T view, double value)` per prop and
one method per command. `ColorWheelManagerDelegate<T, U>` implements `ViewManagerDelegate` and
routes a prop name and a raw value to the right setter.
@tab iOS
```text
ios/build/generated/ios/
├── react/renderer/components/AppSpecs/
│   ├── ComponentDescriptors.h      ← ColorWheelComponentDescriptor
│   ├── Props.h                     ← ColorWheelProps
│   ├── EventEmitters.h             ← ColorWheelEventEmitter
│   ├── ShadowNodes.h               ← ColorWheelShadowNode
│   ├── States.h
│   └── RCTComponentViewHelpers.h   ← RCTColorWheelViewProtocol + command handler
└── RCTThirdPartyComponentsProvider.mm   ← built from codegenConfig.ios.components
```

`RCTComponentViewHelpers.h` is the one you import in your implementation: it declares the
Objective-C protocol your view adopts, and an inline `RCTColorWheelHandleCommand` function that
decodes a command name and arguments into a protocol method call.
:::

## Step 3 — the Android implementation

Android needs two classes: the `View` itself, and a `ViewManager` that creates it and applies
props through the generated delegate.

### The view

```kotlin title=android/app/src/main/java/com/awesomeproject/colorwheel/ColorWheelView.kt
package com.awesomeproject.colorwheel

import android.content.Context
import android.graphics.Canvas
import android.view.MotionEvent
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event

class ColorWheelView(context: Context) : View(context) {

  var hue: Double = 0.0
    set(value) {
      field = value
      invalidate()
    }

  var saturation: Double = 1.0
    set(value) {
      field = value
      invalidate()
    }

  var showsAlpha: Boolean = false
    set(value) {
      field = value
      invalidate()
    }

  override fun onDraw(canvas: Canvas) {
    // Draw the wheel with hue/saturation/showsAlpha. Everything here runs on
    // the UI thread; nothing crosses into JavaScript.
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    // The drag is handled entirely here, which is the reason this is a native
    // component. Only the resulting value is sent to JavaScript.
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> {
        updateFromTouch(event.x, event.y)
        emitColorChange()
      }
      MotionEvent.ACTION_UP -> emitCommitted()
    }
    return true
  }

  fun reset() {
    hue = 0.0
    saturation = 1.0
  }

  private fun updateFromTouch(x: Float, y: Float) {
    // ... trigonometry that maps the touch point onto hue/saturation
  }

  private fun emitColorChange() {
    val payload =
        Arguments.createMap().apply {
          putDouble("hue", hue)
          putDouble("saturation", saturation)
        }
    dispatch(ColorWheelEvent("onColorChange", surfaceId(), id, payload))
  }

  private fun emitCommitted() {
    val payload = Arguments.createMap().apply { putDouble("hue", hue) }
    dispatch(ColorWheelEvent("onCommitted", surfaceId(), id, payload))
  }

  private fun surfaceId(): Int = UIManagerHelper.getSurfaceId(context as ReactContext)

  private fun dispatch(event: ColorWheelEvent) {
    // The dispatcher is looked up per view tag; it can be null while the view
    // is being torn down, so the null check is not defensive padding.
    UIManagerHelper.getEventDispatcherForReactTag(context as ReactContext, id)
        ?.dispatchEvent(event)
  }

  private class ColorWheelEvent(
      private val eventName: String,
      surfaceId: Int,
      viewId: Int,
      private val payload: WritableMap,
  ) : Event<ColorWheelEvent>(surfaceId, viewId) {
    override fun getEventName(): String = eventName

    override fun getEventData(): WritableMap = payload
  }
}
```

### The view manager

```kotlin title=android/app/src/main/java/com/awesomeproject/colorwheel/ColorWheelManager.kt
package com.awesomeproject.colorwheel

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.ColorWheelManagerDelegate
import com.facebook.react.viewmanagers.ColorWheelManagerInterface

@ReactModule(name = ColorWheelManager.REACT_CLASS)
class ColorWheelManager(context: ReactApplicationContext) :
    SimpleViewManager<ColorWheelView>(), ColorWheelManagerInterface<ColorWheelView> {

  // The delegate is what turns a prop name and a raw value into one of the
  // setters below. Implementing the interface without returning the delegate
  // logs a soft exception and your props silently never arrive.
  private val delegate: ColorWheelManagerDelegate<ColorWheelView, ColorWheelManager> =
      ColorWheelManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ColorWheelView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext): ColorWheelView =
      ColorWheelView(context)

  @ReactProp(name = "hue")
  override fun setHue(view: ColorWheelView, value: Double) {
    view.hue = value
  }

  @ReactProp(name = "saturation")
  override fun setSaturation(view: ColorWheelView, value: Double) {
    view.saturation = value
  }

  @ReactProp(name = "showsAlpha")
  override fun setShowsAlpha(view: ColorWheelView, value: Boolean) {
    view.showsAlpha = value
  }

  @ReactProp(name = "ringWidth")
  override fun setRingWidth(view: ColorWheelView, value: Float?) {
    view.ringWidth = value ?: DEFAULT_RING_WIDTH
  }

  // Commands arrive here through the same generated delegate.
  override fun reset(view: ColorWheelView) {
    view.reset()
  }

  // Event names still have to be exported so the renderer can map a native
  // event onto the right JSX prop. Direct and bubbling events use different
  // maps, and the shapes are not interchangeable.
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
      mapOf("onColorChange" to mapOf("registrationName" to "onColorChange"))

  override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> =
      mapOf(
          "onCommitted" to
              mapOf(
                  "phasedRegistrationNames" to
                      mapOf("bubbled" to "onCommitted", "captured" to "onCommittedCapture")
              )
      )

  companion object {
    const val REACT_CLASS: String = "ColorWheel"
    private const val DEFAULT_RING_WIDTH = 24f
  }
}
```

> [!NOTE] Match the generated setter signatures exactly
> Whether a setter takes `Double` or `Float`, `Boolean` or `Boolean?`, depends on whether the
> prop declared a `WithDefault`. Open
> `android/app/build/generated/source/codegen/java/com/facebook/react/viewmanagers/ColorWheelManagerInterface.java`
> and copy the signatures. On a React Native version other than 0.87, that file — not this page
> — is the authority.

## Step 4 — the iOS implementation

On iOS you subclass `RCTViewComponentView`, adopt the generated protocol, and translate the C++
props struct into whatever your `UIView` needs.

```objc title=ios/AwesomeProject/RCTColorWheelComponentView.h
#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface RCTColorWheelComponentView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
```

```objc title=ios/AwesomeProject/RCTColorWheelComponentView.mm
#import "RCTColorWheelComponentView.h"

#import <react/renderer/components/AppSpecs/ComponentDescriptors.h>
#import <react/renderer/components/AppSpecs/EventEmitters.h>
#import <react/renderer/components/AppSpecs/Props.h>
#import <react/renderer/components/AppSpecs/RCTComponentViewHelpers.h>

// The Swift half, exposed through Xcode's generated header.
#import "AwesomeProject-Swift.h"

using namespace facebook::react;

@interface RCTColorWheelComponentView () <RCTColorWheelViewProtocol>
@end

@implementation RCTColorWheelComponentView {
  ColorWheel *_wheel;  // the Swift view that does the drawing
}

// This is what connects the Objective-C class to the C++ shadow node. Without
// it the renderer has no descriptor for "ColorWheel".
+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ColorWheelComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    // Set the default props once, so a freshly recycled view starts from a
    // known state rather than from the previous mount's values.
    static const auto defaultProps = std::make_shared<const ColorWheelProps>();
    _props = defaultProps;

    _wheel = [ColorWheel new];
    __weak __typeof(self) weakSelf = self;
    _wheel.onChange = ^(double hue, double saturation) {
      [weakSelf emitColorChangeWithHue:hue saturation:saturation];
    };
    self.contentView = _wheel;
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<const ColorWheelProps>(_props);
  const auto &newViewProps = *std::static_pointer_cast<const ColorWheelProps>(props);

  // Compare before assigning. updateProps runs on every commit that touches
  // this view, and a naive assignment redraws on unrelated prop changes.
  if (oldViewProps.hue != newViewProps.hue) {
    _wheel.hue = newViewProps.hue;
  }
  if (oldViewProps.saturation != newViewProps.saturation) {
    _wheel.saturation = newViewProps.saturation;
  }
  if (oldViewProps.showsAlpha != newViewProps.showsAlpha) {
    _wheel.showsAlpha = newViewProps.showsAlpha;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)emitColorChangeWithHue:(double)hue saturation:(double)saturation
{
  if (!_eventEmitter) {
    return;
  }
  // The emitter is the generated C++ class; the struct name comes from the
  // event name in the spec.
  std::static_pointer_cast<const ColorWheelEventEmitter>(_eventEmitter)
      ->onColorChange({.hue = hue, .saturation = saturation});
}

// Commands are decoded by the generated inline helper, which then calls the
// protocol method below.
- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTColorWheelHandleCommand(self, commandName, args);
}

- (void)reset
{
  [_wheel reset];
}

// Views are pooled. Anything you cached, animated or subscribed to has to be
// undone here or it leaks into the next mount.
- (void)prepareForRecycle
{
  [_wheel reset];
  [super prepareForRecycle];
}

@end
```

The Swift half is an ordinary `UIView` that knows nothing about React Native:

```swift title=ios/AwesomeProject/ColorWheel.swift
import UIKit

@objcMembers
public class ColorWheel: UIView {
  public var hue: Double = 0 { didSet { setNeedsDisplay() } }
  public var saturation: Double = 1 { didSet { setNeedsDisplay() } }
  public var showsAlpha: Bool = false { didSet { setNeedsDisplay() } }

  // A closure rather than a delegate, because the .mm file has to be the thing
  // that owns the C++ event emitter.
  public var onChange: ((Double, Double) -> Void)?

  public override func draw(_ rect: CGRect) {
    // ... draw the wheel
  }

  public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let point = touches.first?.location(in: self) else { return }
    updateFromTouch(point)
    onChange?(hue, saturation)
  }

  public func reset() {
    hue = 0
    saturation = 1
  }

  private func updateFromTouch(_ point: CGPoint) {
    // ... trigonometry
  }
}
```

Swift can own the drawing and the gestures, because none of that touches C++. What Swift cannot
own is the `RCTViewComponentView` subclass itself: `updateProps:` takes
`const facebook::react::Props::Shared &`, and `componentDescriptorProvider` returns a C++ type.
Those live in the `.mm` file, and that file is why an iOS Fabric component is always at least
partly Objective-C++.

> [!NOTE] Verify the generated C++ names against your build
> `ColorWheelProps`, `ColorWheelComponentDescriptor`, `ColorWheelEventEmitter` and
> `RCTColorWheelViewProtocol` are what React Native 0.87 generates from the component name
> `'ColorWheel'`. Open `ios/build/generated/ios/react/renderer/components/AppSpecs/` after your
> first build and confirm before you spend time on a compile error.

## Step 5 — registration

:::tabs
@tab Android
The view manager is returned from a `ReactPackage`, and the package is added to
`MainApplication.kt` exactly as for a module.

```kotlin title=android/app/src/main/java/com/awesomeproject/colorwheel/ColorWheelPackage.kt
package com.awesomeproject.colorwheel

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class ColorWheelPackage : BaseReactPackage() {

  // This package contributes a view, not a module.
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
      ReactModuleInfoProvider { emptyMap() }

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = listOf(ColorWheelManager(reactContext))
}
```

No C++ and no `CMakeLists.txt` are needed for a component implemented this way inside an app:
the generated component descriptor is compiled into the app's codegen target, and the renderer
resolves `"ColorWheel"` through the view manager registry.
@tab iOS
There is no package class and no registration code. The `codegenConfig.ios.components` entry
from step 2 is the registration: Codegen writes `RCTThirdPartyComponentsProvider.mm` mapping
`@"ColorWheel"` to `RCTColorWheelComponentView`, and the app's `RCTAppDependencyProvider`
exposes that map to the renderer.

Leave the entry out and your component view class is never looked up. The symptom is a view
that lays out with the right size and renders nothing.
:::

## Step 6 — autolinking

Inside an app, steps 1 to 5 are all there is. When the component ships as its own package,
autolinking gives a consumer the same result with no edits:

- The library's `codegenConfig` is discovered, so the consumer's build generates the C++ and
  the Java scaffolding.
- `PackageList` includes `ColorWheelPackage`, so the view manager is registered on Android.
- `use_native_modules!` picks up the library's podspec, and its `ios.components` entry is merged
  into the consumer's `RCTThirdPartyComponentsProvider.mm`.

A library that ships **hand-written C++** alongside the generated code additionally declares
`libraryName`, `cmakeListsPath` and `componentDescriptors` under
`dependency.platforms.android` in its `react-native.config.js`. A component that is pure Kotlin
plus a spec needs none of those. See
[Autolinking and react-native.config.js](autolinking.md).

## Step 7 — using it from JSX

The spec file is the component. Import its default export and the props are the ones you
declared.

```tsx title=src/components/ColorWheelExample.tsx
import {useCallback, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View, codegenNativeCommands, codegenNativeComponent} from 'react-native';
import type {CodegenTypes, HostInstance, ViewProps} from 'react-native';

interface NativeProps extends ViewProps {
  hue?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
  saturation?: CodegenTypes.WithDefault<CodegenTypes.Double, 1>;
  onColorChange?: CodegenTypes.DirectEventHandler<
    Readonly<{hue: CodegenTypes.Double; saturation: CodegenTypes.Double}>
  >;
}

interface NativeCommands {
  reset: (viewRef: HostInstance) => void;
}

const Commands = codegenNativeCommands<NativeCommands>({supportedCommands: ['reset']});
const ColorWheel = codegenNativeComponent<NativeProps>('ColorWheel');

export function ColorWheelExample() {
  const ref = useRef<HostInstance | null>(null);
  const [hue, setHue] = useState(0);

  const reset = useCallback(() => {
    const view = ref.current;
    // A command needs a mounted view. Guarding on null is not optional: the
    // ref is null on the first render and after unmount.
    if (view != null) {
      Commands.reset(view);
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <ColorWheel
        ref={ref}
        style={styles.wheel}
        hue={hue}
        saturation={1}
        // The event payload type comes from the spec, so this is checked.
        onColorChange={event => setHue(event.nativeEvent.hue)}
      />
      <Text>Hue {Math.round(hue)}</Text>
      <Pressable onPress={reset} accessibilityRole="button">
        <Text>Reset</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'center', gap: 12, padding: 16},
  wheel: {width: 240, height: 240},
});
```

In a real project the spec lives in its own file and this screen imports it; the declarations
are inlined here so the snippet stands alone.

## Platform differences

:::tabs
@tab Android
- You write a **view manager**, and the generated delegate applies props. Forgetting
  `getDelegate()` is the classic Android-only failure: everything compiles and no prop arrives.
- Event names must additionally be exported through
  `getExportedCustomDirectEventTypeConstants` / `getExportedCustomBubblingEventTypeConstants`.
- The generated interface and delegate live in `com.facebook.react.viewmanagers`, not in your
  `javaPackageName`.
- Views are created per mount; recycling is handled by the framework and is opt-in per manager.
@tab iOS
- You write a **component view** that subclasses `RCTViewComponentView` and adopts the generated
  protocol. There is no delegate: you read the C++ props struct yourself in `updateProps:`.
- Events are emitted by casting `_eventEmitter` to the generated emitter class. No name map.
- Component views **are** pooled. `prepareForRecycle` is where you undo everything, and skipping
  it produces bugs that only appear after scrolling a list.
- The implementation file must be `.mm`. C++ types appear in the method signatures.
:::

## Common patterns

**Diff before you apply.** `updateProps:` and the generated Android setters both run on every
commit that touches the view. Comparing the old and new value before doing expensive work — a
re-layout, a network request, a redraw — is the difference between a smooth component and a
janky one.

**Keep the platform view free of React Native types.** `ColorWheelView` and `ColorWheel.swift`
above take plain values. That keeps them testable and makes them reusable outside React Native.

**Prefer props to commands.** A command is imperative and does not participate in reconciliation,
so it cannot be replayed when React remounts the view. Use commands only for genuinely
imperative actions, and keep state in props.

**Use `WithDefault` rather than a JavaScript default.** A default declared in the spec is applied
natively, so the value is correct even on the first commit and even when the prop is omitted
entirely.

**Give the view an intrinsic size or require a style.** Fabric lays the component out with Yoga;
a view with no width and height renders as a zero-size box. Either measure in the shadow node or
document that `style` is required, as the example above does.

## Performance considerations

The point of a native component is to keep per-frame work off the JavaScript thread. The colour
wheel handles the entire drag natively and sends JavaScript one event per movement. If you find
yourself sending an event per frame *and* setting a prop back per frame, you have rebuilt the
round trip you were trying to avoid — drive the visual from native state and tell JavaScript the
result.

Props are diffed in C++ and only changed values reach your view. That is efficient, but
`updateProps:` is still called for every commit touching the view, so the comparison work is
yours to keep cheap.

Recycling is a real performance feature and a real correctness hazard. A component view returned
to the pool keeps its instance variables. Timers, observers, gesture recognisers, animations and
cached images all have to be released in `prepareForRecycle`.

Shadow node work happens on the background thread during layout. Anything expensive there delays
every commit in that surface, not just your component.

## Common mistakes

- **Implementing the generated interface but not returning the delegate.** Wrong: a manager that
  implements `ColorWheelManagerInterface` and relies on `@ReactProp` alone. Right: also override
  `getDelegate()` to return `ColorWheelManagerDelegate(this)`. React Native logs a soft
  exception and your props never arrive.
- **Looking for the generated interface in your `javaPackageName`.** Wrong:
  `import com.awesomeproject.specs.ColorWheelManagerInterface`. Right:
  `import com.facebook.react.viewmanagers.ColorWheelManagerInterface`.
- **Declaring events in the spec and forgetting the Android export maps.** Wrong: the event
  fires, `getEventName()` is right, and the JSX handler is never called. Right: export the name
  in the direct or bubbling constants map — and use the map shape that matches the handler type.
- **Skipping `prepareForRecycle` on iOS.** Wrong: a component that shows the previous row's
  colour after a fast scroll. Right: reset every piece of view state there.
- **Forgetting `codegenConfig.ios.components`.** Wrong: the view sizes correctly and draws
  nothing, and you go looking at `updateProps:`. Right: the class has to be in the components
  map or it is never instantiated.
- **Naming the spec file wrong.** Wrong: `ColorWheel.ts` or `ColorWheelSpec.ts`. Right:
  `ColorWheelNativeComponent.ts`. Codegen matches on the suffix, and a spec it does not find
  produces no error — just a missing component.
- **Assigning props without comparing.** Wrong: `_wheel.hue = newViewProps.hue;` unconditionally,
  which calls `setNeedsDisplay` on every commit. Right: compare against `oldViewProps` first.
- **Reaching for a component when a module would do.** Wrong: a Fabric component whose only job
  is to run a computation and report the answer. Right: a TurboModule. A component brings a
  shadow node, a props struct, an event emitter and two platform classes with it.

## Related topics

- [When You Need Native Code](when-you-need-native-code.md) — module, component or neither.
- [TurboModules End to End](turbomodules-end-to-end.md) — the same treatment for a module.
- [Codegen and Spec Files](codegen-specs.md) — every prop, event and command type the parser accepts.
- [Writing a Module in Kotlin](writing-a-module-in-kotlin.md) — Android conventions in depth.
- [Writing a Module in Swift](writing-a-module-in-swift.md) — the Swift and Objective-C++ split.
- [Autolinking and react-native.config.js](autolinking.md) — shipping this to a consumer.
- [Debugging Native Code](debugging-native-code.md) — attaching a debugger to a view that will not draw.
- [Fabric](../core-concepts/fabric.md) — the renderer this plugs into.
