# Drag Tree — NHRA Pro Tree Reaction Timer

An Android app that simulates a real **NHRA Pro Tree** (all 3 ambers fire simultaneously, green 0.400 s later) and measures your reaction time using the phone's accelerometer. Mount your phone on the dash, stage up, watch the tree, and floor it — the app detects launch G-force and records your RT automatically.

**No internet required.** Runs fully offline after installation.

**Also works in a browser** with a simulated FLOOR IT button for desktop practice.

---

## Table of contents

1. [Run in the browser (quickest start)](#1-run-in-the-browser-quickest-start)
2. [Build the Android APK with EAS](#2-build-the-android-apk-with-eas)
3. [Updating your local copy and rebuilding](#3-updating-your-local-copy-and-rebuilding)
4. [Accelerometer — how it works & known issues](#4-accelerometer--how-it-works--known-issues)
5. [Troubleshooting](#5-troubleshooting)
6. [App features](#6-app-features)

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

# 2. Install — run from the repo root (the drag-tree/ folder you just cloned)
cd drag-tree
pnpm install

# 3. Navigate into the app directory — one level deeper than the repo root
cd artifacts/drag-tree

# 4. Start the web version using the project's own Expo (not npx)
pnpm web
```

Expo opens the app in your default browser automatically. If it doesn't, look for a line like:

```
Web is waiting on http://localhost:8081
```

and open that URL.

> **Do not use `npx expo start --web`** — npx downloads whichever Expo version is current (may differ from the project's Expo 54) and will cause version mismatch errors. Always use `pnpm web` from inside `artifacts/drag-tree`.

> **Accelerometer on web:** The browser does not expose the phone accelerometer API that Expo uses, so the sensor is disabled in browser mode. Use the **FLOOR IT** button on screen to simulate a launch — it animates the G-meter and fires the timer exactly as the real sensor would.

---

## 2. Build the Android APK with EAS

EAS builds the APK in the cloud — no Android SDK, no Java, nothing extra to install on your machine.

### Prerequisites

| Tool | Min version | Install command |
|------|-------------|-----------------|
| Node.js | 18 | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| EAS CLI | 16+ | `npm install -g eas-cli` |
| Expo account | — | https://expo.dev/signup (free) |

> **Why pnpm?** This is a pnpm workspace (monorepo). Using `npm install` or `yarn` will break the build.

### Step 1 — Install EAS CLI

```bash
npm install -g eas-cli
```

This installs the EAS command-line tool globally. You only need to do this once per machine. Verify it installed:

```bash
eas --version
```

---

### Step 2 — Clone

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
```

---

### Step 3 — Install dependencies

```bash
pnpm install
```

Run this from the **repo root** (`drag-tree/`), not from inside `artifacts/drag-tree`. This installs all workspace packages together. Running it from the wrong directory is the most common build failure.

---

### Step 4 — Log in to Expo

```bash
eas login
```

You will be prompted:
```
Log in to EAS with email or username
Email or username … your@email.com
Password … ************
Logged in
```

Create a free account at https://expo.dev/signup if you don't have one.

---

### Step 5 — Link the EAS project (first time only)

```bash
cd artifacts/drag-tree
eas init
```

You will be prompted:
```
Would you like to create a project for @yourusername/drag-tree? … yes
```

Press **Enter** to accept. EAS creates the project on expo.dev, gets a project ID, and writes it into `app.json` automatically. You will see:

```
Project successfully linked (ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) (modified app.json)
```

You only do this once. The project ID stays in `app.json` from now on.

---

### Step 6 — Build the APK

```bash
eas build --platform android --profile preview
```

> **Common typo:** `android` not `adroid` — EAS will tell you if you mistype the platform name.

During the build you will see several prompts and messages — here is what to expect and what to do:

**"No environment variables with visibility 'Plain text' found"**
→ Safe to ignore. This app uses no server-side env vars.

**"Using remote Android credentials (Expo server)"**
**"Generate a new Android Keystore?"** → type **yes** and press Enter
→ EAS generates and stores the signing keystore in the cloud. You do not need to manage it yourself.

After that, EAS uploads your project and queues the build:

```
Compressing project files and uploading to EAS Build...
Uploaded to EAS
Computed project fingerprint
See logs: https://expo.dev/accounts/yourname/projects/drag-tree/builds/...
Waiting for build to complete. You can press Ctrl+C to exit.
Build queued...
```

**You can safely press Ctrl+C** — the build continues running in the cloud. Come back to https://expo.dev/accounts/yourname/projects/drag-tree/builds to check progress or download the APK when done.

- Builds in the cloud — takes **10–20 minutes**
- Free tier: **30 builds/month**
- When done, the build page shows a **Download** button for the `.apk` file

---

### Step 7 — Install on your Android phone

1. On the phone: **Settings → Apps → Special app access → Install unknown apps**
   Enable it for your browser or Files app.
2. Open the EAS build page on your phone's browser and tap **Download**.
3. Tap the downloaded `.apk` file and follow the install prompts.
4. Open **Drag Tree** — no internet required.

---

## 3. Updating your local copy and rebuilding

When changes are pushed to the GitHub repo you need to pull them down, optionally re-install dependencies, and queue a new EAS build.

### Pull the latest changes

```bash
# From the repo root (drag-tree/)
git pull origin main
```

You will see a summary of what changed, e.g.:

```
Updating 1a0a795..245de81
Fast-forward
 artifacts/drag-tree/hooks/useTreeSession.ts | 14 ++++--
 README.md                                   | 42 +++++++++++++------
 2 files changed, 40 insertions(+), 16 deletions(-)
```

### Check what actually changed

```bash
# One-line log of recent commits
git log --oneline -10

# See exactly which files changed in the last commit
git show --stat HEAD

# See the full diff of what changed
git diff HEAD~1 HEAD
```

### Re-install dependencies (only if needed)

If the pull changed `package.json`, `pnpm-workspace.yaml`, or `pnpm-lock.yaml` you need to re-install. Safe to always run — it's a no-op if nothing changed:

```bash
# From repo root
pnpm install
```

### Queue a new EAS build

```bash
cd artifacts/drag-tree
eas build --platform android --profile preview
```

The keystore prompt will not appear again — EAS already has it stored from your first build. You go straight to upload and queue.

Each build produces a new versioned APK. Install it over the top of the old one; Android will preserve your session history.

---

### Build a specific git commit or tag

If you want to build from a specific point in history rather than the latest:

```bash
# See available commits
git log --oneline

# Check out a specific commit (detached HEAD — read-only)
git checkout abc1234

# Or check out a tag if you have any
git checkout v1.0.0

# Then build from that state
cd artifacts/drag-tree
eas build --platform android --profile preview

# Return to the tip of main when done
git checkout main
```

---

### Roll back if a new build has a problem

```bash
# Find the last known-good commit hash
git log --oneline

# Reset your local copy to that commit (keeps files, undoes commits)
git reset --hard abc1234

# Re-install and rebuild
pnpm install
cd artifacts/drag-tree
eas build --platform android --profile preview
```

> `git reset --hard` throws away any local uncommitted changes. Make sure you don't have anything important unsaved before running it.

---

## 4. Accelerometer — how it works & known issues

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

## 5. Troubleshooting

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

## 6. App features

- **Pro Tree** — all 3 ambers fire simultaneously, green 0.400 s later (no Full Tree mode)
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
