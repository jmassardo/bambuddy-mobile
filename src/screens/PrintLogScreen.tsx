import React, { useMemo, useState } from 'react';
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
    </View>
  );
}

const styles = StyleSheet.create({
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
});
