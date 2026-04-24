# Drag Tree — NHRA Pro Tree Reaction Timer

An Android app that simulates a real NHRA Pro Tree (0.400 s between ambers) and measures your reaction time using your phone's accelerometer. Mount your phone on the dash, stage up, watch the tree, and floor it — the app detects the G-force and records your RT automatically.

**Also works in a browser** — a simulated FLOOR IT button replaces the accelerometer for desktop testing.

---

## Building the APK

### Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Node.js | 18 | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` |
| EAS CLI | 16+ | `npm install -g eas-cli` |
| Expo account | — | https://expo.dev/signup (free) |

> **Why pnpm?** This is a pnpm workspace (monorepo). Using `npm install` or `yarn` will fail.

---

### Step 1 — Clone the repo

```bash
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree
```

---

### Step 2 — Install dependencies

Run this from the **repo root** (not from inside `artifacts/drag-tree`):

```bash
pnpm install
```

> This installs all workspace packages. If you run it from `artifacts/drag-tree` instead, the build will fail with unresolved module errors.

---

### Step 3 — Log in to Expo

```bash
eas login
```

Enter your Expo account email and password. If you don't have an account yet, create one at https://expo.dev/signup — it's free, no credit card required.

---

### Step 4 — Link the EAS project (first time only)

```bash
cd artifacts/drag-tree
eas init
```

When prompted:
- **"Would you like to create a new EAS project?"** → press **Y**
- Name it whatever you like (e.g. `drag-tree`)

This writes an `extra.eas.projectId` into `app.json` automatically. You only need to do this once.

---

### Step 5 — Build the APK

```bash
eas build --platform android --profile preview
```

- EAS builds the APK in the cloud (no Android SDK required on your machine)
- Free tier: **30 builds per month**
- Build time: **10–20 minutes**
- When done, EAS prints a **download URL** for the APK — open it in a browser to download

---

### Step 6 — Install the APK on your Android phone

1. On your phone: **Settings → Apps → Special app access → Install unknown apps**
   - Select your browser or Files app and enable "Allow from this source"
2. Open the APK download link from Step 5 on your phone's browser
3. Tap the downloaded APK and follow the install prompts
4. Open **Drag Tree** — it runs fully offline, no internet needed

---

## Troubleshooting

### `pnpm: command not found`
```bash
npm install -g pnpm
```
Then re-run `pnpm install` from the repo root.

---

### `eas: command not found`
```bash
npm install -g eas-cli
```

---

### `Not logged in` or `Authentication required`
```bash
eas login
```

---

### `Project not linked` / `EAS project ID not found`
```bash
cd artifacts/drag-tree
eas init
```
Select "Create new project" when prompted.

---

### `Unable to resolve module` during build
You probably ran `pnpm install` from `artifacts/drag-tree` instead of the repo root. Fix:
```bash
cd drag-tree          # repo root
pnpm install          # install from root
cd artifacts/drag-tree
eas build --platform android --profile preview
```

---

### `error: EMFILE: too many open files` (macOS)
```bash
ulimit -n 65536
```
Then retry the build command.

---

### Build fails with `Cannot find module 'expo'`
Make sure you ran `pnpm install` from the repo root and that pnpm version is 9+:
```bash
pnpm --version        # should be 9.x or 10.x
pnpm install          # from repo root
```

---

### EAS build fails — check the full log
Each EAS build has a log URL printed to the terminal. Open it — the last 20 lines almost always show the exact error. Copy the error message and report it for help.

---

## App features

- **Pro Tree only** — 0.400 s between each amber, locked in the header
- **Accelerometer launch detection** — mounts on your dash, floors automatically on G-force spike
- **Three sensitivity presets** — Gentle / Normal / Hard (adjustable when idle)
- **Reaction grading** — Perfect / Pro / Great / Good / Late / Red Light
- **Session history** — tracks all runs, highlights your best RT
- **Web/simulator mode** — FLOOR IT button simulates launch in browser

---

## Tech stack

- Expo SDK 54 · React Native 0.81.5 · expo-router · expo-sensors
- React Native Reanimated 4 · New Architecture enabled
