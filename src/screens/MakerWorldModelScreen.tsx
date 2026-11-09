import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Heart, Printer } from 'lucide-react-native';
import { useToast } from '@/contexts/ToastContext';
import { useMakerworldFavorites } from '@/store/makerworldFavoritesStore';
import {
  compatiblePrinters,
  formatCount,
  formatDuration,
  htmlToText,
  makerworldCatalogApi,
  modelWebUrl,
  type CatalogInstance,
} from '@/api/makerworldCatalog';
import { PrimaryButton } from '@/components/common/AppUI';
import { OneTapPrintPanel } from '@/components/makerworld/OneTapPrintPanel';
import type { RootNavigationProp, RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { fill, useCatalogStrings } from './makerworldCatalogStrings';

export default function MakerWorldModelScreen() {
  const s = useCatalogStrings();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<RootNavigationProp<'MakerWorldModel'>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'MakerWorldModel'>>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const { showToast } = useToast();
  const loadFavorites = useMakerworldFavorites(state => state.load);
  const toggleFavorite = useMakerworldFavorites(state => state.toggle);
  const favorite = useMakerworldFavorites(state => state.items.some(item => item.id === params.id));
  useEffect(() => { void loadFavorites(); }, [loadFavorites]);

  const query = useQuery({
    queryKey: ['makerworldDesign', params.id],
    queryFn: ({ signal }) => makerworldCatalogApi.design(params.id, signal),
    staleTime: 5 * 60 * 1000,
  });
  const design = query.data;

  const instances = useMemo(() => design?.instances ?? [], [design]);
  useEffect(() => {
    if (!instances.length || instances.some(item => item.id === selectedId)) return;
    const preferred = instances.find(item => item.id === design?.defaultInstanceId)
      ?? instances.find(item => item.isDefault)
      ?? instances[0];
    setSelectedId(preferred.id);
  }, [instances, selectedId, design?.defaultInstanceId]);
  const selected = instances.find(item => item.id === selectedId) ?? null;

  const gallery = useMemo(() => {
    const urls = new Set<string>();
    if (design?.coverUrl) urls.add(design.coverUrl);
    (design?.designExtension?.design_pictures ?? []).forEach(picture => picture?.url && urls.add(picture.url));
    return Array.from(urls).slice(0, 12);
  }, [design]);

  const onToggleFavorite = React.useCallback(async () => {
    if (!design) return;
    const added = await toggleFavorite({
      id: design.id,
      title: design.title,
      cover: design.coverUrl ?? gallery[0] ?? '',
      likeCount: design.likeCount,
      downloadCount: design.downloadCount,
      printCount: design.printCount,
      designCreator: design.designCreator,
    });
    showToast(added ? s.addedFavorite : s.removedFavorite, 'success');
  }, [design, gallery, toggleFavorite, showToast, s.addedFavorite, s.removedFavorite]);

  useEffect(() => {
    navigation.setOptions({
      title: params.title ?? s.title,
      headerRight: () => (
        <Pressable
          onPress={() => void onToggleFavorite()}
          disabled={!design}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={favorite ? s.inFavorites : s.addFavorite}
        >
          <Heart size={22} color={favorite ? colors.error : colors.text} fill={favorite ? colors.error : 'transparent'} />
        </Pressable>
      ),
    });
  }, [navigation, params.title, s.title, s.inFavorites, s.addFavorite, favorite, design, onToggleFavorite, colors.error, colors.text]);

  const description = htmlToText(design?.summary);
  const units = { h: s.hoursShort, m: s.minutesShort };

  if (query.isPending) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }
  if (query.isError || !design) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{s.loadFailed}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{query.error?.message}</Text>
        <PrimaryButton label={s.retry} variant="secondary" onPress={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {gallery.map(url => (
            <Image key={url} source={{ uri: url }} style={{ width, height: width * 0.8, backgroundColor: colors.surfaceElevated }} resizeMode="cover" />
          ))}
        </ScrollView>
        {gallery.length > 1 ? (
          <View style={styles.dots}>
            {gallery.map((url, index) => (
              <View key={url} style={[styles.dot, { backgroundColor: index === page ? colors.accent : colors.border }]} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.title, { color: colors.text }]}>{design.title}</Text>
          <View style={styles.row}>
            {design.designCreator?.avatar ? <Image source={{ uri: design.designCreator.avatar }} style={styles.avatar} /> : null}
            <Text style={[styles.meta, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>
              {fill(s.by, { name: design.designCreator?.name ?? '—' })}
            </Text>
          </View>
          <View style={styles.row}>
            <Stat icon={<Download size={14} color={colors.textSecondary} />} value={formatCount(design.downloadCount)} />
            <Stat icon={<Printer size={14} color={colors.textSecondary} />} value={formatCount(design.printCount)} />
            <Stat icon={<Heart size={14} color={colors.textSecondary} />} value={formatCount(design.likeCount)} />
          </View>
          <Pressable
            onPress={() => void onToggleFavorite()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.favorite, {
              borderColor: favorite ? colors.error : colors.border,
              backgroundColor: favorite ? colors.surfaceElevated : 'transparent',
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Heart size={18} color={favorite ? colors.error : colors.text} fill={favorite ? colors.error : 'transparent'} />
            <Text style={[styles.favoriteText, { color: favorite ? colors.error : colors.text }]}>
              {favorite ? s.inFavorites : s.addFavorite}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {s.profiles} <Text style={[styles.meta, { color: colors.textSecondary }]}>{`· ${instances.length}`}</Text>
          </Text>
          {instances.length === 0 ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{s.noProfiles}</Text> : null}
          {instances.map(instance => (
            <ProfileRow
              key={instance.id}
              instance={instance}
              selected={instance.id === selectedId}
              onPress={() => setSelectedId(instance.id)}
              units={units}
              grams={s.grams}
              amsLabel={s.needAms}
            />
          ))}
          {selected && compatiblePrinters(selected).length ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {`${s.printers}: ${compatiblePrinters(selected).join(', ')}`}
            </Text>
          ) : null}
        </View>

        {description ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{s.description}</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={expanded ? undefined : 6}>{description}</Text>
            <Pressable onPress={() => setExpanded(value => !value)} hitSlop={8}>
              <Text style={[styles.meta, { color: colors.accent }]}>{expanded ? s.showLess : s.showMore}</Text>
            </Pressable>
          </View>
        ) : null}

        {design.tags?.length ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{s.tags}</Text>
            <View style={styles.tags}>
              {design.tags.slice(0, 20).map(tag => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceElevated }]}>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{`#${tag}`}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          {design.license ? <Text style={[styles.meta, { color: colors.textTertiary }]}>{`${s.license}: ${design.license}`}</Text> : null}
          <Pressable style={styles.row} onPress={() => void Linking.openURL(modelWebUrl(design.id, selectedId)).catch(() => {})}>
            <ExternalLink size={14} color={colors.accent} />
            <Text style={[styles.meta, { color: colors.accent }]}>{s.openOnSite}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <OneTapPrintPanel modelId={design.id} instance={selected} />
    </View>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      {icon}
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

function ProfileRow({ instance, selected, onPress, units, grams, amsLabel }: {
  instance: CatalogInstance;
  selected: boolean;
  onPress: () => void;
  units: { h: string; m: string };
  grams: string;
  amsLabel: string;
}) {
  const { colors } = useTheme();
  const duration = formatDuration(instance.prediction, units);
  const filaments = instance.instanceFilaments ?? [];
  const details = [
    duration,
    instance.weight ? `${instance.weight} ${grams}` : null,
    filaments.length ? Array.from(new Set(filaments.map(item => item.type).filter(Boolean))).join(' + ') : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={[styles.profile, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.surfaceElevated : colors.surface }]}
    >
      {instance.cover ? <Image source={{ uri: instance.cover }} style={[styles.profileImage, { backgroundColor: colors.surfaceElevated }]} /> : null}
      <View style={[styles.flex, styles.profileText]}>
        <Text style={[styles.profileTitle, { color: colors.text }]} numberOfLines={2}>{instance.title}</Text>
        {details ? <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{details}</Text> : null}
        <View style={styles.row}>
          {filaments.slice(0, 8).map((item, index) => (
            <View key={`${item.color}-${index}`} style={[styles.swatch, { backgroundColor: item.color || colors.border, borderColor: colors.border }]} />
          ))}
          {instance.needAms ? (
            <View style={[styles.badge, { borderColor: colors.warning }]}>
              <Text style={[styles.badgeText, { color: colors.warning }]}>{amsLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.xl ?? 22, fontWeight: fontWeight.bold ?? '700' },
  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  avatar: { width: 22, height: 22, borderRadius: 11 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: spacing.sm },
  meta: { fontSize: fontSize.sm },
  body: { fontSize: fontSize.sm, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.sm },
  profileImage: { width: 64, height: 64, borderRadius: borderRadius.md },
  profileText: { gap: 4 },
  profileTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4 },
  badgeText: { fontSize: 10, fontWeight: fontWeight.semibold },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  favorite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 999, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignSelf: 'flex-start' },
  favoriteText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
