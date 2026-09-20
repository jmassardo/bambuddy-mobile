import { inventoryApi } from '@/api/inventory';
import type { InventorySpool } from '@/types/api';

describe('inventoryApi.matchSpoolByUid', () => {
  const sampleSpool: InventorySpool = {
    id: 1,
    material: 'PLA',
    subtype: null,
    color_name: 'Red',
    color_name_is_synthesized: false,
    rgba: '#ff0000',
    extra_colors: null,
    effect_type: null,
    brand: 'TestBrand',
    label_weight: 1000,
    core_weight: 200,
    core_weight_catalog_id: null,
    weight_used: 100,
    slicer_filament: 'pla',
    slicer_filament_name: 'PLA',
    nozzle_temp_min: 190,
    nozzle_temp_max: 220,
    tag_uid: '04:A1-B2-C3:D4-E5:F6',
    tray_uuid: null,
    drying_temp: null,
    drying_time: null,
    state: null,
    spool_tag_uid: null,
    spool_identifier: null,
    spool_type: null,
    color_hex: null,
    density: null,
    spool_weight: null,
    spool_core_diameter: null,
    spool_width: null,
    spool_diameter: null,
    manufacturer: null,
    filament_cost: null,
    filament_cost_unit: null,
    notes: null,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  } as unknown as InventorySpool;

  it('returns undefined when no spools match', () => {
    const result = inventoryApi.matchSpoolByUid([], '04A1B2C3D4E5F6');
    expect(result).toBeUndefined();
  });

  it('returns undefined when spool has no tag_uid', () => {
    const spools = [
      { ...sampleSpool, tag_uid: null } as unknown as InventorySpool,
    ];
    const result = inventoryApi.matchSpoolByUid(spools, '04A1B2C3D4E5F6');
    expect(result).toBeUndefined();
  });

  it('returns undefined for invalid tag_uid formats', () => {
    const spools = [
      { ...sampleSpool, tag_uid: '123' } as unknown as InventorySpool,
      { ...sampleSpool, tag_uid: '12:3G' } as unknown as InventorySpool,
      { ...sampleSpool, tag_uid: '' } as unknown as InventorySpool,
    ];
    const result = inventoryApi.matchSpoolByUid(spools, '04A1B2C3D4E5F6');
    expect(result).toBeUndefined();
  });

  it('matches with normalized UID (colons and spaces removed)', () => {
    const result = inventoryApi.matchSpoolByUid([sampleSpool], '04A1B2C3D4E5F6');
    expect(result).toEqual(sampleSpool);
  });

  it('matches with lowercase input (input is uppercased)', () => {
    // canonicalizeNfcUid uppercases the result, so both must match after uppercasing
    const result = inventoryApi.matchSpoolByUid([sampleSpool], '04a1b2c3d4e5f6'.toUpperCase());
    expect(result).toEqual(sampleSpool);
  });

  it('matches with spaces in UID', () => {
    const result = inventoryApi.matchSpoolByUid(
      [{ ...sampleSpool, tag_uid: ' 04 A1 B2 C3 D4 E5 F6 ' } as unknown as InventorySpool],
      '04A1B2C3D4E5F6',
    );
    expect(result).toBeTruthy();
  });

  it('does not match different UIDs', () => {
    const result = inventoryApi.matchSpoolByUid([sampleSpool], '1234ABCD');
    expect(result).toBeUndefined();
  });

  it('prefers first match when multiple spools have the same UID', () => {
    const spools = [sampleSpool, { ...sampleSpool, id: 2 }] as unknown as InventorySpool[];
    const result = inventoryApi.matchSpoolByUid(spools, '04A1B2C3D4E5F6');
    expect(result?.id).toBe(1);
  });

  it('ignores spools with malformed tag_uid values', () => {
    const spools = [
      { ...sampleSpool, id: 1, tag_uid: '04A1B2C3D4E5F6' } as unknown as InventorySpool,
      { ...sampleSpool, id: 2, tag_uid: 'invalid' } as unknown as InventorySpool,
      { ...sampleSpool, id: 3, tag_uid: '04A1B2C3D4E5F6' } as unknown as InventorySpool,
    ];
    const result = inventoryApi.matchSpoolByUid(spools, '04A1B2C3D4E5F6');
    expect(result?.id).toBe(1);
  });
});
