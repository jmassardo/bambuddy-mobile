import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SectionCard, PrimaryButton, TextField } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { ApiExplorerSettings } from './ApiExplorerSettings';

export function ApiKeysSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { t } = useTranslation();
  const { authEnabled, hasPermission } = useAuth();
  const navigation = useNavigation<NavigationProp<{ CameraIntegrations: undefined }>>();
  const { newApiKeyName, createdApiKey } = controller.state;
  const { setNewApiKeyName } = controller.actions;
  const { createApiKeyMutation, deleteApiKeyMutation } = controller.mutations;
  const apiKeys = (controller.queries.apiKeysQuery.data ?? []) as ApiRecord[];

  return (
    <>
      <SectionCard title="API keys" subtitle="Create personal or integration keys and revoke old ones.">
        <TextField label="New API key name" value={newApiKeyName} onChangeText={setNewApiKeyName} placeholder="Automation" />
        <PrimaryButton label={createApiKeyMutation.isPending ? 'Creating…' : 'Create API key'} onPress={() => void createApiKeyMutation.mutateAsync()} disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending} loading={createApiKeyMutation.isPending} />
        {createdApiKey ? <Text style={[settingsStyles.helper, { color: controller.colors.accentLight }]}>New key: {createdApiKey}</Text> : null}
        {apiKeys.map(key => (
          <View key={pickString(key, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(key, ['name'], 'API key')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(key, ['created_at'], 'Created')}</Text>
              </View>
              <PrimaryButton label="Delete" variant="danger" onPress={() => void deleteApiKeyMutation.mutateAsync(pickNumber(key, ['id']))} />
            </View>
          </View>
        ))}
      </SectionCard>
      <SectionCard title={t('camera.integrations', { defaultValue: 'Camera integrations' })}>
        <PrimaryButton label={t('camera.manageIntegrations', { defaultValue: 'Camera tokens and OBS overlays' })} disabled={!hasPermission('camera:view')} onPress={() => navigation.navigate('CameraIntegrations')} />
      </SectionCard>
      {!authEnabled || hasPermission('api_keys:read') ? <ApiExplorerSettings /> : null}
    </>
  );
}
