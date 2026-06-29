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

**Do not use `npx expo start`** — always use `pnpm web` to ensure Expo 54 is used, not whatever npx downloads.

**Do not run `pnpm run dev` at the workspace root** — there is no root dev script.

---

## Architecture

### Monorepo layout

```
drag-tree/                     ← repo root (tooling only)
├── artifacts/drag-tree/       ← THE main app (all feature work lives here)
│   ├── app/
│   │   ├── (tabs)/index.tsx   ← Home screen (tree, button, history)
│   │   └── diagnostic.tsx     ← Dev screen (sensor data, settings, telemetry)
│   ├── components/            ← ChristmasTree, ReactionDisplay, HistoryList, etc.
│   ├── hooks/
│   │   ├── useTreeSession.ts  ← Session state machine + history persistence
│   │   └── useAccelerometer.ts← Sensor subscription, sustain gate, onset rewind
│   ├── lib/
│   │   ├── settings.ts        ← Pub/sub settings store (AsyncStorage-backed)
│   │   ├── sessionLock.ts     ← Pub/sub boolean (written by home, read by diag)
│   │   ├── launchTelemetry.ts ← Pub/sub last-launch sensor breakdown
│   │   └── audio.ts           ← Synthesized WAV audio cues (expo-av)
│   └── constants/colors.ts    ← All color tokens (light + dark)
├── lib/db/                    ← PostgreSQL + Drizzle ORM (wired but unused)
└── artifacts/api-server/      ← Express health-check only (not used by app)
```

### State architecture

All global state uses a hand-rolled pub/sub pattern — no Redux, no Zustand, no React Context. Keep it that way.

**`lib/settings.ts`** — User preferences, persisted to `"dragtree.settings.v1"` in AsyncStorage. `persist()` is debounced 250 ms to coalesce rapid stepper taps.

**`lib/sessionLock.ts`** — Boolean `true` while a run is active. Kept separate from settings so home-screen phase transitions don't trigger a settings re-render. The home screen only **writes** to it; `diagnostic.tsx` **reads** it.

**`lib/launchTelemetry.ts`** — Last real-sensor launch breakdown (onset → threshold → confirm times, peak G). Written via `onLaunchTelemetry` in home screen; read in `diagnostic.tsx`.

### Session state machine (`useTreeSession.ts`)

```
idle → staging → countdown → go → result
                           ↘ redlight
(any) → idle  (via reset())
```

Key refs guard against stale closures and prevent unnecessary re-renders:
- `phaseRef` — mirrors `phase`; guards `triggerLaunch`/`triggerRedLight` against double-fire
- `greenAtRef` — `performance.now()` timestamp of green light (set at paint time via rAF, not at state-set time)
- `hydratedRef` — prevents first-render empty state from clobbering AsyncStorage

**AsyncStorage keys:**
- `"dragtree.history.v1"` — last 30 `RunRecord` objects
- `"dragtree.bestTime.v1"` — best RT as string

To migrate incompatibly: bump `.v1` → `.v2` and handle the old key in the hydration IIFE.

### Accelerometer (`useAccelerometer.ts`)

Sensor: `DeviceMotion` from `expo-sensors` at 8 ms intervals (125 Hz target). Uses `DeviceMotion.acceleration` which provides linear acceleration (gravity already removed by Android sensor fusion).

Detection flow:
1. Each sample pushed into a 24-sample rolling buffer
2. When magnitude ≥ threshold for `SUSTAINED_SAMPLES` (5) consecutive samples (~40 ms), fire
3. On fire: walk back through buffer via slope analysis to find the **jerk-onset timestamp** — RT is reported from onset, not from confirmation, so it accurately reflects when the car actually moved
4. `watchForRedLight=true` during staging/countdown: fire → `onRedLight()` instead

**Critical design:** `onLaunch`, `onRedLight`, `onLaunchTelemetry` are stored in refs updated each render. Without this, the DeviceMotion subscription would teardown/recreate 125×/s (each `setCurrentG` call triggers a re-render). `firedRef` prevents double-fire between sensor and FLOOR IT button.

### Home screen button logic

```ts
const sensorActive  = isAvailable && sensorEnabled;
const useSimulation = !sensorActive || showFloorIt;
```

When sensor is active and FLOOR IT is off, the button shows "ARMED" and is disabled during active phases — the sensor fires automatically.

### Audio (`lib/audio.ts`)

All sounds are 16-bit PCM WAV data URIs generated at runtime — no bundled asset files. Lazy-initialized on first play via `ensureReady()`. Each function no-ops if `settings.get().soundEnabled === false`.

Green chirp fires **only when sensor is inactive** (`useSimulation` mode) to avoid masking the physical launch event.

---

## Key invariants

1. **`sessionLocked` does NOT live in `AppSettings`** — it's in `lib/sessionLock.ts` only. Any reference to `appSettings.sessionLocked` is a stale bug.

2. **`app.json` in the repo may lag behind the GitHub-pushed version** (which has `projectId`/`owner` from EAS init). Never overwrite GitHub's `app.json` with the local one verbatim.

3. **Reanimated 4 syntax** — use `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withRepeat`, `withSequence`. Do not use v2/v3 `useAnimatedGestureHandler`.

4. **User tone: minimal, plain, no nagging.** Any user-visible text (labels, hints, coaching) must be short and non-pushy.

5. **`persist()` is debounced 250 ms.** Rapid `settings.set()` calls coalesce into one write.

6. **`pnpm install` must run from repo root**, not from `artifacts/drag-tree`. Running it from the wrong directory causes `Unable to resolve module` build failures.
