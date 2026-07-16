import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { fontSize, fontWeight, spacing } from '../../theme/tokens';
import { formatFileSize, formatDate } from '../../utils/formatters';

interface FileItemProps {
  item: Record<string, unknown>;
  onPress: () => void;
}

export function FileItem({ item, onPress }: FileItemProps) {
  const { colors } = useTheme();

  const name = (item.name as string) || 'Untitled';
  const isFolder =
    (item.type as string) === 'folder' || (item.is_folder as boolean);
  const size = item.size as number;
  const modifiedAt = item.modified_at as string;
  const fileType = (item.file_type as string) || '';

  const getFileIcon = (): string => {
    if (isFolder) return '📁';
    const lower = name.toLowerCase();
    if (lower.endsWith('.3mf')) return '🗂';
    if (lower.endsWith('.stl')) return '📐';
    if (lower.endsWith('.gcode') || lower.endsWith('.gcode.3mf')) return '📄';
    if (lower.endsWith('.zip')) return '🗜';
    if (lower.endsWith('.jpg') || lower.endsWith('.png')) return '🖼';
    return '📄';
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: pressed ? colors.surfaceHover : 'transparent',
        },
      ]}
    >
      <Text style={styles.icon}>{getFileIcon()}</Text>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          {!isFolder && size ? (
            <Text style={[styles.meta, { color: colors.textTertiary }]}>
              {formatFileSize(size)}
            </Text>
          ) : null}
          {modifiedAt && (
            <Text style={[styles.meta, { color: colors.textTertiary }]}>
              {formatDate(modifiedAt)}
            </Text>
          )}
          {fileType && (
            <Text style={[styles.meta, { color: colors.textTertiary }]}>
              {fileType.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
      {isFolder && (
        <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
      )}
    </Pressable>
  );
}

interface BreadcrumbProps {
  path: { id: number | null; name: string }[];
  onNavigate: (index: number) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.breadcrumb, { borderBottomColor: colors.borderSubtle }]}
    >
      {path.map((segment, index) => (
        <View key={index} style={styles.breadcrumbItem}>
          {index > 0 && (
            <Text
              style={[
                styles.breadcrumbSeparator,
                { color: colors.textTertiary },
              ]}
            >
              /
            </Text>
          )}
          <Pressable onPress={() => onNavigate(index)}>
            <Text
              style={[
                styles.breadcrumbText,
                {
                  color:
                    index === path.length - 1 ? colors.text : colors.accent,
                  fontWeight:
                    index === path.length - 1
                      ? fontWeight.semibold
                      : fontWeight.normal,
                },
              ]}
              numberOfLines={1}
            >
              {segment.name}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  icon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 2,
  },
  meta: {
    fontSize: fontSize.xs,
  },
  chevron: {
    fontSize: 24,
    fontWeight: fontWeight.medium,
    marginLeft: spacing.sm,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbSeparator: {
    marginHorizontal: spacing.xs,
    fontSize: fontSize.sm,
  },
  breadcrumbText: {
    fontSize: fontSize.sm,
    maxWidth: 120,
  },
});
