import type { NotificationProvider, NotificationProviderCreate, ProviderType } from '@/types/api';

export type ProviderKind = ProviderType | 'slack' | 'gotify' | 'generic_webhook';
export type ProviderFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  choices?: readonly string[];
  defaultValue?: string;
};

const field = (key: string, label: string, required = false, secret = false): ProviderFieldDefinition =>
  ({ key, label, required, secret });

export const PROVIDER_OPTIONS: Array<{ key: ProviderKind; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'discord', label: 'Discord' },
  { key: 'slack', label: 'Slack / Mattermost' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'pushover', label: 'Pushover' },
  { key: 'gotify', label: 'Gotify' },
  { key: 'ntfy', label: 'ntfy' },
  { key: 'generic_webhook', label: 'Webhook' },
  { key: 'callmebot', label: 'CallMeBot' },
  { key: 'homeassistant', label: 'Home Assistant' },
  { key: 'bark', label: 'Bark' },
];

export const PROVIDER_FIELDS: Partial<Record<ProviderKind, ProviderFieldDefinition[]>> = {
  callmebot: [field('phone', 'Phone number', true), field('apikey', 'API key', true, true)],
  ntfy: [
    { ...field('server', 'Server URL'), defaultValue: 'https://ntfy.sh' },
    field('topic', 'Topic', true), field('auth_token', 'Auth token', false, true),
  ],
  pushover: [
    field('user_key', 'User key', true, true), field('app_token', 'App token', true, true),
    { ...field('priority', 'Priority'), choices: ['-2', '-1', '0', '1', '2'], defaultValue: '0' },
    { ...field('retry', 'Emergency retry (seconds, 30–10800)'), defaultValue: '60' },
    { ...field('expire', 'Emergency expiry (seconds, 30–10800)'), defaultValue: '3600' },
  ],
  telegram: [
    field('bot_token', 'Bot token', true, true), field('chat_id', 'Chat ID', true),
    field('message_thread_id', 'Forum topic ID (optional integer)'),
  ],
  email: [
    field('smtp_server', 'SMTP server', true),
    { ...field('smtp_port', 'SMTP port'), defaultValue: '587' },
    { ...field('security', 'Security'), choices: ['starttls', 'ssl', 'none'], defaultValue: 'starttls' },
    { ...field('auth_enabled', 'Authentication'), choices: ['true', 'false'], defaultValue: 'true' },
    field('username', 'Username'), field('password', 'Password', false, true),
    field('from_email', 'From email', true), field('to_email', 'To email', true),
  ],
  discord: [field('webhook_url', 'Webhook URL', true)],
  generic_webhook: [
    field('webhook_url', 'Webhook URL', true),
    { ...field('payload_format', 'Payload format'), choices: ['generic', 'slack'], defaultValue: 'generic' },
    field('auth_header', 'Authorization header', false, true),
    { ...field('field_title', 'Title field'), defaultValue: 'title' },
    { ...field('field_message', 'Message field'), defaultValue: 'message' },
  ],
  slack: [field('webhook_url', 'Webhook URL', true), field('auth_header', 'Authorization header', false, true)],
  gotify: [field('server_url', 'Server URL', true), field('token', 'Token', false, true)],
  homeassistant: [field('service', 'Home Assistant service (e.g. notify.mobile_app_phone)'), field('data', 'Custom service data (JSON object)')],
  bark: [
    field('device_key', 'Device key', true, true),
    { ...field('server', 'Server URL'), defaultValue: 'https://api.day.app' },
    { ...field('group', 'Group'), defaultValue: 'Bambuddy' },
    field('sound', 'Sound'),
    { ...field('level', 'Interruption level'), choices: ['', 'active', 'timeSensitive', 'critical', 'passive'] },
  ],
};

export const PROVIDER_EVENTS = [
  ['on_print_start', 'Print started', false],
  ['on_print_complete', 'Print completed', true],
  ['on_print_failed', 'Print failed', true],
  ['on_print_stopped', 'Print stopped', true],
  ['on_print_progress', 'Print progress (25%, 50%, 75%)', false],
  ['on_print_missing_spool_assignment', 'Missing spool assignment', false],
  ['on_print_confirm_request', 'Print outcome confirmation', true],
  ['on_plate_not_empty', 'Plate not empty', true],
  ['on_plate_clear_required', 'Plate clear required', false],
  ['on_first_layer_complete', 'First layer completed', false],
  ['on_bed_cooled', 'Bed cooled', false],
  ['on_printer_offline', 'Printer offline', false],
  ['on_printer_error', 'Printer error', false],
  ['on_ai_failure_detection', 'AI failure detection', false],
  ['on_filament_low', 'Filament low', false],
  ['on_maintenance_due', 'Maintenance due', false],
  ['on_ams_humidity_high', 'AMS humidity high', false],
  ['on_ams_temperature_high', 'AMS temperature high', false],
  ['on_ams_drying_suspended', 'AMS drying suspended', true],
  ['on_ams_ht_humidity_high', 'AMS-HT humidity high', false],
  ['on_ams_ht_temperature_high', 'AMS-HT temperature high', false],
  ['on_ha_sensor_alert', 'Home Assistant sensor alert', false],
  ['on_location_ha_sensor_alert', 'Storage location sensor alert', false],
  ['on_stock_reorder_alert', 'Stock reorder alert', false],
  ['on_stock_break_alert', 'Stock break alert', false],
  ['on_queue_job_added', 'Queue job added', false],
  ['on_queue_job_assigned', 'Queue job assigned', false],
  ['on_queue_job_started', 'Queue job started', false],
  ['on_queue_job_waiting', 'Queue job waiting', true],
  ['on_queue_job_skipped', 'Queue job skipped', true],
  ['on_queue_job_failed', 'Queue job failed', true],
  ['on_queue_completed', 'Queue completed', false],
  ['on_billing_charge_failed', 'Billing charge failed', true],
  ['on_app_message', 'Connected app message', false],
] as const;
export type ProviderEvent = typeof PROVIDER_EVENTS[number][0];
type ProviderTransportDraft = {
  config: Record<string, string>;
  originalConfig: Record<string, unknown>;
  eventPriorities: Record<string, number>;
};
export type ProviderFormState = {
  name: string;
  enabled: boolean;
  kind: ProviderKind;
  config: Record<string, string>;
  originalConfig: Record<string, unknown>;
  transportDrafts: Partial<Record<ProviderKind, ProviderTransportDraft>>;
  events: Record<ProviderEvent, boolean>;
  eventPriorities: Record<string, number>;
  attach_photo: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  printer_id: number | null;
  telegram_verdict_mode: 'buttons' | 'reactions' | 'both';
};

export function defaultConfigForKind(kind: ProviderKind): Record<string, string> {
  return Object.fromEntries((PROVIDER_FIELDS[kind] ?? []).map(f => [f.key, f.defaultValue ?? '']));
}

export function emptyProviderForm(kind: ProviderKind = 'email'): ProviderFormState {
  return {
    name: '', enabled: true, kind, config: defaultConfigForKind(kind), originalConfig: {}, transportDrafts: {},
    events: Object.fromEntries(PROVIDER_EVENTS.map(([key, , value]) => [key, value])) as Record<ProviderEvent, boolean>,
    eventPriorities: {}, attach_photo: true,
    quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00',
    daily_digest_enabled: false, daily_digest_time: '09:00', printer_id: null,
    telegram_verdict_mode: 'buttons',
  };
}

export function changeProviderKind(form: ProviderFormState, kind: ProviderKind): ProviderFormState {
  if (kind === form.kind) return form;
  const transportDrafts = {
    ...form.transportDrafts,
    [form.kind]: { config: form.config, originalConfig: form.originalConfig, eventPriorities: form.eventPriorities },
  };
  const transport = transportDrafts[kind] ?? { config: defaultConfigForKind(kind), originalConfig: {}, eventPriorities: {} };
  return {
    ...form, kind, transportDrafts, config: { ...transport.config },
    originalConfig: { ...transport.originalConfig }, eventPriorities: { ...transport.eventPriorities },
  };
}

function normalizeEventPriorities(priorities: Record<string, number>, preferBare: boolean): Record<string, number> {
  const normalized = { ...priorities };
  for (const [key] of PROVIDER_EVENTS) {
    const bare = key.slice(3);
    // Match the sender's bare-key precedence on load; edited canonical keys win on save.
    const priority = preferBare ? priorities[bare] ?? priorities[key] : priorities[key] ?? priorities[bare];
    delete normalized[bare];
    if (priority != null) normalized[key] = priority;
    else delete normalized[key];
  }
  return normalized;
}

export function kindFromProvider(provider: NotificationProvider): ProviderKind {
  if (provider.provider_type === 'webhook') return 'generic_webhook';
  return provider.provider_type;
}

export function formFromProvider(provider: NotificationProvider): ProviderFormState {
  const kind = kindFromProvider(provider);
  const form = emptyProviderForm(kind);
  const source = provider as unknown as Record<string, unknown>;
  return {
    ...form, name: provider.name, enabled: provider.enabled,
    originalConfig: { ...provider.config },
    config: {
      ...form.config,
      ...Object.fromEntries(Object.entries(provider.config).map(([key, value]) => [
        key, value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
      ])),
    },
    events: Object.fromEntries(PROVIDER_EVENTS.map(([key, , fallback]) => [key, source[key] ?? fallback])) as Record<ProviderEvent, boolean>,
    eventPriorities: typeof provider.config.event_priorities === 'object' && provider.config.event_priorities !== null
      ? normalizeEventPriorities(provider.config.event_priorities as Record<string, number>, true) : {},
    attach_photo: provider.attach_photo ?? true,
    quiet_hours_enabled: provider.quiet_hours_enabled,
    quiet_hours_start: provider.quiet_hours_start ?? '22:00',
    quiet_hours_end: provider.quiet_hours_end ?? '08:00',
    daily_digest_enabled: provider.daily_digest_enabled,
    daily_digest_time: provider.daily_digest_time ?? '09:00',
    printer_id: provider.printer_id,
    telegram_verdict_mode: provider.telegram_verdict_mode ?? 'buttons',
  };
}

export function buildProviderPayload(form: ProviderFormState): NotificationProviderCreate {
  const providerType: ProviderType = form.kind === 'slack' || form.kind === 'gotify' || form.kind === 'generic_webhook'
    ? 'webhook' : form.kind;
  const config: Record<string, unknown> = { ...form.originalConfig };
  for (const { key } of PROVIDER_FIELDS[form.kind] ?? []) {
    // Keep unknown/nested settings intact; only serialize controls this editor owns.
    config[key] = form.config[key] ?? '';
  }
  if (form.kind === 'slack') config.payload_format = 'slack';
  if (form.kind === 'gotify') {
    const base = form.config.server_url.trim().replace(/\/$/, '');
    const token = form.config.token.trim();
    config.webhook_url = `${base}/message${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    config.payload_format = 'generic';
    config.field_title = 'title';
    config.field_message = 'message';
    delete config.server_url;
    delete config.token;
  }
  if (form.kind === 'email') {
    config.smtp_port = Number(form.config.smtp_port || 587);
    // The SMTP handler calls .lower() on this config value, unlike event booleans.
    config.auth_enabled = form.config.auth_enabled === 'false' ? 'false' : 'true';
  }
  if (form.kind === 'telegram') config.message_thread_id = form.config.message_thread_id.trim() || null;
  if (form.kind === 'pushover') {
    config.priority = Number(form.config.priority || 0);
    config.retry = Number(form.config.retry || 60);
    config.expire = Number(form.config.expire || 3600);
  }
  if (form.kind === 'ntfy') config.event_priorities = normalizeEventPriorities(form.eventPriorities, false);
  return {
    name: form.name.trim(), enabled: form.enabled, provider_type: providerType, config,
    ...form.events, attach_photo: form.attach_photo,
    quiet_hours_enabled: form.quiet_hours_enabled,
    quiet_hours_start: form.quiet_hours_enabled ? form.quiet_hours_start : null,
    quiet_hours_end: form.quiet_hours_enabled ? form.quiet_hours_end : null,
    daily_digest_enabled: form.daily_digest_enabled,
    daily_digest_time: form.daily_digest_enabled ? form.daily_digest_time : null,
    printer_id: form.printer_id, telegram_verdict_mode: form.telegram_verdict_mode,
  };
}

export function validateProviderForm(form: ProviderFormState, mode: 'save' | 'test' = 'save'): string | null {
  if (mode === 'save' && !form.name.trim()) return 'Provider name is required.';
  if (mode === 'save' && form.name.trim().length > 100) return 'Provider name must be at most 100 characters.';
  if (!PROVIDER_FIELDS[form.kind]) return 'This provider type is not supported by this app. Its configuration has not been changed.';
  for (const f of PROVIDER_FIELDS[form.kind] ?? []) {
    if (f.required && !form.config[f.key]?.trim()) return `${f.label} is required.`;
  }
  if (form.kind === 'homeassistant' && form.config.data?.trim()) {
    try {
      const data: unknown = JSON.parse(form.config.data);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Custom service data must be a JSON object.';
    } catch { return 'Custom service data must be valid JSON.'; }
  }
  if (form.kind === 'telegram' && form.config.message_thread_id?.trim() &&
    !/^\d+$/.test(form.config.message_thread_id.trim())) return 'Forum topic ID must be an integer.';
  if (form.kind === 'email' && (!/^\d+$/.test(form.config.smtp_port) ||
    Number(form.config.smtp_port) < 1 || Number(form.config.smtp_port) > 65535)) return 'SMTP port must be between 1 and 65535.';
  if (form.kind === 'pushover' && form.config.priority === '2') {
    for (const key of ['retry', 'expire']) {
      const value = form.config[key];
      if (!/^\d+$/.test(value) || Number(value) < 30 || Number(value) > 10800) return 'Emergency retry and expiry must be integers between 30 and 10800 seconds.';
    }
  }
  for (const [enabled, times] of [
    [form.quiet_hours_enabled, [form.quiet_hours_start, form.quiet_hours_end]],
    [form.daily_digest_enabled, [form.daily_digest_time]],
  ] as const) {
    if (mode === 'save' && enabled && times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return 'Delivery times must use HH:MM (00:00–23:59).';
  }
  if (Object.values(form.eventPriorities).some(value => !Number.isInteger(value) || value < 1 || value > 5)) return 'ntfy priorities must be between 1 and 5.';
  return null;
}
