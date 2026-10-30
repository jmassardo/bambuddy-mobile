import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp, AppNavigationProp } from '@/navigation/types';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  Image as ImageIcon,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
} from 'react-native-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/api/server';
import { api } from '@/api/client';
import { useMediaToken } from '@/hooks/useStreamToken';
import { EditArchiveModal } from '@/components/archives/EditArchiveModal';
import { ArchiveDetailTools, EmbeddedArchiveProjectPage } from '@/components/archives/ArchiveDetailTools';
import { ConfirmOutcomeDialog, useArchiveAuthorization } from '@/components/archives/ArchiveWorkflowUI';
import { PrintModal } from '@/components/printers/PrintModal';
import { requestBlob } from '@/api/http';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { shareBlob } from '@/utils/share';

import { PrintLogModal } from '@/components/archives/PrintLogModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { SliceModal } from '@/components/files/SliceModal';
import { RunWithPipelineModal } from '@/components/slicing/RunWithPipelineModal';
import { AssetPreviewModal, type AssetPreviewSource } from '@/components/files/AssetPreviewModal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  KeyValueRow,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import type { Archive } from '@/types/api';
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
  pickString,
  type ApiRecord,
  withCacheBuster,
} from '@/utils/data';

type MediaWebViewProps = React.ComponentProps<typeof WebView> & {
  onError?: () => void;
  onHttpError?: () => void;
};

const MediaWebView = WebView as React.ComponentType<MediaWebViewProps>;

function assetToUpload(asset: Asset) {
  if (!asset.uri) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? `archive-photo-${Date.now()}.jpg`,
    type: asset.type ?? 'image/jpeg',
  };
}

export default function ArchiveDetailScreen() {
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'ArchiveDetail'>>();
  const rootNavigation = useNavigation<AppNavigationProp>();
  const route = useRoute<RootRouteProp<'ArchiveDetail'>>();
  const { id } = (route.params ?? {}) as { id: string };
  const archiveId = Number(id);
  const { colors } = useTheme();
  const serverUrl = useServerStore(state => state.serverUrl);
  const { token: mediaToken, isReady: mediaTokenReady } = useMediaToken();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [launchMode, setLaunchMode] = useState<'asap' | 'queue' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintLog, setShowPrintLog] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showProjectPageModal, setShowProjectPageModal] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState<string | null>(
    null,
  );
  const [showTimelapseFullscreen, setShowTimelapseFullscreen] = useState(false);
  const [assetPreview, setAssetPreview] = useState<AssetPreviewSource | null>(null);
  const [pipelineVisible, setPipelineVisible] = useState(false);
  const [timelapseError, setTimelapseError] = useState(false);
  const [timelapseRetrySeed, setTimelapseRetrySeed] = useState(0);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [thumbnailRetrySeed, setThumbnailRetrySeed] = useState(0);
  const [photoErrors, setPhotoErrors] = useState<Record<string, boolean>>({});
  const [photoRetrySeeds, setPhotoRetrySeeds] = useState<
    Record<string, number>
  >({});
  const [showSliceModal, setShowSliceModal] = useState(false);

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

  const archive = useLocalizedMemo(
    () => (archiveQuery.data as Archive | undefined) ?? null,
    [archiveQuery.data],
  );
  const authorization = useArchiveAuthorization(archive);

  const hasTimelapse = Boolean(
    archive?.timelapse_path ||
      pickString(archive as unknown as ApiRecord, ['timelapse_url']),
  );
  const isSoftDeleted = Boolean(
    pickString(archive as unknown as ApiRecord, ['deleted_at']) ||
      archive?.status === 'deleted',
  );
  const archiveUrl = serverUrl ? `${serverUrl}/api/v1/archives/${archiveId}/download` : null;
  const serverOrigin = useLocalizedMemo(() => {
    if (!serverUrl) return null;
    try {
      return new URL(serverUrl).origin;
    } catch {
      return null;
    }
  }, [serverUrl]);
  const timelapseUrl = useLocalizedMemo(() => {
    if (!hasTimelapse || !mediaTokenReady || !serverOrigin) return null;
    return withCacheBuster(
      api.getArchiveTimelapse(archiveId),
      `${mediaToken ?? 'public'}-${timelapseRetrySeed}`,
    );
  }, [
    archiveId,
    hasTimelapse,
    mediaToken,
    mediaTokenReady,
    serverOrigin,
    timelapseRetrySeed,
  ]);
  const thumbnailUrl = useLocalizedMemo(() => {
    if (!mediaTokenReady) return null;
    return withCacheBuster(
      api.getArchiveThumbnail(archiveId, archive?.plate_id),
      `${mediaToken ?? 'public'}-${thumbnailRetrySeed}`,
    );
  }, [
    archiveId,
    archive?.plate_id,
    mediaToken,
    mediaTokenReady,
    thumbnailRetrySeed,
  ]);
  React.useEffect(() => setThumbnailError(false), [thumbnailUrl]);
  React.useEffect(() => {
    setTimelapseError(false);
    setThumbnailError(false);
    setPhotoErrors({});
  }, [mediaToken, serverUrl]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: translateNative('screen.archive'),
      headerRight: archive
        ? () => (
            <Pressable
              onPress={() => setShowEditModal(true)}
              disabled={!authorization.update}
              style={styles.headerButton}
              hitSlop={8}
              accessibilityLabel={translateNative('native.22636471158cb125')}
              accessibilityRole="button"
            >
              <Pencil size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          )
        : undefined,
    });
  }, [archive, authorization.update, colors.text, navigation, titleLocale]);

  const invalidateArchiveQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['archives'] }),
      queryClient.invalidateQueries({ queryKey: ['archive', archiveId] }),
      queryClient.invalidateQueries({ queryKey: ['archiveRuns', archiveId] }),
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
    ]);
  };

  const restoreMutation = useMutation({
    mutationFn: () => api.restoreArchive(archiveId),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast(nativeMessage('native.94c4e38a30a38e9c'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.e6b3b6d22e1e5ef8'), 'error'),
  });
  const shareFileMutation = useMutation({
    mutationFn: async () => {
      if (archive) await shareBlob(await archiveWorkflows.download(archiveId), archive.filename);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      api.uploadArchivePhoto(archiveId, file),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast(nativeMessage('native.78fb6d80bb76df36'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.aeb62a0d1541f540'), 'error'),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (filename: string) =>
      api.deleteArchivePhoto(archiveId, filename),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      setPendingPhotoDelete(null);
      setFullscreenPhoto(null);
      showToast(nativeMessage('native.fe5b6b06f65e3dd4'), 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || nativeMessage('native.94df862b86b9fe1c'), 'error'),
  });

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    try {
      const result =
        source === 'camera'
          ? await launchCamera({
              mediaType: 'photo',
              cameraType: 'back',
              saveToPhotos: true,
            })
          : await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      const selectedAsset = result.assets?.[0];
      if (!selectedAsset) {
        showToast(nativeMessage('native.d6a3777d24ec7466'), 'warning');
        return;
      }
      const file = assetToUpload(selectedAsset);
      if (!file) {
        showToast(nativeMessage('native.d6a3777d24ec7466'), 'warning');
        return;
      }
      await uploadPhotoMutation.mutateAsync(file);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : nativeMessage('native.9a2c1d9d95dcd8a6'),
        'error',
      );
    }
  };

  const refreshAll = async () => {
    await Promise.all([archiveQuery.refetch(), runsQuery.refetch()]);
  };

  const retryTimelapse = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['camera-stream-token'],
    });
    setTimelapseError(false);
    setTimelapseRetrySeed(seed => seed + 1);
  };

  const retryThumbnail = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['camera-stream-token'],
    });
    setThumbnailError(false);
    setThumbnailRetrySeed(seed => seed + 1);
  };

  const retryPhoto = async (photo: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['camera-stream-token'],
    });
    setPhotoErrors(errors => ({ ...errors, [photo]: false }));
    setPhotoRetrySeeds(seeds => ({
      ...seeds,
      [photo]: (seeds[photo] ?? 0) + 1,
    }));
  };

  const getPhotoUrl = (photo: string) =>
    withCacheBuster(
      api.getArchivePhotoUrl(archiveId, photo),
      `${mediaToken ?? 'public'}-${photoRetrySeeds[photo] ?? 0}`,
    );

  if (archiveQuery.isLoading || runsQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.6d9b2ac3ef60a4d8')} />;
  }

  if (archiveQuery.isError || !archive) {
    return (
      <ErrorState
        message={translateNative('native.5ebe72a9d8745117')}
        onRetry={() => void refreshAll()}
      />
    );
  }

  const runs = Array.isArray(runsQuery.data)
    ? (runsQuery.data as ApiRecord[])
    : [];
  const photos = archive.photos ?? [];

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={archiveQuery.isRefetching || runsQuery.isRefetching}
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        <View
          style={[
            styles.thumbnail,
            { backgroundColor: colors.surfaceElevated },
          ]}
        >
          {!mediaTokenReady ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : thumbnailError ? (
            <View style={styles.mediaError}>
              <Text style={[styles.mediaErrorText, { color: colors.error }]}>
                {translateNative('native.6d1d2e689bf2287e')}</Text>
              <PrimaryButton
                label={translateNative('native.bb2f5c0814788a31')}
                variant="secondary"
                onPress={retryThumbnail}
              />
            </View>
          ) : thumbnailUrl ? (
            <Image
              testID="archive-thumbnail"
              source={{ uri: thumbnailUrl }}
              style={styles.mediaFill}
              onError={() => setThumbnailError(true)}
            />
          ) : null}
        </View>

        <SectionCard
          title={archive.print_name || archive.filename || translateNative('native.e857ce138ab32715')}
          subtitle={
            archive.printer_name ||
            pickString(
              archive as unknown as ApiRecord,
              ['printer_name', 'printer'],
              translateNative('native.d2f3cad436de827d'),
            )
          }
        >
          <KeyValueRow
            label={translateNative('native.0157f54b2e4d9f8e')}
            value={
              archive.tags ||
              pickString(
                archive as unknown as ApiRecord,
                ['tags_text', 'tag_names'],
                '—',
              ) ||
              '—'
            }
          />
          <KeyValueRow
            label={translateNative('common.date')}
            value={formatDateTime(archive.completed_at || archive.created_at)}
          />
          <KeyValueRow
            label={translateNative('native.e6b6cee2c436ee57')}
            value={formatDuration(
              archive.actual_time_seconds || archive.print_time_seconds,
            )}
          />
          <KeyValueRow
            label={translateNative('native.12e2b8020ce55e27')}
            value={formatWeight(archive.filament_used_grams)}
          />
          <KeyValueRow
            label={translateNative('common.cost')}
            value={formatCurrency(
              archive.cost ??
                pickString(archive as unknown as ApiRecord, ['estimated_cost']),
            )}
          />
        </SectionCard>

        <View style={styles.actionRow}>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.d67377e1385602fe')}
              onPress={() => setLaunchMode('asap')}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.700bca3c2a1baa38')}
              variant="secondary"
              onPress={() => setLaunchMode('queue')}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.a89901702a807e8f')}
              variant="secondary"
              onPress={() => rootNavigation.navigate('PrintLog', { archiveId })}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.a766fd8f2fb213f0')}
              variant="secondary"
              onPress={() => setShowQrModal(true)}
              disabled={!archiveUrl}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.4fedf24bfc44b6e2')}
              variant="secondary"
              onPress={() => setShowProjectPageModal(true)}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.c0158b3c3ccab862')}
              variant="secondary"
              onPress={() => shareFileMutation.mutate()}
              loading={shareFileMutation.isPending}
            />
          </View>
          {archive.source_3mf_path || archive.filename.toLowerCase().endsWith('.3mf') ? (
            <View style={styles.actionCell}>
              <PrimaryButton
                label={translateNative('screen.modelPreview')}
                variant="secondary"
                onPress={() => setAssetPreview({ archiveId, filename: archive.source_3mf_path?.split('/').pop() || archive.filename, mode: 'model', archiveSource: Boolean(archive.source_3mf_path) })}
              />
            </View>
          ) : null}
          <View style={styles.actionCell}>
            <PrimaryButton label={t('archives.toolpaths', { defaultValue: 'Inspect toolpaths' })} variant="secondary" onPress={() => setAssetPreview({ archiveId, filename: archive.filename, mode: 'gcode', archiveSource: false })} />
          </View>
          {hasPermission('pipelines:run') ? <View style={styles.actionCell}>
            <PrimaryButton label={t('archives.runPipeline', { defaultValue: 'Run with pipeline' })} variant="secondary" onPress={() => setPipelineVisible(true)} />
          </View> : null}
          <View style={styles.actionCell}>
            <PrimaryButton
              label={translateNative('native.8a8a9fc981cbae11')}
              variant="secondary"
              onPress={() => setShowSliceModal(true)}
            />
          </View>
          {isSoftDeleted ? (
            <View style={styles.actionCell}>
              <PrimaryButton
                label={translateNative('native.3d4ea31b4516a8ec')}
                onPress={() => void restoreMutation.mutateAsync()}
                loading={restoreMutation.isPending}
              />
            </View>
          ) : null}
        </View>

        {hasTimelapse ? (
          <SectionCard
            title={translateNative('native.190a6a4c52455a67')}
            subtitle={translateNative('native.cf1b0eca76d74888')}
          >
            <View style={[styles.webviewFrame, { borderColor: colors.border }]}>
              {!mediaTokenReady || !serverOrigin ? (
                <View style={styles.mediaLoading}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text
                    style={[
                      styles.helperText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {translateNative('native.fdbdaf4aee89138a')}</Text>
                </View>
              ) : timelapseError ? (
                <View style={styles.mediaError}>
                  <Text
                    style={[styles.mediaErrorText, { color: colors.error }]}
                  >
                    {translateNative('native.ff83912a2a298ed0')}</Text>
                  <PrimaryButton
                    label={translateNative('native.16b15d784580dbbf')}
                    variant="secondary"
                    onPress={retryTimelapse}
                  />
                </View>
              ) : timelapseUrl ? (
                <MediaWebView
                  key={timelapseUrl}
                  testID="archive-timelapse-webview"
                  source={{ uri: timelapseUrl }}
                  originWhitelist={[serverOrigin]}
                  javaScriptEnabled={false}
                  allowFileAccess={false}
                  setSupportMultipleWindows={false}
                  allowsInlineMediaPlayback
                  allowsFullscreenVideo
                  mediaPlaybackRequiresUserAction={false}
                  onError={() => setTimelapseError(true)}
                  onHttpError={() => setTimelapseError(true)}
                />
              ) : null}
            </View>
            <View style={styles.inlineActions}>
              <PrimaryButton
                label={translateNative('native.0881728142cb3ef5')}
                variant="secondary"
                onPress={() => navigation.navigate('TimelapseEditor', { archiveId })}
              />
              <PrimaryButton
                label={translateNative('native.d30264eabd2b8cfc')}
                variant="secondary"
                onPress={() => setShowTimelapseFullscreen(true)}
              />
            </View>
          </SectionCard>
        ) : null}

        <SectionCard
          title={translateNative('native.93b2f5af193d5b68')}
          subtitle={translateNative('native.afa5ec916b51ee1a')}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRail}
          >
            {photos.length === 0 ? (
              <Text style={[styles.note, { color: colors.textSecondary }]}>
                {translateNative('native.c8df2ef80e6a9e3b')}</Text>
            ) : null}
            {photos.map(photo => (
              <View key={photo} style={styles.photoCard}>
                {!mediaTokenReady ? (
                  <View
                    style={[
                      styles.photo,
                      styles.mediaLoading,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  >
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                ) : photoErrors[photo] ? (
                  <View
                    style={[
                      styles.photo,
                      styles.mediaError,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  >
                    <Text
                      style={[
                        styles.photoErrorText,
                        { color: colors.error },
                      ]}
                    >
                      {translateNative('native.dbf29b3fc8cd5022')}</Text>
                    <PrimaryButton
                      label={translateNative('native.197c35eec3734f81')}
                      variant="secondary"
                      onPress={() => retryPhoto(photo)}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => setFullscreenPhoto(photo)}>
                    <Image
                      key={getPhotoUrl(photo)}
                      testID={`archive-photo-${photo}`}
                      source={{ uri: getPhotoUrl(photo) }}
                      style={[
                        styles.photo,
                        { backgroundColor: colors.surfaceElevated },
                      ]}
                      onError={() =>
                        setPhotoErrors(errors => ({
                          ...errors,
                          [photo]: true,
                        }))
                      }
                    />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setPendingPhotoDelete(photo)}
                  accessibilityRole="button"
                  accessibilityLabel={translateNative('native.b6870532d6ae062d')}
                  hitSlop={10}
                  style={[
                    styles.photoDelete,
                    { backgroundColor: colors.error },
                  ]}
                >
                  <Trash2
                    size={14}
                    color={colors.textInverse}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => void pickPhoto('camera')}
              style={[
                styles.photoActionCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Camera size={18} color={colors.accent} strokeWidth={2} />
              <Text
                style={[
                  styles.photoActionText,
                  { color: colors.textSecondary },
                ]}
              >
                {translateNative('native.ac1081d67c0eb4a3')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickPhoto('gallery')}
              style={[
                styles.photoActionCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <ImageIcon size={18} color={colors.accent} strokeWidth={2} />
              <Text
                style={[
                  styles.photoActionText,
                  { color: colors.textSecondary },
                ]}
              >
                {translateNative('native.730291cdbc8cfb3e')}</Text>
            </Pressable>
          </ScrollView>
          {uploadPhotoMutation.isPending ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {translateNative('native.0367eca0e0cae237')}</Text>
          ) : null}
        </SectionCard>

        <ArchiveDetailTools archive={archive} onOutcome={() => setOutcomeVisible(true)} onProjectPage={() => setShowProjectPageModal(true)} onNavigate={(kind, targetId) => {
          if (kind === 'archive') navigation.push('ArchiveDetail', { id: String(targetId) });
          else if (kind === 'project') rootNavigation.navigate('ProjectDetail', { id: targetId });
          else rootNavigation.navigate('Main', { screen: 'Files', params: { folderId: targetId } } as never);
        }} />
        <SectionCard
          title={translateNative('native.e2784e99fa7fc986')}
          subtitle={translateNative('native.d6e9d4e02671ecab')}
        >
          {runs.length > 0 ? (
            runs.map(run => (
              <View
                key={String(run.id ?? `${run.started_at}-${run.status}`)}
                style={[
                  styles.runCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.runTitle, { color: colors.text }]}>
                  {pickString(run, ['status', 'result'], translateNative('native.4a960baaebf1ac5d'))}
                </Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}>
                  {formatDateTime(
                    pickString(run, ['started_at', 'created_at']),
                  )}
                </Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}>
                  {pickString(
                    run,
                    ['printer_name', 'printer'],
                    translateNative('native.d2f3cad436de827d'),
                  )}
                </Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}>{String(run.failure_reason ?? '—')} · {formatDuration(Number(run.duration_seconds ?? 0))} · {formatWeight(Number(run.filament_used_grams ?? 0))} · {run.cost == null ? '—' : formatCurrency(Number(run.cost))}</Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}>{run.energy_kwh == null ? '—' : translateNative('native.a550c7a04846ff65', { value0: String(run.energy_kwh) })} · {run.energy_cost == null ? '—' : formatCurrency(Number(run.energy_cost))}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              {translateNative('native.6d7e574ed507d21c')}</Text>
          )}
        </SectionCard>

        <SectionCard title={translateNative('native.ec849216c1a4f983')}>
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {archive.notes ||
              archive.failure_reason ||
              pickString(
                archive as unknown as ApiRecord,
                ['failure_analysis', 'comment'],
                translateNative('native.a9290c7c55e9f76b'),
              )}
          </Text>
        </SectionCard>
      </ScrollView>

      <EditArchiveModal
        visible={showEditModal}
        archive={archive}
        onClose={() => setShowEditModal(false)}
        onSaved={async () => {
          await invalidateArchiveQueries();
          setShowEditModal(false);
        }}
      />

      <PrintLogModal
        visible={showPrintLog}
        archiveId={archiveId}
        archiveName={archive.print_name || archive.filename}
        onClose={() => setShowPrintLog(false)}
      />

      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <SafeAreaProvider style={styles.container}>
        <SafeAreaView
          style={[styles.centeredBackdrop, { backgroundColor: colors.overlay }]}
        >
          <ScrollView
            contentContainerStyle={styles.qrContent}
            style={[
              styles.qrCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.qrTitle, { color: colors.text }]}>
              {translateNative('native.2a08a3acbf39fc98')}</Text>
            <Text style={[styles.qrSubtitle, { color: colors.textSecondary }]}>
              {translateNative('native.78a66132ba1325fa')}</Text>
            {archiveUrl ? (
              <View
                style={[styles.qrFrame, { backgroundColor: colors.surface }]}
              >
                <QRCode
                  value={archiveUrl}
                  size={220}
                  color={colors.text}
                  backgroundColor={colors.surface}
                />
              </View>
            ) : (
              <Text style={[styles.note, { color: colors.error }]}>
                {translateNative('native.bf753bc1ece3f56d')}</Text>
            )}
            {archiveUrl ? (
              <Text style={[styles.qrUrl, { color: colors.textSecondary }]}>
                {archiveUrl}
              </Text>
            ) : null}
            <PrimaryButton
              label={translateNative('common.close')}
              variant="secondary"
              onPress={() => setShowQrModal(false)}
            />
          </ScrollView>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {showProjectPageModal ? <EmbeddedArchiveProjectPage archive={archive} onClose={() => setShowProjectPageModal(false)} /> : null}
      {outcomeVisible ? <ConfirmOutcomeDialog archiveId={archiveId} onClose={() => setOutcomeVisible(false)} onReprint={() => setLaunchMode('asap')} /> : null}
      {launchMode ? <PrintModal visible onClose={() => setLaunchMode(null)} {...{ initialArchiveId: archiveId, initialMode: launchMode }} /> : null}
      {assetPreview ? <AssetPreviewModal source={assetPreview} onClose={() => setAssetPreview(null)} /> : null}
      {pipelineVisible ? <RunWithPipelineModal visible onClose={() => setPipelineVisible(false)} sourceType="archive" sourceId={archiveId} sourceName={archive.print_name || archive.filename} /> : null}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <SafeAreaProvider style={styles.container}>
        <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.fullscreenBackdrop,
            { backgroundColor: colors.overlay },
          ]}
        >
          <Pressable
            style={styles.fullscreenClose}
            onPress={() => setFullscreenPhoto(null)}
            accessibilityRole="button"
            accessibilityLabel={translateNative('common.close')}
          >
            <X size={20} color={colors.textInverse} strokeWidth={2} />
          </Pressable>
          {fullscreenPhoto ? (
            !mediaTokenReady ? (
              <View style={styles.mediaLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : photoErrors[fullscreenPhoto] ? (
              <View style={styles.mediaError}>
                <Text style={[styles.mediaErrorText, { color: colors.error }]}>
                  {translateNative('native.cda9e2407411650c')}</Text>
                <PrimaryButton
                  label={translateNative('native.197c35eec3734f81')}
                  variant="secondary"
                  onPress={() => retryPhoto(fullscreenPhoto)}
                />
              </View>
            ) : (
              <Image
                key={getPhotoUrl(fullscreenPhoto)}
                source={{ uri: getPhotoUrl(fullscreenPhoto) }}
                style={styles.fullscreenImage}
                resizeMode="contain"
                onError={() =>
                  setPhotoErrors(errors => ({
                    ...errors,
                    [fullscreenPhoto]: true,
                  }))
                }
              />
            )
          ) : null}
          {fullscreenPhoto ? (
            <View style={styles.fullscreenActions}>
              <PrimaryButton label={t('common.previous', { defaultValue: 'Previous photo' })} variant="secondary" disabled={(archive.photos?.indexOf(fullscreenPhoto) ?? 0) <= 0} onPress={() => { const index = archive.photos?.indexOf(fullscreenPhoto) ?? 0; setFullscreenPhoto(archive.photos?.[index - 1] ?? fullscreenPhoto); }} />
              <PrimaryButton label={t('common.next', { defaultValue: 'Next photo' })} variant="secondary" disabled={(archive.photos?.indexOf(fullscreenPhoto) ?? 0) >= (archive.photos?.length ?? 0) - 1} onPress={() => { const index = archive.photos?.indexOf(fullscreenPhoto) ?? 0; setFullscreenPhoto(archive.photos?.[index + 1] ?? fullscreenPhoto); }} />
              <PrimaryButton label={t('archives.saveShare', { defaultValue: 'Save / share photo' })} variant="secondary" onPress={() => { void requestBlob(`/archives/${archiveId}/photos/${encodeURIComponent(fullscreenPhoto)}`).then(blob => shareBlob(blob, fullscreenPhoto)).catch((error: Error) => showToast(error.message, 'error')); }} />
              <PrimaryButton
                label={translateNative('native.b6870532d6ae062d')}
                variant="danger"
                disabled={!authorization.update}
                onPress={() => setPendingPhotoDelete(fullscreenPhoto)}
              />
            </View>
          ) : null}
        </View>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <Modal
        visible={showTimelapseFullscreen}
        animationType="slide"
        onRequestClose={() => setShowTimelapseFullscreen(false)}
      >
        <SafeAreaProvider style={styles.container}>
        <SafeAreaView
          style={[
            styles.fullscreenContainer,
            { backgroundColor: colors.background },
          ]}
        >
          <View
            style={[
              styles.fullscreenHeader,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.fullscreenTitle, { color: colors.text }]}>
              {translateNative('native.190a6a4c52455a67')}</Text>
            <PrimaryButton
              label={translateNative('common.close')}
              variant="secondary"
              onPress={() => setShowTimelapseFullscreen(false)}
            />
          </View>
          {!mediaTokenReady || !serverOrigin ? (
            <View style={styles.mediaLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : timelapseError ? (
            <View style={styles.mediaError}>
              <Text style={[styles.mediaErrorText, { color: colors.error }]}>
                {translateNative('native.ff83912a2a298ed0')}</Text>
              <PrimaryButton
                label={translateNative('native.16b15d784580dbbf')}
                variant="secondary"
                onPress={retryTimelapse}
              />
            </View>
          ) : timelapseUrl ? (
            <MediaWebView
              key={`fullscreen-${timelapseUrl}`}
              source={{ uri: timelapseUrl }}
              originWhitelist={[serverOrigin]}
              javaScriptEnabled={false}
              allowFileAccess={false}
              setSupportMultipleWindows={false}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              onError={() => setTimelapseError(true)}
              onHttpError={() => setTimelapseError(true)}
            />
          ) : null}
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <ConfirmModal
        visible={pendingPhotoDelete !== null}
        onClose={() => setPendingPhotoDelete(null)}
        onConfirm={() => {
          if (!pendingPhotoDelete) return;
          void deletePhotoMutation.mutateAsync(pendingPhotoDelete);
        }}
        title={translateNative('native.b6870532d6ae062d')}
        message={translateNative('native.e72f7c297a057f10')}
        confirmLabel={translateNative('common.delete')}
        loading={deletePhotoMutation.isPending}
      />

      <SliceModal
        visible={showSliceModal}
        onClose={() => setShowSliceModal(false)}
        sourceType="archive"
        sourceId={archiveId}
        sourceName={archive.print_name || archive.filename}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: '100%',
    height: 240,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFill: {
    width: '100%',
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionCell: {
    flex: 1,
    minWidth: 110,
  },
  inlineActions: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  webviewFrame: {
    height: 220,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  photoRail: {
    gap: spacing.md,
  },
  photoCard: {
    width: 180,
    height: 140,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.lg,
  },
  mediaLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mediaError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  mediaErrorText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  photoErrorText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  photoDelete: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionCard: {
    width: 120,
    height: 140,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  helperText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
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
  centeredBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  qrCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    maxHeight: '100%',
  },
  qrContent: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  qrTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  qrSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  qrFrame: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  qrUrl: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  fullscreenBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  fullscreenClose: {
    alignSelf: 'flex-end',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    flex: 1,
    minHeight: 160,
  },
  fullscreenActions: {
    width: '100%',
    marginTop: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fullscreenContainer: {
    flex: 1,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  fullscreenTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  emptyWebView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
});
