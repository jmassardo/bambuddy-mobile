import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { AlertModal } from '@/components/common/AlertModal';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { formatDateTime, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { settingsStyles as styles } from './shared';

type CameraTokenFormState = {
  name: string;
  expiresInDays: string;
};

const EMPTY_CAMERA_TOKEN_FORM: CameraTokenFormState = {
  name: '',
  expiresInDays: '90',
};

export default function KeysSection() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');
  const [cameraTokenForm, setCameraTokenForm] = useState<CameraTokenFormState>(EMPTY_CAMERA_TOKEN_FORM);
  const [createdCameraToken, setCreatedCameraToken] = useState('');

  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: api.getApiKeys });
  const cameraTokensQuery = useQuery({
    queryKey: ['cameraTokens'],
    queryFn: () => (isAdmin ? api.listAllLongLivedCameraTokens() : api.listMyLongLivedCameraTokens()),
  });

  const createApiKeyMutation = useMutation({
    mutationFn: () => api.createApiKey({ name: newApiKeyName.trim() }),
    onSuccess: async data => {
      setCreatedApiKey(pickString(data as ApiRecord, ['key'], ''));
      setNewApiKeyName('');
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create API key.', 'error'),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: number) => api.deleteApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key deleted.', 'success');
    },
  });

  const createCameraTokenMutation = useMutation({
    mutationFn: () =>
      api.createLongLivedCameraToken({
        name: cameraTokenForm.name.trim(),
        expires_in_days: Math.max(1, Math.min(365, Number(cameraTokenForm.expiresInDays) || 90)),
      }),
    onSuccess: async data => {
      setCreatedCameraToken(pickString(data as ApiRecord, ['token']));
      setCameraTokenForm(EMPTY_CAMERA_TOKEN_FORM);
      await queryClient.invalidateQueries({ queryKey: ['cameraTokens'] });
      showToast('Camera token created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create camera token.', 'error'),
  });

  const revokeCameraTokenMutation = useMutation({
    mutationFn: (id: number) => api.revokeLongLivedCameraToken(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cameraTokens'] });
      showToast('Camera token revoked.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to revoke camera token.', 'error'),
  });

  if (apiKeysQuery.isLoading || cameraTokensQuery.isLoading) {
    return <LoadingScreen message="Loading API keys…" />;
  }

  if (apiKeysQuery.isError || cameraTokensQuery.isError) {
    return <ErrorState message="Unable to load API keys." onRetry={() => { void apiKeysQuery.refetch(); void cameraTokensQuery.refetch(); }} />;
  }

  return (
    <>
      <SectionCard title="API keys" subtitle="Create personal or integration keys and revoke old ones.">
        <TextField label="New API key name" value={newApiKeyName} onChangeText={setNewApiKeyName} placeholder="Automation" />
        <PrimaryButton label={createApiKeyMutation.isPending ? 'Creating…' : 'Create API key'} onPress={() => void createApiKeyMutation.mutateAsync()} disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending} loading={createApiKeyMutation.isPending} />
        {createdApiKey ? <Text style={[styles.helper, { color: colors.accentLight }]}>New key: {createdApiKey}</Text> : null}
        {((apiKeysQuery.data ?? []) as ApiRecord[]).map(key => (
          <View key={pickString(key, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.itemHeader}>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(key, ['name'], 'API key')}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(key, ['created_at'], 'Created')}</Text>
              </View>
              <PrimaryButton label="Delete" variant="danger" onPress={() => void deleteApiKeyMutation.mutateAsync(pickNumber(key, ['id']))} />
            </View>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Camera tokens" subtitle="Create long-lived camera stream tokens for kiosks and integrations.">
        <TextField label="Token name" value={cameraTokenForm.name} onChangeText={value => setCameraTokenForm(current => ({ ...current, name: value }))} placeholder="Home Assistant" />
        <TextField label="Expires in (days)" value={cameraTokenForm.expiresInDays} onChangeText={value => setCameraTokenForm(current => ({ ...current, expiresInDays: value }))} keyboardType="number-pad" />
        <PrimaryButton
          label={createCameraTokenMutation.isPending ? 'Creating…' : 'Create camera token'}
          onPress={() => void createCameraTokenMutation.mutateAsync()}
          disabled={!cameraTokenForm.name.trim() || createCameraTokenMutation.isPending}
          loading={createCameraTokenMutation.isPending}
        />
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Token values are shown once, then hidden permanently.</Text>
        {((cameraTokensQuery.data ?? []) as ApiRecord[]).map(token => (
          <View key={pickString(token, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.itemHeader}>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(token, ['name'], 'Camera token')}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Expires {formatDateTime(pickString(token, ['expires_at']))} • Last used {formatDateTime(pickString(token, ['last_used_at']))}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Prefix: {pickString(token, ['lookup_prefix'], '—')}</Text>
              </View>
              <PrimaryButton label="Revoke" variant="danger" onPress={() => void revokeCameraTokenMutation.mutateAsync(pickNumber(token, ['id']))} />
            </View>
          </View>
        ))}
      </SectionCard>

      <AlertModal
        visible={Boolean(createdCameraToken)}
        variant="success"
        title="Camera token created"
        message={createdCameraToken || 'Your new camera token is ready.'}
        dismissLabel="OK"
        onClose={() => setCreatedCameraToken('')}
      />
    </>
  );
}
