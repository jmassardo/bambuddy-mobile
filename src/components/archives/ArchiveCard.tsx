import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { Icon } from '@/components/common/TabBarIcon';
import { StatusBadge } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { Archive } from '@/types/api';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
} from '@/utils/data';

interface ArchiveCardProps {
  archive: Archive;
  viewMode?: 'grid' | 'list';
  selected?: boolean;
  selectionMode?: boolean;
  onPress?: () => void;
  onToggleSelect?: () => void;
  onReprint?: () => void;
  onTimelapse?: () => void;
  onPhotos?: () => void;
  onQRCode?: () => void;
  onDelete?: () => void;
}

function statusColor(status: string, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'failed':
    case 'aborted':
      return colors.error;
    case 'cancelled':
    case 'stopped':
      return colors.warning;
    default:
      return colors.info;
  }
}

function ArchiveAction({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  color: string;
  onPress?: () => void;
}) {
  if (!onPress) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: `${color}18`,
          borderColor: `${color}55`,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function ArchiveCard({
  archive,
  viewMode = 'list',
  selected = false,
  selectionMode = false,
  onPress,
  onToggleSelect,
  onReprint,
  onTimelapse,
  onPhotos,
  onQRCode,
  onDelete,
}: ArchiveCardProps) {
  const { colors } = useTheme();
  const cardStatusColor = statusColor(archive.status, colors);
  const isGrid = viewMode === 'grid';

  return (
    <Pressable
      onPress={selectionMode ? onToggleSelect : onPress}
      style={({ pressed }) => [
        styles.card,
        isGrid ? styles.gridCard : styles.listCard,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
          opacity: pressed ? 0.96 : 1,
        },
      ]}
    >
      <View style={isGrid ? undefined : styles.listMediaWrap}>
        <Image
          source={{ uri: api.getArchiveThumbnail(archive.id) }}
          style={isGrid ? styles.gridThumbnail : styles.listThumbnail}
        />
        {selectionMode ? (
          <Pressable
            onPress={onToggleSelect}
            style={[
              styles.selectBadge,
              {
                backgroundColor: selected ? colors.accent : colors.overlay,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            {selected ? (
              <Icon name="check-circle" size={16} color={colors.textInverse} />
            ) : null}
          </Pressable>
        ) : null}
        {archive.is_favorite ? (
          <View style={[styles.favoriteBadge, { backgroundColor: colors.overlay }]}> 
            <Icon name="star" size={14} color="#facc15" />
          </View>
        ) : null}
        {archive.timelapse_path ? (
          <View style={[styles.mediaBadge, { backgroundColor: colors.overlay }]}> 
            <Icon name="video" size={14} color={colors.accentLight} />
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {archive.print_name || archive.filename}
            </Text>
            <Text style={[styles.filename, { color: colors.textSecondary }]} numberOfLines={1}>
              {archive.filename}
            </Text>
          </View>
          <StatusBadge label={archive.status} color={cardStatusColor} />
        </View>

        <View style={styles.metaStrip}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
            {archive.print_name || archive.sliced_for_model || 'No printer'}
          </Text>
          {archive.project_name ? (
            <View
              style={[
                styles.projectChip,
                { backgroundColor: `${colors.info}18`, borderColor: `${colors.info}55` },
              ]}
            >
              <Text style={[styles.projectChipText, { color: colors.info }]} numberOfLines={1}>
                {archive.project_name}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Date</Text>
            <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
              {formatDateTime(archive.completed_at || archive.created_at)}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Duration</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {formatDuration(archive.actual_time_seconds || archive.print_time_seconds)}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Filament</Text>
            <View style={styles.inlineMetric}>
              {archive.filament_color ? (
                <View
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor: archive.filament_color.split(',')[0]?.trim(),
                      borderColor: colors.border,
                    },
                  ]}
                />
              ) : null}
              <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
                {archive.filament_type || 'Unknown'}
              </Text>
            </View>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Used</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {formatWeight(archive.filament_used_grams)}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Cost</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}> 
              {archive.cost != null ? formatCurrency(archive.cost) : '—'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Layers</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {archive.total_layers ? `${archive.total_layers}` : '—'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Plate</Text>
            <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
              {archive.bed_type || 'Unknown'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Runs</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {archive.run_count}
            </Text>
          </View>
        </View>

        <View style={styles.badgesRow}>
          {archive.sliced_for_model ? (
            <View
              style={[
                styles.badgeChip,
                { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}44` },
              ]}
            >
              <Text style={[styles.badgeChipText, { color: colors.accentLight }]}>
                {archive.sliced_for_model}
              </Text>
            </View>
          ) : null}
          {archive.notes ? (
            <View
              style={[
                styles.badgeChip,
                { backgroundColor: `${colors.info}18`, borderColor: `${colors.info}44` },
              ]}
            >
              <Text style={[styles.badgeChipText, { color: colors.info }]}>Notes</Text>
            </View>
          ) : null}
          {archive.photos?.length ? (
            <View
              style={[
                styles.badgeChip,
                { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}44` },
              ]}
            >
              <Text style={[styles.badgeChipText, { color: colors.warning }]}>
                {archive.photos.length} photo{archive.photos.length === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
          {archive.duplicate_count > 0 ? (
            <View
              style={[
                styles.badgeChip,
                { backgroundColor: '#8b5cf618', borderColor: '#8b5cf644' },
              ]}
            >
              <Text style={[styles.badgeChipText, { color: '#c4b5fd' }]}>+{archive.duplicate_count} duplicates</Text>
            </View>
          ) : null}
        </View>

        {archive.tags ? (
          <View style={styles.tagsRow}>
            {archive.tags
              .split(',')
              .map(tag => tag.trim())
              .filter(Boolean)
              .slice(0, isGrid ? 3 : 6)
              .map(tag => (
                <View
                  key={tag}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                    {tag}
                  </Text>
                </View>
              ))}
          </View>
        ) : null}

        <View style={[styles.footer, { borderColor: colors.borderSubtle }]}> 
          <View style={styles.footerMeta}>
            {archive.created_by_username ? (
              <Text style={[styles.footerText, { color: colors.textSecondary }]} numberOfLines={1}>
                By {archive.created_by_username}
              </Text>
            ) : null}
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>
              {archive.file_size ? `${Math.round(archive.file_size / 1024 / 1024)} MB` : '—'}
            </Text>
          </View>
          <View style={styles.actionsRow}>
            <ArchiveAction label="Reprint" icon="printer" color={colors.accent} onPress={onReprint} />
            <ArchiveAction label="Time" icon="video" color={colors.info} onPress={onTimelapse} />
            <ArchiveAction label="Photos" icon="camera" color={colors.warning} onPress={onPhotos} />
            <ArchiveAction label="QR" icon="qr-code" color={colors.textSecondary} onPress={onQRCode} />
            <ArchiveAction label="Delete" icon="trash" color={colors.error} onPress={onDelete} />
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
    overflow: 'hidden',
  },
  gridCard: {
    flex: 1,
  },
  listCard: {
    flexDirection: 'row',
  },
  listMediaWrap: {
    width: 132,
  },
  gridThumbnail: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: '#1f2937',
  },
  listThumbnail: {
    width: '100%',
    height: '100%',
    minHeight: 160,
    backgroundColor: '#1f2937',
  },
  selectBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: borderRadius.full,
    padding: spacing.xs,
  },
  mediaBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    borderRadius: borderRadius.full,
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  filename: {
    fontSize: fontSize.xs,
  },
  metaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  projectChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  projectChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricItem: {
    minWidth: '30%',
    flexGrow: 1,
    gap: 2,
  },
  metricLabel: {
    fontSize: fontSize.xs,
  },
  metricValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  inlineMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: fontSize.xs,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footerText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
