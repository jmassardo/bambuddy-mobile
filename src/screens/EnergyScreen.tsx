import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { SimpleBarChart } from '@/components/common/Charts';

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
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);

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

  const refreshAll = async () => {
    await Promise.all([energyQuery.refetch(), settingsQuery.refetch()]);
  };

  const energyStats = energyQuery.data as ApiRecord | undefined;
  const totalKwh = pickNumber(energyStats, ['total_energy_kwh', 'total_kwh'], 0);
  const totalCost = pickNumber(energyStats, ['total_energy_cost', 'total_cost'], 0);
  const warmingUp = pickBoolean(energyStats, ['energy_data_warming_up'], false);

  const settings = settingsQuery.data as ApiRecord | undefined;
  const currency = pickString(settings, ['currency'], 'USD');
  const energyRate = pickNumber(settings, ['energy_cost_per_kwh'], 0);

  const series = useMemo(() => getSeriesPoints(energyStats), [energyStats]);
  const printerRows = useMemo(() => getPrinterRows(energyStats), [energyStats]);

  const filteredRow = selectedPrinterId !== null
    ? printerRows.find(r => r.printerId === selectedPrinterId) ?? null
    : null;
  const displayKwh = filteredRow ? filteredRow.energyKwh : totalKwh;
  const displayCost = filteredRow ? filteredRow.energyCost : totalCost;
  const displayPrinterRows = filteredRow ? [filteredRow] : printerRows;

  if (energyQuery.isLoading && !energyQuery.data) {
    return <LoadingScreen message="Loading energy dashboard…" />;
  }

  if (energyQuery.isError) {
    return <ErrorState message="Unable to load energy dashboard." onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={energyQuery.isRefetching || settingsQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Energy dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Consumption, cost, and printer-level energy usage over time.
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
              <Text style={[styles.filterChipText, { color: selectedPrinterId === null ? '#fff' : colors.text }]}>
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
                    { color: selectedPrinterId === row.printerId ? '#fff' : colors.text },
                  ]}
                >
                  {row.printerName}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <SectionCard title="Overview" subtitle="Total usage and cost for the selected range.">
        <View style={styles.statsRow}>
          <StatCard label="Energy" value={formatKwh(displayKwh)} />
          <StatCard label="Cost" value={formatCurrencyWithCode(displayCost, currency)} />
          <StatCard
            label="Rate"
            value={energyRate > 0 ? `${formatCurrencyWithCode(energyRate, currency)}/kWh` : '—'}
          />
        </View>
        {warmingUp ? (
          <View style={[styles.warningBox, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}55` }]}>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              Energy totals may be temporarily incomplete while historical snapshots warm up.
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Energy trend" subtitle="Daily kWh usage (most recent 14 data points).">
        {series.length > 0 ? (
          <SimpleBarChart
            data={series.map(point => ({ label: point.label, value: point.energyKwh }))}
            formatValue={value => `${value.toFixed(1)}kWh`}
          />
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No time-series energy data is available for this range.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Per-printer breakdown" subtitle="Energy usage share by printer.">
        {displayPrinterRows.length > 0 ? (
          <View style={styles.printerList}>
            {displayPrinterRows.map(row => {
              const percentage = displayKwh > 0 ? (row.energyKwh / displayKwh) * 100 : 0;
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
});
