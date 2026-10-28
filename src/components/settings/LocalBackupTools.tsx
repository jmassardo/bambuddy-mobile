import { NativeTranslation, nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupApi, backupWorkflowApi } from '@/api/backup';
import { type UploadableFile } from '@/api/http';
import { PrimaryButton } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { formatDateTime } from '@/utils/data';
import { shareBlob } from '@/utils/share';
import { useServerStore } from '@/api/server';
import {
  parseReportCollection,
  reportSessionKey,
  saveReportCollection,
  stopReportCollection,
} from '@/components/system/bugReportCollection';

import { spacing } from '@/theme/tokens';
import { confirmBackupAction, requireBackupSuccess } from './backupWorkflow';

export function LocalBackupTools() {
  useNativeLocale();
  const { colors } = useTheme();
  const { logout, hasPermission } = useAuth();
  const { t } = useTranslation();
  const canBackup = hasPermission('settings:backup');
  const canRestore = hasPermission('settings:restore');
  const client = useQueryClient();
  const [file, setFile] = useState<UploadableFile>();
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useNativeMessageState('');
  const [restoreDone, setRestoreDone] = useState(false);
  const status = useQuery({
    queryKey: ['localBackupStatus'],
    queryFn: backupWorkflowApi.localStatus,
    refetchInterval: 10000,
    enabled: canBackup,
  });
  const files = useQuery({
    queryKey: ['localBackups'],
    queryFn: backupWorkflowApi.localFiles,
    enabled: canBackup,
  });
  const path = useQuery({
    queryKey: ['localBackupPath'],
    queryFn: backupWorkflowApi.checkPath,
    enabled: canBackup,
  });
  const operation = useMutation({
    mutationFn: async (run: () => Promise<string>) => run(),
    onSuccess: async result => {
      setMessage(result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['localBackups'] }),
        client.invalidateQueries({ queryKey: ['localBackupStatus'] }),
      ]);
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const reconnect = async () => {
    client.clear();
    await logout();
    await useServerStore.getState().clearServerUrl();
    return t('backup.local.reconnect', {
      defaultValue:
        'Reconnect to the restarted server to reload authentication and restored settings.',
    });
  };
  const restored = async (
    run: () => ReturnType<typeof backupWorkflowApi.restoreSaved>,
  ) => {
    const server = useServerStore.getState().serverUrl;
    if (server) {
      const session = parseReportCollection(
        await AsyncStorage.getItem(reportSessionKey(server)),
      );
      if (session?.phase === 'logging') {
        const stopped = await stopReportCollection(server, session);
        client.setQueryData(['bugReportCollection', server], stopped);
      }
    }
    const result = requireBackupSuccess(await run());
    setRestoreDone(true);
    let warning = '';
    try {
      if (server) await saveReportCollection(server, null);
    } catch {
      warning = t('backup.local.draftCleanup', {
        defaultValue:
          'The stopped local bug-report draft could not be removed from this device. Discard it before starting a new report.',
      });
    }
    client.clear();
    const instructions = `${result.message} ${t('backup.local.restart', {
      defaultValue:
        'Restart the BambuBuddy server, then reconnect using the restored credentials.',
    })} ${server ?? ''} ${warning}`;
    Alert.alert(
      t('backup.local.restoreComplete', {
        defaultValue: 'Full backup restored',
      }),
      instructions,
      [
        {
          text: t('backup.local.reenter', {
            defaultValue: 'Re-enter restored system',
          }),
          onPress: () => operation.mutate(reconnect),
        },
      ],
      { cancelable: false },
    );
    return instructions;
  };
  const chooseZip = async () => {
    try {
      const [asset] = await pick({
        type: [types.zip],
        allowMultiSelection: false,
      });
      if (!asset?.name?.toLowerCase().endsWith('.zip'))
        throw new Error(
          t('backup.local.zipRequired', {
            defaultValue: 'Choose a ZIP backup.',
          }),
        );
      setFile({
        uri: asset.uri,
        name: asset.name.replace(/\.zip$/i, '.zip'),
        type: asset.type || 'application/zip',
      });
      setProgress(0);
    } catch (error) {
      if (
        !isErrorWithCode(error) ||
        error.code !== errorCodes.OPERATION_CANCELED
      ) {
        setMessage(
          error instanceof Error ? error.message : nativeMessage('backup.local.selectError', () => ({
                defaultValue: 'Unable to select backup.',
              })),
        );
      }
    }
  };
  const restore = (
    name: string,
    run: () => ReturnType<typeof backupWorkflowApi.restoreSaved>,
  ) =>
    confirmBackupAction(
      t('backup.local.restoreConfirm', {
        defaultValue: 'Replace the entire server?',
      }),
      t('backup.local.restoreWarning', {
        defaultValue:
          '{{name}} will replace the database and all data directories, including users and settings. Existing data will be lost. Restart the server afterwards.',
        name,
      }),
      () => operation.mutate(() => restored(run)),
      t,
    );
  return (
    <View style={styles.content}>
      {canBackup ? (
        <>
          <PrimaryButton
            label={t('backup.local.run', { defaultValue: 'Run local backup' })}
            variant="secondary"
            disabled={
              operation.isPending || status.data?.is_running || restoreDone
            }
            onPress={() =>
              operation.mutate(async () => {
                const result = requireBackupSuccess(
                  await backupWorkflowApi.runLocal(),
                );
                return result.diagnosis
                  ? `${result.message}\n${result.diagnosis.message}\n${result.diagnosis.detail}`
                  : result.message;
              })
            }
          />
          <PrimaryButton
            label={t('backup.local.export', {
              defaultValue: 'Export full backup',
            })}
            variant="secondary"
            disabled={operation.isPending || restoreDone}
            onPress={() =>
              operation.mutate(async () => {
                await shareBlob(
                  await backupApi.exportBackup(),
                  'bambuddy-backup.zip',
                );
                return t('backup.local.shared', {
                  defaultValue: 'Backup ready to save or share.',
                });
              })
            }
          />
          <Text style={{ color: colors.textSecondary }}>
            {t('backup.local.status', {
              defaultValue: 'Last run: {{last}} · {{status}}',
              last: formatDateTime(status.data?.last_backup_at ?? ''),
              status: status.data?.last_status ?? 'Never',
            })}
            {'\n'}
            {status.data?.last_message ?? ''}
            {'\n'}
            {t('backup.local.next', {
              defaultValue: 'Next: {{next}} · Timezone: {{timezone}}',
              next: status.data?.next_run ?? translateNative('native.ba3131e9720a27b0'),
              timezone: status.data?.timezone ?? 'Unavailable',
            })}
          </Text>
          {status.error ? (
            <Text style={{ color: colors.error }}>{status.error.message}</Text>
          ) : null}
          <PrimaryButton
            label={t('backup.local.validate', {
              defaultValue: 'Validate saved backup path',
            })}
            variant="secondary"
            onPress={() => {
              void path.refetch();
            }}
            loading={path.isFetching}
          />
          <Text
            style={{
              color: path.data?.writable ? colors.textSecondary : colors.error,
            }}
          >
            {path.error?.message ??
              (path.data
                ? `${path.data.path}: ${path.data.message}\n${
                    path.data.detail ?? ''
                  }\n${path.data.remedy ?? ''}`
                : t('backup.local.checking', {
                    defaultValue: 'Checking saved output path…',
                  }))}
          </Text>
          {path.data?.warning ? (
            <Text style={{ color: colors.error }}>
              {t('backup.local.ephemeral', {
                defaultValue:
                  'This directory is inside the container and may be lost when the container is replaced. Use a persistent bind mount or volume.',
              })}
            </Text>
          ) : null}
          <Text style={{ color: colors.textSecondary }}>
            {t('backup.local.saveFirst', {
              defaultValue: 'Save settings before validating a changed path.',
            })}
          </Text>
        </>
      ) : null}
      {canRestore ? (
        <PrimaryButton
          label={t('backup.local.choose', {
            defaultValue: 'Choose ZIP backup',
          })}
          variant="secondary"
          onPress={() => {
            void chooseZip();
          }}
          disabled={operation.isPending || restoreDone}
        />
      ) : null}
      {file && canRestore ? (
        <>
          <Text style={{ color: colors.text }}>{file.name}</Text>
          <PrimaryButton
            label={t('backup.local.restoreZip', {
              defaultValue: 'Restore selected ZIP',
            })}
            variant="danger"
            disabled={operation.isPending || restoreDone}
            onPress={() =>
              restore(file.name, () =>
                backupWorkflowApi.restoreZip(file, setProgress),
              )
            }
          />
        </>
      ) : null}
      {operation.isPending ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          {progress > 0
            ? t('backup.local.uploadProgress', {
                defaultValue:
                  '{{progress}}% uploaded; waiting for server restore',
                progress,
              })
            : t('backup.local.working', {
                defaultValue: 'Working… Waiting for server',
              })}
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          {message}
        </Text>
      ) : null}
      {restoreDone ? (
        <PrimaryButton
          label={t('backup.local.reenter', {
            defaultValue: 'Re-enter restored system',
          })}
          onPress={() => {
            operation.mutate(reconnect);
          }}
        />
      ) : null}
      {canBackup ? (
        <>
          <PrimaryButton
            label={t('backup.local.refresh', {
              defaultValue: 'Refresh saved backups',
            })}
            variant="secondary"
            onPress={() => {
              void files.refetch();
              void status.refetch();
            }}
          />
          {files.error ? (
            <Text style={{ color: colors.error }}>{files.error.message}</Text>
          ) : null}
          {files.data?.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>
              {t('backup.local.empty', { defaultValue: 'No saved backups.' })}
            </Text>
          ) : null}
          {files.data?.map(item => (
            <View key={item.filename} style={styles.content}>
              <Text selectable style={{ color: colors.text }}><NativeTranslation id="native.f1c8bb0f2d5282b5" values={{ value0: (item.filename), value1: (formatDateTime(item.created_at)), value2: (item.size.toLocaleString()) }} /></Text>
              <PrimaryButton
                label={t('backup.local.download', {
                  defaultValue: 'Download {{filename}}',
                  filename: item.filename,
                })}
                variant="secondary"
                disabled={operation.isPending || restoreDone}
                onPress={() =>
                  operation.mutate(async () => {
                    await shareBlob(
                      await backupApi.downloadLocalBackup(item.filename),
                      item.filename,
                    );
                    return t('backup.local.shared', {
                      defaultValue: 'Backup ready to save or share.',
                    });
                  })
                }
              />
              {canRestore ? (
                <PrimaryButton
                  label={t('backup.local.restoreSaved', {
                    defaultValue: 'Restore {{filename}}',
                    filename: item.filename,
                  })}
                  variant="danger"
                  disabled={operation.isPending || restoreDone}
                  onPress={() =>
                    restore(item.filename, () =>
                      backupWorkflowApi.restoreSaved(item.filename),
                    )
                  }
                />
              ) : null}
              <PrimaryButton
                label={t('backup.local.delete', {
                  defaultValue: 'Delete {{filename}}',
                  filename: item.filename,
                })}
                variant="danger"
                disabled={operation.isPending || restoreDone}
                onPress={() =>
                  confirmBackupAction(
                    t('backup.local.deleteConfirm', {
                      defaultValue: 'Delete saved backup?',
                    }),
                    item.filename,
                    () =>
                      operation.mutate(
                        async () =>
                          requireBackupSuccess(
                            await backupWorkflowApi.deleteSaved(item.filename),
                          ).message,
                      ),
                    t,
                  )
                }
              />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ content: { gap: spacing.md } });
