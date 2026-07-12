# F-Droid — What You Need to Know

MR: https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41671  
fdroiddata fork: `flyboy-byte/fdroiddata`, branch `com.flyboybyte.dragtree`  
Goal: get `Binaries:` byte comparison to pass so v1.7.2 is published.

Use docs in this order:

1. [FDROID.md](/home/logan/projects/drag-tree/FDROID.md) — current status
2. [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md) — exact execution flow
3. [PLAN.md](/home/logan/projects/drag-tree/PLAN.md) — strategy and experiment order
4. [FDROID_MR_ACTIVITY.md](/home/logan/projects/drag-tree/FDROID_MR_ACTIVITY.md) — reviewer history and hard constraints
5. [FDROID_REPRO_RESEARCH.md](/home/logan/projects/drag-tree/FDROID_REPRO_RESEARCH.md) — background notes

## The One Rule That Keeps Getting Broken

**The F-Droid React Native template is a requirement.** `npx expo prebuild -p android --clean` stays in the YAML. Always. The reviewer (linsui) approved v1.7.1 with it. Do not remove it under any framing.

## YAML Formatting Rule

Always verify with git master fdroidserver before pushing:
```bash
cd /home/logan/projects/fdroiddata
PYTHONPATH=/tmp/fdroidserver-master python3 /tmp/fdroidserver-master/fdroid rewritemeta com.flyboybyte.dragtree
```
If not cloned: `git clone --depth 1 https://gitlab.com/fdroid/fdroidserver.git /tmp/fdroidserver-master`

## Current State

**YAML** (`/home/logan/projects/fdroiddata/metadata/com.flyboybyte.dragtree.yml`) — passes rewritemeta lint. Includes expo prebuild, buildFromSource sed, jvmToolchain sed, PNG crunch fix, signingConfig removal, and 9 scanignore entries.

**Reference APK on GitHub** — if it was built outside the template-aligned Gradle path, treat it as invalid for `Binaries:`. The correct reference APK must come from a fresh-clone Docker build that mirrors the fdroiddata patch sequence.

**Docker build** (`/home/logan/dragtree-fdroid-build/build.sh`) — OOM fix applied (Xmx3g, workers.max=1, parallel=false, NODE_OPTIONS=512MB, --no-daemon). Needs to be re-run.

**Template base** — `/home/logan/Downloads/build-react-native.yml` is the official template the reviewer keeps referring to. The local recipe should only deviate where the app genuinely requires it, and those deviations should stay narrow and explicit.

## What to Do Next

1. Read [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md) before making workflow changes.
2. Verify the Docker/reference build mirrors the YAML patch order exactly.
3. Run the next controlled attempt from a fresh clone at `/home/vagrant/build/com.flyboybyte.dragtree`.
4. Upload only that APK to GitHub release (`gh release upload v1.7.2 ... --clobber`).
5. If comparison fails, classify the diff before changing anything else.

## Current Decision Rules

- Do not remove `expo prebuild -p android --clean`.
- Do not use EAS APKs for `Binaries:`.
- Do not build the reference APK from the host working tree.
- Do not change multiple reproducibility knobs in one attempt.
- Use [FDROID_REPRO_EXECUTION.md](/home/logan/projects/drag-tree/FDROID_REPRO_EXECUTION.md) for experiment order and artifact capture.

## Docker Build Command

```bash
mkdir -p /home/logan/dragtree-fdroid-build/output4
nohup podman run --rm --network host \
  -v /home/logan/dragtree-fdroid-build/build.sh:/build.sh:ro \
  -v /home/logan/dragtree-fdroid-build/output4:/output \
  -v /home/logan/@flyboybyte__drag-tree.jks:/keystore.jks:ro \
  registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie \
  bash /build.sh > /home/logan/dragtree-fdroid-build/docker-build4.log 2>&1 &
```

`--network host` is required. Fresh clone only — never mount local repo. Working dir inside container must be `/home/vagrant/build/com.flyboybyte.dragtree`.

## Keystore
- File: `/home/logan/@flyboybyte__drag-tree.jks`
- Alias: `e2f4affc23a7141f202d26f6d9f2d4d0`
- Expected cert: `ff739cf5...` (AllowedAPKSigningKeys in YAML)

## Fallback

If byte comparison fails after 2 more attempts: drop `Binaries:` from the YAML. `AllowedAPKSigningKeys` alone proves key ownership and F-Droid still publishes. Reproducibility can be revisited in v1.7.3.
