# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

All development happens inside `artifacts/drag-tree/`. Always run `pnpm install` from the **repo root** first.

```bash
# Local dev (web mode in browser)
cd artifacts/drag-tree && pnpm web

# Typecheck the app
cd artifacts/drag-tree && npx tsc --noEmit

# Full monorepo typecheck
pnpm run typecheck        # from repo root

# EAS build — internal APK (sideload to device)
cd artifacts/drag-tree && eas build --profile preview --platform android

# EAS build — Play Store AAB (auto-increments versionCode)
cd artifacts/drag-tree && eas build --profile play --platform android
```

**Do not use `npx expo start`** — always use `pnpm web` to ensure Expo 54 is used.

**Do not run `pnpm run dev` at the workspace root** — there is no root dev script.

**`pnpm install` must run from repo root**, not from `artifacts/drag-tree`. Running it from the wrong directory causes `Unable to resolve module` build failures.

---

## EAS Build Profiles (`eas.json`)

| Profile | Output | Use |
|---|---|---|
| `play` | AAB, auto-increments versionCode | Play Store submission |
| `preview` | APK | Sideload to device for testing |
| `production` | APK | Legacy, unused |

---

## Architecture

### Monorepo layout

```
drag-tree/                     ← repo root (tooling only)
└── artifacts/drag-tree/       ← THE main app (all feature work lives here)
    ├── app/
    │   ├── (tabs)/index.tsx   ← Home screen (tree, button, history)
    │   └── diagnostic.tsx     ← Settings + diagnostics (sensor data, telemetry)
    ├── components/            ← ChristmasTree, ReactionDisplay, HistoryList, etc.
    ├── hooks/
    │   ├── useTreeSession.ts  ← Session state machine + history persistence
    │   └── useAccelerometer.ts← Sensor subscription, sustain gate, onset rewind
    ├── lib/
    │   ├── settings.ts        ← Pub/sub settings store (AsyncStorage-backed)
    │   ├── sessionLock.ts     ← Pub/sub boolean (written by home, read by diag)
    │   ├── launchTelemetry.ts ← Pub/sub last-launch sensor breakdown
    │   └── audio.ts           ← Synthesized WAV audio cues (expo-av)
    └── constants/colors.ts    ← All color tokens (light + dark)
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

The app targets F-Droid distribution alongside Play Store. MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671 (pipeline passing, awaiting review as of June 2026).

- **No Firebase, no GMS** — F-Droid bans them. App is fully offline by design.
- **`android/` is committed** to the repo (`artifacts/drag-tree/android/`). F-Droid builds by cloning the repo and running Gradle directly.
- **Rebuild `android/` when native changes** — after any Expo version bump or new native plugin, re-run `expo prebuild --platform android --clean` from `artifacts/drag-tree/` and commit the updated `android/` directory.
- **Tag every release** — F-Droid AutoUpdateMode tracks `git tag` matching `versionName` (e.g. `v1.7.1`). Tags are for auto-update tracking; the fdroiddata `commit:` field should use the **full SHA**, not the tag name.
- **Fastlane metadata** is in `fastlane/metadata/android/en-US/` — update `changelogs/<versionCode>.txt` each release. Keep `short_description.txt` under 80 characters.
- **`subdir`** for fdroiddata YAML: `artifacts/drag-tree/android` (not `android/app` — `output:` handles the APK path within subdir)

### Working fdroiddata build block (v1.7.1)

```yaml
commit: 2b9bf0115a33702999af22993a24d4b0017eddd9
subdir: artifacts/drag-tree/android
sudo:
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - mkdir -p /etc/apt/keyrings
  - curl -fsSLO https://packages.adoptium.net/artifactory/api/gpg/key/public
  - gpg --dearmor < public > /etc/apt/keyrings/adoptium.gpg
  - echo 'deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb
    trixie main' >> /etc/apt/sources.list
  - apt-get update
  - apt-get install -y nodejs temurin-17-jdk
  - npm install -g pnpm
init: cd ../../.. && pnpm install --no-frozen-lockfile --ignore-scripts
gradle:
  - yes
output: app/build/outputs/apk/release/app-release-unsigned.apk
scanignore:
  - node_modules
ndk: 27.1.12297006
```

Key build environment notes:
- F-Droid sandbox is Debian trixie — no `openjdk-17-jdk`, no `wget`, no `apt-key`. Use Temurin from adoptium via curl+gpg dearmor.
- `init: cd ../../..` — three levels up from `subdir` to repo root, so pnpm can see the workspace root `package.json`.
- `--no-frozen-lockfile` required because catalog: aliases in pnpm-lock.yaml resolve differently in CI.
- `--ignore-scripts` required because pnpm 10 exits non-zero when native postinstall scripts (esbuild) are blocked.
- `scanignore: node_modules` required — F-Droid's binary scanner rejects compiled native binaries in node_modules.
- `output:` path is relative to `subdir`. Full path from repo root: `artifacts/drag-tree/android/app/build/outputs/apk/release/app-release-unsigned.apk`.
- `org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g` in `gradle.properties` — D8 dex merge requires more heap than the default 2 GiB on F-Droid's saas-linux-medium runner.

### Permissions note

AndroidManifest.xml has several permissions added by Expo/RN defaults (INTERNET, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, etc.). These were kept intentionally — removing them risks breaking sensor quality. `HIGH_SAMPLING_RATE_SENSORS` is the only one actively used at runtime.
