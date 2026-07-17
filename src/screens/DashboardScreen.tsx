import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useQueries,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import {
  InlineTabBar,
  PrimaryButton,
  SearchBar,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { AddPrinterModal } from '@/components/printers/AddPrinterModal';
import { PrinterCard } from '@/components/printers/PrinterCard';
import { PrintModal } from '@/components/printers/PrintModal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, spacing } from '@/theme/tokens';
import type {
  MaintenanceStatus,
  Printer,
  PrinterStatus,
  PrintQueueItem,
} from '@/types/api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'printing', label: 'Printing' },
  { key: 'paused', label: 'Paused' },
  { key: 'idle', label: 'Idle' },
  { key: 'issues', label: 'Issues' },
  { key: 'offline', label: 'Offline' },
] as const;

type FilterMode = (typeof FILTERS)[number]['key'];

interface MaintenanceSummary {
  dueCount: number;
  warningCount: number;
  items: MaintenanceStatus[];
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function collectLoadedTypes(status?: PrinterStatus) {
  const types = new Set<string>();

  for (const ams of status?.ams ?? []) {
    for (const tray of ams.tray ?? []) {
      if (tray.tray_type) types.add(tray.tray_type.toUpperCase());
    }
  }

  for (const tray of status?.vt_tray ?? []) {
    if (tray.tray_type) types.add(tray.tray_type.toUpperCase());
  }

  return types;
}

function collectLoadedFilaments(status?: PrinterStatus) {
  const filaments = new Set<string>();

  const addTray = (type: string | null | undefined, color: string | null | undefined) => {
    if (!type || !color) return;
    const normalized = color.replace('#', '').toLowerCase().slice(0, 6);
    filaments.add(`${type.toUpperCase()}:${normalized}`);
  };

  for (const ams of status?.ams ?? []) {
    for (const tray of ams.tray ?? []) {
      addTray(tray.tray_type, tray.tray_color);
    }
  }

  for (const tray of status?.vt_tray ?? []) {
    addTray(tray.tray_type, tray.tray_color);
  }

  return filaments;
}

function queueItemMatchesPrinter(
  printer: Printer,
  status: PrinterStatus | undefined,
  item: PrintQueueItem,
) {
  if (item.status !== 'pending') return false;

  if (item.printer_id != null) {
    return item.printer_id === printer.id;
  }

  if (item.target_model && normalizeText(item.target_model) !== normalizeText(printer.model)) {
    return false;
  }

  if (item.target_location && normalizeText(item.target_location) !== normalizeText(printer.location)) {
    return false;
  }

  if (!item.target_model && !item.target_location) {
    return false;
  }

  const loadedTypes = collectLoadedTypes(status);
  const loadedFilaments = collectLoadedFilaments(status);

  if (item.required_filament_types?.length) {
    const hasEveryType = item.required_filament_types.every(type =>
      loadedTypes.has(type.toUpperCase()),
    );
    if (!hasEveryType) return false;
  }

  if (item.filament_overrides?.length) {
    const forcedOverrides = item.filament_overrides.filter(
      override => override.force_color_match === true,
    );
    const preferredOverrides = item.filament_overrides.filter(
      override => override.force_color_match !== true,
    );

    if (forcedOverrides.length > 0) {
      const hasAllForced = forcedOverrides.every(override => {
        const color = override.color.replace('#', '').toLowerCase().slice(0, 6);
        return loadedFilaments.has(`${override.type.toUpperCase()}:${color}`);
      });
      if (!hasAllForced) return false;
    }

    if (preferredOverrides.length > 0 && forcedOverrides.length === 0) {
      const hasAnyPreferred = preferredOverrides.some(override => {
        const color = override.color.replace('#', '').toLowerCase().slice(0, 6);
        return loadedFilaments.has(`${override.type.toUpperCase()}:${color}`);
      });
      if (!hasAnyPreferred) return false;
    }
  }

  return true;
}

function classifyPrinter(
  printer: Printer,
  status: PrinterStatus | undefined,
  maintenance: MaintenanceSummary | undefined,
) {
  if (printer.is_active === false) return 'issues';
  if (!status?.connected) return 'offline';
  if ((status.hms_errors?.length ?? 0) > 0) return 'issues';
  if ((maintenance?.dueCount ?? 0) > 0) return 'issues';
  if (status.state === 'RUNNING') return 'printing';
  if (status.state === 'PAUSE') return 'paused';
  if (status.state === 'FAILED') return 'issues';
  return 'idle';
}

export default function PrintersDashboardScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Printers' });
  }, [navigation]);

  const { colors } = useTheme();
  const { hasAnyPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: wsConnected } = useWebSocket();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [snapshotSeed, setSnapshotSeed] = useState(0);
  const [printPrinterId, setPrintPrinterId] = useState<number | null>(null);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [selectedPrinterIds, setSelectedPrinterIds] = useState<number[]>([]);

  const addPrinterMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.createPrinter(data),
    onSuccess: () => {
      setShowAddPrinter(false);
      queryClient.invalidateQueries({ queryKey: ['printers'] });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSnapshotSeed(current => current + 1);
    }, 15_000);

    return () => clearInterval(interval);
  }, []);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.getPrinters()) as unknown as Printer[],
  });

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: async () => (await api.getQueue()) as unknown as PrintQueueItem[],
    enabled: hasAnyPermission('queue:read', 'queue:read_all', 'queue:read_own'),
  });

  const maintenanceQuery = useQuery({
    queryKey: ['maintenanceTasks'],
    queryFn: async () =>
      (await api.getMaintenanceTasks()) as unknown as MaintenanceStatus[],
    enabled: hasAnyPermission('maintenance:read'),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['spool-assignments'],
    queryFn: () => api.getAssignments(),
    staleTime: 30_000,
  });

  const selectionMode = selectedPrinterIds.length > 0;

  const printers = useMemo(() => printersQuery.data ?? [], [printersQuery.data]);

  const statusQueries = useQueries({
    queries: printers.map(printer => ({
      queryKey: ['printerStatus', printer.id],
      queryFn: async () =>
        (await api.getPrinterStatus(printer.id)) as unknown as PrinterStatus,
      refetchInterval: 15_000,
      staleTime: 5_000,
    })),
  });

  const statusByPrinter = useMemo(() => {
    const map = new Map<number, PrinterStatus | undefined>();
    printers.forEach((printer, index) => {
      map.set(printer.id, statusQueries[index]?.data);
    });
    return map;
  }, [printers, statusQueries]);

  const statusQueryByPrinter = useMemo(() => {
    const map = new Map<number, (typeof statusQueries)[number] | undefined>();
    printers.forEach((printer, index) => {
      map.set(printer.id, statusQueries[index]);
    });
    return map;
  }, [printers, statusQueries]);

  const maintenanceByPrinter = useMemo(() => {
    const map = new Map<number, MaintenanceSummary>();

    for (const item of maintenanceQuery.data ?? []) {
      const existing = map.get(item.printer_id) ?? {
        dueCount: 0,
        warningCount: 0,
        items: [],
      };
      existing.items.push(item);
      if (item.is_due) existing.dueCount += 1;
      else if (item.is_warning) existing.warningCount += 1;
      map.set(item.printer_id, existing);
    }

    return map;
  }, [maintenanceQuery.data]);

  const queueCounts = useMemo(() => {
    const map = new Map<number, number>();

    for (const printer of printers) {
      const status = statusByPrinter.get(printer.id);
      const count = (queueQuery.data ?? []).filter(item =>
        queueItemMatchesPrinter(printer, status, item),
      ).length;
      map.set(printer.id, count);
    }

    return map;
  }, [printers, queueQuery.data, statusByPrinter]);

  const filteredPrinters = useMemo(() => {
    const term = search.trim().toLowerCase();

    return printers.filter(printer => {
      const status = statusByPrinter.get(printer.id);
      const maintenance = maintenanceByPrinter.get(printer.id);
      const mode = classifyPrinter(printer, status, maintenance);
      const matchesSearch =
        !term ||
        [printer.name, printer.model, printer.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term);

      if (!matchesSearch) return false;
      if (filter === 'all') return true;
      if (filter === 'issues') return mode === 'issues';
      return mode === filter;
    });
  }, [filter, maintenanceByPrinter, printers, search, statusByPrinter]);

  const summary = useMemo(() => {
    return printers.reduce(
      (acc, printer) => {
        const status = statusByPrinter.get(printer.id);
        const maintenance = maintenanceByPrinter.get(printer.id);
        const mode = classifyPrinter(printer, status, maintenance);
        acc.total += 1;
        if (mode === 'printing') acc.printing += 1;
        if (mode === 'paused') acc.paused += 1;
        if (mode === 'idle') acc.idle += 1;
        if (mode === 'issues') acc.issues += 1;
        if (mode === 'offline') acc.offline += 1;
        return acc;
      },
      { total: 0, printing: 0, paused: 0, idle: 0, issues: 0, offline: 0 },
    );
  }, [maintenanceByPrinter, printers, statusByPrinter]);

  const handleRefresh = async () => {
    await Promise.all([
      printersQuery.refetch(),
      queueQuery.refetch(),
      maintenanceQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['printerStatus'] }),
    ]);
  };

  const toggleSelectedPrinter = (printerId: number) => {
    setSelectedPrinterIds(current =>
      current.includes(printerId)
        ? current.filter(id => id !== printerId)
        : [...current, printerId],
    );
  };

  const bulkActionMutation = useMutation({
    mutationFn: async (
      action: 'pause' | 'resume' | 'stop' | 'light-on' | 'light-off',
    ) => {
      if (selectedPrinterIds.length === 0) {
        throw new Error('Select one or more printers first.');
      }

      const results = await Promise.allSettled(
        selectedPrinterIds.map(printerId => {
          if (action === 'pause') return api.pausePrint(printerId);
          if (action === 'resume') return api.resumePrint(printerId);
          if (action === 'stop') return api.stopPrint(printerId);
          return api.setChamberLight(printerId, action === 'light-on');
        }),
      );

      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failureCount = results.length - successCount;

      if (successCount === 0) {
        throw new Error('The selected printer action failed for every printer.');
      }

      return { action, successCount, failureCount };
    },
    onSuccess: async ({ action, successCount, failureCount }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
      ]);
      setSelectedPrinterIds([]);
      const actionLabel =
        action === 'pause'
          ? 'Pause'
          : action === 'resume'
            ? 'Resume'
            : action === 'stop'
              ? 'Stop'
              : action === 'light-on'
                ? 'LED on'
                : 'LED off';
      showToast(
        `${actionLabel} sent to ${successCount} printer${successCount === 1 ? '' : 's'}${failureCount ? ` (${failureCount} failed)` : ''}.`,
        failureCount ? 'warning' : 'success',
      );
    },
    onError: (error: Error) => {
      showToast(error.message || 'Bulk printer action failed.', 'error');
    },
  });

  if (printersQuery.isLoading) {
    return <LoadingScreen message="Loading printer fleet…" />;
  }

  if (printersQuery.isError) {
    return (
      <ErrorState
        message="Unable to load printers."
        onRetry={() => {
          printersQuery.refetch();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={filteredPrinters}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={ListSeparator}
        refreshControl={
          <RefreshControl
            refreshing={
              printersQuery.isRefetching ||
              queueQuery.isRefetching ||
              maintenanceQuery.isRefetching
            }
            onRefresh={() => {
              handleRefresh();
            }}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => {
          const status = statusByPrinter.get(item.id);
          const maintenance = maintenanceByPrinter.get(item.id);
          const statusQuery = statusQueryByPrinter.get(item.id);
          const selected = selectedPrinterIds.includes(item.id);
          const toggleSelection = () => toggleSelectedPrinter(item.id);

          return (
            <Pressable
              onLongPress={() => {
                setSelectedPrinterIds(current =>
                  current.includes(item.id) ? current : [...current, item.id],
                );
              }}
            >
              <PrinterCard
                printer={item}
                status={status}
                queueCount={queueCounts.get(item.id) ?? 0}
                maintenance={maintenance}
                spoolAssignments={assignmentsQuery.data}
                snapshotSeed={`${snapshotSeed}-${item.id}-${status?.state ?? 'idle'}-${status?.progress ?? 0}`}
                loading={Boolean(statusQuery?.isLoading || statusQuery?.isRefetching)}
                selected={selected}
                selectionMode={selectionMode}
                onLongPress={() => {
                  setSelectedPrinterIds(current =>
                    current.includes(item.id) ? current : [...current, item.id],
                  );
                }}
                onToggleSelect={toggleSelection}
                onPress={() =>
                  selectionMode
                    ? toggleSelection()
                    : navigation.navigate('PrinterDetail', { id: String(item.id) })
                }
                onCameraPress={() =>
                  selectionMode
                    ? toggleSelection()
                    : navigation.navigate('Camera', { id: String(item.id) })
                }
                onQueuePress={() =>
                  selectionMode ? toggleSelection() : navigation.navigate('Queue')
                }
                onMaintenancePress={() =>
                  selectionMode ? toggleSelection() : navigation.navigate('Maintenance')
                }
                onPrintPress={() =>
                  selectionMode ? toggleSelection() : setPrintPrinterId(item.id)
                }
              />
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            {selectionMode ? (
              <View
                style={[
                  styles.bulkBar,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.bulkBarHeader}>
                  <Text style={[styles.bulkTitle, { color: colors.text }]}>
                    {selectedPrinterIds.length} selected
                  </Text>
                  <PrimaryButton
                    label="Done"
                    variant="secondary"
                    onPress={() => setSelectedPrinterIds([])}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.bulkActions}
                >
                  <PrimaryButton
                    label="Pause all"
                    variant="secondary"
                    onPress={() => void bulkActionMutation.mutateAsync('pause')}
                    disabled={bulkActionMutation.isPending}
                  />
                  <PrimaryButton
                    label="Resume all"
                    variant="secondary"
                    onPress={() => void bulkActionMutation.mutateAsync('resume')}
                    disabled={bulkActionMutation.isPending}
                  />
                  <PrimaryButton
                    label="Stop all"
                    variant="danger"
                    onPress={() => void bulkActionMutation.mutateAsync('stop')}
                    disabled={bulkActionMutation.isPending}
                  />
                  <PrimaryButton
                    label="LED on"
                    variant="secondary"
                    onPress={() => void bulkActionMutation.mutateAsync('light-on')}
                    disabled={bulkActionMutation.isPending}
                  />
                  <PrimaryButton
                    label="LED off"
                    variant="secondary"
                    onPress={() => void bulkActionMutation.mutateAsync('light-off')}
                    disabled={bulkActionMutation.isPending}
                  />
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.toolbarRow}>
              <View style={{ flex: 1 }}>
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search printers…"
                />
              </View>
              <View
                style={[
                  styles.liveBadge,
                  {
                    backgroundColor: wsConnected ? colors.accentBg : colors.surfaceElevated,
                    borderColor: wsConnected ? colors.accent : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.liveDot,
                    { backgroundColor: wsConnected ? colors.accent : colors.textTertiary },
                  ]}
                />
                <Text
                  style={[
                    styles.liveLabel,
                    { color: wsConnected ? colors.accentLight : colors.textSecondary },
                  ]}
                >
                  {wsConnected ? 'Live' : 'Polling'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowAddPrinter(true)}
                style={[styles.addBtn, { backgroundColor: colors.accent }]}
              >
                <Plus size={18} color="#fff" strokeWidth={2.5} />
              </Pressable>
            </View>

            <InlineTabBar
              value={filter}
              tabs={FILTERS.map(item => ({ key: item.key, label: item.label }))}
              onChange={setFilter}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🖨️"
            title={
              printers.length === 0
                ? 'No printers configured'
                : 'No printers match this filter'
            }
            message={
              printers.length === 0
                ? 'Connect printers to your Bambuddy server to see the dashboard here.'
                : 'Try a different search term or status filter.'
            }
          />
        }
      />
      <PrintModal
        visible={printPrinterId != null}
        initialPrinterId={printPrinterId}
        onClose={() => setPrintPrinterId(null)}
      />
      <AddPrinterModal
        visible={showAddPrinter}
        onClose={() => setShowAddPrinter(false)}
        onAdd={(data) => addPrinterMutation.mutate(data as Record<string, unknown>)}
        existingSerials={printers.map(p => p.serial_number ?? '')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.md },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  bulkBar: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  bulkBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bulkTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  bulkActions: {
    gap: spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  liveLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
