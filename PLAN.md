# F-Droid v1.7.2 — Session State

This file tracks the current session's state only. Strategy and experiment order live in `FDROID_REPRO_EXECUTION.md`. Rewrite this file at the start of each session.

---

## Current Session (2026-07-12)

**Attempt:** 2  
**Experiment:** Lifecycle equivalence — no Gradle reproducibility changes, just get a clean Docker build with correct patch sequence  
**What changed from attempt 1:** Freed 45G disk (WoT HEAT game + takeout folder), relaunched build

**Build status:** Running — `/home/logan/dragtree-fdroid-build/builds/attempt-20260712-1930/build.log`

**Immediate next steps (in order):**
1. Wait for Docker build to finish
2. Verify cert matches `ff739cf5...`
3. Upload to GitHub release (`gh release upload v1.7.2 ... --clobber`)
4. Rebase fdroiddata branch to single clean commit
5. Run rewritemeta, confirm `git diff` is empty
6. Push + trigger pipeline
7. Capture pipeline output for diff analysis

**If pipeline byte comparison fails:** Follow diff triage order in `FDROID_REPRO_EXECUTION.md` — classify the diff class before choosing next experiment.
