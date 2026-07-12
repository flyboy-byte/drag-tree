# F-Droid Reproducible Builds — Research & Session Notes

Role of this file:

- background research
- session notes
- long-form findings

Do not use this as the primary action doc. For actual execution flow, use [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md).

## F-Droid Official Docs (https://f-droid.org/docs/Reproducible_Builds/)

### Core Mission
F-Droid pursues reproducible builds to enable "software build processes that anyone can run repeatedly and reproduce the exact same APK as the original release." Goal is "Diverse Double-Compiling" — using entirely distinct build tool sets to create identical binaries.

### How Verification Works
APK v2/v3 signatures cover ALL bytes except the signature block itself. This means APKs must be completely byte-for-byte identical before signing. F-Droid verifies by:
1. Downloading reference APK from `Binaries:` URL
2. Building unsigned APK from source using fdroiddata YAML
3. Copying developer signature onto unsigned APK
4. Verifying the result — if byte comparison fails, publication is skipped

### Every Known Source of Non-Determinism

**Build system:**
- Android Studio creates non-deterministic ZIP ordering (fixed in Gradle plugin 7.1.X+)
- `apksigner` from build-tools 35.0.0-rc1 outputs unverifiable APKs
- VCS info embedded by default (Android Gradle Plugin 8.3+) — fix: `vcsInfo.include false`
- ZIP metadata extensions
- CPU concurrency affects `.dex` files and native code

**Resources/assets:**
- `baseline.prof` and `baseline.profm` files — non-deterministic
- PNG optimization tools (aapt2 PNG crunching) — non-deterministic
- PNGs generated from vector drawables — non-deterministic
- Platform revision mismatches in AndroidManifest.xml

**Native (.so files):**
- NDK build-id — random by default; fix: `--build-id=none` linker flag
- NDK hash-style differences across platforms; fix: `--hash-style=gnu`
- NDK `.comment` section (clang version string differs MacOS/Linux since r26); fix: `objcopy --remove-section .comment`
- Embedded build paths in DWARF debug sections
- Native library stripping produces intermittent issues; fix: `doNotStrip '**/*.so'`

**Java/Kotlin (classes.dex):**
- R8 optimizer generates non-deterministic bytecode; fix: update to 8.6.33+, disable specific optimizations in proguard-rules.pro
- DEX classes appearing in wrong order
- Resource Shrinker non-deterministic
- `coreLibraryDesugaring` bug (fixed in R8 3.0.69+)
- Line ending differences (Windows vs Linux)

**Third-party:**
- AboutLibraries plugin embeds timestamps; fix: `excludeFields = ["generated"]`
- EventBus generates non-deterministic code

### Fixes We've Applied

| Issue | Fix | Status |
|---|---|---|
| PNG crunching | `android.enablePngCrunchInReleaseBuilds=false` in gradle.properties + sed in YAML | ✅ Done |
| Missing librnscreens.so, libreact_codegen_rnsvg.so | Added react-native-screens and react-native-svg to scanignore | ✅ Done |
| Scanner modifying async-storage, safe-area-context, keyboard-controller build.gradle | Added to scanignore | ✅ Done |

### Fixes Not Yet Applied

| Issue | Fix to apply |
|---|---|
| NDK build-id randomness | Add `--build-id=none` via CMake or linker flags |
| NDK .comment section | `objcopy --remove-section .comment` post-build, or `-DANDROID_LD_FLAGS` |
| baseline.prof non-determinism | Disable baseline profile generation in build.gradle |
| R8 non-determinism | Add proguard rules or update R8 version |

### Diagnostic Tools
- **diffoscope** — best tool for identifying exactly which bytes differ and why
- **reproducible-apk-tools** — scripts for fixing ZIP ordering determinism
- **Wiki HOWTO** — https://gitlab.com/fdroid/wiki/-/wikis/HOWTO:-diff-&-fix-APKs-for-Reproducible-Builds

---

## Our Session History — What We Tried and What Happened

### Environment
- F-Droid builds on: Debian trixie, `registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie`
- Working dir in F-Droid sandbox: `/home/vagrant/build/com.flyboybyte.dragtree`
- NDK: 27.1.12297006 (r27b), at `/opt/android-sdk/ndk/27.1.12297006`
- JDK: openjdk-21-jdk-headless (Debian trixie)
- Build tools: 36.0.0

### Attempt History

**Attempt 1 — Arch Linux local build**
- Built reference APK on Arch Linux
- F-Droid builds on Debian trixie
- Result: all .so files differed, classes.dex differed. Expected — completely different OS.

**Attempt 2 — Docker with mounted local repo (Option B, with expo prebuild)**
- Used fdroidserver Docker image but mounted `/home/logan/projects/drag-tree` into container
- expo prebuild ran inside Docker but on already-existing files, not a clean clone
- Result: expo prebuild non-deterministic when starting from different states on different OSes. .so files still differed.

**Attempt 3 — Docker with mounted local repo (Option A, no expo prebuild)**
- Tried removing expo prebuild entirely
- User correction: template requires expo prebuild — Option A is NOT acceptable
- This was the repeated mistake: deviating from the template

**Attempt 4 — Docker fresh clone (Option A, no expo prebuild)**
- Fresh `git clone` to `/home/vagrant/build/com.flyboybyte.dragtree` (matching F-Droid's path)
- No expo prebuild
- Build succeeded, APK produced
- Uploaded to GitHub releases
- Pipeline ran — missing librnscreens.so and libreact_codegen_rnsvg.so from F-Droid build
- Root cause: F-Droid scanner was modifying react-native-screens and react-native-svg build.gradle files (removing local maven repo references), breaking their native compilation

**Attempt 5 — Added scanignore for react-native-screens and react-native-svg**
- Added these two packages to scanignore
- Pipeline ran — unknown result (user deleted pipeline, switching to expo prebuild)

**Attempt 6 — Docker fresh clone (Option B, with expo prebuild) + all scanignore fixes + PNG crunch fix**
- Current attempt
- build.sh: fresh clone, expo prebuild, PNG crunch sed, Xmx3g, workers.max=1, parallel=false, --no-daemon, NODE_OPTIONS=512MB
- Status: Docker build OOMing during Gradle/Metro phase — fix applied (Xmx3g), needs re-run

### Key Insight: Why Reference APK Must Be Built in Docker

DWARF debug sections in .so files embed source file paths. If our reference build happens at `/home/logan/projects/drag-tree` but F-Droid builds at `/home/vagrant/build/com.flyboybyte.dragtree`, the paths differ → .so files differ byte-for-byte even with identical source and toolchain.

Fix: always build reference APK in Docker with working dir `/home/vagrant/build/com.flyboybyte.dragtree` (fresh clone, not mount).

### Key Insight: expo prebuild --clean Regenerates android/

`expo prebuild -p android --clean` deletes and fully regenerates the `android/` directory. This means:
- The committed `android/gradle.properties` is a snapshot of what expo generates — it will be overwritten
- Any settings we need must be applied VIA SED IN THE YAML after expo prebuild runs
- The PNG crunch fix is a sed in the YAML (not just the committed gradle.properties)
- Both our Docker build AND F-Droid's build start from the same expo-generated android/ — this is why expo prebuild on both sides improves byte-match odds

### Key Insight: Scanner Runs AFTER expo prebuild

The F-Droid scanner (fdroidserver) scans for binary blobs and maven-fetching build.gradle patterns AFTER expo prebuild runs. If a build.gradle contains a local maven repo URL, the scanner removes it. This breaks native compilation for that package.

- `scanignore` entries tell the scanner to leave specific files alone
- `scandelete` removes entire directories (we use it for node_modules binary blobs)
- The scanner was breaking react-native-screens and react-native-svg — fixed with scanignore

### YAML Formatting Gotcha

The F-Droid CI uses fdroidserver git master (not the packaged 2.4.2 version). The two versions format YAML differently. Always verify with git master:
```bash
cd /home/logan/projects/fdroiddata
PYTHONPATH=/tmp/fdroidserver-master python3 /tmp/fdroidserver-master/fdroid rewritemeta com.flyboybyte.dragtree
```

### Docker OOM History

The Gradle daemon gets OOM-killed when:
- Metro bundler (Node.js) runs concurrently with Gradle (~512MB heap each)
- NDK compilation runs multiple workers simultaneously
- Total peaks above available RAM

Applied fixes:
- `org.gradle.jvmargs=-Xmx3g` (was 4g in committed file, which is too high for Docker)
- `org.gradle.parallel=false`
- `org.gradle.workers.max=1`
- `NODE_OPTIONS=--max-old-space-size=512`
- `./gradlew --no-daemon`

NOTE: These Gradle settings are applied IN build.sh ONLY, after expo prebuild regenerates gradle.properties. They are NOT in the YAML — F-Droid's sandbox uses its own defaults.

---

## NDK Non-Determinism Deep Dive

Even with identical source, NDK/clang can produce different .so files due to:

### Build-ID
By default, NDK generates build IDs as a SHA1 hash of the file content. If content is identical, build-ID should be identical. But if ANY input differs (source paths, flags, environment), build-ID changes.

Fix for explicit randomness: `--build-id=none` via:
- CMakeLists.txt: `add_link_options("LINKER:--build-id=none")`
- Or Android Gradle: `android.defaultConfig.externalNativeBuild.cmake.arguments "-DANDROID_LD_FLAGS=-Wl,--build-id=none"`

### .comment Section
NDK clang embeds its version string in the `.comment` ELF section. Since NDK r26, this string differs between macOS and Linux builds. Both F-Droid and our Docker use NDK 27.1.12297006 on Debian trixie → should be identical.

Fix if needed: `objcopy --remove-section .comment` applied to all .so files post-build.

### Link Order
CMake specifies object file order explicitly in its link command, so parallel compilation should not affect .so content. Workers.max=1 vs workers.max=2 should not change .so output.

---

## Remaining Unknowns

1. **Will expo prebuild produce identical android/ on two different Debian trixie systems?** Not yet confirmed. If expo generates timestamps or random values in any generated file, byte comparison will always fail.

2. **After fixing PNG crunching and scanignore, do the .so files now match?** We haven't had a successful comparison run yet with all fixes applied.

3. **baseline.prof** — likely non-deterministic, may need to be disabled.

---

## Next Research-Guided Fix Order

Based on the F-Droid reproducible-build docs, the next likely fixes for this app should be attempted in this order:

1. **Build-path equivalence first** — same commit, same patch sequence, same Debian/F-Droid-like path, same Gradle path.
2. **baseline profile control** — if profile assets differ, disable `ArtProfile` tasks before chasing lower-signal causes.
3. **Native library stability** — if `.so` files differ, check path embedding and stripping before linker-flag changes.
4. **Linker/build-id control** — only after a measured `.so` diff still points there.
5. **Resource or ZIP tooling cleanup** — use `diffoscope` or reproducible-apk-tools only after the direct source cause is unclear.
