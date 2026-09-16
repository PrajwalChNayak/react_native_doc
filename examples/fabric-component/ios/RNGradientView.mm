#import "RNGradientView.h"

#import <react/renderer/components/RNGradientViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNGradientViewSpec/EventEmitters.h>
#import <react/renderer/components/RNGradientViewSpec/Props.h>
#import <react/renderer/components/RNGradientViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

/**
 * The iOS side of the Fabric component.
 *
 * Everything Codegen generates for a component lands under
 *   ios/build/generated/ios/react/renderer/components/RNGradientViewSpec/
 * named from `codegenConfig.name` in package.json.
 *
 * The four pieces used here:
 *   ComponentDescriptors.h  - registers the component with the renderer
 *   Props.h                 - the C++ struct mirroring the spec's props
 *   EventEmitters.h         - typed event dispatch
 *   RCTComponentViewHelpers.h - the RCTGradientViewViewProtocol declaration
 */
@interface RNGradientView () <RCTGradientViewViewProtocol>
@end

@implementation RNGradientView {
  CAGradientLayer *_gradientLayer;
  BOOL _hasReportedReady;
}

/**
 * This class method is what connects the Objective-C++ view to the C++
 * descriptor. Without it the renderer does not know this class implements the
 * component, and the view silently never appears.
 */
+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GradientViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    // Props always start at the spec's declared defaults, so the initial state
    // is the same on both platforms.
    static const auto defaultProps = std::make_shared<const GradientViewProps>();
    _props = defaultProps;

    _gradientLayer = [CAGradientLayer layer];
    _gradientLayer.frame = self.bounds;
    [self.layer addSublayer:_gradientLayer];
  }
  return self;
}

/**
 * The single entry point for prop changes under Fabric. Compare against
 * oldProps and only touch the layer when something actually changed — this
 * runs on every commit that affects this view.
 */
- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &next = *std::static_pointer_cast<const GradientViewProps>(props);
  const auto &prev = *std::static_pointer_cast<const GradientViewProps>(
      oldProps ? oldProps : _props);

  if (prev.colors != next.colors) {
    NSMutableArray<id> *cgColors = [NSMutableArray arrayWithCapacity:next.colors.size()];
    for (const auto &value : next.colors) {
      UIColor *color = [self colorFromString:[NSString stringWithUTF8String:value.c_str()]];
      [cgColors addObject:(id)color.CGColor];
    }
    _gradientLayer.colors = cgColors;
  }

  if (prev.angle != next.angle) {
    // Angle is clockwise from the top, matching the spec's documentation and
    // the Android implementation.
    CGFloat radians = (next.angle - 90.0) * M_PI / 180.0;
    CGFloat dx = cos(radians) / 2.0;
    CGFloat dy = sin(radians) / 2.0;
    _gradientLayer.startPoint = CGPointMake(0.5 - dx, 0.5 - dy);
    _gradientLayer.endPoint = CGPointMake(0.5 + dx, 0.5 + dy);
  }

  if (prev.cornerRadius != next.cornerRadius) {
    self.layer.cornerRadius = next.cornerRadius;
    self.layer.masksToBounds = next.cornerRadius > 0;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _gradientLayer.frame = self.bounds;
  [self reportReadyOnce];
}

/**
 * Dispatches the spec's onGradientReady event through the generated, typed
 * event emitter. The struct field names come straight from the spec's payload
 * type, so a mismatch is a compile error rather than a silent no-op.
 */
- (void)reportReadyOnce
{
  if (_hasReportedReady || !_eventEmitter) {
    return;
  }
  _hasReportedReady = YES;

  const auto emitter = std::static_pointer_cast<const GradientViewEventEmitter>(_eventEmitter);
  emitter->onGradientReady({
      .width = static_cast<Float>(self.bounds.size.width),
      .height = static_cast<Float>(self.bounds.size.height),
  });
}

/** Minimal #rrggbb / #rrggbbaa parsing, kept here so the example is self-contained. */
- (UIColor *)colorFromString:(NSString *)value
{
  NSString *hex = [value hasPrefix:@"#"] ? [value substringFromIndex:1] : value;
  unsigned int rgba = 0;
  if (![[NSScanner scannerWithString:hex] scanHexInt:&rgba]) {
    return UIColor.clearColor;
  }
  if (hex.length == 6) {
    rgba = (rgba << 8) | 0xFF;
  }
  return [UIColor colorWithRed:((rgba >> 24) & 0xFF) / 255.0
                         green:((rgba >> 16) & 0xFF) / 255.0
                          blue:((rgba >> 8) & 0xFF) / 255.0
                         alpha:(rgba & 0xFF) / 255.0];
}

@end

/**
 * Exposes the class to the renderer's component registry by name. The string
 * must match codegenNativeComponent<NativeProps>('GradientView').
 */
Class<RCTComponentViewProtocol> GradientViewCls(void)
{
  return RNGradientView.class;
}
