# F-Droid — Current State

MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671  
fdroiddata fork: `flyboy-byte/fdroiddata`, branch `com.flyboybyte.dragtree`

---

## Current Attempt

**Attempt:** 2 (2026-07-12)  
**What changed:** Freed disk space (deleted WoT HEAT + takeout folder), relaunched Docker build that previously OOM'd on disk  
**Status:** Docker build running — NDK/CMake toolchain downloading  
**Last result:** Attempt 1 failed: "No space left on device" at `copyReleaseJniLibsProjectAndLocalJars` after 905 tasks (31 min)  
**Log:** `/home/logan/dragtree-fdroid-build/builds/attempt-20260712-1930/build.log`

---

## Next Action

Wait for Docker build to complete, verify cert, upload APK to GitHub release, then rebase fdroiddata branch to single commit and trigger pipeline.

---

## Hard Rules

1. **`npx expo prebuild -p android --clean` stays in the recipe.** Reviewer (linsui) required it. Do not remove it under any framing.
2. **Do not use EAS APKs for `Binaries:`.** The reference APK must come from the same patch sequence as the fdroiddata recipe.
3. **Do not build the reference APK from the host working tree.** DWARF paths in .so files will differ from F-Droid's `/home/vagrant/build/com.flyboybyte.dragtree`.
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

---

## Fallback

If byte comparison still fails after controlled Gradle-focused attempts with captured diff evidence: drop `Binaries:` from the YAML. `AllowedAPKSigningKeys` alone still gets the app published. Revisit reproducibility in v1.7.3.

Do not invoke fallback without at least one clean attempt using Docker-built reference APK + captured diff output.
