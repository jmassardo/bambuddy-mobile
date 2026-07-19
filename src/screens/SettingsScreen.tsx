
import Clipboard from '@react-native-clipboard/clipboard';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { api } from '@/api/client';
import { AlertModal } from '@/components/common/AlertModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  Chip,
  InlineTabBar,
  PrimaryButton,
  SectionCard,
  SettingRow,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
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
  TwoFAStatus,
} from '@/types/api';
import { formatDateTime, pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';

type SectionKey =
  | 'general'
  | 'plugs'
  | 'notifications'
  | 'queue'
  | 'filament'
  | 'network'
  | 'apikeys'
  | 'virtual-printer'
  | 'spoolbuddy'
  | 'failure-detection'
  | 'users'
  | 'backup';

type UserPanelKey = 'auth' | 'email' | 'ldap' | 'oidc' | 'twofa';
type SmtpSecurity = SMTPSettings['smtp_security'];
type SmartPlugType = SmartPlug['plug_type'];

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

type SmartPlugFormState = {
  name: string;
  plug_type: SmartPlugType;
  ip_address: string;
  username: string;
  password: string;
  ha_entity_id: string;
  mqtt_power_topic: string;
  mqtt_state_topic: string;
  rest_on_url: string;
  rest_off_url: string;
  enabled: boolean;
};

type ProviderFormState = {
  name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  is_enabled: boolean;
};

type CameraTokenFormState = {
  name: string;
  expiresInDays: string;
};

type ExternalLinkFormState = {
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  sort_order: string;
};

type VirtualPrinterFormState = {
  name: string;
  model: string;
  model_name: string;
  serial: string;
  serial_number: string;
  enabled: boolean;
};

type GitHubBackupFormState = {
  repository_url: string;
  access_token: string;
  branch: string;
  provider: 'github' | 'gitea' | 'forgejo' | 'gitlab';
  enabled: boolean;
  schedule_enabled: boolean;
  schedule_type: 'hourly' | 'daily' | 'weekly';
  schedule_time: string;
  allow_insecure_http: boolean;
  backup_settings: boolean;
  backup_spools: boolean;
  backup_archives: boolean;
  backup_kprofiles: boolean;
  backup_cloud_profiles: boolean;
};

const SECTION_ITEMS: Array<{ key: SectionKey; icon: string; title: string; description: string }> = [
  { key: 'general', icon: 'settings', title: 'General', description: 'Locale, archive defaults, print defaults, pricing, and update settings.' },
  { key: 'plugs', icon: 'power', title: 'Plugs', description: 'Smart plug inventory, online state, power controls, and device management.' },
  { key: 'notifications', icon: 'bell', title: 'Notifications', description: 'Provider status and shortcuts into user notification settings.' },
  { key: 'queue', icon: 'list-ordered', title: 'Queue', description: 'Default print options, preheat, staggering, and slicer preferences.' },
  { key: 'filament', icon: 'package', title: 'Filament', description: 'Warnings, Spoolman, RFID handling, and forecasting defaults.' },
  { key: 'network', icon: 'globe', title: 'Network', description: 'External URLs, MQTT, FTP retry, Prometheus, and Home Assistant.' },
  { key: 'apikeys', icon: 'key', title: 'API Keys', description: 'Create and revoke API keys for scripts and integrations.' },
  { key: 'virtual-printer', icon: 'printer', title: 'Virtual Printer', description: 'Virtual printer status plus start and stop controls.' },
  { key: 'spoolbuddy', icon: 'nfc', title: 'SpoolBuddy', description: 'Devices, NFC/scales, and calibration shortcuts.' },
  { key: 'failure-detection', icon: 'shield', title: 'Failure Detection', description: 'Obico service status and model settings.' },
  { key: 'users', icon: 'users', title: 'Users & Security', description: 'Auth, SMTP, LDAP, OIDC, and 2FA management.' },
  { key: 'backup', icon: 'download', title: 'Backup', description: 'Local backups, exports, GitHub backup status, and recovery.' },
];

const LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
  { key: 'fr', label: 'Français' },
  { key: 'it', label: 'Italiano' },
  { key: 'ja', label: '日本語' },
  { key: 'pt-BR', label: 'Português (BR)' },
] as const;

const NOTIFICATION_LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
] as const;

const DATE_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'us', label: 'MM/DD/YYYY' },
  { key: 'eu', label: 'DD/MM/YYYY' },
  { key: 'iso', label: 'YYYY-MM-DD' },
] as const;

const TIME_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: '12h', label: '12 hour' },
  { key: '24h', label: '24 hour' },
] as const;

const CURRENCY_OPTIONS = [
  { key: 'USD', label: 'USD' },
  { key: 'EUR', label: 'EUR' },
  { key: 'GBP', label: 'GBP' },
  { key: 'CAD', label: 'CAD' },
  { key: 'AUD', label: 'AUD' },
  { key: 'JPY', label: 'JPY' },
] as const;

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

const SMART_PLUG_TYPE_OPTIONS: Array<{ key: SmartPlugType; label: string }> = [
  { key: 'tasmota', label: 'Tasmota' },
  { key: 'homeassistant', label: 'Home Assistant' },
  { key: 'mqtt', label: 'MQTT' },
  { key: 'rest', label: 'REST' },
];

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

const EMPTY_CAMERA_TOKEN_FORM: CameraTokenFormState = {
  name: '',
  expiresInDays: '90',
};

const EMPTY_EXTERNAL_LINK_FORM: ExternalLinkFormState = {
  name: '',
  url: '',
  icon: 'link',
  open_in_new_tab: true,
  sort_order: '0',
};

const EMPTY_VIRTUAL_PRINTER_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  model_name: 'BL-P001',
  serial: '',
  serial_number: '',
  enabled: false,
};

const EMPTY_GITHUB_BACKUP_FORM: GitHubBackupFormState = {
  repository_url: '',
  access_token: '',
  branch: 'main',
  provider: 'github',
  enabled: true,
  schedule_enabled: false,
  schedule_type: 'daily',
  schedule_time: '02:00',
  allow_insecure_http: false,
  backup_settings: false,
  backup_spools: false,
  backup_archives: false,
  backup_kprofiles: true,
  backup_cloud_profiles: true,
};

const EMPTY_SMART_PLUG_FORM: SmartPlugFormState = {
  name: '',
  plug_type: 'tasmota',
  ip_address: '',
  username: '',
  password: '',
  ha_entity_id: '',
  mqtt_power_topic: '',
  mqtt_state_topic: '',
  rest_on_url: '',
  rest_off_url: '',
  enabled: true,
};

function summarize(section: SectionKey, queries: Record<string, unknown>) {
  const settings = (queries.settings ?? {}) as ApiRecord;
  switch (section) {
    case 'general':
      return `${pickString(settings, ['language'], 'en')} • ${pickString(settings, ['date_format'], 'system')}`;
    case 'plugs':
      return `${((queries.smartPlugs as SmartPlug[] | undefined) ?? []).length} smart plugs`;
    case 'notifications':
      return `${((queries.notificationProviders as ApiRecord[] | undefined) ?? []).length} providers`;
    case 'queue':
      return pickBoolean(settings, ['preheat_enabled']) ? 'Preheat enabled' : 'Preheat disabled';
    case 'filament':
      return `Low stock ${pickNumber(settings, ['low_stock_threshold'], 20)}%`;
    case 'network':
      return pickBoolean(settings, ['mqtt_enabled']) ? 'MQTT enabled' : 'MQTT disabled';
    case 'apikeys':
      return `${((queries.apiKeys as ApiRecord[] | undefined) ?? []).length} keys • ${((queries.cameraTokens as ApiRecord[] | undefined) ?? []).length} camera tokens`;
    case 'virtual-printer':
      return `${((queries.virtualPrinters as ApiRecord[] | undefined) ?? []).length} virtual printers`;
    case 'spoolbuddy':
      return `${((queries.spoolbuddyDevices as ApiRecord[] | undefined) ?? []).length} devices`;
    case 'failure-detection':
      return pickBoolean(queries.obicoStatus, ['enabled']) ? 'Enabled' : 'Disabled';
    case 'users':
      return pickBoolean(queries.advancedAuthStatus, ['advanced_auth_enabled']) ? 'Security enabled' : 'Basic auth';
    case 'backup':
      return pickString(queries.githubBackupStatus, ['last_backup_status'], 'No recent backup');
    default:
      return '';
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

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
  const [, setCameraTokenInfoVisible] = useState(false);
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
  const totpSetupQuery = useQuery({
    queryKey: ['totp-setup'],
    queryFn: api.setupTOTP,
    enabled: showTOTPSetup,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data as ApiRecord);
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
    mutationFn: () => api.updateSettings(draft),
    onSuccess: async data => {
      setDraft(data as ApiRecord);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save settings.', 'error'),
  });

  const createApiKeyMutation = useMutation({
    mutationFn: () => api.createApiKey({ name: newApiKeyName.trim() }),
    onSuccess: async data => {
      setCreatedApiKey(pickString(data, ['key'], ''));
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
      setCreatedCameraToken(pickString(data, ['token']));
      setCameraTokenInfoVisible(true);
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

  const createExternalLinkMutation = useMutation({
    mutationFn: (payload: ExternalLinkFormState) => api.createExternalLink(payload),
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
    mutationFn: ({ id, payload }: { id: number; payload: ExternalLinkFormState }) =>
      api.updateExternalLink(id, payload),
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
    mutationFn: (id: number) => api.deleteExternalLink(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setPendingDeleteExternalLink(null);
      showToast('External link removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete external link.', 'error'),
  });

  const backupMutation = useMutation({
    mutationFn: api.triggerLocalBackup,
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
    mutationFn: api.triggerGitHubBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup triggered.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to run GitHub backup.', 'error'),
  });

  const saveGitHubBackupMutation = useMutation({
    mutationFn: () => {
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
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update virtual printer.', 'error'),
  });

  const saveVirtualPrinterMutation = useMutation({
    mutationFn: () => {
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
    mutationFn: (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setPendingDeleteVirtualPrinter(null);
      showToast('Virtual printer deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete virtual printer.', 'error'),
  });

  const calibrateSpoolbuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
      showToast('Calibration command sent.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to calibrate device.', 'error'),
  });

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

  const testSpoolmanMutation = useMutation({
    mutationFn: api.connectSpoolman,
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ['spoolmanStatus'] });
      showToast(pickString(data, ['message'], 'Spoolman connected.'), 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to connect to Spoolman.', 'error'),
  });

  const testObicoMutation = useMutation({
    mutationFn: (url: string) => api.testObicoConnection(url),
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

  const createSmartPlugMutation = useMutation({
    mutationFn: (payload: SmartPlugCreate) => api.createSmartPlug(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save smart plug.', 'error'),
  });

  const updateSmartPlugMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SmartPlugUpdate }) => api.updateSmartPlug(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      closePlugModal();
      showToast('Smart plug updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update smart plug.', 'error'),
  });

  const deleteSmartPlugMutation = useMutation({
    mutationFn: (id: number) => api.deleteSmartPlug(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      setPlugDeleteTarget(null);
      showToast('Smart plug deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete smart plug.', 'error'),
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

  const sectionSummaries = useMemo(
    () => ({
      settings: settingsQuery.data,
      smartPlugs: smartPlugsQuery.data,
      notificationProviders: providersQuery.data,
      apiKeys: apiKeysQuery.data,
      cameraTokens: cameraTokensQuery.data,
      virtualPrinters: Array.isArray(virtualPrinterListQuery.data?.printers) ? virtualPrinterListQuery.data.printers : [],
      spoolbuddyDevices: spoolbuddyQuery.data,
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
      const nextForm: ExternalLinkFormState = {
        name: pickString(link, ['name']),
        url: pickString(link, ['url']),
        icon: pickString(link, ['icon'], 'link'),
        open_in_new_tab: pickBoolean(link, ['open_in_new_tab'], true),
        sort_order: String(pickNumber(link, ['sort_order'], 0)),
      };
      setExternalLinkForm(nextForm);
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
      const nextForm: VirtualPrinterFormState = {
        name: pickString(printer, ['name'], 'Bambuddy'),
        model: pickString(printer, ['model'], 'BL-P001'),
        model_name: pickString(printer, ['model', 'model_name'], 'BL-P001'),
        serial: pickString(printer, ['serial'], ''),
        serial_number: pickString(printer, ['serial', 'serial_number'], ''),
        enabled: pickBoolean(printer, ['enabled', 'status.running']),
      };
      setVirtualPrinterForm(nextForm);
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
    } else {
      createOIDCProviderMutation.mutate(payload as OIDCProviderCreate);
    }
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
    } else {
      createSmartPlugMutation.mutate(payload);
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
    () =>
      ((usersQuery.data ?? []) as ApiRecord[]).find(row => pickNumber(row, ['id']) === user?.id) ?? null,
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

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void refreshAll()} />;
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              settingsQuery.isRefetching ||
              smartPlugsQuery.isRefetching ||
              apiKeysQuery.isRefetching ||
              cameraTokensQuery.isRefetching ||
              externalLinksQuery.isRefetching ||
              virtualPrinterListQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Mobile settings panels with the same core controls exposed on the web.</Text>
        </View>

        {section === null ? (
          SECTION_ITEMS.map(item => (
            <SectionCard
              key={item.key}
              title={item.title}
              subtitle={item.description}
              right={<StatusBadge label={summarize(item.key, sectionSummaries)} color={colors.accent} />}
            >
              <SettingRow
                icon={item.icon}
                label={`Open ${item.title}`}
                description={item.description}
                onPress={() => {
                  setSection(item.key);
                  if (item.key === 'users') setUserPanel('auth');
                }}
              />
            </SectionCard>
          ))
        ) : (
          <>
            <PrimaryButton label="Back to sections" variant="secondary" onPress={() => setSection(null)} />

            {section === 'general' ? (
              <>
                <SectionCard title="Appearance & locale" subtitle="Language, date, time, and theme preferences.">
                  <InlineTabBar
                    value={mode}
                    tabs={[
                      { key: 'dark', label: 'Dark' },
                      { key: 'light', label: 'Light' },
                      { key: 'system', label: 'System' },
                    ]}
                    onChange={value => setMode(value as 'dark' | 'light' | 'system')}
                  />
                  <OptionChipsField
                    label="Language"
                    value={pickString(draft, ['language'], 'en')}
                    options={LANGUAGE_OPTIONS}
                    onChange={value => setDraft(current => ({ ...current, language: value }))}
                  />
                  <OptionChipsField
                    label="Notification language"
                    value={pickString(draft, ['notification_language'], 'en')}
                    options={NOTIFICATION_LANGUAGE_OPTIONS}
                    onChange={value => setDraft(current => ({ ...current, notification_language: value }))}
                  />
                  <View style={styles.twoColumnGrid}>
                    <View style={styles.twoColumnCell}>
                      <OptionChipsField
                        label="Date format"
                        value={pickString(draft, ['date_format'], 'system')}
                        options={DATE_FORMAT_OPTIONS}
                        onChange={value => setDraft(current => ({ ...current, date_format: value }))}
                      />
                    </View>
                    <View style={styles.twoColumnCell}>
                      <OptionChipsField
                        label="Time format"
                        value={pickString(draft, ['time_format'], 'system')}
                        options={TIME_FORMAT_OPTIONS}
                        onChange={value => setDraft(current => ({ ...current, time_format: value }))}
                      />
                    </View>
                  </View>
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Temperatures are currently stored and reported by the server in Celsius.</Text>
                </SectionCard>

                <SectionCard title="Archiving & capture" subtitle="Archive behavior, thumbnails, finish photos, and timelapse defaults.">
                  <SwitchRow
                    label="Auto archive"
                    description="Automatically archive finished prints."
                    value={pickBoolean(draft, ['auto_archive'])}
                    onValueChange={value => setDraft(current => ({ ...current, auto_archive: value }))}
                  />
                  <SwitchRow
                    label="Save thumbnails"
                    description="Extract preview images from uploaded print files."
                    value={pickBoolean(draft, ['save_thumbnails'])}
                    onValueChange={value => setDraft(current => ({ ...current, save_thumbnails: value }))}
                  />
                  <SwitchRow
                    label="Capture finish photo"
                    description="Keep the final print image when a job completes."
                    value={pickBoolean(draft, ['capture_finish_photo'])}
                    onValueChange={value => setDraft(current => ({ ...current, capture_finish_photo: value }))}
                  />
                </SectionCard>

                <SectionCard title="Default print options" subtitle="Applied when starting new prints from the app.">
                  <SwitchRow
                    label="Bed leveling"
                    description="Auto-level bed before starting the print."
                    value={pickBoolean(draft, ['default_bed_levelling'], true)}
                    onValueChange={value => setDraft(current => ({ ...current, default_bed_levelling: value }))}
                  />
                  <SwitchRow
                    label="Flow calibration"
                    description="Run extrusion flow calibration."
                    value={pickBoolean(draft, ['default_flow_cali'])}
                    onValueChange={value => setDraft(current => ({ ...current, default_flow_cali: value }))}
                  />
                  <SwitchRow
                    label="Vibration calibration"
                    description="Reduce ringing before the print starts."
                    value={pickBoolean(draft, ['default_vibration_cali'], true)}
                    onValueChange={value => setDraft(current => ({ ...current, default_vibration_cali: value }))}
                  />
                  <SwitchRow
                    label="First layer inspection"
                    description="Enable AI first-layer checks by default."
                    value={pickBoolean(draft, ['default_layer_inspect'])}
                    onValueChange={value => setDraft(current => ({ ...current, default_layer_inspect: value }))}
                  />
                  <SwitchRow
                    label="Timelapse"
                    description="Record timelapse video for new prints by default."
                    value={pickBoolean(draft, ['default_timelapse'])}
                    onValueChange={value => setDraft(current => ({ ...current, default_timelapse: value }))}
                  />
                  <SwitchRow
                    label="Nozzle offset calibration"
                    description="Useful on dual-nozzle printers."
                    value={pickBoolean(draft, ['default_nozzle_offset_cali'], true)}
                    onValueChange={value => setDraft(current => ({ ...current, default_nozzle_offset_cali: value }))}
                  />
                </SectionCard>

                <SectionCard title="Electricity pricing & updates" subtitle="Cost tracking defaults and version checks.">
                  <OptionChipsField
                    label="Currency"
                    value={pickString(draft, ['currency'], 'USD')}
                    options={CURRENCY_OPTIONS}
                    onChange={value => setDraft(current => ({ ...current, currency: value }))}
                  />
                  <TextField
                    label="Default filament cost / kg"
                    value={stringifyNumberField(draft.default_filament_cost, '25')}
                    onChangeText={value => setDraft(current => ({ ...current, default_filament_cost: parseFloat(value) || 0 }))}
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Price per kWh"
                    value={stringifyNumberField(draft.energy_cost_per_kwh, '0.15')}
                    onChangeText={value => setDraft(current => ({ ...current, energy_cost_per_kwh: parseFloat(value) || 0 }))}
                    keyboardType="decimal-pad"
                  />
                  <SwitchRow
                    label="Check for updates"
                    description="Automatically look for Bambuddy updates."
                    value={pickBoolean(draft, ['check_updates'], true)}
                    onValueChange={value => setDraft(current => ({ ...current, check_updates: value }))}
                  />
                  <SwitchRow
                    label="Check printer firmware"
                    description="Include printer firmware updates in the check flow."
                    value={pickBoolean(draft, ['check_printer_firmware'], true)}
                    onValueChange={value => setDraft(current => ({ ...current, check_printer_firmware: value }))}
                  />
                  <SwitchRow
                    label="Include beta updates"
                    description="Receive prerelease update notifications."
                    value={pickBoolean(draft, ['include_beta_updates'])}
                    onValueChange={value => setDraft(current => ({ ...current, include_beta_updates: value }))}
                    disabled={!pickBoolean(draft, ['check_updates'], true)}
                  />
                </SectionCard>
              </>
            ) : null}

            {section === 'plugs' ? (
              <>
                <SectionCard title="Smart plugs" subtitle="Add, edit, test, and control power devices.">
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Manage Tasmota, Home Assistant, MQTT, and REST-based plugs from mobile.</Text>
                  <PrimaryButton
                    label={editingPlug ? 'Editing plug…' : 'Add smart plug'}
                    variant="secondary"
                    onPress={() => openPlugModal()}
                    disabled={!canManageSmartPlugs}
                  />
                </SectionCard>
                {(smartPlugsQuery.data ?? []).length > 0 ? (
                  (smartPlugsQuery.data ?? []).map(plug => (
                    <SmartPlugCardMobile
                      key={plug.id}
                      plug={plug}
                      canControl={canControlSmartPlugs}
                      canEdit={canManageSmartPlugs}
                      canDelete={canDeleteSmartPlugs}
                      onEdit={() => openPlugModal(plug)}
                      onDelete={() => setPlugDeleteTarget(plug)}
                    />
                  ))
                ) : (
                  <EmptyState icon="⏻" title="No smart plugs" message="Create a plug to monitor online status and power state here." />
                )}
              </>
            ) : null}

            {section === 'notifications' ? (
              <SectionCard title="Notifications" subtitle="Provider status plus a shortcut to the dedicated notification preferences screen.">
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Providers: {((providersQuery.data ?? []) as ApiRecord[]).length}</Text>
                {((providersQuery.data ?? []) as ApiRecord[]).slice(0, 5).map(provider => (
                  <View key={pickString(provider, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemText}>
                        <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(provider, ['name'], 'Provider')}</Text>
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(provider, ['type', 'provider_type'], 'Unknown type')}</Text>
                      </View>
                      <StatusBadge label={pickBoolean(provider, ['enabled']) ? 'enabled' : 'disabled'} color={statusColor(pickBoolean(provider, ['enabled']) ? 'success' : 'offline', colors)} />
                    </View>
                  </View>
                ))}
                <PrimaryButton label="Open notification preferences" onPress={() => navigation.navigate('Notifications')} variant="secondary" />
              </SectionCard>
            ) : null}

            {section === 'queue' ? (
              <>
                <SectionCard title="Default print options" subtitle="Applied when a new job is started.">
                  {[
                    ['default_bed_levelling', 'Bed leveling'],
                    ['default_flow_cali', 'Flow calibration'],
                    ['default_vibration_cali', 'Vibration calibration'],
                    ['default_layer_inspect', 'First layer inspection'],
                    ['default_timelapse', 'Timelapse'],
                    ['default_nozzle_offset_cali', 'Nozzle offset calibration'],
                  ].map(([key, label]) => (
                    <SwitchRow
                      key={key}
                      label={label}
                      value={pickBoolean(draft, [key])}
                      onValueChange={value => setDraft(current => ({ ...current, [key]: value }))}
                    />
                  ))}
                </SectionCard>
                <SectionCard title="Dispatch behavior" subtitle="Queue ordering, preheat, plate confirmation, and staggering.">
                  <SwitchRow label="Shortest job first" value={pickBoolean(draft, ['queue_shortest_first'])} onValueChange={value => setDraft(current => ({ ...current, queue_shortest_first: value }))} />
                  <SwitchRow label="Require plate clear confirmation" value={pickBoolean(draft, ['require_plate_clear'])} onValueChange={value => setDraft(current => ({ ...current, require_plate_clear: value }))} />
                  <SwitchRow label="Preheat before queued prints" value={pickBoolean(draft, ['preheat_enabled'])} onValueChange={value => setDraft(current => ({ ...current, preheat_enabled: value }))} />
                  <TextField label="Stagger group size" value={stringifyNumberField(draft.stagger_group_size, '1')} onChangeText={value => setDraft(current => ({ ...current, stagger_group_size: Number(value) || 1 }))} keyboardType="number-pad" />
                  <TextField label="Stagger interval (minutes)" value={stringifyNumberField(draft.stagger_interval_minutes, '0')} onChangeText={value => setDraft(current => ({ ...current, stagger_interval_minutes: Number(value) || 0 }))} keyboardType="number-pad" />
                  <TextField label="Preheat max wait (seconds)" value={stringifyNumberField(draft.preheat_max_wait_seconds, '900')} onChangeText={value => setDraft(current => ({ ...current, preheat_max_wait_seconds: Number(value) || 900 }))} keyboardType="number-pad" />
                  <TextField label="Preheat soak (seconds)" value={stringifyNumberField(draft.preheat_soak_seconds, '300')} onChangeText={value => setDraft(current => ({ ...current, preheat_soak_seconds: Number(value) || 300 }))} keyboardType="number-pad" />
                  <TextField label="Max pipeline copies" value={stringifyNumberField(draft.pipeline_max_copies, '1')} onChangeText={value => setDraft(current => ({ ...current, pipeline_max_copies: Number(value) || 1 }))} keyboardType="number-pad" />
                  <TextField label="Preferred slicer" value={pickString(draft, ['preferred_slicer'], 'bambu_studio')} onChangeText={value => setDraft(current => ({ ...current, preferred_slicer: value }))} />
                  <SwitchRow label="Use slicer API" value={pickBoolean(draft, ['use_slicer_api'])} onValueChange={value => setDraft(current => ({ ...current, use_slicer_api: value }))} />
                </SectionCard>
              </>
            ) : null}

            {section === 'filament' ? (
              <>
                <SectionCard title="Filament warnings" subtitle="Stock thresholds, matching rules, and tracking defaults.">
                  <SwitchRow label="Disable filament warnings" value={pickBoolean(draft, ['disable_filament_warnings'])} onValueChange={value => setDraft(current => ({ ...current, disable_filament_warnings: value }))} />
                  <SwitchRow label="Prefer lowest filament" value={pickBoolean(draft, ['prefer_lowest_filament'])} onValueChange={value => setDraft(current => ({ ...current, prefer_lowest_filament: value }))} />
                  <SwitchRow label="Expand print modal mapping" value={pickBoolean(draft, ['per_printer_mapping_expanded'])} onValueChange={value => setDraft(current => ({ ...current, per_printer_mapping_expanded: value }))} />
                  <TextField label="Low stock threshold (%)" value={stringifyNumberField(draft.low_stock_threshold, '20')} onChangeText={value => setDraft(current => ({ ...current, low_stock_threshold: Number(value) || 20 }))} keyboardType="number-pad" />
                  <TextField label="Forecast lead time (days)" value={stringifyNumberField(draft.forecast_global_lead_time_days, '14')} onChangeText={value => setDraft(current => ({ ...current, forecast_global_lead_time_days: Number(value) || 14 }))} keyboardType="number-pad" />
                </SectionCard>
                <SectionCard title="Spoolman & RFID" subtitle="Tracking source, connection, and unknown tag behavior.">
                  <SwitchRow label="Spoolman enabled" value={pickBoolean(draft, ['spoolman_enabled'])} onValueChange={value => setDraft(current => ({ ...current, spoolman_enabled: value }))} />
                  <SwitchRow label="Auto add unknown RFID" value={pickBoolean(draft, ['auto_add_unknown_rfid'])} onValueChange={value => setDraft(current => ({ ...current, auto_add_unknown_rfid: value }))} />
                  <TextField label="Spoolman URL" value={pickString(draft, ['spoolman_url'])} onChangeText={value => setDraft(current => ({ ...current, spoolman_url: value }))} autoCapitalize="none" />
                  <TextField label="AMS history retention (days)" value={stringifyNumberField(draft.ams_history_retention_days, '30')} onChangeText={value => setDraft(current => ({ ...current, ams_history_retention_days: Number(value) || 30 }))} keyboardType="number-pad" />
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>
                    Status: {spoolmanStatusQuery.data?.connected ? 'connected' : 'disconnected'} • {pickString(spoolmanStatusQuery.data, ['url'], pickString(draft, ['spoolman_url'], 'No URL set'))}
                  </Text>
                  <PrimaryButton
                    label={testSpoolmanMutation.isPending ? 'Testing…' : 'Test connection'}
                    variant="secondary"
                    onPress={() => void testSpoolmanMutation.mutateAsync()}
                    loading={testSpoolmanMutation.isPending}
                    disabled={testSpoolmanMutation.isPending || !pickString(draft, ['spoolman_url']).trim() || !pickBoolean(draft, ['spoolman_enabled'])}
                  />
                </SectionCard>
              </>
            ) : null}

            {section === 'network' ? (
              <>
                <SectionCard title="Network endpoints" subtitle="External URL plus retry and automation integrations.">
                  <TextField label="External URL" value={pickString(draft, ['external_url'])} onChangeText={value => setDraft(current => ({ ...current, external_url: value }))} autoCapitalize="none" />
                  <SwitchRow label="FTP retry enabled" value={pickBoolean(draft, ['ftp_retry_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ftp_retry_enabled: value }))} />
                  <TextField label="FTP retry count" value={stringifyNumberField(draft.ftp_retry_count, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_count: Number(value) || 0 }))} keyboardType="number-pad" />
                  <TextField label="FTP retry delay (s)" value={stringifyNumberField(draft.ftp_retry_delay, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_delay: Number(value) || 0 }))} keyboardType="number-pad" />
                </SectionCard>
                <SectionCard title="External links" subtitle="Quick links for Grafana, Home Assistant, and other tools.">
                  <PrimaryButton label="Add external link" variant="secondary" onPress={() => openExternalLinkModal()} />
                  {((externalLinksQuery.data ?? []) as ApiRecord[]).length > 0 ? (
                    ((externalLinksQuery.data ?? []) as ApiRecord[]).map(link => (
                      <View key={pickString(link, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                        <View style={styles.itemHeader}>
                          <View style={styles.itemText}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(link, ['name'], 'External link')}</Text>
                            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(link, ['url'])}</Text>
                          </View>
                          <StatusBadge label={pickBoolean(link, ['open_in_new_tab'], true) ? 'external' : 'embedded'} color={colors.accent} />
                        </View>
                        <View style={styles.actions}>
                          <PrimaryButton label="Edit" variant="secondary" onPress={() => openExternalLinkModal(link)} />
                          <PrimaryButton label="Delete" variant="danger" onPress={() => setPendingDeleteExternalLink(link)} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <EmptyState icon="🔗" title="No external links" message="Add Grafana, Home Assistant, or any other dashboard link." />
                  )}
                </SectionCard>
                <SectionCard title="MQTT, Home Assistant, Prometheus" subtitle="Publish data to your automation stack.">
                  <SwitchRow label="MQTT enabled" value={pickBoolean(draft, ['mqtt_enabled'])} onValueChange={value => setDraft(current => ({ ...current, mqtt_enabled: value }))} />
                  <TextField label="MQTT broker" value={pickString(draft, ['mqtt_broker'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_broker: value }))} />
                  <TextField label="MQTT port" value={stringifyNumberField(draft.mqtt_port, '1883')} onChangeText={value => setDraft(current => ({ ...current, mqtt_port: Number(value) || 1883 }))} keyboardType="number-pad" />
                  <TextField label="MQTT topic prefix" value={pickString(draft, ['mqtt_topic_prefix'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_topic_prefix: value }))} />
                  <SwitchRow label="Home Assistant enabled" value={pickBoolean(draft, ['ha_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ha_enabled: value }))} />
                  <TextField label="Home Assistant URL" value={pickString(draft, ['ha_url'])} onChangeText={value => setDraft(current => ({ ...current, ha_url: value }))} autoCapitalize="none" />
                  <SwitchRow label="Prometheus enabled" value={pickBoolean(draft, ['prometheus_enabled'])} onValueChange={value => setDraft(current => ({ ...current, prometheus_enabled: value }))} />
                  <TextField label="Prometheus token" value={pickString(draft, ['prometheus_token'])} onChangeText={value => setDraft(current => ({ ...current, prometheus_token: value }))} autoCapitalize="none" />
                </SectionCard>
              </>
            ) : null}

            {section === 'apikeys' ? (
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
                  <TextField
                    label="Token name"
                    value={cameraTokenForm.name}
                    onChangeText={value => setCameraTokenForm(current => ({ ...current, name: value }))}
                    placeholder="Home Assistant"
                  />
                  <TextField
                    label="Expires in (days)"
                    value={cameraTokenForm.expiresInDays}
                    onChangeText={value => setCameraTokenForm(current => ({ ...current, expiresInDays: value }))}
                    keyboardType="number-pad"
                  />
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
                          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                            Expires {formatDateTime(pickString(token, ['expires_at']))} • Last used {formatDateTime(pickString(token, ['last_used_at']))}
                          </Text>
                          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Prefix: {pickString(token, ['lookup_prefix'], '—')}</Text>
                        </View>
                        <PrimaryButton label="Revoke" variant="danger" onPress={() => void revokeCameraTokenMutation.mutateAsync(pickNumber(token, ['id']))} />
                      </View>
                    </View>
                  ))}
                </SectionCard>
              </>
            ) : null}

            {section === 'virtual-printer' ? (
              <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
                <PrimaryButton label="Create virtual printer" variant="secondary" onPress={() => openVirtualPrinterModal()} />
                {virtualPrinterItems.length > 0 ? (
                  virtualPrinterItems.map(printer => {
                    const running = pickBoolean(printer, ['status.running', 'running', 'enabled']);
                    return (
                      <View key={pickString(printer, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                        <View style={styles.itemHeader}>
                          <View style={styles.itemText}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(printer, ['name'], 'Virtual printer')}</Text>
                            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                              {pickString(printer, ['model_name', 'model'], 'Unknown model')} • Pending {pickString(printer, ['status.pending_files'], '0')}
                            </Text>
                          </View>
                          <StatusBadge label={running ? 'running' : 'stopped'} color={statusColor(running ? 'success' : 'offline', colors)} />
                        </View>
                        <View style={styles.actions}>
                          <PrimaryButton label="Start" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'start' })} />
                          <PrimaryButton label="Stop" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'stop' })} />
                          <PrimaryButton label="Edit" variant="secondary" onPress={() => openVirtualPrinterModal(printer)} />
                          <PrimaryButton label="Delete" variant="danger" onPress={() => setPendingDeleteVirtualPrinter(printer)} />
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <EmptyState icon="🖨" title="No virtual printers" message="Create virtual printers on the server to manage them here." />
                )}
              </SectionCard>
            ) : null}

            {section === 'spoolbuddy' ? (
              <SectionCard title="SpoolBuddy devices" subtitle="Online device status, sensors, and calibration shortcuts.">
                {((spoolbuddyQuery.data ?? []) as ApiRecord[]).length > 0 ? (
                  ((spoolbuddyQuery.data ?? []) as ApiRecord[]).map(device => (
                    <View key={pickString(device, ['id', 'device_id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                      <View style={styles.itemHeader}>
                        <View style={styles.itemText}>
                          <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}</Text>
                          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Last seen: {pickString(device, ['last_seen'], 'Unknown')}</Text>
                        </View>
                        <StatusBadge label={pickBoolean(device, ['online']) ? 'online' : 'offline'} color={statusColor(pickBoolean(device, ['online']) ? 'success' : 'offline', colors)} />
                      </View>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>NFC: {pickBoolean(device, ['has_nfc']) ? 'yes' : 'no'} • Scale: {pickBoolean(device, ['has_scale']) ? 'yes' : 'no'}</Text>
                      <PrimaryButton label="Calibrate" variant="secondary" onPress={() => void calibrateSpoolbuddyMutation.mutateAsync(pickString(device, ['device_id']))} />
                    </View>
                  ))
                ) : (
                  <EmptyState icon="📡" title="No devices found" message="SpoolBuddy devices will appear here when they connect." />
                )}
              </SectionCard>
            ) : null}

            {section === 'failure-detection' ? (
              <SectionCard title="Failure detection" subtitle="Obico service configuration and current runtime state.">
                <SwitchRow label="Failure detection enabled" value={pickBoolean(draft, ['obico_enabled'])} onValueChange={value => setDraft(current => ({ ...current, obico_enabled: value }))} />
                <TextField label="Server URL" value={pickString(draft, ['obico_ml_url', 'failure_detection.server_url'])} onChangeText={value => setDraft(current => ({ ...current, obico_ml_url: value }))} autoCapitalize="none" />
                <TextField label="API key" value={pickString(draft, ['obico_api_key', 'failure_detection.api_key'])} onChangeText={value => setDraft(current => ({ ...current, obico_api_key: value }))} autoCapitalize="none" secureTextEntry />
                <OptionChipsField
                  label="Sensitivity"
                  value={pickString(draft, ['obico_sensitivity', 'failure_detection.sensitivity'], 'medium')}
                  options={[
                    { key: 'low', label: 'Low' },
                    { key: 'medium', label: 'Medium' },
                    { key: 'high', label: 'High' },
                  ]}
                  onChange={value => setDraft(current => ({ ...current, obico_sensitivity: value }))}
                />
                <OptionChipsField
                  label="Action"
                  value={pickString(draft, ['obico_action'], 'notify')}
                  options={[
                    { key: 'notify', label: 'Notify' },
                    { key: 'pause', label: 'Pause' },
                    { key: 'pause_and_off', label: 'Pause + Power Off' },
                  ]}
                  onChange={value => setDraft(current => ({ ...current, obico_action: value }))}
                />
                <TextField label="Poll interval (s)" value={stringifyNumberField(draft.obico_poll_interval, '30')} onChangeText={value => setDraft(current => ({ ...current, obico_poll_interval: Number(value) || 30 }))} keyboardType="number-pad" />
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Runtime: {pickBoolean(obicoQuery.data, ['enabled']) ? 'enabled' : 'disabled'} • Last error: {pickString(obicoQuery.data, ['last_error'], 'none')}</Text>
                <PrimaryButton
                  label={testObicoMutation.isPending ? 'Testing…' : 'Test connection'}
                  variant="secondary"
                  onPress={() => void testObicoMutation.mutateAsync(pickString(draft, ['obico_ml_url']))}
                  loading={testObicoMutation.isPending}
                  disabled={testObicoMutation.isPending || !pickString(draft, ['obico_ml_url']).trim()}
                />
              </SectionCard>
            ) : null}

            {section === 'users' ? (
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
                  {!isAdmin && userPanel !== 'twofa' ? (
                    <Text style={[styles.helper, { color: colors.warning }]}>Admin rights are required to change shared authentication settings.</Text>
                  ) : null}
                </SectionCard>

                {userPanel === 'auth' ? (
                  <>
                    <SectionCard title="Authentication" subtitle="Session policy, local login, and advanced auth status.">
                      <Text style={[styles.helper, { color: colors.textSecondary }]}>Advanced auth: {advancedAuth?.advanced_auth_enabled ? 'enabled' : 'disabled'} • SMTP configured: {advancedAuth?.smtp_configured ? 'yes' : 'no'}</Text>
                      <SwitchRow
                        label="Local login enabled"
                        description="Allow username/password logins alongside SSO."
                        value={pickBoolean(draft, ['local_login_enabled'], advancedAuth?.local_login_enabled ?? true)}
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
                  </>
                ) : null}

                {userPanel === 'email' ? (
                  <>
                    <SectionCard title="Advanced authentication" subtitle="Email-driven password reset and invite flow.">
                      <Text style={[styles.helper, { color: colors.textSecondary }]}>Status: {advancedAuth?.advanced_auth_enabled ? 'enabled' : 'disabled'}</Text>
                      <PrimaryButton
                        label={toggleAdvancedAuthMutation.isPending ? 'Updating…' : advancedAuth?.advanced_auth_enabled ? 'Disable advanced auth' : 'Enable advanced auth'}
                        variant={advancedAuth?.advanced_auth_enabled ? 'danger' : 'primary'}
                        onPress={() => void toggleAdvancedAuthMutation.mutateAsync(!(advancedAuth?.advanced_auth_enabled ?? false))}
                        disabled={!canManageSecurity || toggleAdvancedAuthMutation.isPending}
                        loading={toggleAdvancedAuthMutation.isPending}
                      />
                    </SectionCard>
                    <SectionCard title="SMTP configuration" subtitle="Server, port, TLS, credentials, and sender settings.">
                      <SwitchRow
                        label="SMTP authentication"
                        description="Disable when your mail server does not require a username/password."
                        value={smtpForm.smtp_auth_enabled}
                        onValueChange={value => setSmtpForm(current => ({
                          ...current,
                          smtp_auth_enabled: value,
                          ...(value ? {} : { smtp_username: '', smtp_password: '' }),
                        }))}
                        disabled={!canManageSecurity}
                      />
                      <TextField label="SMTP host" value={smtpForm.smtp_host} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_host: value }))} autoCapitalize="none" editable={canManageSecurity} />
                      <TextField label="SMTP port" value={String(smtpForm.smtp_port)} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_port: Number(value) || SMTP_PORT_BY_SECURITY[current.smtp_security] }))} keyboardType="number-pad" editable={canManageSecurity} />
                      <OptionChipsField
                        label="Security"
                        value={smtpForm.smtp_security}
                        options={SMTP_SECURITY_OPTIONS}
                        onChange={value => setSmtpForm(current => ({ ...current, smtp_security: value as SmtpSecurity, smtp_port: SMTP_PORT_BY_SECURITY[value as SmtpSecurity] }))}
                        disabled={!canManageSecurity}
                      />
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
                      <Text style={[styles.helper, { color: colors.textSecondary }]}>Configured: {ldapStatus?.ldap_configured ? 'yes' : 'no'} • Enabled: {ldapStatus?.ldap_enabled ? 'yes' : 'no'}</Text>
                      <SwitchRow label="LDAP enabled" description="Turn on LDAP login once the server details below are valid." value={ldapStatus?.ldap_enabled ?? false} onValueChange={value => void toggleLDAPMutation.mutateAsync(value)} disabled={!canManageSecurity || toggleLDAPMutation.isPending} />
                    </SectionCard>
                    <SectionCard title="LDAP server" subtitle="Connection, bind credentials, search base, and filters.">
                      <TextField label="Server URL" value={ldapForm.ldap_server_url} onChangeText={value => setLdapForm(current => ({ ...current, ldap_server_url: value }))} autoCapitalize="none" editable={canManageSecurity} />
                      <OptionChipsField
                        label="Security"
                        value={ldapForm.ldap_security}
                        options={[
                          { key: 'starttls', label: 'STARTTLS' },
                          { key: 'ldaps', label: 'LDAPS' },
                        ]}
                        onChange={value => setLdapForm(current => ({ ...current, ldap_security: value }))}
                        disabled={!canManageSecurity}
                      />
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
                        <SectionCard
                          key={provider.id}
                          title={provider.name}
                          subtitle={provider.issuer_url}
                          right={<StatusBadge label={provider.is_enabled ? 'enabled' : 'disabled'} color={provider.is_enabled ? colors.success : colors.textTertiary} />}
                        >
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
                      <Text style={[styles.helper, { color: colors.textSecondary }]}>Status: {twoFAStatus?.totp_enabled ? 'enabled' : 'disabled'}</Text>
                      {twoFAStatus?.totp_enabled ? (
                        <>
                          <Text style={[styles.helper, { color: colors.textSecondary }]}>Backup codes remaining: {twoFAStatus.backup_codes_remaining}</Text>
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
                      <Text style={[styles.helper, { color: colors.textSecondary }]}>Email: {user?.email || 'No email on account'} • Status: {twoFAStatus?.email_otp_enabled ? 'enabled' : 'disabled'}</Text>
                      {emailSetupToken ? (
                        <>
                          <TextField label="Verification code" value={emailSetupCode} onChangeText={setEmailSetupCode} keyboardType="number-pad" />
                          <View style={styles.actions}>
                            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setEmailSetupToken(null); setEmailSetupCode(''); }} />
                            <PrimaryButton label={confirmEnableEmailOTPMutation.isPending ? 'Verifying…' : 'Verify and enable'} onPress={() => emailSetupToken && void confirmEnableEmailOTPMutation.mutateAsync({ token: emailSetupToken, code: emailSetupCode })} disabled={emailSetupCode.trim().length !== 6 || confirmEnableEmailOTPMutation.isPending} loading={confirmEnableEmailOTPMutation.isPending} />
                          </View>
                        </>
                      ) : twoFAStatus?.email_otp_enabled ? (
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
                        <PrimaryButton
                          label="Copy backup codes"
                          variant="secondary"
                          onPress={() => {
                            Clipboard.setString(backupCodes.join('\n'));
                            showToast('Backup codes copied.', 'success');
                          }}
                        />
                      </SectionCard>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {section === 'backup' ? (
              <>
                <SectionCard title="Local backups" subtitle="Schedule, retention, and ad-hoc backup actions.">
                  <SwitchRow label="Scheduled local backup enabled" value={pickBoolean(draft, ['local_backup_enabled'])} onValueChange={value => setDraft(current => ({ ...current, local_backup_enabled: value }))} />
                  <TextField label="Schedule" value={pickString(draft, ['local_backup_schedule'], 'daily')} onChangeText={value => setDraft(current => ({ ...current, local_backup_schedule: value }))} />
                  <TextField label="Run time" value={pickString(draft, ['local_backup_time'], '02:00')} onChangeText={value => setDraft(current => ({ ...current, local_backup_time: value }))} />
                  <TextField label="Retention" value={stringifyNumberField(draft.local_backup_retention, '7')} onChangeText={value => setDraft(current => ({ ...current, local_backup_retention: Number(value) || 7 }))} keyboardType="number-pad" />
                  <TextField label="Backup path" value={pickString(draft, ['local_backup_path'])} onChangeText={value => setDraft(current => ({ ...current, local_backup_path: value }))} autoCapitalize="none" />
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Last run: {pickString(localBackupStatusQuery.data, ['last_backup_at'], 'Never')}</Text>
                  <View style={styles.actions}>
                    <PrimaryButton label="Run local backup" variant="secondary" onPress={() => void backupMutation.mutateAsync()} loading={backupMutation.isPending} />
                    <PrimaryButton label="Export full backup" variant="secondary" onPress={() => void exportBackupMutation.mutateAsync()} loading={exportBackupMutation.isPending} />
                  </View>
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Saved backups: {((localBackupsQuery.data ?? []) as ApiRecord[]).length}</Text>
                </SectionCard>
                <SectionCard title="GitHub backup" subtitle="Remote backup trigger and recent status.">
                  <SwitchRow
                    label="Enabled"
                    value={githubBackupForm.enabled}
                    onValueChange={value => setGithubBackupForm(current => ({ ...current, enabled: value }))}
                  />
                  <TextField label="Repository URL" value={githubBackupForm.repository_url} onChangeText={value => setGithubBackupForm(current => ({ ...current, repository_url: value }))} autoCapitalize="none" />
                  <TextField label="Token" value={githubBackupForm.access_token} onChangeText={value => setGithubBackupForm(current => ({ ...current, access_token: value }))} secureTextEntry autoCapitalize="none" placeholder="ghp_…" />
                  <TextField label="Branch" value={githubBackupForm.branch} onChangeText={value => setGithubBackupForm(current => ({ ...current, branch: value }))} autoCapitalize="none" />
                  <OptionChipsField
                    label="Schedule"
                    value={githubBackupForm.schedule_type}
                    options={[
                      { key: 'manual', label: 'Manual' },
                      { key: 'daily', label: 'Daily' },
                      { key: 'weekly', label: 'Weekly' },
                    ]}
                    onChange={value => setGithubBackupForm(current => ({ ...current, schedule_type: value as GitHubBackupFormState['schedule_type'] }))}
                  />
                  <TextField label="Schedule time" value={githubBackupForm.schedule_time} onChangeText={value => setGithubBackupForm(current => ({ ...current, schedule_time: value }))} placeholder="02:00" />
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Configured: {pickBoolean(githubBackupQuery.data, ['configured']) ? 'yes' : 'no'}</Text>
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Last status: {pickString(githubBackupQuery.data, ['last_backup_status', 'last_status'], 'Unknown')}</Text>
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Last backup: {formatDateTime(pickString(githubBackupQuery.data, ['last_backup_at']))}</Text>
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>Last message: {pickString(githubBackupQuery.data, ['last_error', 'message'], '—')}</Text>
                  <View style={styles.actions}>
                    <PrimaryButton label={saveGitHubBackupMutation.isPending ? 'Saving…' : 'Save GitHub backup'} onPress={handleSaveGitHubBackup} loading={saveGitHubBackupMutation.isPending} disabled={saveGitHubBackupMutation.isPending} />
                    <PrimaryButton label={githubBackupMutation.isPending ? 'Running…' : 'Run GitHub backup'} variant="secondary" onPress={() => void githubBackupMutation.mutateAsync()} loading={githubBackupMutation.isPending} disabled={githubBackupMutation.isPending} />
                  </View>
                </SectionCard>
              </>
            ) : null}

            {isDirtySection ? (
              <PrimaryButton label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'} onPress={() => void saveSettingsMutation.mutateAsync()} loading={saveSettingsMutation.isPending} disabled={!canUpdateSettings || saveSettingsMutation.isPending} />
            ) : null}
            {!isAdmin ? <Text style={[styles.helper, { color: colors.warning }]}>Some sections may be read-only without admin access.</Text> : null}
          </>
        )}
      </ScrollView>

      <SimpleModal
        visible={providerModalVisible}
        title={editingProvider ? 'Edit OIDC provider' : 'Add OIDC provider'}
        subtitle="Provider name, issuer URL, client credentials, scope, and enabled state."
        onClose={closeProviderModal}
      >
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

      <SimpleModal
        visible={plugModalVisible}
        title={editingPlug ? 'Edit smart plug' : 'Add smart plug'}
        subtitle="Name, connection details, type, and basic on/off behavior."
        onClose={closePlugModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={plugForm.name} onChangeText={value => setPlugForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label="Plug type" value={plugForm.plug_type} options={SMART_PLUG_TYPE_OPTIONS} onChange={value => setPlugForm(current => ({ ...EMPTY_SMART_PLUG_FORM, ...current, plug_type: value as SmartPlugType }))} />
          {plugForm.plug_type === 'tasmota' ? (
            <>
              <TextField label="IP address" value={plugForm.ip_address} onChangeText={value => setPlugForm(current => ({ ...current, ip_address: value }))} autoCapitalize="none" />
              <TextField label="Username" value={plugForm.username} onChangeText={value => setPlugForm(current => ({ ...current, username: value }))} autoCapitalize="none" />
              <TextField label="Password" value={plugForm.password} onChangeText={value => setPlugForm(current => ({ ...current, password: value }))} secureTextEntry placeholder={editingPlug ? 'Leave blank to keep current password' : undefined} />
            </>
          ) : null}
          {plugForm.plug_type === 'homeassistant' ? (
            <TextField label="Entity ID" value={plugForm.ha_entity_id} onChangeText={value => setPlugForm(current => ({ ...current, ha_entity_id: value }))} autoCapitalize="none" />
          ) : null}
          {plugForm.plug_type === 'mqtt' ? (
            <>
              <TextField label="Power topic" value={plugForm.mqtt_power_topic} onChangeText={value => setPlugForm(current => ({ ...current, mqtt_power_topic: value }))} autoCapitalize="none" />
              <TextField label="State topic" value={plugForm.mqtt_state_topic} onChangeText={value => setPlugForm(current => ({ ...current, mqtt_state_topic: value }))} autoCapitalize="none" />
            </>
          ) : null}
          {plugForm.plug_type === 'rest' ? (
            <>
              <TextField label="Power on URL" value={plugForm.rest_on_url} onChangeText={value => setPlugForm(current => ({ ...current, rest_on_url: value }))} autoCapitalize="none" />
              <TextField label="Power off URL" value={plugForm.rest_off_url} onChangeText={value => setPlugForm(current => ({ ...current, rest_off_url: value }))} autoCapitalize="none" />
            </>
          ) : null}
          <SwitchRow label="Enabled" value={plugForm.enabled} onValueChange={value => setPlugForm(current => ({ ...current, enabled: value }))} />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closePlugModal} />
            <PrimaryButton
              label={editingPlug ? (updateSmartPlugMutation.isPending ? 'Saving…' : 'Save plug') : (createSmartPlugMutation.isPending ? 'Creating…' : 'Create plug')}
              onPress={handlePlugSave}
              loading={createSmartPlugMutation.isPending || updateSmartPlugMutation.isPending}
              disabled={createSmartPlugMutation.isPending || updateSmartPlugMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal
        visible={externalLinkModalVisible}
        title={editingExternalLink ? 'Edit external link' : 'Add external link'}
        subtitle="Name, destination URL, and whether it should open externally."
        onClose={closeExternalLinkModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={externalLinkForm.name} onChangeText={value => setExternalLinkForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={externalLinkForm.url} onChangeText={value => setExternalLinkForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
          <TextField label="Icon" value={externalLinkForm.icon} onChangeText={value => setExternalLinkForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder="link" />
          <SwitchRow label="Open in new tab" value={externalLinkForm.open_in_new_tab} onValueChange={value => setExternalLinkForm(current => ({ ...current, open_in_new_tab: value }))} />
          <TextField label="Sort order" value={externalLinkForm.sort_order} onChangeText={value => setExternalLinkForm(current => ({ ...current, sort_order: value }))} keyboardType="number-pad" />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closeExternalLinkModal} />
            <PrimaryButton
              label={editingExternalLink ? (updateExternalLinkMutation.isPending ? 'Saving…' : 'Save link') : (createExternalLinkMutation.isPending ? 'Creating…' : 'Create link')}
              onPress={handleSaveExternalLink}
              loading={createExternalLinkMutation.isPending || updateExternalLinkMutation.isPending}
              disabled={createExternalLinkMutation.isPending || updateExternalLinkMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal
        visible={virtualPrinterModalVisible}
        title={editingVirtualPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Name, printer model, serial number, and enabled state."
        onClose={closeVirtualPrinterModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={virtualPrinterForm.name} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, name: value }))} />
          <OptionChipsField
            label="Model"
            value={virtualPrinterForm.model_name}
            options={virtualPrinterModels}
            onChange={value => setVirtualPrinterForm(current => ({ ...current, model_name: value }))}
          />
          <TextField label="Custom model" value={virtualPrinterForm.model_name} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label="Serial number" value={virtualPrinterForm.serial_number} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, serial_number: value }))} autoCapitalize="characters" />
          <SwitchRow label="Enabled" value={virtualPrinterForm.enabled} onValueChange={value => setVirtualPrinterForm(current => ({ ...current, enabled: value }))} />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closeVirtualPrinterModal} />
            <PrimaryButton
              label={editingVirtualPrinter ? (saveVirtualPrinterMutation.isPending ? 'Saving…' : 'Save printer') : (saveVirtualPrinterMutation.isPending ? 'Creating…' : 'Create printer')}
              onPress={handleSaveVirtualPrinter}
              loading={saveVirtualPrinterMutation.isPending}
              disabled={saveVirtualPrinterMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <AlertModal
        visible={Boolean(createdCameraToken)}
        variant="success"
        title="Camera token created"
        message={createdCameraToken || 'Your new camera token is ready.'}
        dismissLabel="OK"
        onClose={() => setCreatedCameraToken('')}
      />

      <SimpleModal visible={showTOTPSetup} title="Set up TOTP" subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app." onClose={() => { setShowTOTPSetup(false); queryClient.removeQueries({ queryKey: ['totp-setup'] }); setTotpCode(''); }}>
        <View style={styles.modalBody}>
          {totpSetupQuery.isLoading ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : totpSetupQuery.data ? (
            <>
              <Image source={{ uri: `data:image/png;base64,${totpSetupQuery.data.qr_code_b64}` }} style={styles.qrImage} />
              <Text style={[styles.helper, { color: colors.textSecondary }]}>Secret: {totpSetupQuery.data.secret}</Text>
              <PrimaryButton
                label="Copy secret"
                variant="secondary"
                onPress={() => {
                  Clipboard.setString(totpSetupQuery.data.secret);
                  showToast('TOTP secret copied.', 'success');
                }}
              />
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

      <ConfirmModal
        visible={plugDeleteTarget !== null}
        title="Delete smart plug"
        message={plugDeleteTarget ? `Delete ${plugDeleteTarget.name}?` : 'Delete this smart plug?'}
        confirmLabel="Delete"
        onClose={() => setPlugDeleteTarget(null)}
        onConfirm={() => plugDeleteTarget && void deleteSmartPlugMutation.mutateAsync(plugDeleteTarget.id)}
        loading={deleteSmartPlugMutation.isPending}
      />

      <ConfirmModal
        visible={pendingDeleteExternalLink !== null}
        title="Delete external link"
        message={pendingDeleteExternalLink ? `Delete ${pickString(pendingDeleteExternalLink, ['name'], 'this link')}?` : 'Delete this external link?'}
        confirmLabel="Delete"
        onClose={() => setPendingDeleteExternalLink(null)}
        onConfirm={() => pendingDeleteExternalLink && void deleteExternalLinkMutation.mutateAsync(pickNumber(pendingDeleteExternalLink, ['id']))}
        loading={deleteExternalLinkMutation.isPending}
      />

      <ConfirmModal
        visible={pendingDeleteVirtualPrinter !== null}
        title="Delete virtual printer"
        message={pendingDeleteVirtualPrinter ? `Delete ${pickString(pendingDeleteVirtualPrinter, ['name'], 'this virtual printer')}?` : 'Delete this virtual printer?'}
        confirmLabel="Delete"
        onClose={() => setPendingDeleteVirtualPrinter(null)}
        onConfirm={() => pendingDeleteVirtualPrinter && void deleteVirtualPrinterMutation.mutateAsync(pickNumber(pendingDeleteVirtualPrinter, ['id']))}
        loading={deleteVirtualPrinterMutation.isPending}
      />
    </>
  );
}

function SmartPlugCardMobile({
  plug,
  canControl,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  plug: SmartPlug;
  canControl: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const statusQuery = useQuery<SmartPlugStatus>({
    queryKey: ['smartPlugStatus', plug.id],
    queryFn: () => api.getSmartPlugStatus(plug.id),
    refetchInterval: 15000,
  });

  const controlMutation = useMutation({
    mutationFn: (action: 'on' | 'off') => api.controlSmartPlug(plug.id, action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugStatus', plug.id] });
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      showToast('Smart plug updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to control smart plug.', 'error'),
  });

  const currentState = (statusQuery.data?.state ?? plug.last_state ?? 'Unknown').toUpperCase();
  const isOn = currentState === 'ON';
  const reachable = statusQuery.data?.reachable ?? false;
  const connection = describePlugConnection(plug);
  const powerValue = statusQuery.data?.energy?.power;
  const monitorOnly = plug.plug_type === 'mqtt';

  return (
    <SectionCard
      title={plug.name}
      subtitle={connection}
      right={<StatusBadge label={reachable ? 'online' : 'offline'} color={reachable ? colors.success : colors.error} />}
    >
      <View style={styles.plugSummaryRow}>
        <StatusBadge label={currentState || 'unknown'} color={isOn ? colors.accent : colors.textTertiary} />
        {powerValue != null ? <StatusBadge label={`${Math.round(powerValue)} W`} color={colors.accent} /> : null}
        <StatusBadge label={plug.plug_type} color={colors.textTertiary} />
      </View>
      <SwitchRow
        label="Power"
        description={monitorOnly ? 'MQTT plugs are monitor-only from mobile.' : 'Toggle the plug on or off.'}
        value={isOn}
        onValueChange={value => void controlMutation.mutateAsync(value ? 'on' : 'off')}
        disabled={monitorOnly || !canControl || controlMutation.isPending || (!reachable && currentState !== 'ON')}
      />
      <View style={styles.actions}>
        <PrimaryButton
          label={statusQuery.isFetching ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => {
            void statusQuery.refetch().then(result => {
              if (result.data?.reachable) {
                showToast(`${plug.name} is reachable.`, 'success');
              } else {
                showToast(`${plug.name} is offline.`, 'error');
              }
            });
          }}
          disabled={statusQuery.isFetching}
          loading={statusQuery.isFetching}
        />
        <PrimaryButton label="Edit" variant="secondary" onPress={onEdit} disabled={!canEdit} />
        <PrimaryButton label="Delete" variant="danger" onPress={onDelete} disabled={!canDelete} />
      </View>
    </SectionCard>
  );
}

function SimpleModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function OptionChipsField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map(option => (
          <View key={option.key} style={{ opacity: disabled ? 0.5 : 1 }}>
            <Chip label={option.label} selected={option.key === value} onPress={() => !disabled && onChange(option.key)} />
          </View>
        ))}
      </View>
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
  description,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.switchRowCard}>
      <View style={styles.switchTextWrap}>
        <Text style={[styles.switchLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.switchDescription, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
        thumbColor={colors.text}
        disabled={disabled}
      />
    </View>
  );
}

function stringifyNumberField(value: unknown, fallback = '0') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

function describePlugConnection(plug: SmartPlug) {
  switch (plug.plug_type) {
    case 'tasmota':
      return plug.ip_address || 'No IP address';
    case 'homeassistant':
      return plug.ha_entity_id || 'No entity ID';
    case 'mqtt':
      return plug.mqtt_power_topic || plug.mqtt_topic || 'No MQTT topic';
    case 'rest':
      return plug.rest_on_url || plug.rest_off_url || 'No REST endpoint';
    default:
      return 'Unknown connection';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: { gap: spacing.xs },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryLabel: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  itemText: { flex: 1, gap: spacing.xs },
  itemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  itemMeta: {
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  twoColumnGrid: {
    gap: spacing.md,
  },
  twoColumnCell: {
    flex: 1,
  },
  switchRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  switchTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  switchDescription: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  plugSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing['4xl'],
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  closeButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  qrImage: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    borderRadius: borderRadius.lg,
  },
  codeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  codeCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  codeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
});
