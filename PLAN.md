# PLAN.md — where DragTree goes next

Status: v1.7.4 released (GitHub + F-Droid pipeline passed, waiting on checkupdates bot); Play AAB built, upload parked. Last updated 2026-10-08.

This is the roadmap for the `dev` branch. Releases happen when there's enough here worth shipping — no schedule.

## Decided with the user (do not re-ask)

- **Target audience is everyone with a car who likes this kind of thing — and anyone who just wants a reaction game.** Racers are a small group; using a phone to practice a drag launch is a narrow niche. The game angle (beat your time, beat your friend) is a real audience on its own. Design and copy for normal people first; racer-grade precision is a credibility bonus, not the pitch. The sensor launch works on the street too — never frame it as track-only. (Corrected by Logan 2026-10-08 after two wrong framings — do not re-ask.)
- **No online anything.** No accounts, leaderboards, sync, analytics. Keeps the open-source / F-Droid vibe (also a workspace-wide scope fence).
- **Android first.** iOS is not a goal. If an iOS or web build falls out cheaply, fine; never spend real effort on it.
- **Play production access is parked** until Logan finds a better tester group. Not a dev-branch concern. AAB for 1.7.4 is at `~/dragtree-fdroid-build/play-v1.7.4/out/`.
- **New modes are settings, off by default.** The default experience stays as it is.

## Before merging dev → main (gates)

1. **Reviewer findings reconciled.** #1, #2, #4 fixed in v1.7.4. #3 (title wrap) fixed on dev: badges incl. settings are icon-only; title fits with all four badges at 360 dp (web render 2026-10-08), truncates only below ~350 dp.
2. **Works across Android phones, best practice:** small screens (360 dp), large font scale, 60/90/120 Hz displays, phones whose sensor can't do 125 Hz, phones without a motion sensor (tap-only must work end to end), Android versions down to minSdk. Every new mode must degrade cleanly when a capability is missing.
3. **v1.7.4 confirmed live on f-droid.org via the checkupdates bot** — proves the auto-update path before shipping the next one.
4. Logan's on-phone test pass (hold-to-launch, two-player multitouch).

## Already on dev

- 98b2733 — icon-only ACCEL / FLOOR IT badges so the title fits on narrow screens (reviewer finding #3). **Not visually verified at 393 dp yet.**

## Ideas, scoped

All six are scaffolded on `dev` (2026-10-08): pure logic in `lib/` with tests in `__tests__/scaffold.test.ts`, nothing wired into the existing UI yet, no native or dependency changes — so none of it affects the F-Droid build until a feature is wired in.

Each one stands alone; pick any order. Sizes are effort estimates, not rankings — the user rated all of these as good ideas worth building (2026-10-08). The bigger ones (web build, two-player, volume-key launch) are the ones most likely to grow the audience.

### 1. Consistency stats — small, do first

Repeatability is the hook for anyone chasing a better time, not just racers.

- Std deviation of RT over the visible history / current series.
- "% within ±0.020 s" (or a target window) and the current streak of good lights.
- Lives in the existing history/series stats area; no new screens.
- Pure JS on top of `RunRecord` history. No native changes → no F-Droid risk.

**Scaffold:** `lib/consistency.ts` (`computeConsistency` — mean, std dev, % within ±20 ms, streak; tested). **Next:** render it in the history/series stats area on the home screen.

### 2. Latency check — small/medium

Makes the numbers credible: shows how much of the RT is the phone, not the driver.

- Sensor: measured sample rate and jitter (actual Hz vs 125 Hz target). The diagnostic screen already has the raw data; this is a summary line.
- Display: time from setting green to the frame being painted (rAF timestamps already used for `greenAtRef`).
- Touch: optional tap test (tap in time with a steady flash, report mean offset) — this measures touch latency + human, so label it as an estimate.
- Shown in Settings/diagnostics, not on the home screen. No native changes.

**Scaffold:** `lib/latency.ts` (`sampleRateStats`, `displayDelayMs`, `tapOffsetMs`; tested). **Next:** have `useAccelerometer` keep the last ~250 sample timestamps for diagnostics; show a "Phone latency" section in `diagnostic.tsx`; tap test screen.

### 3. Calibrate against a time slip — medium

- After a real run, user can enter the RT from their slip next to the app's RT.
- App keeps the pairs and shows the average offset ("DragTree reads 0.03 s faster than your slip").
- Optional: apply the offset to displayed RTs (setting, off by default; raw values stay in history).
- Pairs live in their own store (`dragtree.slipCal.v1`), so run history doesn't change format.
- Caveat to state in the UI: track RT is measured at the stage beam (rollout), the app measures acceleration onset, so the offset depends on the car and staging depth. That's the point of calibrating, but don't promise a match.

**Scaffold:** `lib/slipCalibration.ts` (pub/sub store under its own key `dragtree.slipCal.v1`, so history needs **no** v2 migration; `averageOffset`, `applyOffset`, `isValidSlipRT`; tested). **Next:** "Add slip RT" entry on a run in history; offset summary + clear in Settings; optional apply-offset setting.

### 4. Hold-and-release launch mode — medium (setting)

Closer to a real launch: hold, release on green (like a trans-brake button).

- **On-screen version (easy):** press and hold the button during staging; releasing early = red light; RT = release time. Pure JS.
- **Physical button version (harder):** volume key as the hold button. Expo has no volume-key listener, so this needs a native module (e.g. a small Expo module or `react-native-keyevent`). Consequences:
  - New native code → touches the F-Droid recipe (scanignore, repro). Treat as its own release with a full two-run check; don't combine with other native changes.
  - Volume keys also change volume unless the event is consumed — must test.
- The physical button is the real prize — it's what makes this feel like a trans-brake. The on-screen version can ship first as a stepping stone, since it's pure JS and proves the mode before the native work.

**Scaffold:** `lib/holdRelease.ts` (pure press/release → armed / red light / launch decisions; tested) and `lib/hardwareKeys.ts` (interface for the volume key; returns `null` until the native module exists). **Next:** `launchStyle` setting (`auto` | `hold`), wire the on-screen button's `onPressIn`/`onPressOut` through `holdDecision` in the session; then the native key module as its own release.

### 5. Web build on GitHub Pages — small

- `npx expo export -p web` → static files → GitHub Pages (Actions workflow on tag, or manual).
- FLOOR IT / tap mode works everywhere. Accelerometer in a mobile browser is `DeviceMotionEvent` — Android Chrome generally works; iOS Safari needs a permission prompt (INFERRED; check before promising it).
- Low overhead, and the easiest way to reach people: a link someone can open from a forum post or group chat with no install. Also the cheapest "iPhone" path.
- Check: audio (WAV data URIs via expo-av) and `performance.now()` timing on web.

**Scaffold:** `.github/workflows/pages.yml` — manual-run workflow; patches `baseUrl: /drag-tree` into app.json in CI only (committed config and F-Droid prebuild untouched). `npx expo export -p web` verified locally 2026-10-08 (1.6 MB bundle). **Next:** one-time Settings → Pages → Source: GitHub Actions, run the workflow, then test sensor/audio/timing in mobile Chrome.

### 6. Two-player split screen — large

Big addition, and a strong one: offline head-to-head turns the app from solo practice into something people pass around at the track or in the garage. No network needed — two people, one phone.

- Phone flat between two people, screen split, each half mirrored with its own tree and button. Same tree start for both; each player's RT graded separately; winner = better light (red light loses).
- Tap-only — the accelerometer can't tell two players apart, so sensor launch is disabled in this mode.
- Needs: a second session state (or a two-lane state machine), a new screen/route, multitouch handling (two simultaneous taps — RN Pressable is fine, but verify no dropped touches), rotated layout for the far player.
- Results don't go into the personal history/best (or go into a separate head-to-head tally).
- Open question: one shared tree in the middle vs one per half.

**Scaffold:** `lib/versus.ts` (`decideWinner` — red light loses, earlier of two reds loses, no-show loses, same-to-the-ms tie; `VersusTally`; tested) and `app/versus.tsx` (two-lane layout, top lane rotated; route registered, not linked from the app). **Next:** two-lane session state sharing one tree, per-lane tap capture, result + tally display, entry point from home.

## Out of scope

- Anything online (see above).
- Re-adding Reanimated / gesture-handler without updating the F-Droid scanignore (see CLAUDE.md invariants).
- iOS-specific work.

## Release hygiene reminder

Every release follows `fdroid/README.md` → "Releasing an update". Changelogs go in `changelogs/<10*code+1..4>.txt`. Native-dependency changes (idea 4b) get their own release.
