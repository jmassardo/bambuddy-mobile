import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { settingsStyles, SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function NetworkSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft, pendingDeleteExternalLink } = controller.state;
  const { setDraft, openExternalLinkModal, setPendingDeleteExternalLink } = controller.actions;
  const externalLinks = (controller.queries.externalLinksQuery.data ?? []) as ApiRecord[];

  return (
    <>
      <SectionCard title="Network endpoints" subtitle="External URL plus retry and automation integrations.">
        <TextField label="External URL" value={pickString(draft, ['external_url'])} onChangeText={value => setDraft(current => ({ ...current, external_url: value }))} autoCapitalize="none" />
        <SwitchRow label="FTP retry enabled" value={pickBoolean(draft, ['ftp_retry_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ftp_retry_enabled: value }))} />
        <TextField label="FTP retry count" value={stringifyNumberField(draft.ftp_retry_count, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_count: Number(value) || 0 }))} keyboardType="number-pad" />
        <TextField label="FTP retry delay (s)" value={stringifyNumberField(draft.ftp_retry_delay, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_delay: Number(value) || 0 }))} keyboardType="number-pad" />
      </SectionCard>
      <SectionCard title="External links" subtitle="Quick links for Grafana, Home Assistant, and other tools.">
        <PrimaryButton label="Add external link" variant="secondary" onPress={() => openExternalLinkModal()} />
        {externalLinks.length > 0 ? (
          externalLinks.map(link => (
            <View key={pickString(link, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(link, ['name'], 'External link')}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(link, ['url'])}</Text>
                </View>
                <StatusBadge label={pickBoolean(link, ['open_in_new_tab'], true) ? 'external' : 'embedded'} color={controller.colors.accent} />
              </View>
              <View style={settingsStyles.actions}>
                <PrimaryButton label="Edit" variant="secondary" onPress={() => openExternalLinkModal(link)} />
                <PrimaryButton label="Delete" variant="danger" onPress={() => setPendingDeleteExternalLink(link)} />
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon="🔗" title="No external links" message="Add Grafana, Home Assistant, or any other dashboard link." />
        )}
      </SectionCard>
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
    </>
  );
}
