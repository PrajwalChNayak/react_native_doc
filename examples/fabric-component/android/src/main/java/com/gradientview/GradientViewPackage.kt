package com.gradientview

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/**
 * Registration for a Fabric component.
 *
 * A ViewManager is still surfaced through the package's module list — note
 * `isTurboModule = false` below. That is not a legacy leftover: under Fabric a
 * ViewManager is registered as a view manager, not as a TurboModule, and
 * marking it `true` makes the renderer fail to find the component.
 */
class GradientViewPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = listOf(GradientViewManager())

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                GradientViewManager.NAME to ReactModuleInfo(
                    /* name = */ GradientViewManager.NAME,
                    /* className = */ GradientViewManager.NAME,
                    /* canOverrideExistingModule = */ false,
                    /* needsEagerInit = */ false,
                    /* isCxxModule = */ false,
                    /* isTurboModule = */ false,
                ),
            )
        }
    }
}
