import { nativeLabelTuple, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { printersApi } from '@/api/printers';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';

import { WorkflowNumberField } from './WorkflowFields';
import { OptionChipsField, SwitchRow, settingsStyles } from './shared';
import {
  DRYING_PRESETS,
  PREHEAT_TARGETS,
  QUICK_PRESETS,
  parseSettingObject,
  readPresetTriple,
  updateGcodeSnippet,
  type DryingPreset,
  type GcodeSnippet,
} from './workflowSettings';
import type { SettingsScreenController } from './useSettingsScreenController';

export function QueueWorkflowSettings({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { draft } = controller.state;
  const set = (key: string, value: unknown) =>
    controller.actions.setDraft(current => ({ ...current, [key]: value }));
  const savedPreheat = draft.preheat_filament_targets
    ? {
        default: 0,
        ...parseSettingObject<number>(draft.preheat_filament_targets),
      }
    : PREHEAT_TARGETS;
  const preheat = { ...PREHEAT_TARGETS, ...savedPreheat };
  const drying = {
    ...DRYING_PRESETS,
    ...parseSettingObject<DryingPreset>(draft.drying_presets),
  };
  const thresholds = parseSettingObject<number>(draft.ams_humidity_thresholds);
  const snippets = parseSettingObject<GcodeSnippet>(draft.gcode_snippets);
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.getPrinters,
  });
  const printers = printersQuery.data ?? [];
  const models = [
    ...new Set([
      ...printers.map(printer => String(printer.model ?? '')).filter(Boolean),
      ...Object.keys(snippets),
    ]),
  ].sort();
  const fieldLabel = (key: string, label: string) =>
    t(`workflow.${key}`, { defaultValue: label });
  return (
    <>
      <SectionCard
        title={fieldLabel('quickPresets', translateNative('native.6bccd9bd5dba98f5'))}
        subtitle={fieldLabel(
          'quickPresetsHelp',
          translateNative('native.ad9f041bddee69b4'),
        )}
      >
        {QUICK_PRESETS.map(category => {
          const values = readPresetTriple(
            draft[category.key],
            category.defaults,
          );
          return (
            <View key={category.key}>
              {values.map((value, index) => (
                <WorkflowNumberField
                  key={index}
                  label={t(`workflow.${category.key}`, {
                    defaultValue: '{{category}} preset {{index}}',
                    category: category.label,
                    index: index + 1,
                  })}
                  value={value}
                  min={0}
                  max={category.max}
                  onChange={next => {
                    const updated = [...values];
                    updated[index] = next;
                    set(category.key, JSON.stringify(updated));
                  }}
                />
              ))}
              <PrimaryButton
                label={t(`workflow.reset.${category.key}`, {
                  defaultValue: 'Reset {{category}}',
                  category: category.label,
                })}
                variant="secondary"
                onPress={() => set(category.key, '')}
              />
            </View>
          );
        })}
      </SectionCard>
      <SectionCard
        title={fieldLabel('keepWarm', translateNative('native.3b2afee7314d379c'))}
        subtitle={fieldLabel(
          'keepWarmHelp',
          translateNative('native.3ad35084ce4d65e1'),
        )}
      >
        <SwitchRow
          label={fieldLabel(
            'queue_keep_bed_warm',
            translateNative('native.4833e2dd435f6361'),
          )}
          value={draft.queue_keep_bed_warm === true}
          disabled={!draft.preheat_enabled || !draft.require_plate_clear}
          onValueChange={value => set('queue_keep_bed_warm', value)}
        />
        <WorkflowNumberField
          label={fieldLabel(
            'queue_keep_warm_bed_temp',
            translateNative('native.c85ba6a3fd16d526'),
          )}
          value={Number(draft.queue_keep_warm_bed_temp ?? 90)}
          min={40}
          max={110}
          onChange={value => set('queue_keep_warm_bed_temp', value)}
        />
        <WorkflowNumberField
          label={fieldLabel(
            'queue_keep_warm_max_minutes',
            translateNative('native.23a654493e1b9d7f'),
          )}
          value={Number(draft.queue_keep_warm_max_minutes ?? 120)}
          min={5}
          max={480}
          onChange={value => set('queue_keep_warm_max_minutes', value)}
        />
        <Text
          style={[
            settingsStyles.helper,
            { color: controller.colors.textSecondary },
          ]}
        >
          {fieldLabel(
            'preheatTargetsHelp',
            translateNative('native.7dcfd80dfed55e3e'),
          )}
        </Text>
        {Object.entries(preheat).map(([material, value]) => (
          <WorkflowNumberField
            key={material}
            label={t('workflow.materialTarget', {
              defaultValue: '{{material}} chamber target (°C)',
              material,
            })}
            value={value}
            min={0}
            max={65}
            onChange={next =>
              set(
                'preheat_filament_targets',
                JSON.stringify({ ...savedPreheat, [material]: next }),
              )
            }
          />
        ))}
        <PrimaryButton
          label={fieldLabel('resetTargets', translateNative('native.3d97fd767eafcbc1'))}
          variant="secondary"
          onPress={() => set('preheat_filament_targets', '')}
        />
      </SectionCard>
      <SectionCard
        title={fieldLabel('drying', translateNative('native.c6dcf1bb1b0f9487'))}
        subtitle={fieldLabel(
          'dryingHelp',
          translateNative('native.1d44e210d6efe9a7'),
        )}
      >
        {[
          nativeLabelTuple(['queue_drying_enabled', 'native.f1b83ddc16d3b74d']),
          nativeLabelTuple(['queue_drying_block', 'native.86b79e7d66cda22b']),
          nativeLabelTuple([
            'ambient_drying_enabled',
            'native.1d7ed1a4b01b8d14',
          ]),
          nativeLabelTuple([
            'print_drying_enabled',
            'native.eea7068a5b381fb7',
          ]),
        ].map(([key, label]) => (
          <SwitchRow
            key={key}
            label={fieldLabel(key, label)}
            value={draft[key] === true}
            disabled={
              key === 'queue_drying_block' && !draft.queue_drying_enabled
            }
            onValueChange={value => set(key, value)}
          />
        ))}
        <OptionChipsField
          label={fieldLabel('sustainedTrigger', translateNative('native.d1dd179c92982ba1'))}
          value={
            Number(draft.ambient_drying_sustained_minutes ?? 0) > 0
              ? 'sustained'
              : 'immediate'
          }
          options={[
            { key: 'immediate', label: fieldLabel('immediate', translateNative('native.1171787785ee928d')) },
            { key: 'sustained', label: fieldLabel('sustained', translateNative('native.5806186070f1c43e')) },
          ]}
          onChange={value =>
            set(
              'ambient_drying_sustained_minutes',
              value === 'immediate' ? 0 : 15,
            )
          }
        />
        {Number(draft.ambient_drying_sustained_minutes ?? 0) > 0 ? (
          <WorkflowNumberField
            label={fieldLabel(
              'sustainedMinutes',
              translateNative('native.e430354b064b4e9b'),
            )}
            value={Number(draft.ambient_drying_sustained_minutes)}
            min={5}
            max={240}
            onChange={value => set('ambient_drying_sustained_minutes', value)}
          />
        ) : null}
      </SectionCard>
      <SectionCard
        title={fieldLabel('dryingPresets', translateNative('native.9a12cdbd9e88c886'))}
      >
        {Object.entries(drying).map(([material, preset]) => (
          <View key={material}>
            {(
              [
                nativeLabelTuple(['n3f', 'AMS 2 Pro (N3F) °C', 30, 65]),
                nativeLabelTuple(['n3f_hours', 'AMS 2 Pro (N3F) hours', 1, 24]),
                nativeLabelTuple(['n3s', 'native.fdb6d3a9d6f7f5d9', 30, 85]),
                nativeLabelTuple(['n3s_hours', 'native.e1b1ffcaa07d29fd', 1, 24]),
              ] as const
            ).map(([key, label, min, max]) => (
              <WorkflowNumberField
                key={key}
                label={t(`workflow.drying.${key}`, {
                  defaultValue: '{{material}} {{device}}',
                  material,
                  device: label,
                })}
                value={preset[key]}
                min={min}
                max={max}
                onChange={value =>
                  set(
                    'drying_presets',
                    JSON.stringify({
                      ...drying,
                      [material]: { ...preset, [key]: value },
                    }),
                  )
                }
              />
            ))}
          </View>
        ))}
        <PrimaryButton
          label={fieldLabel('resetDrying', translateNative('native.3111fd5c0dd2998c'))}
          variant="secondary"
          onPress={() => set('drying_presets', '')}
        />
      </SectionCard>
      <SectionCard
        title={fieldLabel('humidityTriggers', translateNative('native.5021abddbb50d67b'))}
        subtitle={fieldLabel(
          'humidityHelp',
          translateNative('native.368bcdc6ca0dc5a0'),
        )}
      >
        {[
          ...new Set([
            'default',
            ...Object.keys(drying),
            ...Object.keys(thresholds),
          ]),
        ].map(material => {
          const value = Number(
            thresholds[material] ??
              thresholds.default ??
              draft.ams_humidity_fair ??
              60,
          );
          const update = (next?: number) => {
            const updated = { ...thresholds };
            if (next === undefined) delete updated[material];
            else updated[material] = next;
            set(
              'ams_humidity_thresholds',
              Object.keys(updated).length ? JSON.stringify(updated) : '',
            );
          };
          return (
            <View key={material}>
              <WorkflowNumberField
                label={t('workflow.humidityThreshold', {
                  defaultValue: '{{material}} humidity trigger (%)',
                  material,
                })}
                value={value}
                min={5}
                max={95}
                onChange={update}
                onClear={() => update()}
              />
              {thresholds[material] !== undefined ? (
                <PrimaryButton
                  label={t('workflow.inheritThreshold', {
                    defaultValue: '{{material}}: use inherited threshold',
                    material,
                  })}
                  variant="secondary"
                  onPress={() => update()}
                />
              ) : null}
            </View>
          );
        })}
      </SectionCard>
      <SectionCard
        title={fieldLabel('gcode', translateNative('native.44b0918f742e4f9b'))}
        subtitle={fieldLabel(
          'gcodeHelp',
          translateNative('native.05929c3ce30e345f'),
        )}
      >
        {printersQuery.isError ? (
          <>
            <Text
              style={[
                settingsStyles.helper,
                { color: controller.colors.error },
              ]}
            >
              {fieldLabel(
                'printerModelsUnavailable',
                translateNative('native.920528f62eb25dc4'),
              )}
            </Text>
            <PrimaryButton
              label={t('common.retry', { defaultValue: 'Retry' })}
              variant="secondary"
              onPress={() => void printersQuery.refetch()}
            />
          </>
        ) : null}
        {printersQuery.isLoading ? (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.textSecondary },
            ]}
          >
            {t('common.loading')}
          </Text>
        ) : null}
        {!models.length ? (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.textSecondary },
            ]}
          >
            {fieldLabel(
              'noModels',
              translateNative('native.2a004521d42c51f1'),
            )}
          </Text>
        ) : null}
        {models.map(model => {
          const snippet = snippets[model];
          return (
            <View key={model}>
              <Text
                style={[
                  settingsStyles.helper,
                  { color: controller.colors.text },
                ]}
              >
                {model} •{' '}
                {snippet?.start_gcode || snippet?.end_gcode
                  ? fieldLabel('configured', translateNative('native.77b12cea493c6ee5'))
                  : fieldLabel('notConfigured', translateNative('native.e26dc4caf4a4ad54'))}
              </Text>
              {(['start_gcode', 'end_gcode'] as const).map(field => (
                <TextField
                  key={field}
                  label={t(`workflow.${field}`, {
                    defaultValue: '{{model}} {{phase}} G-code',
                    model,
                    phase: field === 'start_gcode' ? 'start' : 'end',
                  })}
                  value={snippet?.[field] ?? ''}
                  multiline
                  scrollEnabled={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  onChangeText={value =>
                    controller.actions.setDraft(current => ({
                      ...current,
                      gcode_snippets: updateGcodeSnippet(
                        current.gcode_snippets,
                        model,
                        field,
                        value,
                      ),
                    }))
                  }
                />
              ))}
            </View>
          );
        })}
      </SectionCard>
    </>
  );
}
