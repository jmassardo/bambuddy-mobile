import type { InventoryRecord } from '@/types/api';

export const text = (
  row: InventoryRecord | null | undefined,
  key: string,
  fallback = '',
) => (row?.[key] == null ? fallback : String(row[key]));
export const number = (
  row: InventoryRecord | null | undefined,
  key: string,
  fallback = 0,
) =>
  row?.[key] == null || !Number.isFinite(Number(row[key]))
    ? fallback
    : Number(row[key]);
export const records = (value: unknown): InventoryRecord[] =>
  Array.isArray(value)
    ? value.filter(
        (v): v is InventoryRecord => v !== null && typeof v === 'object',
      )
    : [];
export const remaining = (row: InventoryRecord) =>
  Math.max(0, number(row, 'label_weight') - number(row, 'weight_used'));
export function lowStock(row: InventoryRecord, globalThreshold: number) {
  return (
    (remaining(row) / Math.max(1, number(row, 'label_weight'))) * 100 <
    number(row, 'low_stock_threshold_pct', globalThreshold)
  );
}
export function spoolMatchesQuery(
  row: InventoryRecord,
  query: string,
  displayedColor = '',
) {
  const q = query.trim().toLowerCase();
  const exact = /^#(\d+)$/.exec(q);
  if (exact) return number(row, 'id') === Number(exact[1]);
  return (
    !q ||
    [
      'id',
      'brand',
      'material',
      'subtype',
      'color_name',
      'note',
      'slicer_filament_name',
      'slicer_filament',
      'material_number',
      'storage_location',
      'category',
      'tag_uid',
      'tray_uuid',
    ].some(key => text(row, key).toLowerCase().includes(q)) ||
    displayedColor.toLowerCase().includes(q) ||
    records(row.suppliers).some(link =>
      ['supplier_name', 'supplier_article_number'].some(key =>
        text(link, key).toLowerCase().includes(q),
      ),
    )
  );
}
export type InventoryFilters = Record<string, string>;
export const NO_INVENTORY_VALUE = 'none'.padStart(256, '_');
export function filterInventory(
  rows: InventoryRecord[],
  filters: InventoryFilters,
  assigned: Set<number>,
  threshold: number,
) {
  return rows.filter(row =>
    Object.entries(filters).every(([key, value]) => {
      if (!value || value === 'all') return true;
      if (key === 'usage')
        return value === 'new'
          ? number(row, 'weight_used') === 0
          : number(row, 'weight_used') > 0;
      if (key === 'stock')
        return value === 'configured'
          ? !!row.slicer_filament
          : !row.slicer_filament;
      if (key === 'ams')
        return assigned.has(number(row, 'id')) === (value === 'assigned');
      if (key === 'low') return !value || lowStock(row, threshold);
      if (key === 'supplier_id')
        return value === NO_INVENTORY_VALUE
          ? records(row.suppliers).length === 0
          : records(row.suppliers).some(
              link => text(link, 'supplier_id') === value,
            );
      return value === NO_INVENTORY_VALUE
        ? row[key] == null || row[key] === ''
        : text(row, key) === value;
    }),
  );
}
export function groupInventory(rows: InventoryRecord[]) {
  const groups = new Map<string, InventoryRecord[]>();
  rows.forEach(row => {
    const key = JSON.stringify(
      [
        'material',
        'subtype',
        'brand',
        'rgba',
        'color_name',
        'extra_colors',
        'effect_type',
        'label_weight',
      ].map(field => row[field] ?? null),
    );
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return [...groups.entries()].map(([key, spools]) => ({
    key,
    spools,
    remaining: spools.reduce((sum, spool) => sum + remaining(spool), 0),
  }));
}
export function parseNumber(
  value: string,
  label: string,
  min = 0,
  max = Infinity,
  nullable = false,
): number | null {
  if (nullable && !value.trim()) return null;
  const result = Number(value);
  if (!value.trim() || !Number.isFinite(result) || result < min || result > max)
    throw new Error(
      `${label}: enter a number from ${min} to ${
        max === Infinity ? '∞' : max
      }.`,
    );
  return result;
}
export function selectivePatch(
  values: Record<string, string>,
  changed: string[],
  numeric: string[],
) {
  return Object.fromEntries(
    changed.map(key => [
      key,
      numeric.includes(key)
        ? parseNumber(
            values[key] ?? '',
            key,
            0,
            key === 'low_stock_threshold_pct' ? 99 : Infinity,
            true,
          )
        : values[key]?.trim() || null,
    ]),
  );
}
export function copySpool(row: InventoryRecord): InventoryRecord {
  const copy = { ...row };
  [
    'id',
    'tag_uid',
    'tray_uuid',
    'created_at',
    'updated_at',
    'archived_at',
    'last_used',
    'last_scale_weight',
    'last_weighed_at',
    'encode_time',
    'added_full',
    'data_origin',
    'tag_type',
  ].forEach(key => delete copy[key]);
  copy.weight_used = 0;
  copy.weight_used_baseline = 0;
  return copy;
}
export function inventoryColorName(
  row: InventoryRecord,
  catalog: InventoryRecord[],
) {
  const stored = text(row, 'color_name');
  const readable = stored && !/^[A-Z]\d+-[A-Z]\d+$/.test(stored);
  if (readable && !row.color_name_is_synthesized) return stored;
  const hex = text(row, 'rgba').replace('#', '').toLowerCase();
  if (hex.length === 8 && hex.endsWith('00')) return 'Clear';
  const matching = catalog.filter(
    entry =>
      text(entry, 'hex_color').replace('#', '').toLowerCase().slice(0, 6) ===
      hex.slice(0, 6),
  );
  const color =
    matching.find(entry => text(entry, 'material') === text(row, 'material')) ??
    matching[0];
  return text(color, 'color_name') || (readable ? stored : '');
}
export function colorOrder(value: string) {
  const hex = value.replace('#', '');
  if (!/^[a-f\d]{6}([a-f\d]{2})?$/i.test(hex)) return 99e9;
  if (hex.length === 8 && hex.endsWith('00')) return 15e9;
  const [r, g, b] = [0, 2, 4].map(
    index => parseInt(hex.slice(index, index + 2), 16) / 255,
  );
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const hue = delta
    ? ((max === r
        ? (g - b) / delta
        : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4) *
        60 +
        360) %
      360
    : 0;
  const neutral =
    lightness < 0.15
      ? 14
      : lightness > 0.85
      ? 9
      : saturation < 0.15
      ? lightness < 0.4
        ? 13
        : lightness > 0.6
        ? 10
        : 11
      : null;
  const family =
    neutral ??
    (hue >= 15 && hue < 70 && lightness < (hue < 45 ? 0.45 : 0.4)
      ? 8
      : hue < 15 || hue >= 345
      ? 0
      : hue < 45
      ? 1
      : hue < 70
      ? 2
      : hue < 150
      ? 3
      : hue < 200
      ? 4
      : hue < 260
      ? 5
      : hue < 290
      ? 6
      : 7);
  return (
    family * 1e9 +
    (neutral === null
      ? hue * 1e6 + saturation * 1000 + lightness
      : (1 - lightness) * 1e6)
  );
}
