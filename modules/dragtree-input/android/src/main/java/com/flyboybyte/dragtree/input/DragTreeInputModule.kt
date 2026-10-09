package com.flyboybyte.dragtree.input

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// DragTree native input (Android).
//
// Motion: expo-sensors' DeviceMotion only dispatches once per display frame
// (~60 Hz), which made launch timing coarse. This reads the sensor directly
// at ~200 Hz on a background thread and forwards every sample with its
// hardware timestamp. Prefers TYPE_LINEAR_ACCELERATION (gravity removed by
// Android sensor fusion); phones without it get raw TYPE_ACCELEROMETER and
// the JS side filters gravity out.
//
// Keys: while capture is on, volume / headset / Bluetooth-remote buttons are
// consumed (the volume doesn't change) and forwarded as down/up events with
// their hardware event time. Done by wrapping the activity window's
// Window.Callback, so MainActivity doesn't need editing.
class DragTreeInputModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val sensorManager: SensorManager?
    get() = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private var sensorThread: HandlerThread? = null
  private var motionListener: SensorEventListener? = null

  @Volatile private var keyCapture = false
  private var hookedWindow: Window? = null

  private fun motionSensor(): Pair<Sensor, String>? {
    val sm = sensorManager ?: return null
    sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let { return it to "linear" }
    sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { return it to "accel" }
    return null
  }

  private fun startMotion(): String {
    stopMotion()
    val sm = sensorManager ?: return "none"
    val (sensor, kind) = motionSensor() ?: return "none"
    val thread = HandlerThread("DragTreeMotion").apply { start() }
    val listener = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        sendEvent("onMotion", Bundle().apply {
          putDouble("x", e.values[0].toDouble())
          putDouble("y", e.values[1].toDouble())
          putDouble("z", e.values[2].toDouble())
          putDouble("t", e.timestamp / 1_000_000.0) // ns → ms, elapsedRealtime base
        })
      }
      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    // 5 ms ≈ 200 Hz. Allowed because the app declares HIGH_SAMPLING_RATE_SENSORS.
    sm.registerListener(listener, sensor, 5_000, Handler(thread.looper))
    sensorThread = thread
    motionListener = listener
    return kind
  }

  private fun stopMotion() {
    motionListener?.let { sensorManager?.unregisterListener(it) }
    motionListener = null
    sensorThread?.quitSafely()
    sensorThread = null
  }

  private fun isLaunchKey(code: Int): Boolean = when (code) {
    KeyEvent.KEYCODE_VOLUME_UP,
    KeyEvent.KEYCODE_VOLUME_DOWN,
    KeyEvent.KEYCODE_HEADSETHOOK,          // wired headphone button
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
    KeyEvent.KEYCODE_CAMERA,
    KeyEvent.KEYCODE_ENTER,                // Bluetooth shutter remotes (iOS button)
    KeyEvent.KEYCODE_NUMPAD_ENTER,
    KeyEvent.KEYCODE_SPACE -> true
    else -> false
  }

  private inner class KeyHook(val base: Window.Callback) : Window.Callback by base {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      if (keyCapture && isLaunchKey(event.keyCode)) {
        val down = event.action == KeyEvent.ACTION_DOWN
        // Held keys auto-repeat DOWN; only the first press and the release count.
        if (!down || event.repeatCount == 0) {
          sendEvent("onKey", Bundle().apply {
            putBoolean("down", down)
            putInt("keyCode", event.keyCode)
            putDouble("t", event.eventTime.toDouble()) // uptimeMillis base
          })
        }
        return true
      }
      return base.dispatchKeyEvent(event)
    }
  }

  private fun hookWindow() {
    val window = appContext.currentActivity?.window ?: return
    if (hookedWindow === window && window.callback is KeyHook) return
    val current = window.callback ?: return
    window.callback = if (current is KeyHook) current else KeyHook(current)
    hookedWindow = window
  }

  private fun unhookWindow() {
    val window = hookedWindow ?: return
    (window.callback as? KeyHook)?.let { window.callback = it.base }
    hookedWindow = null
  }

  override fun definition() = ModuleDefinition {
    Name("DragTreeInput")

    Events("onMotion", "onKey")

    // "linear" | "accel" | "none" — which sensor startMotion would use.
    Function("motionKind") { motionSensor()?.second ?: "none" }

    // Clocks for mapping event times onto performance.now() in JS.
    Function("elapsedNowMs") { SystemClock.elapsedRealtimeNanos() / 1_000_000.0 }
    Function("uptimeNowMs") { SystemClock.uptimeMillis().toDouble() }

    Function("startMotion") { startMotion() }
    Function("stopMotion") { stopMotion() }

    AsyncFunction("setKeyCapture") { enabled: Boolean ->
      keyCapture = enabled
      if (enabled) hookWindow()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersForeground {
      if (keyCapture) hookWindow()
    }

    OnDestroy {
      stopMotion()
      keyCapture = false
      appContext.currentActivity?.runOnUiThread { unhookWindow() }
    }
  }
}
