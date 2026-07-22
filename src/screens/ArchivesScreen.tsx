import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, CheckCircle, Download, Pause, X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ArchiveCard } from '@/components/archives/ArchiveCard';
import { CompareArchivesModal } from '@/components/archives/CompareArchivesModal';
import {
  Chip,
  PrimaryButton,
  SearchBar,
  SectionCard,
  StatCard,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { Archive, ArchiveStats, Printer } from '@/types/api';
import {
  formatCurrency,
  formatDuration,
  pickArray,
  pickNumber,
} from '@/utils/data';
import { shareBlob } from '@/utils/share';


type ArchiveStatusFilter =
  | 'all'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'favorite'
  | 'duplicate';

type RangeFilter = 'all' | '7d' | '30d' | '90d';
type ArchiveViewMode = 'list' | 'grid';

function toArchives(value: unknown): Archive[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as Archive[];
}

function rangeCutoff(range: RangeFilter) {
  if (range === 'all') return 0;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function tagsForArchive(archive: Archive) {
  return archive.tags
    ?.split(',')
    .map(tag => tag.trim())
    .filter(Boolean) ?? [];
}

function rangeDateFrom(range: RangeFilter) {
  const cutoff = rangeCutoff(range);
  return cutoff > 0 ? new Date(cutoff).toISOString() : undefined;
}

function archiveExportRows(archives: Archive[]) {
  return archives.map(archive => ({
    id: archive.id,
    print_name: archive.print_name ?? '',
    filename: archive.filename ?? '',
    printer_name: archive.printer_name ?? '',
    project_name: archive.project_name ?? '',
    status: archive.status ?? '',
    completed_at: archive.completed_at ?? archive.created_at ?? '',
    filament_type: archive.filament_type ?? '',
    filament_color: archive.filament_color ?? '',
    filament_used_grams: archive.filament_used_grams ?? '',
    cost: archive.cost ?? '',
    tags: archive.tags ?? '',
  }));
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => escape(row[header])).join(',')),
  ].join('\n');
}

function SimpleModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export default function ArchivesScreen() {
  const navigation = useNavigation<MainTabNavigationProp<'Archives'>>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ArchiveStatusFilter>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
  const [printerFilter, setPrinterFilter] = useState<number | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ArchiveViewMode>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [photosArchive, setPhotosArchive] = useState<Archive | null>(null);
  const [qrArchive, setQrArchive] = useState<Archive | null>(null);
  const [tagsArchiveIds, setTagsArchiveIds] = useState<number[]>([]);
  const [tagsDraft, setTagsDraft] = useState('');
  const [showTagSummary, setShowTagSummary] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purgeStats, setPurgeStats] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Archives',
      headerRight: () => (
        <Pressable onPress={() => setShowExportModal(true)} style={styles.headerButton} hitSlop={8}>
          <Download size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      ),
    });
  }, [colors.text, navigation]);

  const archivesQuery = useQuery({
    queryKey: ['archives'],
    queryFn: () => api.getArchives({ limit: 300 }),
  });
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });
  const tagsQuery = useQuery({
    queryKey: ['archiveTags'],
    queryFn: () => api.getTags(),
  });
  const statsQuery = useQuery({
    queryKey: ['archiveStats'],
    queryFn: () => api.getArchiveStats(),
  });


  const archivePurgePreviewQuery = useQuery({
    queryKey: ['archivePurgePreview', purgeDays, purgeStats],
    queryFn: () => api.previewArchivePurge(purgeDays, purgeStats),
    enabled: showPurgeModal,
  });

  const archives = useMemo(() => toArchives(archivesQuery.data), [archivesQuery.data]);
  const printers = useMemo(
    () => (Array.isArray(printersQuery.data) ? (printersQuery.data as unknown as Printer[]) : []),
    [printersQuery.data],
  );
  const tagSummary = useMemo(
    () => (Array.isArray(tagsQuery.data) ? tagsQuery.data : []),
    [tagsQuery.data],
  );
  const stats = (statsQuery.data ?? null) as ArchiveStats | null;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteArchive(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archives'] }),
        queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
      ]);
      setSelectedIds([]);
      showToast('Archive deleted.', 'success');
    },
    onError: () => showToast('Unable to delete the archive.', 'error'),
  });

  const reprintMutation = useMutation({
    mutationFn: (id: number) => api.printArchive(id, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      showToast('Reprint started.', 'success');
    },
    onError: () => showToast('Unable to start a reprint.', 'error'),
  });

  const tagMutation = useMutation({
    mutationFn: async ({ ids, tags }: { ids: number[]; tags: string }) => {
      for (const id of ids) {
        await api.updateArchive(id, { tags });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['archives'] });
      setTagsArchiveIds([]);
      setSelectedIds([]);
      setSelectionMode(false);
      showToast('Tags updated.', 'success');
    },
    onError: () => showToast('Unable to update tags.', 'error'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await api.deleteArchive(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archives'] }),
        queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
      ]);
      setSelectedIds([]);
      setSelectionMode(false);
      showToast('Selected archives deleted.', 'success');
    },
    onError: () => showToast('Unable to delete selected archives.', 'error'),
  });

  const filteredArchives = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff = rangeCutoff(rangeFilter);
    return archives.filter(archive => {
      if (term) {
        const haystack = [
          archive.print_name,
          archive.filename,
          archive.print_name,
          archive.project_name,
          archive.filament_type,
          archive.filament_color,
          archive.tags,
          archive.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (printerFilter !== 'all' && archive.printer_id !== printerFilter) return false;
      if (tagFilter && !tagsForArchive(archive).includes(tagFilter)) return false;
      if (statusFilter === 'completed' && archive.status !== 'completed') return false;
      if (statusFilter === 'failed' && archive.status !== 'failed' && archive.status !== 'aborted') return false;
      if (statusFilter === 'cancelled' && archive.status !== 'cancelled' && archive.status !== 'stopped') return false;
      if (statusFilter === 'favorite' && !archive.is_favorite) return false;
      if (statusFilter === 'duplicate' && archive.duplicate_count === 0) return false;
      if (cutoff > 0) {
        const stamp = new Date(archive.completed_at || archive.created_at).getTime();
        if (!Number.isFinite(stamp) || stamp < cutoff) return false;
      }
      return true;
    });
  }, [archives, printerFilter, rangeFilter, search, statusFilter, tagFilter]);

  const compareArchives = useMemo(
    () =>
      compareIds
        .map(id => archives.find(archive => archive.id === id))
        .filter((archive): archive is Archive => Boolean(archive)),
    [archives, compareIds],
  );

  const hasUnsupportedServerExportFilters = Boolean(
    tagFilter || statusFilter === 'favorite' || statusFilter === 'duplicate',
  );

  const exportMutation = useMutation({
    mutationFn: async () => {
      const filenameBase = `bambuddy-archives-${new Date().toISOString().slice(0, 10)}`;
      if (exportFormat === 'json') {
        const jsonBlobOptions: BlobOptions = {
          type: 'application/json',
          lastModified: Date.now(),
        };
        const blob = new Blob([JSON.stringify(filteredArchives, null, 2)], jsonBlobOptions);
        await shareBlob(blob, `${filenameBase}.json`);
        return;
      }
      if (hasUnsupportedServerExportFilters) {
        const csv = toCsv(archiveExportRows(filteredArchives));
        const csvBlobOptions: BlobOptions = {
          type: 'text/csv',
          lastModified: Date.now(),
        };
        const blob = new Blob([csv], csvBlobOptions);
        await shareBlob(blob, `${filenameBase}.csv`);
        return;
      }
      const blob = await api.exportArchives({
        format: 'csv',
        printerId: printerFilter === 'all' ? undefined : printerFilter,
        status:
          statusFilter === 'completed'
            ? 'completed'
            : statusFilter === 'failed'
              ? 'failed'
              : statusFilter === 'cancelled'
                ? 'cancelled'
                : undefined,
        dateFrom: rangeDateFrom(rangeFilter),
        search: search.trim() || undefined,
      });
      await shareBlob(blob, `${filenameBase}.csv`);
    },
    onSuccess: () => {
      showToast(`${exportFormat.toUpperCase()} export ready to share.`, 'success');
      setShowExportModal(false);
    },
    onError: (error: Error) => showToast(error.message || 'Unable to export archives.', 'error'),
  });

  const purgeMutation = useMutation({
    mutationFn: () => api.purgeArchives({ older_than_days: purgeDays, purge_stats: purgeStats }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archives'] }),
        queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
      ]);
      setShowPurgeConfirm(false);
      setShowPurgeModal(false);
      showToast('Archive purge complete.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to purge archives.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([
      archivesQuery.refetch(),
      printersQuery.refetch(),
      tagsQuery.refetch(),
      statsQuery.refetch(),
    ]);
  };

  const statusCounts = {
    all: archives.length,
    completed: archives.filter(archive => archive.status === 'completed').length,
    failed: archives.filter(archive => archive.status === 'failed' || archive.status === 'aborted').length,
    cancelled: archives.filter(archive => archive.status === 'cancelled' || archive.status === 'stopped').length,
    favorite: archives.filter(archive => archive.is_favorite).length,
    duplicate: archives.filter(archive => archive.duplicate_count > 0).length,
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const allSelected = filteredArchives.length > 0 && selectedIds.length === filteredArchives.length;

  if (archivesQuery.isLoading && printersQuery.isLoading) {
    return <LoadingScreen message="Loading archives…" />;
  }

  if (archivesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load archive history."
        onRetry={() => {
          refreshAll();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        key={viewMode}
        data={filteredArchives}
        keyExtractor={item => String(item.id)}
        numColumns={viewMode === 'grid' ? 2 : 1}
        renderItem={({ item }) => (
          <View style={[styles.archiveCell, viewMode === 'grid' ? styles.gridCell : styles.listCell]}>
            <ArchiveCard
              archive={item}
              viewMode={viewMode}
              selected={selectedIds.includes(item.id)}
              selectionMode={selectionMode}
              onToggleSelect={() => toggleSelected(item.id)}
              onPress={() => navigation.navigate('ArchiveDetail', { id: String(item.id) })}
              onLongPress={() => {
                setSelectionMode(true);
                setSelectedIds(current =>
                  current.includes(item.id) ? current : [...current, item.id],
                );
              }}
              onReprint={() => {
                reprintMutation.mutate(item.id);
              }}
              onTimelapse={() => {
                if (!item.timelapse_path) {
                  showToast('No timelapse is attached to this archive.', 'warning');
                  return;
                }
                Linking.openURL(api.getArchiveTimelapse(item.id)).catch(() => {
                  showToast('Unable to open the timelapse link.', 'error');
                });
              }}
              onPhotos={() => {
                if (!item.photos?.length) {
                  showToast('No photos are attached to this archive.', 'warning');
                  return;
                }
                setPhotosArchive(item);
              }}
              onQRCode={() => setQrArchive(item)}
              onDelete={() => {
                deleteMutation.mutate(item.id);
              }}
            />
          </View>
        )}
        contentContainerStyle={styles.content}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        refreshControl={
          <RefreshControl
            refreshing={archivesQuery.isRefetching || printersQuery.isRefetching || statsQuery.isRefetching}
            onRefresh={() => {
              refreshAll();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
              <StatCard label="Filtered" value={String(filteredArchives.length)} helper={`${archives.length} total`} />
              <StatCard label="Successful" value={String(stats?.successful_prints ?? 0)} helper="Archive stats" />
              <StatCard label="Failed" value={String(stats?.failed_prints ?? 0)} helper="Archive stats" />
              <StatCard label="Print time" value={formatDuration(Math.round((stats?.total_print_time_hours ?? 0) * 3600))} helper="All archives" />
              <StatCard label="Cost" value={formatCurrency(stats?.total_cost ?? 0)} helper="All archives" />
            </ScrollView>

            <SectionCard title="Archive browser" subtitle="Web-style search, filters, compare mode, tags, and actions for reprints, timelapses, photos, QR links, and deletes.">
              <SearchBar value={search} onChangeText={setSearch} placeholder="Search print name, filename, printer, material, tags, or notes" />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', 'completed', 'failed', 'cancelled', 'favorite', 'duplicate'] as ArchiveStatusFilter[]).map(status => (
                  <Chip
                    key={status}
                    label={`${status[0].toUpperCase()}${status.slice(1)}${statusCounts[status] ? ` (${statusCounts[status as keyof typeof statusCounts]})` : ''}`}
                    selected={statusFilter === status}
                    onPress={() => setStatusFilter(status)}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', '7d', '30d', '90d'] as RangeFilter[]).map(range => (
                  <Chip
                    key={range}
                    label={range === 'all' ? 'All dates' : `${range.toUpperCase()} range`}
                    selected={rangeFilter === range}
                    onPress={() => setRangeFilter(range)}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <Chip label="All printers" selected={printerFilter === 'all'} onPress={() => setPrinterFilter('all')} />
                {printers.map(printer => (
                  <Chip
                    key={printer.id}
                    label={printer.name}
                    selected={printerFilter === printer.id}
                    onPress={() => setPrinterFilter(printer.id)}
                  />
                ))}
              </ScrollView>

              {tagSummary.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Chip label="All tags" selected={tagFilter === null} onPress={() => setTagFilter(null)} />
                  {tagSummary.map(tag => (
                    <Chip
                      key={tag.name}
                      label={`${tag.name} (${tag.count})`}
                      selected={tagFilter === tag.name}
                      onPress={() => setTagFilter(tag.name)}
                    />
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.headerActions}>
                <PrimaryButton
                  label={viewMode === 'grid' ? 'List view' : 'Grid view'}
                  variant="secondary"
                  onPress={() => setViewMode(current => (current === 'grid' ? 'list' : 'grid'))}
                />
                <PrimaryButton
                  label={selectionMode ? 'Done selecting' : 'Select archives'}
                  variant="secondary"
                  onPress={() => {
                    if (selectionMode) setSelectedIds([]);
                    setSelectionMode(current => !current);
                  }}
                />
                <PrimaryButton label="Export" variant="secondary" onPress={() => setShowExportModal(true)} />
                <PrimaryButton label="Purge" variant="secondary" onPress={() => setShowPurgeModal(true)} />
                <PrimaryButton label="Manage tags" variant="secondary" onPress={() => setShowTagSummary(true)} />
                {selectedIds.length >= 2 && selectedIds.length <= 5 ? (
                  <PrimaryButton label={`Compare (${selectedIds.length})`} onPress={() => setCompareIds(selectedIds)} />
                ) : null}
              </View>
            </SectionCard>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📦"
            title="No archives found"
            message="Try relaxing your search or filters. Completed prints appear here with thumbnails, tags, material, cost, and reprint actions."
          />
        }
      />

      {(selectionMode || selectedIds.length > 0) && filteredArchives.length > 0 ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionActions}>
            <PrimaryButton
              label={allSelected ? 'Clear selection' : 'Select all'}
              variant="secondary"
              onPress={() => setSelectedIds(allSelected ? [] : filteredArchives.map(archive => archive.id))}
            />
            {selectedIds.length > 0 ? (
              <Text style={[styles.selectionText, { color: colors.text }]}>
                {selectedIds.length} selected
              </Text>
            ) : null}
            {selectedIds.length > 0 ? (
              <PrimaryButton
                label="Edit tags"
                variant="secondary"
                onPress={() => {
                  setTagsArchiveIds(selectedIds);
                  const selectedArchives = archives.filter(archive => selectedIds.includes(archive.id));
                  const shared = selectedArchives[0]?.tags ?? '';
                  setTagsDraft(shared);
                }}
              />
            ) : null}
            {selectedIds.length >= 2 && selectedIds.length <= 5 ? (
              <PrimaryButton label="Compare" onPress={() => setCompareIds(selectedIds)} />
            ) : null}
            {selectedIds.length > 0 ? (
              <PrimaryButton
                label="Delete"
                variant="danger"
                onPress={() => {
                  bulkDeleteMutation.mutate(selectedIds);
                }}
              />
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <CompareArchivesModal
        visible={compareArchives.length >= 2 && compareArchives.length <= 5}
        archives={compareArchives}
        onClose={() => setCompareIds([])}
      />

      <SimpleModal
        visible={showExportModal}
        title="Export archives"
        subtitle="Share the current archive list as CSV or JSON."
        onClose={() => setShowExportModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['csv', 'json'] as const).map(format => (
            <Chip
              key={format}
              label={format.toUpperCase()}
              selected={exportFormat === format}
              onPress={() => setExportFormat(format)}
            />
          ))}
        </ScrollView>
        <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>
          {exportFormat === 'json'
            ? 'JSON export mirrors the exact filtered results shown on this screen.'
            : hasUnsupportedServerExportFilters
              ? 'CSV export is generated from the currently filtered results to preserve tag, favorite, and duplicate filters.'
              : 'CSV export uses the archive export endpoint with your current toolbar filters.'}
        </Text>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowExportModal(false)} />
          <PrimaryButton
            label={exportMutation.isPending ? 'Preparing…' : `Share ${exportFormat.toUpperCase()}`}
            onPress={() => void exportMutation.mutateAsync()}
            disabled={exportMutation.isPending}
          />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={showPurgeModal}
        title="Purge archives"
        subtitle="Preview archived files that match the purge threshold before deleting them."
        onClose={() => setShowPurgeModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {[30, 60, 90, 180, 365].map(days => (
            <Chip
              key={days}
              label={`${days} days`}
              selected={purgeDays === days}
              onPress={() => setPurgeDays(days)}
            />
          ))}
        </ScrollView>
        <Pressable
          onPress={() => setPurgeStats(current => !current)}
          style={[styles.toggleRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Also purge stats</Text>
            <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>Hard-delete archived rows and remove them from Quick Stats totals.</Text>
          </View>
          {purgeStats ? (
            <CheckCircle size={18} color={colors.success} strokeWidth={2} />
          ) : (
            <Pause size={18} color={colors.textSecondary} strokeWidth={2} />
          )}
        </Pressable>
        <View style={[styles.previewCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.previewTitle, { color: colors.text }]}>Preview</Text>
          <Text style={[styles.previewValue, { color: colors.textSecondary }]}>
            {archivePurgePreviewQuery.isLoading
              ? 'Calculating…'
              : `${pickNumber(archivePurgePreviewQuery.data, ['count'], 0)} archive(s) • ${Math.round(pickNumber(archivePurgePreviewQuery.data, ['total_bytes'], 0) / 1024 / 1024)} MB`}
          </Text>
          {pickArray(archivePurgePreviewQuery.data as Record<string, unknown>, ['sample_filenames']).slice(0, 5).map(sample => (
            <Text key={String(sample)} style={[styles.previewSample, { color: colors.textSecondary }]}>• {String(sample)}</Text>
          ))}
        </View>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setShowPurgeModal(false)} />
          <PrimaryButton label="Confirm purge" variant="danger" onPress={() => setShowPurgeConfirm(true)} />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={photosArchive !== null}
        title={photosArchive ? `${photosArchive.print_name || photosArchive.filename} photos` : 'Photos'}
        subtitle="Photo attachments from the archive card."
        onClose={() => setPhotosArchive(null)}
      >
        <ScrollView style={styles.modalScroll}>
          {photosArchive?.photos?.map(photo => (
            <View key={photo} style={[styles.simpleListItem, { borderColor: colors.borderSubtle }]}> 
              <Camera size={16} color={colors.info} strokeWidth={2} />
              <Text style={[styles.simpleListText, { color: colors.text }]}>{photo}</Text>
            </View>
          ))}
          {!photosArchive?.photos?.length ? (
            <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>No photos are attached to this archive.</Text>
          ) : null}
        </ScrollView>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setPhotosArchive(null)} />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={qrArchive !== null}
        title={qrArchive ? `${qrArchive.print_name || qrArchive.filename} links` : 'Archive links'}
        subtitle="The web app shows a QR code here; mobile exposes the same shareable links directly."
        onClose={() => setQrArchive(null)}
      >
        <View style={styles.linkSection}>
          <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>Archive download</Text>
          <Text style={[styles.linkValue, { color: colors.text }]}>{qrArchive ? api.getArchiveThumbnail(qrArchive.id).replace('/thumbnail', '') : ''}</Text>
          <PrimaryButton
            label="Copy archive link"
            variant="secondary"
            onPress={() => {
              if (!qrArchive) return;
              const value = api.getArchiveThumbnail(qrArchive.id).replace('/thumbnail', '');
              Clipboard.setString(value);
              showToast('Archive link copied.', 'success');
            }}
          />
        </View>
        {qrArchive?.timelapse_path ? (
          <View style={styles.linkSection}>
            <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>Timelapse</Text>
            <Text style={[styles.linkValue, { color: colors.text }]}>{api.getArchiveTimelapse(qrArchive.id)}</Text>
            <PrimaryButton
              label="Copy timelapse link"
              variant="secondary"
              onPress={() => {
                if (!qrArchive) return;
                Clipboard.setString(api.getArchiveTimelapse(qrArchive.id));
                showToast('Timelapse link copied.', 'success');
              }}
            />
          </View>
        ) : null}
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setQrArchive(null)} />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={tagsArchiveIds.length > 0}
        title="Edit tags"
        subtitle="Assign comma-separated tags to the selected archives."
        onClose={() => setTagsArchiveIds([])}
      >
        <TextField
          label="Tags"
          multiline
          value={tagsDraft}
          onChangeText={setTagsDraft}
          placeholder="quality-check, customer-a, pla"
        />
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setTagsArchiveIds([])} />
          <PrimaryButton
            label={tagMutation.isPending ? 'Saving…' : 'Save tags'}
            onPress={() => {
              tagMutation.mutate({ ids: tagsArchiveIds, tags: tagsDraft });
            }}
            disabled={tagMutation.isPending}
          />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={showTagSummary}
        title="Tag management"
        subtitle="Tap a tag to filter archives, or clear the filter from the chip rail above."
        onClose={() => setShowTagSummary(false)}
      >
        <ScrollView style={styles.modalScroll}>
          {tagSummary.map(tag => (
            <Pressable
              key={tag.name}
              onPress={() => {
                setTagFilter(tag.name);
                setShowTagSummary(false);
              }}
              style={[styles.simpleListItem, { borderColor: colors.borderSubtle }]}
            >
              <Text style={[styles.simpleListText, { color: colors.text }]}>{tag.name}</Text>
              <Text style={[styles.simpleListMeta, { color: colors.textSecondary }]}>{tag.count}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setShowTagSummary(false)} />
        </View>
      </SimpleModal>

      <ConfirmModal
        visible={showPurgeConfirm}
        onClose={() => setShowPurgeConfirm(false)}
        onConfirm={() => {
          void purgeMutation.mutateAsync();
        }}
        title="Purge matching archives?"
        message={`This will remove archives older than ${purgeDays} days${purgeStats ? ' and purge their stats' : ''}.`}
        confirmLabel="Purge"
        loading={purgeMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 132,
    gap: spacing.lg,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStack: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  statsRow: {
    gap: spacing.md,
  },
  filterRow: {
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  archiveCell: {
    marginBottom: spacing.md,
  },
  listCell: {
    width: '100%',
  },
  gridCell: {
    flex: 1,
  },
  gridRow: {
    gap: spacing.md,
  },
  selectionBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  selectionActions: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing['4xl'],
  },
  modalCard: {
    borderWidth: 1,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  modalBodyText: {
    fontSize: fontSize.sm,
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  compareRow: {
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  compareLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  compareValue: {
    fontSize: fontSize.sm,
  },
  simpleListItem: {
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  simpleListText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  simpleListMeta: {
    fontSize: fontSize.sm,
  },
  linkSection: {
    gap: spacing.sm,
  },
  linkLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  linkValue: {
    fontSize: fontSize.sm,
  },
  toggleRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  toggleSubtitle: {
    fontSize: fontSize.sm,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  previewTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  previewValue: {
    fontSize: fontSize.sm,
  },
  previewSample: {
    fontSize: fontSize.sm,
  },
});
