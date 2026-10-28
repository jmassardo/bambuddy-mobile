import { nativeMessage, translateNative, type Translate, useNativeLocale, useTranslation } from '@/i18n';


import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { archiveWorkflows } from '@/api/archiveWorkflows';
import { requestBlob, type UploadableFile } from '@/api/http';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { useMediaToken } from '@/hooks/useStreamToken';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import {
  Chip as BaseChip,
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { shareBlob } from '@/utils/share';
import type { Archive, PendingArchiveUpload } from '@/types/api';

export function WorkflowChip({
  active,
  ...props
}: Omit<React.ComponentProps<typeof BaseChip>, 'selected'> & {
  active: boolean;
}) {
  useNativeLocale();
  return <BaseChip {...props} selected={active} />;
}
const Chip = WorkflowChip;

export async function pickArchiveDocuments(
  extensions: string[],
  multiple = false,
  t?: Translate,
): Promise<UploadableFile[]> {
  try {
    const files = await pick({
      type: [types.allFiles],
      allowMultiSelection: multiple,
    });
    return files.map(file => {
      const name = file.name ?? '';
      if (
        !extensions.some(extension => name.toLowerCase().endsWith(extension))
      ) {
        throw new Error(
          t?.('archives.unsupportedFile', {
            defaultValue: 'Unsupported file: {{name}}. Choose {{extensions}}.',
            name,
            extensions: extensions.join(', '),
          }) ?? translateNative('native.fd46a54479208666', { value0: String(name), value1: String(extensions.join(', ')) }),
        );
      }
      return {
        uri: file.uri,
        name,
        type: file.type ?? 'application/octet-stream',
      };
    });
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return [];
    throw error;
  }
}

export function ArchiveDialog({
  title,
  onClose,
  visible = true,
  onDismiss,
  children,
}: {
  title: string;
  onClose: () => void;
  visible?: boolean;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <ScrollView
        contentContainerStyle={[
          styles.dialog,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {children}
        <PrimaryButton
          label={t('common.close', { defaultValue: 'Close' })}
          onPress={onClose}
          variant="secondary"
        />
      </ScrollView>
    </Modal>
  );
}

export function useArchiveAuthorization(archive?: Archive | null) {
  const { user, hasPermission } = useAuth();
  const own = Boolean(user && archive?.created_by_id === user.id);
  return {
    update:
      hasPermission('archives:update_all') ||
      (own && hasPermission('archives:update_own')),
    updateAll: hasPermission('archives:update_all'),
    delete:
      hasPermission('archives:delete_all') ||
      (own && hasPermission('archives:delete_own')),
    create: hasPermission('archives:create'),
    manageTags: hasPermission('archives:update_all'),
    clearLog: hasPermission('archives:delete_all'),
  };
}

export function ConfirmOutcomeDialog({
  archiveId,
  source = 'dialog',
  onClose,
  onReprint,
}: {
  archiveId: number;
  source?: 'dialog' | 'printer_card';
  onClose: () => void;
  onReprint: (archiveId: number) => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const media = useMediaToken();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({
    queryKey: ['archive', archiveId],
    queryFn: () => api.getArchive(archiveId),
  });
  const archive = query.data as Archive | undefined;
  const auth = useArchiveAuthorization(archive);
  const [verdict, setVerdict] = useState<'good' | 'reject'>('good');
  const [reason, setReason] = useState('');
  const [visible, setVisible] = useState(true);
  const dismissal = useRef<'close' | 'reprint' | null>(null);
  const dismissed = useRef(false);
  const finishDismissal = useCallback(() => {
    const intent = dismissal.current;
    if (!intent || dismissed.current) return;
    dismissed.current = true;
    dismissal.current = null;
    onClose();
    if (intent === 'reprint') onReprint(archiveId);
  }, [archiveId, onClose, onReprint]);
  const dismiss = (reprint = false) => {
    if (dismissal.current || dismissed.current) return;
    dismissal.current = reprint ? 'reprint' : 'close';
    setVisible(false);
  };
  useEffect(() => {
    // Android removes the native modal when visible=false commits; onDismiss is iOS-only.
    if (!visible && Platform.OS !== 'ios') finishDismissal();
  }, [visible, finishDismissal]);
  useEffect(() => {
    if (!archive) return;
    setVerdict(archive.user_verdict ?? 'good');
    setReason(archive.failure_reason ?? '');
  }, [archive]);
  const mutation = useMutation({
    mutationFn: async (reprint: boolean) => {
      await api.updateArchive(archiveId, {
        user_verdict: verdict,
        user_verdict_source: source,
        ...(verdict === 'reject' ? { failure_reason: reason || null } : {}),
      });
      return reprint;
    },
    onSuccess: async reprint => {
      await queryClient.invalidateQueries();
      dismiss(reprint);
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <ArchiveDialog
      title={t('archives.outcome', { defaultValue: 'Confirm print outcome' })}
      visible={visible}
      onClose={() => dismiss()}
      onDismiss={finishDismissal}
    >
      <Text style={{ color: colors.text }}>
        {archive?.print_name ?? archive?.filename}
      </Text>
      {archive ? (
        <Image
          key={media.token ?? 'public'}
          source={{
            uri: archive.photos?.[0]
              ? api.getArchivePhotoUrl(archiveId, archive.photos[0])
              : api.getArchiveThumbnail(archiveId),
          }}
          style={styles.photo}
          resizeMode="contain"
        />
      ) : null}
      {archive?.user_verdict ? (
        <Text style={{ color: colors.textSecondary }}>
          {t('archives.recordedOutcome', {
            defaultValue: 'Recorded {{verdict}} via {{source}}',
            verdict: archive.user_verdict,
            source: archive.user_verdict_source ?? 'api',
          })}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Chip
          label={t('archives.good', { defaultValue: 'Good' })}
          active={verdict === 'good'}
          onPress={() => setVerdict('good')}
        />
        <Chip
          label={t('archives.reject', { defaultValue: 'Reject' })}
          active={verdict === 'reject'}
          onPress={() => setVerdict('reject')}
        />
      </View>
      {verdict === 'reject' ? (
        <TextField
          label={t('archives.reason', {
            defaultValue: 'Rejection reason (optional)',
          })}
          value={reason}
          onChangeText={setReason}
        />
      ) : null}
      <Text style={{ color: colors.textSecondary }}>
        {t('archives.outcomeNote', {
          defaultValue:
            'Quality review does not change machine completion or clear the printer plate.',
        })}
      </Text>
      <PrimaryButton
        label={t('common.save')}
        disabled={
          !auth.update ||
          archive?.status !== 'completed' ||
          mutation.isPending ||
          !visible
        }
        loading={mutation.isPending}
        onPress={() => mutation.mutate(false)}
      />
      {verdict === 'reject' ? (
        <PrimaryButton
          label={t('archives.rejectReprint', {
            defaultValue: 'Reject and configure reprint',
          })}
          disabled={
            !auth.update ||
            archive?.status !== 'completed' ||
            mutation.isPending ||
            !visible
          }
          onPress={() => mutation.mutate(true)}
        />
      ) : null}
    </ArchiveDialog>
  );
}

export function ArchiveDeleteDialog({
  archives,
  onClose,
  onDeleted,
}: {
  archives: Archive[];
  onClose: () => void;
  onDeleted?: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [purge, setPurge] = useState(false);
  const impact = useQuery({
    queryKey: ['archiveDeleteImpact', archives.map(item => item.id)],
    queryFn: () =>
      Promise.all(archives.map(item => archiveWorkflows.impact(item.id))),
  });
  const blocked =
    archives.some(item =>
      ['printing', 'paused', 'in_progress'].includes(item.status),
    ) || impact.data?.some(item => item.currently_printing);
  const mutation = useMutation({
    mutationFn: async () => {
      for (const archive of archives)
        await api.deleteArchive(archive.id, purge);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onDeleted?.();
      onClose();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <ArchiveDialog
      title={t('archives.delete', { defaultValue: 'Delete archives?' })}
      onClose={onClose}
    >
      {archives.map(archive => (
        <Text key={archive.id} style={{ color: colors.text }}>
          {archive.print_name || archive.filename}
        </Text>
      ))}
      <Text style={{ color: colors.text }}>
        {t('archives.deleteImpact', {
          defaultValue:
            '{{count}} linked queue items will also be removed. Files and attachments are deleted.',
          count:
            impact.data?.reduce(
              (sum, item) => sum + item.related_queue_items,
              0,
            ) ?? 0,
        })}
      </Text>
      <Chip
        label={t('archives.purgeStatistics', {
          defaultValue: 'Also remove statistics (off by default)',
        })}
        active={purge}
        onPress={() => setPurge(!purge)}
      />
      {blocked ? (
        <Text style={{ color: colors.error }}>
          {t('archives.printingDeleteBlocked', {
            defaultValue: 'A currently printing archive cannot be deleted.',
          })}
        </Text>
      ) : null}
      {impact.error ? (
        <Text style={{ color: colors.error }}>{impact.error.message}</Text>
      ) : null}
      <PrimaryButton
        label={t('common.delete')}
        variant="danger"
        loading={mutation.isPending}
        disabled={Boolean(blocked) || !impact.isSuccess || mutation.isPending}
        onPress={() => mutation.mutate()}
      />
    </ArchiveDialog>
  );
}

function PendingRow({
  item,
  onChanged,
}: {
  item: PendingArchiveUpload;
  onChanged: () => Promise<void>;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const [tags, setTags] = useState(item.tags ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [project, setProject] = useState(
    item.project_id == null ? '' : String(item.project_id),
  );
  const [expanded, setExpanded] = useState(false);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    enabled: expanded,
  });
  const mutation = useMutation({
    mutationFn: (discard: boolean) =>
      discard
        ? archiveWorkflows.discard(item.id)
        : archiveWorkflows.accept(item.id, {
            tags,
            notes,
            ...(project ? { project_id: Number(project) } : {}),
          }),
    onSuccess: onChanged,
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <SectionCard title={item.display_name || item.print_name || item.filename}>
      <Text>
        {t('archives.awaitingDecision', {
          defaultValue: 'Awaiting archive/discard decision',
        })}
      </Text>
      <PrimaryButton
        label={t('archives.metadata', {
          defaultValue: 'Tags, notes and project',
        })}
        variant="secondary"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <>
          <TextField
            label={t('archives.tags', { defaultValue: 'Tags' })}
            value={tags}
            onChangeText={setTags}
          />
          <TextField
            label={t('archives.notes', { defaultValue: 'Notes' })}
            value={notes}
            onChangeText={setNotes}
          />
          <View style={styles.row}>
            {projects.data?.map(record => (
              <Chip
                key={record.id}
                label={record.name}
                active={project === String(record.id)}
                onPress={() =>
                  setProject(
                    project === String(record.id) ? '' : String(record.id),
                  )
                }
              />
            ))}
          </View>
        </>
      ) : null}
      {hasPermission('queue:create') ? (
        <PrimaryButton
          label={t('archives.accept', { defaultValue: 'Archive' })}
          loading={mutation.isPending}
          onPress={() => mutation.mutate(false)}
        />
      ) : null}
      {hasPermission('queue:delete_all') ? (
        <PrimaryButton
          label={t('archives.discard', { defaultValue: 'Discard' })}
          variant="danger"
          disabled={mutation.isPending}
          onPress={() =>
            Alert.alert(
              t('archives.discard', {
                defaultValue: 'Discard pending upload?',
              }),
              item.filename,
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => mutation.mutate(true),
                },
              ],
            )
          }
        />
      ) : null}
    </SectionCard>
  );
}

export function ArchiveIngestionPanel() {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const auth = useArchiveAuthorization();
  const { hasAnyPermission, hasPermission } = useAuth();
  const canReadPending = hasAnyPermission('queue:read_all', 'queue:read_own');
  const { showToast } = useToast();
  const [results, setResults] = useState<string[]>([]);
  const pending = useQuery({
    queryKey: ['pendingArchiveUploads'],
    queryFn: archiveWorkflows.pending,
    enabled: canReadPending,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pendingArchiveUploads'] }),
      queryClient.invalidateQueries({ queryKey: ['archives'] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async () => {
      const files = await pickArchiveDocuments(['.3mf'], true, t);
      setResults([]);
      for (const file of files) {
        try {
          await api.uploadArchive(file);
          setResults(previous => [
            ...previous,
            `${file.name}: ${t('archives.imported', {
              defaultValue: 'Imported',
            })}`,
          ]);
        } catch (error) {
          setResults(previous => [
            ...previous,
            `${file.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ]);
        }
      }
      await refresh();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const bulk = useMutation({
    mutationFn: async (discard: boolean) => {
      if (discard) {
        const result = await archiveWorkflows.discardAll();
        showToast(
          nativeMessage('archives.discardedCount', () => ({
            defaultValue: '{{count}} discarded',
            count: result.discarded,
          })),
          'success',
        );
      } else {
        const result = await archiveWorkflows.acceptAll();
        showToast(
          nativeMessage('archives.acceptedToast', { defaultValue: '{{archived}} Imported, {{failed}} failed', archived: result.archived, failed: result.failed }),
          result.failed ? 'warning' : 'success',
        );
      }
    },
    onSuccess: refresh,
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  if (!auth.create && !canReadPending) return null;
  return (
    <SectionCard
      title={t('archives.ingestion', { defaultValue: 'Archive ingestion' })}
    >
      {auth.create ? (
        <PrimaryButton
          label={t('archives.upload', { defaultValue: 'Upload 3MF archives' })}
          loading={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
      ) : null}
      {results.map((result, index) => (
        <Text key={index} style={{ color: colors.text }}>
          {result}
        </Text>
      ))}
      {pending.error ? (
        <Text style={{ color: colors.error }}>{pending.error.message}</Text>
      ) : null}
      {pending.data?.length ? (
        <>
          <View style={styles.row}>
            {[false, true]
              .filter(discard =>
                hasPermission(discard ? 'queue:delete_all' : 'queue:create'),
              )
              .map(discard => (
                <PrimaryButton
                  key={String(discard)}
                  label={
                    discard
                      ? t('archives.discardAll', {
                          defaultValue: 'Discard all',
                        })
                      : t('archives.archiveAll', {
                          defaultValue: 'Archive all',
                        })
                  }
                  disabled={bulk.isPending}
                  onPress={() =>
                    Alert.alert(
                      t('common.confirm', { defaultValue: 'Confirm' }),
                      t('archives.pendingBulkConfirm', {
                        defaultValue:
                          'Apply this decision to every pending upload?',
                      }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.confirm', {
                            defaultValue: 'Confirm',
                          }),
                          onPress: () => bulk.mutate(discard),
                        },
                      ],
                    )
                  }
                />
              ))}
          </View>
          {pending.data.map(item => (
            <PendingRow key={item.id} item={item} onChanged={refresh} />
          ))}
        </>
      ) : null}
    </SectionCard>
  );
}

export function ArchivePhotoGallery({
  archive,
  initialPhoto,
  onClose,
}: {
  archive: Archive;
  initialPhoto?: string;
  onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const media = useMediaToken();
  const { showToast } = useToast();
  const [index, setIndex] = useState(
    Math.max(0, archive.photos?.indexOf(initialPhoto ?? '') ?? 0),
  );
  const photos = archive.photos ?? [];
  const photo = photos[index];
  const save = useMutation({
    mutationFn: async () => {
      if (photo)
        await shareBlob(
          await requestBlob(
            `/archives/${archive.id}/photos/${encodeURIComponent(photo)}`,
          ),
          photo,
        );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  useEffect(() => {
    if (index >= photos.length) setIndex(Math.max(0, photos.length - 1));
  }, [index, photos.length]);
  return (
    <ArchiveDialog
      title={t('archives.photos', {
        defaultValue: 'Photos {{current}} / {{count}}',
        current: photos.length ? index + 1 : 0,
        count: photos.length,
      })}
      onClose={onClose}
    >
      {photo ? (
        <Image
          key={`${photo}-${media.token ?? 'public'}`}
          source={{ uri: api.getArchivePhotoUrl(archive.id, photo) }}
          style={styles.photo}
          resizeMode="contain"
          accessibilityLabel={photo}
        />
      ) : (
        <Text>
          {t('archives.noPhotos', { defaultValue: 'No photos attached.' })}
        </Text>
      )}
      <View style={styles.row}>
        <PrimaryButton
          label={t('common.previous', { defaultValue: 'Previous' })}
          disabled={index === 0}
          onPress={() => setIndex(index - 1)}
        />
        <PrimaryButton
          label={t('common.next', { defaultValue: 'Next' })}
          disabled={index >= photos.length - 1}
          onPress={() => setIndex(index + 1)}
        />
      </View>
      <PrimaryButton
        label={t('archives.saveShare', { defaultValue: 'Save / share photo' })}
        disabled={!photo}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
      <ScrollView horizontal>
        {photos.map((item, position) => (
          <PrimaryButton
            key={item}
            label={String(position + 1)}
            variant={position === index ? 'primary' : 'secondary'}
            onPress={() => setIndex(position)}
          />
        ))}
      </ScrollView>
    </ArchiveDialog>
  );
}

const styles = StyleSheet.create({
  dialog: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: '100%', height: 360 },
});
