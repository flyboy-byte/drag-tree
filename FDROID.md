# F-Droid — Current State

MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671  
fdroiddata fork: `flyboy-byte/fdroiddata`, branch `com.flyboybyte.dragtree`

**Status: COMPLETE — pipeline passing, MR awaiting reviewer merge (2026-07-19)**

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

## Next Action

**ABI splits requested by reviewer (linsui).** Current state: CI passing on reviewer's two small fixes (commit `147ad07e`). ABI split work not started.

Rollback point: `147ad07e` on `flyboy-byte/fdroiddata` branch `com.flyboybyte.dragtree` — verified passing, `Binaries:` byte comparison confirmed. To revert: `git reset --hard 147ad07e && git push --force origin com.flyboybyte.dragtree`

---

## ABI Split Plan (in progress)

Reviewer noted: arm64-v8a (24M), armeabi-v7a (23M), x86 (25M), x86_64 (24M), 93M total. Splits are "not a hard requirement" but "highly encouraged."

### Why two pipeline runs are required

`Binaries:` byte comparison requires signing F-Droid's unsigned APK output. We cannot produce reference APKs before F-Droid has built them. Therefore:

- **Run 1** — Push YAML with 4 ABI split build blocks, no `Binaries:` entries. Pipeline builds all 4 unsigned APKs. Download them from CI artifacts.
- **Sign + upload** — Sign each unsigned APK with `--alignment-preserved true --v1-signing-enabled false`. Upload to GitHub release v1.7.2 with ABI-specific filenames.
- **Run 2** — Add per-build `Binaries:` to each block. Push. Pipeline verifies byte comparison for all 4.

### YAML structure

```yaml
VercodeOperation:
  - 10 * %c + 1   # armeabi-v7a → versionCode 141
  - 10 * %c + 2   # arm64-v8a   → versionCode 142
  - 10 * %c + 3   # x86         → versionCode 143
  - 10 * %c + 4   # x86_64      → versionCode 144
```

Each build block is identical except for the `abiFilters` sed at the end of `prebuild`:

```bash
# armeabi-v7a block:
sed -i '/defaultConfig {/a\        ndk { abiFilters "armeabi-v7a" }' android/app/build.gradle

# arm64-v8a block:
sed -i '/defaultConfig {/a\        ndk { abiFilters "arm64-v8a" }' android/app/build.gradle

# x86 block:
sed -i '/defaultConfig {/a\        ndk { abiFilters "x86" }' android/app/build.gradle

# x86_64 block:
sed -i '/defaultConfig {/a\        ndk { abiFilters "x86_64" }' android/app/build.gradle
```

### Reference APK naming convention

```
drag-tree-v1.7.2-armeabi-v7a.apk
drag-tree-v1.7.2-arm64-v8a.apk
drag-tree-v1.7.2-x86.apk
drag-tree-v1.7.2-x86_64.apk
```

### Per-build Binaries: pattern (Run 2)

```yaml
Binaries: https://github.com/flyboy-byte/drag-tree/releases/download/v%v/drag-tree-v%v-armeabi-v7a.apk
```

Each block gets its own `Binaries:` with the matching ABI filename.

### build.sh for ABI split reference APKs

Same container command as before. Before running, add to the signing section:

```bash
# Run once per ABI — change ABI_NAME and abiFilters value each time
ABI_NAME="arm64-v8a"
# In prebuild section, add after the signingConfig sed:
sed -i '/defaultConfig {/a\        ndk { abiFilters "'"$ABI_NAME"'" }' android/app/build.gradle
# Output file:
OUTPUT="/output/drag-tree-v1.7.2-${ABI_NAME}.apk"
```

Sign each from the corresponding F-Droid unsigned APK (downloaded from Run 1 pipeline artifacts), not from a local build output.

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

### fdroiddata paths

- YAML: `/home/logan/projects/fdroiddata/metadata/com.flyboybyte.dragtree.yml`
- build.sh: `/home/logan/dragtree-fdroid-build/build.sh`
