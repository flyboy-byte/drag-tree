# DragTree — AI Handoff System Prompt

> **Purpose:** This file gives an AI coding assistant full context to continue
> development on DragTree without any prior conversation history. Read it before
> touching anything else in the repo.

---

## Project Identity

| Field | Value |
|---|---|
| App name | DragTree |
| Package | `com.flyboybyte.dragtree` |
| Repo | `flyboy-byte/drag-tree` (MIT, public) |
| Platform | Android-only (also runnable in browser for dev/practice) |
| Distribution | Google Play — Closed Testing (AAB via EAS) |
| Current version | v1.4.0 / versionCode 8 |
| User philosophy | Minimal, plain feel. Subtle hints only, no nagging, no ads, no accounts |

---

## What DragTree Does

DragTree simulates a real **NHRA Christmas Tree** (drag strip starting lights) and
uses the phone's accelerometer to measure the driver's reaction time. The user
mounts the phone on the dash, stages up, watches the tree sequence, then floors
the gas. The app detects the launch G-force and records reaction time to the
millisecond — no tapping required when the sensor is enabled.

**Tree modes:**
- **Pro Tree** (`.400 s`) — all three ambers fire simultaneously, green follows
  0.400 s later. Default.
- **Full/Sportsman Tree** (`.500 s`) — ambers count down one at a time, green
  follows 0.500 s after the last amber.

**Reaction grade thresholds:**

| Grade | Range |
|---|---|
| `perfect` | 0 – 0.049 s |
| `pro` | 0.050 – 0.099 s |
| `great` | 0.100 – 0.199 s |
| `good` | 0.200 – 0.349 s |
| `late` | > 0.349 s |
| `redlight` | < 0 s (launched before green) |

---

## Monorepo Structure

```
drag-tree/                          ← repo root
├── artifacts/
│   ├── drag-tree/                  ← THE MAIN APP (everything lives here)
│   │   ├── app/
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx       ← Home screen (tree, button, history)
│   │   │   │   └── _layout.tsx     ← Tab layout (tab bar hidden)
│   │   │   ├── diagnostic.tsx      ← Diagnostics screen (sensor data, settings)
│   │   │   ├── _layout.tsx         ← Root layout (fonts, theme, error boundary)
│   │   │   └── +not-found.tsx
│   │   ├── components/
│   │   │   ├── ChristmasTree.tsx   ← Animated tree lights component
│   │   │   ├── TreeLight.tsx       ← Individual light bulb
│   │   │   ├── ReactionDisplay.tsx ← Shows RT + grade after a run
│   │   │   ├── HistoryList.tsx     ← Run history list
│   │   │   ├── FooterLinks.tsx     ← Version string, privacy, source links
│   │   │   ├── KeyboardAwareScrollViewCompat.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── ErrorFallback.tsx
│   │   ├── constants/
│   │   │   └── colors.ts           ← All color tokens (light + dark)
│   │   ├── hooks/
│   │   │   ├── useAccelerometer.ts ← Sensor subscription + simulation
│   │   │   ├── useTreeSession.ts   ← Session state machine + history
│   │   │   └── useColors.ts        ← Theme-aware color hook
│   │   ├── lib/
│   │   │   ├── settings.ts         ← Pub/sub settings store (AsyncStorage)
│   │   │   ├── sessionLock.ts      ← Pub/sub session lock (separate store)
│   │   │   ├── launchTelemetry.ts  ← Pub/sub last-launch telemetry store
│   │   │   └── coaching.ts         ← Coaching messages by grade
│   │   ├── app.json                ← Expo config (version, versionCode, plugins)
│   │   ├── eas.json                ← EAS build profiles
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── api-server/                 ← Express API (minimal — health check only)
├── lib/
│   └── db/                         ← PostgreSQL + Drizzle ORM (wired, not yet used)
├── scripts/                        ← Utility scripts
├── pnpm-workspace.yaml
└── package.json                    ← Root — tooling only (tsc, prettier, eslint)
```

---

## Dev Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54, managed workflow |
| Navigation | Expo Router v6 |
| Language | TypeScript (strict) |
| React Native | 0.81.5 |
| Animations | Reanimated 4.1.1 |
| Sensor | Expo Sensors — `DeviceMotion` (accelerometer) |
| Persistence | `@react-native-async-storage/async-storage` 2.2.0 |
| Haptics | `expo-haptics` |
| External links | `expo-web-browser` |
| Fonts | `@expo-google-fonts/inter` |
| Monorepo | pnpm workspaces, Node 24 |
| Build | EAS Build (Expo Application Services) |
| State | Hand-rolled pub/sub stores — no Redux, no Zustand, no Context |
| Backend | Express 5 (health check only — not exercised by app) |
| DB (unused) | PostgreSQL + Drizzle ORM (wired in `lib/db`, no routes yet) |

**No `expo-build-properties` installed** — x86/x86_64 ABI filter not yet added
(EAS builds all 4 ABIs; Play Store handles splitting automatically for users).

---

## EAS Build Profiles (`eas.json`)

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "local" },
  "build": {
    "preview":    { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "android": { "buildType": "apk" } },
    "play":       { "android": { "buildType": "app-bundle" }, "autoIncrement": true }
  }
}
```

- **`play`** is the profile used for Closed Testing submissions. It auto-increments
  `versionCode` and produces an AAB.
- **`preview`** produces an APK for sideloading to real devices during testing.
- **`production`** is legacy/unused.

To build: `eas build --profile play --platform android`

---

## State Architecture

### Pub/Sub Stores (in `lib/`)

All shared state uses a tiny hand-rolled pub/sub pattern:
`{ get(), set(patch), subscribe(fn) }` — compatible with React's
`useSyncExternalStore`.

**`lib/settings.ts`** — User preferences. Persisted to AsyncStorage
(`STORAGE_KEY = "dragtree.settings.v1"`). Loaded async on module init;
notifies subscribers once the saved values are applied. `persist()` is
debounced 250 ms to coalesce rapid stepper taps.

Fields:
```ts
interface AppSettings {
  showFloorIt: boolean;       // Show on-screen FLOOR IT / RED LIGHT button
  sensitivity: "gentle" | "normal" | "hard" | "custom";
  customThreshold: number;    // m/s² — only used when sensitivity === "custom"
  sensorEnabled: boolean;     // Arm accelerometer for auto-detection
  treeMode: "pro" | "full";
}
```
Default: `{ showFloorIt: false, sensitivity: "normal", customThreshold: 2.0, sensorEnabled: true, treeMode: "pro" }`

**`lib/sessionLock.ts`** — Boolean flag: `true` while a run is active.
Kept separate from `settings.ts` so that home-screen phase transitions
(which write `sessionLocked`) don't trigger a settings re-render on the
home screen. The diagnostics screen reads this; the home screen only writes it.

**`lib/launchTelemetry.ts`** — Last real-sensor launch breakdown
(onset → threshold → confirm times, peak G, sample interval mean). Written
by the home screen's `onLaunchTelemetry` callback; read by `diagnostic.tsx`.

### Session State Machine (`hooks/useTreeSession.ts`)

Phases:
```
idle → staging → countdown → go → result
                           ↘ redlight
      (any phase) → idle  (via reset())
```

Key refs (avoid stale closures + prevent unnecessary re-renders):
- `phaseRef` — mirrors `phase` state; guards `triggerLaunch` / `triggerRedLight`
  against double-fire
- `modeRef` — mirrors `mode`
- `greenAtRef` — `performance.now()` timestamp of green light
- `hydratedRef` — gate to prevent first-render empty state clobbering AsyncStorage

Persistence:
- Run history: `"dragtree.history.v1"` (last 30 records)
- Best time: `"dragtree.bestTime.v1"`
- Both gated on `hydratedRef.current === true` in their `useEffect`s

### Accelerometer (`hooks/useAccelerometer.ts`)

Key design decisions:
- **Stable callback refs** — `onLaunch`, `onRedLight`, `onLaunchTelemetry` are
  stored in refs updated each render. The DeviceMotion subscription effect never
  needs to re-subscribe just because the parent re-rendered (which happens at
  ~125 Hz from `setCurrentG`). Without this, the sub would teardown/recreate
  125×/s, creating tiny gaps in coverage.
- **`firedRef`** — set to `true` on first fire; prevents double-fire if both
  sensor and FLOOR IT button race. Reset via `resetDetection()` on
  `[armed, watchForRedLight]` effect.
- **`simulateLaunch` / `simulateRedLight`** — instant, no animation delay.
  `firedRef.current = true; onLaunchRef.current(performance.now())`. The old
  `runSimulation` with a 122 ms delay was removed in v1.4.0.
- **`resetDetection()`** resets: `firedRef`, `sustainedRef`, `thresholdTimeRef`,
  `bufferRef`, `lastSampleTRef`, `intervalSumRef`, `intervalCountRef`, `peakMagRef`.
  It does NOT reset `sensorOffsetRef` (calibration held for the app session).

Sensor logic flow (real launch detection):
1. Collect DeviceMotion samples into a rolling buffer
2. When magnitude exceeds threshold, start sustain timer
3. After sustain is confirmed, fire `onLaunch(onsetTime)` and emit telemetry
4. `watchForRedLight=true` during staging/countdown: if sensor fires before green,
   call `onRedLight()`

---

## Home Screen (`app/(tabs)/index.tsx`)

Key logic:
```ts
const sensorActive  = isAvailable && sensorEnabled;
const useSimulation = !sensorActive || showFloorIt;
```

Button routing (`onMainPress`):
- `idle` → `startSequence()`
- `result` | `redlight` → `reset()`
- `go` + `useSimulation` → `simulateLaunch()`
- `staging` | `countdown` + `useSimulation` → `simulateRedLight()`
- `go` | `staging` | `countdown` + `!useSimulation` → button disabled ("ARMED")

Session lock effect:
```ts
React.useEffect(() => {
  sessionLock.set(isActive);
  return () => { sessionLock.set(false); };
}, [isActive]);
```
This write never triggers a home-screen re-render because the home screen
does not subscribe to `sessionLock`.

---

## Diagnostics Screen (`app/diagnostic.tsx`)

Developer screen showing:
- Live G-force reading
- Last launch breakdown: greenAt → onset → threshold → confirm (ms)
- Current settings values
- Sensitivity threshold in use
- Session lock status
- Sensor availability

Reads from: `launchTelemetry`, `settings`, `sessionLock` (all via `useSyncExternalStore`).

---

## Sensitivity Thresholds (`hooks/useAccelerometer.ts`)

```ts
export const SENSITIVITY_THRESHOLDS = {
  gentle: 1.2,   // m/s²
  normal: 2.0,
  hard:   3.5,
};
```
Custom threshold is set via a numeric stepper in settings; range clamped to
`[0.8, 6.0]` on load from storage.

---

## AsyncStorage Keys

| Key | Content |
|---|---|
| `"dragtree.settings.v1"` | User preferences (showFloorIt, sensitivity, customThreshold, sensorEnabled, treeMode) |
| `"dragtree.history.v1"` | Array of last 30 `RunRecord` objects |
| `"dragtree.bestTime.v1"` | Best reaction time as a string (parsed to float) |

To migrate incompatibly: bump the `.v1` suffix to `.v2` and handle the old key
in the hydration IIFE.

---

## Version History (Abbreviated)

### v1.4.0 / versionCode 8 (May 2026)
- Removed 122 ms simulation delay (`runSimulation` → instant `simulateLaunch` /
  `simulateRedLight`)
- Extracted `sessionLocked` out of `AppSettings` into separate `lib/sessionLock.ts`
  pub/sub store — phase transitions no longer trigger home screen settings re-renders
- Removed dead `simTimerRef` (leftover from removed `runSimulation`)
- Removed unused `handleManualLaunch` from home screen destructuring
- Added 250 ms debounce to `persist()` in `settings.ts`
- Completed 3-pass button lag audit — zero artificial delays in any settings combination

### v1.3.0 / versionCode 7
- Added AsyncStorage persistence to settings store
  (sensitivity, treeMode, sensorEnabled, showFloorIt, customThreshold)
- Fixed SET badge clipping (`appTitle flex:1`, badges `flexShrink:0`)
- Fixed FLOOR IT silent fail on 2nd+ run when sensor disabled
  (`firedRef` was stuck `true` because `armed`/`watchForRedLight` never changed,
  so `resetDetection()` never fired)

### v1.2.x and earlier
- Initial releases — core tree sequence, accelerometer detection, reaction grading,
  run history, diagnostics screen, Pro/Full tree modes, sensitivity presets

---

## Common Commands

```bash
# Run in browser (dev/web mode)
cd artifacts/drag-tree && pnpm web

# Typecheck
cd artifacts/drag-tree && npx tsc --noEmit

# Full monorepo typecheck
pnpm run typecheck

# EAS build for Play Store (Closed Testing)
eas build --profile play --platform android

# EAS build for internal APK
eas build --profile preview --platform android
```

> **Do not run `pnpm run dev` at the workspace root** — there is no root dev script.
> Use `pnpm web` from inside `artifacts/drag-tree` for local development.
> Do not use `npx expo start` — use `pnpm web` to ensure the correct Expo 54 version.

---

## Things to Know Before Changing Anything

1. **GitHub is the source of truth for `app.json`.** The local `app.json` may lag
   behind. Always read from GitHub first, patch version fields, then push back.
   Never push local `app.json` verbatim — it may be missing `projectId`/`owner`.

2. **GitHub push pattern used in this repo:** Python `urllib` + `GITHUB_TOKEN`
   environment variable, GitHub Contents API `PUT` with sha lookup. No `git`
   commands needed.

3. **`sessionLocked` does NOT live in `AppSettings`.** It lives exclusively in
   `lib/sessionLock.ts`. If you see old references to `appSettings.sessionLocked`,
   they are stale bugs.

4. **The home screen does not subscribe to `sessionLock`.** It only writes to it.
   Only `diagnostic.tsx` subscribes to read it. This is intentional to prevent
   re-renders.

5. **`persist()` is debounced 250 ms.** Rapid calls to `settings.set()` (e.g. a
   stepper) will coalesce into one AsyncStorage write 250 ms after the last tap.

6. **No Redux, no Zustand, no React Context for global state.** All global state
   is hand-rolled pub/sub. Keep it that way.

7. **Reanimated 4 syntax** — use `useSharedValue`, `useAnimatedStyle`,
   `withTiming`, `withRepeat`, `withSequence` from `react-native-reanimated`.
   Do not use the v2/v3 `useAnimatedGestureHandler` API.

8. **User tone:** minimal, plain, no nagging. When adding any user-visible text
   (coaching, labels, hints), keep it short and non-pushy.

9. **Pending work noted:** "Improve launch sensing precision" — tightening the
   accelerometer detection algorithm (onset confirmation window, buffer tuning).

---

*Last updated: May 2026 — v1.4.0 / versionCode 8*
