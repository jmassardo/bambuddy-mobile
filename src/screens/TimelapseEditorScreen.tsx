import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { archivesApi } from '@/api/archives';
import type { UploadableFile } from '@/api/http';
import { useMediaToken } from '@/hooks/useStreamToken';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { spacing } from '@/theme/tokens';
import {
  Chip,
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { pickArchiveDocuments } from '@/components/archives/ArchiveWorkflowUI';
import { blobToDataUrl } from '@/utils/share';
import { timelapsePreviewHtml, timelapseRange } from '@/utils/timelapseEditor';
import type { RootRouteProp } from '@/navigation/types';

interface PreviewHandle {
  injectJavaScript: (script: string) => void;
}
const EditorWebView = WebView as React.ComponentType<
  React.ComponentProps<typeof WebView> & {
    ref?: React.Ref<PreviewHandle>;
    onShouldStartLoadWithRequest?: (event: { url: string }) => boolean;
    onMessage?: (event: { nativeEvent: { data: string } }) => void;
    onError?: () => void;
  }
>;

export default function TimelapseEditorScreen() {
  const route = useRoute<RootRouteProp<'TimelapseEditor'>>();
  const archiveId = route.params.archiveId;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { token, isReady } = useMediaToken();
  const previewRef = useRef<PreviewHandle>(null);
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [speed, setSpeed] = useState(1);
  const [audio, setAudio] = useState<UploadableFile | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const info = useQuery({
    queryKey: ['timelapseInfo', archiveId, version],
    queryFn: () => archiveWorkflows.timelapseInfo(archiveId),
  });
  const frames = useQuery({
    queryKey: ['timelapseThumbnails', archiveId, version],
    queryFn: () => archiveWorkflows.timelapseThumbnails(archiveId),
  });
  useEffect(() => {
    if (info.data) {
      setStart('0');
      setEnd(String(info.data.duration));
      setSpeed(1);
    }
  }, [info.data]);
  const range = useMemo(() => {
    try {
      return {
        value: timelapseRange(start, end, info.data?.duration ?? 0, speed, t),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [start, end, info.data?.duration, speed, t]);
  const preview = useMemo(() => {
    if (!isReady || !range.value) return null;
    return timelapsePreviewHtml({
      video: `${archivesApi.getArchiveTimelapse(archiveId)}${
        archivesApi.getArchiveTimelapse(archiveId).includes('?') ? '&' : '?'
      }v=${version}`,
      audio: audioPreview,
      start: range.value.trimStart,
      end: range.value.trimEnd,
      speed,
      volume,
      muted,
    });
    // Token changes require rebuilding the authenticated media URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    archiveId,
    isReady,
    token,
    range.value,
    speed,
    audioPreview,
    volume,
    muted,
    version,
  ]);
  const chooseAudio = useMutation({
    mutationFn: async () => {
      const [file] = await pickArchiveDocuments(
        ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
        false,
        t,
      );
      if (!file) return;
      const response = await fetch(file.uri);
      const previewData = await blobToDataUrl(await response.blob());
      setAudio(file);
      setAudioPreview(previewData);
      setMuted(false);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const process = useMutation({
    mutationFn: async () => {
      if (!range.value)
        throw new Error(
          range.error ??
            t('archives.invalidTrimRange', {
              defaultValue: 'Invalid trim range',
            }),
        );
      const response = await archiveWorkflows.processTimelapse(
        archiveId,
        range.value,
        audio ?? undefined,
      );
      if (response.status !== 'completed') throw new Error(response.message);
      return response;
    },
    onSuccess: async response => {
      setAudio(null);
      setAudioPreview(null);
      setVersion(previous => previous + 1);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archive', archiveId] }),
        queryClient.invalidateQueries({ queryKey: ['archives'] }),
      ]);
      showToast(response.message, 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  if (info.isLoading)
    return (
      <LoadingScreen
        message={t('archives.loadingVideo', {
          defaultValue: 'Loading video information…',
        })}
      />
    );
  if (info.error)
    return (
      <ErrorState
        message={info.error.message}
        onRetry={() => void info.refetch()}
      />
    );
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { backgroundColor: colors.background },
      ]}
    >
      <SectionCard
        title={t('archives.timelapseEditor', {
          defaultValue: 'Timelapse editor',
        })}
      >
        <Text style={{ color: colors.text }}>
          {info.data?.width} × {info.data?.height} · {info.data?.fps} fps ·{' '}
          {info.data?.duration.toFixed(3)} s
        </Text>
        {preview ? (
          <EditorWebView
            ref={previewRef}
            key={`${version}-${token}`}
            style={styles.video}
            source={{ html: preview }}
            originWhitelist={['about:blank']}
            onShouldStartLoadWithRequest={event => event.url === 'about:blank'}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowFileAccess={false}
            setSupportMultipleWindows={false}
            onMessage={event => {
              try {
                const data = JSON.parse(event.nativeEvent.data) as {
                  time?: number;
                  error?: string;
                };
                if (data.time !== undefined) setPlayhead(data.time);
                if (data.error) setPreviewError(data.error);
              } catch {}
            }}
            onError={() =>
              setPreviewError(
                t('archives.videoError', {
                  defaultValue: 'Video preview could not load.',
                }),
              )
            }
          />
        ) : null}
        {previewError ? (
          <>
            <Text style={{ color: colors.error }}>{previewError}</Text>
            <PrimaryButton
              label={t('common.retry', { defaultValue: 'Retry preview' })}
              onPress={() => {
                setPreviewError(null);
                setVersion(previous => previous + 1);
              }}
            />
          </>
        ) : null}
        <TextField
          label={t('archives.trimStart', {
            defaultValue: 'Trim start (seconds, decimals supported)',
          })}
          value={start}
          onChangeText={setStart}
          keyboardType="decimal-pad"
        />
        <TextField
          label={t('archives.trimEnd', {
            defaultValue: 'Trim end (seconds, decimals supported)',
          })}
          value={end}
          onChangeText={setEnd}
          keyboardType="decimal-pad"
        />
        <Text style={{ color: colors.text }}>
          {t('archives.playhead', {
            defaultValue: 'Playhead: {{time}} s',
            time: playhead.toFixed(3),
          })}
        </Text>
        <View style={styles.row}>
          <PrimaryButton
            label={t('archives.startAtPlayhead', {
              defaultValue: 'Start at playhead',
            })}
            variant="secondary"
            onPress={() => setStart(playhead.toFixed(3))}
          />
          <PrimaryButton
            label={t('archives.endAtPlayhead', {
              defaultValue: 'End at playhead',
            })}
            variant="secondary"
            onPress={() => setEnd(playhead.toFixed(3))}
          />
        </View>
        <ScrollView horizontal>
          {frames.data?.thumbnails.map((thumbnail, index) => (
            <View key={index} style={styles.frame}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${thumbnail}` }}
                style={styles.thumbnail}
              />
              <PrimaryButton
                label={`${frames.data.timestamps[index].toFixed(2)} s`}
                variant="secondary"
                onPress={() =>
                  previewRef.current?.injectJavaScript(
                    `document.getElementById('v').currentTime=${frames.data.timestamps[index]};true;`,
                  )
                }
              />
            </View>
          ))}
        </ScrollView>
        <View style={styles.row}>
          {[0.25, 0.5, 1, 1.5, 2, 4].map(value => (
            <Chip
              key={value}
              label={`${value}×`}
              selected={speed === value}
              onPress={() => setSpeed(value)}
            />
          ))}
        </View>
        <Text style={{ color: range.error ? colors.error : colors.text }}>
          {range.error ??
            t('archives.outputDuration', {
              defaultValue: 'Output duration: {{duration}} s',
              duration: range.value?.outputDuration.toFixed(3),
            })}
        </Text>
      </SectionCard>
      <SectionCard
        title={t('archives.musicOverlay', { defaultValue: 'Music overlay' })}
      >
        <PrimaryButton
          label={
            audio?.name ??
            t('archives.pickAudio', {
              defaultValue: 'Choose MP3, WAV, M4A, AAC or OGG document',
            })
          }
          loading={chooseAudio.isPending}
          onPress={() => chooseAudio.mutate()}
        />
        {audio ? (
          <>
            <PrimaryButton
              label={t('archives.removeAudio', {
                defaultValue: 'Remove selected music',
              })}
              variant="secondary"
              onPress={() => {
                setAudio(null);
                setAudioPreview(null);
              }}
            />
            <Chip
              label={t('archives.mutePreview', {
                defaultValue: 'Mute preview music',
              })}
              selected={muted}
              onPress={() => setMuted(!muted)}
            />
            <View style={styles.row}>
              {[0, 0.25, 0.5, 0.75, 1].map(value => (
                <Chip
                  key={value}
                  label={`${value * 100}%`}
                  selected={volume === value}
                  onPress={() => setVolume(value)}
                />
              ))}
            </View>
            <Text style={{ color: colors.textSecondary }}>
              {t('archives.previewVolumeNote', {
                defaultValue:
                  'Preview volume only. Saved overlay uses the selected audio at its original volume.',
              })}
            </Text>
          </>
        ) : null}
      </SectionCard>
      <PrimaryButton
        label={t('archives.processSave', {
          defaultValue: 'Process and replace timelapse',
        })}
        loading={process.isPending}
        disabled={
          !hasPermission('archives:update_all') ||
          !range.value ||
          process.isPending
        }
        onPress={() =>
          Alert.alert(
            t('archives.processSave', {
              defaultValue: 'Process and replace timelapse?',
            }),
            t('archives.processWarning', {
              defaultValue:
                'The original is replaced only after processing succeeds. Keep this screen open until processing finishes.',
            }),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.save'), onPress: () => process.mutate() },
            ],
          )
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  video: { width: '100%', height: 260 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  frame: { marginRight: spacing.sm, gap: spacing.xs },
  thumbnail: { width: 120, height: 70 },
});
