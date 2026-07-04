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

The app targets F-Droid distribution alongside Play Store. MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671 (pipeline passing, awaiting reviewer response as of July 2026).

- **No Firebase, no GMS** — F-Droid bans them. App is fully offline by design.
- **`android/` is committed** to the repo (`artifacts/drag-tree/android/`). The fdroiddata build re-runs `expo prebuild --clean` during the build anyway (template requirement), overwriting it.
- **Tag every release** — F-Droid AutoUpdateMode tracks `git tag` matching `versionName` (e.g. `v1.7.1`). Tags are for auto-update tracking; the fdroiddata `commit:` field should use the **full SHA**, not the tag name.
- **Fastlane metadata** is in `fastlane/metadata/android/en-US/` — update `changelogs/<versionCode>.txt` and `title.txt` each release. Keep `short_description.txt` under 80 characters. `Description:` and `AutoName:` are NOT in the YAML — F-Droid pulls them from fastlane.
- **`subdir`** for fdroiddata YAML: `artifacts/drag-tree/android/app` (the app module dir, matching the template pattern)

### Working fdroiddata build block (v1.7.1, template-compliant)

```yaml
commit: 7d3e4533a11a0c012ebd8b6abbef447ef65bd95d
subdir: artifacts/drag-tree/android/app
sudo:
  - apt-get update
  - apt-get install npm
  - npm -g install pnpm@10
init:
  - cd ../../../..
  - pnpm install --config.node-linker=hoisted --no-frozen-lockfile --ignore-scripts
gradle:
  - yes
prebuild:
  - cd ../../../..
  - sed -i -e '1a "expo":{"autolinking":{"android":{"buildFromSource":[".*"]}}},'
    artifacts/drag-tree/package.json
  - sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts
    node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt
  - cd artifacts/drag-tree
  - npx expo prebuild -p android --clean
  - sed -i -e '/signingConfig /d' android/app/build.gradle
scanignore:
  - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
  - node_modules/@react-native-async-storage/async-storage/android/build.gradle
  - node_modules/react-native-safe-area-context/android/build.gradle
  - node_modules/react-native-keyboard-controller/android/build.gradle
scandelete:
  - node_modules
ndk: 27.1.12297006
```

Key build environment notes:
- F-Droid sandbox is Debian trixie. `apt-get install npm` gives Node 20; pnpm 11 requires Node ≥22, so `pnpm@10` is pinned.
- `@react-native/gradle-plugin` uses `jvmToolchain(17)` internally. The template fix is to sed-patch it to 21 — do NOT install JDK 17. The patch runs from repo root where the package is hoisted.
- **`--config.node-linker=hoisted`** tells pnpm to create a flat `node_modules/` with real files (no symlinks, no `.pnpm/` virtual store). This is required so the F-Droid scanner sees packages at flat `node_modules/<pkg>/...` paths that match the template-style `scanignore` entries. Without it, pnpm uses its default isolated linker where packages are symlinks into `.pnpm/`, and the scanner resolves the real `.pnpm/...` paths — requiring long scanner-specific paths in scanignore.
- `subdir: artifacts/drag-tree/android/app` — Gradle runs from the app module dir.
- `init: cd ../../../..` — four levels up from `android/app` to repo root for pnpm install.
- `prebuild: cd ../../../..` — to repo root for the jvmToolchain sed. Then `cd artifacts/drag-tree` for expo prebuild.
- `--no-frozen-lockfile` required because catalog: aliases in pnpm-lock.yaml resolve differently in CI.
- `--ignore-scripts` required because postinstall scripts (esbuild) fail in the sandbox.
- **`scandelete: node_modules`** deletes binaries found in node_modules but does NOT remove the directory itself, so `settings.gradle`'s `require.resolve('@react-native/gradle-plugin/...')` still works at Gradle runtime.
- `output:` path is relative to `subdir`. Full path from repo root: `artifacts/drag-tree/android/app/build/outputs/apk/release/app-release-unsigned.apk`.

### Permissions note

AndroidManifest.xml has several permissions added by Expo/RN defaults (INTERNET, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, etc.). These were kept intentionally — removing them risks breaking sensor quality. `HIGH_SAMPLING_RATE_SENSORS` is the only one actively used at runtime.
