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
- Explicit snapshot mode and refresh from Camera actions, plus plate analysis,
  labelled reference management and bounded detection-area editing.
- Fleet camera wall with persisted live-stream cap, snapshot interval and status
  overlays; non-visible/background cameras release their streams.
- Camera integrations build OBS overlay URLs and manage separate video, wall and
  overlay tokens. Secrets and integration links can be copied/shared when created;
  token values are not persisted by the app. Revocation requires confirmation.
- External camera settings edit each printer directly, including USB
  `/dev/video0`–`/dev/video99`, dedicated snapshot URL, enable state and rotation.
  Stream/snapshot tests use unsaved input and report resolution/shared captures.
- Spool inventory with NFC scanning, combined stock/AMS/purchasing filters, sorting and similar-spool grouping
- Native spool/core/color/supplier management, selective bulk edits, CSV preview, composed PDF/PNG labels and scale reconciliation
- SKU replenishment forecasts and shopping-list receipts, location environmental sensors, per-printer presets/K associations, and configured Spoolman inventory/sync policy
- Remote SpoolBuddy reader results, tag writing/replacement, scale calibration,
  hardware diagnostics, daemon updates, SSH setup, and confirmed lifecycle controls
- Statistics, analytics, and historical archives with photo galleries
- Searchable settings, automatic archive retention, print/queue defaults, material drying policies, and per-model G-code snippets
- Live Obico AI verdicts with printer diagnostics and an explicit-key API explorer
- Calendar/custom-date reports with saved dashboard layouts, estimate accuracy, records, material/color/habit exploration, and purchasing summaries
- Permission-aware finance wallets, budgets, cost-center membership, and ledger administration
- Live measured smart-plug energy overview, separate from archived-print energy reports
- Project hierarchies with descendant rollups, complete-set production targets,
  formatted notes, BOM tracking, templates, and JSON/ZIP import/export
- MakerWorld model resolution and sequential bulk import to nested library folders,
  with native library/slicing follow-ups and confirmed import deletion
- Maintenance tracking, lifetime-hour corrections, per-printer intervals, documentation and default restoration
- Notification providers (including Bark, CallMeBot, and Home Assistant), per-event/printer routing, photo/quiet-hour/digest policies, draft and aggregate delivery tests, searchable template previews, and filterable delivery history
- Personal email preferences remain independent of provider event subscriptions; bed-cooled alerts support a configurable 20–80 °C threshold
- Tasmota discovery, Home Assistant entity/energy-sensor selection, MQTT measurement extraction, and authenticated REST smart plugs
- Confirmed individual/bulk power controls, printer-linked automation, alerts and schedules
- Virtual-printer interface/target selection, AMS mapping, CA certificate sharing and live setup diagnostics
- Cloud/local slicer presets with metadata filters, JSON/typed editing, base comparisons and reusable on-device templates
- Orca Cloud device approval (no Orca password collected)
- Live printer/nozzle K-profile management, copying, notes and JSON import/export
- Local/Git backups, selective restore, system diagnostics and guided bug reports ([guide](docs/backup-system.md))
- Planned push notifications

### Integrations

Configure Home Assistant under **Settings → Network**; environment-managed URL/token values remain read-only. Save connection settings before discovering HA entities. Smart plug editors preserve separate today/lifetime energy mappings, nullable associations and zero-valued thresholds/delays. MQTT devices are monitor-only.

Editing a legacy MQTT plug migrates its shared topic into every applicable power, energy and state topic without replacing explicit overrides. Existing REST plugs with no stored method retain their server-default POST behavior.

REST connection tests use the server-supported URL, method and headers (not request bodies or measurement extraction). Prefer a status URL: testing an ON/OFF URL may change device power. Use **Virtual Printers** for named printer/interface choices, archive naming, certificate export and actionable diagnostics. The CA is public; no private key is exported.

### Fleet management

The dashboard combines status, location, search, and offline visibility filters, with reversible ETA sorting and a live next-finisher summary. Long-press a printer or use the selection helpers for confirmed, state-aware bulk operations; results list sent, skipped, and failed printers.

Printer options include connection/profile editing (blank replacement access code preserves the existing secret), MQTT reconnect, device status republish, an interactive MQTT capture console, and explicit archive retention when deleting a printer. Ordinary refresh reloads server data; republish requests a fresh report from the device. Discovery supports SSDP and custom IPv4 CIDR scanning, including routed subnets on non-Docker servers.

The firmware badge opens available versions, release notes, and SD-card prerequisite checks. Firmware upload requires the server's firmware-update permission and **does not install the update**: apply the uploaded file from the printer's Settings → Firmware menu. Printer controls and plate clearance require their corresponding server permissions; clearing a plate may release waiting queue jobs.

### Physical printer controls

Printer details include live heater/fan controls, per-AMS environmental history,
friendly names, backup groups, and capability-aware drying with delayed schedules.
Tray sheets can reread device RFID, configure material/color/K profiles, assign
local or Spoolman inventory, and route filament to a hotend when an FTS is fitted.
AMS-HT unload uses the printer-wide fallback, with an explicit warning.
External spool transport keeps global tray IDs 254/255; device configuration,
reset and saved slot associations use local positions 0/1.
Unknown capabilities and backup state are not treated as disabled device settings.
Screen-only drying must be controlled at the printer.

The printer SD browser accesses the **physical printer**, not the server Library.
It supports folders, plate/image/text previews, selected-file download through the
native save/share sheet, and confirmed deletion. Printer file permission is required.
Object skipping supports plate-image and list multi-selection with a grouped,
irreversible confirmation; it remains available after reconnecting mid-print.

### Project transfers

Projects can import a single project ZIP (including supported linked files), a project
JSON, or an array of exported project JSON records. **Export project** shares a ZIP;
**Export all projects** shares restorable metadata-only JSON, matching the server's
bulk transfer format. Choose **Link library files or folders** on a project to associate
library content. Complete sets are limited by the sliced file with the fewest completed
copies; source STL/3MF models do not count as printed assemblies.
### Reports and finance

Statistics retain the chosen timeframe and report layout on the device. CSV,
Excel, JSON, and summary exports use the same selected event/date/printer/user
scope as the dashboard. Purchasing usage/cost follows the dates; remaining stock
is current, not historical. Internal purchasing reports are hidden in Spoolman
mode.
Finance/report dates and times follow the saved display format, and monetary
values use the server currency without currency conversion.

Finance requires a signed-in account and cost-center permissions; its menu entry
is shown when server billing is enabled. Reading all wallets, creating centers,
and modifying finance are separate permissions. Private centers cannot be
renamed, deleted, or assigned members, but authorized operators can edit their
budgets. An unlimited budget is distinct from a zero budget, which prevents
printing. Billing/reset policy requires settings permissions; rebuilding the
ledger requires finance modification permission and explicit confirmation.
### Workflow settings

Settings search opens the matching section and security sub-panel and identifies the selected control.
Workflow edits use **Save settings**; archive retention uses its own **Save archive retention** action.
Retention editors are locked while their save is pending.
Automatic archive purging removes old files permanently. Enable deletion of statistics only if those
historical contributions should also be removed.

Calibration defaults preserve **Auto / On / Off**. Temperature/fan preset resets restore server defaults,
and per-material preheat and humidity overrides retain their server JSON representation.
Failure-detection connection tests save pending edits first; an unverified token is never reported as
authenticated. Printer AI details distinguish unmeasured/errored monitoring from measured verdicts.

The API explorer reads the connected server's OpenAPI schema and executes live requests using only the
test API key you explicitly supply (or anonymously if blank), not the signed-in session. Write operations
require confirmation. Response status, body, duration, and copied results are available in the explorer.

### Remote SpoolBuddy hardware

Open **SpoolBuddy → Remote controls / calibrate**, or the same control in its
Settings section, and select the registered unit. Reader and scale events use
the app's authenticated WebSocket connection and are isolated by device ID.
Unknown tags can be linked or added with a captured scale weight. Remote NFC
jobs write OpenTag3D data using the physical SpoolBuddy reader; phone NFC remains
UID-only. Untag removes the inventory association, not the physical tag contents.
If a physical write succeeds but its Spoolman link fails, the job ends with a
distinct result; retry the inventory link without rewriting the NFC tag.

Tare waits for the device's calibration timestamp to change, polling every second
and timing out after 15 seconds. Known-weight calibration preserves the raw ADC
zero before tare. Restart browser, restart daemon, reboot, shutdown and updates
require explicit remote-device confirmation. A queued command is not proof of
execution or recovery; inspect device status and reported update progress.
Periodic online heartbeats are not update recovery. Recovery requires an observed
offline-to-online transition, or a completed update with the expected device
version verified from refreshed device state.

Project **Batch Print**, **Slice**, and **Run Pipeline** actions first select an
actual linked library file or project archive. Printing uses the shared configured
queue launcher (including multiple printers, quantities, and project association);
slicing and pipelines use their source-aware configuration and preflight dialogs.

### Library content previews

Library files open an authenticated in-app preview for STL, 3MF (including
individual plates), STEP/STP, G-code toolpaths, PDF, CSV/XLS/XLSX/ODS, and images.
Use **Details** for editable notes, source/external links, result photos and tags.
The library also supports multi-file/ZIP import, nested moves, STL-to-3MF
combination, sliced version groups, and recoverable trash with retention policies.

Preview engines are loaded from pinned public CDNs and require internet access;
file bytes are downloaded through the app's authenticated HTTP transport.
Credentials and server URLs are not passed to the preview JavaScript. The mobile
preview limit is 100 MB. Workbook rows/columns are paged rather than silently
discarded. Original downloads remain available when a preview cannot be rendered.

On macOS, `node scripts/verify-asset-viewers.cjs` runs real WebKit render and
interaction checks using generated fixtures and Xcode's Swift compiler. It needs
internet access for the same preview engines and cleans up its worktree-local
`.viewer-validation` artifacts.

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

### Account and integration security

- Setup can enable authentication with a first administrator or continue without
  authentication on a trusted network. Administrators can disable it after
  confirmation in **Settings → Users & security**.
- **Remember me** saves sessions in Keychain/Keystore. Turning it off removes
  previously saved credentials and keeps the new session in memory only, until
  the app process closes. Login supports email-code delivery/resending and
  alphanumeric backup codes.
- Local users can change their own passwords; successful changes require signing
  in again. LDAP passwords remain directory-managed. Delegated user-management
  permissions control which account/group actions appear.
- SSO uses native cryptographic randomness (`react-native-get-random-values`,
  imported at app startup). The authorization window follows the server's OIDC
  flow without JavaScript credential/token injection. It only exchanges tokens
  from the server-advertised login callback after observing the expected OIDC
  state. Cancel returns to the available sign-in methods.
- Scoped API keys and connected-app secrets are shown once. Copy or share an
  enrollment QR only with trusted recipients, then dismiss the secret. Connected
  apps receive identity/group/permission information after consent, **not** an
  API token or printer-control access.
- The encryption panel reports server-side OIDC/TOTP encryption health without
  retrieving key material. Back up server-generated encryption keys securely.

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
