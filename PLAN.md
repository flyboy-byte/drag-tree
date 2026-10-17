# PLAN.md — where DragTree goes next

Status (2026-10-17): **stable v1.7.4 live on f-droid.org** (171–174, picked up by checkupdates — auto-update path proven). **Beta v1.8.0-beta.5** (code 179, the last beta code, `dev` @ c113ad5) is the current pre-release — beta.4 plus safe-area layout fix, raw-accelerometer switch for slow linear sensors (Pixel 9 linear = 50 Hz), onset-after-threshold fix. Logan to run the Phase A device checks on it. **Next:** 1.8.0 — fully scoped in "1.8.0 release plan" below (Phase A: beta.5 device checks). Play AAB for 1.7.4 built, upload parked. Last updated 2026-10-17.

This is the roadmap for the `dev` branch. Releases happen when there's enough here worth shipping — no schedule.

## Decided with the user (do not re-ask)

- **Target audience is everyone with a car who likes this kind of thing — and anyone who just wants a reaction game.** Racers are a small group; using a phone to practice a drag launch is a narrow niche. The game angle (beat your time, beat your friend) is a real audience on its own. Design and copy for normal people first; racer-grade precision is a credibility bonus, not the pitch. The sensor launch works on the street too — never frame it as track-only. (Corrected by Logan 2026-10-08 after two wrong framings — do not re-ask.)
- **No online anything.** No accounts, leaderboards, sync, analytics. Keeps the open-source / F-Droid vibe (also a workspace-wide scope fence).
- **Android first.** iOS is not a goal. If an iOS or web build falls out cheaply, fine; never spend real effort on it.
- **Play production access is parked** until Logan finds a better tester group. Not a dev-branch concern. AAB for 1.7.4 is at `~/dragtree-fdroid-build/play-v1.7.4/out/`.
- **New modes are settings, off by default.** The default experience stays as it is.

- [x] **Beta.5 (179, last beta code)** — 2026-10-17: https://github.com/flyboy-byte/drag-tree/releases/tag/v1.8.0-beta.5, from `dev` @ c113ad5, signed ff739cf5…, sha256 6923b124…5e8f9e, 68 `.so`, same 3 permissions as beta.4. Adds: no drawing under status/nav bars (17553da), raw-accelerometer switch when linear is slow + "Phone sensors" row, onset-from-crossing fix, no impossible CUSTOM suggestion (c113ad5). Notes: `~/dragtree-fdroid-build/beta-1.8.0-beta.5/NOTES.md`. **Any further fix:** reuse 179 (Android installs an equal versionCode over itself) or go straight to the 1.8.0 RC — 180+ is 1.8.0's.
- **Check on beta.5:** home screen in 3-button and gesture nav; Settings test still → Sensor "Accelerometer" ≈200 Hz and the "Phone sensors" row; sounds; then car launch, two-thumb 2 Player, max font.

Beta.1–.4 releases **and tags** deleted (1–2 on 2026-10-16, 3–4 on 2026-10-17, Logan); records below stay (built from 067c319, babb63d, 9bced7e, 2e2edf5). Only beta.5 is published.

## Beta v1.8.0-beta.3 (GitHub pre-release, 2026-10-09)
- https://github.com/flyboy-byte/drag-tree/releases/tag/v1.8.0-beta.3 — universal APK, signed ff739cf5…, **versionCode 177**, from `dev` @ 9bced7e. sha256 cd8cbdd2…725f95. Notes: `~/dragtree-fdroid-build/beta-1.8.0-beta.3/NOTES.md`. Next beta → 178.
- First build with the native module: autolinked from `./modules` by plain `expo prebuild` (no recipe change), same permissions, same 68 `.so` files as beta.2 (module is Kotlin only).
- **To test on the phone:** Settings → Last real launch / Sensor details should show ~200 Hz and "Linear acceleration"; a real launch (detects, no false fires, RT sane); Settings accelerometer test suggestion; Volume Buttons & Remotes on → volume button stages/launches, hold mode works, volume still works in Settings; a Bluetooth shutter remote if you have one; max font size.

## Beta v1.8.0-beta.2 (GitHub pre-release, 2026-10-08)
- https://github.com/flyboy-byte/drag-tree/releases/tag/v1.8.0-beta.2 — universal APK, signed ff739cf5…, **versionCode 176**, from `dev` @ babb63d. sha256 1c77ba37…912545. Same recipe as beta.1 (below); version set only in the build clone. Notes: `~/dragtree-fdroid-build/beta-1.8.0-beta.2/NOTES.md`. Next beta → 177.
- Android SDK reinstalled 2026-10-08 via command-line tools at `~/Android/Sdk` (platform 36, build-tools 36.0.0, NDK 27.1.12297006, cmake 3.22.1, platform-tools). Build took 6½ min.
- Manifest includes `HIGH_SAMPLING_RATE_SENSORS`, so the 61 Hz seen on the Pixel 9 isn't the Android 12 permission cap.

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

Feedback, beta.4 Settings screenshots (Pixel 9, 2026-10-17):
- **Sensor at 50 Hz, not 200.** Accelerometer test: 250 samples / 4969 ms, mean 19.96 ms, jitter 0.01 ms, "Linear acceleration"; latency check also 50 Hz. So the native path works (hardware-timed, no frame limit), but the Pixel 9's `TYPE_LINEAR_ACCELERATION` (fusion) delivers 50 Hz at a 5 ms request. → c113ad5: use raw `TYPE_ACCELEROMETER` + JS gravity filter when linear can't reach 100 Hz (stated minDelay, or measured over its first 15 samples) and raw can; Settings shows both sensors' rated Hz ("Phone sensors" row). INFERRED that the Pixel's raw accelerometer does ≥ 100 Hz — the new row will show it. **Check on beta.5:** Sensor = Accelerometer, ≈200 Hz; a launch still detects cleanly with the gravity filter.
- **Onset after threshold** (HARD row: onset 1277.2, threshold 1237.2, o→t −39.9 ms). Rewind started at the confirming sample and stopped at the first non-rising one; with a push already level at confirm, onset = confirm. → c113ad5: rewind from the threshold crossing; regression test added (fails on old code).
- Background noise 1.97 g / peak 3.43 g, suggestion "CUSTOM above 2.47 g" — impossible (CUSTOM tops out at 6.0 m/s² = 0.61 g). → c113ad5: shows "—, too much movement… test again" instead. (Logan was shaking the phone on purpose — not car noise.)
- Settings content scrolling under the status bar visible in all three shots — already fixed by 17553da (not in beta.4).
- Screen 60 Hz, tap offset +82 ms — informational, fine.

Feedback, beta.4 (Pixel 9, 2026-10-16): ~~bottom of the home screen on a cold open looks low and odd, worse with 3-button navigation ("I don't feel like this is quality UI")~~ — FIXED on dev 17553da. Cause: the page scrolled behind the nav bar and the idle block was sized to end flush against it, so History peeked out under the 3-button bar and the hint sat on the gesture pill. Home and Settings now scroll between the bars; first screen ends 16 dp above the nav bar; History starts below the fold. Checked in a web render at 412×915; **needs a phone check in both navigation modes.** Short screens (e.g. 360×740) still scroll a little to reach the hint — lights already at their 30 dp minimum; 393×852 fits.

Feedback, beta.3 (Pixel 9, 2026-10-09): Logan — "really impressed", "looks great", settings layout good; **holding both volume buttons works** (hold-to-launch via volume keys confirmed on device); saw and tried the time-slip entry (no real slip entered yet). Logan considers beta.3 done. **Not yet confirmed on device:** sensor rate (~200 Hz / "Linear acceleration" in Settings), a real car launch on the new sensor path, max font size, a Bluetooth shutter remote. Note for testers: slips entered under beta.1/2 were matched to the old early-biased sensor RTs — clear and re-enter.

Feedback, round 1 (Pixel 9, 2026-10-08):
- ~~Cold start draws the screen under the status bar ("slightly scrolled")~~ — FIXED on dev: `SafeAreaProvider initialMetrics={initialWindowMetrics}` so real insets exist on the first frame.
- ~~2 PLAYER needs a scroll to reach~~ — FIXED: moved beside the PRO TREE pill at the top. Tree lights now scale with screen height (48 → min 30 dp) so header→button hint fits without scrolling on ~384×854 and taller. Still scrolls on very short screens (≤ ~360×740 with large insets).
- ~~Settings: "ARM 5s CAPTURE" means nothing to a normal user~~ — FIXED: now an **ACCELEROMETER TEST** card ("START TEST · 5 s capture") placed right under Sensor Sensitivity, with plain-language purpose, a background-noise reading (strongest sustained level, `lib/sensorNoise.ts`) and a suggested sensitivity with a one-tap USE button.
- ~~Settings ordering~~ — now LAUNCH (sensor, sensitivity, FLOOR IT, hold) → ACCELEROMETER TEST → TREE & DISPLAY (sportsman, sound, series, trend) → Time slip → Phone latency → SENSOR DETAILS (last launch, raw capture stats).
- Sound on all Androids: sounds now preload when the home screen opens (first green beep no longer waits on the player), audio init failures retry instead of staying dead, Settings text corrected (Android plays at media volume; it was claiming silent-mode behaviour that's iOS-only).
- Also fixed while there: history tiles said "GOO"/"GRE" (3-letter cut) → full grade word; tree center stripe sat off-center on Android.
- **Observed, not yet acted on:** Pixel 9 "Last real launch" shows 61 Hz sensor rate (16.4 ms) against an 8 ms / 125 Hz target, on the JS path. Worth checking whether expo-sensors' DeviceMotion is frame-limited on Android before 1.8.0 — it directly limits timing precision.

## 1.8.0 scope — decided 2026-10-09 (do not re-ask)

One big 1.8.0 instead of 1.8.0 + 1.9.0 (Logan: "build it out"). Ship each risky piece in its own beta first:
- **beta.3 (177):** full-rate motion sensor + volume/remote launch + large-text / screen fixes. Needs a real launch and a volume-button test.
- **beta.4 (178) / beta.5 (179):** fixes only. 180+ belongs to 1.8.0.
- **Rule:** if volume-button launch stalls (remote quirks, F-Droid repro), ship 1.8.0 without it rather than hold everything.

**Sensor rate fix (2026-10-09).** Root cause of the Pixel 9's 61 Hz: expo-sensors `DeviceMotion` on Android dispatches on Choreographer frames, so ≤ display refresh on every phone. Replaced by the local native module reading the sensor directly at ~200 Hz with hardware timestamps (`lib/motionSource.ts`). Side fixes: phones without a gyroscope (no linear-accel sensor) used to get *no* sensor — they now get raw accelerometer + gravity filter; the onset rewind used to land up to one slope-window *before* the real start (≈66 ms at 61 Hz), flattering sensor RTs — it now reports the first rising sample. **Expect sensor-path RTs to read somewhat slower than beta.2; that's the bias being removed.** Slip calibration absorbs any remaining constant offset.

**Large text (2026-10-09).** Simulated 1.2–1.6× font on web at 360 dp: title, mode pills, Settings header, result numbers collided/truncated. Big display text now caps OS scaling (1.1–1.3×), body text scales fully, the mode row wraps, the tree sizing subtracts text growth. Needs a real check at max font size.

## 1.8.0 release plan (scoped 2026-10-16)

Each phase ends in a check; don't start the next until it passes. Phases A–C can be done in any order or across nights — nothing in them is public except a beta pre-release. **Phase D is the point of no return** (tag = F-Droid picks it up) and should be done in one sitting.

**Key fact that shapes the plan:** `main` is an ancestor of `dev` (checked 2026-10-16), so the merge is a fast-forward and the release commit SHA is the same on both branches. That means the F-Droid dry run in Phase B can run on the *exact* commit that ships — the dry run *is* Run 1, done early.

### Phase A — finish the code (dev)
- [x] Block `ACCESS_NETWORK_STATE` — 55387e8 (issue #2, see below).
- [x] **Beta.4 (178)** — DONE 2026-10-16: https://github.com/flyboy-byte/drag-tree/releases/tag/v1.8.0-beta.4, from `dev` @ 2e2edf5, signed ff739cf5…, sha256 61ef4a30…3e9278, 68 `.so`. Permissions confirmed: HIGH_SAMPLING_RATE_SENSORS, MODIFY_AUDIO_SETTINGS, VIBRATE (+ DYNAMIC_RECEIVER). Build took 12 min (Gradle cache had been cleared). Notes: `~/dragtree-fdroid-build/beta-1.8.0-beta.4/NOTES.md`. Was: Purpose: confirm sounds still play without the permission, and give a fresh build for the remaining device checks. Check `aapt2 dump permissions` shows only HIGH_SAMPLING_RATE_SENSORS, MODIFY_AUDIO_SETTINGS, VIBRATE (+ the app's own DYNAMIC_RECEIVER permission).
- [ ] **Logan's device checks on beta.4** (the ones still open): sounds play; Settings → Sensor details ≈200 Hz + "Linear acceleration"; one real car launch (detects, no false fires, sane RT); 2 Player with two thumbs at once; max system font size. Shutter remote only if one is around — not a gate.
- Any fix → beta.5 (179, the last beta code). If volume-button launch misbehaves, ship 1.8.0 without it (rule from 2026-10-09) rather than slip.
- **Exit:** Logan OKs beta.4 (or .5).

### Phase B — release-candidate commit + F-Droid dry run
1. **RC commit on dev** — all the files F-Droid reads at the tag:
   - Version: `app.json` version `1.8.0` + `android.versionCode` 18; `package.json` version `1.8.0`; `android/app/build.gradle` `versionCode 18` / `versionName "1.8.0"` (checkupdates reads this file). Safe on dev: F-Droid only tracks tags matching `^v[\d+.]+$`, and no tag exists yet.
   - Changelogs `fastlane/metadata/android/en-US/changelogs/181.txt`–`184.txt` (identical; draft below; ≤ 500 chars).
   - `full_description.txt` refresh (see Phase C — can be same commit or a later one before tagging; F-Droid reads it from the tag).
2. **Dry run = Run 1** (`fdroid/README.md` step 4) on a new fork branch `dragtree-v1.8.0` off `upstream/master` in `./fdroiddata`: copy the four 1.7.4 blocks, set `versionName: 1.8.0`, `versionCode: 181..184`, `commit:` = RC full SHA, **no `binary:`**; bump `CurrentVersion`/`CurrentVersionCode` to 1.8.0/184. Recipe otherwise unchanged (prebuild already autolinks `./modules`). Push to the GitLab fork; fix formatting only from the CI rewritemeta diff (NEVER rule 4).
   - Expected failures, same as every Run 1: `schema validation` (no `binary`) and `checkupdates` (no tag).
   - **What this proves:** the scanner accepts `modules/dragtree-input` (outside `scandelete: node_modules`; its `build.gradle` declares no repositories, unlike the six scanignored libs), and the module compiles in F-Droid's container.
   - If the scanner flags `modules/dragtree-input/android/build.gradle`: add it to `scanignore` — one variable class, one attempt (NEVER rule 5).
3. **Check the four unsigned APKs** from the build-job artifacts: each has only its own `lib/<abi>/`; `aapt2 dump permissions` matches beta.4; `classes*.dex` contains `com/flyboybyte/dragtree/input/` (module compiled in).
- **Exit:** all four builds succeed in the fork pipeline, ABI contents and permissions correct. Code changes after this point mean a new RC SHA and a new Run 1.

### Phase C — store text, screenshots, README (any time; text only)
- **`full_description.txt`** — rewrite for the everyone-with-a-car + reaction-game audience (see Decided). Lead with: real tree, sensor *or* tap/hold/volume-button launch, 2 Player, offline. Fix stale facts: "125 Hz" → up to 200 Hz; permissions section should list HIGH_SAMPLING_RATE_SENSORS (fast sensor), VIBRATE (haptics), MODIFY_AUDIO_SETTINGS (sound playback); say there is no INTERNET permission. Add new features: 2 Player, Hold to Launch, Volume Buttons & Remotes, consistency stats, time-slip comparison, phone latency check, accelerometer test. F-Droid limit 4000 chars.
- **`short_description.txt`** — currently "NHRA Pro Tree reaction timer — accelerometer launch detection, no internet" (≤ 80 chars). Consider adding 2 Player; optional.
- **Screenshots** — `images/phoneScreenshots/` has only `1.png`. Want 4–6 real Pixel shots from Logan (home idle, tree mid-run, result, 2 Player, Settings). **Owner: Logan** (needs the phone). Not a gate — can land in a later commit; F-Droid reads them from the next tag.
- **README.md** — Features list + "How detection works" (now native ~200 Hz, hardware timestamps, gravity filter fallback, no early-onset bias); mention the web link once Pages is live.
- **Play text (code 180)** — same as the changelog; entered in Play Console when Play un-parks. Nothing to do now.

Changelog draft (181–184, 490 chars):
```
- 2 Player: race a friend head-to-head on one phone
- Hold to Launch: hold through the tree, let go on green
- Launch with volume buttons, a headphone button or a Bluetooth camera remote (Settings)
- Motion sensor reads up to 200 times a second; sensor times are more accurate and may read slightly slower
- Sensor launch on phones without a gyroscope
- Consistency stats, time-slip comparison, phone latency check
- Better fit on small screens and large text
- Removed an unused permission
```

### Phase D — release (one sitting, ~2–3 h incl. F-Droid CI)
Follows `fdroid/README.md` → "Releasing an update", steps 3–7, with Run 1 already done in Phase B:
1. `git checkout main && git merge --ff-only dev && git push` — **do not tag**. Confirm `main` SHA == RC SHA from Phase B (if not, redo Run 1 on the new SHA).
2. Sign the four Phase-B unsigned APKs: `apksigner --v1-signing-enabled false --alignment-preserved true`, **verify cert `ff739cf5…`** (NEVER rule 6), name `drag-tree-v1.8.0-<abi>.apk` (NEVER rule 8: one per ABI, no universal).
3. `gh release create v1.8.0 --target <RC full SHA>` with all four APKs + notes (changelog + "Fully offline, no tracking"). Not a pre-release. This creates the tag with the reference APKs already present.
4. **Run 2:** add the four `binary:` lines to the fork blocks, push, confirm all four byte comparisons pass.
5. Leave it to `checkupdates` (worked for 1.7.4 with no MR, 2026-10-09→16). Watch https://f-droid.org/api/v1/packages/com.flyboybyte.dragtree for 181–184; if not live in ~7 days, read their build log.
6. **After tagging:** deploy Pages (Settings → Pages → Source: GitHub Actions, run "Web (Pages)"); close issue #2 pointing at 1.8.0; strike through this plan; update `fdroid/README.md` status + `MR_ACTIVITY.md` pipeline IDs; `dev` keeps going from the same SHA.
7. **Play** — build AAB 180 only when Play un-parks (Logan's call).

### Known, deliberately not in 1.8.0
- `android.hardware.microphone` uses-feature still in the manifest (from expo-av; not removable with `blockedPermissions`). Harmless — no RECORD_AUDIO.
- `MODIFY_AUDIO_SETTINGS` kept (decided 2026-08-03: expo-av audio focus on older phones).
- Committed `android/` stays stale; F-Droid and betas regenerate it with prebuild.

### Issue #2 — ACCESS_NETWORK_STATE (2026-10-10, Quantum-Future)
Not from our code: merged in from ExoPlayer 2.18.1 (pulled in by expo-av for the sounds), which uses it only to guess network type for streaming bandwidth. The 1.7.3 cleanup blocked exactly the reviewer's list (2026-08-02), which didn't include it, so 1.7.3/1.7.4/betas 1–3 all ship it. INTERNET is blocked, so the app can't connect regardless. Fixed on dev 55387e8. Verified in ExoPlayer source (`NetworkTypeObserver`): missing permission → catches SecurityException → NETWORK_TYPE_UNKNOWN. Logan replied on the issue 2026-10-16. Close when 1.8.0 ships.

### Gate status (2026-10-16)
1 done · 3 done · 4 mostly (hold, volume-button hold, settings, slip UI confirmed; rest in Phase A) · 2 partly (web sims at 360 dp + large font, one real phone — Phase A device checks are the practical bar; no second phone available).

## Before merging dev → main (gates)

1. **Reviewer findings reconciled.** #1, #2, #4 fixed in v1.7.4. #3 (title wrap) fixed on dev: badges incl. settings are icon-only; title fits with all four badges at 360 dp (web render 2026-10-08), truncates only below ~350 dp.
2. **Works across Android phones, best practice:** small screens (360 dp), large font scale, 60/90/120 Hz displays, phones whose sensor can't do 125 Hz, phones without a motion sensor (tap-only must work end to end), Android versions down to minSdk. Every new mode must degrade cleanly when a capability is missing.
3. ~~**v1.7.4 confirmed live on f-droid.org via the checkupdates bot**~~ — DONE (seen live 2026-10-16, 171–174).
4. Logan's on-phone test pass (hold-to-launch, two-player multitouch).

## Already on dev

- ~~98b2733 — icon-only ACCEL / FLOOR IT badges~~ — DONE, plus icon-only settings badge (3525baf); verified in web render at 393 and 360 dp.
- ~~No native code or dependency changes anywhere on dev~~ — no longer true since 9bced7e: local native module `modules/dragtree-input` (Kotlin only, autolinked, no recipe change expected). Unproven in an F-Droid pipeline until the dry run.

## How this was tested (2026-10-08) and what still needs a phone

Typecheck + 52 Jest tests (`__tests__/`). UI flows driven in a web export with headless Chromium (Playwright, 393 and 360 dp): consistency strip, latency check + tap test, slip entry/offset/Settings card, hold-to-launch (launch with finger drift, early release, reset, held-through timeout), two-player (two pointer-downs 30 ms apart both counted, red-light race). **Web is not Android** — still needs Logan's phone for: real multitouch (two thumbs at once), haptics, hold-to-launch feel, sensor rate in the latency check, numeric keyboard for slip entry.

Gotcha found: on react-native-web a `Pressable` with only `onPressIn` never fires — always pair it with `onPress` (even a no-op).

## Ideas, scoped

All built, including 4b (2026-10-09). Pure logic lives in `lib/` with tests in `__tests__/scaffold.test.ts`.

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

~~**Next:** on-screen hold mode.~~ — DONE (c421ff5): `holdToLaunch` setting, off by default. All handling on press-in/out; scroll locked and press-retention enlarged while holding. ~~**4b (volume key) still open**~~ — DONE (2026-10-09) on dev, in 1.8.0 by Logan's call (one big release, separate betas). `keyLaunch` setting, off by default; native module `modules/dragtree-input`; works like the on-screen button incl. Hold to Launch; Space/Enter on web.

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

## Assessment (2026-10-08, refreshed 2026-10-09)

**Where it stands.** The app is technically solid and well past the hard part: a reproducible F-Droid build (the thing that took attempts A1–A6), one signing key across all three stores, a documented release runbook, CI on every push, and now a real feature set on dev. What it doesn't have is users — no measurement (by design, no analytics) and no distribution push. The roadmap so far has been building things; the next phase is getting them in front of people.

**Strengths.** Offline/no-account/no-tracking is genuinely rare and is the F-Droid audience's whole value system. Sensor launch detection with onset rewind is real engineering, not a toy. 2 Player turns it from a niche practice tool into something people hand to a friend — that's the widest audience the app has.

**Risks / weak spots.**
- ~~*Untested on real hardware.*~~ Mostly cleared 2026-10-09: betas 2–3 tested on a Pixel 9 (layout, settings, hold, volume-button hold). **Still open on device:** the ~200 Hz sensor path in a real car launch, max font size, a Bluetooth shutter remote, other phones.
- *Release machinery is fragile and local.* F-Droid repro depends on a precise recipe; Play/beta builds depend on a local SDK (reinstalled 2026-10-09 at `~/Android/Sdk`) and a stale committed `android/`. New since 2026-10-09: a local native module (`modules/dragtree-input`, Kotlin only) — not yet through an F-Droid pipeline. One wrong step and a release breaks. The runbook mitigates this — follow it literally.
- *The committed `android/` is stale* (manifest still lists blocked perms). Harmless for F-Droid (prebuild regenerates) but a trap for anyone building locally. Consider regenerating and committing it in its own commit, or documenting "never build from committed android/".
- *Disk is tight* (338 GB, was at 0). Builds fail mid-way with corrupted Gradle state when it fills.
- *Play Store is stuck* on the testers requirement — out of our hands until Logan finds testers.
- *Web (Pages) has no sensor.* Fine as a try-it link; don't oversell it.

**Recommended order from here (2026-10-09).**
1. Logan keeps testing beta.3. Open device checks: Settings → Sensor details shows ~200 Hz + "Linear acceleration"; one real car launch (detects, no false fires, sane RT); max font size; a shutter remote if available. Fix on dev → beta.4 (178) only if needed.
2. Wait for v1.7.4 on f-droid.org (merge gate). If not live by ~2026-10-12, read the F-Droid build log for 171–174.
3. 1.8.0 release prep (can start any time, Logan hasn't asked yet — offered 2026-10-09): changelogs `181–184.txt` + Play text, store description for the everyone-with-a-car/game audience (lead: 2 Player, Hold to Launch with volume buttons/remote, precise timing), new screenshots (real Pixel shots preferred), README, and an **F-Droid dry-run pipeline on the fork using dev** to prove the native module rebuilds reproducibly.
4. Merge dev → main as **1.8.0** (versionCode 18 → F-Droid 181–184, Play 180), full F-Droid two-run release per `fdroid/README.md`, deploy Pages, Play AAB when testers exist.
5. Distribution: web link + 2 Player + the shutter-remote trick are the shareable hooks.
6. Parked ideas (offered, not chosen): auto-start (tree starts when the car is still and staged), bracket "perfect light" scoring, deep staging. Suggested auto-start for after 1.8.0.

## Out of scope

- Anything online (see above).
- Re-adding Reanimated / gesture-handler without updating the F-Droid scanignore (see CLAUDE.md invariants).
- iOS-specific work.

## Release hygiene reminder

Every release follows `fdroid/README.md` → "Releasing an update". Changelogs go in `changelogs/<10*code+1..4>.txt`. Native-dependency changes (idea 4b) get their own release.
