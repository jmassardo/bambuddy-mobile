import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { SearchBar } from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { formatDate, pickId, pickString, type ApiRecord } from '@/utils/data';

export default function ArchivesScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Archives' });
  }, [navigation]);
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const archivesQuery = useQuery({
    queryKey: ['archives'],
    queryFn: () => api.getArchives({ limit: 100 }),
  });

  const archives = useMemo(
    () => (archivesQuery.data ?? []) as ApiRecord[],
    [archivesQuery.data],
  );
  const filteredArchives = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return archives;
    return archives.filter(archive => {
      const haystack = [
        pickString(archive, ['name', 'file_name']),
        pickString(archive, ['printer_name', 'printer']),
        pickString(archive, ['tags_text']),
        pickString(archive, ['tag_names']),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [archives, search]);

  if (archivesQuery.isLoading) {
    return <LoadingScreen message="Loading archives…" />;
  }

  if (archivesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load archive history."
        onRetry={() => void archivesQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredArchives}
        keyExtractor={item => pickId(item)}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={archivesQuery.isRefetching}
            onRefresh={() => void archivesQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search archives"
          />
        }
        renderItem={({ item }) => {
          const archiveId = Number(pickId(item));
          const tags = pickString(item, ['tags_text', 'tag_names'], '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
            .slice(0, 3);

          return (
            <Pressable
              onPress={() =>
                navigation.navigate('ArchiveDetail', { id: String(archiveId) })
              }
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Image
                source={{ uri: api.getArchiveThumbnail(archiveId) }}
                style={styles.thumbnail}
              />
              <View style={styles.cardContent}>
                <Text
                  style={[styles.name, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {pickString(item, ['name', 'file_name'], 'Untitled archive')}
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  Printed on{' '}
                  {formatDate(pickString(item, ['completed_at', 'created_at']))}
                </Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {pickString(
                    item,
                    ['printer_name', 'printer'],
                    'Unknown printer',
                  )}
                </Text>
                <View style={styles.tagsRow}>
                  {tags.length > 0 ? (
                    tags.map(tag => (
                      <View
                        key={tag}
                        style={[
                          styles.tag,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {tag}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.meta, { color: colors.textTertiary }]}>
                      No tags
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="📦"
            title="No archives found"
            message="Completed prints will appear here once they are archived."
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
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  thumbnail: {
    width: 110,
    height: 110,
    backgroundColor: '#1f2937',
  },
  cardContent: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    fontSize: fontSize.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.xs,
  },
});
