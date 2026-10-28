export function validMaintenanceNumber(
  value: string,
  minimum = 0,
): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= minimum
    ? parsed
    : null;
}

export function maintenanceDocumentation(
  name: string,
  model: string | null,
  custom?: string | null,
): string | null {
  if (custom && /^https?:\/\//i.test(custom)) return custom;
  const normalized = (model ?? '').toUpperCase().replace(/[- ]/g, '');
  const x1 = normalized.includes('X1');
  const p1 = normalized.includes('P1');
  const mini = normalized.includes('A1MINI');
  const a1 = normalized.includes('A1');
  const h2 = /H2[DSC]/.test(normalized);
  const steel = /P2S|X2D/.test(normalized);
  const base = 'https://wiki.bambulab.com/en/';
  const rails = mini
    ? 'a1-mini/maintenance/lubricate-y-axis'
    : a1
    ? 'a1/maintenance/lubricate-y-axis'
    : h2
    ? 'h2/maintenance/x-axis-lubrication'
    : null;
  let path: string | null = null;
  switch (name) {
    case 'Clean Steel Rods':
    case 'Lubricate Steel Rods':
      path = steel ? 'p2s/maintenance/lubricate-x-y-z-axis' : null;
      break;
    case 'Clean Linear Rails':
    case 'Lubricate Linear Rails':
      path = rails;
      break;
    case 'Clean Carbon Rods':
      path = x1 || p1 ? 'general/carbon-rods-clearance' : null;
      break;
    case 'Clean Build Plate':
      path = 'filament-acc/acc/pei-plate-clean-guide';
      break;
    case 'Clean Nozzle/Hotend':
      path = a1
        ? 'a1-mini/troubleshooting/nozzle-clog'
        : h2
        ? 'h2/maintenance/nozzl-cold-pull-maintenance-and-cleaning'
        : steel
        ? 'p2s/maintenance/cold-pull-maintenance-hotend'
        : 'x1/troubleshooting/nozzle-clog';
      break;
    case 'Check Belt Tension':
      path = x1
        ? 'x1/maintenance/belt-tension'
        : p1
        ? 'p1/maintenance/p1p-maintenance'
        : mini
        ? 'a1-mini/maintenance/belt_tension'
        : a1
        ? 'a1/maintenance/belt_tension'
        : normalized.includes('H2C')
        ? 'h2c/maintenance/belt-tension'
        : normalized.includes('H2S')
        ? 'h2s/maintenance/belt-tension'
        : h2
        ? 'h2/maintenance/belt-tension'
        : steel
        ? 'p2s/maintenance/belt-tension'
        : 'x1/maintenance/belt-tension';
      break;
    case 'Check PTFE Tube':
      path = a1
        ? 'a1-mini/maintenance/ptfe-tube'
        : normalized.includes('H2S')
        ? 'h2s/maintenance/replace-ptfe-tube-on-h2s-printer'
        : h2
        ? 'h2/maintenance/replace-ptfe-tube-on-h2d-printer'
        : 'x1/maintenance/replace-ptfe-tube';
      break;
    case 'Replace HEPA Filter':
    case 'HEPA Filter':
    case 'Replace Carbon Filter':
    case 'Carbon Filter':
      path = h2
        ? 'h2/maintenance/replace-smoke-purifier-air-filte'
        : 'x1/maintenance/replace-carbon-filter';
      break;
    case 'Lubricate Left Nozzle Rail':
    case 'Left Nozzle Rail':
      path = h2 ? 'h2/maintenance/x-axis-lubrication' : null;
      break;
  }
  return path ? base + path : null;
}
