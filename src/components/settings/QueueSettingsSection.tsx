import React from 'react';
import { SectionCard, TextField } from '@/components/common/AppUI';
import { SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

const PRINT_OPTION_ROWS: Array<{ key: string; label: string }> = [
  { key: 'default_bed_levelling', label: 'Bed leveling' },
  { key: 'default_flow_cali', label: 'Flow calibration' },
  { key: 'default_vibration_cali', label: 'Vibration calibration' },
  { key: 'default_layer_inspect', label: 'First layer inspection' },
  { key: 'default_timelapse', label: 'Timelapse' },
  { key: 'default_nozzle_offset_cali', label: 'Nozzle offset calibration' },
];

export function QueueSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;

  return (
    <>
      <SectionCard title="Default print options" subtitle="Applied when a new job is started.">
        {PRINT_OPTION_ROWS.map(row => (
          <SwitchRow
            key={row.key}
            label={row.label}
            value={Boolean(draft[row.key])}
            onValueChange={value => setDraft(current => ({ ...current, [row.key]: value }))}
          />
        ))}
      </SectionCard>
      <SectionCard title="Dispatch behavior" subtitle="Queue ordering, preheat, plate confirmation, and staggering.">
        <SwitchRow label="Shortest job first" value={Boolean(draft.queue_shortest_first)} onValueChange={value => setDraft(current => ({ ...current, queue_shortest_first: value }))} />
        <SwitchRow label="Require plate clear confirmation" value={Boolean(draft.require_plate_clear)} onValueChange={value => setDraft(current => ({ ...current, require_plate_clear: value }))} />
        <SwitchRow label="Preheat before queued prints" value={Boolean(draft.preheat_enabled)} onValueChange={value => setDraft(current => ({ ...current, preheat_enabled: value }))} />
        <TextField label="Stagger group size" value={stringifyNumberField(draft.stagger_group_size, '1')} onChangeText={value => setDraft(current => ({ ...current, stagger_group_size: Number(value) || 1 }))} keyboardType="number-pad" />
        <TextField label="Stagger interval (minutes)" value={stringifyNumberField(draft.stagger_interval_minutes, '0')} onChangeText={value => setDraft(current => ({ ...current, stagger_interval_minutes: Number(value) || 0 }))} keyboardType="number-pad" />
        <TextField label="Preheat max wait (seconds)" value={stringifyNumberField(draft.preheat_max_wait_seconds, '900')} onChangeText={value => setDraft(current => ({ ...current, preheat_max_wait_seconds: Number(value) || 900 }))} keyboardType="number-pad" />
        <TextField label="Preheat soak (seconds)" value={stringifyNumberField(draft.preheat_soak_seconds, '300')} onChangeText={value => setDraft(current => ({ ...current, preheat_soak_seconds: Number(value) || 300 }))} keyboardType="number-pad" />
        <TextField label="Max pipeline copies" value={stringifyNumberField(draft.pipeline_max_copies, '1')} onChangeText={value => setDraft(current => ({ ...current, pipeline_max_copies: Number(value) || 1 }))} keyboardType="number-pad" />
        <TextField label="Preferred slicer" value={String(draft.preferred_slicer ?? 'bambu_studio')} onChangeText={value => setDraft(current => ({ ...current, preferred_slicer: value }))} />
        <SwitchRow label="Use slicer API" value={Boolean(draft.use_slicer_api)} onValueChange={value => setDraft(current => ({ ...current, use_slicer_api: value }))} />
      </SectionCard>
    </>
  );
}
