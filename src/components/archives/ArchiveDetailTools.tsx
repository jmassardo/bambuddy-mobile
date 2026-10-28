import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { WebView } from 'react-native-webview';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { requestBlob } from '@/api/http';

import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import {
  ArchiveDialog,
  pickArchiveDocuments,
  useArchiveAuthorization,
} from './ArchiveWorkflowUI';
import { shareBlob } from '@/utils/share';
import type { Archive, ArchiveProjectPage } from '@/types/api';

const MetadataWebView = WebView as React.ComponentType<
  React.ComponentProps<typeof WebView> & {
    onShouldStartLoadWithRequest?: (event: { url: string }) => boolean;
  }
>;

export function EmbeddedArchiveProjectPage({
  archive,
  onClose,
}: {
  archive: Archive;
  onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useArchiveAuthorization(archive);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['archiveProjectPage', archive.id],
    queryFn: () => archiveWorkflows.projectPage(archive.id),
  });
  const [draft, setDraft] = useState<ArchiveProjectPage>({});
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      archiveWorkflows.saveProjectPage(archive.id, {
        title: draft.title,
        designer: draft.designer,
        license: draft.license,
        description: draft.description,
        profile_title: draft.profile_title,
        profile_description: draft.profile_description,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['archiveProjectPage', archive.id],
      });
      setEditing(false);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const fieldLabels: Record<string, string> = {
    get title() { return translateNative('native.ade29f565b1a8f18'); },
    get designer() { return translateNative('native.7bfa836d448c26ad'); },
    get license() { return translateNative('native.d87ef69215c625eb'); },
    get description() { return translateNative('native.f38e87166ac410c8'); },
    get profile_title() { return translateNative('native.b163c1549f81a04f'); },
    get profile_description() { return translateNative('native.2d913d867f277f9f'); },
  };
  const fields = [
    'title',
    'designer',
    'license',
    'description',
    'profile_title',
    'profile_description',
  ] as const;
  const images = [
    ...(query.data?.model_pictures ?? []),
    ...(query.data?.profile_pictures ?? []),
    ...(query.data?.thumbnails ?? []),
  ];
  return (
    <ArchiveDialog
      title={t('archives.projectPage', {
        defaultValue: 'Embedded 3MF project page',
      })}
      onClose={onClose}
    >
      {query.isLoading ? <Text>{t('common.loading')}</Text> : null}
      {query.error ? (
        <Text style={{ color: colors.error }}>{query.error.message}</Text>
      ) : null}
      {fields.map(field =>
        editing ? (
          <TextField
            key={field}
            label={t(`archives.metadata.${field}`, {
              defaultValue: fieldLabels[field],
            })}
            value={String(draft[field] ?? '')}
            multiline={field.includes('description')}
            onChangeText={value =>
              setDraft(previous => ({ ...previous, [field]: value }))
            }
          />
        ) : (
          <View key={field}>
            <Text style={{ color: colors.textSecondary }}>
              {t(`archives.metadata.${field}`, {
                defaultValue: fieldLabels[field],
              })}
            </Text>
            {field.includes('description') ? (
              <MetadataWebView
                style={styles.richText}
                source={{
                  html: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"></head><body style="color:${
                    colors.text
                  };background:${
                    colors.background
                  };font-family:system-ui">${String(
                    query.data?.[field] ?? '',
                  )}</body></html>`,
                }}
                javaScriptEnabled={false}
                originWhitelist={['about:blank']}
                onShouldStartLoadWithRequest={event =>
                  event.url === 'about:blank'
                }
                allowFileAccess={false}
              />
            ) : (
              <Text style={{ color: colors.text }}>
                {String(query.data?.[field] ?? '—')}
              </Text>
            )}
          </View>
        ),
      )}
      {auth.update && query.isSuccess ? (
        editing ? (
          <>
            <PrimaryButton
              label={t('common.save')}
              loading={save.isPending}
              onPress={() => save.mutate()}
            />
            <PrimaryButton
              label={t('common.cancel')}
              variant="secondary"
              onPress={() => {
                setEditing(false);
                setDraft(query.data);
              }}
            />
          </>
        ) : (
          <PrimaryButton
            label={t('common.edit')}
            onPress={() => setEditing(true)}
          />
        )
      ) : null}
      {images.map(image => (
        <View key={image.path}>
          <Image
            source={{
              uri: archiveWorkflows.projectImage(archive.id, image.path),
            }}
            style={styles.thumbnail}
            resizeMode="contain"
          />
          <PrimaryButton
            label={
              image.name ||
              t('archives.inspectImage', { defaultValue: 'Inspect image' })
            }
            variant="secondary"
            onPress={() => setPhoto(image.path)}
          />
        </View>
      ))}
      {photo ? (
        <ArchiveDialog
          title={t('archives.projectImage', { defaultValue: 'Project image' })}
          onClose={() => setPhoto(null)}
        >
          <Image
            source={{ uri: archiveWorkflows.projectImage(archive.id, photo) }}
            style={styles.image}
            resizeMode="contain"
          />
        </ArchiveDialog>
      ) : null}
    </ArchiveDialog>
  );
}

export function ArchiveDetailTools({
  archive,
  onOutcome,
  onProjectPage,
  onNavigate,
}: {
  archive: Archive;
  onOutcome: () => void;
  onProjectPage: () => void;
  onNavigate: (kind: 'archive' | 'project' | 'folder', id: number) => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const auth = useArchiveAuthorization(archive);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<
    Array<{ name: string; size?: number }>
  >([]);
  const [mediaVisible, setMediaVisible] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [plate, setPlate] = useState(0);
  const media = useQuery({
    queryKey: ['archivePrinterMedia', archive.id],
    queryFn: () => archiveWorkflows.printerMedia(archive.id),
    enabled: mediaVisible,
  });
  const plates = useQuery({
    queryKey: ['archivePlates', archive.id],
    queryFn: () => archiveWorkflows.plates(archive.id),
  });
  const folders = useQuery({
    queryKey: ['archiveFolders', archive.id],
    queryFn: () => archiveWorkflows.folders(archive.id),
  });
  const refresh = async () => {
    await Promise.all(
      ['archive', 'archives', 'archivePlates', 'archivePrinterMedia'].map(key =>
        queryClient.invalidateQueries({
          queryKey: key === 'archive' ? [key, archive.id] : [key],
        }),
      ),
    );
  };
  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: refresh,
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const attach = (kind: 'source' | 'f3d' | 'timelapse/upload') =>
    action.mutate(async () => {
      const [file] = await pickArchiveDocuments(
        kind === 'source'
          ? ['.3mf']
          : kind === 'f3d'
          ? ['.f3d']
          : ['.mp4', '.avi', '.mkv'],
        false,
        t,
      );
      if (file) await archiveWorkflows.attach(archive.id, kind, file);
    });
  const remove = (kind: 'source' | 'f3d' | 'timelapse') =>
    Alert.alert(
      t('archives.removeAttachment', {
        defaultValue: 'Remove {{kind}} attachment?',
        kind,
      }),
      t('archives.keepArchive', {
        defaultValue:
          'The sliced archive and other attachments will be preserved.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            action.mutate(() => archiveWorkflows.remove(archive.id, kind)),
        },
      ],
    );
  const save = (
    kind: 'download' | 'source' | 'f3d' | 'timelapse' | 'qrcode',
    filename: string,
  ) =>
    action.mutate(async () =>
      shareBlob(await archiveWorkflows.download(archive.id, kind), filename),
    );
  const record = archive as unknown as Record<string, unknown>;
  const plateList = plates.data?.plates ?? [];
  return (
    <>
      <SectionCard
        title={t('archives.filesMedia', {
          defaultValue: 'Files, attachments and media',
        })}
      >
        <PrimaryButton
          label={t('archives.downloadOriginal', {
            defaultValue: 'Save / share original printable file',
          })}
          onPress={() => save('download', archive.filename)}
          loading={action.isPending}
        />
        <PrimaryButton
          label={t('archives.copyDownload', {
            defaultValue: 'Copy download link',
          })}
          variant="secondary"
          onPress={() => {
            Clipboard.setString(archiveWorkflows.downloadUrl(archive.id));
            showToast(
              t('archives.linkCopied', {
                defaultValue: 'Download link copied.',
              }),
              'success',
            );
          }}
        />
        <PrimaryButton
          label={t('archives.exportQr', {
            defaultValue: 'Save / share QR image',
          })}
          variant="secondary"
          onPress={() => save('qrcode', `archive-${archive.id}-qr.png`)}
        />
        <PrimaryButton
          label={t('archives.projectPage', {
            defaultValue: 'Embedded 3MF project page',
          })}
          variant="secondary"
          onPress={onProjectPage}
        />
        {archive.status === 'completed' && auth.update ? (
          <PrimaryButton
            label={t('archives.reviewOutcome', {
              defaultValue: 'Review quality outcome',
            })}
            onPress={onOutcome}
          />
        ) : null}
        <Text style={{ color: colors.text }}>
          {t('archives.storedVerdict', {
            defaultValue: 'Quality: {{verdict}} · source: {{source}}',
            verdict: String(
              record.user_verdict ??
                t('archives.unconfirmed', { defaultValue: 'unconfirmed' }),
            ),
            source: String(record.user_verdict_source ?? '—'),
          })}
        </Text>
        {(['source', 'f3d'] as const).map(kind => {
          const path =
            kind === 'source' ? archive.source_3mf_path : archive.f3d_path;
          return (
            <View style={styles.stack} key={kind}>
              <Text style={{ color: colors.text }}>
                {kind === 'source'
                  ? t('archives.source3mf', { defaultValue: 'Source 3MF' })
                  : translateNative('native.9faf6c0b18ae1f66')}
                :{' '}
                {path?.split('/').pop() ??
                  t('archives.notAttached', { defaultValue: 'Not attached' })}
              </Text>
              {auth.update ? (
                <PrimaryButton
                  label={
                    path
                      ? t('archives.replace', {
                          defaultValue: 'Replace {{kind}}',
                          kind,
                        })
                      : t('archives.attach', {
                          defaultValue: 'Attach {{kind}}',
                          kind,
                        })
                  }
                  disabled={action.isPending}
                  onPress={() => attach(kind)}
                />
              ) : null}
              {path ? (
                <>
                  <PrimaryButton
                    label={t('archives.downloadAttachment', {
                      defaultValue: 'Download {{kind}}',
                      kind,
                    })}
                    variant="secondary"
                    onPress={() => save(kind, path.split('/').pop()!)}
                  />
                  {auth.delete ? (
                    <PrimaryButton
                      label={t('archives.remove', {
                        defaultValue: 'Remove {{kind}}',
                        kind,
                      })}
                      variant="danger"
                      onPress={() => remove(kind)}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}
        {auth.updateAll ? (
          <>
            <PrimaryButton
              label={t('archives.uploadTimelapse', {
                defaultValue: 'Upload / replace timelapse',
              })}
              disabled={action.isPending}
              onPress={() => attach('timelapse/upload')}
            />
            <PrimaryButton
              label={t('archives.scanTimelapse', {
                defaultValue: 'Scan printer for timelapse',
              })}
              disabled={!archive.printer_id || action.isPending}
              onPress={() =>
                action.mutate(async () => {
                  const response = await archiveWorkflows.scan(archive.id);
                  setCandidates(response.available_files ?? []);
                  if (response.message)
                    showToast(
                      response.message,
                      response.status === 'not_found' ? 'warning' : 'success',
                    );
                })
              }
            />
          </>
        ) : null}
        {archive.timelapse_path && auth.delete ? (
          <PrimaryButton
            label={t('archives.removeTimelapse', {
              defaultValue: 'Remove timelapse',
            })}
            variant="danger"
            onPress={() => remove('timelapse')}
          />
        ) : null}
        {candidates.map(candidate => (
          <PrimaryButton
            key={candidate.name}
            label={translateNative('native.8f958fa987b58fac', { value0: String(candidate.name), value1: String(candidate.size ?? 0) })}
            variant="secondary"
            disabled={action.isPending}
            onPress={() =>
              action.mutate(async () => {
                await archiveWorkflows.selectTimelapse(
                  archive.id,
                  candidate.name,
                );
                setCandidates([]);
              })
            }
          />
        ))}
        {candidates.length ? (
          <PrimaryButton
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setCandidates([])}
          />
        ) : null}
        <PrimaryButton
          label={t('archives.mediaDownloads', {
            defaultValue: 'Download timelapse / correlated printer recordings',
          })}
          onPress={() => setMediaVisible(true)}
        />
      </SectionCard>
      <SectionCard
        title={t('archives.provenance', {
          defaultValue: 'Plates and provenance',
        })}
      >
        {plateList.length ? (
          <>
            <Image
              source={{
                uri: archiveWorkflows.plateThumbnail(
                  archive.id,
                  plateList[Math.min(plate, plateList.length - 1)].index,
                ),
              }}
              style={styles.image}
              resizeMode="contain"
            />
            <View style={styles.row}>
              {plateList.map((item, index) => (
                <PrimaryButton
                  key={item.index}
                  label={
                    item.name ||
                    `${t('archives.plate', { defaultValue: 'Plate' })} ${
                      item.index
                    }`
                  }
                  variant={index === plate ? 'primary' : 'secondary'}
                  onPress={() => setPlate(index)}
                />
              ))}
            </View>
          </>
        ) : null}
        {archive.original_archive_id ? (
          <PrimaryButton
            label={t('archives.original', {
              defaultValue: 'Open original print #{{id}}',
              id: archive.original_archive_id,
            })}
            onPress={() => onNavigate('archive', archive.original_archive_id!)}
          />
        ) : null}
        {archive.duplicates?.map(item => (
          <PrimaryButton
            key={item.id}
            label={`${item.print_name ?? item.id} · ${item.match_type}`}
            variant="secondary"
            onPress={() => onNavigate('archive', item.id)}
          />
        ))}
        {archive.project_id ? (
          <PrimaryButton
            label={
              archive.project_name ??
              t('archives.linkedProject', {
                defaultValue: 'Open linked project',
              })
            }
            onPress={() => onNavigate('project', archive.project_id!)}
          />
        ) : null}
        {folders.data?.map(folder => (
          <PrimaryButton
            key={folder.id}
            label={t('archives.folder', {
              defaultValue: 'Open folder: {{name}}',
              name: folder.name,
            })}
            variant="secondary"
            onPress={() => onNavigate('folder', folder.id)}
          />
        ))}
      </SectionCard>
      {mediaVisible ? (
        <ArchiveDialog
          title={t('archives.mediaDownloads', {
            defaultValue: 'Archive media downloads',
          })}
          onClose={() => setMediaVisible(false)}
        >
          {media.isLoading ? <Text>{t('common.loading')}</Text> : null}
          {media.error ? (
            <Text style={{ color: colors.error }}>{media.error.message}</Text>
          ) : null}
          {media.data?.warnings.map(warning => (
            <Text key={warning} style={{ color: colors.warning }}>
              {warning.replace(/_/g, ' ')}
            </Text>
          ))}
          {media.data?.local_timelapse ? (
            <PrimaryButton
              label={t('archives.downloadLocal', {
                defaultValue: 'Save local timelapse',
              })}
              onPress={() =>
                save('timelapse', media.data!.local_timelapse!.name)
              }
            />
          ) : null}
          <PrimaryButton
            label={t('common.selectAll', {
              defaultValue: 'Select all recordings',
            })}
            variant="secondary"
            onPress={() =>
              setSelectedPaths(
                media.data?.remote_files.map(file => file.path) ?? [],
              )
            }
          />
          {media.data?.remote_files.map(file => (
            <PrimaryButton
              key={file.path}
              label={translateNative('native.f44996a22a5cc8a1', { value0: String(selectedPaths.includes(file.path) ? '✓ ' : ''), value1: String(file.name), value2: String(file.size) })}
              variant="secondary"
              onPress={() =>
                setSelectedPaths(current =>
                  current.includes(file.path)
                    ? current.filter(path => path !== file.path)
                    : [...current, file.path],
                )
              }
            />
          ))}
          {media.data &&
          !media.data.local_timelapse &&
          !media.data.remote_files.length ? (
            <Text style={{ color: colors.text }}>
              {t('archives.noMedia', {
                defaultValue: 'No correlated media found.',
              })}
            </Text>
          ) : null}
          <PrimaryButton
            label={t('archives.downloadSelected', {
              defaultValue: 'Save selected recordings',
            })}
            disabled={!selectedPaths.length || action.isPending}
            loading={action.isPending}
            onPress={() =>
              action.mutate(async () => {
                if (!media.data?.printer_id) return;
                for (const path of selectedPaths) {
                  const file = media.data.remote_files.find(
                    item => item.path === path,
                  );
                  if (file)
                    await shareBlob(
                      await requestBlob(
                        `/printers/${
                          media.data.printer_id
                        }/files/download?path=${encodeURIComponent(path)}`,
                      ),
                      file.name,
                    );
                }
              })
            }
          />
        </ArchiveDialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  image: { width: '100%', height: 300 },
  thumbnail: { width: '100%', height: 180 },
  richText: { height: 220, width: '100%' },
});
