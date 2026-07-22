import React from 'react';
import { Text, View } from 'react-native';
import { SectionCard, InlineTabBar, TextField } from '@/components/common/AppUI';
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  NOTIFICATION_LANGUAGE_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from './constants';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function GeneralSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;

  return (
    <>
      <SectionCard title="Appearance & locale" subtitle="Language, date, time, and theme preferences.">
        <InlineTabBar
          value={controller.mode}
          tabs={[
            { key: 'dark', label: 'Dark' },
            { key: 'light', label: 'Light' },
            { key: 'system', label: 'System' },
          ]}
          onChange={value => controller.setMode(value as typeof controller.mode)}
        />
        <OptionChipsField
          label="Language"
          value={String(draft.language ?? 'en')}
          options={LANGUAGE_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, language: value }))}
        />
        <OptionChipsField
          label="Notification language"
          value={String(draft.notification_language ?? 'en')}
          options={NOTIFICATION_LANGUAGE_OPTIONS}
          onChange={value => setDraft(current => ({ ...current, notification_language: value }))}
        />
        <View style={settingsStyles.twoColumnGrid}>
          <View style={settingsStyles.twoColumnCell}>
            <OptionChipsField
              label="Date format"
              value={String(draft.date_format ?? 'system')}
              options={DATE_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, date_format: value }))}
            />
          </View>
          <View style={settingsStyles.twoColumnCell}>
            <OptionChipsField
              label="Time format"
              value={String(draft.time_format ?? 'system')}
              options={TIME_FORMAT_OPTIONS}
              onChange={value => setDraft(current => ({ ...current, time_format: value }))}
            />
          </View>
        </View>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Temperatures are currently stored and reported by the server in Celsius.</Text>
      </SectionCard>

      <SectionCard title="Archiving & capture" subtitle="Archive behavior, thumbnails, finish photos, and timelapse defaults.">
        <SwitchRow
          label="Auto archive"
          description="Automatically archive finished prints."
          value={Boolean(draft.auto_archive)}
          onValueChange={value => setDraft(current => ({ ...current, auto_archive: value }))}
        />
        <SwitchRow
          label="Save thumbnails"
          description="Extract preview images from uploaded print files."
          value={Boolean(draft.save_thumbnails)}
          onValueChange={value => setDraft(current => ({ ...current, save_thumbnails: value }))}
        />
        <SwitchRow
          label="Capture finish photo"
          description="Keep the final print image when a job completes."
          value={Boolean(draft.capture_finish_photo)}
          onValueChange={value => setDraft(current => ({ ...current, capture_finish_photo: value }))}
        />
      </SectionCard>

      <SectionCard title="Default print options" subtitle="Applied when starting new prints from the app.">
        <SwitchRow label="Bed leveling" description="Auto-level bed before starting the print." value={Boolean(draft.default_bed_levelling ?? true)} onValueChange={value => setDraft(current => ({ ...current, default_bed_levelling: value }))} />
        <SwitchRow label="Flow calibration" description="Run extrusion flow calibration." value={Boolean(draft.default_flow_cali)} onValueChange={value => setDraft(current => ({ ...current, default_flow_cali: value }))} />
        <SwitchRow label="Vibration calibration" description="Reduce ringing before the print starts." value={Boolean(draft.default_vibration_cali ?? true)} onValueChange={value => setDraft(current => ({ ...current, default_vibration_cali: value }))} />
        <SwitchRow label="First layer inspection" description="Enable AI first-layer checks by default." value={Boolean(draft.default_layer_inspect)} onValueChange={value => setDraft(current => ({ ...current, default_layer_inspect: value }))} />
        <SwitchRow label="Timelapse" description="Record timelapse video for new prints by default." value={Boolean(draft.default_timelapse)} onValueChange={value => setDraft(current => ({ ...current, default_timelapse: value }))} />
        <SwitchRow label="Nozzle offset calibration" description="Useful on dual-nozzle printers." value={Boolean(draft.default_nozzle_offset_cali ?? true)} onValueChange={value => setDraft(current => ({ ...current, default_nozzle_offset_cali: value }))} />
      </SectionCard>

      <SectionCard title="Electricity pricing & updates" subtitle="Cost tracking defaults and version checks.">
        <OptionChipsField
          label="Currency"
          value={String(draft.currency ?? 'USD')}
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
        <SwitchRow label="Check for updates" description="Automatically look for Bambuddy updates." value={Boolean(draft.check_updates ?? true)} onValueChange={value => setDraft(current => ({ ...current, check_updates: value }))} />
        <SwitchRow label="Check printer firmware" description="Include printer firmware updates in the check flow." value={Boolean(draft.check_printer_firmware ?? true)} onValueChange={value => setDraft(current => ({ ...current, check_printer_firmware: value }))} />
        <SwitchRow label="Include beta updates" description="Receive prerelease update notifications." value={Boolean(draft.include_beta_updates)} onValueChange={value => setDraft(current => ({ ...current, include_beta_updates: value }))} disabled={!Boolean(draft.check_updates ?? true)} />
      </SectionCard>
    </>
  );
}
