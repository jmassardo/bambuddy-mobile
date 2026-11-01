import type { InventoryRecord } from '@/types/api';
import { text } from './inventory';

const normalizeModel = (value: string) => {
  const clean = value
    .toLowerCase()
    .replace(/^bambu lab\s+|^bbl\s+/, '')
    .replace(/\s+/g, '');
  return clean === 'a1m' ? 'a1mini' : clean === 'h2dp' ? 'h2dpro' : clean;
};
export function autoMatchSpoolPresets(
  defaultName: string,
  models: string[],
  presets: InventoryRecord[],
  registry: Record<string, string>,
) {
  const stem = defaultName.split('@')[0].trim().toLowerCase();
  if (!stem) return [];
  const result: InventoryRecord[] = [];
  models.filter(Boolean).forEach(model => {
    const candidates = presets.filter(row => {
      const name = text(row, 'name');
      if (
        name.split('@')[0].trim().toLowerCase() !== stem ||
        !name.includes('@')
      )
        return false;
      const suffix = name
        .split('@')
        .pop()!
        .replace(/\s+[\d.]+\s*nozzle\s*$/i, '')
        .trim();
      const canonical = registry[suffix] ?? suffix;
      return normalizeModel(canonical) === normalizeModel(model);
    });
    for (const diameter of ['0.2', '0.4', '0.6', '0.8', '1.0']) {
      const sized = candidates.find(row =>
        new RegExp(`\\b${diameter.replace('.', '\\.')}\\s*nozzle\\b`, 'i').test(
          text(row, 'name'),
        ),
      );
      const unsized = candidates.find(
        row => !/\b[\d.]+\s*nozzle\b/i.test(text(row, 'name')),
      );
      const row = sized ?? unsized;
      if (row)
        result.push({
          printer_model: model,
          nozzle_diameter: diameter,
          slicer_filament: text(row, 'id'),
          slicer_filament_name: text(row, 'name'),
        });
    }
  });
  return result;
}
export function kProfileMatches(
  profile: InventoryRecord,
  spool: InventoryRecord,
) {
  const normalizeId = (value: string) =>
    value.replace(/^GFS/, 'GF').replace(/_\d+$/, '').toUpperCase();
  const spoolId = normalizeId(text(spool, 'slicer_filament'));
  const profileId = normalizeId(text(profile, 'filament_id'));
  const brand = text(spool, 'brand').trim();
  if (
    spoolId &&
    profileId === spoolId &&
    (!/^GF.99$/.test(spoolId) || !brand || brand.toLowerCase() === 'generic')
  )
    return true;
  const name = text(profile, 'name').toLowerCase();
  const material = text(spool, 'material').toLowerCase();
  if (!material || !name.includes(material)) return false;
  return (
    (!brand || name.includes(brand.toLowerCase())) &&
    (!spool.subtype || name.includes(text(spool, 'subtype').toLowerCase()))
  );
}
