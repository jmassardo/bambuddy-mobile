import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ChevronLeft,
  Music,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react-native';
import {
  launchImageLibrary,
} from 'react-native-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { withCacheBuster } from '@/utils/data';
import type { Archive } from '@/types/api';

type SpeedOption = 0.5 | 1 | 2 | 4;
const SPEED_OPTIONS: SpeedOption[] = [0.5, 1, 2, 4];

export default function TimelapseEditorScreen() {
  const navigation = useNavigation<RootNavigationProp<'TimelapseEditor'>>();
  const route = useRoute<RootRouteProp<'TimelapseEditor'>>();
  const archiveId = (route.params ?? {})?.archiveId ?? 0;
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState(100);
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [musicUri, setMusicUri] = useState<string | null>(null);
  const [musicName, setMusicName] = useState<string | null>(null);
  const [showConfirmMusic, setShowConfirmMusic] = useState(false);
  const [timelapseError, setTimelapseError] = useState(false);
  const [timelapseRetrySeed, setTimelapseRetrySeed] = useState(0);

  const archiveQuery = useQuery({
    queryKey: ['archive', archiveId],
    queryFn: () => api.getArchive(archiveId),
    enabled: Number.isFinite(archiveId),
  });

  const archive = archiveQuery.data as Archive | null | undefined;

  const hasTimelapse = useMemo(
    () => Boolean(archive?.timelapse_path),
    [archive?.timelapse_path],
  );

  const timelapseUrl = useMemo(() => {
    if (!hasTimelapse) return null;
    return withCacheBuster(
      api.getArchiveTimelapse(archiveId),
      `timelapse-editor-${timelapseRetrySeed}`,
    );
  }, [archiveId, hasTimelapse, timelapseRetrySeed]);

  const updateTimelapseMutation = useMutation({
    mutationFn: (data: {
      start_offset?: number;
      end_offset?: number;
      speed?: number;
    }) => api.updateArchiveTimelapse(archiveId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['archive', archiveId] });
      showToast('Timelapse updated.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to update the timelapse.', 'error'),
  });

  const uploadMusicMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      api.uploadTimelapseMusic(archiveId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['archive', archiveId] });
      showToast('Music added to timelapse.', 'success');
      setShowConfirmMusic(false);
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to add music.', 'error'),
  });

  const removeMusicMutation = useMutation({
    mutationFn: () => api.removeTimelapseMusic(archiveId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['archive', archiveId] });
      setMusicUri(null);
      setMusicName(null);
      showToast('Music removed.', 'success');
      setShowConfirmMusic(false);
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to remove music.', 'error'),
  });

  const pickMusic = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'video',
        selectionLimit: 1,
      });
      const selectedAsset = result.assets?.[0];
      if (!selectedAsset) {
        showToast('No audio file was selected.', 'warning');
        return;
      }
      setMusicUri(selectedAsset.uri ?? null);
      setMusicName(selectedAsset.fileName ?? 'audio-file');
      setShowConfirmMusic(true);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Unable to pick audio.',
        'error',
      );
    }
  };

  const confirmMusicUpload = async () => {
    if (!musicUri || !musicName) return;
    const mimeType =
      musicName.endsWith('.mp3')
        ? 'audio/mpeg'
        : musicName.endsWith('.m4a')
          ? 'audio/mp4'
          : musicName.endsWith('.wav')
            ? 'audio/wav'
            : 'audio/mpeg';
    const file = {
      uri: musicUri,
      name: musicName,
      type: mimeType,
    };
    await uploadMusicMutation.mutateAsync(file);
  };

  const resetSettings = useCallback(() => {
    setStartOffset(0);
    setEndOffset(100);
    setSpeed(1);
  }, []);

  const handleSave = useCallback(() => {
    updateTimelapseMutation.mutateAsync({
      start_offset: startOffset,
      end_offset: endOffset,
      speed,
    });
  }, [startOffset, endOffset, speed, updateTimelapseMutation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Edit Timelapse',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
        </Pressable>
      ),
    });
  }, [navigation, colors.text]);

  const isLoading = archiveQuery.isLoading;

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!archive) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.note, { color: colors.error }]}>
          Archive not found.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* Timelapse Preview */}
        <View
          style={[
            styles.previewCard,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          {!hasTimelapse ? (
            <Text
              style={[styles.note, { color: colors.textSecondary }]}
            >
              No timelapse available for this archive.
            </Text>
          ) : (
            <>
              {timelapseError ? (
                <View style={styles.previewError}>
                  <Text
                    style={[styles.helperText, { color: colors.textSecondary }]}
                  >
                    Unable to load timelapse preview.
                  </Text>
                  <PrimaryButton
                    label="Retry"
                    variant="secondary"
                    onPress={() => {
                      setTimelapseError(false);
                      setTimelapseRetrySeed(s => s + 1);
                    }}
                  />
                </View>
              ) : (
                <View style={styles.webviewContainer}>
                  {timelapseUrl ? (
                    <View
                      style={[
                        styles.webviewFrame,
                        { borderColor: colors.border },
                      ]}
                    >
                      <ScrollView
                        horizontal
                        contentContainerStyle={styles.webviewScrollContent}
                      >
                        <View
                          style={{
                            width: 360,
                            height: 220,
                            backgroundColor: colors.surface,
                            justifyContent: 'center',
                            alignItems: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <Text
                            style={[
                              styles.helperText,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Timelapse preview will render here
                          </Text>
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              )}
            </>
          )}
        </View>

        {/* Trimming */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Trim
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Adjust the start and end points of the timelapse.
          </Text>
          <View style={styles.trimControls}>
            <View style={styles.trimInput}>
              <Text style={[styles.trimLabel, { color: colors.textSecondary }]}>
                Start (%)
              </Text>
              <Pressable
                onPress={() => setStartOffset(prev => Math.max(0, prev - 10))}
                style={[styles.trimButton, { borderColor: colors.border }]}
              >
                <SkipBack size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
              <Text style={[styles.trimValue, { color: colors.text }]}>
                {startOffset}%
              </Text>
              <Pressable
                onPress={() => setStartOffset(prev => Math.min(endOffset - 1, prev + 10))}
                style={[styles.trimButton, { borderColor: colors.border }]}
              >
                <SkipForward size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.trimInput}>
              <Text style={[styles.trimLabel, { color: colors.textSecondary }]}>
                End (%)
              </Text>
              <Pressable
                onPress={() => setEndOffset(prev => Math.max(startOffset + 1, prev - 10))}
                style={[styles.trimButton, { borderColor: colors.border }]}
              >
                <SkipBack size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
              <Text style={[styles.trimValue, { color: colors.text }]}>
                {endOffset}%
              </Text>
              <Pressable
                onPress={() => setEndOffset(prev => Math.min(100, prev + 10))}
                style={[styles.trimButton, { borderColor: colors.border }]}
              >
                <SkipForward size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Speed */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Playback Speed
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Choose the playback speed for the timelapse.
          </Text>
          <View style={styles.speedRow}>
            {SPEED_OPTIONS.map(option => (
              <Pressable
                key={option}
                onPress={() => setSpeed(option)}
                style={[
                  styles.speedButton,
                  {
                    borderColor:
                      speed === option ? colors.accent : colors.border,
                    backgroundColor:
                      speed === option
                        ? `${colors.accent}15`
                        : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.speedLabel,
                    {
                      color:
                        speed === option ? colors.accent : colors.text,
                      fontWeight:
                        speed === option ? fontWeight.bold : fontWeight.normal,
                    },
                  ]}
                >
                  {option}x
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Music */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Music
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Add background music from your device.
          </Text>
          {musicUri ? (
            <View style={styles.musicInfo}>
              <Music size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text
                style={[styles.musicName, { color: colors.text }]}
                numberOfLines={1}
              >
                {musicName}
              </Text>
              <Pressable
                onPress={() => setShowConfirmMusic(true)}
                style={[styles.musicRemove, { borderColor: colors.error }]}
              >
                <Trash2 size={16} color={colors.error} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
          <PrimaryButton
            label={musicUri ? 'Change music' : 'Add music'}
            variant="secondary"
            onPress={pickMusic}
          />
        </View>

        {/* Reset & Save */}
        <View style={styles.actionRow}>
          <View style={styles.actionCell}>
            <PrimaryButton
              label="Reset"
              variant="secondary"
              onPress={resetSettings}
            />
          </View>
          <View style={[styles.actionCell, styles.actionCellFull]}>
            <PrimaryButton
              label="Save changes"
              onPress={handleSave}
              loading={updateTimelapseMutation.isPending}
            />
          </View>
        </View>
      </ScrollView>

      {/* Confirm music upload */}
      <Modal
        visible={showConfirmMusic}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmMusic(false)}
      >
        <View
          style={[styles.centeredBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Upload music?
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Add{' '}
              <Text style={[styles.modalFileName, { color: colors.text }]}>
                {musicName}
              </Text>{' '}
              as background music for this timelapse?
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                label="Cancel"
                variant="secondary"
                onPress={() => setShowConfirmMusic(false)}
              />
              <View style={styles.modalActionSpacing} />
              <PrimaryButton
                label="Upload"
                onPress={confirmMusicUpload}
                loading={uploadMusicMutation.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm music removal */}
      <ConfirmModal
        visible={removeMusicMutation.isPending ? true : musicUri === null && musicName === null}
        onClose={() => setShowConfirmMusic(false)}
        onConfirm={() => {
          removeMusicMutation.mutateAsync();
        }}
        title="Remove music"
        message={`Remove "${musicName}" from the timelapse?`}
        confirmLabel="Remove"
        loading={removeMusicMutation.isPending}
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
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
  },
  webviewContainer: {
    width: '100%',
  },
  webviewFrame: {
    height: 220,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  webviewScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  previewError: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
  },
  trimControls: {
    gap: spacing.md,
  },
  trimInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trimLabel: {
    fontSize: fontSize.sm,
    width: 60,
  },
  trimButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trimValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    minWidth: 50,
    textAlign: 'center',
  },
  speedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  speedButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLabel: {
    fontSize: fontSize.base,
  },
  musicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  musicName: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  musicRemove: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCell: {
    flex: 1,
  },
  actionCellFull: {
    minWidth: '50%',
  },
  centeredBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalMessage: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  modalFileName: {
    fontWeight: fontWeight.semibold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalActionSpacing: {
    flex: 1,
  },
  note: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  helperText: {
    fontSize: fontSize.sm,
  },
});
