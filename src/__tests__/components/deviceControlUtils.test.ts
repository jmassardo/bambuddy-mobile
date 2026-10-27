import { backupGroups, controlPresets, dryingCapabilities, physicalTrayId, presetIdentity, requireInteger, unloadTrayId } from '@/components/printers/deviceControlUtils';
import type { AMSUnit, PrinterStatus } from '@/types/api';

it('addresses ordinary AMS, HT and both external paths without multiplying HT ids', () => {
  expect(physicalTrayId(2, 3)).toBe(11);
  expect(physicalTrayId(128, 0)).toBe(128);
  expect(physicalTrayId(135, 0)).toBe(135);
  expect(physicalTrayId(255, 254)).toBe(254);
  expect(physicalTrayId(255, 255)).toBe(255);
  expect(unloadTrayId(128, 0)).toBeUndefined();
  expect(unloadTrayId(1, 2)).toBe(6);
});

it('distinguishes Pro/HT bounds, screen-only, blocked and stalled drying', () => {
  const status = { supports_drying: true } as PrinterStatus;
  expect(dryingCapabilities(status, { module_type: 'n3f', dry_sf_reason: [3] } as AMSUnit))
    .toMatchObject({ maxTemperature: 65, canRotate: true, blockedReasons: [3] });
  expect(dryingCapabilities(status, { module_type: 'n3s', dry_time: 30, dry_countdown_stalled: true } as AMSUnit))
    .toMatchObject({ maxTemperature: 85, canRotate: true, stalled: true });
  expect(dryingCapabilities(status, { module_type: 'ams' } as AMSUnit).supported).toBe(false);
  expect(dryingCapabilities({ drying_screen_only: true } as PrinterStatus, { module_type: 'n3f' } as AMSUnit))
    .toMatchObject({ screenOnly: true, supported: false });
});

it('groups backups only for identical preset, RGB color and extruder, never unknown profiles', () => {
  const tray = { id: 0, tray_type: 'PLA', tray_info_idx: 'GFL99', tray_color: 'FF0000FF' };
  const status = {
    temperatures: { nozzle_2: 25 }, ams_extruder_map: { '0': 0, '1': 1 },
    ams: [
      { id: 0, tray: [tray, { ...tray, id: 1, tray_color: 'ff000080' }, { ...tray, id: 2, tray_color: '00FF00FF' }, { ...tray, id: 3, tray_info_idx: '' }] },
      { id: 1, tray: [tray] },
      { id: 0, tray: [tray] },
    ],
  } as unknown as PrinterStatus;
  expect(backupGroups(status).map(group => group.slots.length).sort()).toEqual([1, 1, 1, 2]);
});

it('never truncates cloud setting ids or sends Orca UUIDs as tray filament ids', () => {
  expect(presetIdentity({ id: 'PFUS1234567890', name: 'Cloud', source: 'cloud' }))
    .toMatchObject({ tray_info_idx: '', setting_id: 'PFUS1234567890' });
  expect(presetIdentity({ id: 'PFUS1234567890', name: 'Cloud', source: 'cloud' }, 'P1234567').tray_info_idx).toBe('P1234567');
  expect(presetIdentity({ id: 'uuid', name: 'Orca', source: 'orca_cloud' }))
    .toMatchObject({ tray_info_idx: '', setting_id: '', orca_profile_id: 'uuid' });
  expect(presetIdentity({ id: '12', name: 'Local', source: 'local' }))
    .toMatchObject({ tray_info_idx: '', setting_id: '', mappingId: 'local_12' });
  expect(presetIdentity({ id: 'builtin_GFL99', name: 'Generic', source: 'standard' }))
    .toMatchObject({ tray_info_idx: 'GFL99', mappingId: 'builtin_GFL99', source: 'builtin' });
});

it('accepts off without coercing empty, fractional or out-of-range input into a device command', () => {
  expect(requireInteger('0', 0, 65)).toBe(0);
  for (const value of ['', 'NaN', '65.5', '-1', '66']) expect(() => requireInteger(value, 0, 65)).toThrow();
});

it('consumes configured JSON quick controls and safely falls back for missing or invalid triples', () => {
  expect(controlPresets('[0,40,65]', [35, 45, 60], 65)).toEqual([0, 40, 65]);
  expect(controlPresets('[40,60,85]', [35, 45, 60], 65)).toEqual([35, 45, 60]);
  expect(controlPresets('120,220,260', [120, 220, 260], 320)).toEqual([120, 220, 260]);
});
