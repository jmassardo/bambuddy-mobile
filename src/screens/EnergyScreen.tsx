import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
<<<<<<< HEAD
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
=======
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
>>>>>>> origin/develop
import { api } from '@/api/client';
import { InlineTabBar, ProgressBar, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  formatCurrency,
  getValue,
  isRecord,
  pickBoolean,
  pickNumber,
  pickRecordArray,
  pickString,
  type ApiRecord,
} from '@/utils/data';
<<<<<<< HEAD
import { SimpleBarChart } from '@/components/common/Charts';
=======
import { SimpleDonutChart, MultiSeriesLineChart } from '@/components/common/Charts';
>>>>>>> origin/develop

type RangeKey = '7d' | '30d' | '90d' | 'all';

type SeriesPoint = {
  date: string;
  label: string;
  energyKwh: number;
};

type PrinterEnergyRow = {
  printerId: number | null;
  printerName: string;
  energyKwh: number;
  energyCost: number;
};

<<<<<<< HEAD
=======
type FilamentEnergyRow = {
  filamentType: string;
  energyKwh: number;
  energyCost: number;
  printCount: number;
};

const filamentColors = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#14b8a6',
];

>>>>>>> origin/develop
export function getEnergyRangeParams(range: RangeKey): { dateFrom?: string; dateTo?: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  if (range === 'all') return {};
  const days = Number(range.replace('d', ''));
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return {
    dateFrom: start.toISOString().split('T')[0],
    dateTo: end,
  };
}

function formatKwh(value: number) {
  return `${value.toFixed(2)} kWh`;
}

function formatCurrencyWithCode(value: number, currency: string) {
  if (!Number.isFinite(value)) return '—';
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) return formatCurrency(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return formatCurrency(value);
  }
}

function normalizedDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function getSeriesPoints(stats: unknown): SeriesPoint[] {
  const candidate = getValue(stats, 'daily_data')
    ?? getValue(stats, 'timeline')
    ?? getValue(stats, 'time_series')
    ?? getValue(stats, 'series');

  const points: SeriesPoint[] = [];

  if (Array.isArray(candidate)) {
    pickRecordArray({ candidate }, ['candidate']).forEach(row => {
      const date = pickString(row, ['date', 'day', 'timestamp']);
      if (!date) return;
      points.push({
        date,
        label: normalizedDateLabel(date),
        energyKwh: pickNumber(row, ['energy_kwh', 'kwh', 'value'], 0),
      });
    });
  } else if (isRecord(candidate)) {
    Object.entries(candidate).forEach(([date, value]) => {
      const row = isRecord(value) ? value : { value };
      points.push({
        date,
        label: normalizedDateLabel(date),
        energyKwh: pickNumber(row, ['energy_kwh', 'kwh', 'value'], 0),
      });
    });
  }

  return points
    .filter(point => point.energyKwh > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-14);
}

<<<<<<< HEAD
=======
function getFilamentRows(archives: ApiRecord[] | undefined, energyStats: ApiRecord | undefined): FilamentEnergyRow[] {
  if (!archives || archives.length === 0) return [];

  const totalEnergyKwh = pickNumber(energyStats, ['total_energy_kwh', 'total_kwh'], 0);
  const totalCost = pickNumber(energyStats, ['total_energy_cost', 'total_cost'], 0);
  const totalPrints = archives.length;
  const avgEnergyKwh = totalPrints > 0 ? totalEnergyKwh / totalPrints : 0;
  const avgCost = totalPrints > 0 ? totalCost / totalPrints : 0;

  const rows = new Map<string, { energyKwh: number; energyCost: number; printCount: number }>();
  archives.forEach(item => {
    const filament = pickString(item, ['filament_type', 'filament'], 'Unknown');
    const energyKwh = pickNumber(item, ['energy_kwh'], avgEnergyKwh);
    const energyCost = pickNumber(item, ['energy_cost'], avgCost);
    const existing = rows.get(filament) ?? { energyKwh: 0, energyCost: 0, printCount: 0 };
    existing.energyKwh += energyKwh;
    existing.energyCost += energyCost;
    existing.printCount += 1;
    rows.set(filament, existing);
  });

  return Array.from(rows.entries())
    .map(([filamentType, data]) => ({
      filamentType,
      ...data,
    }))
    .sort((a, b) => b.energyKwh - a.energyKwh);
}

>>>>>>> origin/develop
function getPrinterRows(stats: unknown): PrinterEnergyRow[] {
  const candidate = getValue(stats, 'per_printer')
    ?? getValue(stats, 'printer_breakdown')
    ?? getValue(stats, 'by_printer');

  const rows: PrinterEnergyRow[] = [];

  if (Array.isArray(candidate)) {
    pickRecordArray({ candidate }, ['candidate']).forEach(row => {
      const printerId = pickNumber(row, ['printer_id', 'id'], Number.NaN);
      rows.push({
        printerId: Number.isFinite(printerId) ? printerId : null,
        printerName: pickString(row, ['printer_name', 'name'], 'Unknown printer'),
        energyKwh: pickNumber(row, ['energy_kwh', 'kwh', 'energy'], 0),
        energyCost: pickNumber(row, ['energy_cost', 'cost'], 0),
      });
    });
  } else if (isRecord(candidate)) {
    Object.entries(candidate).forEach(([key, value]) => {
      if (isRecord(value)) {
        const printerId = pickNumber(value, ['printer_id', 'id'], Number.NaN);
        rows.push({
          printerId: Number.isFinite(printerId) ? printerId : null,
          printerName: pickString(value, ['printer_name', 'name'], key),
          energyKwh: pickNumber(value, ['energy_kwh', 'kwh', 'energy'], 0),
          energyCost: pickNumber(value, ['energy_cost', 'cost'], 0),
        });
        return;
      }
      const energyKwh = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(energyKwh)) return;
      rows.push({
        printerId: null,
        printerName: key,
        energyKwh,
        energyCost: 0,
      });
    });
  }

  return rows
    .filter(row => row.energyKwh > 0)
    .sort((a, b) => b.energyKwh - a.energyKwh);
}

export default function EnergyScreen() {
  const navigation = useNavigation<RootNavigationProp<'Energy'>>();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>('30d');
<<<<<<< HEAD
=======
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
>>>>>>> origin/develop

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Energy' });
  }, [navigation]);

  const params = useMemo(() => getEnergyRangeParams(range), [range]);

  const energyQuery = useQuery({
    queryKey: ['archiveEnergyStats', params],
    queryFn: () => api.getArchiveEnergyStats(params),
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

<<<<<<< HEAD
  const refreshAll = async () => {
    await Promise.all([energyQuery.refetch(), settingsQuery.refetch()]);
=======
  const statsQuery = useQuery({
    queryKey: ['archiveStats', params],
    queryFn: () => api.getArchiveStats(params),
  });

  const archivesQuery = useQuery({
    queryKey: ['archives', 'energy', params],
    queryFn: () => api.getArchives({ ...params, limit: 1000 }),
    enabled: range !== 'all' || true,
  });

  const refreshAll = async () => {
    await Promise.all([energyQuery.refetch(), settingsQuery.refetch(), statsQuery.refetch(), archivesQuery.refetch()]);
>>>>>>> origin/develop
  };

  const energyStats = energyQuery.data as ApiRecord | undefined;
  const totalKwh = pickNumber(energyStats, ['total_energy_kwh', 'total_kwh'], 0);
  const totalCost = pickNumber(energyStats, ['total_energy_cost', 'total_cost'], 0);
  const warmingUp = pickBoolean(energyStats, ['energy_data_warming_up'], false);

<<<<<<< HEAD
=======
  const stats = statsQuery.data as ApiRecord | undefined;
  const totalPrints = pickNumber(stats, ['total_prints', 'prints_count'], 0);
  const avgEnergyKwh = totalPrints > 0 ? totalKwh / totalPrints : 0;

>>>>>>> origin/develop
  const settings = settingsQuery.data as ApiRecord | undefined;
  const currency = pickString(settings, ['currency'], 'USD');
  const energyRate = pickNumber(settings, ['energy_cost_per_kwh'], 0);

  const series = useMemo(() => getSeriesPoints(energyStats), [energyStats]);
  const printerRows = useMemo(() => getPrinterRows(energyStats), [energyStats]);
<<<<<<< HEAD
=======
  const archives = useMemo(
    () => ((archivesQuery.data ?? []) as ApiRecord[]).filter(Boolean),
    [archivesQuery.data],
  );
  const filamentRows = useMemo(() => getFilamentRows(archives, energyStats), [archives, energyStats]);

  const filteredRow = selectedPrinterId !== null
    ? printerRows.find(r => r.printerId === selectedPrinterId) ?? null
    : null;
  const displayKwh = filteredRow ? filteredRow.energyKwh : totalKwh;
  const displayCost = filteredRow ? filteredRow.energyCost : totalCost;
  const displayPrinterRows = filteredRow ? [filteredRow] : printerRows;
>>>>>>> origin/develop

  if (energyQuery.isLoading && !energyQuery.data) {
    return <LoadingScreen message="Loading energy dashboard…" />;
  }

<<<<<<< HEAD
  if (energyQuery.isError) {
=======
  if (energyQuery.isError || statsQuery.isError || archivesQuery.isError) {
>>>>>>> origin/develop
    return <ErrorState message="Unable to load energy dashboard." onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
<<<<<<< HEAD
          refreshing={energyQuery.isRefetching || settingsQuery.isRefetching}
=======
          refreshing={
            energyQuery.isRefetching ||
            settingsQuery.isRefetching ||
            statsQuery.isRefetching ||
            archivesQuery.isRefetching
          }
>>>>>>> origin/develop
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Energy dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
<<<<<<< HEAD
          Consumption, cost, and printer-level energy usage over time.
=======
          Consumption, cost, filament breakdown, and printer-level energy usage over time.
>>>>>>> origin/develop
        </Text>
      </View>

      <InlineTabBar
        value={range}
        tabs={[
          { key: '7d', label: '7 Days' },
          { key: '30d', label: '30 Days' },
          { key: '90d', label: '90 Days' },
          { key: 'all', label: 'All Time' },
        ]}
        onChange={value => setRange(value as RangeKey)}
      />

<<<<<<< HEAD
      <SectionCard title="Overview" subtitle="Total usage and cost for the selected range.">
        <View style={styles.statsRow}>
          <StatCard label="Energy" value={formatKwh(totalKwh)} />
          <StatCard label="Cost" value={formatCurrencyWithCode(totalCost, currency)} />
=======
      {printerRows.length > 1 && (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            <Pressable
              testID="filter-chip-all"
              onPress={() => setSelectedPrinterId(null)}
              style={[
                styles.filterChip,
                { backgroundColor: selectedPrinterId === null ? colors.accent : colors.surfaceElevated },
              ]}
            >
              <Text style={[styles.filterChipText, { color: selectedPrinterId === null ? colors.textInverse : colors.text }]}>
                All printers
              </Text>
            </Pressable>
            {printerRows.map(row => (
              <Pressable
                testID={`filter-chip-${row.printerId ?? row.printerName}`}
                key={`filter-${row.printerId ?? row.printerName}`}
                onPress={() => setSelectedPrinterId(row.printerId)}
                style={[
                  styles.filterChip,
                  { backgroundColor: selectedPrinterId === row.printerId ? colors.accent : colors.surfaceElevated },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: selectedPrinterId === row.printerId ? colors.textInverse : colors.text },
                  ]}
                >
                  {row.printerName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <SectionCard title="Overview" subtitle="Total usage, cost, and print statistics for the selected range.">
        <View style={styles.statsRow}>
          <StatCard label="Energy" value={formatKwh(displayKwh)} />
          <StatCard label="Cost" value={formatCurrencyWithCode(displayCost, currency)} />
>>>>>>> origin/develop
          <StatCard
            label="Rate"
            value={energyRate > 0 ? `${formatCurrencyWithCode(energyRate, currency)}/kWh` : '—'}
          />
        </View>
<<<<<<< HEAD
=======
        <View style={styles.statsRow}>
          <StatCard label="Prints" value={String(totalPrints)} />
          <StatCard label="Avg/print" value={formatKwh(avgEnergyKwh)} />
          <StatCard label="Avg cost" value={totalPrints > 0 ? formatCurrencyWithCode(displayCost / Math.max(totalPrints, 1), currency) : '—'} />
        </View>
>>>>>>> origin/develop
        {warmingUp ? (
          <View style={[styles.warningBox, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}55` }]}>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Energy totals may be temporarily incomplete while historical snapshots warm up.
            </Text>
          </View>
        ) : null}
      </SectionCard>

<<<<<<< HEAD
      <SectionCard title="Energy trend" subtitle="Daily kWh usage (most recent 14 data points).">
        {series.length > 0 ? (
          <SimpleBarChart
            data={series.map(point => ({ label: point.label, value: point.energyKwh }))}
            formatValue={value => `${value.toFixed(1)}kWh`}
=======
      <SectionCard title="Energy trend" subtitle="Daily kWh usage over time (line chart).">
        {series.length > 0 ? (
          <MultiSeriesLineChart
            points={series.map(point => ({
              label: point.label,
              values: { energy: point.energyKwh },
            }))}
            series={[{ key: 'energy', label: 'Energy (kWh)', color: colors.accent }]}
            height={200}
            formatYAxis={value => `${value.toFixed(1)} kWh`}
>>>>>>> origin/develop
          />
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No time-series energy data is available for this range.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Per-printer breakdown" subtitle="Energy usage share by printer.">
<<<<<<< HEAD
        {printerRows.length > 0 ? (
          <View style={styles.printerList}>
            {printerRows.map(row => {
              const percentage = totalKwh > 0 ? (row.energyKwh / totalKwh) * 100 : 0;
=======
        {displayPrinterRows.length > 0 ? (
          <View style={styles.printerList}>
            {displayPrinterRows.map(row => {
              const percentage = displayKwh > 0 ? (row.energyKwh / displayKwh) * 100 : 0;
>>>>>>> origin/develop
              return (
                <View key={`${row.printerName}-${row.printerId ?? 'none'}`} style={styles.printerRow}>
                  <View style={styles.printerRowHeader}>
                    <Text style={[styles.printerName, { color: colors.text }]}>{row.printerName}</Text>
                    <Text style={[styles.printerMeta, { color: colors.textSecondary }]}>
                      {formatKwh(row.energyKwh)} • {formatCurrencyWithCode(row.energyCost, currency)}
                    </Text>
                  </View>
                  <ProgressBar progress={percentage} color={colors.accent} trackColor={colors.surfaceElevated} height={8} />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No per-printer energy breakdown is available for this range.
          </Text>
        )}
      </SectionCard>

<<<<<<< HEAD
=======
      {filamentRows.length > 0 && (
        <SectionCard title="Energy by filament" subtitle="Consumption grouped by filament type.">
          <View style={styles.filamentGrid}>
            {filamentRows.map((row, index) => (
              <View
                key={row.filamentType}
                style={[styles.filamentCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <View style={styles.filamentHeader}>
                  <View style={[styles.filamentDot, { backgroundColor: filamentColors[index % filamentColors.length] }]} />
                  <Text style={[styles.filamentName, { color: colors.text }]} numberOfLines={1}>
                    {row.filamentType}
                  </Text>
                </View>
                <Text style={[styles.filamentValue, { color: colors.text }]}>
                  {formatKwh(row.energyKwh)}
                </Text>
                <Text style={[styles.filamentMeta, { color: colors.textSecondary }]}>
                  {formatCurrencyWithCode(row.energyCost, currency)} • {row.printCount} prints
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.filamentChartWrap}>
            <SimpleDonutChart
              data={filamentRows.map((row, i) => ({
                label: row.filamentType,
                value: row.energyKwh,
                color: filamentColors[i % filamentColors.length],
              }))}
              size={140}
            />
          </View>
        </SectionCard>
      )}

>>>>>>> origin/develop
      <Text style={[styles.footerText, { color: colors.textTertiary }]}>
        Cost values are sourced from server-calculated energy totals.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  warningBox: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warningText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
<<<<<<< HEAD
=======
  filterRow: {
    marginTop: -spacing.sm,
  },
  filterChips: {
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
>>>>>>> origin/develop
  printerList: {
    gap: spacing.md,
  },
  printerRow: {
    gap: spacing.sm,
  },
  printerRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  printerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  printerMeta: {
    fontSize: fontSize.sm,
  },
  footerText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
  },
<<<<<<< HEAD
=======
  filamentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filamentCard: {
    flexBasis: '48%',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  filamentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filamentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  filamentName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    flexShrink: 1,
  },
  filamentValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  filamentMeta: {
    fontSize: fontSize.xs,
  },
  filamentChartWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
>>>>>>> origin/develop
});
