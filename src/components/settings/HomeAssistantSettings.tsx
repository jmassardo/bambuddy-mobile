import React, { useState } from 'react';
import { Text } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { integrationsApi } from '@/api/integrations';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { settingsStyles, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString } from '@/utils/data';
import { useIntegrationTranslation } from './useIntegrationTranslation';

export function HomeAssistantSettings({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const tr = useIntegrationTranslation();
  const { setDraft } = controller.actions;
  const [result, setResult] = useState('');
  const env = pickBoolean(draft, ['ha_env_managed']);
  const url = pickString(draft, ['ha_url']);
  const token = pickString(draft, ['ha_token']);
  const test = useMutation({
    mutationFn: () => integrationsApi.testHA(url, token),
    onSuccess: response => setResult(response.success ? response.message || 'Connected to Home Assistant.' : response.error || response.message || 'Connection failed. Check URL and token.'),
    onError: (error: Error) => setResult(error.message),
  });
  return (
    <SectionCard title="Home Assistant" subtitle={tr(env ? 'Managed by server environment variables.' : 'Connect smart plugs and energy sensors.')}>
      <SwitchRow label={tr('Home Assistant enabled')} value={pickBoolean(draft, ['ha_enabled'])} disabled={env || !controller.permissions.canUpdateSettings} onValueChange={ha_enabled => setDraft(current => ({ ...current, ha_enabled }))} />
      <TextField label={tr(pickBoolean(draft, ['ha_url_from_env']) ? 'URL (environment-managed)' : 'Home Assistant URL')} value={url} editable={controller.permissions.canUpdateSettings && !pickBoolean(draft, ['ha_url_from_env'])} autoCapitalize="none" onChangeText={ha_url => setDraft(current => ({ ...current, ha_url }))} />
      <TextField label={tr(pickBoolean(draft, ['ha_token_from_env']) ? 'Access token (environment-managed)' : 'Long-lived access token')} value={token} editable={controller.permissions.canUpdateSettings && !pickBoolean(draft, ['ha_token_from_env'])} secureTextEntry autoCapitalize="none" onChangeText={ha_token => setDraft(current => ({ ...current, ha_token }))} />
      <PrimaryButton label={tr('Test Home Assistant connection')} variant="secondary" disabled={!url || !token || !controller.permissions.canControlSmartPlugs || test.isPending} loading={test.isPending} onPress={() => test.mutate()} />
      {result ? <Text accessibilityLiveRegion="polite" style={[settingsStyles.helper, { color: controller.colors.text }]}>{tr(result)}</Text> : null}
    </SectionCard>
  );
}
