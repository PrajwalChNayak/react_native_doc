#import <UIKit/UIKit.h>

// The generated component header. Codegen emits it at build time from
// src/specs/GradientViewNativeComponent.ts. The guard keeps editor tooling
// usable before the first build; it is not an architecture switch, because in
// 0.87 there is only one architecture.
#if __has_include(<react/renderer/components/RNGradientViewSpec/ComponentDescriptors.h>)
#import <react/renderer/components/RNGradientViewSpec/ComponentDescriptors.h>
#endif

#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * A Fabric component view.
 *
 * Under Fabric a native component subclasses `RCTViewComponentView` and
 * overrides `updateProps:oldProps:`. There is no RCTViewManager and no
 * RCT_EXPORT_VIEW_PROPERTY — those were the old-Bridge shape, and the Bridge
 * is gone as of 0.82.
 */
@interface RNGradientView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
