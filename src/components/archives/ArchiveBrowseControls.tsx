import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import {
  ArchiveDialog,
  WorkflowChip as Chip,
  useArchiveAuthorization,
} from './ArchiveWorkflowUI';
import {
  localArchiveDay,
  mergeArchiveTags,
  type ArchiveBrowseOptions,
} from '@/utils/archiveWorkflows';
import type { Archive } from '@/types/api';
import { parseServerDate } from '@/utils/preferences';

export const initialBrowseOptions: ArchiveBrowseOptions = {
  collection: 'all',
  fileType: 'all',
  unconfirmed: false,
  hideDuplicates: false,
  colors: [],
  colorMode: 'any',
  sort: 'newest',
  day: '',
};

export function ArchiveBrowseControls({
  archives,
  options,
  onChange,
}: {
  archives: Archive[];
  options: ArchiveBrowseOptions;
  onChange: (options: ArchiveBrowseOptions) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [calendar, setCalendar] = useState(false);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const allColors = [
    ...new Set(
      archives.flatMap(archive => {
        const extra =
          (archive as unknown as { filament_colors?: string[] })
            .filament_colors ?? [];
        return [
          ...(archive.filament_color?.split(',').map(color => color.trim()) ??
            []),
          ...extra,
        ].filter((color): color is string => Boolean(color));
      }),
    ),
  ].sort();
  const counts = useMemo(() => {
    const result = new Map<
      string,
      { count: number; completed: number; rejected: number; failed: number }
    >();
    for (const archive of archives) {
      const key = localArchiveDay(
        parseServerDate(archive.completed_at ?? archive.created_at),
      );
      const entry = result.get(key) ?? {
        count: 0,
        completed: 0,
        rejected: 0,
        failed: 0,
      };
      entry.count++;
      if (archive.status === 'completed') entry.completed++;
      if (['failed', 'aborted'].includes(archive.status)) entry.failed++;
      if (
        (archive as unknown as { user_verdict?: string }).user_verdict ===
        'reject'
      )
        entry.rejected++;
      result.set(key, entry);
    }
    return result;
  }, [archives]);
  const set = (patch: Partial<ArchiveBrowseOptions>) =>
    onChange({ ...options, ...patch });
  const labels: Record<string, string> = {
    all: 'All archives',
    recent: 'Last 24 hours',
    'this-week': 'This week',
    'this-month': 'This month',
    favorites: 'Favorites',
    'not-printed': 'Not printed',
    printed: 'Printed',
    failed: 'Failed prints',
    duplicates: 'Duplicates',
    newest: 'Newest',
    oldest: 'Oldest',
    name: 'Name A–Z',
    'name-desc': 'Name Z–A',
    time: 'Longest print',
    filament: 'Most filament',
    'size-desc': 'Largest file',
    'size-asc': 'Smallest file',
  };
  return (
    <SectionCard
      title={t('archives.browse', { defaultValue: 'Browse archives' })}
    >
      <ScrollView horizontal>
        <View style={styles.row}>
          {Object.keys(labels)
            .slice(0, 9)
            .map(collection => (
              <Chip
                key={collection}
                label={t(`archives.collection.${collection}`, {
                  defaultValue: labels[collection],
                })}
                active={options.collection === collection}
                onPress={() => set({ collection })}
              />
            ))}
        </View>
      </ScrollView>
      <View style={styles.row}>
        {['all', 'gcode', 'source'].map(fileType => (
          <Chip
            key={fileType}
            label={
              fileType === 'all'
                ? t('archives.allTypes', { defaultValue: 'All files' })
                : fileType === 'gcode'
                ? t('archives.slicedFiles', { defaultValue: 'Sliced (GCODE)' })
                : t('archives.sourceOnly', { defaultValue: 'Source only' })
            }
            active={options.fileType === fileType}
            onPress={() => set({ fileType })}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Chip
          label={t('archives.unconfirmed', {
            defaultValue: 'Unconfirmed quality',
          })}
          active={options.unconfirmed}
          onPress={() => set({ unconfirmed: !options.unconfirmed })}
        />
        <Chip
          label={t('archives.hideDuplicates', {
            defaultValue: 'Hide duplicates',
          })}
          active={options.hideDuplicates}
          onPress={() => set({ hideDuplicates: !options.hideDuplicates })}
        />
      </View>
      <ScrollView horizontal>
        <View style={styles.row}>
          {[
            'newest',
            'oldest',
            'name',
            'name-desc',
            'size-desc',
            'size-asc',
            'time',
            'filament',
          ].map(sort => (
            <Chip
              key={sort}
              label={t(`archives.sort.${sort}`, { defaultValue: labels[sort] })}
              active={options.sort === sort}
              onPress={() => set({ sort })}
            />
          ))}
        </View>
      </ScrollView>
      {allColors.length ? (
        <View style={styles.row}>
          {allColors.map(color => (
            <Chip
              key={color}
              label={`● ${color}`}
              active={options.colors.includes(color)}
              onPress={() =>
                set({
                  colors: options.colors.includes(color)
                    ? options.colors.filter(value => value !== color)
                    : [...options.colors, color],
                })
              }
            />
          ))}
          <Chip
            label={
              options.colorMode === 'any'
                ? t('archives.anyColor', { defaultValue: 'ANY color (OR)' })
                : t('archives.allColors', { defaultValue: 'ALL colors (AND)' })
            }
            active={options.colorMode === 'all'}
            onPress={() =>
              set({ colorMode: options.colorMode === 'all' ? 'any' : 'all' })
            }
          />
          <PrimaryButton
            label={t('archives.clearColors', { defaultValue: 'Clear colors' })}
            variant="secondary"
            onPress={() => set({ colors: [] })}
          />
        </View>
      ) : null}
      <PrimaryButton
        label={t('archives.calendar', { defaultValue: 'Calendar' })}
        variant="secondary"
        onPress={() => setCalendar(!calendar)}
      />
      {calendar ? (
        <>
          <View style={styles.row}>
            <PrimaryButton
              label={t('common.previous', { defaultValue: 'Previous month' })}
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            />
            <Text style={{ color: colors.text }}>
              {month.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <PrimaryButton
              label={t('common.next', { defaultValue: 'Next month' })}
              onPress={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            />
            <PrimaryButton
              label={t('common.today', { defaultValue: 'Today' })}
              onPress={() => {
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                set({ day: localArchiveDay(today) });
              }}
            />
          </View>
          <View style={styles.row}>
            {Array.from(
              {
                length: new Date(
                  month.getFullYear(),
                  month.getMonth() + 1,
                  0,
                ).getDate(),
              },
              (_, offset) => {
                const day = localArchiveDay(
                  new Date(month.getFullYear(), month.getMonth(), offset + 1),
                );
                const entry = counts.get(day);
                return (
                  <Chip
                    key={day}
                    label={`${offset + 1} · ${entry?.count ?? 0} (✓${
                      entry?.completed ?? 0
                    } / ✕${entry?.failed ?? 0} / R${entry?.rejected ?? 0})`}
                    active={options.day === day}
                    onPress={() => set({ day })}
                  />
                );
              },
            )}
          </View>
          <Text style={{ color: colors.textSecondary }}>
            {t('archives.calendarLegend', {
              defaultValue:
                'Day · prints (completed / machine failures / quality rejects). Select an archive below to open it.',
            })}
          </Text>
          <PrimaryButton
            label={t('archives.allDays', { defaultValue: 'All days' })}
            variant="secondary"
            onPress={() => set({ day: '' })}
          />
        </>
      ) : null}
    </SectionCard>
  );
}

export function ArchiveBatchDialog({
  archives,
  onClose,
}: {
  archives: Archive[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tags, setTags] = useState('');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [projectSearch, setProjectSearch] = useState('');
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
  });
  const catalog = useQuery({ queryKey: ['archiveTags'], queryFn: api.getTags });
  const mutation = useMutation({
    mutationFn: async (
      operation:
        | { type: 'tags' }
        | { type: 'favorite' }
        | { type: 'project'; id: number | null },
    ) => {
      for (const archive of archives) {
        if (operation.type === 'favorite') {
          const updated = await archiveWorkflows.favorite(archive.id);
          queryClient.setQueryData<Archive[]>(['archives'], current =>
            current?.map(item => (item.id === updated.id ? updated : item)),
          );
        } else
          await api.updateArchive(
            archive.id,
            operation.type === 'tags'
              ? { tags: mergeArchiveTags(archive.tags, tags, mode) }
              : { project_id: operation.id },
          );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      showToast(
        t('archives.updated', { defaultValue: 'Selected archives updated.' }),
        'success',
      );
      onClose();
    },
    onError: async (error: Error) => {
      await queryClient.invalidateQueries();
      showToast(error.message, 'error');
    },
  });
  return (
    <ArchiveDialog
      title={t('archives.batch', {
        defaultValue: 'Update {{count}} selected archives',
        count: archives.length,
      })}
      onClose={onClose}
    >
      <View style={styles.row}>
        {(['add', 'remove'] as const).map(value => (
          <Chip
            key={value}
            label={
              value === 'add'
                ? t('archives.addTags', { defaultValue: 'Add tags' })
                : t('archives.removeTags', { defaultValue: 'Remove tags' })
            }
            active={mode === value}
            onPress={() => setMode(value)}
          />
        ))}
      </View>
      <TextField
        label={t('archives.tags', { defaultValue: 'Tags (comma separated)' })}
        value={tags}
        onChangeText={setTags}
      />
      <View style={styles.row}>
        {catalog.data?.map(tag => (
          <Chip
            key={tag.name}
            label={tag.name}
            active={tags
              .split(',')
              .map(value => value.trim())
              .includes(tag.name)}
            onPress={() => setTags(mergeArchiveTags(tags, tag.name, 'add'))}
          />
        ))}
      </View>
      <PrimaryButton
        label={t('archives.applyTags', {
          defaultValue: 'Apply tags, preserving unrelated tags',
        })}
        loading={mutation.isPending}
        onPress={() => mutation.mutate({ type: 'tags' })}
      />
      <PrimaryButton
        label={t('archives.toggleFavorites', {
          defaultValue: 'Toggle selected favorites',
        })}
        disabled={mutation.isPending}
        onPress={() => mutation.mutate({ type: 'favorite' })}
      />
      <Text style={{ color: colors.text }}>
        {t('archives.assignProject', {
          defaultValue: 'Assign / reassign project',
        })}
      </Text>
      <TextField
        label={t('archives.searchProjects', {
          defaultValue: 'Search projects',
        })}
        value={projectSearch}
        onChangeText={setProjectSearch}
      />
      <PrimaryButton
        label={t('archives.removeProject', {
          defaultValue: 'Remove from project',
        })}
        disabled={mutation.isPending}
        onPress={() => mutation.mutate({ type: 'project', id: null })}
      />
      {projects.data
        ?.filter(project =>
          project.name.toLowerCase().includes(projectSearch.toLowerCase()),
        )
        .map(project => (
          <PrimaryButton
            key={project.id}
            label={project.name}
            variant="secondary"
            disabled={mutation.isPending}
            onPress={() => mutation.mutate({ type: 'project', id: project.id })}
          />
        ))}
    </ArchiveDialog>
  );
}

export function ArchiveTagCatalog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const auth = useArchiveAuthorization();
  const [search, setSearch] = useState('');
  const [sortCount, setSortCount] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const query = useQuery({ queryKey: ['archiveTags'], queryFn: api.getTags });
  const mutation = useMutation({
    mutationFn: (tag: { old: string; replacement?: string }) =>
      tag.replacement === undefined
        ? archiveWorkflows.deleteTag(tag.old)
        : archiveWorkflows.renameTag(tag.old, tag.replacement),
    onSuccess: async result => {
      await queryClient.invalidateQueries();
      setEditing(null);
      showToast(
        t('archives.tagsAffected', {
          defaultValue: '{{count}} archives updated',
          count: result.affected,
        }),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <ArchiveDialog
      title={t('archives.manageTags', { defaultValue: 'Manage tag catalog' })}
      onClose={onClose}
    >
      <TextField
        label={t('common.search')}
        value={search}
        onChangeText={setSearch}
      />
      <Chip
        label={
          sortCount
            ? t('archives.sortCount', { defaultValue: 'Sort by count' })
            : t('archives.sortName', { defaultValue: 'Sort by name' })
        }
        active={sortCount}
        onPress={() => setSortCount(!sortCount)}
      />
      {[...(query.data ?? [])]
        .filter(tag => tag.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) =>
          sortCount ? b.count - a.count : a.name.localeCompare(b.name),
        )
        .map(tag => (
          <View key={tag.name} style={styles.row}>
            <Text style={{ color: colors.text }}>
              {tag.name} ({tag.count})
            </Text>
            {auth.manageTags ? (
              <>
                <PrimaryButton
                  label={t('common.edit')}
                  variant="secondary"
                  onPress={() => {
                    setEditing(tag.name);
                    setName(tag.name);
                  }}
                />
                <PrimaryButton
                  label={t('common.delete')}
                  variant="danger"
                  disabled={mutation.isPending}
                  onPress={() =>
                    Alert.alert(
                      t('archives.deleteTag', {
                        defaultValue: 'Delete tag from every archive?',
                      }),
                      tag.name,
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: () => mutation.mutate({ old: tag.name }),
                        },
                      ],
                    )
                  }
                />
              </>
            ) : null}
          </View>
        ))}
      {editing ? (
        <>
          <TextField
            label={t('archives.newTagName', { defaultValue: 'New tag name' })}
            value={name}
            onChangeText={setName}
          />
          <PrimaryButton
            label={t('common.save')}
            disabled={!name.trim() || mutation.isPending}
            onPress={() =>
              mutation.mutate({ old: editing, replacement: name.trim() })
            }
          />
          <PrimaryButton
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setEditing(null)}
          />
        </>
      ) : null}
    </ArchiveDialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
