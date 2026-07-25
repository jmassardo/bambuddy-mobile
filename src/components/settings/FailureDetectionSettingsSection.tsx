import React from 'react';
import { Text } from 'react-native';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function FailureDetectionSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const { testObicoMutation } = controller.mutations;

  return (
    <SectionCard title="Failure detection" subtitle="Obico service configuration and current runtime state.">
      <SwitchRow label="Failure detection enabled" value={Boolean(draft.obico_enabled)} onValueChange={value => setDraft(current => ({ ...current, obico_enabled: value }))} />
      <TextField label="Server URL" value={String(draft.obico_ml_url ?? draft['failure_detection.server_url'] ?? '')} onChangeText={value => setDraft(current => ({ ...current, obico_ml_url: value }))} autoCapitalize="none" />
      <TextField label="API key" value={String(draft.obico_api_key ?? draft['failure_detection.api_key'] ?? '')} onChangeText={value => setDraft(current => ({ ...current, obico_api_key: value }))} autoCapitalize="none" secureTextEntry />
      <OptionChipsField
        label="Sensitivity"
        value={String(draft.obico_sensitivity ?? draft['failure_detection.sensitivity'] ?? 'medium')}
        options={[
          { key: 'low', label: 'Low' },
          { key: 'medium', label: 'Medium' },
          { key: 'high', label: 'High' },
        ]}
        onChange={value => setDraft(current => ({ ...current, obico_sensitivity: value }))}
      />
      <OptionChipsField
        label="Action"
        value={String(draft.obico_action ?? 'notify')}
        options={[
          { key: 'notify', label: 'Notify' },
          { key: 'pause', label: 'Pause' },
          { key: 'pause_and_off', label: 'Pause + Power Off' },
        ]}
        onChange={value => setDraft(current => ({ ...current, obico_action: value }))}
      />
      <TextField label="Poll interval (s)" value={stringifyNumberField(draft.obico_poll_interval, '30')} onChangeText={value => setDraft(current => ({ ...current, obico_poll_interval: Number(value) || 30 }))} keyboardType="number-pad" />
      <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Runtime: {controller.queries.obicoQuery.data?.enabled ? 'enabled' : 'disabled'} • Last error: {String(controller.queries.obicoQuery.data?.last_error ?? 'none')}</Text>
      <PrimaryButton
        label={testObicoMutation.isPending ? 'Testing…' : 'Test connection'}
        variant="secondary"
        onPress={() => void testObicoMutation.mutateAsync(String(draft.obico_ml_url ?? ''))}
        loading={testObicoMutation.isPending}
        disabled={testObicoMutation.isPending || !String(draft.obico_ml_url ?? '').trim()}
      />
    </SectionCard>
  );
}
