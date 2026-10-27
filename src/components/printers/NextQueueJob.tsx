import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import type { PrintQueueItem } from '@/types/api';
import { spacing } from '@/theme/tokens';

export function NextQueueJob({
  item,
  additionalCount,
  onPress,
}: {
  item: PrintQueueItem;
  additionalCount: number;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const variants = (
    item as PrintQueueItem & { variants?: { filename: string }[] }
  ).variants;
  const name =
    item.archive_name ||
    item.library_file_name ||
    variants?.[0]?.filename ||
    t('fleet.fileId', {
      defaultValue: 'File #{{id}}',
      id: item.archive_id ?? item.library_file_id ?? item.id,
    });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={styles.widget}
    >
      <Text numberOfLines={1} style={{ color: colors.text }}>
        {t('fleet.nextJob', { defaultValue: 'Next: {{name}}', name })}
      </Text>
      <Text style={{ color: colors.textSecondary }}>
        {item.scheduled_time
          ? new Date(item.scheduled_time).toLocaleString()
          : t('fleet.waiting', { defaultValue: 'Waiting' })}
        {` · ${
          item.printer_id != null
            ? t('fleet.assigned', { defaultValue: 'Assigned' })
            : t('fleet.compatible', { defaultValue: 'Compatible pool' })
        }`}
        {additionalCount > 0 ? ` · +${additionalCount}` : ''}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  widget: { padding: spacing.md, gap: spacing.xs },
});
