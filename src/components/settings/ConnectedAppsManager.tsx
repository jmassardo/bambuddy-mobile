import { NativeTranslation, nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authManagementApi } from '@/api/authManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import type { ConnectedAppSecret } from '@/types/api';
import { spacing } from '@/theme/tokens';

export function validateConnectedCallback(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || !url.host || url.hash || url.username || url.password) throw new Error(translateNative('native.009da5efb708ad3f'));
  return value.trim();
}

export function ConnectedAppsManager() {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission, authEnabled } = useAuth();
  const canManage = hasPermission('settings:update');
  const { colors } = useTheme();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [callback, setCallback] = useState('');
  const [secret, setSecret] = useState<ConnectedAppSecret | null>(null);
  const [message, setMessage] = useNativeMessageState('');
  const query = useQuery({ queryKey: ['connectedApps'], queryFn: authManagementApi.listApps, enabled: canManage });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async ({ kind, id, enabled }: { kind: 'create' | 'toggle' | 'rotate' | 'delete'; id?: number; enabled?: boolean }) => {
      if (!canManage) throw new Error(translateNative('native.088d1ba6420a8a8c'));
      if (kind === 'create') {
        if (!name.trim()) throw new Error(translateNative('native.919942bf311d22ff'));
        return authManagementApi.createApp(name.trim(), validateConnectedCallback(callback));
      }
      if (id === undefined) throw new Error(translateNative('native.0abbe0b91ada83bd'));
      if (kind === 'rotate') return authManagementApi.rotateApp(id);
      if (kind === 'delete') return authManagementApi.deleteApp(id);
      return authManagementApi.updateApp(id, Boolean(enabled));
    },
    onSuccess: async result => {
      if (result && 'client_secret' in result && typeof result.client_secret === 'string') {
        setSecret({ ...result, client_secret: result.client_secret }); setName(''); setCallback('');
      }
      setMessage(nativeMessage('auth.connectedAppUpdated', () => ({ defaultValue: 'Connected app updated.' })));
      await client.invalidateQueries({ queryKey: ['connectedApps'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });
  if (!canManage) return null;
  return <SectionCard title={t('auth.connectedApps', { defaultValue: 'Connected apps' })} subtitle={t('auth.connectedAppsHint', { defaultValue: 'Registered clients authenticate users with consent and PKCE. This does not grant API access.' })}>
    {!authEnabled ? <Text style={{ color: colors.warning }}>{t('auth.connectedAppAuthRequired', { defaultValue: 'Authentication must be enabled before users can authorize connected apps.' })}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
    {secret ? <>
      <Text style={{ color: colors.warning }}>{t('auth.clientSecretOnce', { defaultValue: 'Store the client secret now. It is shown only once.' })}</Text>
      <Text selectable style={{ color: colors.text }}><NativeTranslation id="native.ba5214df3f37bb8f" values={{ value0: (secret.client_id) }} /></Text>
      <Text selectable style={{ color: colors.text }}><NativeTranslation id="native.7afe33a04d326e62" values={{ value0: (secret.client_secret) }} /></Text>
      <PrimaryButton label={t('auth.copyClientId', { defaultValue: 'Copy client ID' })} variant="secondary" onPress={() => Clipboard.setString(secret.client_id)} />
      <PrimaryButton label={t('auth.copyClientSecret', { defaultValue: 'Copy client secret' })} variant="secondary" onPress={() => Clipboard.setString(secret.client_secret)} />
      <PrimaryButton label={t('auth.dismissClientSecret', { defaultValue: 'Dismiss client secret' })} onPress={() => { setSecret(null); mutation.reset(); }} />
    </> : <>
      <TextField label={t('auth.appName', { defaultValue: 'App name' })} value={name} onChangeText={setName} maxLength={100} />
      <TextField label={t('auth.callbackUrl', { defaultValue: 'Callback URL' })} value={callback} onChangeText={setCallback} autoCapitalize="none" maxLength={500} />
      <PrimaryButton label={t('auth.registerApp', { defaultValue: 'Register app' })} disabled={mutation.isPending || !name.trim() || !callback.trim()} onPress={() => mutation.mutate({ kind: 'create' })} />
    </>}
    {query.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingConnectedApps', { defaultValue: 'Loading connected apps…' })}</Text> : null}
    {query.isError ? <><Text accessibilityRole="alert" style={{ color: colors.error }}>{query.error.message}</Text><PrimaryButton label={t('auth.retryConnectedApps', { defaultValue: 'Retry connected apps' })} onPress={() => void query.refetch()} /></> : null}
    {query.data?.map(app => <View key={app.id} style={styles.app}>
      <Text style={{ color: colors.text }}>{app.name} • {app.enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}</Text>
      <Text selectable style={{ color: colors.textSecondary }}>{app.client_id} • {app.redirect_uri}</Text>
      <Text style={{ color: colors.textSecondary }}><NativeTranslation id="native.8bb7db75674fb985" values={{ value0: (app.created_at), value1: (app.last_used_at || 'never') }} /></Text>
      <PrimaryButton label={app.enabled ? t('auth.disableApp', { defaultValue: 'Disable {{app}}', app: app.name }) : t('auth.enableApp', { defaultValue: 'Enable {{app}}', app: app.name })} variant="secondary" disabled={mutation.isPending} onPress={() => Alert.alert(t('auth.toggleAppConfirm', { defaultValue: 'Change connected app availability?' }), app.name, [
        { text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => mutation.mutate({ kind: 'toggle', id: app.id, enabled: !app.enabled }) },
      ])} />
      <PrimaryButton label={t('auth.rotateAppSecret', { defaultValue: 'Rotate {{app}} secret', app: app.name })} variant="secondary" disabled={mutation.isPending} onPress={() => Alert.alert(t('auth.rotateSecretConfirm', { defaultValue: 'Rotate client secret?' }), t('auth.rotateSecretWarning', { defaultValue: 'The previous secret stops working immediately.' }), [
        { text: t('common.cancel'), style: 'cancel' }, { text: t('auth.rotate', { defaultValue: 'Rotate' }), style: 'destructive', onPress: () => mutation.mutate({ kind: 'rotate', id: app.id }) },
      ])} />
      <PrimaryButton label={t('auth.deleteApp', { defaultValue: 'Delete {{app}}', app: app.name })} variant="danger" disabled={mutation.isPending} onPress={() => Alert.alert(t('auth.deleteAppConfirm', { defaultValue: 'Delete connected app?' }), t('auth.deleteAppWarning', { defaultValue: '{{app}} and its grants will be removed.', app: app.name }), [
        { text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => mutation.mutate({ kind: 'delete', id: app.id }) },
      ])} />
    </View>)}
    {query.data?.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('auth.noConnectedApps', { defaultValue: 'No connected apps registered.' })}</Text> : null}
  </SectionCard>;
}
const styles = StyleSheet.create({ app: { gap: spacing.sm, paddingVertical: spacing.md } });
