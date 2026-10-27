import {
  colorOrder,
  copySpool,
  filterInventory,
  groupInventory,
  inventoryColorName,
  lowStock,
  NO_INVENTORY_VALUE,
  selectivePatch,
  spoolMatchesQuery,
} from '@/utils/inventory';
import { buildSkuForecasts } from '@/utils/inventoryForecast';
import {
  autoMatchSpoolPresets,
  kProfileMatches,
} from '@/utils/inventoryPresets';

it('matches only the same preset product and canonical model, preferring explicit nozzle presets', () => {
  const rows = [
    { id: 'wrong', name: 'Other PLA @ Bambu Lab A1 mini 0.4 nozzle' },
    { id: 'wide', name: 'Maker PLA @ Bambu Lab A1 mini' },
    { id: 'fine', name: 'Maker PLA @ Bambu Lab A1 mini 0.2 nozzle' },
    { id: 'wrong-model', name: 'Maker PLA @ Bambu Lab A1 0.4 nozzle' },
  ];
  const result = autoMatchSpoolPresets(
    'Maker PLA @ Bambu Lab X1 Carbon 0.4 nozzle',
    ['A1M'],
    rows,
    { 'Bambu Lab A1 mini': 'A1 mini' },
  );
  expect(result).toHaveLength(5);
  expect(
    result.find(row => row.nozzle_diameter === '0.2')?.slicer_filament,
  ).toBe('fine');
  expect(
    result.find(row => row.nozzle_diameter === '0.4')?.slicer_filament,
  ).toBe('wide');
  expect(autoMatchSpoolPresets('Unknown product', ['A1M'], rows, {})).toEqual(
    [],
  );
});

it('normalizes built-in filament ids without treating a branded spool as an arbitrary generic K profile', () => {
  expect(
    kProfileMatches({ filament_id: 'GFA00_01' }, { slicer_filament: 'GFSA00' }),
  ).toBe(true);
  expect(
    kProfileMatches(
      { filament_id: 'GFA99', name: 'Generic PLA' },
      { slicer_filament: 'GFA99', brand: 'Maker', material: 'PLA' },
    ),
  ).toBe(false);
  expect(
    kProfileMatches(
      { name: 'Maker PLA Silk' },
      { material: 'PLA', brand: 'Maker', subtype: 'Silk' },
    ),
  ).toBe(true);
  expect(
    kProfileMatches(
      { name: 'Maker PLA Basic' },
      { material: 'PLA', brand: 'Maker', subtype: 'Silk' },
    ),
  ).toBe(false);
});

const spool = {
  id: 3,
  material: 'PLA',
  brand: 'Maker',
  subtype: 'Silk',
  color_name: null,
  rgba: 'AABBCCFF',
  label_weight: 1000,
  weight_used: 900,
  weight_used_baseline: 400,
  category: null,
  material_number: 'MAT-42',
  location_id: null,
  slicer_filament: 'PFUS123',
  slicer_filament_name: 'My preset',
  note: 'Purchasing note',
  tag_uid: 'AABBCCDD',
  tray_uuid: 'uuid',
  archived_at: null,
  suppliers: [
    {
      supplier_id: 7,
      supplier_name: 'Supplier',
      supplier_article_number: 'SKU-9',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  last_scale_weight: 200,
  last_weighed_at: '2026-01-03',
};
describe('inventory parity transformations', () => {
  it('distinguishes an exact physical label ID from numeric substrings and searches purchasing/preset/catalog fields', () => {
    expect(spoolMatchesQuery({ ...spool, id: 13 }, '#3')).toBe(false);
    expect(spoolMatchesQuery({ ...spool, id: 13 }, '3')).toBe(true);
    expect(spoolMatchesQuery(spool, ' #3 ')).toBe(true);
    [
      'Maker',
      'Silk',
      'MAT-42',
      'Purchasing',
      'My preset',
      'Supplier',
      'SKU-9',
    ].forEach(query => expect(spoolMatchesQuery(spool, query)).toBe(true));
    expect(spoolMatchesQuery(spool, 'Blue mist', 'Blue mist')).toBe(true);
  });
  it('combines usage, configured-vs-stock, actual AMS, none and supplier filters independently', () => {
    const assigned = new Set([3]);
    expect(
      filterInventory(
        [spool],
        {
          usage: 'used',
          stock: 'configured',
          ams: 'assigned',
          category: NO_INVENTORY_VALUE,
          location_id: NO_INVENTORY_VALUE,
          supplier_id: '7',
        },
        assigned,
        20,
      ),
    ).toHaveLength(1);
    expect(
      filterInventory([spool], { stock: 'stock' }, assigned, 20),
    ).toHaveLength(0);
    expect(
      filterInventory(
        [{ ...spool, slicer_filament: null }],
        { stock: 'stock', ams: 'assigned' },
        assigned,
        20,
      ),
    ).toHaveLength(1);
    expect(
      filterInventory(
        [spool],
        { supplier_id: NO_INVENTORY_VALUE },
        assigned,
        20,
      ),
    ).toHaveLength(0);
    expect(filterInventory([spool], {}, assigned, 20)).toHaveLength(1);
  });
  it('uses the per-spool low-stock override and the upstream strict threshold boundary', () => {
    expect(lowStock(spool, 20)).toBe(true);
    expect(lowStock({ ...spool, low_stock_threshold_pct: 5 }, 20)).toBe(false);
    expect(lowStock({ ...spool, low_stock_threshold_pct: 10 }, 20)).toBe(false);
  });
  it('groups matching spools with aggregate remaining weights without absorbing another preset or color', () => {
    const groups = groupInventory([
      spool,
      { ...spool, id: 4, weight_used: 200 },
      { ...spool, id: 5, rgba: '112233FF' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].spools).toHaveLength(2);
    expect(groups[0].remaining).toBe(900);
    expect(
      groupInventory([
        spool,
        { ...spool, extra_colors: 'ff0000' },
        { ...spool, effect_type: 'sparkle' },
      ]),
    ).toHaveLength(3);
  });
  it('resolves synthesized/code colors through the catalog, preserves transparent identity and sorts by color instead of name', () => {
    const colors = [
      { hex_color: '#AABBCC', color_name: 'Sky', material: 'PLA' },
    ];
    expect(
      inventoryColorName(
        { ...spool, color_name: 'Silk', color_name_is_synthesized: true },
        colors,
      ),
    ).toBe('Sky');
    expect(inventoryColorName({ ...spool, rgba: '00000000' }, colors)).toBe(
      'Clear',
    );
    expect(colorOrder('FF0000FF')).toBeLessThan(colorOrder('00FF00FF'));
    expect(colorOrder('00FF00FF')).toBeLessThan(colorOrder('0000FFFF'));
    expect(colorOrder('000000FF')).toBeLessThan(colorOrder('00000000'));
    expect(
      filterInventory(
        [{ ...spool, material_number: 'none' }],
        { material_number: 'none' },
        new Set(),
        20,
      ),
    ).toHaveLength(1);
  });
  it('copies purchasing metadata but never unique tag, assignment, provenance or stock consumption identity', () => {
    const copy = copySpool(spool);
    expect(copy).toMatchObject({
      material_number: 'MAT-42',
      weight_used: 0,
      weight_used_baseline: 0,
    });
    [
      'id',
      'tag_uid',
      'tray_uuid',
      'created_at',
      'last_scale_weight',
      'last_weighed_at',
    ].forEach(key => expect(copy).not.toHaveProperty(key));
  });
  it('patches only explicitly checked fields, supports nullable clears and preserves numeric zero', () => {
    expect(
      selectivePatch(
        { brand: 'Unused', note: '', core_weight: '0', location_id: '4' },
        ['note', 'core_weight', 'location_id'],
        ['core_weight', 'location_id'],
      ),
    ).toEqual({ note: null, core_weight: 0, location_id: 4 });
    expect(() =>
      selectivePatch({ core_weight: 'NaN' }, ['core_weight'], ['core_weight']),
    ).toThrow();
  });
});
describe('SKU forecasting', () => {
  const now = Date.parse('2026-01-31');
  it('aggregates stock and daily concurrent prints and applies persisted lead, gram safety and snooze', () => {
    const rows = [spool, { ...spool, id: 4, weight_used: 700 }];
    const usage = [
      { spool_id: 3, weight_used: 100, created_at: '2026-01-29T10:00:00Z' },
      { spool_id: 3, weight_used: 20, created_at: '2026-01-30T10:00:00Z' },
      { spool_id: 4, weight_used: 30, created_at: '2026-01-30T10:00:00Z' },
    ];
    const forecast = buildSkuForecasts(
      rows,
      usage,
      [
        {
          ...spool,
          lead_time_days: 10,
          safety_margin_unit: 'g',
          safety_margin_value: 200,
          alerts_snoozed: true,
        },
      ],
      3,
      now,
    )[0];
    expect(forecast.stock).toBe(400);
    expect(forecast.dailyRate).toBeCloseTo(50);
    expect(forecast.safety).toBe(200);
    expect(forecast.reorderPoint).toBe(700);
    expect(forecast.stockBreak).toBe(true);
    expect(forecast.config?.alerts_snoozed).toBe(true);
  });
  it('falls back to consumption since counter baseline, not lifetime use, and never invents demand for new spools', () => {
    const delta = buildSkuForecasts([spool], [], [], 5, now)[0];
    expect(delta.dailyRate).toBeCloseTo(500 / 30);
    const fresh = buildSkuForecasts(
      [{ ...spool, weight_used: 0 }],
      [],
      [],
      5,
      now,
    )[0];
    expect(fresh.dailyRate).toBeNull();
    expect(fresh.reorderPoint).toBe(0);
    expect(fresh.stockBreak).toBe(false);
  });
});
