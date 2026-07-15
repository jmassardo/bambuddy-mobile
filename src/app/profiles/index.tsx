import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { InlineTabBar, StatusBadge } from '../../components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import { pickArray, pickId, pickRecordArray, pickString, statusColor, type ApiRecord } from '../../utils/data';

type ProfileTab = 'cloud' | 'orca' | 'local' | 'kprofiles';

function normalizeProfiles(source: unknown): ApiRecord[] {
  if (Array.isArray(source)) return source.filter((item): item is ApiRecord => typeof item === 'object' && item !== null);
  return pickRecordArray(source, ['profiles', 'items', 'results']);
}

export default function ProfilesScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<ProfileTab>('cloud');

  const cloudQuery = useQuery({ queryKey: ['cloudProfiles'], queryFn: () => api.getCloudProfiles() });
  const orcaQuery = useQuery({ queryKey: ['orcaCloudProfiles'], queryFn: () => api.getOrcaCloudProfiles() });
  const localQuery = useQuery({ queryKey: ['localPresets'], queryFn: () => api.getLocalPresets() });
  const kprofilesQuery = useQuery({ queryKey: ['kProfiles'], queryFn: () => api.getKProfiles() });

  const activeQuery = tab === 'cloud' ? cloudQuery : tab === 'orca' ? orcaQuery : tab === 'local' ? localQuery : kprofilesQuery;
  const profiles = useMemo(() => normalizeProfiles(activeQuery.data), [activeQuery.data]);

  if (cloudQuery.isLoading && orcaQuery.isLoading && localQuery.isLoading && kprofilesQuery.isLoading) {
    return <LoadingScreen message="Loading profiles…" />;
  }

  if (activeQuery.isError && profiles.length === 0) {
    return <ErrorState message="Unable to load profiles." onRetry={() => void activeQuery.refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={profiles}
        keyExtractor={(item) => `${tab}-${pickId(item)}`}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => void activeQuery.refetch()} tintColor={colors.accent} />}
        ListHeaderComponent={<InlineTabBar value={tab} tabs={[{ key: 'cloud', label: 'Cloud' }, { key: 'orca', label: 'Orca' }, { key: 'local', label: 'Local' }, { key: 'kprofiles', label: 'K-Profiles' }]} onChange={setTab} />}
        renderItem={({ item }) => {
          const state = pickString(item, ['status', 'source'], tab);
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <View style={styles.header}>
                <View style={styles.textBlock}>
                  <Text style={[styles.title, { color: colors.text }]}>{pickString(item, ['name', 'profile_name'], 'Unnamed profile')}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{pickString(item, ['printer_model', 'material', 'type'], 'No details available')}</Text>
                </View>
                <StatusBadge label={state} color={statusColor(state, colors)} />
              </View>
              <Text style={[styles.meta, { color: colors.textTertiary }]}>{pickString(item, ['description', 'path', 'source'], 'Profile metadata will appear here.')}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="🗂" title="No profiles found" message="Switch tabs to review profiles from a different source." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  separator: { height: spacing.md },
  card: { borderWidth: 1, borderRadius: borderRadius.xl, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  textBlock: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.sm },
});
