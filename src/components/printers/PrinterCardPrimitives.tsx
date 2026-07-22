import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import type { NozzleRackSlot } from '@/types/api';
import {
  getFillColor,
  isLightColor,
  parseFilamentColor,
} from '@/components/printers/PrinterCard.helpers';
import { styles } from '@/components/printers/PrinterCard.styles';

export function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}
    >
      <View style={styles.metricHeader}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View
          style={[
            styles.metricDot,
            { backgroundColor: tone ?? colors.textTertiary },
          ]}
        />
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      {helper ? (
        <Text style={[styles.metricHelper, { color: colors.textTertiary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

export function InfoPill({
  label,
  color,
  icon,
  onPress,
}: {
  label: string;
  color: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={[
        styles.infoPill,
        { backgroundColor: `${color}18`, borderColor: `${color}45` },
      ]}
    >
      {icon}
      <Text style={[styles.infoPillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

export function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>
      <View
        style={[styles.sectionDivider, { backgroundColor: colors.borderSubtle }]}
      />
    </View>
  );
}

export function TrayCard({
  label,
  subtitle,
  fill,
  colorHex,
  active,
  helper,
  onPress,
  compact,
}: {
  label: string;
  subtitle?: string;
  fill: number | null;
  colorHex: string | null | undefined;
  active: boolean;
  helper: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const color = parseFilamentColor(colorHex);
  const lightColor = isLightColor(colorHex);
  const textColor = color && lightColor ? colors.textInverse : colors.text;

  const content = (
    <View
      style={[
        styles.trayCard,
        compact && styles.trayCardCompact,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      <View style={styles.trayTopRow}>
        <View
          style={[
            styles.trayColorCircle,
            {
              backgroundColor: color ?? colors.surfaceHover,
              borderColor: color ?? colors.border,
            },
          ]}
        >
          <Text style={[styles.trayColorText, { color: textColor }]}>{helper}</Text>
        </View>
        {active ? (
          <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
        ) : null}
      </View>
      <Text style={[styles.trayLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.traySubtitle, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
      <View style={[styles.fillTrack, { backgroundColor: colors.surfaceHover }]}>
        <View
          style={[
            styles.fillBar,
            {
              width: `${fill ?? 0}%`,
              backgroundColor: getFillColor(fill, colors),
            },
          ]}
        />
      </View>
      <Text style={[styles.trayFillText, { color: colors.textSecondary }]}>
        {fill == null ? '—' : `${fill}% remaining`}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={styles.trayPressable}>
      {content}
    </Pressable>
  );
}

export function NozzleRackView({
  slots,
  activeNozzle,
}: {
  slots: NozzleRackSlot[];
  activeNozzle: number | null | undefined;
}) {
  const { colors } = useTheme();
  const rackSlots = useMemo(() => {
    const rackOnly = slots.filter(slot => slot.id >= 2);
    return Array.from({ length: 6 }, (_, index) => {
      const slotId = 16 + index;
      return (
        rackOnly.find(slot => slot.id === slotId) ?? {
          id: -index - 1,
          nozzle_type: '',
          nozzle_diameter: '',
          wear: null,
          stat: null,
          max_temp: 0,
          serial_number: '',
          filament_color: '',
          filament_id: '',
          filament_type: '',
        }
      );
    });
  }, [slots]);

  return (
    <View style={styles.rackRow}>
      {rackSlots.map((slot, index) => {
        const color = parseFilamentColor(slot.filament_color);
        const lightColor = isLightColor(slot.filament_color);
        const isEmpty = !slot.nozzle_diameter && !slot.nozzle_type;
        return (
          <View
            key={`${slot.id}-${index}`}
            style={[
              styles.rackSlot,
              {
                backgroundColor: color ?? colors.surfaceElevated,
                borderColor:
                  activeNozzle != null && slot.id === activeNozzle
                    ? colors.accent
                    : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.rackSlotText,
                {
                  color: color && lightColor ? colors.textInverse : colors.text,
                },
              ]}
            >
              {isEmpty ? '—' : slot.nozzle_diameter || '?'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function ControlButton({
  label,
  icon,
  trailingIcon,
  onPress,
  disabled,
  backgroundColor,
  borderColor,
  textColor,
  outline,
  iconOnly,
}: {
  label: string;
  icon: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  outline?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        iconOnly ? styles.controlIconButton : styles.controlButton,
        { backgroundColor, borderColor },
        outline && styles.controlButtonOutline,
        disabled && styles.disabledAction,
      ]}
      accessibilityLabel={label}
    >
      {icon}
      {!iconOnly ? (
        <Text style={[styles.controlButtonText, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {trailingIcon}
    </Pressable>
  );
}
