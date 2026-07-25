import Clipboard from '@react-native-clipboard/clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InlineTabBar, PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type {
  AdvancedAuthStatus,
  BackupCodesResponse,
  LDAPStatus,
  OIDCLink,
  OIDCProvider,
  OIDCProviderCreate,
  SMTPSettings,
  TwoFAStatus,
} from '@/types/api';
import { formatDateTime, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { OptionChipsField, SimpleModal, SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';
import type { AppNavigationProp } from '@/navigation/types';

type UserPanelKey = 'auth' | 'email' | 'ldap' | 'oidc' | 'twofa';
type SmtpSecurity = SMTPSettings['smtp_security'];

type LDAPFormState = {
  ldap_server_url: string;
  ldap_bind_dn: string;
  ldap_bind_password: string;
  ldap_search_base: string;
  ldap_user_filter: string;
  ldap_security: string;
  ldap_group_mapping: string;
  ldap_auto_provision: boolean;
  ldap_default_group: string;
};

type ProviderFormState = {
  name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  is_enabled: boolean;
};

const SMTP_SECURITY_OPTIONS: Array<{ key: SmtpSecurity; label: string }> = [
  { key: 'starttls', label: 'STARTTLS' },
  { key: 'ssl', label: 'SSL' },
  { key: 'none', label: 'None' },
];

const SMTP_PORT_BY_SECURITY: Record<SmtpSecurity, number> = {
  starttls: 587,
  ssl: 465,
  none: 25,
};

const DEFAULT_SMTP_SETTINGS: SMTPSettings = {
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_security: 'starttls',
  smtp_auth_enabled: true,
  smtp_from_email: '',
  smtp_from_name: 'BamBuddy',
};

const DEFAULT_LDAP_FORM: LDAPFormState = {
  ldap_server_url: '',
  ldap_bind_dn: '',
  ldap_bind_password: '',
  ldap_search_base: '',
  ldap_user_filter: '(sAMAccountName={username})',
  ldap_security: 'starttls',
  ldap_group_mapping: '',
  ldap_auto_provision: false,
  ldap_default_group: '',
};

const EMPTY_PROVIDER_FORM: ProviderFormState = {
  name: '',
  issuer_url: '',
  client_id: '',
  client_secret: '',
  scopes: 'openid email profile',
  is_enabled: true,
};

export default function UsersSection() {
  const navigation = useNavigation<AppNavigationProp>();
  const { colors } = useTheme();
  const { authEnabled, hasPermission, isAdmin, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();
  const [userPanel, setUserPanel] = useState<UserPanelKey>('auth');
  const [smtpForm, setSmtpForm] = useState<SMTPSettings>(DEFAULT_SMTP_SETTINGS);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [ldapForm, setLdapForm] = useState<LDAPFormState>(DEFAULT_LDAP_FORM);
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<OIDCProvider | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);
  const [providerDeleteTarget, setProviderDeleteTarget] = useState<OIDCProvider | null>(null);
  const [showTOTPSetup, setShowTOTPSetup] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpRegenCode, setTotpRegenCode] = useState('');
  const [showTOTPDisable, setShowTOTPDisable] = useState(false);
  const [showTOTPRegen, setShowTOTPRegen] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [emailSetupToken, setEmailSetupToken] = useState<string | null>(null);
  const [emailSetupCode, setEmailSetupCode] = useState('');
  const [showDisableEmail2FA, setShowDisableEmail2FA] = useState(false);
  const [emailDisablePassword, setEmailDisablePassword] = useState('');

  const canManageSecurity = !authEnabled || isAdmin || hasPermission('settings:update');

  const advancedAuthQuery = useQuery<AdvancedAuthStatus>({ queryKey: ['advancedAuthStatus'], queryFn: api.getAdvancedAuthStatus });
  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: api.getApiKeys });
  const ldapStatusQuery = useQuery<LDAPStatus>({ queryKey: ['ldapStatus'], queryFn: api.getLDAPStatus });
  const usersQuery = useQuery({ queryKey: ['users', 'settings-security'], queryFn: api.getUsers, enabled: isAdmin });
  const smtpSettingsQuery = useQuery<SMTPSettings | null>({ queryKey: ['smtpSettings'], queryFn: api.getSMTPSettings });
  const oidcProvidersQuery = useQuery<OIDCProvider[]>({ queryKey: ['oidcProvidersAll'], queryFn: api.getOIDCProvidersAll });
  const twoFAStatusQuery = useQuery<TwoFAStatus>({ queryKey: ['2fa-status'], queryFn: api.get2FAStatus });
  const oidcLinksQuery = useQuery<OIDCLink[]>({ queryKey: ['oidc-links'], queryFn: api.getOIDCLinks });
  const totpSetupQuery = useQuery({ queryKey: ['totp-setup'], queryFn: api.setupTOTP, enabled: showTOTPSetup, staleTime: Infinity });

  useEffect(() => {
    if (settingsQuery.data) {
      setLdapForm({
        ldap_server_url: pickString(settingsQuery.data as ApiRecord, ['ldap_server_url']),
        ldap_bind_dn: pickString(settingsQuery.data as ApiRecord, ['ldap_bind_dn']),
        ldap_bind_password: '',
        ldap_search_base: pickString(settingsQuery.data as ApiRecord, ['ldap_search_base']),
        ldap_user_filter: pickString(settingsQuery.data as ApiRecord, ['ldap_user_filter'], '(sAMAccountName={username})'),
        ldap_security: pickString(settingsQuery.data as ApiRecord, ['ldap_security'], 'starttls'),
        ldap_group_mapping: pickString(settingsQuery.data as ApiRecord, ['ldap_group_mapping']),
        ldap_auto_provision: pickBoolean(settingsQuery.data as ApiRecord, ['ldap_auto_provision']),
        ldap_default_group: pickString(settingsQuery.data as ApiRecord, ['ldap_default_group']),
      });
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (smtpSettingsQuery.data) {
      setSmtpForm({ ...smtpSettingsQuery.data, smtp_password: '' });
    } else if (smtpSettingsQuery.data === null) {
      setSmtpForm(DEFAULT_SMTP_SETTINGS);
    }
  }, [smtpSettingsQuery.data]);

  useEffect(() => {
    if (user?.email && !smtpTestEmail) {
      setSmtpTestEmail(user.email);
    }
  }, [smtpTestEmail, user?.email]);

  const saveSMTPMutation = useMutation({
    mutationFn: (data: SMTPSettings) => api.saveSMTPSettings(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast('SMTP settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save SMTP settings.', 'error'),
  });

  const testSMTPMutation = useMutation({
    mutationFn: (recipient: string) => api.testSMTP({ test_recipient: recipient }),
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || 'SMTP test failed.', 'error'),
  });

  const toggleAdvancedAuthMutation = useMutation({
    mutationFn: (enabled: boolean) => (enabled ? api.enableAdvancedAuth() : api.disableAdvancedAuth()),
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast(data.message || 'Authentication updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update authentication.', 'error'),
  });

  const saveLDAPMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.updateSettings(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast('LDAP settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save LDAP settings.', 'error'),
  });

  const toggleLDAPMutation = useMutation({
    mutationFn: (enabled: boolean) => api.updateSettings({ ldap_enabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast('LDAP setting updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update LDAP status.', 'error'),
  });

  const testLDAPMutation = useMutation({
    mutationFn: api.testLDAP,
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || 'LDAP test failed.', 'error'),
  });

  const createOIDCProviderMutation = useMutation({
    mutationFn: (payload: OIDCProviderCreate) => api.createOIDCProvider(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast('OIDC provider created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create OIDC provider.', 'error'),
  });

  const updateOIDCProviderMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<OIDCProviderCreate> }) => api.updateOIDCProvider(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast('OIDC provider updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update OIDC provider.', 'error'),
  });

  const deleteOIDCProviderMutation = useMutation({
    mutationFn: (id: number) => api.deleteOIDCProvider(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      setProviderDeleteTarget(null);
      showToast('OIDC provider deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete OIDC provider.', 'error'),
  });

  const enableTOTPMutation = useMutation({
    mutationFn: (code: string) => api.enableTOTP(code),
    onSuccess: async data => {
      setBackupCodes(data.backup_codes);
      setTotpCode('');
      setShowTOTPSetup(false);
      queryClient.removeQueries({ queryKey: ['totp-setup'] });
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast('Authenticator app enabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Invalid verification code.', 'error'),
  });

  const disableTOTPMutation = useMutation({
    mutationFn: (code: string) => api.disableTOTP(code),
    onSuccess: async data => {
      setShowTOTPDisable(false);
      setTotpCode('');
      setTotpDisableCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Authenticator app disabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to disable TOTP.', 'error'),
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: (code: string) => api.regenerateBackupCodes(code),
    onSuccess: async (data: BackupCodesResponse) => {
      setBackupCodes(data.backup_codes);
      setShowTOTPRegen(false);
      setTotpRegenCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Backup codes regenerated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to regenerate backup codes.', 'error'),
  });

  const enableEmailOTPRequestMutation = useMutation({
    mutationFn: api.enableEmailOTP,
    onSuccess: data => {
      setEmailSetupToken(data.setup_token);
      setEmailSetupCode('');
      showToast(data.message || 'Verification code sent.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to start email 2FA setup.', 'error'),
  });

  const confirmEnableEmailOTPMutation = useMutation({
    mutationFn: ({ token, code }: { token: string; code: string }) => api.confirmEnableEmailOTP(token, code),
    onSuccess: async data => {
      setEmailSetupToken(null);
      setEmailSetupCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Email 2FA enabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to enable email 2FA.', 'error'),
  });

  const disableEmailOTPMutation = useMutation({
    mutationFn: (password: string) => api.disableEmailOTP(password),
    onSuccess: async data => {
      setShowDisableEmail2FA(false);
      setEmailDisablePassword('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Email 2FA disabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to disable email 2FA.', 'error'),
  });

  const unlinkOIDCLinkMutation = useMutation({
    mutationFn: (providerId: number) => api.deleteOIDCLink(providerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidc-links'] });
      showToast('Linked account removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove linked account.', 'error'),
  });

  function closeProviderModal() {
    setProviderModalVisible(false);
    setEditingProvider(null);
    setProviderForm(EMPTY_PROVIDER_FORM);
  }

  function openProviderModal(provider?: OIDCProvider) {
    if (provider) {
      setEditingProvider(provider);
      setProviderForm({
        name: provider.name,
        issuer_url: provider.issuer_url,
        client_id: provider.client_id,
        client_secret: '',
        scopes: provider.scopes,
        is_enabled: provider.is_enabled,
      });
    } else {
      setEditingProvider(null);
      setProviderForm(EMPTY_PROVIDER_FORM);
    }
    setProviderModalVisible(true);
  }

  const handleProviderSave = () => {
    if (!providerForm.name.trim() || !providerForm.issuer_url.trim() || !providerForm.client_id.trim()) {
      showToast('Name, issuer URL, and client ID are required.', 'error');
      return;
    }
    if (!editingProvider && !providerForm.client_secret.trim()) {
      showToast('Client secret is required for new providers.', 'error');
      return;
    }

    const payload: Partial<OIDCProviderCreate> = {
      name: providerForm.name.trim(),
      issuer_url: providerForm.issuer_url.trim(),
      client_id: providerForm.client_id.trim(),
      scopes: providerForm.scopes.trim() || 'openid email profile',
      is_enabled: providerForm.is_enabled,
    };

    if (providerForm.client_secret.trim()) {
      payload.client_secret = providerForm.client_secret;
    }

    if (editingProvider) {
      updateOIDCProviderMutation.mutate({ id: editingProvider.id, payload });
    } else {
      createOIDCProviderMutation.mutate(payload as OIDCProviderCreate);
    }
  };

  const handleSaveSMTP = () => {
    if (!smtpForm.smtp_host.trim() || !smtpForm.smtp_from_email.trim()) {
      showToast('SMTP host and from address are required.', 'error');
      return;
    }
    if (smtpForm.smtp_auth_enabled && !smtpForm.smtp_username?.trim()) {
      showToast('SMTP username is required when authentication is enabled.', 'error');
      return;
    }
    saveSMTPMutation.mutate({
      ...smtpForm,
      smtp_host: smtpForm.smtp_host.trim(),
      smtp_username: smtpForm.smtp_username?.trim(),
      smtp_from_email: smtpForm.smtp_from_email.trim(),
      smtp_from_name: smtpForm.smtp_from_name.trim() || 'BamBuddy',
    });
  };

  const handleSaveLDAP = () => {
    if (!ldapForm.ldap_server_url.trim()) {
      showToast('LDAP server URL is required.', 'error');
      return;
    }
    if (!ldapForm.ldap_search_base.trim()) {
      showToast('LDAP base DN is required.', 'error');
      return;
    }

    const payload: Record<string, unknown> = {
      ldap_server_url: ldapForm.ldap_server_url.trim(),
      ldap_bind_dn: ldapForm.ldap_bind_dn.trim(),
      ldap_search_base: ldapForm.ldap_search_base.trim(),
      ldap_user_filter: ldapForm.ldap_user_filter.trim(),
      ldap_security: ldapForm.ldap_security,
      ldap_group_mapping: ldapForm.ldap_group_mapping,
      ldap_auto_provision: ldapForm.ldap_auto_provision,
      ldap_default_group: ldapForm.ldap_default_group.trim(),
    };
    if (ldapForm.ldap_bind_password.trim()) {
      payload.ldap_bind_password = ldapForm.ldap_bind_password;
    }
    saveLDAPMutation.mutate(payload);
  };

  const currentUserRow = useMemo(
    () => (((usersQuery.data ?? []) as ApiRecord[]).find(row => pickNumber(row, ['id']) === user?.id) ?? null),
    [user?.id, usersQuery.data],
  );
  const securityRows = useMemo(
    () => [
      {
        label: 'HTTPS enabled',
        value: /^https:\/\//i.test(pickString(draft, ['external_url'])) ? 'Yes' : 'No',
      },
      {
        label: '2FA enforcement',
        value:
          pickBoolean(draft, ['two_fa_enforced', 'enforce_2fa'])
            ? 'Required'
            : twoFAStatusQuery.data?.totp_enabled || twoFAStatusQuery.data?.email_otp_enabled
              ? 'Enabled for this account'
              : 'Per-user only',
      },
      {
        label: 'Active sessions',
        value: pickString(currentUserRow, ['active_sessions', 'session_count'], 'Unavailable'),
      },
      {
        label: 'API keys',
        value: String(((apiKeysQuery.data ?? []) as ApiRecord[]).length),
      },
      {
        label: 'Last login',
        value: formatDateTime(pickString(currentUserRow, ['last_login'], '')),
      },
    ],
    [apiKeysQuery.data, currentUserRow, draft, twoFAStatusQuery.data?.email_otp_enabled, twoFAStatusQuery.data?.totp_enabled],
  );

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading security settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load security settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Users & security" subtitle="Authentication, SMTP, LDAP, OIDC, and 2FA for the current account.">
        <InlineTabBar
          value={userPanel}
          tabs={[
            { key: 'auth', label: 'Auth' },
            { key: 'email', label: 'SMTP' },
            { key: 'ldap', label: 'LDAP' },
            { key: 'oidc', label: 'OIDC' },
            { key: 'twofa', label: '2FA' },
          ]}
          onChange={value => setUserPanel(value as UserPanelKey)}
        />
        {!isAdmin && userPanel !== 'twofa' ? <Text style={[styles.helper, { color: colors.warning }]}>Admin rights are required to change shared authentication settings.</Text> : null}
      </SectionCard>

      {userPanel === 'auth' ? (
        <>
          <SectionCard title="Authentication" subtitle="Session policy, local login, and advanced auth status.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Advanced auth: {advancedAuthQuery.data?.advanced_auth_enabled ? 'enabled' : 'disabled'} • SMTP configured: {advancedAuthQuery.data?.smtp_configured ? 'yes' : 'no'}</Text>
            <SwitchRow
              label="Local login enabled"
              description="Allow username/password logins alongside SSO."
              value={pickBoolean(draft, ['local_login_enabled'], advancedAuthQuery.data?.local_login_enabled ?? true)}
              onValueChange={value => setDraft(current => ({ ...current, local_login_enabled: value }))}
              disabled={!canManageSecurity}
            />
            <TextField label="Session max hours" value={stringifyNumberField(draft.session_max_hours, '24')} onChangeText={value => setDraft(current => ({ ...current, session_max_hours: Number(value) || 24 }))} keyboardType="number-pad" editable={canManageSecurity} />
            <SwitchRow
              label="User email notifications"
              description="Enable email delivery for user-level events."
              value={pickBoolean(draft, ['user_notifications_enabled'], true)}
              onValueChange={value => setDraft(current => ({ ...current, user_notifications_enabled: value }))}
              disabled={!canManageSecurity}
            />
            <PrimaryButton label="Open user management" variant="secondary" onPress={() => navigation.navigate('Users')} />
          </SectionCard>
          <SectionCard title="Security status" subtitle="Current security posture and recent account activity.">
            {securityRows.map(row => (
              <View key={row.label} style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{row.value}</Text>
              </View>
            ))}
          </SectionCard>
          <PrimaryButton
            label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
            onPress={() => void saveSettingsMutation.mutateAsync()}
            loading={saveSettingsMutation.isPending}
            disabled={!canUpdateSettings || saveSettingsMutation.isPending}
          />
        </>
      ) : null}

      {userPanel === 'email' ? (
        <>
          <SectionCard title="Advanced authentication" subtitle="Email-driven password reset and invite flow.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Status: {advancedAuthQuery.data?.advanced_auth_enabled ? 'enabled' : 'disabled'}</Text>
            <PrimaryButton
              label={toggleAdvancedAuthMutation.isPending ? 'Updating…' : advancedAuthQuery.data?.advanced_auth_enabled ? 'Disable advanced auth' : 'Enable advanced auth'}
              variant={advancedAuthQuery.data?.advanced_auth_enabled ? 'danger' : 'primary'}
              onPress={() => void toggleAdvancedAuthMutation.mutateAsync(!(advancedAuthQuery.data?.advanced_auth_enabled ?? false))}
              disabled={!canManageSecurity || toggleAdvancedAuthMutation.isPending}
              loading={toggleAdvancedAuthMutation.isPending}
            />
          </SectionCard>
          <SectionCard title="SMTP configuration" subtitle="Server, port, TLS, credentials, and sender settings.">
            <SwitchRow
              label="SMTP authentication"
              description="Disable when your mail server does not require a username/password."
              value={smtpForm.smtp_auth_enabled}
              onValueChange={value => setSmtpForm(current => ({ ...current, smtp_auth_enabled: value, ...(value ? {} : { smtp_username: '', smtp_password: '' }) }))}
              disabled={!canManageSecurity}
            />
            <TextField label="SMTP host" value={smtpForm.smtp_host} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_host: value }))} autoCapitalize="none" editable={canManageSecurity} />
            <TextField label="SMTP port" value={String(smtpForm.smtp_port)} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_port: Number(value) || SMTP_PORT_BY_SECURITY[current.smtp_security] }))} keyboardType="number-pad" editable={canManageSecurity} />
            <OptionChipsField label="Security" value={smtpForm.smtp_security} options={SMTP_SECURITY_OPTIONS} onChange={value => setSmtpForm(current => ({ ...current, smtp_security: value as SmtpSecurity, smtp_port: SMTP_PORT_BY_SECURITY[value as SmtpSecurity] }))} disabled={!canManageSecurity} />
            <TextField label="Username" value={smtpForm.smtp_username ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_username: value }))} autoCapitalize="none" editable={canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label="Password" value={smtpForm.smtp_password ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_password: value }))} secureTextEntry editable={canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label="From address" value={smtpForm.smtp_from_email} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_email: value }))} keyboardType="email-address" autoCapitalize="none" editable={canManageSecurity} />
            <TextField label="From name" value={smtpForm.smtp_from_name} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_name: value }))} editable={canManageSecurity} />
            <View style={styles.actions}>
              <PrimaryButton label={saveSMTPMutation.isPending ? 'Saving…' : 'Save SMTP settings'} onPress={handleSaveSMTP} loading={saveSMTPMutation.isPending} disabled={!canManageSecurity || saveSMTPMutation.isPending} />
            </View>
          </SectionCard>
          <SectionCard title="Test email" subtitle="Send a test message with the current SMTP settings.">
            <TextField label="Recipient email" value={smtpTestEmail} onChangeText={setSmtpTestEmail} keyboardType="email-address" autoCapitalize="none" />
            <PrimaryButton label={testSMTPMutation.isPending ? 'Sending…' : 'Send test email'} variant="secondary" onPress={() => void testSMTPMutation.mutateAsync(smtpTestEmail.trim())} disabled={!smtpTestEmail.trim() || testSMTPMutation.isPending} loading={testSMTPMutation.isPending} />
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'ldap' ? (
        <>
          <SectionCard title="LDAP status" subtitle="Enable or disable directory authentication.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Configured: {ldapStatusQuery.data?.ldap_configured ? 'yes' : 'no'} • Enabled: {ldapStatusQuery.data?.ldap_enabled ? 'yes' : 'no'}</Text>
            <SwitchRow label="LDAP enabled" description="Turn on LDAP login once the server details below are valid." value={ldapStatusQuery.data?.ldap_enabled ?? false} onValueChange={value => void toggleLDAPMutation.mutateAsync(value)} disabled={!canManageSecurity || toggleLDAPMutation.isPending} />
          </SectionCard>
          <SectionCard title="LDAP server" subtitle="Connection, bind credentials, search base, and filters.">
            <TextField label="Server URL" value={ldapForm.ldap_server_url} onChangeText={value => setLdapForm(current => ({ ...current, ldap_server_url: value }))} autoCapitalize="none" editable={canManageSecurity} />
            <OptionChipsField label="Security" value={ldapForm.ldap_security} options={[{ key: 'starttls', label: 'STARTTLS' }, { key: 'ldaps', label: 'LDAPS' }]} onChange={value => setLdapForm(current => ({ ...current, ldap_security: value }))} disabled={!canManageSecurity} />
            <TextField label="Bind DN" value={ldapForm.ldap_bind_dn} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_dn: value }))} autoCapitalize="none" editable={canManageSecurity} />
            <TextField label="Bind password" value={ldapForm.ldap_bind_password} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_password: value }))} secureTextEntry editable={canManageSecurity} />
            <TextField label="Base DN" value={ldapForm.ldap_search_base} onChangeText={value => setLdapForm(current => ({ ...current, ldap_search_base: value }))} autoCapitalize="none" editable={canManageSecurity} />
            <TextField label="User filter" value={ldapForm.ldap_user_filter} onChangeText={value => setLdapForm(current => ({ ...current, ldap_user_filter: value }))} autoCapitalize="none" editable={canManageSecurity} />
            <TextField label="Group mapping (JSON)" value={ldapForm.ldap_group_mapping} onChangeText={value => setLdapForm(current => ({ ...current, ldap_group_mapping: value }))} multiline editable={canManageSecurity} />
            <TextField label="Default group" value={ldapForm.ldap_default_group} onChangeText={value => setLdapForm(current => ({ ...current, ldap_default_group: value }))} editable={canManageSecurity} />
            <SwitchRow label="Auto-provision users" description="Create a Bambuddy account on first successful LDAP login." value={ldapForm.ldap_auto_provision} onValueChange={value => setLdapForm(current => ({ ...current, ldap_auto_provision: value }))} disabled={!canManageSecurity} />
            <View style={styles.actions}>
              <PrimaryButton label={saveLDAPMutation.isPending ? 'Saving…' : 'Save LDAP settings'} onPress={handleSaveLDAP} loading={saveLDAPMutation.isPending} disabled={!canManageSecurity || saveLDAPMutation.isPending} />
              <PrimaryButton label={testLDAPMutation.isPending ? 'Testing…' : 'Test connection'} variant="secondary" onPress={() => void testLDAPMutation.mutateAsync()} loading={testLDAPMutation.isPending} disabled={!canManageSecurity || testLDAPMutation.isPending} />
            </View>
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'oidc' ? (
        <>
          <SectionCard title="OIDC providers" subtitle="Configured single sign-on providers and their client credentials.">
            <PrimaryButton label="Add provider" variant="secondary" onPress={() => openProviderModal()} disabled={!canManageSecurity} />
          </SectionCard>
          {(oidcProvidersQuery.data ?? []).length > 0 ? (
            (oidcProvidersQuery.data ?? []).map(provider => (
              <SectionCard key={provider.id} title={provider.name} subtitle={provider.issuer_url} right={<StatusBadge label={provider.is_enabled ? 'enabled' : 'disabled'} color={provider.is_enabled ? colors.success : colors.textTertiary} />}>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Client ID: {provider.client_id}</Text>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Scope: {provider.scopes}</Text>
                <SwitchRow label="Enabled" value={provider.is_enabled} onValueChange={value => void updateOIDCProviderMutation.mutateAsync({ id: provider.id, payload: { is_enabled: value } })} disabled={!canManageSecurity || updateOIDCProviderMutation.isPending} />
                <View style={styles.actions}>
                  <PrimaryButton label="Edit" variant="secondary" onPress={() => openProviderModal(provider)} disabled={!canManageSecurity} />
                  <PrimaryButton label="Delete" variant="danger" onPress={() => setProviderDeleteTarget(provider)} disabled={!canManageSecurity} />
                </View>
              </SectionCard>
            ))
          ) : (
            <EmptyState icon="🌐" title="No OIDC providers" message="Add an issuer to configure mobile-visible SSO settings." />
          )}
        </>
      ) : null}

      {userPanel === 'twofa' ? (
        <>
          <SectionCard title="2FA policy" subtitle="Per-account 2FA setup for the currently signed-in user.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>The current API exposes TOTP and email 2FA per user. A global enforcement toggle is not available in this server version.</Text>
          </SectionCard>
          <SectionCard title="Authenticator app (TOTP)" subtitle="Set up or disable authenticator-based codes.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Status: {twoFAStatusQuery.data?.totp_enabled ? 'enabled' : 'disabled'}</Text>
            {twoFAStatusQuery.data?.totp_enabled ? (
              <>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Backup codes remaining: {twoFAStatusQuery.data.backup_codes_remaining}</Text>
                <View style={styles.actions}>
                  <PrimaryButton label="Regenerate backup codes" variant="secondary" onPress={() => setShowTOTPRegen(true)} />
                  <PrimaryButton label="Disable TOTP" variant="danger" onPress={() => setShowTOTPDisable(true)} />
                </View>
              </>
            ) : (
              <PrimaryButton label="Set up TOTP" onPress={() => setShowTOTPSetup(true)} />
            )}
          </SectionCard>
          <SectionCard title="Email 2FA" subtitle="One-time codes sent to your account email.">
            <Text style={[styles.helper, { color: colors.textSecondary }]}>Email: {user?.email || 'No email on account'} • Status: {twoFAStatusQuery.data?.email_otp_enabled ? 'enabled' : 'disabled'}</Text>
            {emailSetupToken ? (
              <>
                <TextField label="Verification code" value={emailSetupCode} onChangeText={setEmailSetupCode} keyboardType="number-pad" />
                <View style={styles.actions}>
                  <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setEmailSetupToken(null); setEmailSetupCode(''); }} />
                  <PrimaryButton label={confirmEnableEmailOTPMutation.isPending ? 'Verifying…' : 'Verify and enable'} onPress={() => emailSetupToken && void confirmEnableEmailOTPMutation.mutateAsync({ token: emailSetupToken, code: emailSetupCode })} disabled={emailSetupCode.trim().length !== 6 || confirmEnableEmailOTPMutation.isPending} loading={confirmEnableEmailOTPMutation.isPending} />
                </View>
              </>
            ) : twoFAStatusQuery.data?.email_otp_enabled ? (
              <PrimaryButton label="Disable email 2FA" variant="danger" onPress={() => setShowDisableEmail2FA(true)} />
            ) : (
              <PrimaryButton label={enableEmailOTPRequestMutation.isPending ? 'Sending code…' : 'Enable email 2FA'} onPress={() => void enableEmailOTPRequestMutation.mutateAsync()} disabled={!user?.email || enableEmailOTPRequestMutation.isPending} loading={enableEmailOTPRequestMutation.isPending} />
            )}
          </SectionCard>
          {(oidcLinksQuery.data ?? []).length > 0 ? (
            <SectionCard title="Linked SSO accounts" subtitle="Accounts linked to your user for sign-in.">
              {(oidcLinksQuery.data ?? []).map(link => (
                <View key={link.id} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <View style={styles.itemHeader}>
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>{link.provider_name}</Text>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{link.provider_email || 'Linked account'}</Text>
                    </View>
                    <PrimaryButton label="Unlink" variant="danger" onPress={() => void unlinkOIDCLinkMutation.mutateAsync(link.provider_id)} loading={unlinkOIDCLinkMutation.isPending} disabled={unlinkOIDCLinkMutation.isPending} />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}
          {backupCodes.length > 0 ? (
            <SectionCard title="Backup codes" subtitle="Store these somewhere safe. They are shown only after setup or regeneration.">
              <View style={styles.codeGrid}>
                {backupCodes.map(code => (
                  <View key={code} style={[styles.codeCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                    <Text style={[styles.codeText, { color: colors.text }]}>{code}</Text>
                  </View>
                ))}
              </View>
              <PrimaryButton label="Copy backup codes" variant="secondary" onPress={() => { Clipboard.setString(backupCodes.join('\n')); showToast('Backup codes copied.', 'success'); }} />
            </SectionCard>
          ) : null}
        </>
      ) : null}

      <SimpleModal visible={providerModalVisible} title={editingProvider ? 'Edit OIDC provider' : 'Add OIDC provider'} subtitle="Provider name, issuer URL, client credentials, scope, and enabled state." onClose={closeProviderModal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={providerForm.name} onChangeText={value => setProviderForm(current => ({ ...current, name: value }))} />
          <TextField label="Issuer URL" value={providerForm.issuer_url} onChangeText={value => setProviderForm(current => ({ ...current, issuer_url: value }))} autoCapitalize="none" />
          <TextField label="Client ID" value={providerForm.client_id} onChangeText={value => setProviderForm(current => ({ ...current, client_id: value }))} autoCapitalize="none" />
          <TextField label="Client secret" value={providerForm.client_secret} onChangeText={value => setProviderForm(current => ({ ...current, client_secret: value }))} secureTextEntry placeholder={editingProvider ? 'Leave blank to keep current secret' : undefined} autoCapitalize="none" />
          <TextField label="Scope" value={providerForm.scopes} onChangeText={value => setProviderForm(current => ({ ...current, scopes: value }))} autoCapitalize="none" />
          <SwitchRow label="Enabled" value={providerForm.is_enabled} onValueChange={value => setProviderForm(current => ({ ...current, is_enabled: value }))} />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closeProviderModal} />
            <PrimaryButton
              label={editingProvider ? (updateOIDCProviderMutation.isPending ? 'Saving…' : 'Save provider') : (createOIDCProviderMutation.isPending ? 'Creating…' : 'Create provider')}
              onPress={handleProviderSave}
              loading={createOIDCProviderMutation.isPending || updateOIDCProviderMutation.isPending}
              disabled={createOIDCProviderMutation.isPending || updateOIDCProviderMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={showTOTPSetup} title="Set up TOTP" subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app." onClose={() => { setShowTOTPSetup(false); queryClient.removeQueries({ queryKey: ['totp-setup'] }); setTotpCode(''); }}>
        <View style={styles.modalBody}>
          {totpSetupQuery.isLoading ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : totpSetupQuery.data ? (
            <>
              <Image source={{ uri: `data:image/png;base64,${totpSetupQuery.data.qr_code_b64}` }} style={styles.qrImage} />
              <Text style={[styles.helper, { color: colors.textSecondary }]}>Secret: {totpSetupQuery.data.secret}</Text>
              <PrimaryButton label="Copy secret" variant="secondary" onPress={() => { Clipboard.setString(totpSetupQuery.data.secret); showToast('TOTP secret copied.', 'success'); }} />
              <TextField label="Verification code" value={totpCode} onChangeText={setTotpCode} keyboardType="number-pad" />
              <PrimaryButton label={enableTOTPMutation.isPending ? 'Enabling…' : 'Enable TOTP'} onPress={() => void enableTOTPMutation.mutateAsync(totpCode)} disabled={totpCode.trim().length !== 6 || enableTOTPMutation.isPending} loading={enableTOTPMutation.isPending} />
            </>
          ) : (
            <Text style={[styles.helper, { color: colors.error }]}>Unable to load a TOTP setup challenge.</Text>
          )}
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPDisable} title="Disable TOTP" subtitle="Enter a current authenticator or backup code to confirm." onClose={() => { setShowTOTPDisable(false); setTotpDisableCode(''); }}>
        <View style={styles.modalBody}>
          <TextField label="Code" value={totpDisableCode} onChangeText={setTotpDisableCode} autoCapitalize="characters" />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setShowTOTPDisable(false); setTotpDisableCode(''); }} />
            <PrimaryButton label={disableTOTPMutation.isPending ? 'Disabling…' : 'Disable TOTP'} variant="danger" onPress={() => void disableTOTPMutation.mutateAsync(totpDisableCode)} disabled={totpDisableCode.trim().length < 6 || disableTOTPMutation.isPending} loading={disableTOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPRegen} title="Regenerate backup codes" subtitle="Enter a current authenticator or backup code to continue." onClose={() => { setShowTOTPRegen(false); setTotpRegenCode(''); }}>
        <View style={styles.modalBody}>
          <TextField label="Code" value={totpRegenCode} onChangeText={setTotpRegenCode} autoCapitalize="characters" />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setShowTOTPRegen(false); setTotpRegenCode(''); }} />
            <PrimaryButton label={regenerateBackupCodesMutation.isPending ? 'Generating…' : 'Generate codes'} onPress={() => void regenerateBackupCodesMutation.mutateAsync(totpRegenCode)} disabled={totpRegenCode.trim().length < 6 || regenerateBackupCodesMutation.isPending} loading={regenerateBackupCodesMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showDisableEmail2FA} title="Disable email 2FA" subtitle="Enter your account password to remove email-based one-time codes." onClose={() => { setShowDisableEmail2FA(false); setEmailDisablePassword(''); }}>
        <View style={styles.modalBody}>
          <TextField label="Password" value={emailDisablePassword} onChangeText={setEmailDisablePassword} secureTextEntry />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setShowDisableEmail2FA(false); setEmailDisablePassword(''); }} />
            <PrimaryButton label={disableEmailOTPMutation.isPending ? 'Disabling…' : 'Disable email 2FA'} variant="danger" onPress={() => void disableEmailOTPMutation.mutateAsync(emailDisablePassword)} disabled={!emailDisablePassword.trim() || disableEmailOTPMutation.isPending} loading={disableEmailOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <ConfirmModal
        visible={providerDeleteTarget !== null}
        title="Delete OIDC provider"
        message={providerDeleteTarget ? `Delete ${providerDeleteTarget.name}?` : 'Delete this provider?'}
        confirmLabel="Delete"
        onClose={() => setProviderDeleteTarget(null)}
        onConfirm={() => providerDeleteTarget && void deleteOIDCProviderMutation.mutateAsync(providerDeleteTarget.id)}
        loading={deleteOIDCProviderMutation.isPending}
      />
    </>
  );
}
