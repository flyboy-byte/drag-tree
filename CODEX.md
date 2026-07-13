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

## F-Droid — NEVER

1. Remove `npx expo prebuild -p android --clean` from the recipe
2. Use an EAS-built APK for `Binaries:`
3. Build the reference APK from the host working tree (`/home/logan/projects/drag-tree`)
4. Push to fdroiddata without running `rewritemeta` first and confirming `git diff` is empty
5. Change more than one variable class per attempt
6. Upload a reference APK before verifying its cert matches `AllowedAPKSigningKeys`: `ff739cf5...`

## F-Droid — Gate (answer YES to all before touching YAML, build.sh, or Gradle)

1. Do I have build artifacts from the last attempt?
2. Do I know which file class differed?
3. Am I changing exactly one variable class?

If any NO → read `FDROID_REPRO_EXECUTION.md` and stop.

## F-Droid Doc Order

1. [FDROID.md](/home/logan/projects/drag-tree/FDROID.md) — current attempt state + environment
2. [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md) — operational playbook + experiment order
3. [FDROID_MR_ACTIVITY.md](/home/logan/projects/drag-tree/FDROID_MR_ACTIVITY.md) — reviewer history
4. [FDROID_REPRO_RESEARCH.md](/home/logan/projects/drag-tree/FDROID_REPRO_RESEARCH.md) — background only

## Repro Build Model

Main risk is lifecycle mismatch, not a missing Gradle flag. Two patch classes:

1. Generated `android/` patches — apply after Expo prebuild
2. `node_modules` patches — may need reapply after `scandelete: node_modules`

## Current Version Context

- `v1.7.2` is the active reproducible-build workflow.
- `package.json`, `app.json`, and Gradle docs were aligned to `1.7.2` in this session.

## Agent Note

If resuming F-Droid work, prefer tightening the lifecycle mirror and artifact capture before adding more Gradle tweaks.
