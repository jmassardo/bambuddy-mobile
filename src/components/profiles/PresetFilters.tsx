import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import {
  EMPTY_PRESET_FILTERS,
  presetMetadata,
  type PresetFilters as Filters,
} from '@/utils/profilePresets';

export function PresetFilters({
  rows,
  value,
  onChange,
}: {
  rows: Record<string, unknown>[];
  value: Filters;
  onChange: (value: Filters) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.body}>
      <TextField
        label={t('profiles.search', { defaultValue: 'Search profiles' })}
        value={value.search}
        onChangeText={search => onChange({ ...value, search })}
      />
      {(
        ['type', 'owner', 'printer', 'nozzle', 'filament', 'layer'] as const
      ).map(key => {
        const options = [
          ...new Set(rows.map(row => presetMetadata(row)[key]).filter(Boolean)),
        ].sort();
        if (!options.length) return null;
        return (
          <View key={key}>
            <Text style={{ color: colors.textSecondary }}>
              {t(`profiles.filter.${key}`, { defaultValue: key })}
            </Text>
            <ScrollView horizontal contentContainerStyle={styles.options}>
              <PrimaryButton
                label={t('common.all', { defaultValue: 'All' })}
                variant={!value[key] ? 'primary' : 'secondary'}
                onPress={() => onChange({ ...value, [key]: '' })}
              />
              {options.map(option => (
                <PrimaryButton
                  key={option}
                  label={option}
                  variant={value[key] === option ? 'primary' : 'secondary'}
                  onPress={() => onChange({ ...value, [key]: option })}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}
      <PrimaryButton
        label={t('profiles.clearFilters', { defaultValue: 'Clear filters' })}
        variant="secondary"
        onPress={() => onChange({ ...EMPTY_PRESET_FILTERS })}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  options: { gap: spacing.xs },
});
