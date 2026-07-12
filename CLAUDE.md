# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

All commands run from the **repo root**. The app is now at repo root — no subdirectory.

```bash
# Install dependencies (generates/updates package-lock.json)
npm install

# Local dev (web mode in browser)
npm run web

# Typecheck the app
npm run typecheck

# Local APK build (requires Android SDK + NDK 27.1.12297006 + JDK 21 + local.properties)
cd android && ./gradlew assembleRelease

# Local AAB build for Play Store
cd android && ./gradlew bundleRelease

# EAS build — still works if needed (internal APK via sideload)
eas build --profile preview --platform android
```

**Do not use `npx expo start`** — always use `npm run web` to ensure Expo 54 is used.

**Local Gradle builds** require `npm install` at repo root first. The `settings.gradle` uses Node `require.resolve()` calls at Gradle configuration time — Node must be on PATH when running `./gradlew`.

**Signing** — release builds need `android/local.properties` (gitignored) with keystore credentials. See Session B of the EAS→local build migration plan.

---

## Local Build Environment (Session B — in progress)

For `./gradlew assembleRelease` to work:

1. **JDK 21** — use Debian/Ubuntu OpenJDK 21 (same flavor F-Droid uses, not Temurin)
2. **Android SDK** — SDK 36, build-tools 36.0.0
3. **NDK** — 27.1.12297006 (exact version)
4. **`android/local.properties`** (gitignored, create manually):
   ```
   sdk.dir=/path/to/Android/Sdk
   RELEASE_STORE_FILE=release.keystore
   RELEASE_KEY_ALIAS=<alias>
   RELEASE_STORE_PASSWORD=<pw>
   RELEASE_KEY_PASSWORD=<pw>
   ```
5. **Production keystore** — download from EAS via `eas credentials`, place at `android/app/release.keystore` (gitignored)
6. **`android/app/build.gradle`** — `signingConfigs.release` block already added; reads from `local.properties`

---

## EAS Build Profiles (`eas.json`)

| Profile | Output | Use |
|---|---|---|
| `play` | AAB, auto-increments versionCode | Play Store submission |
| `preview` | APK | Sideload to device for testing |
| `production` | APK | Legacy, unused |

---

## Architecture

### Repo layout

```
drag-tree/                     ← repo root = app root (no monorepo nesting)
├── android/                   ← committed native project (do not regenerate casually)
├── app/
│   ├── (tabs)/index.tsx       ← Home screen (tree, button, history)
│   └── diagnostic.tsx         ← Settings + diagnostics (sensor data, telemetry)
├── components/                ← ChristmasTree, ReactionDisplay, HistoryList, etc.
├── hooks/
│   ├── useTreeSession.ts      ← Session state machine + history persistence
│   └── useAccelerometer.ts    ← Sensor subscription, sustain gate, onset rewind
├── lib/
│   ├── settings.ts            ← Pub/sub settings store (AsyncStorage-backed)
│   ├── sessionLock.ts         ← Pub/sub boolean (written by home, read by diag)
│   ├── launchTelemetry.ts     ← Pub/sub last-launch sensor breakdown
│   └── audio.ts               ← Synthesized WAV audio cues (expo-av)
└── constants/colors.ts        ← All color tokens (light + dark)
```

### State architecture

All global state uses a hand-rolled pub/sub pattern — no Redux, no Zustand, no React Context. Keep it that way.

**`lib/settings.ts`** — User preferences, persisted to `"dragtree.settings.v1"` in AsyncStorage. `persist()` is debounced 250 ms to coalesce rapid stepper taps.

```ts
interface AppSettings {
  showFloorIt: boolean;
  sensitivity: "gentle" | "normal" | "hard" | "custom";
  customThreshold: number;    // m/s² — only when sensitivity === "custom"
  sensorEnabled: boolean;
  treeMode: "pro" | "full";
  soundEnabled: boolean;
  seriesEnabled: boolean;
  seriesSize: 3 | 5 | 10;
  showTrend: boolean;         // Show RT trend chart below run history
}
```

Sensitivity thresholds: `gentle: 1.5`, `normal: 2.5`, `hard: 4.5` m/s²

**`lib/sessionLock.ts`** — Boolean `true` while a run is active. Kept separate from settings so home-screen phase transitions don't trigger a settings re-render. The home screen only **writes** to it; `diagnostic.tsx` **reads** it.

**`lib/launchTelemetry.ts`** — Last real-sensor launch breakdown (onset → threshold → confirm times, peak G, `source: "native"|"js"`). Written via `onLaunchTelemetry` in home screen; read in `diagnostic.tsx`.

### Session state machine (`useTreeSession.ts`)

```
idle → staging → countdown → go → result
                           ↘ redlight
(any) → idle  (via reset())
```

Key refs guard against stale closures and prevent unnecessary re-renders:
- `phaseRef` — mirrors `phase`; guards `triggerLaunch`/`triggerRedLight` against double-fire
- `greenAtRef` — `performance.now()` timestamp of green light (set at paint time via rAF)
- `hydratedRef` — prevents first-render empty state from clobbering AsyncStorage

**AsyncStorage keys:**
- `"dragtree.history.v1"` — last 30 `RunRecord` objects
- `"dragtree.bestTime.v1"` — best RT as string

To migrate incompatibly: bump `.v1` → `.v2` and handle the old key in the hydration IIFE.

### Accelerometer (`useAccelerometer.ts`)

Sensor: `DeviceMotion` from `expo-sensors` at 8 ms intervals (125 Hz target). Uses `DeviceMotion.acceleration` — linear acceleration with gravity removed by Android sensor fusion.

Detection flow:
1. Each sample pushed into a 24-sample rolling buffer
2. When magnitude ≥ threshold for `SUSTAINED_SAMPLES` (5) consecutive samples (~40 ms), fire
3. On fire: walk back through buffer via slope analysis to find the **jerk-onset timestamp** — RT is reported from onset, not confirmation
4. `watchForRedLight=true` during staging/countdown: fire → `onRedLight()` instead

**Critical design:** `onLaunch`, `onRedLight`, `onLaunchTelemetry` are stored in refs updated each render. Without this, the DeviceMotion subscription would teardown/recreate 125×/s. `firedRef` prevents double-fire between sensor and FLOOR IT button.

### Home screen button logic

```ts
const sensorActive  = isAvailable && sensorEnabled;
const useSimulation = !sensorActive || showFloorIt;
```

When sensor is active and FLOOR IT is off, the button shows "ARMED" and is disabled during active phases — the sensor fires automatically.

### Audio (`lib/audio.ts`)

All sounds are 16-bit PCM WAV data URIs generated at runtime — no bundled asset files. Lazy-initialized on first play via `ensureReady()`. Each function no-ops if `soundEnabled === false`.

- **Amber click** (~40 ms, 900 Hz) — fires on each amber stage
- **Green chirp** (~70 ms, 1400→2000 Hz sweep) — fires at "go", **only in simulation mode** (skipped when sensor-armed to avoid masking launch)
- **Result ping** (~110 ms) — fires for any non-redlight, non-late grade
- **Red-light buzz** (~180 ms, 220→60 Hz) — fires for redlight

---

## Key invariants

1. **`sessionLocked` does NOT live in `AppSettings`** — it's in `lib/sessionLock.ts` only. Any reference to `appSettings.sessionLocked` is a stale bug.

2. **`app.json` in the repo may lag behind the pushed version** (which has `projectId`/`owner` from EAS). Never overwrite the repo's `app.json` with a local copy that's missing those fields.

3. **Reanimated 4 syntax** — use `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withRepeat`, `withSequence`. Do not use v2/v3 `useAnimatedGestureHandler`.

4. **User tone: minimal, plain, no nagging.** Any user-visible text must be short and non-pushy.

5. **`persist()` is debounced 250 ms.** Rapid `settings.set()` calls coalesce into one write.

---

## F-Droid

For F-Droid or reproducible-build work, use docs in this order:

1. **`FDROID.md`** — current status and entrypoint
2. **`FDROID_REPRO_EXECUTION.md`** — operational execution guide
3. **`PLAN.md`** — broader strategy and experiment sequencing
4. **`FDROID_MR_ACTIVITY.md`** — reviewer constraints and why certain choices are mandatory
5. **`FDROID_REPRO_RESEARCH.md`** — background research only

Do not treat `FDROID_REPRO_RESEARCH.md` as the primary action doc.

Quick facts:
- No Firebase, no GMS — fully offline by design.
- Official reviewer template path: `/home/logan/Downloads/build-react-native.yml`
- `android/` is committed as the intended Gradle state, but Expo prebuild regenerates it during the F-Droid recipe.
- The `v1.7.2` reproducible-build workflow is Gradle-first, not EAS-first.
- The reference APK for `Binaries:` must come from the same effective patch sequence as the fdroiddata YAML.
- Canonical reference-build shape: fresh clone in a Debian/F-Droid-like container, apply template-style patches, run `npx expo prebuild -p android --clean`, then build/sign with Gradle.
- Tag every release — F-Droid AutoUpdateMode tracks tags matching versionName.
- Fastlane metadata: `fastlane/metadata/android/en-US/` — update `changelogs/<versionCode>.txt` each release.
- AndroidManifest.xml permissions from Expo/RN defaults are kept intentionally.
