import React, { useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Image,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { makerworldApi } from '@/api/makerworld';
import { SliceModal } from '@/components/files/SliceModal';
import { MakerworldDestinationPicker } from '@/components/projects/MakerworldDestinationPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { makerworldImportRequest } from '@/utils/makerworld';
import { openLibrary } from '@/utils/libraryNavigation';
import type { MakerworldImportRequest, MakerworldImportResponse } from '@/types/api';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState, ErrorState } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickArray, pickBoolean, pickNumber, pickRecord, pickString, statusColor, type ApiRecord } from '@/utils/data';

type ImportResult = MakerworldImportResponse & { model_id: number; source_url: string };

export default function MakerWorldScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'MakerWorld'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'MakerWorld' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [resolved, setResolved] = useState<ApiRecord | null>(null);
  const [resolvedForUrl, setResolvedForUrl] = useState('');
  const currentInput = useRef({ url: '', revision: 0 });
  const busy = useRef(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [sliceFile, setSliceFile] = useState<{ id: number; name: string } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
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
    mutationFn: (input: { url: string; revision: number }) => api.resolveMakerworldUrl(input.url),
    onSuccess: (data, input) => {
      if (currentInput.current.revision !== input.revision || currentInput.current.url !== input.url) return;
      setResolved(data as ApiRecord);
      setResolvedForUrl(input.url);
      showToast('MakerWorld model resolved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to resolve this MakerWorld URL.', 'error'),
  });

  const importMutation = useMutation({
    mutationFn: async ({ requests, slice }: { requests: MakerworldImportRequest[]; slice: boolean }) => {
      setImportErrors([]);
      setBulkProgress({ current: 0, total: requests.length });
      const failures: string[] = [];
      try {
        for (let index = 0; index < requests.length; index += 1) {
          const request = requests[index];
          try {
            const result = await makerworldApi.importInstance(request);
            const profileId = result.profile_id ?? request.profile_id;
            const source_url = `https://makerworld.com/models/${request.model_id}${profileId !== null ? `#profileId-${profileId}` : ''}`;
            setResults(previous => [
              ...previous.filter(item => item.library_file_id !== result.library_file_id),
              { ...result, model_id: request.model_id, source_url },
            ]);
            if (slice) setSliceFile({ id: result.library_file_id, name: result.filename });
          } catch (error) {
            failures.push(t('makerworld.profileError', { defaultValue: 'Profile {{profile}}: {{error}}', profile: request.profile_id ?? request.instance_id ?? index + 1, error: error instanceof Error ? error.message : t('makerworld.importFailed', { defaultValue: 'Import failed.' }) }));
            setImportErrors([...failures]);
          }
          setBulkProgress({ current: index + 1, total: requests.length });
        }
        return { total: requests.length, failed: failures.length };
      } finally {
        busy.current = false;
        setBulkProgress(null);
      }
    },
    onSuccess: outcome => {
      showToast(t('makerworld.importSummary', { defaultValue: '{{success}} imported · {{failed}} failed', success: outcome.total - outcome.failed, failed: outcome.failed }), outcome.failed ? 'error' : 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to import this plate.', 'error'),
    onSettled: async () => {
      await Promise.all(['makerworldRecent', 'libraryFiles', 'libraryFolders', 'libraryStats'].map(key =>
        queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => makerworldApi.deleteImport(fileId),
    onSuccess: async (_, fileId) => {
      setResults(previous => previous.filter(item => item.library_file_id !== fileId));
      await Promise.all(['makerworldRecent', 'libraryFiles', 'libraryFolders', 'libraryStats'].map(key =>
        queryClient.invalidateQueries({ queryKey: [key] })));
      showToast(t('makerworld.deleted', { defaultValue: 'Imported file moved to trash.' }), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
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
  const canImport = hasPermission('makerworld:import') && pickBoolean(statusQuery.data, ['can_download']);
  const importInstances = (items: ApiRecord[], slice = false) => {
    if (busy.current || importMutation.isPending || deleteMutation.isPending) return;
    try {
      const requests = items.map(instance => makerworldImportRequest(resolved, resolvedForUrl, currentInput.current.url, instance, folderId));
      if (requests.length) {
        busy.current = true;
        importMutation.mutate({ requests, slice });
      }
    } catch {
      showToast(t('makerworld.resolveFirst', { defaultValue: 'Resolve the current MakerWorld URL before importing.' }), 'error');
    }
  };
  const resultActions = (item: ApiRecord | ImportResult) => {
    const fileId = pickNumber(item, ['library_file_id']);
    const name = pickString(item, ['filename']);
    const source = pickString(item, ['source_url']);
    return <View style={styles.actions}>
      {hasPermission('library:read') || hasPermission('library:read_own') || hasPermission('library:read_all') ? <PrimaryButton
        label={t('makerworld.viewLibrary', { defaultValue: 'View in Library' })} variant="secondary"
        onPress={() => openLibrary(navigation, { fileId, folderId: item.folder_id == null ? undefined : Number(item.folder_id) })} /> : null}
      {hasPermission('library:upload') ? <PrimaryButton label={t('makerworld.slice', { defaultValue: 'Slice' })} variant="secondary" onPress={() => setSliceFile({ id: fileId, name })} /> : null}
      {/^https?:\/\//i.test(source) ? <PrimaryButton label={t('makerworld.source', { defaultValue: 'Open source' })} variant="secondary" onPress={() => void Linking.openURL(source).catch(error => showToast(String(error), 'error'))} /> : null}
      {hasPermission('library:delete_own') || hasPermission('library:delete_all') ? <PrimaryButton
        label={t('makerworld.undo', { defaultValue: 'Undo / delete import' })} variant="danger" disabled={deleteMutation.isPending || importMutation.isPending}
        onPress={() => Alert.alert(t('makerworld.deleteTitle', { defaultValue: 'Delete imported file?' }), t('makerworld.deleteConfirm', { defaultValue: 'Move “{{name}}” to trash? This removes the library file, including an already-existing import.', name }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate(fileId) },
        ])} /> : null}
    </View>;
  };

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
      {!pickBoolean(statusQuery.data, ['can_download']) ? (
        <SectionCard title={pickBoolean(statusQuery.data, ['sign_in_expired']) ? t('makerworld.expired', { defaultValue: 'Cloud sign-in expired' }) : t('makerworld.signIn', { defaultValue: 'Cloud sign-in required' })} subtitle="Browsing works anonymously, but imports require a cloud session.">
          <Text style={[styles.body, { color: colors.textSecondary }]}>Open Profiles to connect your Bambu Cloud account before importing MakerWorld models.</Text>
          <PrimaryButton label="Open Profiles" variant="secondary" onPress={() => navigation.navigate('Profiles')} />
        </SectionCard>
      ) : null}

      <SectionCard title="Resolve a MakerWorld URL" subtitle="Paste a model link to fetch plates, gallery images, and import options.">
        <TextField
          label="MakerWorld URL"
          value={url}
          onChangeText={value => {
            const trimmed = value.trim();
            if (trimmed !== currentInput.current.url) {
              currentInput.current = { url: trimmed, revision: currentInput.current.revision + 1 };
              setResolved(null);
              setResolvedForUrl('');
              setSelectedImage(null);
            }
            setUrl(value);
          }}
          placeholder="https://makerworld.com/models/..."
          autoCapitalize="none"
          autoCorrect={false}
          editable={!importMutation.isPending}
        />
        <PrimaryButton
          label={resolveMutation.isPending ? 'Resolving…' : 'Resolve model'}
          onPress={() => { setResolved(null); setResolvedForUrl(''); resolveMutation.mutate({ ...currentInput.current }); }}
          disabled={!url.trim() || resolveMutation.isPending || importMutation.isPending}
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
            {pickArray(resolved, ['already_imported_library_ids']).length > 0 ? <Text style={[styles.meta, { color: colors.success }]}>{t('makerworld.alreadyImported', { defaultValue: 'This model has already been imported into the Library.' })}</Text> : null}
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
          <MakerworldDestinationPicker value={folderId} onChange={setFolderId} disabled={importMutation.isPending} />
          <PrimaryButton label={bulkProgress ? t('makerworld.bulkProgress', { defaultValue: 'Importing {{current}} / {{total}}', ...bulkProgress }) : t('makerworld.importAll', { defaultValue: 'Import all / retry failed' })}
            disabled={!canImport || importMutation.isPending || deleteMutation.isPending}
            onPress={() => importInstances(instances.filter(instance => !results.some(result => result.model_id === pickNumber(resolved, ['model_id']) && result.profile_id === pickNumber(instance, ['profileId'], NaN))))} />
          {importErrors.map((error, index) => <Text key={index} style={[styles.meta, { color: colors.error }]}>{error}</Text>)}
          {instances.map((instance, index) => {
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
                    onPress={() => importInstances([instance])}
                    disabled={!canImport || importMutation.isPending || deleteMutation.isPending}
                    loading={importMutation.isPending}
                  />
                  {hasPermission('library:upload') ? <PrimaryButton label={t('makerworld.importSlice', { defaultValue: 'Import and slice' })} variant="secondary"
                    disabled={!canImport || importMutation.isPending || deleteMutation.isPending} onPress={() => importInstances([instance], true)} /> : null}
                </View>
              </View>
            );
          })}
        </SectionCard>
      ) : null}

      {results.length > 0 ? <SectionCard title={t('makerworld.results', { defaultValue: 'Import results' })}>
        {results.map(item => <View key={item.library_file_id} style={[styles.plateCard, { borderColor: colors.border }]}>
          <Text style={[styles.plateTitle, { color: colors.text }]}>{item.filename}</Text>
          <Text style={[styles.meta, { color: colors.success }]}>{item.was_existing ? t('makerworld.existing', { defaultValue: 'Already in Library — existing file reused' }) : t('makerworld.imported', { defaultValue: 'Imported successfully' })}</Text>
          {resultActions(item)}
        </View>)}
      </SectionCard> : null}

      <SectionCard title="Recent imports" subtitle="Your latest MakerWorld imports from the server.">
        {recentImports.length > 0 ? (
          recentImports.map(item => (
            <View key={pickString(item, ['library_file_id', 'filename'])} style={[styles.plateCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              {pickString(item, ['thumbnail_path']) ? <Image source={{ uri: api.getLibraryFileThumbnailUrl(pickNumber(item, ['library_file_id'])) }} style={styles.importImage} /> : null}
              <View style={styles.plateText}>
                <Text style={[styles.plateTitle, { color: colors.text }]}>{pickString(item, ['filename', 'name'], 'MakerWorld import')}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{pickString(item, ['source_url'], 'Imported from MakerWorld')}</Text>
                <Text style={[styles.meta, { color: colors.textTertiary }]}>{formatDateTime(pickString(item, ['created_at']))}</Text>
              </View>
              {resultActions(item)}
            </View>
          ))
        ) : (
          <EmptyState icon="🌐" title="No recent imports" message="Imports started from this screen will appear here." />
        )}
      </SectionCard>
      {sliceFile ? <SliceModal visible onClose={() => setSliceFile(null)} sourceType="file" sourceId={sliceFile.id} sourceName={sliceFile.name} /> : null}

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
