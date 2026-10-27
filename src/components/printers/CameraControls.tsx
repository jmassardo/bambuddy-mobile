import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';

export function CameraMessage({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.text }]}>{children}</Text>;
}

export function CameraChoices<T extends string | number>({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <CameraMessage>{label}</CameraMessage>
      <View style={styles.choices}>
        {options.map(option => <PrimaryButton key={option} label={`${option === value ? '✓ ' : ''}${t(`camera.choice.${option}`, { defaultValue: String(option) })}`} variant="secondary" disabled={disabled} onPress={() => onChange(option)} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  message: { marginVertical: spacing.xs },
});
