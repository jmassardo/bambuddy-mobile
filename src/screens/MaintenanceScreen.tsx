import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { InlineTabBar, PrimaryButton, ProgressBar, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickArray, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';

type FilterKey = 'all' | 'due' | 'warning';

function formatInterval(item: ApiRecord) {
  const type = pickString(item, ['interval_type'], 'hours');
  const value = pickNumber(item, ['interval_hours'], 0);
  return type === 'days' ? `${value} day${value === 1 ? '' : 's'}` : `${value}h`;
}

function progressValue(item: ApiRecord) {
  const type = pickString(item, ['interval_type'], 'hours');
  if (type === 'days') {
    const used = pickNumber(item, ['days_since_maintenance'], 0);
    const total = Math.max(pickNumber(item, ['interval_hours'], 1), 1);
    return Math.min(100, Math.max(0, (used / total) * 100));
  }
  const total = Math.max(pickNumber(item, ['interval_hours'], 1), 1);
  const used = pickNumber(item, ['hours_since_maintenance'], 0);
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function dueLabel(item: ApiRecord) {
  if (pickBoolean(item, ['is_due'])) {
    const type = pickString(item, ['interval_type'], 'hours');
    return type === 'days'
      ? `Overdue by ${Math.abs(pickNumber(item, ['days_until_due'], 0))} day(s)`
      : `Overdue by ${Math.abs(pickNumber(item, ['hours_until_due'], 0))}h`;
  }
  if (pickBoolean(item, ['is_warning'])) {
    const type = pickString(item, ['interval_type'], 'hours');
    return type === 'days'
      ? `Due in ${pickNumber(item, ['days_until_due'], 0)} day(s)`
      : `Due in ${pickNumber(item, ['hours_until_due'], 0)}h`;
  }
  return 'On schedule';
}

function statusColor(item: ApiRecord, colors: ReturnType<typeof useTheme>['colors']) {
  if (!pickBoolean(item, ['enabled'], true)) return colors.textTertiary;
  if (pickBoolean(item, ['is_due'])) return colors.error;
  if (pickBoolean(item, ['is_warning'])) return colors.warning;
  return colors.success;
}

export default function MaintenanceScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Maintenance' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>('all');

  const overviewQuery = useQuery({
    queryKey: ['maintenanceOverview'],
    queryFn: () => api.getMaintenanceOverview(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateMaintenanceItem(id, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      showToast('Maintenance setting updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update maintenance item.', 'error'),
  });

  const performMutation = useMutation({
    mutationFn: (id: number) => api.performMaintenance(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      showToast('Maintenance task marked as performed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to perform maintenance.', 'error'),
  });

  const printers = useMemo(() => {
    const rows = (overviewQuery.data ?? []) as ApiRecord[];
    return rows
      .map(item => {
        const tasks = pickArray(item, ['maintenance_items']) as ApiRecord[];
        const filteredTasks = tasks.filter(task => {
          if (filter === 'due') return pickBoolean(task, ['is_due']);
          if (filter === 'warning') return pickBoolean(task, ['is_warning']);
          return true;
        });
        return {
          id: pickString(item, ['printer_id']),
          name: pickString(item, ['printer_name'], 'Printer'),
          model: pickString(item, ['printer_model'], 'Unknown model'),
          printHours: pickNumber(item, ['total_print_hours'], 0),
          dueCount: pickNumber(item, ['due_count'], 0),
          warningCount: pickNumber(item, ['warning_count'], 0),
          tasks: filteredTasks,
        };
      })
      .filter(printer => printer.tasks.length > 0 || filter === 'all');
  }, [filter, overviewQuery.data]);

  if (overviewQuery.isLoading) {
    return <LoadingScreen message="Loading maintenance overview…" />;
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        message="Unable to load maintenance tasks."
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={overviewQuery.isRefetching}
          onRefresh={() => void overviewQuery.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Maintenance</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Track service intervals, due states, and wiki links for each printer.</Text>
      </View>

      <InlineTabBar
        value={filter}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'due', label: 'Due' },
          { key: 'warning', label: 'Warning' },
        ]}
        onChange={value => setFilter(value as FilterKey)}
      />

      {printers.length === 0 ? (
        <EmptyState
          icon="🧰"
          title="Nothing to show"
          message="No maintenance items match the current filter."
        />
      ) : (
        printers.map(printer => (
          <SectionCard
            key={printer.id || printer.name}
            title={printer.name}
            subtitle={`${printer.model} • ${Math.round(printer.printHours)}h total print time`}
            right={
              <View style={styles.headerBadges}>
                {printer.dueCount > 0 ? <StatusBadge label={`${printer.dueCount} due`} color={colors.error} /> : null}
                {printer.warningCount > 0 ? <StatusBadge label={`${printer.warningCount} warning`} color={colors.warning} /> : null}
              </View>
            }
          >
            {printer.tasks.length > 0 ? (
              printer.tasks.map(task => {
                const color = statusColor(task, colors);
                const wikiUrl = pickString(task, ['maintenance_type_wiki_url']);
                const isBusy = toggleMutation.isPending || performMutation.isPending;
                return (
                  <View
                    key={pickString(task, ['id'])}
                    style={[
                      styles.taskCard,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.taskHeader}>
                      <View style={styles.taskText}>
                        <Text style={[styles.taskTitle, { color: colors.text }]}>{pickString(task, ['maintenance_type_name', 'name'], 'Maintenance task')}</Text>
                        <Text style={[styles.taskMeta, { color }]}>{dueLabel(task)}</Text>
                      </View>
                      <Switch
                        value={pickBoolean(task, ['enabled'], true)}
                        onValueChange={enabled =>
                          void toggleMutation.mutateAsync({ id: pickNumber(task, ['id']), enabled })
                        }
                        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                        thumbColor={colors.text}
                      />
                    </View>

                    <ProgressBar progress={progressValue(task)} color={color} />

                    <View style={styles.metaGrid}>
                      <Text style={[styles.taskMeta, { color: colors.textSecondary }]}>Interval: {formatInterval(task)}</Text>
                      <Text style={[styles.taskMeta, { color: colors.textSecondary }]}>Last done: {formatDateTime(pickString(task, ['last_performed_at']))}</Text>
                    </View>

                    <View style={styles.actions}>
                      <PrimaryButton
                        label={performMutation.isPending ? 'Performing…' : 'Perform'}
                        onPress={() => void performMutation.mutateAsync(pickNumber(task, ['id']))}
                        disabled={!pickBoolean(task, ['enabled'], true) || isBusy}
                        variant={pickBoolean(task, ['is_due']) ? 'primary' : 'secondary'}
                        loading={performMutation.isPending}
                      />
                      {wikiUrl ? (
                        <PrimaryButton
                          label="Wiki"
                          variant="secondary"
                          onPress={() => void Linking.openURL(wikiUrl)}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No maintenance items match this filter for {printer.name}.</Text>
            )}
          </SectionCard>
        ))
      )}
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
  headerBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  taskCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskText: {
    flex: 1,
    gap: spacing.xs,
  },
  taskTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  taskMeta: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  metaGrid: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
});
