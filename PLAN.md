# PLAN.md — where DragTree goes next

Status: v1.7.4 released (GitHub + F-Droid pipeline passed, waiting on checkupdates bot); Play AAB built, upload parked. Last updated 2026-10-08.

This is the roadmap for the `dev` branch. Releases happen when there's enough here worth shipping — no schedule.

## Decided with the user (do not re-ask)

- **Audience is normal people, street included.** Don't frame the sensor launch as track/private-property only. Write copy and features for someone practicing in their own car wherever they drive.
- **No online anything.** No accounts, leaderboards, sync, analytics. Keeps the open-source / F-Droid vibe (also a workspace-wide scope fence).
- **Android first.** iOS is not a goal. If an iOS or web build falls out cheaply, fine; never spend real effort on it.
- **Play production access is parked** until Logan finds a better tester group. Not a dev-branch concern. AAB for 1.7.4 is at `~/dragtree-fdroid-build/play-v1.7.4/out/`.
- **New modes are settings, off by default.** The default experience stays as it is.

## Already on dev

- 98b2733 — icon-only ACCEL / FLOOR IT badges so the title fits on narrow screens (reviewer finding #3). **Not visually verified at 393 dp yet.**

## Ideas, scoped

Each one stands alone; pick any order.

### 1. Consistency stats — small, do first

Racers care about repeatability more than one best light.

- Std deviation of RT over the visible history / current series.
- "% within ±0.020 s" (or a target window) and the current streak of good lights.
- Lives in the existing history/series stats area; no new screens.
- Pure JS on top of `RunRecord` history. No native changes → no F-Droid risk.

### 2. Latency check — small/medium

Makes the numbers credible: shows how much of the RT is the phone, not the driver.

- Sensor: measured sample rate and jitter (actual Hz vs 125 Hz target). The diagnostic screen already has the raw data; this is a summary line.
- Display: time from setting green to the frame being painted (rAF timestamps already used for `greenAtRef`).
- Touch: optional tap test (tap in time with a steady flash, report mean offset) — this measures touch latency + human, so label it as an estimate.
- Shown in Settings/diagnostics, not on the home screen. No native changes.

### 3. Calibrate against a time slip — medium

- After a real run, user can enter the RT from their slip next to the app's RT.
- App keeps the pairs and shows the average offset ("DragTree reads 0.03 s faster than your slip").
- Optional: apply the offset to displayed RTs (setting, off by default; raw values stay in history).
- Needs a history format change → bump `dragtree.history.v1` → `v2` with migration in the hydration IIFE.
- Caveat to state in the UI: track RT is measured at the stage beam (rollout), the app measures acceleration onset, so the offset depends on the car and staging depth. That's the point of calibrating, but don't promise a match.

### 4. Hold-and-release launch mode — medium (setting)

Closer to a real launch: hold, release on green (like a trans-brake button).

- **On-screen version (easy):** press and hold the button during staging; releasing early = red light; RT = release time. Pure JS.
- **Physical button version (harder):** volume key as the hold button. Expo has no volume-key listener, so this needs a native module (e.g. a small Expo module or `react-native-keyevent`). Consequences:
  - New native code → touches the F-Droid recipe (scanignore, repro). Treat as its own release with a full two-run check; don't combine with other native changes.
  - Volume keys also change volume unless the event is consumed — must test.
- Ship the on-screen version first; physical button as a follow-up if it's still wanted.

### 5. Web build on GitHub Pages — small

- `npx expo export -p web` → static files → GitHub Pages (Actions workflow on tag, or manual).
- FLOOR IT / tap mode works everywhere. Accelerometer in a mobile browser is `DeviceMotionEvent` — Android Chrome generally works; iOS Safari needs a permission prompt (INFERRED; check before promising it).
- Low overhead and a good way for people to try it before installing. Also the cheapest "iPhone" path.
- Check: audio (WAV data URIs via expo-av) and `performance.now()` timing on web.

### 6. Two-player split screen — large

Big addition; scoped here, not planned for the next release.

- Phone flat between two people, screen split, each half mirrored with its own tree and button. Same tree start for both; each player's RT graded separately; winner = better light (red light loses).
- Tap-only — the accelerometer can't tell two players apart, so sensor launch is disabled in this mode.
- Needs: a second session state (or a two-lane state machine), a new screen/route, multitouch handling (two simultaneous taps — RN Pressable is fine, but verify no dropped touches), rotated layout for the far player.
- Results don't go into the personal history/best (or go into a separate head-to-head tally).
- Open question: one shared tree in the middle vs one per half.

## Out of scope

- Anything online (see above).
- Re-adding Reanimated / gesture-handler without updating the F-Droid scanignore (see CLAUDE.md invariants).
- iOS-specific work.

## Release hygiene reminder

Every release follows `fdroid/README.md` → "Releasing an update". Changelogs go in `changelogs/<10*code+1..4>.txt`. Native-dependency changes (idea 4b) get their own release.
