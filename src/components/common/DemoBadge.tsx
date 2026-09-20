import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

export function DemoBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { colors } = useTheme();
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: `${colors.warning}22`,
          borderColor: `${colors.warning}55`,
          paddingHorizontal: isSm ? spacing.xs : spacing.sm,
          paddingVertical: isSm ? 2 : spacing.xs,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: colors.warning,
            fontSize: isSm ? fontSize.xs : fontSize.xs,
          },
        ]}
      >
        DEMO
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  text: {
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
