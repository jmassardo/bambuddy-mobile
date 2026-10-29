import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import { localizedStatus } from '@/utils/statusLabel';

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronDown, ChevronRight, Ellipsis, SlidersHorizontal } from 'lucide-react-native';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ApiError } from '@/api/http';
import { queueApi } from '@/api/queue';
import {
  InlineTabBar,
  PrimaryButton,
  SearchBar,
  SectionCard,
  StatCard,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { DraggableQueueItem } from '@/components/queue/DraggableQueueItem';
import { QueueItemCardContent } from '@/components/queue/QueueItemCard';
import { QueueBulkEditModal } from '@/components/queue/QueueBulkEditModal';
import { GanttTimeline } from '@/components/queue/GanttTimeline';
import { PrintModal } from '@/components/printers/PrintModal';
import {
  Choice,
  LaunchField,
  LaunchText,
} from '@/components/printers/PrintOptionsForm';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  PrintBatch,
  PrintQueueItem,
  PrintQueueItemUpdate,
} from '@/types/api';
import {
  formatDateTime,
  formatDuration,
  formatWeight,
  isRecord,
} from '@/utils/data';
import { moveQueueBlock, queueBlocks } from '@/utils/printLaunch';

type Tab = 'queue' | 'history' | 'timeline' | 'batches';
const title = (item: PrintQueueItem) =>
  item.archive_name || item.library_file_name || `#${item.id}`;
const printerLabel = (item: PrintQueueItem) =>
  item.printer_name ||
  (item.target_model ? `Any ${item.target_model}` : 'Unassigned');
const terminal = (item: PrintQueueItem) =>
  ['completed', 'failed', 'skipped', 'cancelled'].includes(item.status);
// Fixed-printer scheduling bypasses variant resolution and needs a concrete source.
const unresolvedVariants = (item: PrintQueueItem) =>
  !!item.variants?.length &&
  item.archive_id == null &&
  item.library_file_id == null;
type Confirmation = {
  title: string;
  message: string;
  run: () => Promise<unknown>;
};

export default function QueueScreen() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tr = (label: string) =>
    t(`queue.${label.replace(/\W/g, '')}`, { defaultValue: label });
  const { hasPermission, user } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('queue');
  const [showFilters, setShowFilters] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [printer, setPrinter] = useState('all');
  const [location, setLocation] = useState('');
  const [layout, setLayout] = useState('position');
  const [sort, setSort] = useState('position');
  const [historySort, setHistorySort] = useState('date');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [historyDirection, setHistoryDirection] = useState<1 | -1>(-1);
  const [batchStatus, setBatchStatus] = useState('active');
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [batchName, setBatchName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [batchTools, setBatchTools] = useState<number | null>(null);
  const [batchDetailId, setBatchDetailId] = useState<number | null>(null);
  const [launch, setLaunch] = useState<{
    item: PrintQueueItem;
    requeue: boolean;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [shortage, setShortage] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: () => queueApi.getQueue(),
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
  });
  const batches = useQuery({
    queryKey: ['queueBatches'],
    queryFn: () => queueApi.getQueueBatches(),
  });
  const batchDetail = useQuery({
    queryKey: ['queueBatches', batchDetailId],
    queryFn: () => queueApi.getQueueBatch(batchDetailId!),
    enabled: batchDetailId != null,
  });
  const items = useLocalizedMemo(() => queue.data ?? [], [queue.data]);
  const active = items.filter(item => item.status === 'printing');
  const pending = items.filter(item => item.status === 'pending');
  const history = items.filter(terminal);
  const activePrinterIds = [
    ...new Set(
      active.map(i => i.printer_id).filter((id): id is number => id != null),
    ),
  ];
  const statusQueries = useQueries({
    queries: activePrinterIds.map(id => ({
      queryKey: ['printerStatus', id],
      queryFn: () => api.getPrinterStatus(id),
    })),
  });
  const statusById = new Map(
    statusQueries.map((q, index) => [activePrinterIds[index], q.data]),
  );
  const canUpdate = (item: PrintQueueItem) =>
    hasPermission('queue:update_all') ||
    (hasPermission('queue:update_own') && item.created_by_id === user?.id);
  // Starting claims ownerless imports; ordinary editing remains owner-only.
  const canStart = (item: PrintQueueItem) =>
    item.status === 'pending' &&
    (hasPermission('queue:update_all') ||
      (hasPermission('queue:update_own') &&
        (item.created_by_id == null || item.created_by_id === user?.id)));
  const canDelete = (item: PrintQueueItem) =>
    hasPermission('queue:delete_all') ||
    (hasPermission('queue:delete_own') && item.created_by_id === user?.id);
  const refresh = async () => {
    await Promise.all(
      ['queue', 'queueBatches', 'printers', 'printerStatus'].map(key =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
  const perform = async (
    run: () => Promise<unknown>,
    success = nativeMessage('native.c7ff3b59e9fc6cec'),
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await run();
      await refresh();
      showToast(success, 'success');
      setConfirmation(null);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : nativeMessage("native.b12da6ed094e6a17"),
        'error',
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const confirm = (
    label: string,
    message: string,
    run: () => Promise<unknown>,
  ) => setConfirmation({ title: tr(label), message, run });
  const start = async (id: number, bypass = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await queueApi.startQueueItem(id, { skipFilamentCheck: bypass });
      setShortage(null);
      await refresh();
      showToast(nativeMessage("native.0b53124e898b6945"), 'success');
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.detail?.code === 'insufficient_filament' &&
        Array.isArray(e.detail.deficit)
      ) {
        setShortage({
          id,
          text: e.detail.deficit
            .filter(isRecord)
            .map(
              d =>
                `${tr('Slot')} ${String(d.slot_id)} · ${String(
                  d.filament_type,
                )} · ${String(d.required_grams)}g ${tr('required')} / ${
                  d.remaining_grams == null
                    ? tr('Unknown')
                    : `${String(d.remaining_grams)}g`
                } ${tr('remaining')}`,
            )
            .join('\n'),
        });
      } else
        showToast(
          e instanceof Error ? e.message : nativeMessage("native.c67d3259e78e9d8c"),
          'error',
        );
    } finally {
      setBusy(false);
    }
  };
  const stop = (item: PrintQueueItem) =>
    confirm(
      translateNative('native.6333c03e1b776cfd'),
      `${title(item)} · ${printerLabel(item)}\n${tr(
        'This stops the printer and marks this queue run cancelled.',
      )}`,
      () => queueApi.stopQueueItem(item.id),
    );
  const configure = (item: PrintQueueItem) =>
    setLaunch({ item, requeue: terminal(item) });
  const reorder = (item: PrintQueueItem, delta: -1 | 1, whole = false) => {
    void perform(() =>
      queueApi.reorderQueue(moveQueueBlock(pending, item.id, delta, whole)),
    );
  };
  const selectedItems = pending.filter(i => selected.includes(i.id));
  const allowFixedPrinterAssignment = !selectedItems
    .filter(canUpdate)
    .some(unresolvedVariants);
  const gates = useLocalizedMemo(() => {
    const result = new Map<number, { name: string; count: number }>();
    items
      .filter(
        i =>
          i.status === 'skipped' &&
          i.error_message === 'Previous print failed or was aborted' &&
          i.printer_id != null,
      )
      .forEach(i => {
        const current = result.get(i.printer_id!) ?? {
          name: printerLabel(i),
          count: 0,
        };
        current.count++;
        result.set(i.printer_id!, current);
      });
    return [...result];
  }, [items]);
  const filter = (item: PrintQueueItem) => {
    const p = printers.data?.find(pr => pr.id === item.printer_id);
    if (
      printer === 'unassigned' &&
      (item.printer_id != null || item.target_model)
    )
      return false;
    if (
      printer !== 'all' &&
      printer !== 'unassigned' &&
      item.printer_id !== Number(printer)
    )
      return false;
    if (location && (p?.location ?? item.target_location) !== location)
      return false;
    const actualStatus =
      item.status === 'pending' && item.waiting_reason
        ? 'waiting'
        : item.status === 'printing' &&
          statusById.get(item.printer_id ?? -1)?.state === 'PAUSE'
        ? 'paused'
        : item.status;
    if (status !== 'all' && actualStatus !== status) return false;
    return (
      !search.trim() ||
      [
        title(item),
        printerLabel(item),
        item.target_location,
        item.batch_name,
        item.filament_type,
        item.created_by_username,
        item.waiting_reason,
        item.error_message,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  };
  const filteredPending = pending
    .filter(filter)
    .sort(
      (a, b) =>
        direction *
        (sort === 'name'
          ? title(a).localeCompare(title(b))
          : sort === 'printer'
          ? printerLabel(a).localeCompare(printerLabel(b))
          : sort === 'duration'
          ? (a.print_time_seconds ?? 0) - (b.print_time_seconds ?? 0)
          : sort === 'scheduled'
          ? new Date(a.scheduled_time ?? 0).getTime() -
            new Date(b.scheduled_time ?? 0).getTime()
          : a.position - b.position),
    );
  const filteredHistory = history
    .filter(filter)
    .sort(
      (a, b) =>
        historyDirection *
        (historySort === 'name'
          ? title(a).localeCompare(title(b))
          : historySort === 'printer'
          ? printerLabel(a).localeCompare(printerLabel(b))
          : new Date(a.completed_at ?? a.started_at ?? a.created_at).getTime() -
            new Date(b.completed_at ?? b.started_at ?? b.created_at).getTime()),
    );
  const toggle = (id: number) =>
    setSelected(current =>
      current.includes(id) ? current.filter(i => i !== id) : [...current, id],
    );

  const card = (item: PrintQueueItem) =>
    item.status === 'pending' ? (
      <DraggableQueueItem
        key={item.id}
        item={item}
        selected={selected.includes(item.id)}
        selectionMode={selected.length > 0}
        onPress={() => {
          if (selected.length) toggle(item.id);
          else if (canUpdate(item)) configure(item);
        }}
        onLongPress={() => {
          if (canUpdate(item)) toggle(item.id);
        }}
        onToggleSelect={() => {
          if (canUpdate(item)) toggle(item.id);
        }}
        onStart={
          canStart(item)
            ? () => {
                void start(item.id);
              }
            : undefined
        }
        onCancel={
          canDelete(item)
            ? () =>
                confirm(translateNative('native.b6bbd7dd3279865e'), title(item), () =>
                  queueApi.cancelQueueItem(item.id),
                )
            : undefined
        }
        onDelete={
          canDelete(item)
            ? () =>
                confirm(translateNative('native.5fd9e0becdb0d431'), title(item), () =>
                  queueApi.deleteQueueItem(item.id),
                )
            : undefined
        }
        onReassign={canUpdate(item) ? () => configure(item) : undefined}
        onReorder={
          hasPermission('queue:reorder') &&
          sort === 'position' &&
          direction === 1
            ? d => reorder(item, d === 'up' ? -1 : 1)
            : undefined
        }
      />
    ) : (
      <QueueItemCardContent
        key={item.id}
        item={item}
        printerState={statusById.get(item.printer_id ?? -1)?.state}
        onRetry={
          terminal(item) &&
          hasPermission('queue:create') &&
          !item.archive_deleted
            ? () => configure(item)
            : undefined
        }
        onDelete={
          terminal(item) && canDelete(item)
            ? () =>
                confirm(translateNative('native.082514ed30cb9447'), title(item), () =>
                  queueApi.deleteQueueItem(item.id),
                )
            : undefined
        }
        onStop={
          item.status === 'printing' && hasPermission('printers:control')
            ? () => stop(item)
            : undefined
        }
        onPause={
          item.status === 'printing' &&
          item.printer_id != null &&
          hasPermission('printers:control')
            ? () => {
                void perform(() =>
                  statusById.get(item.printer_id!)?.state === 'PAUSE'
                    ? api.resumePrint(item.printer_id!)
                    : api.pausePrint(item.printer_id!),
                );
              }
            : undefined
        }
      />
    );

  const renderPending = (list: PrintQueueItem[]) => {
    const blocks = queueBlocks(list);
    // Keep visual sort while retaining contiguous batches. Reordering always uses the complete queue.
    const ordered =
      sort === 'position' && direction === 1
        ? blocks
        : [...blocks].sort((a, b) => list.indexOf(a[0]) - list.indexOf(b[0]));
    return ordered.map(block => {
      const first = block[0],
        batch = first.batch_id;
      if (!batch) return card(first);
      return (
        <View key={`batch-${batch}`} style={styles.listSection}>
          <View style={styles.batchHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr(
                collapsed.includes(batch) ? translateNative('native.b30e4ae6f07f6a30') : translateNative('native.74a215e67407dd5d'),
              )}
              accessibilityState={{ expanded: !collapsed.includes(batch) }}
              style={styles.batchToggle}
              onPress={() =>
                setCollapsed(current =>
                  current.includes(batch)
                    ? current.filter(id => id !== batch)
                    : [...current, batch],
                )
              }
            >
              {collapsed.includes(batch) ? <ChevronRight size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
              <Text style={[styles.batchTitle, { color: colors.textSecondary }]}>
                {`${first.batch_name ?? `#${batch}`} · ${block.length} ${tr('pending')}`}
              </Text>
            </Pressable>
            {(hasPermission('queue:reorder') && sort === 'position') || hasPermission('queue:update_all') ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('nav.more')} · ${first.batch_name ?? `#${batch}`}`}
                accessibilityState={{ expanded: batchTools === batch }}
                hitSlop={4}
                style={styles.batchMore}
                onPress={() => setBatchTools(current => current === batch ? null : batch)}
              >
                <Ellipsis size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {batchTools === batch ? <View style={styles.row}>
            {hasPermission('queue:reorder') && sort === 'position' && (
              <>
                <PrimaryButton
                  label={tr('Batch up')}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => reorder(first, -1, true)}
                />
                <PrimaryButton
                  label={tr('Batch down')}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => reorder(first, 1, true)}
                />
              </>
            )}
            {hasPermission('queue:update_all') && (
              <PrimaryButton
                label={tr('Ungroup')}
                variant="secondary"
                onPress={() =>
                  confirm(
                    translateNative('native.00325e7b88ffbc28'),
                    tr('Jobs remain queued but are no longer grouped.'),
                    () => queueApi.ungroupBatch(batch),
                  )
                }
              />
            )}
          </View> : null}
          {!collapsed.includes(batch) && block.map(card)}
        </View>
      );
    });
  };
  const renderBatch = (batch: PrintBatch) => (
    <SectionCard
      key={batch.id}
      title={batch.name}
      subtitle={`${localizedStatus(batch.status)} · ${formatDateTime(batch.created_at)}`}
    >
      <LaunchText>
        {batch.has_targets
          ? `${tr('Successful target progress')}: ${batch.completed_count}/${
              batch.target_count ?? 0
            } · ${tr('Still owed')}: ${batch.remaining_count ?? 0}`
          : `${tr('Successful runs')}: ${batch.completed_count}/${
              batch.quantity
            }`}
      </LaunchText>
      <LaunchText>{`${tr('Pending')}: ${batch.pending_count} · ${tr(
        'Printing',
      )}: ${batch.printing_count} · ${tr('Failed')}: ${
        batch.failed_count
      } · ${tr('Cancelled')}: ${batch.cancelled_count}`}</LaunchText>
      <LaunchText>{`${tr('Actual cost')}: ${
        batch.actual_cost ?? tr('Unknown')
      } · ${tr('Estimated remaining cost')}: ${
        batch.estimated_remaining_cost ?? tr('Unknown')
      }`}</LaunchText>
      {batch.has_targets &&
        (batch.remaining_count ?? 0) > (batch.dispatchable_count ?? 0) && (
          <LaunchText>
            {translateNative('native.83687692be32ba67')}</LaunchText>
        )}
      {(batch.plates ?? []).map(plate => (
        <View key={String(plate.plate_id)}>
          <LaunchText>{`${
            plate.plate_name ?? `${tr('Plate')} ${plate.plate_id ?? 1}`
          } · ${plate.completed_count}/${plate.quantity_target} ${tr(
            'successful',
          )} · ${plate.remaining} ${tr('remaining')} · ${tr('Cost')}: ${
            plate.actual_cost ?? tr('Unknown')
          } / ${plate.estimated_remaining_cost ?? tr('Unknown')}`}</LaunchText>
          {plate.remaining > 0 && !plate.can_dispatch && (
            <LaunchText>{translateNative('native.2590d053a301e025')}</LaunchText>
          )}
          {plate.can_dispatch &&
            plate.remaining > 0 &&
            batch.status === 'active' &&
            hasPermission('queue:create') && (
              <PrimaryButton
                label={tr('Dispatch remaining plate')}
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  void perform(() =>
                    queueApi.dispatchBatch(batch.id, {
                      only_plate: true,
                      plate_id: plate.plate_id,
                    }),
                  );
                }}
              />
            )}
        </View>
      ))}
      <View style={styles.row}>
        <PrimaryButton
          label={tr('View batch items')}
          variant="secondary"
          onPress={() => setBatchDetailId(batch.id)}
        />
        {batch.status === 'active' &&
          (batch.dispatchable_count ?? 0) > 0 &&
          hasPermission('queue:create') && (
            <PrimaryButton
              label={tr('Dispatch remaining order')}
              disabled={busy}
              onPress={() => {
                void perform(() => queueApi.dispatchBatch(batch.id));
              }}
            />
          )}
        {batch.status === 'active' && hasPermission('queue:update_all') && (
          <PrimaryButton
            label={tr('Cancel order')}
            variant="danger"
            onPress={() =>
              confirm(
                translateNative('native.7fa43f04f9396ef3'),
                tr(
                  'Cancel this order and its pending production? Active prints are not stopped.',
                ),
                () => queueApi.cancelBatch(batch.id),
              )
            }
          />
        )}
        {hasPermission('queue:update_all') && (
          <PrimaryButton
            label={tr('Ungroup batch')}
            variant="secondary"
            onPress={() =>
              confirm(
                translateNative('native.00325e7b88ffbc28'),
                tr('Jobs remain queued but are no longer grouped.'),
                () => queueApi.ungroupBatch(batch.id),
              )
            }
          />
        )}
      </View>
    </SectionCard>
  );

  if (queue.isPending) return <LoadingScreen />;
  if (queue.isError)
    return (
      <ErrorState
        message={tr('Unable to load queue')}
        onRetry={() => {
          void queue.refetch();
        }}
      />
    );
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={queue.isRefetching}
            onRefresh={() => {
              void refresh();
            }}
          />
        }
      >
        <InlineTabBar
          value={tab}
          tabs={[
            {
              key: 'queue',
              label: `${tr('Queue')} (${pending.length + active.length})`,
            },
            { key: 'history', label: `${tr('History')} (${history.length})` },
            { key: 'timeline', label: tr('Timeline') },
            { key: 'batches', label: tr('Batch orders') },
          ]}
          onChange={value => {
            setTab(value);
            setSelected([]);
          }}
        />
        <View style={styles.toolbar}>
          <View style={styles.toolbarSearch}>
            <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Search queue, history, batches')} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.filters')} accessibilityState={{ expanded: showFilters, selected: status !== 'all' || printer !== 'all' || Boolean(location) }} onPress={() => setShowFilters(value => !value)} style={[styles.toolbarButton, { backgroundColor: showFilters ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}>
            <SlidersHorizontal size={18} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('nav.more')} accessibilityState={{ expanded: showTools }} onPress={() => setShowTools(value => !value)} style={[styles.toolbarButton, { backgroundColor: showTools ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}>
            <Ellipsis size={18} color={colors.text} />
          </Pressable>
        </View>
        {showTools ? <View style={styles.row}>
          <StatCard label={tr('Printing')} value={String(active.length)} />
          <StatCard label={tr('Pending')} value={String(pending.length)} />
          <StatCard
            label={tr('Estimated time')}
            value={formatDuration(
              pending.reduce((sum, i) => sum + (i.print_time_seconds ?? 0), 0),
            )}
          />
          <StatCard
            label={tr('Filament')}
            value={formatWeight(
              pending.reduce((sum, i) => sum + (i.filament_used_grams ?? 0), 0),
            )}
          />
        </View> : null}
        {gates.map(([id, gate]) => (
          <SectionCard
            key={id}
            title={`${gate.name} · ${tr('Queue blocked after failure')}`}
          >
            <LaunchText>{`${gate.count} ${tr(
              'skipped jobs: previous print failed or was aborted. Resolve the cause before resuming.',
            )}`}</LaunchText>
            {hasPermission('queue:update_all') && (
              <PrimaryButton
                label={tr('Resume after failure')}
                disabled={busy}
                onPress={() =>
                  confirm(
                    translateNative('native.2f61a40545f6cd56'),
                    `${gate.name}\n${tr(
                      'Acknowledge the failed predecessor and restore skipped jobs to pending?',
                    )}`,
                    async () => {
                      const result = await queueApi.resumeQueueAfterFailure(id);
                      showToast(
                        nativeMessage('queue.resumeCounts', () => ({
                          defaultValue:
                            '{{acknowledged}} failures acknowledged; {{restored}} jobs restored.',
                          ...result,
                        })),
                        'success',
                      );
                    },
                  )
                }
              />
            )}
          </SectionCard>
        ))}
        {showFilters && tab !== 'batches' && (
          <SectionCard title={tr('Filters')}>
            <Choice
              label={translateNative('screen.printer')}
              value={printer}
              options={[
                { value: 'all', get label() { return translateNative('native.b8ed6cb4c204100e'); } },
                { value: 'unassigned', get label() { return translateNative('native.424849cf8f869437'); } },
                ...(printers.data ?? []).map(p => ({
                  value: String(p.id),
                  label: p.name,
                })),
              ]}
              onChange={setPrinter}
            />
            <Choice
              label={translateNative('native.4fa01b8a6af1174b')}
              value={location}
              options={[
                { value: '', get label() { return translateNative('native.5966c029380eaf77'); } },
                ...Array.from(
                  new Set(
                    [
                      ...(printers.data ?? []).map(p => p.location),
                      ...items.map(i => i.target_location),
                    ].filter((s): s is string => !!s),
                  ),
                ).map(l => ({ value: l, label: l })),
              ]}
              onChange={setLocation}
            />
            <Choice
              label={translateNative('common.status')}
              value={status}
              options={[
                'all',
                'pending',
                'waiting',
                'paused',
                'printing',
                'completed',
                'failed',
                'skipped',
                'cancelled',
              ].map(s => ({ value: s, label: s }))}
              onChange={setStatus}
            />
          </SectionCard>
        )}
        {tab === 'queue' && (
          <>
            {showFilters ? <>
            <Choice
              label={translateNative('native.c2ecc32fe0e20327')}
              value={layout}
              options={[
                { value: 'position', get label() { return translateNative('native.6e63257bb80e603c'); } },
                { value: 'printer', get label() { return translateNative('native.1431e6d7a579da92'); } },
              ]}
              onChange={setLayout}
            />
            <Choice
              label={translateNative('native.6d692ca1e6d9060a')}
              value={sort}
              options={[
                'position',
                'name',
                'printer',
                'duration',
                'scheduled',
              ].map(s => ({
                value: s,
                label: s === 'scheduled' ? translateNative('native.edcd0a3cf3a2c4e0') : s,
              }))}
              onChange={setSort}
            />
            <Choice
              label={translateNative('native.205a3c184ba1efdc')}
              value={direction}
              options={[
                { value: 1, get label() { return translateNative('native.9147375e0bcc4243'); } },
                { value: -1, get label() { return translateNative('native.302bf67d25000cd5'); } },
              ]}
              onChange={setDirection}
            />
            </> : null}
            {showTools || selected.length > 0 ? <View style={styles.row}>
              <PrimaryButton
                label={tr('Select visible pending')}
                variant="secondary"
                onPress={() =>
                  setSelected(filteredPending.filter(canUpdate).map(i => i.id))
                }
              />
              {selected.length > 0 && (
                <>
                  <PrimaryButton
                    label={tr('Bulk edit')}
                    disabled={busy}
                    onPress={() => setBulkOpen(true)}
                  />
                  <PrimaryButton
                    label={tr('Group selected as batch')}
                    variant="secondary"
                    disabled={
                      busy ||
                      selectedItems.length < 2 ||
                      !hasPermission('queue:create')
                    }
                    onPress={() => setBatchName('')}
                  />
                  <PrimaryButton
                    label={tr('Cancel selected')}
                    variant="secondary"
                    disabled={busy || !selectedItems.every(canDelete)}
                    onPress={() =>
                      confirm(
                        translateNative('native.ebfa49b026fe2593'),
                        String(selectedItems.length),
                        async () => {
                          for (const item of selectedItems)
                            await queueApi.cancelQueueItem(item.id);
                          setSelected([]);
                        },
                      )
                    }
                  />
                  <PrimaryButton
                    label={tr('Delete selected')}
                    variant="danger"
                    disabled={busy || !selectedItems.every(canDelete)}
                    onPress={() =>
                      confirm(
                        translateNative('native.e51a13765e8b96ed'),
                        String(selectedItems.length),
                        async () => {
                          for (const item of selectedItems)
                            await queueApi.deleteQueueItem(item.id);
                          setSelected([]);
                        },
                      )
                    }
                  />
                  <PrimaryButton
                    label={tr('Clear selection')}
                    variant="secondary"
                    onPress={() => setSelected([])}
                  />
                </>
              )}
            </View> : null}
            <View style={styles.listSection}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{tr('Queued items')}</Text>
              {layout === 'position'
                ? renderPending(filteredPending)
                : Array.from(new Set(filteredPending.map(printerLabel))).map(
                    label => (
                      <View key={label} style={styles.listSection}>
                        <Text accessibilityRole="header" style={[styles.batchTitle, { color: colors.textSecondary }]}>{label}</Text>
                        {renderPending(
                          filteredPending.filter(
                            i => printerLabel(i) === label,
                          ),
                        )}
                      </View>
                    ),
                  )}
              {!filteredPending.length && (
                <EmptyState
                  title={tr('No queued items')}
                  message={tr('Add a configured print from Files or Archives.')}
                />
              )}
            </View>
            {active.filter(filter).length > 0 ? <View style={styles.listSection}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{tr('Currently printing')}</Text>
              {active.filter(filter).map(card)}
            </View> : null}
          </>
        )}
        {tab === 'history' && (
          <>
            {showFilters ? <>
            <Choice
              label={translateNative('native.fcb8a4c1768e7fc6')}
              value={historySort}
              options={['date', 'name', 'printer'].map(s => ({
                value: s,
                label: s,
              }))}
              onChange={setHistorySort}
            />
            <Choice
              label={translateNative('native.c0e0f342028c3feb')}
              value={historyDirection}
              options={[
                { value: 1, get label() { return translateNative('native.9147375e0bcc4243'); } },
                { value: -1, get label() { return translateNative('native.302bf67d25000cd5'); } },
              ]}
              onChange={setHistoryDirection}
            />
            </> : null}
            {showTools && hasPermission('queue:delete_all') && (
              <PrimaryButton
                label={`${tr('Clear history')} (${history.length})`}
                variant="danger"
                disabled={busy || !history.length}
                onPress={() =>
                  confirm(
                    translateNative('native.a1f0be0e0785e518'),
                    t('queue.clearCount', {
                      defaultValue:
                        'Remove {{count}} finished records? Pending and active jobs are preserved. Order source runs may be retained by the server.',
                      count: history.length,
                    }),
                    async () => {
                      let deleted = 0,
                        kept = 0;
                      for (const item of history) {
                        const result = await queueApi.deleteQueueItem(item.id);
                        if (result.deleted === false) kept++;
                        else deleted++;
                      }
                      showToast(
                        nativeMessage('queue.clearedCounts', () => ({
                          defaultValue:
                            '{{deleted}} records deleted; {{kept}} retained for orders.',
                          deleted,
                          kept,
                        })),
                        'success',
                      );
                    },
                  )
                }
              />
            )}
            {filteredHistory.map(card)}
          </>
        )}
        {tab === 'timeline' && (
          <GanttTimeline
            items={items.filter(filter)}
            printers={printers.data ?? []}
            onItemPress={item => {
              if (item.status === 'printing') {
                if (hasPermission('printers:control')) stop(item);
              } else if (
                terminal(item) ? hasPermission('queue:create') : canUpdate(item)
              )
                configure(item);
            }}
          />
        )}
        {tab === 'batches' && (
          <>
            {showFilters ? <Choice
              label={translateNative('native.8cb0b2fae44798e8')}
              value={batchStatus}
              options={['active', 'completed', 'cancelled', 'all'].map(s => ({
                value: s,
                label: s,
              }))}
              onChange={setBatchStatus}
            /> : null}
            {batches.isError && (
              <ErrorState
                message={tr('Unable to load batch orders')}
                onRetry={() => {
                  void batches.refetch();
                }}
              />
            )}
            {(batches.data ?? [])
              .filter(
                b =>
                  (batchStatus === 'all' || b.status === batchStatus) &&
                  (!search ||
                    b.name.toLowerCase().includes(search.toLowerCase())),
              )
              .map(renderBatch)}
          </>
        )}
      </ScrollView>
      <QueueBulkEditModal
        visible={bulkOpen}
        count={selectedItems.length}
        printers={printers.data ?? []}
        loading={busy}
        allowFixedPrinterAssignment={allowFixedPrinterAssignment}
        onClose={() => setBulkOpen(false)}
        onSave={(update: PrintQueueItemUpdate) => {
          if (update.printer_id != null && !allowFixedPrinterAssignment) {
            showToast(
              nativeMessage('printing.unresolvedVariantAssignment', () => ({
                defaultValue:
                  'Jobs with unresolved alternative slices cannot be assigned a fixed printer. Leave the printer unchanged or unassigned.',
              })),
              'error',
            );
            return;
          }
          void perform(async () => {
            const result = await queueApi.bulkUpdateQueue({
              item_ids: selectedItems.filter(canUpdate).map(i => i.id),
              ...update,
            });
            showToast(result.message, 'success');
            setBulkOpen(false);
            setSelected([]);
          });
        }}
      />
      <Modal
        visible={batchName != null}
        animationType="slide"
        onRequestClose={() => setBatchName(null)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <LaunchField
            label={translateNative('native.3fbfdb405f0fd055')}
            value={batchName ?? ''}
            onChange={setBatchName}
          />
          <PrimaryButton
            label={tr('Create named batch')}
            disabled={busy || !batchName?.trim()}
            onPress={() => {
              void perform(async () => {
                await queueApi.createBatch({
                  name: batchName!.trim(),
                  item_ids: selectedItems.filter(canUpdate).map(i => i.id),
                });
                setBatchName(null);
                setSelected([]);
              });
            }}
          />
          <PrimaryButton
            label={tr('Cancel')}
            variant="secondary"
            onPress={() => setBatchName(null)}
          />
        </View>
      </Modal>
      <Modal
        visible={batchDetailId != null}
        animationType="slide"
        onRequestClose={() => setBatchDetailId(null)}
      >
        <ScrollView
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: colors.background },
          ]}
        >
          {batchDetail.data && renderBatch(batchDetail.data)}
          {items.filter(i => i.batch_id === batchDetailId).map(card)}
          <PrimaryButton
            label={tr('Close')}
            variant="secondary"
            onPress={() => setBatchDetailId(null)}
          />
        </ScrollView>
      </Modal>
      {launch && (
        <PrintModal
          visible
          initialFileId={launch.item.library_file_id}
          initialArchiveId={launch.item.archive_id}
          queueItem={launch.item}
          requeue={launch.requeue}
          initialMode="queue"
          onClose={() => setLaunch(null)}
        />
      )}
      <ConfirmModal
        visible={!!confirmation}
        title={confirmation?.title ?? ''}
        message={confirmation?.message ?? ''}
        loading={busy}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={() => {
          if (confirmation) void perform(confirmation.run);
        }}
        confirmLabel={tr('Confirm')}
        cancelLabel={tr('Cancel')}
      />
      <ConfirmModal
        visible={!!shortage}
        title={tr('Review filament shortage')}
        message={shortage?.text ?? ''}
        variant="warning"
        loading={busy}
        onClose={() => setShortage(null)}
        confirmLabel={tr('Print anyway')}
        cancelLabel={tr('Cancel')}
        onConfirm={() => {
          if (shortage) void start(shortage.id, true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listSection: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  batchHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  batchToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  batchTitle: { flexShrink: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  batchMore: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modal: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
});
