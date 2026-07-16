/**
 * API contract types ported from the Bambuddy web frontend API client.
 * Source: frontend/src/api/client.ts
 * Only exported request/response and related API shape declarations are included here.
 */

// Auth types

export type TokenPersistence = 'session' | 'persistent';

export type Permission =
  | 'printers:read' | 'printers:create' | 'printers:update' | 'printers:delete' | 'printers:control' | 'printers:files' | 'printers:ams_rfid' | 'printers:clear_plate'
  | 'archives:read' | 'archives:read_own' | 'archives:read_all' | 'archives:create'
  | 'archives:update_own' | 'archives:update_all' | 'archives:delete_own' | 'archives:delete_all'
  | 'archives:reprint_own' | 'archives:reprint_all' | 'archives:purge'
  | 'queue:read' | 'queue:read_own' | 'queue:read_all' | 'queue:create'
  | 'queue:update_own' | 'queue:update_all' | 'queue:delete_own' | 'queue:delete_all'
  | 'queue:reorder'
  | 'library:read' | 'library:read_own' | 'library:read_all' | 'library:upload'
  | 'library:update_own' | 'library:update_all' | 'library:delete_own' | 'library:delete_all'
  | 'library:purge'
  | 'projects:read' | 'projects:create' | 'projects:update' | 'projects:delete'
  | 'filaments:read' | 'filaments:create' | 'filaments:update' | 'filaments:delete'
  | 'inventory:read' | 'inventory:create' | 'inventory:update' | 'inventory:delete' | 'inventory:view_assignments'
  | 'inventory:forecast_read' | 'inventory:forecast_write'
  | 'smart_plugs:read' | 'smart_plugs:create' | 'smart_plugs:update' | 'smart_plugs:delete' | 'smart_plugs:control'
  | 'camera:view'
  | 'maintenance:read' | 'maintenance:create' | 'maintenance:update' | 'maintenance:delete'
  | 'kprofiles:read' | 'kprofiles:create' | 'kprofiles:update' | 'kprofiles:delete'
  | 'notifications:read' | 'notifications:create' | 'notifications:update' | 'notifications:delete' | 'notifications:user_email'
  | 'notification_templates:read' | 'notification_templates:update'
  | 'external_links:read' | 'external_links:create' | 'external_links:update' | 'external_links:delete'
  | 'discovery:scan'
  | 'firmware:read' | 'firmware:update'
  | 'ams_history:read'
  | 'stats:read' | 'stats:filter_by_user'
  | 'system:read'
  | 'settings:read' | 'settings:update' | 'settings:backup' | 'settings:restore'
  | 'github:backup' | 'github:restore'
  | 'cloud:auth' | 'orca_cloud:auth'
  | 'makerworld:view' | 'makerworld:import'
  | 'api_keys:read' | 'api_keys:create' | 'api_keys:update' | 'api_keys:delete'
  | 'users:read' | 'users:create' | 'users:update' | 'users:delete'
  | 'groups:read' | 'groups:create' | 'groups:update' | 'groups:delete'
  | 'pipelines:read' | 'pipelines:write' | 'pipelines:run'
  | 'websocket:connect';

export interface GroupBrief {
  id: number;
  name: string;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
  is_system: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface GroupDetail extends Group {
  users: Array<{ id: number; username: string; is_active: boolean }>;
}

export interface GroupCreate {
  name: string;
  description?: string;
  permissions: Permission[];
}

export interface GroupUpdate {
  name?: string;
  description?: string;
  permissions?: Permission[];
}

export interface PermissionInfo {
  value: Permission;
  label: string;
}

export interface PermissionCategory {
  name: string;
  permissions: PermissionInfo[];
}

export interface PermissionsListResponse {
  categories: PermissionCategory[];
  all_permissions: Permission[];
}

export interface UserEmailPreferences {
  notify_print_start: boolean;
  notify_print_complete: boolean;
  notify_print_failed: boolean;
  notify_print_stopped: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token?: string;
  token_type?: string;
  user?: UserResponse;
  /** Set when 2FA verification is required before a full token is issued. */
  requires_2fa?: boolean;
  pre_auth_token?: string;
  two_fa_methods?: string[];
  available_methods?: string[];
}

export interface UserResponse {
  id: number;
  username: string;
  email?: string;
  role: string;  // Deprecated, kept for backward compatibility
  is_active: boolean;
  is_admin: boolean;  // Computed from role and group membership
  auth_source: string;  // "local" or "ldap"
  groups: GroupBrief[];
  permissions: Permission[];  // All permissions from groups
  created_at: string;
}

export interface UserCreate {
  username: string;
  password?: string;  // Optional when advanced auth is enabled
  email?: string;
  role: string;
  group_ids?: number[];
}

export interface UserUpdate {
  username?: string;
  password?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
  group_ids?: number[];
}

export interface SetupRequest {
  auth_enabled: boolean;
  admin_username?: string;
  admin_password?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  user_id: number;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface SMTPSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_security: 'starttls' | 'ssl' | 'none';
  smtp_auth_enabled: boolean;
  smtp_from_email: string;
  smtp_from_name: string;
}

export interface TwoFAStatus {
  totp_enabled: boolean;
  email_otp_enabled: boolean;
  backup_codes_remaining: number;
}

export interface TOTPSetupResponse {
  secret: string;
  qr_code_b64: string;
  issuer: string;
}

export interface TOTPEnableResponse {
  message: string;
  backup_codes: string[];
}

export interface BackupCodesResponse {
  backup_codes: string[];
  message: string;
}

export interface TwoFAVerifyRequest {
  pre_auth_token: string;
  code: string;
  method: 'totp' | 'email' | 'backup';
}

/**
 * A URL that is known to be same-origin (a relative path starting with ``/``).
 *
 * Branded so that producers of same-origin URLs (e.g. ``api.oidcProviderIconUrl``)
 * can be distinguished from arbitrary strings at the type level.  The brand
 * is compile-time only; at runtime these are plain strings.
 *
 * Purpose: CSP-safe image sources for ``<img src=...>``. The strict
 * ``img-src 'self' data: blob:`` CSP rejects anything that isn't same-origin,
 * so callers that demand a ``SameOriginUrl`` get a compile-time guarantee
 * that no external URL slips through.
 */
export type SameOriginUrl = string & { readonly __brand: 'SameOriginUrl' };

export interface OIDCProvider {
  id: number;
  name: string;
  issuer_url: string;
  client_id: string;
  scopes: string;
  is_enabled: boolean;
  auto_create_users: boolean;
  auto_link_existing_accounts: boolean;
  email_claim: string;
  require_email_verified: boolean;
  icon_url?: string | null;
  default_group_id?: number | null;
  // True when the backend has cached icon bytes for this provider.
  // Login page / admin preview consume this via the proxy URL
  // /api/v1/auth/oidc/providers/{id}/icon (#1333) so the SPA never
  // hotlinks the external icon URL — that would require loosening
  // the strict img-src CSP.  Required, not optional: the backend always
  // includes this field in the response (Pydantic default-False is
  // populated unconditionally in the route handler).
  has_icon: boolean;
  // #1589: when true, the LoginPage redirects unauthenticated visitors
  // straight to this provider on mount. At most one provider may carry this.
  is_autologin: boolean;
}

export interface OIDCProviderCreate {
  name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string;
  is_enabled?: boolean;
  auto_create_users?: boolean;
  auto_link_existing_accounts?: boolean;
  email_claim?: string;
  require_email_verified?: boolean;
  icon_url?: string | null;
  default_group_id?: number | null;
  is_autologin?: boolean;  // #1589
}

export interface OIDCLink {
  id: number;
  provider_id: number;
  provider_name: string;
  provider_email?: string | null;
  created_at: string;
}

export interface TestSMTPRequest {
  test_recipient: string;
}

export interface TestSMTPResponse {
  success: boolean;
  message: string;
}

export interface AdvancedAuthStatus {
  advanced_auth_enabled: boolean;
  smtp_configured: boolean;
  // #1589: false hides the username/password form on the LoginPage; the env
  // var BAMBUDDY_LOCAL_LOGIN=true on the server flips this back to true so
  // the recovery path remains visible.
  local_login_enabled: boolean;
  // #1589: when set, LoginPage redirects to this provider's authorize URL
  // on mount unless ?fallback=local is in the URL or the redirect times out.
  autologin_provider_id: number | null;
}

export interface LDAPStatus {
  ldap_enabled: boolean;
  ldap_configured: boolean;
}

export interface EncryptionRowCounts {
  oidc_providers: number;
  user_totp: number;
}

export interface EncryptionStatus {
  key_configured: boolean;
  key_source: 'env' | 'file' | 'generated' | 'none';
  legacy_plaintext_rows: EncryptionRowCounts;
  encrypted_rows: EncryptionRowCounts;
  decryption_broken: boolean;
  // B2: count of rows skipped during the last legacy re-encryption migration.
  // Surfaced via a yellow secondary banner in SecurityStatusCard.
  migration_error_count: number;
}

export interface LDAPTestResponse {
  success: boolean;
  message: string;
}

export interface LDAPSearchResult {
  username: string;
  email: string | null;
  display_name: string | null;
  dn: string;
  already_provisioned: boolean;
}

export interface SetupResponse {
  auth_enabled: boolean;
  admin_created?: boolean;
}

export interface AuthStatus {
  auth_enabled: boolean;
  requires_setup: boolean;
}

// Printer types

export interface CameraDiagnoseStage {
  name: 'tcp_reachable' | 'first_frame' | 'live_stream_active';
  status: 'ok' | 'failed' | 'skipped';
  duration_ms: number;
  code: string | null;
}

export interface CameraDiagnoseResult {
  printer_id: number;
  protocol: 'rtsp' | 'chamber_image';
  port: number;
  // 'default' = historical X1/H2 tuning. Anything else = this model has
  // an override entry in backend/app/services/camera_profiles.py.
  profile: string;
  overall_status: 'ok' | 'failed';
  stages: CameraDiagnoseStage[];
  // i18n key under `camera.diagnose.summary.*`.
  summary_code: string;
}

export type DiagnosticStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface DiagnosticCheck {
  id:
    | 'port_mqtt'
    | 'port_ftps'
    | 'port_rtsps'
    | 'network_mode'
    | 'subnet'
    | 'mqtt_auth'
    | 'developer_mode';
  status: DiagnosticStatus;
  params: Record<string, string | number>;
}

export interface PrinterDiagnosticResult {
  printer_id: number | null;
  ip_address: string;
  overall: 'ok' | 'warnings' | 'problems';
  checks: DiagnosticCheck[];
}

export type LogFindingSeverity = 'error' | 'warning';

export type LogFindingCategory = 'layer8' | 'environment' | 'bug';

export interface LogFinding {
  signature_id: string;
  severity: LogFindingSeverity;
  category: LogFindingCategory;
  wiki_anchor: string;
  count: number;
  first_seen: string;
  last_seen: string;
  sample: string;
}

export interface SystemHealthResult {
  findings: LogFinding[];
  scanned_entries: number;
  log_available: boolean;
  summary: {
    total: number;
    layer8: number;
    environment: number;
    bug: number;
  };
}

export interface LongLivedCameraToken {
  id: number;
  user_id: number;
  name: string;
  scope: 'camera_stream';
  lookup_prefix: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  token: string | null;
}

export interface Printer {
  id: number;
  name: string;
  serial_number: string;
  ip_address: string;
  // Optional because the backend only returns access_code when the caller has
  // PRINTERS_UPDATE — Admin / Operator JWTs or auth-disabled mode. Viewers and
  // API keys receive a Printer without this field.
  access_code?: string;
  model: string | null;
  location: string | null;  // Group/location name
  notes?: string | null;
  nozzle_count: number;  // 1 or 2, auto-detected from MQTT
  is_active: boolean;
  auto_archive: boolean;
  external_camera_url: string | null;
  external_camera_type: string | null;  // "mjpeg", "rtsp", "snapshot"
  external_camera_enabled: boolean;
  external_camera_snapshot_url: string | null;  // optional single-frame override (#1177)
  camera_rotation: number;  // 0, 90, 180, 270 degrees
  plate_detection_enabled: boolean;  // Check plate before print
  plate_detection_roi?: PlateDetectionROI;  // ROI for plate detection
  created_at: string;
  updated_at: string;
}

export interface HMSError {
  code: string;
  attr: number;  // Attribute value for constructing wiki URL
  module: number;
  severity: number;  // 1=fatal, 2=serious, 3=common, 4=info
  actions?: string[];  // List of user-facing action keys (e.g. "CHECK_FILAMENT")
  job_id?: string;  // Optional job ID for actions that require it (e.g. "CHECK_ASSISTANT")
  // Canonical hex identifier the firmware matches against — 8 chars for
  // print_error-sourced faults, 16 chars for hms[]-array-sourced faults. Send
  // this back as HmsActionBody.print_error so we don't truncate the 64-bit
  // identifier into the silent-rejection short code (#1830).
  full_code?: string;
}

export interface HMSActionBody {
  print_error: string;  // HMS error code (e.g. "05000070")
  action: string;  // "HMS action to execute (e.g. 'resume_after_error')"
  job_id: string | null;  // Optional job ID for context (if applicable)
}

export interface AMSTray {
  id: number;
  tray_color: string | null;
  tray_type: string | null;
  tray_sub_brands: string | null;  // Full name like "PLA Basic", "PETG HF"
  tray_id_name: string | null;  // Bambu filament ID like "A00-Y2" (can decode to color)
  tray_info_idx: string | null;  // Filament preset ID like "GFA00" - maps to cloud setting_id
  remain: number;
  k: number | null;  // Pressure advance value (from tray or K-profile lookup)
  cali_idx: number | null;  // Calibration index for K-profile lookup
  tag_uid: string | null;  // RFID tag UID (any tag)
  tray_uuid: string | null;  // Bambu Lab spool UUID (32-char hex, only valid for Bambu Lab spools)
  nozzle_temp_min: number | null;  // Min nozzle temperature
  nozzle_temp_max: number | null;  // Max nozzle temperature
  drying_temp: number | null;      // RFID-recommended drying temp
  drying_time: number | null;      // RFID-recommended drying time (hours)
  state: number | null;            // AMS tray state: 9=empty, 10=spool present not loaded, 11=loaded
}

export interface AMSUnit {
  id: number;
  humidity: number | null;
  temp: number | null;
  is_ams_ht: boolean;  // True for AMS-HT (single spool), False for regular AMS (4 spools)
  tray: AMSTray[];
  serial_number: string;  // AMS unit serial number (from MQTT sn field)
  sw_ver: string;         // AMS firmware version (from get_version info.module ams/* entry)
  dry_time: number;       // Minutes remaining (0 = not drying, >0 = drying active)
  dry_status: number;     // 0=Off, 1=Checking, 2=Drying, 3=Cooling, 4=Stopping, 5=Error
  dry_sub_status: number; // 0=Off, 1=Heating, 2=Dehumidify
  dry_sf_reason: number[]; // Cannot-dry reasons (1=InsufficientPower, 8=NeedPluginPower)
  dry_target_temp: number | null; // Active-cycle target °C (Bambu does not echo)
  dry_filament: string | null;    // Active-cycle filament name we sent
  module_type: string;    // "ams", "n3f", "n3s"
}

export interface NozzleInfo {
  nozzle_type: string;  // "stainless_steel" or "hardened_steel"
  nozzle_diameter: string;  // e.g., "0.4"
}

export interface NozzleRackSlot {
  id: number;
  nozzle_type: string;
  nozzle_diameter: string;
  wear: number | null;
  stat: number | null;  // Nozzle status (e.g. mounted/docked)
  max_temp: number;
  serial_number: string;
  filament_color: string;  // RGBA hex ("00000000" = no filament)
  filament_id: string;
  filament_type: string;  // Material type (e.g. "PLA", "PETG")
}

export interface PrintOptions {
  // Core AI detectors
  spaghetti_detector: boolean;
  print_halt: boolean;
  halt_print_sensitivity: string;  // "low", "medium", "high" - spaghetti sensitivity
  first_layer_inspector: boolean;
  printing_monitor: boolean;
  buildplate_marker_detector: boolean;
  allow_skip_parts: boolean;
  // Additional AI detectors (decoded from cfg bitmask)
  nozzle_clumping_detector: boolean;
  nozzle_clumping_sensitivity: string;  // "low", "medium", "high"
  pileup_detector: boolean;
  pileup_sensitivity: string;  // "low", "medium", "high"
  airprint_detector: boolean;
  airprint_sensitivity: string;  // "low", "medium", "high"
  auto_recovery_step_loss: boolean;
  filament_tangle_detect: boolean;
}

export interface FilaSwitchState {
  installed: boolean;
  // in[track] = currently loaded slot for that track (-1 = empty)
  in_slots: number[];
  // out[track] = extruder this track terminates at (0 = right, 1 = left)
  out_extruders: number[];
  stat: number;
  info: number;
}

export interface PrinterStatus {
  id: number;
  name: string;
  connected: boolean;
  state: string | null;
  current_print: string | null;
  subtask_name: string | null;
  current_archive_id: number | null;
  current_plate_id: number | null;
  gcode_file: string | null;
  progress: number | null;
  remaining_time: number | null;
  layer_num: number | null;
  total_layers: number | null;
  temperatures: {
    bed?: number;
    bed_target?: number;
    bed_heating?: boolean;  // Actual heater state from MQTT
    nozzle?: number;
    nozzle_target?: number;
    nozzle_heating?: boolean;  // Actual heater state from MQTT
    nozzle_2?: number;  // Second nozzle for H2 series (dual nozzle)
    nozzle_2_target?: number;
    nozzle_2_heating?: boolean;  // Actual heater state from MQTT
    chamber?: number;
    chamber_target?: number;
    chamber_heating?: boolean;  // Actual heater state from MQTT
  } | null;
  cover_url: string | null;
  hms_errors: HMSError[];
  ams: AMSUnit[];
  ams_exists: boolean;
  vt_tray: AMSTray[];  // Virtual tray / external spool(s)
  store_to_sdcard: boolean;  // Store sent files on SD card
  timelapse: boolean;  // Timelapse recording active
  ipcam: boolean;  // Live view enabled
  wifi_signal: number | null;  // WiFi signal strength in dBm
  wired_network: boolean;  // Ethernet connection detected
  door_open: boolean;  // Enclosure door open (models with a door sensor: X1/X1C/X1E/X2D/P2S/H2*)
  nozzles: NozzleInfo[];  // Nozzle hardware info (index 0=left/primary, 1=right)
  nozzle_rack: NozzleRackSlot[];  // H2C 6-nozzle tool-changer rack
  print_options: PrintOptions | null;  // AI detection and print options
  // Calibration stage tracking
  stg_cur: number;  // Current stage number (-1 = not calibrating)
  stg_cur_name: string | null;  // Human-readable current stage name
  stg: number[];  // List of stage numbers in calibration sequence
  // Air conditioning mode (0=cooling, 1=heating)
  airduct_mode: number;
  // Print speed level (1=silent, 2=standard, 3=sport, 4=ludicrous)
  speed_level: number;
  // Chamber light on/off
  chamber_light: boolean;
  // Active extruder for dual nozzle (0=right, 1=left)
  active_extruder: number;
  // AMS mapping - which AMS is connected to which nozzle
  // Format: [ams_id_for_nozzle0, ams_id_for_nozzle1, ...] where -1 means no AMS
  ams_mapping: number[];
  // Per-AMS extruder mapping - extracted from each AMS unit's info field
  // Format: {ams_id: extruder_id} where extruder 0=right, 1=left
  // Note: JSON keys are always strings
  ams_extruder_map: Record<string, number>;
  // Filament Track Switch accessory — null when not installed. When present,
  // AMS slots aren't tied to a specific extruder; the FTS routes any slot to
  // either extruder, so per-extruder slot filtering must be skipped.
  fila_switch: FilaSwitchState | null;
  // Currently loaded tray (global tray ID, 255 = no filament loaded, 254 = external spool)
  tray_now: number;
  // AMS status for filament change tracking (0=idle, 1=filament_change, 2=rfid_identifying, 3=assist, 4=calibration)
  ams_status_main: number;
  // AMS sub-status for filament change step (when main=1): 4=retraction, 6=load verification, 7=purge
  ams_status_sub: number;
  // mc_print_sub_stage - filament change step indicator used by OrcaSlicer/BambuStudio
  mc_print_sub_stage: number;
  // Timestamp of last AMS data update (for RFID refresh detection)
  last_ams_update: number;
  // Number of printable objects in current print (for skip objects feature)
  printable_objects_count: number;
  // Fan speeds (0-100 percentage, null if not available for this model)
  cooling_fan_speed: number | null;  // Part cooling fan
  big_fan1_speed: number | null;     // Auxiliary fan
  big_fan2_speed: number | null;     // Chamber/exhaust fan
  heatbreak_fan_speed: number | null; // Hotend heatbreak fan
  firmware_version: string | null;   // Firmware version from MQTT
  // Developer LAN mode: true = enabled, false = disabled, null = unknown
  developer_mode: boolean | null;
  // AMS Filament Backup ("auto-switch" to a backup spool when one runs out).
  // true = ON, false = OFF, null = unknown / unsupported (A1 family).
  ams_filament_backup: boolean | null;
  // Queue: printer is awaiting user ack that the build plate was cleared after a
  // finished/failed print. Persisted across restarts (#961).
  awaiting_plate_clear: boolean;
  // AMS drying support
  supports_drying: boolean;
  // Active chamber heater (responds to M141). True only for H2C/H2D/H2DPro/H2S/X2D.
  supports_chamber_heater?: boolean;
}

export interface PrinterCreate {
  name: string;
  serial_number: string;
  ip_address: string;
  access_code: string;
  model?: string;
  location?: string;
  auto_archive?: boolean;
  // Maintenance Mode flag (#1476). Backend already gates MQTT, queue dispatch,
  // scheduler, metrics and the print picker on this; toggling via PATCH
  // /printers/{id} disconnects or reconnects MQTT accordingly.
  is_active?: boolean;
  external_camera_url?: string | null;
  external_camera_type?: string | null;
  external_camera_enabled?: boolean;
  external_camera_snapshot_url?: string | null;
  camera_rotation?: number;
  plate_detection_enabled?: boolean;
  plate_detection_roi?: PlateDetectionROI;
}

export interface PlateDetectionROI {
  x: number;  // X start % (0.0-1.0)
  y: number;  // Y start % (0.0-1.0)
  w: number;  // Width % (0.0-1.0)
  h: number;  // Height % (0.0-1.0)
}

export interface PlateDetectionResult {
  is_empty: boolean;
  confidence: number;
  difference_percent: number;
  message: string;
  has_debug_image: boolean;
  debug_image_url?: string;
  needs_calibration: boolean;
  light_warning?: boolean;
  reference_count?: number;
  max_references?: number;
  roi?: PlateDetectionROI;
}

export interface PlateDetectionStatus {
  available: boolean;
  calibrated: boolean;
  reference_count: number;
  max_references: number;
  message: string;
}

export interface CalibrationResult {
  success: boolean;
  message: string;
}

export interface PlateReference {
  index: number;
  label: string;
  timestamp: string;
  has_image: boolean;
  thumbnail_url: string;
}

export interface AMSHistoryPoint {
  recorded_at: string;
  humidity: number | null;
  humidity_raw: number | null;
  temperature: number | null;
}

export interface AMSHistoryResponse {
  printer_id: number;
  ams_id: number;
  data: AMSHistoryPoint[];
  min_humidity: number | null;
  max_humidity: number | null;
  avg_humidity: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  avg_temperature: number | null;
}

export type HeaterSensorKind = 'nozzle' | 'nozzle_2' | 'bed' | 'chamber';

export interface HeaterHistoryPoint {
  recorded_at: string;
  value: number | null;
  target: number | null;
}

export interface HeaterSeries {
  sensor_kind: HeaterSensorKind;
  data: HeaterHistoryPoint[];
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
}

export interface PrinterSensorHistoryResponse {
  printer_id: number;
  series: HeaterSeries[];
}

// Archive types

export interface ArchiveDuplicate {
  id: number;
  print_name: string | null;
  created_at: string;
  match_type: 'exact' | 'similar';  // 'exact' = hash match, 'similar' = name match
}

export interface Archive {
  id: number;
  printer_id: number | null;
  printer_name?: string | null;
  project_id: number | null;
  project_name: string | null;
  filename: string;
  file_path: string;
  file_size: number;
  content_hash: string | null;
  thumbnail_path: string | null;
  timelapse_path: string | null;
  source_3mf_path: string | null;
  f3d_path: string | null;
  duplicates: ArchiveDuplicate[] | null;
  duplicate_count: number;
  duplicate_sequence: number;  // 0 = original, 1+ = nth duplicate
  original_archive_id: number | null;  // ID of the first/original archive
  object_count: number | null;
  print_name: string | null;
  print_time_seconds: number | null;
  actual_time_seconds: number | null;  // Computed from started_at/completed_at
  time_accuracy: number | null;  // Percentage: 100 = perfect, >100 = faster than estimated
  filament_used_grams: number | null;
  filament_type: string | null;
  filament_color: string | null;
  layer_height: number | null;
  total_layers: number | null;
  nozzle_diameter: number | null;
  bed_temperature: number | null;
  bed_type: string | null;  // Build plate type from 3MF (e.g. "Cool Plate", "Textured PEI Plate")
  nozzle_temperature: number | null;
  sliced_for_model: string | null;  // Printer model this file was sliced for
  status: string;
  started_at: string | null;
  completed_at: string | null;
  extra_data: Record<string, unknown> | null;
  makerworld_url: string | null;
  designer: string | null;
  external_url: string | null;
  is_favorite: boolean;
  tags: string | null;
  notes: string | null;
  cost: number | null;
  photos: string[] | null;
  failure_reason: string | null;
  quantity: number;
  energy_kwh: number | null;
  energy_cost: number | null;
  created_at: string;
  // User tracking (Issue #206)
  created_by_id: number | null;
  created_by_username: string | null;
  // Per-archive run aggregates from PrintLogEntry (#1378)
  run_count: number;
  last_run_at: string | null;
  total_filament_actual_grams: number | null;
  successful_run_count: number;
  failed_run_count: number;
}

export interface ArchiveSlim {
  printer_id: number | null;
  print_name: string | null;
  print_time_seconds: number | null;
  actual_time_seconds: number | null;
  filament_used_grams: number | null;
  filament_type: string | null;
  filament_color: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  cost: number | null;
  quantity: number;
  created_at: string;
}

export interface PrintLogEntry {
  id: number;
  archive_id: number | null;
  print_name: string | null;
  printer_name: string | null;
  printer_id: number | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  filament_type: string | null;
  filament_color: string | null;
  filament_used_grams: number | null;
  cost: number | null;
  energy_kwh: number | null;
  energy_cost: number | null;
  failure_reason: string | null;
  thumbnail_path: string | null;
  created_by_id: number | null;
  created_by_username: string | null;
  created_at: string;
}

export interface PrintLogResponse {
  items: PrintLogEntry[];
  total: number;
}

export interface ArchiveStats {
  total_prints: number;
  successful_prints: number;
  failed_prints: number;
  cancelled_prints: number;
  total_print_time_hours: number;
  total_filament_grams: number;
  total_cost: number;
  prints_by_filament_type: Record<string, number>;
  prints_by_printer: Record<string, number>;
  average_time_accuracy: number | null;
  time_accuracy_by_printer: Record<string, number> | null;
  total_energy_kwh: number;
  total_energy_cost: number;
  // True when a date-filtered total-consumption query is running on incomplete
  // snapshot history (e.g. right after upgrade, before hourly snapshots have
  // a baseline). UI should explain why the number may undercount.
  energy_data_warming_up?: boolean;
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface FailureAnalysis {
  period_days: number;
  total_prints: number;
  failed_prints: number;
  failure_rate: number;
  failures_by_reason: Record<string, number>;
  failures_by_filament: Record<string, number>;
  failures_by_printer: Record<string, number>;
  failures_by_hour: Record<number, number>;
  recent_failures: Array<{
    id: number;
    print_name: string;
    failure_reason: string | null;
    filament_type: string | null;
    printer_id: number | null;
    created_at: string | null;
  }>;
  trend: Array<{
    week_start: string;
    total_prints: number;
    failed_prints: number;
    failure_rate: number;
  }>;
}

export interface BulkUploadResult {
  uploaded: number;
  failed: number;
  results: Array<{ filename: string; id: number; status: string }>;
  errors: Array<{ filename: string; error: string }>;
}

export interface ComparisonArchiveInfo {
  id: number;
  print_name: string;
  status: string;
  created_at: string | null;
  printer_id: number | null;
  project_name: string | null;
}

export interface ComparisonField {
  field: string;
  label: string;
  unit: string | null;
  values: (string | number | null)[];
  raw_values: (string | number | null)[];
  has_difference: boolean;
}

export interface SuccessCorrelationInsight {
  field: string;
  label: string;
  insight: string;
  success_avg?: number;
  failed_avg?: number;
  success_values?: string[];
  failed_values?: string[];
}

export interface SuccessCorrelation {
  has_both_outcomes: boolean;
  message?: string;
  successful_count?: number;
  failed_count?: number;
  insights?: SuccessCorrelationInsight[];
}

export interface ArchiveComparison {
  archives: ComparisonArchiveInfo[];
  comparison: ComparisonField[];
  differences: ComparisonField[];
  success_correlation: SuccessCorrelation;
}

export interface SimilarArchive {
  archive: {
    id: number;
    print_name: string;
    status: string;
    created_at: string | null;
  };
  match_reason: string;
  match_score: number;
}

// Queue types

export interface PrintQueueItem {
  id: number;
  printer_id: number | null;  // null = unassigned
  target_model: string | null;  // Target printer model for model-based assignment
  target_location: string | null;  // Target location filter for model-based assignment
  required_filament_types: string[] | null;  // Required filament types for model-based assignment
  waiting_reason: string | null;  // Why a model-based job hasn't started yet
  // Either archive_id OR library_file_id must be set (archive created at print start)
  archive_id: number | null;
  library_file_id: number | null;
  position: number;
  scheduled_time: string | null;
  require_previous_success: boolean;
  auto_off_after: boolean;
  manual_start: boolean;  // Requires manual trigger to start (staged)
  // Set by the dispatch scheduler when the assigned spool can't satisfy
  // any required slot's grams (#1496). Surfaced on the queue row as a
  // "filament short" badge; cleared on a successful ▶ click (live recheck).
  filament_short: boolean;
  // Persistent "Print Anyway" acknowledgement — once true the scheduler
  // skips the deficit check for this item (#1698-followup). Set by the
  // start route when skip_filament_check=true, or at queue creation if
  // PrintModal's deficit warning was acknowledged.
  skip_filament_check: boolean;
  ams_mapping: number[] | null;  // AMS slot mapping for multi-color prints
  filament_overrides: Array<{ slot_id: number; type: string; color: string; color_name?: string; force_color_match?: boolean }> | null;  // Filament overrides for model-based assignment
  plate_id: number | null;  // Plate ID for multi-plate 3MF files
  // Print options
  bed_levelling: boolean;
  flow_cali: boolean;
  vibration_cali: boolean;
  layer_inspect: boolean;
  timelapse: boolean;
  use_ams: boolean;
  nozzle_offset_cali: boolean;
  preheat_override: 'inherit' | 'on' | 'off';
  preheat_chamber_target_override: number | null;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  archive_name?: string | null;
  archive_thumbnail?: string | null;
  // True when the linked archive has been soft-deleted; archive_name /
  // archive_thumbnail / downstream metadata are left null in that case so
  // the UI doesn't 404-storm the now-missing endpoints (#1348 follow-up).
  archive_deleted?: boolean;
  library_file_name?: string | null;
  library_file_thumbnail?: string | null;
  printer_name?: string | null;
  print_time_seconds?: number | null;  // Estimated print time from archive or library file
  filament_used_grams?: number | null;  // Estimated print weight from archive or library file
  filament_type?: string | null;  // e.g. "PLA", "PETG"
  filament_color?: string | null;  // Hex RGBA from the slicer
  bed_type?: string | null;  // Build plate type for this print (per-plate accurate, #1281)
  // User tracking (Issue #206)
  created_by_id?: number | null;
  created_by_username?: string | null;
  // Batch grouping
  batch_id?: number | null;
  batch_name?: string | null;
  // Shortest-job-first scheduling
  been_jumped?: boolean;
  // Auto-print G-code injection
  gcode_injection?: boolean;
  cleanup_library_after_dispatch?: boolean;
}

export interface PrintBatch {
  id: number;
  name: string;
  archive_id: number | null;
  library_file_id: number | null;
  quantity: number;
  status: string;
  created_at: string;
  created_by_id: number | null;
  created_by_username: string | null;
  pending_count: number;
  printing_count: number;
  completed_count: number;
  failed_count: number;
  cancelled_count: number;
}

export interface PrintBatchUngroupResponse {
  ungrouped_count: number;
  message: string;
}

export interface PrintQueueItemCreate {
  printer_id?: number | null;  // null = unassigned
  target_model?: string | null;  // Target printer model (mutually exclusive with printer_id)
  target_location?: string | null;  // Target location filter (only used with target_model)
  filament_overrides?: Array<{ slot_id: number; type: string; color: string; color_name?: string; force_color_match?: boolean }> | null;
  archive_id?: number | null;
  library_file_id?: number | null;
  scheduled_time?: string | null;
  require_previous_success?: boolean;
  auto_off_after?: boolean;
  manual_start?: boolean;  // Requires manual trigger to start (staged)
  insert_at_top?: boolean;  // Insert ahead of other pending items in the same queue scope
  insert_position?: number | null;  // 1-indexed insertion position for priority queueing
  // PrintModal "Print Anyway" on the deficit warning — persisted so the
  // scheduler doesn't immediately re-flag this item (#1698-followup).
  skip_filament_check?: boolean;
  ams_mapping?: number[] | null;  // AMS slot mapping for multi-color prints
  plate_id?: number | null;  // Plate ID for multi-plate 3MF files
  // Print options
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
  nozzle_offset_cali?: boolean;
  preheat_override?: 'inherit' | 'on' | 'off';
  preheat_chamber_target_override?: number | null;
  // Auto-print G-code injection
  gcode_injection?: boolean;
  // Batch: create multiple copies (creates a batch if > 1)
  quantity?: number;
  // Existing batch to add this item into (multi-plate auto-batch flow).
  batch_id?: number | null;
  // Project to associate the resulting archive with
  project_id?: number;
  // Delete transient uploaded library file after scheduler creates the archive
  cleanup_library_after_dispatch?: boolean;
}

export interface PrintBatchCreate {
  name: string;
  archive_id?: number | null;
  library_file_id?: number | null;
  /** When set, the listed pending items are assigned to the new batch
   *  (manual "Group as batch"). When omitted/empty, an empty batch is
   *  returned so the client can pass batch_id on subsequent addToQueue calls. */
  item_ids?: number[];
}

export interface PrintQueueItemUpdate {
  printer_id?: number | null;  // null = unassign
  target_model?: string | null;  // Target printer model (mutually exclusive with printer_id)
  target_location?: string | null;  // Target location filter (only used with target_model)
  filament_overrides?: Array<{ slot_id: number; type: string; color: string; color_name?: string; force_color_match?: boolean }> | null;
  position?: number;
  scheduled_time?: string | null;
  require_previous_success?: boolean;
  auto_off_after?: boolean;
  manual_start?: boolean;
  ams_mapping?: number[];
  plate_id?: number | null;  // Plate ID for multi-plate 3MF files
  // Print options
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
  nozzle_offset_cali?: boolean;
  preheat_override?: 'inherit' | 'on' | 'off';
  preheat_chamber_target_override?: number | null;
  // Auto-print G-code injection
  gcode_injection?: boolean;
}

export interface PrintQueueBulkUpdate {
  item_ids: number[];
  printer_id?: number | null;
  scheduled_time?: string | null;
  require_previous_success?: boolean;
  auto_off_after?: boolean;
  manual_start?: boolean;
  // Print options
  bed_levelling?: boolean;
  flow_cali?: boolean;
  vibration_cali?: boolean;
  layer_inspect?: boolean;
  timelapse?: boolean;
  use_ams?: boolean;
  nozzle_offset_cali?: boolean;
  preheat_override?: 'inherit' | 'on' | 'off';
  preheat_chamber_target_override?: number | null;
  // Auto-print G-code injection
  gcode_injection?: boolean;
}

export interface PrintQueueBulkUpdateResponse {
  updated_count: number;
  skipped_count: number;
  message: string;
}

export interface AddToQueueResult {
  file_id: number;
  filename: string;
  queue_item_id: number;
  archive_id: number;
}

export interface AddToQueueError {
  file_id: number;
  filename: string;
  error: string;
}

export interface AddToQueueResponse {
  added: AddToQueueResult[];
  errors: AddToQueueError[];
}

// File / Library types

export interface LibraryFolderTree {
  id: number;
  name: string;
  parent_id: number | null;
  project_id: number | null;
  archive_id: number | null;
  project_name: string | null;
  archive_name: string | null;
  is_external: boolean;
  external_path: string | null;
  external_readonly: boolean;
  file_count: number;
  // max(folder.updated_at, max(immediate-child file.updated_at)). Used by
  // the File Manager folder tree's "sort by recent activity" mode (#1770).
  latest_activity_at: string | null;
  children: LibraryFolderTree[];
}

export interface LibraryFolder {
  id: number;
  name: string;
  parent_id: number | null;
  project_id: number | null;
  archive_id: number | null;
  project_name: string | null;
  archive_name: string | null;
  is_external: boolean;
  external_path: string | null;
  external_readonly: boolean;
  external_show_hidden: boolean;
  file_count: number;
  latest_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryFolderCreate {
  name: string;
  parent_id?: number | null;
  project_id?: number | null;
  archive_id?: number | null;
}

export interface ExternalFolderCreate {
  name: string;
  external_path: string;
  readonly?: boolean;
  show_hidden?: boolean;
  parent_id?: number | null;
}

export interface LibraryFolderUpdate {
  name?: string;
  parent_id?: number | null;
  project_id?: number | null;  // 0 to unlink
  archive_id?: number | null;  // 0 to unlink
}

export interface LibraryFileDuplicate {
  id: number;
  filename: string;
  folder_id: number | null;
  folder_name: string | null;
  created_at: string;
}

export interface LibraryFile {
  id: number;
  folder_id: number | null;
  folder_name: string | null;
  project_id: number | null;
  project_name: string | null;
  is_external: boolean;
  filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  file_hash: string | null;
  thumbnail_path: string | null;
  metadata: Record<string, unknown> | null;
  print_count: number;
  last_printed_at: string | null;
  notes: string | null;
  duplicates: LibraryFileDuplicate[] | null;
  duplicate_count: number;
  // User tracking (Issue #206)
  created_by_id: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
  // Metadata fields
  print_name: string | null;
  print_time_seconds: number | null;
  filament_used_grams: number | null;
  sliced_for_model: string | null;
}

export interface LibraryTagSummary {
  id: number;
  name: string;
}

export interface LibraryFileListItem {
  id: number;
  folder_id: number | null;
  is_external: boolean;
  filename: string;
  file_type: string;
  file_size: number;
  thumbnail_path: string | null;
  print_count: number;
  duplicate_count: number;
  // User tracking (Issue #206)
  created_by_id: number | null;
  created_by_username: string | null;
  created_at: string;
  print_name: string | null;
  print_time_seconds: number | null;
  filament_used_grams: number | null;
  sliced_for_model: string | null;
  // Tags assigned to this file (#1268). The backend always emits an empty
  // array when a file has no tags, but the field is typed optional so any
  // legacy code path (or mock) that constructs a LibraryFileListItem without
  // it doesn't crash the renderer. Read sites use `file.tags ?? []`.
  tags?: LibraryTagSummary[];
}

export interface LibraryTag {
  id: number;
  name: string;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface LibraryTagBulkAssignResult {
  files_updated: number;
  associations_added: number;
  associations_removed: number;
}

export interface LibraryFileUpdate {
  filename?: string;
  folder_id?: number | null;
  project_id?: number | null;
  notes?: string | null;
}

export interface LibraryTrashItem {
  id: number;
  filename: string;
  file_size: number;
  thumbnail_path: string | null;
  folder_id: number | null;
  folder_name: string | null;
  created_by_id: number | null;
  created_by_username: string | null;
  deleted_at: string;
  auto_purge_at: string;
}

export interface LibraryTrashListResponse {
  items: LibraryTrashItem[];
  total: number;
  retention_days: number;
}

export interface LibraryPurgePreview {
  count: number;
  total_bytes: number;
  sample_filenames: string[];
  older_than_days: number;
  include_never_printed: boolean;
}

export interface LibraryTrashSettings {
  retention_days: number;
  auto_purge_enabled: boolean;
  auto_purge_days: number;
  auto_purge_include_never_printed: boolean;
}

export interface ArchivePurgePreview {
  count: number;
  total_bytes: number;
  sample_filenames: string[];
  older_than_days: number;
}

export interface ArchivePurgeSettings {
  enabled: boolean;
  days: number;
  // #1390: when true, bulk-deletes the linked PrintLogEntry rows so the
  // contribution drops from Quick Stats too. Default false — soft-delete,
  // Quick Stats preserved.
  purge_stats: boolean;
}

export interface LibraryFileUploadResponse {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  thumbnail_path: string | null;
  duplicate_of: number | null;
  metadata: Record<string, unknown> | null;
}

export interface LibraryStats {
  total_files: number;
  total_folders: number;
  total_size_bytes: number;
  files_by_type: Record<string, number>;
  total_prints: number;
  disk_free_bytes: number;
  disk_total_bytes: number;
  disk_used_bytes: number;
}

export interface ZipExtractResult {
  filename: string;
  file_id: number;
  folder_id: number | null;
}

export interface ZipExtractError {
  filename: string;
  error: string;
}

export interface ZipExtractResponse {
  extracted: number;
  folders_created: number;
  files: ZipExtractResult[];
  errors: ZipExtractError[];
}

export interface BatchThumbnailResult {
  file_id: number;
  filename: string;
  success: boolean;
  error?: string | null;
}

export interface BatchThumbnailResponse {
  processed: number;
  succeeded: number;
  failed: number;
  results: BatchThumbnailResult[];
}

// Project types

export interface ProjectStats {
  total_archives: number;
  total_items: number;  // Sum of quantities (total items printed)
  completed_prints: number;  // Sum of quantities for completed prints (parts)
  failed_prints: number;
  queued_prints: number;
  in_progress_prints: number;
  total_print_time_hours: number;
  total_filament_grams: number;
  progress_percent: number | null;  // Plates progress (total_archives / target_count)
  parts_progress_percent: number | null;  // Parts progress (completed_prints / target_parts_count)
  estimated_cost: number;
  total_energy_kwh: number;
  total_energy_cost: number;
  remaining_prints: number | null;  // Remaining plates
  remaining_parts: number | null;  // Remaining parts
  bom_total_items: number;
  bom_completed_items: number;
  bom_cost: number;
}

export interface ProjectChildPreview {
  id: number;
  name: string;
  color: string | null;
  status: string;
  progress_percent: number | null;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  status: string;  // active, completed, archived
  target_count: number | null;  // Target number of plates/print jobs
  target_parts_count: number | null;  // Target number of parts/objects
  notes: string | null;
  attachments: ProjectAttachment[] | null;
  tags: string | null;
  due_date: string | null;
  priority: string;  // low, normal, high, urgent
  budget: number | null;
  is_template: boolean;
  template_source_id: number | null;
  parent_id: number | null;
  parent_name: string | null;
  children: ProjectChildPreview[];
  created_at: string;
  updated_at: string;
  stats?: ProjectStats;
  url: string | null;  // External link rendered next to project name on the card (#1155)
  cover_image_filename: string | null;  // Filename within project attachments dir (#1155)
}

export interface ProjectAttachment {
  filename: string;
  original_name: string;
  size: number;
  uploaded_at: string;
}

export interface ArchivePreview {
  id: number;
  print_name: string | null;
  thumbnail_path: string | null;
  status: string;
  filament_type: string | null;
  filament_color: string | null;
}

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  target_count: number | null;  // Target number of plates/print jobs
  target_parts_count: number | null;  // Target number of parts/objects
  budget: number | null;
  created_at: string;
  archive_count: number;  // Number of print jobs (plates)
  total_items: number;  // Sum of quantities (total items printed, including failed)
  completed_count: number;  // Sum of quantities for completed prints only (parts)
  failed_count: number;  // Sum of quantities for failed prints
  queue_count: number;
  progress_percent: number | null;  // Plates progress
  archives: ArchivePreview[];
  url: string | null;  // #1155
  cover_image_filename: string | null;  // #1155
}

export interface ProjectCreate {
  name: string;
  description?: string;
  color?: string;
  target_count?: number;
  target_parts_count?: number;
  notes?: string;
  tags?: string;
  due_date?: string;
  priority?: string;
  budget?: number | null;
  parent_id?: number;
  url?: string | null;  // #1155
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  color?: string;
  status?: string;
  target_count?: number;
  target_parts_count?: number;
  notes?: string;
  tags?: string;
  due_date?: string;
  priority?: string;
  budget?: number | null;
  parent_id?: number;
  url?: string | null;  // #1155 — explicit null clears the URL
}

export interface BOMItem {
  id: number;
  project_id: number;
  name: string;
  quantity_needed: number;
  quantity_acquired: number;
  unit_price: number | null;
  sourcing_url: string | null;
  archive_id: number | null;
  archive_name: string | null;
  stl_filename: string | null;
  remarks: string | null;
  sort_order: number;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface BOMItemCreate {
  name: string;
  quantity_needed?: number;
  unit_price?: number;
  sourcing_url?: string;
  archive_id?: number;
  stl_filename?: string;
  remarks?: string;
}

export interface BOMItemUpdate {
  name?: string;
  quantity_needed?: number;
  quantity_acquired?: number;
  unit_price?: number;
  sourcing_url?: string;
  archive_id?: number;
  stl_filename?: string;
  remarks?: string;
}

export interface BOMItemExport {
  name: string;
  quantity_needed: number;
  quantity_acquired: number;
  unit_price: number | null;
  sourcing_url: string | null;
  stl_filename: string | null;
  remarks: string | null;
}

export interface LinkedFolderExport {
  name: string;
}

export interface ProjectExport {
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  target_count: number | null;
  target_parts_count: number | null;
  notes: string | null;
  tags: string | null;
  due_date: string | null;
  priority: string;
  budget: number | null;
  bom_items: BOMItemExport[];
  linked_folders: LinkedFolderExport[];
}

export interface ProjectImport {
  name: string;
  description?: string;
  color?: string;
  status?: string;
  target_count?: number;
  target_parts_count?: number;
  notes?: string;
  tags?: string;
  due_date?: string;
  priority?: string;
  budget?: number | null;
  bom_items?: BOMItemExport[];
  linked_folders?: LinkedFolderExport[];
}

export interface TimelineEvent {
  event_type: string;
  timestamp: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

// Inventory / Spool types

export interface Filament {
  id: number;
  name: string;
  type: string;  // PLA, PETG, ABS, etc.
  brand: string | null;
  color: string | null;
  color_hex: string | null;
  cost_per_kg: number;
  spool_weight_g: number;
  currency: string;
  density: number | null;
  print_temp_min: number | null;
  print_temp_max: number | null;
  bed_temp_min: number | null;
  bed_temp_max: number | null;
  created_at: string;
  updated_at: string;
}

export interface SpoolmanStatus {
  enabled: boolean;
  connected: boolean;
  url: string | null;
}

export interface SkippedSpool {
  location: string;
  reason: string;
  filament_type: string | null;
  color: string | null;
}

export interface SpoolmanSyncResult {
  success: boolean;
  synced_count: number;
  skipped_count: number;
  skipped: SkippedSpool[];
  errors: string[];
}

export interface UnlinkedSpool {
  id: number;
  filament_name: string | null;
  filament_vendor: string | null;
  filament_material: string | null;
  filament_color_hex: string | null;
  remaining_weight: number | null;
  location: string | null;
}

export interface LinkedSpoolInfo {
  id: number;
  remaining_weight: number | null;
  filament_weight: number | null;
}

export interface LinkedSpoolsMap {
  linked: Record<string, LinkedSpoolInfo>; // tag (uppercase) -> spool info
}

export interface SpoolmanVendor {
  id: number;
  name: string;
}

export interface SpoolmanFilamentEntry {
  id: number;
  name: string;
  material: string | null;
  color_hex: string | null;
  color_name: string | null;
  weight: number | null;
  spool_weight: number | null;
  vendor: SpoolmanVendor | null;
}

export type SpoolLabelTemplate =
  | 'ams_holder_74x33'
  | 'ams_holder_75x55'
  | 'box_40x30'
  | 'box_62x29'
  | 'avery_5160'
  | 'avery_l7160';

export interface InventorySpool {
  id: number;
  material: string;
  subtype: string | null;
  color_name: string | null;
  // True when color_name was synthesised from subtype because Spoolman has no
  // stored value (Spoolman-backed inventory only). The edit form uses this to
  // leave the input blank, so the user doesn't round-trip the synth value
  // back to Spoolman as if it were a real user-set color_name (#1319).
  color_name_is_synthesized?: boolean;
  rgba: string | null;
  // Multi-colour gradient stops (#1154): comma-separated 6/8-char hex.
  extra_colors: string | null;
  // Visual effect overlay: sparkle | wood | marble | glow | matte.
  effect_type: string | null;
  brand: string | null;
  label_weight: number;
  core_weight: number;
  core_weight_catalog_id: number | null;
  weight_used: number;
  // Anchor for the resettable "Total Consumed" display (#1390). The
  // counter shown on the Inventory page is `weight_used - weight_used_baseline`;
  // remaining is still `label_weight - weight_used`, so "Reset usage to 0"
  // zeroes the counter without disturbing remaining. Optional for back-compat
  // with rows from a pre-migration DB snapshot — default to 0.
  weight_used_baseline?: number;
  slicer_filament: string | null;
  slicer_filament_name: string | null;
  nozzle_temp_min: number | null;
  nozzle_temp_max: number | null;
  note: string | null;
  added_full: boolean | null;
  last_used: string | null;
  encode_time: string | null;
  tag_uid: string | null;
  tray_uuid: string | null;
  data_origin: string | null;
  tag_type: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  cost_per_kg: number | null;
  last_scale_weight: number | null;
  last_weighed_at: string | null;
  // User-defined category + per-spool low-stock threshold override (#729).
  category: string | null;
  low_stock_threshold_pct: number | null;
  k_profiles?: SpoolKProfile[];
  storage_location?: string | null;
  location_id?: number | null;
}

export interface SpoolmanBulkCreateResult {
  created: InventorySpool[];
  requested_count: number;
  failed_count: number;
}

/** One row's outcome from the import preview / real import. */
export interface CsvImportRow {
  row_number: number;
  status: 'valid' | 'error' | 'skipped';
  reason: string | null;
  material: string | null;
  brand: string | null;
  color_name: string | null;
  rgba: string | null;
  /** rgba/extra_colors/effect_type were filled from the Color Catalog. */
  resolved_color: boolean;
  /** The catalog match came from a different material's variant (no exact
   *  material match). Shown as a warning in the preview. */
  cross_material_color: boolean;
  /** An active spool with the same material+brand+color already exists.
   *  Informational only — the import still creates the row. */
  duplicate_of_existing: boolean;
}

/** Dry-run preview: per-row classification, no rows written. */
export interface CsvImportPreview {
  columns: string[];
  total: number;
  valid_count: number;
  error_count: number;
  skipped_count: number;
  rows: CsvImportRow[];
  warnings: string[];
}

/** Summary returned after a real (non-dry-run) import. */
export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: number;
  error_rows: CsvImportRow[];
}

export interface SpoolUsageRecord {
  id: number;
  spool_id: number;
  printer_id: number | null;
  print_name: string | null;
  weight_used: number;
  percent_used: number;
  status: string;
  cost: number | null;
  created_at: string;
}

export interface SpoolKProfile {
  id: number;
  spool_id: number;
  printer_id: number;
  extruder: number;
  nozzle_diameter: string;
  nozzle_type: string | null;
  k_value: number;
  name: string | null;
  cali_idx: number | null;
  setting_id: string | null;
  created_at: string;
}

export interface SpoolKProfileInput {
  printer_id: number;
  extruder?: number;
  nozzle_diameter?: string;
  nozzle_type?: string | null;
  k_value: number;
  name?: string | null;
  cali_idx?: number | null;
  setting_id?: string | null;
}

export interface SpoolAssignment {
  id: number;
  spool_id: number;
  printer_id: number;
  printer_name: string | null;
  ams_id: number;
  tray_id: number;
  fingerprint_color: string | null;
  fingerprint_type: string | null;
  spool?: InventorySpool | null;
  configured: boolean;
  pending_config?: boolean;  // Slot was empty at assign time; will configure on insert
  created_at: string;
  ams_label?: string | null;  // User-defined friendly name for the AMS unit
}

export interface FilamentSkuSettings {
  id: number;
  material: string;
  subtype: string | null;
  brand: string | null;
  color_name: string | null;
  lead_time_days: number;
  safety_margin_value: number;
  safety_margin_unit: 'days' | 'g';
  alerts_snoozed: boolean;
}

export interface ShoppingListItem {
  id: number;
  material: string;
  subtype: string | null;
  brand: string | null;
  color_name: string | null;
  quantity_spools: number;
  note: string | null;
  status: 'pending' | 'purchased' | 'received';
  purchased_at: string | null;
  added_at: string;
}

export interface ShoppingListItemCreate {
  material: string;
  subtype: string | null;
  brand: string | null;
  color_name: string | null;
  quantity_spools: number;
  note?: string | null;
}

// Settings types

export interface APIKey {
  id: number;
  name: string;
  key_prefix: string;
  user_id: number | null;  // Owner; null on legacy keys created before per-user ownership (#1182)
  can_queue: boolean;
  can_control_printer: boolean;
  can_read_status: boolean;
  can_manage_library: boolean;
  can_manage_inventory: boolean;
  can_manage_maintenance: boolean;
  can_manage_archives: boolean;
  can_manage_projects: boolean;
  can_access_cloud: boolean;
  can_update_energy_cost: boolean;
  printer_ids: number[] | null;
  enabled: boolean;
  last_used: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface APIKeyCreate {
  name: string;
  can_queue?: boolean;
  can_control_printer?: boolean;
  can_read_status?: boolean;
  can_manage_library?: boolean;
  can_manage_inventory?: boolean;
  can_manage_maintenance?: boolean;
  can_manage_archives?: boolean;
  can_manage_projects?: boolean;
  can_access_cloud?: boolean;
  can_update_energy_cost?: boolean;
  printer_ids?: number[] | null;
  expires_at?: string | null;
}

export interface APIKeyCreateResponse extends APIKey {
  key: string;  // Full key, only shown on creation
}

export interface APIKeyUpdate {
  name?: string;
  can_queue?: boolean;
  can_control_printer?: boolean;
  can_read_status?: boolean;
  can_manage_library?: boolean;
  can_manage_inventory?: boolean;
  can_manage_maintenance?: boolean;
  can_manage_archives?: boolean;
  can_manage_projects?: boolean;
  can_access_cloud?: boolean;
  can_update_energy_cost?: boolean;
  printer_ids?: number[] | null;
  enabled?: boolean;
  expires_at?: string | null;
}

export interface AppSettings {
  auto_archive: boolean;
  save_thumbnails: boolean;
  capture_finish_photo: boolean;
  default_filament_cost: number;
  currency: string;
  energy_cost_per_kwh: number;
  energy_tracking_mode: 'print' | 'total';
  check_updates: boolean;
  check_printer_firmware: boolean;
  include_beta_updates: boolean;
  // #1589: false hides the local username/password form on the login page;
  // BAMBUDDY_LOCAL_LOGIN=true on the server flips the reported value back to
  // true so the env-var recovery path is visible to the SPA.
  local_login_enabled: boolean;
  language: string;
  notification_language: string;
  // AMS threshold settings
  ams_humidity_good: number;  // <= this is green
  ams_humidity_fair: number;  // <= this is orange, > is red
  ams_temp_good: number;      // <= this is green/blue
  ams_temp_fair: number;      // <= this is orange, > is red
  ams_history_retention_days: number;  // days to keep AMS sensor history
  // Queue auto-drying settings
  queue_drying_enabled: boolean;  // Auto-dry AMS between queued prints
  queue_drying_block: boolean;  // Block queue until drying completes
  ambient_drying_enabled: boolean;  // Auto-dry idle printers based on humidity regardless of queue
  print_drying_enabled: boolean;  // Continue drying while a print is running on capable hardware
  drying_presets: string;  // JSON blob of drying presets per filament type
  ams_humidity_thresholds: string;  // JSON blob of per-filament humidity thresholds (#1605)
  gcode_snippets: string;  // JSON: per-model G-code injection snippets
  // Scheduled local backup
  local_backup_enabled: boolean;
  local_backup_schedule: string;
  local_backup_time: string;
  local_backup_retention: number;
  local_backup_path: string;
  // Print modal settings
  per_printer_mapping_expanded: boolean;  // Whether custom mapping is expanded by default in print modal
  // Date/time format settings
  date_format: 'system' | 'us' | 'eu' | 'iso';
  time_format: 'system' | '12h' | '24h';
  // Filament tracking
  disable_filament_warnings: boolean;  // Disable filament warnings (print insufficiency and assignment mismatch)
  prefer_lowest_filament: boolean;  // When multiple spools match, prefer lowest remaining filament
  spoolman_enabled: boolean;  // True when the user has switched filament tracking to Spoolman; backend includes this in the /settings/ response even though earlier consumers read it from the dedicated /settings/spoolman endpoint as a string
  auto_add_unknown_rfid: boolean;  // When false, the backend skips auto-creating inventory spools for unknown RFID tags and instead broadcasts an unknown_tag event for the confirmation modal
  spoolman_url: string;
  // Default printer
  default_printer_id: number | null;
  pipeline_max_copies: number;
  // Dark mode theme settings
  dark_style: 'classic' | 'glow' | 'vibrant';
  dark_background: 'neutral' | 'warm' | 'cool' | 'oled' | 'slate' | 'forest';
  dark_accent: 'green' | 'teal' | 'blue' | 'orange' | 'purple' | 'red';
  // Light mode theme settings
  light_style: 'classic' | 'glow' | 'vibrant';
  light_background: 'neutral' | 'warm' | 'cool';
  light_accent: 'green' | 'teal' | 'blue' | 'orange' | 'purple' | 'red';
  // FTP retry settings
  ftp_retry_enabled: boolean;
  ftp_retry_count: number;
  ftp_retry_delay: number;
  ftp_timeout: number;
  // MQTT relay settings
  mqtt_enabled: boolean;
  mqtt_broker: string;
  mqtt_port: number;
  mqtt_username: string;
  mqtt_password: string;
  mqtt_topic_prefix: string;
  mqtt_use_tls: boolean;
  // External URL for notifications
  external_url: string;
  // Home Assistant integration
  ha_enabled: boolean;
  ha_url: string;
  ha_token: string;
  ha_url_from_env: boolean;
  ha_token_from_env: boolean;
  ha_env_managed: boolean;
  // File Manager / Library settings
  library_archive_mode: 'always' | 'never' | 'ask';
  library_disk_warning_gb: number;
  // Camera view settings
  camera_view_mode: 'window' | 'embedded';
  // Preferred slicer (server-side API / sidecar)
  preferred_slicer: 'bambu_studio' | 'orcaslicer';
  // Desktop "Open in Slicer" override (#1329). Null inherits from
  // preferred_slicer so existing installs behave identically.
  open_in_slicer: 'bambu_studio' | 'orcaslicer' | null;
  // Use the slicer-API sidecar for slicing (in-app modal) vs desktop URI scheme
  use_slicer_api: boolean;
  // Per-install sidecar URLs. Empty string falls back to the env defaults.
  orcaslicer_api_url: string;
  bambu_studio_api_url: string;
  // Prometheus metrics
  prometheus_enabled: boolean;
  prometheus_token: string;
  // Bed cooled threshold
  bed_cooled_threshold: number;
  // Inventory low stock threshold
  low_stock_threshold: number;
  // Session policy (#1706) — admin-set ceiling, hours, [1, 720]
  session_max_hours: number;
  // User email notifications toggle
  user_notifications_enabled: boolean;
  // Default print options
  default_bed_levelling: boolean;
  default_flow_cali: boolean;
  default_vibration_cali: boolean;
  default_layer_inspect: boolean;
  default_timelapse: boolean;
  default_nozzle_offset_cali: boolean;
  // Staggered batch start defaults
  stagger_group_size: number;
  stagger_interval_minutes: number;
  // Plate-clear confirmation
  require_plate_clear: boolean;
  // Shortest job first scheduling
  queue_shortest_first: boolean;
  // Preheat / heat-soak before queued prints (#1468). Master toggle is the
  // default for new queue items; per-item PrintQueueItem.preheat_override can
  // flip the decision per print. Chamber target derives from the loaded AMS
  // filament types via preheat_filament_targets (JSON map of type → °C, max
  // across loaded slots); the per-item override field bypasses derivation.
  preheat_enabled: boolean;
  preheat_filament_targets: string;
  preheat_max_wait_seconds: number;
  preheat_soak_seconds: number;
  // User-configurable presets for the printer-card popovers (JSON arrays of 3 ints).
  // Empty string = use built-in defaults.
  nozzle_temp_presets: string;
  bed_temp_presets: string;
  chamber_temp_presets: string;
  fan_speed_presets: string;
  // Default sidebar order (admin-set for all users)
  default_sidebar_order: string;
  // LDAP authentication
  ldap_enabled: boolean;
  ldap_server_url: string;
  ldap_bind_dn: string;
  ldap_bind_password: string;
  ldap_search_base: string;
  ldap_user_filter: string;
  ldap_security: string;
  ldap_group_mapping: string;
  ldap_auto_provision: boolean;
  ldap_default_group: string;
  obico_enabled: boolean;
  obico_ml_url: string;
  obico_sensitivity: 'low' | 'medium' | 'high';
  obico_action: 'notify' | 'pause' | 'pause_and_off';
  obico_poll_interval: number;
  obico_enabled_printers: string;
  // Inventory forecasting global lead time
  forecast_global_lead_time_days: number;
}

export type AppSettingsUpdate = Partial<AppSettings>;

export interface MQTTStatus {
  enabled: boolean;
  connected: boolean;
  broker: string;
  port: number;
  topic_prefix: string;
}

// Notification types

export type ProviderType = 'callmebot' | 'ntfy' | 'pushover' | 'telegram' | 'email' | 'discord' | 'webhook' | 'homeassistant';

export interface NotificationProvider {
  id: number;
  name: string;
  provider_type: ProviderType;
  enabled: boolean;
  config: Record<string, unknown>;
  // Print lifecycle events
  on_print_start: boolean;
  on_print_complete: boolean;
  on_print_failed: boolean;
  on_print_stopped: boolean;
  on_print_progress: boolean;
  on_print_missing_spool_assignment: boolean;
  // Printer status events
  on_printer_offline: boolean;
  on_printer_error: boolean;
  on_ai_failure_detection: boolean;
  on_filament_low: boolean;
  on_maintenance_due: boolean;
  // AMS environmental alarms (regular AMS)
  on_ams_humidity_high: boolean;
  on_ams_temperature_high: boolean;
  // AMS-HT environmental alarms
  on_ams_ht_humidity_high: boolean;
  on_ams_ht_temperature_high: boolean;
  // Build plate detection
  on_plate_not_empty: boolean;
  // Bed cooled
  on_bed_cooled: boolean;
  // First layer complete
  on_first_layer_complete: boolean;
  // Inventory stock alerts
  on_stock_reorder_alert: boolean;
  on_stock_break_alert: boolean;
  // Print queue events
  on_queue_job_added: boolean;
  on_queue_job_assigned: boolean;
  on_queue_job_started: boolean;
  on_queue_job_waiting: boolean;
  on_queue_job_skipped: boolean;
  on_queue_job_failed: boolean;
  on_queue_completed: boolean;
  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  // Daily digest
  daily_digest_enabled: boolean;
  daily_digest_time: string | null;
  // Printer filter
  printer_id: number | null;
  // Status tracking
  last_success: string | null;
  last_error: string | null;
  last_error_at: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface NotificationProviderCreate {
  name: string;
  provider_type: ProviderType;
  enabled?: boolean;
  config: Record<string, unknown>;
  // Print lifecycle events
  on_print_start?: boolean;
  on_print_complete?: boolean;
  on_print_failed?: boolean;
  on_print_stopped?: boolean;
  on_print_progress?: boolean;
  on_print_missing_spool_assignment?: boolean;
  // Printer status events
  on_printer_offline?: boolean;
  on_printer_error?: boolean;
  on_ai_failure_detection?: boolean;
  on_filament_low?: boolean;
  on_maintenance_due?: boolean;
  // AMS environmental alarms (regular AMS)
  on_ams_humidity_high?: boolean;
  on_ams_temperature_high?: boolean;
  // AMS-HT environmental alarms
  on_ams_ht_humidity_high?: boolean;
  on_ams_ht_temperature_high?: boolean;
  // Build plate detection
  on_plate_not_empty?: boolean;
  // Bed cooled
  on_bed_cooled?: boolean;
  // First layer complete
  on_first_layer_complete?: boolean;
  // Inventory stock alerts
  on_stock_reorder_alert?: boolean;
  on_stock_break_alert?: boolean;
  // Print queue events
  on_queue_job_added?: boolean;
  on_queue_job_assigned?: boolean;
  on_queue_job_started?: boolean;
  on_queue_job_waiting?: boolean;
  on_queue_job_skipped?: boolean;
  on_queue_job_failed?: boolean;
  on_queue_completed?: boolean;
  // Quiet hours
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  // Daily digest
  daily_digest_enabled?: boolean;
  daily_digest_time?: string | null;
  // Printer filter
  printer_id?: number | null;
}

export interface NotificationProviderUpdate {
  name?: string;
  provider_type?: ProviderType;
  enabled?: boolean;
  config?: Record<string, unknown>;
  // Print lifecycle events
  on_print_start?: boolean;
  on_print_complete?: boolean;
  on_print_failed?: boolean;
  on_print_stopped?: boolean;
  on_print_progress?: boolean;
  on_print_missing_spool_assignment?: boolean;
  // Printer status events
  on_printer_offline?: boolean;
  on_printer_error?: boolean;
  on_ai_failure_detection?: boolean;
  on_filament_low?: boolean;
  on_maintenance_due?: boolean;
  // AMS environmental alarms (regular AMS)
  on_ams_humidity_high?: boolean;
  on_ams_temperature_high?: boolean;
  // AMS-HT environmental alarms
  on_ams_ht_humidity_high?: boolean;
  on_ams_ht_temperature_high?: boolean;
  // Build plate detection
  on_plate_not_empty?: boolean;
  // Bed cooled
  on_bed_cooled?: boolean;
  // First layer complete
  on_first_layer_complete?: boolean;
  // Inventory stock alerts
  on_stock_reorder_alert?: boolean;
  on_stock_break_alert?: boolean;
  // Print queue events
  on_queue_job_added?: boolean;
  on_queue_job_assigned?: boolean;
  on_queue_job_started?: boolean;
  on_queue_job_waiting?: boolean;
  on_queue_job_skipped?: boolean;
  on_queue_job_failed?: boolean;
  on_queue_completed?: boolean;
  // Quiet hours
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  // Daily digest
  daily_digest_enabled?: boolean;
  daily_digest_time?: string | null;
  // Printer filter
  printer_id?: number | null;
}

export type ScheduleType = 'hourly' | 'daily' | 'weekly';

export type GitProviderType = 'github' | 'gitea' | 'forgejo' | 'gitlab';

export interface GitHubBackupConfig {
  id: number;
  repository_url: string;
  has_token: boolean;
  branch: string;
  provider: GitProviderType;
  allow_insecure_http: boolean;
  schedule_enabled: boolean;
  schedule_type: ScheduleType;
  backup_kprofiles: boolean;
  backup_cloud_profiles: boolean;
  backup_settings: boolean;
  backup_spools: boolean;
  backup_archives: boolean;
  enabled: boolean;
  last_backup_at: string | null;
  last_backup_status: string | null;
  last_backup_message: string | null;
  last_backup_commit_sha: string | null;
  next_scheduled_run: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubBackupConfigCreate {
  repository_url: string;
  access_token: string;
  branch?: string;
  provider?: GitProviderType;
  allow_insecure_http?: boolean;
  schedule_enabled?: boolean;
  schedule_type?: ScheduleType;
  backup_kprofiles?: boolean;
  backup_cloud_profiles?: boolean;
  backup_settings?: boolean;
  backup_spools?: boolean;
  backup_archives?: boolean;
  enabled?: boolean;
}

export interface GitHubBackupLog {
  id: number;
  config_id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  trigger: string;
  commit_sha: string | null;
  files_changed: number;
  error_message: string | null;
}

export interface GitHubBackupStatus {
  configured: boolean;
  enabled: boolean;
  is_running: boolean;
  progress: string | null;
  last_backup_at: string | null;
  last_backup_status: string | null;
  next_scheduled_run: string | null;
}

export interface LocalBackupStatus {
  enabled: boolean;
  schedule: string;
  time: string;
  retention: number;
  path: string;
  default_path: string;
  is_running: boolean;
  last_backup_at: string | null;
  last_status: string | null;
  last_message: string | null;
  next_run: string | null;
  timezone: string;
}

export interface LocalBackupFile {
  filename: string;
  size: number;
  created_at: string;
}

export interface ObicoDetectionEvent {
  printer_id: number;
  task_name: string;
  timestamp: string;
  current_p: number;
  score: number;
  class: 'safe' | 'warning' | 'failure';
  detections: number;
}

export interface ObicoStatus {
  is_running: boolean;
  last_error: string | null;
  per_printer: Record<string, { class: string; frame_count: number; score: number }>;
  thresholds: { low: number; high: number };
  history: ObicoDetectionEvent[];
  enabled: boolean;
  ml_url: string;
  sensitivity: 'low' | 'medium' | 'high';
  action: 'notify' | 'pause' | 'pause_and_off';
  poll_interval: number;
  external_url_configured: boolean;
}

export interface ObicoTestConnection {
  ok: boolean;
  status_code: number | null;
  body: string | null;
  error: string | null;
}

export interface GitHubTestConnectionResponse {
  success: boolean;
  message: string;
  repo_name: string | null;
  permissions: Record<string, boolean> | null;
  // true = confirmed private, false = confirmed public/internal,
  // null = could not determine. Backend rejects save unless true.
  is_private: boolean | null;
}

export interface GitHubBackupTriggerResponse {
  success: boolean;
  message: string;
  log_id: number | null;
  commit_sha: string | null;
  files_changed: number;
}

export interface NotificationTestRequest {
  provider_type: ProviderType;
  config: Record<string, unknown>;
}

export interface NotificationTestResponse {
  success: boolean;
  message: string;
}

export interface CallMeBotConfig {
  phone: string;
  apikey: string;
}

export interface NtfyConfig {
  server?: string;
  topic: string;
  auth_token?: string | null;
}

export interface PushoverConfig {
  user_key: string;
  app_token: string;
  priority?: number;
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface EmailConfig {
  smtp_server: string;
  smtp_port?: number;
  username: string;
  password: string;
  from_email: string;
  to_email: string;
  use_tls?: boolean;
}

export interface NotificationTemplate {
  id: number;
  event_type: string;
  name: string;
  title_template: string;
  body_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplateUpdate {
  title_template?: string;
  body_template?: string;
}

export interface EventVariablesResponse {
  event_type: string;
  event_name: string;
  variables: string[];
}

export interface TemplatePreviewRequest {
  event_type: string;
  title_template: string;
  body_template: string;
}

export interface TemplatePreviewResponse {
  title: string;
  body: string;
}

export interface NotificationLogEntry {
  id: number;
  provider_id: number;
  provider_name: string | null;
  provider_type: string | null;
  event_type: string;
  title: string;
  message: string;
  success: boolean;
  error_message: string | null;
  printer_id: number | null;
  printer_name: string | null;
  created_at: string;
}

export interface NotificationLogStats {
  total: number;
  success_count: number;
  failure_count: number;
  by_event_type: Record<string, number>;
  by_provider: Record<string, number>;
}

// Maintenance types

export interface MaintenanceType {
  id: number;
  name: string;
  description: string | null;
  default_interval_hours: number;
  interval_type: 'hours' | 'days';  // "hours" = print hours, "days" = calendar days
  icon: string | null;
  category?: string | null;
  wiki_url: string | null;  // Documentation link
  is_system: boolean;
  created_at: string;
}

export interface MaintenanceTypeCreate {
  name: string;
  description?: string | null;
  default_interval_hours?: number;
  interval_type?: 'hours' | 'days';
  icon?: string | null;
  category?: string | null;
  wiki_url?: string | null;
}

export interface MaintenanceStatus {
  id: number;
  printer_id: number;
  printer_name: string;
  printer_model: string | null;
  maintenance_type_id: number;
  maintenance_type_name: string;
  maintenance_type_icon: string | null;
  maintenance_type_wiki_url: string | null;  // Custom wiki URL from type
  enabled: boolean;
  interval_hours: number;  // For hours type: print hours; for days type: number of days
  interval_type: 'hours' | 'days';
  current_hours: number;
  hours_since_maintenance: number;
  hours_until_due: number;
  days_since_maintenance: number | null;  // For days type
  days_until_due: number | null;  // For days type
  is_due: boolean;
  is_warning: boolean;
  last_performed_at: string | null;
}

export interface PrinterMaintenanceOverview {
  printer_id: number;
  printer_name: string;
  printer_model: string | null;
  total_print_hours: number;
  maintenance_items: MaintenanceStatus[];
  due_count: number;
  warning_count: number;
}

export interface MaintenanceHistory {
  id: number;
  printer_maintenance_id: number;
  performed_at: string;
  hours_at_maintenance: number;
  notes: string | null;
}

export interface MaintenanceSummary {
  total_due: number;
  total_warning: number;
  printers_with_issues: Array<{
    printer_id: number;
    printer_name: string;
    due_count: number;
    warning_count: number;
  }>;
}

// Cloud / MakerWorld types

export interface CloudAuthStatus {
  is_authenticated: boolean;
  email: string | null;
  region?: 'global' | 'china' | null;
}

export interface CloudLoginResponse {
  success: boolean;
  needs_verification: boolean;
  message: string;
  verification_type?: 'email' | 'totp' | null;
  tfa_key?: string | null;
}

export type OrcaOAuthProvider = 'google' | 'apple' | 'github';

export interface OrcaAuthStartResponse {
  auth_url: string;
}

export interface OrcaAuthStatusResponse {
  connected: boolean;
  email: string | null;
  user_id: string | null;
}

export interface OrcaProfileMeta {
  setting_id: string;
  name: string;
  type: string;
  version: string | null;
  user_id: string | null;
  updated_time: string | null;
  is_custom: boolean;
}

export interface OrcaProfileListResponse {
  filament: OrcaProfileMeta[];
  printer: OrcaProfileMeta[];
  process: OrcaProfileMeta[];
}

export interface OrcaProfileDetail {
  setting_id: string;
  name: string;
  type: string;
  version: string | null;
  base_id: string | null;
  update_time: string | null;
  setting: Record<string, unknown>;
}

export interface MakerworldStatus {
  has_cloud_token: boolean;
  can_download: boolean;
}

export interface MakerworldResolvedModel {
  model_id: number;
  profile_id: number | null;
  design: Record<string, unknown>;
  instances: Array<Record<string, unknown>>;
  already_imported_library_ids: number[];
}

export interface MakerworldImportResponse {
  library_file_id: number;
  filename: string;
  folder_id: number | null;
  profile_id: number | null;
  was_existing: boolean;
}

export interface MakerworldRecentImport {
  library_file_id: number;
  filename: string;
  folder_id: number | null;
  thumbnail_path: string | null;
  source_url: string | null;
  created_at: string;
}

export interface SlicerSetting {
  setting_id: string;
  name: string;
  type: string;
  version: string | null;
  user_id: string | null;
  updated_time: string | null;
  is_custom: boolean;
}

export interface SpoolCatalogEntry {
  id: number;
  name: string;
  weight: number;
  is_default: boolean;
}

export interface StorageLocation {
  id: number;
  name: string;
  identifier: string | null;
  spool_count: number;
  created_at: string;
  updated_at: string;
}

export interface ColorCatalogEntry {
  id: number;
  manufacturer: string;
  color_name: string;
  hex_color: string;
  material: string | null;
  is_default: boolean;
  // #1154: optional multi-colour gradient stops + visual effect.
  extra_colors?: string | null;
  effect_type?: string | null;
}

export interface ColorLookupResult {
  found: boolean;
  hex_color: string | null;
  material: string | null;
}

export interface SlicerSettingsResponse {
  filament: SlicerSetting[];
  printer: SlicerSetting[];
  process: SlicerSetting[];
}

export interface SlicerSettingDetail {
  message?: string | null;
  code?: string | null;
  error?: string | null;
  public: boolean;
  version?: string | null;
  type: string;
  name: string;
  update_time?: string | null;
  nickname?: string | null;
  base_id?: string | null;
  setting: Record<string, unknown>;
  filament_id?: string | null;
  setting_id?: string | null;
}

export interface SlicerSettingCreate {
  type: string;  // 'filament', 'print', or 'printer'
  name: string;
  base_id: string;
  setting: Record<string, unknown>;
}

export interface SlicerSettingUpdate {
  name?: string;
  setting?: Record<string, unknown>;
}

export interface SlicerSettingDeleteResponse {
  success: boolean;
  message: string;
}

export interface BuiltinFilament {
  filament_id: string;
  name: string;
}

export type PresetSource = 'orca_cloud' | 'cloud' | 'local' | 'standard';

export interface PresetRef {
  source: PresetSource;
  id: string;
}

export interface SliceRequest {
  printer_preset_id?: number;
  process_preset_id?: number;
  filament_preset_id?: number;
  printer_preset?: PresetRef;
  process_preset?: PresetRef;
  filament_preset?: PresetRef;
  // Multi-color: one PresetRef per plate slot, in plate order. Always
  // preferred over the singular `filament_preset` when both are sent; the
  // backend validator promotes a singular into a one-element list when this
  // is omitted, so legacy single-color clients keep working unchanged.
  filament_presets?: PresetRef[];
  plate?: number;
  export_3mf?: boolean;
  // Build-plate override (#1337). When omitted, the slicer uses the process
  // preset's curr_bed_type as-is. Canonical values match BambuStudio /
  // OrcaSlicer's enum: "Cool Plate", "Engineering Plate", "High Temp Plate",
  // "Textured PEI Plate", "Smooth PEI Plate", "Cool Plate (SuperTack)",
  // "Supertack Plate".
  bed_type?: string | null;
}

export type SlicerCloudStatus = 'ok' | 'not_authenticated' | 'expired' | 'unreachable';

export interface UnifiedPreset {
  id: string;
  name: string;
  source: PresetSource;
  // Populated for the filament slot only — used by the SliceModal multi-color
  // pre-pick to score presets against each plate slot's required (type,
  // colour). Optional because the bundled / standard tier rarely carries a
  // colour (colour is a runtime spool attribute on Bambu) and older API
  // responses pre-date these fields entirely.
  filament_type?: string | null;
  filament_colour?: string | null;
  // Printer-preset names a process / filament preset declares itself
  // compatible with. Populated for the local tier (the slicer's own
  // `compatible_printers`); null for cloud / standard. The SliceModal filters
  // the process / filament dropdowns by the selected printer using this when
  // present (#1325).
  compatible_printers?: string[] | null;
}

export interface UnifiedPresetsBySlot {
  printer: UnifiedPreset[];
  process: UnifiedPreset[];
  filament: UnifiedPreset[];
}

export interface UnifiedPresetsResponse {
  // Priority order: local > orca_cloud > cloud > standard. No cross-tier
  // dedup — every tier surfaces its full list so the user can pick from
  // any source. The order drives auto-pick + visual group rendering only.
  orca_cloud: UnifiedPresetsBySlot;
  cloud: UnifiedPresetsBySlot;
  local: UnifiedPresetsBySlot;
  standard: UnifiedPresetsBySlot;
  cloud_status: SlicerCloudStatus;
  orca_cloud_status: SlicerCloudStatus;
}

export interface LocalPreset {
  id: number;
  name: string;
  preset_type: string;
  source: string;
  filament_type: string | null;
  filament_vendor: string | null;
  nozzle_temp_min: number | null;
  nozzle_temp_max: number | null;
  pressure_advance: string | null;
  default_filament_colour: string | null;
  filament_cost: string | null;
  filament_density: string | null;
  compatible_printers: string | null;
  inherits: string | null;
  version: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalPresetDetail extends LocalPreset {
  setting: Record<string, unknown>;
}

export interface LocalPresetsResponse {
  filament: LocalPreset[];
  printer: LocalPreset[];
  process: LocalPreset[];
}

export interface ImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  category: string;
  description?: string;
  options?: FieldOption[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface FieldDefinitionsResponse {
  version: string;
  description: string;
  fields: FieldDefinition[];
}

export interface CloudDevice {
  dev_id: string;
  name: string;
  dev_model_name: string | null;
  dev_product_name: string | null;
  online: boolean;
}

// Virtual Printer types

export type VirtualPrinterMode = 'archive' | 'review' | 'queue' | 'proxy' | 'immediate' | 'print_queue';

export interface VirtualPrinterProxyStatus {
  running: boolean;
  target_host: string;
  ftp_port: number;
  mqtt_port: number;
  ftp_connections: number;
  mqtt_connections: number;
}

export interface VirtualPrinterStatus {
  enabled: boolean;
  running: boolean;
  mode: VirtualPrinterMode;
  name: string;
  serial: string;
  model: string;
  model_name: string;
  pending_files: number;
  target_printer_ip?: string;  // For proxy mode
  proxy?: VirtualPrinterProxyStatus;  // For proxy mode
}

export interface VirtualPrinterSettings {
  enabled: boolean;
  access_code_set: boolean;
  mode: VirtualPrinterMode;
  model: string;
  target_printer_id: number | null;  // For proxy mode
  remote_interface_ip: string | null;  // For SSDP proxy across networks
  tailscale_disabled: boolean;
  archive_name_source: 'metadata' | 'filename';  // Source for archive's display name
  status: VirtualPrinterStatus;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  netmask: string;
  subnet: string;
  is_alias?: boolean;
  label?: string;
}

export interface VirtualPrinterModels {
  models: Record<string, string>;  // SSDP code -> display name
  default: string;
}

export interface PendingUpload {
  id: number;
  filename: string;
  // Resolved name the review card should show — mirrors what archive_print
  // will eventually write to PrintArchive.print_name (#1152 follow-up). Falls
  // back to the stripped filename stem when the 3MF has no embedded title or
  // the operator has chosen the "filename" archive-name source.
  display_name: string;
  file_size: number;
  source_ip: string | null;
  status: string;
  tags: string | null;
  notes: string | null;
  project_id: number | null;
  uploaded_at: string;
}

export interface VirtualPrinterConfig {
  id: number;
  name: string;
  enabled: boolean;
  mode: VirtualPrinterMode;
  model: string | null;
  model_name: string | null;
  access_code_set: boolean;
  serial: string;
  target_printer_id: number | null;
  auto_dispatch: boolean;
  queue_force_color_match: boolean;
  gcode_injection: boolean;
  tailscale_disabled: boolean;
  bind_ip: string | null;
  remote_interface_ip: string | null;
  position: number;
  status: { running: boolean; pending_files: number; proxy?: VirtualPrinterProxyStatus };
}

export interface VirtualPrinterListResponse {
  printers: VirtualPrinterConfig[];
  models: Record<string, string>;
}

/** The shared CA certificate every virtual printer presents — imported once
 *  into the slicer's trust store. Only the public certificate is returned. */
export interface VPCaCertificate {
  pem: string;
  fingerprint_sha256: string;
  not_valid_after: string;
}

export type VPDiagnosticStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface VPDiagnosticCheck {
  id:
    | 'enabled'
    | 'running'
    | 'bind_interface'
    | 'access_code'
    | 'target_printer'
    | 'port_ftps'
    | 'port_mqtt'
    | 'port_bind'
    | 'certificate';
  status: VPDiagnosticStatus;
  params: Record<string, string | number>;
}

export interface VPDiagnosticResult {
  vp_id: number;
  vp_name: string;
  mode: string;
  overall: 'ok' | 'warnings' | 'problems';
  checks: VPDiagnosticCheck[];
}

export interface TailscaleStatusResponse {
  available: boolean;
  fqdn: string;
  hostname: string;
  tailnet_name: string;
  tailscale_ips: string[];
  error: string | null;
}

// Pipeline types

export interface SlicerPipeline {
  id: number;
  name: string;
  description: string | null;
  printer_preset: PresetRef;
  process_preset: PresetRef;
  filament_presets: PresetRef[];
  bed_type: string | null;
  target_kind: 'specific_printer' | 'printer_class';
  target_printer_id: number | null;
  target_model_class: string | null;
  fanout_strategy: 'max_parallel' | 'fill_one_first' | 'round_robin';
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SlicerPipelineCreateRequest {
  name: string;
  description?: string | null;
  printer_preset: PresetRef;
  process_preset: PresetRef;
  filament_presets: PresetRef[];
  bed_type?: string | null;
}

export type SlicerPipelineUpdateRequest = Partial<SlicerPipelineCreateRequest> & {
  target_kind?: 'specific_printer' | 'printer_class';
  // ``target_printer_id: 0`` means "clear the target" — the backend maps that
  // to null. Use null in TypeScript for the same intent.
  target_printer_id?: number | null;
  target_model_class?: string | null;
  fanout_strategy?: 'max_parallel' | 'fill_one_first' | 'round_robin';
};

export interface SlicerPipelinesListResponse {
  pipelines: SlicerPipeline[];
}

export type PipelineEligibilityKind =
  | 'printer_not_set'
  | 'printer_not_found'
  | 'printer_disabled'
  | 'printer_offline'
  | 'filament_type_mismatch'
  | 'filament_color_mismatch'
  | 'ams_slot_missing'
  | 'filament_unverified'
  | 'no_class_matches'
  | 'class_not_set';

export interface PipelineEligibilityIssue {
  kind: PipelineEligibilityKind;
  slot_index: number | null;
  expected: string | null;
  actual: string | null;
}

export interface PipelinePerPrinterReport {
  printer_id: number;
  printer_name: string;
  ok: boolean;
  issues: PipelineEligibilityIssue[];
}

export interface PipelineEligibilityReport {
  ok: boolean;
  target_kind: 'specific_printer' | 'printer_class';
  target_printer_id: number | null;
  target_printer_name: string | null;
  target_model_class: string | null;
  issues: PipelineEligibilityIssue[];
  printer_reports: PipelinePerPrinterReport[];
}

export interface PipelineJob {
  id: number;
  pipeline_run_id: number;
  copy_index: number;
  assigned_printer_id: number | null;
  assigned_printer_name: string | null;
  queue_entry_id: number | null;
  status:
    | 'pending'
    | 'awaiting_printer'
    | 'queued'
    | 'printing'
    | 'completed'
    | 'failed'
    | 'cancelled';
  error_message: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
}

export interface PipelineRun {
  id: number;
  pipeline_id: number | null;
  pipeline_name: string | null;
  source_library_file_id: number | null;
  source_archive_id: number | null;
  source_filename: string | null;
  parent_run_id: number | null;
  copies: number;
  copies_completed: number;
  copies_failed: number;
  copies_cancelled: number;
  copies_in_progress: number;
  status:
    | 'queued'
    | 'slicing'
    | 'dispatching'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'partial_failure'
    | 'cancelled';
  slice_job_id: number | null;
  sliced_library_file_id: number | null;
  eligibility_overridden: boolean;
  error_message: string | null;
  created_by: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  jobs: PipelineJob[];
  target_kind: 'specific_printer' | 'printer_class' | null;
  target_printer_id: number | null;
  target_model_class: string | null;
  fanout_strategy: 'max_parallel' | 'fill_one_first' | 'round_robin' | null;
}

export interface PipelineRunListResponse {
  runs: PipelineRun[];
  total: number;
}

export interface SliceResponse {
  library_file_id: number;
  name: string;
  print_time_seconds: number;
  filament_used_g: number;
  filament_used_mm: number;
  used_embedded_settings: boolean;
}

export interface SliceArchiveResponse {
  archive_id: number;
  name: string;
  print_time_seconds: number;
  filament_used_g: number;
  filament_used_mm: number;
  used_embedded_settings: boolean;
}

export type SliceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SliceJobEnqueueResponse {
  job_id: number;
  status: SliceJobStatus;
  status_url: string;
}

export interface SliceJobProgress {
  /** Stage label emitted by the slicer ("Generating G-code", "Slicing finished"). */
  stage: string;
  total_percent: number;
  plate_percent: number;
  /** 1-indexed plate position; 0 means "all plates" / final completion. */
  plate_index: number;
  plate_count: number;
  updated_at: number;
  /** When the backend is in the cross-class slice-all loop (#1493), each
   *  per-plate sub-slice's progress is augmented with the loop position
   *  so the toast can show "Plate 2 of 5 — Generating G-code 47%". The
   *  fields are absent on a single-plate slice. */
  multi_plate_index?: number;
  multi_plate_count?: number;
}

export interface SliceJobState {
  job_id: number;
  status: SliceJobStatus;
  kind: 'library_file' | 'archive';
  source_id: number;
  source_name: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  /** Live progress fed by the sidecar's --pipe channel; null until the
   * slicer emits its first frame (early "Initializing" phase) or when
   * the sidecar doesn't support progress. */
  progress: SliceJobProgress | null;
  result?: SliceResponse | SliceArchiveResponse;
  error_status?: number;
  error_detail?: string;
}

// All other types

export interface SmartPlug {
  id: number;
  name: string;
  plug_type: 'tasmota' | 'homeassistant' | 'mqtt' | 'rest';
  ip_address: string | null;  // Required for Tasmota
  ha_entity_id: string | null;  // Required for Home Assistant (e.g., "switch.printer_plug", "script.turn_on_printer")
  // Home Assistant energy sensor entities (optional)
  ha_power_entity: string | null;
  ha_energy_today_entity: string | null;
  ha_energy_total_entity: string | null;
  // MQTT fields (required when plug_type="mqtt")
  // Legacy field - kept for backward compatibility
  mqtt_topic: string | null;  // Deprecated, use mqtt_power_topic
  mqtt_multiplier: number;  // Deprecated, use mqtt_power_multiplier
  // Power monitoring
  mqtt_power_topic: string | null;  // Topic for power data
  mqtt_power_path: string | null;  // e.g., "power_l1" or "data.power"
  mqtt_power_multiplier: number;  // Unit conversion for power
  // Energy monitoring
  mqtt_energy_topic: string | null;  // Topic for energy data
  mqtt_energy_path: string | null;  // e.g., "energy_l1"
  mqtt_energy_multiplier: number;  // Unit conversion for energy
  // State monitoring
  mqtt_state_topic: string | null;  // Topic for state data
  mqtt_state_path: string | null;  // e.g., "state_l1" for ON/OFF
  mqtt_state_on_value: string | null;  // What value means "ON" (e.g., "ON", "true", "1")
  // REST/Webhook fields (required when plug_type="rest")
  rest_on_url: string | null;
  rest_on_body: string | null;
  rest_off_url: string | null;
  rest_off_body: string | null;
  rest_method: string | null;
  rest_headers: string | null;
  rest_status_url: string | null;
  rest_status_path: string | null;
  rest_status_on_value: string | null;
  rest_power_url: string | null;
  rest_power_path: string | null;
  rest_power_multiplier: number;
  rest_energy_url: string | null;
  rest_energy_path: string | null;
  rest_energy_multiplier: number;
  printer_id: number | null;
  enabled: boolean;
  auto_on: boolean;
  auto_off: boolean;
  auto_off_persistent: boolean;
  off_delay_mode: 'time' | 'temperature';
  off_delay_minutes: number;
  off_temp_threshold: number;
  // #1349: auto-off after AMS drying completes.
  auto_off_after_drying: boolean;
  off_delay_after_drying_minutes: number;
  username: string | null;
  password: string | null;
  // Power alerts
  power_alert_enabled: boolean;
  power_alert_high: number | null;
  power_alert_low: number | null;
  power_alert_last_triggered: string | null;
  // Schedule
  schedule_enabled: boolean;
  schedule_on_time: string | null;
  schedule_off_time: string | null;
  // Visibility options
  show_in_switchbar: boolean;
  show_on_printer_card: boolean;  // For scripts: show on printer card
  // Status
  last_state: string | null;
  last_checked: string | null;
  auto_off_executed: boolean;  // True when auto-off was triggered after print
  created_at: string;
  updated_at: string;
}

export interface SmartPlugCreate {
  name: string;
  plug_type?: 'tasmota' | 'homeassistant' | 'mqtt' | 'rest';
  ip_address?: string | null;  // Required for Tasmota
  ha_entity_id?: string | null;  // Required for Home Assistant
  // Home Assistant energy sensor entities (optional)
  ha_power_entity?: string | null;
  ha_energy_today_entity?: string | null;
  ha_energy_total_entity?: string | null;
  // MQTT fields (required when plug_type="mqtt")
  // Legacy fields - kept for backward compatibility
  mqtt_topic?: string | null;
  mqtt_multiplier?: number;
  // Power monitoring
  mqtt_power_topic?: string | null;
  mqtt_power_path?: string | null;
  mqtt_power_multiplier?: number;
  // Energy monitoring
  mqtt_energy_topic?: string | null;
  mqtt_energy_path?: string | null;
  mqtt_energy_multiplier?: number;
  // State monitoring
  mqtt_state_topic?: string | null;
  mqtt_state_path?: string | null;
  mqtt_state_on_value?: string | null;
  // REST fields
  rest_on_url?: string | null;
  rest_on_body?: string | null;
  rest_off_url?: string | null;
  rest_off_body?: string | null;
  rest_method?: string | null;
  rest_headers?: string | null;
  rest_status_url?: string | null;
  rest_status_path?: string | null;
  rest_status_on_value?: string | null;
  rest_power_url?: string | null;
  rest_power_path?: string | null;
  rest_power_multiplier?: number;
  rest_energy_url?: string | null;
  rest_energy_path?: string | null;
  rest_energy_multiplier?: number;
  printer_id?: number | null;
  enabled?: boolean;
  auto_on?: boolean;
  auto_off?: boolean;
  auto_off_persistent?: boolean;
  off_delay_mode?: 'time' | 'temperature';
  off_delay_minutes?: number;
  off_temp_threshold?: number;
  // #1349
  auto_off_after_drying?: boolean;
  off_delay_after_drying_minutes?: number;
  username?: string | null;
  password?: string | null;
  // Power alerts
  power_alert_enabled?: boolean;
  power_alert_high?: number | null;
  power_alert_low?: number | null;
  // Schedule
  schedule_enabled?: boolean;
  schedule_on_time?: string | null;
  schedule_off_time?: string | null;
  // Visibility options
  show_in_switchbar?: boolean;
  show_on_printer_card?: boolean;
}

export interface SmartPlugUpdate {
  name?: string;
  plug_type?: 'tasmota' | 'homeassistant' | 'mqtt' | 'rest';
  ip_address?: string | null;
  ha_entity_id?: string | null;
  // Home Assistant energy sensor entities (optional)
  ha_power_entity?: string | null;
  ha_energy_today_entity?: string | null;
  ha_energy_total_entity?: string | null;
  // MQTT fields (legacy)
  mqtt_topic?: string | null;
  mqtt_multiplier?: number;
  // MQTT power fields
  mqtt_power_topic?: string | null;
  mqtt_power_path?: string | null;
  mqtt_power_multiplier?: number;
  // MQTT energy fields
  mqtt_energy_topic?: string | null;
  mqtt_energy_path?: string | null;
  mqtt_energy_multiplier?: number;
  // MQTT state fields
  mqtt_state_topic?: string | null;
  mqtt_state_path?: string | null;
  mqtt_state_on_value?: string | null;
  // REST fields
  rest_on_url?: string | null;
  rest_on_body?: string | null;
  rest_off_url?: string | null;
  rest_off_body?: string | null;
  rest_method?: string | null;
  rest_headers?: string | null;
  rest_status_url?: string | null;
  rest_status_path?: string | null;
  rest_status_on_value?: string | null;
  rest_power_url?: string | null;
  rest_power_path?: string | null;
  rest_power_multiplier?: number;
  rest_energy_url?: string | null;
  rest_energy_path?: string | null;
  rest_energy_multiplier?: number;
  printer_id?: number | null;
  enabled?: boolean;
  auto_on?: boolean;
  auto_off?: boolean;
  auto_off_persistent?: boolean;
  off_delay_mode?: 'time' | 'temperature';
  off_delay_minutes?: number;
  off_temp_threshold?: number;
  // #1349
  auto_off_after_drying?: boolean;
  off_delay_after_drying_minutes?: number;
  username?: string | null;
  password?: string | null;
  // Power alerts
  power_alert_enabled?: boolean;
  power_alert_high?: number | null;
  power_alert_low?: number | null;
  // Schedule
  schedule_enabled?: boolean;
  schedule_on_time?: string | null;
  schedule_off_time?: string | null;
  // Visibility options
  show_in_switchbar?: boolean;
  show_on_printer_card?: boolean;
}

export interface HAEntity {
  entity_id: string;
  friendly_name: string;
  state: string | null;
  domain: string;  // "switch", "light", "input_boolean", "script"
}

export interface HASensorEntity {
  entity_id: string;
  friendly_name: string;
  state: string | null;
  unit_of_measurement: string | null;  // "W", "kW", "kWh", "Wh"
}

export interface HATestConnectionResult {
  success: boolean;
  message: string | null;
  error: string | null;
}

export interface SmartPlugEnergy {
  power: number | null;  // Current watts
  voltage: number | null;  // Volts
  current: number | null;  // Amps
  today: number | null;  // kWh used today
  yesterday: number | null;  // kWh used yesterday
  total: number | null;  // Total kWh
  factor: number | null;  // Power factor (0-1)
  apparent_power: number | null;  // VA
  reactive_power: number | null;  // VAr
}

export interface SmartPlugStatus {
  state: string | null;
  reachable: boolean;
  device_name: string | null;
  energy: SmartPlugEnergy | null;
}

export interface SmartPlugTestResult {
  success: boolean;
  state: string | null;
  device_name: string | null;
}

export interface TasmotaScanStatus {
  running: boolean;
  scanned: number;
  total: number;
}

export interface DiscoveredTasmotaDevice {
  ip_address: string;
  name: string;
  module: number | null;
  state: string | null;
  discovered_at: string | null;
}

export interface MQTTLogEntry {
  timestamp: string;
  topic: string;
  direction: 'in' | 'out';
  payload: Record<string, unknown>;
}

export interface MQTTLogsResponse {
  logging_enabled: boolean;
  logs: MQTTLogEntry[];
}

export interface KProfile {
  slot_id: number;
  extruder_id: number;
  nozzle_id: string;
  nozzle_diameter: string;
  filament_id: string;
  name: string;
  k_value: string;
  n_coef: string;
  ams_id: number;
  tray_id: number;
  setting_id: string | null;
}

export interface KProfileCreate {
  slot_id?: number;  // Storage slot, 0 for new profiles
  extruder_id?: number;
  nozzle_id: string;
  nozzle_diameter: string;
  filament_id: string;
  name: string;
  k_value: string;
  n_coef?: string;
  ams_id?: number;
  tray_id?: number;
  setting_id?: string | null;
}

export interface KProfileDelete {
  slot_id: number;  // cali_idx - calibration index to delete
  extruder_id: number;
  nozzle_id: string;  // e.g., "HH00-0.4"
  nozzle_diameter: string;  // e.g., "0.4"
  filament_id: string;  // Bambu filament identifier
  setting_id?: string | null;  // Setting ID (for X1C series)
}

export interface KProfilesResponse {
  profiles: KProfile[];
  nozzle_diameter: string;
}

export interface KProfileNote {
  setting_id: string;
  note: string;
}

export interface KProfileNotesResponse {
  notes: Record<string, string>;  // setting_id -> note
}

export interface SlotPresetMapping {
  ams_id: number;
  tray_id: number;
  preset_id: string;
  preset_name: string;
}

export interface VersionInfo {
  version: string;
  repo: string;
}

export interface UpdateCheckResult {
  update_available: boolean;
  current_version: string;
  latest_version: string | null;
  release_name?: string;
  release_notes?: string;
  release_url?: string;
  published_at?: string;
  error?: string;
  message?: string;
  is_docker?: boolean;
  is_ha_addon?: boolean;
  is_windows_installer?: boolean;
  update_method?: 'docker' | 'git' | 'ha_addon' | 'windows_installer';
  installer_download_url?: string | null;
}

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'downloading' | 'installing' | 'complete' | 'error';
  progress: number;
  message: string;
  error: string | null;
}

export interface ExternalLink {
  id: number;
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  custom_icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExternalLinkCreate {
  name: string;
  url: string;
  icon: string;
  open_in_new_tab?: boolean;
}

export interface ExternalLinkUpdate {
  name?: string;
  url?: string;
  icon?: string;
  open_in_new_tab?: boolean;
}

export interface SystemInfo {
  app: {
    version: string;
    base_dir: string;
    archive_dir: string;
  };
  database: {
    engine: string;
    version: string;
    archives: number;
    archives_completed: number;
    archives_failed: number;
    archives_printing: number;
    printers: number;
    filaments: number;
    projects: number;
    smart_plugs: number;
    total_print_time_seconds: number;
    total_print_time_formatted: string;
    total_filament_grams: number;
    total_filament_kg: number;
  };
  printers: {
    total: number;
    connected: number;
    connected_list: Array<{
      id: number;
      name: string;
      state: string;
      model: string;
    }>;
  };
  storage: {
    archive_size_bytes: number;
    archive_size_formatted: string;
    database_size_bytes: number;
    database_size_formatted: string;
    disk_total_bytes: number;
    disk_total_formatted: string;
    disk_used_bytes: number;
    disk_used_formatted: string;
    disk_free_bytes: number;
    disk_free_formatted: string;
    disk_percent_used: number;
  };
  system: {
    platform: string;
    platform_release: string;
    platform_version: string;
    architecture: string;
    hostname: string;
    python_version: string;
    uptime_seconds: number;
    uptime_formatted: string;
    boot_time: string;
  };
  memory: {
    total_bytes: number;
    total_formatted: string;
    available_bytes: number;
    available_formatted: string;
    used_bytes: number;
    used_formatted: string;
    percent_used: number;
  };
  cpu: {
    count: number;
    count_logical: number;
    percent: number;
  };
}

export interface StorageUsageCategory {
  key: string;
  label: string;
  bytes: number;
  formatted: string;
  percent_of_total: number;
}

export interface StorageUsageOtherItem {
  bucket: string;
  label: string;
  kind: 'system' | 'data';
  deletable: boolean;
  bytes: number;
  formatted: string;
  percent_of_total: number;
}

export interface StorageUsageResponse {
  roots: string[];
  total_bytes: number;
  total_formatted: string;
  categories: StorageUsageCategory[];
  other_breakdown: StorageUsageOtherItem[];
  scan_errors: number;
  generated_at: string;
  cache: {
    hit: boolean;
    age_seconds: number;
    max_age_seconds: number;
  };
}

export interface DiscoveredPrinter {
  serial: string;
  name: string;
  ip_address: string;
  model: string | null;
  discovered_at: string | null;
}

export interface DiscoveryStatus {
  running: boolean;
}

export interface DiscoveryInfo {
  is_docker: boolean;
  ssdp_running: boolean;
  scan_running: boolean;
  subnets: string[];
}

export interface SubnetScanStatus {
  running: boolean;
  scanned: number;
  total: number;
}

export interface AvailableFirmwareVersion {
  version: string;
  file_available: boolean;
  download_url: string | null;
  release_notes: string | null;
  release_time: string | null;
}

export interface FirmwareUpdateInfo {
  printer_id: number;
  printer_name: string;
  model: string | null;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  download_url: string | null;
  release_notes: string | null;
  available_versions: AvailableFirmwareVersion[];
}

export interface FirmwareUploadPrepare {
  can_proceed: boolean;
  sd_card_present: boolean;
  sd_card_free_space: number;
  firmware_size: number;
  space_sufficient: boolean;
  update_available: boolean;
  current_version: string | null;
  latest_version: string | null;
  target_version: string | null;
  firmware_filename: string | null;
  errors: string[];
}

export interface FirmwareUploadStatus {
  status: 'idle' | 'preparing' | 'downloading' | 'uploading' | 'complete' | 'error';
  progress: number;
  message: string;
  error: string | null;
  firmware_filename: string | null;
  firmware_version: string | null;
}

export interface DebugLoggingState {
  enabled: boolean;
  enabled_at: string | null;
  duration_seconds: number | null;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  logger_name: string;
  message: string;
}

export interface LogsResponse {
  entries: LogEntry[];
  total_in_file: number;
  filtered_count: number;
}

export interface SpoolBuddyDevice {
  id: number;
  device_id: string;
  hostname: string;
  ip_address: string;
  backend_url?: string | null;
  firmware_version: string | null;
  has_nfc: boolean;
  has_scale: boolean;
  tare_offset: number;
  calibration_factor: number;
  nfc_reader_type: string | null;
  nfc_connection: string | null;
  display_brightness: number;
  display_blank_timeout: number;
  has_backlight: boolean;
  last_calibrated_at: string | null;
  last_seen: string | null;
  pending_command: string | null;
  nfc_ok: boolean;
  scale_ok: boolean;
  uptime_s: number;
  update_status: string | null;
  update_message: string | null;
  system_stats: {
    os?: { os?: string; kernel?: string; arch?: string; python?: string };
    cpu_temp_c?: number;
    cpu_count?: number;
    load_avg?: number[];
    memory?: { total_mb?: number; available_mb?: number; used_mb?: number; percent?: number };
    disk?: { total_gb?: number; used_gb?: number; free_gb?: number; percent?: number };
    system_uptime_s?: number;
  } | null;
  online: boolean;
}

export interface DaemonUpdateCheck {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
}

export interface BugReportRequest {
  description: string;
  email?: string;
  screenshot_base64?: string;
  include_support_info?: boolean;
  debug_logs?: string;
}

export interface BugReportResponse {
  success: boolean;
  message: string;
  issue_url?: string;
  issue_number?: number;
}

export interface SponsorPromptCheckResponse {
  show: boolean;
  milestone?: string;
  family?: 'prints' | 'cost' | 'archives' | 'anniversary' | 'version-update';
  threshold?: number;
  payload?: Record<string, unknown>;
}
