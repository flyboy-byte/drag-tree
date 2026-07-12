# F-Droid v1.7.2 Reproducible Build Plan

Role of this file:

- strategy doc
- sequencing doc
- push-planning doc

Do not use this as the primary execution checklist. For actual build flow, use [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md).

## Purpose

Get `Binaries:` verification passing for `v1.7.2` by making the reference APK and the F-Droid rebuild come from the same effective source tree, the same template-driven patch sequence, and the same Gradle build path.

This plan exists to stop the current whack-a-mole loop. One variable at a time. One canonical build path. One evidence trail per attempt.

---

## Non-Negotiable Rules

### 1. The official React Native template is the base

Template source:

- `/home/logan/Downloads/build-react-native.yml`

Reviewer instruction:

> Please follow the template at `templates/build-react-native.yml`

And when asked what to change:

> Every part.

This means the build recipe must continue to look like the template in structure:

- `subdir: android/app`
- dependency install in `init`
- `gradle: yes`
- `prebuild:` includes:
  - Expo `buildFromSource` patch
  - JDK 17 → 21 patch in RN Gradle files
  - `npx expo prebuild -p android --clean`
  - `sed -i -e '/signingConfig /d' android/app/build.gradle`
- narrow file-level `scanignore`
- `scandelete: node_modules`

### 2. The reference APK must be built with the same patch sequence as F-Droid

This is the core lesson from the reviewer:

> Your apk is built from a different source code. You need to apply the same patch first.

So:

- no EAS reference APK
- no local host Gradle reference APK
- no “close enough” build path

The uploaded GitHub release APK must come from a build that mirrors the fdroiddata recipe, including the same prebuild patch sequence.

### 3. `expo prebuild -p android --clean` stays

Do not remove it.

This was already a reviewer-approved direction and the docs now depend on it. Any plan that removes Expo prebuild is out of scope.

### 4. One attempt = one controlled change class

Do not mix:

- YAML/template changes
- Gradle reproducibility changes
- Docker memory tuning
- scanignore/scanner fixes

Each run must say exactly what changed and why.

---

## Canonical Inputs

These files are the current source of truth for the reproducibility effort:

- [FDROID.md](/home/logan/projects/drag-tree/FDROID.md)
- [FDROID_REPRO_RESEARCH.md](/home/logan/projects/drag-tree/FDROID_REPRO_RESEARCH.md)
- [FDROID_MR_ACTIVITY.md](/home/logan/projects/drag-tree/FDROID_MR_ACTIVITY.md)
- [docs/com.flyboybyte.dragtree.yml](/home/logan/projects/drag-tree/docs/com.flyboybyte.dragtree.yml)
- `/home/logan/Downloads/build-react-native.yml`

---

## What Success Looks Like

1. Build a signed reference APK from a fresh clone inside a Debian/F-Droid-like container.
2. Use the same patch sequence as the fdroiddata recipe before Gradle runs.
3. Upload that APK to the GitHub release referenced by `Binaries:`.
4. Trigger the fdroiddata pipeline.
5. F-Droid rebuilds the APK, copies the developer signature, and byte comparison passes.

If it fails, the failure must produce artifacts that identify the exact class of difference:

- `.so`
- `classes.dex`
- `baseline.prof` or `baseline.profm`
- resources / PNGs / manifest
- ZIP ordering / signing / alignment

---

## Current Understanding

### Already aligned with the template

Per current notes and YAML snapshot:

- `subdir: android/app`
- npm-based install for `v1.7.2`
- Expo `buildFromSource` patch
- JDK 17 → 21 patch
- `expo prebuild --clean`
- `signingConfig` removal
- `scandelete: node_modules`
- file-level `scanignore`

### Already known to be wrong

- A reference APK built with EAS will not match.
- A reference APK built on the host OS is likely to differ from F-Droid because native libs can embed paths/toolchain details.
- Removing Expo prebuild is not acceptable.
- Broad `scanignore` is not acceptable.

### Most likely remaining reproducibility risks

- embedded build paths in native `.so` files
- `baseline.prof` / `baseline.profm`
- native lib stripping / build-id / `.comment`
- PNG/vector generation
- CPU / worker-count sensitivity affecting native or dex outputs
- any post-prebuild Gradle changes that are applied locally but not mirrored in recipe form

---

## Phase 1 — Freeze the Template Contract

Goal: define exactly what must stay fixed between the fdroiddata YAML and the local reference build script.

### Required output

Produce a checklist with these items and keep it current:

- `init` commands
- `prebuild` command order
- every `sed` patch
- every `scanignore`
- `ndk` version
- JDK expectation
- Gradle invocation
- working directory path

### Rule

If the local Docker build script differs from the YAML in any patching step, treat the local APK as invalid for `Binaries:`.

---

## Phase 2 — Canonical Reference Build Path

Goal: build the release APK the same way F-Droid conceptually does, but signed with the developer keystore so it can be uploaded as `Binaries:`.

### Required properties

- fresh clone inside container
- working directory must match F-Droid path as closely as possible:
  - `/home/vagrant/build/com.flyboybyte.dragtree`
- apply the same prebuild edits as the YAML
- run Expo prebuild
- run Gradle release build
- sign with the real keystore
- do not mount the repo as the source tree

### Explicitly not allowed

- building from `/home/logan/projects/drag-tree`
- reusing an already-mutated working tree
- using a different patch script than the YAML
- uploading an APK built from a different source state than the commit in metadata

---

## Phase 3 — Make Gradle Reproducibility-Friendly

Goal: reduce nondeterminism in the APK produced after Expo prebuild.

### Files to control

- [android/app/build.gradle](/home/logan/projects/drag-tree/android/app/build.gradle)
- [android/gradle.properties](/home/logan/projects/drag-tree/android/gradle.properties)
- any native build files under `android/`

### Candidate fixes to evaluate

These are not all “apply immediately”. They are the ranked queue.

1. Disable baseline profile generation

Suggested pattern from F-Droid docs:

```gradle
tasks.whenTaskAdded { task ->
    if (task.name.contains("ArtProfile")) {
        task.enabled = false
    }
}
```

2. Disable generated vector drawable densities if relevant

3. Disable or control VCS info embedding if AGP version requires it

4. Prevent native stripping nondeterminism

Example target:

```gradle
android {
    packagingOptions {
        doNotStrip '**/*.so'
    }
}
```

5. Control NDK build-id if native outputs still differ

Example target:

- `-Wl,--build-id=none`

6. Remove `.comment` section only if diff evidence proves it matters

7. Keep PNG crunch disabled in both committed Gradle state and recipe-applied patches

### Critical rule

If Expo prebuild regenerates a file, the real fix must live in recipe-applied post-prebuild edits too, not only in committed `android/`.

---

## Phase 4 — Keep Template and Gradle in Sync

Goal: no split-brain between committed app files, local Docker build, and fdroiddata metadata.

### Sync model

- committed app files express the intended Gradle state
- YAML `prebuild` expresses any edits needed after Expo regenerates `android/`
- local Docker build script must replay the YAML edits, in the same order

### Required check after every change

For each reproducibility fix, answer:

1. Is this in a file that Expo regenerates?
2. If yes, where is the matching YAML `prebuild` patch?
3. Does the local Docker build script apply the same patch?
4. Did `rewritemeta` preserve canonical formatting?

---

## Phase 5 — Build, Upload, Trigger

### Build

Use a Docker or Podman build based on the F-Droid buildserver image. Keep:

- fresh clone
- host networking if needed
- fixed output directory per attempt
- build log capture

### Verify locally before upload

- `apksigner verify --print-certs`
- confirm signing cert matches `AllowedAPKSigningKeys`
- keep the exact APK used for upload under an attempt directory

### Upload

Upload only the APK built by the canonical Docker path to the GitHub release referenced by `Binaries:`.

### Trigger

Use the GitLab pipeline only after:

- YAML is finalized for that attempt
- `rewritemeta` is clean
- uploaded APK is confirmed to match the current attempt state

---

## Phase 6 — Artifact Capture Per Attempt

Goal: every failure leaves enough evidence to guide the next change.

### Directory layout

```text
/home/logan/dragtree-fdroid-build/
├── builds/
│   └── attempt-YYYYMMDD-HHMM/
│       ├── build.log
│       ├── drag-tree-v1.7.2.apk
│       ├── metadata.yml
│       ├── patch-sequence.txt
│       └── notes.md
├── pipeline/
│   └── run-<pipeline-id>/
│       ├── jobs.txt
│       ├── fdroid-unsigned.apk
│       ├── diff-raw.txt
│       ├── diffoscope.txt
│       └── notes.md
└── ANALYSIS.md
```

### Minimum evidence for each run

- commit SHA used for source
- exact YAML used
- exact patch sequence applied locally
- build image tag
- working directory path inside container
- output APK checksum
- signing cert fingerprint
- pipeline ID
- diff summary

---

## Phase 7 — Failure Triage Order

Do not guess randomly. Triage in this order:

1. Confirm source equivalence
   - same commit
   - same YAML patch sequence
   - same Expo prebuild usage

2. Confirm environment equivalence
   - same container family
   - same NDK
   - same JDK major
   - same build path

3. Compare APK structure
   - native libs
   - dex
   - baseline profiles
   - resources

4. Apply one fix class only
   - scanner/template fix
   - Gradle nondeterminism fix
   - native-linker fix
   - profile/resource fix

5. Rebuild reference APK and rerun pipeline

---

## Immediate Next Push Strategy

The next push should aim for “closer to reproducible”, not “try everything”.

### Step 1

Freeze the current template-compliant YAML shape and ensure the local Docker build script mirrors it exactly.

### Step 2

Build the release APK with Gradle inside the F-Droid-like container using the same patch sequence.

### Step 3

Upload that APK as the `Binaries:` target.

### Step 4

Run the pipeline and capture full artifacts.

### Step 5

Only after seeing the diff, choose the next Gradle reproducibility fix. Most likely first candidate:

- disable baseline profile generation

Second tier if native libs still differ:

- `doNotStrip '**/*.so'`
- build-id control

---

## What Not To Do Again

- do not use EAS APKs for `Binaries:`
- do not remove Expo prebuild to “simplify” matching
- do not build the reference APK from the host working tree
- do not change multiple reproducibility knobs before one measured run
- do not rely on memory-tuning changes as if they are reproducibility fixes
- do not upload an APK unless its patch sequence is documented

---

## Fallback

If reproducible build still fails after controlled Gradle-focused attempts, keep the evidence and decide whether to:

1. continue pursuing `Binaries:` for `v1.7.2`, or
2. drop `Binaries:` temporarily and publish with `AllowedAPKSigningKeys` only, then revisit reproducibility in `v1.7.3`

That fallback should only happen after at least one clean attempt using:

- template-compliant YAML
- Docker-built reference APK
- same patch sequence
- captured diff artifacts
