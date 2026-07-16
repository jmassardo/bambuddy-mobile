import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickArray, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';

export default function SystemScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'System' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const infoQuery = useQuery({
    queryKey: ['systemInfo'],
    queryFn: () => api.getSystemInfo(),
  });
  const healthQuery = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => api.getSystemHealth(),
  });
  const storageQuery = useQuery({
    queryKey: ['storageUsage'],
    queryFn: () => api.getStorageUsage(),
  });
  const libraryQuery = useQuery({
    queryKey: ['libraryStats'],
    queryFn: () => api.getLibraryStats(),
  });
  const debugQuery = useQuery({
    queryKey: ['debugLoggingState'],
    queryFn: () => api.getDebugLoggingState(),
  });
  const logsQuery = useQuery({
    queryKey: ['supportLogs'],
    queryFn: () => api.getSupportLogs({ limit: 40 }),
  });

  const refreshAll = async () => {
    await Promise.all([
      infoQuery.refetch(),
      healthQuery.refetch(),
      storageQuery.refetch(),
      libraryQuery.refetch(),
      debugQuery.refetch(),
      logsQuery.refetch(),
    ]);
  };

  const debugMutation = useMutation({
    mutationFn: (enabled: boolean) => api.setDebugLogging(enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['debugLoggingState'] });
      showToast('Debug logging updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update debug logging.', 'error'),
  });

  const supportBundleMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.downloadSupportBundle();
      await shareBlob(blob, 'bambuddy-support.zip');
    },
    onSuccess: () => showToast('Support bundle ready to share.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to download the support bundle.', 'error'),
  });

  const logEntries = useMemo(() => {
    const entries = pickArray(logsQuery.data, ['entries']);
    if (entries.length > 0) {
      return entries.map(entry => {
        const record = entry as ApiRecord;
        return `${pickString(record, ['timestamp'])} [${pickString(record, ['level'], 'info')}] ${pickString(record, ['message'], 'No message')}`;
      });
    }
    const text = pickString(logsQuery.data, ['content', 'logs']);
    return text ? text.split('\n').filter(Boolean) : [];
  }, [logsQuery.data]);

  if (infoQuery.isLoading || healthQuery.isLoading) {
    return <LoadingScreen message="Loading system information…" />;
  }

  if (infoQuery.isError || healthQuery.isError) {
    return (
      <ErrorState
        message="Unable to load system information."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const info = (infoQuery.data ?? {}) as ApiRecord;
  const app = (info.app ?? {}) as ApiRecord;
  const database = (info.database ?? {}) as ApiRecord;
  const printers = (info.printers ?? {}) as ApiRecord;
  const storage = (info.storage ?? {}) as ApiRecord;
  const system = (info.system ?? {}) as ApiRecord;
  const memory = (info.memory ?? {}) as ApiRecord;
  const cpu = (info.cpu ?? {}) as ApiRecord;
  const health = (healthQuery.data ?? {}) as ApiRecord;
  const debugEnabled = pickBoolean(debugQuery.data, ['enabled'], false);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={
            infoQuery.isRefetching ||
            healthQuery.isRefetching ||
            storageQuery.isRefetching ||
            logsQuery.isRefetching
          }
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>System</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Resources, health, storage, logs, and support tools.</Text>
      </View>

      <View style={styles.grid}>
        <StatCard label="CPU" value={`${pickNumber(cpu, ['percent'], 0)}%`} />
        <StatCard label="Memory" value={`${pickNumber(memory, ['percent_used'], 0)}%`} />
        <StatCard label="Disk" value={`${pickNumber(storage, ['disk_percent_used'], 0)}%`} />
        <StatCard label="Printers" value={String(pickNumber(printers, ['total'], 0))} />
      </View>

      <SectionCard title="System health" subtitle="Top-level server health and runtime details.">
        <View style={styles.healthGrid}>
          <Text style={[styles.healthRow, { color: colors.textSecondary }]}>Version: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(app, ['version'], 'Unknown')}</Text></Text>
          <Text style={[styles.healthRow, { color: colors.textSecondary }]}>Hostname: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(system, ['hostname'], 'Unknown')}</Text></Text>
          <Text style={[styles.healthRow, { color: colors.textSecondary }]}>Uptime: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(system, ['uptime_formatted'], '—')}</Text></Text>
          <Text style={[styles.healthRow, { color: colors.textSecondary }]}>Health summary: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(health, ['summary', 'status', 'overall_status'], 'Healthy')}</Text></Text>
        </View>
      </SectionCard>

      <SectionCard title="Database & library" subtitle="Counts, storage sizes, and library usage.">
        <View style={styles.grid}>
          <StatCard label="Archives" value={String(pickNumber(database, ['archives'], 0))} />
          <StatCard label="Projects" value={String(pickNumber(database, ['projects'], 0))} />
          <StatCard label="Filaments" value={String(pickNumber(database, ['filaments'], 0))} />
          <StatCard label="DB size" value={pickString(storage, ['database_size_formatted'], '—')} />
        </View>
        <View style={styles.metricList}>
          <Text style={[styles.metricText, { color: colors.textSecondary }]}>Completed archives: <Text style={[styles.healthValue, { color: colors.text }]}>{pickNumber(database, ['archives_completed'], 0)}</Text></Text>
          <Text style={[styles.metricText, { color: colors.textSecondary }]}>Failed archives: <Text style={[styles.healthValue, { color: colors.text }]}>{pickNumber(database, ['archives_failed'], 0)}</Text></Text>
          <Text style={[styles.metricText, { color: colors.textSecondary }]}>Library files: <Text style={[styles.healthValue, { color: colors.text }]}>{pickNumber(libraryQuery.data, ['total_files'], 0)}</Text></Text>
          <Text style={[styles.metricText, { color: colors.textSecondary }]}>Library folders: <Text style={[styles.healthValue, { color: colors.text }]}>{pickNumber(libraryQuery.data, ['total_folders'], 0)}</Text></Text>
          <Text style={[styles.metricText, { color: colors.textSecondary }]}>Library storage: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(libraryQuery.data, ['total_size_formatted'], pickString(libraryQuery.data, ['total_size_bytes'], '—'))}</Text></Text>
        </View>
      </SectionCard>

      <SectionCard title="Storage" subtitle="Server storage utilization and breakdown.">
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>Disk usage: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(storage, ['disk_used_formatted'], '—')} / {pickString(storage, ['disk_total_formatted'], '—')}</Text></Text>
        <Text style={[styles.metricText, { color: colors.textSecondary }]}>Free: <Text style={[styles.healthValue, { color: colors.text }]}>{pickString(storage, ['disk_free_formatted'], '—')}</Text></Text>
        {pickArray(storageQuery.data, ['categories']).map((category, index) => {
          const item = category as ApiRecord;
          return (
            <View key={`${pickString(item, ['key'])}-${index}`} style={styles.storageRow}>
              <Text style={[styles.metricText, { color: colors.text }]}>{pickString(item, ['label'], pickString(item, ['key'], 'Storage'))}</Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>{pickString(item, ['formatted'], `${pickNumber(item, ['bytes'], 0)} B`)}</Text>
            </View>
          );
        })}
      </SectionCard>

      <SectionCard title="Support tools" subtitle="Enable debug logging, download a support bundle, and inspect recent logs.">
        <View style={styles.supportRow}>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, { color: colors.text }]}>Debug logging</Text>
            <Text style={[styles.supportDescription, { color: colors.textSecondary }]}>Capture more detailed diagnostics before downloading a bundle.</Text>
          </View>
          <Switch
            value={debugEnabled}
            onValueChange={value => void debugMutation.mutateAsync(value)}
            trackColor={{ false: colors.surfaceHover, true: colors.accent }}
            thumbColor={colors.text}
            disabled={debugMutation.isPending}
          />
        </View>

        <PrimaryButton
          label={supportBundleMutation.isPending ? 'Preparing bundle…' : 'Download support bundle'}
          onPress={() => void supportBundleMutation.mutateAsync()}
          disabled={supportBundleMutation.isPending}
          loading={supportBundleMutation.isPending}
        />

        <View style={[styles.logBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
          {logEntries.length > 0 ? (
            logEntries.map((entry, index) => (
              <Text key={`${index}-${entry}`} style={[styles.logLine, { color: colors.textSecondary }]} numberOfLines={2}>
                {entry}
              </Text>
            ))
          ) : (
            <Text style={[styles.logLine, { color: colors.textSecondary }]}>No recent log entries available.</Text>
          )}
        </View>
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
  healthGrid: {
    gap: spacing.sm,
  },
  healthRow: {
    fontSize: fontSize.sm,
  },
  healthValue: {
    fontWeight: fontWeight.semibold,
  },
  metricList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  metricText: {
    fontSize: fontSize.sm,
  },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  supportText: {
    flex: 1,
    gap: spacing.xs,
  },
  supportTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  supportDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  logBox: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  logLine: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
});
