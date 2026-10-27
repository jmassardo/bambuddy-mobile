export function parseSettingObject<T>(value: unknown): Record<string, T> {
  try {
    const parsed: unknown =
      typeof value === 'string' ? JSON.parse(value) : value;
    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

export function calibrationMode(value: unknown): 'auto' | 'on' | 'off' {
  if (value === true || value === 'true' || value === 'on') return 'on';
  if (value === false || value === 'false' || value === 'off') return 'off';
  return 'auto';
}

export const QUICK_PRESETS = [
  {
    key: 'nozzle_temp_presets',
    label: 'Nozzle °C',
    defaults: [120, 220, 260],
    max: 320,
  },
  {
    key: 'bed_temp_presets',
    label: 'Bed °C',
    defaults: [55, 75, 90],
    max: 140,
  },
  {
    key: 'chamber_temp_presets',
    label: 'Chamber °C',
    defaults: [35, 45, 60],
    max: 65,
  },
  {
    key: 'fan_speed_presets',
    label: 'Fan %',
    defaults: [50, 75, 100],
    max: 100,
  },
] as const;

export function readPresetTriple(
  value: unknown,
  fallback: readonly number[],
): number[] {
  try {
    const parsed: unknown = JSON.parse(String(value));
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every(Number.isInteger)
    )
      return parsed;
  } catch {}
  return [...fallback];
}

export const PREHEAT_TARGETS: Record<string, number> = {
  default: 0,
  PLA: 0,
  PETG: 0,
  TPU: 0,
  PVA: 0,
  'PETG-CF': 40,
  ABS: 45,
  ASA: 45,
  PA: 50,
  PC: 50,
  'PC-FR': 50,
  'PA-CF': 55,
};

export interface DryingPreset {
  n3f: number;
  n3s: number;
  n3f_hours: number;
  n3s_hours: number;
}

export const DRYING_PRESETS: Record<string, DryingPreset> = {
  PLA: { n3f: 45, n3s: 45, n3f_hours: 12, n3s_hours: 12 },
  PETG: { n3f: 65, n3s: 65, n3f_hours: 12, n3s_hours: 12 },
  TPU: { n3f: 65, n3s: 75, n3f_hours: 12, n3s_hours: 18 },
  ABS: { n3f: 65, n3s: 80, n3f_hours: 12, n3s_hours: 8 },
  ASA: { n3f: 65, n3s: 80, n3f_hours: 12, n3s_hours: 8 },
  PA: { n3f: 65, n3s: 85, n3f_hours: 12, n3s_hours: 12 },
  PC: { n3f: 65, n3s: 80, n3f_hours: 12, n3s_hours: 8 },
  PVA: { n3f: 65, n3s: 85, n3f_hours: 12, n3s_hours: 18 },
};

export interface GcodeSnippet {
  start_gcode: string;
  end_gcode: string;
}

export function updateGcodeSnippet(
  value: unknown,
  model: string,
  field: keyof GcodeSnippet,
  text: string,
) {
  const snippets = parseSettingObject<GcodeSnippet>(value);
  snippets[model] = {
    start_gcode: snippets[model]?.start_gcode ?? '',
    end_gcode: snippets[model]?.end_gcode ?? '',
    [field]: text,
  };
  if (!snippets[model].start_gcode && !snippets[model].end_gcode)
    delete snippets[model];
  return Object.keys(snippets).length ? JSON.stringify(snippets) : '';
}
