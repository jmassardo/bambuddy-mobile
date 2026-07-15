import React from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { KeyValueRow, PrimaryButton, SectionCard } from '../../components/common/AppUI';
import { ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
  pickId,
  pickString,
  type ApiRecord,
} from '../../utils/data';

export default function ArchiveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const archiveId = Number(id);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const archiveQuery = useQuery({
    queryKey: ['archive', archiveId],
    queryFn: () => api.getArchive(archiveId),
    enabled: Number.isFinite(archiveId),
  });

  const runsQuery = useQuery({
    queryKey: ['archiveRuns', archiveId],
    queryFn: () => api.getArchiveRuns(archiveId),
    enabled: Number.isFinite(archiveId),
  });

  const reprintMutation = useMutation({
    mutationFn: () => api.printArchive(archiveId, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      showToast('Reprint started.', 'success');
    },
    onError: () => showToast('Unable to start a reprint for this archive.', 'error'),
  });

  const queueMutation = useMutation({
    mutationFn: () => api.addToQueue({ archive_id: archiveId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      showToast('Archive added to queue.', 'success');
    },
    onError: () => showToast('Unable to add this archive to the queue.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([archiveQuery.refetch(), runsQuery.refetch()]);
  };

  if (archiveQuery.isLoading || runsQuery.isLoading) {
    return <LoadingScreen message="Loading archive details…" />;
  }

  if (archiveQuery.isError || !archiveQuery.data) {
    return <ErrorState message="Unable to load archive details." onRetry={() => void refreshAll()} />;
  }

  const archive = archiveQuery.data as ApiRecord;
  const runs = Array.isArray(runsQuery.data) ? (runsQuery.data as ApiRecord[]) : [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={archiveQuery.isRefetching || runsQuery.isRefetching} onRefresh={() => void refreshAll()} tintColor={colors.accent} />}
    >
      <Image source={{ uri: api.getArchiveThumbnail(archiveId) }} style={styles.thumbnail} />

      <SectionCard title={pickString(archive, ['name', 'file_name'], 'Untitled archive')} subtitle={pickString(archive, ['printer_name', 'printer'], 'Unknown printer')}>
        <KeyValueRow label="Tags" value={pickString(archive, ['tags_text', 'tag_names'], '—')} />
        <KeyValueRow label="Date" value={formatDateTime(pickString(archive, ['completed_at', 'created_at']))} />
        <KeyValueRow label="Duration" value={formatDuration(pickString(archive, ['duration_human', 'duration']))} />
        <KeyValueRow label="Filament" value={formatWeight(pickString(archive, ['filament_used_g', 'filament_usage']))} />
        <KeyValueRow label="Cost" value={formatCurrency(pickString(archive, ['cost', 'estimated_cost']))} />
      </SectionCard>

      <View style={styles.actionRow}>
        <View style={styles.actionCell}><PrimaryButton label="Reprint" onPress={() => void reprintMutation.mutateAsync()} loading={reprintMutation.isPending} /></View>
        <View style={styles.actionCell}><PrimaryButton label="Add to Queue" onPress={() => void queueMutation.mutateAsync()} variant="secondary" loading={queueMutation.isPending} /></View>
        <View style={styles.actionCell}>
          <PrimaryButton
            label="Share"
            variant="secondary"
            onPress={() => void Share.share({ message: `${pickString(archive, ['name', 'file_name'])} • ${pickString(archive, ['printer_name', 'printer'])}` })}
          />
        </View>
      </View>

      <SectionCard title="Print History" subtitle="Previous runs for this archived model.">
        {runs.length > 0 ? runs.map((run) => (
          <View key={pickId(run)} style={[styles.runCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <Text style={[styles.runTitle, { color: colors.text }]}>{pickString(run, ['status', 'result'], 'Unknown result')}</Text>
            <Text style={[styles.runMeta, { color: colors.textSecondary }]}>{formatDateTime(pickString(run, ['started_at', 'created_at']))}</Text>
            <Text style={[styles.runMeta, { color: colors.textSecondary }]}>{pickString(run, ['printer_name', 'printer'], 'Unknown printer')}</Text>
          </View>
        )) : <Text style={[styles.note, { color: colors.textSecondary }]}>No print history available yet.</Text>}
      </SectionCard>

      <SectionCard title="Notes & Failure Analysis">
        <Text style={[styles.note, { color: colors.textSecondary }]}> 
          {pickString(
            archive,
            ['failure_analysis', 'notes', 'failure_reason', 'comment'],
            'No notes or failure analysis were captured for this archive.',
          )}
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
  thumbnail: {
    width: '100%',
    height: 240,
    borderRadius: borderRadius.xl,
    backgroundColor: '#111827',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionCell: {
    flex: 1,
    minWidth: 102,
  },
  runCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  runTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  runMeta: {
    fontSize: fontSize.sm,
  },
  note: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
});
