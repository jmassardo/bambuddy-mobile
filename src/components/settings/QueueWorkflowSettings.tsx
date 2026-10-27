import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { printersApi } from '@/api/printers';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
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
        title={fieldLabel('quickPresets', 'Temperature and fan quick presets')}
        subtitle={fieldLabel(
          'quickPresetsHelp',
          'Three shortcuts per category, shared with printer controls. Off remains a separate shortcut.',
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
        title={fieldLabel('keepWarm', 'Preheat and keep bed warm')}
        subtitle={fieldLabel(
          'keepWarmHelp',
          'Keep-warm requires preheat and plate-clear confirmation, and only holds heat for chamber-heated materials. The print’s higher bed target takes precedence.',
        )}
      >
        <SwitchRow
          label={fieldLabel(
            'queue_keep_bed_warm',
            'Keep bed warm while awaiting plate clear',
          )}
          value={draft.queue_keep_bed_warm === true}
          disabled={!draft.preheat_enabled || !draft.require_plate_clear}
          onValueChange={value => set('queue_keep_bed_warm', value)}
        />
        <WorkflowNumberField
          label={fieldLabel(
            'queue_keep_warm_bed_temp',
            'Keep-warm bed target (°C)',
          )}
          value={Number(draft.queue_keep_warm_bed_temp ?? 90)}
          min={40}
          max={110}
          onChange={value => set('queue_keep_warm_bed_temp', value)}
        />
        <WorkflowNumberField
          label={fieldLabel(
            'queue_keep_warm_max_minutes',
            'Maximum keep-warm duration (minutes)',
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
            'Per-material chamber targets in °C. Zero skips the chamber phase, not bed heating or soak. The highest loaded-material target is used.',
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
          label={fieldLabel('resetTargets', 'Reset all preheat targets')}
          variant="secondary"
          onPress={() => set('preheat_filament_targets', '')}
        />
      </SectionCard>
      <SectionCard
        title={fieldLabel('drying', 'Automatic drying')}
        subtitle={fieldLabel(
          'dryingHelp',
          'Requires supported AMS hardware. Print drying also requires compatible printer firmware; the server reduces drying temperatures while printing.',
        )}
      >
        {[
          ['queue_drying_enabled', 'Dry filament between queued prints'],
          ['queue_drying_block', 'Block queue until drying completes'],
          [
            'ambient_drying_enabled',
            'Dry idle printers when humidity exceeds threshold',
          ],
          [
            'print_drying_enabled',
            'Allow drying while printing on supported printers',
          ],
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
          label={fieldLabel('sustainedTrigger', 'Ambient humidity trigger')}
          value={
            Number(draft.ambient_drying_sustained_minutes ?? 0) > 0
              ? 'sustained'
              : 'immediate'
          }
          options={[
            { key: 'immediate', label: fieldLabel('immediate', 'Immediate') },
            { key: 'sustained', label: fieldLabel('sustained', 'Sustained') },
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
              'Sustained humidity duration (minutes)',
            )}
            value={Number(draft.ambient_drying_sustained_minutes)}
            min={5}
            max={240}
            onChange={value => set('ambient_drying_sustained_minutes', value)}
          />
        ) : null}
      </SectionCard>
      <SectionCard
        title={fieldLabel('dryingPresets', 'Material drying presets')}
      >
        {Object.entries(drying).map(([material, preset]) => (
          <View key={material}>
            {(
              [
                ['n3f', 'AMS 2 Pro (N3F) °C', 30, 65],
                ['n3f_hours', 'AMS 2 Pro (N3F) hours', 1, 24],
                ['n3s', 'AMS HT (N3S) °C', 30, 85],
                ['n3s_hours', 'AMS HT (N3S) hours', 1, 24],
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
          label={fieldLabel('resetDrying', 'Reset drying presets')}
          variant="secondary"
          onPress={() => set('drying_presets', '')}
        />
      </SectionCard>
      <SectionCard
        title={fieldLabel('humidityTriggers', 'Drying humidity thresholds')}
        subtitle={fieldLabel(
          'humidityHelp',
          'Relative humidity 5–95%. Clear a material override to inherit Default; clear Default to inherit the AMS fair threshold. These triggers are shared with filament alarms.',
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
        title={fieldLabel('gcode', 'Per-model G-code snippets')}
        subtitle={fieldLabel(
          'gcodeHelp',
          'Inserted only when a queue item enables G-code injection. Review commands carefully before running a print.',
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
                'Unable to load configured printer models. Existing saved snippets remain editable.',
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
              'Add a printer to configure model-specific snippets.',
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
                  ? fieldLabel('configured', 'Configured')
                  : fieldLabel('notConfigured', 'Not configured')}
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
