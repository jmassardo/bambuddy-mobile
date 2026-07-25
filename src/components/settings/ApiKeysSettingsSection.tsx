import React from 'react';
import { Text, View } from 'react-native';
import { SectionCard, PrimaryButton, TextField } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { formatDateTime, pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function ApiKeysSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { newApiKeyName, createdApiKey, cameraTokenForm } = controller.state;
  const { setNewApiKeyName, setCameraTokenForm } = controller.actions;
  const { createApiKeyMutation, deleteApiKeyMutation, createCameraTokenMutation, revokeCameraTokenMutation } = controller.mutations;
  const apiKeys = (controller.queries.apiKeysQuery.data ?? []) as ApiRecord[];
  const cameraTokens = (controller.queries.cameraTokensQuery.data ?? []) as ApiRecord[];

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
      <SectionCard title="Camera tokens" subtitle="Create long-lived camera stream tokens for kiosks and integrations.">
        <TextField label="Token name" value={cameraTokenForm.name} onChangeText={value => setCameraTokenForm(current => ({ ...current, name: value }))} placeholder="Home Assistant" />
        <TextField label="Expires in (days)" value={cameraTokenForm.expiresInDays} onChangeText={value => setCameraTokenForm(current => ({ ...current, expiresInDays: value }))} keyboardType="number-pad" />
        <PrimaryButton label={createCameraTokenMutation.isPending ? 'Creating…' : 'Create camera token'} onPress={() => void createCameraTokenMutation.mutateAsync()} disabled={!cameraTokenForm.name.trim() || createCameraTokenMutation.isPending} loading={createCameraTokenMutation.isPending} />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Token values are shown once, then hidden permanently.</Text>
        {cameraTokens.map(token => (
          <View key={pickString(token, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(token, ['name'], 'Camera token')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>Expires {formatDateTime(pickString(token, ['expires_at']))} • Last used {formatDateTime(pickString(token, ['last_used_at']))}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>Prefix: {pickString(token, ['lookup_prefix'], '—')}</Text>
              </View>
              <PrimaryButton label="Revoke" variant="danger" onPress={() => void revokeCameraTokenMutation.mutateAsync(pickNumber(token, ['id']))} />
            </View>
          </View>
        ))}
      </SectionCard>
    </>
  );
}
