import type { KProfile, SMTPSettings, SmartPlug } from '@/types/api';

export type SectionKey =
  | 'general'
  | 'plugs'
  | 'notifications'
  | 'queue'
  | 'filament'
  | 'kprofiles'
  | 'network'
  | 'mqtt'
  | 'navigation'
  | 'custom-navigation'
  | 'apikeys'
  | 'external-cameras'
  | 'virtual-printer'
  | 'spoolbuddy'
  | 'failure-detection'
  | 'users'
  | 'backup';

export type UserPanelKey = 'auth' | 'email' | 'ldap' | 'oidc' | 'twofa';
export type ThemeMode = 'dark' | 'light' | 'system';
export type SmtpSecurity = SMTPSettings['smtp_security'];
export type SmartPlugType = SmartPlug['plug_type'];

export type LDAPFormState = {
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

export type SmartPlugFormState = {
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

export type ProviderFormState = {
  name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes: string;
  is_enabled: boolean;
};

export type CameraTokenFormState = {
  name: string;
  expiresInDays: string;
};

export type ExternalLinkFormState = {
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  sort_order: string;
};

export type CustomNavItemFormState = {
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  sort_order: string;
};

export type ExternalCameraType = 'mjpeg' | 'rtsp' | 'snapshot';

export type ExternalCameraFormState = {
  name: string;
  stream_url: string;
  camera_type: ExternalCameraType;
  printer_id: string;
};

export type VirtualPrinterFormState = {
  name: string;
  model: string;
  model_name: string;
  serial: string;
  serial_number: string;
  enabled: boolean;
};

export type GitHubBackupProvider = 'github' | 'gitea' | 'forgejo' | 'gitlab';
export type GitHubBackupScheduleType = 'manual' | 'hourly' | 'daily' | 'weekly';

export type GitHubBackupFormState = {
  repository_url: string;
  access_token: string;
  branch: string;
  provider: GitHubBackupProvider;
  enabled: boolean;
  schedule_enabled: boolean;
  schedule_type: GitHubBackupScheduleType;
  schedule_time: string;
  allow_insecure_http: boolean;
  backup_settings: boolean;
  backup_spools: boolean;
  backup_archives: boolean;
  backup_kprofiles: boolean;
  backup_cloud_profiles: boolean;
};

export type SectionItem = {
  key: SectionKey;
  icon: string;
  title: string;
  description: string;
};

export type OptionItem<T extends string = string> = {
  key: T;
  label: string;
};

export type MqttFormState = {
  mqtt_broker: string;
  mqtt_port: number;
  mqtt_username: string;
  mqtt_password: string;
  mqtt_topic_prefix: string;
  mqtt_use_tls: boolean;
};

export type NozzleDiameterOption = '0.2' | '0.4' | '0.6' | '0.8';

export type KProfileFormState = {
  slot_id: string;
  extruder_id: string;
  nozzle_id: string;
  nozzle_diameter: string;
  filament_id: string;
  name: string;
  k_value: string;
  n_coef: string;
  ams_id: string;
  tray_id: string;
  setting_id: string;
};

export type KProfileModalState = {
  visible: boolean;
  editingKProfile: KProfile | null;
  form: KProfileFormState;
};

export type DeleteKProfileTarget = {
  slot_id: number;
  extruder_id: number;
  nozzle_id: string;
  nozzle_diameter: string;
  filament_id: string;
  setting_id: string;
} | null;
