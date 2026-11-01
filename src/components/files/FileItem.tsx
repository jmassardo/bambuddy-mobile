import { translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle,
  Download,
  File,
  FileText,
  Folder,
  Image as ImageIcon,
  Layers,
  Pencil,
  Trash2,
  Video,
  Box,
} from 'lucide-react-native';
import { api } from '@/api/client';

import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import {
  fileIconName,
  formatDateTime,
  isRecord,
  pickArray,
  pickBoolean,
  pickId,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';
import { formatFileSize } from '@/utils/data';

type FileItemIconName =
  | 'image'
  | 'layers'
  | 'folder'
  | 'edit'
  | 'download'
  | 'trash'
  | 'video'
  | 'file-text'
  | 'file'
  | 'box';

const FILE_ITEM_ICONS = {
  image: ImageIcon,
  layers: Layers,
  folder: Folder,
  edit: Pencil,
  download: Download,
  trash: Trash2,
  video: Video,
  'file-text': FileText,
  file: File,
  box: Box,
} satisfies Record<FileItemIconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

interface FileItemProps {
  item: ApiRecord;
  viewMode?: 'grid' | 'list';
  selected?: boolean;
  showSelection?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  onSlice?: () => void;
  on3dPreview?: () => void;
  onLink?: () => void;
  onDetails?: () => void;
  wrapName?: boolean;
  showModified?: boolean;
}

function thumbnailUrl(id: number): string | null {
  try {
    return api.getLibraryFileThumbnailUrl(id);
  } catch {
    return null;
  }
}

function ActionPill({
  label,
  icon,
  color,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: FileItemIconName;
  color: string;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  useNativeLocale();
  if (!onPress) return null;
  const IconComponent = FILE_ITEM_ICONS[icon];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={({ pressed }) => [
        styles.actionPill,
        {
          backgroundColor: `${color}18`,
          borderColor: `${color}55`,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <IconComponent size={14} color={color} strokeWidth={2} />
      <Text style={[styles.actionPillText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function FileItem({
  item,
  viewMode = 'list',
  selected = false,
  showSelection = false,
  onPress,
  onLongPress,
  onToggleSelect,
  onRename,
  onDelete,
  onMove,
  onDownload,
  onPreview,
  onSlice,
  on3dPreview,
  onLink,
  onDetails,
  wrapName = true,
  showModified = true,
}: FileItemProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [thumbError, setThumbError] = useState(false);
  const id = Number(pickId(item));
  const name = pickString(item, ['print_name', 'filename', 'name'], 'Untitled');
  const rawFilename = pickString(item, ['filename', 'name'], name);
  const isFolder = pickBoolean(
    item,
    ['is_folder'],
    pickString(item, ['type', 'kind']) === 'folder',
  );
  const fileType = pickString(item, ['file_type', 'type', 'kind'], isFolder ? 'folder' : 'file');
  const isExternal = pickBoolean(item, ['is_external']);
  const isReadonly = pickBoolean(item, ['external_readonly']);
  const printCount = pickNumber(item, ['print_count'], 0);
  const size = pickNumber(item, ['file_size', 'size', 'size_bytes'], 0);
  const updatedAt = pickString(item, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at']);
  // uploader and slicedFor available via pickString if needed in future
  const tags = pickArray(item, ['tags']).filter(isRecord);
  const previewSource = useLocalizedMemo(() => {
    const hasThumb = pickString(item, ['thumbnail_path']) !== '';
    const hasPreviewableExt = /\.(3mf|gcode\.3mf)$/i.test(rawFilename);
    if ((!hasThumb && !hasPreviewableExt) || !id || isFolder) return null;
    return thumbnailUrl(id);
  }, [id, isFolder, item, rawFilename]);
  const iconName = fileIconName(rawFilename, isFolder) as FileItemIconName;
  const FileTypeIcon = FILE_ITEM_ICONS[iconName];
  const isGrid = viewMode === 'grid';
  const isSliceable = /\.(3mf|stl|step|stp)$/i.test(rawFilename) && !/\.gcode(\.3mf)?$/i.test(rawFilename);
  const isPreviewable = /\.(3mf|stl|step|stp|gcode|pdf|csv|xlsx|xls|ods|png|jpe?g|gif|webp|bmp|svg)$/i.test(rawFilename);
  const isPrintable = /\.gcode(\.3mf)?$/i.test(rawFilename);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
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
      {showSelection ? (
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
            <CheckCircle size={16} color={colors.textInverse} strokeWidth={2} />
          ) : null}
        </Pressable>
      ) : null}

      <View style={[styles.media, isGrid ? styles.gridMedia : styles.listMedia, { backgroundColor: colors.surfaceElevated }]}> 
        {previewSource && !thumbError ? (
          <Image source={{ uri: previewSource }} style={styles.thumbnail} resizeMode="cover" onError={() => setThumbError(true)} />
        ) : (
          <FileTypeIcon size={28} color={isFolder ? colors.accentLight : colors.textTertiary} strokeWidth={2} />
        )}
        <View
          style={[
            styles.typeBadge,
            {
              backgroundColor: isFolder
                ? `${colors.warning}DD`
                : fileType.includes('gcode')
                ? `${colors.info}DD`
                : fileType === '3mf'
                ? `${colors.accent}DD`
                : `${colors.textTertiary}CC`,
            },
          ]}
        >
          <Text style={[styles.typeBadgeText, { color: colors.textInverse }]}> 
            {isFolder ? translateNative('native.edc31d89be96ecd3') : fileType.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={wrapName ? undefined : 1}>
              {name}
            </Text>
            {name !== rawFilename ? (
              <Text style={[styles.filename, { color: colors.textSecondary }]} numberOfLines={1}>
                {rawFilename}
              </Text>
            ) : null}
          </View>
          {isExternal ? (
            <View
              style={[
                styles.externalChip,
                {
                  backgroundColor: colors.highlightBg,
                  borderColor: `${colors.highlight}55`,
                },
              ]}
            >
              <Text style={[styles.externalChipText, { color: colors.highlightLight }]}>{translateNative('native.91ac7d9ea4fafdb5')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('native.96b716d3aee0a481')}</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{isFolder ? '—' : formatFileSize(size)}</Text>
          </View>
          {showModified ? <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('native.579768fa26620d83')}</Text>
            <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>{formatDateTime(updatedAt)}</Text>
          </View> : null}
          {printCount > 0 ? (
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('native.d3484bee79a505c4')}</Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>{printCount}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.badgesRow}>
          {isPrintable ? (
            <View style={[styles.chip, { backgroundColor: `${colors.info}18`, borderColor: `${colors.info}44` }]}>
              <Text style={[styles.chipText, { color: colors.info }]}>{translateNative('native.933baa8d16c5cd9f')}</Text>
            </View>
          ) : null}
          {isSliceable ? (
            <View style={[styles.chip, { backgroundColor: `${colors.accent}18`, borderColor: `${colors.accent}44` }]}>
              <Text style={[styles.chipText, { color: colors.accentLight }]}>{translateNative('native.2fc8b180b770a36f')}</Text>
            </View>
          ) : null}
          {isReadonly ? (
            <View style={[styles.chip, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}44` }]}>
              <Text style={[styles.chipText, { color: colors.warning }]}>{translateNative('native.abb336792d47fad5')}</Text>
            </View>
          ) : null}
          {pickNumber(item, ['variant_group_id']) ? <View style={[styles.chip, {backgroundColor: colors.surfaceElevated, borderColor: colors.border}]}>
            <Text style={[styles.chipText, {color: colors.textSecondary}]}>{t('library.versionBadge', {defaultValue: '{{count}} versions · group #{{id}}', count: pickNumber(item, ['variant_count']), id: pickNumber(item, ['variant_group_id'])})}</Text>
          </View> : null}
        </View>

        {tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {tags.slice(0, isGrid ? 2 : 4).map(tag => (
              <View
                key={pickId(tag)}
                style={[
                  styles.tag,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.tagText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {pickString(tag, ['name'])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.actionsRow, { borderColor: colors.borderSubtle }]}> 
          <ActionPill label={t('library.details', {defaultValue: 'Details'})} icon="file-text" color={colors.info} onPress={!isFolder ? onDetails : undefined} />
          <ActionPill label={translateNative('native.ebf8fd19dcb9ff60')} icon="image" color={colors.info} onPress={isPreviewable ? onPreview : undefined} />
          <ActionPill label="3D" icon="box" color={colors.highlight} onPress={/\.(stl|3mf|step|stp)$/i.test(rawFilename) ? on3dPreview : undefined} />
          <ActionPill label={translateNative('native.8a8a9fc981cbae11')} icon="layers" color={colors.accent} onPress={isSliceable ? onSlice : undefined} />
          <ActionPill label={t('library.rename', {defaultValue: 'Rename'})} icon="edit" color={colors.accent} onPress={isFolder || !isReadonly ? onRename : undefined} />
          <ActionPill label={t('library.download', {defaultValue: 'Download'})} icon="download" color={colors.info} onPress={!isFolder ? onDownload : undefined} />
          <ActionPill label={t('library.link', {defaultValue: 'Link'})} icon="folder" color={colors.info} onPress={isFolder ? onLink : undefined} />
          <ActionPill label={translateNative('native.1d6be0f4dfecdadb')} icon="folder" color={colors.warning} onPress={!isFolder && !isReadonly ? onMove : undefined} />
          <ActionPill label={translateNative('common.delete')} icon="trash" color={colors.error} onPress={onDelete} />
        </View>
      </View>
    </Pressable>
  );
}

interface BreadcrumbProps {
  path: Array<{ id: number | null; name: string }>;
  onNavigate: (index: number) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <View style={styles.breadcrumbWrap}>
      {path.map((segment, index) => (
        <React.Fragment key={`${segment.id ?? 'root'}-${segment.name}-${index}`}>
          {index > 0 ? (
            <Text style={[styles.breadcrumbSeparator, { color: colors.textTertiary }]}>›</Text>
          ) : null}
          <Pressable
            onPress={() => onNavigate(index)}
            style={[
              styles.breadcrumbChip,
              {
                backgroundColor:
                  index === path.length - 1 ? colors.accentBg : colors.surfaceElevated,
                borderColor:
                  index === path.length - 1 ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.breadcrumbText,
                {
                  color:
                    index === path.length - 1 ? colors.accentLight : colors.text,
                },
              ]}
              numberOfLines={1}
            >
              {segment.name}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  listCard: {
    flexDirection: 'row',
  },
  gridCard: {
    flex: 1,
  },
  selectBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listMedia: {
    width: 120,
    height: 160,
    overflow: 'hidden',
  },
  gridMedia: {
    width: '100%',
    aspectRatio: 1.15,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  externalChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  externalChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaItem: {
    minWidth: '30%',
    flexGrow: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: fontSize.xs,
  },
  metaValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipText: {
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
    maxWidth: 120,
  },
  tagText: {
    fontSize: fontSize.xs,
  },
  actionsRow: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionPill: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  breadcrumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  breadcrumbSeparator: {
    fontSize: fontSize.base,
  },
  breadcrumbChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 160,
  },
  breadcrumbText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
