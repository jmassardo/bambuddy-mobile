import {
  buildSliceRequest,
  hasTarget,
  parseRef,
  refValue,
  staleRefs,
} from '@/utils/sliceConfiguration';
import {
  processSchema,
  serializeIntentional,
  validateSetting,
} from '@/components/slicing/ProcessSettingsEditor';
import { disabledKeys, type ToggleRules } from '@/utils/slicerToggle';
import rules from '@/data/slicer/process-toggle-rules.json';
import { validateSlicerSetup } from '@/components/slicing/SlicerSetupSection';
import type {
  PresetRef,
  SlicerPipeline,
  UnifiedPresetsResponse,
} from '@/types/api';

const ref: PresetRef = { source: 'local', id: 'my:profile' };
const configuration = () => ({
  printer: ref,
  process: ref,
  filaments: [ref, ref, ref],
  slots: [
    { slot_id: 1, type: 'PLA', color: '#123456FF' },
    { slot_id: 2, type: 'PETG', color: '' },
    { slot_id: 3, type: 'PLA', color: '#FF0000', used_in_plate: true },
  ],
  colours: [null, '#ABCDEF', null],
  plate: 0,
  bed: 'Textured PEI Plate',
  embedded: false,
  canEmbed: true,
  orient: true,
  arrange: true,
  sourceKeys: ['wall_loops'],
  hasDesignOverrides: true,
  overrides: { sparse_infill_density: '20%' },
});
describe('Slicing configuration precedence', () => {
  it('keeps positional unused slots, source alpha, explicit colours and all-plates sentinel', () => {
    const body = buildSliceRequest(configuration());
    expect(body).toMatchObject({
      printer_preset: ref,
      process_preset: ref,
      filament_presets: [ref, ref, ref],
      filament_colours: ['#123456FF', '#ABCDEF', '#FF0000'],
      plate: 0,
      bed_type: 'Textured PEI Plate',
      auto_orient: true,
      auto_arrange: true,
      design_overrides: ['wall_loops'],
      process_overrides: { sparse_infill_density: '20%' },
    });
  });
  it('embedded slicing excludes incompatible overrides but retains layout actions and required refs', () => {
    const body = buildSliceRequest({ ...configuration(), embedded: true });
    expect(body.use_embedded_settings).toBe(true);
    expect(body.printer_preset).toEqual(ref);
    expect(body.auto_arrange).toBe(true);
    expect(body).not.toHaveProperty('process_overrides');
    expect(body).not.toHaveProperty('design_overrides');
    expect(body).not.toHaveProperty('bed_type');
    expect(
      buildSliceRequest({
        ...configuration(),
        embedded: true,
        canEmbed: false,
      }),
    ).not.toHaveProperty('use_embedded_settings');
  });
  it('sends an explicit empty source-key list and rejects incomplete or malformed selections', () => {
    expect(
      buildSliceRequest({ ...configuration(), sourceKeys: [] })
        .design_overrides,
    ).toEqual([]);
    expect(() =>
      buildSliceRequest({ ...configuration(), filaments: [ref, null, ref] }),
    ).toThrow('Select');
    expect(() =>
      buildSliceRequest({ ...configuration(), colours: ['#oops'] }),
    ).toThrow('colours');
    expect(parseRef(refValue(ref))).toEqual(ref);
    expect(parseRef('untrusted:any')).toBeNull();
  });
  it('serializes only intentional deviations using actual process types', () => {
    expect(
      serializeIntentional(
        {
          layer_height: '0.2',
          enable_support: true,
          sparse_infill_density: '20',
          wall_loops: '',
          support_threshold_angle: '99999',
        },
        { layer_height: '0.2', sparse_infill_density: '15%' },
      ),
    ).toEqual({
      enable_support: '1',
      sparse_infill_density: '20%',
    });
    expect(validateSetting(processSchema.wall_loops, '2.5')).toMatch(/whole/);
    expect(validateSetting(processSchema.wall_loops, '2e1')).toMatch(/whole/);
    expect(validateSetting(processSchema.layer_height, '-1')).toMatch(
      /Minimum/,
    );
    expect(validateSetting(processSchema.layer_height, 'NaN')).toMatch(
      /finite/,
    );
    expect(
      serializeIntentional(
        { enable_overhang_speed: [false, true] },
        { enable_overhang_speed: ['1', '1'] },
      ),
    ).toEqual({ enable_overhang_speed: ['0', '1'] });
  });
  it('evaluates dependencies against preset + adopted source + manual override effective state', () => {
    const baseline = { enable_support: '0' };
    expect(
      disabledKeys(baseline, processSchema, rules as ToggleRules).has(
        'support_threshold_angle',
      ),
    ).toBe(true);
    expect(
      disabledKeys(
        { ...baseline, enable_support: '1' },
        processSchema,
        rules as ToggleRules,
      ).has('support_threshold_angle'),
    ).toBe(false);
  });
});
describe('Pipeline references and sidecar settings', () => {
  it('reports stale references per slot without conflating ids from different sources', () => {
    const empty = { printer: [], process: [], filament: [] };
    const presets: UnifiedPresetsResponse = {
      local: {
        printer: [{ ...ref, name: 'Printer' }],
        process: [],
        filament: [],
      },
      standard: empty,
      cloud: empty,
      orca_cloud: empty,
      cloud_status: 'ok',
      orca_cloud_status: 'ok',
    };
    const pipeline = {
      printer_preset: ref,
      process_preset: { ...ref, source: 'cloud' },
      filament_presets: [ref],
      target_kind: 'printer_class',
      target_model_class: null,
    } as SlicerPipeline;
    expect(staleRefs(pipeline, presets)).toHaveLength(2);
    expect(hasTarget(pipeline)).toBe(false);
    expect(hasTarget({ ...pipeline, target_model_class: 'P1S' })).toBe(true);
  });
  it('validates only the active URL and requires a bounded integral stall timeout', () => {
    const settings = {
      preferred_slicer: 'bambu_studio' as const,
      use_slicer_api: true,
      bambu_studio_api_url: 'https://sidecar:3001',
      orcaslicer_api_url: 'inactive-invalid',
      slicer_stall_timeout_minutes: 15,
    };
    expect(validateSlicerSetup(settings)).toBeNull();
    expect(
      validateSlicerSetup({
        ...settings,
        bambu_studio_api_url: 'file:///sidecar',
      }),
    ).toMatch(/HTTP/);
    expect(
      validateSlicerSetup({ ...settings, slicer_stall_timeout_minutes: 241 }),
    ).toMatch(/1–240/);
    expect(
      validateSlicerSetup({ ...settings, slicer_stall_timeout_minutes: 1.5 }),
    ).toMatch(/1–240/);
    expect(
      validateSlicerSetup({ ...settings, bambu_studio_api_url: '' }),
    ).toBeNull();
  });
});
