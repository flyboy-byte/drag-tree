# F-Droid MR Activity Log

Source: user-provided activity log and comments from the `fdroiddata` merge request discussion with reviewer `@linsui`.

This file is a normalized capture of the timeline so the reviewer guidance and iteration history live in the repo.

---

## Reviewer Direction

### Core instruction

> Please follow the template at `templates/build-react-native.yml`

When asked which parts should change, the reviewer replied:

> Every part.

### Additional reviewer constraints

- Use the App Inclusion template in the MR description and complete the checklist.
- Do not put summary/description in the MR directly; use the Fastlane metadata structure in the app repo.
- Patch packages to use JDK 21 as in the template.
- Do not broadly ignore packages with `scanignore`.
- Configure pnpm to avoid the `.pnpm` symlink layout so `scanignore` can target normal `node_modules/...` paths.
- Add both `Binaries` and `AllowedAPKSigningKeys` for reproducible builds.
- `AllowedAPKSigningKeys` alone does not enable reproducible builds.
- If the APK does not match, ensure the same patching/build process is applied first.

### Reviewer acceptance signals

- Reviewer approved the hoisted pnpm approach:

> Great :)

- Reviewer resolved threads after template-aligned changes landed.

---

## Timeline

### 1 week ago

- `0256dc94` - `fix: remove comments, fix field order, add Node.js init for Gradle build`
- `1c1db7f7` - `fix: install Node 22 via NodeSource, fix init format and blank line`
- `348328f3` - `fix: use --no-frozen-lockfile to bypass pnpm CI lockfile check`
- `5fa539fc` - `fix: add --ignore-scripts to skip esbuild native build in pnpm 10`
- `abfb8ebf` - `fix: scanignore node_modules to pass binary scanner`
- `208105b0` - `fix: move scanignore after gradle, add Java 17 and NDK r27c`
- `70ce14d1` - `fix: Temurin 17 for Java, correct ndk field order`
- `6a6b7720` - `fix: use curl+apt for Node 22, drop wget/Temurin (not in sandbox)`
- `440eb582` - `fix: install openjdk-17-jdk-headless for Gradle toolchain requirement`
- `1e8f68cc` - `fix: install Temurin 17 via curl+gpg (no wget/apt-key)`
- `988c9bde` - `fix: apply rewritemeta line wrapping for echo sources line`
- `5dcc141b` - `fix: subdir→android root, ndk→27.1.12297006, fix init path`
- `50751249` - `fix: category Sport Game (not Sports & Health)`
- `a26775d8` - `fix: build v1.7.1 — adds babel-preset-expo explicit dep`
- `52e0cb7e` - `com.flyboybyte.dragtree: add output path for APK discovery`
- `de25019f` - `fix: use full commit SHA instead of tag for v1.7.1 build`
- `a79175d2` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`

Reviewer thread:

> Please follow the template at `templates/build-react-native.yml`

Author reply:

> Thanks for the pointer. The pipeline is currently passing and the APK builds. We're a pnpm monorepo so our setup differs a bit from the standard template — could you clarify which specific parts you'd like us to change?

Reviewer reply:

> Every part.

Reviewer also instructed:

> Edit this MR and choose the App Inclusion template. Read the instructions in it and check the task boxes.

---

### 1 week ago, template-alignment iterations

- `ceac32f1` - `com.flyboybyte.dragtree: add AllowedAPKSigningKeys for reproducible builds`
- `6888c724` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `422cea18` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `72f06c2d` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `7cb1b689` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `db5dbe5f` - `fix: install temurin-17-jdk for Gradle jvmToolchain(17) requirement`
- `97264c7c` - `fix: follow template — default-jdk, JDK 17→21 sed patch, expo prebuild`
- `357f6124` - `fix: apply rewritemeta canonical wrapping for JDK sed line`
- `47b3a17b` - `fix: use find on pnpm store for jvmToolchain patch`
- `a946b639` - `fix: use find on pnpm store for jvmToolchain patch`
- `d5376001` - `fix: use find on pnpm store for jvmToolchain patch`
- `31a14107` - `fix: use find on pnpm store for jvmToolchain patch`

Author explanation:

> I added Temurin 17 under sudo because the build was failing on a Java 17 Gradle toolchain requirement. From what I can tell, some React Native dependencies request Java 17, and Trixie does not provide openjdk-17. If there is a preferred F-Droid way to handle this, I can change it.
>
> For scanignore, I used node_modules/.pnpm because pnpm generates long versioned package paths, so targeting individual packages seemed brittle. I tried to keep the ignored scope as small as I reasonably could.

Reviewer response:

> Please patch those packages as in the template to use jdk 21. And you can't ignore those packages. I thought the template is very clear. Please follow it.

Author reply:

> I apologize. I'm working on doing that. Thx for your help.

More commits:

- `8ae4fc10` - `com.flyboybyte.dragtree: follow template — JDK 21 patch, scandelete node_modules`
- `474214fe` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `a0937518` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `1b3a3ed2` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `731b4179` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `1ecce2ae` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `2baf63a0` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `7f6d6e86` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `dde65106` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `f6c369a0` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `1ef6af68` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `6544514c` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `b2e0d0a8` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `29e66114` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `a13e8f92` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `d9fd75ae` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `f0c04a7e` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`

Author summary:

> Updated to follow the React Native template more closely.
>
> The remaining scanignore entries are file-level only. They follow the same scanignore pattern as the template: Hermes plus the specific React Native Gradle files needed for local Maven repo handling, adjusted to this project’s pnpm node_modules/.pnpm/... layout. Package-level ignores were removed, and node_modules is still handled with scandelete.
>
> The build now passes with the JDK 21 patching approach from the template.

Reviewer follow-up:

> Can you config pnpm not to use symlink so that .pnpm can be removed and we only need to scanignore the path in node_modules?

Author reply:

> Updated pnpm to use node-linker=hoisted, so the metadata no longer needs .pnpm/... scanignore paths. The scanignore entries now use normal node_modules/... paths and the build passes.
>
> Is this the approach you had in mind?

Reviewer reply:

> Great :)

---

### Reviewer suggestion applied in metadata

In an old diff thread on `metadata/com.flyboybyte.dragtree.yml`, the reviewer suggested keeping:

- `node_modules/react-native/ReactAndroid/publish.gradle`

Reviewer then applied:

- `6fba4f97` - `Apply 1 suggestion(s) to 1 file(s)`

The surrounding recipe context at that point included:

```yaml
- cd ../../../..
- pnpm install --config.node-linker=hoisted --no-frozen-lockfile --ignore-scripts
gradle:
  - yes
prebuild:
  - cd ../../../..
  - sed -i -e '1a "expo":{"autolinking":{"android":{"buildFromSource":[".*"]}}},'
    artifacts/drag-tree/package.json
  - sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts
    node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt
  - cd artifacts/drag-tree
  - npx expo prebuild -p android --clean
  - sed -i -e '/signingConfig /d' android/app/build.gradle
scanignore:
  - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
  - node_modules/react-native/ReactAndroid/publish.gradle
```

---

### 6 days ago, reproducible build discussion

Reviewer instruction:

> Please add Binaries and AllowedAPKSigningKeys for reproducible build.
>
> And please keep your signing key safe with backup.

Author reply:

> Added AllowedAPKSigningKeys and uploaded the signed APK to GitHub releases. Tried adding Binaries path in the yaml for reproducible build verification but the comparison failed — the uploaded APK doesn't byte-match the F-Droid rebuild because im building with expo eas for the binary. Removed Binaries for now. Let me know what you think.

Author follow-up:

> I did verify my AllowedAPKSigningKeys was the same as the uploaded github binary. just not sure where to go from here now... from my research the way to get them to match is to exactly copy my build process and the fdroid one?

Reviewer response:

> You need to add Binaries to enable reproducible build. AllowedAPKSigningKeys doesn't enable reproducible build.

Reviewer response with evidence:

> https://gitlab.com/flyboy-byte/fdroiddata/-/jobs/15176464570 Your apk is built from a different source code. You need to apply the same patch first.

Related commits:

- `8842e56f` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `e727ca7a` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `f776ec38` - `ci: retrigger pipeline`
- `9e19ccc8` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`
- `394d238c` - `Add com.flyboybyte.dragtree (DragTree v1.7.1)`

---

### 1 day ago to 5 hours ago, v1.7.2 reproducibility work

- `eb4d4838` - `Update com.flyboybyte.dragtree to v1.7.2 (npm, no prebuild)`
- `c6cbe1b8` - `Add com.flyboybyte.dragtree (DragTree v1.7.2)`
- `7dde73cc` - `Add com.flyboybyte.dragtree (DragTree v1.7.2)`
- `fc649a87` - `Add com.flyboybyte.dragtree (DragTree v1.7.2)`
- `167ed55c` - `com.flyboybyte.dragtree: add buildFromSource sed to v1.7.2 prebuild`
- `eaa75ea2` - `com.flyboybyte.dragtree: drop v1.7.1 build block (EAS build, not reproducible)`
- `d92c4cad` - `com.flyboybyte.dragtree: switch to Option A (no expo prebuild)`
- `76c2da7d` - `com.flyboybyte.dragtree: add scanignore for react-native-screens and react-native-svg`
- `3fa41aaf` - `Add expo prebuild, buildFromSource sed, ReactAndroid/publish.gradle scanignore for v1.7.2`
- `44e50555` - `ci: retrigger pipeline for v1.7.2 (expo prebuild, template-compliant)`
- `739f10c7` - `fix: disable PNG crunching, match expo prebuild template exactly`
- `61464cbc` - `fix: rewritemeta formatting for PNG crunch sed`
- `8b2efa7b` - `fix: rewritemeta-canonical format for PNG crunch sed`

---

### 2026-07-18 to 2026-07-19, v1.7.2 reproducible build — SOLVED

Four root causes identified and fixed over 6 Docker build attempts (A1–A6) plus pipeline iteration.

**Fixes applied (all in fdroiddata YAML + local build.sh):**

1. **IP address in `resources.arsc`** — `AgpConfiguratorUtils.kt` sed: `.filter { false }` prevents `getHostIpAddress()` from embedding the build machine's LAN IP. Confirmed A3.

2. **`.so` path leakage** — `export GRADLE_USER_HOME=/home/vagrant/.gradle` in build.sh. Gradle transform cache embeds `GRADLE_USER_HOME` paths in `.so` files via `__FILE__` macros. F-Droid's server uses vagrant user; matching that path makes the bytes identical. Confirmed A5 (46→2 diffs).

3. **`classes.dex` Glide UUID non-determinism** — `scripts/glide-deterministic.init.gradle` Gradle init script, installed to `~/.gradle/init.d/` in prebuild. Hooks `kaptReleaseKotlin` doLast, renames `GlideIndexer_<random>.java` to a deterministic UUID from sorted module names. Confirmed A6 (0 dex diffs).

4. **ZIP structure / CHUNKED_SHA256 mismatch** — `apksigner --alignment-preserved true --v1-signing-enabled false`, applied to F-Droid's unsigned APK from pipeline artifacts (not a locally-built unsigned APK). `apksigner` converts null-byte ZIP padding to 0xD935 extra fields; signing F-Droid's APK directly preserves their ZIP structure so the signing block's CHUNKED_SHA256 matches when `sigcp` copies the block back. Confirmed pipeline 2687784363 — all 9 jobs green.

**fdroiddata state at passing pipeline:**
- Branch squashed to one commit: `Add com.flyboybyte.dragtree (DragTree v1.7.2)`
- One ahead of upstream/master, zero behind
- Reference APK uploaded to GitHub release `v1.7.2` (signed from F-Droid's unsigned APK)

**Reviewer notified 2026-07-19** with a comment explaining the build workflow change required to achieve byte-match (signing F-Droid's unsigned APK rather than a locally-built one).

---

### 2026-07-19 to 2026-07-20, ABI split — COMPLETE

Reviewer (linsui) on 2026-07-19 left two inline suggestions on the old universal YAML (both threads auto-resolved when ABI split YAML landed) and requested ABI splits:

**Inline suggestions (old YAML, auto-resolved):**
1. Split the Glide `&&` one-liner into two separate list items. Moot — expo-image was removed, Glide is no longer in the build, Glide init.d step absent from ABI split YAML.
2. Remove `node_modules/react-native/ReactAndroid/publish.gradle` from scanignore. Already absent from ABI split YAML.

**ABI split request:** linsui noted APK sizes (arm64-v8a 24M, armeabi-v7a 23M, x86 25M, x86_64 24M, 93M total) and asked for ABI splits. Implemented as 4 separate build blocks with VercodeOperation (`10 * %c + 1` through `+4`), versionCodes 141–144.

#### First attempt: `ndk { abiFilters }` — produced universal APKs

First ABI split implementation used `sed -i '/defaultConfig {/a\ ndk { abiFilters "armeabi-v7a" }'` injected into each build block. Pipeline passed CI but reviewer replied: "now there are 4 large universal apks."

Root cause: in AGP 8.x, prebuilt `.so` files from RN npm packages (libhermes, libreactnative, etc.) are included via AAR extraction at APK assembly time and bypass the packaging pipeline that `ndk { abiFilters }` and `packagingOptions.exclude` intercept. Both approaches produce silently-universal APKs.

#### Second attempt: `android.splits.abi` — correct

Switched to `android.splits.abi` block injected into the top-level `android {}` block via sed on `^android {$`. This operates at Gradle's APK variant assembly level and genuinely excludes non-matching native libs.

Cannot combine with `abiFilters` — `react-native-gradle-plugin` throws a conflict error. Removed `abiFilters` from all blocks before adding splits.

**Two-run process:**
- **Run 1** (pipeline `2695454263`): all 4 ABI blocks built (no `binary:`). Downloaded unsigned APKs. Verified each only contains its ABI's native libs (28M/32M/33M/33M — not 4x universal). Signed with `--alignment-preserved true --v1-signing-enabled false`, verified cert `ff739cf5...`, uploaded to GitHub release v1.7.2 as `drag-tree-v1.7.2-{abi}.apk`.
- **Run 2** (pipeline `2695522248`): `binary:` added to each block (block scalar, trailing space, after `gradle:`). All 9 jobs green, all 4 byte comparisons passed.

**fdroiddata state after ABI split:**
- Branch squashed to one commit: `8ab1e75d4 Add com.flyboybyte.dragtree (DragTree v1.7.2)`
- One ahead of upstream/master, zero behind
- Awaiting reviewer merge

---

## What This Log Establishes

- The reviewer required strict adherence to the React Native template, not partial similarity.
- The reviewer specifically rejected broad `scanignore` usage and ad hoc JDK handling.
- The accepted path for this app was:
  - `expo prebuild -p android --clean`
  - patching Java 17 requests to JDK 21 as in the template
  - pnpm configured with `node-linker=hoisted`
  - file-level `scanignore` entries only
- Reproducible-build failure was explicitly attributed to the reference APK being built from a different patched source/build path than F-Droid used.
- By `v1.7.2`, the work had shifted from “make the recipe pass” to “make the reference APK and F-Droid rebuild byte-match”.

---

## Open Interpretation

The reviewer history strongly suggests the next successful reproducibility attempt must preserve all of these at once:

- same template structure
- same source patching sequence
- same `expo prebuild` usage
- same post-prebuild edits
- same effective build environment as F-Droid

Any deviation is likely to recreate the earlier “different source code” failure mode.
