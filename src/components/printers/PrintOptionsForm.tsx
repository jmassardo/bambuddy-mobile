import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';
import type { PrintQueueItemUpdate } from '@/types/api';
import { calibration } from '@/utils/printLaunch';

export function LaunchText({ children }: { children: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Text style={[styles.text, { color: colors.text }]}>
      {t(`printing.${children.replace(/\W/g, '')}`, { defaultValue: children })}
    </Text>
  );
}

export function Choice<T extends string | number | boolean | null | undefined>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <LaunchText>{label}</LaunchText>
      <View style={styles.choices}>
        {options.map(option => (
          <Pressable
            key={String(option.value)}
            accessibilityLabel={t(
              `printing.${option.label.replace(/\W/g, '')}`,
              {
                defaultValue: option.label,
              },
            )}
            accessibilityRole="button"
            accessibilityState={{
              selected: value === option.value,
              disabled: option.disabled,
            }}
            disabled={option.disabled}
            style={[
              styles.option,
              {
                borderColor:
                  value === option.value ? colors.accent : colors.border,
                backgroundColor:
                  value === option.value
                    ? colors.accentBg
                    : colors.surfaceElevated,
              },
              option.disabled && styles.disabled,
            ]}
            onPress={option.disabled ? undefined : () => onChange(option.value)}
          >
            <Text
              style={{
                color:
                  value === option.value
                    ? colors.accentLight
                    : colors.textSecondary,
              }}
            >
              {t(`printing.${option.label.replace(/\W/g, '')}`, {
                defaultValue: option.label,
              })}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function LaunchField({
  label,
  value,
  onChange,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const text = t(`printing.${label.replace(/\W/g, '')}`, {
    defaultValue: label,
  });
  return (
    <View style={styles.field}>
      <LaunchText>{label}</LaunchText>
      <TextInput
        accessibilityLabel={text}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'numeric' : 'default'}
        autoCapitalize="none"
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border },
        ]}
      />
    </View>
  );
}

export const booleanPrintFields = [
  ['vibration_cali', 'Vibration calibration'],
  ['layer_inspect', 'Layer inspection'],
  ['timelapse', 'Timelapse'],
  ['use_ams', 'Use AMS'],
  ['confirm_outcome', 'Confirm print outcome'],
  ['manual_start', 'Manual staged start'],
  ['require_previous_success', 'Require previous success'],
  ['auto_off_after', 'Power off after print'],
  ['gcode_injection', 'Configured G-code injection'],
] as const;

export function PrintOptionsForm({
  value,
  onChange,
  bulk = false,
  dualNozzle = true,
  injectionAllowed = true,
  canControl = true,
  showManualStart = true,
}: {
  value: PrintQueueItemUpdate;
  onChange: (value: PrintQueueItemUpdate) => void;
  bulk?: boolean;
  dualNozzle?: boolean;
  injectionAllowed?: boolean;
  canControl?: boolean;
  showManualStart?: boolean;
}) {
  const unchanged = { value: undefined, label: 'Unchanged' };
  return (
    <View>
      {(
        [
          'bed_levelling',
          'flow_cali',
          ...(dualNozzle ? (['nozzle_offset_cali'] as const) : []),
        ] as const
      ).map(field => (
        <Choice<string | undefined>
          key={field}
          label={
            field === 'bed_levelling'
              ? 'Bed levelling'
              : field === 'flow_cali'
              ? 'Flow calibration'
              : 'Dual-nozzle offset calibration'
          }
          value={
            bulk && value[field] === undefined
              ? undefined
              : calibration(value[field])
          }
          options={[
            ...(bulk ? [unchanged] : []),
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
            { value: 'auto', label: 'Auto' },
          ]}
          onChange={v => onChange({ ...value, [field]: v })}
        />
      ))}
      {booleanPrintFields
        .filter(
          ([field]) =>
            (field !== 'gcode_injection' || injectionAllowed) &&
            (field !== 'manual_start' || showManualStart),
        )
        .map(([field, label]) => (
          <Choice<boolean | undefined>
            key={field}
            label={label}
            value={value[field]}
            options={[
              ...(bulk ? [unchanged] : []),
              { value: false, label: 'Off' },
              {
                value: true,
                label: 'On',
                disabled: field === 'auto_off_after' && !canControl,
              },
            ]}
            onChange={v => onChange({ ...value, [field]: v })}
          />
        ))}
      <Choice<string | undefined>
        label="Preheat / heat soak"
        value={value.preheat_override ?? (bulk ? undefined : 'inherit')}
        options={[
          ...(bulk ? [unchanged] : []),
          { value: 'inherit', label: 'Inherit' },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        onChange={v =>
          onChange({
            ...value,
            preheat_override: v as PrintQueueItemUpdate['preheat_override'],
            ...(v === 'off' ? { preheat_chamber_target_override: null } : {}),
          })
        }
      />
      {value.preheat_override !== 'off' && (
        <>
          <LaunchField
            label="Chamber target °C (blank: inherited / derived; 0: bed only)"
            value={
              value.preheat_chamber_target_override == null
                ? ''
                : String(value.preheat_chamber_target_override)
            }
            onChange={v =>
              onChange({
                ...value,
                preheat_chamber_target_override:
                  v.trim() === '' ? null : Number(v),
              })
            }
            numeric
          />
          {bulk && (
            <Choice
              label="Chamber target update"
              value={
                value.preheat_chamber_target_override === undefined
                  ? 'unchanged'
                  : 'set'
              }
              options={[
                { value: 'unchanged', label: 'Unchanged' },
                { value: 'set', label: 'Apply target / clear to inherited' },
              ]}
              onChange={v =>
                onChange({
                  ...value,
                  preheat_chamber_target_override:
                    v === 'unchanged'
                      ? undefined
                      : value.preheat_chamber_target_override ?? null,
                })
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 44,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  field: { gap: spacing.sm, marginVertical: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  text: { fontSize: 14, marginVertical: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 44,
    padding: spacing.sm,
  },
});
