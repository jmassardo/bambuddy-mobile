import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { SectionCard, StatCard } from '../../components/common/AppUI';
import { ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { pickArray, pickString } from '../../utils/data';

export default function SystemInfoScreen() {
  const { colors } = useTheme();
  const { serverConnected } = useAuth();
  const infoQuery = useQuery({ queryKey: ['systemInfo'], queryFn: () => api.getSystemInfo() });
  const healthQuery = useQuery({ queryKey: ['systemHealth'], queryFn: () => api.getSystemHealth() });
  const logsQuery = useQuery({ queryKey: ['applicationLogs'], queryFn: () => api.getApplicationLogs({ lines: 50 }) });
  const updatesQuery = useQuery({ queryKey: ['updateInfo'], queryFn: () => api.getUpdateInfo() });

  const refreshAll = async () => {
    await Promise.all([infoQuery.refetch(), healthQuery.refetch(), logsQuery.refetch(), updatesQuery.refetch()]);
  };

  const logText = useMemo(() => {
    const text = pickString(logsQuery.data, ['content', 'logs', 'text']);
    if (text) return text;
    const entries = pickArray(logsQuery.data, ['lines', 'entries']).map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)));
    return entries.join('\n');
  }, [logsQuery.data]);

  if (infoQuery.isLoading || healthQuery.isLoading) {
    return <LoadingScreen message="Loading system information…" />;
  }

  if (infoQuery.isError || healthQuery.isError) {
    return <ErrorState message="Unable to load system information." onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={infoQuery.isRefetching || healthQuery.isRefetching || logsQuery.isRefetching} onRefresh={() => void refreshAll()} tintColor={colors.accent} />}
    >
      <View style={styles.healthGrid}>
        <StatCard label="CPU" value={pickString(healthQuery.data, ['cpu_usage', 'cpu.percent'], '—')} />
        <StatCard label="Memory" value={pickString(healthQuery.data, ['memory_usage', 'memory.percent'], '—')} />
        <StatCard label="Disk" value={pickString(healthQuery.data, ['disk_usage', 'disk.percent'], '—')} />
      </View>

      <SectionCard title="Backend Status">
        <Text style={[styles.text, { color: colors.text }]}>Server connection: {serverConnected ? 'Online' : 'Offline'}</Text>
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>Latest backend version: {pickString(updatesQuery.data, ['latest_version', 'version'], 'Unknown')}</Text>
      </SectionCard>

      <SectionCard title="Version Information">
        <Text style={[styles.text, { color: colors.text }]}>{pickString(infoQuery.data, ['version', 'app_version'], 'Unknown version')}</Text>
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>{pickString(infoQuery.data, ['build', 'commit', 'git_sha'], 'No build metadata')}</Text>
      </SectionCard>

      <SectionCard title="Log Viewer" subtitle="Last 50 application log lines.">
        <View style={[styles.logBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
          <Text style={[styles.logText, { color: colors.textSecondary }]}>{logText || 'No log output available.'}</Text>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  text: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  subtext: { fontSize: fontSize.sm },
  logBox: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, minHeight: 180 },
  logText: { fontFamily: 'Menlo', fontSize: fontSize.xs, lineHeight: 18 },
});
