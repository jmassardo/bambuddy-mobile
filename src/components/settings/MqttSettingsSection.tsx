import { translateNative, useNativeLocale } from '@/i18n';
import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString } from '@/utils/data';

const TLS_PORT = 8883;
const DEFAULT_PORT = 1883;

export function MqttSettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { draft, mqttForm } = controller.state;
  const { setDraft, setMqttForm } = controller.actions;
  const { testMqttMutation } = controller.mutations;

  const useTls = pickBoolean(draft, ['mqtt_use_tls']);
  const broker = pickString(draft, ['mqtt_broker']);

  const port = useTls ? TLS_PORT : DEFAULT_PORT;

  return (
    <>
      <SectionCard title={translateNative('native.afabb3a0bb2738ed')} subtitle={translateNative('native.19c3036022ff20d8')}>
        <SwitchRow label={translateNative('native.d1c6816f7f20e34a')} value={Boolean(draft.mqtt_enabled)} onValueChange={value => setDraft(current => ({ ...current, mqtt_enabled: value }))} />
        <TextField label={translateNative('native.b4ddc691fa66c35c')} value={broker} onChangeText={value => setDraft(current => ({ ...current, mqtt_broker: value }))} autoCapitalize="none" />
        <OptionChipsField
          label={translateNative('native.bd750f4587e5517b')}
          value={useTls ? 'tls' : 'tcp'}
          options={[
            { key: 'tcp', label: 'TCP' },
            { key: 'tls', label: 'TLS' },
          ]}
          onChange={value => setDraft(current => ({ ...current, mqtt_use_tls: value === 'tls' }))}
        />
        <TextField label={translateNative('native.31ac0d7330737ae4')} value={stringifyNumberField(draft.mqtt_port, String(port))} onChangeText={value => setDraft(current => ({ ...current, mqtt_port: Number(value) || port }))} keyboardType="number-pad" />
        <TextField label={translateNative('native.f503af8b2bf430e6')} value={pickString(draft, ['mqtt_username'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_username: value }))} autoCapitalize="none" />
        <TextField label={translateNative('native.08c9c68cc706272f')} value={mqttForm.mqtt_password} onChangeText={value => setMqttForm(current => ({ ...current, mqtt_password: value }))} secureTextEntry autoCapitalize="none" />
        <TextField label={translateNative('native.7737e00df792a67e')} value={pickString(draft, ['mqtt_topic_prefix'], 'bambuddy')} onChangeText={value => setDraft(current => ({ ...current, mqtt_topic_prefix: value }))} autoCapitalize="none" />
        {controller.derived.mqttStatus && (
          <View style={settingsStyles.summaryRow}>
            <Text style={[settingsStyles.summaryLabel, { color: controller.colors.textSecondary }]}>{translateNative('common.status')}</Text>
            <StatusBadge label={controller.derived.mqttStatus.connected ? translateNative('native.7a24d4ce1f2c4857') : controller.derived.mqttStatus.enabled ? translateNative('native.22cd1cee4ce4b061') : translateNative('common.disabled')} color={controller.derived.mqttStatus.connected ? controller.colors.success : controller.derived.mqttStatus.enabled ? controller.colors.warning : controller.colors.textSecondary} />
          </View>
        )}
        <PrimaryButton
          label={testMqttMutation.isPending ? translateNative('native.36b1241a43893d02') : translateNative('native.c281bbb20123f577')}
          variant="secondary"
          onPress={() => void testMqttMutation.mutateAsync()}
          loading={testMqttMutation.isPending}
          disabled={testMqttMutation.isPending || !broker.trim()}
        />
      </SectionCard>
    </>
  );
}
