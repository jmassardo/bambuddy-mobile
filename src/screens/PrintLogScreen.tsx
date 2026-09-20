import React, { useMemo, useState } from 'react';
<<<<<<< HEAD
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
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
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  XCircle,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import {
  Chip,
  SearchBar,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { PrintLogEntry, Printer } from '@/types/api';
import {
  formatDateTime,
  formatDuration,
  normalizeStatus,
  statusColor,
} from '@/utils/data';

type RangeFilter = 'all' | '7d' | '30d' | '90d' | 'custom';

function dateOnly(value: Date): string {
  return value.toISOString().split('T')[0];
}

function getPresetRange(range: Exclude<RangeFilter, 'custom'>) {
  if (range === 'all') return { dateFrom: undefined, dateTo: undefined };
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { dateFrom: dateOnly(start), dateTo: dateOnly(now) };
}

function toTimestamp(entry: PrintLogEntry): number {
  const value = entry.completed_at || entry.started_at || entry.created_at;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function toEventType(status: string): string {
  return status.trim().toLowerCase() || 'unknown';
}

function matchesCustomRange(entry: PrintLogEntry, from?: string, to?: string): boolean {
  const stamp = toTimestamp(entry);
  if (!stamp) return false;
  if (from) {
    const fromStamp = new Date(`${from}T00:00:00`).getTime();
    if (Number.isFinite(fromStamp) && stamp < fromStamp) return false;
  }
  if (to) {
    const toStamp = new Date(`${to}T23:59:59`).getTime();
    if (Number.isFinite(toStamp) && stamp > toStamp) return false;
  }
  return true;
}

function eventIcon(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('pause') || normalized.includes('hold')) return PauseCircle;
  if (normalized.includes('resume')) return PlayCircle;
  if (
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('finished')
  ) {
    return CheckCircle2;
  }
  if (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('cancel') ||
    normalized.includes('abort') ||
    normalized.includes('stop')
  ) {
    return XCircle;
  }
  if (normalized.includes('start') || normalized.includes('print')) return PlayCircle;
  return AlertCircle;
}

export default function PrintLogScreen() {
  const navigation = useNavigation<RootNavigationProp<'PrintLog'>>();
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | 'all'>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('30d');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Print Log' });
  }, [navigation]);

  const activeRange = useMemo(() => {
    if (rangeFilter === 'custom') {
      return {
        dateFrom: customDateFrom.trim() || undefined,
        dateTo: customDateTo.trim() || undefined,
      };
    }
    return getPresetRange(rangeFilter);
  }, [customDateFrom, customDateTo, rangeFilter]);

  const printLogQuery = useQuery({
    queryKey: [
      'printLog',
      selectedPrinterId,
      selectedEventType,
      activeRange.dateFrom,
      activeRange.dateTo,
    ],
    queryFn: () =>
      api.getPrintLog({
        limit: 500,
        ...(selectedPrinterId !== 'all' ? { printerId: selectedPrinterId } : {}),
        ...(selectedEventType !== 'all' ? { status: selectedEventType } : {}),
        ...(activeRange.dateFrom ? { dateFrom: activeRange.dateFrom } : {}),
        ...(activeRange.dateTo ? { dateTo: activeRange.dateTo } : {}),
      }),
    staleTime: 30_000,
  });

  const printersQuery = useQuery({
    queryKey: ['printers', 'print-log'],
    queryFn: () => api.getPrinters(),
    staleTime: 30_000,
  });

  const entries = useMemo(() => {
    const items = Array.isArray(printLogQuery.data?.items)
      ? printLogQuery.data.items
      : [];
    return [...items].sort((a, b) => toTimestamp(b) - toTimestamp(a));
  }, [printLogQuery.data?.items]);

  const eventTypes = useMemo(() => {
    const values = new Set<string>();
    entries.forEach(entry => values.add(toEventType(entry.status)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const printers = useMemo(
    () => (Array.isArray(printersQuery.data) ? (printersQuery.data as Printer[]) : []),
    [printersQuery.data],
  );

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter(entry => {
      const entryType = toEventType(entry.status);
      if (selectedEventType !== 'all' && entryType !== selectedEventType) return false;
      if (selectedPrinterId !== 'all' && entry.printer_id !== selectedPrinterId) return false;
      if (term && !(entry.print_name || '').toLowerCase().includes(term)) return false;
      if (!matchesCustomRange(entry, activeRange.dateFrom, activeRange.dateTo)) return false;
      return true;
    });
  }, [activeRange.dateFrom, activeRange.dateTo, entries, search, selectedEventType, selectedPrinterId]);

  const refreshAll = async () => {
    await Promise.all([printLogQuery.refetch(), printersQuery.refetch()]);
  };

  if (printLogQuery.isLoading && printersQuery.isLoading) {
    return <LoadingScreen message="Loading print log…" />;
  }

  if (printLogQuery.isError) {
    return (
      <ErrorState
        message="Unable to load print log events."
        onRetry={() => {
          void refreshAll();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredEntries}
        keyExtractor={item => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={printLogQuery.isRefetching || printersQuery.isRefetching}
            onRefresh={() => {
              void refreshAll();
            }}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const Icon = eventIcon(item.status);
          const type = toEventType(item.status);
          const typeColor = statusColor(type, colors);
          return (
            <Pressable
              style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => {
                if (item.archive_id) navigation.navigate('ArchiveDetail', { id: String(item.archive_id) });
              }}
              disabled={!item.archive_id}
            >
              <View style={styles.rowTop}>
                <View style={styles.rowTitleWrap}>
                  <Icon size={18} color={typeColor} strokeWidth={2} />
                  <Text style={[styles.rowEvent, { color: typeColor }]}>{normalizeStatus(item.status)}</Text>
                </View>
                <Text style={[styles.rowTime, { color: colors.textSecondary }]}>
                  {formatDateTime(item.completed_at || item.started_at || item.created_at)}
                </Text>
              </View>
              <Text style={[styles.rowPrintName, { color: colors.text }]}>
                {item.print_name || 'Unnamed print'}
              </Text>
              <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                {item.printer_name || 'Unknown printer'}
                {item.duration_seconds ? ` • ${formatDuration(item.duration_seconds)}` : ''}
              </Text>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <SectionCard
            title="Chronological print events"
            subtitle="Filter by printer, event type, date range, and search by print name."
          >
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search print name"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Chip label="All printers" selected={selectedPrinterId === 'all'} onPress={() => setSelectedPrinterId('all')} />
              {printers.map(printer => (
                <Chip
                  key={printer.id}
                  label={printer.name}
                  selected={selectedPrinterId === printer.id}
                  onPress={() => setSelectedPrinterId(printer.id)}
                />
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Chip label="All events" selected={selectedEventType === 'all'} onPress={() => setSelectedEventType('all')} />
              {eventTypes.map(eventType => (
                <Chip
                  key={eventType}
                  label={normalizeStatus(eventType)}
                  selected={selectedEventType === eventType}
                  onPress={() => setSelectedEventType(eventType)}
                />
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['all', '7d', '30d', '90d', 'custom'] as RangeFilter[]).map(range => (
                <Chip
                  key={range}
                  label={range === 'all' ? 'All dates' : range === 'custom' ? 'Custom range' : range.toUpperCase()}
                  selected={rangeFilter === range}
                  onPress={() => setRangeFilter(range)}
                />
              ))}
            </ScrollView>

            {rangeFilter === 'custom' ? (
              <View style={styles.customDateRow}>
                <View style={styles.dateField}>
                  <TextField
                    label="From (YYYY-MM-DD)"
                    value={customDateFrom}
                    onChangeText={setCustomDateFrom}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="2026-01-01"
                  />
                </View>
                <View style={styles.dateField}>
                  <TextField
                    label="To (YYYY-MM-DD)"
                    value={customDateTo}
                    onChangeText={setCustomDateTo}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="2026-01-31"
                  />
                </View>
              </View>
            ) : null}
          </SectionCard>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🧾"
            title="No print log events"
            message="No events match the current filters."
          />
        }
      />
=======
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  X,
} from 'lucide-react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { shareBlob } from '@/utils/share';
import { formatDateTime, pickNumber, pickString, type ApiRecord } from '@/utils/data';

interface PrintLogRow {
  id: number;
  print_name: string;
  printer_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  filament_type: string | null;
  filament_color: string | null;
  filament_used_grams: number | null;
  cost: number | null;
  duration_seconds: number | null;
  created_by_username: string | null;
  created_at: string;
}

function normalizePrintLog(data: Record<string, unknown> | Record<string, unknown>[] | null): PrintLogRow[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map(row => normalizeSingleLog(row as ApiRecord));
  }

  if ('items' in data) {
    const items = (data.items as Record<string, unknown>[]) ?? [];
    return items.map(row => normalizeSingleLog(row as ApiRecord));
  }

  return [normalizeSingleLog(data as ApiRecord)];
}

function normalizeSingleLog(record: ApiRecord): PrintLogRow {
  return {
    id: pickNumber(record, ['id']),
    print_name: pickString(record, ['print_name', 'filename'], 'Untitled'),
    printer_name: pickString(record, ['printer_name', 'printer'], 'Unknown printer'),
    status: pickString(record, ['status'], 'unknown'),
    started_at: pickString(record, ['started_at']),
    completed_at: pickString(record, ['completed_at']),
    failure_reason: pickString(record, ['failure_reason', 'error_reason', 'cancel_reason']),
    filament_type: pickString(record, ['filament_type']),
    filament_color: pickString(record, ['filament_color', 'filament_colour']),
    filament_used_grams: pickNumber(record, ['filament_used_grams', 'filament_used_g']),
    cost: pickNumber(record, ['cost', 'estimated_cost']),
    duration_seconds: pickNumber(record, ['duration_seconds', 'actual_time_seconds', 'print_time_seconds']),
    created_by_username: pickString(record, ['created_by_username', 'username']),
    created_at: pickString(record, ['created_at'], ''),
  };
}

type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';
type FilterKey = 'printer' | 'status' | 'date';

export default function PrintLogScreen() {
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPrinter, setFilterPrinter] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<RangeKey>('30d');
  const [showFilters, setShowFilters] = useState(false);
  const [filterModal, setFilterModal] = useState<FilterKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filterOptions = useMemo(() => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    if (filterDate === 'all') return {};
    const days = filterDate === 'today' ? 1 : Number(filterDate.replace('d', ''));
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    return {
      dateFrom: start.toISOString().split('T')[0],
      dateTo: end,
    };
  }, [filterDate]);

  const printLogsQuery = useQuery({
    queryKey: ['printLogs', searchQuery, filterPrinter, filterStatus, filterDate],
    queryFn: () =>
      api.getPrintLogs({
        search: searchQuery || undefined,
        printerName: filterPrinter || undefined,
        status: filterStatus || undefined,
        ...filterOptions,
        limit: 500,
      }),
    select: data => normalizePrintLog(data),
  });

  const printersQuery = useQuery({
    queryKey: ['printLogPrinters', searchQuery, filterStatus, filterDate],
    queryFn: async () => {
      const result = await api.getPrintLogs({
        search: searchQuery || undefined,
        ...filterOptions,
        limit: 500,
      });
      const logs = normalizePrintLog(result);
      const printerMap = new Map<string, number>();
      logs.forEach(log => {
        printerMap.set(log.printer_name, (printerMap.get(log.printer_name) ?? 0) + 1);
      });
      return Array.from(printerMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    },
    select: data => data.filter(p => p.name !== 'Unknown printer'),
  });

  const statusesQuery = useQuery({
    queryKey: ['printLogStatuses', searchQuery, filterPrinter, filterDate],
    queryFn: async () => {
      const result = await api.getPrintLogs({
        search: searchQuery || undefined,
        printerName: filterPrinter || undefined,
        ...filterOptions,
        limit: 500,
      });
      const logs = normalizePrintLog(result);
      const statusMap = new Map<string, number>();
      logs.forEach(log => {
        statusMap.set(log.status, (statusMap.get(log.status) ?? 0) + 1);
      });
      return Array.from(statusMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'json') => {
      const data = printLogsQuery.data ?? [];
      if (format === 'json') {
        const blobOptions: BlobOptions = {
          type: 'application/json',
          lastModified: Date.now(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], blobOptions);
        await shareBlob(blob, `bambuddy-print-log-${filterDate}.${format}`);
        return;
      }
      const csv = buildPrintLogCsv(data);
      const blobOptions: BlobOptions = {
        type: 'text/csv',
        lastModified: Date.now(),
      };
      const blob = new Blob([csv], blobOptions);
      await shareBlob(blob, `bambuddy-print-log-${filterDate}.csv`);
    },
    onSuccess: () => showToast('Print log exported.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export print log.', 'error'),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      printLogsQuery.refetch(),
      printersQuery.refetch(),
      statusesQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const activeFilters = [
    filterPrinter ? `Printer: ${filterPrinter}` : null,
    filterStatus ? `Status: ${filterStatus}` : null,
    filterDate !== '30d' ? `Date: ${filterDate}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Search size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by print name, error..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => setShowFilters(!showFilters)} hitSlop={8}>
          <Filter size={18} color={showFilters ? colors.accent : colors.textSecondary} />
        </Pressable>
      </View>

      {activeFilters.length > 0 && (
        <View style={styles.filterBar}>
          {activeFilters.map((filter, i) => (
            <Pressable
              key={i}
              style={[styles.filterChip, { backgroundColor: colors.accentBg, borderColor: colors.accent }]}
              onPress={() => {
                if (filter!.startsWith('Printer:')) setFilterPrinter(null);
                else if (filter!.startsWith('Status:')) setFilterStatus(null);
                else setFilterDate('30d');
              }}
            >
              <Text style={[styles.filterChipText, { color: colors.accent }]}>{filter!}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {showFilters && (
        <View style={[styles.filterPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.filterPanelRow}>
            <Text style={[styles.filterPanelLabel, { color: colors.textSecondary }]}>Printer</Text>
            <Pressable
              style={[styles.filterButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              onPress={() => setFilterModal('printer')}
            >
              <Text style={[styles.filterButtonLabel, { color: filterPrinter ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                {filterPrinter || 'All printers'}
              </Text>
              <ChevronDown size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.filterPanelRow}>
            <Text style={[styles.filterPanelLabel, { color: colors.textSecondary }]}>Status</Text>
            <Pressable
              style={[styles.filterButton, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              onPress={() => setFilterModal('status')}
            >
              <Text style={[styles.filterButtonLabel, { color: filterStatus ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                {filterStatus || 'All statuses'}
              </Text>
              <ChevronDown size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.filterPanelRow}>
            <Text style={[styles.filterPanelLabel, { color: colors.textSecondary }]}>Date range</Text>
            <InlineTabBar
              value={filterDate}
              tabs={[
                { key: 'today', label: 'Today' },
                { key: '7d', label: '7d' },
                { key: '30d', label: '30d' },
                { key: '90d', label: '90d' },
                { key: 'all', label: 'All' },
              ]}
              onChange={value => setFilterDate(value as RangeKey)}
              colors={colors}
            />
          </View>
        </View>
      )}

      {printLogsQuery.isLoading ? (
        <LoadingScreen message="Loading print log..." />
      ) : printLogsQuery.isError ? (
        <ErrorState message="Unable to load print log." onRetry={onRefresh} />
      ) : printLogsQuery.data?.length === 0 ? (
        <EmptyState icon="🧾" title="No print log entries" message="No matching print logs found." />
      ) : (
        <FlatList
          data={printLogsQuery.data}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          renderItem={({ item }) => (
            <PrintLogRow item={item} colors={colors} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <View style={[styles.exportBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <PrimaryButton
          label={exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
          variant="secondary"
          onPress={() => exportMutation.mutateAsync('csv')}
          loading={exportMutation.isPending}
        />
        <PrimaryButton
          label={exportMutation.isPending ? 'Exporting...' : 'Export JSON'}
          variant="secondary"
          onPress={() => exportMutation.mutateAsync('json')}
          loading={exportMutation.isPending}
        />
      </View>

      <Modal visible={filterModal === 'printer'} transparent animationType="fade" onRequestClose={() => setFilterModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModal(null)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select printer</Text>
            {(printersQuery.data ?? []).map(printer => (
              <Pressable
                key={printer.name}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: filterPrinter === printer.name ? colors.accentBg : colors.surfaceElevated,
                    borderColor: filterPrinter === printer.name ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => {
                  setFilterPrinter(filterPrinter === printer.name ? null : printer.name);
                  setFilterModal(null);
                }}
              >
                <Text style={[styles.modalOptionLabel, { color: colors.text }]}>{printer.name}</Text>
                <Text style={[styles.modalOptionCount, { color: colors.textSecondary }]}>{printer.count}</Text>
              </Pressable>
            ))}
            {(printersQuery.data?.length ?? 0) === 0 ? (
              <Text style={[styles.modalEmpty, { color: colors.textSecondary }]}>No printers found</Text>
            ) : null}
            <PrimaryButton label="Close" variant="secondary" onPress={() => setFilterModal(null)} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={filterModal === 'status'} transparent animationType="fade" onRequestClose={() => setFilterModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModal(null)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select status</Text>
            {(statusesQuery.data ?? []).map(status => (
              <Pressable
                key={status.label}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: filterStatus === status.label ? colors.accentBg : colors.surfaceElevated,
                    borderColor: filterStatus === status.label ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => {
                  setFilterStatus(filterStatus === status.label ? null : status.label);
                  setFilterModal(null);
                }}
              >
                <Text style={[styles.modalOptionLabel, { color: colors.text }]}>{status.label}</Text>
                <Text style={[styles.modalOptionCount, { color: colors.textSecondary }]}>{status.count}</Text>
              </Pressable>
            ))}
            {(statusesQuery.data?.length ?? 0) === 0 ? (
              <Text style={[styles.modalEmpty, { color: colors.textSecondary }]}>No statuses found</Text>
            ) : null}
            <PrimaryButton label="Close" variant="secondary" onPress={() => setFilterModal(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PrintLogRow({
  item,
  colors,
}: {
  item: PrintLogRow;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = useMemo(() => {
    const s = item.status.toLowerCase();
    if (s.includes('success') || s.includes('complete')) return colors.success;
    if (s.includes('fail') || s.includes('error')) return colors.error;
    if (s.includes('cancel')) return colors.warning;
    return colors.accent;
  }, [item.status, colors]);

  return (
    <Pressable
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {item.print_name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>
            {item.printer_name}
          </Text>
          <Text style={[styles.rowMetaText, { color: colors.textSecondary }]}>
            {formatDateTime(item.created_at)}
          </Text>
        </View>
      </View>
      <View style={styles.rowFooter}>
        <Text style={[styles.rowDuration, { color: colors.textSecondary }]}>
          {item.duration_seconds ? formatDuration(item.duration_seconds) : ''}
        </Text>
        {expanded ? (
          <ChevronUp size={16} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={16} color={colors.textSecondary} />
        )}
      </View>
      {expanded ? (
        <View style={styles.rowDetails}>
          {item.failure_reason ? (
            <Text style={[styles.detailLabel, { color: colors.error }]} numberOfLines={3}>
              Failure: {item.failure_reason}
            </Text>
          ) : null}
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            Filament: {item.filament_type || '—'} {item.filament_color ? `• ${item.filament_color}` : ''}
          </Text>
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            {item.filament_used_grams ? `Filament: ${item.filament_used_grams}g` : ''}
            {item.cost ? ` • Cost: ${item.cost}` : ''}
          </Text>
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            {item.started_at ? `Started: ${formatDateTime(item.started_at)}` : ''}
            {item.completed_at ? ` • Completed: ${formatDateTime(item.completed_at)}` : ''}
          </Text>
          {item.created_by_username ? (
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              By: {item.created_by_username}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildPrintLogCsv(rows: PrintLogRow[]): string {
  const header = 'ID,Print Name,Printer,Status,Started,Completed,Filament Type,Filament Color,Filament (g),Cost (USD),Duration (s),Failure Reason,Created By,Created At';
  const rowsCsv = rows
    .map(r => [
      r.id,
      `"${r.print_name.replace(/"/g, '""')}"`,
      `"${r.printer_name.replace(/"/g, '""')}"`,
      r.status,
      r.started_at || '',
      r.completed_at || '',
      `"${(r.filament_type ?? '').replace(/"/g, '""')}"`,
      `"${(r.filament_color ?? '').replace(/"/g, '""')}"`,
      r.filament_used_grams ?? '',
      r.cost ?? '',
      r.duration_seconds ?? '',
      `"${(r.failure_reason ?? '').replace(/"/g, '""')}"`,
      `"${(r.created_by_username ?? '').replace(/"/g, '""')}"`,
      r.created_at,
    ].join(','))
    .join('\n');
  return `${header}\n${rowsCsv}`;
}

function InlineTabBar({
  value,
  tabs,
  onChange,
  colors,
}: {
  value: string;
  tabs: Array<{ key: string; label: string }>;
  onChange: (key: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.inlineTabBar}>
      {tabs.map(tab => (
        <Pressable
          key={tab.key}
          style={[
            styles.inlineTab,
            value === tab.key && { backgroundColor: colors.accent, borderColor: colors.accent },
          ]}
          onPress={() => onChange(tab.key)}
        >
          <Text style={[styles.inlineTabLabel, { color: value === tab.key ? colors.textInverse : colors.textSecondary }]} numberOfLines={1}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
>>>>>>> origin/develop
    </View>
  );
}

const styles = StyleSheet.create({
<<<<<<< HEAD
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  customDateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: {
    flex: 1,
  },
  rowCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  rowEvent: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  rowTime: {
    fontSize: fontSize.xs,
  },
  rowPrintName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  rowMeta: {
    fontSize: fontSize.sm,
  },
=======
  container: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filterPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  filterPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  filterPanelLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    width: 80,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterButtonLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.xs },
  row: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowMain: { gap: spacing.xs },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
  },
  rowMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowMetaText: {
    fontSize: fontSize.sm,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  rowDuration: {
    fontSize: fontSize.sm,
  },
  rowDetails: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
    gap: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  detailText: {
    fontSize: fontSize.sm,
  },
  exportBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  modalOptionLabel: {
    fontSize: fontSize.base,
    flex: 1,
  },
  modalOptionCount: {
    fontSize: fontSize.sm,
  },
  modalEmpty: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  inlineTabBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    borderColor: 'rgba(128,128,128,0.2)',
    overflow: 'hidden',
  },
  inlineTab: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center',
  },
  inlineTabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
>>>>>>> origin/develop
});
