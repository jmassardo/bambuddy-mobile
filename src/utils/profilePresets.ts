import type { PresetDetail, PresetField } from '@/types/api';

export function presetRows(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source))
    return source.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    );
  if (!source || typeof source !== 'object') return [];
  const record = source as Record<string, unknown>;
  for (const key of ['profiles', 'items', 'results']) {
    if (Array.isArray(record[key])) return presetRows(record[key]);
  }
  return ['filament', 'printer', 'process'].flatMap(type =>
    presetRows(record[type]).map(row => ({
      ...row,
      type: row.type ?? row.preset_type ?? type,
    })),
  );
}

export type PresetFilters = Record<
  'search' | 'type' | 'owner' | 'printer' | 'nozzle' | 'filament' | 'layer',
  string
>;
export const EMPTY_PRESET_FILTERS: PresetFilters = {
  search: '',
  type: '',
  owner: '',
  printer: '',
  nozzle: '',
  filament: '',
  layer: '',
};
export function presetMetadata(row: Record<string, unknown>) {
  const name = `${String(row.name ?? '')} ${String(row.inherits ?? '')}`;
  const nozzle = name.match(
    /(\d+\.?\d*)\s*(?:mm\s*)?nozzle|nozzle\s*(\d+\.?\d*)/i,
  );
  return {
    type: String(row.type ?? row.preset_type ?? '').replace(
      /^print$/,
      'process',
    ),
    owner:
      row.is_custom === true || row.source === 'user' ? 'custom' : 'system',
    printer:
      name
        .match(
          /@?\s*(?:BBL\s+)?(?:Bambu\s+Lab\s+)?([XPAH][1-9][A-Z]?(?:\s*(?:Carbon|mini))?)/i,
        )?.[1]
        ?.trim() ?? '',
    nozzle: nozzle ? `${nozzle[1] || nozzle[2]}mm` : '',
    layer:
      name.match(
        /(\d+\.?\d*)mm\s*(?:Standard|Fine|Extra Fine|Draft|Quality)?/i,
      )?.[1] ?? '',
    filament:
      name
        .match(
          /\b(PLA(?:-CF)?|PETG|ABS|ASA|TPU|PC|PA(?:-CF)?|PVA|HIPS|PP|PET(?:-CF)?)\b/i,
        )?.[1]
        ?.toUpperCase() ?? '',
  };
}
export function filterPresets(
  rows: Record<string, unknown>[],
  filters: PresetFilters,
) {
  return rows.filter(row => {
    const meta = presetMetadata(row);
    return (
      String(row.name ?? '')
        .toLowerCase()
        .includes(filters.search.toLowerCase()) &&
      (Object.keys(meta) as Array<keyof typeof meta>).every(
        key => !filters[key] || filters[key] === meta[key],
      )
    );
  });
}
export function parsePresetJson(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(json);
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function typedPresetValue(
  input: string,
  previous: unknown,
  definition?: PresetField,
): unknown {
  if (Array.isArray(previous)) {
    if (previous.length <= 1)
      return [typedPresetValue(input, previous[0], definition)];
    const array: unknown = JSON.parse(input);
    if (!Array.isArray(array)) throw new Error('Expected a JSON array.');
    return array;
  }
  if (definition?.type === 'number' || typeof previous === 'number') {
    if (!input.trim() || !Number.isFinite(Number(input)))
      throw new Error('Enter a finite number.');
    const number = Number(input);
    if (typeof definition?.min === 'number' && number < definition.min)
      throw new Error(`Minimum: ${definition.min}`);
    if (typeof definition?.max === 'number' && number > definition.max)
      throw new Error(`Maximum: ${definition.max}`);
    return typeof previous === 'string' ? input : number;
  }
  if (definition?.type === 'boolean' || typeof previous === 'boolean') {
    if (!['true', 'false', '1', '0'].includes(input))
      throw new Error('Expected true, false, 1 or 0.');
    return typeof previous === 'string'
      ? input
      : input === 'true' || input === '1';
  }
  if (previous !== null && typeof previous === 'object')
    return parsePresetJson(input);
  return input;
}
export function presetDiff(
  setting: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(setting), ...Object.keys(base)])]
    .sort()
    .map(key => ({
      key,
      value: setting[key],
      inherited: base[key],
      changed:
        JSON.stringify(
          Object.hasOwn(setting, key) ? setting[key] : base[key],
        ) !== JSON.stringify(base[key]),
      override: Object.hasOwn(setting, key),
    }));
}

export async function resolvePresetInheritance(
  id: string,
  profiles: Record<string, unknown>[],
  fetchDetail: (id: string) => Promise<PresetDetail>,
): Promise<PresetDetail> {
  const visited = new Set<string>();
  const chain: PresetDetail[] = [];
  let next = id;
  while (next) {
    if (visited.has(next))
      throw new Error('Preset inheritance contains a cycle.');
    visited.add(next);
    const detail = await fetchDetail(next);
    chain.push(detail);
    const inherits = Array.isArray(detail.setting.inherits)
      ? detail.setting.inherits[0]
      : detail.setting.inherits;
    const parent =
      typeof inherits === 'string'
        ? profiles.find(profile => profile.name === inherits)
        : null;
    next =
      detail.base_id || (parent?.setting_id ? String(parent.setting_id) : '');
  }
  return {
    ...chain[0],
    setting: Object.assign(
      {},
      ...chain.reverse().map(detail => detail.setting),
    ) as Record<string, unknown>,
  };
}
