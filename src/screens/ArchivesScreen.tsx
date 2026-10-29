import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useState } from 'react';
import { localizedStatus } from '@/utils/statusLabel';
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
import { CheckCircle, Download, Ellipsis, Pause, SlidersHorizontal, X } from 'lucide-react-native';
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
  useNativeLocale();
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
  const titleLocale = useNativeLocale();
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
  const [showFilters, setShowFilters] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const listRef = React.useRef<FlatList<Archive>>(null);
  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
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
       
      title: translateNative('nav.archives'),
      headerRight: () => (
        <Pressable onPress={() => setShowExportModal(true)} style={styles.headerButton} hitSlop={8}>
          <Download size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      ),
    });
  }, [colors.text, navigation, titleLocale]);

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

  const archives = useLocalizedMemo(() => toArchives(archivesQuery.data), [archivesQuery.data]);
  const printers = useLocalizedMemo(
    () => (Array.isArray(printersQuery.data) ? (printersQuery.data as unknown as Printer[]) : []),
    [printersQuery.data],
  );
  const filamentTypes = useLocalizedMemo(() => {
    const types = new Set<string>();
    archives.forEach(archive => {
      if (archive.filament_type) types.add(archive.filament_type);
    });
    return Array.from(types).sort();
  }, [archives]);
  const tagSummary = useLocalizedMemo(
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
      showToast(nativeMessage('archives.favoriteUpdated', () => ({ defaultValue: 'Favorite updated.' })), 'success');
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['archives'], context.previous);
      showToast(error.message, 'error');
    },
  });

  const filteredArchives = useLocalizedMemo(() => {
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

  const compareArchives = useLocalizedMemo(
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
      showToast(nativeMessage('native.6e87274835985d3c', () => ({ value0: String(exportFormat.toUpperCase()) })), 'success');
      setShowExportModal(false);
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.7a6f24449f5fce9c'), 'error'),
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
      showToast(nativeMessage('native.6bf1e766e03e262e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.0f6a5a92ddb86572'), 'error'),
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
    return <LoadingScreen message={translateNative('native.6aa2126399895070')} />;
  }

  if (archivesQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.5d99f4a3a6a37f9e')}
        onRetry={() => {
          refreshAll();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        ref={listRef}
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
                  showToast(nativeMessage('native.e7606e7c893b7ccf'), 'warning');
                  return;
                }
                Linking.openURL(api.getArchiveTimelapse(item.id)).catch(() => {
                  showToast(nativeMessage('native.650451ed93d5493d'), 'error');
                });
              }}
              onPhotos={() => {
                if (!item.photos?.length) {
                  showToast(nativeMessage('native.9776cec29f9bab40'), 'warning');
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
            <View style={styles.toolbar}>
              <View style={styles.toolbarSearch}>
                <SearchBar value={search} onChangeText={text => setFilters({ search: text })} placeholder={translateNative('native.ca2f9500682b69bd')} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.filters')} accessibilityState={{ expanded: showFilters, selected: statusFilter !== 'all' || rangeFilter !== 'all' || printerFilter !== 'all' || filamentTypeFilter !== 'all' || tagFilter !== null || aiFilter !== 'all' }} onPress={() => setShowFilters(value => !value)} style={[styles.toolbarButton, { backgroundColor: showFilters ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}>
                <SlidersHorizontal size={18} color={colors.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('nav.more')} accessibilityState={{ expanded: showTools }} onPress={() => setShowTools(value => !value)} style={[styles.toolbarButton, { backgroundColor: showTools ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}>
                <Ellipsis size={18} color={colors.text} />
              </Pressable>
            </View>
            {showTools ? <>
            <ArchiveIngestionPanel />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
              <StatCard label={translateNative('native.6d57baccade5ba80')} value={String(filteredArchives.length)} helper={translateNative('native.4fd8680d181245e0', { value0: String(archives.length) })} />
              <StatCard label={translateNative('native.e674ffca8f9210c5')} value={String(stats?.successful_prints ?? 0)} helper={translateNative('native.0db89c0245abe34e')} />
              <StatCard label={translateNative('native.4951b5090ada997d')} value={String(stats?.failed_prints ?? 0)} helper={translateNative('native.0db89c0245abe34e')} />
              <StatCard label={translateNative('native.e3f6c45e9f8c8d80')} value={formatDuration(Math.round((stats?.total_print_time_hours ?? 0) * 3600))} helper={translateNative('native.d94e443f85c0eaec')} />
              <StatCard label={translateNative('common.cost')} value={formatCurrency(stats?.total_cost ?? 0)} helper={translateNative('native.d94e443f85c0eaec')} />
            </ScrollView>
            </> : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', 'completed', 'failed', 'running', 'paused', 'canceled', 'favorite', 'duplicate'] as const).map(status => (
                  <Chip
                    key={status}
                    label={`${localizedStatus(`${status[0].toUpperCase()}${status.slice(1)}`)}${statusCounts[status as keyof typeof statusCounts] ? ` (${statusCounts[status as keyof typeof statusCounts]})` : ''}`}
                    selected={statusFilter === status}
                    onPress={() => setFilters({ statusFilter: status as typeof statusFilter })}
                  />
                ))}
              </ScrollView>

              {showFilters ? <SectionCard title={t('common.filters')}>
              <ArchiveBrowseControls archives={archives} options={browse} onChange={setBrowse} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', 'ai', 'human', 'any'] as const).map(mode => (
                  <Chip
                    key={mode}
                    label={`${mode === 'ai' ? translateNative('native.d2c6b846d935ca90') : mode === 'human' ? translateNative('native.681d8a7582550951') : mode === 'any' ? translateNative('native.5b9a56a46ded49c9') : translateNative('native.3b8ba9544dd0954a')}${aiCounts[mode] ? ` (${aiCounts[mode]})` : ''}`}
                    selected={aiFilter === mode}
                    onPress={() => setFilters({ aiFilter: mode })}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(['all', '7d', '30d', '90d'] as const).map(range => (
                  <Chip
                    key={range}
                    label={range === 'all' ? translateNative('native.6a4df68fe1f54b97') : translateNative('native.a691550c633b8b12', { value0: String(range.toUpperCase()) })}
                    selected={rangeFilter === range}
                    onPress={() => setFilters({ rangeFilter: range as typeof rangeFilter })}
                  />
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <Chip label={translateNative('native.b8ed6cb4c204100e')} selected={printerFilter === 'all'} onPress={() => setFilters({ printerFilter: 'all' })} />
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
                  <Chip label={translateNative('native.cb99589cb80a2f82')} selected={filamentTypeFilter === 'all'} onPress={() => setFilters({ filamentTypeFilter: 'all' })} />
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
                  <Chip label={translateNative('native.692a97addc4befcc')} selected={tagFilter === null} onPress={() => setFilters({ tagFilter: null })} />
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

                {(statusFilter !== 'all' || rangeFilter !== 'all' || printerFilter !== 'all' || filamentTypeFilter !== 'all' || tagFilter != null || aiFilter !== 'all') ? (
                  <PrimaryButton
                    label={translateNative('native.42cc919f7bae50c1')}
                    variant="secondary"
                    onPress={() => {
                      setFilters({ statusFilter: 'all', rangeFilter: 'all', printerFilter: 'all', filamentTypeFilter: 'all', tagFilter: null, aiFilter: 'all', search: '' });
                    }}
                  />
                ) : null}
              </SectionCard> : null}
              {showTools ? <View style={styles.headerActions}>
                <PrimaryButton
                  label={viewMode === 'grid' ? translateNative('native.33b836845ee11768') : translateNative('native.7dec88bad08e1b80')}
                  variant="secondary"
                  onPress={() => setViewMode(current => (current === 'grid' ? 'list' : 'grid'))}
                />
                <PrimaryButton
                  label={selectionMode ? translateNative('native.e22a6bd45a2255c3') : translateNative('native.336b9805481fc016')}
                  variant="secondary"
                  onPress={() => {
                    if (selectionMode) setSelectedIds([]);
                    setSelectionMode(current => !current);
                  }}
                />
                <PrimaryButton label={translateNative('native.d2ff97dc9d5b8666')} variant="secondary" onPress={() => setShowExportModal(true)} />
                <PrimaryButton label={translateNative('native.687d0955d943e9c4')} variant="secondary" onPress={() => setShowPurgeModal(true)} />
                <PrimaryButton label={translateNative('native.ada94657acb47627')} variant="secondary" onPress={() => setShowTagSummary(true)} />
                {selectedIds.length >= 2 && selectedIds.length <= 5 ? (
                  <PrimaryButton label={translateNative('native.e17e75c9c6578978', { value0: String(selectedIds.length) })} onPress={() => setCompareIds(selectedIds)} />
                ) : null}
              </View> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📦"
            title={translateNative('native.cfdf637966a04a08')}
            message={translateNative('native.6b00500109571eaf')}
          />
        }
        ListFooterComponent={
          <SectionCard title={t('archives.pages', { defaultValue: '{{count}} matching archives · page {{page}} / {{pages}}', count: filteredArchives.length, page: page + 1, pages: maxPage + 1 })}>
            <View style={styles.filterRow}>{[25, 50, 100, 200].map(size => <Chip key={size} label={String(size)} selected={size === pageSize} onPress={() => { setPageSize(size); goToPage(0); }} />)}</View>
            <View style={styles.filterRow}>
              <PrimaryButton label={t('common.first', { defaultValue: 'First' })} disabled={page === 0} onPress={() => goToPage(0)} />
              <PrimaryButton label={t('common.previous', { defaultValue: 'Previous' })} disabled={page === 0} onPress={() => goToPage(page - 1)} />
              <PrimaryButton label={t('common.next', { defaultValue: 'Next' })} disabled={page >= maxPage} onPress={() => goToPage(page + 1)} />
              <PrimaryButton label={t('common.last', { defaultValue: 'Last' })} disabled={page >= maxPage} onPress={() => goToPage(maxPage)} />
            </View>
          </SectionCard>
        }
      />

      {(selectionMode || selectedIds.length > 0) && filteredArchives.length > 0 ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionActions}>
            <PrimaryButton
              label={allSelected ? translateNative('native.1a163117d04ef04b') : translateNative('native.6e543cfc5195d3b4')}
              variant="secondary"
              onPress={() => setSelectedIds(allSelected ? [] : filteredArchives.map(archive => archive.id))}
            />
            {selectedIds.length > 0 ? (
              <Text style={[styles.selectionText, { color: colors.text }]}><NativeTranslation id="native.df8179da1ed8585c" values={{ value0: (selectedIds.length) }} /></Text>
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
              <PrimaryButton label={translateNative('native.2b0bbb607e3e5cfb')} onPress={() => setCompareIds(selectedIds)} />
            ) : null}
            {selectedIds.length > 0 ? (
              <PrimaryButton
                label={translateNative('common.delete')}
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
        title={translateNative('native.1c64074bb83fd9b9')}
        subtitle={translateNative('native.f0da084b5d4c4666')}
        onClose={() => setShowExportModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['csv', 'xlsx', 'json'] as const).map(format => (
            <Chip
              key={format}
              label={format === 'xlsx' ? translateNative('native.fe23ff62085c2fd8') : format.toUpperCase()}
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
                label={scope === 'selected' ? translateNative('native.7adc8d12e2b8af17', { value0: String(selectedIds.length) }) : translateNative('native.ea318478bfd6f6e0')}
                selected={exportScope === scope}
                onPress={() => setExportScope(scope as typeof exportScope)}
              />
            ))}
          </ScrollView>
        ) : null}
        <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>
          {exportFormat === 'json'
            ? translateNative('native.ef0b7acbee345ed4')
            : exportScope === 'selected'
              ? translateNative('native.6bbb310644c1b2ad')
              : hasUnsupportedServerExportFilters
                ? translateNative('native.6a6fcebcf25cac4c')
                : exportFormat === 'xlsx'
                  ? translateNative('native.6cf6d655c1744a94')
                  : translateNative('native.52c91a546b119978')}
        </Text>
        <View style={styles.modalFooter}>
          <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => setShowExportModal(false)} />
          <PrimaryButton
            label={exportMutation.isPending ? translateNative('native.e0a20d4245e5f839') : translateNative('native.bf1348295874e772', { value0: String(exportFormat.toUpperCase()) })}
            onPress={() => void exportMutation.mutateAsync()}
            disabled={exportMutation.isPending}
          />
        </View>
      </SimpleModal>

      <SimpleModal
        visible={showPurgeModal}
        title={translateNative('native.58137dd883ad40b5')}
        subtitle={translateNative('native.4c827d6563941909')}
        onClose={() => setShowPurgeModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {[30, 60, 90, 180, 365].map(days => (
            <Chip
              key={days}
              label={translateNative('native.f8779b248fc4b5e3', { value0: String(days) })}
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
            <Text style={[styles.toggleTitle, { color: colors.text }]}>{translateNative('native.590b5102786688da')}</Text>
            <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>{translateNative('native.92ec8d623f032fb7')}</Text>
          </View>
          {purgeStats ? (
            <CheckCircle size={18} color={colors.success} strokeWidth={2} />
          ) : (
            <Pause size={18} color={colors.textSecondary} strokeWidth={2} />
          )}
        </Pressable>
        <View style={[styles.previewCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.previewTitle, { color: colors.text }]}>{translateNative('native.ebf8fd19dcb9ff60')}</Text>
          <Text style={[styles.previewValue, { color: colors.textSecondary }]}>
            {archivePurgePreviewQuery.isLoading
              ? translateNative('native.fa38ece05f76ed3e')
              : translateNative('native.e09abb10c245cc64', { value0: String(pickNumber(archivePurgePreviewQuery.data, ['count'], 0)), value1: String(Math.round(pickNumber(archivePurgePreviewQuery.data, ['total_bytes'], 0) / 1024 / 1024)) })}
          </Text>
          {pickArray(archivePurgePreviewQuery.data as Record<string, unknown>, ['sample_filenames']).slice(0, 5).map(sample => (
            <Text key={String(sample)} style={[styles.previewSample, { color: colors.textSecondary }]}>• {String(sample)}</Text>
          ))}
        </View>
        <View style={styles.modalFooter}>
          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={() => setShowPurgeModal(false)} />
          <PrimaryButton label={translateNative('native.ef6e740aaf594eff')} variant="danger" disabled={!Number.isInteger(Number(customPurgeDays)) || Number(customPurgeDays) < 1 || Number(customPurgeDays) > 3650} onPress={() => setShowPurgeConfirm(true)} />
        </View>
      </SimpleModal>

      {photosArchive ? <ArchivePhotoGallery archive={photosArchive} onClose={() => setPhotosArchive(null)} /> : null}

      <SimpleModal
        visible={qrArchive !== null}
        title={qrArchive ? translateNative('native.2f336fd6c23c9ffe', { value0: String(qrArchive.print_name || qrArchive.filename) }) : translateNative('native.60acb820126ae9d7')}
        subtitle={t('archives.qrSubtitle', { defaultValue: 'Scan or save the QR image to download the original printable file.' })}
        onClose={() => setQrArchive(null)}
      >
        {qrArchive ? <Image source={{ uri: api.getArchiveQRCode(qrArchive.id) }} style={styles.qrImage} /> : null}
        <PrimaryButton label={t('archives.saveQr', { defaultValue: 'Save / share QR image' })} loading={qrExportMutation.isPending} onPress={() => qrExportMutation.mutate()} />
        <View style={styles.linkSection}>
          <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>{translateNative('native.1e1188a9edda25c5')}</Text>
          <Text style={[styles.linkValue, { color: colors.text }]}>{qrArchive ? archiveWorkflows.downloadUrl(qrArchive.id) : ''}</Text>
          <PrimaryButton
            label={translateNative('native.836605bc5068817c')}
            variant="secondary"
            onPress={() => {
              if (!qrArchive) return;
              const value = archiveWorkflows.downloadUrl(qrArchive.id);
              Clipboard.setString(value);
              showToast(nativeMessage('native.360bb86764f9f35c'), 'success');
            }}
          />
        </View>
        {qrArchive?.timelapse_path ? (
          <View style={styles.linkSection}>
            <Text style={[styles.linkLabel, { color: colors.textSecondary }]}>{translateNative('native.190a6a4c52455a67')}</Text>
            <Text style={[styles.linkValue, { color: colors.text }]}>{api.getArchiveTimelapse(qrArchive.id)}</Text>
            <PrimaryButton
              label={translateNative('native.d75c0cc4a470714d')}
              variant="secondary"
              onPress={() => {
                if (!qrArchive) return;
                Clipboard.setString(api.getArchiveTimelapse(qrArchive.id));
                showToast(nativeMessage('native.dd45e6b8a952826c'), 'success');
              }}
            />
          </View>
        ) : null}
        <View style={styles.modalFooter}>
          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={() => setQrArchive(null)} />
        </View>
      </SimpleModal>

      {showTagSummary ? <ArchiveTagCatalog onClose={() => setShowTagSummary(false)} /> : null}

      <ConfirmModal
        visible={showPurgeConfirm}
        onClose={() => setShowPurgeConfirm(false)}
        onConfirm={() => {
          void purgeMutation.mutateAsync();
        }}
        title={translateNative('native.8df3859a02b088fd')}
        message={translateNative('native.3ad1a0de2d5e487c', { value0: String(purgeDays), value1: String(purgeStats ? translateNative('native.13719015e31b9163') : '') })}
         confirmLabel={translateNative('native.687d0955d943e9c4')}
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
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toolbarSearch: { flex: 1 },
  toolbarButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
