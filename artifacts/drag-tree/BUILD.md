# Building the APK

## Requirements
- Node.js 18+
- A free Expo account: https://expo.dev/signup

## Steps

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Go to the app directory
cd artifacts/drag-tree

# 4. Link to your Expo account (first time only)
eas init --id <your-project-id>
# OR just run the build — it will prompt you to create a project

# 5. Build the APK
eas build --platform android --profile preview
```

EAS builds in the cloud (free tier: 30 builds/month). When it's done it gives you a
download link for the APK. Install it on any Android phone — no Play Store needed.

## The APK
- Fully standalone — runs offline, no Expo Go required
- Sideload by enabling "Install from unknown sources" on your Android device
