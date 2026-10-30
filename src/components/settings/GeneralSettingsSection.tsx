import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SectionCard, InlineTabBar } from '@/components/common/AppUI';
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  NOTIFICATION_LANGUAGE_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from './constants';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { GeneralWorkflowSettings } from './GeneralWorkflowSettings';
import { PrintDefaultsSettings } from './PrintDefaultsSettings';
import { UiPreferencesSection } from './UiPreferencesSection';
import { NumericSettingsField } from './WorkflowFields';

export function GeneralSettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { language, setLanguage, t } = useTranslation();
  const [languageError, setLanguageError] = useState(false);
  const { draft } = controller.state;
  const { setDraft } = controller.actions;

  return (
    <>
      <SectionCard title={translateNative('native.6794d2c963650f62')} subtitle={translateNative('native.968b189844535910')}>
        <InlineTabBar
          value={controller.mode}
          tabs={[
            { key: 'dark', get label() { return translateNative('preferences.dark'); } },
            { key: 'light', get label() { return translateNative('preferences.light'); } },
            { key: 'system', get label() { return translateNative('nav.system'); } },
          ]}
          onChange={value => controller.setMode(value as typeof controller.mode)}
        />
        <OptionChipsField
          label={t('preferences.language')}
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={value => {
            setDraft(current => ({ ...current, language: value }));
            setLanguageError(false);
            void setLanguage(value).catch(() => setLanguageError(true));
          }}
        />
        {languageError ? <Text accessibilityRole="alert" style={{ color: controller.colors.error }}>{t('common.error')}</Text> : null}
        <OptionChipsField
          label={t('preferences.notificationLanguage')}
          disabled={!controller.permissions.canUpdateSettings}
          value={String(draft.notification_language ?? 'en')}
          options={NOTIFICATION_LANGUAGE_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, notification_language: value }))}
        />
        <View style={settingsStyles.twoColumnGrid}>
          <View style={settingsStyles.twoColumnCell}>
            <OptionChipsField
              label={translateNative('native.4f5d6be05ea4a8bd')}
              disabled={!controller.permissions.canUpdateSettings}
              value={String(draft.date_format ?? 'system')}
              options={DATE_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, date_format: value }))}
            />
          </View>
          <View style={settingsStyles.twoColumnCell}>
            <OptionChipsField
              label={translateNative('native.6e65ae1167aa838f')}
              disabled={!controller.permissions.canUpdateSettings}
              value={String(draft.time_format ?? 'system')}
              options={TIME_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, time_format: value }))}
            />
          </View>
        </View>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.4324d53ee0d2f72d')}</Text>
      </SectionCard>

      <UiPreferencesSection controller={controller} />

      <SectionCard title={translateNative('native.af31599d37e05a2b')} subtitle={translateNative('native.700ee687e28197b1')}>
        <SwitchRow
          label={translateNative('native.fbcc3e928676cd4a')}
          disabled={!controller.permissions.canUpdateSettings}
          description={translateNative('native.d5ccccdc9828794d')}
          value={Boolean(draft.auto_archive)}
          onValueChange={value => setDraft(current => ({ ...current, auto_archive: value }))}
        />
        <SwitchRow
          label={translateNative('native.506047fc5b1f7555')}
          disabled={!controller.permissions.canUpdateSettings}
          description={translateNative('native.3c377e7ddfd04120')}
          value={Boolean(draft.save_thumbnails)}
          onValueChange={value => setDraft(current => ({ ...current, save_thumbnails: value }))}
        />
        <SwitchRow
          label={translateNative('native.773fcf339698e1eb')}
          disabled={!controller.permissions.canUpdateSettings}
          description={translateNative('native.4078402aa3510e7f')}
          value={Boolean(draft.capture_finish_photo)}
          onValueChange={value => setDraft(current => ({ ...current, capture_finish_photo: value }))}
        />
      </SectionCard>

      <GeneralWorkflowSettings controller={controller} />
      <PrintDefaultsSettings controller={controller} />

      <SectionCard title={translateNative('native.a973bf5223dd9035')} subtitle={translateNative('native.12f512ffb60dc302')}>
        <OptionChipsField
          label={translateNative('native.f39ec882b1ec3c05')}
          disabled={!controller.permissions.canUpdateSettings}
          value={String(draft.currency ?? 'USD')}
          options={CURRENCY_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, currency: value }))}
        />
        <NumericSettingsField
          label={translateNative('native.60bd259ab8a732a5')}
          editable={controller.permissions.canUpdateSettings}
          value={stringifyNumberField(draft.default_filament_cost, '25')}
          onChangeNumber={value => setDraft(current => ({ ...current, default_filament_cost: value }))}
          keyboardType="decimal-pad"
        />
        <NumericSettingsField
          label={translateNative('native.5f61f6862dac8670')}
          editable={controller.permissions.canUpdateSettings}
          value={stringifyNumberField(draft.energy_cost_per_kwh, '0.15')}
          onChangeNumber={value => setDraft(current => ({ ...current, energy_cost_per_kwh: value }))}
          keyboardType="decimal-pad"
        />
        <SwitchRow disabled={!controller.permissions.canUpdateSettings} label={translateNative('native.8ec7904049f5dab7')} description={translateNative('native.4fd6b298e1795450')} value={Boolean(draft.check_updates ?? true)} onValueChange={value => setDraft(current => ({ ...current, check_updates: value }))} />
        <SwitchRow disabled={!controller.permissions.canUpdateSettings} label={translateNative('native.112cb52752a171d4')} description={translateNative('native.deff64b5fb563d44')} value={Boolean(draft.check_printer_firmware ?? true)} onValueChange={value => setDraft(current => ({ ...current, check_printer_firmware: value }))} />
        <SwitchRow label={translateNative('native.6d933e5234ccda38')} description={translateNative('native.5626ba9d81936055')} value={Boolean(draft.include_beta_updates)} onValueChange={value => setDraft(current => ({ ...current, include_beta_updates: value }))}         disabled={!controller.permissions.canUpdateSettings || !(draft.check_updates ?? true)} />
      </SectionCard>
    </>
  );
}
