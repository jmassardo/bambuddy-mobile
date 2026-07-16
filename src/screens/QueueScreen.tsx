import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  Chip,
  InlineTabBar,
  PrimaryButton,
  SearchBar,
  SectionCard,
  StatCard,
} from '@/components/common/AppUI';
import { QueueItemCard } from '@/components/queue/QueueItemCard';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { PipelineRun, PrintQueueItem, Printer } from '@/types/api';
import {
  formatDateTime,
  formatDuration,
  formatWeight,
  isRecord,
  pickArray,
  pickString,
} from '@/utils/data';


type QueueTab = 'queue' | 'history' | 'timeline' | 'pipelines';
type QueueStatusFilter = 'all' | 'pending' | 'waiting' | 'paused' | 'printing' | 'completed' | 'failed' | 'skipped' | 'cancelled';
type QueueSort = 'position' | 'name' | 'printer' | 'time';

function toQueueItems(value: unknown): PrintQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as PrintQueueItem[];
}

function toHistoryItems(value: unknown): PrintQueueItem[] {
  if (Array.isArray(value)) return value as unknown as PrintQueueItem[];
  return pickArray(value, ['items', 'results']) as unknown as PrintQueueItem[];
}

function toPipelines(value: unknown): PipelineRun[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as PipelineRun[];
}

function matchesQueueSearch(item: PrintQueueItem, term: string) {
  if (!term) return true;
  const haystack = [
    item.archive_name,
    item.library_file_name,
    item.printer_name,
    item.filament_type,
    item.filament_color,
    item.bed_type,
    item.created_by_username,
    item.batch_name,
    item.error_message,
    item.waiting_reason,
    item.target_model,
    item.target_location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function itemStatus(item: PrintQueueItem, printerState?: string | null): QueueStatusFilter | PrintQueueItem['status'] {
  if (item.status === 'pending' && item.waiting_reason) return 'waiting';
  if (item.status === 'printing' && printerState === 'PAUSE') return 'paused';
  return item.status;
}

function ReassignPrinterModal({
  visible,
  printers,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  printers: Printer[];
  value: number | null;
  onClose: () => void;
  onSave: (value: number | null) => void;
}) {
  const { colors } = useTheme();
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(value ?? null);

  React.useEffect(() => {
    if (visible) setSelectedPrinterId(value ?? null);
  }, [value, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <Text style={[styles.modalTitle, { color: colors.text }]}>Reassign printer</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Pick a specific printer or leave the job unassigned.</Text>
          <ScrollView style={styles.modalOptions}>
            <Pressable
              onPress={() => setSelectedPrinterId(null)}
              style={[
                styles.modalOption,
                {
                  backgroundColor: selectedPrinterId === null ? colors.accentBg : colors.surfaceElevated,
                  borderColor: selectedPrinterId === null ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[styles.modalOptionText, { color: selectedPrinterId === null ? colors.accentLight : colors.text }]}>Unassigned</Text>
            </Pressable>
            {printers.map(printer => (
              <Pressable
                key={printer.id}
                onPress={() => setSelectedPrinterId(printer.id)}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: selectedPrinterId === printer.id ? colors.accentBg : colors.surfaceElevated,
                    borderColor: selectedPrinterId === printer.id ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={styles.modalOptionContent}>
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>{printer.name}</Text>
                  <Text style={[styles.modalOptionMeta, { color: colors.textSecondary }]}>
                    {printer.model || 'Unknown model'}{printer.location ? ` • ${printer.location}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.modalActions}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
            <PrimaryButton label="Apply" onPress={() => onSave(selectedPrinterId)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TimelineCard({ item }: { item: Record<string, unknown> }) {
  const { colors } = useTheme();
  const title = pickString(item, ['archive_name', 'name', 'job_name'], 'Queue event');
  const status = pickString(item, ['status', 'state', 'event'], 'event');
  const printer = pickString(item, ['printer_name', 'printer'], 'No printer');
  const started = pickString(item, ['started_at', 'start_time', 'created_at']);
  const completed = pickString(item, ['completed_at', 'end_time']);
  return (
    <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <Text style={[styles.timelineTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>{printer}</Text>
      <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>{status}</Text>
      <Text style={[styles.timelineMeta, { color: colors.textTertiary }]}>Started {formatDateTime(started)}</Text>
      {completed ? <Text style={[styles.timelineMeta, { color: colors.textTertiary }]}>Completed {formatDateTime(completed)}</Text> : null}
    </View>
  );
}

function PipelineCard({ run }: { run: PipelineRun }) {
  const { colors } = useTheme();
  const completion = `${run.copies_completed}/${run.copies}`;
  return (
    <View style={[styles.pipelineCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <View style={styles.pipelineHeader}>
        <View style={styles.pipelineHeaderText}>
          <Text style={[styles.pipelineTitle, { color: colors.text }]} numberOfLines={2}>
            {run.pipeline_name || 'Pipeline run'}
          </Text>
          <Text style={[styles.pipelineSource, { color: colors.textSecondary }]} numberOfLines={1}>
            {run.source_filename || 'Unknown source'}
          </Text>
        </View>
        <View style={[styles.pipelineStatusBadge, { backgroundColor: `${colors.info}18`, borderColor: `${colors.info}55` }]}> 
          <Text style={[styles.pipelineStatusText, { color: colors.info }]}>{run.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <View style={styles.pipelineMetrics}>
        <Text style={[styles.pipelineMetric, { color: colors.textSecondary }]}>Copies {completion}</Text>
        <Text style={[styles.pipelineMetric, { color: colors.textSecondary }]}>In progress {run.copies_in_progress}</Text>
        <Text style={[styles.pipelineMetric, { color: colors.textSecondary }]}>Failed {run.copies_failed}</Text>
      </View>
      <Text style={[styles.pipelineMeta, { color: colors.textTertiary }]}>Created {formatDateTime(run.created_at)}</Text>
      {run.target_printer_id || run.target_model_class ? (
        <Text style={[styles.pipelineMeta, { color: colors.textTertiary }]}>Target {run.target_printer_id ? `Printer #${run.target_printer_id}` : run.target_model_class}</Text>
      ) : null}
      {run.jobs.length > 0 ? (
        <View style={styles.pipelineJobs}>
          {run.jobs.slice(0, 5).map(job => (
            <View
              key={job.id}
              style={[
                styles.pipelineJob,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.pipelineJobText, { color: colors.textSecondary }]} numberOfLines={1}>
                #{job.copy_index + 1} • {job.assigned_printer_name || 'Awaiting printer'} • {job.status}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function QueueScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Queue' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<QueueTab>('queue');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all');
  const [printerFilter, setPrinterFilter] = useState<number | 'all' | 'unassigned'>('all');
  const [queueSort, setQueueSort] = useState<QueueSort>('position');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [reassignIds, setReassignIds] = useState<number[]>([]);
  const [reassignCurrentValue, setReassignCurrentValue] = useState<number | null>(null);

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: () => api.getQueue(),
  });
  const historyQuery = useQuery({
    queryKey: ['queueHistory'],
    queryFn: () => api.getQueueHistory({ limit: 150 }),
  });
  const timelineQuery = useQuery({
    queryKey: ['queueTimeline'],
    queryFn: () => api.getQueueTimeline(),
  });
  const pipelinesQuery = useQuery({
    queryKey: ['pipelineRuns'],
    queryFn: () => api.getPipelineRuns(),
  });
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });

  const activeQuery =
    activeTab === 'queue'
      ? queueQuery
      : activeTab === 'history'
      ? historyQuery
      : activeTab === 'timeline'
      ? timelineQuery
      : pipelinesQuery;

  const queueItems = useMemo(() => toQueueItems(queueQuery.data), [queueQuery.data]);
  const historyItems = useMemo(() => toHistoryItems(historyQuery.data), [historyQuery.data]);
  const timelineItems = useMemo(() => {
    if (!Array.isArray(timelineQuery.data)) return [];
    return timelineQuery.data.filter(isRecord);
  }, [timelineQuery.data]);
  const pipelineRuns = useMemo(() => toPipelines(pipelinesQuery.data), [pipelinesQuery.data]);
  const printers = useMemo(() => (Array.isArray(printersQuery.data) ? (printersQuery.data as unknown as Printer[]) : []), [printersQuery.data]);

  const refreshCurrentTab = async () => {
    await Promise.all([
      activeQuery.refetch(),
      printersQuery.refetch(),
      activeTab === 'queue' ? historyQuery.refetch() : Promise.resolve(),
    ]);
  };

  const invalidateQueue = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
      queryClient.invalidateQueries({ queryKey: ['queueHistory'] }),
      queryClient.invalidateQueries({ queryKey: ['queueTimeline'] }),
      queryClient.invalidateQueries({ queryKey: ['pipelineRuns'] }),
    ]);
  };

  const actionMutation = useMutation({
    mutationFn: async (
      action:
        | { type: 'start'; ids: number[] }
        | { type: 'retry'; ids: number[] }
        | { type: 'delete'; ids: number[] }
        | { type: 'stop'; ids: number[] }
        | { type: 'reassign'; ids: number[]; printerId: number | null },
    ) => {
      if (action.type === 'start') {
        for (const id of action.ids) await api.startQueueItem(id);
      }
      if (action.type === 'retry') {
        for (const id of action.ids) await api.retryQueueItem(id);
      }
      if (action.type === 'delete') {
        for (const id of action.ids) await api.deleteQueueItem(id);
      }
      if (action.type === 'stop') {
        for (const id of action.ids) await api.cancelQueueItem(id);
      }
      if (action.type === 'reassign') {
        for (const id of action.ids) {
          await api.updateQueueItem(id, { printer_id: action.printerId });
        }
      }
    },
    onSuccess: async (_data, variables) => {
      await invalidateQueue();
      setSelectedIds([]);
      setReassignIds([]);
      if (variables.type === 'start') showToast('Queue item started.', 'success');
      if (variables.type === 'retry') showToast('Queue item retried.', 'success');
      if (variables.type === 'delete') showToast('Queue item deleted.', 'success');
      if (variables.type === 'stop') showToast('Stop request sent.', 'success');
      if (variables.type === 'reassign') showToast('Printer assignment updated.', 'success');
    },
    onError: () => showToast('Unable to update the queue.', 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => api.reorderQueue(itemIds),
    onSuccess: async () => {
      await invalidateQueue();
      showToast('Queue reordered.', 'success');
    },
    onError: () => showToast('Unable to reorder the queue.', 'error'),
  });

  const printerStateMap = useMemo(() => {
    const map: Record<number, string | null> = {};
    queueItems.forEach(item => {
      if (item.printer_id && item.status === 'printing') {
        map[item.printer_id] = 'RUNNING';
      }
    });
    return map;
  }, [queueItems]);

  const pendingItems = useMemo(
    () => queueItems.filter(item => item.status === 'pending'),
    [queueItems],
  );
  const activeItems = useMemo(
    () => queueItems.filter(item => item.status === 'printing'),
    [queueItems],
  );
  const finishedItems = useMemo(
    () =>
      historyItems.length > 0
        ? historyItems
        : queueItems.filter(item => ['completed', 'failed', 'skipped', 'cancelled'].includes(item.status)),
    [historyItems, queueItems],
  );

  const queueStats = useMemo(() => {
    const totalTime = pendingItems.reduce((sum, item) => sum + (item.print_time_seconds ?? 0), 0);
    const totalWeight = pendingItems.reduce((sum, item) => sum + (item.filament_used_grams ?? 0), 0);
    return {
      active: activeItems.length,
      pending: pendingItems.length,
      waiting: pendingItems.filter(item => !!item.waiting_reason).length,
      history: finishedItems.length,
      totalTime,
      totalWeight,
    };
  }, [activeItems.length, finishedItems.length, pendingItems]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredActiveItems = useMemo(() => {
    return activeItems.filter(item => {
      if (!matchesQueueSearch(item, normalizedSearch)) return false;
      if (printerFilter === 'unassigned') return item.printer_id == null;
      if (typeof printerFilter === 'number' && item.printer_id !== printerFilter) return false;
      const currentStatus = itemStatus(item, printerStateMap[item.printer_id ?? 0]);
      if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
      return true;
    });
  }, [activeItems, normalizedSearch, printerFilter, statusFilter, printerStateMap]);

  const filteredPendingItems = useMemo(() => {
    const list = pendingItems.filter(item => {
      if (!matchesQueueSearch(item, normalizedSearch)) return false;
      if (printerFilter === 'unassigned') {
        if (item.printer_id != null || item.target_model) return false;
      }
      if (typeof printerFilter === 'number' && item.printer_id !== printerFilter) return false;
      const currentStatus = itemStatus(item, printerStateMap[item.printer_id ?? 0]);
      if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (queueSort) {
        case 'name':
          return (a.archive_name || a.library_file_name || '').localeCompare(b.archive_name || b.library_file_name || '');
        case 'printer':
          return (a.printer_name || a.target_model || '').localeCompare(b.printer_name || b.target_model || '');
        case 'time':
          return (a.print_time_seconds ?? Number.MAX_SAFE_INTEGER) - (b.print_time_seconds ?? Number.MAX_SAFE_INTEGER);
        default:
          return a.position - b.position;
      }
    });
    return sorted;
  }, [normalizedSearch, pendingItems, printerFilter, printerStateMap, queueSort, statusFilter]);

  const filteredHistoryItems = useMemo(() => {
    return finishedItems.filter(item => {
      if (!matchesQueueSearch(item, normalizedSearch)) return false;
      if (printerFilter === 'unassigned') return item.printer_id == null;
      if (typeof printerFilter === 'number' && item.printer_id !== printerFilter) return false;
      const currentStatus = itemStatus(item, printerStateMap[item.printer_id ?? 0]);
      if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
      return true;
    });
  }, [finishedItems, normalizedSearch, printerFilter, printerStateMap, statusFilter]);

  const filteredTimelineItems = useMemo(() => {
    return timelineItems.filter(item => {
      const title = [
        pickString(item, ['archive_name', 'name', 'job_name']),
        pickString(item, ['printer_name', 'printer']),
        pickString(item, ['status', 'state']),
      ]
        .join(' ')
        .toLowerCase();
      return !normalizedSearch || title.includes(normalizedSearch);
    });
  }, [normalizedSearch, timelineItems]);

  const filteredPipelines = useMemo(() => {
    return pipelineRuns.filter(run => {
      const title = [run.pipeline_name, run.source_filename, run.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !normalizedSearch || title.includes(normalizedSearch);
    });
  }, [normalizedSearch, pipelineRuns]);

  const selectedPendingCount = useMemo(
    () => selectedIds.filter(id => pendingItems.some(item => item.id === id)).length,
    [pendingItems, selectedIds],
  );

  const toggleSelection = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const reorderItem = (id: number, direction: -1 | 1) => {
    const ordered = [...pendingItems].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const copy = [...ordered];
    const [moving] = copy.splice(index, 1);
    copy.splice(target, 0, moving);
    reorderMutation.mutate(copy.map(item => item.id));
  };

  if (
    queueQuery.isLoading &&
    historyQuery.isLoading &&
    timelineQuery.isLoading &&
    pipelinesQuery.isLoading
  ) {
    return <LoadingScreen message="Loading queue…" />;
  }

  if (
    queueQuery.isError &&
    historyQuery.isError &&
    timelineQuery.isError &&
    pipelinesQuery.isError
  ) {
    return (
      <ErrorState
        message="Unable to load queue information."
        onRetry={() => {
          refreshCurrentTab();
        }}
      />
    );
  }

  const statusCounts: Record<QueueStatusFilter, number> = {
    all: queueItems.length,
    pending: pendingItems.length,
    waiting: pendingItems.filter(item => !!item.waiting_reason).length,
    paused: activeItems.filter(item => itemStatus(item, printerStateMap[item.printer_id ?? 0]) === 'paused').length,
    printing: activeItems.length,
    completed: finishedItems.filter(item => item.status === 'completed').length,
    failed: finishedItems.filter(item => item.status === 'failed').length,
    skipped: finishedItems.filter(item => item.status === 'skipped').length,
    cancelled: finishedItems.filter(item => item.status === 'cancelled').length,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isRefetching || printersQuery.isRefetching}
            onRefresh={() => {
              refreshCurrentTab();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <InlineTabBar
          value={activeTab}
          tabs={[
            { key: 'queue', label: `Queue (${queueStats.pending + queueStats.active})` },
            { key: 'history', label: `History (${queueStats.history})` },
            { key: 'timeline', label: 'Timeline' },
            { key: 'pipelines', label: 'Pipelines' },
          ]}
          onChange={value => {
            setActiveTab(value);
            setSelectedIds([]);
          }}
        />

        {activeTab !== 'pipelines' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard label="Printing" value={String(queueStats.active)} helper="Live jobs" />
            <StatCard label="Queued" value={String(queueStats.pending)} helper="Pending items" />
            <StatCard label="Waiting" value={String(queueStats.waiting)} helper="Needs attention" />
            <StatCard label="Est. time" value={formatDuration(queueStats.totalTime)} helper="Pending total" />
            <StatCard label="Filament" value={formatWeight(queueStats.totalWeight)} helper="Pending total" />
            <StatCard label="History" value={String(queueStats.history)} helper="Finished jobs" />
          </ScrollView>
        ) : null}

        <SectionCard title="Queue controls" subtitle="Search, filter, sort, and act on the same data you see on web.">
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search queue, printers, filament, or notes" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {(['all', 'pending', 'waiting', 'paused', 'printing', 'completed', 'failed', 'skipped', 'cancelled'] as QueueStatusFilter[]).map(status => (
              <Chip
                key={status}
                label={`${status[0].toUpperCase()}${status.slice(1)}${statusCounts[status] ? ` (${statusCounts[status]})` : ''}`}
                selected={statusFilter === status}
                onPress={() => setStatusFilter(status)}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            <Chip
              label="All printers"
              selected={printerFilter === 'all'}
              onPress={() => setPrinterFilter('all')}
            />
            <Chip
              label="Unassigned"
              selected={printerFilter === 'unassigned'}
              onPress={() => setPrinterFilter('unassigned')}
            />
            {printers.map(printer => (
              <Chip
                key={printer.id}
                label={printer.name}
                selected={printerFilter === printer.id}
                onPress={() => setPrinterFilter(printer.id)}
              />
            ))}
          </ScrollView>
          {activeTab === 'queue' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
              {(['position', 'name', 'printer', 'time'] as QueueSort[]).map(sort => (
                <Chip
                  key={sort}
                  label={`Sort: ${sort}`}
                  selected={queueSort === sort}
                  onPress={() => setQueueSort(sort)}
                />
              ))}
            </ScrollView>
          ) : null}
          {selectedIds.length > 0 ? (
            <View style={[styles.bulkBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              <Text style={[styles.bulkTitle, { color: colors.text }]}>
                {selectedIds.length} selected
              </Text>
              <View style={styles.bulkActions}>
                <PrimaryButton
                  label="Start"
                  onPress={() => {
                    actionMutation.mutate({ type: 'start', ids: selectedIds });
                  }}
                  disabled={selectedPendingCount === 0 || actionMutation.isPending}
                />
                <PrimaryButton
                  label="Pause"
                  variant="secondary"
                  onPress={() => showToast('Pause control is not exposed by the mobile API yet.', 'warning')}
                />
                <PrimaryButton
                  label="Stop"
                  variant="danger"
                  onPress={() => {
                    actionMutation.mutate({ type: 'stop', ids: selectedIds });
                  }}
                  disabled={actionMutation.isPending}
                />
                <PrimaryButton
                  label="Delete"
                  variant="secondary"
                  onPress={() => {
                    actionMutation.mutate({ type: 'delete', ids: selectedIds });
                  }}
                  disabled={actionMutation.isPending}
                />
                <PrimaryButton
                  label="Reassign"
                  variant="secondary"
                  onPress={() => {
                    setReassignIds(selectedIds);
                    setReassignCurrentValue(null);
                  }}
                />
              </View>
            </View>
          ) : null}
        </SectionCard>

        {activeTab === 'queue' ? (
          <View style={styles.sectionStack}>
            <SectionCard
              title="Currently printing"
              subtitle="Live jobs, printer assignments, status, options, and quick stop controls."
              right={
                <Text style={[styles.sectionHelper, { color: colors.textTertiary }]}>Top bar approximates live progress on mobile.</Text>
              }
            >
              {filteredActiveItems.length > 0 ? (
                filteredActiveItems.map(item => (
                  <QueueItemCard
                    key={`active-${item.id}`}
                    item={item}
                    printerState={printerStateMap[item.printer_id ?? 0]}
                    selected={selectedIds.includes(item.id)}
                    showSelection
                    onToggleSelect={() => toggleSelection(item.id)}
                    onPause={() => showToast('Pause control is not exposed by the mobile API yet.', 'warning')}
                    onStop={() => {
                      actionMutation.mutate({ type: 'stop', ids: [item.id] });
                    }}
                    onDelete={() => {
                      actionMutation.mutate({ type: 'delete', ids: [item.id] });
                    }}
                  />
                ))
              ) : (
                <EmptyState icon="🖨️" title="No active prints" message="When a queue item starts printing it will appear here with its live status and options." />
              )}
            </SectionCard>

            <SectionCard
              title="Queued items"
              subtitle="Searchable pending queue with printer target, plate, filament, options, and reorder controls."
            >
              {filteredPendingItems.length > 0 ? (
                filteredPendingItems.map(item => (
                  <QueueItemCard
                    key={`pending-${item.id}`}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    showSelection
                    onToggleSelect={() => toggleSelection(item.id)}
                    onStart={() => {
                      actionMutation.mutate({ type: 'start', ids: [item.id] });
                    }}
                    onDelete={() => {
                      actionMutation.mutate({ type: 'delete', ids: [item.id] });
                    }}
                    onReassign={() => {
                      setReassignIds([item.id]);
                      setReassignCurrentValue(item.printer_id ?? null);
                    }}
                    onMoveUp={() => reorderItem(item.id, -1)}
                    onMoveDown={() => reorderItem(item.id, 1)}
                  />
                ))
              ) : (
                <EmptyState icon="📋" title="No queued items" message="The filtered queue is empty. Try clearing filters or add a print from Archives or Files." />
              )}
            </SectionCard>
          </View>
        ) : null}

        {activeTab === 'history' ? (
          <SectionCard title="Queue history" subtitle="Completed, failed, skipped, and cancelled jobs with the same metadata shown on web.">
            {filteredHistoryItems.length > 0 ? (
              filteredHistoryItems.map(item => (
                <QueueItemCard
                  key={`history-${item.id}`}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  showSelection
                  onToggleSelect={() => toggleSelection(item.id)}
                  onRetry={() => {
                    actionMutation.mutate({ type: 'retry', ids: [item.id] });
                  }}
                  onDelete={() => {
                    actionMutation.mutate({ type: 'delete', ids: [item.id] });
                  }}
                />
              ))
            ) : (
              <EmptyState icon="🕘" title="No history items" message="Finished queue items will show up here with their printer, duration, material, and print options." />
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'timeline' ? (
          <SectionCard title="Timeline" subtitle="Chronological queue activity for job starts, completions, and transitions.">
            {filteredTimelineItems.length > 0 ? (
              filteredTimelineItems.map((item, index) => (
                <TimelineCard key={`${pickString(item, ['id', 'event_id'], String(index))}-${index}`} item={item} />
              ))
            ) : (
              <EmptyState icon="🗓️" title="No timeline events" message="Queue timeline events will appear here once printers and queue items have activity." />
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'pipelines' ? (
          <SectionCard title="Pipelines" subtitle="Slicer pipeline runs, target printers, copy counts, and per-job dispatch state.">
            {filteredPipelines.length > 0 ? (
              filteredPipelines.map(run => <PipelineCard key={run.id} run={run} />)
            ) : (
              <EmptyState icon="🧪" title="No pipeline runs" message="Pipeline activity will appear here with run status, fan-out progress, and per-copy job results." />
            )}
          </SectionCard>
        ) : null}
      </ScrollView>

      <ReassignPrinterModal
        visible={reassignIds.length > 0}
        printers={printers}
        value={reassignCurrentValue}
        onClose={() => setReassignIds([])}
        onSave={(printerId) => {
          actionMutation.mutate({ type: 'reassign', ids: reassignIds, printerId });
        }}
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
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  statsRow: {
    gap: spacing.md,
  },
  filtersRow: {
    gap: spacing.sm,
  },
  bulkBar: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  bulkTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  bulkActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionStack: {
    gap: spacing.lg,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionCount: {
    fontSize: fontSize.sm,
  },
  sectionHelper: {
    fontSize: fontSize.xs,
    maxWidth: 140,
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  modalOptions: {
    maxHeight: 320,
  },
  modalOption: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modalOptionContent: {
    gap: spacing.xs,
  },
  modalOptionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  modalOptionMeta: {
    fontSize: fontSize.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  timelineCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  timelineTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  timelineMeta: {
    fontSize: fontSize.sm,
  },
  pipelineCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pipelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pipelineHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  pipelineTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pipelineSource: {
    fontSize: fontSize.sm,
  },
  pipelineStatusBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  pipelineStatusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
  },
  pipelineMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  pipelineMetric: {
    fontSize: fontSize.sm,
  },
  pipelineMeta: {
    fontSize: fontSize.xs,
  },
  pipelineJobs: {
    gap: spacing.sm,
  },
  pipelineJob: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pipelineJobText: {
    fontSize: fontSize.xs,
  },
});
