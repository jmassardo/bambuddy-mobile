import { NativeTranslation, translateNative, useNativeLocale } from '@/i18n';

import React from 'react';
import { Text } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { SwitchRow, stringifyNumberField, settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { formatDateTime, pickBoolean, pickNumber, pickString } from '@/utils/data';

export function FilamentSettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const { spoolmanStatusQuery, spoolmanConfigQuery, spoolmanSyncStatusQuery } = controller.queries;
  const { testSpoolmanMutation, saveSpoolmanAutoSyncMutation, syncSpoolmanMutation } = controller.mutations;
  const autoSyncEnabled = pickBoolean(
    spoolmanConfigQuery.data,
    ['auto_sync', 'auto_sync_enabled'],
    pickBoolean(draft, ['spoolman_auto_sync', 'spoolman_auto_sync_enabled']),
  );
  const syncStatus = pickString(spoolmanSyncStatusQuery.data, ['status'], syncSpoolmanMutation.isPending ? 'running' : 'idle');
  const syncInfo = spoolmanSyncStatusQuery.data?.last_result ?? syncSpoolmanMutation.data;
  const addedCount = pickNumber(syncInfo, ['added_count'], 0);
  const updatedCount = pickNumber(syncInfo, ['updated_count'], 0);
  const removedCount = pickNumber(syncInfo, ['removed_count'], 0);
  const skippedCount = pickNumber(syncInfo, ['skipped_count'], 0);
  const syncedCount = pickNumber(syncInfo, ['synced_count'], addedCount + updatedCount);
  const errorCount = Array.isArray(syncInfo?.errors) ? syncInfo.errors.length : 0;
  const syncStatusLabel = syncStatus === 'running' ? translateNative('native.3180e7c2ebffe771') : syncStatus === 'failed' ? translateNative('native.38727b78ddae0d5a') : translateNative('native.0e93c87aa143439d');
  const syncStatusColor =
    syncStatus === 'running'
      ? controller.colors.warning
      : syncStatus === 'failed'
        ? controller.colors.error
        : controller.colors.success;
  const lastSyncTime = pickString(spoolmanSyncStatusQuery.data, ['last_sync_at', 'last_sync']);

  return (
    <>
      <SectionCard title={translateNative('native.404cb3448817322e')} subtitle={translateNative('native.0c2802a7ba0a5de3')}>
        <SwitchRow label={translateNative('native.63e9687f78a03f49')} value={Boolean(draft.disable_filament_warnings)} onValueChange={value => setDraft(current => ({ ...current, disable_filament_warnings: value }))} />
        <SwitchRow label={translateNative('native.b8d1a5d4d3387478')} value={Boolean(draft.prefer_lowest_filament)} onValueChange={value => setDraft(current => ({ ...current, prefer_lowest_filament: value }))} />
        <SwitchRow label={translateNative('native.049242152bbe3401')} value={Boolean(draft.per_printer_mapping_expanded)} onValueChange={value => setDraft(current => ({ ...current, per_printer_mapping_expanded: value }))} />
        <TextField label={translateNative('native.342248bc862b8035')} value={stringifyNumberField(draft.low_stock_threshold, '20')} onChangeText={value => setDraft(current => ({ ...current, low_stock_threshold: Number(value) || 20 }))} keyboardType="number-pad" />
        <TextField label={translateNative('native.f0fcb8e7c2f3675b')} value={stringifyNumberField(draft.forecast_global_lead_time_days, '14')} onChangeText={value => setDraft(current => ({ ...current, forecast_global_lead_time_days: Number(value) || 14 }))} keyboardType="number-pad" />
      </SectionCard>
      <SectionCard title={translateNative('native.ba0c463c354abcaa')} subtitle={translateNative('native.dc9462d9ce0f7f52')}>
        <SwitchRow label={translateNative('native.9cec3a1b7cc877fc')} value={Boolean(draft.spoolman_enabled)} onValueChange={value => setDraft(current => ({ ...current, spoolman_enabled: value }))} />
        <SwitchRow
          label={translateNative('native.d67501449cb95f90')}
          value={autoSyncEnabled}
          onValueChange={value => {
            void saveSpoolmanAutoSyncMutation.mutateAsync(value);
          }}
          description={translateNative('native.1c66e2e2515607d9')}
          disabled={saveSpoolmanAutoSyncMutation.isPending || !draft.spoolman_enabled}
        />
        <SwitchRow label={translateNative('native.ba8af8a79ecb9038')} value={Boolean(draft.auto_add_unknown_rfid)} onValueChange={value => setDraft(current => ({ ...current, auto_add_unknown_rfid: value }))} />
        <TextField label={translateNative('native.71333a0573cd11e3')} value={String(draft.spoolman_url ?? '')} onChangeText={value => setDraft(current => ({ ...current, spoolman_url: value }))} autoCapitalize="none" />
        <TextField label={translateNative('native.0152370e07cff9a6')} value={stringifyNumberField(draft.ams_history_retention_days, '30')} onChangeText={value => setDraft(current => ({ ...current, ams_history_retention_days: Number(value) || 30 }))} keyboardType="number-pad" />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.79236fcebf0a8b1d')}{spoolmanStatusQuery.data?.connected ? translateNative('native.364df109cc5bb4ea') : translateNative('native.a8e228a68d46096f')} • {pickString(spoolmanStatusQuery.data, ['url'], String(draft.spoolman_url ?? translateNative('native.b621ab64d7edcadb')))}</Text>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.98d704270f282821')}{lastSyncTime ? formatDateTime(lastSyncTime) : translateNative('native.7c548c0b460e1d61')}</Text>
        <StatusBadge label={translateNative('native.a1789a956adfcaa4', { value0: String(syncStatusLabel) })} color={syncStatusColor} />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}><NativeTranslation id="native.1193ac60388b9c03" values={{ value0: (syncedCount), value1: (addedCount), value2: (updatedCount), value3: (removedCount), value4: (skippedCount), value5: (errorCount) }} /></Text>
        <PrimaryButton
          label={testSpoolmanMutation.isPending ? translateNative('native.36b1241a43893d02') : translateNative('native.c281bbb20123f577')}
          variant="secondary"
          onPress={() => void testSpoolmanMutation.mutateAsync()}
          loading={testSpoolmanMutation.isPending}
          disabled={testSpoolmanMutation.isPending || !String(draft.spoolman_url ?? '').trim() || !draft.spoolman_enabled}
        />
        <PrimaryButton
          label={syncSpoolmanMutation.isPending ? translateNative('native.64f720b4dcbe9443') : translateNative('native.2b412e4ff6dabb29')}
          variant="secondary"
          onPress={() => void syncSpoolmanMutation.mutateAsync()}
          loading={syncSpoolmanMutation.isPending}
          disabled={syncSpoolmanMutation.isPending || !draft.spoolman_enabled}
        />
      </SectionCard>
    </>
  );
}
