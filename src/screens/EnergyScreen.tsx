import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useState } from 'react';
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
import { SimpleDonutChart, MultiSeriesLineChart } from '@/components/common/Charts';
import { LivePlugEnergy } from '@/components/finance/LivePlugEnergy';
import { FinancePolicySection } from '@/components/finance/FinancePolicySection';

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
  return translateNative('native.a550c7a04846ff65', { value0: String(value.toFixed(2)) });
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
        printerName: pickString(row, ['printer_name', 'name'], translateNative('native.d2f3cad436de827d')),
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
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Energy'>>();
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>('30d');
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ get title() { return translateNative('nav.energy'); } });
  }, [navigation]);

  const params = useLocalizedMemo(() => getEnergyRangeParams(range), [range]);

  const energyQuery = useQuery({
    queryKey: ['archiveEnergyStats', params],
    queryFn: () => api.getArchiveEnergyStats(params),
  });

  const settingsQuery = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: api.getSettings,
  });

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
  };

  const energyStats = energyQuery.data as ApiRecord | undefined;
  const totalKwh = pickNumber(energyStats, ['total_energy_kwh', 'total_kwh'], 0);
  const totalCost = pickNumber(energyStats, ['total_energy_cost', 'total_cost'], 0);
  const warmingUp = pickBoolean(energyStats, ['energy_data_warming_up'], false);

  const stats = statsQuery.data as ApiRecord | undefined;
  const totalPrints = pickNumber(stats, ['total_prints', 'prints_count'], 0);
  const avgEnergyKwh = totalPrints > 0 ? totalKwh / totalPrints : 0;

  const settings = settingsQuery.data as ApiRecord | undefined;
  const currency = pickString(settings, ['currency'], 'USD');
  const energyRate = pickNumber(settings, ['energy_cost_per_kwh'], 0);

  const series = useLocalizedMemo(() => getSeriesPoints(energyStats), [energyStats]);
  const printerRows = useLocalizedMemo(() => getPrinterRows(energyStats), [energyStats]);
  const archives = useLocalizedMemo(
    () => ((archivesQuery.data ?? []) as ApiRecord[]).filter(Boolean),
    [archivesQuery.data],
  );
  const filamentRows = useLocalizedMemo(() => getFilamentRows(archives, energyStats), [archives, energyStats]);

  const filteredRow = selectedPrinterId !== null
    ? printerRows.find(r => r.printerId === selectedPrinterId) ?? null
    : null;
  const displayKwh = filteredRow ? filteredRow.energyKwh : totalKwh;
  const displayCost = filteredRow ? filteredRow.energyCost : totalCost;
  const displayPrinterRows = filteredRow ? [filteredRow] : printerRows;

  if (energyQuery.isLoading && !energyQuery.data) {
    return <LoadingScreen message={translateNative('native.62e9b1fc006e41f9')} />;
  }

  if (energyQuery.isError || statsQuery.isError || archivesQuery.isError) {
    return <ErrorState message={translateNative('native.5823959e11906d57')} onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={
            energyQuery.isRefetching ||
            settingsQuery.isRefetching ||
            statsQuery.isRefetching ||
            archivesQuery.isRefetching
          }
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <LivePlugEnergy />
      <FinancePolicySection energyOnly />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.f4fafa4a98787935')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.fdff960850fb77b6')}</Text>
      </View>

      <InlineTabBar
        value={range}
        tabs={[
          { key: '7d', get label() { return translateNative('native.1984832fd3d25be4'); } },
          { key: '30d', get label() { return translateNative('native.c12983ef4ce463e5'); } },
          { key: '90d', get label() { return translateNative('native.2b6aac6d3fb5fd03'); } },
          { key: 'all', get label() { return translateNative('native.ecc6ed4114a1722f'); } },
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
              <Text style={[styles.filterChipText, { color: selectedPrinterId === null ? colors.textInverse : colors.text }]}>
                {translateNative('native.b8ed6cb4c204100e')}</Text>
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

      <SectionCard title={translateNative('native.dd193ff312ed2a5e')} subtitle={translateNative('native.605d4518a9fd16ae')}>
        <View style={styles.statsRow}>
          <StatCard label={translateNative('nav.energy')} value={formatKwh(displayKwh)} />
          <StatCard label={translateNative('common.cost')} value={formatCurrencyWithCode(displayCost, currency)} />
          <StatCard
            label={translateNative('native.03f9b516190ab7b1')}
            value={energyRate > 0 ? `${formatCurrencyWithCode(energyRate, currency)}/kWh` : '—'}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard label={translateNative('native.d3484bee79a505c4')} value={String(totalPrints)} />
          <StatCard label={translateNative('native.13783db95abcf52d')} value={formatKwh(avgEnergyKwh)} />
          <StatCard label={translateNative('native.4db3f74d4e0438f4')} value={totalPrints > 0 ? formatCurrencyWithCode(displayCost / Math.max(totalPrints, 1), currency) : '—'} />
        </View>
        {warmingUp ? (
          <View style={[styles.warningBox, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}55` }]}>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              {translateNative('native.23b550ec184d88d1')}</Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title={translateNative('native.65ecb647318d8e30')} subtitle={translateNative('native.b7253e505caf4c73')}>
        {series.length > 0 ? (
          <MultiSeriesLineChart
            points={series.map(point => ({
              label: point.label,
              values: { energy: point.energyKwh },
            }))}
            series={[{ key: 'energy', get label() { return translateNative('native.107b201198af6591'); }, color: colors.accent }]}
            height={200}
            formatYAxis={value => `${value.toFixed(1)} kWh`}
          />
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {translateNative('native.f67cc19cce708b5a')}</Text>
        )}
      </SectionCard>

      <SectionCard title={translateNative('native.06ca29baa7fe480c')} subtitle={translateNative('native.b8e49f5ec7a0296d')}>
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
            {translateNative('native.5aa9f9f3fa09b034')}</Text>
        )}
      </SectionCard>

      {filamentRows.length > 0 && (
        <SectionCard title={translateNative('native.200fda68162775f1')} subtitle={translateNative('native.b9ffc482c8748fce')}>
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
                <Text style={[styles.filamentMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.057f07bfd929b845" values={{ value0: (formatCurrencyWithCode(row.energyCost, currency)), value1: (row.printCount) }} /></Text>
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

      <Text style={[styles.footerText, { color: colors.textTertiary }]}>
        {translateNative('native.a754b47b3c7e07ce')}</Text>
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
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
