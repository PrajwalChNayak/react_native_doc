package com.devicemetadata

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registration. The Community CLI's autolinking instantiates this class via the
 * `packageImportPath` / `packageInstance` entries in `react-native.config.js`.
 *
 * `BaseReactPackage` is the New Architecture shape: instead of eagerly
 * constructing every module in a list, it exposes a lookup by name plus a
 * metadata provider. That is what makes TurboModules lazy — the module is only
 * constructed the first time JavaScript actually asks for it.
 */
class DeviceMetadataPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DeviceMetadataModule.NAME) {
            DeviceMetadataModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DeviceMetadataModule.NAME to ReactModuleInfo(
                    /* name = */ DeviceMetadataModule.NAME,
                    /* className = */ DeviceMetadataModule.NAME,
                    /* canOverrideExistingModule = */ false,
                    /* needsEagerInit = */ false,
                    /* isCxxModule = */ false,
                    // This is the flag that marks it as a TurboModule. With it
                    // false the module is not visible to TurboModuleRegistry and
                    // `getEnforcing` throws at startup.
                    /* isTurboModule = */ true,
                ),
            )
        }
    }
}
