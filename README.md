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

### Release version checklist

Keep the app version and build number synchronized before cutting a release:

- Update `package.json` `version`.
- Update both `versionName` and the incremented `versionCode` in `android/app/build.gradle`.
- Update `MARKETING_VERSION` in `ios/Bambuddy.xcodeproj/project.pbxproj`. This key appears twice, once for each build configuration, and both occurrences must change.
- Update `CURRENT_PROJECT_VERSION` in `ios/Bambuddy.xcodeproj/project.pbxproj` to match Android's `versionCode`. This key also appears twice, and both occurrences must change.

### Demo mode (optional build-time configuration)

The server setup screen can show a **Try the demo** button that connects to a
hosted Bambuddy instance and signs in automatically, so evaluators and app
store reviewers can explore the app without setting up a server.

The demo settings are **not stored in this repository**. They are read from the
environment and inlined into the bundle at build time by
`babel-plugin-transform-inline-environment-variables` (see `babel.config.js`):

| Variable | Description |
| --- | --- |
| `BAMBUDDY_DEMO_URL` | Base URL of the hosted demo instance |
| `BAMBUDDY_DEMO_USERNAME` | Demo account username |
| `BAMBUDDY_DEMO_PASSWORD` | Demo account password |

If any of the three are unset, `isDemoConfigured()` returns `false` and the
demo button is not rendered, so local and fork builds are unaffected.

In CI these are supplied as repository secrets of the same names. For a local
release build, export them first:

```sh
BAMBUDDY_DEMO_URL=https://demo.example.com \
BAMBUDDY_DEMO_USERNAME=reviewer \
BAMBUDDY_DEMO_PASSWORD=... \
npm run build:ios:release
```

Because the values are compiled into the shipped binary they are extractable by
anyone who downloads the app. Treat the demo account as public: it should be
low-privilege, isolated from real data, and safe to reset.

## Network Security

Bambuddy Companion is designed to work with self-hosted servers that may live on
a local network. To support this while keeping public traffic secure, cleartext
HTTP is **only** allowed for local/private network addresses:

- **iOS:** The `Info.plist` sets `NSAllowsLocalNetworking = true` inside the
  `NSAppTransportSecurity` dictionary. This permits cleartext HTTP to link-local
  and private-range IP addresses while enforcing HTTPS for all other hosts.
- **Android:** The `network_security_config.xml` allows cleartext traffic only
  to RFC 1918 / RFC 4193 private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, and `fc00::/7`). All public hosts require HTTPS.

Public Bambuddy servers **must** use HTTPS. The app displays a warning when a
user enters a plain HTTP URL and shows a confirmation dialog before connecting.

This is intentional: many users run Bambu Lab printers on an isolated LAN with a
self-hosted Bambuddy instance that has no TLS certificate. The local-networking
exception lets those setups work out of the box without compromising security for
traffic that leaves the local network.

## Testing

```sh
npm test
npm run lint
npm run typecheck
```

## Changelog

Every user-facing pull request adds one user-focused line under
[`## [Unreleased]`](CHANGELOG.md#unreleased). At release time, the release agent
promotes those entries to a versioned section and starts a new empty Unreleased
section.

## Links

- Website: https://dxrf.com/bambuddy-companion
- Bambuddy platform: https://bambuddy.cool
- Wiki: https://wiki.bambuddy.cool
- GitHub Discussions: https://github.com/jmassardo/bambuddy-mobile/discussions
- Issue tracker: https://github.com/jmassardo/bambuddy-mobile/issues
