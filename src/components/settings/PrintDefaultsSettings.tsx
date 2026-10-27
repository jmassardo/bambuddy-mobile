import React from 'react';
import { SectionCard } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { OptionChipsField, SwitchRow } from './shared';
import { calibrationMode } from './workflowSettings';
import type { SettingsScreenController } from './useSettingsScreenController';

export function PrintDefaultsSettings({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { t } = useTranslation();
  const { draft } = controller.state;
  const set = (key: string, value: unknown) =>
    controller.actions.setDraft(current => ({ ...current, [key]: value }));
  return (
    <SectionCard
      title={t('workflow.printDefaults', {
        defaultValue: 'Default print options',
      })}
      subtitle={t('workflow.printDefaultsHelp', {
        defaultValue:
          'Auto delegates calibration to the printer. Defaults apply to new prints.',
      })}
    >
      {[
        ['default_bed_levelling', 'Bed leveling'],
        ['default_flow_cali', 'Flow calibration'],
        ['default_nozzle_offset_cali', 'Nozzle offset calibration'],
      ].map(([key, label]) => (
        <OptionChipsField
          key={key}
          label={t(`workflow.${key}`, { defaultValue: label })}
          value={calibrationMode(draft[key])}
          options={['auto', 'on', 'off'].map(mode => ({
            key: mode,
            label: t(`common.${mode}`, { defaultValue: mode }),
          }))}
          onChange={value => set(key, value)}
        />
      ))}
      {[
        ['default_vibration_cali', 'Vibration calibration'],
        ['default_layer_inspect', 'First layer inspection'],
        ['default_timelapse', 'Timelapse'],
        ['default_confirm_outcome', 'Ask for print outcome'],
        ['confirm_outcome_external_prints', 'Ask for external-print outcomes'],
        [
          'confirm_default_good_on_plate_clear',
          'Default to good when plate is cleared',
        ],
      ].map(([key, label]) => (
        <SwitchRow
          key={key}
          label={t(`workflow.${key}`, { defaultValue: label })}
          value={draft[key] === true}
          onValueChange={value => set(key, value)}
        />
      ))}
    </SectionCard>
  );
}
