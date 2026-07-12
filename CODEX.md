# CODEX.md

This file provides Codex-specific guidance for working in this repository.

## Fast Start

All commands run from the repo root.

```bash
npm install
npm run web
npm run typecheck
cd android && ./gradlew assembleRelease
```

Use `npm run web`, not `npx expo start`.

Local Android release builds require:

- JDK 21
- Android SDK 36
- build-tools 36.0.0
- NDK 27.1.12297006
- `android/local.properties`

## Repo Shape

- Expo SDK 54
- React Native 0.81.5
- repo root is app root
- `android/` is committed, but Expo prebuild regenerates it during the F-Droid flow

Important files:

- [app/(tabs)/index.tsx](/home/logan/projects/drag-tree/app/(tabs)/index.tsx)
- [app/diagnostic.tsx](/home/logan/projects/drag-tree/app/diagnostic.tsx)
- [hooks/useTreeSession.ts](/home/logan/projects/drag-tree/hooks/useTreeSession.ts)
- [hooks/useAccelerometer.ts](/home/logan/projects/drag-tree/hooks/useAccelerometer.ts)

## F-Droid Doc Order

For F-Droid or reproducible-build work, read docs in this order:

1. [FDROID.md](/home/logan/projects/drag-tree/FDROID.md)
2. [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md)
3. [PLAN.md](/home/logan/projects/drag-tree/PLAN.md)
4. [FDROID_MR_ACTIVITY.md](/home/logan/projects/drag-tree/FDROID_MR_ACTIVITY.md)
5. [FDROID_REPRO_RESEARCH.md](/home/logan/projects/drag-tree/FDROID_REPRO_RESEARCH.md)

Do not use `FDROID_REPRO_RESEARCH.md` as the primary action doc.

## F-Droid Non-Negotiables

- The official template base is `/home/logan/Downloads/build-react-native.yml`.
- `npx expo prebuild -p android --clean` stays in the recipe.
- `Binaries:` must be backed by a reference APK built from the same effective patch sequence and Gradle path as fdroiddata.
- Do not use EAS APKs for `Binaries:`.
- Do not use a host-local working tree build for `Binaries:`.
- Keep `scanignore` narrow and keep `scandelete: node_modules`.

## Repro Build Model

The main risk is pipeline mismatch, not a missing random Gradle flag.

Two patch classes:

1. Generated `android/` patches: apply after Expo prebuild.
2. `node_modules` patches: assume they must be reapplied after post-scan reinstall if `scandelete: node_modules` is active.

Before changing reproducibility knobs, answer:

1. Is the local reference build really mirroring F-Droid’s lifecycle?
2. Is this patch applied at the correct stage?
3. Do the current artifacts prove this is the next remaining diff class?

If not, stop and read [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md).

## Current Version Context

- `v1.7.2` is the active reproducible-build workflow.
- `package.json`, `app.json`, and Gradle docs were aligned to `1.7.2` in this session.

## Agent Note

If resuming F-Droid work, prefer tightening the lifecycle mirror and artifact capture before adding more Gradle tweaks.
