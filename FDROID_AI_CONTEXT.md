# F-Droid Submission — AI Context Brief

Read this before touching anything. It captures the non-obvious lessons from a complete Expo/React Native F-Droid submission (DragTree v1.7.2, MR #41671). The official docs won't tell you most of this.

---

## What this repo did

Got an Expo SDK 54 / React Native 0.81.5 Android app accepted to F-Droid with:
- Full reproducible build (`Binaries:` byte comparison passing)
- ABI splits (4 separate APKs: armeabi-v7a, arm64-v8a, x86, x86_64)
- Reviewer satisfied, MR awaiting merge

The submission process took ~2 weeks of iteration. This doc is what we wish we'd had on day one.

---

## The reviewer (linsui) — what they actually want

- **Follow the React Native template exactly.** Not "inspired by" — exactly. Template lives at `templates/build-react-native.yml` in fdroiddata. When asked "which parts?", linsui said "every part."
- **`npx expo prebuild -p android --clean` stays in the recipe.** Non-negotiable. Do not remove it, do not reframe it.
- **Patch JDK 17 → 21 via sed** in the RN gradle plugin (as in the template). Do not install Temurin or add JDK to `sudo:`.
- **`scandelete: node_modules`** must be present.
- **`scanignore` must be file-level**, not package-level. Only the Hermes binary and specific Gradle files. No broad `node_modules/**` entries.
- **Both `Binaries:` and `AllowedAPKSigningKeys:` required.** `AllowedAPKSigningKeys` alone does not enable reproducible builds — linsui will explicitly reject it.
- **Do not use local `rewritemeta`** to fix YAML format. The local version and CI version produce different output. Push and copy the exact diff from the CI rewritemeta job. One iteration.
- **ABI splits are "highly encouraged"** for React Native apps (confirmed with linsui). Not a hard blocker but expect a request.

---

## The two-run process (required for Binaries:)

You cannot produce the reference APK before F-Droid builds it. The reference must be signed from F-Droid's own unsigned output.

1. **Run 1** — Push YAML with build blocks but NO `Binaries:` entries. Wait for pipeline. Download unsigned APKs from CI job artifacts.
2. **Sign** — `apksigner sign --v1-signing-enabled false --alignment-preserved true --out ref.apk fdroid_unsigned.apk`
3. **Verify cert** — must match `AllowedAPKSigningKeys` fingerprint before uploading
4. **Upload** to GitHub release (all ABI APKs if doing splits)
5. **Run 2** — Add `binary:` to each build block. Push. Byte comparison runs.

Do not upload reference APKs before Run 2 if doing ABI splits — all 4 must be uploaded before pushing Run 2.

---

## The four reproducible build root causes (and fixes)

All four must be present. Miss one and byte comparison fails.

### 1. LAN IP embedded in `resources.arsc`

`getHostIpAddress()` in `AgpConfiguratorUtils.kt` embeds the build machine's LAN IP as a string resource. F-Droid's server has a different IP → different `resources.arsc`.

**Fix in `prebuild:`:**
```bash
sed -i 's/\.filter { it is Inet4Address && !it.isLoopbackAddress }/.filter { false }/' \
  node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/AgpConfiguratorUtils.kt
```

### 2. `.so` path leakage (`GRADLE_USER_HOME`)

Gradle transform cache embeds `GRADLE_USER_HOME` in `.so` files via `__FILE__` macros in `propsConversions.h`. F-Droid's server runs as `vagrant` → `/home/vagrant/.gradle`. A local build uses a different home path → different bytes in every `.so`.

**Fix for local reference build only** (F-Droid's server already uses this path):
```bash
export GRADLE_USER_HOME=/home/vagrant/.gradle
```
This goes in `build.sh` for your local Docker reference build, not in the YAML.

### 3. Glide `classes.dex` non-determinism

`expo-image` brings in Glide, whose `IndexerGenerator` uses JVM-identity hash codes → non-deterministic class name → different `classes.dex` every build.

**Fix:** A Gradle init script (`scripts/glide-deterministic.init.gradle`) that hooks `kaptReleaseKotlin` and renames the output to a deterministic UUID.

**Note for this repo:** `expo-image` was removed from DragTree's dependencies. Glide is gone. This fix is no longer needed here. If you re-add `expo-image`, you need this back.

### 4. ZIP structure / `apksigner` 0xD935 padding

`apksigner` converts null-byte ZIP alignment padding to structured 0xD935 extra fields when signing. The v2/v3 signing block's `CHUNKED_SHA256` is computed over these bytes. F-Droid's `sigcp` copies your signing block onto their unsigned APK (which has null-byte padding) → `CHUNKED_SHA256` mismatch → verification fails.

**Fix:** Sign F-Droid's unsigned APK directly (from pipeline artifacts), not a locally-built unsigned APK. Use:
```bash
apksigner sign \
  --ks /path/to/keystore.jks \
  --ks-key-alias <alias> \
  --ks-pass pass:<pw> \
  --key-pass pass:<pw> \
  --v1-signing-enabled false \
  --alignment-preserved true \
  --out ref.apk \
  fdroid_unsigned.apk
```
`--alignment-preserved true` preserves the null-byte padding so the ZIP structure matches.

---

## ABI splits — `ndk { abiFilters }` does NOT work

This one is a trap. `ndk { abiFilters }` in `defaultConfig` looks right and the build succeeds, but it produces universal APKs. In AGP 8.x, prebuilt `.so` files from RN npm packages (libhermes, libreactnative, etc.) are bundled via AAR extraction at APK assembly time and completely bypass the packaging pipeline that `abiFilters` and `packagingOptions.exclude` intercept.

**Use `android.splits.abi` instead.** This operates at Gradle's APK variant assembly level and genuinely separates native libs. Inject it via sed on the `^android {$` line:

```bash
# Replace "armeabi-v7a" with the target ABI per build block
sed -i 's/^android {$/android {\n    splits { abi { enable true; reset(); include "armeabi-v7a"; universalApk false } }/' android/app/build.gradle
```

Cannot combine `splits { abi }` with `ndk { abiFilters }` — `react-native-gradle-plugin` throws a conflict error. Do not use both.

After Run 1, verify ABI content before signing:
```bash
unzip -l unsigned.apk | grep '\.so'
# Must show ONLY lib/armeabi-v7a/ — no other ABI directories
```
If you see all 4 ABI dirs, the splits sed didn't work (check for abiFilters conflict, check sed pattern).

---

## YAML formatting gotchas (rewritemeta canonical format)

CI rewritemeta is strict about trailing spaces. These trip up every time:

- `binary:` alone on a line needs a trailing space: `binary: ` (block scalar indicator)
- `sed -i` alone on a continuation line needs a trailing space: `sed -i `
- `{ false }/'` needs a trailing space: `{ false }/' `

If CI rewritemeta fails, it outputs the exact diff it wants. Copy those changes into the YAML exactly as shown. Do not run local rewritemeta — it produces different output.

---

## VercodeOperation ordering — fixed, do not invert

```yaml
VercodeOperation:
  - 10 * %c + 1   # armeabi-v7a
  - 10 * %c + 2   # arm64-v8a
  - 10 * %c + 3   # x86
  - 10 * %c + 4   # x86_64
```

For base versionCode 14: versionCodes become 141, 142, 143, 144.

The versionCode patch in `prebuild:` must match (`sed -i 's/versionCode 14$/versionCode 141/'`). The regex `14$` anchors to end-of-line to avoid matching `142`, `143`, etc.

---

## What "not cheating" means

Signing F-Droid's own unsigned APK and uploading it as the `Binaries:` reference is the documented F-Droid workflow. It is not cheating. Byte comparison passes because the recipe is deterministic — F-Droid's Run 1 and Run 2 produce identical unsigned APKs (same bytes), proving the build is reproducible. The reference APK just shows which key signed the result.

If someone asks "are you sure this is reproducible?": yes. Run 2 is an independent rebuild from the same source commit that matches Run 1's bytes.

---

## Hard stops — do not do these under any framing

1. Remove `npx expo prebuild -p android --clean` from the recipe
2. Use an EAS-built APK for `Binaries:`
3. Build the reference APK from the host working tree (DWARF paths in `.so` files will differ)
4. Push to fdroiddata without checking for rewritemeta format issues first (push + watch CI is the check)
5. Change more than one variable class per attempt
6. Upload a reference APK before verifying its cert fingerprint
7. Push ABI split YAML before all ABI reference APKs are uploaded to the GitHub release
8. Use the universal APK as a reference for any ABI split build block
9. Invert the VercodeOperation ABI ordering

---

## Key files in this repo

- `FDROID.md` — current state, environment reference, signing commands
- `FDROID_REPRO_EXECUTION.md` — operational playbook (gate questions, experiment order, commands)
- `FDROID_MR_ACTIVITY.md` — full reviewer interaction history and constraints
- `FDROID_REPRO_RESEARCH.md` — background research (not action items)
- `metadata/com.flyboybyte.dragtree.yml` in `fdroiddata` fork — the actual YAML

Read order: FDROID.md → FDROID_REPRO_EXECUTION.md → FDROID_MR_ACTIVITY.md.

---

## Adapting this for another app

Replace:
- Package ID (`com.flyboybyte.dragtree` → your ID)
- GitHub release URL pattern
- Keystore path and alias
- `AllowedAPKSigningKeys` fingerprint (get via `apksigner verify --print-certs ref.apk | grep SHA`)
- versionCode base and the sed pattern to match it

Keep (these apply to all Expo/RN apps):
- IP address sed (AgpConfiguratorUtils.kt)
- JDK 17→21 sed (RN gradle plugin)
- `buildFromSource: [".*"]` in package.json (compiles native modules from source — required)
- `--alignment-preserved true` signing
- `android.splits.abi` approach for ABI splits
- Two-run process
- `GRADLE_USER_HOME=/home/vagrant/.gradle` in local reference build script

Check your app's transitive deps for Glide (brought in by `expo-image`, `expo-camera`, others). If Glide is present, you need the `glide-deterministic.init.gradle` fix from the commit history of this repo.
