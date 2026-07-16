import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { SearchBar, StatusBadge } from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import {
  formatDate,
  pickId,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

export default function ProjectsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Projects' });
  }, [navigation]);
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  const projects = useMemo(
    () => (projectsQuery.data ?? []) as ApiRecord[],
    [projectsQuery.data],
  );
  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(project => {
      const haystack = [
        pickString(project, ['name']),
        pickString(project, ['url', 'repository_url']),
        pickString(project, ['description']),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [projects, search]);

  if (projectsQuery.isLoading) {
    return <LoadingScreen message="Loading projects…" />;
  }

  if (projectsQuery.isError) {
    return (
      <ErrorState
        message="Could not load projects."
        onRetry={() => void projectsQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredProjects}
        keyExtractor={item => pickId(item)}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={projectsQuery.isRefetching}
            onRefresh={() => void projectsQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search projects"
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const badgeColor = statusColor(
            pickString(item, ['status', 'state'], 'active'),
            colors,
          );
          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleBlock}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {pickString(item, ['name'], 'Unnamed project')}
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {pickString(
                      item,
                      ['url', 'repository_url'],
                      'No linked URL',
                    )}
                  </Text>
                </View>
                <StatusBadge
                  label={pickString(item, ['status', 'state'], 'Active')}
                  color={badgeColor}
                />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                Updated{' '}
                {formatDate(pickString(item, ['updated_at', 'modified_at']))}
              </Text>
              <Text
                onPress={() =>
                  navigation.navigate('ProjectDetail', {
                    id: String(pickId(item)),
                  })
                }
                style={[styles.link, { color: colors.accentLight }]}
              >
                Open project
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="📁"
            title="No projects found"
            message="Try a different search or create a project from the server."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.md },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleBlock: { flex: 1, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  cardSubtitle: { fontSize: fontSize.sm },
  cardMeta: { fontSize: fontSize.sm },
  link: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
