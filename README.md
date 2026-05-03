<div align="center">

# DragTree

### NHRA-style Pro Tree reaction timer for your phone

*Mount it. Stage it. Floor it. Know your reaction time to the millisecond.*

<br />

[![Play Store](https://img.shields.io/badge/Google_Play-Internal_Testing-414141?style=for-the-badge&logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=com.flyboybyte.dragtree)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android-3ddc84?style=for-the-badge&logo=android&logoColor=white)](#2-build-the-android-apk-with-eas)
[![Expo SDK](https://img.shields.io/badge/Expo_SDK-54-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)

<br />

![DragTree feature graphic](https://raw.githubusercontent.com/flyboy-byte/drag-tree/main/docs/feature-graphic.png)

</div>

---

## What it does

DragTree simulates a real **NHRA Pro Tree** — all three ambers fire simultaneously, the green lights up **0.400 s** later — and uses your phone's accelerometer to measure how long it takes you to *physically launch* once green appears.

Mount the phone on the dash. Stage up. Watch the tree. Floor it. The app detects the launch G-force and records your reaction time to the millisecond — automatically, with no tapping.

> **Works offline.** No accounts, no ads, no tracking, no internet required after install.
> **Also runs in the browser** with a simulated FLOOR IT button for desktop practice.

---

## Table of contents

1. [Run in the browser (quickest start)](#1-run-in-the-browser-quickest-start)
2. [Build the Android APK with EAS](#2-build-the-android-apk-with-eas)
3. [Updating your local copy and rebuilding](#3-updating-your-local-copy-and-rebuilding)
4. [How the launch detection works](#4-how-the-launch-detection-works)
5. [Troubleshooting](#5-troubleshooting)
6. [App features](#6-app-features)
7. [Tech stack](#tech-stack)
8. [License](#license)

---

## 1. Run in the browser (quickest start)

No EAS account or Android device needed — runs in any desktop browser.

#### Prerequisites

| Tool    | Min version | Install                          |
| ------- | ----------- | -------------------------------- |
| Node.js | 18          | <https://nodejs.org>             |
| pnpm    | 9+          | `npm install -g pnpm`            |

#### Steps

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
pnpm install
cd artifacts/drag-tree
pnpm web
```

Expo opens the app in your default browser. If it doesn't, look for `Web is waiting on http://localhost:8081` in the terminal and open that URL.

> [!WARNING]
> **Do not use `npx expo start --web`.** npx pulls whichever Expo version is current, which won't match this project's Expo 54 and will cause version-mismatch errors. Always use `pnpm web` from inside `artifacts/drag-tree`.

> [!NOTE]
> **Accelerometer on web:** Browsers don't expose the phone-grade accelerometer API that Expo uses, so the sensor is disabled in browser mode. Use the on-screen **FLOOR IT** button to simulate a launch — it animates the G-meter and fires the timer exactly as the real sensor would.

---

## 2. Build the Android APK with EAS

EAS builds the APK in the cloud — no Android SDK, no Java, nothing extra to install on your machine.

#### Prerequisites

| Tool          | Min version | Install                          |
| ------------- | ----------- | -------------------------------- |
| Node.js       | 18          | <https://nodejs.org>             |
| pnpm          | 9+          | `npm install -g pnpm`            |
| EAS CLI       | 16+         | `npm install -g eas-cli`         |
| Expo account  | —           | <https://expo.dev/signup> (free) |

> [!IMPORTANT]
> **Why pnpm?** This is a pnpm workspace (monorepo). Using `npm install` or `yarn` will break the build.

<details>
<summary><b>Step 1 — Install EAS CLI</b></summary>

```bash
npm install -g eas-cli
eas --version
```

You only need to do this once per machine.

</details>

<details>
<summary><b>Step 2 — Clone the repo</b></summary>

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
```

</details>

<details>
<summary><b>Step 3 — Install dependencies</b></summary>

```bash
pnpm install
```

Run this from the **repo root** (`drag-tree/`), not from inside `artifacts/drag-tree`. Wrong directory is the most common build failure.

</details>

<details>
<summary><b>Step 4 — Log in to Expo</b></summary>

```bash
eas login
```

Create a free account at <https://expo.dev/signup> if you don't have one.

</details>

<details>
<summary><b>Step 5 — Link the EAS project (first time only)</b></summary>

```bash
cd artifacts/drag-tree
eas init
```

Confirm with **yes** when prompted. EAS creates the project on expo.dev, gets a project ID, and writes it into `app.json` automatically.

</details>

<details>
<summary><b>Step 6 — Build the APK</b></summary>

```bash
eas build --platform android --profile preview
```

When prompted **"Generate a new Android Keystore?"** — type **yes** and press Enter. EAS generates and stores the signing keystore in the cloud; you don't need to manage it.

After upload you'll see a build URL like `https://expo.dev/accounts/yourname/projects/drag-tree/builds/...`. You can press **Ctrl+C** safely — the build keeps running in the cloud.

| Detail        | Value                                  |
| ------------- | -------------------------------------- |
| Build time    | 10–20 minutes                          |
| Free tier     | 30 builds / month                      |
| Output        | Downloadable `.apk` from the build page |

</details>

<details>
<summary><b>Step 7 — Install on your Android phone</b></summary>

1. On the phone: **Settings → Apps → Special app access → Install unknown apps** — enable for your browser or Files app.
2. Open the EAS build page on your phone, tap **Download**.
3. Tap the downloaded `.apk` and follow the install prompts.
4. Open **DragTree** — no internet required.

</details>

---

## 3. Updating your local copy and rebuilding

When changes land on GitHub, pull them down, optionally re-install, and queue a new EAS build.

```bash
# From the repo root
git pull origin main

# Re-install if package.json / pnpm-workspace.yaml / pnpm-lock.yaml changed
# (safe to always run — no-op if nothing changed)
pnpm install

# Queue a new build
cd artifacts/drag-tree
eas build --platform android --profile preview
```

The keystore prompt won't appear again — EAS already has it.

<details>
<summary><b>Inspect what changed</b></summary>

```bash
git log --oneline -10            # recent commits
git show --stat HEAD             # files changed in last commit
git diff HEAD~1 HEAD             # full diff
```

</details>

<details>
<summary><b>Build a specific commit or tag</b></summary>

```bash
git log --oneline                # find a commit
git checkout abc1234             # detached HEAD — read-only
# or: git checkout v1.0.0

cd artifacts/drag-tree
eas build --platform android --profile preview

git checkout main                # return to tip when done
```

</details>

<details>
<summary><b>Roll back a bad build</b></summary>

```bash
git log --oneline                # find last known-good hash
git reset --hard abc1234         # ⚠ throws away uncommitted changes
pnpm install
cd artifacts/drag-tree
eas build --platform android --profile preview
```

</details>

---

## 4. How the launch detection works

### Sensor model — orientation-independent

DragTree uses the phone's **raw accelerometer** (gravity included). At rest, the magnitude is always **~9.81 m/s² (1g)**, regardless of how the phone is mounted. When the car launches, forward force adds to the gravity vector and the magnitude rises. The app measures the **delta above a continuously-averaged baseline** and fires when it crosses the chosen threshold.

That means:
- **Mount the phone any way you want** — portrait, landscape, tilted on the dash. The math doesn't care.
- **No calibration step.** While idle, the app rolls an 8-sample (~800 ms) average to lock a stable baseline the moment you tap STAGE.

### Sensitivity presets

| Preset  | Threshold       | Sustained samples         | Typical use                          |
| ------- | --------------- | ------------------------- | ------------------------------------ |
| Gentle  | ~0.15 g (1.5 m/s²) | 5 in a row (~40 ms)       | FWD street car, light throttle       |
| Normal  | ~0.25 g (2.5 m/s²) | 5 in a row (~40 ms)       | RWD or sport car, moderate launch    |
| Hard    | ~0.46 g (4.5 m/s²) | 5 in a row (~40 ms)       | Drag-prepped car, slicks, hard launch |

The sensor runs at **125 Hz** (8 ms between samples). The G-force has to stay above threshold for **5 consecutive samples (~40 ms)** before firing. A real launch is sustained for 300–500 ms; road bumps and taps die out in under 30 ms — they can't trigger it. Drop below threshold once and the counter resets.

> Start with **Gentle** for any street car. Move to Normal or Hard only if you get false triggers.

### Reaction-time precision — jerk-onset rewind

Naive threshold-crossing always over-reports RT, because the threshold is crossed *partway up* the launch acceleration ramp. DragTree maintains a rolling 150 ms buffer and, after a launch is confirmed, walks **backward** through the buffer to find the first sample where the smoothed slope started rising. That earlier sample becomes the launch timestamp.

This shaves **50–100 ms** off measured RT compared to threshold-only detection — without weakening false-positive rejection, since the sustained-samples gate has to fire first.

The green-light timestamp is also captured at the next vsync via `requestAnimationFrame` (not at the JS `setState` call) so it lines up with when the green pixels actually paint — removing another ~30–40 ms of pre-paint bias.

> Verify on your device with the **Diagnostics screen** (DIAG button, top-right of home) — see *App features* below.

### Phone mounting — important

- Mount the phone **rigidly** to the dash or cage. A loose phone bounces independently of the car and will produce garbage readings.
- Any solid mount works: RAM mount, vent clip with lock, windshield suction with arm.
- Keep the screen visible from the driver's seat — you need to see the tree.

### Known Android limitations

| Issue                                | Cause                                       | Workaround                                                                |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| Fires on a bump before launch        | Baseline jitter on rough pavement           | Use Normal or Hard sensitivity                                            |
| Fires the instant you tap STAGE      | Phone was moving when staged                | Wait ~1 s after tapping STAGE before staging the car                      |
| Doesn't fire at all                  | Device caps below 125 Hz despite permission | Try Gentle; check achieved Hz on the Diagnostics screen; report your model |
| "Sensor not available"               | Rare — some Android emulators lack sensors  | Use a real device                                                         |
| Slight G reading at rest             | Normal — vibration, idle RPM, A/C compressor | Baseline averages it out automatically                                    |

### Permissions

The app requests one Android permission: **`HIGH_SAMPLING_RATE_SENSORS`**. Required on Android 12+ (API 31+) for the 125 Hz accelerometer rate — without it, Android caps sensor updates at 5 Hz, far too slow for drag-strip RT. Granted automatically at install time, no runtime prompt. Does **not** grant access to location, camera, microphone, or any sensitive data.

The app also explicitly **blocks** `ACTIVITY_RECOGNITION` (otherwise pulled in transitively by `expo-sensors`) so DragTree is not classified as a Health app under Play Store policy.

### New Architecture (React Native)

This app runs React Native **New Architecture** (`newArchEnabled: true`). All deps — `expo-sensors 15.x`, `react-native-reanimated 4.x`, `react-native-worklets` — fully support it. If you hit a launch crash mentioning "TurboModule" or "Fabric", file an issue with the full stack trace.

---

## 5. Troubleshooting

<details>
<summary><code>pnpm: command not found</code></summary>

```bash
npm install -g pnpm
```
Then re-run `pnpm install` from the repo root.

</details>

<details>
<summary><code>eas: command not found</code></summary>

```bash
npm install -g eas-cli
```

</details>

<details>
<summary><code>Not logged in</code> / <code>Authentication required</code></summary>

```bash
eas login
```

</details>

<details>
<summary><code>Project not linked</code> / <code>EAS project ID not found</code></summary>

```bash
cd artifacts/drag-tree
eas init
```
Select **Create new project** when prompted.

</details>

<details>
<summary><code>Unable to resolve module</code> during EAS build</summary>

You ran `pnpm install` from `artifacts/drag-tree` instead of the repo root.

```bash
cd drag-tree          # repo root
pnpm install
cd artifacts/drag-tree
eas build --platform android --profile preview
```

</details>

<details>
<summary><code>Cannot find module 'expo'</code></summary>

Same root cause — wrong install directory. Also verify pnpm version:

```bash
pnpm --version        # must be 9.x or 10.x
```

</details>

<details>
<summary><code>error: EMFILE: too many open files</code> (macOS only)</summary>

```bash
ulimit -n 65536
```
Retry the build.

</details>

<details>
<summary>Web app won't open in browser</summary>

```bash
cd artifacts/drag-tree
pnpm web
```
Look for the local URL in the terminal (`http://localhost:8081`) and open it manually.

</details>

<details>
<summary>EAS build failed — what to do</summary>

Every EAS build prints a full log URL. Open it. Scroll to the bottom — the last 20–30 lines have the actual error. Copy that block and file an issue.

</details>

---

## 6. App features

- **Pro Tree** — all 3 ambers fire simultaneously, green 0.400 s later
- **High-precision launch detection** — 125 Hz sampling · sensor-timestamped samples · jerk-onset rewind · vsync-aligned green-light timestamp
- **Three sensitivity presets** — Gentle / Normal / Hard, switchable when idle
- **Reaction grading** — Perfect · Pro · Great · Good · Late · Red Light
- **Session history** — every run logged, personal best highlighted
- **Diagnostics screen** — open via the **DIAG** badge (top-right of home). Shows live G with a real-time acceleration sparkline, 5-second sample-rate capture (mean interval, jitter σ, achieved Hz), per-sensitivity onset/threshold/confirm timing breakdown, and an auto-updating **LAST REAL LAUNCH** card with the full green→onset→threshold→confirm breakdown for the most recent green-light run on your phone
- **Browser / simulator mode** — FLOOR IT button animates the G-meter and fires the timer

---

## Tech stack

<table>
<tr>
<td>

**Runtime**
- Expo SDK 54
- React Native 0.81.5
- New Architecture enabled

</td>
<td>

**Core libraries**
- expo-router
- expo-sensors
- React Native Reanimated 4
- react-native-worklets

</td>
<td>

**Tooling**
- pnpm workspace monorepo
- TypeScript (strict)
- EAS Build (cloud Android)

</td>
</tr>
</table>

---

## License

[MIT](LICENSE) © flyboybyte — free to fork, free to ship, free to race.

<div align="center">

<sub><b>Not affiliated with NHRA or any sanctioning body.</b> "Pro Tree" refers to the public timing protocol, not the trademark.</sub>

</div>
