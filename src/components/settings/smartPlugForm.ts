import { nativeLabelTuple, translateNative } from '@/i18n';

import type { SmartPlug, SmartPlugCreate } from '@/types/api';

export type PlugDraft = Record<string, string | boolean>;
type Field = { key: string; label: string; min?: number; max?: number; nullable?: boolean };
export const tasmotaFields: Field[] = [
  { key: 'ip_address', get label() { return translateNative('native.034a6032919bb741'); } }, { key: 'username', get label() { return translateNative('native.f503af8b2bf430e6'); } }, { key: 'password', get label() { return translateNative('native.08c9c68cc706272f'); } },
];
export const mqttFields: Field[] = [
  { key: 'mqtt_power_topic', get label() { return translateNative('native.dc9288374f24a5cc'); } }, { key: 'mqtt_power_path', get label() { return translateNative('native.9b605ef6e94756fc'); } },
  { key: 'mqtt_power_multiplier', get label() { return translateNative('native.3208c5db4b747247'); }, min: 0.0001, max: 10000 },
  { key: 'mqtt_energy_topic', get label() { return translateNative('native.da5db65b2bd84f6b'); } }, { key: 'mqtt_energy_path', get label() { return translateNative('native.cf3da3f8345c22dc'); } },
  { key: 'mqtt_energy_multiplier', get label() { return translateNative('native.61f3418b1549833e'); }, min: 0.0001, max: 10000 },
  { key: 'mqtt_state_topic', get label() { return translateNative('native.67f34db4b6915e4b'); } }, { key: 'mqtt_state_path', get label() { return translateNative('native.9f7fa2e24a54c193'); } },
  { key: 'mqtt_state_on_value', get label() { return translateNative('native.78b9520395c3e7b1'); } },
];
export const restFields: Field[] = [
  { key: 'rest_on_url', get label() { return translateNative('native.ec7ef2a81745ca88'); } }, { key: 'rest_on_body', get label() { return translateNative('native.a9ad8ca973a68fce'); } },
  { key: 'rest_off_url', get label() { return translateNative('native.a4ece56596eb0fad'); } }, { key: 'rest_off_body', get label() { return translateNative('native.bdee7d113de2ceff'); } },
  { key: 'rest_headers', get label() { return translateNative('native.f67a2d9d04e7ac63'); } },
  { key: 'rest_status_url', get label() { return translateNative('native.8ba0b48a17290c53'); } }, { key: 'rest_status_path', get label() { return translateNative('native.c1152be9c8c228c0'); } },
  { key: 'rest_status_on_value', get label() { return translateNative('native.cf60291472c98780'); } },
  { key: 'rest_power_url', get label() { return translateNative('native.b70a41f181db38a8'); } }, { key: 'rest_power_path', get label() { return translateNative('native.dc05a4c9949a1ec6'); } },
  { key: 'rest_power_multiplier', get label() { return translateNative('native.3208c5db4b747247'); }, min: 0.0001, max: 10000 },
  { key: 'rest_energy_url', get label() { return translateNative('native.6222b77ddd973341'); } }, { key: 'rest_energy_path', get label() { return translateNative('native.3924bfea6d55bd2b'); } },
  { key: 'rest_energy_multiplier', get label() { return translateNative('native.992125d74c2d7a1d'); }, min: 0.0001, max: 10000 },
  { key: 'rest_energy_total_path', get label() { return translateNative('native.8b1c9e86955d621c'); } },
  { key: 'rest_energy_total_multiplier', get label() { return translateNative('native.01f7b0650c66557a'); }, min: 0.0001, max: 10000 },
];
export const policyFields: Field[] = [
  { key: 'off_delay_minutes', get label() { return translateNative('native.032d5d88d5344671'); }, min: 0, max: 60 },
  { key: 'off_temp_threshold', get label() { return translateNative('native.8554e371a96608cc'); }, min: 30, max: 150 },
  { key: 'off_delay_after_drying_minutes', get label() { return translateNative('native.ec41e514e2a2af96'); }, min: 0, max: 120 },
  { key: 'power_alert_high', get label() { return translateNative('native.f681627c2dc5ce72'); }, min: 0, max: 5000, nullable: true },
  { key: 'power_alert_low', get label() { return translateNative('native.71a89314de041798'); }, min: 0, max: 5000, nullable: true },
  { key: 'schedule_on_time', get label() { return translateNative('native.7c2f0b84fd046864'); } }, { key: 'schedule_off_time', get label() { return translateNative('native.833f8b49cb305461'); } },
];
export const plugSwitches = [
  nativeLabelTuple(['enabled', 'Enabled']), nativeLabelTuple(['controls_printer_power', 'Controls printer power']),
  nativeLabelTuple(['auto_on', 'Auto-on before print']), nativeLabelTuple(['auto_off', 'Auto-off after print']),
  nativeLabelTuple(['auto_off_persistent', 'Keep auto-off enabled after each print']),
  nativeLabelTuple(['auto_off_after_drying', 'Auto-off after AMS drying']),
  nativeLabelTuple(['power_alert_enabled', 'Power alerts']), nativeLabelTuple(['schedule_enabled', 'Power schedule']),
  nativeLabelTuple(['show_in_switchbar', 'Show in quick switches']), nativeLabelTuple(['show_on_printer_card', 'Show on printer card']),
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
  if (!text('name')) throw new Error(translateNative('native.cf0d0fdf444e5dfd'));
  const type = text('plug_type');
  if (type === 'tasmota' && (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text('ip_address')) || text('ip_address').split('.').some(part => Number(part) > 255))) throw new Error(translateNative('native.072b22ece7a2d6c8'));
  if (type === 'homeassistant' && !/^(switch|light|input_boolean|script)\.[a-z0-9_]+$/.test(text('ha_entity_id'))) throw new Error(translateNative('native.52772b2cb08e8245'));
  if (type === 'mqtt' && !['mqtt_power_topic', 'mqtt_energy_topic', 'mqtt_state_topic'].some(key => text(key))) throw new Error(translateNative('native.46b7b4b6eacba0a7'));
  if (type === 'rest' && !text('rest_on_url') && !text('rest_off_url')) throw new Error(translateNative('native.8ed68222810316f3'));
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
      if (!value || !Number.isFinite(number) || number < field.min || number > field.max!) throw new Error(translateNative('native.4048ea84ce48a09d', { value0: String(field.label), value1: String(field.min), value2: String(field.max) }));
      if (field.key.startsWith('off_') && !Number.isInteger(number)) throw new Error(translateNative('native.3feca8d87813c29d', { value0: String(field.label) }));
      payload[field.key] = number;
    } else {
      // Body strings may contain significant whitespace.
      payload[field.key] = field.key.endsWith('_body') ? String(draft[field.key] || '') || null : value || null;
    }
  }
  for (const [key] of plugSwitches) payload[key] = Boolean(draft[key]);
  if (type === 'homeassistant') for (const key of haFields) payload[key] = text(key) || null;
  for (const key of ['schedule_on_time', 'schedule_off_time']) if (text(key) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text(key))) throw new Error(translateNative('native.62ebcb6b4a319ddf'));
  if (draft.schedule_enabled && !text('schedule_on_time') && !text('schedule_off_time')) throw new Error(translateNative('native.8e0f91a439e3666b'));
  if (payload.power_alert_low != null && payload.power_alert_high != null && Number(payload.power_alert_low) >= Number(payload.power_alert_high)) throw new Error(translateNative('native.393f981db6b893b8'));
  if (type === 'rest') {
    for (const field of restFields.filter(f => f.key.endsWith('_url'))) if (text(field.key) && !/^https?:\/\/\S+$/i.test(text(field.key))) throw new Error(translateNative('native.6a3ae7cfadb9a4d1', { value0: String(field.label) }));
    if (text('rest_headers')) {
      let headers: unknown;
      try { headers = JSON.parse(text('rest_headers')); } catch { throw new Error(translateNative('native.06c83cd6e5db17a8')); }
      if (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.values(headers).some(value => typeof value !== 'string')) throw new Error(translateNative('native.06c83cd6e5db17a8'));
    }
  }
  return payload as unknown as SmartPlugCreate;
}
