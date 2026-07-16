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
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import { InlineTabBar, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  formatCurrency,
  formatPercent,
  formatWeight,
  pickArray,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';

type RangeKey = '7d' | '30d' | '90d' | 'all';

function rangeToParams(range: RangeKey) {
  if (range === 'all') return {};
  const days = Number(range.replace('d', ''));
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return { dateFrom: from };
}

export default function StatsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Statistics' });
  }, [navigation]);
  const { colors } = useTheme();
  const [range, setRange] = useState<RangeKey>('30d');

  const statsQuery = useQuery({
    queryKey: ['archiveStats', range],
    queryFn: () => api.getArchiveStats(rangeToParams(range)),
  });

  const materialBreakdown = useMemo(
    () =>
      pickArray(statsQuery.data, [
        'material_breakdown',
        'filament_by_type',
      ]).filter(
        (item): item is ApiRecord => typeof item === 'object' && item !== null,
      ),
    [statsQuery.data],
  );

  if (statsQuery.isLoading) {
    return <LoadingScreen message="Loading archive statistics…" />;
  }

  if (statsQuery.isError) {
    return (
      <ErrorState
        message="Unable to load archive statistics."
        onRetry={() => void statsQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching}
          onRefresh={() => void statsQuery.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Archive Statistics
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Track print throughput, materials, and reliability.
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
        onChange={setRange}
      />

      <View style={styles.summaryGrid}>
        <StatCard
          label="Total prints"
          value={pickNumber(
            statsQuery.data,
            ['total_prints', 'prints_count'],
            0,
          ).toFixed(0)}
        />
        <StatCard
          label="Success rate"
          value={formatPercent(
            pickNumber(statsQuery.data, ['success_rate'], 0),
            1,
          )}
        />
        <StatCard
          label="Total filament"
          value={formatWeight(
            pickNumber(
              statsQuery.data,
              ['total_filament_g', 'filament_total_g'],
              0,
            ),
          )}
        />
        <StatCard
          label="Total cost"
          value={formatCurrency(
            pickNumber(statsQuery.data, ['total_cost', 'cost_total'], 0),
          )}
        />
      </View>

      <SectionCard
        title="Filament by Type"
        subtitle="Chart placeholder with available breakdown values."
      >
        {materialBreakdown.length > 0 ? (
          materialBreakdown.map(entry => (
            <View
              key={pickString(
                entry,
                ['material', 'name'],
                Math.random().toString(),
              )}
              style={styles.chartRow}
            >
              <Text style={[styles.chartLabel, { color: colors.text }]}>
                {pickString(entry, ['material', 'name'], 'Unknown')}
              </Text>
              <Text
                style={[styles.chartValue, { color: colors.textSecondary }]}
              >
                {formatWeight(
                  pickNumber(entry, ['weight_g', 'total_g', 'value'], 0),
                )}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
            Material breakdown chart will populate once archive stats are
            available.
          </Text>
        )}
      </SectionCard>

      <SectionCard
        title="Prints Over Time"
        subtitle="Chart placeholder section."
      >
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          Trend chart placeholder. Date range: {range}. Total prints:{' '}
          {pickNumber(
            statsQuery.data,
            ['total_prints', 'prints_count'],
            0,
          ).toFixed(0)}
          .
        </Text>
      </SectionCard>

      <SectionCard
        title="Success / Fail Ratio"
        subtitle="Chart placeholder section."
      >
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          Successful prints:{' '}
          {pickNumber(
            statsQuery.data,
            ['successful_prints', 'success_count'],
            0,
          ).toFixed(0)}{' '}
          • Failed prints:{' '}
          {pickNumber(
            statsQuery.data,
            ['failed_prints', 'failure_count'],
            0,
          ).toFixed(0)}
        </Text>
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  chartLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  chartValue: {
    fontSize: fontSize.base,
  },
  placeholder: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
});
