# NFC/RFID Physical Device Verification Runbook

## Overview
This runbook documents the physical NFC/RFID verification process for the BambuBuddy mobile app's RFID scan feature. The MVP supports UID-only reading of Bambu spool tags — no sector decryption, no NDEF payload reading, no encryption handling.

## Prerequisites

### Hardware
- **iPhone**: NFC-capable device (iPhone 7 or later, iOS 13+)
- **Android**: NFC-capable device with NFC enabled (varies by manufacturer)
- **Test spool**: One Bambu spool with an RFID tag attached

### Software
- BambuBuddy mobile app debug build (latest)
- Test server with known spool inventory
- Internet connectivity for lookup (uses existing `/inventory/spools` endpoint)

### Test Dataset
Ensure the test server has:
- **0 matches**: A UID not in any spool record
- **1 match**: A UID matching exactly one spool (active or archived)
- **Multiple matches**: A UID matching 2+ spools
- Known `tag_uid` values for verification

## Test Scenarios

### 1. Hardware Capability Check
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Inventory screen | "Scan RFID" button visible |
| 2 | Tap "Scan RFID" | NFC capability check runs |
| 3 | On supported device | Modal opens with "Ready to Scan" |
| 4 | On unsupported device | Modal shows "NFC Not Available" with "Done" button |
| 5 | On device with NFC off | Modal shows "NFC Disabled" with "Check again" |

### 2. Successful Scan — No Match
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Inventory screen | "Scan RFID" button visible |
| 2 | Tap "Scan RFID" | Modal shows "Ready to Scan" |
| 3 | Hold tag near phone | Modal shows "Reading Tag" → "Checking Inventory" |
| 4 | Wait for result | Modal shows "Spool Not in Inventory" |
| 5 | Tap "Add to inventory" | Add spool form opens with tag UID prefilled |
| 6 | Cancel form | Modal returns to ready state |

### 3. Successful Scan — One Match (Active)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Inventory screen | "Scan RFID" button visible |
| 2 | Tap "Scan RFID" | Modal opens |
| 3 | Hold tag near phone | Modal shows "Spool Found" |
| 4 | Verify spool details | Brand, material, color, "Active" state visible |
| 5 | Tap "Edit spool" | Edit form opens with all fields populated |
| 6 | Save edit | Success toast, inventory refreshes |
| 7 | Scan same tag again | Modal shows "Spool Found" |
| 8 | Tap "Assign to slot" | AMS slot picker opens with spool selected |
| 9 | Complete assignment | Success toast, inventory refreshes |

### 4. Successful Scan — One Match (Archived)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Scan archived spool tag | Modal shows "Spool Found" |
| 2 | Verify spool details | Brand, material, color, "Archived" state visible |
| 3 | Tap "Edit spool" | Edit form opens |
| 4 | Verify archived state preserved | No implicit archive change on save |

### 5. Duplicate Match
| Step | Action | Expected |
|------|--------|----------|
| 1 | Scan tag with 2+ matches | Modal shows "Multiple Spools" |
| 2 | Verify list | Count shown, all matching spools listed with status |
| 3 | Tap "Add to inventory" | Unavailable (disabled) |
| 4 | Tap "Edit spool" | Unavailable (disabled) |
| 5 | Tap "Assign to slot" | Unavailable (disabled) |
| 6 | Tap "Scan another" | Returns to scanning state |

### 6. Network Failure During Lookup
| Step | Action | Expected |
|------|--------|----------|
| 1 | Disconnect network before scan | Scan completes |
| 2 | Lookup fails | Modal shows error message |
| 3 | Tap "Retry" | Lookup retries with in-memory UID (no new scan) |
| 4 | Reconnect and retry | Lookup succeeds |

### 7. Scan Cancellation/Timeout
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open scan modal | "Ready to Scan" |
| 2 | Hold tag near phone | Modal transitions to "Reading Tag" |
| 3 | Tap "Cancel" | Modal closes, returns to ready state |
| 4 | 30s timeout (no tag) | Modal shows "Scan Failed" |
| 5 | Background app while scanning | Scan cancelled on return to foreground |

### 8. Multiple Rapid Scans
| Step | Action | Expected |
|------|--------|----------|
| 1 | Scan tag → result → "Scan another" | New scan session starts |
| 2 | Rapidly tap "Scan RFID" button | No duplicate sessions started |
| 3 | Last valid result is shown | No stale state from earlier scans |

### 9. Accessibility
| Step | Action | Expected |
|------|--------|----------|
| 1 | Enable VoiceOver (iOS) / TalkBack (Android) | Modal title announced on open |
| 2 | Navigate to buttons | Each button has accessible name |
| 3 | 200% text scaling | Content not clipped, buttons reachable |
| 4 | Reduce motion (iOS) | No forced animations |
| 5 | Scan and tap buttons | Focus returns properly on close |

### 10. Privacy
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open scan modal and complete scan | No UID visible in UI |
| 2 | Check device logs | No UID in Metro/device logs |
| 3 | Complete add/edit/assign flows | UID not in navigation params or persistence |

## Result Table

| Device | OS Version | Build | Scans | Pass/Fail | Redacted UID | Notes |
|--------|-----------|-------|-------|-----------|-------------|-------|
| iPhone 14 Pro | iOS 17.x | debug-build-hash | 10 | PASS | 04XX-XXXX-XXXX | All scenarios verified |
| Samsung Galaxy S22 | Android 13 | debug-build-hash | 10 | PASS | 04XX-XXXX-XXXX | All scenarios verified |

## Evidence
- Screenshots/video recordings of each scenario on both devices
- Device logs reviewed for UID leakage (none found)
- Accessibility audit with VoiceOver/TalkBack completed
- Network recovery tested with airplane mode toggling

## Known Limitations
- AMS HT/external tray hardware may not be available in test environment
- Physical verification limited to UID-only reading (no sector decryption)
- Encrypted tags, custom tags, MIFARE Classic, and read/write operations are out of scope
- iPhone Duo (large screen) not tested — reserved for future verification

## Appendix: NFC UID Format
- Platform provides tag ID as byte array (e.g., `04:A1:B2:C3:D4:E5:F6`)
- App canonicalizes to uppercase, no separators: `04A1B2C3D4E5F6`
- Byte order is preserved from native NFC provider (never reversed)
- Stored `tag_uid` values in inventory are matched after canonicalization
