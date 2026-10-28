import { nativeMessage, translateNative, useLocalizedMemo, useTranslation } from '@/i18n';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { validateSlicerSetup, type SlicerSetupValues } from '@/components/slicing/SlicerSetupSection';
import {
  BUILT_IN_NAV_ITEMS,
  getNavigationLayout,
  serializeNavigationOrder,
  type BuiltInNavId,
} from '@/navigation/navigationConfig';
import { useTheme } from '@/theme';
import type {
  AdvancedAuthStatus,
  BackupCodesResponse,
  ExternalCameraCreate,
  ExternalCameraUpdate,
  KProfile,
  LDAPStatus,
  MQTTStatus,
  OIDCLink,
  OIDCProvider,
  OIDCProviderCreate,
  SMTPSettings,
  SmartPlug,
  SmartPlugCreate,
  SmartPlugUpdate,
  StorageLocation,
  TOTPSetupResponse,
  TwoFAStatus,
} from '@/types/api';
import { formatDateTime, pickArray, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';
import {
  DEFAULT_LDAP_FORM,
  DEFAULT_MQTT_FORM,
  DEFAULT_SMTP_SETTINGS,
  EMPTY_CAMERA_TOKEN_FORM,
  EMPTY_CUSTOM_NAV_ITEM_FORM,
  EMPTY_EXTERNAL_CAMERA_FORM,
  EMPTY_EXTERNAL_LINK_FORM,
  EMPTY_GITHUB_BACKUP_FORM,
  EMPTY_K_PROFILE_FORM,
  EMPTY_PROVIDER_FORM,
  EMPTY_SMART_PLUG_FORM,
  EMPTY_STORAGE_LOCATION_FORM,
  EMPTY_VIRTUAL_PRINTER_FORM,
  NOZZLE_DIAMETER_OPTIONS,
  SMTP_PORT_BY_SECURITY,
} from './constants';
import type {
  CameraTokenFormState,
  CustomNavItemFormState,
  ExternalCameraFormState,
  ExternalLinkFormState,
  GitHubBackupFormState,
  KProfileFormState,
  KProfileModalState,
  LDAPFormState,
  MqttFormState,
  ProviderFormState,
  SectionKey,
  SmartPlugFormState,
  StorageLocationFormState,
  UserPanelKey,
  VirtualPrinterFormState,
} from './types';
import { useCustomNavStore } from '@/store/navigationStore';

const DEFAULT_NAVIGATION_ORDER = BUILT_IN_NAV_ITEMS.map(item => item.id);

function getNavigationOrderDraft(
  defaultSidebarOrder: string | null | undefined,
): BuiltInNavId[] {
  return getNavigationLayout({ defaultSidebarOrder }).orderedBuiltIns.map(
    item => item.id,
  );
}

function serializeNavigationOrderDraft(ids: BuiltInNavId[]): string {
  const normalizedIds = getNavigationOrderDraft(serializeNavigationOrder(ids));
  const matchesDefault =
    normalizedIds.length === DEFAULT_NAVIGATION_ORDER.length &&
    normalizedIds.every(
      (id, index) => id === DEFAULT_NAVIGATION_ORDER[index],
    );
  return matchesDefault ? '' : serializeNavigationOrder(normalizedIds);
}

export function useSettingsScreenController() {
  const { colors, mode, setMode } = useTheme();
  const { isAdmin, authEnabled, user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const { text } = useTranslation();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SectionKey | null>(null);
  const [userPanel, setUserPanel] = useState<UserPanelKey>('auth');
  const [draft, setDraft] = useState<ApiRecord>({});
  const [navigationOrderDraft, setNavigationOrderDraft] = useState<
    BuiltInNavId[]
  >([...DEFAULT_NAVIGATION_ORDER]);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');
  const [cameraTokenForm, setCameraTokenForm] = useState<CameraTokenFormState>(EMPTY_CAMERA_TOKEN_FORM);
  const [createdCameraToken, setCreatedCameraToken] = useState('');
  const [cameraTokenInfoVisible, setCameraTokenInfoVisible] = useState(false);
  const [editingExternalLink, setEditingExternalLink] = useState<ApiRecord | null>(null);
  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [externalLinkForm, setExternalLinkForm] = useState<ExternalLinkFormState>(EMPTY_EXTERNAL_LINK_FORM);
  const [pendingDeleteExternalLink, setPendingDeleteExternalLink] = useState<ApiRecord | null>(null);
  const [customNavModalVisible, setCustomNavModalVisible] = useState(false);
  const [editingCustomNav, setEditingCustomNav] = useState<ApiRecord | null>(null);
  const [customNavForm, setCustomNavForm] = useState<CustomNavItemFormState>(EMPTY_CUSTOM_NAV_ITEM_FORM);
  const [editingExternalCamera, setEditingExternalCamera] = useState<ApiRecord | null>(null);
  const [externalCameraModalVisible, setExternalCameraModalVisible] = useState(false);
  const [externalCameraForm, setExternalCameraForm] = useState<ExternalCameraFormState>(EMPTY_EXTERNAL_CAMERA_FORM);
  const [pendingDeleteExternalCamera, setPendingDeleteExternalCamera] = useState<ApiRecord | null>(null);
  const [virtualPrinterModalVisible, setVirtualPrinterModalVisible] = useState(false);
  const [editingVirtualPrinter, setEditingVirtualPrinter] = useState<ApiRecord | null>(null);
  const [virtualPrinterForm, setVirtualPrinterForm] = useState<VirtualPrinterFormState>(EMPTY_VIRTUAL_PRINTER_FORM);
  const [pendingDeleteVirtualPrinter, setPendingDeleteVirtualPrinter] = useState<ApiRecord | null>(null);
  const [githubBackupForm, setGithubBackupForm] = useState<GitHubBackupFormState>(EMPTY_GITHUB_BACKUP_FORM);
  const [smtpForm, setSmtpForm] = useState<SMTPSettings>(DEFAULT_SMTP_SETTINGS);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [mqttForm, setMqttFormState] = useState<MqttFormState>(DEFAULT_MQTT_FORM);
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
  const [kprofileModal, setKprofileModal] = useState<KProfileModalState>({
    visible: false,
    editingKProfile: null,
    form: { ...EMPTY_K_PROFILE_FORM },
  });
  const [pendingDeleteKProfile, setPendingDeleteKProfile] = useState<KProfile | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StorageLocation | null>(null);
  const [locationForm, setLocationForm] = useState<StorageLocationFormState>(EMPTY_STORAGE_LOCATION_FORM);
  const [pendingDeleteLocation, setPendingDeleteLocation] = useState<StorageLocation | null>(null);

  const canUpdateSettings = !authEnabled || hasPermission('settings:update');
  const canManageSmartPlugs = !authEnabled || hasPermission('smart_plugs:create') || hasPermission('smart_plugs:update');
  const canDeleteSmartPlugs = !authEnabled || hasPermission('smart_plugs:delete');
  const canControlSmartPlugs = !authEnabled || hasPermission('smart_plugs:control');
  const canManageSecurity = !authEnabled || isAdmin || hasPermission('settings:update');
  const canManageSpools = !authEnabled || hasPermission('inventory:create') || hasPermission('inventory:update');

  const settingsQuery = useQuery({ queryKey: useServerSettingsKey(), queryFn: api.getSettings });
  const smartPlugsQuery = useQuery({ queryKey: ['smartPlugs'], queryFn: api.getSmartPlugs });
  const providersQuery = useQuery({ queryKey: ['notificationProviders'], queryFn: api.getNotificationProviders });
  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: api.getApiKeys, enabled: hasPermission('api_keys:read') });
  const cameraTokensQuery = useQuery({
    queryKey: ['cameraTokens'],
    queryFn: () => (isAdmin ? api.listAllLongLivedCameraTokens() : api.listMyLongLivedCameraTokens()),
    enabled: false,
  });
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks });
  const externalCamerasQuery = useQuery({
    queryKey: ['externalCameras'],
    queryFn: api.getExternalCameras,
    // Current servers configure external cameras on printers, not camera records.
    enabled: false,
  });
  const printersQuery = useQuery({
    queryKey: ['printers', 'settings'],
    queryFn: api.getPrinters,
    enabled: section === 'external-cameras',
  });
  const virtualPrinterListQuery = useQuery({ queryKey: ['virtualPrinterList'], queryFn: api.getVirtualPrinterList });
  const spoolbuddyQuery = useQuery({ queryKey: ['spoolbuddyDevices'], queryFn: api.getSpoolBuddyDevices });
  const spoolmanStatusQuery = useQuery({ queryKey: ['spoolmanStatus'], queryFn: api.getSpoolmanStatus });
  const spoolmanConfigQuery = useQuery({
    queryKey: ['spoolmanConfig'],
    queryFn: api.getSpoolmanConfig,
    enabled: section === 'filament',
  });
  const spoolmanSyncStatusQuery = useQuery({
    queryKey: ['spoolmanSyncStatus'],
    queryFn: api.getSpoolmanSyncStatus,
    enabled: section === 'filament',
  });
  const kprofilesQuery = useQuery({
    queryKey: ['kprofiles'],
    queryFn: () => api.getKProfiles(),
    enabled: false,
  });
  const storageLocationsQuery = useQuery({
    queryKey: ['storageLocations'],
    queryFn: api.getLocations,
    enabled: section === 'storage-locations',
  });
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
  const mqttStatusQuery = useQuery<MQTTStatus>({
    queryKey: ['mqttStatus'],
    queryFn: api.getMqttStatus,
    enabled: section === 'mqtt',
    refetchInterval: section === 'mqtt' ? 10000 : false,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data);
      setNavigationOrderDraft(
        getNavigationOrderDraft(settingsQuery.data.default_sidebar_order),
      );
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
    if (draft) {
      setMqttFormState({
        mqtt_broker: pickString(draft, ['mqtt_broker']),
        mqtt_port: pickNumber(draft, ['mqtt_port'], 1883),
        mqtt_username: pickString(draft, ['mqtt_username']),
        mqtt_password: '',
        mqtt_topic_prefix: pickString(draft, ['mqtt_topic_prefix'], 'bambuddy'),
        mqtt_use_tls: pickBoolean(draft, ['mqtt_use_tls']),
      });
    }
  }, [draft?.mqtt_broker, draft?.mqtt_port, draft?.mqtt_username, draft?.mqtt_topic_prefix, draft?.mqtt_use_tls]);

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
      ...(hasPermission('api_keys:read') ? [apiKeysQuery.refetch()] : []),
      externalLinksQuery.refetch(),
      printersQuery.refetch(),
      virtualPrinterListQuery.refetch(),
      spoolbuddyQuery.refetch(),
      spoolmanStatusQuery.refetch(),
      spoolmanConfigQuery.refetch(),
      spoolmanSyncStatusQuery.refetch(),
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
      mqttStatusQuery.refetch(),
    ]);
  };

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const error = validateSlicerSetup({
        preferred_slicer: String(draft.preferred_slicer ?? 'bambu_studio') as SlicerSetupValues['preferred_slicer'],
        use_slicer_api: Boolean(draft.use_slicer_api),
        bambu_studio_api_url: String(draft.bambu_studio_api_url ?? ''),
        orcaslicer_api_url: String(draft.orcaslicer_api_url ?? ''),
        slicer_stall_timeout_minutes: Number(draft.slicer_stall_timeout_minutes ?? 15),
      });
      if (error) throw new Error(text(error));
      return api.updateSettings(draft);
    },
    onSuccess: async data => {
      setDraft(data);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast(nativeMessage('native.a96fba96493a34e8'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.424e9407b3b7d9bd'), 'error'),
  });

  const saveNavigationOrderMutation = useMutation({
    mutationFn: async () =>
      api.updateSettings({
        ...draft,
        default_sidebar_order:
          serializeNavigationOrderDraft(navigationOrderDraft),
      }),
    onSuccess: async data => {
      setDraft(data);
      setNavigationOrderDraft(
        getNavigationOrderDraft(data.default_sidebar_order),
      );
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast(nativeMessage('native.ada23a4f6650daf7'), 'success');
    },
    onError: (error: Error) => {
      const persistedOrder = settingsQuery.data?.default_sidebar_order ?? '';
      setDraft(current => ({
        ...current,
        default_sidebar_order: persistedOrder,
      }));
      setNavigationOrderDraft(getNavigationOrderDraft(persistedOrder));
      showToast(
        error.message || nativeMessage('native.c4cf55e343cacc7a'),
        'error',
      );
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => api.createApiKey({ name: newApiKeyName.trim() }),
    onSuccess: async data => {
      setCreatedApiKey(pickString(data, ['key'], ''));
      setNewApiKeyName('');
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast(nativeMessage('native.6d6650ee1cd31ae8'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.61b9d1cdee4b1c0b'), 'error'),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (id: number) => api.deleteApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast(nativeMessage('native.b157226b0fc21424'), 'success');
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
      showToast(nativeMessage('native.ac8d1586afec0ef2'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.f47ece762fbe5dfb'), 'error'),
  });

  const revokeCameraTokenMutation = useMutation({
    mutationFn: async (id: number) => api.revokeLongLivedCameraToken(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cameraTokens'] });
      showToast(nativeMessage('native.4ae2b7a7f2fe0e95'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.1eaac4918532cd60'), 'error'),
  });

  const createExternalLinkMutation = useMutation({
    mutationFn: async (payload: ExternalLinkFormState) => api.createExternalLink(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setExternalLinkModalVisible(false);
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
      showToast(nativeMessage('native.1bce4c5563e5fe7c'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.f5f90b83064cd506'), 'error'),
  });

  const reorderExternalLinksMutation = useMutation({
    mutationFn: async (ids: number[]) => api.reorderExternalLinks(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      showToast(nativeMessage('native.4d8102426f448bc9'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.e5ea64ae2565f10c'), 'error'),
  });

  const updateExternalLinkMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ExternalLinkFormState }) => api.updateExternalLink(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setExternalLinkModalVisible(false);
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
      showToast(nativeMessage('native.ae0bb6f18b946206'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.460749be4d5f8447'), 'error'),
  });

  const deleteExternalLinkMutation = useMutation({
    mutationFn: async (id: number) => api.deleteExternalLink(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setPendingDeleteExternalLink(null);
      showToast(nativeMessage('native.338e5ae015ba56fd'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.a5cdd1e075f4267b'), 'error'),
  });

  const createExternalCameraMutation = useMutation({
    mutationFn: api.createExternalCamera,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalCameras'] });
      closeExternalCameraModal();
      showToast(nativeMessage('native.26ec9877789dd244'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.179ea52e17cff3e7'), 'error'),
  });

  const updateExternalCameraMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ExternalCameraUpdate }) =>
      api.updateExternalCamera(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalCameras'] });
      closeExternalCameraModal();
      showToast(nativeMessage('native.441e9ab6ab4a1c35'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.cfacaccdf6e6191d'), 'error'),
  });

  const deleteExternalCameraMutation = useMutation({
    mutationFn: api.deleteExternalCamera,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalCameras'] });
      setPendingDeleteExternalCamera(null);
      showToast(nativeMessage('native.6c9a3fee2ec66043'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.c5a4a89464ab3634'), 'error'),
  });

  const testExternalCameraMutation = useMutation({
    mutationFn: api.testExternalCamera,
    onSuccess: result => showToast(result.message || nativeMessage('native.4bbbf0d5a40e8366'), result.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.7247ad75b4623ac0'), 'error'),
  });

  const backupMutation = useMutation({
    mutationFn: async () => api.triggerLocalBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['localBackupStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['localBackups'] });
      showToast(nativeMessage('native.0b4a52beceb81ba2'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.54edc84b3d2415c0'), 'error'),
  });

  const exportBackupMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.exportBackup();
      await shareBlob(blob, 'bambuddy-backup.zip');
    },
    onSuccess: () => showToast(nativeMessage('native.83353293d7d7dda9'), 'success'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.2658122a3608c697'), 'error'),
  });

  const githubBackupMutation = useMutation({
    mutationFn: async () => api.triggerGitHubBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast(nativeMessage('native.1c8ce130a003a27f'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.8e9c033fa0ad5377'), 'error'),
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
      showToast(nativeMessage('native.8c39d87eb7c2e6b2'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ec6dbe52cd249819'), 'error'),
  });

  const virtualPrinterControl = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      (action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.14b5505c2f74cfed'), 'error'),
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
      showToast(nativeMessage('native.b29426730dbc63f4'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.812d6533fb84ee13'), 'error'),
  });

  const deleteVirtualPrinterMutation = useMutation({
    mutationFn: async (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setPendingDeleteVirtualPrinter(null);
      showToast(nativeMessage('native.cec7ccc368b4396c'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.18fe6aa1022b78ba'), 'error'),
  });

  const calibrateSpoolbuddyMutation = useMutation({
    mutationFn: async (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
      showToast(nativeMessage('native.c84b2eb2e0483f66'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.c1344bc2bd9c1f92'), 'error'),
  });

  const saveSMTPMutation = useMutation({
    mutationFn: async (data: SMTPSettings) => api.saveSMTPSettings(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast(nativeMessage('native.61843626dacca185'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.7f0dc0c806e30fbf'), 'error'),
  });

  const testSMTPMutation = useMutation({
    mutationFn: async (recipient: string) => api.testSMTP({ test_recipient: recipient }),
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.2f428eaa1e5a1bc9'), 'error'),
  });

  const testMqttMutation = useMutation({
    mutationFn: api.testMqttConnection,
    onSuccess: data => {
      const ok = pickBoolean(data, ['ok', 'success']);
      showToast(
        ok ? pickString(data, ['message'], nativeMessage('native.cdf865bd855e6896')) : pickString(data, ['error', 'message'], nativeMessage('native.cc8ad0db2cba46cf')),
        ok ? 'success' : 'error',
      );
      void mqttStatusQuery.refetch();
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.2c20f46f81c2255e'), 'error'),
  });

  const toggleAdvancedAuthMutation = useMutation({
    mutationFn: async (enabled: boolean) => (enabled ? api.enableAdvancedAuth() : api.disableAdvancedAuth()),
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['advancedAuthStatus'] });
      showToast(data.message || nativeMessage('native.fe92f52a52a7824c'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ffa2864432743c70'), 'error'),
  });

  const saveLDAPMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => api.updateSettings(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast(nativeMessage('native.dea41a3bcb4489df'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.9fbf0b69aeb0ede3'), 'error'),
  });

  const toggleLDAPMutation = useMutation({
    mutationFn: async (enabled: boolean) => api.updateSettings({ ldap_enabled: enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['ldapStatus'] });
      showToast(nativeMessage('native.bb42644cf1995874'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ad553314511dac0a'), 'error'),
  });

  const testLDAPMutation = useMutation({
    mutationFn: async () => api.testLDAP(),
    onSuccess: data => showToast(data.message, data.success ? 'success' : 'error'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.43df2e7612c2fcdc'), 'error'),
  });

  const testSpoolmanMutation = useMutation({
    mutationFn: async () => api.connectSpoolman(),
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] });
      showToast(pickString(data, ['message'], nativeMessage('native.2f217ec354df7f0c')), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.4c9891efc51d03e7'), 'error'),
  });

  const saveSpoolmanAutoSyncMutation = useMutation({
    mutationFn: async (autoSync: boolean) =>
      api.updateSpoolmanConfig({
        enabled: Boolean(draft.spoolman_enabled),
        url: String(draft.spoolman_url ?? '').trim() || null,
        auto_sync: autoSync,
      }),
    onSuccess: async data => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spoolmanConfig'] }),
        queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
      ]);
      setDraft(current => ({
        ...current,
        spoolman_enabled: pickBoolean(data, ['enabled'], Boolean(current.spoolman_enabled)),
        spoolman_url: pickString(data, ['url'], String(current.spoolman_url ?? '')),
      }));
      showToast(nativeMessage('native.1230bbeb20193065'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.973324fb4b801bce'), 'error'),
  });

  const syncSpoolmanMutation = useMutation({
    mutationFn: async () => api.syncSpoolmanInventory(),
    onSuccess: async data => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spoolmanSyncStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['inventorySpools'] }),
        queryClient.invalidateQueries({ queryKey: ['inventoryAssignments'] }),
      ]);
      const addedCount = pickNumber(data, ['added_count'], 0);
      const updatedCount = pickNumber(data, ['updated_count'], 0);
      const removedCount = pickNumber(data, ['removed_count'], 0);
      const skippedCount = pickNumber(data, ['skipped_count'], 0);
      const errorCount = pickArray(data, ['errors']).length;
      showToast(
        nativeMessage('native.d2ae80a4b671dfa8', () => ({ value0: String(addedCount), value1: String(updatedCount), value2: String(removedCount), value3: String(skippedCount), value4: String(errorCount) })),
        pickBoolean(data, ['success'], errorCount === 0) ? 'success' : 'warning',
      );
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ec46ca1f1c10149f'), 'error'),
  });

  const createKProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.createKProfile(data),
    onSuccess: async () => {
      closeKProfileModal();
      showToast(nativeMessage('native.3c5b423b0738bc9b'), 'success');
      await queryClient.invalidateQueries({ queryKey: ['kprofiles'] });
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.5412a05cbd0e86a8'), 'error'),
  });

  const updateKProfileMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.updateKProfile(id, payload),
    onSuccess: async () => {
      closeKProfileModal();
      showToast(nativeMessage('native.7ab702401dbdc22e'), 'success');
      await queryClient.invalidateQueries({ queryKey: ['kprofiles'] });
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.53096a3a093d58cf'), 'error'),
  });

  const deleteKProfileMutation = useMutation({
    mutationFn: async (profile: KProfile) => {
      const id = profile.slot_id;
      return api.deleteKProfile(id);
    },
    onSuccess: async () => {
      setPendingDeleteKProfile(null);
      showToast(nativeMessage('native.08a5cfe47619ae8c'), 'success');
      await queryClient.invalidateQueries({ queryKey: ['kprofiles'] });
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.8beb369bf81f975b'), 'error'),
  });

  const createLocationMutation = useMutation({
    mutationFn: async () =>
      api.createLocation({
        name: locationForm.name.trim(),
        identifier: locationForm.identifier.trim() || null,
        address: locationForm.address.trim() || null,
        notes: locationForm.notes.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
      closeLocationModal();
      showToast(nativeMessage('native.f47cdf69d194d0ce'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.dcc9da07cd444eef'), 'error'),
  });

  const updateLocationMutation = useMutation({
    mutationFn: async () =>
      api.updateLocation(editingLocation!.id, {
        name: locationForm.name.trim(),
        identifier: locationForm.identifier.trim() || null,
        address: locationForm.address.trim() || null,
        notes: locationForm.notes.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
      closeLocationModal();
      showToast(nativeMessage('native.9bd2bfb48da09c09'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.55b7154967388a6e'), 'error'),
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id: number) => api.deleteLocation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['storageLocations'] });
      setPendingDeleteLocation(null);
      showToast(nativeMessage('native.3a782562bcb4063a'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.58c8fbefc3e65695'), 'error'),
  });

  const testObicoMutation = useMutation({
    mutationFn: async (url: string) => api.testObicoConnection(url),
    onSuccess: result => {
      const ok = pickBoolean(result, ['ok', 'success']);
      showToast(
        ok ? pickString(result, ['message'], nativeMessage('native.00b8f188e1e8984d')) : pickString(result, ['error', 'message'], nativeMessage('native.cca78f351d627cab')),
        ok ? 'success' : 'error',
      );
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.79b067811630792b'), 'error'),
  });

  const createOIDCProviderMutation = useMutation({
    mutationFn: async (payload: OIDCProviderCreate) => api.createOIDCProvider(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast(nativeMessage('native.d43afdeb16fd894e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.5ff958b8cbd755a9'), 'error'),
  });

  const updateOIDCProviderMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<OIDCProviderCreate> }) => api.updateOIDCProvider(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      closeProviderModal();
      showToast(nativeMessage('native.3dfe03058ebb31d5'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.b851c6a9d544b9a1'), 'error'),
  });

  const deleteOIDCProviderMutation = useMutation({
    mutationFn: async (id: number) => api.deleteOIDCProvider(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidcProvidersAll'] });
      setProviderDeleteTarget(null);
      showToast(nativeMessage('native.62d50fad184ff79a'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.deb317a5ccdc5fe1'), 'error'),
  });

  const createSmartPlugMutation = useMutation({
    mutationFn: async (payload: SmartPlugCreate) => api.createSmartPlug(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast(nativeMessage('native.0cb3ea167d4a3614'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.5187d2f0d2b0e85a'), 'error'),
  });

  const updateSmartPlugMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: SmartPlugUpdate }) => api.updateSmartPlug(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast(nativeMessage('native.10d03ed59c49e74c'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.c5894066fd03d93e'), 'error'),
  });

  const deleteSmartPlugMutation = useMutation({
    mutationFn: async (id: number) => api.deleteSmartPlug(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      setPlugDeleteTarget(null);
      showToast(nativeMessage('native.9d5b6c98dbf5839f'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.9e1bd0cc1bc5bef8'), 'error'),
  });

  const enableTOTPMutation = useMutation({
    mutationFn: async (code: string) => api.enableTOTP(code),
    onSuccess: async data => {
      setBackupCodes(data.backup_codes);
      setTotpCode('');
      setShowTOTPSetup(false);
      queryClient.removeQueries({ queryKey: ['totp-setup'] });
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(nativeMessage('native.5b92e726cd528f42'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.824433be39b3e835'), 'error'),
  });

  const disableTOTPMutation = useMutation({
    mutationFn: async (code: string) => api.disableTOTP(code),
    onSuccess: async data => {
      setShowTOTPDisable(false);
      setTotpCode('');
      setTotpDisableCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || nativeMessage('native.05aaa12602581b95'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ffa795a26d485fd3'), 'error'),
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: async (code: string) => api.regenerateBackupCodes(code),
    onSuccess: async (data: BackupCodesResponse) => {
      setBackupCodes(data.backup_codes);
      setShowTOTPRegen(false);
      setTotpRegenCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || nativeMessage('native.431c0e7bdf5a8b10'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.86c9505b4d084a44'), 'error'),
  });

  const enableEmailOTPRequestMutation = useMutation({
    mutationFn: async () => api.enableEmailOTP(),
    onSuccess: data => {
      setEmailSetupToken(data.setup_token);
      setEmailSetupCode('');
      showToast(data.message || nativeMessage('native.a95023ecfddfa1a7'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d81acc3fde7c1f56'), 'error'),
  });

  const confirmEnableEmailOTPMutation = useMutation({
    mutationFn: async ({ token, code }: { token: string; code: string }) => api.confirmEnableEmailOTP(token, code),
    onSuccess: async data => {
      setEmailSetupToken(null);
      setEmailSetupCode('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || nativeMessage('native.481f4416f7922a7e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.237d28c40dc2a047'), 'error'),
  });

  const disableEmailOTPMutation = useMutation({
    mutationFn: async (password: string) => api.disableEmailOTP(password),
    onSuccess: async data => {
      setShowDisableEmail2FA(false);
      setEmailDisablePassword('');
      await queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      showToast(data.message || nativeMessage('native.42a7787962b6d17e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.a27c0f3252cb71f9'), 'error'),
  });

  const unlinkOIDCLinkMutation = useMutation({
    mutationFn: async (providerId: number) => api.deleteOIDCLink(providerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['oidc-links'] });
      showToast(nativeMessage('native.407b74d1d9eb2dcc'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.22366ca6f7306793'), 'error'),
  });

  const saveCustomNavMutation = useMutation({
    mutationFn: async () => undefined,
  });

  const sectionSummaries = useLocalizedMemo(
    () => ({
      settings: settingsQuery.data,
      smartPlugs: smartPlugsQuery.data,
      notificationProviders: providersQuery.data as ApiRecord[] | undefined,
      apiKeys: apiKeysQuery.data as ApiRecord[] | undefined,
      cameraTokens: cameraTokensQuery.data as ApiRecord[] | undefined,
      externalCameras: externalCamerasQuery.data as ApiRecord[] | undefined,
      virtualPrinters: Array.isArray(virtualPrinterListQuery.data?.printers) ? (virtualPrinterListQuery.data.printers as ApiRecord[]) : [],
      spoolbuddyDevices: spoolbuddyQuery.data as ApiRecord[] | undefined,
      obicoStatus: obicoQuery.data,
      advancedAuthStatus: advancedAuthQuery.data,
      githubBackupStatus: githubBackupQuery.data,
      mqttStatus: mqttStatusQuery.data,
      customNavItems: useCustomNavStore.getState().items,
      kprofiles: kprofilesQuery.data?.profiles as KProfile[] | undefined,
      storageLocations: (Array.isArray(storageLocationsQuery.data) ? (storageLocationsQuery.data as unknown as StorageLocation[]) : []),
    }),
    [
      advancedAuthQuery.data,
      apiKeysQuery.data,
      cameraTokensQuery.data,
      externalCamerasQuery.data,
      githubBackupQuery.data,
      kprofilesQuery.data,
      mqttStatusQuery.data,
      obicoQuery.data,
      providersQuery.data,
      settingsQuery.data,
      smartPlugsQuery.data,
      spoolbuddyQuery.data,
      storageLocationsQuery.data,
      virtualPrinterListQuery.data,
    ],
  );

  const isDirtySection =
    section === 'general' ||
    section === 'queue' ||
    section === 'filament' ||
    section === 'kprofiles' ||
    section === 'network' ||
    section === 'mqtt' ||
    section === 'backup' ||
    section === 'custom-navigation' ||
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

  function closeCustomNavModal() {
    setCustomNavModalVisible(false);
    setEditingCustomNav(null);
    setCustomNavForm(EMPTY_CUSTOM_NAV_ITEM_FORM);
  }

  function openCustomNavModal(item?: ApiRecord) {
    if (item) {
      setEditingCustomNav(item);
      setCustomNavForm({
        name: pickString(item, ['name']),
        url: pickString(item, ['url']),
        icon: pickString(item, ['icon'], 'link'),
        open_in_new_tab: pickBoolean(item, ['open_in_new_tab'], true),
        sort_order: String(pickNumber(item, ['sort_order'], 0)),
      });
    } else {
      setEditingCustomNav(null);
      setCustomNavForm(EMPTY_CUSTOM_NAV_ITEM_FORM);
    }
    setCustomNavModalVisible(true);
  }

  function handleSaveCustomNav() {
    if (!customNavForm.name.trim() || !customNavForm.url.trim()) {
      showToast(nativeMessage('native.7f83a218e693fb47'), 'error');
      return;
    }
    if (!/^https?:\/\//i.test(customNavForm.url.trim())) {
      showToast(nativeMessage('native.e7b44e941f0d51db'), 'error');
      return;
    }
    useCustomNavStore.getState().updateItem(
      pickString(editingCustomNav, ['id']),
      {
        name: customNavForm.name.trim(),
        url: customNavForm.url.trim(),
        icon: customNavForm.icon,
        open_in_new_tab: customNavForm.open_in_new_tab,
        sort_order: Number(customNavForm.sort_order) || 0,
      },
    );
    closeCustomNavModal();
    showToast(editingCustomNav ? nativeMessage('native.4f151cac11ab950b') : nativeMessage('native.0563ba4276789195'), 'success');
  }

  function closeExternalCameraModal() {
    setExternalCameraModalVisible(false);
    setEditingExternalCamera(null);
    setExternalCameraForm(EMPTY_EXTERNAL_CAMERA_FORM);
  }

  function openExternalCameraModal(camera?: ApiRecord) {
    if (camera) {
      setEditingExternalCamera(camera);
      setExternalCameraForm({
        name: pickString(camera, ['name']),
        stream_url: pickString(camera, ['stream_url']),
        camera_type: pickString(camera, ['camera_type'], 'mjpeg') as ExternalCameraFormState['camera_type'],
        printer_id: pickString(camera, ['printer_id']),
      });
    } else {
      setEditingExternalCamera(null);
      setExternalCameraForm(EMPTY_EXTERNAL_CAMERA_FORM);
    }
    setExternalCameraModalVisible(true);
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

  function closeKProfileModal() {
    setKprofileModal({
      visible: false,
      editingKProfile: null,
      form: { ...EMPTY_K_PROFILE_FORM },
    });
  }

  function openKProfileModal(profile?: KProfile) {
    if (profile) {
      setKprofileModal({
        visible: true,
        editingKProfile: profile,
        form: {
          slot_id: String(profile.slot_id),
          extruder_id: String(profile.extruder_id),
          nozzle_id: profile.nozzle_id,
          nozzle_diameter: profile.nozzle_diameter,
          filament_id: profile.filament_id,
          name: profile.name,
          k_value: profile.k_value,
          n_coef: profile.n_coef || '',
          ams_id: String(profile.ams_id),
          tray_id: String(profile.tray_id),
          setting_id: profile.setting_id || '',
        },
      });
    } else {
      setKprofileModal({
        visible: true,
        editingKProfile: null,
        form: { ...EMPTY_K_PROFILE_FORM },
      });
    }
  }

  function closeLocationModal() {
    setLocationModalVisible(false);
    setEditingLocation(null);
    setLocationForm(EMPTY_STORAGE_LOCATION_FORM);
  }

  function openLocationModal(location?: StorageLocation) {
    if (location) {
      setEditingLocation(location);
      setLocationForm({
        name: location.name,
        identifier: location.identifier ?? '',
        address: location.address ?? '',
        notes: location.notes ?? '',
      });
    } else {
      setEditingLocation(null);
      setLocationForm(EMPTY_STORAGE_LOCATION_FORM);
    }
    setLocationModalVisible(true);
  }

  function handleSaveLocation() {
    if (!locationForm.name.trim()) {
      showToast(nativeMessage('native.66d8b73d097a9630'), 'error');
      return;
    }

    if (editingLocation) {
      updateLocationMutation.mutate();
      return;
    }
    createLocationMutation.mutate();
  }

  const handleProviderSave = () => {
    if (!providerForm.name.trim() || !providerForm.issuer_url.trim() || !providerForm.client_id.trim()) {
      showToast(nativeMessage('native.33f2e3f6dc9fa158'), 'error');
      return;
    }
    if (!editingProvider && !providerForm.client_secret.trim()) {
      showToast(nativeMessage('native.aa640b1d0878624a'), 'error');
      return;
    }

    const payload: Partial<OIDCProviderCreate> = {
      name: providerForm.name.trim(),
      issuer_url: providerForm.issuer_url.trim(),
      client_id: providerForm.client_id.trim(),
      scopes: providerForm.scopes.trim() || translateNative('native.a78c1991f70d3ab8'),
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
      showToast(nativeMessage('native.cf0d0fdf444e5dfd'), 'error');
      return;
    }
    if (plugForm.plug_type === 'tasmota' && !plugForm.ip_address.trim()) {
      showToast(nativeMessage('native.2fb4c46c10cf759a'), 'error');
      return;
    }
    if (plugForm.plug_type === 'homeassistant' && !plugForm.ha_entity_id.trim()) {
      showToast(nativeMessage('native.5cb4a3f50dbc2594'), 'error');
      return;
    }
    if (plugForm.plug_type === 'mqtt' && !plugForm.mqtt_power_topic.trim()) {
      showToast(nativeMessage('native.4f72811988f81635'), 'error');
      return;
    }
    if (plugForm.plug_type === 'rest' && (!plugForm.rest_on_url.trim() || !plugForm.rest_off_url.trim())) {
      showToast(nativeMessage('native.dfed918cbad9e3ac'), 'error');
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
      showToast(nativeMessage('native.8f7390e3c52dfdda'), 'error');
      return;
    }
    if (smtpForm.smtp_auth_enabled && !smtpForm.smtp_username?.trim()) {
      showToast(nativeMessage('native.af2fd493f6c189bb'), 'error');
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
      showToast(nativeMessage('native.4994df2fd458b626'), 'error');
      return;
    }
    if (!ldapForm.ldap_search_base.trim()) {
      showToast(nativeMessage('native.35197a9e06010855'), 'error');
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
      showToast(nativeMessage('native.7f83a218e693fb47'), 'error');
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

  const handleSaveExternalCamera = () => {
    const normalizedName = externalCameraForm.name.trim();
    const normalizedStreamUrl = externalCameraForm.stream_url.trim();
    if (!normalizedName || !normalizedStreamUrl) {
      showToast(nativeMessage('native.81d0dc306dfb1285'), 'error');
      return;
    }
    if (!/^(https?|rtsp):\/\//i.test(normalizedStreamUrl)) {
      showToast(nativeMessage('native.cfd1c83280b4c011'), 'error');
      return;
    }
    const parsedPrinterId = Number(externalCameraForm.printer_id);
    const payload: ExternalCameraCreate = {
      name: normalizedName,
      stream_url: normalizedStreamUrl,
      camera_type: externalCameraForm.camera_type,
      printer_id: Number.isFinite(parsedPrinterId) && parsedPrinterId > 0 ? parsedPrinterId : null,
    };

    if (editingExternalCamera) {
      updateExternalCameraMutation.mutate({
        id: pickNumber(editingExternalCamera, ['id']),
        payload,
      });
      return;
    }
    createExternalCameraMutation.mutate(payload);
  };

  const handleSaveVirtualPrinter = () => {
    if (!virtualPrinterForm.name.trim()) {
      showToast(nativeMessage('native.4c132ed022f83d2c'), 'error');
      return;
    }
    saveVirtualPrinterMutation.mutate();
  };

  const handleSaveKProfile = () => {
    if (!kprofileModal.form.nozzle_id.trim()) {
      showToast(nativeMessage('native.ab1868b4c46618a2'), 'error');
      return;
    }
    if (!kprofileModal.form.filament_id.trim()) {
      showToast(nativeMessage('native.07b22d9518894db6'), 'error');
      return;
    }
    if (!kprofileModal.form.k_value.trim()) {
      showToast(nativeMessage('native.007eff4f0c241763'), 'error');
      return;
    }

    const payload: Record<string, unknown> = {
      nozzle_id: kprofileModal.form.nozzle_id.trim(),
      nozzle_diameter: kprofileModal.form.nozzle_diameter,
      filament_id: kprofileModal.form.filament_id.trim(),
      name: kprofileModal.form.name.trim() || kprofileModal.form.filament_id,
      k_value: kprofileModal.form.k_value,
    };

    const slotId = Number(kprofileModal.form.slot_id);
    if (Number.isFinite(slotId) && slotId > 0) {
      payload.slot_id = slotId;
    }

    const extruderId = Number(kprofileModal.form.extruder_id);
    if (Number.isFinite(extruderId)) {
      payload.extruder_id = extruderId;
    }

    const nCoef = kprofileModal.form.n_coef.trim();
    if (nCoef) {
      payload.n_coef = nCoef;
    }

    const amsId = Number(kprofileModal.form.ams_id);
    if (Number.isFinite(amsId)) {
      payload.ams_id = amsId;
    }

    const trayId = Number(kprofileModal.form.tray_id);
    if (Number.isFinite(trayId)) {
      payload.tray_id = trayId;
    }

    const settingId = kprofileModal.form.setting_id.trim();
    if (settingId) {
      payload.setting_id = settingId;
    }

    if (kprofileModal.editingKProfile) {
      updateKProfileMutation.mutate({ id: kprofileModal.editingKProfile.slot_id, payload });
    } else {
      createKProfileMutation.mutate(payload);
    }
  };

  const handleSaveGitHubBackup = () => {
    if (!githubBackupForm.repository_url.trim()) {
      showToast(nativeMessage('native.47ad9f736b60936c'), 'error');
      return;
    }
    if (!githubBackupConfigQuery.data && !githubBackupForm.access_token.trim()) {
      showToast(nativeMessage('native.d105305868b3602e'), 'error');
      return;
    }
    saveGitHubBackupMutation.mutate();
  };

  const advancedAuth = advancedAuthQuery.data;
  const ldapStatus = ldapStatusQuery.data;
  const twoFAStatus = twoFAStatusQuery.data;
  const virtualPrinterItems = useLocalizedMemo(
    () => (Array.isArray(virtualPrinterListQuery.data?.printers) ? (virtualPrinterListQuery.data.printers as ApiRecord[]) : []),
    [virtualPrinterListQuery.data],
  );
  const virtualPrinterModels = useLocalizedMemo(() => {
    const source = (virtualPrinterListQuery.data?.models ?? {}) as Record<string, unknown>;
    return Object.entries(source).map(([key, value]) => ({ key, label: String(value) }));
  }, [virtualPrinterListQuery.data]);
  const externalCameraItems = useLocalizedMemo(() => (externalCamerasQuery.data ?? []) as ApiRecord[], [externalCamerasQuery.data]);
  const printerOptions = useLocalizedMemo(
    () =>
      ((printersQuery.data ?? []) as ApiRecord[]).map(printer => ({
        key: String(pickNumber(printer, ['id'])),
        label: pickString(printer, ['name'], `Printer ${pickNumber(printer, ['id'])}`),
      })),
    [printersQuery.data],
  );
  const printerLabelById = useLocalizedMemo(
    () =>
      printerOptions.reduce<Record<string, string>>((acc, option) => {
        acc[option.key] = option.label;
        return acc;
      }, {}),
    [printerOptions],
  );
  const currentUserRow = useLocalizedMemo(
    () => ((usersQuery.data ?? []) as ApiRecord[]).find(row => pickNumber(row, ['id']) === user?.id) ?? null,
    [user?.id, usersQuery.data],
  );
  const securityRows = useLocalizedMemo(
    () => [
      {
        get label() { return translateNative('native.7e87c9e7beb40739'); },
        value: /^https:\/\//i.test(pickString(draft, ['external_url'])) ? 'Yes' : 'No',
      },
      {
        get label() { return translateNative('native.3ad9608582faec41'); },
        value:
          pickBoolean(draft, ['two_fa_enforced', 'enforce_2fa'])
            ? 'Required'
            : twoFAStatus?.totp_enabled || twoFAStatus?.email_otp_enabled
              ? translateNative('native.e25fe5d629564918')
              : translateNative('native.a990dbbd8ae036d7'),
      },
      {
        get label() { return translateNative('native.004aef2d155d918c'); },
        value: pickString(currentUserRow, ['active_sessions', 'session_count'], 'Unavailable'),
      },
      {
        get label() { return translateNative('native.9483ff500a59f7ad'); },
        value: String(((apiKeysQuery.data ?? []) as ApiRecord[]).length),
      },
      {
        get label() { return translateNative('native.3fd7a79263002a1f'); },
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
      navigationOrderDraft,
      newApiKeyName,
      createdApiKey,
      cameraTokenForm,
      createdCameraToken,
      cameraTokenInfoVisible,
      editingExternalLink,
      externalLinkModalVisible,
      externalLinkForm,
      pendingDeleteExternalLink,
      customNavModalVisible,
      editingCustomNav,
      customNavForm,
      editingExternalCamera,
      externalCameraModalVisible,
      externalCameraForm,
      pendingDeleteExternalCamera,
      virtualPrinterModalVisible,
      editingVirtualPrinter,
      virtualPrinterForm,
      pendingDeleteVirtualPrinter,
      githubBackupForm,
      smtpForm,
      smtpTestEmail,
      mqttForm,
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
      kprofileModal,
      pendingDeleteKProfile,
      locationModalVisible,
      editingLocation,
      locationForm,
      pendingDeleteLocation,
    },
    permissions: {
      canUpdateSettings,
      canManageSmartPlugs,
      canDeleteSmartPlugs,
      canControlSmartPlugs,
      canManageSecurity,
      canManageSpools,
    },
    queries: {
      settingsQuery,
      smartPlugsQuery,
      providersQuery,
      apiKeysQuery,
      cameraTokensQuery,
      externalLinksQuery,
      externalCamerasQuery,
      printersQuery,
      virtualPrinterListQuery,
      spoolbuddyQuery,
      spoolmanStatusQuery,
      spoolmanConfigQuery,
      spoolmanSyncStatusQuery,
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
      mqttStatusQuery,
      kprofilesQuery,
      storageLocationsQuery,
    },
    mutations: {
      saveSettingsMutation,
      saveNavigationOrderMutation,
      createApiKeyMutation,
      deleteApiKeyMutation,
      createCameraTokenMutation,
      revokeCameraTokenMutation,
      createExternalLinkMutation,
      reorderExternalLinksMutation,
      updateExternalLinkMutation,
      deleteExternalLinkMutation,
      createExternalCameraMutation,
      updateExternalCameraMutation,
      deleteExternalCameraMutation,
      testExternalCameraMutation,
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
      testMqttMutation,
      toggleAdvancedAuthMutation,
      saveLDAPMutation,
      toggleLDAPMutation,
      testLDAPMutation,
      testSpoolmanMutation,
      saveSpoolmanAutoSyncMutation,
      syncSpoolmanMutation,
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
      saveCustomNavMutation,
      createKProfileMutation,
      updateKProfileMutation,
      deleteKProfileMutation,
      createLocationMutation,
      updateLocationMutation,
      deleteLocationMutation,
    },
    derived: {
      sectionSummaries,
      isDirtySection,
      advancedAuth,
      ldapStatus,
      twoFAStatus,
      virtualPrinterItems,
      virtualPrinterModels,
      externalCameraItems,
      printerOptions,
      printerLabelById,
      currentUserRow,
      securityRows,
      mqttStatus: mqttStatusQuery.data,
      smtpPortBySecurity: SMTP_PORT_BY_SECURITY,
      nozzleDiameterOptions: NOZZLE_DIAMETER_OPTIONS,
    },
    actions: {
      refreshAll,
      setSection,
      setUserPanel,
      setDraft,
      setNavigationOrderDraft,
      setNewApiKeyName,
      setCreatedApiKey,
      setCameraTokenForm,
      setCreatedCameraToken,
      setCameraTokenInfoVisible,
      setEditingExternalLink,
      setExternalLinkModalVisible,
      setExternalLinkForm,
      setPendingDeleteExternalLink,
      setCustomNavModalVisible,
      setEditingCustomNav,
      setCustomNavForm,
      setEditingExternalCamera,
      setExternalCameraModalVisible,
      setExternalCameraForm,
      setPendingDeleteExternalCamera,
      closeExternalCameraModal,
      openExternalCameraModal,
      handleSaveExternalCamera,
      setVirtualPrinterModalVisible,
      setEditingVirtualPrinter,
      setVirtualPrinterForm,
      setPendingDeleteVirtualPrinter,
      setGithubBackupForm,
      setSmtpForm,
      setSmtpTestEmail,
      setMqttForm: setMqttFormState,
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
      closeCustomNavModal,
      openCustomNavModal,
      handleSaveCustomNav,
      closeVirtualPrinterModal,
      openVirtualPrinterModal,
      handleProviderSave,
      handlePlugSave,
      handleSaveSMTP,
      handleSaveLDAP,
      handleSaveExternalLink,
      handleSaveVirtualPrinter,
      handleSaveGitHubBackup,
      handleSaveKProfile,
      setKprofileForm: (value: KProfileFormState | ((current: KProfileFormState) => KProfileFormState)) => {
        if (typeof value === 'function') {
          setKprofileModal(current => ({ ...current, form: (value as (current: KProfileFormState) => KProfileFormState)(current.form) }));
        } else {
          setKprofileModal(current => ({ ...current, form: value }));
        }
      },
      setKprofileModalVisible: (visible: boolean) => setKprofileModal(current => ({ ...current, visible })),
      setEditingKProfile: (profile: KProfile | null) => setKprofileModal(current => ({ ...current, editingKProfile: profile })),
      closeKProfileModal,
      openKProfileModal,
      setPendingDeleteKProfile,
      showToast,
      queryClient,
      setLocationModalVisible,
      setEditingLocation,
      setLocationForm: (value: StorageLocationFormState | ((current: StorageLocationFormState) => StorageLocationFormState)) => {
        if (typeof value === 'function') {
          setLocationForm(value as (current: StorageLocationFormState) => StorageLocationFormState);
        } else {
          setLocationForm(value);
        }
      },
      setPendingDeleteLocation,
      closeLocationModal,
      openLocationModal,
      handleSaveLocation,
    },
  };
}

export type SettingsScreenController = ReturnType<typeof useSettingsScreenController>;
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
