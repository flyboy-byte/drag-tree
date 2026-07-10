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

The app targets F-Droid distribution alongside Play Store. MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671 (pipeline passing, awaiting reviewer response on reproducible builds as of July 2026).

- **No Firebase, no GMS** — F-Droid bans them. App is fully offline by design.
- **`android/` is committed** to the repo root as the source of truth for the native project.
- **Tag every release** — F-Droid AutoUpdateMode tracks `git tag` matching `versionName` (e.g. `v1.7.1`). Tags are for auto-update tracking; the fdroiddata `commit:` field should use the **full SHA**, not the tag name.
- **Fastlane metadata** is in `fastlane/metadata/android/en-US/` — update `changelogs/<versionCode>.txt` and `title.txt` each release. Keep `short_description.txt` under 80 characters. `Description:` and `AutoName:` are NOT in the YAML — F-Droid pulls them from fastlane.
- **`subdir`** for fdroiddata YAML: `android/app` (the app module dir — two levels from repo root, not four)
- **GitHub Releases** — `v1.7.1` release exists with `drag-tree-v1.7.1.apk` (EAS-signed). For future releases attach APK as `drag-tree-v<versionName>.apk`. `AllowedAPKSigningKeys: ff739cf5...` is verified against this APK.
- **Reproducible builds** — `Binaries:` field was attempted but byte-comparison fails with EAS builds. Goal for v1.7.2+: local Gradle build (same JDK 21 OpenJDK + NDK 27.1.12297006 as F-Droid sandbox) → sign → upload to GitHub releases → re-add `Binaries:`.

### The expo prebuild decision

**Gap:** If the fdroiddata YAML runs `npx expo prebuild -p android --clean`, it overwrites our committed `android/` with a freshly generated one. Our local builds use the committed `android/`. These are different starting points — harder to byte-match.

**Option A — no expo prebuild in YAML (recommended)**
F-Droid uses our committed `android/` directly. Both local and F-Droid builds start from identical files — strongest setup for byte-matching. Need linsui's sign-off; argument: "`android/` is maintained directly as source of truth, no prebuild needed."

**Option B — keep expo prebuild**
F-Droid regenerates `android/` fresh. Custom signing config additions are wiped (fine, F-Droid uses unsigned builds anyway). Byte comparison harder because starting points differ.

**Try Option A first.** Confirm with linsui before MR update.

### fdroiddata build block — Option A (recommended, no expo prebuild)

MR at https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671 needs updating. YAML for next version:

```yaml
commit: <full SHA of release tag>
subdir: android/app
sudo:
  - apt-get update
  - apt-get install npm
init:
  - cd ../.. && npm install --ignore-scripts
gradle:
  - yes
prebuild:
  - cd ../..
  - sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts
    node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt
  - sed -i -e '/signingConfig /d' android/app/build.gradle
scanignore:
  - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
  - node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
  - node_modules/expo-modules-autolinking/scripts/android/autolinking_implementation.gradle
  - node_modules/@react-native-async-storage/async-storage/android/build.gradle
  - node_modules/react-native-safe-area-context/android/build.gradle
  - node_modules/react-native-keyboard-controller/android/build.gradle
scandelete:
  - node_modules
ndk: 27.1.12297006
```

No `npx expo prebuild`. `cd ../..` from `android/app` reaches repo root (2 levels). `buildFromSource: [".*"]` already in `package.json` — no sed needed.

### fdroiddata build block — Option B (fallback, with expo prebuild)

```yaml
commit: <full SHA of release tag>
subdir: android/app
sudo:
  - apt-get update
  - apt-get install npm
init:
  - cd ../.. && npm install --ignore-scripts
gradle:
  - yes
prebuild:
  - cd ../..
  - sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts
    node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt
  - npx expo prebuild -p android --clean
  - sed -i -e '/signingConfig /d' android/app/build.gradle
scanignore:
  - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
  - node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
  - node_modules/expo-modules-autolinking/scripts/android/autolinking_implementation.gradle
  - node_modules/@react-native-async-storage/async-storage/android/build.gradle
  - node_modules/react-native-safe-area-context/android/build.gradle
  - node_modules/react-native-keyboard-controller/android/build.gradle
scandelete:
  - node_modules
ndk: 27.1.12297006
```

Top-level fields — `Binaries:` goes **after `Repo:`, before `Builds:`** (fdroid rewritemeta enforces this order):
```yaml
RepoType: git
Repo: https://github.com/flyboy-byte/drag-tree
Binaries: https://github.com/flyboy-byte/drag-tree/releases/download/v%v/drag-tree-v%v.apk

Builds:
  - ...

AllowedAPKSigningKeys: ff739cf565d8fe3af4ff97e641f6336fa69ebcf3eec222a7a7c5ab9f8e3d837a
```

Key build environment notes:
- F-Droid sandbox is Debian trixie. `apt-get install npm` gives Node 20 (sufficient for Expo 54).
- `@react-native/gradle-plugin` uses `jvmToolchain(17)` internally. Sed-patch it to 21 — do NOT install JDK 17. Patch runs from repo root where the package is flat in `node_modules/`.
- `buildFromSource: [".*"]` is already in `package.json` — no sed needed.
- `subdir: android/app` — Gradle runs from the app module dir. `cd ../..` from there reaches repo root.
- `--ignore-scripts` required because postinstall scripts (esbuild) fail in the sandbox.
- npm produces flat `node_modules/` by default — no `--config.node-linker=hoisted` needed.
- **`scandelete: node_modules`** deletes binaries found in node_modules but does NOT remove the directory itself, so `settings.gradle`'s `require.resolve('@react-native/gradle-plugin/...')` still works at Gradle runtime.
- `output:` path is relative to `subdir`. Full path from repo root: `android/app/build/outputs/apk/release/app-release-unsigned.apk`.

### If byte comparison still fails

Options in order of effort: (1) Ship with `AllowedAPKSigningKeys` only — no `Binaries:`, key match is still proven. (2) `apktool d` both APKs, diff the trees, identify which files differ — narrow down whether it's `.dex` (JDK mismatch) or `.so` (NDK mismatch). (3) Build inside `debian:trixie` Docker container to exactly replicate the F-Droid sandbox.

### Permissions note

AndroidManifest.xml has several permissions added by Expo/RN defaults (INTERNET, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, etc.). These were kept intentionally — removing them risks breaking sensor quality. `HIGH_SAMPLING_RATE_SENSORS` is the only one actively used at runtime.
