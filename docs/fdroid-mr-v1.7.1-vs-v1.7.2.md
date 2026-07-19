# F-Droid MR: v1.7.1 YAML vs v1.7.2 YAML

Comparison of the v1.7.1 recipe (last approved pnpm-based version) against the v1.7.2 recipe (MR #41671 version 53, which the reviewer explicitly approved by editing it).

This file is kept for reference — understanding what changed between versions is useful for future submissions and for explaining the recipe structure to new contributors.

MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671

---

## v1.7.1 YAML (pnpm, monorepo subdir, no Binaries:)

```yaml
Categories:
  - Sport Game
License: MIT
AuthorName: flyboy-byte
WebSite: https://flyboy-byte.github.io/drag-tree/
SourceCode: https://github.com/flyboy-byte/drag-tree
IssueTracker: https://github.com/flyboy-byte/drag-tree/issues

AutoName: DragTree

RepoType: git
Repo: https://github.com/flyboy-byte/drag-tree

Builds:
  - versionName: 1.7.1
    versionCode: 13
    commit: 7d3e4533a11a0c012ebd8b6abbef447ef65bd95d
    subdir: artifacts/drag-tree/android/app
    sudo:
      - apt-get update
      - apt-get install npm
      - npm -g install pnpm@10
    init:
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
      - node_modules/@react-native-async-storage/async-storage/android/build.gradle
      - node_modules/react-native-safe-area-context/android/build.gradle
      - node_modules/react-native-keyboard-controller/android/build.gradle
    scandelete:
      - node_modules
    ndk: 27.1.12297006

AllowedAPKSigningKeys: ff739cf565d8fe3af4ff97e641f6336fa69ebcf3eec222a7a7c5ab9f8e3d837a

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.7.1
CurrentVersionCode: 13
```

---

## v1.7.2 YAML (npm, flat subdir, Binaries:, Glide fix, IP fix)

Version 53 of MR #41671 — the version the reviewer approved (linsui edited this directly).

```yaml
Categories:
  - Sport Game
License: MIT
AuthorName: flyboy-byte
WebSite: https://flyboy-byte.github.io/drag-tree/
SourceCode: https://github.com/flyboy-byte/drag-tree
IssueTracker: https://github.com/flyboy-byte/drag-tree/issues

AutoName: DragTree

RepoType: git
Repo: https://github.com/flyboy-byte/drag-tree
Binaries: https://github.com/flyboy-byte/drag-tree/releases/download/v%v/drag-tree-v%v.apk

Builds:
  - versionName: 1.7.2
    versionCode: 14
    commit: 5bbca4f129de349dd9ef19c7b6fb0061e365e6e1
    subdir: android/app
    sudo:
      - apt-get update
      - apt-get install npm
    init:
      - cd ../..
      - npm install --ignore-scripts
    gradle:
      - yes
    prebuild:
      - cd ../..
      - mkdir -p ~/.gradle/init.d && cp scripts/glide-deterministic.init.gradle ~/.gradle/init.d/
      - sed -i -e '1a "expo":{"autolinking":{"android":{"buildFromSource":[".*"]}}},'
        package.json
      - sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts
        node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt
      - sed -i 's/\.filter { it is Inet4Address && !it.isLoopbackAddress }/.filter
        { false }/'
        node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/AgpConfiguratorUtils.kt
      - npx expo prebuild -p android --clean
      - sed -i
        's/android.enablePngCrunchInReleaseBuilds=true/android.enablePngCrunchInReleaseBuilds=false/'
        android/gradle.properties
      - sed -i -e '/signingConfig /d' android/app/build.gradle
    scanignore:
      - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
      - node_modules/react-native/ReactAndroid/publish.gradle
      - node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
      - node_modules/expo-modules-autolinking/scripts/android/autolinking_implementation.gradle
      - node_modules/@react-native-async-storage/async-storage/android/build.gradle
      - node_modules/react-native-safe-area-context/android/build.gradle
      - node_modules/react-native-keyboard-controller/android/build.gradle
      - node_modules/react-native-screens/android/build.gradle
      - node_modules/react-native-svg/android/build.gradle
    scandelete:
      - node_modules
    ndk: 27.1.12297006

AllowedAPKSigningKeys: ff739cf565d8fe3af4ff97e641f6336fa69ebcf3eec222a7a7c5ab9f8e3d837a

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.7.2
CurrentVersionCode: 14
```

---

## Key differences

| | v1.7.1 | v1.7.2 |
|---|---|---|
| Package manager | pnpm | npm |
| Repo layout | monorepo (`artifacts/drag-tree/`) | flat (repo root = app root) |
| `subdir` | `artifacts/drag-tree/android/app` | `android/app` |
| `cd` depth in prebuild | `cd ../../../..` | `cd ../..` |
| `Binaries:` | absent | present (reproducible build) |
| Glide UUID fix | absent | `glide-deterministic.init.gradle` installed to `~/.gradle/init.d/` |
| IP address fix | absent | `AgpConfiguratorUtils.kt` sed (`.filter { false }`) |
| PNG crunch | absent | disabled via `gradle.properties` sed |
| `sudo` | pnpm install added | npm only |

## Why these changes were needed for byte-match

- **`Binaries:` field**: Reviewer required it. `AllowedAPKSigningKeys` alone does not enable reproducible builds — F-Droid must be able to rebuild and byte-compare.
- **Glide UUID**: Glide's `IndexerGenerator` uses kapt-generated TypeElement hash codes which are JVM-identity-based and non-deterministic between builds. This makes the `GlideIndexer_<uuid>.java` class name random → different `classes.dex`. Fixed by a Gradle init script that renames the file post-kapt to a deterministic UUID computed from sorted module names.
- **IP address in resources.arsc**: `AgpConfiguratorUtils.getHostIpAddress()` in the React Native Gradle plugin embeds the build machine's LAN IP into `resources.arsc` at compile time. F-Droid's server has a different IP → different `resources.arsc` bytes. Fixed by patching the filter to always return empty.
- **ZIP structure (CHUNKED_SHA256)**: `apksigner` by default converts null-byte ZIP alignment padding to structured 0xD935 extra fields when signing. The v2/v3 signing block's CHUNKED_SHA256 covers these bytes. F-Droid's `sigcp` copies the signing block onto their unsigned APK (which has null-byte padding) → CHUNKED_SHA256 mismatch. Fixed by signing F-Droid's exact unsigned APK with `--alignment-preserved true --v1-signing-enabled false`, then uploading that as the reference.
