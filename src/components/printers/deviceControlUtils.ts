import { translateNative } from '@/i18n';
import type { AMSUnit, PrinterStatus, UnifiedPreset } from '@/types/api';

export function deviceSlotTrayId(amsId: number, trayId: number): number {
  // Configuration and stored slot bindings use local external positions;
  // filament transport uses global 254/255 addresses instead.
  return amsId === 255 && (trayId === 254 || trayId === 255) ? trayId - 254 : trayId;
}

export function physicalTrayId(amsId: number, trayId: number): number {
  if (amsId === 255) return trayId;
  if (amsId >= 128 && amsId <= 135) return amsId;
  return amsId * 4 + trayId;
}

export function unloadTrayId(amsId: number, trayId: number): number | undefined {
  // AMS-HT cannot be addressed by the firmware unload command.
  return amsId >= 128 && amsId <= 135 ? undefined : physicalTrayId(amsId, trayId);
}

export function dryingCapabilities(status: PrinterStatus | undefined, ams: AMSUnit) {
  const moduleSupported = ams.module_type === 'n3s' || ams.module_type === 'n3f';
  return {
    supported: moduleSupported && status?.supports_drying === true,
    screenOnly: moduleSupported && status?.drying_screen_only === true,
    maxTemperature: ams.module_type === 'n3s' ? 85 : ams.module_type === 'n3f' ? 65 : null,
    canRotate: moduleSupported,
    blockedReasons: ams.dry_sf_reason ?? [],
    stalled: (ams.dry_time ?? 0) > 0 && ams.dry_countdown_stalled === true,
  };
}

export function dryingReasonText(code: number): string {
  const reasons: Record<number, string> = {
    get 0() { return translateNative('native.5b12633b21c4e6d6'); },
    get 1() { return translateNative('native.756a8c8108751403'); },
    get 2() { return translateNative('native.634c29751d2412c9'); },
    get 3() { return translateNative('native.b05c026381c0cc76'); },
    get 4() { return translateNative('native.0324fe3b3c6ca1d9'); },
    get 5() { return translateNative('native.31c09194f8e22deb'); },
    get 6() { return translateNative('native.d25d29859388de9d'); },
    get 7() { return translateNative('native.6ccf708dc81435dd'); },
    get 8() { return translateNative('native.ad283144d201c498'); },
  };
  return reasons[code] ?? `Device reason ${code}`;
}

export function backupGroups(status: PrinterStatus) {
  const groups = new Map<string, { name: string; slots: string[] }>();
  const seen = new Set<number>();
  for (const ams of status.ams ?? []) {
    if (seen.has(ams.id)) continue;
    seen.add(ams.id);
    for (const tray of ams.tray) {
      if (!tray.tray_type) continue;
      const preset = tray.tray_info_idx?.trim();
      const extruder = status.temperatures?.nozzle_2 != null
        ? status.ams_extruder_map?.[String(ams.id)] ?? 0 : 0;
      const color = (tray.tray_color ?? '').replace('#', '').slice(0, 6).toUpperCase();
      const key = preset ? `${preset}:${color}:${extruder}` : `${ams.id}:${tray.id}:unmatched`;
      const group = groups.get(key) ?? { name: `${tray.tray_sub_brands || tray.tray_type} · ${color}${status.temperatures?.nozzle_2 != null ? extruder === 1 ? ' · L' : ' · R' : ''}`, slots: [] };
      group.slots.push(`${ams.id >= 128 ? `HT${ams.id - 127}` : String.fromCharCode(65 + ams.id)} · ${tray.id + 1}`);
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

export function presetIdentity(preset: UnifiedPreset, ownFilamentId?: string | null) {
  const local = preset.source === 'local';
  const orca = preset.source === 'orca_cloud';
  const builtin = preset.source === 'standard' || preset.id.startsWith('builtin_');
  const rawId = preset.id.replace(/^(local_|builtin_)/, '');
  const cloudFilamentId = ownFilamentId || (rawId.startsWith('GFS') ? rawId.replace(/^GFS/, 'GF').split('_')[0] : '');
  return {
    tray_info_idx: local || orca ? '' : builtin ? rawId : cloudFilamentId,
    setting_id: local || orca || builtin ? '' : rawId,
    orca_profile_id: orca ? rawId.replace(/^orca_/, '') : undefined,
    source: builtin ? 'builtin' : preset.source,
    mappingId: local ? `local_${rawId}` : builtin ? `builtin_${rawId}` : preset.id,
  };
}

export function requireInteger(value: string, min: number, max: number): number {
  if (!value.trim()) throw new Error(`${min}–${max}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${min}–${max}`);
  return parsed;
}

export function controlPresets(raw: string | null | undefined, fallback: number[], max: number): number[] {
  try {
    const parsed: unknown = JSON.parse(raw || '');
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(value =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max)) return parsed;
  } catch {
    // Older servers omit UI preferences; match the upstream quick-control defaults.
  }
  return fallback;
}
