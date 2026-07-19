import React from 'react';
import { SectionCard, TextField } from '@/components/common/AppUI';
import { pickBoolean, pickString, type ApiRecord } from '@/utils/data';
import { SwitchRow, stringifyNumberField } from './shared';

export default function IntegrationsSection({
  draft,
  setDraft,
}: {
  draft: ApiRecord;
  setDraft: React.Dispatch<React.SetStateAction<ApiRecord>>;
}) {
  return (
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
  );
}
