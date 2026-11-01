import { nativeLabelTuple, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { SectionCard } from '@/components/common/AppUI';

import { OptionChipsField, SwitchRow } from './shared';
import { calibrationMode } from './workflowSettings';
import type { SettingsScreenController } from './useSettingsScreenController';

export function PrintDefaultsSettings({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  useNativeLocale();
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
        nativeLabelTuple(['default_bed_levelling', 'native.77acd07a8117c795']),
        nativeLabelTuple(['default_flow_cali', 'native.3239adfa64fdf6ac']),
        nativeLabelTuple(['default_nozzle_offset_cali', 'native.f153940a40f78955']),
      ].map(([key, label]) => (
        <OptionChipsField
          key={key}
          label={t(`workflow.${key}`, { defaultValue: label })}
          value={calibrationMode(draft[key])}
          options={['auto', 'on', 'off'].map(mode => ({
            key: mode,
            get label() { return translateNative(`common.${mode}`, { defaultValue: mode }); },
          }))}
          onChange={value => set(key, value)}
        />
      ))}
      {[
        nativeLabelTuple(['default_vibration_cali', 'native.4ea7434fc0ab30c5']),
        nativeLabelTuple(['default_layer_inspect', 'native.f2e4298741d7f088']),
        nativeLabelTuple(['default_timelapse', 'Timelapse']),
        nativeLabelTuple(['default_confirm_outcome', 'native.67014258e5f246b2']),
        nativeLabelTuple(['confirm_outcome_external_prints', 'native.9bac187f2df196f2']),
        nativeLabelTuple([
          'confirm_default_good_on_plate_clear',
          'native.5896fd744a245dec',
        ]),
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
