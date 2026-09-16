package com.gradientview

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.GradientViewManagerDelegate
import com.facebook.react.viewmanagers.GradientViewManagerInterface

/**
 * The Android ViewManager for the Fabric component.
 *
 * Two Codegen-generated pieces do the work here, both emitted at build time
 * from `src/specs/GradientViewNativeComponent.ts` into
 * `android/build/generated/source/codegen/java/com/facebook/react/viewmanagers/`:
 *
 *  - `GradientViewManagerInterface` — the prop setters, so a signature that
 *    drifts from the spec is a compile error.
 *  - `GradientViewManagerDelegate` — routes prop updates from the C++ renderer
 *    to those setters.
 *
 * Note they land in `com.facebook.react.viewmanagers`, NOT in the package from
 * `codegenConfig.android.javaPackageName`. That package is used for the
 * component descriptor registration; the view manager interfaces always go to
 * the react package. Importing from the wrong one is a common first failure.
 */
@ReactModule(name = GradientViewManager.NAME)
class GradientViewManager :
    SimpleViewManager<GradientView>(),
    GradientViewManagerInterface<GradientView> {

    private val delegate = GradientViewManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<GradientView> = delegate

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): GradientView {
        return GradientView(context)
    }

    /**
     * `@ReactProp` names must match the spec prop names exactly. The generated
     * interface already declares these, so the `override` is what ties the two
     * together.
     */
    @ReactProp(name = "colors")
    override fun setColors(view: GradientView, value: com.facebook.react.bridge.ReadableArray?) {
        if (value == null) {
            view.setColors(intArrayOf())
            return
        }
        val parsed = IntArray(value.size()) { index ->
            // Codegen passes the colours through as the strings the spec
            // declared; parsing failures must not crash the UI thread.
            runCatching { Color.parseColor(value.getString(index)) }.getOrDefault(Color.TRANSPARENT)
        }
        view.setColors(parsed)
    }

    @ReactProp(name = "angle")
    override fun setAngle(view: GradientView, value: Float) {
        view.setAngle(value)
    }

    @ReactProp(name = "cornerRadius")
    override fun setCornerRadius(view: GradientView, value: Int) {
        view.setCornerRadius(value.toFloat())
    }

    companion object {
        // Must match the string in codegenNativeComponent<NativeProps>('GradientView').
        const val NAME = "GradientView"
    }
}
