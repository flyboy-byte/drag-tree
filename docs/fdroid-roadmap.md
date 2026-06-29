# DragTree — F-Droid Roadmap

Working tracker for getting DragTree onto F-Droid. Update status markers as steps are completed.

Status markers: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/decision needed

---

## Decisions already made

| Topic | Decision | Reason |
|---|---|---|
| Firebase / remote logging | **No. Keep logging local.** | Firebase is explicitly banned by F-Droid ("non-FOSS"). Play Console already provides ANR/crash data for free. App is "no internet required" — any remote endpoint breaks that promise and would require a Play Store data safety update. |
| Build system approach | **Option A: commit prebuild output** | See Step 1 below. Committing `android/` is the proven path; the init-script approach is fragile in F-Droid's build environment. |
| Crash visibility | **Use existing diagnostic screen + Play Console** | Local diagnostics screen already captures sensor telemetry. Play Console catches ANRs/crashes. Sufficient for current scale. |

---

## FOSS audit result (June 2026)

The app is clean. No action needed for any of these.

- ✅ Zero analytics, Firebase, Crashlytics, tracking SDKs
- ✅ Zero remote API calls — only user-initiated browser opens (privacy policy + GitHub source link) via `expo-web-browser`
- ✅ Permissions: `HIGH_SAMPLING_RATE_SENSORS` only; explicitly blocks `ACTIVITY_RECOGNITION`
- ✅ MIT license, public GitHub repo
- ✅ All audio synthesized locally — no cloud TTS or streaming
- ✅ All settings stored in AsyncStorage — no remote sync
- ⚠️ `@tanstack/react-query` installed in `artifacts/drag-tree/package.json` but **unused** — cleanup candidate (doesn't affect F-Droid eligibility, just dead weight)
- ⚠️ `@replit/connectors-sdk` in **root** `package.json` — not in the app itself, Replit build tooling only; F-Droid reviewers won't see it in the app APK

---

## Steps

### Step 1 — Get the Gradle project into the repo `[ ]` (MEDIUM)

Expo's `expo prebuild` generates a standard Gradle project in `android/` — the same thing EAS hands to Gradle to produce the APK. F-Droid uses Gradle too, so there's no fundamental incompatibility. The only question is whether `android/` needs to be committed to the repo first or whether the fdroiddata init script can generate it.

**Two equivalent options:**

**Option A — Commit the prebuild output (simpler, recommended)**
1. Run `expo prebuild --platform android --clean` from `artifacts/drag-tree/`
2. Remove `android/` from `artifacts/drag-tree/.gitignore`
3. Scan the output for anything sensitive (no Google services in this app, so should be clean)
4. Commit the `android/` directory
5. F-Droid clones the repo and runs Gradle directly — same as EAS does

**Option B — Init script (cleaner repo, slightly more setup)**
Leave `android/` gitignored. In the fdroiddata YAML, add:
```yaml
init:
  - npm install -g pnpm
  - pnpm install
  - npx expo prebuild --platform android --clean
```
F-Droid's build environment has Node.js. This generates `android/` before Gradle runs.

**Option A is recommended** — fewer moving parts in the fdroiddata build, easier to debug if the MR fails CI.

**Watch out for:**
- After any Expo version bump or new native plugin, re-run prebuild and recommit `android/`
- The `android/` folder is large (~50MB of Gradle boilerplate) — that's expected and normal

---

### Step 2 — Add Git version tags `[ ]` (EASY)

F-Droid's autoupdate system detects new versions by reading Git tags. Each release commit needs a tag matching `versionName` in `app.json`.

**What to do:**
```bash
# Tag the current release (v1.7.0 / versionCode 12)
git tag v1.7.0
git push origin v1.7.0
```

For every future release: bump `version` and `versionCode` in `artifacts/drag-tree/app.json`, commit, then tag before building.

---

### Step 3 — Add Fastlane metadata `[ ]` (EASY)

F-Droid reads store listing text from Fastlane-style files in the repo. This is also used if you ever submit to the Play Store via Fastlane.

**Create this directory structure** (from repo root):
```
fastlane/metadata/android/en-US/
├── short_description.txt     ← ≤80 chars, no trailing dot
├── full_description.txt      ← store long description
├── images/
│   ├── icon.png              ← copy of assets/images/icon.png
│   └── phoneScreenshots/
│       ├── 1.png             ← existing screenshot (docs/screenshot-tree.png)
│       └── 2.png             ← second screenshot if available
└── changelogs/
    └── 12.txt                ← versionCode 12, ≤500 chars, what's new
```

**Suggested `short_description.txt`:**
```
NHRA Pro Tree reaction timer — accelerometer launch detection, no internet needed
```

**Notes:**
- `changelogs/12.txt` = what's new in versionCode 12 (current). Add one file per future versionCode.
- The icon and screenshot already exist in `docs/` — just copy/reference them.

---

### Step 4 — Strip EAS project ID for F-Droid build `[ ]` (EASY)

`artifacts/drag-tree/app.json` contains:
```json
"extra": {
  "eas": {
    "projectId": "316b0319-363f-4c90-b255-09aa5957c946"
  }
}
```

This is EAS build tooling only — not used at runtime. F-Droid reviewers may question it. Options:
- Remove the `extra.eas` block entirely (EAS still works; it's only a convenience shortcut)
- Or document in the fdroiddata YAML that it's harmless build metadata

**Recommended**: Remove `extra.eas` from `app.json`. EAS reads `projectId` from the block but falls back to prompting if absent — it won't break `eas build`.

---

### Step 5 — Write fdroiddata metadata YAML `[ ]` (MEDIUM)

This is the file that tells F-Droid how to build and describe the app.

**Process:**
1. Fork `https://gitlab.com/fdroid/fdroiddata` on GitLab
2. Create a new branch: `com.flyboybyte.dragtree`
3. Create `metadata/com.flyboybyte.dragtree.yml`
4. Open a merge request

**Template for `metadata/com.flyboybyte.dragtree.yml`:**
```yaml
Categories:
  - Sports & Health
License: MIT
AuthorName: flyboy-byte
SourceCode: https://github.com/flyboy-byte/drag-tree
IssueTracker: https://github.com/flyboy-byte/drag-tree/issues
WebSite: https://flyboy-byte.github.io/drag-tree/

AutoName: DragTree

Description: |-
  Simulates a real NHRA Pro Tree (all 3 ambers fire simultaneously, green
  0.400 s later) and measures your reaction time using the phone's
  accelerometer.

  Mount your phone on the dash, stage up, watch the tree, and floor it — the
  app detects launch G-force and records your RT automatically. No tapping
  required when the sensor is available.

  Features: Pro Tree / Sportsman Tree modes, three sensitivity presets,
  reaction grading, run history, trend chart, optional audio cues, series mode.
  Fully offline — no internet required.

RepoType: git
Repo: https://github.com/flyboy-byte/drag-tree

Builds:
  - versionName: 1.7.0
    versionCode: 12
    commit: v1.7.0
    subdir: artifacts/drag-tree/android/app
    gradle:
      - yes

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.7.0
CurrentVersionCode: 12
```

**Watch out for:**
- `subdir` must point to where `build.gradle` lives inside the committed `android/` tree — verify the exact path after prebuild
- F-Droid's CI will attempt a build; if it fails, check the build log URL printed in the MR
- The `gradle: yes` means build the default (release) variant — that's correct for a production APK

---

### Step 6 — Test the metadata locally (optional but recommended) `[ ]`

F-Droid provides `fdroidserver` to test locally before submitting.

```bash
# Requires Docker (~1 GB)
git clone --depth=1 https://gitlab.com/fdroid/fdroidserver
sudo sh -c 'apt-get update && apt-get install -y docker.io'
sudo docker run --rm -itu vagrant --entrypoint /bin/bash \
  -v ~/fdroiddata:/build:z \
  -v ~/fdroidserver:/home/vagrant/fdroidserver:Z \
  registry.gitlab.com/fdroid/fdroidserver:buildserver

# Inside container:
. /etc/profile
fdroid readmeta
fdroid rewritemeta com.flyboybyte.dragtree
fdroid lint com.flyboybyte.dragtree
fdroid build com.flyboybyte.dragtree
```

---

### Step 7 — Submit the merge request `[ ]`

Once the fdroiddata metadata YAML is ready:
1. Commit with label `New App: DragTree`
2. Push to your fork
3. Open MR on GitLab against `fdroiddata` master
4. Monitor the MR — F-Droid staff may ask questions; reply promptly
5. After merge: ~24–48 hours for the app to appear in the F-Droid client

---

## Future release checklist (once on F-Droid)

For each new release:
1. Bump `version` and `versionCode` in `artifacts/drag-tree/app.json`
2. Re-run `expo prebuild --platform android --clean` and commit updated `android/`
3. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`
4. Commit, tag (`git tag v<version>`), push tag
5. F-Droid autoupdate picks up the new tag automatically — no manual fdroiddata update needed

---

## Reference

- F-Droid quick start guide: `docs/fdroid.pdf`
- fdroiddata repo: `https://gitlab.com/fdroid/fdroiddata`
- Build metadata reference: `https://f-droid.org/docs/Build_Metadata_Reference/`
- App package ID: `com.flyboybyte.dragtree`
- Current versionName: `1.7.0` / versionCode: `12`
