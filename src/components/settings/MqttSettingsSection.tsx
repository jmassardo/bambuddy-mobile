import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString } from '@/utils/data';

const TLS_PORT = 8883;
const DEFAULT_PORT = 1883;

export function MqttSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft, mqttForm } = controller.state;
  const { setDraft, setMqttForm } = controller.actions;
  const { testMqttMutation } = controller.mutations;

  const useTls = pickBoolean(draft, ['mqtt_use_tls']);
  const broker = pickString(draft, ['mqtt_broker']);

  const port = useTls ? TLS_PORT : DEFAULT_PORT;

  return (
    <>
      <SectionCard title="MQTT publishing" subtitle="Publish events to an external MQTT broker.">
        <SwitchRow label="MQTT enabled" value={Boolean(draft.mqtt_enabled)} onValueChange={value => setDraft(current => ({ ...current, mqtt_enabled: value }))} />
        <TextField label="Broker hostname" value={broker} onChangeText={value => setDraft(current => ({ ...current, mqtt_broker: value }))} autoCapitalize="none" />
        <OptionChipsField
          label="Connection"
          value={useTls ? 'tls' : 'tcp'}
          options={[
            { key: 'tcp', label: 'TCP' },
            { key: 'tls', label: 'TLS' },
          ]}
          onChange={value => setDraft(current => ({ ...current, mqtt_use_tls: value === 'tls' }))}
        />
        <TextField label="Port" value={stringifyNumberField(draft.mqtt_port, String(port))} onChangeText={value => setDraft(current => ({ ...current, mqtt_port: Number(value) || port }))} keyboardType="number-pad" />
        <TextField label="Username" value={pickString(draft, ['mqtt_username'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_username: value }))} autoCapitalize="none" />
        <TextField label="Password" value={mqttForm.mqtt_password} onChangeText={value => setMqttForm(current => ({ ...current, mqtt_password: value }))} secureTextEntry autoCapitalize="none" />
        <TextField label="Topic prefix" value={pickString(draft, ['mqtt_topic_prefix'], 'bambuddy')} onChangeText={value => setDraft(current => ({ ...current, mqtt_topic_prefix: value }))} autoCapitalize="none" />
        {controller.derived.mqttStatus && (
          <View style={settingsStyles.summaryRow}>
            <Text style={[settingsStyles.summaryLabel, { color: controller.colors.textSecondary }]}>Status</Text>
            <StatusBadge label={controller.derived.mqttStatus.connected ? 'Connected' : controller.derived.mqttStatus.enabled ? 'Disconnected' : 'Disabled'} color={controller.derived.mqttStatus.connected ? controller.colors.success : controller.derived.mqttStatus.enabled ? controller.colors.warning : controller.colors.textSecondary} />
          </View>
        )}
        <PrimaryButton
          label={testMqttMutation.isPending ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => void testMqttMutation.mutateAsync()}
          loading={testMqttMutation.isPending}
          disabled={testMqttMutation.isPending || !broker.trim()}
        />
      </SectionCard>
    </>
  );
}
