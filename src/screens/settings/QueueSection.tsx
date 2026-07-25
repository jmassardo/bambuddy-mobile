import React from 'react';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { pickBoolean, pickString, type ApiRecord } from '@/utils/data';
import { SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';

export default function QueueSection({ section }: { section: 'queue' | 'filament' }) {
  return section === 'queue' ? <QueueSettings /> : <FilamentSettings />;
}

function QueueSettings() {
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Default print options" subtitle="Applied when a new job is started.">
        {[
          ['default_bed_levelling', 'Bed leveling'],
          ['default_flow_cali', 'Flow calibration'],
          ['default_vibration_cali', 'Vibration calibration'],
          ['default_layer_inspect', 'First layer inspection'],
          ['default_timelapse', 'Timelapse'],
          ['default_nozzle_offset_cali', 'Nozzle offset calibration'],
        ].map(([key, label]) => (
          <SwitchRow
            key={key}
            label={label}
            value={pickBoolean(draft, [key])}
            onValueChange={value => setDraft(current => ({ ...current, [key]: value }))}
          />
        ))}
      </SectionCard>
      <SectionCard title="Dispatch behavior" subtitle="Queue ordering, preheat, plate confirmation, and staggering.">
        <SwitchRow label="Shortest job first" value={pickBoolean(draft, ['queue_shortest_first'])} onValueChange={value => setDraft(current => ({ ...current, queue_shortest_first: value }))} />
        <SwitchRow label="Require plate clear confirmation" value={pickBoolean(draft, ['require_plate_clear'])} onValueChange={value => setDraft(current => ({ ...current, require_plate_clear: value }))} />
        <SwitchRow label="Preheat before queued prints" value={pickBoolean(draft, ['preheat_enabled'])} onValueChange={value => setDraft(current => ({ ...current, preheat_enabled: value }))} />
        <TextField label="Stagger group size" value={stringifyNumberField(draft.stagger_group_size, '1')} onChangeText={value => setDraft(current => ({ ...current, stagger_group_size: Number(value) || 1 }))} keyboardType="number-pad" />
        <TextField label="Stagger interval (minutes)" value={stringifyNumberField(draft.stagger_interval_minutes, '0')} onChangeText={value => setDraft(current => ({ ...current, stagger_interval_minutes: Number(value) || 0 }))} keyboardType="number-pad" />
        <TextField label="Preheat max wait (seconds)" value={stringifyNumberField(draft.preheat_max_wait_seconds, '900')} onChangeText={value => setDraft(current => ({ ...current, preheat_max_wait_seconds: Number(value) || 900 }))} keyboardType="number-pad" />
        <TextField label="Preheat soak (seconds)" value={stringifyNumberField(draft.preheat_soak_seconds, '300')} onChangeText={value => setDraft(current => ({ ...current, preheat_soak_seconds: Number(value) || 300 }))} keyboardType="number-pad" />
        <TextField label="Max pipeline copies" value={stringifyNumberField(draft.pipeline_max_copies, '1')} onChangeText={value => setDraft(current => ({ ...current, pipeline_max_copies: Number(value) || 1 }))} keyboardType="number-pad" />
        <TextField label="Preferred slicer" value={pickString(draft, ['preferred_slicer'], 'bambu_studio')} onChangeText={value => setDraft(current => ({ ...current, preferred_slicer: value }))} />
        <SwitchRow label="Use slicer API" value={pickBoolean(draft, ['use_slicer_api'])} onValueChange={value => setDraft(current => ({ ...current, use_slicer_api: value }))} />
      </SectionCard>
      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />
    </>
  );
}

function FilamentSettings() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();
  const spoolmanStatusQuery = useQuery({ queryKey: ['spoolmanStatus'], queryFn: api.getSpoolmanStatus });
  const testSpoolmanMutation = useMutation({
    mutationFn: api.connectSpoolman,
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] });
      showToast(pickString(data as ApiRecord, ['message'], 'Spoolman connected.'), 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to connect to Spoolman.', 'error'),
  });

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Filament warnings" subtitle="Stock thresholds, matching rules, and tracking defaults.">
        <SwitchRow label="Disable filament warnings" value={pickBoolean(draft, ['disable_filament_warnings'])} onValueChange={value => setDraft(current => ({ ...current, disable_filament_warnings: value }))} />
        <SwitchRow label="Prefer lowest filament" value={pickBoolean(draft, ['prefer_lowest_filament'])} onValueChange={value => setDraft(current => ({ ...current, prefer_lowest_filament: value }))} />
        <SwitchRow label="Expand print modal mapping" value={pickBoolean(draft, ['per_printer_mapping_expanded'])} onValueChange={value => setDraft(current => ({ ...current, per_printer_mapping_expanded: value }))} />
        <TextField label="Low stock threshold (%)" value={stringifyNumberField(draft.low_stock_threshold, '20')} onChangeText={value => setDraft(current => ({ ...current, low_stock_threshold: Number(value) || 20 }))} keyboardType="number-pad" />
        <TextField label="Forecast lead time (days)" value={stringifyNumberField(draft.forecast_global_lead_time_days, '14')} onChangeText={value => setDraft(current => ({ ...current, forecast_global_lead_time_days: Number(value) || 14 }))} keyboardType="number-pad" />
      </SectionCard>
      <SectionCard title="Spoolman & RFID" subtitle="Tracking source, connection, and unknown tag behavior.">
        <SwitchRow label="Spoolman enabled" value={pickBoolean(draft, ['spoolman_enabled'])} onValueChange={value => setDraft(current => ({ ...current, spoolman_enabled: value }))} />
        <SwitchRow label="Auto add unknown RFID" value={pickBoolean(draft, ['auto_add_unknown_rfid'])} onValueChange={value => setDraft(current => ({ ...current, auto_add_unknown_rfid: value }))} />
        <TextField label="Spoolman URL" value={pickString(draft, ['spoolman_url'])} onChangeText={value => setDraft(current => ({ ...current, spoolman_url: value }))} autoCapitalize="none" />
        <TextField label="AMS history retention (days)" value={stringifyNumberField(draft.ams_history_retention_days, '30')} onChangeText={value => setDraft(current => ({ ...current, ams_history_retention_days: Number(value) || 30 }))} keyboardType="number-pad" />
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Status: {spoolmanStatusQuery.data?.connected ? 'connected' : 'disconnected'} • {pickString(spoolmanStatusQuery.data as ApiRecord | undefined, ['url'], pickString(draft, ['spoolman_url'], 'No URL set'))}</Text>
        <PrimaryButton
          label={testSpoolmanMutation.isPending ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => void testSpoolmanMutation.mutateAsync()}
          loading={testSpoolmanMutation.isPending}
          disabled={testSpoolmanMutation.isPending || !pickString(draft, ['spoolman_url']).trim() || !pickBoolean(draft, ['spoolman_enabled'])}
        />
      </SectionCard>
      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />
    </>
  );
}
