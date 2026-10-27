import type {
  CalibrationChoice,
  NozzleRackSlot,
  PrinterStatus,
  PrintLaunchInventory,
  PrintLaunchRequirement,
  PrintQueueItem,
} from '@/types/api';
import { isRecord } from './data';

export function calibration(
  value: CalibrationChoice | unknown,
): 'off' | 'on' | 'auto' {
  if (value === true || value === 'true' || value === 1 || value === 'on')
    return 'on';
  if (value === false || value === 'false' || value === 0 || value === 'off')
    return 'off';
  return 'auto';
}

export function compatibleModels(
  source?: string | null,
  target?: string | null,
) {
  if (!source || !target) return true;
  const normalize = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
  const family = ['X1', 'X1C', 'X1E', 'P1P', 'P1S'];
  const a = normalize(source),
    b = normalize(target);
  return a === b || (family.includes(a) && family.includes(b));
}

export function trayId(ams: number, tray: number, external = false) {
  return external
    ? tray >= 254
      ? tray
      : 254 + tray
    : ams >= 128
    ? ams
    : ams * 4 + tray;
}

export const colorKey = (s?: string | null) =>
  (s ?? '').replace('#', '').slice(0, 6).toUpperCase();
export function loadedTrays(status?: PrinterStatus) {
  const ams = (status?.ams ?? []).flatMap(unit =>
    (unit.tray ?? [])
      .filter(t => t.tray_type)
      .map(t => ({
        id: trayId(unit.id, t.id),
        type: t.tray_type ?? '',
        color: t.tray_color ?? '',
        label: `${unit.id >= 128 ? 'AMS HT' : 'AMS'} ${unit.id} · ${t.id + 1}`,
        extruder: status?.ams_extruder_map?.[String(unit.id)],
      })),
  );
  return [
    ...ams,
    ...(status?.vt_tray ?? [])
      .filter(t => t.tray_type)
      .map(t => ({
        id: trayId(255, t.id, true),
        type: t.tray_type ?? '',
        color: t.tray_color ?? '',
        label:
          (status?.vt_tray?.length ?? 0) > 1
            ? trayId(255, t.id, true) === 254
              ? 'External left'
              : 'External right'
            : 'External',
        extruder:
          (status?.vt_tray?.length ?? 0) > 1
            ? 255 - trayId(255, t.id, true)
            : undefined,
      })),
  ];
}

export function suggestedMapping(
  requirements: PrintLaunchRequirement[],
  status?: PrinterStatus,
  exact = false,
) {
  const trays = loadedTrays(status);
  const result: number[] = [];
  requirements.forEach(r => {
    const extruder = r.nozzle_id ?? r.extruder_id;
    const candidates = trays.filter(
      t =>
        (extruder == null ||
          t.extruder === extruder ||
          status?.fila_switch?.installed) &&
        t.type.toUpperCase() === r.type.toUpperCase() &&
        (!(exact || r.force_color_match) ||
          colorKey(t.color) === colorKey(r.color)),
    );
    const chosen =
      candidates.find(t => colorKey(t.color) === colorKey(r.color)) ??
      candidates[0];
    while (result.length < r.slot_id) result.push(-1);
    result[r.slot_id - 1] = chosen?.id ?? -1;
  });
  return result;
}

export function savedArchiveMapping(extra: unknown, printerId: number) {
  if (!isRecord(extra) || !isRecord(extra.slicer_ams_mapping)) return undefined;
  const saved = extra.slicer_ams_mapping;
  return saved.printer_id === printerId &&
    Array.isArray(saved.mapping) &&
    saved.mapping.every(v => typeof v === 'number')
    ? (saved.mapping as number[])
    : undefined;
}

export interface DemandJob {
  requirements: PrintLaunchRequirement[];
  mapping?: number[];
  quantity: number;
}
export function filamentShortages(
  jobs: DemandJob[],
  inventory: PrintLaunchInventory | undefined,
  backup: boolean,
) {
  const demand = new Map<number, number>();
  jobs.forEach(job =>
    job.requirements.forEach(r => {
      const id = job.mapping?.[r.slot_id - 1];
      if (id == null || id < 0) return;
      demand.set(id, (demand.get(id) ?? 0) + r.used_grams * job.quantity);
    }),
  );
  const pools = new Map<
    string,
    { required: number; remaining: number; ids: number[] }
  >();
  for (const slot of inventory?.slot_materials ?? []) {
    const key = backup
      ? `${slot.material_key}#${slot.extruder}`
      : String(slot.global_tray_id);
    const pool = pools.get(key) ?? { required: 0, remaining: 0, ids: [] };
    pool.required += demand.get(slot.global_tray_id) ?? 0;
    pool.remaining += Math.max(0, slot.remaining_g);
    pool.ids.push(slot.global_tray_id);
    pools.set(key, pool);
  }
  // Unknown/unbound stock is intentionally absent, not a zero-weight spool.
  return [...pools.values()].filter(p => p.required > p.remaining);
}

export function rackOptions(
  slots: NozzleRackSlot[] | undefined,
  group: NonNullable<PrintLaunchRequirement['group']>,
) {
  const byPosition = new Map(
    (slots ?? []).filter(s => s.id >= 16).map(s => [s.id - 15, s]),
  );
  const missing = [1, 2, 3, 4, 5, 6].filter(p => !byPosition.has(p));
  const mounted = slots?.find(s => s.id === 0);
  if (missing.length === 1 && mounted) byPosition.set(missing[0], mounted);
  return [1, 2, 3, 4, 5, 6].map(position => {
    const s = byPosition.get(position);
    const diameter = Number.parseFloat(s?.nozzle_diameter ?? '');
    const wanted = Number.parseFloat(group.nozzle_diameter);
    const eligible =
      !!s &&
      Number.isFinite(diameter) &&
      Math.abs(diameter - wanted) < 0.005 &&
      (!group.volume_type ||
        !s.nozzle_type ||
        group.volume_type.toLowerCase().startsWith('high flow') ===
          s.nozzle_type.toUpperCase().startsWith('HH'));
    return {
      position,
      eligible,
      description: s
        ? `${s.nozzle_diameter} ${s.nozzle_type}`
        : 'Empty / unknown',
    };
  });
}

export function scheduleTime(mode: string, value: string, now = Date.now()) {
  if (mode !== 'scheduled') return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms) || ms <= now)
    throw new Error(
      'Choose a valid future date and time (including timezone).',
    );
  return new Date(ms).toISOString();
}

export function queueBlocks(items: PrintQueueItem[]) {
  const blocks: PrintQueueItem[][] = [];
  const batches = new Map<number, PrintQueueItem[]>();
  [...items]
    .sort((a, b) => a.position - b.position)
    .forEach(item => {
      if (!item.batch_id) {
        blocks.push([item]);
        return;
      }
      let block = batches.get(item.batch_id);
      if (!block) {
        block = [];
        batches.set(item.batch_id, block);
        blocks.push(block);
      }
      block.push(item);
    });
  return blocks;
}

export function moveQueueBlock(
  items: PrintQueueItem[],
  id: number,
  direction: -1 | 1,
  wholeBatch: boolean,
) {
  const blocks = queueBlocks(items);
  const index = blocks.findIndex(b => b.some(i => i.id === id));
  if (index < 0) return items.map(i => i.id);
  if (wholeBatch || blocks[index].length === 1) {
    const to = index + direction;
    if (to >= 0 && to < blocks.length)
      [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
  } else {
    const block = blocks[index];
    const from = block.findIndex(i => i.id === id),
      to = from + direction;
    if (to >= 0 && to < block.length)
      [block[from], block[to]] = [block[to], block[from]];
  }
  return blocks.flat().map(i => i.id);
}
