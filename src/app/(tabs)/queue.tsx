import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { InlineTabBar, StatusBadge } from '../../components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { formatDateTime, pickArray, pickId, pickString, statusColor, type ApiRecord } from '../../utils/data';

type QueueTab = 'queue' | 'history' | 'pipelines';

export default function QueueScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<QueueTab>('queue');

  const queueQuery = useQuery({ queryKey: ['queue'], queryFn: () => api.getQueue() });
  const historyQuery = useQuery({ queryKey: ['queueHistory'], queryFn: () => api.getQueueHistory({ limit: 100 }) });
  const pipelinesQuery = useQuery({ queryKey: ['pipelineRuns'], queryFn: () => api.getPipelineRuns() });

  const activeQuery = activeTab === 'queue' ? queueQuery : activeTab === 'history' ? historyQuery : pipelinesQuery;
  const data = useMemo(() => {
    if (activeTab === 'history') {
      const historyData = historyQuery.data;
      const items = Array.isArray(historyData) ? historyData : pickArray(historyData, ['items', 'results']);
      return items.filter((item): item is ApiRecord => typeof item === 'object' && item !== null);
    }

    const source = activeTab === 'queue' ? queueQuery.data : pipelinesQuery.data;
    return ((source ?? []) as ApiRecord[]).filter((item) => typeof item === 'object' && item !== null);
  }, [activeTab, historyQuery.data, pipelinesQuery.data, queueQuery.data]);

  if (queueQuery.isLoading && historyQuery.isLoading && pipelinesQuery.isLoading) {
    return <LoadingScreen message="Loading queue data…" />;
  }

  if (queueQuery.isError && historyQuery.isError && pipelinesQuery.isError) {
    return <ErrorState message="Unable to load queue information." onRetry={() => void activeQuery.refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={data}
        keyExtractor={(item) => `${activeTab}-${pickId(item)}`}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => void activeQuery.refetch()} tintColor={colors.accent} />}
        ListHeaderComponent={
          <InlineTabBar
            value={activeTab}
            tabs={[
              { key: 'queue', label: 'Queue' },
              { key: 'history', label: 'History' },
              { key: 'pipelines', label: 'Pipelines' },
            ]}
            onChange={setActiveTab}
          />
        }
        renderItem={({ item }) => {
          const status = pickString(item, ['status', 'state', 'result'], activeTab === 'queue' ? 'queued' : 'complete');
          const badgeColor = statusColor(status, colors);
          const title = pickString(item, ['name', 'archive_name', 'job_name', 'pipeline_name'], 'Unnamed item');
          const subtitle = pickString(item, ['printer_name', 'target_printer', 'started_by'], 'No printer assigned');
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.headerRow}>
                <View style={styles.headerText}>
                  <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                  <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
                </View>
                <StatusBadge label={status} color={badgeColor} />
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Updated {formatDateTime(pickString(item, ['updated_at', 'completed_at', 'created_at']))}</Text>
              <Text style={[styles.meta, { color: colors.textTertiary }]}>
                {pickString(item, ['note', 'message', 'result_message'], activeTab === 'pipelines' ? 'Pipeline run metadata will appear here.' : 'Waiting for the next action.')}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="📋" title={`No ${activeTab} items`} message="Pull to refresh or switch tabs to review another queue view." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  subtitle: { fontSize: fontSize.sm },
  meta: { fontSize: fontSize.sm },
});
