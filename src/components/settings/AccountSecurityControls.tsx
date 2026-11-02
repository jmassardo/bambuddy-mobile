import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { authManagementApi } from '@/api/authManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { validateNewPassword } from '@/utils/authSecurity';

import { useToast } from '@/contexts/ToastContext';

export function AccountSecurityControls() {
  useNativeLocale();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user, authEnabled, isAdmin, refreshAuth, logout } = useAuth();
  const { colors } = useTheme();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useNativeMessageState('');
  const clear = () => { setCurrent(''); setPassword(''); setConfirm(''); setEditing(false); };
  const change = useMutation({
    mutationFn: async () => {
      validateNewPassword(password, confirm);
      return authApi.changeOwnPassword(current, password);
    },
    onSuccess: async response => {
      const result = nativeMessage('auth.passwordChanged', { defaultValue: 'Password changed. Please sign in again.' });
      setMessage(response.message || result); showToast(result, 'success'); clear(); await logout();
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const lifecycle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        return authApi.setupAuth({ auth_enabled: true, admin_username: username.trim(), admin_password: password });
      }
      if (!isAdmin) throw new Error(translateNative('native.16fe08b07acbb678'));
      return authApi.disableAuth();
    },
    onSuccess: async () => { clear(); setMessage(nativeMessage('native.fe92f52a52a7824c')); await refreshAuth(); },
    onError: (e: Error) => setMessage(e.message),
  });
  return <>
    {(!authEnabled || isAdmin) ? <SectionCard title={t('auth.serverAuthentication', { defaultValue: 'Server authentication' })}>
      <Text style={{ color: colors.text }}>{authEnabled ? t('auth.authenticationEnabled', { defaultValue: 'Authentication is enabled.' }) : t('auth.authenticationDisabled', { defaultValue: 'Authentication is disabled.' })}</Text>
      {authEnabled ? <PrimaryButton label={t('auth.disableAuthentication', { defaultValue: 'Disable authentication' })} variant="danger" disabled={lifecycle.isPending} onPress={() => Alert.alert(t('auth.disableConfirm', { defaultValue: 'Disable authentication?' }), t('auth.disableWarning', { defaultValue: 'Anyone with network access will be able to access this server.' }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('auth.disable', { defaultValue: 'Disable' }), style: 'destructive', onPress: () => lifecycle.mutate(false) },
      ])} /> : <>
        <Text style={{ color: colors.textSecondary }}>{t('auth.enableAuthHint', { defaultValue: 'Existing administrators are retained. For a new server, enter the first administrator credentials.' })}</Text>
        <TextField label={t('auth.adminUsername', { defaultValue: 'Administrator username' })} value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextField label={t('auth.adminPassword', { defaultValue: 'Administrator password' })} value={password} onChangeText={setPassword} secureTextEntry />
        <PrimaryButton label={t('auth.enableAuthentication', { defaultValue: 'Enable authentication' })} disabled={lifecycle.isPending} onPress={() => lifecycle.mutate(true)} />
      </>}
    </SectionCard> : null}
    {user && user.auth_source !== 'ldap' ? <SectionCard title={t('auth.changeMyPassword', { defaultValue: 'Change my password' })} subtitle={t('auth.passwordHint', { defaultValue: 'Verify your current password. Directory-managed passwords must be changed with your directory provider.' })}>
      {editing ? <>
        <TextField label={t('auth.currentPassword', { defaultValue: 'Current password' })} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <TextField label={t('auth.newPassword', { defaultValue: 'New password' })} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <TextField label={t('auth.confirmPassword', { defaultValue: 'Confirm new password' })} value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />
        <PrimaryButton label={t('auth.changePassword', { defaultValue: 'Change password' })} disabled={!current || change.isPending} onPress={() => change.mutate()} />
        <PrimaryButton label={t('common.cancel')} variant="secondary" disabled={change.isPending} onPress={clear} />
      </> : <PrimaryButton label={t('auth.changeMyPassword', { defaultValue: 'Change my password' })} variant="secondary" onPress={() => { setMessage(''); setEditing(true); }} />}
    </SectionCard> : null}
    {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
  </>;
}

export function EncryptionStatusPanel() {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('settings:update');
  const { colors } = useTheme();
  const query = useQuery({ queryKey: ['encryptionStatus'], queryFn: authManagementApi.encryptionStatus, enabled: canRead, refetchInterval: 30000 });
  if (!canRead) return null;
  const data = query.data;
  return <SectionCard title={t('auth.encryptionTitle', { defaultValue: 'MFA encryption at rest' })}>
    {query.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingEncryption', { defaultValue: 'Loading encryption status…' })}</Text> : query.isError || !data ? <>
      <Text accessibilityRole="alert" style={{ color: colors.error }}>{t('auth.encryptionUnavailable', { defaultValue: 'Encryption health unavailable.' })} {query.error?.message}</Text>
      <PrimaryButton label={t('auth.retryEncryption', { defaultValue: 'Retry encryption status' })} variant="secondary" onPress={() => void query.refetch()} />
    </> : <>
      <Text style={{ color: data.decryption_broken ? colors.error : colors.text }}>{data.decryption_broken ? t('auth.encryptionRecovery', { defaultValue: 'Recovery required: encrypted credentials cannot be decrypted.' }) : data.key_configured ? t('auth.encryptionConfigured', { defaultValue: 'Encryption key configured' }) : t('auth.encryptionUnconfigured', { defaultValue: 'Encryption not configured' })}</Text>
      <Text style={{ color: colors.text }}>{t('auth.encryptionKeySource', { defaultValue: 'Key source: {{source}}', source: data.key_source })}</Text>
      <Text style={{ color: colors.text }}>{t('auth.encryptedCounts', { defaultValue: 'Encrypted: {{oidc}} OIDC providers, {{totp}} TOTP accounts', oidc: data.encrypted_rows.oidc_providers, totp: data.encrypted_rows.user_totp })}</Text>
      <Text style={{ color: colors.text }}>{t('auth.plaintextCounts', { defaultValue: 'Legacy plaintext: {{oidc}} OIDC providers, {{totp}} TOTP accounts', oidc: data.legacy_plaintext_rows.oidc_providers, totp: data.legacy_plaintext_rows.user_totp })}</Text>
      {data.legacy_plaintext_rows.oidc_providers + data.legacy_plaintext_rows.user_totp > 0 ? <Text style={{ color: colors.warning }}>{t('auth.legacyEncryptionWarning', { defaultValue: 'Legacy secrets still need re-encryption.' })}</Text> : null}
      {data.migration_error_count > 0 ? <Text style={{ color: colors.warning }}>{t('auth.migrationWarning', { defaultValue: 'Migration skipped {{count}} rows. Check server logs and key configuration.', count: data.migration_error_count })}</Text> : null}
      {data.key_source === 'generated' ? <Text style={{ color: colors.warning }}>{t('auth.encryptionBackupHint', { defaultValue: 'Back up the server-generated MFA encryption key file securely. Losing it makes encrypted OIDC and TOTP secrets unrecoverable. Alternatively configure MFA_ENCRYPTION_KEY on the server.' })}</Text> : null}
      <PrimaryButton label={t('auth.refreshEncryption', { defaultValue: 'Refresh encryption status' })} variant="secondary" onPress={() => void query.refetch()} />
    </>}
  </SectionCard>;
}
