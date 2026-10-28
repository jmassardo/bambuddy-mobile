import { translateNative } from '@/i18n';

import type {
  KProfile,
  MQTTStatus,
  SMTPSettings,
  SmartPlug,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  StorageLocation,
} from '@/types/api';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { availableLanguages } from '@/i18n/catalog';
import type {
  CameraTokenFormState,
  CustomNavItemFormState,
  ExternalCameraFormState,
  ExternalCameraType,
  ExternalLinkFormState,
  GitHubBackupFormState,
  KProfileFormState,
  LDAPFormState,
  MqttFormState,
  NozzleDiameterOption,
  OptionItem,
  ProviderFormState,
  SectionItem,
  SectionKey,
  SmartPlugFormState,
  SmtpSecurity,
  SmartPlugType,
  StorageLocationFormState,
  VirtualPrinterFormState,
} from './types';

export const SECTION_ITEMS: SectionItem[] = [
  { key: 'general', icon: 'settings', get title() { return translateNative('native.c16ffe4ebbc1709c'); }, get description() { return translateNative('native.e8e8c616754923df'); } },
  { key: 'plugs', icon: 'power', get title() { return translateNative('native.80608e341c939a66'); }, get description() { return translateNative('native.816eabbac21d350b'); } },
  { key: 'notifications', icon: 'bell', get title() { return translateNative('nav.notifications'); }, get description() { return translateNative('native.8938dd5d82829b38'); } },
  { key: 'queue', icon: 'list-ordered', get title() { return translateNative('nav.queue'); }, get description() { return translateNative('native.da7c4043ae3f5288'); } },
  { key: 'filament', icon: 'package', get title() { return translateNative('native.12e2b8020ce55e27'); }, get description() { return translateNative('native.9a23111fd32b278b'); } },
  { key: 'kprofiles', icon: 'activity', get title() { return translateNative('native.41f3d1901c0427a3'); }, get description() { return translateNative('native.90d3d09aaaae9a0f'); } },
  { key: 'network', icon: 'globe', get title() { return translateNative('native.00a012a19434828d'); }, get description() { return translateNative('native.b5acb1cb7f2dc4f3'); } },
  { key: 'mqtt', icon: 'wifi', title: 'MQTT', get description() { return translateNative('native.88945d6427d630b4'); } },
  { key: 'navigation', icon: 'menu', get title() { return translateNative('native.7b38ba5754ceef25'); }, get description() { return translateNative('native.dbbf6223e5db542e'); } },
  { key: 'custom-navigation', icon: 'link', get title() { return translateNative('native.a1c4b3f5c132cb28'); }, get description() { return translateNative('native.cf0c4cd240b65c9f'); } },
  { key: 'apikeys', icon: 'key', get title() { return translateNative('native.adae33bba17225f0'); }, get description() { return translateNative('native.5ff7c81fc01db560'); } },
  { key: 'external-cameras', icon: 'camera', get title() { return translateNative('native.724525fdc0864e45'); }, get description() { return translateNative('native.f46365e68cc9ab58'); } },
  { key: 'virtual-printer', icon: 'printer', get title() { return translateNative('native.71857dc2f2ceb994'); }, get description() { return translateNative('native.9b9a7ddaa90a4afd'); } },
  { key: 'spoolbuddy', icon: 'nfc', title: 'SpoolBuddy', get description() { return translateNative('native.2f51ac476d19abca'); } },
  { key: 'failure-detection', icon: 'shield', get title() { return translateNative('native.fed81c0826013e72'); }, get description() { return translateNative('native.69b646236fede2bb'); } },
  { key: 'users', icon: 'users', get title() { return translateNative('native.34e82b55772de6df'); }, get description() { return translateNative('native.f85cadaeeac78e06'); } },
  { key: 'backup', icon: 'download', get title() { return translateNative('native.e82edc1b9645b22d'); }, get description() { return translateNative('native.e826fb871b47b733'); } },
  { key: 'storage-locations', icon: 'layers', get title() { return translateNative('native.c33a41f402ba70a5'); }, get description() { return translateNative('native.5a2d547192e13637'); } },
];

export const LANGUAGE_OPTIONS = availableLanguages;
export const NOTIFICATION_LANGUAGE_OPTIONS = availableLanguages;

export const DATE_FORMAT_OPTIONS = [
  { key: 'system', get label() { return translateNative('nav.system'); } },
  { key: 'us', label: 'MM/DD/YYYY' },
  { key: 'eu', label: 'DD/MM/YYYY' },
  { key: 'iso', label: 'YYYY-MM-DD' },
] as const satisfies ReadonlyArray<OptionItem>;

export const TIME_FORMAT_OPTIONS = [
  { key: 'system', get label() { return translateNative('nav.system'); } },
  { key: '12h', get label() { return translateNative('native.465c5e19723e5e9d'); } },
  { key: '24h', get label() { return translateNative('native.27e4bb12cc9c0fe6'); } },
] as const satisfies ReadonlyArray<OptionItem>;

export const CURRENCY_OPTIONS = [
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'INR', 'HKD',
  'KRW', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'TWD', 'SGD', 'NZD', 'MXN',
  'BZD', 'MYR', 'CZK', 'THB', 'ZAR', 'TRY', 'RUB', 'HUF', 'ILS', 'UAH', 'IDR', 'PHP',
].map(code => ({ key: code, label: code })) satisfies ReadonlyArray<OptionItem>;

export const SMTP_SECURITY_OPTIONS: Array<OptionItem<SmtpSecurity>> = [
  { key: 'starttls', label: 'STARTTLS' },
  { key: 'ssl', label: 'SSL' },
  { key: 'none', get label() { return translateNative('common.none'); } },
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
  { key: 'rest', get label() { return translateNative('native.34f62c31ffec265a'); } },
];

export const EXTERNAL_CAMERA_TYPE_OPTIONS: Array<OptionItem<ExternalCameraType>> = [
  { key: 'mjpeg', label: 'MJPEG' },
  { key: 'rtsp', label: 'RTSP' },
  { key: 'snapshot', get label() { return translateNative('native.98cdfe45ad61054b'); } },
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
  get scopes() { return translateNative('native.a78c1991f70d3ab8'); },
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

export const EMPTY_CUSTOM_NAV_ITEM_FORM: CustomNavItemFormState = {
  name: '',
  url: '',
  icon: 'link',
  open_in_new_tab: true,
  sort_order: '0',
};

export const EMPTY_EXTERNAL_CAMERA_FORM: ExternalCameraFormState = {
  name: '',
  stream_url: '',
  camera_type: 'mjpeg',
  printer_id: '',
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

export const DEFAULT_MQTT_FORM: MqttFormState = {
  mqtt_broker: '',
  mqtt_port: 1883,
  mqtt_username: '',
  mqtt_password: '',
  mqtt_topic_prefix: 'bambuddy',
  mqtt_use_tls: false,
};

export const NOZZLE_DIAMETER_OPTIONS: ReadonlyArray<OptionItem<NozzleDiameterOption>> = [
  { key: '0.2', label: '0.2 mm' },
  { key: '0.4', label: '0.4 mm' },
  { key: '0.6', label: '0.6 mm' },
  { key: '0.8', label: '0.8 mm' },
];

export const EMPTY_K_PROFILE_FORM: KProfileFormState = {
  slot_id: '0',
  extruder_id: '0',
  nozzle_id: '',
  nozzle_diameter: '0.4',
  filament_id: '',
  name: '',
  k_value: '',
  n_coef: '',
  ams_id: '',
  tray_id: '',
  setting_id: '',
};

export const EMPTY_STORAGE_LOCATION_FORM: StorageLocationFormState = {
  name: '',
  identifier: '',
  address: '',
  notes: '',
};

export type SectionSummaryQueries = {
  settings?: ApiRecord;
  smartPlugs?: SmartPlug[];
  notificationProviders?: ApiRecord[];
  apiKeys?: ApiRecord[];
  cameraTokens?: ApiRecord[];
  externalCameras?: ApiRecord[];
  virtualPrinters?: ApiRecord[];
  spoolbuddyDevices?: ApiRecord[];
  obicoStatus?: unknown;
  advancedAuthStatus?: unknown;
  githubBackupStatus?: unknown;
  mqttStatus?: MQTTStatus;
  customNavItems?: Array<{ name: string }>;
  kprofiles?: KProfile[];
  storageLocations?: Array<{ id: number; name: string }>;
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
      return pickBoolean(settings, ['preheat_enabled']) ? translateNative('native.2ec4b547f7d1df5b') : translateNative('native.84fbff152ecea1e7');
    case 'filament':
      return `Low stock ${pickNumber(settings, ['low_stock_threshold'], 20)}%`;
    case 'kprofiles':
      return `${(queries.kprofiles ?? []).length} profiles`;
    case 'network':
      return `External URL set • Prometheus ${pickBoolean(settings, ['prometheus_enabled']) ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}`;
    case 'mqtt': {
      const mqtt = queries.mqttStatus;
      if (!mqtt) return 'Checking…';
      return `${mqtt.enabled ? 'Enabled' : 'Disabled'} • ${mqtt.connected ? 'Connected' : 'Disconnected'} • ${mqtt.broker}:${mqtt.port}`;
    }
    case 'navigation':
      return pickString(settings, ['default_sidebar_order']) ? translateNative('native.37be3bba93bb8283') : translateNative('native.ac77ddfd82114632');
    case 'custom-navigation':
      return `${(queries.customNavItems ?? []).length} custom links`;
    case 'apikeys':
      return `${(queries.apiKeys ?? []).length} keys • ${(queries.cameraTokens ?? []).length} camera tokens`;
    case 'external-cameras':
      return `${(queries.externalCameras ?? []).length} configured`;
    case 'virtual-printer':
      return `${(queries.virtualPrinters ?? []).length} virtual printers`;
    case 'spoolbuddy':
      return `${(queries.spoolbuddyDevices ?? []).length} devices`;
    case 'failure-detection':
      return pickBoolean(queries.obicoStatus, ['enabled']) ? translateNative('common.enabled') : translateNative('common.disabled');
    case 'users':
      return pickBoolean(queries.advancedAuthStatus, ['advanced_auth_enabled']) ? translateNative('native.c4d355ef26a57929') : translateNative('native.395bd020ccc498d8');
    case 'backup':
      return pickString(queries.githubBackupStatus, ['last_backup_status'], translateNative('native.942bcda081837f61'));
    case 'storage-locations':
      return `${(queries.storageLocations ?? []).length} locations`;
    default:
      return '';
  }
}
