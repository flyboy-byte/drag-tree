# DragTree — NHRA Pro Tree Reaction Timer

An Android reaction game built on an NHRA Christmas Tree. Watch the ambers, react to the green, and see how fast you were. Launch with the phone's motion sensor (mount it on the dash and drive off), a tap, a held button, or a volume button or Bluetooth remote. Race a friend on one phone in 2 Player.

Fully offline. No account, no ads, no network permission.

<p align="center">
  <img src="docs/screenshot-tree.png" alt="DragTree Pro Tree idle screen" width="300" />
  &nbsp;&nbsp;
  <img src="docs/settings_menu.jpg" alt="DragTree settings screen" width="300" />
</p>

## Get the app

| | |
|---|---|
| **F-Droid** | [f-droid.org/packages/com.flyboybyte.dragtree](https://f-droid.org/packages/com.flyboybyte.dragtree/) (reproducible build) |
| **Google Play** | [play.google.com/store/apps/details?id=com.flyboybyte.dragtree](https://play.google.com/store/apps/details?id=com.flyboybyte.dragtree) |
| **GitHub** | [Releases](https://github.com/flyboy-byte/drag-tree/releases) — per-ABI APKs (most phones: `arm64-v8a`) |

All three are signed with the same key, so you can switch between them without uninstalling.

## Features

- **Pro Tree** (.400) — all three ambers at once, green 0.400 s later
- **Sportsman Tree** (.500) — ambers count down one at a time, green 0.500 s after the last
- **Motion-sensor launch** — no calibration; reaction time is measured from the start of acceleration, not from when the threshold was crossed
- **Hold to Launch** — hold the button through the tree and let go on green, like a trans-brake button
- **Volume Buttons & Remotes** — a volume button, a wired headphone button or a Bluetooth camera-shutter remote as the launch button (off by default)
- **2 Player** — head-to-head on one phone, a lane each; best reaction wins, a red light loses
- **Grading** — Perfect (≤ .049) · Pro (≤ .099) · Great (≤ .199) · Good (≤ .349) · Late · Red Light (with the actual time early)
- **Consistency stats** — average, spread, how often you land within ±.020, and your streak
- **Series mode** — 3, 5, or 10 runs with average, best, worst, red-light count, and a consistency read
- **History and trend chart** — last 30 runs, personal best highlighted
- **Time-slip comparison** — enter the RT from a real slip and see how the phone differs
- **Accelerometer test** — records 5 seconds of background vibration and suggests the most sensitive setting it won't trip
- **Phone latency check** — screen rate, sensor rate, and a tap test
- **Sensitivity** — Gentle / Normal / Hard presets plus a custom threshold
- **Sounds** (optional) — a tick per amber, a beep at green, result chime, red-light buzz
- **FLOOR IT button** — simulated launch for practice without a car, or in a browser

The displayed RT is a launch-reaction estimate. Track time slips also include rollout and drivetrain response, so the app is best for training consistency rather than predicting a slip.

## How detection works

A small native module (`modules/dragtree-input`, Kotlin) reads the motion sensor directly at up to 200 Hz and passes every sample on with the sensor's own timestamp. Android's linear-acceleration sensor is used when it is fast enough; some phones run it far slower than the raw accelerometer (a Pixel 9 does 50 Hz against 400 Hz), and phones without a gyroscope don't have it at all. In those cases the raw accelerometer is used and the app removes gravity with a slow filter.

A launch fires when the magnitude stays above the threshold for 40 ms (at least 3 samples), which rejects bumps and taps. The app then walks back through a short sample buffer to find where the acceleration ramp began, and reports RT from that point — never earlier than the real start. Everything is in milliseconds, so it behaves the same at 50, 60 or 200 Hz.

| Preset | Threshold | Typical use |
|---|---|---|
| Gentle | 1.5 m/s² (~0.15 g) | FWD street car, light throttle |
| Normal | 2.5 m/s² (~0.25 g) | RWD / sport car (default) |
| Hard | 4.5 m/s² (~0.46 g) | Drag-prepped car, hard launch |

**Mounting:** use a rigid mount. A loose phone bounces on its own and gives bad readings. Hold still for about a second before tapping STAGE.

| Symptom | Fix |
|---|---|
| Fires on a bump before launch | Raise sensitivity (Normal / Hard) |
| Fires right after STAGE | Phone was moving when staged; hold still first |
| Never fires | Try Gentle; check the sample rate on the Diagnostics screen |

**Permissions:** `HIGH_SAMPLING_RATE_SENSORS` (auto-granted, needed for >200 Hz sensor rates on Android 12+), `VIBRATE` (touch feedback) and `MODIFY_AUDIO_SETTINGS` (sound effects). Internet, network state, microphone, and storage permissions are explicitly blocked.

## Build from source

Requires Node.js 18+.

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
npm install

npm run web        # browser version (FLOOR IT button, no sensor)
npm test           # unit tests
npm run typecheck
```

Use `npm run web`, not `npx expo start`. npx may pull a different Expo version than the project's SDK 54.

**Android APK** — needs JDK 21, Android SDK 36 (build-tools 36.0.0), NDK 27.1.12297006, and Node on `PATH`:

```bash
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

A signed build needs `android/local.properties` with keystore values (see `android/local.properties.example`).

F-Droid builds this app from source with a reproducible recipe. The release process and the lessons from getting there are in [`fdroid/`](fdroid/).

## Tech

Expo SDK 54 · React Native 0.81 (New Architecture) · expo-router · expo-av (Android sounds play through SoundPool in the native module) · a local Kotlin module for the motion sensor and hardware buttons · TypeScript. MIT license.
