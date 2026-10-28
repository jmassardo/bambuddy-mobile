import { translateNative } from '@/i18n';
import type {
  PresetRef,
  SliceRequest,
  SlicerPipeline,
  UnifiedPresetsResponse,
} from '@/types/api';
import type { SourceFilament } from '@/api/slicing';
export const BED_TYPES = [
  'Cool Plate',
  'Engineering Plate',
  'High Temp Plate',
  'Textured PEI Plate',
  'Smooth PEI Plate',
  'Cool Plate (SuperTack)',
  'Supertack Plate',
];
export const refValue = (ref: PresetRef | null | undefined) =>
  ref ? `${ref.source}:${ref.id}` : '';
export function parseRef(value: string): PresetRef | null {
  const separator = value.indexOf(':');
  const source = value.slice(0, separator);
  if (
    !['local', 'cloud', 'orca_cloud', 'standard'].includes(source) ||
    separator < 0
  )
    return null;
  return {
    source: source as PresetRef['source'],
    id: value.slice(separator + 1),
  };
}
export const hasTarget = (p: SlicerPipeline) =>
  p.target_kind === 'printer_class'
    ? !!p.target_model_class
    : !!p.target_printer_id;
export function staleRefs(p: SlicerPipeline, presets: UnifiedPresetsResponse) {
  return [p.printer_preset, p.process_preset, ...p.filament_presets].filter(
    (r, i) =>
      !presets[r.source][
        i === 0 ? 'printer' : i === 1 ? 'process' : 'filament'
      ].some(v => v.id === r.id),
  );
}
export function buildSliceRequest(config: {
  printer: PresetRef | null;
  process: PresetRef | null;
  filaments: (PresetRef | null)[];
  slots: SourceFilament[];
  colours: (string | null)[];
  plate: number | null;
  bed: string | null;
  embedded: boolean;
  canEmbed: boolean;
  orient: boolean;
  arrange: boolean;
  sourceKeys: string[];
  hasDesignOverrides: boolean;
  overrides: Record<string, string | string[]>;
}): SliceRequest {
  const c = config;
  if (
    !c.printer ||
    !c.process ||
    !c.filaments.length ||
    c.filaments.some(f => !f)
  )
    throw new Error(translateNative('native.b9d8dc89f99abdfc'));
  if (
    c.colours.some(
      v => v !== null && v !== '' && !/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(v),
    )
  )
    throw new Error(translateNative('native.039bf97465e66f12'));
  const embedded = c.embedded && c.canEmbed;
  return {
    printer_preset: c.printer,
    process_preset: c.process,
    filament_preset: c.filaments[0]!,
    filament_presets: c.filaments as PresetRef[],
    filament_colours: c.slots.map(
      (slot, i) => c.colours[i] ?? slot.color ?? '',
    ),
    ...(c.plate !== null ? { plate: c.plate } : {}),
    ...(!embedded && c.bed ? { bed_type: c.bed } : {}),
    ...(embedded
      ? { use_embedded_settings: true }
      : {
          ...(c.hasDesignOverrides ? { design_overrides: c.sourceKeys } : {}),
          ...(Object.keys(c.overrides).length
            ? { process_overrides: c.overrides }
            : {}),
        }),
    ...(c.orient ? { auto_orient: true } : {}),
    ...(c.arrange ? { auto_arrange: true } : {}),
  };
}
