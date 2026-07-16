import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  KeyValueRow,
  SectionCard,
  StatusBadge,
} from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  pickArray,
  pickId,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

export default function ProjectDetailScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Project' });
  }, [navigation]);
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };
  const projectId = Number(id);
  const { colors } = useTheme();

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Number.isFinite(projectId),
  });
  const archivesQuery = useQuery({
    queryKey: ['projectArchives', projectId],
    queryFn: () => api.getArchives({ projectId, limit: 50 }),
    enabled: Number.isFinite(projectId),
  });

  const refreshAll = async () => {
    await Promise.all([projectQuery.refetch(), archivesQuery.refetch()]);
  };

  if (projectQuery.isLoading) {
    return <LoadingScreen message="Loading project…" />;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <ErrorState
        message="Unable to load the selected project."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const project = projectQuery.data as ApiRecord;
  const linkedFiles = pickArray(project, ['linked_files', 'files']).filter(
    (item): item is ApiRecord => typeof item === 'object' && item !== null,
  );
  const parts = pickArray(project, ['parts', 'part_tracking']).filter(
    (item): item is ApiRecord => typeof item === 'object' && item !== null,
  );
  const archives = (archivesQuery.data ?? []) as ApiRecord[];
  const status = pickString(project, ['status', 'state'], 'Active');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={projectQuery.isRefetching || archivesQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <SectionCard
        title={pickString(project, ['name'], 'Unnamed project')}
        subtitle={pickString(
          project,
          ['url', 'repository_url'],
          'No project URL',
        )}
        right={
          <StatusBadge label={status} color={statusColor(status, colors)} />
        }
      >
        <KeyValueRow
          label="Badge color"
          value={pickString(project, ['badge_color', 'color'], 'Default')}
        />
        <KeyValueRow
          label="Description"
          value={pickString(project, ['description'], 'No description')}
        />
      </SectionCard>

      <SectionCard title="Plates" subtitle="Archives linked to this project.">
        {archives.length > 0 ? (
          archives.map(archive => (
            <View
              key={pickId(archive)}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {pickString(archive, ['name', 'file_name'], 'Archive')}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {pickString(
                  archive,
                  ['printer_name', 'printer'],
                  'Unknown printer',
                )}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            No linked archives yet.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Parts Tracking">
        {parts.length > 0 ? (
          parts.map((part, index) => (
            <View
              key={`${pickId(part)}-${index}`}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {pickString(part, ['name'], `Part ${index + 1}`)}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {pickString(
                  part,
                  ['status', 'quantity', 'note'],
                  'No part metadata',
                )}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            No part tracking data available.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Linked Files from Library">
        {linkedFiles.length > 0 ? (
          linkedFiles.map(file => (
            <View
              key={pickId(file)}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {pickString(file, ['name'], 'Library File')}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {pickString(file, ['path', 'description'], 'No file metadata')}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            No library files have been linked to this project yet.
          </Text>
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
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  cardMeta: { fontSize: fontSize.sm },
});
