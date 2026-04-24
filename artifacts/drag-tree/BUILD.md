# Building the Drag Tree APK

## Requirements
- Node.js 18+
- A free Expo account: https://expo.dev/signup

## Steps

```bash
# 1. Clone the repo
git clone https://github.com/flyboy-byte/drag-tree.git
cd drag-tree/artifacts/drag-tree

# 2. Install EAS CLI
npm install -g eas-cli

# 3. Log in to your Expo account
eas login

# 4. Install dependencies
npm install

# 5. Build the APK (EAS builds in the cloud — free tier: 30 builds/month)
eas build --platform android --profile preview
```

EAS will ask you to link a project the first time — just follow the prompts.
When the build finishes (~10–15 min) it gives you a download link for the APK.

## Installing the APK on Android
1. Enable "Install from unknown sources" (Settings → Apps → Special app access)
2. Transfer the APK to your phone and tap it to install
3. The app runs fully offline — no internet, no Expo Go required

## The App
- NHRA Pro Tree reaction timer (0.400s between ambers)
- Uses accelerometer to detect launch G-force when mounted on your dash
- Web/simulator mode: tap FLOOR IT button to simulate launch
