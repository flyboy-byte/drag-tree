# PLAN.md — where DragTree goes next

Status (2026-10-08): **stable v1.7.4** released on GitHub; F-Droid pipeline passed, waiting on the checkupdates bot (f-droid.org still shows 1.7.3 as of 2026-10-08 evening). **Beta v1.8.0-beta.1** published as a GitHub pre-release from `dev` @ 067c319 — waiting on Logan's phone test. Play AAB for 1.7.4 built, upload parked. Round-1 phone feedback addressed on dev (see checklist). Last updated 2026-10-08.

This is the roadmap for the `dev` branch. Releases happen when there's enough here worth shipping — no schedule.

## Decided with the user (do not re-ask)

- **Target audience is everyone with a car who likes this kind of thing — and anyone who just wants a reaction game.** Racers are a small group; using a phone to practice a drag launch is a narrow niche. The game angle (beat your time, beat your friend) is a real audience on its own. Design and copy for normal people first; racer-grade precision is a credibility bonus, not the pitch. The sensor launch works on the street too — never frame it as track-only. (Corrected by Logan 2026-10-08 after two wrong framings — do not re-ask.)
- **No online anything.** No accounts, leaderboards, sync, analytics. Keeps the open-source / F-Droid vibe (also a workspace-wide scope fence).
- **Android first.** iOS is not a goal. If an iOS or web build falls out cheaply, fine; never spend real effort on it.
- **Play production access is parked** until Logan finds a better tester group. Not a dev-branch concern. AAB for 1.7.4 is at `~/dragtree-fdroid-build/play-v1.7.4/out/`.
- **New modes are settings, off by default.** The default experience stays as it is.

## Beta v1.8.0-beta.1 (GitHub pre-release, 2026-10-08)

- https://github.com/flyboy-byte/drag-tree/releases/tag/v1.8.0-beta.1 — universal APK, signed ff739cf5…, **versionCode 175**, versionName 1.8.0-beta.1. Permissions same as 1.7.4 (no INTERNET).
- Version set **only in the build clone** (`~/dragtree-fdroid-build/beta-1.8.0-beta.1/src`), never committed: committed `android/app/build.gradle` stays 17/1.7.4, so F-Droid checkupdates (UpdateCheckMode: Tags) sees nothing new at the beta tag. **Keep it that way for every beta.**
- Why 175: above everything shipped (F-Droid 171–174, Play 170) and below the next stable (Play 180, F-Droid 181–184), so beta users upgrade to stable normally. Next beta → 176, etc. (max 179).
- Build recipe: fresh clone of dev → edit app.json version/versionCode → `npm ci --ignore-scripts --legacy-peer-deps` → `npx expo prebuild -p android --clean --no-install` → `sdk.dir` in android/local.properties → `./gradlew assembleRelease --max-workers=2 -Dorg.gradle.parallel=false` → strip META-INF sigs → zipalign -p 4 → apksigner with release key → verify cert. **Android SDK was deleted 2026-10-08 to free disk — reinstall first.**

### Logan's test checklist (feedback goes here)

- [ ] Installs over the current app, history and best time intact
- [ ] Header: title not cut off with sensor + FLOOR IT both on
- [ ] Consistency strip shows after 3 clean runs; numbers look sane
- [ ] Settings → Phone latency: timing check (screen Hz, sensor Hz) and tap test
- [ ] Time slip: tap a run in History, number keyboard, save, "· SLIP" tag, Settings average, "≈ X on your slip" after 2
- [ ] Hold to Launch: hold through tree, release on green; early release = red light; thumb drift doesn't count; hold through timeout = late
- [ ] 2 Player: two thumbs at the same time both count; far side reads upright; red light loses; score; back button
- [ ] Sensor launch still works as before (regression)
- [ ] Anything confusing, ugly, or too wordy

Feedback, round 1 (Pixel 9, 2026-10-08):
- ~~Cold start draws the screen under the status bar ("slightly scrolled")~~ — FIXED on dev: `SafeAreaProvider initialMetrics={initialWindowMetrics}` so real insets exist on the first frame.
- ~~2 PLAYER needs a scroll to reach~~ — FIXED: moved beside the PRO TREE pill at the top. Tree lights now scale with screen height (48 → min 30 dp) so header→button hint fits without scrolling on ~384×854 and taller. Still scrolls on very short screens (≤ ~360×740 with large insets).
- ~~Settings: "ARM 5s CAPTURE" means nothing to a normal user~~ — FIXED: now an **ACCELEROMETER TEST** card ("START TEST · 5 s capture") placed right under Sensor Sensitivity, with plain-language purpose, a background-noise reading (strongest sustained level, `lib/sensorNoise.ts`) and a suggested sensitivity with a one-tap USE button.
- ~~Settings ordering~~ — now LAUNCH (sensor, sensitivity, FLOOR IT, hold) → ACCELEROMETER TEST → TREE & DISPLAY (sportsman, sound, series, trend) → Time slip → Phone latency → SENSOR DETAILS (last launch, raw capture stats).
- Sound on all Androids: sounds now preload when the home screen opens (first green beep no longer waits on the player), audio init failures retry instead of staying dead, Settings text corrected (Android plays at media volume; it was claiming silent-mode behaviour that's iOS-only).
- Also fixed while there: history tiles said "GOO"/"GRE" (3-letter cut) → full grade word; tree center stripe sat off-center on Android.
- **Observed, not yet acted on:** Pixel 9 "Last real launch" shows 61 Hz sensor rate (16.4 ms) against an 8 ms / 125 Hz target, on the JS path. Worth checking whether expo-sensors' DeviceMotion is frame-limited on Android before 1.8.0 — it directly limits timing precision.

## Before merging dev → main (gates)

1. **Reviewer findings reconciled.** #1, #2, #4 fixed in v1.7.4. #3 (title wrap) fixed on dev: badges incl. settings are icon-only; title fits with all four badges at 360 dp (web render 2026-10-08), truncates only below ~350 dp.
2. **Works across Android phones, best practice:** small screens (360 dp), large font scale, 60/90/120 Hz displays, phones whose sensor can't do 125 Hz, phones without a motion sensor (tap-only must work end to end), Android versions down to minSdk. Every new mode must degrade cleanly when a capability is missing.
3. **v1.7.4 confirmed live on f-droid.org via the checkupdates bot** — proves the auto-update path before shipping the next one.
4. Logan's on-phone test pass (hold-to-launch, two-player multitouch).

## Already on dev

- ~~98b2733 — icon-only ACCEL / FLOOR IT badges~~ — DONE, plus icon-only settings badge (3525baf); verified in web render at 393 and 360 dp.
- No native code or dependency changes anywhere on dev — the F-Droid recipe is unaffected.

## How this was tested (2026-10-08) and what still needs a phone

Typecheck + 52 Jest tests (`__tests__/`). UI flows driven in a web export with headless Chromium (Playwright, 393 and 360 dp): consistency strip, latency check + tap test, slip entry/offset/Settings card, hold-to-launch (launch with finger drift, early release, reset, held-through timeout), two-player (two pointer-downs 30 ms apart both counted, red-light race). **Web is not Android** — still needs Logan's phone for: real multitouch (two thumbs at once), haptics, hold-to-launch feel, sensor rate in the latency check, numeric keyboard for slip entry.

Gotcha found: on react-native-web a `Pressable` with only `onPressIn` never fires — always pair it with `onPress` (even a no-op).

## Ideas, scoped

All built except 4b. Pure logic lives in `lib/` with tests in `__tests__/scaffold.test.ts`.

Each one stands alone; pick any order. Sizes are effort estimates, not rankings — the user rated all of these as good ideas worth building (2026-10-08). The bigger ones (web build, two-player, volume-key launch) are the ones most likely to grow the audience.

### 1. Consistency stats — small, do first

Repeatability is the hook for anyone chasing a better time, not just racers.

- Std deviation of RT over the visible history / current series.
- "% within ±0.020 s" (or a target window) and the current streak of good lights.
- Lives in the existing history/series stats area; no new screens.
- Pure JS on top of `RunRecord` history. No native changes → no F-Droid risk.

~~**Next:** render it on the home screen.~~ — DONE (3525baf): AVG / SPREAD / % within ±.020 / STREAK strip above History once there are 3 clean runs; red lights and 2.0 s timeouts excluded.

### 2. Latency check — small/medium

Makes the numbers credible: shows how much of the RT is the phone, not the driver.

- Sensor: measured sample rate and jitter (actual Hz vs 125 Hz target). The diagnostic screen already has the raw data; this is a summary line.
- Display: time from setting green to the frame being painted (rAF timestamps already used for `greenAtRef`).
- Touch: optional tap test (tap in time with a steady flash, report mean offset) — this measures touch latency + human, so label it as an estimate.
- Shown in Settings/diagnostics, not on the home screen. No native changes.

~~**Next:** Phone latency section + tap test.~~ — DONE (c19154a): `components/LatencyCheck.tsx` in Settings. 2 s timing check (screen Hz via rAF, sensor Hz + jitter); tap test (12 beats at 600 ms, first 4 warm-up, mean offset as an estimate). Dropped the "green scheduled → painted" number: RT already times from the painted frame, so it would have been misleading.

### 3. Calibrate against a time slip — medium

- After a real run, user can enter the RT from their slip next to the app's RT.
- App keeps the pairs and shows the average offset ("DragTree reads 0.03 s faster than your slip").
- Optional: apply the offset to displayed RTs (setting, off by default; raw values stay in history).
- Pairs live in their own store (`dragtree.slipCal.v1`), so run history doesn't change format.
- Caveat to state in the UI: track RT is measured at the stage beam (rollout), the app measures acceleration onset, so the offset depends on the car and staging depth. That's the point of calibrating, but don't promise a match.

~~**Next:** slip entry, Settings summary.~~ — DONE (5e29d73): tap a run in History → inline entry (`components/SlipEntry.tsx`); tiles show "· SLIP"; Settings `TimeSlipCard` shows average difference + clear. With 2+ slips each result shows "≈ X on your slip" — chosen instead of an apply-offset toggle (one less setting, raw RT stays primary).

### 4. Hold-and-release launch mode — medium (setting)

Closer to a real launch: hold, release on green (like a trans-brake button).

- **On-screen version (easy):** press and hold the button during staging; releasing early = red light; RT = release time. Pure JS.
- **Physical button version (harder):** volume key as the hold button. Expo has no volume-key listener, so this needs a native module (e.g. a small Expo module or `react-native-keyevent`). Consequences:
  - New native code → touches the F-Droid recipe (scanignore, repro). Treat as its own release with a full two-run check; don't combine with other native changes.
  - Volume keys also change volume unless the event is consumed — must test.
- The physical button is the real prize — it's what makes this feel like a trans-brake. The on-screen version can ship first as a stepping stone, since it's pure JS and proves the mode before the native work.

~~**Next:** on-screen hold mode.~~ — DONE (c421ff5): `holdToLaunch` setting, off by default. All handling on press-in/out; scroll locked and press-retention enlarged while holding. **4b (volume key) still open** — `lib/hardwareKeys.ts` returns `null`; build it as its own release after this one ships.

### 5. Web build on GitHub Pages — small

- `npx expo export -p web` → static files → GitHub Pages (Actions workflow on tag, or manual).
- FLOOR IT / tap mode works everywhere. Accelerometer in a mobile browser is `DeviceMotionEvent` — Android Chrome generally works; iOS Safari needs a permission prompt (INFERRED; check before promising it).
- Low overhead, and the easiest way to reach people: a link someone can open from a forum post or group chat with no install. Also the cheapest "iPhone" path.
- Check: audio (WAV data URIs via expo-av) and `performance.now()` timing on web.

**Ready, not deployed:** `.github/workflows/pages.yml` (manual run; patches `baseUrl: /drag-tree` into app.json in CI only). Web export verified locally. GitHub only lets you run a manual workflow once it's on the default branch, so deploy **at merge**: Settings → Pages → Source: GitHub Actions, then run "Web (Pages)". On web the motion sensor shows as unavailable, so it's tap/hold/2-player only — fine for a try-before-install link.

### 6. Two-player split screen — large

Big addition, and a strong one: offline head-to-head turns the app from solo practice into something people pass around at the track or in the garage. No network needed — two people, one phone.

- Phone flat between two people, screen split, each half mirrored with its own tree and button. Same tree start for both; each player's RT graded separately; winner = better light (red light loses).
- Tap-only — the accelerometer can't tell two players apart, so sensor launch is disabled in this mode.
- Needs: a second session state (or a two-lane state machine), a new screen/route, multitouch handling (two simultaneous taps — RN Pressable is fine, but verify no dropped touches), rotated layout for the far player.
- Results don't go into the personal history/best (or go into a separate head-to-head tally).
- Open question: one shared tree in the middle vs one per half.

~~**Next:** build it out.~~ — DONE (c245335): `hooks/useVersusSession.ts` + `app/versus.tsx`. Shared tree timing; one light row per lane (answers the open question); lanes use raw `onTouchStart` (pointer events on web) because RN's responder tracks one touch at a time; score in the middle (long-press resets); "2 PLAYER" button under the main button when idle. Never writes solo history/best. Light size scales with screen width.

## Assessment (2026-10-08)

**Where it stands.** The app is technically solid and well past the hard part: a reproducible F-Droid build (the thing that took attempts A1–A6), one signing key across all three stores, a documented release runbook, CI on every push, and now a real feature set on dev. What it doesn't have is users — no measurement (by design, no analytics) and no distribution push. The roadmap so far has been building things; the next phase is getting them in front of people.

**Strengths.** Offline/no-account/no-tracking is genuinely rare and is the F-Droid audience's whole value system. Sensor launch detection with onset rewind is real engineering, not a toy. 2 Player turns it from a niche practice tool into something people hand to a friend — that's the widest audience the app has.

**Risks / weak spots.**
- *Untested on real hardware.* Everything new was verified in a web render, not on Android. Multitouch, haptics and hold-feel are exactly what browsers fake badly. The phone test is the real gate.
- *Release machinery is fragile and local.* F-Droid repro depends on a precise recipe; Play/beta builds depend on a local SDK (now deleted) and a stale committed `android/`. One wrong step and a release breaks. The runbook mitigates this — follow it literally.
- *The committed `android/` is stale* (manifest still lists blocked perms). Harmless for F-Droid (prebuild regenerates) but a trap for anyone building locally. Consider regenerating and committing it in its own commit, or documenting "never build from committed android/".
- *Disk is tight* (338 GB, was at 0). Builds fail mid-way with corrupted Gradle state when it fills.
- *Play Store is stuck* on the testers requirement — out of our hands until Logan finds testers.
- *Web (Pages) has no sensor.* Fine as a try-it link; don't oversell it.

**Recommended order from here.**
1. Logan tests the beta → fix feedback on dev → beta.2 if needed.
2. Confirm v1.7.4 lands on f-droid.org (bot). If nothing by ~2026-10-15, open an MR from fork branch `dragtree-v1.7.4`.
3. Merge dev → main as **1.8.0** (versionCode 18 → F-Droid 181–184, Play 180), full F-Droid two-run release per `fdroid/README.md`, deploy Pages, upload Play AAB when testers exist.
4. Then distribution: the web link + 2 Player are the shareable hooks (car forums/groups, r/fdroid, a short screen recording). Volume-key launch (4b) as its own later release.

## Out of scope

- Anything online (see above).
- Re-adding Reanimated / gesture-handler without updating the F-Droid scanignore (see CLAUDE.md invariants).
- iOS-specific work.

## Release hygiene reminder

Every release follows `fdroid/README.md` → "Releasing an update". Changelogs go in `changelogs/<10*code+1..4>.txt`. Native-dependency changes (idea 4b) get their own release.
