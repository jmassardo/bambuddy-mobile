import { useNativeLocale } from '@/i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

export function CameraMessage({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const { colors } = useTheme();
  return <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.text }]}>{children}</Text>;
}

export function CameraChoices<T extends string | number>({
  label, value, options, onChange, disabled, optionLabel = String,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  disabled?: boolean;
  optionLabel?: (option: T) => string;
}) {
  useNativeLocale();
  return (
    <View style={styles.group}>
      <CameraMessage>{label}</CameraMessage>
      <View style={styles.choices}>
        {options.map(option => <Chip key={option} label={optionLabel(option)} selected={option === value} disabled={disabled} onPress={() => onChange(option)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  message: { marginVertical: spacing.xs },
});
