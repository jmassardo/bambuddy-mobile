import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { SimpleBarChart } from '@/components/common/Charts';
import { InlineTabBar, PrimaryButton, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { shareBlob } from '@/utils/share';
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatPercent,
  formatWeight,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';

type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';
type SelectorKey = 'printer' | 'user' | null;

type SelectorOption = {
  key: string;
  label: string;
  value: number | null;
};

function getRangeParams(range: RangeKey) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  if (range === 'all') return {};
  const days = range === 'today' ? 1 : Number(range.replace('d', ''));
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return {
    dateFrom: start.toISOString().split('T')[0],
    dateTo: end,
  };
}

function materialKey(item: ApiRecord) {
  return pickString(item, ['material', 'filament_type', 'type'], 'Unknown');
}

function printerKey(item: ApiRecord) {
  return pickString(item, ['printer_name', 'printer'], 'Unknown printer');
}

function archiveStatus(item: ApiRecord) {
  return pickString(item, ['status'], 'unknown').toLowerCase();
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function cellColor(count: number, max: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (count <= 0) return colors.surfaceElevated;
  const ratio = count / Math.max(max, 1);
  if (ratio < 0.34) return `${colors.accent}44`;
  if (ratio < 0.67) return `${colors.accent}88`;
  return colors.accent;
}

function getArchiveTimestamp(item: ApiRecord) {
  return pickString(item, ['created_at', 'started_at', 'completed_at']);
}

function isFailure(item: ApiRecord) {
  const status = archiveStatus(item);
  return (
    status.includes('fail') ||
    status.includes('cancel') ||
    pickString(item, ['failure_reason', 'error_reason', 'cancel_reason']).trim().length > 0
  );
}

function failureReasonKey(item: ApiRecord) {
  return pickString(
    item,
    ['failure_reason', 'error_reason', 'cancel_reason', 'ai_failure_reason', 'failure_category'],
    'Unknown',
  );
}

function timeBucket(item: ApiRecord) {
  const value = getArchiveTimestamp(item);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const hour = date.getHours();
  if (hour < 6) return 'Night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

function getRangeDays(range: RangeKey) {
  if (range === 'all') return undefined;
  if (range === 'today') return 1;
  return Number(range.replace('d', ''));
}

function buildFailureRates(items: ApiRecord[], keyFn: (item: ApiRecord) => string) {
  const rows = new Map<string, { label: string; total: number; failures: number; rate: number }>();
  items.forEach(item => {
    const key = keyFn(item) || 'Unknown';
    const current = rows.get(key) ?? { label: key, total: 0, failures: 0, rate: 0 };
    current.total += 1;
    if (isFailure(item)) current.failures += 1;
    current.rate = current.total > 0 ? current.failures / current.total : 0;
    rows.set(key, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.rate - a.rate || b.failures - a.failures).slice(0, 6);
}

export default function StatsScreen() {
  const navigation = useNavigation<RootNavigationProp<'Stats'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Statistics' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selector, setSelector] = useState<SelectorKey>(null);

  const params = getRangeParams(range);
  const queryParams = useMemo(() => ({
    ...params,
    ...(selectedPrinterId ? { printerId: selectedPrinterId } : {}),
    ...(isAdmin && selectedUserId !== null ? { createdById: selectedUserId } : {}),
  }), [isAdmin, params, selectedPrinterId, selectedUserId]);

  const statsQuery = useQuery({
    queryKey: ['archiveStats', queryParams],
    queryFn: () => api.getArchiveStats(queryParams),
  });
  const archivesQuery = useQuery({
    queryKey: ['archives', 'stats-screen', queryParams],
    queryFn: () => api.getArchives({ ...queryParams, limit: 1000 }),
  });
  const printersQuery = useQuery({
    queryKey: ['printers', 'stats-screen'],
    queryFn: () => api.getPrinters(),
  });
  const usersQuery = useQuery({
    queryKey: ['users', 'stats-screen'],
    queryFn: () => api.getUsers(),
    enabled: isAdmin,
  });

  const refreshAll = async () => {
    await Promise.all([
      statsQuery.refetch(),
      archivesQuery.refetch(),
      printersQuery.refetch(),
      isAdmin ? usersQuery.refetch() : Promise.resolve(),
    ]);
  };

  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'json') => {
      const filenameBase = `bambuddy-stats-${range}${selectedPrinterId ? `-printer-${selectedPrinterId}` : ''}${selectedUserId !== null ? `-user-${selectedUserId}` : ''}`;
      if (format === 'json') {
        const blobOptions: BlobOptions = {
          type: 'application/json',
          lastModified: Date.now(),
        };
        const blob = new Blob([JSON.stringify(archivesQuery.data ?? [], null, 2)], blobOptions);
        await shareBlob(blob, `${filenameBase}.json`);
        return;
      }
      const blob = await api.exportArchiveStats({
        format: 'csv',
        days: getRangeDays(range),
        dateFrom: queryParams.dateFrom,
        dateTo: queryParams.dateTo,
        printerId: selectedPrinterId ?? undefined,
        createdById: isAdmin ? (selectedUserId ?? undefined) : undefined,
      });
      await shareBlob(blob, `${filenameBase}.csv`);
    },
    onSuccess: (_data, format) => showToast(`${format.toUpperCase()} export ready to share.`, 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export statistics.', 'error'),
  });

  const recalculateCostsMutation = useMutation({
    mutationFn: api.recalculateCosts,
    onSuccess: async result => {
      await refreshAll();
      showToast(result.message || 'Archive costs recalculated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to recalculate archive costs.', 'error'),
  });

  const archives = useMemo(
    () => ((archivesQuery.data ?? []) as ApiRecord[]).filter(Boolean),
    [archivesQuery.data],
  );

  const printerOptions = useMemo<SelectorOption[]>(() => {
    const options: SelectorOption[] = [{ key: 'all', label: 'All printers', value: null }];
    ((printersQuery.data ?? []) as ApiRecord[]).forEach(printer => {
      options.push({
        key: String(pickNumber(printer, ['id'])),
        label: pickString(printer, ['name'], `Printer ${pickNumber(printer, ['id'])}`),
        value: pickNumber(printer, ['id']),
      });
    });
    return options;
  }, [printersQuery.data]);

  const userOptions = useMemo<SelectorOption[]>(() => {
    const options: SelectorOption[] = [{ key: 'all', label: 'All users', value: null }];
    ((usersQuery.data ?? []) as ApiRecord[]).forEach(row => {
      const id = pickNumber(row, ['id']);
      options.push({
        key: String(id),
        label: pickString(row, ['full_name', 'username', 'email'], `User ${id}`),
        value: id,
      });
    });
    return options;
  }, [usersQuery.data]);

  const selectedPrinterLabel = useMemo(
    () => printerOptions.find(option => option.value === selectedPrinterId)?.label ?? 'All printers',
    [printerOptions, selectedPrinterId],
  );
  const selectedUserLabel = useMemo(
    () => userOptions.find(option => option.value === selectedUserId)?.label ?? 'All users',
    [selectedUserId, userOptions],
  );

  const quickStats = useMemo(() => ({
    totalPrints: pickNumber(statsQuery.data, ['total_prints', 'prints_count'], archives.length),
    successRate: pickNumber(statsQuery.data, ['success_rate'], 0),
    printTime: pickNumber(statsQuery.data, ['total_print_time_seconds', 'total_print_time'], 0),
    filament: pickNumber(statsQuery.data, ['total_filament_grams', 'total_filament_g', 'filament_total_g'], 0),
    cost: pickNumber(statsQuery.data, ['total_cost', 'cost_total'], 0),
  }), [archives.length, statsQuery.data]);

  const heatmap = useMemo(() => {
    const days: string[] = [];
    if (params.dateFrom && params.dateTo) {
      const cursor = new Date(`${params.dateFrom}T00:00:00`);
      const end = new Date(`${params.dateTo}T00:00:00`);
      while (cursor <= end) {
        days.push(cursor.toISOString().split('T')[0]);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const uniqueDays = new Set<string>();
      archives.forEach(item => {
        const key = dayKey(getArchiveTimestamp(item));
        if (key) uniqueDays.add(key);
      });
      days.push(...Array.from(uniqueDays).sort().slice(-42));
    }
    const counts = new Map<string, number>();
    archives.forEach(item => {
      const key = dayKey(getArchiveTimestamp(item));
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const max = Math.max(...Array.from(counts.values()), 0);
    return { days, counts, max };
  }, [archives, params.dateFrom, params.dateTo]);

  const filamentTrends = useMemo(() => {
    const trendMap = new Map<string, { label: string; grams: number }>();
    archives.forEach(item => {
      const key = monthKey(getArchiveTimestamp(item));
      if (!key) return;
      const current = trendMap.get(key) ?? { label: key, grams: 0 };
      current.grams += pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0);
      trendMap.set(key, current);
    });
    return Array.from(trendMap.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-6);
  }, [archives]);

  const printerBreakdown = useMemo(() => {
    const byPrinter = new Map<string, { name: string; prints: number; grams: number; failures: number }>();
    archives.forEach(item => {
      const key = printerKey(item);
      const current = byPrinter.get(key) ?? { name: key, prints: 0, grams: 0, failures: 0 };
      current.prints += 1;
      current.grams += pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0);
      if (isFailure(item)) current.failures += 1;
      byPrinter.set(key, current);
    });
    return Array.from(byPrinter.values()).sort((a, b) => b.prints - a.prints);
  }, [archives]);

  const materialBreakdown = useMemo(() => {
    const rows = new Map<string, number>();
    archives.forEach(item => {
      const key = materialKey(item);
      rows.set(key, (rows.get(key) ?? 0) + pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0));
    });
    return Array.from(rows.entries())
      .map(([name, grams]) => ({ name, grams }))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 5);
  }, [archives]);

  const durationDistribution = useMemo(() => {
    const buckets = [
      { label: '<1h', min: 0, max: 3600, count: 0 },
      { label: '1-2h', min: 3600, max: 7200, count: 0 },
      { label: '2-4h', min: 7200, max: 14400, count: 0 },
      { label: '4-8h', min: 14400, max: 28800, count: 0 },
      { label: '8-16h', min: 28800, max: 57600, count: 0 },
      { label: '16h+', min: 57600, max: Infinity, count: 0 },
    ];
    archives.forEach(item => {
      const seconds = pickNumber(item, ['print_time_seconds', 'print_time', 'duration_seconds'], 0);
      if (seconds <= 0) return;
      const bucket = buckets.find(b => seconds >= b.min && seconds < b.max);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [archives]);

  const habitsData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    archives.forEach(item => {
      const date = new Date(getArchiveTimestamp(item));
      if (!Number.isNaN(date.getTime())) counts[date.getDay()] += 1;
    });
    return days.map((label, i) => ({ label, value: counts[i] }));
  }, [archives]);

  const hourlyData = useMemo(() => {
    const hours = new Array(24).fill(0);
    archives.forEach(item => {
      const date = new Date(getArchiveTimestamp(item));
      if (!Number.isNaN(date.getTime())) hours[date.getHours()] += 1;
    });
    return hours.map((count, h) => ({ label: `${h}`, value: count }));
  }, [archives]);

  const failureRateByMaterial = useMemo(() => buildFailureRates(archives, materialKey), [archives]);
  const failureRateByPrinter = useMemo(() => buildFailureRates(archives, printerKey), [archives]);
  const failureRateByTimeOfDay = useMemo(() => buildFailureRates(archives, timeBucket), [archives]);
  const failureReasons = useMemo(() => {
    const rows = new Map<string, number>();
    archives.filter(isFailure).forEach(item => {
      const key = failureReasonKey(item);
      rows.set(key, (rows.get(key) ?? 0) + 1);
    });
    return Array.from(rows.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [archives]);

  if (statsQuery.isLoading || archivesQuery.isLoading) {
    return <LoadingScreen message="Loading statistics…" />;
  }

  if (statsQuery.isError || archivesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load statistics."
        onRetry={() => void refreshAll()}
      />
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              statsQuery.isRefetching ||
              archivesQuery.isRefetching ||
              printersQuery.isRefetching ||
              usersQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Print statistics</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Quick stats, exports, failure analysis, and printer breakdowns.</Text>
        </View>

        <InlineTabBar
          value={range}
          tabs={[
            { key: 'today', label: 'Today' },
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: '90d', label: '90 Days' },
            { key: 'all', label: 'All Time' },
          ]}
          onChange={value => setRange(value as RangeKey)}
        />

        <SectionCard title="Filters & export" subtitle="Limit statistics by printer or user, then export the current view.">
          <View style={styles.filterGrid}>
            <Pressable style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSelector('printer')}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Printer</Text>
              <Text style={[styles.filterValue, { color: colors.text }]} numberOfLines={1}>{selectedPrinterLabel}</Text>
            </Pressable>
            {isAdmin ? (
              <Pressable style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSelector('user')}>
                <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>User</Text>
                <Text style={[styles.filterValue, { color: colors.text }]} numberOfLines={1}>{selectedUserLabel}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              label={exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
              variant="secondary"
              onPress={() => void exportMutation.mutateAsync('csv')}
              loading={exportMutation.isPending}
              disabled={exportMutation.isPending}
            />
            <PrimaryButton
              label={exportMutation.isPending ? 'Exporting…' : 'Export JSON'}
              variant="secondary"
              onPress={() => void exportMutation.mutateAsync('json')}
              loading={exportMutation.isPending}
              disabled={exportMutation.isPending}
            />
          </View>
          <PrimaryButton
            label={recalculateCostsMutation.isPending ? 'Recalculating…' : 'Recalculate costs'}
            onPress={() => void recalculateCostsMutation.mutateAsync()}
            loading={recalculateCostsMutation.isPending}
            disabled={recalculateCostsMutation.isPending}
          />
        </SectionCard>

        <View style={styles.grid}>
          <StatCard label="Total prints" value={String(Math.round(quickStats.totalPrints))} />
          <StatCard label="Success rate" value={formatPercent(quickStats.successRate, 1)} />
          <StatCard label="Print time" value={formatDuration(quickStats.printTime)} />
          <StatCard label="Filament used" value={formatWeight(quickStats.filament)} />
          <StatCard label="Cost" value={formatCurrency(quickStats.cost)} />
        </View>

        <SectionCard title="Failure Analysis" subtitle="Failure rates by material, printer, time of day, and common reasons.">
          <FailureList title="By material" rows={failureRateByMaterial} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureList title="By printer" rows={failureRateByPrinter} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureList title="By time of day" rows={failureRateByTimeOfDay} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureReasonList rows={failureReasons} colors={colors} />
        </SectionCard>

        <SectionCard title="Activity heatmap" subtitle="Daily print volume for the selected range.">
          <View style={styles.heatmapWrap}>
            {heatmap.days.map(day => (
              <View key={day} style={styles.heatmapItem}>
                <View
                  style={[
                    styles.heatmapCell,
                    { backgroundColor: cellColor(heatmap.counts.get(day) ?? 0, heatmap.max, colors) },
                  ]}
                />
                <Text style={[styles.heatmapLabel, { color: colors.textTertiary }]}>
                  {formatDate(day).slice(0, 5)}
                </Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Filament trends" subtitle="Material usage from recent print history.">
          {filamentTrends.length > 0 ? (
            filamentTrends.map(row => {
              const max = Math.max(...filamentTrends.map(entry => entry.grams), 1);
              return (
                <View key={row.label} style={styles.barRow}>
                  <View style={styles.barHeader}>
                    <Text style={[styles.barLabel, { color: colors.text }]}>{row.label}</Text>
                    <Text style={[styles.barValue, { color: colors.textSecondary }]}>{formatWeight(row.grams)}</Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(row.grams / max) * 100}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No trend data is available for the selected range.</Text>
          )}
          {materialBreakdown.length > 0 ? (
            <View style={styles.materialWrap}>
              {materialBreakdown.map(row => (
                <View key={row.name} style={[styles.materialChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text style={[styles.materialName, { color: colors.text }]}>{row.name}</Text>
                  <Text style={[styles.materialValue, { color: colors.textSecondary }]}>{formatWeight(row.grams)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title="Printer breakdown" subtitle="Print counts, failures, and filament by printer.">
          {printerBreakdown.length > 0 ? (
            printerBreakdown.map(printer => (
              <View
                key={printer.name}
                style={[
                  styles.printerRow,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <View style={styles.printerHeader}>
                  <Text style={[styles.printerName, { color: colors.text }]}>{printer.name}</Text>
                  <Text style={[styles.printerCount, { color: colors.textSecondary }]}>{printer.prints} prints</Text>
                </View>
                <View style={styles.printerStats}>
                  <Text style={[styles.printerMeta, { color: colors.textSecondary }]}>Filament: {formatWeight(printer.grams)}</Text>
                  <Text style={[styles.printerMeta, { color: printer.failures > 0 ? colors.warning : colors.textSecondary }]}>Failures: {printer.failures}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No printer data is available for the selected range.</Text>
          )}
        </SectionCard>

        <SectionCard title="Print duration distribution" subtitle="How long your prints typically take.">
          {durationDistribution.some(b => b.count > 0) ? (
            <SimpleBarChart
              data={durationDistribution.map(b => ({ label: b.label, value: b.count }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No duration data available.</Text>
          )}
        </SectionCard>

        <SectionCard title="Print habits" subtitle="Which days do you print most?">
          {habitsData.some(d => d.value > 0) ? (
            <SimpleBarChart
              data={habitsData.map(d => ({ label: d.label, value: d.value, color: '#3b82f6' }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No habits data available.</Text>
          )}
        </SectionCard>

        <SectionCard title="Time of day" subtitle="When you start prints during the day.">
          {hourlyData.some(d => d.value > 0) ? (
            <SimpleBarChart
              data={hourlyData.filter((_, i) => i % 2 === 0).map(d => ({ label: d.label, value: d.value, color: '#f59e0b' }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No time-of-day data available.</Text>
          )}
        </SectionCard>
      </ScrollView>

      <SelectionModal
        visible={selector === 'printer'}
        title="Select printer"
        options={printerOptions}
        selectedValue={selectedPrinterId}
        onClose={() => setSelector(null)}
        onSelect={value => {
          setSelectedPrinterId(value);
          setSelector(null);
        }}
      />

      <SelectionModal
        visible={selector === 'user'}
        title="Select user"
        options={userOptions}
        selectedValue={selectedUserId}
        onClose={() => setSelector(null)}
        onSelect={value => {
          setSelectedUserId(value);
          setSelector(null);
        }}
      />
    </>
  );
}

function FailureList({
  title,
  rows,
  colors,
  formatValue,
}: {
  title: string;
  rows: { label: string; total: number; failures: number; rate: number }[];
  colors: ReturnType<typeof useTheme>['colors'];
  formatValue: (row: { label: string; total: number; failures: number; rate: number }) => string;
}) {
  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No failure data available.</Text>;
  }

  const max = Math.max(...rows.map(row => row.rate), 0.01);

  return (
    <View style={styles.failureSection}>
      <Text style={[styles.failureTitle, { color: colors.text }]}>{title}</Text>
      {rows.map(row => (
        <View key={row.label} style={styles.barRow}>
          <View style={styles.barHeader}>
            <Text style={[styles.barLabel, { color: colors.text }]}>{row.label}</Text>
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>{formatValue(row)}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(row.rate / max) * 100}%`, backgroundColor: colors.warning },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function FailureReasonList({
  rows,
  colors,
}: {
  rows: { label: string; count: number }[];
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No failure reasons recorded.</Text>;
  }

  const max = Math.max(...rows.map(row => row.count), 1);

  return (
    <View style={styles.failureSection}>
      <Text style={[styles.failureTitle, { color: colors.text }]}>Most common reasons</Text>
      {rows.map(row => (
        <View key={row.label} style={styles.barRow}>
          <View style={styles.barHeader}>
            <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>{row.label}</Text>
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>{row.count}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(row.count / max) * 100}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function SelectionModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selectedValue: number | null;
  onClose: () => void;
  onSelect: (value: number | null) => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={item => item.key}
            renderItem={({ item }) => {
              const selected = item.value === selectedValue;
              return (
                <Pressable
                  style={[
                    styles.modalOption,
                    {
                      backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => onSelect(item.value)}
                >
                  <Text style={[styles.modalOptionLabel, { color: selected ? colors.accent : colors.text }]}>{item.label}</Text>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          />
          <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: { gap: spacing.xs },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  failureSection: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  failureTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  heatmapWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heatmapItem: {
    width: 44,
    gap: spacing.xs,
    alignItems: 'center',
  },
  heatmapCell: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
  },
  heatmapLabel: {
    fontSize: fontSize.xs,
  },
  barRow: {
    gap: spacing.xs,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  barLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  barValue: {
    fontSize: fontSize.sm,
  },
  barTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  materialWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  materialChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  materialName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  materialValue: {
    fontSize: fontSize.xs,
  },
  printerRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  printerName: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  printerCount: {
    fontSize: fontSize.sm,
  },
  printerStats: {
    gap: spacing.xs,
  },
  printerMeta: {
    fontSize: fontSize.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    maxHeight: '80%',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalOption: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  modalOptionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
