/**
 * The public surface a consuming app imports.
 *
 * As with a TurboModule, apps import this wrapper rather than the spec. It
 * keeps the spec file free of anything Codegen cannot parse, and leaves room
 * to add prop validation or defaults without touching call sites.
 */

import GradientViewNative from './specs/GradientViewNativeComponent';
import type {NativeProps} from './specs/GradientViewNativeComponent';

export type GradientViewProps = NativeProps;

export const GradientView = GradientViewNative;

export default GradientView;
