package com.flyboybyte.dragtree.input

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Base64
import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// DragTree native input (Android).
//
// Motion: expo-sensors' DeviceMotion only dispatches once per display frame
// (~60 Hz), which made launch timing coarse. This reads the sensor directly
// at ~200 Hz on a background thread and forwards every sample with its
// hardware timestamp. Prefers TYPE_LINEAR_ACCELERATION (gravity removed by
// Android sensor fusion); phones without it get raw TYPE_ACCELEROMETER and
// the JS side filters gravity out. Some phones run their fusion sensor much
// slower than the raw one (Pixel 9: linear acceleration at 50 Hz). If linear
// acceleration can't reach FAST_HZ — by its spec, or as measured over the
// first samples — and the raw accelerometer can, the raw one is used instead.
// Each event carries its kind so JS knows whether to filter gravity.
//
// Keys: while capture is on, volume / headset / Bluetooth-remote buttons are
// consumed (the volume doesn't change) and forwarded as down/up events with
// their hardware event time. Done by wrapping the activity window's
// Window.Callback, so MainActivity doesn't need editing.
//
// Cues: the app's short sound effects play through SoundPool (game audio on
// the media volume). expo-av's ExoPlayer path mixed the whole first run after
// launch at zero gain on a Pixel 9; SoundPool is Android's player for exactly
// this kind of sound and doesn't take audio focus.
class DragTreeInputModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val sensorManager: SensorManager?
    get() = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private var sensorThread: HandlerThread? = null
  @Volatile private var motionListener: SensorEventListener? = null

  @Volatile private var keyCapture = false
  private var hookedWindow: Window? = null

  // Linear acceleration measured slower than this on this phone → raw
  // accelerometer for the rest of the app session.
  @Volatile private var linearTooSlow = false
  @Volatile private var activeKind = "none"

  private fun maxHz(s: Sensor?): Double =
    if (s == null || s.minDelay <= 0) 0.0 else 1_000_000.0 / s.minDelay

  private fun motionSensor(): Pair<Sensor, String>? {
    val sm = sensorManager ?: return null
    val linear = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val linearFast = !linearTooSlow && (maxHz(linear) == 0.0 || maxHz(linear) >= FAST_HZ)
    if (linear != null && (linearFast || accel == null || maxHz(accel) < FAST_HZ)) return linear to "linear"
    if (accel != null) return accel to "accel"
    return null
  }

  private fun startMotion(): String {
    stopMotion()
    val sm = sensorManager ?: return "none"
    val (sensor, kind) = motionSensor() ?: return "none"
    val thread = HandlerThread("DragTreeMotion").apply { start() }
    val handler = Handler(thread.looper)
    val listener = object : SensorEventListener {
      var first = 0L
      var count = 0
      var checked = kind != "linear"
      override fun onSensorChanged(e: SensorEvent) {
        if (motionListener !== this) return
        sendEvent("onMotion", Bundle().apply {
          putDouble("x", e.values[0].toDouble())
          putDouble("y", e.values[1].toDouble())
          putDouble("z", e.values[2].toDouble())
          putDouble("t", e.timestamp / 1_000_000.0) // ns → ms, elapsedRealtime base
          putString("kind", kind)
        })
        if (checked) return
        if (count == 0) first = e.timestamp
        count += 1
        if (count < RATE_CHECK_SAMPLES) return
        checked = true
        val hz = (count - 1) * 1e9 / (e.timestamp - first).coerceAtLeast(1L)
        val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (hz < FAST_HZ && accel != null && maxHz(accel) >= FAST_HZ) {
          linearTooSlow = true
          // Switch on this same thread: no gap in the stream beyond one sample.
          sm.unregisterListener(this)
          val next = rawListener(sm)
          motionListener = next
          activeKind = "accel"
          sm.registerListener(next, accel, SAMPLING_US, handler)
        }
      }
      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    sensorThread = thread
    motionListener = listener
    activeKind = kind
    // Allowed at 200 Hz because the app declares HIGH_SAMPLING_RATE_SENSORS.
    sm.registerListener(listener, sensor, SAMPLING_US, handler)
    return kind
  }

  private fun rawListener(sm: SensorManager): SensorEventListener = object : SensorEventListener {
    override fun onSensorChanged(e: SensorEvent) {
      if (motionListener !== this) return
      sendEvent("onMotion", Bundle().apply {
        putDouble("x", e.values[0].toDouble())
        putDouble("y", e.values[1].toDouble())
        putDouble("z", e.values[2].toDouble())
        putDouble("t", e.timestamp / 1_000_000.0)
        putString("kind", "accel")
      })
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  private fun stopMotion() {
    motionListener?.let { sensorManager?.unregisterListener(it) }
    motionListener = null
    activeKind = "none"
    sensorThread?.quitSafely()
    sensorThread = null
  }

  private fun sensorInfo(s: Sensor?): Bundle? = s?.let {
    Bundle().apply {
      putString("name", it.name)
      putString("vendor", it.vendor)
      putDouble("maxHz", maxHz(it))
    }
  }

  companion object {
    const val SAMPLING_US = 5_000       // 200 Hz
    const val FAST_HZ = 100.0
    const val RATE_CHECK_SAMPLES = 15   // ≈ 0.3 s at 50 Hz
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

  private var soundPool: SoundPool? = null
  private val cueIds = HashMap<String, Int>()

  // Writes each WAV to the cache dir and loads it; resolves once all are
  // loaded. SoundPool reports loads on the creating thread's looper, so this
  // must not block waiting for them.
  private fun loadCues(cues: Map<String, String>, promise: Promise) {
    val pool = soundPool ?: SoundPool.Builder()
      .setMaxStreams(4)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .build()
      .also { soundPool = it }
    if (cues.isEmpty()) return promise.resolve(null)
    val pending = HashMap<Int, String>()
    var left = cues.size
    pool.setOnLoadCompleteListener { _, id, status ->
      synchronized(pending) {
        val key = pending.remove(id) ?: return@synchronized
        if (status == 0) cueIds[key] = id
        if (--left == 0) promise.resolve(null)
      }
    }
    synchronized(pending) {
      for ((key, base64) in cues) {
        cueIds.remove(key)?.let { pool.unload(it) }
        val file = File(context.cacheDir, "cue-$key.wav")
        file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
        pending[pool.load(file.path, 1)] = key
      }
    }
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
    // Kind of the running stream (may change from "linear" to "accel" once
    // the first samples show linear acceleration is slow).
    Function("activeMotionKind") { activeKind }
    // Both candidate sensors, for Settings → Sensor details.
    Function("motionInfo") {
      val sm = sensorManager
      Bundle().apply {
        putBundle("linear", sensorInfo(sm?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)))
        putBundle("accel", sensorInfo(sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)))
        putBoolean("linearTooSlow", linearTooSlow)
      }
    }
    Function("stopMotion") { stopMotion() }

    AsyncFunction("setKeyCapture") { enabled: Boolean ->
      keyCapture = enabled
      if (enabled) hookWindow()
    }.runOnQueue(Queues.MAIN)

    // Sound cues: { key: base64 WAV } → loaded; then playCue(key).
    AsyncFunction("loadCues") { cues: Map<String, String>, promise: Promise -> loadCues(cues, promise) }
    Function("playCue") { key: String ->
      val id = cueIds[key] ?: return@Function false
      (soundPool?.play(id, 1f, 1f, 1, 0, 1f) ?: 0) != 0
    }

    OnActivityEntersForeground {
      if (keyCapture) hookWindow()
    }

    OnDestroy {
      stopMotion()
      soundPool?.release()
      soundPool = null
      cueIds.clear()
      keyCapture = false
      appContext.currentActivity?.runOnUiThread { unhookWindow() }
    }
  }
}
