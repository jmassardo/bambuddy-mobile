import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { Badge, ProgressBar } from '../common/UIComponents';
import { formatDate } from '../../utils/formatters';

interface QueueItemCardProps {
  item: Record<string, unknown>;
  onPress?: () => void;
}

export function QueueItemCard({ item, onPress }: QueueItemCardProps) {
  const { colors } = useTheme();

  const name = (item.filename as string) || (item.name as string) || 'Untitled';
  const status = (item.status as string) || 'pending';
  const printerName = item.printer_name as string;
  const position = item.position as number;
  const progress = item.progress as number;
  const createdAt = item.created_at as string;
  const scheduledAt = item.scheduled_at as string;
  const userName = item.user_name as string;

  const statusColorMap: Record<string, string> = {
    pending: colors.textTertiary,
    queued: colors.warning,
    waiting: colors.warning,
    uploading: colors.info,
    printing: colors.statusPrinting,
    in_progress: colors.statusPrinting,
    completed: colors.success,
    failed: colors.error,
    cancelled: colors.error,
    skipped: colors.textTertiary,
  };

  const statusColor = statusColorMap[status] || colors.textTertiary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.nameContainer}>
          {position && (
            <Text style={[styles.position, { color: colors.textTertiary }]}>#{position}</Text>
          )}
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name.replace(/\.gcode\.3mf$|\.3mf$/i, '')}
          </Text>
        </View>
        <Badge
          label={status.replace(/_/g, ' ')}
          color={statusColor}
          backgroundColor={`${statusColor}20`}
        />
      </View>

      {(status === 'printing' || status === 'in_progress' || status === 'uploading') && progress != null && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={progress} color={statusColor} />
          <Text style={[styles.progressText, { color: statusColor }]}>
            {Math.round(progress)}%
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {printerName && (
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              🖨️ {printerName}
            </Text>
          )}
          {userName && (
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              👤 {userName}
            </Text>
          )}
        </View>
        <Text style={[styles.footerText, { color: colors.textTertiary }]}>
          {scheduledAt ? `📅 ${formatDate(scheduledAt)}` : createdAt ? formatDate(createdAt) : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  position: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginRight: spacing.sm,
    minWidth: 24,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    minWidth: 36,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerText: {
    fontSize: fontSize.xs,
  },
});
