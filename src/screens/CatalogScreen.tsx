import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download, Heart, Search, X } from 'lucide-react-native';
import {
  CATALOG_PAGE_SIZE,
  formatCount,
  makerworldCatalogApi,
  type CatalogFeed,
  type CatalogHit,
} from '@/api/makerworldCatalog';
import { PrimaryButton } from '@/components/common/AppUI';
import type { RootStackParamList } from '@/navigation/types';
import { useMakerworldFavorites } from '@/store/makerworldFavoritesStore';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { useCatalogStrings } from './makerworldCatalogStrings';

type Feed = CatalogFeed | 'favorites';
const FEEDS: Feed[] = ['trending', 'popular', 'top', 'newest', 'favorites'];
const DEFAULT_HEADER_HEIGHT = 112;

export default function CatalogScreen() {
  const s = useCatalogStrings();
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<CatalogHit>>(null);
  const [feed, setFeed] = useState<Feed>('trending');
  const [input, setInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT);

  const favorites = useMakerworldFavorites(state => state.items);
  const loadFavorites = useMakerworldFavorites(state => state.load);
  useEffect(() => { void loadFavorites(); }, [loadFavorites]);

  // Debounce typing.
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(input.trim()), 450);
    return () => clearTimeout(timer);
  }, [input]);

  // Search + chips slide away while scrolling down and come back as soon as the user scrolls up.
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslate = useMemo(() => {
    const positive = scrollY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' });
    return Animated.diffClamp(positive, 0, headerHeight).interpolate({
      inputRange: [0, headerHeight],
      outputRange: [0, -headerHeight],
      extrapolate: 'clamp',
    });
  }, [scrollY, headerHeight]);
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
    [scrollY],
  );

  const feedLabels: Record<Feed, string> = {
    trending: s.feedTrending, popular: s.feedPopular, top: s.feedTop, newest: s.feedNewest, favorites: s.feedFavorites,
  };
  const remoteFeed: CatalogFeed = feed === 'favorites' ? 'trending' : feed;

  const query = useInfiniteQuery({
    queryKey: ['makerworldCatalog', remoteFeed, keyword],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => makerworldCatalogApi.page(remoteFeed, keyword, pageParam, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * CATALOG_PAGE_SIZE;
      return last.hits.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled: feed !== 'favorites',
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(() => {
    if (feed === 'favorites') {
      const needle = keyword.toLowerCase();
      return needle
        ? favorites.filter(item => item.title.toLowerCase().includes(needle) || item.designCreator?.name?.toLowerCase().includes(needle))
        : favorites;
    }
    const seen = new Set<number>();
    return (query.data?.pages ?? []).flatMap(page => page.hits).filter(hit => {
      if (seen.has(hit.id)) return false;
      seen.add(hit.id);
      return true;
    });
  }, [feed, favorites, keyword, query.data]);

  const selectFeed = (next: Feed) => {
    setFeed(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const gap = spacing.md;
  const cardWidth = (width - spacing.lg * 2 - gap) / 2;
  const favoriteIds = useMemo(() => new Set(favorites.map(item => item.id)), [favorites]);

  const renderItem = ({ item }: { item: CatalogHit }) => (
    <Pressable
      onPress={() => navigation.navigate('MakerWorldModel', { id: item.id, title: item.title })}
      style={({ pressed }) => [styles.card, { width: cardWidth, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Image source={{ uri: item.cover }} style={{ width: cardWidth, height: cardWidth, backgroundColor: colors.surfaceElevated }} />
      {favoriteIds.has(item.id) ? (
        <View style={styles.favoriteBadge}>
          <Heart size={14} color="#fff" fill="#ff4d5e" />
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
        <View style={styles.authorRow}>
          {item.designCreator?.avatar ? <Image source={{ uri: item.designCreator.avatar }} style={styles.avatar} /> : null}
          <Text style={[styles.meta, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>{item.designCreator?.name ?? ''}</Text>
        </View>
        <View style={styles.statsRow}>
          <Download size={13} color={colors.textTertiary} />
          <Text style={[styles.meta, { color: colors.textTertiary }]}>{formatCount(item.downloadCount)}</Text>
          <Heart size={13} color={colors.textTertiary} />
          <Text style={[styles.meta, { color: colors.textTertiary }]}>{formatCount(item.likeCount)}</Text>
        </View>
      </View>
    </Pressable>
  );

  const empty = feed === 'favorites' ? (
    <View style={styles.state}>
      <Heart size={32} color={colors.textTertiary} />
      <Text style={[styles.stateTitle, { color: colors.text }]}>{keyword ? s.nothingFound : s.noFavorites}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{keyword ? s.nothingFoundHint : s.noFavoritesHint}</Text>
    </View>
  ) : query.isPending ? (
    <ActivityIndicator style={styles.state} color={colors.accent} />
  ) : query.isError ? (
    <View style={styles.state}>
      <Text style={[styles.stateTitle, { color: colors.text }]}>{s.loadFailed}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{query.error.message}</Text>
      <PrimaryButton label={s.retry} variant="secondary" onPress={() => void query.refetch()} />
    </View>
  ) : (
    <View style={styles.state}>
      <Text style={[styles.stateTitle, { color: colors.text }]}>{s.nothingFound}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{s.nothingFoundHint}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.sm }]}
        scrollIndicatorInsets={{ top: headerHeight }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (feed !== 'favorites' && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
        refreshControl={feed === 'favorites' ? undefined : (
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={colors.accent}
            progressViewOffset={headerHeight}
          />
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : null}
      />

      <Animated.View
        onLayout={event => {
          const next = Math.round(event.nativeEvent.layout.height);
          if (next > 0 && next !== headerHeight) setHeaderHeight(next);
        }}
        style={[styles.header, { backgroundColor: colors.background, transform: [{ translateY: headerTranslate }] }]}
      >
        <View style={[styles.search, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={s.searchPlaceholder}
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setKeyword(input.trim())}
          />
          {input ? (
            <Pressable hitSlop={8} onPress={() => { setInput(''); setKeyword(''); }}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FEEDS.map(item => {
            const active = item === feed;
            return (
              <Pressable
                key={item}
                onPress={() => selectFeed(item)}
                style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceElevated, borderColor: active ? colors.accent : colors.border }]}
              >
                {item === 'favorites' ? <Heart size={14} color={active ? '#fff' : colors.text} fill={active ? '#fff' : 'transparent'} /> : null}
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                  {feedLabels[item]}{item === 'favorites' && favorites.length ? ` · ${favorites.length}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.md },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, paddingVertical: 0 },
  chips: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: borderRadius.lg, overflow: 'hidden' },
  favoriteBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    padding: 5,
  },
  cardBody: { padding: spacing.sm, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, minHeight: 36 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: { width: 16, height: 16, borderRadius: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: fontSize.xs ?? 12 },
  state: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing['3xl'] },
  stateTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  footer: { paddingVertical: spacing.lg },
});
