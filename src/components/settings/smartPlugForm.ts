import type { SmartPlug, SmartPlugCreate } from '@/types/api';

export type PlugDraft = Record<string, string | boolean>;
type Field = { key: string; label: string; min?: number; max?: number; nullable?: boolean };
export const tasmotaFields: Field[] = [
  { key: 'ip_address', label: 'IP address' }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password' },
];
export const mqttFields: Field[] = [
  { key: 'mqtt_power_topic', label: 'Power topic' }, { key: 'mqtt_power_path', label: 'Power JSON path (e.g. data.power)' },
  { key: 'mqtt_power_multiplier', label: 'Power multiplier', min: 0.0001, max: 10000 },
  { key: 'mqtt_energy_topic', label: 'Energy topic' }, { key: 'mqtt_energy_path', label: 'Energy JSON path' },
  { key: 'mqtt_energy_multiplier', label: 'Energy multiplier', min: 0.0001, max: 10000 },
  { key: 'mqtt_state_topic', label: 'State topic' }, { key: 'mqtt_state_path', label: 'State JSON path' },
  { key: 'mqtt_state_on_value', label: 'State ON value' },
];
export const restFields: Field[] = [
  { key: 'rest_on_url', label: 'ON URL' }, { key: 'rest_on_body', label: 'ON request body' },
  { key: 'rest_off_url', label: 'OFF URL' }, { key: 'rest_off_body', label: 'OFF request body' },
  { key: 'rest_headers', label: 'Headers (JSON object)' },
  { key: 'rest_status_url', label: 'Status URL' }, { key: 'rest_status_path', label: 'Status JSON path' },
  { key: 'rest_status_on_value', label: 'Status ON value' },
  { key: 'rest_power_url', label: 'Power URL' }, { key: 'rest_power_path', label: 'Power JSON path' },
  { key: 'rest_power_multiplier', label: 'Power multiplier', min: 0.0001, max: 10000 },
  { key: 'rest_energy_url', label: 'Energy URL (today and lifetime)' }, { key: 'rest_energy_path', label: 'Today energy JSON path' },
  { key: 'rest_energy_multiplier', label: 'Today energy multiplier', min: 0.0001, max: 10000 },
  { key: 'rest_energy_total_path', label: 'Lifetime energy JSON path' },
  { key: 'rest_energy_total_multiplier', label: 'Lifetime energy multiplier', min: 0.0001, max: 10000 },
];
export const policyFields: Field[] = [
  { key: 'off_delay_minutes', label: 'Delay after print (minutes)', min: 0, max: 60 },
  { key: 'off_temp_threshold', label: 'Nozzle cooldown threshold (°C)', min: 30, max: 150 },
  { key: 'off_delay_after_drying_minutes', label: 'Delay after drying (minutes)', min: 0, max: 120 },
  { key: 'power_alert_high', label: 'High power alert (W)', min: 0, max: 5000, nullable: true },
  { key: 'power_alert_low', label: 'Low power alert (W)', min: 0, max: 5000, nullable: true },
  { key: 'schedule_on_time', label: 'Scheduled ON (HH:MM)' }, { key: 'schedule_off_time', label: 'Scheduled OFF (HH:MM)' },
];
export const plugSwitches = [
  ['enabled', 'Enabled'], ['controls_printer_power', 'Controls printer power'],
  ['auto_on', 'Auto-on before print'], ['auto_off', 'Auto-off after print'],
  ['auto_off_persistent', 'Keep auto-off enabled after each print'],
  ['auto_off_after_drying', 'Auto-off after AMS drying'],
  ['power_alert_enabled', 'Power alerts'], ['schedule_enabled', 'Power schedule'],
  ['show_in_switchbar', 'Show in quick switches'], ['show_on_printer_card', 'Show on printer card'],
] as const;
const haFields = ['ha_entity_id', 'ha_power_entity', 'ha_energy_today_entity', 'ha_energy_total_entity'];
const fields = [...tasmotaFields, ...mqttFields, ...restFields, ...policyFields];

export function makePlugDraft(plug?: SmartPlug): PlugDraft {
  const draft: PlugDraft = {
    name: plug?.name ?? '', plug_type: plug?.plug_type ?? 'tasmota', printer_id: plug?.printer_id == null ? '' : String(plug.printer_id),
    rest_method: plug?.rest_method || (plug?.plug_type === 'rest' ? 'POST' : 'GET'), off_delay_mode: plug?.off_delay_mode ?? 'time',
  };
  const source = plug as unknown as Record<string, unknown> | undefined;
  for (const field of fields) {
    const defaultValue = field.key.endsWith('_multiplier') ? 1 : ({
      off_delay_minutes: 5, off_temp_threshold: 70, off_delay_after_drying_minutes: 10,
    } as Record<string, number>)[field.key];
    draft[field.key] = String(source?.[field.key] ?? defaultValue ?? '');
  }
  for (const key of haFields) draft[key] = String(source?.[key] ?? '');
  for (const [key] of plugSwitches) draft[key] = typeof source?.[key] === 'boolean' ? source[key] as boolean : ['enabled', 'controls_printer_power', 'auto_on', 'auto_off', 'show_on_printer_card'].includes(key);
  for (const key of ['mqtt_power_topic', 'mqtt_energy_topic', 'mqtt_state_topic']) {
    if (!draft[key]) draft[key] = plug?.mqtt_topic ?? '';
  }
  if (source?.mqtt_power_multiplier == null && plug?.mqtt_multiplier != null) draft.mqtt_power_multiplier = String(plug.mqtt_multiplier);
  return draft;
}

export function buildPlugPayload(draft: PlugDraft): SmartPlugCreate {
  const text = (key: string) => String(draft[key] ?? '').trim();
  if (!text('name')) throw new Error('Plug name is required.');
  const type = text('plug_type');
  if (type === 'tasmota' && (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text('ip_address')) || text('ip_address').split('.').some(part => Number(part) > 255))) throw new Error('Enter a valid Tasmota IPv4 address.');
  if (type === 'homeassistant' && !/^(switch|light|input_boolean|script)\.[a-z0-9_]+$/.test(text('ha_entity_id'))) throw new Error('Select a Home Assistant switch, light, input boolean or script.');
  if (type === 'mqtt' && !['mqtt_power_topic', 'mqtt_energy_topic', 'mqtt_state_topic'].some(key => text(key))) throw new Error('Configure at least one MQTT topic.');
  if (type === 'rest' && !text('rest_on_url') && !text('rest_off_url')) throw new Error('Configure at least one REST ON or OFF URL.');
  const payload: Record<string, unknown> = {
    name: text('name'), plug_type: type, printer_id: text('printer_id') ? Number(text('printer_id')) : null,
    off_delay_mode: text('off_delay_mode'), rest_method: text('rest_method'),
  };
  if (type === 'mqtt') payload.mqtt_topic = null;
  const activeFields = [...policyFields, ...(type === 'tasmota' ? tasmotaFields : type === 'mqtt' ? mqttFields : type === 'rest' ? restFields : [])];
  for (const field of activeFields) {
    const value = text(field.key);
    if (field.min != null && !(field.nullable && value === '')) {
      const number = Number(value);
      if (!value || !Number.isFinite(number) || number < field.min || number > field.max!) throw new Error(`${field.label} must be ${field.min}–${field.max}.`);
      if (field.key.startsWith('off_') && !Number.isInteger(number)) throw new Error(`${field.label} must be a whole number.`);
      payload[field.key] = number;
    } else {
      // Body strings may contain significant whitespace.
      payload[field.key] = field.key.endsWith('_body') ? String(draft[field.key] || '') || null : value || null;
    }
  }
  for (const [key] of plugSwitches) payload[key] = Boolean(draft[key]);
  if (type === 'homeassistant') for (const key of haFields) payload[key] = text(key) || null;
  for (const key of ['schedule_on_time', 'schedule_off_time']) if (text(key) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text(key))) throw new Error('Schedule times must use HH:MM (00:00–23:59).');
  if (draft.schedule_enabled && !text('schedule_on_time') && !text('schedule_off_time')) throw new Error('Set an ON or OFF schedule time.');
  if (payload.power_alert_low != null && payload.power_alert_high != null && Number(payload.power_alert_low) >= Number(payload.power_alert_high)) throw new Error('Low power threshold must be below high threshold.');
  if (type === 'rest') {
    for (const field of restFields.filter(f => f.key.endsWith('_url'))) if (text(field.key) && !/^https?:\/\/\S+$/i.test(text(field.key))) throw new Error(`${field.label} must be an HTTP(S) URL.`);
    if (text('rest_headers')) {
      let headers: unknown;
      try { headers = JSON.parse(text('rest_headers')); } catch { throw new Error('Headers must be a JSON object of string values.'); }
      if (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.values(headers).some(value => typeof value !== 'string')) throw new Error('Headers must be a JSON object of string values.');
    }
  }
  return payload as unknown as SmartPlugCreate;
}
