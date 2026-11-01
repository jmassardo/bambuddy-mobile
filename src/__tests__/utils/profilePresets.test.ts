import {
  EMPTY_PRESET_FILTERS,
  filterPresets,
  parsePresetJson,
  presetDiff,
  presetRows,
  resolvePresetInheritance,
  typedPresetValue,
} from '@/utils/profilePresets';
import { kProfileNoteKeys, validateKImport } from '@/utils/kProfiles';
import {
  maintenanceDocumentation,
  validMaintenanceNumber,
} from '@/utils/maintenance';
import type { KProfile } from '@/types/api';

describe('profile preset workflows', () => {
  it('flattens the real grouped response and combines metadata and text filters', () => {
    const rows = presetRows({
      filament: [
        { name: 'PLA @BBL X1C 0.4 nozzle', is_custom: true, setting_id: 'p' },
      ],
      process: [
        { name: '0.20mm Standard @BBL X1C 0.4 nozzle', is_custom: false },
      ],
      printer: [{ name: 'Bambu Lab P1S 0.6 nozzle', is_custom: false }],
    });
    expect(rows).toHaveLength(3);
    expect(
      filterPresets(rows, {
        ...EMPTY_PRESET_FILTERS,
        printer: 'X1C',
        nozzle: '0.4mm',
        owner: 'custom',
        filament: 'PLA',
        search: 'pla',
      }),
    ).toEqual([expect.objectContaining({ setting_id: 'p', type: 'filament' })]);
    expect(
      filterPresets(rows, {
        ...EMPTY_PRESET_FILTERS,
        type: 'process',
        layer: '0.20',
      }),
    ).toHaveLength(1);
    expect(filterPresets(rows, EMPTY_PRESET_FILTERS)).toHaveLength(3);
  });
  it('edits typed array values while preserving protocol strings and unknown JSON', () => {
    expect(
      typedPresetValue('215', ['200'], { key: 'temperature', type: 'number' }),
    ).toEqual(['215']);
    expect(typedPresetValue('false', true)).toBe(false);
    expect(typedPresetValue('{"nested":null}', { old: 1 })).toEqual({
      nested: null,
    });
    expect(() => typedPresetValue('bad', 1)).toThrow('finite');
    expect(() =>
      typedPresetValue('300', 1, { key: 'temp', type: 'number', max: 250 }),
    ).toThrow('Maximum');
    expect(() => parsePresetJson('[]')).toThrow('JSON object');
    expect(() => parsePresetJson('{')).toThrow();
  });
  it('distinguishes inherited, changed and explicit-null values in base differences', () => {
    const diff = presetDiff(
      { speed: 20, custom: { unknown: true }, optional: null },
      { speed: 10, inherited: ['x'], optional: 'on' },
    );
    expect(diff.find(field => field.key === 'inherited')).toMatchObject({
      override: false,
      changed: false,
    });
    expect(diff.find(field => field.key === 'optional')).toMatchObject({
      value: null,
      changed: true,
    });
    expect(diff.find(field => field.key === 'custom')).toMatchObject({
      value: { unknown: true },
      changed: true,
    });
  });
  it('resolves inherited base chains without dropping unknown/default values and detects cycles', async () => {
    const details = {
      child: {
        name: 'Child',
        base_id: 'middle',
        setting: { speed: ['200'], custom: null },
      },
      middle: {
        name: 'Middle',
        setting: { inherits: 'Root', inherited_unknown: { x: 1 } },
      },
      root: { name: 'Root', setting: { speed: ['100'], root_default: true } },
    };
    const fetchDetail = jest.fn(
      async (id: string) => details[id as keyof typeof details],
    );
    const resolved = await resolvePresetInheritance(
      'child',
      [{ setting_id: 'root', name: 'Root' }],
      fetchDetail,
    );
    expect(resolved.setting).toEqual({
      speed: ['200'],
      custom: null,
      inherits: 'Root',
      inherited_unknown: { x: 1 },
      root_default: true,
    });
    await expect(
      resolvePresetInheritance('cycle', [], async () => ({
        name: 'cycle',
        base_id: 'cycle',
        setting: {},
      })),
    ).rejects.toThrow('cycle');
  });
});
describe('K profile import and notes', () => {
  it('re-creates imported profiles without reusing the source printer storage identities', () => {
    const rows = validateKImport(
      {
        nozzle_diameter: '0.6',
        profiles: [
          {
            name: 'PLA',
            filament_id: 'GFA00',
            k_value: '0.02',
            slot_id: 17,
            setting_id: 'old',
            nozzle_id: 'HH00-0.6',
            extruder_id: 1,
          },
        ],
      },
      '0.6',
    );
    expect(rows[0]).toMatchObject({
      slot_id: 0,
      nozzle_id: 'HH00-0.6',
      extruder_id: 1,
      k_value: '0.020000',
    });
    expect(rows[0].setting_id).toBeUndefined();
    expect(() =>
      validateKImport({ profiles: [{ ...rows[0], k_value: 'abc' }] }, '0.6'),
    ).toThrow();
    expect(() =>
      validateKImport(
        { profiles: [{ ...rows[0], nozzle_diameter: '0.4' }] },
        '0.6',
      ),
    ).toThrow('nozzle diameter');
  });
  it('finds both preexisting slot notes and newly-created name notes', () => {
    expect(
      kProfileNoteKeys({
        slot_id: 5,
        extruder_id: 1,
        filament_id: 'GFA00',
        name: 'PLA',
        setting_id: 'id',
      } as KProfile),
    ).toEqual(['id', 'slot_5_GFA00_1', 'name_PLA_GFA00']);
  });
});
describe('maintenance input and documentation', () => {
  it('rejects empty/negative/nonfinite hours and zero intervals but accepts zero lifetime hours', () => {
    expect(
      ['', '-1', 'Infinity', 'abc'].map(value => validMaintenanceNumber(value)),
    ).toEqual([null, null, null, null]);
    expect(validMaintenanceNumber('0')).toBe(0);
    expect(validMaintenanceNumber('0', 1)).toBeNull();
    expect(validMaintenanceNumber('25.5', 1)).toBe(25.5);
  });
  it('uses custom documentation or exact model-specific hardware guidance', () => {
    expect(maintenanceDocumentation('Clean Steel Rods', 'X2D')).toContain(
      '/p2s/maintenance/',
    );
    expect(maintenanceDocumentation('Clean Carbon Rods', 'H2D')).toBeNull();
    expect(
      maintenanceDocumentation('Lubricate Linear Rails', 'A1 Mini'),
    ).toContain('/a1-mini/');
    expect(
      maintenanceDocumentation('Custom', 'X1C', 'https://example.com/manual'),
    ).toBe('https://example.com/manual');
    expect(
      maintenanceDocumentation('Custom', 'X1C', 'file:///manual'),
    ).toBeNull();
  });
});
