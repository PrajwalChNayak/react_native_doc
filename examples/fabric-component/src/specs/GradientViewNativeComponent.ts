/**
 * The Codegen spec for a Fabric native component.
 *
 * The rules differ from a TurboModule spec, and the differences are where most
 * people come unstuck:
 *
 * 1. The filename must end in `NativeComponent`. That suffix is how Codegen
 *    recognises a component spec at all — `GradientViewNativeComponent.ts`
 *    yields the component name `GradientView`.
 * 2. The props type must be a plain exported type (here `NativeProps`) that
 *    extends `ViewProps`.
 * 3. The file's default export must be a single `codegenNativeComponent<T>()`
 *    call. The string argument, when given, is the name the native
 *    ComponentDescriptor registers under.
 * 4. Prop types are restricted to what Codegen can express across three
 *    languages. `string`, `boolean`, `Int32`, `Float`, `Double`, `ColorValue`,
 *    enums via `WithDefault`, arrays, and event handlers — not arbitrary
 *    TypeScript.
 *
 * `codegenNativeComponent` is a real root export of react-native 0.87. The
 * helper types (`Int32`, `Float`, `WithDefault`, `DirectEventHandler`) reach
 * the root as a `CodegenTypes` NAMESPACE. No deep import into
 * `react-native/Libraries/...` is needed or allowed — those are type errors
 * under the Strict API.
 */

import type {CodegenTypes, HostComponent, ViewProps} from 'react-native';
import {codegenNativeComponent} from 'react-native';

// The Codegen helper types reach the root export as a NAMESPACE in 0.87:
// `export type * from "./Libraries/Types/CodegenTypesNamespace"` re-exports
// them under `CodegenTypes`. Importing them individually from a deep path is a
// type error under the Strict API, so alias them here once.
type Float = CodegenTypes.Float;
type Int32 = CodegenTypes.Int32;
// WithDefault's own constraints have to be carried through the alias, or T is
// unconstrained here and TypeScript rejects it:
//   WithDefault<Type extends number | boolean | string | ReadonlyArray<string>,
//               Value extends null | undefined | Type | string>
type WithDefault<
  T extends number | boolean | string | ReadonlyArray<string>,
  D extends (null | undefined | T) | string,
> = CodegenTypes.WithDefault<T, D>;
type DirectEventHandler<T> = CodegenTypes.DirectEventHandler<T>;

/** Payload for the onGradientReady event. */
type ReadyEvent = Readonly<{
  width: Float;
  height: Float;
}>;

export interface NativeProps extends ViewProps {
  /**
   * Gradient stop colours. `ColorValue` is not used here because an array of
   * processed colours is the shape Codegen handles cleanly on both platforms;
   * the native side parses each string.
   */
  colors?: ReadonlyArray<string>;

  /**
   * Gradient angle in degrees, clockwise from the top.
   *
   * `WithDefault` is the only way to give a prop a default that the NATIVE
   * side knows about. A TypeScript default value would be invisible to the
   * generated ComponentDescriptor, so the native view would fall back to 0.
   */
  angle?: WithDefault<Float, 0>;

  /** Corner radius in dp. `Int32` maps to `int` / `NSInteger`. */
  cornerRadius?: WithDefault<Int32, 0>;

  /**
   * A direct event: dispatched straight to this component's handler rather
   * than bubbling. `DirectEventHandler` is the right choice for a lifecycle
   * signal like this; `BubblingEventHandler` is for things a parent may want
   * to intercept, such as a press.
   *
   * Codegen derives the native event name from the prop name by stripping
   * `on` and lowercasing: `onGradientReady` -> `topGradientReady`.
   */
  onGradientReady?: DirectEventHandler<ReadyEvent>;
}

/**
 * The default export must be exactly this call. The string is the name the
 * native ComponentDescriptor and ViewManager register under, and it must match
 * on all three sides.
 */
export default codegenNativeComponent<NativeProps>(
  'GradientView',
) as HostComponent<NativeProps>;
