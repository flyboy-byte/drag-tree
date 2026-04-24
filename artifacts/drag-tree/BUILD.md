# Building the Drag Tree APK

## Requirements
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A free Expo account: https://expo.dev/signup

## Steps

```bash
# 1. Clone the repo
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree

# 2. Install EAS CLI globally
npm install -g eas-cli

# 3. Install all workspace dependencies (must use pnpm — this is a pnpm monorepo)
pnpm install

# 4. Go to the app directory
cd artifacts/drag-tree

# 5. Log in to your Expo account
eas login

# 6. Build the APK (EAS builds in the cloud — free tier: 30 builds/month)
eas build --platform android --profile preview
```

EAS will ask you to link a project the first time — follow the prompts to create one.
When the build finishes (~10–15 min) it gives you a direct APK download link.

## Installing the APK on Android
1. Enable "Install from unknown sources" (Settings → Apps → Special app access)
2. Download the APK link EAS gives you, transfer to your phone and tap to install
3. The app runs fully offline — no internet, no Expo Go required

## The App
- NHRA Pro Tree reaction timer (0.400s between ambers)
- Uses accelerometer to detect launch G-force when mounted on your dash
- Web/simulator mode: tap FLOOR IT when green lights to simulate launch
