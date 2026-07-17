import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, Image as ImageIcon, Pencil, Trash2, X } from 'lucide-react-native';
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerStore } from '@/api/server';
import { api } from '@/api/client';
import { EditArchiveModal } from '@/components/archives/EditArchiveModal';
import { PrintLogModal } from '@/components/archives/PrintLogModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
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
} from '@/utils/data';

function assetToUpload(asset: Asset) {
  if (!asset.uri) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? `archive-photo-${Date.now()}.jpg`,
    type: asset.type ?? 'image/jpeg',
  };
}

export default function ArchiveDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };
  const archiveId = Number(id);
  const { colors } = useTheme();
  const serverUrl = useServerStore(state => state.serverUrl);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintLog, setShowPrintLog] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showProjectPageModal, setShowProjectPageModal] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState<string | null>(null);
  const [showTimelapseFullscreen, setShowTimelapseFullscreen] = useState(false);

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

  const archive = useMemo(
    () => (archiveQuery.data as Archive | undefined) ?? null,
    [archiveQuery.data],
  );

  const timelapseUrl = archive?.timelapse_path || pickString(archive as unknown as ApiRecord, ['timelapse_url'])
    ? api.getArchiveTimelapse(archiveId)
    : null;
  const isSoftDeleted = Boolean(
    pickString(archive as unknown as ApiRecord, ['deleted_at']) || archive?.status === 'deleted',
  );
  const archiveUrl = serverUrl ? `${serverUrl}/archives/${archiveId}` : null;
  const archiveProjectPageUrl = pickString(
    archive as unknown as ApiRecord,
    ['external_url', 'makerworld_url'],
  ) || (archive?.project_id && serverUrl ? `${serverUrl}/projects/${archive.project_id}` : null);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Archive',
      headerRight: archive
        ? () => (
            <Pressable
              onPress={() => setShowEditModal(true)}
              style={styles.headerButton}
              hitSlop={8}
            >
              <Pencil size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          )
        : undefined,
    });
  }, [archive, colors.text, navigation]);

  const invalidateArchiveQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['archives'] }),
      queryClient.invalidateQueries({ queryKey: ['archive', archiveId] }),
      queryClient.invalidateQueries({ queryKey: ['archiveRuns', archiveId] }),
      queryClient.invalidateQueries({ queryKey: ['archiveStats'] }),
    ]);
  };

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

  const restoreMutation = useMutation({
    mutationFn: () => api.restoreArchive(archiveId),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast('Archive restored.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to restore this archive.', 'error'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) => api.uploadArchivePhoto(archiveId, file),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      showToast('Photo added to archive.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to upload the photo.', 'error'),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (filename: string) => api.deleteArchivePhoto(archiveId, filename),
    onSuccess: async () => {
      await invalidateArchiveQueries();
      setPendingPhotoDelete(null);
      setFullscreenPhoto(null);
      showToast('Photo removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove the photo.', 'error'),
  });

  const pickPhoto = async (source: 'camera' | 'gallery') => {
    try {
      const result = source === 'camera'
        ? await launchCamera({ mediaType: 'photo', cameraType: 'back', saveToPhotos: true })
        : await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
      const selectedAsset = result.assets?.[0];
      if (!selectedAsset) {
        showToast('No photo was selected.', 'warning');
        return;
      }
      const file = assetToUpload(selectedAsset);
      if (!file) {
        showToast('No photo was selected.', 'warning');
        return;
      }
      await uploadPhotoMutation.mutateAsync(file);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add a photo.', 'error');
    }
  };

  const refreshAll = async () => {
    await Promise.all([archiveQuery.refetch(), runsQuery.refetch()]);
  };

  if (archiveQuery.isLoading || runsQuery.isLoading) {
    return <LoadingScreen message="Loading archive details…" />;
  }

  if (archiveQuery.isError || !archive) {
    return (
      <ErrorState
        message="Unable to load archive details."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const runs = Array.isArray(runsQuery.data) ? (runsQuery.data as ApiRecord[]) : [];
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
        <Image
          source={{ uri: api.getArchiveThumbnail(archiveId) }}
          style={styles.thumbnail}
        />

        <SectionCard
          title={archive.print_name || archive.filename || 'Untitled archive'}
          subtitle={archive.printer_name || pickString(archive as unknown as ApiRecord, ['printer_name', 'printer'], 'Unknown printer')}
        >
          <KeyValueRow label="Tags" value={archive.tags || pickString(archive as unknown as ApiRecord, ['tags_text', 'tag_names'], '—') || '—'} />
          <KeyValueRow label="Date" value={formatDateTime(archive.completed_at || archive.created_at)} />
          <KeyValueRow label="Duration" value={formatDuration(archive.actual_time_seconds || archive.print_time_seconds)} />
          <KeyValueRow label="Filament" value={formatWeight(archive.filament_used_grams)} />
          <KeyValueRow label="Cost" value={formatCurrency(archive.cost ?? pickString(archive as unknown as ApiRecord, ['estimated_cost']))} />
        </SectionCard>

        <View style={styles.actionRow}>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Reprint"
              onPress={() => void reprintMutation.mutateAsync()}
              loading={reprintMutation.isPending}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Add to Queue"
              variant="secondary"
              onPress={() => void queueMutation.mutateAsync()}
              loading={queueMutation.isPending}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Print log"
              variant="secondary"
              onPress={() => setShowPrintLog(true)}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="QR code"
              variant="secondary"
              onPress={() => setShowQrModal(true)}
              disabled={!archiveUrl}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Project page"
              variant="secondary"
              onPress={() => setShowProjectPageModal(true)}
              disabled={!archiveProjectPageUrl}
            />
          </View>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Share"
              variant="secondary"
              onPress={() =>
                void Share.share({
                  message: `${archive.print_name || archive.filename} • ${archive.printer_name || pickString(archive as unknown as ApiRecord, ['printer_name', 'printer'])}`,
                })
              }
            />
          </View>
          {isSoftDeleted ? (
            <View style={styles.actionCell}>
              <PrimaryButton
                label="Restore"
                onPress={() => void restoreMutation.mutateAsync()}
                loading={restoreMutation.isPending}
              />
            </View>
          ) : null}
        </View>

        {timelapseUrl ? (
          <SectionCard
            title="Timelapse"
            subtitle="Play the finished print timelapse inline or expand it fullscreen."
          >
            <View style={[styles.webviewFrame, { borderColor: colors.border }]}> 
              <WebView source={{ uri: timelapseUrl }} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} />
            </View>
            <View style={styles.inlineActions}>
              <PrimaryButton label="Fullscreen" variant="secondary" onPress={() => setShowTimelapseFullscreen(true)} />
            </View>
          </SectionCard>
        ) : null}

        <SectionCard title="Photo gallery" subtitle="Archive photos appear here as a horizontal gallery.">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRail}>
            {photos.map(photo => (
              <View key={photo} style={styles.photoCard}>
                <Pressable onPress={() => setFullscreenPhoto(photo)}>
                  <Image source={{ uri: api.getArchivePhotoUrl(archiveId, photo) }} style={styles.photo} />
                </Pressable>
                <Pressable
                  onPress={() => setPendingPhotoDelete(photo)}
                  style={[styles.photoDelete, { backgroundColor: colors.error }]}
                >
                  <Trash2 size={14} color={colors.textInverse} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => void pickPhoto('camera')}
              style={[styles.photoActionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Camera size={18} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.photoActionText, { color: colors.textSecondary }]}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => void pickPhoto('gallery')}
              style={[styles.photoActionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <ImageIcon size={18} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.photoActionText, { color: colors.textSecondary }]}>Gallery</Text>
            </Pressable>
          </ScrollView>
          {uploadPhotoMutation.isPending ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>Uploading photo…</Text>
          ) : null}
        </SectionCard>

        <SectionCard title="Print History" subtitle="Previous runs for this archived model.">
          {runs.length > 0 ? (
            runs.map(run => (
              <View
                key={String(run.id ?? `${run.started_at}-${run.status}`)}
                style={[
                  styles.runCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.runTitle, { color: colors.text }]}> 
                  {pickString(run, ['status', 'result'], 'Unknown result')}
                </Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}> 
                  {formatDateTime(pickString(run, ['started_at', 'created_at']))}
                </Text>
                <Text style={[styles.runMeta, { color: colors.textSecondary }]}> 
                  {pickString(run, ['printer_name', 'printer'], 'Unknown printer')}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.note, { color: colors.textSecondary }]}>No print history available yet.</Text>
          )}
        </SectionCard>

        <SectionCard title="Notes & Failure Analysis">
          <Text style={[styles.note, { color: colors.textSecondary }]}> 
            {archive.notes || archive.failure_reason || pickString(archive as unknown as ApiRecord, ['failure_analysis', 'comment'], 'No notes or failure analysis were captured for this archive.')}
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

      <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
        <View style={[styles.centeredBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.qrTitle, { color: colors.text }]}>Archive QR code</Text>
            <Text style={[styles.qrSubtitle, { color: colors.textSecondary }]}>
              Scan to open this archive in Bambuddy.
            </Text>
            {archiveUrl ? (
              <View style={[styles.qrFrame, { backgroundColor: colors.surface }]}>
                <QRCode
                  value={archiveUrl}
                  size={220}
                  color={colors.text}
                  backgroundColor={colors.surface}
                />
              </View>
            ) : (
              <Text style={[styles.note, { color: colors.error }]}>The server URL is not configured.</Text>
            )}
            {archiveUrl ? (
              <Text style={[styles.qrUrl, { color: colors.textSecondary }]}>{archiveUrl}</Text>
            ) : null}
            <PrimaryButton label="Close" variant="secondary" onPress={() => setShowQrModal(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={showProjectPageModal} animationType="slide" onRequestClose={() => setShowProjectPageModal(false)}>
        <View style={[styles.fullscreenContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.fullscreenHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fullscreenTitle, { color: colors.text }]}>Project page</Text>
            <PrimaryButton label="Close" variant="secondary" onPress={() => setShowProjectPageModal(false)} />
          </View>
          {archiveProjectPageUrl ? (
            <WebView source={{ uri: archiveProjectPageUrl }} />
          ) : (
            <View style={styles.emptyWebView}>
              <Text style={[styles.note, { color: colors.textSecondary }]}>No project page is available for this archive.</Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={fullscreenPhoto !== null} transparent animationType="fade" onRequestClose={() => setFullscreenPhoto(null)}>
        <View style={[styles.fullscreenBackdrop, { backgroundColor: colors.overlay }]}> 
          <Pressable style={styles.fullscreenClose} onPress={() => setFullscreenPhoto(null)}>
            <X size={20} color={colors.textInverse} strokeWidth={2} />
          </Pressable>
          {fullscreenPhoto ? (
            <Image source={{ uri: api.getArchivePhotoUrl(archiveId, fullscreenPhoto) }} style={styles.fullscreenImage} resizeMode="contain" />
          ) : null}
          {fullscreenPhoto ? (
            <View style={styles.fullscreenActions}>
              <PrimaryButton label="Delete photo" variant="danger" onPress={() => setPendingPhotoDelete(fullscreenPhoto)} />
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={showTimelapseFullscreen} animationType="slide" onRequestClose={() => setShowTimelapseFullscreen(false)}>
        <View style={[styles.fullscreenContainer, { backgroundColor: colors.background }]}> 
          <View style={[styles.fullscreenHeader, { borderBottomColor: colors.border }]}> 
            <Text style={[styles.fullscreenTitle, { color: colors.text }]}>Timelapse</Text>
            <PrimaryButton label="Close" variant="secondary" onPress={() => setShowTimelapseFullscreen(false)} />
          </View>
          {timelapseUrl ? <WebView source={{ uri: timelapseUrl }} allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} /> : null}
        </View>
      </Modal>

      <ConfirmModal
        visible={pendingPhotoDelete !== null}
        onClose={() => setPendingPhotoDelete(null)}
        onConfirm={() => {
          if (!pendingPhotoDelete) return;
          void deletePhotoMutation.mutateAsync(pendingPhotoDelete);
        }}
        title="Delete photo"
        message="Remove this archive photo?"
        confirmLabel="Delete"
        loading={deletePhotoMutation.isPending}
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
    backgroundColor: '#111827',
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
    backgroundColor: '#111827',
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
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
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
    position: 'absolute',
    top: spacing['3xl'],
    right: spacing.lg,
    zIndex: 1,
  },
  fullscreenImage: {
    width: '100%',
    height: '70%',
  },
  fullscreenActions: {
    width: '100%',
    marginTop: spacing.lg,
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
