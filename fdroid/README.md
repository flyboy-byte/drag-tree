# F-Droid — Current State

Listing: https://f-droid.org/packages/com.flyboybyte.dragtree/  
Original inclusion MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671 (merged 2026-09-28)  
fdroiddata fork: `flyboy-byte/fdroiddata` (local clone at `./fdroiddata/`, gitignored)

**Status (2026-10-08): v1.7.3 (161–164) live on f-droid.org. v1.7.4 release in progress — see "Releasing an update" below.**

Other docs in this folder: `AI_CONTEXT.md` (start here cold), `REPRO_EXECUTION.md` (repro playbook), `MR_ACTIVITY.md` (reviewer history), `REPRO_RESEARCH.md` (background only).

---

## Releasing an update

The merged metadata has `AutoUpdateMode: Version` + `UpdateCheckMode: Tags`. F-Droid's `checkupdates` sees a new `vX.Y.Z` tag, reads `versionName`/`versionCode` from `android/app/build.gradle` at that tag, applies `VercodeOperation` (`10 * %c + 1..4`), and adds four build blocks copied from the latest ones — including each block's `binary:` URL. So **the four signed reference APKs must already be on the GitHub release when the tag appears**, or the byte comparison fails.

Order:

1. **Bump** `version` in `app.json` + `package.json`, `android.versionCode` in `app.json`, and `versionCode`/`versionName` in `android/app/build.gradle` (checkupdates reads this file).
2. **Changelogs** — F-Droid looks up `fastlane/metadata/android/en-US/changelogs/<final versionCode>.txt`, i.e. `171.txt`–`174.txt` for base 17. (Play uses `10 * code + 0`, entered in Play Console.)
3. **Merge to `main` and push. Do not tag yet.**
4. **Run 1** — on a fresh fork branch off `upstream/master`, add four blocks for the new version (`commit:` = full SHA of the `main` commit, **no `binary:`**), bump `CurrentVersion`/`CurrentVersionCode`. Push; fix rewritemeta from the CI diff only. Download the four unsigned APKs from the build job artifacts; check each contains only its own `lib/<abi>/`.
5. **Sign** each with `--v1-signing-enabled false --alignment-preserved true`, **verify the cert** (`ff739cf5…`), then `gh release create vX.Y.Z --target <sha>` with all four `drag-tree-vX.Y.Z-<abi>.apk` attached. This creates the tag with the reference APKs already present.
6. **Run 2** — add `binary:` to the four fork blocks, push, confirm all four byte comparisons pass.
7. Leave it to `checkupdates`. The fork branch is a verification harness — don't open an MR unless the auto-update stalls.

---

## Reproducible Build — SOLVED

All four root causes of the byte-comparison failure have been identified and fixed. Pipeline 2687784363 passed all 9 jobs including `fdroid build success` with the message:

```
INFO: success: com.flyboybyte.dragtree
```

The `Binaries:` field byte comparison passed — F-Droid's rebuild matches the reference APK uploaded to GitHub releases.

### Root Causes and Fixes

**1. IP address embedded in `resources.arsc`**

`AgpConfiguratorUtils.getHostIpAddress()` in the React Native Gradle plugin embeds the build machine's LAN IP in `resources.arsc` at Gradle configuration time. F-Droid's server has a different LAN IP than the local machine → different `resources.arsc`.

Fix (in `prebuild`):
```bash
sed -i 's/\.filter { it is Inet4Address && !it.isLoopbackAddress }/.filter { false }/' \
  node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/AgpConfiguratorUtils.kt
```

Confirmed in A3.

---

**2. `.so` files differ: `GRADLE_USER_HOME` path leakage**

Gradle transform cache embeds file paths in `.so` files via `__FILE__` macros in `propsConversions.h`. F-Droid's server runs as the `vagrant` user, so its `GRADLE_USER_HOME` is `/home/vagrant/.gradle`. A local build uses a different path → different `.so` bytes in all ABIs.

Fix (in `build.sh`):
```bash
export GRADLE_USER_HOME=/home/vagrant/.gradle
```

Confirmed in A5 (reduced diffs from 46 to 2).

---

**3. `classes.dex` differs: Glide IndexerGenerator UUID non-determinism**

Glide's `IndexerGenerator` uses kapt TypeElement hash codes which are JVM-identity-based (non-deterministic). The generated `GlideIndexer_<random_uuid>.java` class name changes between builds → different `classes.dex`.

Fix: `scripts/glide-deterministic.init.gradle` — a Gradle init script that hooks into `kaptReleaseKotlin` `doLast` and renames the file to a deterministic UUID derived from alphabetically sorted module names.

Install in `prebuild`:
```bash
mkdir -p ~/.gradle/init.d && cp scripts/glide-deterministic.init.gradle ~/.gradle/init.d/
```

Confirmed in A6 (empty detail section in F-Droid pipeline — no dex diffs).

---

**4. ZIP structure mismatch: `apksigner` 0xD935 extra field conversion**

`apksigner` converts null-byte ZIP alignment padding (Gradle/zipalign format) to structured 0xD935 extra fields when signing. The v2/v3 signing block's `CHUNKED_SHA256` is computed over these bytes. F-Droid's `sigcp` copies our signing block onto their unsigned APK (which has null-byte padding) → `CHUNKED_SHA256` mismatch → verification fails.

Fix: sign F-Droid's exact unsigned APK from the pipeline artifacts with `--alignment-preserved true`:
```bash
apksigner sign \
  --ks /keystore.jks \
  --ks-key-alias e2f4affc23a7141f202d26f6d9f2d4d0 \
  --ks-pass pass:... \
  --key-pass pass:... \
  --v1-signing-enabled false \
  --alignment-preserved true \
  --out drag-tree-v1.7.2.apk \
  fdroid_unsigned.apk
```

The resulting APK has the same ZIP structure as F-Droid's build. Upload it as the `Binaries:` reference.

Confirmed in pipeline 2687784363 — all 9 jobs green.

---

## ABI Split — COMPLETE (2026-07-20)

**fdroiddata commit:** `956b3fa456` — 6 ahead of upstream/master (rebased 2026-08-03). v1.7.3 / versionCode 161–164. Run 1: `2727847747`, Run 2: `2728036212`. Reference APKs on GitHub release v1.7.3.

Reviewer (linsui) requested ABI splits after the universal build passed byte comparison. APK sizes at that point: arm64-v8a 24M, armeabi-v7a 23M, x86 25M, x86_64 24M.

### Why `ndk { abiFilters }` does NOT work (AGP 8.x + React Native)

First attempt used `ndk { abiFilters }` injected into `defaultConfig`. Reviewer replied: "now there are 4 large universal apks." Root cause: in AGP 8.x, prebuilt `.so` files from RN npm packages (libhermes, libreactnative, etc.) are included via AAR extraction at APK assembly time — they bypass the regular JNI packaging pipeline that `abiFilters` and `packagingOptions.exclude` intercept. Both approaches fail silently and produce universal APKs.

### Working solution: `android.splits.abi`

`android.splits.abi` operates at Gradle's APK **variant assembly** level — it produces a separate variant per ABI and genuinely excludes non-matching native libs. With `universalApk false` and one ABI in `include`, exactly one APK is produced per block (named `app-{abi}-release.apk`), which fdroidserver discovers and uses.

**Cannot combine with `abiFilters`** — `react-native-gradle-plugin` throws a conflict error if both are present. Remove any `abiFilters` sed before adding the splits sed.

Splits sed (per block, replace `armeabi-v7a` with the target ABI):

```bash
sed -i 's/^android {$/android {\n    splits { abi { enable true; reset(); include "armeabi-v7a"; universalApk false } }/' android/app/build.gradle
```

### Dependency removal (for CI build time)

Removed from `package.json` before this work to reduce per-ABI build time:
- `react-native-reanimated` + `react-native-worklets` → replaced with RN `Animated` API
- `react-native-gesture-handler` → removed (no gestures in use)
- `expo-image` + `expo-image-picker` + `expo-blur` + `expo-linear-gradient` + `expo-glass-effect` + `react-native-svg` + `react-native-keyboard-controller` → removed (all unused/dead)
- `@tanstack/react-query`, `zod`, and other pure-JS dead deps → removed
- Glide was brought in transitively by `expo-image` — removing expo-image removes Glide. `scripts/glide-deterministic.init.gradle` is also deleted.

App source commit: `2998a0f362fd308396643e255227d85e1eabc756`

---

## ABI Split YAML Reference

### YAML structure

```yaml
VercodeOperation:
  - 10 * %c + 1   # armeabi-v7a → versionCode 141
  - 10 * %c + 2   # arm64-v8a   → versionCode 142
  - 10 * %c + 3   # x86         → versionCode 143
  - 10 * %c + 4   # x86_64      → versionCode 144
```

Each build block is identical except for the versionCode sed and splits sed at the end of `prebuild`:

```bash
# All blocks — $VERCODE$ is substituted by fdroidserver with the block's versionCode (141/142/143/144)
sed -i 's/versionCode .*/versionCode $VERCODE$/' android/app/build.gradle

# ABI split sed — replace "armeabi-v7a" with the target ABI per block:
sed -i 's/^android {$/android {\n    splits { abi { enable true; reset(); include "armeabi-v7a"; universalApk false } }/' android/app/build.gradle
```

`$VERCODE$` is an fdroidserver template variable substituted at build time with each block's computed versionCode (from `VercodeOperation`). Using it instead of hardcoded values means YAML never needs editing when versionCode changes. Linsui applied this as an inline suggestion to block 1 (2026-07-23); applied to blocks 2–4 in the same commit.

The YAML sed lines must have a trailing space after `sed -i` (on their own line) and after `{ false }/'` — required by CI rewritemeta canonical format.

### Two-run process

`Binaries:` byte comparison requires signing F-Droid's unsigned APK. We cannot produce reference APKs before F-Droid has built them.

- **Run 1** — Push YAML with 4 ABI split build blocks, no `Binaries:` entries. Download unsigned APKs from pipeline artifacts. Verify each only contains its ABI's native libs (not 4x universal).
- **Sign + upload** — Sign each unsigned APK with `--alignment-preserved true --v1-signing-enabled false`. Verify cert fingerprint. Upload all 4 to GitHub release v1.7.2 before pushing Run 2.
- **Run 2** — Add `binary:` (block scalar, trailing space) to each block. Push. All 4 byte comparisons must pass.

### Reference APK naming convention

```
drag-tree-v1.7.2-armeabi-v7a.apk   (28M)
drag-tree-v1.7.2-arm64-v8a.apk     (32M)
drag-tree-v1.7.2-x86.apk           (33M)
drag-tree-v1.7.2-x86_64.apk        (33M)
```

### Per-build binary: pattern (Run 2)

```yaml
    binary: 
      https://github.com/flyboy-byte/drag-tree/releases/download/v%v/drag-tree-v%v-armeabi-v7a.apk
```

`binary:` is a block scalar under the build block (after `gradle:`), with a trailing space. Each block gets its own `binary:` with the matching ABI filename.

### Verify ABI content after Run 1 (before signing)

```bash
unzip -l drag-tree-unsigned-armeabi-v7a.apk | grep '\.so'
# must show ONLY lib/armeabi-v7a/ entries — no arm64, x86, x86_64
```

If you see all 4 ABI directories: the splits sed did not apply (check for abiFilters conflict).

---

## Hard Rules

1. **`npx expo prebuild -p android --clean` stays in the recipe.** Reviewer (linsui) required it. Do not remove it under any framing.
2. **Do not use EAS APKs for `Binaries:`.** The reference APK must come from the same patch sequence as the fdroiddata recipe.
3. **Do not build the reference APK from the host working tree.** DWARF paths in `.so` files will differ from F-Droid's `/home/vagrant/build/com.flyboybyte.dragtree`.
4. **Do not use local rewritemeta — it produces different output than the CI version and will break the lint check.** If YAML formatting needs fixing, push and copy the exact diff from the CI job log.
5. **One variable class per attempt.** Do not combine baseline.prof + .so + VCS fixes in one run.
6. **Verify cert before uploading.** Must match `AllowedAPKSigningKeys`: `ff739cf565d8fe3af4ff97e641f6336fa69ebcf3eec222a7a7c5ab9f8e3d837a`

---

## Environment

### YAML formatting

Do not use local rewritemeta — the local git master clone produces different output than the CI version and causes unnecessary lint failures.

If the CI rewritemeta job fails, it will output a diff showing exactly what it wants. Copy those changes into the YAML, commit, push. One iteration only.

### Docker build command

```bash
OUTDIR="/home/logan/dragtree-fdroid-build/builds/attempt-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUTDIR"
nohup podman run --rm --network host \
  -v /home/logan/dragtree-fdroid-build/build.sh:/build.sh:ro \
  -v "$OUTDIR":/output \
  -v /home/logan/@flyboybyte__drag-tree.jks:/keystore.jks:ro \
  registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie \
  bash /build.sh > "$OUTDIR/build.log" 2>&1 &
```

`--network host` required. Fresh clone only — never mount local repo. Working dir inside container: `/home/vagrant/build/com.flyboybyte.dragtree`.

### Reference APK signing (CRITICAL)

The reference APK must be signed from F-Droid's unsigned APK, not from a locally-built unsigned APK:

```bash
/opt/android-sdk/build-tools/36.0.0/apksigner sign \
  --ks /keystore.jks \
  --ks-key-alias e2f4affc23a7141f202d26f6d9f2d4d0 \
  --ks-pass pass:<pw> \
  --key-pass pass:<pw> \
  --v1-signing-enabled false \
  --alignment-preserved true \
  --out "$OUTPUT" \
  "$UNSIGNED"   # ← F-Droid's unsigned APK from pipeline artifacts
```

`--alignment-preserved true` prevents apksigner from converting null-byte ZIP padding to 0xD935 extra fields, which would break the CHUNKED_SHA256 match.

### Cert verify + upload

```bash
/home/logan/Android/Sdk/build-tools/36.0.0/apksigner verify --print-certs \
  "$OUTDIR/drag-tree-v1.7.2.apk" | grep ff739cf5

gh release upload v1.7.2 "$OUTDIR/drag-tree-v1.7.2.apk" \
  --repo flyboy-byte/drag-tree --clobber
```

### Keystore

- File: `/home/logan/@flyboybyte__drag-tree.jks`
- Alias: `e2f4affc23a7141f202d26f6d9f2d4d0`

### Signing alignment (done 2026-08-01)

Play app-signing key was changed to the developer key (`ff739cf5...`) via Play Console → "Change app signing key" → "Export and upload a key from Java keystore" + PEPK. All three stores (Play, F-Droid, GitHub releases) now share the same cert. F-Droid pipeline: zero changes needed — `AllowedAPKSigningKeys` was already `ff739cf5...`.

### fdroiddata paths

- YAML: `/home/logan/projects/fdroiddata/metadata/com.flyboybyte.dragtree.yml`
- build.sh: `/home/logan/dragtree-fdroid-build/build.sh`
