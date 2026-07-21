import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
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
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { QueueItemCard } from '@/components/queue/QueueItemCard';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { PrintBatch, PrintQueueItem, Printer } from '@/types/api';
import { formatDateTime, formatDuration, formatWeight } from '@/utils/data';

type QueueTab = 'queue' | 'history' | 'timeline' | 'batches';
type QueueStatusFilter =
  | 'all'
  | 'pending'
  | 'waiting'
  | 'paused'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';
type QueueSort = 'position' | 'name' | 'printer' | 'time';

type TimelineEventKind = 'queued' | 'started' | 'completed';

interface TimelineEntry {
  id: string;
  itemId: number;
  title: string;
  printer: string;
  status: string;
  eventLabel: string;
  occurredAt: string;
  kind: TimelineEventKind;
}

function toQueueItems(value: unknown): PrintQueueItem[] {
  return Array.isArray(value) ? (value as PrintQueueItem[]) : [];
}

function toBatches(value: unknown): PrintBatch[] {
  return Array.isArray(value) ? (value as PrintBatch[]) : [];
}

function queueItemTitle(item: PrintQueueItem) {
  return item.archive_name || item.library_file_name || `Queue item #${item.id}`;
}

function queuePrinterLabel(item: PrintQueueItem) {
  if (item.target_model && !item.printer_id) {
    return `Any ${item.target_model}${item.target_location ? ` • ${item.target_location}` : ''}`;
  }
  if (item.printer_name) return item.printer_name;
  if (item.printer_id) return `Printer #${item.printer_id}`;
  return 'Unassigned';
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

function itemStatus(
  item: PrintQueueItem,
  printerState?: string | null,
): QueueStatusFilter | PrintQueueItem['status'] {
  if (item.status === 'pending' && item.waiting_reason) return 'waiting';
  if (item.status === 'printing' && printerState === 'PAUSE') return 'paused';
  return item.status;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildTimelineItems(items: PrintQueueItem[]): TimelineEntry[] {
  const events: TimelineEntry[] = [];

  items.forEach(item => {
    const title = queueItemTitle(item);
    const printer = queuePrinterLabel(item);

    if (item.created_at) {
      events.push({
        id: `${item.id}-queued`,
        itemId: item.id,
        title,
        printer,
        status: item.status,
        eventLabel: 'Queued',
        occurredAt: item.created_at,
        kind: 'queued',
      });
    }

    if (item.started_at) {
      events.push({
        id: `${item.id}-started`,
        itemId: item.id,
        title,
        printer,
        status: item.status,
        eventLabel: 'Started',
        occurredAt: item.started_at,
        kind: 'started',
      });
    }

    if (item.completed_at) {
      const label = item.status === 'completed' ? 'Completed' : capitalize(item.status);
      events.push({
        id: `${item.id}-completed`,
        itemId: item.id,
        title,
        printer,
        status: item.status,
        eventLabel: label,
        occurredAt: item.completed_at,
        kind: 'completed',
      });
    }
  });

  return events.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

function batchItemCount(batch: PrintBatch) {
  return (
    batch.pending_count +
    batch.printing_count +
    batch.completed_count +
    batch.failed_count +
    batch.cancelled_count
  );
}

function QueueBulkEditModal({
  visible,
  selectedCount,
  printers,
  value,
  loading,
  onClose,
  onSave,
}: {
  visible: boolean;
  selectedCount: number;
  printers: Printer[];
  value: number | null | undefined;
  loading: boolean;
  onClose: () => void;
  onSave: (printerId: number | null) => void;
}) {
  const { colors } = useTheme();
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null | 'unchanged'>('unchanged');

  useEffect(() => {
    if (!visible) return;
    if (selectedCount === 1) {
      setSelectedPrinterId(value ?? null);
      return;
    }
    setSelectedPrinterId('unchanged');
  }, [selectedCount, value, visible]);

  const canSave = selectedPrinterId !== 'unchanged' && !loading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <Text style={[styles.modalTitle, { color: colors.text }]}>Bulk edit queue</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}> 
            Assign {selectedCount} selected {selectedCount === 1 ? 'item' : 'items'} to a printer or clear the assignment.
          </Text>
          <ScrollView style={styles.modalOptions}>
            {selectedCount > 1 ? (
              <Pressable
                onPress={() => setSelectedPrinterId('unchanged')}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: selectedPrinterId === 'unchanged' ? colors.accentBg : colors.surfaceElevated,
                    borderColor: selectedPrinterId === 'unchanged' ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    { color: selectedPrinterId === 'unchanged' ? colors.accentLight : colors.text },
                  ]}
                >
                  No change
                </Text>
              </Pressable>
            ) : null}
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
              <Text
                style={[
                  styles.modalOptionText,
                  { color: selectedPrinterId === null ? colors.accentLight : colors.text },
                ]}
              >
                Unassigned
              </Text>
            </Pressable>
            {printers.map(printer => (
              <Pressable
                key={printer.id}
                onPress={() => setSelectedPrinterId(printer.id)}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor:
                      selectedPrinterId === printer.id ? colors.accentBg : colors.surfaceElevated,
                    borderColor: selectedPrinterId === printer.id ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={styles.modalOptionContent}>
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>{printer.name}</Text>
                  <Text style={[styles.modalOptionMeta, { color: colors.textSecondary }]}> 
                    {printer.model || 'Unknown model'}
                    {printer.location ? ` • ${printer.location}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.modalActions}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
            <PrimaryButton
              label={loading ? 'Saving…' : 'Apply'}
              onPress={() => {
                if (selectedPrinterId === 'unchanged') return;
                onSave(selectedPrinterId);
              }}
              disabled={!canSave}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TimelineCard({ item }: { item: TimelineEntry }) {
  const { colors } = useTheme();
  const accent =
    item.kind === 'completed'
      ? item.status === 'completed'
        ? colors.success
        : item.status === 'failed'
          ? colors.error
          : colors.warning
      : item.kind === 'started'
        ? colors.info
        : colors.accent;

  return (
    <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      <View style={styles.timelineHeader}>
        <Text style={[styles.timelineTitle, { color: colors.text }]}>{item.title}</Text>
        <View style={[styles.timelineBadge, { backgroundColor: `${accent}18`, borderColor: `${accent}55` }]}> 
          <Text style={[styles.timelineBadgeText, { color: accent }]}>{item.eventLabel}</Text>
        </View>
      </View>
      <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>{item.printer}</Text>
      <Text style={[styles.timelineMeta, { color: colors.textTertiary }]}> 
        {formatDateTime(item.occurredAt)}
      </Text>
    </View>
  );
}

function BatchCard({ batch, onPress }: { batch: PrintBatch; onPress: () => void }) {
  const { colors } = useTheme();
  const total = Math.max(batch.quantity, batchItemCount(batch));
  const completed = batch.completed_count + batch.failed_count + batch.cancelled_count;
  const progress = total > 0 ? Math.min(1, completed / total) : 0;
  const badgeColor =
    batch.status === 'completed'
      ? colors.success
      : batch.status === 'cancelled'
        ? colors.warning
        : colors.info;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.batchCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          opacity: pressed ? 0.96 : 1,
        },
      ]}
    >
      <View style={styles.batchHeader}>
        <View style={styles.batchHeaderText}>
          <Text style={[styles.batchTitle, { color: colors.text }]} numberOfLines={2}>
            {batch.name}
          </Text>
          <Text style={[styles.batchMeta, { color: colors.textSecondary }]}>
            {batch.created_by_username || 'System'} • {formatDateTime(batch.created_at)}
          </Text>
        </View>
        <View style={[styles.batchStatusBadge, { backgroundColor: `${badgeColor}18`, borderColor: `${badgeColor}55` }]}> 
          <Text style={[styles.batchStatusText, { color: badgeColor }]}>{capitalize(batch.status)}</Text>
        </View>
      </View>

      <View style={styles.batchMetrics}>
        <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Items {total}</Text>
        <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Pending {batch.pending_count}</Text>
        <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Printing {batch.printing_count}</Text>
        <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Done {completed}</Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: badgeColor,
              width: `${Math.round(progress * 100)}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.batchMeta, { color: colors.textTertiary }]}>
        Progress {completed}/{total}
      </Text>
    </Pressable>
  );
}

function BatchItemsModal({
  visible,
  batch,
  items,
  ungrouping,
  onClose,
  onUngroup,
}: {
  visible: boolean;
  batch: PrintBatch | null;
  items: PrintQueueItem[];
  ungrouping: boolean;
  onClose: () => void;
  onUngroup: () => void;
}) {
  const { colors } = useTheme();

  if (!batch) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheetBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.sheetCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={2}>
                {batch.name}
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                {batchItemCount(batch)} queued items in this batch
              </Text>
            </View>
            <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.batchMetrics}>
              <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Pending {batch.pending_count}</Text>
              <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Printing {batch.printing_count}</Text>
              <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Completed {batch.completed_count}</Text>
              <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Failed {batch.failed_count}</Text>
              <Text style={[styles.batchMetric, { color: colors.textSecondary }]}>Cancelled {batch.cancelled_count}</Text>
            </View>

            {items.length > 0 ? (
              items.map(item => <QueueItemCard key={`batch-${batch.id}-${item.id}`} item={item} />)
            ) : (
              <EmptyState icon="📦" title="No batch items" message="This batch has no remaining queue members." />
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <PrimaryButton
              label={ungrouping ? 'Ungrouping…' : 'Ungroup batch'}
              variant="danger"
              onPress={onUngroup}
              disabled={ungrouping}
              loading={ungrouping}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function QueueScreen() {
  const navigation = useNavigation<MainTabNavigationProp<'Queue'>>();
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
  const [bulkEditIds, setBulkEditIds] = useState<number[]>([]);
  const [bulkEditCurrentValue, setBulkEditCurrentValue] = useState<number | null | undefined>(undefined);
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PrintBatch | null>(null);
  const [confirmUngroupBatch, setConfirmUngroupBatch] = useState<PrintBatch | null>(null);

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: () => api.getQueue(),
  });
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });
  const batchesQuery = useQuery({
    queryKey: ['queueBatches'],
    queryFn: () => api.getQueueBatches(),
  });

  const queueItems = useMemo(() => toQueueItems(queueQuery.data), [queueQuery.data]);
  const printers = useMemo(
    () => (Array.isArray(printersQuery.data) ? (printersQuery.data as unknown as Printer[]) : []),
    [printersQuery.data],
  );
  const batches = useMemo(() => toBatches(batchesQuery.data), [batchesQuery.data]);

  const refreshCurrentTab = async () => {
    await Promise.all([
      queueQuery.refetch(),
      printersQuery.refetch(),
      activeTab === 'batches' ? batchesQuery.refetch() : Promise.resolve(),
    ]);
  };

  const invalidateQueue = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
      queryClient.invalidateQueries({ queryKey: ['queueBatches'] }),
    ]);
  };

  const actionMutation = useMutation({
    mutationFn: async (
      action:
        | { type: 'start'; ids: number[] }
        | { type: 'retry'; ids: number[] }
        | { type: 'delete'; ids: number[] }
        | { type: 'cancel'; ids: number[] },
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
      if (action.type === 'cancel') {
        for (const id of action.ids) await api.cancelQueueItem(id);
      }
    },
    onSuccess: async (_data, variables) => {
      await invalidateQueue();
      setSelectedIds([]);
      setDeleteIds([]);
      if (variables.type === 'start') showToast('Queue item started.', 'success');
      if (variables.type === 'retry') showToast('Queue item retried.', 'success');
      if (variables.type === 'delete') showToast('Queue item deleted.', 'success');
      if (variables.type === 'cancel') showToast('Queue item cancelled.', 'success');
    },
    onError: () => showToast('Unable to update the queue.', 'error'),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, printerId }: { ids: number[]; printerId: number | null }) =>
      api.bulkUpdateQueue({ item_ids: ids, printer_id: printerId }),
    onSuccess: async () => {
      await invalidateQueue();
      setBulkEditIds([]);
      setBulkEditCurrentValue(undefined);
      setSelectedIds([]);
      showToast('Queue items updated.', 'success');
    },
    onError: () => showToast('Unable to apply bulk changes.', 'error'),
  });

  const reorderMutation = useMutation({
    mutationFn: (itemIds: number[]) => api.reorderQueue(itemIds),
    onSuccess: async () => {
      await invalidateQueue();
      showToast('Queue reordered.', 'success');
    },
    onError: () => showToast('Unable to reorder the queue.', 'error'),
  });

  const ungroupBatchMutation = useMutation({
    mutationFn: (id: number) => api.ungroupBatch(id),
    onSuccess: async result => {
      await invalidateQueue();
      setConfirmUngroupBatch(null);
      setSelectedBatch(null);
      showToast(result.message || 'Batch ungrouped.', 'success');
    },
    onError: () => showToast('Unable to ungroup this batch.', 'error'),
  });

  useEffect(() => {
    setSelectedIds(current =>
      current.filter(id => queueItems.some(item => item.id === id && item.status === 'pending')),
    );
  }, [queueItems]);

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
      [...queueItems]
        .filter(item => ['completed', 'failed', 'skipped', 'cancelled'].includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? b.created_at).getTime() -
            new Date(a.completed_at ?? a.created_at).getTime(),
        ),
    [queueItems],
  );
  const timelineItems = useMemo(() => buildTimelineItems(queueItems), [queueItems]);

  const queueStats = useMemo(() => {
    const totalTime = pendingItems.reduce((sum, item) => sum + (item.print_time_seconds ?? 0), 0);
    const totalWeight = pendingItems.reduce((sum, item) => sum + (item.filament_used_grams ?? 0), 0);
    return {
      active: activeItems.length,
      pending: pendingItems.length,
      waiting: pendingItems.filter(item => !!item.waiting_reason).length,
      history: finishedItems.length,
      batches: batches.length,
      totalTime,
      totalWeight,
    };
  }, [activeItems.length, batches.length, finishedItems.length, pendingItems]);

  const normalizedSearch = search.trim().toLowerCase();
  const selectionMode = activeTab === 'queue' && selectedIds.length > 0;

  const filteredActiveItems = useMemo(() => {
    return activeItems.filter(item => {
      if (!matchesQueueSearch(item, normalizedSearch)) return false;
      if (printerFilter === 'unassigned') return item.printer_id == null;
      if (typeof printerFilter === 'number' && item.printer_id !== printerFilter) return false;
      const currentStatus = itemStatus(item, printerStateMap[item.printer_id ?? 0]);
      if (statusFilter !== 'all' && currentStatus !== statusFilter) return false;
      return true;
    });
  }, [activeItems, normalizedSearch, printerFilter, printerStateMap, statusFilter]);

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

    if (queueSort === 'position') return list;

    return [...list].sort((a, b) => {
      switch (queueSort) {
        case 'name':
          return queueItemTitle(a).localeCompare(queueItemTitle(b));
        case 'printer':
          return queuePrinterLabel(a).localeCompare(queuePrinterLabel(b));
        case 'time':
          return (a.print_time_seconds ?? Number.MAX_SAFE_INTEGER) - (b.print_time_seconds ?? Number.MAX_SAFE_INTEGER);
        default:
          return 0;
      }
    });
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
      const haystack = `${item.title} ${item.printer} ${item.eventLabel}`.toLowerCase();
      return !normalizedSearch || haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, timelineItems]);

  const filteredBatches = useMemo(() => {
    return batches.filter(batch => {
      const haystack = [batch.name, batch.status, batch.created_by_username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !normalizedSearch || haystack.includes(normalizedSearch);
    });
  }, [batches, normalizedSearch]);

  const selectedBatchItems = useMemo(() => {
    if (!selectedBatch) return [];
    return queueItems
      .filter(item => item.batch_id === selectedBatch.id)
      .sort((a, b) => a.position - b.position);
  }, [queueItems, selectedBatch]);

  const visiblePendingIds = filteredPendingItems.map(item => item.id);
  const allVisibleSelected =
    visiblePendingIds.length > 0 && visiblePendingIds.every(id => selectedIds.includes(id));

  const toggleSelection = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(current => current.filter(id => !visiblePendingIds.includes(id)));
      return;
    }
    setSelectedIds(current => [...new Set([...current, ...visiblePendingIds])]);
  };

  const reorderItem = (id: number, direction: -1 | 1) => {
    const ordered = [...pendingItems];
    const index = ordered.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const copy = [...ordered];
    const [moving] = copy.splice(index, 1);
    copy.splice(target, 0, moving);
    reorderMutation.mutate(copy.map(item => item.id));
  };

  if (queueQuery.isLoading && printersQuery.isLoading && batchesQuery.isLoading) {
    return <LoadingScreen message="Loading queue…" />;
  }

  if (queueQuery.isError && printersQuery.isError && batchesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load queue information."
        onRetry={() => {
          void refreshCurrentTab();
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
            refreshing={
              queueQuery.isRefetching || printersQuery.isRefetching || batchesQuery.isRefetching
            }
            onRefresh={() => {
              void refreshCurrentTab();
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
            { key: 'timeline', label: `Timeline (${timelineItems.length})` },
            { key: 'batches', label: `Batches (${queueStats.batches})` },
          ]}
          onChange={value => {
            setActiveTab(value);
            setSelectedIds([]);
          }}
        />

        {activeTab !== 'batches' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatCard label="Printing" value={String(queueStats.active)} helper="Live jobs" />
            <StatCard label="Queued" value={String(queueStats.pending)} helper="Pending items" />
            <StatCard label="Waiting" value={String(queueStats.waiting)} helper="Needs attention" />
            <StatCard label="Est. time" value={formatDuration(queueStats.totalTime)} helper="Pending total" />
            <StatCard label="Filament" value={formatWeight(queueStats.totalWeight)} helper="Pending total" />
            <StatCard label="History" value={String(queueStats.history)} helper="Finished jobs" />
          </ScrollView>
        ) : null}

        <SectionCard
          title="Queue controls"
          subtitle={
            activeTab === 'batches'
              ? 'Search batches, inspect grouped queue items, and ungroup when needed.'
              : activeTab === 'timeline'
                ? 'Search recent queue events across created, started, and completed jobs.'
                : 'Search, filter, sort, and act on queue items. Long press a queued item to multi-select.'
          }
        >
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={
              activeTab === 'batches'
                ? 'Search batches by name or status'
                : 'Search queue, printers, filament, or notes'
            }
          />

          {(activeTab === 'queue' || activeTab === 'history') ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
                {(
                  ['all', 'pending', 'waiting', 'paused', 'printing', 'completed', 'failed', 'skipped', 'cancelled'] as QueueStatusFilter[]
                ).map(status => (
                  <Chip
                    key={status}
                    label={`${capitalize(status)}${statusCounts[status] ? ` (${statusCounts[status]})` : ''}`}
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
            </>
          ) : null}

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

          {selectionMode ? (
            <View style={[styles.bulkBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              <Text style={[styles.bulkTitle, { color: colors.text }]}>
                {selectedIds.length} selected
              </Text>
              <View style={styles.bulkActions}>
                <PrimaryButton
                  label={allVisibleSelected ? 'Clear visible' : 'Select visible'}
                  variant="secondary"
                  onPress={toggleSelectAll}
                />
                <PrimaryButton
                  label="Assign printer"
                  onPress={() => {
                    setBulkEditIds(selectedIds);
                    setBulkEditCurrentValue(undefined);
                  }}
                  disabled={selectedIds.length === 0}
                />
                <PrimaryButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    actionMutation.mutate({ type: 'cancel', ids: selectedIds });
                  }}
                  disabled={selectedIds.length === 0 || actionMutation.isPending}
                />
                <PrimaryButton
                  label="Delete"
                  variant="danger"
                  onPress={() => setDeleteIds(selectedIds)}
                  disabled={selectedIds.length === 0 || actionMutation.isPending}
                />
                <PrimaryButton
                  label="Done"
                  variant="secondary"
                  onPress={() => setSelectedIds([])}
                />
              </View>
            </View>
          ) : null}
        </SectionCard>

        {activeTab === 'queue' ? (
          <View style={styles.sectionStack}>
            <SectionCard
              title="Currently printing"
              subtitle="Live jobs, printer assignments, status, and stop controls."
            >
              {filteredActiveItems.length > 0 ? (
                filteredActiveItems.map(item => (
                  <QueueItemCard
                    key={`active-${item.id}`}
                    item={item}
                    printerState={printerStateMap[item.printer_id ?? 0]}
                    onPause={() => showToast('Pause control is not exposed by the mobile API yet.', 'warning')}
                    onStop={() => {
                      actionMutation.mutate({ type: 'cancel', ids: [item.id] });
                    }}
                  />
                ))
              ) : (
                <EmptyState icon="🖨️" title="No active prints" message="When a queue item starts printing it will appear here with its live status and options." />
              )}
            </SectionCard>

            <SectionCard
              title="Queued items"
              subtitle="Use move buttons to reorder on mobile. Long press any item to enter multi-select mode."
              right={
                <Text style={[styles.sectionHelper, { color: colors.textTertiary }]}>No drag library installed, so reorder uses move controls.</Text>
              }
            >
              {filteredPendingItems.length > 0 ? (
                filteredPendingItems.map(item => (
                  <QueueItemCard
                    key={`pending-${item.id}`}
                    item={item}
                    selected={selectedIds.includes(item.id)}
                    showSelection={selectionMode}
                    onPress={selectionMode ? () => toggleSelection(item.id) : undefined}
                    onLongPress={() => {
                      if (selectionMode) {
                        toggleSelection(item.id);
                        return;
                      }
                      setSelectedIds([item.id]);
                    }}
                    onToggleSelect={() => toggleSelection(item.id)}
                    onStart={() => {
                      actionMutation.mutate({ type: 'start', ids: [item.id] });
                    }}
                    onCancel={() => {
                      actionMutation.mutate({ type: 'cancel', ids: [item.id] });
                    }}
                    onDelete={() => setDeleteIds([item.id])}
                    onReassign={() => {
                      setBulkEditIds([item.id]);
                      setBulkEditCurrentValue(item.printer_id ?? null);
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
          <SectionCard title="Queue history" subtitle="Completed, failed, skipped, and cancelled jobs with retry and delete controls.">
            {filteredHistoryItems.length > 0 ? (
              filteredHistoryItems.map(item => (
                <QueueItemCard
                  key={`history-${item.id}`}
                  item={item}
                  onRetry={() => {
                    actionMutation.mutate({ type: 'retry', ids: [item.id] });
                  }}
                  onDelete={() => setDeleteIds([item.id])}
                />
              ))
            ) : (
              <EmptyState icon="🕘" title="No history items" message="Finished queue items will show up here with their printer, duration, material, and print options." />
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'timeline' ? (
          <SectionCard title="Timeline" subtitle="Recent queue activity built from queue item lifecycle timestamps.">
            {filteredTimelineItems.length > 0 ? (
              filteredTimelineItems.map(item => <TimelineCard key={item.id} item={item} />)
            ) : (
              <EmptyState icon="🗓️" title="No timeline events" message="Queue timeline events will appear here once printers and queue items have activity." />
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'batches' ? (
          <SectionCard title="Batches" subtitle="Grouped queue runs with progress, item counts, and ungroup controls.">
            {filteredBatches.length > 0 ? (
              filteredBatches.map(batch => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  onPress={() => setSelectedBatch(batch)}
                />
              ))
            ) : (
              <EmptyState icon="📦" title="No batches" message="Grouped queue runs will appear here once multiple copies or grouped jobs are created." />
            )}
          </SectionCard>
        ) : null}
      </ScrollView>

      <QueueBulkEditModal
        visible={bulkEditIds.length > 0}
        selectedCount={bulkEditIds.length}
        printers={printers}
        value={bulkEditCurrentValue}
        loading={bulkUpdateMutation.isPending}
        onClose={() => {
          setBulkEditIds([]);
          setBulkEditCurrentValue(undefined);
        }}
        onSave={printerId => {
          bulkUpdateMutation.mutate({ ids: bulkEditIds, printerId });
        }}
      />

      <BatchItemsModal
        visible={selectedBatch !== null}
        batch={selectedBatch}
        items={selectedBatchItems}
        ungrouping={ungroupBatchMutation.isPending}
        onClose={() => setSelectedBatch(null)}
        onUngroup={() => {
          if (selectedBatch) setConfirmUngroupBatch(selectedBatch);
        }}
      />

      <ConfirmModal
        visible={deleteIds.length > 0}
        onClose={() => setDeleteIds([])}
        onConfirm={() => {
          actionMutation.mutate({ type: 'delete', ids: deleteIds });
        }}
        title={deleteIds.length > 1 ? 'Delete queue items?' : 'Delete queue item?'}
        message={
          deleteIds.length > 1
            ? 'This will permanently remove the selected queue items.'
            : 'This will permanently remove the selected queue item.'
        }
        confirmLabel="Delete"
        variant="danger"
        loading={actionMutation.isPending}
      />

      <ConfirmModal
        visible={confirmUngroupBatch !== null}
        onClose={() => setConfirmUngroupBatch(null)}
        onConfirm={() => {
          if (confirmUngroupBatch) {
            ungroupBatchMutation.mutate(confirmUngroupBatch.id);
          }
        }}
        title="Ungroup this batch?"
        message="The items will stay in the queue, but they will no longer be grouped together."
        confirmLabel="Ungroup"
        variant="warning"
        loading={ungroupBatchMutation.isPending}
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
  sectionHelper: {
    fontSize: fontSize.xs,
    maxWidth: 150,
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
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  timelineTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  timelineBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  timelineBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  timelineMeta: {
    fontSize: fontSize.sm,
  },
  batchCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  batchHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  batchTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  batchMeta: {
    fontSize: fontSize.sm,
  },
  batchStatusBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  batchStatusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  batchMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  batchMetric: {
    fontSize: fontSize.sm,
  },
  progressTrack: {
    height: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  sheetHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  sheetTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  sheetSubtitle: {
    fontSize: fontSize.sm,
  },
  sheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  sheetFooter: {
    paddingTop: spacing.xs,
  },
});
