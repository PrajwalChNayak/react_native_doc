#import "RNDeviceMetadata.h"

// The Swift half of this module. Xcode generates this header from the Swift
// sources; the name is "<ProductModuleName>-Swift.h". When consumed through
// CocoaPods the product module name is the pod name, so this resolves to the
// pod's generated interface.
#if __has_include(<RNDeviceMetadata/RNDeviceMetadata-Swift.h>)
#import <RNDeviceMetadata/RNDeviceMetadata-Swift.h>
#else
#import "RNDeviceMetadata-Swift.h"
#endif

/**
 * The Objective-C++ shim.
 *
 * Codegen generates `NativeDeviceMetadataSpec` — a protocol plus a C++
 * `TurboModule` subclass — into
 *
 *   ios/build/generated/ios/RNDeviceMetadataSpec/
 *
 * (the exact path depends on your Pods layout; see the README). That header is
 * C++, so only an Objective-C++ file can adopt it. Swift forwards through here
 * rather than conforming directly.
 *
 * Everything below is forwarding. All the behaviour lives in
 * RNDeviceMetadataImpl.swift.
 */
@implementation RNDeviceMetadata {
  RNDeviceMetadataImpl *_impl;
}

// Registers the module under the name the spec asked for. This must match the
// string in `TurboModuleRegistry.getEnforcing<Spec>('DeviceMetadata')`.
RCT_EXPORT_MODULE(DeviceMetadata)

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [RNDeviceMetadataImpl new];
  }
  return self;
}

// Returning NO keeps the module off the main queue. Say YES only if the
// implementation genuinely touches UIKit state that requires the main thread.
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSString *)getDeviceName
{
  return [_impl getDeviceName];
}

- (NSNumber *)getTotalMemoryBytes
{
  return [_impl getTotalMemoryBytes];
}

- (void)isLowPowerModeEnabled:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject
{
  [_impl isLowPowerModeEnabledWithResolve:resolve reject:reject];
}

- (void)setDebugTag:(NSString *)tag
{
  [_impl setDebugTag:tag];
}

/**
 * This is the New Architecture entry point. It hands the runtime the C++
 * TurboModule that Codegen generated for this spec, which is what makes calls
 * from JS direct JSI calls rather than messages on a queue.
 *
 * `NativeDeviceMetadataSpecJSI` is generated — its name is derived from the
 * spec file name. If this does not compile, Codegen has not run: build the app
 * once so the generated sources exist.
 */
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeDeviceMetadataSpecJSI>(params);
}

@end
