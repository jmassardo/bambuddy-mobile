import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { formatPercent, pickNumber, pickString, statusColor, normalizeStatus, type ApiRecord } from '../../utils/data';
import { StatusBadge } from '../common/AppUI';
import { Icon } from '../common/TabBarIcon';

interface PrinterCardProps {
  printer: ApiRecord;
  status?: ApiRecord;
  loading?: boolean;
  onPress?: () => void;
  onCameraPress?: () => void;
}

export function PrinterCard({ printer, status, loading = false, onPress, onCameraPress }: PrinterCardProps) {
  const { colors } = useTheme();
  const name = pickString(printer, ['name', 'display_name'], 'Unnamed Printer');
  const model = pickString(printer, ['model', 'printer_model', 'type'], 'Unknown model');
  const location = pickString(printer, ['location', 'room_name', 'group_name'], 'Unassigned');
  const state = pickString(status, ['state', 'status', 'print_status', 'stage'], loading ? 'Loading…' : 'Unknown');
  const fileName = pickString(status, ['current_file', 'job.name', 'project_name', 'file_name'], 'No active file');
  const progressValue = pickNumber(status, ['progress', 'job.progress', 'percent_complete'], 0);
  const progress = progressValue > 1 ? progressValue : progressValue * 100;
  const nozzle = pickNumber(status, ['temperatures.nozzle.current', 'nozzle_temp', 'temp_nozzle'], 0);
  const bed = pickNumber(status, ['temperatures.bed.current', 'bed_temp', 'temp_bed'], 0);
  const badgeColor = statusColor(state, colors);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{model} • {location}</Text>
        </View>
        <View style={styles.headerActions}>
          <StatusBadge label={normalizeStatus(state)} color={badgeColor} />
          {onCameraPress ? (
            <Pressable onPress={onCameraPress} style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
              <Icon name="camera" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.progressSection}>
          <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{fileName}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
            <View style={[styles.progressFill, { backgroundColor: badgeColor, width: `${Math.max(0, Math.min(progress, 100))}%` }]} />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{formatPercent(progress)}</Text>
        </View>

        <View style={styles.statsColumn}>
          <View style={styles.statRow}>
            <Icon name="thermometer" size={16} color={colors.warning} />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>{nozzle.toFixed(0)}° / {bed.toFixed(0)}°</Text>
          </View>
          <View style={styles.statRow}>
            <Icon name="printer" size={16} color={colors.info} />
            <Text style={[styles.statText, { color: colors.textSecondary }]}>{loading ? 'Refreshing status…' : normalizeStatus(state)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    fontSize: fontSize.sm,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyRow: {
    gap: spacing.lg,
  },
  progressSection: {
    gap: spacing.sm,
  },
  fileName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressText: {
    fontSize: fontSize.sm,
  },
  statsColumn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statText: {
    fontSize: fontSize.sm,
  },
});
