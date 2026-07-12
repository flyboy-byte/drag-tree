# F-Droid Repro Execution Guide

Purpose: give an agent one compact, operational source of truth for the `v1.7.2` reproducible-build effort.

This file is not the history log and not the broad research dump. It is the execution guide.

Use with:

- [FDROID.md](/home/logan/projects/drag-tree/FDROID.md) for current status
- [PLAN.md](/home/logan/projects/drag-tree/PLAN.md) for strategy and experiment order
- [FDROID_MR_ACTIVITY.md](/home/logan/projects/drag-tree/FDROID_MR_ACTIVITY.md) for reviewer constraints
- [FDROID_REPRO_RESEARCH.md](/home/logan/projects/drag-tree/FDROID_REPRO_RESEARCH.md) for background and long-form notes

---

## Goal

Produce a signed reference APK for `Binaries:` that is byte-identical to F-Droid’s rebuild after signature copying.

The reference APK must come from the same effective source tree, patch sequence, and Gradle path as the fdroiddata recipe.

Not acceptable:

- EAS APK as `Binaries:`
- host-local Gradle build as `Binaries:`
- “close enough” Docker build that does not mirror the recipe lifecycle

---

## Hard Constraints

### Reviewer constraints

From the MR history:

- Follow the official React Native template.
- `expo prebuild -p android --clean` stays.
- Use narrow file-level `scanignore`.
- Keep `scandelete: node_modules`.
- Use JDK 21 patching as in the template.
- `AllowedAPKSigningKeys` alone is not enough; `Binaries:` must work.

### Template base

Official template path:

- `/home/logan/Downloads/build-react-native.yml`

### App/version scope

This guide is for:

- `v1.7.2`
- Expo SDK 54
- React Native 0.81.5
- Debian trixie / F-Droid-like build environment
- JDK 21
- NDK `27.1.12297006`

---

## Core Model

The main risk is no longer “missing one random Gradle tweak.” The main risk is pipeline mismatch.

The first priority is to make the local reference pipeline materially identical to F-Droid’s recipe lifecycle before chasing `baseline.prof`, `.so`, or PNG differences.

---

## Working Assumptions About Lifecycle

These assumptions are high-confidence from current research and should be treated as the default model until disproven by build logs.

1. `subdir: android/app` means F-Droid runs scripted metadata phases from that subdirectory.
2. Repo-root commands therefore must explicitly `cd ../..`.
3. `expo prebuild --clean` regenerates `android/`.
4. `scandelete: node_modules` means any patch applied only inside `node_modules` before scan can be lost.
5. Automatic Gradle execution may use system `gradle`, not `./gradlew`.
6. Project-property `gradleprops` are not the right control surface for core engine flags like `org.gradle.parallel`.

Because of `4`, there are two patch classes and they must not be mixed.

---

## Two Patch Classes

### Class A: generated-Android patches

These belong after `expo prebuild --clean`, because prebuild regenerates `android/`.

Examples:

- remove release `signingConfig`
- patch generated `android/gradle.properties`
- add `vcsInfo.include false` if needed
- any reproducibility tweak in generated Gradle files

Recommended form:

- one `post-prebuild-android.patch`

### Class B: installed-node_modules patches

These belong after the post-scan reinstall, because `scandelete: node_modules` can discard them.

Examples:

- JDK 17 → 21 patch in `node_modules/@react-native/gradle-plugin/...`

Recommended form:

- one `rn-gradle-plugin-jdk21.patch`

Rule:

If a patch touches `android/`, apply it after prebuild.

If a patch touches `node_modules/`, assume it must be reapplied after reinstall.

---

## Canonical Attempt Shape

The next clean attempt should optimize for lifecycle equivalence, not for maximum tweak count.

### Minimal recipe shape

If keeping `subdir: android/app`, the effective command pattern should look like:

```yaml
init:
  - cd ../.. && npm ci

prebuild:
  - cd ../.. && EXPO_NO_GIT_STATUS=1 npx expo prebuild -p android --clean --no-install
  - cd ../.. && patch -p1 < metadata/<appid>/post-prebuild-android.patch

scandelete:
  - node_modules

build:
  - cd ../.. && npm ci
  - cd ../.. && patch -p1 < metadata/<appid>/rn-gradle-plugin-jdk21.patch

gradle: yes
```

Notes:

- The `--no-install` part should be kept only if it is consistent with actual recipe behavior and does not conflict with reviewer expectations.
- If later evidence shows F-Droid’s actual lifecycle differs, update this shape to match the logs, not guesses.

---

## First Validation Order

Do not jump directly to signed upstream-vs-F-Droid comparison.

### Step 1: A1 vs A2

Build two unsigned APKs from the same recipe, same image, same path, same inputs.

If `A1 != A2`, stop. The recipe is internally nondeterministic.

### Step 2: unsigned local vs unsigned F-Droid

Only after `A1 == A2`, compare the local unsigned recipe build against F-Droid’s unsigned build.

### Step 3: signed verification

Only after the unsigned APK is stable and matching, validate the signed reference APK with `apksigcopier`.

---

## Highest-Probability Risks

Ranked by current evidence.

1. Lifecycle mismatch between local reference build and fdroiddata recipe
2. Wrong patch timing because `expo prebuild` regenerates `android/`
3. Wrong patch timing because `scandelete: node_modules` discards patched packages
4. Gradle path mismatch: system `gradle` vs `./gradlew`
5. VCS metadata path leakage via `META-INF/version-control-info.textproto`
6. Concurrency-sensitive outputs because Expo SDK 54 template defaults `org.gradle.parallel=true`
7. Baseline profile artifacts: `baseline.prof`, `baseline.profm`
8. Native `.so` differences from stripping, path leakage, build-id, or debug sections
9. PNG crunch/resource processing differences
10. Maven dependency drift beneath a stable npm lockfile

---

## Smallest Controlled Experiment Order

### Experiment 1: lifecycle equivalence only

Change nothing byte-producing unless required for equivalence.

Keep:

- Hermes default
- New Architecture default
- ABI defaults
- baseline profile behavior
- stripping behavior
- PNG behavior

Change only:

- install timing
- prebuild timing
- patch timing
- rebuild `node_modules` after `scandelete`
- use the same Gradle path shape as F-Droid

### Experiment 2: single-threaded generated Gradle

Only if `A1 != A2`.

Patch generated `android/gradle.properties` after prebuild:

- `org.gradle.parallel=false`
- `org.gradle.workers.max=1`

Do not combine with profile or native tweaks in the same attempt.

### Experiment 3: VCS metadata suppression

Only if the APK diff shows:

- `META-INF/version-control-info.textproto`

Patch generated release build config:

```groovy
android {
  buildTypes {
    release {
      vcsInfo {
        include = false
      }
    }
  }
}
```

### Experiment 4: baseline profiles

Only if the remaining meaningful diffs are:

- `assets/dexopt/baseline.prof`
- `assets/dexopt/baseline.profm`

First ensure concurrency is already controlled. Only then consider disabling `ArtProfile` tasks.

### Experiment 5: no-strip diagnostic

Only if `.so` files are the isolated remaining diff class.

Use the existing Expo template property hook:

```yaml
gradleprops:
  - android.packagingOptions.doNotStrip=**/*.so
```

This is diagnostic first, not a default fix.

### Experiment 6: PNG crunch toggle

Only if PNG/resource entries are the isolated remaining diff class.

```yaml
gradleprops:
  - android.enablePngCrunchInReleaseBuilds=false
```

---

## Things Not To Change Yet

Do not change these unless diff evidence points there:

- disable Hermes
- disable New Architecture
- reduce ABI list
- broaden `scanignore`
- switch to EAS
- switch to host-local build path
- combine profile, native, VCS, PNG, and concurrency fixes in one attempt
- apply `--build-id=none` before proving `.so` drift actually points to linker/build-id issues

---

## Artifact Capture

Capture by stage, not just by final APK.

### Directory shape

```text
attempt-XXX/
  env/
  stage/
  deps/
  apk/
  comparison/
```

### Stage capture points

1. `s0-checkout`
2. `s1-init`
3. `s2-prebuild`
4. `s3-postscan`
5. `s4-buildprep`

Interpretation:

- `s2` drift means Expo native generation drift
- `s3` drift means scan/scandelete changed effective source tree
- `s4` drift means reinstall or post-scan patching changed build inputs

### Minimum environment capture

- commit SHA
- build image / tool versions
- `java -version`
- `gradle --version`
- `node --version`
- `npm --version`
- absolute working directory
- NDK version

### Minimum dependency capture

- `npm ls --all --json` after prebuild-prep install
- `npm ls --all --json` after post-scan reinstall
- Gradle release runtime dependency tree

### Minimum APK capture

- ZIP entry list
- per-entry hashes
- `classes*.dex` hashes
- `META-INF/version-control-info.textproto`
- `assets/dexopt/baseline.prof`
- `assets/dexopt/baseline.profm`
- `lib/**/*.so` ELF notes/sections

---

## Diff Triage Order

1. Compare ZIP entry names
2. Compare per-entry hashes
3. Compare these first:
   - `META-INF/version-control-info.textproto`
   - `classes*.dex`
   - `assets/dexopt/baseline.prof`
   - `assets/dexopt/baseline.profm`
   - `lib/**/*.so`
4. Only if entry hashes all match, investigate ZIP metadata/alignment/signing details

Interpretation:

- only `vcs-info.textproto` differs:
  fix VCS metadata
- only baseline files differ:
  profile issue
- only `.so` differs:
  native issue
- DEX differs:
  Java/Kotlin/R8/concurrency issue
- all entries match but APK hash differs:
  ZIP metadata/alignment/signing path issue

---

## Practical Commands To Reuse

```bash
find . -type f -printf '%P\0' | sort -z | xargs -0 sha256sum > "$OUT/stage/s2-prebuild.files.sha256"
```

```bash
npm ls --all --json > "$OUT/deps/npm-tree-prebuild.json" || true
npm ls --all --json > "$OUT/deps/npm-tree-build.json" || true
```

```bash
zipinfo -1 "$APK" | sort > "$OUT/apk/zip-entries.txt"
unzip -qq "$APK" -d "$OUT/apk/unpacked"
find "$OUT/apk/unpacked" -type f -printf '%P\0' | sort -z | xargs -0 sha256sum > "$OUT/apk/entries.sha256"
```

```bash
unzip -p "$APK" META-INF/version-control-info.textproto > "$OUT/apk/vcs-info.textproto" || true
unzip -p "$APK" assets/dexopt/baseline.prof > "$OUT/apk/baseline.prof" || true
unzip -p "$APK" assets/dexopt/baseline.profm > "$OUT/apk/baseline.profm" || true
```

```bash
apksigcopier compare upstream-signed.apk local-unsigned.apk
```

Use build-tools 34 `apksigner` for compare/verification until the newer incompatibility warning is irrelevant to this workflow.

---

## Short Operating Rule

Before changing any Gradle reproducibility knob, answer these three questions:

1. Is the local reference build actually mirroring F-Droid’s lifecycle?
2. Is this patch applied at the correct stage?
3. Do I already have artifacts proving this is the next remaining diff class?

If any answer is “no”, do not make the change yet.
