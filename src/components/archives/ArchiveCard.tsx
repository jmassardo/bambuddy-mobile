import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { api } from '../../api/client';
import { Badge } from '../common/UIComponents';
import { formatDate, formatDuration, formatWeight } from '../../utils/formatters';

interface ArchiveCardProps {
  archive: Record<string, unknown>;
}

export function ArchiveCard({ archive }: ArchiveCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const id = archive.id as number;

  const name = (archive.name as string) || 'Untitled';
  const tags = (archive.tags as string[]) || [];
  const printDate = archive.print_date as string;
  const printerName = archive.printer_name as string;
  const duration = archive.duration as number;
  const totalWeight = archive.total_weight as number;
  const status = archive.status as string;
  const runCount = archive.run_count as number;
  const isFavorite = archive.is_favorite as boolean;

  const thumbnailUrl = api.getArchiveThumbnail(id);

  const statusColor =
    status === 'completed' ? colors.success :
    status === 'failed' ? colors.error :
    status === 'cancelled' ? colors.warning :
    colors.textTertiary;

  return (
    <Pressable
      onPress={() => router.push(`/archive/${id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Thumbnail */}
        <Image
          source={{ uri: thumbnailUrl }}
          style={[styles.thumbnail, { backgroundColor: colors.surfaceElevated }]}
          resizeMode="cover"
        />

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {isFavorite ? '⭐ ' : ''}{name}
            </Text>
          </View>

          <View style={styles.metaRow}>
            {printerName && (
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                🖨️ {printerName}
              </Text>
            )}
            {printDate && (
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                {formatDate(printDate)}
              </Text>
            )}
          </View>

          <View style={styles.statsRow}>
            {duration ? (
              <Text style={[styles.stat, { color: colors.textSecondary }]}>
                🕐 {formatDuration(duration)}
              </Text>
            ) : null}
            {totalWeight ? (
              <Text style={[styles.stat, { color: colors.textSecondary }]}>
                🧵 {formatWeight(totalWeight)}
              </Text>
            ) : null}
            {status && (
              <Badge
                label={status}
                color={statusColor}
                backgroundColor={`${statusColor}20`}
              />
            )}
          </View>

          {/* Tags */}
          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.accentBg }]}>
                  <Text style={[styles.tagText, { color: colors.accent }]}>
                    {tag}
                  </Text>
                </View>
              ))}
              {tags.length > 3 && (
                <Text style={[styles.moreTags, { color: colors.textTertiary }]}>
                  +{tags.length - 3}
                </Text>
              )}
            </View>
          )}

          {/* Run count badge */}
          {runCount && runCount > 1 && (
            <Text style={[styles.runCount, { color: colors.textTertiary }]}>
              {runCount} prints
            </Text>
          )}
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
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 90,
    height: 110,
  },
  info: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  meta: {
    fontSize: fontSize.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  stat: {
    fontSize: fontSize.xs,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  moreTags: {
    fontSize: 10,
    alignSelf: 'center',
  },
  runCount: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});
