import { translateNative, useNativeLocale } from '@/i18n';

import React from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Chip } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { SmartPlug } from '@/types/api';
import type { OptionItem } from './types';
import { SettingsSearchAnchor } from './SettingsSearchFocus';

export function SimpleModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[settingsStyles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[settingsStyles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={settingsStyles.modalHeader}>
            <View style={settingsStyles.modalHeaderText}>
              <Text style={[settingsStyles.modalTitle, { color: colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[settingsStyles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={settingsStyles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function OptionChipsField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<OptionItem<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <SettingsSearchAnchor label={label}>
    <View style={settingsStyles.fieldGroup}>
      <Text style={[settingsStyles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={settingsStyles.chipWrap}>
        {options.map(option => (
          <View key={option.key} style={{ opacity: disabled ? 0.5 : 1 }}>
            <Chip label={option.label} selected={option.key === value} onPress={() => !disabled && onChange(option.key)} />
          </View>
        ))}
      </View>
    </View>
    </SettingsSearchAnchor>
  );
}

export function SwitchRow({
  label,
  value,
  onValueChange,
  description,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <SettingsSearchAnchor label={label}>
    <View style={settingsStyles.switchRowCard}>
      <View style={settingsStyles.switchTextWrap}>
        <Text style={[settingsStyles.switchLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[settingsStyles.switchDescription, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
        thumbColor={colors.text}
        disabled={disabled}
      />
    </View>
    </SettingsSearchAnchor>
  );
}

export function stringifyNumberField(value: unknown, fallback = '0') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

export function describePlugConnection(plug: SmartPlug) {
  switch (plug.plug_type) {
    case 'tasmota':
      return plug.ip_address || translateNative('native.6ecf4bd83b441b87');
    case 'homeassistant':
      return plug.ha_entity_id || translateNative('native.de6ad8bb5f78d4a4');
    case 'mqtt':
      return plug.mqtt_power_topic || plug.mqtt_topic || translateNative('native.ed3cc6e24995c2ba');
    case 'rest':
      return plug.rest_on_url || plug.rest_off_url || translateNative('native.e9e7a1f9010a5172');
    default:
      return translateNative('native.294a53fb56d648ba');
  }
}

export const settingsStyles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: { gap: spacing.xs },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryLabel: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  itemText: { flex: 1, gap: spacing.xs },
  itemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  itemMeta: {
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  twoColumnGrid: {
    gap: spacing.md,
  },
  twoColumnCell: {
    flex: 1,
  },
  switchRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  switchTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  switchDescription: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  plugSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing['4xl'],
  },
  modalCard: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  closeButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  qrImage: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    borderRadius: borderRadius.lg,
  },
  codeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  codeCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  codeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
});
