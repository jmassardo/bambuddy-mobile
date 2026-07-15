<p align="center">
  <h1 align="center">Bambuddy Mobile</h1>
</p>

<p align="center">
  <strong>Your printers. No cloud. Your rules. Now on mobile.</strong><br>
  Android & iOS companion app for <a href="https://github.com/maziggy/bambuddy">Bambuddy</a> — the self-hosted command center for Bambu Lab printers.
</p>

<p align="center">
  <a href="https://github.com/jmassardo/bambuddy-mobile/releases"><img src="https://img.shields.io/github/v/release/jmassardo/bambuddy-mobile?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/jmassardo/bambuddy-mobile/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jmassardo/bambuddy-mobile?style=flat-square" alt="License"></a>
</p>

---

## 📱 Features

Every feature from the Bambuddy web UI, in your pocket:

- **🖨️ Real-time Printer Dashboard** — Live status, camera snapshots, temperatures, AMS filament slots
- **📦 Print Archives** — Browse, search, reprint, view 3D thumbnails
- **📋 Print Queue** — Queue management, history, timeline, slicer pipelines
- **📁 File Manager** — Upload, browse, and print files from your library
- **📊 Statistics** — Print analytics, success rates, filament usage, costs
- **🧵 Spool Inventory** — Track filament with QR code label scanning
- **🔧 Maintenance** — Task scheduling and tracking
- **📷 Camera Streaming** — Live MJPEG camera views
- **🌍 MakerWorld** — Import models directly
- **🔔 Push Notifications** — Native iOS/Android push via FCM/APNs
- **📱 QR Code Scanner** — Scan spool labels and server setup codes
- **📡 NFC Support** — Read/write SpoolBuddy tags natively
- **🔐 Authentication** — JWT auth, 2FA, OIDC SSO support
- **🌙 Dark Theme** — Matching the web UI's polished dark design

## 🚀 Quick Start

### Prerequisites

- A running [Bambuddy](https://github.com/maziggy/bambuddy) server (v0.1.7+)
- Node.js 18+
- iOS: Xcode 15+ (for iOS development)
- Android: Android Studio (for Android development)

### Development

```bash
# Install dependencies
npm install

# Start the development server
npx expo start

# Run on specific platform
npm run ios
npm run android
```

### Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build for stores
eas build --platform ios
eas build --platform android
```

## 🏗️ Architecture

- **Framework**: React Native with Expo (managed workflow + dev client)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: TanStack React Query + Zustand
- **Real-time**: WebSocket for live printer status
- **Auth**: JWT via expo-secure-store
- **Theme**: Custom dark/light theme matching web UI

### Project Structure

```
src/
├── app/              # Expo Router screens (file-based routing)
│   ├── (tabs)/       # Bottom tab screens (Printers, Archives, Queue, Files, More)
│   ├── printer/      # Printer detail screen
│   ├── archive/      # Archive detail screen
│   ├── login/        # Login screen
│   ├── server/       # Server URL configuration
│   └── ...           # Other screens
├── api/              # API client and server configuration
├── components/       # Reusable components
│   ├── common/       # Shared UI components
│   ├── printers/     # Printer-specific components
│   ├── archives/     # Archive-specific components
│   └── ...
├── contexts/         # React contexts (Auth, Toast)
├── hooks/            # Custom hooks (WebSocket, etc.)
├── theme/            # Theme tokens and provider
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

Built as the official mobile companion for [Bambuddy](https://github.com/maziggy/bambuddy) by [@maziggy](https://github.com/maziggy).
