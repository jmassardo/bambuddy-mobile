import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
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
import { InlineTabBar, PrimaryButton, SectionCard, StatCard, TextField } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickArray, pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';

type LogLevel = 'all' | 'info' | 'warn' | 'error';

async function gracefully<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch {
    return {} as T;
  }
}

function formatLogEntry(entry: ApiRecord) {
  return `${pickString(entry, ['timestamp', 'time'], '')} [${pickString(entry, ['level'], 'info')}] ${pickString(entry, ['message'], 'No message')}`;
}

function findCategory(data: ApiRecord, keys: string[]) {
  const categories = pickArray(data, ['categories']) as ApiRecord[];
  return categories.find(item => keys.some(key => pickString(item, ['key']).toLowerCase().includes(key)));
}

export default function SystemScreen() {
  const navigation = useNavigation<RootNavigationProp<'System'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'System' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [logLevel, setLogLevel] = useState<LogLevel>('all');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [bugReportDescription, setBugReportDescription] = useState('');
  const [bugReportEmail, setBugReportEmail] = useState('');
  const [includeSupportInfo, setIncludeSupportInfo] = useState(true);

  const infoQuery = useQuery({
    queryKey: ['systemInfo'],
    queryFn: () => gracefully(() => api.getSystemInfo()),
  });
  const healthQuery = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => gracefully(() => api.getSystemHealth()),
  });
  const storageQuery = useQuery({
    queryKey: ['storageUsage'],
    queryFn: () => gracefully(() => api.getStorageUsage()),
  });
  const libraryQuery = useQuery({
    queryKey: ['libraryStats'],
    queryFn: () => gracefully(() => api.getLibraryStats()),
  });
  const debugQuery = useQuery({
    queryKey: ['debugLoggingState'],
    queryFn: () => gracefully(() => api.getDebugLoggingState()),
  });
  const logsQuery = useQuery({
    queryKey: ['applicationLogs', logLevel],
    queryFn: () => gracefully(() => api.getApplicationLogs({
      lines: 100,
      level: logLevel === 'all' ? undefined : logLevel,
    })),
    refetchInterval: autoRefreshLogs ? 15000 : false,
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

  const bugReportMutation = useMutation({
    mutationFn: async () => {
      const wasDebug = pickBoolean(debugQuery.data, ['enabled'], false);
      try {
        await api.startBugReportLogging().catch(() => ({}));
        return await api.submitBugReport({
          description: bugReportDescription.trim(),
          email: bugReportEmail.trim() || undefined,
          include_support_info: includeSupportInfo,
          debug_logs: logEntries.slice(0, 25).join('\n'),
        });
      } finally {
        await api.stopBugReportLogging(wasDebug).catch(() => ({}));
      }
    },
    onSuccess: async result => {
      setBugReportDescription('');
      if (pickString(result, ['issue_url'])) {
        await Linking.openURL(pickString(result, ['issue_url'])).catch(() => undefined);
      }
      showToast(pickString(result, ['message'], 'Bug report submitted.'), 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to submit bug report.', 'error'),
  });

  const logEntries = useMemo(() => {
    const entries = pickArray(logsQuery.data, ['entries']);
    if (entries.length > 0) {
      return entries.map(entry => formatLogEntry(entry as ApiRecord));
    }
    const text = pickString(logsQuery.data, ['content', 'logs']);
    return text ? text.split('\n').filter(Boolean) : [];
  }, [logsQuery.data]);

  if (infoQuery.isLoading && healthQuery.isLoading) {
    return <LoadingScreen message="Loading system information…" />;
  }

  if (infoQuery.isError && healthQuery.isError) {
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
  const archivesStorage = findCategory(storageQuery.data as ApiRecord, ['archive']);
  const libraryStorage = findCategory(storageQuery.data as ApiRecord, ['library']);
  const databaseStorage = findCategory(storageQuery.data as ApiRecord, ['database', 'db']);
  const timelapseStorage = findCategory(storageQuery.data as ApiRecord, ['timelapse']);

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
            libraryQuery.isRefetching ||
            debugQuery.isRefetching ||
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
        <StatCard label="Printers" value={String(pickNumber(printers, ['connected', 'total'], 0))} />
      </View>

      <SectionCard title="System health" subtitle="CPU, memory, uptime, storage, and connected printers.">
        <View style={styles.healthGrid}>
          <InfoRow label="Version" value={pickString(app, ['version'], 'Unavailable')} colors={colors} />
          <InfoRow label="Hostname" value={pickString(system, ['hostname'], 'Unavailable')} colors={colors} />
          <InfoRow label="Uptime" value={pickString(system, ['uptime_formatted'], 'Unavailable')} colors={colors} />
          <InfoRow label="Health summary" value={pickString(health, ['summary', 'status', 'overall_status'], 'Unavailable')} colors={colors} />
          <InfoRow label="Connected printers" value={String(pickNumber(printers, ['connected', 'total'], 0))} colors={colors} />
          <InfoRow label="Disk free" value={pickString(storage, ['disk_free_formatted'], 'Unavailable')} colors={colors} />
        </View>
      </SectionCard>

      <SectionCard title="Storage usage" subtitle="Archives, library, database, timelapses, and total disk usage.">
        <View style={styles.grid}>
          <StatCard label="Archives" value={pickString(archivesStorage, ['formatted'], pickString(storage, ['archive_size_formatted'], 'Unavailable'))} />
          <StatCard label="Library" value={pickString(libraryStorage, ['formatted'], pickString(libraryQuery.data, ['total_size_formatted'], 'Unavailable'))} />
          <StatCard label="Database" value={pickString(databaseStorage, ['formatted'], pickString(storage, ['database_size_formatted'], 'Unavailable'))} />
          <StatCard label="Timelapse" value={pickString(timelapseStorage, ['formatted'], 'Unavailable')} />
        </View>
        <View style={styles.metricList}>
          <InfoRow label="Total disk" value={pickString(storage, ['disk_total_formatted'], pickString(storageQuery.data, ['total_formatted'], 'Unavailable'))} colors={colors} />
          <InfoRow label="Used disk" value={pickString(storage, ['disk_used_formatted'], 'Unavailable')} colors={colors} />
          <InfoRow label="Available disk" value={pickString(storage, ['disk_free_formatted'], 'Unavailable')} colors={colors} />
          <InfoRow label="Library files" value={String(pickNumber(libraryQuery.data, ['total_files'], 0))} colors={colors} />
          <InfoRow label="Archives" value={String(pickNumber(database, ['archives'], 0))} colors={colors} />
        </View>
      </SectionCard>

      <SectionCard title="Database & library" subtitle="Counts, storage sizes, and library usage.">
        <View style={styles.grid}>
          <StatCard label="Archives" value={String(pickNumber(database, ['archives'], 0))} />
          <StatCard label="Projects" value={String(pickNumber(database, ['projects'], 0))} />
          <StatCard label="Filaments" value={String(pickNumber(database, ['filaments'], 0))} />
          <StatCard label="DB size" value={pickString(storage, ['database_size_formatted'], 'Unavailable')} />
        </View>
        <View style={styles.metricList}>
          <InfoRow label="Completed archives" value={String(pickNumber(database, ['archives_completed'], 0))} colors={colors} />
          <InfoRow label="Failed archives" value={String(pickNumber(database, ['archives_failed'], 0))} colors={colors} />
          <InfoRow label="Library folders" value={String(pickNumber(libraryQuery.data, ['total_folders'], 0))} colors={colors} />
          <InfoRow label="Library storage" value={pickString(libraryQuery.data, ['total_size_formatted'], 'Unavailable')} colors={colors} />
        </View>
      </SectionCard>

      <SectionCard title="Logging & support" subtitle="Debug logging, recent logs, and support bundles.">
        <View style={styles.supportRow}>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, { color: colors.text }]}>Debug logging</Text>
            <Text style={[styles.supportDescription, { color: colors.textSecondary }]}>Capture extra server diagnostics before sharing a report.</Text>
          </View>
          <Switch
            value={debugEnabled}
            onValueChange={value => void debugMutation.mutateAsync(value)}
            trackColor={{ false: colors.surfaceHover, true: colors.accent }}
            thumbColor={colors.text}
            disabled={debugMutation.isPending}
          />
        </View>

        <InlineTabBar
          value={logLevel}
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'info', label: 'Info' },
            { key: 'warn', label: 'Warn' },
            { key: 'error', label: 'Error' },
          ]}
          onChange={value => setLogLevel(value as LogLevel)}
        />

        <View style={styles.supportRow}>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, { color: colors.text }]}>Auto-refresh logs</Text>
            <Text style={[styles.supportDescription, { color: colors.textSecondary }]}>Refresh recent logs every 15 seconds.</Text>
          </View>
          <Switch
            value={autoRefreshLogs}
            onValueChange={setAutoRefreshLogs}
            trackColor={{ false: colors.surfaceHover, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Refresh logs"
            variant="secondary"
            onPress={() => void logsQuery.refetch()}
            disabled={logsQuery.isRefetching}
            loading={logsQuery.isRefetching}
          />
          <PrimaryButton
            label={supportBundleMutation.isPending ? 'Preparing bundle…' : 'Download support bundle'}
            onPress={() => void supportBundleMutation.mutateAsync()}
            disabled={supportBundleMutation.isPending}
            loading={supportBundleMutation.isPending}
          />
        </View>

        <View style={[styles.logBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          {logEntries.length > 0 ? (
            logEntries.map((entry, index) => (
              <Text key={`${index}-${entry}`} style={[styles.logLine, { color: colors.textSecondary }]}>
                {entry}
              </Text>
            ))
          ) : (
            <Text style={[styles.logLine, { color: colors.textSecondary }]}>Recent logs are unavailable for this server.</Text>
          )}
        </View>
      </SectionCard>

      <SectionCard title="Submit bug report" subtitle="Send recent diagnostics and open the resulting report when available.">
        <TextField
          label="What happened?"
          value={bugReportDescription}
          onChangeText={setBugReportDescription}
          placeholder="Describe the problem, what you expected, and how to reproduce it."
          multiline
        />
        <TextField
          label="Email (optional)"
          value={bugReportEmail}
          onChangeText={setBugReportEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.supportRow}>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, { color: colors.text }]}>Include support info</Text>
            <Text style={[styles.supportDescription, { color: colors.textSecondary }]}>Attach system details and recent errors when available.</Text>
          </View>
          <Switch
            value={includeSupportInfo}
            onValueChange={setIncludeSupportInfo}
            trackColor={{ false: colors.surfaceHover, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
        <PrimaryButton
          label={bugReportMutation.isPending ? 'Submitting…' : 'Submit bug report'}
          onPress={() => void bugReportMutation.mutateAsync()}
          disabled={!bugReportDescription.trim() || bugReportMutation.isPending}
          loading={bugReportMutation.isPending}
        />
      </SectionCard>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.metricText, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
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
  metricList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontWeight: fontWeight.semibold,
  },
  metricText: {
    fontSize: fontSize.sm,
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  logBox: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: 260,
  },
  logLine: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
});
