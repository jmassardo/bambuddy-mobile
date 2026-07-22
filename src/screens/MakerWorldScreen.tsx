import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState, ErrorState } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickArray, pickBoolean, pickNumber, pickRecord, pickString, statusColor, type ApiRecord } from '@/utils/data';

export default function MakerWorldScreen() {
  const navigation = useNavigation<RootNavigationProp<'MakerWorld'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'MakerWorld' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [resolved, setResolved] = useState<ApiRecord | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['makerworldStatus'],
    queryFn: () => api.getMakerworldStatus(),
  });
  const recentQuery = useQuery({
    queryKey: ['makerworldRecent'],
    queryFn: () => api.getMakerworldRecentImports(),
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveMakerworldUrl(url.trim()),
    onSuccess: data => {
      setResolved(data as ApiRecord);
      showToast('MakerWorld model resolved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to resolve this MakerWorld URL.', 'error'),
  });

  const importMutation = useMutation({
    mutationFn: (payload: { instanceId?: number; profileId?: number; plateIndex?: number }) =>
      api.importMakerworldPlate({
        url: url.trim(),
        instance_id: payload.instanceId,
        profile_id: payload.profileId,
        plate_index: payload.plateIndex,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['makerworldRecent'] });
      showToast('MakerWorld import started.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to import this plate.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([statusQuery.refetch(), recentQuery.refetch()]);
  };

  const design = useMemo(() => pickRecord(resolved, ['design']) ?? resolved, [resolved]);
  const creator = useMemo(() => pickRecord(design, ['designCreator', 'creator']), [design]);
  const instances = useMemo(() => pickArray(resolved, ['instances', 'plates']).filter((item): item is ApiRecord => typeof item === 'object' && item !== null), [resolved]);
  const galleryImages = useMemo(() => {
    const images = new Set<string>();
    const cover = pickString(design, ['coverUrl', 'cover', 'image']);
    if (cover) images.add(cover);
    instances.forEach(instance => {
      const coverUrl = pickString(instance, ['cover']);
      if (coverUrl) images.add(coverUrl);
      pickArray(instance, ['pictures']).forEach(picture => {
        const urlValue = pickString(picture, ['url']);
        if (urlValue) images.add(urlValue);
      });
    });
    return Array.from(images);
  }, [design, instances]);
  const recentImports = useMemo(() => ((recentQuery.data ?? []) as ApiRecord[]), [recentQuery.data]);

  if (statusQuery.isError || recentQuery.isError) {
    return <ErrorState message="Unable to load MakerWorld data." onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={statusQuery.isRefetching || recentQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      {!pickBoolean(statusQuery.data, ['has_cloud_token']) ? (
        <SectionCard title="Cloud sign-in required" subtitle="Browsing works anonymously, but imports require a cloud session.">
          <Text style={[styles.body, { color: colors.textSecondary }]}>Open Profiles to connect your Bambu Cloud account before importing MakerWorld models.</Text>
          <PrimaryButton label="Open Profiles" variant="secondary" onPress={() => navigation.navigate('Profiles')} />
        </SectionCard>
      ) : null}

      <SectionCard title="Resolve a MakerWorld URL" subtitle="Paste a model link to fetch plates, gallery images, and import options.">
        <TextField
          label="MakerWorld URL"
          value={url}
          onChangeText={setUrl}
          placeholder="https://makerworld.com/models/..."
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PrimaryButton
          label={resolveMutation.isPending ? 'Resolving…' : 'Resolve model'}
          onPress={() => void resolveMutation.mutateAsync()}
          disabled={!url.trim() || resolveMutation.isPending}
          loading={resolveMutation.isPending}
        />
      </SectionCard>

      {resolved ? (
        <SectionCard
          title={pickString(design, ['title', 'name'], 'MakerWorld model')}
          subtitle={creator ? `By ${pickString(creator, ['name'], 'Unknown creator')}` : 'Resolved model details'}
          right={
            <StatusBadge
              label={pickBoolean(statusQuery.data, ['can_download']) ? 'ready' : 'browse only'}
              color={statusColor(pickBoolean(statusQuery.data, ['can_download']) ? 'success' : 'warning', colors)}
            />
          }
        >
          {pickString(design, ['coverUrl', 'cover', 'image']) ? (
            <Image source={{ uri: pickString(design, ['coverUrl', 'cover', 'image']) }} style={styles.heroImage} />
          ) : null}
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {pickString(design, ['summary', 'description'], 'No description available.')}
          </Text>
          <View style={styles.metaWrap}>
            {pickNumber(design, ['downloadCount'], -1) >= 0 ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Downloads: {pickNumber(design, ['downloadCount'], 0)}</Text> : null}
            {pickString(design, ['license']) ? <Text style={[styles.meta, { color: colors.textSecondary }]}>License: {pickString(design, ['license'])}</Text> : null}
            {pickNumber(resolved, ['model_id'], -1) >= 0 ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Model ID: {pickNumber(resolved, ['model_id'], 0)}</Text> : null}
          </View>
        </SectionCard>
      ) : null}

      {galleryImages.length > 0 ? (
        <SectionCard title="Gallery" subtitle="Tap an image to view it full size.">
          <View style={styles.galleryWrap}>
            {galleryImages.map(image => (
              <Text key={image} onPress={() => setSelectedImage(image)}>
                <Image source={{ uri: image }} style={styles.galleryImage} />
              </Text>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {instances.length > 0 ? (
        <SectionCard title="Resolved plates" subtitle={`${instances.length} plate${instances.length === 1 ? '' : 's'} available to import.`}>
          {instances.map((instance, index) => {
            const instanceId = pickNumber(instance, ['id'], undefined as unknown as number);
            const profileId = pickNumber(instance, ['profileId'], undefined as unknown as number);
            const cover = pickString(instance, ['cover']);
            const title = pickString(instance, ['title'], `Plate ${index + 1}`);
            return (
              <View key={`${title}-${index}`} style={[styles.plateCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.plateHeader}>
                  {cover ? <Image source={{ uri: cover }} style={styles.plateImage} /> : null}
                  <View style={styles.plateText}>
                    <Text style={[styles.plateTitle, { color: colors.text }]}>{title}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>Material count: {pickNumber(instance, ['materialCnt'], 0)}</Text>
                    {pickBoolean(instance, ['needAms']) ? <Text style={[styles.meta, { color: colors.warning }]}>AMS required</Text> : null}
                    {pickString(instance, ['compatibility.devProductName']) ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Sliced for {pickString(instance, ['compatibility.devProductName'])}</Text> : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <PrimaryButton
                    label={importMutation.isPending ? 'Importing…' : 'Import'}
                    onPress={() => void importMutation.mutateAsync({ instanceId, profileId, plateIndex: index })}
                    disabled={!pickBoolean(statusQuery.data, ['can_download']) || importMutation.isPending}
                    loading={importMutation.isPending}
                  />
                </View>
              </View>
            );
          })}
        </SectionCard>
      ) : null}

      <SectionCard title="Recent imports" subtitle="Your latest MakerWorld imports from the server.">
        {recentImports.length > 0 ? (
          recentImports.map(item => (
            <View key={pickString(item, ['library_file_id', 'filename'])} style={[styles.importCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              {pickString(item, ['thumbnail_path']) ? <Image source={{ uri: pickString(item, ['thumbnail_path']) }} style={styles.importImage} /> : null}
              <View style={styles.plateText}>
                <Text style={[styles.plateTitle, { color: colors.text }]}>{pickString(item, ['filename', 'name'], 'MakerWorld import')}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{pickString(item, ['source_url'], 'Imported from MakerWorld')}</Text>
                <Text style={[styles.meta, { color: colors.textTertiary }]}>{formatDateTime(pickString(item, ['created_at']))}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon="🌐" title="No recent imports" message="Imports started from this screen will appear here." />
        )}
      </SectionCard>

      <Modal visible={!!selectedImage} animationType="fade" transparent>
        <View style={[styles.lightbox, { backgroundColor: colors.overlay }]}> 
          <View style={styles.lightboxCard}>
            {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.lightboxImage} resizeMode="contain" /> : null}
            <PrimaryButton label="Close" variant="secondary" onPress={() => setSelectedImage(null)} />
          </View>
        </View>
      </Modal>
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
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.xl,
  },
  metaWrap: { gap: spacing.xs },
  meta: { fontSize: fontSize.sm },
  galleryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  galleryImage: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.lg,
  },
  plateCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  plateHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  plateImage: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
  },
  plateText: {
    flex: 1,
    gap: spacing.xs,
  },
  plateTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  importCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  importImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
  },
  lightbox: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  lightboxCard: {
    gap: spacing.lg,
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '70%',
  },
});
