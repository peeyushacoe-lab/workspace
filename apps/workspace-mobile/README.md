# CyberSage Workspace — Mobile App

React Native + Expo SDK 56 app for the CyberSage Workspace platform.

## Setup

```bash
cd apps/workspace-mobile
npm install
```

Create `.env` (or set in `app.json` extra):

```
EXPO_PUBLIC_API_URL=https://cybersage-mail.vercel.app
```

## Run

```bash
# Start dev server
npm start

# Android (device/emulator)
npm run android

# iOS (macOS only)
npm run ios
```

## Architecture

```
app/
├── _layout.tsx           — root: auth gate + QueryClient
├── (auth)/login.tsx      — login screen (JWT)
├── (tabs)/               — bottom tab navigator
│   ├── index.tsx         — Inbox + Compose
│   ├── chat.tsx          — Channels + Messaging
│   ├── drive.tsx         — File browser
│   ├── calendar.tsx      — Events
│   └── settings.tsx      — Profile + logout
└── thread/[id].tsx       — Thread detail + reply

src/
├── api/
│   ├── client.ts         — fetch wrapper + JWT refresh
│   └── inbox.ts          — inbox API helpers
└── store/
    └── auth.ts           — Zustand auth store (SecureStore)
```

## Auth Flow

1. POST `/api/mobile/auth/login` → access + refresh JWT
2. Store both in `expo-secure-store`
3. All requests: `Authorization: Bearer <access>`
4. Auto-refresh on 401 using refresh token

## Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli
eas login

# Configure
eas build:configure

# Android APK/AAB
eas build --platform android

# iOS IPA
eas build --platform ios
```
