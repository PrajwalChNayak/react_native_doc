// The generated spec header. Codegen emits it at build time from
// src/specs/NativeDeviceMetadata.ts, so it does not exist until the app has
// been built once. The `__has_include` guard keeps editor tooling usable
// before that first build rather than showing a wall of red; it is not an
// architecture switch.
//
// There is no `#ifdef RCT_NEW_ARCH_ENABLED` anywhere in this library on
// purpose. Since React Native 0.82 that flag is ignored and the old Bridge is
// gone, so a library targeting 0.87 has exactly one shape to compile: the
// Codegen-generated protocol. A conditional here would only suggest a fallback
// that no longer exists.
#if __has_include("RNDeviceMetadataSpec/RNDeviceMetadataSpec.h")
#import "RNDeviceMetadataSpec/RNDeviceMetadataSpec.h"
#elif __has_include(<RNDeviceMetadataSpec/RNDeviceMetadataSpec.h>)
#import <RNDeviceMetadataSpec/RNDeviceMetadataSpec.h>
#endif

NS_ASSUME_NONNULL_BEGIN

/**
 * The Objective-C++ shim that adopts the Codegen-generated protocol and
 * forwards every call to the Swift implementation.
 *
 * `NativeDeviceMetadataSpec` is the generated protocol name, derived from the
 * spec file name: `NativeDeviceMetadata.ts` -> `NativeDeviceMetadataSpec`.
 */
@interface RNDeviceMetadata : NSObject <NativeDeviceMetadataSpec>
@end

NS_ASSUME_NONNULL_END
