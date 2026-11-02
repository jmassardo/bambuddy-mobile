import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import Share from 'react-native-share';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authManagementApi } from '@/api/authManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { SwitchRow } from './shared';
import type { ApiKeyScope, ScopedApiKeyCreate } from '@/types/api';
import { spacing } from '@/theme/tokens';
import { useServerStore } from '@/api/server';
import { buildApiKeyEnrollment } from '@/utils/authSecurity';

const SCOPES: { key: ApiKeyScope; label: string; defaultValue: boolean }[] = [
  { key: 'can_queue', get label() { return translateNative('native.3e0591c48c502a88'); }, defaultValue: true },
  { key: 'can_control_printer', get label() { return translateNative('native.9ecb8e64131d0ea2'); }, defaultValue: false },
  { key: 'can_read_status', get label() { return translateNative('native.822f599116395841'); }, defaultValue: true },
  { key: 'can_manage_library', get label() { return translateNative('native.d847aa69a5154a67'); }, defaultValue: true },
  { key: 'can_manage_inventory', get label() { return translateNative('native.ca9ba240f1c1cfe1'); }, defaultValue: true },
  { key: 'can_manage_maintenance', get label() { return translateNative('native.5d35defedb736c72'); }, defaultValue: true },
  { key: 'can_manage_archives', get label() { return translateNative('native.e03005e830a1dcf0'); }, defaultValue: true },
  { key: 'can_manage_projects', get label() { return translateNative('native.9890a2f51efed490'); }, defaultValue: true },
  { key: 'can_access_cloud', get label() { return translateNative('native.70fb8c33dd4bb21d'); }, defaultValue: false },
  { key: 'can_update_energy_cost', get label() { return translateNative('native.872df1d241bf900b'); }, defaultValue: false },
  { key: 'can_send_notifications', get label() { return translateNative('native.893075b29a3592cb'); }, defaultValue: false },
];
const DEFAULT_SCOPES = Object.fromEntries(SCOPES.map(s => [s.key, s.defaultValue])) as Record<ApiKeyScope, boolean>;

export function ScopedApiKeysManager() {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission, authEnabled } = useAuth();
  const { colors } = useTheme();
  const serverUrl = useServerStore(s => s.serverUrl);
  const qrRef = React.useRef<{ toDataURL: (callback: (data: string) => void) => void } | null>(null);
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(DEFAULT_SCOPES);
  const [secret, setSecret] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [message, setMessage] = useNativeMessageState('');
  React.useEffect(() => {
    if (!authEnabled) setScopes(current => current.can_access_cloud ? { ...current, can_access_cloud: false } : current);
  }, [authEnabled]);
  const query = useQuery({ queryKey: ['apiKeys'], queryFn: authManagementApi.listKeys, enabled: hasPermission('api_keys:read') });
  const create = useMutation({
    gcTime: 0,
    mutationFn: (data: ScopedApiKeyCreate) => authManagementApi.createKey(data),
    onSuccess: async result => { setSecret(result.key); setShowQr(false); setName(''); setMessage(nativeMessage('auth.saveSecretNow', () => ({ defaultValue: 'Save this secret now. It cannot be retrieved again.' }))); await client.invalidateQueries({ queryKey: ['apiKeys'] }); },
    onError: (e: Error) => setMessage(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => authManagementApi.revokeKey(id),
    onSuccess: async () => { setMessage(nativeMessage('auth.keyRevoked', () => ({ defaultValue: 'API key revoked.' }))); await client.invalidateQueries({ queryKey: ['apiKeys'] }); },
    onError: (e: Error) => setMessage(e.message),
  });
  if (!hasPermission('api_keys:read')) return null;
  return <SectionCard title={t('auth.apiKeysTitle', { defaultValue: 'Scoped API keys' })} subtitle={t('auth.apiKeysHint', { defaultValue: 'Choose the minimum permissions required. Secrets are shown only once.' })}>
    {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
    {secret ? <View style={styles.secret}>
      <Text selectable style={{ color: colors.text }}>{secret}</Text>
      <PrimaryButton label={t('auth.copyNewKey', { defaultValue: 'Copy new key' })} variant="secondary" onPress={() => { Clipboard.setString(secret); setMessage(nativeMessage('auth.keyCopied', () => ({ defaultValue: 'Key copied. Clear your clipboard after use.' }))); }} />
      <PrimaryButton label={showQr ? t('auth.hideEnrollmentQR', { defaultValue: 'Hide enrollment QR' }) : t('auth.showEnrollmentQR', { defaultValue: 'Show enrollment QR' })} variant="secondary" onPress={() => setShowQr(v => !v)} />
      {showQr && serverUrl ? <>
        <Text style={{ color: colors.warning }}>{t('auth.enrollmentQRWarning', { defaultValue: 'This enrollment QR contains the server address and secret key. Share only with a trusted recipient.' })}</Text>
        <View style={styles.qr}><QRCode value={buildApiKeyEnrollment(serverUrl, secret)} size={200} getRef={ref => { qrRef.current = ref; }} /></View>
        <PrimaryButton label={t('auth.shareEnrollmentQR', { defaultValue: 'Share enrollment QR' })} variant="secondary" onPress={() => qrRef.current?.toDataURL(data => {
          void Share.open({ url: `data:image/png;base64,${data}`, type: 'image/png', filename: 'bambuddy-enrollment', failOnCancel: false }).catch((e: Error) => setMessage(e.message));
        })} />
      </> : null}
      <PrimaryButton label={t('auth.dismissSecret', { defaultValue: 'Dismiss secret' })} onPress={() => { setSecret(null); create.reset(); setShowQr(false); setMessage(''); }} />
    </View> : hasPermission('api_keys:create') ? <>
      <TextField label={t('auth.apiKeyName', { defaultValue: 'API key name' })} value={name} onChangeText={setName} />
      {SCOPES.map(scope => <SwitchRow key={scope.key} label={t(`auth.scope.${scope.key}`, { defaultValue: scope.label })} value={scopes[scope.key]} onValueChange={value => setScopes(s => ({ ...s, [scope.key]: value }))} disabled={scope.key === 'can_access_cloud' && !authEnabled} />)}
      <PrimaryButton label={t('auth.createScopedKey', { defaultValue: 'Create scoped key' })} disabled={!name.trim() || create.isPending} onPress={() => create.mutate({ name: name.trim(), ...scopes })} />
    </> : null}
    {query.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingKeys', { defaultValue: 'Loading API keys…' })}</Text> : null}
    {query.isError ? <><Text accessibilityRole="alert" style={{ color: colors.error }}>{query.error.message}</Text><PrimaryButton label={t('auth.retryKeys', { defaultValue: 'Retry API keys' })} onPress={() => void query.refetch()} /></> : null}
    {query.data?.map(key => <View key={key.id} style={styles.secret}>
      <Text style={{ color: colors.text }}>{key.name} • {key.key_prefix}… • {key.enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}</Text>
      <Text style={{ color: colors.textSecondary }}>{key.user_id === null ? translateNative('native.ca5a0980331e006b') : translateNative('native.8c67a7ebd142e01e', { value0: String(key.user_id) })} {translateNative('native.12909e6e0b57e30b')}{key.created_at} {translateNative('native.8e71515d9199787d')}{key.last_used || translateNative('native.cdbd106167cee609')} {translateNative('native.9e105c7aa96afa69')}{key.expires_at || translateNative('native.cdbd106167cee609')}</Text>
      <Text style={{ color: colors.textSecondary }}>{t('auth.keyScopes', { defaultValue: 'Scopes: {{scopes}}', scopes: SCOPES.filter(s => key[s.key]).map(s => t(`auth.scope.${s.key}`, { defaultValue: s.label })).join(', ') || t('common.none', { defaultValue: 'none' }) })}</Text>
      <Text style={{ color: colors.textSecondary }}>{t('auth.keyPrinters', { defaultValue: 'Printers: {{printers}}', printers: key.printer_ids == null ? t('auth.allPrinters', { defaultValue: 'all' }) : key.printer_ids.join(', ') })}</Text>
      {hasPermission('api_keys:delete') ? <PrimaryButton label={t('auth.revokeKey', { defaultValue: 'Revoke {{name}}', name: key.name })} variant="danger" disabled={revoke.isPending} onPress={() => Alert.alert(t('auth.revokeKeyConfirm', { defaultValue: 'Revoke API key?' }), t('auth.revokeKeyWarning', { defaultValue: '{{name}} ({{prefix}}…) will stop working immediately.', name: key.name, prefix: key.key_prefix }), [
        { text: t('common.cancel'), style: 'cancel' }, { text: t('auth.revoke', { defaultValue: 'Revoke' }), style: 'destructive', onPress: () => revoke.mutate(key.id) },
      ])} /> : null}
    </View>)}
    {query.data?.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('auth.noKeys', { defaultValue: 'No API keys.' })}</Text> : null}
  </SectionCard>;
}
const styles = StyleSheet.create({ secret: { gap: spacing.sm, paddingVertical: spacing.md }, qr: { alignSelf: 'center', padding: spacing.md, backgroundColor: '#ffffff' } });
