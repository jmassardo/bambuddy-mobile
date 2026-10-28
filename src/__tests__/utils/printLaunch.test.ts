import {
  calibration,
  compatibleModels,
  filamentShortages,
  moveQueueBlock,
  rackOptions,
  savedArchiveMapping,
  scheduleTime,
  suggestedMapping,
  trayId,
} from '@/utils/printLaunch';
import type {
  NozzleRackSlot,
  PrinterStatus,
  PrintLaunchInventory,
  PrintQueueItem,
} from '@/types/api';
import { buildQueueTimeline } from '@/components/queue/GanttTimeline';

const req = (slot: number, grams: number) => ({
  slot_id: slot,
  type: 'PLA',
  color: '#FF0000',
  used_grams: grams,
});
const item = (id: number, batch: number | null = null) =>
  ({
    id,
    batch_id: batch,
    position: id,
    status: 'pending',
    created_at: '2026-10-27T12:00:00Z',
  } as PrintQueueItem);
const inventory: PrintLaunchInventory = {
  inventory_remain_g: { 0: 60, 1: 50, 2: 100 },
  slot_materials: [
    {
      global_tray_id: 0,
      material_key: 'red-pla',
      extruder: 0,
      remaining_g: 60,
    },
    {
      global_tray_id: 1,
      material_key: 'red-pla',
      extruder: 0,
      remaining_g: 50,
    },
    {
      global_tray_id: 2,
      material_key: 'red-pla',
      extruder: 1,
      remaining_g: 100,
    },
  ],
};

describe('print launch and queue planning', () => {
  it('preserves calibration auto and legacy false instead of boolean-coercing strings', () => {
    expect(['auto', 'false', false, true, 'on'].map(calibration)).toEqual([
      'auto',
      'off',
      'off',
      'on',
      'on',
    ]);
  });
  it('permits only known interchangeable model families', () => {
    expect(compatibleModels('X1C', 'P1S')).toBe(true);
    expect(compatibleModels('H2D', 'H2S')).toBe(false);
    expect(compatibleModels('A1', 'A1 mini')).toBe(false);
  });
  it('addresses regular AMS, HT and both external slots without collisions', () => {
    expect([
      trayId(1, 2),
      trayId(128, 0),
      trayId(255, 0, true),
      trayId(255, 255, true),
    ]).toEqual([6, 128, 254, 255]);
  });
  it('never applies an archived mapping to another printer', () => {
    const saved = { slicer_ams_mapping: { printer_id: 7, mapping: [128, 6] } };
    expect(savedArchiveMapping(saved, 7)).toEqual([128, 6]);
    expect(savedArchiveMapping(saved, 8)).toBeUndefined();
  });
  it('matches exact color and side and does not invent an unmatched tray', () => {
    const status = {
      ams: [
        { id: 0, tray: [{ id: 0, tray_type: 'PLA', tray_color: 'FF0000FF' }] },
      ],
      ams_extruder_map: { 0: 1 },
    } as unknown as PrinterStatus;
    expect(
      suggestedMapping([{ ...req(1, 40), nozzle_id: 1 }], status, true),
    ).toEqual([0]);
    expect(
      suggestedMapping([{ ...req(1, 40), nozzle_id: 0 }], status, true),
    ).toEqual([-1]);
    expect(
      suggestedMapping([{ ...req(1, 40), color: '#00FF00' }], status, true),
    ).toEqual([-1]);
  });
  it('aggregates quantities and plates before checking known stock', () => {
    expect(
      filamentShortages(
        [
          { requirements: [req(1, 20)], mapping: [0], quantity: 2 },
          { requirements: [req(1, 30)], mapping: [0], quantity: 1 },
        ],
        inventory,
        false,
      ),
    ).toEqual([{ ids: [0], remaining: 60, required: 70 }]);
  });
  it('uses backup pools per extruder, never unknown stock as empty', () => {
    const jobs = [{ requirements: [req(1, 100)], mapping: [0], quantity: 1 }];
    expect(filamentShortages(jobs, inventory, true)).toEqual([]);
    expect(
      filamentShortages([{ ...jobs[0], quantity: 2 }], inventory, true),
    ).toEqual([{ ids: [0, 1], remaining: 110, required: 200 }]);
    expect(
      filamentShortages([{ ...jobs[0], mapping: [90] }], inventory, false),
    ).toEqual([]);
    expect(filamentShortages(jobs, undefined, true)).toEqual([]);
  });
  it('validates rack diameter and flow and recovers a sole mounted position', () => {
    const slots = [16, 17, 18, 19, 20].map(
      id =>
        ({ id, nozzle_diameter: '0.40', nozzle_type: 'HS' } as NozzleRackSlot),
    );
    slots.push({
      id: 0,
      nozzle_diameter: '0.4',
      nozzle_type: 'HH01',
    } as NozzleRackSlot);
    const choices = rackOptions(slots, {
      on_rack: true,
      nozzle_diameter: '0.4',
      volume_type: 'High Flow',
    });
    expect(choices.filter(c => c.eligible).map(c => c.position)).toEqual([6]);
    expect(
      rackOptions(slots, {
        on_rack: true,
        nozzle_diameter: '0.6',
        volume_type: '',
      }).every(c => !c.eligible),
    ).toBe(true);
  });
  it('rejects invalid/past scheduling and distinguishes ASAP from a timed job', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(scheduleTime('queue', '', now)).toBeNull();
    expect(scheduleTime('scheduled', '2026-10-27T14:00:00+01:00', now)).toBe(
      '2026-10-27T13:00:00.000Z',
    );
    expect(() => scheduleTime('scheduled', 'invalid', now)).toThrow();
    expect(() =>
      scheduleTime('scheduled', '2026-10-26T14:00:00Z', now),
    ).toThrow();
  });
  it('moves complete batches and members without splitting a group or losing hidden jobs', () => {
    const items = [item(1), item(2, 8), item(3, 8), item(4)];
    expect(moveQueueBlock(items, 2, 1, true)).toEqual([1, 4, 2, 3]);
    expect(moveQueueBlock(items, 2, 1, false)).toEqual([1, 3, 2, 4]);
    expect(moveQueueBlock(items, 3, 1, false)).toEqual([1, 2, 3, 4]);
  });
  it('timeline respects scheduled starts, active duration, and serial pending jobs', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const events = buildQueueTimeline(
      [
        {
          ...item(1),
          printer_id: 1,
          status: 'printing',
          started_at: '2026-10-27T11:30:00Z',
          print_time_seconds: 3600,
        },
        { ...item(2), printer_id: 1, print_time_seconds: 600 },
        {
          ...item(3),
          printer_id: 1,
          scheduled_time: '2026-10-27T14:00:00Z',
          print_time_seconds: 600,
        },
      ],
      now,
    );
    expect(events.map(e => new Date(e.start).toISOString())).toEqual([
      '2026-10-27T11:30:00.000Z',
      '2026-10-27T12:30:00.000Z',
      '2026-10-27T14:00:00.000Z',
    ]);
  });
});
