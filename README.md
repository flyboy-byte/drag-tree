# Drag Tree — NHRA Pro Tree Reaction Timer

An Android app that simulates a real **NHRA Pro Tree** (0.400 s between ambers) and measures your reaction time using the phone's accelerometer. Mount your phone on the dash, stage up, watch the tree, and floor it — the app detects launch G-force and records your RT automatically.

**No internet required.** Runs fully offline after installation.

**Also works in a browser** with a simulated FLOOR IT button for desktop practice.

---

## Table of contents

1. [Run in the browser (quickest start)](#1-run-in-the-browser-quickest-start)
2. [Build the Android APK with EAS](#2-build-the-android-apk-with-eas)
3. [Accelerometer — how it works & known issues](#3-accelerometer--how-it-works--known-issues)
4. [Troubleshooting](#4-troubleshooting)
5. [App features](#5-app-features)

---

## 1. Run in the browser (quickest start)

No EAS account or Android device needed — runs in any desktop browser.

### Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 18 | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |

### Steps

```bash
# 1. Clone
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree

# 2. Install (must run from repo root — NOT from artifacts/drag-tree)
pnpm install

# 3. Start the web version
cd artifacts/drag-tree
npx expo start --web
```

Expo opens the app in your default browser automatically. If it doesn't, look for a line like:

```
Web is waiting on http://localhost:8081
```

and open that URL.

> **Accelerometer on web:** The browser does not expose the phone accelerometer API that Expo uses, so the sensor is disabled in browser mode. Use the **FLOOR IT** button on screen to simulate a launch — it animates the G-meter and fires the timer exactly as the real sensor would.

---

## 2. Build the Android APK with EAS

EAS builds the APK in the cloud — no Android SDK, no Java, nothing extra to install on your machine.

### Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 18 | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| EAS CLI | 16+ | `npm install -g eas-cli` |
| Expo account | — | https://expo.dev/signup (free) |

> **Why pnpm?** This is a pnpm workspace (monorepo). Using `npm install` or `yarn` will break the build.

### Step 1 — Clone

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
```

### Step 2 — Install dependencies

```bash
pnpm install
```

Run this from the **repo root**, not from `artifacts/drag-tree`. This installs all workspace packages together. Running it from the wrong directory is the single most common build failure.

### Step 3 — Log in to Expo

```bash
eas login
```

Enter your Expo account credentials. Create a free account at https://expo.dev/signup if you don't have one.

### Step 4 — Link the EAS project (first time only)

```bash
cd artifacts/drag-tree
eas init
```

When prompted:
- **"Would you like to create a new EAS project?"** → **Y**
- Choose any project name (e.g. `drag-tree`)

EAS writes a project ID into `app.json`. You only do this once.

### Step 5 — Build the APK

```bash
eas build --platform android --profile preview
```

- Builds in the cloud — takes **10–20 minutes**
- Free tier: **30 builds/month**
- When done, EAS prints a download URL for the `.apk` file

### Step 6 — Install on your Android phone

1. On the phone: **Settings → Apps → Special app access → Install unknown apps**
   Enable it for your browser or Files app.
2. Open the APK download URL from Step 5 on your phone's browser.
3. Tap the downloaded file and follow the install prompts.
4. Open **Drag Tree** — no internet required.

---

## 3. Accelerometer — how it works & known issues

### How the sensor detects launch

The app uses the phone's raw accelerometer (includes gravity). When the phone sits still at any orientation, the sensor magnitude is always ~9.81 m/s² (1g of gravity). When the car accelerates, forward force adds to the vector and magnitude increases. The app measures the **delta above the resting baseline** and fires when it crosses the sensitivity threshold.

This means:
- **Orientation doesn't matter** — you can mount the phone portrait, landscape, tilted — the math still works.
- **No calibration step required** — the app continuously averages the last 8 sensor readings (~800 ms) while idle to build a stable baseline. When you tap STAGE, that averaged baseline is locked in and used for the run.

### Sensitivity presets

| Preset | Threshold | Typical use |
|--------|-----------|-------------|
| Gentle | ~0.3g (3.0 m/s²) | Smooth launches, light cars |
| Normal | ~0.56g (5.5 m/s²) | Street/bracket racing default |
| Hard | ~0.92g (9.0 m/s²) | Hard launches, drag slicks |

**Start with Normal.** If the app fires before you actually launch (false trigger from gear engagement, bumps, or creep), go up to Hard. If it misses your launch entirely, drop to Gentle.

### Phone mounting — important

- Mount the phone **rigidly** to the dash or cage. A loosely placed phone bounces independently of the car and will produce incorrect readings.
- Any solid phone mount works: RAM mount, vent clip with lock, windshield suction with arm.
- Keep the screen visible from the driver's seat — you need to see the tree.

### Known Android limitations

| Issue | Cause | Workaround |
|-------|-------|------------|
| Sensor fires on a bump before launch | Baseline jitter on rough pavement | Use Normal or Hard sensitivity |
| Sensor fires the instant you tap STAGE | Phone was moving when staged | Wait ~1 second after tapping STAGE before staging the car |
| Sensor doesn't fire at all | Device accelerometer rate capped below 60 Hz | Try Gentle sensitivity; report your device model |
| App shows "Sensor not available" | Very rare — some Android emulators lack virtual sensors | Use a real device |
| Slight G reading even at rest | Normal — vibration, idle RPM, A/C compressor cycling | Baseline averages it out automatically |

### Permissions

The Android accelerometer runs below 200 Hz — **no special permissions are required.** The app declares `permissions: []` in its manifest, so Android will not prompt for sensor access.

### New Architecture (React Native)

This app runs React Native **New Architecture** (`newArchEnabled: true`). All dependencies — `expo-sensors 15.x`, `react-native-reanimated 4.x`, `react-native-worklets` — fully support New Architecture as of their current versions. If you hit a crash on launch that mentions "TurboModule" or "Fabric", report the full stack trace.

---

## 4. Troubleshooting

### `pnpm: command not found`

```bash
npm install -g pnpm
```

Then re-run `pnpm install` from the repo root.

---

### `eas: command not found`

```bash
npm install -g eas-cli
```

---

### `Not logged in` / `Authentication required`

```bash
eas login
```

---

### `Project not linked` / `EAS project ID not found`

```bash
cd artifacts/drag-tree
eas init
```

Select **Create new project** when prompted.

---

### `Unable to resolve module` during EAS build

You ran `pnpm install` from `artifacts/drag-tree` instead of the repo root.

```bash
cd drag-tree          # repo root
pnpm install
cd artifacts/drag-tree
eas build --platform android --profile preview
```

---

### `Cannot find module 'expo'`

Same root cause — wrong install directory. Also verify pnpm version:

```bash
pnpm --version        # must be 9.x or 10.x
```

---

### `error: EMFILE: too many open files` (macOS only)

```bash
ulimit -n 65536
```

Retry the build.

---

### Web app won't open in browser

If `npx expo start --web` starts but the browser shows a blank page or connection error:

```bash
# Make sure you're in the right directory
cd artifacts/drag-tree
npx expo start --web
```

Look for the local URL printed in the terminal (`http://localhost:8081`) and open it manually.

---

### EAS build failed — what to do

Every EAS build has a full log URL printed in the terminal. Open it. Scroll to the bottom — the last 20–30 lines contain the actual error. Copy the error block and report it for help.

---

## 5. App features

- **Pro Tree** — 0.400 s between each amber, fixed (no Full Tree mode)
- **Accelerometer launch detection** — rolling-average baseline, no calibration step
- **Three sensitivity presets** — Gentle / Normal / Hard, adjustable when idle
- **Reaction grading** — Perfect / Pro / Great / Good / Late / Red Light  
- **Session history** — all runs logged, personal best highlighted
- **Browser / simulator mode** — FLOOR IT button animates G-meter and fires timer

---

## Tech stack

- Expo SDK 54 · React Native 0.81.5
- expo-router · expo-sensors · React Native Reanimated 4
- New Architecture enabled · pnpm workspace monorepo
