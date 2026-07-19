# F-Droid v1.7.2 — Reproducible Build: COMPLETE

Updated 2026-07-19. All work complete. MR awaiting reviewer merge.

---

## Status

**F-Droid MR #41671 — byte comparison passing as of 2026-07-19**

Pipeline 2687784363: all 9 jobs green. `fdroid build success` with:
```
INFO: success: com.flyboybyte.dragtree
```

The `Binaries:` field byte comparison passed. No further build work needed for v1.7.2.

---

## What Was Done

### Completed (in order)

| Attempt | Fix | Result |
|---|---|---|
| A1 / A2 | Baseline Docker builds | A1 == A2 byte-identical ✓ |
| A3 | `AgpConfiguratorUtils.kt` sed — IP address fix | `resources.arsc` now matches F-Droid ✓ |
| A4 | `rm -rf node_modules` post-prebuild (simulate scandelete) | `.so` and `classes.dex` task count now aligns ✓ |
| A5 | `export GRADLE_USER_HOME=/home/vagrant/.gradle` | `.so` files now match (46→2 diffs) ✓ |
| A6 | `glide-deterministic.init.gradle` init script | `classes.dex` now matches (0 diffs) ✓ |
| Final | Sign F-Droid's unsigned APK with `--alignment-preserved true` | ZIP structure matches, CHUNKED_SHA256 passes ✓ |

### Four root causes resolved

1. **`resources.arsc`** — LAN IP embedded by `AgpConfiguratorUtils.getHostIpAddress()`. Fixed by sed.
2. **`.so` files** — Gradle transform cache path leakage via `GRADLE_USER_HOME`. Fixed by setting to `/home/vagrant/.gradle`.
3. **`classes.dex`** — Glide `IndexerGenerator` non-deterministic UUID. Fixed by `glide-deterministic.init.gradle`.
4. **ZIP structure** — `apksigner` 0xD935 extra field conversion breaks `CHUNKED_SHA256`. Fixed by signing F-Droid's unsigned APK with `--alignment-preserved true --v1-signing-enabled false`.

---

## Current State

- fdroiddata branch: `flyboy-byte/fdroiddata` / `com.flyboybyte.dragtree`
- One commit ahead of `upstream/master`, zero behind
- Commit: `Add com.flyboybyte.dragtree (DragTree v1.7.2)` (squashed)
- Reference APK: uploaded to `flyboy-byte/drag-tree` GitHub release `v1.7.2`
- Reviewer (linsui) notified 2026-07-19

---

## Next Steps

1. Wait for reviewer merge — no action required on our end.
2. After merge, F-Droid's index-building job will pick up the app within ~1–2 weeks.
3. For v1.7.3: tag the release, update `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, AutoUpdateMode will pick up the new tag automatically.
