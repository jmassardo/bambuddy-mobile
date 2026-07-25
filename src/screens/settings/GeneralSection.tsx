import React from 'react';
import { Text, View } from 'react-native';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InlineTabBar, PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { pickBoolean, pickString } from '@/utils/data';
import { OptionChipsField, SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';

const LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
  { key: 'fr', label: 'Français' },
  { key: 'it', label: 'Italiano' },
  { key: 'ja', label: '日本語' },
  { key: 'pt-BR', label: 'Português (BR)' },
] as const;

const NOTIFICATION_LANGUAGE_OPTIONS = [
  { key: 'en', label: 'English' },
  { key: 'de', label: 'Deutsch' },
] as const;

const DATE_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: 'us', label: 'MM/DD/YYYY' },
  { key: 'eu', label: 'DD/MM/YYYY' },
  { key: 'iso', label: 'YYYY-MM-DD' },
] as const;

const TIME_FORMAT_OPTIONS = [
  { key: 'system', label: 'System' },
  { key: '12h', label: '12 hour' },
  { key: '24h', label: '24 hour' },
] as const;

const CURRENCY_OPTIONS = [
  { key: 'USD', label: 'USD' },
  { key: 'EUR', label: 'EUR' },
  { key: 'GBP', label: 'GBP' },
  { key: 'CAD', label: 'CAD' },
  { key: 'AUD', label: 'AUD' },
  { key: 'JPY', label: 'JPY' },
] as const;

export default function GeneralSection() {
  const { colors, mode, setMode } = useTheme();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Appearance & locale" subtitle="Language, date, time, and theme preferences.">
        <InlineTabBar
          value={mode}
          tabs={[
            { key: 'dark', label: 'Dark' },
            { key: 'light', label: 'Light' },
            { key: 'system', label: 'System' },
          ]}
          onChange={value => setMode(value as 'dark' | 'light' | 'system')}
        />
        <OptionChipsField
          label="Language"
          value={pickString(draft, ['language'], 'en')}
          options={LANGUAGE_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, language: value }))}
        />
        <OptionChipsField
          label="Notification language"
          value={pickString(draft, ['notification_language'], 'en')}
          options={NOTIFICATION_LANGUAGE_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, notification_language: value }))}
        />
        <View style={styles.twoColumnGrid}>
          <View style={styles.twoColumnCell}>
            <OptionChipsField
              label="Date format"
              value={pickString(draft, ['date_format'], 'system')}
              options={DATE_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, date_format: value }))}
            />
          </View>
          <View style={styles.twoColumnCell}>
            <OptionChipsField
              label="Time format"
              value={pickString(draft, ['time_format'], 'system')}
              options={TIME_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, time_format: value }))}
            />
          </View>
        </View>
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Temperatures are currently stored and reported by the server in Celsius.</Text>
      </SectionCard>

      <SectionCard title="Archiving & capture" subtitle="Archive behavior, thumbnails, finish photos, and timelapse defaults.">
        <SwitchRow
          label="Auto archive"
          description="Automatically archive finished prints."
          value={pickBoolean(draft, ['auto_archive'])}
          onValueChange={value => setDraft(current => ({ ...current, auto_archive: value }))}
        />
        <SwitchRow
          label="Save thumbnails"
          description="Extract preview images from uploaded print files."
          value={pickBoolean(draft, ['save_thumbnails'])}
          onValueChange={value => setDraft(current => ({ ...current, save_thumbnails: value }))}
        />
        <SwitchRow
          label="Capture finish photo"
          description="Keep the final print image when a job completes."
          value={pickBoolean(draft, ['capture_finish_photo'])}
          onValueChange={value => setDraft(current => ({ ...current, capture_finish_photo: value }))}
        />
      </SectionCard>

      <SectionCard title="Default print options" subtitle="Applied when starting new prints from the app.">
        <SwitchRow
          label="Bed leveling"
          description="Auto-level bed before starting the print."
          value={pickBoolean(draft, ['default_bed_levelling'], true)}
          onValueChange={value => setDraft(current => ({ ...current, default_bed_levelling: value }))}
        />
        <SwitchRow
          label="Flow calibration"
          description="Run extrusion flow calibration."
          value={pickBoolean(draft, ['default_flow_cali'])}
          onValueChange={value => setDraft(current => ({ ...current, default_flow_cali: value }))}
        />
        <SwitchRow
          label="Vibration calibration"
          description="Reduce ringing before the print starts."
          value={pickBoolean(draft, ['default_vibration_cali'], true)}
          onValueChange={value => setDraft(current => ({ ...current, default_vibration_cali: value }))}
        />
        <SwitchRow
          label="First layer inspection"
          description="Enable AI first-layer checks by default."
          value={pickBoolean(draft, ['default_layer_inspect'])}
          onValueChange={value => setDraft(current => ({ ...current, default_layer_inspect: value }))}
        />
        <SwitchRow
          label="Timelapse"
          description="Record timelapse video for new prints by default."
          value={pickBoolean(draft, ['default_timelapse'])}
          onValueChange={value => setDraft(current => ({ ...current, default_timelapse: value }))}
        />
        <SwitchRow
          label="Nozzle offset calibration"
          description="Useful on dual-nozzle printers."
          value={pickBoolean(draft, ['default_nozzle_offset_cali'], true)}
          onValueChange={value => setDraft(current => ({ ...current, default_nozzle_offset_cali: value }))}
        />
      </SectionCard>

      <SectionCard title="Electricity pricing & updates" subtitle="Cost tracking defaults and version checks.">
        <OptionChipsField
          label="Currency"
          value={pickString(draft, ['currency'], 'USD')}
          options={CURRENCY_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, currency: value }))}
        />
        <TextField
          label="Default filament cost / kg"
          value={stringifyNumberField(draft.default_filament_cost, '25')}
          onChangeText={value => setDraft(current => ({ ...current, default_filament_cost: parseFloat(value) || 0 }))}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Price per kWh"
          value={stringifyNumberField(draft.energy_cost_per_kwh, '0.15')}
          onChangeText={value => setDraft(current => ({ ...current, energy_cost_per_kwh: parseFloat(value) || 0 }))}
          keyboardType="decimal-pad"
        />
        <SwitchRow
          label="Check for updates"
          description="Automatically look for Bambuddy updates."
          value={pickBoolean(draft, ['check_updates'], true)}
          onValueChange={value => setDraft(current => ({ ...current, check_updates: value }))}
        />
        <SwitchRow
          label="Check printer firmware"
          description="Include printer firmware updates in the check flow."
          value={pickBoolean(draft, ['check_printer_firmware'], true)}
          onValueChange={value => setDraft(current => ({ ...current, check_printer_firmware: value }))}
        />
        <SwitchRow
          label="Include beta updates"
          description="Receive prerelease update notifications."
          value={pickBoolean(draft, ['include_beta_updates'])}
          onValueChange={value => setDraft(current => ({ ...current, include_beta_updates: value }))}
          disabled={!pickBoolean(draft, ['check_updates'], true)}
        />
      </SectionCard>

      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />
    </>
  );
}
