import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { InlineTabBar, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
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

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Statistics' });
  }, [navigation]);

  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>('30d');
  const params = getRangeParams(range);

  const statsQuery = useQuery({
    queryKey: ['archiveStats', params],
    queryFn: () => api.getArchiveStats(params),
  });
  const archivesQuery = useQuery({
    queryKey: ['archives', 'stats-screen', params],
    queryFn: () => api.getArchives({ ...params, limit: 500 }),
  });

  const refreshAll = async () => {
    await Promise.all([statsQuery.refetch(), archivesQuery.refetch()]);
  };

  const archives = useMemo(
    () => ((archivesQuery.data ?? []) as ApiRecord[]).filter(Boolean),
    [archivesQuery.data],
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
        const key = dayKey(pickString(item, ['created_at', 'started_at', 'completed_at']));
        if (key) uniqueDays.add(key);
      });
      days.push(...Array.from(uniqueDays).sort().slice(-42));
    }
    const counts = new Map<string, number>();
    archives.forEach(item => {
      const key = dayKey(pickString(item, ['created_at', 'started_at', 'completed_at']));
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const max = Math.max(...Array.from(counts.values()), 0);
    return { days, counts, max };
  }, [archives, params.dateFrom, params.dateTo]);

  const filamentTrends = useMemo(() => {
    const trendMap = new Map<string, { label: string; grams: number }>();
    archives.forEach(item => {
      const key = monthKey(pickString(item, ['created_at', 'started_at', 'completed_at']));
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
      if (archiveStatus(item).includes('fail')) current.failures += 1;
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching || archivesQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Print statistics</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Quick stats, activity heatmap, filament usage, and printer breakdowns.</Text>
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

      <View style={styles.grid}>
        <StatCard label="Total prints" value={String(Math.round(quickStats.totalPrints))} />
        <StatCard label="Success rate" value={formatPercent(quickStats.successRate, 1)} />
        <StatCard label="Print time" value={formatDuration(quickStats.printTime)} />
        <StatCard label="Filament used" value={formatWeight(quickStats.filament)} />
        <StatCard label="Cost" value={formatCurrency(quickStats.cost)} />
      </View>

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
        {materialBreakdown.length > 0 && (
          <View style={styles.materialWrap}>
            {materialBreakdown.map(row => (
              <View key={row.name} style={[styles.materialChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <Text style={[styles.materialName, { color: colors.text }]}>{row.name}</Text>
                <Text style={[styles.materialValue, { color: colors.textSecondary }]}>{formatWeight(row.grams)}</Text>
              </View>
            ))}
          </View>
        )}
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
    </ScrollView>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
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
    marginBottom: spacing.md,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  barLabel: {
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
});
