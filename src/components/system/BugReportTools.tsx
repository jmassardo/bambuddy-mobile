import { nativeMessage, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, StyleSheet, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '@/api/system';
import { printersApi } from '@/api/printers';
import { useServerStore } from '@/api/server';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { SwitchRow } from '@/components/settings/shared';
import { requireBackupSuccess } from '@/components/settings/backupWorkflow';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';

import { SystemHealthPanel } from './SystemHealthPanel';
import { DiagnosticChecklist } from './DiagnosticChecklist';
import {
  MAX_REPORT_LOG_SECONDS,
  editReportCollection,
  loadReportCollection,
  mergeReportCollectionState,
  saveReportCollection,
  stopReportCollection,
  type ReportCollection,
  type ReportCollectionEdits,
} from './bugReportCollection';

export function useReportCollection() {
  const server = useServerStore(state => state.serverUrl) ?? '';
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['bugReportCollection', server],
    queryFn: () => loadReportCollection(server),
    staleTime: Infinity,
    enabled: Boolean(server),
  });
  const update = async (value: ReportCollection | null) => {
    await saveReportCollection(server, value);
    client.setQueryData(['bugReportCollection', server], value);
  };
  return { server, session, update };
}

/** Mount once above navigation: expiry restores debug logging, never submits a report. */
export function BugReportCollectionGuard() {
  const { server, session } = useReportCollection();
  const { loading, authEnabled, user, hasPermission } = useAuth();
  const canStop =
    !loading &&
    (!authEnabled || Boolean(user)) &&
    hasPermission('settings:read');
  const client = useQueryClient();
  const running = useRef(false);
  useEffect(() => {
    const current = session.data;
    if (!current || current.phase !== 'logging' || !server || !canStop) return;
    const check = async () => {
      if (
        running.current ||
        Date.now() - current.startedAt < MAX_REPORT_LOG_SECONDS * 1000
      )
        return;
      running.current = true;
      try {
        const stopped = await stopReportCollection(server, current);
        client.setQueryData<ReportCollection | null>(
          ['bugReportCollection', server],
          latest => mergeReportCollectionState(latest, stopped),
        );
        client.setQueryData(['bugReportCollectionError', server], null);
        await client.invalidateQueries({ queryKey: ['debugLoggingState'] });
      } catch (error) {
        client.setQueryData(
          ['bugReportCollectionError', server],
          (error as Error).message,
        );
      } finally {
        running.current = false;
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, 5000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [client, server, session.data, canStop]);
  return null;
}

export function BugReportTools() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const { server, session, update } = useReportCollection();
  const collectionError = useQuery<string | null>({
    queryKey: ['bugReportCollectionError', server],
    queryFn: async () => null,
    enabled: false,
    initialData: null,
  });
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [include, setInclude] = useState(true);
  const [screenshot, setScreenshot] = useState<string>();
  const [message, setMessage] = useNativeMessageState('');
  const [issueUrl, setIssueUrl] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const hydratedRun = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = session.data
      ? `${server}:${session.data.startedAt}`
      : undefined;
    if (session.data && hydratedRun.current !== key) {
      setDescription(session.data.description);
      setEmail(session.data.email);
      setInclude(session.data.includeSupportInfo);
      hydratedRun.current = key;
    }
  }, [server, session.data]);
  useEffect(() => {
    if (session.data?.phase !== 'logging') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session.data?.phase]);
  const diagnostics = useQuery({
    queryKey: ['bugReportDiagnostics'],
    queryFn: async () => {
      const printers = await printersApi.getPrinters();
      return Promise.all(
        printers.map(async printer => {
          try {
            const result = await systemApi.getReportPrinterDiagnostic(
              printer.id,
            );
            return { name: printer.name, result, error: '' };
          } catch (error) {
            return {
              name: printer.name,
              result: null,
              error: (error as Error).message,
            };
          }
        }),
      );
    },
  });
  const health = useQuery({
    queryKey: ['systemHealth'],
    queryFn: systemApi.getSystemHealth,
  });
  const action = useMutation({
    mutationFn: (run: () => Promise<string>) => run(),
    onSuccess: async result => {
      setMessage(result);
      await client.invalidateQueries({ queryKey: ['debugLoggingState'] });
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const persistEdits = (edits: ReportCollectionEdits) => {
    const key = ['bugReportCollection', server];
    const current = client.getQueryData<ReportCollection | null>(key);
    if (!current) return;
    const draft = {
      description: current.description,
      email: current.email,
      includeSupportInfo: current.includeSupportInfo,
      ...edits,
    };
    client.setQueryData<ReportCollection | null>(key, latest =>
      latest?.startedAt === current.startedAt
        ? { ...latest, ...edits }
        : latest,
    );
    void editReportCollection(server, current.startedAt, draft)
      .then(saved => {
        client.setQueryData<ReportCollection | null>(key, latest =>
          mergeReportCollectionState(latest, saved),
        );
      })
      .catch((error: Error) =>
        setMessage(
          nativeMessage('system.report.draftSaveError', () => ({
            defaultValue:
              'Unable to save report edits: {{error}}. Keep this screen open and retry the edit before restarting the app.',
            error: error.message,
          })),
        ),
      );
  };
  const attach = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.7,
      });
      if (result.didCancel) return;
      if (result.errorMessage) throw new Error(result.errorMessage);
      const image = result.assets?.[0];
      if (!image?.base64)
        throw new Error(
          t('system.report.imageError', {
            defaultValue: 'Unable to read selected screenshot.',
          }),
        );
      setScreenshot(
        `data:${image.type || 'image/jpeg'};base64,${image.base64}`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const stop = async () => {
    if (!session.data)
      throw new Error(
        t('system.report.noSession', {
          defaultValue: 'No logging session to stop.',
        }),
      );
    const stopped = await stopReportCollection(server, {
      ...session.data,
      description,
      email,
      includeSupportInfo: include,
    });
    client.setQueryData<ReportCollection | null>(
      ['bugReportCollection', server],
      latest => mergeReportCollectionState(latest, stopped),
    );
    client.setQueryData(['bugReportCollectionError', server], null);
    return stopped;
  };
  const submit = async () => {
    const stopped = await stop();
    const result = requireBackupSuccess(
      await systemApi.submitBugReport({
        description: description.trim(),
        email: email.trim() || undefined,
        include_support_info: include,
        screenshot_base64: screenshot,
        debug_logs: stopped.logs,
      }),
    );
    await update(null);
    setIssueUrl(result.issue_url);
    setScreenshot(undefined);
    return result.message;
  };
  const elapsed = session.data
    ? Math.min(
        MAX_REPORT_LOG_SECONDS,
        Math.max(0, Math.floor((now - session.data.startedAt) / 1000)),
      )
    : 0;
  return (
    <SectionCard
      title={t('system.report.title', { defaultValue: 'Guided bug report' })}
      subtitle={t('system.report.privacy', {
        defaultValue:
          'Nothing is sent until you explicitly choose Stop and submit. Reports are sent by your server to the BambuBuddy issue tracker. Review screenshots for private information.',
      })}
    >
      {session.error ? (
        <Text style={{ color: colors.error }}>{session.error.message}</Text>
      ) : null}
      {collectionError.data ? (
        <Text style={{ color: colors.error }}>
          {t('system.report.autoStopError', {
            defaultValue:
              'Collection reached its time limit, but logging could not be restored: {{error}}. Reconnect and retry stopping collection.',
            error: collectionError.data,
          })}
        </Text>
      ) : null}
      <Text style={{ color: colors.text }}>
        {t('system.report.preflight', { defaultValue: 'Diagnostic preflight' })}
      </Text>
      <PrimaryButton
        label={t('system.report.rescan', {
          defaultValue: 'Rescan printer diagnostics',
        })}
        loading={diagnostics.isFetching}
        variant="secondary"
        onPress={() => {
          void diagnostics.refetch();
          void health.refetch();
        }}
      />
      {diagnostics.error ? (
        <Text style={{ color: colors.error }}>{diagnostics.error.message}</Text>
      ) : null}
      {diagnostics.data?.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          {t('system.report.noPrinters', {
            defaultValue: 'No configured printers.',
          })}
        </Text>
      ) : null}
      {diagnostics.data?.map((entry, index) => (
        <View key={index} style={styles.group}>
          <Text style={{ color: colors.text }}>
            {entry.name} · {entry.result?.overall ?? entry.error}
          </Text>
          {entry.result ? <DiagnosticChecklist result={entry.result} /> : null}
        </View>
      ))}
      {health.data ? <SystemHealthPanel result={health.data} /> : null}
      {health.error ? (
        <Text style={{ color: colors.error }}>{health.error.message}</Text>
      ) : null}
      <TextField
        label={t('system.report.description', {
          defaultValue: 'Describe the problem and reproduction steps',
        })}
        multiline
        editable={!action.isPending}
        value={description}
        onChangeText={value => {
          setDescription(value);
          persistEdits({ description: value });
        }}
      />
      <TextField
        label={t('system.report.email', { defaultValue: 'Email (optional)' })}
        editable={!action.isPending}
        value={email}
        onChangeText={value => {
          setEmail(value);
          persistEdits({ email: value });
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <SwitchRow
        label={t('system.report.include', {
          defaultValue:
            'Include diagnostic support information and sanitized debug logs',
        })}
        disabled={action.isPending}
        value={include}
        onValueChange={value => {
          setInclude(value);
          persistEdits({ includeSupportInfo: value });
        }}
      />
      <Text style={{ color: colors.textSecondary }}>
        {t('system.report.collection', {
          defaultValue:
            'Collection includes server/runtime information, connected-printer diagnostics and recent sanitized logs. Optional email and screenshot are included only when provided. Debug logging runs for at most five minutes and restores its previous setting; no report is automatically submitted. The draft and sanitized captured logs stay on this device until submission or discard. Screenshots are not saved across app restarts.',
        })}
      </Text>
      <PrimaryButton
        label={t('system.report.attach', { defaultValue: 'Attach screenshot' })}
        variant="secondary"
        onPress={() => {
          void attach();
        }}
        disabled={action.isPending}
      />
      {screenshot ? (
        <>
          <Image
            source={{ uri: screenshot }}
            style={styles.preview}
            accessibilityLabel={t('system.report.screenshot', {
              defaultValue: 'Attached screenshot preview',
            })}
          />
          <PrimaryButton
            label={t('system.report.remove', {
              defaultValue: 'Remove screenshot',
            })}
            variant="secondary"
            onPress={() => setScreenshot(undefined)}
          />
        </>
      ) : null}
      {!session.data ? (
        <PrimaryButton
          label={t('system.report.start', {
            defaultValue: 'Start diagnostic logging',
          })}
          disabled={
            action.isPending ||
            session.isLoading ||
            !server ||
            description.trim().length < 10 ||
            !hasPermission('settings:update')
          }
          onPress={() =>
            action.mutate(async () => {
              const result = await systemApi.startBugReportLogging();
              if (!result.started)
                throw new Error(
                  t('system.report.startError', {
                    defaultValue: 'The server did not start collection.',
                  }),
                );
              const current: ReportCollection = {
                description,
                email,
                includeSupportInfo: include,
                startedAt: Date.now(),
                wasDebug: result.was_debug,
                phase: 'logging',
              };
              try {
                await update(current);
              } catch (error) {
                try {
                  await systemApi.stopBugReportLogging(result.was_debug);
                } catch {
                  client.setQueryData(['bugReportCollection', server], current);
                  throw new Error(
                    t('system.report.persistenceError', {
                      defaultValue:
                        'Collection could not be saved and logging could not be restored. Keep this screen open and retry stopping collection.',
                    }),
                  );
                }
                throw error;
              }
              setIssueUrl(undefined);
              return t('system.report.reproduce', {
                defaultValue:
                  'Collection started. Leave this screen to reproduce the problem, then return to stop and submit.',
              });
            })
          }
        />
      ) : (
        <>
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
            {session.data.phase === 'logging'
              ? t('system.report.timer', {
                  defaultValue:
                    'Reproduce the problem: {{elapsed}} / {{maximum}} seconds. You can leave this screen.',
                  elapsed,
                  maximum: MAX_REPORT_LOG_SECONDS,
                })
              : t('system.report.stopped', {
                  defaultValue:
                    'Collection stopped; prior debug setting restored. Your draft is ready to review or retry.',
                })}
          </Text>
          <PrimaryButton
            label={
              session.data.phase === 'logging'
                ? t('system.report.stopSubmit', {
                    defaultValue: 'Stop and submit report',
                  })
                : t('system.report.retry', {
                    defaultValue: 'Submit / retry report',
                  })
            }
            disabled={
              action.isPending ||
              description.trim().length < 10 ||
              Boolean(
                email.trim() &&
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
              )
            }
            onPress={() => action.mutate(submit)}
          />
          <PrimaryButton
            label={t('system.report.stopOnly', {
              defaultValue: 'Stop collection without submitting',
            })}
            variant="secondary"
            disabled={action.isPending || session.data.phase === 'stopped'}
            onPress={() =>
              action.mutate(async () => {
                await stop();
                return t('system.report.notSent', {
                  defaultValue: 'Collection stopped. Nothing was submitted.',
                });
              })
            }
          />
          <PrimaryButton
            label={t('system.report.discard', {
              defaultValue: 'Discard report and restore logging',
            })}
            variant="danger"
            disabled={action.isPending}
            onPress={() =>
              action.mutate(async () => {
                await stop();
                await update(null);
                setScreenshot(undefined);
                return t('system.report.discarded', {
                  defaultValue: 'Report discarded. Nothing was submitted.',
                });
              })
            }
          />
        </>
      )}
      {action.isPending ? (
        <Text style={{ color: colors.text }}>
          {t('system.report.working', {
            defaultValue: 'Processing collection / report…',
          })}
        </Text>
      ) : null}
      {message ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          style={{ color: colors.text }}
        >
          {message}
        </Text>
      ) : null}
      {issueUrl ? (
        <PrimaryButton
          label={t('system.report.openIssue', {
            defaultValue: 'Open submitted issue',
          })}
          variant="secondary"
          onPress={() => {
            void Linking.openURL(issueUrl);
          }}
        />
      ) : null}
    </SectionCard>
  );
}
const styles = StyleSheet.create({
  group: { gap: 4 },
  preview: { width: '100%', height: 200, resizeMode: 'contain' },
});
