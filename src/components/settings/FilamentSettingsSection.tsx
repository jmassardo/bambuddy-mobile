import React from 'react';
import { Text } from 'react-native';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { SwitchRow, stringifyNumberField, settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickString } from '@/utils/data';

export function FilamentSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const { spoolmanStatusQuery } = controller.queries;
  const { testSpoolmanMutation } = controller.mutations;

  return (
    <>
      <SectionCard title="Filament warnings" subtitle="Stock thresholds, matching rules, and tracking defaults.">
        <SwitchRow label="Disable filament warnings" value={Boolean(draft.disable_filament_warnings)} onValueChange={value => setDraft(current => ({ ...current, disable_filament_warnings: value }))} />
        <SwitchRow label="Prefer lowest filament" value={Boolean(draft.prefer_lowest_filament)} onValueChange={value => setDraft(current => ({ ...current, prefer_lowest_filament: value }))} />
        <SwitchRow label="Expand print modal mapping" value={Boolean(draft.per_printer_mapping_expanded)} onValueChange={value => setDraft(current => ({ ...current, per_printer_mapping_expanded: value }))} />
        <TextField label="Low stock threshold (%)" value={stringifyNumberField(draft.low_stock_threshold, '20')} onChangeText={value => setDraft(current => ({ ...current, low_stock_threshold: Number(value) || 20 }))} keyboardType="number-pad" />
        <TextField label="Forecast lead time (days)" value={stringifyNumberField(draft.forecast_global_lead_time_days, '14')} onChangeText={value => setDraft(current => ({ ...current, forecast_global_lead_time_days: Number(value) || 14 }))} keyboardType="number-pad" />
      </SectionCard>
      <SectionCard title="Spoolman & RFID" subtitle="Tracking source, connection, and unknown tag behavior.">
        <SwitchRow label="Spoolman enabled" value={Boolean(draft.spoolman_enabled)} onValueChange={value => setDraft(current => ({ ...current, spoolman_enabled: value }))} />
        <SwitchRow label="Auto add unknown RFID" value={Boolean(draft.auto_add_unknown_rfid)} onValueChange={value => setDraft(current => ({ ...current, auto_add_unknown_rfid: value }))} />
        <TextField label="Spoolman URL" value={String(draft.spoolman_url ?? '')} onChangeText={value => setDraft(current => ({ ...current, spoolman_url: value }))} autoCapitalize="none" />
        <TextField label="AMS history retention (days)" value={stringifyNumberField(draft.ams_history_retention_days, '30')} onChangeText={value => setDraft(current => ({ ...current, ams_history_retention_days: Number(value) || 30 }))} keyboardType="number-pad" />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Status: {spoolmanStatusQuery.data?.connected ? 'connected' : 'disconnected'} • {pickString(spoolmanStatusQuery.data, ['url'], String(draft.spoolman_url ?? 'No URL set'))}</Text>
        <PrimaryButton
          label={testSpoolmanMutation.isPending ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => void testSpoolmanMutation.mutateAsync()}
          loading={testSpoolmanMutation.isPending}
          disabled={testSpoolmanMutation.isPending || !String(draft.spoolman_url ?? '').trim() || !Boolean(draft.spoolman_enabled)}
        />
      </SectionCard>
    </>
  );
}
