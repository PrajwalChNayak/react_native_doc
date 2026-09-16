package com.gradientview

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import kotlin.math.cos
import kotlin.math.sin

/**
 * The actual Android view. Ordinary custom-view code — nothing here is
 * React-specific except the event dispatch at the bottom.
 */
class GradientView(context: Context) : View(context) {

    private var colors: IntArray = intArrayOf()
    private var angleDegrees: Float = 0f
    private var cornerRadius: Float = 0f
    private var hasReported = false

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clipPath = Path()
    private val bounds = RectF()

    fun setColors(next: IntArray) {
        colors = next
        invalidate()
    }

    fun setAngle(next: Float) {
        angleDegrees = next
        invalidate()
    }

    fun setCornerRadius(next: Float) {
        cornerRadius = next
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (colors.size < 2 || width == 0 || height == 0) return

        bounds.set(0f, 0f, width.toFloat(), height.toFloat())

        // Angle is measured clockwise from the top, matching the prop's docs.
        val radians = Math.toRadians((angleDegrees - 90.0))
        val dx = cos(radians).toFloat() * width / 2f
        val dy = sin(radians).toFloat() * height / 2f
        val cx = width / 2f
        val cy = height / 2f

        paint.shader = LinearGradient(
            cx - dx, cy - dy, cx + dx, cy + dy,
            colors, null, Shader.TileMode.CLAMP,
        )

        if (cornerRadius > 0f) {
            clipPath.reset()
            clipPath.addRoundRect(bounds, cornerRadius, cornerRadius, Path.Direction.CW)
            canvas.save()
            canvas.clipPath(clipPath)
            canvas.drawRect(bounds, paint)
            canvas.restore()
        } else {
            canvas.drawRect(bounds, paint)
        }

        reportReadyOnce()
    }

    /**
     * Dispatches the spec's `onGradientReady` direct event.
     *
     * The native event name is what Codegen derives from the prop name by
     * stripping `on` and lowercasing the next letter: `onGradientReady` ->
     * `topGradientReady`. Sending any other string means the JS handler is
     * simply never called, with no error.
     */
    private fun reportReadyOnce() {
        if (hasReported) return
        hasReported = true

        val reactContext = context as? ThemedReactContext ?: return
        val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return

        dispatcher.dispatchEvent(object : Event<Event<*>>(surfaceId, id) {
            override fun getEventName(): String = "topGradientReady"

            override fun getEventData() = Arguments.createMap().apply {
                putDouble("width", width.toDouble())
                putDouble("height", height.toDouble())
            }
        })
    }
}
