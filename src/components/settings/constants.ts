import type {
  SMTPSettings,
  SmartPlug,
} from '@/types/api';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import type {
  CameraTokenFormState,
  ExternalLinkFormState,
  GitHubBackupFormState,
  LDAPFormState,
  OptionItem,
  ProviderFormState,
  SectionItem,
  SectionKey,
  SmartPlugFormState,
  SmtpSecurity,
  SmartPlugType,
  VirtualPrinterFormState,
} from './types';

export const SECTION_ITEMS: SectionItem[] = [
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

export const LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
  { key: 'fr', label: 'Français' },
  { key: 'it', label: 'Italiano' },
  { key: 'ja', label: '日本語' },
  { key: 'pt-BR', label: 'Português (BR)' },
] as const satisfies ReadonlyArray<OptionItem>;

export const NOTIFICATION_LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
] as const satisfies ReadonlyArray<OptionItem>;

export const DATE_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'us', label: 'MM/DD/YYYY' },
  { key: 'eu', label: 'DD/MM/YYYY' },
  { key: 'iso', label: 'YYYY-MM-DD' },
] as const satisfies ReadonlyArray<OptionItem>;

export const TIME_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: '12h', label: '12 hour' },
  { key: '24h', label: '24 hour' },
] as const satisfies ReadonlyArray<OptionItem>;

export const CURRENCY_OPTIONS = [
  { key: 'USD', label: 'USD' },
  { key: 'EUR', label: 'EUR' },
  { key: 'GBP', label: 'GBP' },
  { key: 'CAD', label: 'CAD' },
  { key: 'AUD', label: 'AUD' },
  { key: 'JPY', label: 'JPY' },
] as const satisfies ReadonlyArray<OptionItem>;

export const SMTP_SECURITY_OPTIONS: Array<OptionItem<SmtpSecurity>> = [
  { key: 'starttls', label: 'STARTTLS' },
  { key: 'ssl', label: 'SSL' },
  { key: 'none', label: 'None' },
];

export const SMTP_PORT_BY_SECURITY: Record<SmtpSecurity, number> = {
  starttls: 587,
  ssl: 465,
  none: 25,
};

export const SMART_PLUG_TYPE_OPTIONS: Array<OptionItem<SmartPlugType>> = [
  { key: 'tasmota', label: 'Tasmota' },
  { key: 'homeassistant', label: 'Home Assistant' },
  { key: 'mqtt', label: 'MQTT' },
  { key: 'rest', label: 'REST' },
];

export const DEFAULT_SMTP_SETTINGS: SMTPSettings = {
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_security: 'starttls',
  smtp_auth_enabled: true,
  smtp_from_email: '',
  smtp_from_name: 'BamBuddy',
};

export const DEFAULT_LDAP_FORM: LDAPFormState = {
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

export const EMPTY_PROVIDER_FORM: ProviderFormState = {
  name: '',
  issuer_url: '',
  client_id: '',
  client_secret: '',
  scopes: 'openid email profile',
  is_enabled: true,
};

export const EMPTY_CAMERA_TOKEN_FORM: CameraTokenFormState = {
  name: '',
  expiresInDays: '90',
};

export const EMPTY_EXTERNAL_LINK_FORM: ExternalLinkFormState = {
  name: '',
  url: '',
  icon: 'link',
  open_in_new_tab: true,
  sort_order: '0',
};

export const EMPTY_VIRTUAL_PRINTER_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  model_name: 'BL-P001',
  serial: '',
  serial_number: '',
  enabled: false,
};

export const EMPTY_GITHUB_BACKUP_FORM: GitHubBackupFormState = {
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

export const EMPTY_SMART_PLUG_FORM: SmartPlugFormState = {
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

export type SectionSummaryQueries = {
  settings?: ApiRecord;
  smartPlugs?: SmartPlug[];
  notificationProviders?: ApiRecord[];
  apiKeys?: ApiRecord[];
  cameraTokens?: ApiRecord[];
  virtualPrinters?: ApiRecord[];
  spoolbuddyDevices?: ApiRecord[];
  obicoStatus?: unknown;
  advancedAuthStatus?: unknown;
  githubBackupStatus?: unknown;
};

export function summarize(section: SectionKey, queries: SectionSummaryQueries) {
  const settings = queries.settings ?? {};
  switch (section) {
    case 'general':
      return `${pickString(settings, ['language'], 'en')} • ${pickString(settings, ['date_format'], 'system')}`;
    case 'plugs':
      return `${(queries.smartPlugs ?? []).length} smart plugs`;
    case 'notifications':
      return `${(queries.notificationProviders ?? []).length} providers`;
    case 'queue':
      return pickBoolean(settings, ['preheat_enabled']) ? 'Preheat enabled' : 'Preheat disabled';
    case 'filament':
      return `Low stock ${pickNumber(settings, ['low_stock_threshold'], 20)}%`;
    case 'network':
      return pickBoolean(settings, ['mqtt_enabled']) ? 'MQTT enabled' : 'MQTT disabled';
    case 'apikeys':
      return `${(queries.apiKeys ?? []).length} keys • ${(queries.cameraTokens ?? []).length} camera tokens`;
    case 'virtual-printer':
      return `${(queries.virtualPrinters ?? []).length} virtual printers`;
    case 'spoolbuddy':
      return `${(queries.spoolbuddyDevices ?? []).length} devices`;
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
