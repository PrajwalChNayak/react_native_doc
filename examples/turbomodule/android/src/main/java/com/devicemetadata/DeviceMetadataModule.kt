package com.devicemetadata

import android.app.ActivityManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

/**
 * The Android implementation.
 *
 * It extends `NativeDeviceMetadataSpec`, which Codegen generates at build time
 * from `src/specs/NativeDeviceMetadata.ts` into
 *
 *   android/build/generated/source/codegen/java/com/devicemetadata/
 *
 * That class is abstract, so a signature that drifts from the spec is a Kotlin
 * compile error rather than a runtime surprise. It is also why there is no
 * `@ReactMethod` annotation anywhere below: the generated base class already
 * carries them, and the overrides inherit them.
 *
 * `NAME` must match the string in the spec's `getEnforcing<Spec>('DeviceMetadata')`
 * call. The generated base class declares `NAME` for you; this file re-exposes
 * it in a companion so the package class can reference it without duplicating
 * a literal.
 */
@ReactModule(name = DeviceMetadataModule.NAME)
class DeviceMetadataModule(reactContext: ReactApplicationContext) :
    NativeDeviceMetadataSpec(reactContext) {

    private var debugTag: String = "DeviceMetadata"

    override fun getName(): String = NAME

    /**
     * Synchronous, because the spec declares a plain `string` return. This
     * blocks the JS thread until it returns, so it must stay trivial — reading
     * two static fields qualifies.
     */
    override fun getDeviceName(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}"
    }

    /**
     * Returns `double` because Codegen maps a spec `number` return to `double`.
     * A device's RAM is far below 2^53, so the conversion is lossless here —
     * but returning a genuine int64 through a `number` would not be.
     */
    override fun getTotalMemoryBytes(): Double {
        val activityManager = reactApplicationContext
            .getSystemService(ReactApplicationContext.ACTIVITY_SERVICE) as? ActivityManager
            ?: return 0.0

        val info = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(info)
        return info.totalMem.toDouble()
    }

    /**
     * Asynchronous, because the spec declares `Promise<boolean>`. Codegen turns
     * that into a `void` method taking a trailing `Promise`.
     *
     * Rejecting with a stable string code rather than a message is deliberate:
     * the code is what JS should branch on, and a message is free to change.
     */
    override fun isLowPowerModeEnabled(promise: Promise) {
        try {
            val powerManager = reactApplicationContext
                .getSystemService(ReactApplicationContext.POWER_SERVICE) as? PowerManager

            if (powerManager == null) {
                promise.reject("E_NO_POWER_SERVICE", "PowerManager is unavailable.")
                return
            }

            promise.resolve(powerManager.isPowerSaveMode)
        } catch (e: Exception) {
            // Never let an exception escape into the bridge boundary: an
            // unsettled promise hangs the caller forever.
            promise.reject("E_POWER_STATE", e.message, e)
        }
    }

    /**
     * Fire-and-forget: the spec declares `void`, so JS cannot observe a
     * failure here. Anything that must report an error needs a `Promise`.
     */
    override fun setDebugTag(tag: String) {
        debugTag = tag.ifBlank { NAME }
        Log.d(debugTag, "Debug tag set.")
    }

    companion object {
        const val NAME = "DeviceMetadata"
    }
}
