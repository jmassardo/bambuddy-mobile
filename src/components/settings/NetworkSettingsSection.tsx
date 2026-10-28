import { translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { OptionChipsField, settingsStyles, SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { HomeAssistantSettings } from './HomeAssistantSettings';
import { useIntegrationTranslation } from './useIntegrationTranslation';

export function NetworkSettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { draft } = controller.state;
  const tr = useIntegrationTranslation();
  const { setDraft, openExternalLinkModal, setPendingDeleteExternalLink } = controller.actions;
  const externalLinks = useLocalizedMemo(
    () =>
      ([...(controller.queries.externalLinksQuery.data ?? [])] as ApiRecord[]).sort((a, b) => {
        const sortDiff = pickNumber(a, ['sort_order']) - pickNumber(b, ['sort_order']);
        if (sortDiff !== 0) return sortDiff;
        return pickString(a, ['name']).localeCompare(pickString(b, ['name']));
      }),
    [controller.queries.externalLinksQuery.data],
  );

  const moveExternalLink = React.useCallback(
    (id: number, direction: -1 | 1) => {
      const index = externalLinks.findIndex(link => pickNumber(link, ['id']) === id);
      if (index < 0) return;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= externalLinks.length) return;
      const ids = externalLinks.map(link => pickNumber(link, ['id']));
      const [moved] = ids.splice(index, 1);
      ids.splice(targetIndex, 0, moved);
      void controller.mutations.reorderExternalLinksMutation.mutateAsync(ids);
    },
    [controller.mutations.reorderExternalLinksMutation, externalLinks],
  );

  return (
    <>
      <SectionCard title={translateNative('native.10867e86a40b952d')} subtitle={translateNative('native.afc150769059d8fe')}>
        <TextField label={translateNative('native.b543b3bf7894c9d6')} value={pickString(draft, ['external_url'])} onChangeText={value => setDraft(current => ({ ...current, external_url: value }))} autoCapitalize="none" />
        <OptionChipsField label={tr('FTP timeout (seconds)')} value={stringifyNumberField(draft.ftp_timeout, '30')} disabled={!controller.permissions.canUpdateSettings} options={[10, 15, 20, 30, 45, 60, 90, 120, 180, 300].map(value => ({ key: String(value), label: String(value) }))} onChange={value => setDraft(current => ({ ...current, ftp_timeout: Number(value) }))} />
        <SwitchRow label={translateNative('native.280d873382200b67')} value={pickBoolean(draft, ['ftp_retry_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ftp_retry_enabled: value }))} />
        <TextField label={translateNative('native.02e07872e378cb8d')} value={stringifyNumberField(draft.ftp_retry_count, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_count: Number(value) || 0 }))} keyboardType="number-pad" />
        <TextField label={translateNative('native.f14bc1947b2f21ab')} value={stringifyNumberField(draft.ftp_retry_delay, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_delay: Number(value) || 0 }))} keyboardType="number-pad" />
      </SectionCard>
      <HomeAssistantSettings controller={controller} />
      <SectionCard title={translateNative('native.fde66c9c8ff87b5d')} subtitle={translateNative('native.a53bd4a0ca4789ef')}>
        <PrimaryButton label={translateNative('native.7cc3338c074adb7f')} variant="secondary" onPress={() => openExternalLinkModal()} />
        {externalLinks.length > 0 ? (
          externalLinks.map(link => (
            <View key={pickString(link, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(link, ['name'], translateNative('native.db746907fbe274f0'))}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(link, ['url'])}</Text>
                </View>
                <StatusBadge label={pickBoolean(link, ['open_in_new_tab'], true) ? translateNative('native.6efe26285df4359c') : translateNative('native.3c3335ed4c1dfd0f')} color={controller.colors.accent} />
              </View>
              <View style={settingsStyles.actions}>
                <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={() => openExternalLinkModal(link)} />
                <PrimaryButton
                  label={translateNative('native.8ba1af69ff166671')}
                  variant="secondary"
                  onPress={() => moveExternalLink(pickNumber(link, ['id']), -1)}
                  disabled={controller.mutations.reorderExternalLinksMutation.isPending || externalLinks[0] === link}
                />
                <PrimaryButton
                  label={translateNative('native.88156bfc217b6318')}
                  variant="secondary"
                  onPress={() => moveExternalLink(pickNumber(link, ['id']), 1)}
                  disabled={controller.mutations.reorderExternalLinksMutation.isPending || externalLinks[externalLinks.length - 1] === link}
                />
                <PrimaryButton label={translateNative('common.delete')} variant="danger" onPress={() => setPendingDeleteExternalLink(link)} />
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon="🔗" title={translateNative('native.44781292c7f4fa31')} message={translateNative('native.f44a51f45c7f5f34')} />
        )}
      </SectionCard>
      <SectionCard title="Prometheus" subtitle={translateNative('native.c301673fd1329644')}>
        <SwitchRow label={translateNative('native.7c0e157c13e37e3a')} value={pickBoolean(draft, ['prometheus_enabled'])} onValueChange={value => setDraft(current => ({ ...current, prometheus_enabled: value }))} />
        <TextField label={translateNative('native.1fd9ae3ee7ba859b')} value={pickString(draft, ['prometheus_token'])} onChangeText={value => setDraft(current => ({ ...current, prometheus_token: value }))} autoCapitalize="none" />
      </SectionCard>
    </>
  );
}
