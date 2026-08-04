# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Restore external camera management support in the mobile app (#111)
- Customize navigation visibility and ordering, with external links opening in-app or in the system browser (#71)

### Changed

### Deprecated

### Removed

### Fixed

- Timelapses and archive photos now wait for authentication and show retryable errors instead of blank media (#107)

### Security

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

[Unreleased]: https://github.com/jmassardo/bambuddy-mobile/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/jmassardo/bambuddy-mobile/releases/tag/v1.0.1
