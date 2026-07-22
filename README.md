# Bambuddy Companion

[![iOS Beta](https://img.shields.io/badge/iOS-TestFlight-00AE42?style=for-the-badge&logo=apple&logoColor=white)](https://testflight.apple.com/join/8SdWmK3t)
[![Android Beta](https://img.shields.io/badge/Android-Open%20Testing-00AE42?style=for-the-badge&logo=android&logoColor=white)](https://play.google.com/apps/testing/com.dxrf.bambuddy)

Mobile companion app for the self-hosted [Bambuddy](https://bambuddy.cool) print farm management platform. Monitor printers, manage queues, browse files, and control your Bambu Lab fleet from your phone or tablet.

> [!IMPORTANT]
> Bambuddy Companion requires access to a self-hosted Bambuddy server instance.

## Overview

- **App name:** Bambuddy Companion
- **Bundle ID:** `com.dxrf.bambuddy`
- **Platforms:** iOS and Android
- **Tech stack:** React Native, TypeScript
- **Author:** [Jenna Massardo](https://www.dxrf.com)

## Preview / Beta Testing

### iOS

- Join the TestFlight beta: https://testflight.apple.com/join/8SdWmK3t

### Android

1. Join the testers group: https://groups.google.com/g/bambuddy-companion-app
2. Opt in on your device: https://play.google.com/apps/testing/com.dxrf.bambuddy
3. Store listing: https://play.google.com/store/apps/details?id=com.dxrf.bambuddy

## Features

- Multi-printer dashboard with real-time status updates over WebSocket
- Print queue management with batch grouping and scheduling
- File browsing, upload, and organization for 3MF/STL assets
- Full printer controls for pause, resume, stop, speed, lights, and calibration
- Live MJPEG camera streaming
- Spool inventory with NFC tag scanning
- Statistics, analytics, and historical archives with photo galleries
- Project organization for multi-part builds
- Maintenance tracking
- Planned push notifications

## Requirements

- A self-hosted Bambuddy server instance
- Node.js 22+
- Ruby 3.1+ with Bundler
- Xcode, CocoaPods, and an iOS simulator/device for iOS development
- Android Studio and Android SDK for Android development

For local React Native setup guidance, see the official [React Native environment setup docs](https://reactnative.dev/docs/set-up-your-environment).

## Development Setup

```sh
npm install
bundle install
cd ios && bundle exec pod install && cd ..
```

Start Metro:

```sh
npm start
```

Run the app:

```sh
npm run ios
npm run android
```

## Building

Fastlane-based build commands:

```sh
npm run build:ios:debug
npm run build:ios:release
npm run build:android:debug
npm run build:android:release
```

Beta distribution lanes are also available:

```sh
npm run beta:ios
npm run beta:android
```

## Testing

```sh
npm test
npm run lint
npm run typecheck
```

## Links

- Website: https://dxrf.com/bambuddy-companion
- Bambuddy platform: https://bambuddy.cool
- Wiki: https://wiki.bambuddy.cool
- GitHub Discussions: https://github.com/jmassardo/bambuddy-mobile/discussions
- Issue tracker: https://github.com/jmassardo/bambuddy-mobile/issues
