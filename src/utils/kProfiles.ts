import { translateNative } from '@/i18n';
import type { KProfile, KProfileCreate } from '@/types/api';

export function kProfileNoteKeys(profile: KProfile) {
  return [
    profile.setting_id,
    `slot_${profile.slot_id}_${profile.filament_id}_${profile.extruder_id}`,
    `name_${profile.name}_${profile.filament_id}`,
  ].filter((key): key is string => !!key);
}
export function kFlow(nozzle: string) {
  return nozzle.startsWith('HH00') ? 'HH00' : 'HS00';
}
export function validateKImport(
  value: Record<string, unknown>,
  nozzle: string,
): KProfileCreate[] {
  if (!Array.isArray(value.profiles) || !value.profiles.length)
    throw new Error(translateNative('native.e2d88447fca1d786'));
  return value.profiles.map((profile: unknown) => {
    if (!profile || typeof profile !== 'object')
      throw new Error(translateNative('native.3fa1813ee2a15bd7'));
    const row = profile as Record<string, unknown>;
    if (
      !row.name ||
      typeof row.filament_id !== 'string' ||
      !row.filament_id ||
      !String(row.k_value ?? '').trim() ||
      !Number.isFinite(Number(row.k_value)) ||
      Number(row.k_value) < 0
    )
      throw new Error(
        translateNative('native.19984a1045935531'),
      );
    const extruder = row.extruder_id ?? 0;
    if (extruder !== 0 && extruder !== 1)
      throw new Error(translateNative('native.c451aef619451752'));
    if (
      String(row.nozzle_diameter ?? value.nozzle_diameter ?? nozzle) !== nozzle
    )
      throw new Error(translateNative('native.5a861ddec80db64b'));
    return {
      name: String(row.name),
      filament_id: row.filament_id,
      k_value: Number(row.k_value).toFixed(6),
      n_coef: String(row.n_coef ?? '0.000000'),
      extruder_id: extruder,
      nozzle_id: `${kFlow(String(row.nozzle_id ?? ''))}-${nozzle}`,
      nozzle_diameter: nozzle,
      slot_id: 0,
      ams_id: Number(row.ams_id ?? 0),
      tray_id: Number(row.tray_id ?? -1),
    };
  });
}

const GENERIC: Record<string, string> = {
  PLA: 'GFL99',
  'PLA-CF': 'GFL98',
  'PLA SILK': 'GFL96',
  'PLA HIGH SPEED': 'GFL95',
  PETG: 'GFG99',
  'PETG HF': 'GFG96',
  'PETG-CF': 'GFG98',
  PCTG: 'GFG97',
  ABS: 'GFB99',
  ASA: 'GFB98',
  PC: 'GFC99',
  PA: 'GFN99',
  'PA-CF': 'GFN98',
  NYLON: 'GFN99',
  TPU: 'GFU99',
  PVA: 'GFS99',
  HIPS: 'GFS98',
  PE: 'GFP99',
  PP: 'GFP97',
};
export function genericKFilament(material: string) {
  const key = material.toUpperCase().trim();
  return (
    GENERIC[key] ||
    GENERIC[key.replace(/[-\s]?CF$/, '')] ||
    GENERIC[key.replace(/\+$/, '')] ||
    GENERIC[key.split(/[-\s]/)[0]] ||
    ''
  );
}
