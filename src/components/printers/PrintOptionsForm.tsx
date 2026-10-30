import { nativeLabelTuple, translateNative, useNativeLocale } from '@/i18n';

import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

import type { PrintQueueItemUpdate } from '@/types/api';
import { calibration } from '@/utils/printLaunch';

export function LaunchText({ children }: { children: string }) {
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <Text style={[styles.text, { color: colors.text }]}>
      {children}
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
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <LaunchText>{label}</LaunchText>
      <View style={styles.choices}>
        {options.map(option => (
          <Pressable
            key={String(option.value)}
            accessibilityLabel={option.label}
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
              {option.label}
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
  useNativeLocale();
  const { colors } = useTheme();
  const text = label;
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
  nativeLabelTuple(['vibration_cali', 'Vibration calibration']),
  nativeLabelTuple(['layer_inspect', 'Layer inspection']),
  nativeLabelTuple(['timelapse', 'Timelapse']),
  nativeLabelTuple(['use_ams', 'Use AMS']),
  nativeLabelTuple(['confirm_outcome', 'Confirm print outcome']),
  nativeLabelTuple(['manual_start', 'Manual staged start']),
  nativeLabelTuple(['require_previous_success', 'Require previous success']),
  nativeLabelTuple(['auto_off_after', 'Power off after print']),
  nativeLabelTuple(['gcode_injection', 'Configured G-code injection']),
] as const;

export function PrintOptionsForm({
  value,
  onChange,
  bulk = false,
  dualNozzle = true,
  injectionAllowed = true,
  canControl = true,
  showManualStart = true,
  compact = false,
}: {
  value: PrintQueueItemUpdate;
  onChange: (value: PrintQueueItemUpdate) => void;
  bulk?: boolean;
  dualNozzle?: boolean;
  injectionAllowed?: boolean;
  canControl?: boolean;
  showManualStart?: boolean;
  compact?: boolean;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  if (compact) {
    return (
      <View>
        {booleanPrintFields
          .filter(([field]) => field === 'use_ams' || field === 'timelapse')
          .map(([field, label]) => (
            <View key={field} style={styles.compactOption}>
              <LaunchText>{label}</LaunchText>
              <Switch
                accessibilityLabel={label}
                value={value[field] === true}
                trackColor={{ true: colors.accent }}
                onValueChange={enabled => onChange({ ...value, [field]: enabled })}
              />
            </View>
          ))}
      </View>
    );
  }
  const unchanged = { value: undefined, get label() { return translateNative('native.6ae0647a123bb8da'); } };
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
              ? translateNative('native.acadc13811ea61ed')
              : field === 'flow_cali'
              ? translateNative('native.3239adfa64fdf6ac')
              : translateNative('native.517652a6c6a4a8f2')
          }
          value={
            bulk && value[field] === undefined
              ? undefined
              : calibration(value[field])
          }
          options={[
            ...(bulk ? [unchanged] : []),
            { value: 'off', get label() { return translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' }); } },
            { value: 'on', get label() { return translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }); } },
            { value: 'auto', get label() { return translateNative('native.18782f1449ef93d2'); } },
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
              { value: false, get label() { return translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' }); } },
              {
                value: true,
                get label() { return translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }); },
                disabled: field === 'auto_off_after' && !canControl,
              },
            ]}
            onChange={v => onChange({ ...value, [field]: v })}
          />
        ))}
      <Choice<string | undefined>
        label={translateNative('native.f82f874bf6cf7ade')}
        value={value.preheat_override ?? (bulk ? undefined : 'inherit')}
        options={[
          ...(bulk ? [unchanged] : []),
          { value: 'inherit', get label() { return translateNative('native.1f78470798ded965'); } },
          { value: 'on', get label() { return translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }); } },
          { value: 'off', get label() { return translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' }); } },
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
            label={translateNative('native.f239535212faf277')}
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
              label={translateNative('native.75dc9f12bdfd564d')}
              value={
                value.preheat_chamber_target_override === undefined
                  ? 'unchanged'
                  : 'set'
              }
              options={[
                { value: 'unchanged', get label() { return translateNative('native.6ae0647a123bb8da'); } },
                { value: 'set', get label() { return translateNative('native.f74fdfc3a9cf877c'); } },
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
  compactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: spacing.sm,
  },
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
