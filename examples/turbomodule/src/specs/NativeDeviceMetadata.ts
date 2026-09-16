/**
 * The Codegen spec. This file is the contract; everything else is derived
 * from it.
 *
 * Codegen reads this file at BUILD time on both platforms and generates the
 * native base types your implementations extend. It never runs at runtime.
 *
 * Four rules Codegen enforces, all of them verified against
 * `@react-native/codegen@0.87.1`:
 *
 * 1. The file name must start with `Native`. The rest of the name is the
 *    "haste module name" and becomes the generated type name:
 *    `NativeDeviceMetadata` -> `NativeDeviceMetadataSpec`.
 * 2. The interface must be named exactly `Spec`. Anything else throws
 *    `MisnamedModuleInterfaceParserError`
 *    (see `parsers/error-utils.js`, `throwIfModuleInterfaceIsMisnamed`).
 * 3. It must extend `TurboModule`, with exactly one `extends` clause.
 * 4. The file must contain exactly one
 *    `TurboModuleRegistry.get<Spec>(...)` or `.getEnforcing<Spec>(...)` call,
 *    with a single string-literal argument. That string is the module name
 *    the native side registers under — here, `DeviceMetadata`.
 *
 * Both imports come from the `react-native` root export. Under the 0.87 Strict
 * TypeScript API a deep import such as
 * `react-native/Libraries/TurboModule/RCTExport` is a type error: the
 * package's `exports` map sets `"types": null` for `./Libraries/*`. Codegen is
 * happy either way — its parser matches the identifiers `TurboModuleRegistry`
 * and `TurboModule` in the AST, not the import path — so the root import is
 * the one that satisfies both.
 */

import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Synchronous: anything that is not `void` and not a `Promise` becomes a
   * blocking JSI call. Codegen marks it `@ReactMethod(isBlockingSynchronousMethod = true)`
   * on Android. Only use this for work that is genuinely instant — it blocks
   * the JS thread until native returns.
   *
   * Generated signatures:
   *   Android  public abstract String getDeviceName();
   *   iOS      - (NSString *)getDeviceName;
   */
  getDeviceName(): string;

  /**
   * `number` maps to `double` on Android and `NSNumber *` on iOS for a RETURN
   * value (a `number` PARAMETER maps to `double` on iOS instead). Byte counts
   * above 2^53 would lose precision, which is not a concern for RAM sizes but
   * is worth knowing before you return an int64 from native.
   *
   * Generated signatures:
   *   Android  public abstract double getTotalMemoryBytes();
   *   iOS      - (NSNumber *)getTotalMemoryBytes;
   */
  getTotalMemoryBytes(): number;

  /**
   * Asynchronous. A `Promise` return becomes a `void` native method with an
   * extra trailing parameter: `Promise promise` on Android,
   * `(RCTPromiseResolveBlock)resolve (RCTPromiseRejectBlock)reject` on iOS.
   * This is what you want for anything that touches I/O or a system service.
   *
   * Generated signatures:
   *   Android  public abstract void isLowPowerModeEnabled(Promise promise);
   *   iOS      - (void)isLowPowerModeEnabled:(RCTPromiseResolveBlock)resolve
   *                                   reject:(RCTPromiseRejectBlock)reject;
   */
  isLowPowerModeEnabled(): Promise<boolean>;

  /**
   * `void` is fire-and-forget: JS does not wait and cannot observe a failure.
   * Use it only where losing the call silently is acceptable.
   *
   * Generated signatures:
   *   Android  public abstract void setDebugTag(String tag);
   *   iOS      - (void)setDebugTag:(NSString *)tag;
   */
  setDebugTag(tag: string): void;
}

/**
 * `getEnforcing` throws at startup if the native module is missing, which is
 * almost always what you want: a missing module is a build or autolinking
 * problem, and failing loudly at launch beats an undefined-is-not-a-function
 * crash later. Use `TurboModuleRegistry.get<Spec>(...)`, which returns
 * `Spec | null | undefined`, only when the module is genuinely optional.
 */
export default TurboModuleRegistry.getEnforcing<Spec>('DeviceMetadata');
