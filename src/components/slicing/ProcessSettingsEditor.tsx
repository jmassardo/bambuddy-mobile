import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { Box, Choice, Copy, Toggle } from './Controls';
import schemaData from '@/data/slicer/process-schema.json';
import tree from '@/data/slicer/process-ui-tree.json';
import toggleData from '@/data/slicer/process-toggle-rules.json';
import type {
  ProcessOption,
  ProcessSchema,
  SettingValue,
} from '@/types/slicerSettings';
import type { DesignOverride } from '@/api/slicing';
import { disabledKeys, type ToggleRules } from '@/utils/slicerToggle';
import {
  baselineForDisplay,
  displaySidetext,
  isModified,
  numericBound,
  serializeOverrides,
} from '@/utils/slicerSettings';
import { useTranslation } from '@/i18n';

export const processSchema = Object.fromEntries(
  Object.entries(schemaData).map(([key, option]) => [
    key,
    { ...option, label: 'label' in option ? option.label : key },
  ]),
) as ProcessSchema;
const ranks: Record<string, number> = {
  simple: 0,
  advanced: 1,
  expert: 2,
  develop: 3,
};
const slotKeys = new Set([
  'support_filament',
  'support_interface_filament',
  'outer_wall_filament_id',
  'inner_wall_filament_id',
  'top_surface_filament_id',
  'bottom_surface_filament_id',
  'internal_solid_filament_id',
  'sparse_infill_filament_id',
]);

export function validateSetting(
  option: ProcessOption,
  raw: string,
): string | null {
  if (
    !raw.trim() ||
    option.type === 'coString' ||
    option.type === 'coEnum' ||
    option.type === 'coBool'
  )
    return null;
  const parts = ['coFloats', 'coFloatsOrPercents', 'coBools'].includes(
    option.type,
  )
    ? raw.split(',')
    : [raw];
  for (const part of parts) {
    const text = part.trim();
    if (option.type === 'coBools') {
      if (!['0', '1', 'true', 'false'].includes(text))
        return 'Use 0 or 1 for each filament.';
      continue;
    }
    if (
      text.endsWith('%') &&
      !['coPercent', 'coFloatOrPercent', 'coFloatsOrPercents'].includes(
        option.type,
      )
    )
      return 'Percent is not allowed.';
    const number = Number(text.replace(/%$/, ''));
    if (!text || !Number.isFinite(number)) return 'Enter a finite number.';
    if (
      option.type === 'coInt' &&
      (!Number.isInteger(number) || !/^[+-]?\d+$/.test(text))
    )
      return 'Enter a whole number.';
    const min = numericBound(option.min);
    const max = numericBound(option.max);
    if (min !== undefined && number < min) return `Minimum ${min}`;
    if (max !== undefined && number > max) return `Maximum ${max}`;
  }
  return null;
}

export function serializeIntentional(
  values: Record<string, SettingValue>,
  preset: Record<string, SettingValue>,
  source: DesignOverride[] = [],
  sourceKeys: readonly string[] = [],
) {
  // The server applies adopted designer settings before the user's edits.
  const baseline = {
    ...preset,
    ...Object.fromEntries(
      source
        .filter(value => sourceKeys.includes(value.key))
        .map(value => [value.key, value.value]),
    ),
  };
  return serializeOverrides(
    Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) =>
          processSchema[key] &&
          isModified(processSchema[key], value, baseline[key]) &&
          !validateSetting(processSchema[key], String(value)),
      ),
    ),
    processSchema,
  );
}

export function ProcessSettingsEditor({
  values,
  onChange,
  presetValues = {},
  resolved = true,
  reason,
  source = [],
  sourceKeys,
  onSourceKeys,
  disabled = false,
  filamentChoices = [],
  onValidityChange,
}: {
  values: Record<string, SettingValue>;
  onChange: (v: Record<string, SettingValue>) => void;
  presetValues?: Record<string, SettingValue>;
  resolved?: boolean;
  reason?: string;
  source?: DesignOverride[];
  sourceKeys: string[];
  onSourceKeys: (keys: string[]) => void;
  disabled?: boolean;
  filamentChoices?: { label: string; value: string }[];
  onValidityChange?: (valid: boolean) => void;
}) {
  const { t } = useTranslation();
  const text = (s: string) => t(`processEditor.${s}`, { defaultValue: s });
  const [mode, setMode] = useState('simple');
  const [page, setPage] = useState(tree[0].page);
  const [search, setSearch] = useState('');
  const effective = useMemo(
    () => ({
      ...presetValues,
      ...Object.fromEntries(
        source
          .filter(s => sourceKeys.includes(s.key))
          .map(s => [s.key, s.value]),
      ),
      ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')),
    }),
    [presetValues, source, sourceKeys, values],
  );
  const off = disabledKeys(effective, processSchema, toggleData as ToggleRules);
  const set = (key: string, value: SettingValue | undefined) => {
    const next = { ...values };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
    onValidityChange?.(
      !Object.entries(next).some(([k, v]) =>
        validateSetting(processSchema[k], String(v)),
      ),
    );
  };
  const toggleSource = (key: string, on: boolean) =>
    onSourceKeys(
      on
        ? [...new Set([...sourceKeys, key])]
        : sourceKeys.filter(k => k !== key),
    );
  const query = search.toLowerCase().trim();
  return (
    <Box>
      {!resolved && (
        <Copy>
          {t('processEditor.valuesUnavailable', {
            defaultValue:
              'Preset values unavailable ({{reason}}). Schema defaults are indicative. Update/check your sidecar.',
            reason: reason ?? text('loading'),
          })}
        </Copy>
      )}
      <Choice
        label={text('Mode')}
        value={mode}
        onChange={setMode}
        options={['simple', 'advanced', 'expert'].map(v => ({
          value: v,
          label: text(v),
        }))}
      />
      <TextField
        label={text('Search every process setting')}
        value={search}
        onChangeText={setSearch}
      />
      <Choice
        label={text('Page')}
        value={page}
        onChange={setPage}
        options={tree.map(p => ({ value: p.page, label: text(p.page) }))}
      />
      <PrimaryButton
        label={text('Reset all edits')}
        variant="secondary"
        disabled={disabled}
        onPress={() => {
          onChange({});
          onValidityChange?.(true);
        }}
      />
      {source.length > 0 && (
        <>
          <Copy>
            {t('processEditor.designerCount', {
              defaultValue:
                '{{count}} designer settings selected. Machine-coupled / preset-defining settings require individual adoption.',
              count: sourceKeys.length,
            })}
          </Copy>
          <PrimaryButton
            label={text('Use designer settings')}
            disabled={disabled}
            onPress={() =>
              onSourceKeys([
                ...new Set([
                  ...sourceKeys,
                  ...source
                    .filter(s => !s.printer_coupled && !s.preset_defining)
                    .map(s => s.key),
                ]),
              ])
            }
          />
          <PrimaryButton
            label={text('Clear all source settings')}
            variant="secondary"
            disabled={disabled}
            onPress={() => onSourceKeys([])}
          />
        </>
      )}
      {tree
        .filter(p => query || p.page === page)
        .map(p => (
          <View key={p.page}>
            {p.groups.map(g => {
              const keys = g.options.filter(key => {
                const option = processSchema[key];
                return (
                  option &&
                  (query
                    ? `${key} ${option.label} ${option.tooltip ?? ''}`
                        .toLowerCase()
                        .includes(query)
                    : ranks[option.mode] <= ranks[mode])
                );
              });
              if (!keys.length) return null;
              return (
                <Box key={g.group}>
                  <Copy>{`${p.page} / ${g.group}`}</Copy>
                  {keys.map(key => {
                    const option = processSchema[key];
                    const sourceValue = source.find(s => s.key === key);
                    const current = baselineForDisplay(
                      option,
                      values[key] ?? effective[key],
                    );
                    const error =
                      values[key] === undefined
                        ? null
                        : validateSetting(option, String(values[key]));
                    const locked = disabled || off.has(key);
                    return (
                      <Box key={key}>
                        <Copy>{`${option.label}${
                          displaySidetext(option)
                            ? ` (${displaySidetext(option)})`
                            : ''
                        }`}</Copy>
                        {!!option.tooltip && <Copy>{option.tooltip}</Copy>}
                        <Copy>{`${key} · ${text(
                          'preset',
                        )}: ${baselineForDisplay(option, presetValues[key])}${
                          off.has(key)
                            ? ` · ${text('disabled by dependencies')}`
                            : ''
                        }`}</Copy>
                        {slotKeys.has(key) && filamentChoices.length ? (
                          <Choice
                            label={option.label}
                            value={current}
                            disabled={locked}
                            onChange={v => set(key, v)}
                            options={[
                              {
                                value: '0',
                                label: text('Default/current filament'),
                              },
                              ...filamentChoices,
                            ]}
                          />
                        ) : option.type === 'coBools' ? (
                          <View>
                            {current.split(',').map((part, index) => (
                              <Toggle
                                key={index}
                                label={`${option.label} ${index + 1}`}
                                value={
                                  part.trim() === '1' || part.trim() === 'true'
                                }
                                disabled={locked}
                                onChange={value =>
                                  set(
                                    key,
                                    current
                                      .split(',')
                                      .map((entry, i) =>
                                        i === index
                                          ? value
                                            ? '1'
                                            : '0'
                                          : entry.trim() === '1' ||
                                            entry.trim() === 'true'
                                          ? '1'
                                          : '0',
                                      ),
                                  )
                                }
                              />
                            ))}
                          </View>
                        ) : option.type === 'coBool' ? (
                          <Toggle
                            label={option.label}
                            value={current === '1' || current === 'true'}
                            disabled={locked}
                            onChange={v => set(key, v)}
                          />
                        ) : option.type === 'coEnum' ? (
                          <Choice
                            label={option.label}
                            value={current}
                            disabled={locked}
                            onChange={v => set(key, v)}
                            options={(option.enum_values ?? []).map((v, i) => ({
                              value: v,
                              label: option.enum_labels?.[i] ?? v,
                            }))}
                          />
                        ) : (
                          <TextField
                            label={option.label}
                            accessibilityLabel={key}
                            value={current}
                            editable={!locked}
                            onChangeText={v => set(key, v)}
                            autoCapitalize="none"
                          />
                        )}
                        {error && <Copy>{text(error)}</Copy>}
                        {sourceValue && (
                          <>
                            <Copy>{`${text('Source')}: ${String(
                              sourceValue.value,
                            )}${
                              sourceValue.printer_coupled
                                ? ` (${text('machine coupled')})`
                                : ''
                            }${
                              sourceValue.preset_defining
                                ? ` (${text('defines preset')})`
                                : ''
                            }`}</Copy>
                            <Toggle
                              label={`${text('Use source value')}: ${
                                option.label
                              }`}
                              disabled={disabled}
                              value={sourceKeys.includes(key)}
                              onChange={v => toggleSource(key, v)}
                            />
                          </>
                        )}
                        {values[key] !== undefined && (
                          <PrimaryButton
                            label={`${text('Reset')} ${option.label}`}
                            variant="secondary"
                            disabled={disabled}
                            onPress={() => set(key, undefined)}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </View>
        ))}
      {source
        .filter(
          s =>
            !processSchema[s.key] &&
            (!query || s.key.toLowerCase().includes(query)),
        )
        .map(s => (
          <Box key={s.key}>
            <Copy>{`${s.key}: ${String(s.value)} (${text(
              'source-only setting',
            )})`}</Copy>
            <Toggle
              label={`${text('Use source value')}: ${s.key}`}
              disabled={disabled}
              value={sourceKeys.includes(s.key)}
              onChange={v => toggleSource(s.key, v)}
            />
          </Box>
        ))}
    </Box>
  );
}
