import Foundation
import UIKit

/**
 The Swift implementation.

 Swift cannot conform directly to the C++-backed protocol Codegen generates, so
 the shape is: plain Swift here, and a thin Objective-C++ shim in
 `RNDeviceMetadata.mm` that conforms to `NativeDeviceMetadataSpec` and forwards
 to this class. That is not boilerplate for its own sake — the generated spec
 protocol is declared in a header that only Objective-C++ can import.

 `@objc` and `NSObject` inheritance are what make these methods visible to that
 shim.
 */
@objc(RNDeviceMetadataImpl)
public class RNDeviceMetadataImpl: NSObject {

  private var debugTag: String = "DeviceMetadata"

  /// Synchronous, matching the spec's plain `string` return. Blocks the JS
  /// thread, so it must stay trivial.
  @objc
  public func getDeviceName() -> String {
    return UIDevice.current.name
  }

  /// The spec's `number` return maps to `NSNumber *` on iOS.
  @objc
  public func getTotalMemoryBytes() -> NSNumber {
    return NSNumber(value: ProcessInfo.processInfo.physicalMemory)
  }

  /// Asynchronous. The `Promise<boolean>` in the spec becomes a resolve/reject
  /// block pair in the generated signature; the shim passes them through.
  ///
  /// Note the platform difference: `isLowPowerModeEnabled` is the user's
  /// explicit Low Power Mode toggle, which is not the same thing as Android's
  /// `isPowerSaveMode`. Both are hints, and they do not mean quite the same.
  @objc
  public func isLowPowerModeEnabled(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let enabled = ProcessInfo.processInfo.isLowPowerModeEnabled
    resolve(NSNumber(value: enabled))
  }

  /// Fire-and-forget, matching the spec's `void`.
  @objc
  public func setDebugTag(_ tag: String) {
    debugTag = tag.isEmpty ? "DeviceMetadata" : tag
    NSLog("[%@] Debug tag set.", debugTag)
  }
}
