import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
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
  SmartPlug,
  SmartPlugCreate,
  SmartPlugStatus,
  SmartPlugUpdate,
  TOTPSetupResponse,
  TwoFAStatus,
} from '@/types/api';
import { formatDateTime, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';
import {
  DEFAULT_LDAP_FORM,
  DEFAULT_SMTP_SETTINGS,
  EMPTY_CAMERA_TOKEN_FORM,
  EMPTY_EXTERNAL_LINK_FORM,
  EMPTY_GITHUB_BACKUP_FORM,
  EMPTY_PROVIDER_FORM,
  EMPTY_SMART_PLUG_FORM,
  EMPTY_VIRTUAL_PRINTER_FORM,
  SMTP_PORT_BY_SECURITY,
} from './constants';
import type {
  CameraTokenFormState,
  ExternalLinkFormState,
  GitHubBackupFormState,
  LDAPFormState,
  ProviderFormState,
  SectionKey,
  SmartPlugFormState,
  UserPanelKey,
  VirtualPrinterFormState,
} from './types';

export function useSettingsScreenController() {
  const { colors, mode, setMode } = useTheme();
  const { isAdmin, authEnabled, user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SectionKey | null>(null);
  const [userPanel, setUserPanel] = useState<UserPanelKey>('auth');
  const [draft, setDraft] = useState<ApiRecord>({});
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');
  const [cameraTokenForm, setCameraTokenForm] = useState<CameraTokenFormState>(EMPTY_CAMERA_TOKEN_FORM);
  const [createdCameraToken, setCreatedCameraToken] = useState('');
  const [cameraTokenInfoVisible, setCameraTokenInfoVisible] = useState(false);
  const [editingExternalLink, setEditingExternalLink] = useState<ApiRecord | null>(null);
  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [externalLinkForm, setExternalLinkForm] = useState<ExternalLinkFormState>(EMPTY_EXTERNAL_LINK_FORM);
  const [pendingDeleteExternalLink, setPendingDeleteExternalLink] = useState<ApiRecord | null>(null);
  const [virtualPrinterModalVisible, setVirtualPrinterModalVisible] = useState(false);
  const [editingVirtualPrinter, setEditingVirtualPrinter] = useState<ApiRecord | null>(null);
  const [virtualPrinterForm, setVirtualPrinterForm] = useState<VirtualPrinterFormState>(EMPTY_VIRTUAL_PRINTER_FORM);
  const [pendingDeleteVirtualPrinter, setPendingDeleteVirtualPrinter] = useState<ApiRecord | null>(null);
  const [githubBackupForm, setGithubBackupForm] = useState<GitHubBackupFormState>(EMPTY_GITHUB_BACKUP_FORM);
  const [smtpForm, setSmtpForm] = useState<SMTPSettings>(DEFAULT_SMTP_SETTINGS);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [ldapForm, setLdapForm] = useState<LDAPFormState>(DEFAULT_LDAP_FORM);
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<OIDCProvider | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);
  const [providerDeleteTarget, setProviderDeleteTarget] = useState<OIDCProvider | null>(null);
  const [plugModalVisible, setPlugModalVisible] = useState(false);
  const [editingPlug, setEditingPlug] = useState<SmartPlug | null>(null);
  const [plugForm, setPlugForm] = useState<SmartPlugFormState>(EMPTY_SMART_PLUG_FORM);
  const [plugDeleteTarget, setPlugDeleteTarget] = useState<SmartPlug | null>(null);
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

  const canUpdateSettings = !authEnabled || hasPermission('settings:update');
  const canManageSmartPlugs = !authEnabled || hasPermission('smart_plugs:create') || hasPermission('smart_plugs:update');
  const canDeleteSmartPlugs = !authEnabled || hasPermission('smart_plugs:delete');
  const canControlSmartPlugs = !authEnabled || hasPermission('smart_plugs:control');
  const canManageSecurity = !authEnabled || isAdmin || hasPermission('settings:update');

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const smartPlugsQuery = useQuery({ queryKey: ['smartPlugs'], queryFn: api.getSmartPlugs });
  const providersQuery = useQuery({ queryKey: ['notificationProviders'], queryFn: api.getNotificationProviders });
  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: api.getApiKeys });
  const cameraTokensQuery = useQuery({
    queryKey: ['cameraTokens'],
    queryFn: () => (isAdmin ? api.listAllLongLivedCameraTokens() : api.listMyLongLivedCameraTokens()),
  });
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks });
  const virtualPrinterListQuery = useQuery({ queryKey: ['virtualPrinterList'], queryFn: api.getVirtualPrinterList });
  const spoolbuddyQuery = useQuery({ queryKey: ['spoolbuddyDevices'], queryFn: api.getSpoolBuddyDevices });
  const spoolmanStatusQuery = useQuery({ queryKey: ['spoolmanStatus'], queryFn: api.getSpoolmanStatus });
  const obicoQuery = useQuery({ queryKey: ['obicoStatus'], queryFn: api.getObicoStatus });
  const advancedAuthQuery = useQuery<AdvancedAuthStatus>({ queryKey: ['advancedAuthStatus'], queryFn: api.getAdvancedAuthStatus });
  const ldapStatusQuery = useQuery<LDAPStatus>({ queryKey: ['ldapStatus'], queryFn: api.getLDAPStatus });
  const githubBackupQuery = useQuery({ queryKey: ['githubBackupStatus'], queryFn: api.getGitHubBackupStatus });
  const githubBackupConfigQuery = useQuery({
    queryKey: ['githubBackupConfig'],
    queryFn: api.getGitHubBackupConfig,
    enabled: section === 'backup',
  });
  const localBackupStatusQuery = useQuery({ queryKey: ['localBackupStatus'], queryFn: api.getLocalBackupStatus });
  const localBackupsQuery = useQuery({ queryKey: ['localBackups'], queryFn: api.getLocalBackups });
  const usersQuery = useQuery({
    queryKey: ['users', 'settings-security'],
    queryFn: api.getUsers,
    enabled: section === 'users' && isAdmin,
  });
  const smtpSettingsQuery = useQuery<SMTPSettings | null>({
    queryKey: ['smtpSettings'],
    queryFn: api.getSMTPSettings,
    enabled: section === 'users',
  });
  const oidcProvidersQuery = useQuery<OIDCProvider[]>({
    queryKey: ['oidcProvidersAll'],
    queryFn: api.getOIDCProvidersAll,
    enabled: section === 'users',
  });
  const twoFAStatusQuery = useQuery<TwoFAStatus>({
    queryKey: ['2fa-status'],
    queryFn: api.get2FAStatus,
    enabled: section === 'users',
  });
  const oidcLinksQuery = useQuery<OIDCLink[]>({
    queryKey: ['oidc-links'],
    queryFn: api.getOIDCLinks,
    enabled: section === 'users',
  });
  const totpSetupQuery = useQuery<TOTPSetupResponse>({
    queryKey: ['totp-setup'],
    queryFn: api.setupTOTP,
    enabled: showTOTPSetup,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data);
      setLdapForm({
        ldap_server_url: pickString(settingsQuery.data, ['ldap_server_url']),
        ldap_bind_dn: pickString(settingsQuery.data, ['ldap_bind_dn']),
        ldap_bind_password: '',
        ldap_search_base: pickString(settingsQuery.data, ['ldap_search_base']),
        ldap_user_filter: pickString(settingsQuery.data, ['ldap_user_filter'], '(sAMAccountName={username})'),
        ldap_security: pickString(settingsQuery.data, ['ldap_security'], 'starttls'),
        ldap_group_mapping: pickString(settingsQuery.data, ['ldap_group_mapping']),
        ldap_auto_provision: pickBoolean(settingsQuery.data, ['ldap_auto_provision']),
        ldap_default_group: pickString(settingsQuery.data, ['ldap_default_group']),
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

  useEffect(() => {
    const config = githubBackupConfigQuery.data;
    if (!config) {
      setGithubBackupForm(EMPTY_GITHUB_BACKUP_FORM);
      return;
    }
    setGithubBackupForm({
      repository_url: pickString(config, ['repository_url']),
      access_token: '',
      branch: pickString(config, ['branch'], 'main'),
      provider: pickString(config, ['provider'], 'github') as GitHubBackupFormState['provider'],
      enabled: pickBoolean(config, ['enabled'], true),
      schedule_enabled: pickBoolean(config, ['schedule_enabled']),
      schedule_type: pickString(config, ['schedule_type'], 'daily') as GitHubBackupFormState['schedule_type'],
      schedule_time: pickString(config, ['schedule_time'], '02:00'),
      allow_insecure_http: pickBoolean(config, ['allow_insecure_http']),
      backup_settings: pickBoolean(config, ['backup_settings']),
      backup_spools: pickBoolean(config, ['backup_spools']),
      backup_archives: pickBoolean(config, ['backup_archives']),
      backup_kprofiles: pickBoolean(config, ['backup_kprofiles'], true),
      backup_cloud_profiles: pickBoolean(config, ['backup_cloud_profiles'], true),
    });
  }, [githubBackupConfigQuery.data]);

  const refreshAll = async () => {
    await Promise.all([
      settingsQuery.refetch(),
      smartPlugsQuery.refetch(),
      providersQuery.refetch(),
      apiKeysQuery.refetch(),
      cameraTokensQuery.refetch(),
      externalLinksQuery.refetch(),
      virtualPrinterListQuery.refetch(),
      spoolbuddyQuery.refetch(),
      spoolmanStatusQuery.refetch(),
      obicoQuery.refetch(),
      advancedAuthQuery.refetch(),
      ldapStatusQuery.refetch(),
      githubBackupQuery.refetch(),
      githubBackupConfigQuery.refetch(),
      localBackupStatusQuery.refetch(),
      localBackupsQuery.refetch(),
      usersQuery.refetch(),
      smtpSettingsQuery.refetch(),
      oidcProvidersQuery.refetch(),
      twoFAStatusQuery.refetch(),
      oidcLinksQuery.refetch(),
    ]);
  };

  const saveSettingsMutation = useMutation({
    mutationFn: async () => api.updateSettings(draft),
    onSuccess: async data => {
      setDraft(data);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save settings.', 'error'),
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => api.createApiKey({ name: newApiKeyName.trim() }),
    onSuccess: async data => {
      setCreatedApiKey(pickString(data, ['key'], ''));
      setNewApiKeyName('');
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create API key.', 'error'),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: number) => api.deleteApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key deleted.', 'success');
    },
  });

  const createCameraTokenMutation = useMutation({
    mutationFn: async () =>
      api.createLongLivedCameraToken({
        name: cameraTokenForm.name.trim(),
        expires_in_days: Math.max(1, Math.min(365, Number(cameraTokenForm.expiresInDays) || 90)),
      }),
    onSuccess: async data => {
      setCreatedCameraToken(pickString(data, ['token']));
      setCameraTokenInfoVisible(true);
      setCameraTokenForm(EMPTY_CAMERA_TOKEN_FORM);
      await queryClient.invalidateQueries({ queryKey: ['cameraTokens'] });
      showToast('Camera token created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create camera token.', 'error'),
  });

  const revokeCameraTokenMutation = useMutation({
    mutationFn: async (id: number) => api.revokeLongLivedCameraToken(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cameraTokens'] });
      showToast('Camera token revoked.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to revoke camera token.', 'error'),
  });

  const createExternalLinkMutation = useMutation({
    mutationFn: async (payload: ExternalLinkFormState) => api.createExternalLink(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setExternalLinkModalVisible(false);
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
      showToast('External link saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save external link.', 'error'),
  });

  const updateExternalLinkMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ExternalLinkFormState }) => api.updateExternalLink(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setExternalLinkModalVisible(false);
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
      showToast('External link updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update external link.', 'error'),
  });

  const deleteExternalLinkMutation = useMutation({
    mutationFn: async (id: number) => api.deleteExternalLink(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setPendingDeleteExternalLink(null);
      showToast('External link removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete external link.', 'error'),
  });

  const backupMutation = useMutation({
    mutationFn: async () => api.triggerLocalBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['localBackupStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['localBackups'] });
      showToast('Local backup started.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to start backup.', 'error'),
  });

  const exportBackupMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.exportBackup();
      await shareBlob(blob, 'bambuddy-backup.zip');
    },
    onSuccess: () => showToast('Backup ready to share.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export backup.', 'error'),
  });

  const githubBackupMutation = useMutation({
    mutationFn: async () => api.triggerGitHubBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup triggered.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to run GitHub backup.', 'error'),
  });

  const saveGitHubBackupMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        repository_url: githubBackupForm.repository_url.trim(),
        branch: githubBackupForm.branch.trim() || 'main',
        provider: githubBackupForm.provider,
        enabled: githubBackupForm.enabled,
        schedule_enabled: githubBackupForm.schedule_enabled,
        schedule_type: githubBackupForm.schedule_type,
        allow_insecure_http: githubBackupForm.allow_insecure_http,
        backup_settings: githubBackupForm.backup_settings,
        backup_spools: githubBackupForm.backup_spools,
        backup_archives: githubBackupForm.backup_archives,
        backup_kprofiles: githubBackupForm.backup_kprofiles,
        backup_cloud_profiles: githubBackupForm.backup_cloud_profiles,
      };
      if (githubBackupForm.access_token.trim()) {
        payload.access_token = githubBackupForm.access_token.trim();
      }
      return githubBackupConfigQuery.data
        ? api.updateGitHubBackupConfig(payload)
        : api.saveGitHubBackupConfig(payload);
    },
    onSuccess: async () => {
      setGithubBackupForm(current => ({ ...current, access_token: '' }));
      await queryClient.invalidateQueries({ queryKey: ['githubBackupConfig'] });
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save GitHub backup settings.', 'error'),
  });

  const virtualPrinterControl = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      (action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update virtual printer.', 'error'),
  });

  const saveVirtualPrinterMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: virtualPrinterForm.name.trim() || 'Bambuddy',
        model: virtualPrinterForm.model.trim() || undefined,
        enabled: virtualPrinterForm.enabled,
      };
      if (virtualPrinterForm.serial.trim()) {
        payload.access_code = virtualPrinterForm.serial.trim();
      }
      return editingVirtualPrinter
        ? api.updateVirtualPrinter(pickNumber(editingVirtualPrinter, ['id']), payload)
        : api.createVirtualPrinter(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setVirtualPrinterModalVisible(false);
      setEditingVirtualPrinter(null);
      setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
      showToast('Virtual printer saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save virtual printer.', 'error'),
  });

  const deleteVirtualPrinterMutation = useMutation({
    mutationFn: async (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setPendingDeleteVirtualPrinter(null);
      showToast('Virtual printer deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete virtual printer.', 'error'),
  });

  const calibrateSpoolbuddyMutation = useMutation({
    mutationFn: async (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
      showToast('Calibration command sent.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to calibrate device.', 'error'),
  });

  const saveSMTPMutation = useMutation({
    mutationFn: async (data: SMTPSettings) => api.saveSMTPSettings(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast('SMTP settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save SMTP settings.', 'error'),
  });

  const testSMTPMutation = useMutation({
    mutationFn: async (recipient: string) => api.testSMTP({ test_recipient: recipient }),
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || 'SMTP test failed.', 'error'),
  });

  const toggleAdvancedAuthMutation = useMutation({
    mutationFn: async (enabled: boolean) => (enabled ? api.enableAdvancedAuth() : api.disableAdvancedAuth()),
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast(data.message || 'Authentication updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update authentication.', 'error'),
  });

  const saveLDAPMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.updateSettings(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast('LDAP settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save LDAP settings.', 'error'),
  });

  const toggleLDAPMutation = useMutation({
    mutationFn: async (enabled: boolean) => api.updateSettings({ ldap_enabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast('LDAP setting updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update LDAP status.', 'error'),
  });

  const testLDAPMutation = useMutation({
    mutationFn: async () => api.testLDAP(),
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || 'LDAP test failed.', 'error'),
  });

  const testSpoolmanMutation = useMutation({
    mutationFn: async () => api.connectSpoolman(),
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] });
      showToast(pickString(data, ['message'], 'Spoolman connected.'), 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to connect to Spoolman.', 'error'),
  });

  const testObicoMutation = useMutation({
    mutationFn: async (url: string) => api.testObicoConnection(url),
    onSuccess: result => {
      const ok = pickBoolean(result, ['ok', 'success']);
      showToast(
        ok
          ? pickString(result, ['message'], 'Failure detection service is reachable.')
          : pickString(result, ['error', 'message'], 'Failure detection test failed.'),
        ok ? 'success' : 'error',
      );
    },
    onError: (error: Error) => showToast(error.message || 'Unable to test failure detection.', 'error'),
  });

  const createOIDCProviderMutation = useMutation({
    mutationFn: async (payload: OIDCProviderCreate) => api.createOIDCProvider(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast('OIDC provider created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create OIDC provider.', 'error'),
  });

  const updateOIDCProviderMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<OIDCProviderCreate> }) => api.updateOIDCProvider(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast('OIDC provider updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update OIDC provider.', 'error'),
  });

  const deleteOIDCProviderMutation = useMutation({
    mutationFn: async (id: number) => api.deleteOIDCProvider(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      setProviderDeleteTarget(null);
      showToast('OIDC provider deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete OIDC provider.', 'error'),
  });

  const createSmartPlugMutation = useMutation({
    mutationFn: async (payload: SmartPlugCreate) => api.createSmartPlug(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save smart plug.', 'error'),
  });

  const updateSmartPlugMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: SmartPlugUpdate }) => api.updateSmartPlug(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update smart plug.', 'error'),
  });

  const deleteSmartPlugMutation = useMutation({
    mutationFn: async (id: number) => api.deleteSmartPlug(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      setPlugDeleteTarget(null);
      showToast('Smart plug deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete smart plug.', 'error'),
  });

  const enableTOTPMutation = useMutation({
    mutationFn: async (code: string) => api.enableTOTP(code),
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
    mutationFn: async (code: string) => api.disableTOTP(code),
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
    mutationFn: async (code: string) => api.regenerateBackupCodes(code),
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
    mutationFn: async () => api.enableEmailOTP(),
    onSuccess: data => {
      setEmailSetupToken(data.setup_token);
      setEmailSetupCode('');
      showToast(data.message || 'Verification code sent.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to start email 2FA setup.', 'error'),
  });

  const confirmEnableEmailOTPMutation = useMutation({
    mutationFn: async ({ token, code }: { token: string; code: string }) => api.confirmEnableEmailOTP(token, code),
    onSuccess: async data => {
      setEmailSetupToken(null);
      setEmailSetupCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Email 2FA enabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to enable email 2FA.', 'error'),
  });

  const disableEmailOTPMutation = useMutation({
    mutationFn: async (password: string) => api.disableEmailOTP(password),
    onSuccess: async data => {
      setShowDisableEmail2FA(false);
      setEmailDisablePassword('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || 'Email 2FA disabled.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to disable email 2FA.', 'error'),
  });

  const unlinkOIDCLinkMutation = useMutation({
    mutationFn: async (providerId: number) => api.deleteOIDCLink(providerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidc-links'] });
      showToast('Linked account removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove linked account.', 'error'),
  });

  const sectionSummaries = useMemo(
    () => ({
      settings: settingsQuery.data,
      smartPlugs: smartPlugsQuery.data,
      notificationProviders: providersQuery.data as ApiRecord[] | undefined,
      apiKeys: apiKeysQuery.data as ApiRecord[] | undefined,
      cameraTokens: cameraTokensQuery.data as ApiRecord[] | undefined,
      virtualPrinters: Array.isArray(virtualPrinterListQuery.data?.printers) ? (virtualPrinterListQuery.data.printers as ApiRecord[]) : [],
      spoolbuddyDevices: spoolbuddyQuery.data as ApiRecord[] | undefined,
      obicoStatus: obicoQuery.data,
      advancedAuthStatus: advancedAuthQuery.data,
      githubBackupStatus: githubBackupQuery.data,
    }),
    [
      advancedAuthQuery.data,
      apiKeysQuery.data,
      cameraTokensQuery.data,
      githubBackupQuery.data,
      obicoQuery.data,
      providersQuery.data,
      settingsQuery.data,
      smartPlugsQuery.data,
      spoolbuddyQuery.data,
      virtualPrinterListQuery.data,
    ],
  );

  const isDirtySection =
    section === 'general' ||
    section === 'queue' ||
    section === 'filament' ||
    section === 'network' ||
    section === 'failure-detection' ||
    section === 'backup' ||
    (section === 'users' && userPanel === 'auth');

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

  function closePlugModal() {
    setPlugModalVisible(false);
    setEditingPlug(null);
    setPlugForm(EMPTY_SMART_PLUG_FORM);
  }

  function openPlugModal(plug?: SmartPlug) {
    if (plug) {
      setEditingPlug(plug);
      setPlugForm({
        name: plug.name,
        plug_type: plug.plug_type,
        ip_address: plug.ip_address ?? '',
        username: plug.username ?? '',
        password: '',
        ha_entity_id: plug.ha_entity_id ?? '',
        mqtt_power_topic: plug.mqtt_power_topic ?? plug.mqtt_topic ?? '',
        mqtt_state_topic: plug.mqtt_state_topic ?? '',
        rest_on_url: plug.rest_on_url ?? '',
        rest_off_url: plug.rest_off_url ?? '',
        enabled: plug.enabled,
      });
    } else {
      setEditingPlug(null);
      setPlugForm(EMPTY_SMART_PLUG_FORM);
    }
    setPlugModalVisible(true);
  }

  function closeExternalLinkModal() {
    setExternalLinkModalVisible(false);
    setEditingExternalLink(null);
    setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
  }

  function openExternalLinkModal(link?: ApiRecord) {
    if (link) {
      setEditingExternalLink(link);
      setExternalLinkForm({
        name: pickString(link, ['name']),
        url: pickString(link, ['url']),
        icon: pickString(link, ['icon'], 'link'),
        open_in_new_tab: pickBoolean(link, ['open_in_new_tab'], true),
        sort_order: String(pickNumber(link, ['sort_order'], 0)),
      });
    } else {
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
    }
    setExternalLinkModalVisible(true);
  }

  function closeVirtualPrinterModal() {
    setVirtualPrinterModalVisible(false);
    setEditingVirtualPrinter(null);
    setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
  }

  function openVirtualPrinterModal(printer?: ApiRecord) {
    if (printer) {
      setEditingVirtualPrinter(printer);
      setVirtualPrinterForm({
        name: pickString(printer, ['name'], 'Bambuddy'),
        model: pickString(printer, ['model'], 'BL-P001'),
        model_name: pickString(printer, ['model', 'model_name'], 'BL-P001'),
        serial: pickString(printer, ['serial'], ''),
        serial_number: pickString(printer, ['serial', 'serial_number'], ''),
        enabled: pickBoolean(printer, ['enabled', 'status.running']),
      });
    } else {
      setEditingVirtualPrinter(null);
      setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
    }
    setVirtualPrinterModalVisible(true);
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
      return;
    }
    createOIDCProviderMutation.mutate(payload as OIDCProviderCreate);
  };

  const handlePlugSave = () => {
    if (!plugForm.name.trim()) {
      showToast('Plug name is required.', 'error');
      return;
    }
    if (plugForm.plug_type === 'tasmota' && !plugForm.ip_address.trim()) {
      showToast('IP address is required for Tasmota plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'homeassistant' && !plugForm.ha_entity_id.trim()) {
      showToast('Entity ID is required for Home Assistant plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'mqtt' && !plugForm.mqtt_power_topic.trim()) {
      showToast('MQTT power topic is required for MQTT plugs.', 'error');
      return;
    }
    if (plugForm.plug_type === 'rest' && (!plugForm.rest_on_url.trim() || !plugForm.rest_off_url.trim())) {
      showToast('REST plugs need both on and off URLs.', 'error');
      return;
    }

    const payload: SmartPlugCreate = {
      name: plugForm.name.trim(),
      plug_type: plugForm.plug_type,
      enabled: plugForm.enabled,
      ip_address: plugForm.plug_type === 'tasmota' ? plugForm.ip_address.trim() || null : null,
      username: plugForm.plug_type === 'tasmota' ? plugForm.username.trim() || null : null,
      ha_entity_id: plugForm.plug_type === 'homeassistant' ? plugForm.ha_entity_id.trim() || null : null,
      mqtt_power_topic: plugForm.plug_type === 'mqtt' ? plugForm.mqtt_power_topic.trim() || null : null,
      mqtt_state_topic: plugForm.plug_type === 'mqtt' ? plugForm.mqtt_state_topic.trim() || null : null,
      rest_on_url: plugForm.plug_type === 'rest' ? plugForm.rest_on_url.trim() || null : null,
      rest_off_url: plugForm.plug_type === 'rest' ? plugForm.rest_off_url.trim() || null : null,
    };

    if (plugForm.password.trim()) {
      payload.password = plugForm.password;
    }

    if (editingPlug) {
      updateSmartPlugMutation.mutate({ id: editingPlug.id, payload });
      return;
    }
    createSmartPlugMutation.mutate(payload);
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

  const handleSaveExternalLink = () => {
    if (!externalLinkForm.name.trim() || !externalLinkForm.url.trim()) {
      showToast('Name and URL are required.', 'error');
      return;
    }
    if (editingExternalLink) {
      updateExternalLinkMutation.mutate({
        id: pickNumber(editingExternalLink, ['id']),
        payload: externalLinkForm,
      });
      return;
    }
    createExternalLinkMutation.mutate(externalLinkForm);
  };

  const handleSaveVirtualPrinter = () => {
    if (!virtualPrinterForm.name.trim()) {
      showToast('Virtual printer name is required.', 'error');
      return;
    }
    saveVirtualPrinterMutation.mutate();
  };

  const handleSaveGitHubBackup = () => {
    if (!githubBackupForm.repository_url.trim()) {
      showToast('Repository URL is required.', 'error');
      return;
    }
    if (!githubBackupConfigQuery.data && !githubBackupForm.access_token.trim()) {
      showToast('Access token is required for the first save.', 'error');
      return;
    }
    saveGitHubBackupMutation.mutate();
  };

  const advancedAuth = advancedAuthQuery.data;
  const ldapStatus = ldapStatusQuery.data;
  const twoFAStatus = twoFAStatusQuery.data;
  const virtualPrinterItems = useMemo(
    () => (Array.isArray(virtualPrinterListQuery.data?.printers) ? (virtualPrinterListQuery.data.printers as ApiRecord[]) : []),
    [virtualPrinterListQuery.data],
  );
  const virtualPrinterModels = useMemo(() => {
    const source = (virtualPrinterListQuery.data?.models ?? {}) as Record<string, unknown>;
    return Object.entries(source).map(([key, value]) => ({ key, label: String(value) }));
  }, [virtualPrinterListQuery.data]);
  const currentUserRow = useMemo(
    () => ((usersQuery.data ?? []) as ApiRecord[]).find(row => pickNumber(row, ['id']) === user?.id) ?? null,
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
            : twoFAStatus?.totp_enabled || twoFAStatus?.email_otp_enabled
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
    [apiKeysQuery.data, currentUserRow, draft, twoFAStatus?.email_otp_enabled, twoFAStatus?.totp_enabled],
  );

  return {
    colors,
    mode,
    setMode,
    isAdmin,
    authEnabled,
    user,
    state: {
      section,
      userPanel,
      draft,
      newApiKeyName,
      createdApiKey,
      cameraTokenForm,
      createdCameraToken,
      cameraTokenInfoVisible,
      editingExternalLink,
      externalLinkModalVisible,
      externalLinkForm,
      pendingDeleteExternalLink,
      virtualPrinterModalVisible,
      editingVirtualPrinter,
      virtualPrinterForm,
      pendingDeleteVirtualPrinter,
      githubBackupForm,
      smtpForm,
      smtpTestEmail,
      ldapForm,
      providerModalVisible,
      editingProvider,
      providerForm,
      providerDeleteTarget,
      plugModalVisible,
      editingPlug,
      plugForm,
      plugDeleteTarget,
      showTOTPSetup,
      totpCode,
      totpDisableCode,
      totpRegenCode,
      showTOTPDisable,
      showTOTPRegen,
      backupCodes,
      emailSetupToken,
      emailSetupCode,
      showDisableEmail2FA,
      emailDisablePassword,
    },
    permissions: {
      canUpdateSettings,
      canManageSmartPlugs,
      canDeleteSmartPlugs,
      canControlSmartPlugs,
      canManageSecurity,
    },
    queries: {
      settingsQuery,
      smartPlugsQuery,
      providersQuery,
      apiKeysQuery,
      cameraTokensQuery,
      externalLinksQuery,
      virtualPrinterListQuery,
      spoolbuddyQuery,
      spoolmanStatusQuery,
      obicoQuery,
      advancedAuthQuery,
      ldapStatusQuery,
      githubBackupQuery,
      githubBackupConfigQuery,
      localBackupStatusQuery,
      localBackupsQuery,
      usersQuery,
      smtpSettingsQuery,
      oidcProvidersQuery,
      twoFAStatusQuery,
      oidcLinksQuery,
      totpSetupQuery,
    },
    mutations: {
      saveSettingsMutation,
      createApiKeyMutation,
      deleteApiKeyMutation,
      createCameraTokenMutation,
      revokeCameraTokenMutation,
      createExternalLinkMutation,
      updateExternalLinkMutation,
      deleteExternalLinkMutation,
      backupMutation,
      exportBackupMutation,
      githubBackupMutation,
      saveGitHubBackupMutation,
      virtualPrinterControl,
      saveVirtualPrinterMutation,
      deleteVirtualPrinterMutation,
      calibrateSpoolbuddyMutation,
      saveSMTPMutation,
      testSMTPMutation,
      toggleAdvancedAuthMutation,
      saveLDAPMutation,
      toggleLDAPMutation,
      testLDAPMutation,
      testSpoolmanMutation,
      testObicoMutation,
      createOIDCProviderMutation,
      updateOIDCProviderMutation,
      deleteOIDCProviderMutation,
      createSmartPlugMutation,
      updateSmartPlugMutation,
      deleteSmartPlugMutation,
      enableTOTPMutation,
      disableTOTPMutation,
      regenerateBackupCodesMutation,
      enableEmailOTPRequestMutation,
      confirmEnableEmailOTPMutation,
      disableEmailOTPMutation,
      unlinkOIDCLinkMutation,
    },
    derived: {
      sectionSummaries,
      isDirtySection,
      advancedAuth,
      ldapStatus,
      twoFAStatus,
      virtualPrinterItems,
      virtualPrinterModels,
      currentUserRow,
      securityRows,
      smtpPortBySecurity: SMTP_PORT_BY_SECURITY,
    },
    actions: {
      refreshAll,
      setSection,
      setUserPanel,
      setDraft,
      setNewApiKeyName,
      setCreatedApiKey,
      setCameraTokenForm,
      setCreatedCameraToken,
      setCameraTokenInfoVisible,
      setEditingExternalLink,
      setExternalLinkModalVisible,
      setExternalLinkForm,
      setPendingDeleteExternalLink,
      setVirtualPrinterModalVisible,
      setEditingVirtualPrinter,
      setVirtualPrinterForm,
      setPendingDeleteVirtualPrinter,
      setGithubBackupForm,
      setSmtpForm,
      setSmtpTestEmail,
      setLdapForm,
      setProviderModalVisible,
      setEditingProvider,
      setProviderForm,
      setProviderDeleteTarget,
      setPlugModalVisible,
      setEditingPlug,
      setPlugForm,
      setPlugDeleteTarget,
      setShowTOTPSetup,
      setTotpCode,
      setTotpDisableCode,
      setTotpRegenCode,
      setShowTOTPDisable,
      setShowTOTPRegen,
      setBackupCodes,
      setEmailSetupToken,
      setEmailSetupCode,
      setShowDisableEmail2FA,
      setEmailDisablePassword,
      closeProviderModal,
      openProviderModal,
      closePlugModal,
      openPlugModal,
      closeExternalLinkModal,
      openExternalLinkModal,
      closeVirtualPrinterModal,
      openVirtualPrinterModal,
      handleProviderSave,
      handlePlugSave,
      handleSaveSMTP,
      handleSaveLDAP,
      handleSaveExternalLink,
      handleSaveVirtualPrinter,
      handleSaveGitHubBackup,
      showToast,
      queryClient,
    },
  };
}

export type SettingsScreenController = ReturnType<typeof useSettingsScreenController>;
