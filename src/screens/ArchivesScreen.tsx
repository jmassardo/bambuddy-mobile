import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CheckCircle, Download, Pause, X } from 'lucide-react-native';
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
import { SliceModal } from '@/components/files/SliceModal';
import { RunWithPipelineModal } from '@/components/slicing/RunWithPipelineModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useArchiveFiltersStore } from '@/store/archiveFiltersStore';
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
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { ArchiveBatchDialog, ArchiveBrowseControls, ArchiveTagCatalog, initialBrowseOptions } from '@/components/archives/ArchiveBrowseControls';
import { ArchiveDeleteDialog, ArchiveIngestionPanel, ArchivePhotoGallery, ConfirmOutcomeDialog } from '@/components/archives/ArchiveWorkflowUI';
import { browseArchives } from '@/utils/archiveWorkflows';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaToken } from '@/hooks/useStreamToken';
import { PrintModal } from '@/components/printers/PrintModal';

type ArchiveViewMode = 'list' | 'grid';

function toArchives(value: unknown): Archive[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as Archive[];
}

function rangeCutoff(range: string) {
  if (range === 'all' || range === 'custom') return 0;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function tagsForArchive(archive: Archive) {
  return archive.tags
    ?.split(',')
    .map(tag => tag.trim())
    .filter(Boolean) ?? [];
}

function rangeDateFrom(range: string) {
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
  const { t } = useTranslation();
  const { token: mediaToken } = useMediaToken();
  const { user, hasPermission } = useAuth();
  const [browse, setBrowse] = useState(initialBrowseOptions);
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);
  const [launchId, setLaunchId] = useState<number | null>(null);
  const [pipelineArchive, setPipelineArchive] = useState<Archive | null>(null);
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [customPurgeDays, setCustomPurgeDays] = useState('90');
  const canUpdate = (archive: Archive) => hasPermission('archives:update_all') || (archive.created_by_id === user?.id && hasPermission('archives:update_own'));
  const canDelete = (archive: Archive) => hasPermission('archives:delete_all') || (archive.created_by_id === user?.id && hasPermission('archives:delete_own'));
  const { filters, setFilters, loadFilters } = useArchiveFiltersStore();
  const [viewMode, setViewMode] = useState<ArchiveViewMode>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [photosArchive, setPhotosArchive] = useState<Archive | null>(null);
  const [qrArchive, setQrArchive] = useState<Archive | null>(null);
  const [showTagSummary, setShowTagSummary] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv');
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purgeStats, setPurgeStats] = useState(false);
  const [showSliceModal, setShowSliceModal] = useState(false);
  const [sliceArchiveId, setSliceArchiveId] = useState<number | null>(null);
  const [sliceArchiveName, setSliceArchiveName] = useState('');

  const search = filters.search;
  const statusFilter = filters.statusFilter;
  const rangeFilter = filters.rangeFilter;
  const printerFilter = filters.printerFilter;
  const filamentTypeFilter = filters.filamentTypeFilter;
  const tagFilter = filters.tagFilter;
  const aiFilter = filters.aiFilter;

  React.useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

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
    queryFn: () => archiveWorkflows.allArchives(),
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
  const filamentTypes = useMemo(() => {
    const types = new Set<string>();
    archives.forEach(archive => {
      if (archive.filament_type) types.add(archive.filament_type);
    });
    return Array.from(types).sort();
  }, [archives]);
  const tagSummary = useMemo(
    () => (Array.isArray(tagsQuery.data) ? tagsQuery.data : []),
    [tagsQuery.data],
  );
  const stats = (statsQuery.data ?? null) as ArchiveStats | null;

  const favoriteMutation = useMutation({
    mutationFn: (id: number) => archiveWorkflows.favorite(id),
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: ['archives'] });
      const previous = queryClient.getQueryData<Archive[]>(['archives']);
      queryClient.setQueryData<Archive[]>(['archives'], current => current?.map(item => item.id === id ? { ...item, is_favorite: !item.is_favorite } : item));
      return { previous };
    },
    onSuccess: updated => {
      queryClient.setQueryData<Archive[]>(['archives'], current => current?.map(item => item.id === updated.id ? { ...item, is_favorite: updated.is_favorite } : item));
      showToast(t('archives.favoriteUpdated', { defaultValue: 'Favorite updated.' }), 'success');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['archives'], context.previous);
      showToast(error.message, 'error');
    },
  });

  const filteredArchives = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff = rangeCutoff(rangeFilter);
    return browseArchives(archives.filter(archive => {
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
      if (filamentTypeFilter !== 'all' && archive.filament_type !== filamentTypeFilter) return false;
      if (tagFilter && !tagsForArchive(archive).includes(tagFilter)) return false;
      if (statusFilter === 'completed' && archive.status !== 'completed') return false;
      if (statusFilter === 'failed' && archive.status !== 'failed' && archive.status !== 'aborted') return false;
      if (statusFilter === 'running' && archive.status !== 'printing' && archive.status !== 'in_progress') return false;
      if (statusFilter === 'paused' && archive.status !== 'paused' && archive.status !== 'pause') return false;
      if (statusFilter === 'canceled' && archive.status !== 'canceled' && archive.status !== 'cancelled' && archive.status !== 'stopped') return false;
      if (statusFilter === 'favorite' && !archive.is_favorite) return false;
      if (statusFilter === 'duplicate' && archive.duplicate_count === 0) return false;
      if (aiFilter !== 'all' && archive.ai_detection) {
        if (aiFilter === 'ai' && archive.ai_detection.classification !== 'ai') return false;
        if (aiFilter === 'human' && archive.ai_detection.classification !== 'human') return false;
      }
      if (cutoff > 0) {
        const stamp = new Date(archive.completed_at || archive.created_at).getTime();
        if (!Number.isFinite(stamp) || stamp < cutoff) return false;
      }
      return true;
    }), browse);
  }, [archives, printerFilter, filamentTypeFilter, rangeFilter, search, statusFilter, tagFilter, aiFilter, browse]);
  React.useEffect(() => { setPage(0); }, [filters, browse, pageSize]);
  const maxPage = Math.max(0, Math.ceil(filteredArchives.length / pageSize) - 1);

  const compareArchives = useMemo(
    () =>
      compareIds
        .map(id => archives.find(archive => archive.id === id))
        .filter((archive): archive is Archive => Boolean(archive)),
    [archives, compareIds],
  );

  const hasUnsupportedServerExportFilters = Boolean(
    tagFilter || statusFilter === 'favorite' || statusFilter === 'duplicate' ||
    filamentTypeFilter !== 'all' || aiFilter !== 'all' ||
    JSON.stringify(browse) !== JSON.stringify(initialBrowseOptions),
  );

  const exportMutation = useMutation({
    mutationFn: async () => {
      const filenameBase = `bambuddy-archives-${new Date().toISOString().slice(0, 10)}`;
      const rowsToExport = exportScope === 'selected'
        ? archives.filter(a => selectedIds.includes(a.id))
        : filteredArchives;
      if (exportFormat === 'json') {
        const jsonBlobOptions: BlobOptions = {
          type: 'application/json',
          lastModified: Date.now(),
        };
        const blob = new Blob([JSON.stringify(rowsToExport, null, 2)], jsonBlobOptions);
        await shareBlob(blob, `${filenameBase}.json`);
        return;
      }
      if (exportScope === 'selected' || hasUnsupportedServerExportFilters) {
        const csv = toCsv(archiveExportRows(rowsToExport));
        const csvBlobOptions: BlobOptions = {
          type: 'text/csv',
          lastModified: Date.now(),
        };
        const blob = new Blob([csv], csvBlobOptions);
        await shareBlob(blob, `${filenameBase}.csv`);
        return;
      }
      const blob = await api.exportArchives({
        format: exportFormat === 'xlsx' ? 'xlsx' : 'csv',
        fields: [
          'id', 'print_name', 'filename', 'printer_name', 'project_name',
          'status', 'completed_at', 'filament_type', 'filament_color',
          'filament_used_grams', 'cost', 'tags',
        ],
        printerId: printerFilter === 'all' ? undefined : printerFilter,
        status:
          statusFilter === 'completed'
            ? 'completed'
            : statusFilter === 'failed'
              ? 'failed'
              : statusFilter === 'canceled'
                ? 'cancelled'
                : undefined,
        dateFrom: rangeDateFrom(rangeFilter),
        search: search.trim() || undefined,
      });
      await shareBlob(blob, `${filenameBase}.${exportFormat}`);
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
  const qrExportMutation = useMutation({
    mutationFn: async () => {
      if (qrArchive) await shareBlob(await archiveWorkflows.download(qrArchive.id, 'qrcode'), `archive-${qrArchive.id}-qr.png`);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
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
    running: archives.filter(archive => archive.status === 'printing' || archive.status === 'in_progress').length,
    paused: archives.filter(archive => archive.status === 'paused' || archive.status === 'pause').length,
    canceled: archives.filter(archive => archive.status === 'canceled' || archive.status === 'cancelled' || archive.status === 'stopped').length,
    favorite: archives.filter(archive => archive.is_favorite).length,
    duplicate: archives.filter(archive => archive.duplicate_count > 0).length,
  };
  const aiCounts = {
    all: archives.length,
    ai: archives.filter(a => a.ai_detection?.classification === 'ai').length,
    human: archives.filter(a => a.ai_detection?.classification === 'human').length,
    any: archives.filter(a => Boolean(a.ai_detection)).length,
  };

  const toggleSelected = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const allSelected = filteredArchives.length > 0 && selectedIds.length === filteredArchives.length;

  if (archivesQuery.isLoading || printersQuery.isLoading) {
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
        extraData={mediaToken}
        key={viewMode}
        data={filteredArchives.slice(page * pageSize, (page + 1) * pageSize)}
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
              onReprint={() => setLaunchId(item.id)}
              onFavorite={canUpdate(item) ? () => favoriteMutation.mutate(item.id) : undefined}
              onPipeline={hasPermission('pipelines:run') ? () => setPipelineArchive(item) : undefined}
              onOutcome={canUpdate(item) && item.status === 'completed' && item.confirm_requested && item.user_verdict == null ? () => setOutcomeId(item.id) : undefined}
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
              onDelete={canDelete(item) ? () => setDeletingIds([item.id]) : undefined}
              onSlice={() => {
                setSliceArchiveId(item.id);
                setSliceArchiveName(item.print_name || item.filename);
                setShowSliceModal(true);
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
            <ArchiveIngestionPanel />
            <ArchiveBrowseControls archives={archives} options={browse} onChange={setBrowse} />
            <SectionCard title={t('archives.pages', { defaultValue: '{{count}} matching archives · page {{page}} / {{pages}}', count: filteredArchives.length, page: page + 1, pages: maxPage + 1 })}>
              <View style={styles.filterRow}>{[25, 50, 100, 200].map(size => <Chip key={size} label={String(size)} selected={size === pageSize} onPress={() => setPageSize(size)} />)}</View>
              <View style={styles.filterRow}>
                <PrimaryButton label={t('common.first', { defaultValue: 'First' })} disabled={page === 0} onPress={() => setPage(0)} />
                <PrimaryButton label={t('common.previous', { defaultValue: 'Previous' })} disabled={page === 0} onPress={() => setPage(page - 1)} />
                <PrimaryButton label={t('common.next', { defaultValue: 'Next' })} disabled={page >= maxPage} onPress={() => setPage(page + 1)} />
                <PrimaryButton label={t('common.last', { defaultValue: 'Last' })} disabled={page >= maxPage} onPress={() => setPage(maxPage)} />
              </View>
            </SectionCard>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
              <StatCard label="Filtered" value={String(filteredArchives.length)} helper={`${archives.length} total`} />
              <StatCard label="Successful" value={String(stats?.successful_prints ?? 0)} helper="Archive stats" />
              <StatCard label="Failed" value={String(stats?.failed_prints ?? 0)} helper="Archive stats" />
              <StatCard label="Print time" value={formatDuration(Math.round((stats?.total_print_time_hours ?? 0) * 3600))} helper="All archives" />
              <StatCard label="Cost" value={formatCurrency(stats?.total_cost ?? 0)} helper="All archives" />
            </ScrollView>

            <SectionCard title="Archive browser" subtitle="Web-style search, filters, compare mode, tags, and actions for reprints, timelapses, photos, QR links, and deletes.">
              <SearchBar value={search} onChangeText={text => setFilters({ search: text })} placeholder="Search print name, filename, printer, material, tags, or notes" />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', 'completed', 'failed', 'running', 'paused', 'canceled', 'favorite', 'duplicate'] as const).map(status => (
                  <Chip
                    key={status}
                    label={`${status[0].toUpperCase()}${status.slice(1)}${statusCounts[status as keyof typeof statusCounts] ? ` (${statusCounts[status as keyof typeof statusCounts]})` : ''}`}
                    selected={statusFilter === status}
                    onPress={() => setFilters({ statusFilter: status as typeof statusFilter })}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', 'ai', 'human', 'any'] as const).map(mode => (
                  <Chip
                    key={mode}
                    label={`${mode === 'ai' ? '🤖 AI' : mode === 'human' ? '👤 Human' : mode === 'any' ? '📊 Any' : 'All AI'}${aiCounts[mode] ? ` (${aiCounts[mode]})` : ''}`}
                    selected={aiFilter === mode}
                    onPress={() => setFilters({ aiFilter: mode })}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', '7d', '30d', '90d'] as const).map(range => (
                  <Chip
                    key={range}
                    label={range === 'all' ? 'All dates' : `${range.toUpperCase()} range`}
                    selected={rangeFilter === range}
                    onPress={() => setFilters({ rangeFilter: range as typeof rangeFilter })}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <Chip label="All printers" selected={printerFilter === 'all'} onPress={() => setFilters({ printerFilter: 'all' })} />
                {printers.map(printer => (
                  <Chip
                    key={printer.id}
                    label={printer.name}
                    selected={printerFilter === printer.id}
                    onPress={() => setFilters({ printerFilter: printer.id })}
                  />
                ))}
              </ScrollView>

              {filamentTypes.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Chip label="All materials" selected={filamentTypeFilter === 'all'} onPress={() => setFilters({ filamentTypeFilter: 'all' })} />
                  {filamentTypes.map(type => {
                    const count = archives.filter(a => a.filament_type === type).length;
                    return (
                      <Chip
                        key={type}
                        label={`${type} (${count})`}
                        selected={filamentTypeFilter === type}
                        onPress={() => setFilters({ filamentTypeFilter: type })}
                      />
                    );
                  })}
                </ScrollView>
              ) : null}

              {tagSummary.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Chip label="All tags" selected={tagFilter === null} onPress={() => setFilters({ tagFilter: null })} />
                  {tagSummary.map(tag => (
                    <Chip
                      key={tag.name}
                      label={`${tag.name} (${tag.count})`}
                      selected={tagFilter === tag.name}
                      onPress={() => setFilters({ tagFilter: tag.name })}
                    />
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.headerActions}>
                {(statusFilter !== 'all' || rangeFilter !== 'all' || printerFilter !== 'all' || filamentTypeFilter !== 'all' || tagFilter != null || aiFilter !== 'all') ? (
                  <PrimaryButton
                    label="Clear filters"
                    variant="secondary"
                    onPress={() => {
                      setFilters({ statusFilter: 'all', rangeFilter: 'all', printerFilter: 'all', filamentTypeFilter: 'all', tagFilter: null, aiFilter: 'all', search: '' });
                    }}
                  />
                ) : null}
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
                label={t('archives.batch', { defaultValue: 'Tags / project / favorites' })}
                variant="secondary"
                disabled={archives.some(item => selectedIds.includes(item.id) && !canUpdate(item))}
                onPress={() => {
                  setBatchIds(selectedIds);
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
                disabled={archives.some(item => selectedIds.includes(item.id) && !canDelete(item))}
                onPress={() => {
                  setDeletingIds(selectedIds);
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
      {batchIds.length ? <ArchiveBatchDialog archives={archives.filter(item => batchIds.includes(item.id) && canUpdate(item))} onClose={() => setBatchIds([])} /> : null}
      {deletingIds.length ? <ArchiveDeleteDialog archives={archives.filter(item => deletingIds.includes(item.id) && canDelete(item))} onClose={() => setDeletingIds([])} onDeleted={() => setSelectedIds([])} /> : null}
      {launchId !== null ? <PrintModal visible onClose={() => setLaunchId(null)} {...{ initialArchiveId: launchId, initialMode: 'asap' as const }} /> : null}
      {outcomeId !== null ? <ConfirmOutcomeDialog archiveId={outcomeId} onClose={() => setOutcomeId(null)} onReprint={setLaunchId} /> : null}
      {pipelineArchive ? <RunWithPipelineModal visible onClose={() => setPipelineArchive(null)} sourceType="archive" sourceId={pipelineArchive.id} sourceName={pipelineArchive.print_name || pipelineArchive.filename} /> : null}

      <SimpleModal
        visible={showExportModal}
        title="Export archives"
        subtitle="Share the current archive list as CSV, Excel, or JSON."
        onClose={() => setShowExportModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['csv', 'xlsx', 'json'] as const).map(format => (
            <Chip
              key={format}
              label={format === 'xlsx' ? 'EXCEL' : format.toUpperCase()}
              selected={exportFormat === format}
              onPress={() => setExportFormat(format)}
            />
          ))}
        </ScrollView>
        {selectedIds.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['all', 'selected'] as const).map(scope => (
              <Chip
                key={scope}
                label={scope === 'selected' ? `Selected only (${selectedIds.length})` : 'All filtered'}
                selected={exportScope === scope}
                onPress={() => setExportScope(scope as typeof exportScope)}
              />
            ))}
          </ScrollView>
        ) : null}
        <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>
          {exportFormat === 'json'
            ? 'JSON export mirrors the exact filtered results shown on this screen.'
            : exportScope === 'selected'
              ? 'Exported as CSV to preserve the selected archive set.'
              : hasUnsupportedServerExportFilters
                ? 'CSV export is generated from the currently filtered results to preserve tag, favorite, and duplicate filters.'
                : exportFormat === 'xlsx'
                  ? 'Excel export uses the archive export endpoint with your current toolbar filters.'
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
              onPress={() => { setPurgeDays(days); setCustomPurgeDays(String(days)); }}
            />
          ))}
        </ScrollView>
        <TextField label={t('archives.purgeCustomDays', { defaultValue: 'Custom archive age in days (1–3650)' })} value={customPurgeDays} keyboardType="number-pad" onChangeText={value => {
          setCustomPurgeDays(value);
          const parsed = Number(value);
          if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650) setPurgeDays(parsed);
        }} />
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
          <PrimaryButton label="Confirm purge" variant="danger" disabled={!Number.isInteger(Number(customPurgeDays)) || Number(customPurgeDays) < 1 || Number(customPurgeDays) > 3650} onPress={() => setShowPurgeConfirm(true)} />
        </View>
      </SimpleModal>

      {photosArchive ? <ArchivePhotoGallery archive={photosArchive} onClose={() => setPhotosArchive(null)} /> : null}

      <SimpleModal
        visible={qrArchive !== null}
        title={qrArchive ? `${qrArchive.print_name || qrArchive.filename} links` : 'Archive links'}
        subtitle={t('archives.qrSubtitle', { defaultValue: 'Scan or save the QR image to download the original printable file.' })}
        onClose={() => setQrArchive(null)}
      >
        {qrArchive ? <Image source={{ uri: api.getArchiveQRCode(qrArchive.id) }} style={styles.qrImage} /> : null}
        <PrimaryButton label={t('archives.saveQr', { defaultValue: 'Save / share QR image' })} loading={qrExportMutation.isPending} onPress={() => qrExportMutation.mutate()} />
        <View style={styles.linkSection}>
          <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>Archive download</Text>
          <Text style={[styles.linkValue, { color: colors.text }]}>{qrArchive ? archiveWorkflows.downloadUrl(qrArchive.id) : ''}</Text>
          <PrimaryButton
            label="Copy archive link"
            variant="secondary"
            onPress={() => {
              if (!qrArchive) return;
              const value = archiveWorkflows.downloadUrl(qrArchive.id);
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

      {showTagSummary ? <ArchiveTagCatalog onClose={() => setShowTagSummary(false)} /> : null}

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

       {sliceArchiveId != null ? (
         <SliceModal
           visible={showSliceModal}
           onClose={() => {
             setShowSliceModal(false);
             setSliceArchiveId(null);
             setSliceArchiveName('');
           }}
           sourceType="archive"
           sourceId={sliceArchiveId}
           sourceName={sliceArchiveName}
         />
       ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  qrImage: { width: 200, height: 200, alignSelf: 'center' },
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
