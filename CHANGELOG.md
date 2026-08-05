# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-04

### Added

- See whether AI failure detection is enabled at a glance on printer cards (#108)
- Sort the printer list by name or status, and keep the chosen order between sessions (#109)
- Create and manage virtual printers from the mobile app (#68)
- Add and manage SpoolBuddy devices from the mobile app (#69)
- Customize feature navigation and open configured external links from the More screen (#71)
- Restore external camera management support in the mobile app (#111)

### Fixed

- Show K-profile calibration and placement details on profile cards (#103)
- Connect to live printer camera streams on iOS after granting local-network access (#104)
- Stop stalled camera streams with a retryable timeout instead of spinning forever (#105)
- Show previous runs in archive print history (#106)
- Timelapses and archive photos now wait for authentication and show retryable errors instead of blank media (#107)

## [1.0.1]

### Added

- View printer energy use and estimated costs from the Energy dashboard (#67)
- Configure external camera streams alongside printer cameras (#70)
- Manage synchronized cloud profiles from the app (#6)
- Control Spoolman synchronization from settings (#14)
- Review nozzle, bed, and chamber temperature history on printer details (#10)

### Fixed

- Prevent login crashes when permissions are missing, display menu icons correctly, and keep system logs scrollable (#59)
- Time out stalled server requests and handle malformed responses without crashing (#84)

### Security

- Require HTTPS for public servers while preserving HTTP access to self-hosted servers on local networks (#83)

[Unreleased]: https://github.com/jmassardo/bambuddy-mobile/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/jmassardo/bambuddy-mobile/releases/tag/v1.1.0
[1.0.1]: https://github.com/jmassardo/bambuddy-mobile/releases/tag/v1.0.1
