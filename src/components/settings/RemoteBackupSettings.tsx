import { NativeTranslation, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { backupWorkflowApi } from '@/api/backup';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import type {
  GitHubBackupConfigCreate,
  GitRestoreCategory,
  GitRestorePreview,
} from '@/types/api';
import { formatDateTime } from '@/utils/data';
import type { Permission } from '@/types/api';

import { OptionChipsField, SwitchRow, settingsStyles } from './shared';
import {
  confirmBackupAction,
  remoteConfigPayload,
  requireBackupSuccess,
  resolvedRestore,
} from './backupWorkflow';

const initialForm: GitHubBackupConfigCreate = {
  repository_url: '',
  access_token: '',
  branch: 'main',
  provider: 'github',
  allow_insecure_http: false,
  enabled: true,
  backup_kprofiles: true,
  backup_cloud_profiles: true,
  backup_settings: false,
  backup_spools: false,
  backup_archives: false,
};
const backupCategories = [
  'kprofiles',
  'cloud_profiles',
  'settings',
  'spools',
  'archives',
] as const;
const backupCategoryLabels = {
  get kprofiles() { return translateNative('backup.git.include.kprofiles', { defaultValue: 'Include K-profiles' }); },
  get cloud_profiles() { return translateNative('backup.git.include.cloud_profiles', { defaultValue: 'Include cloud profiles' }); },
  get settings() { return translateNative('backup.git.include.settings', { defaultValue: 'Include settings' }); },
  get spools() { return translateNative('backup.git.include.spools', { defaultValue: 'Include spools' }); },
  get archives() { return translateNative('backup.git.include.archives', { defaultValue: 'Include archives' }); },
};
const writePermissions: Record<GitRestoreCategory, Permission> = {
  kprofiles: 'kprofiles:update',
  settings: 'settings:update',
  spools: 'inventory:update',
  archives: 'archives:update_all',
};

export function RemoteBackupSettings() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { refreshUser, hasPermission } = useAuth();
  const client = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [schedule, setSchedule] = useState('manual');
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useNativeMessageState('');
  const [ref, setRef] = useState('HEAD');
  const [preview, setPreview] = useState<GitRestorePreview>();
  const [selected, setSelected] = useState<GitRestoreCategory[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const canBackup = hasPermission('github:backup');
  const canRestore = hasPermission('github:restore');
  const config = useQuery({
    queryKey: ['remoteBackupConfig'],
    queryFn: backupWorkflowApi.config,
    enabled: canBackup,
  });
  const status = useQuery({
    queryKey: ['remoteBackupStatus'],
    queryFn: backupWorkflowApi.status,
    refetchInterval: 3000,
    enabled: canBackup,
  });
  const commits = useQuery({
    queryKey: ['backupCommits'],
    queryFn: backupWorkflowApi.commits,
    enabled: canRestore,
  });
  const history = useInfiniteQuery({
    queryKey: ['backupHistory'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => backupWorkflowApi.history(pageParam),
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
    enabled: canBackup,
  });
  useEffect(() => {
    if (config.isSuccess && !initialized) {
      if (config.data) {
        setForm({ ...config.data, access_token: '' });
        setSchedule(
          config.data.schedule_enabled ? config.data.schedule_type : 'manual',
        );
      }
      setInitialized(true);
    }
  }, [config.data, config.isSuccess, initialized]);
  const operation = useMutation({
    mutationFn: (run: () => Promise<string>) => run(),
    onSuccess: async result => {
      setMessage(result);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['remoteBackupConfig'] }),
        client.invalidateQueries({ queryKey: ['remoteBackupStatus'] }),
        client.invalidateQueries({ queryKey: ['backupHistory'] }),
        client.invalidateQueries({ queryKey: ['backupCommits'] }),
      ]);
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const busy =
    operation.isPending ||
    Boolean(status.data?.is_running || status.data?.restore_running);
  const changeRef = (value: string) => {
    setRef(value);
    setPreview(undefined);
    setSelected([]);
  };
  const restore = () => {
    try {
      const requestData = resolvedRestore(preview, selected, t);
      confirmBackupAction(
        t('backup.git.restoreConfirm', {
          defaultValue: 'Restore selected Git backup?',
        }),
        t('backup.git.restoreWarning', {
          defaultValue:
            'Commit {{ref}}\nCategories: {{categories}}\nOverwrite database records: {{overwrite}}. K-profiles ALWAYS replace matching printer slots regardless of overwrite policy. Verify them on the printer afterwards.\nCloud presets are not restored. Credential-like settings are skipped. Archives contain metadata only, not 3MF files or thumbnails.',
          ref: requestData.ref,
          categories: requestData.categories.join(', '),
          overwrite: String(overwrite),
        }),
        () =>
          operation.mutate(async () => {
            const result = await backupWorkflowApi.restore(
              requestData.ref,
              requestData.categories,
              overwrite,
            );
            // Partial successes can modify data too.
            await client.invalidateQueries();
            await refreshUser();
            const detail = Object.entries(result.results)
              .map(
                ([category, value]) =>
                  t('backup.git.categoryResult', {
                    defaultValue:
                      '{{category}}: {{restored}} restored, {{skipped}} skipped, {{failed}} failed',
                    category,
                    restored: value.restored,
                    skipped: value.skipped,
                    failed: value.failed,
                  }) + `\n${value.notes.map(note => note.message).join('\n')}`,
              )
              .join('\n');
            return `${
              result.success
                ? t('backup.git.complete', {
                    defaultValue: 'Restore completed',
                  })
                : t('backup.git.attention', {
                    defaultValue: 'Restore needs attention',
                  })
            }: ${result.message}\n${detail}`;
          }),
        t,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  return (
    <SectionCard
      title={t('backup.git.title', { defaultValue: 'Remote Git backups' })}
      subtitle={t('backup.git.subtitle', {
        defaultValue:
          'Private repository backups, scheduling and selective restore.',
      })}
    >
      {config.error ? (
        <>
          <Text style={{ color: colors.error }}>{config.error.message}</Text>
          <PrimaryButton
            label={t('backup.git.retryConfig', {
              defaultValue: 'Retry remote configuration',
            })}
            variant="secondary"
            onPress={() => {
              void config.refetch();
            }}
          />
        </>
      ) : null}
      {canBackup ? (
        <>
          {config.isSuccess && !config.data ? (
            <Text style={{ color: colors.textSecondary }}>
              {t('backup.git.setup', {
                defaultValue:
                  'Remote backup is not configured. Choose a private repository, test access, then save to initialize backups.',
              })}
            </Text>
          ) : null}
          <SwitchRow
            label={t('backup.git.enabled', { defaultValue: 'Enabled' })}
            value={Boolean(form.enabled)}
            onValueChange={value =>
              setForm(current => ({ ...current, enabled: value }))
            }
          />
          <OptionChipsField
            label={t('backup.git.provider', { defaultValue: 'Provider' })}
            value={form.provider ?? 'github'}
            options={['github', 'gitlab', 'gitea', 'forgejo'].map(key => ({
              key,
              label: key,
            }))}
            onChange={value =>
              setForm(current => ({
                ...current,
                provider: value as typeof form.provider,
              }))
            }
          />
          <TextField
            label={t('backup.git.repo', { defaultValue: 'Repository URL' })}
            value={form.repository_url}
            autoCapitalize="none"
            onChangeText={value =>
              setForm(current => ({ ...current, repository_url: value }))
            }
          />
          <SwitchRow
            label={t('backup.git.http', {
              defaultValue: 'Allow insecure HTTP (token may be exposed)',
            })}
            value={Boolean(form.allow_insecure_http)}
            onValueChange={value =>
              setForm(current => ({ ...current, allow_insecure_http: value }))
            }
          />
          <TextField
            label={t('backup.git.token', { defaultValue: 'Access token' })}
            value={form.access_token}
            secureTextEntry
            autoCapitalize="none"
            placeholder={
              config.data?.has_token
                ? t('backup.git.keepToken', {
                    defaultValue: 'Leave blank to keep stored token',
                  })
                : t('backup.git.newToken', {
                    defaultValue: 'Personal access token',
                  })
            }
            onChangeText={value =>
              setForm(current => ({ ...current, access_token: value }))
            }
          />
          <TextField
            label={t('backup.git.branch', { defaultValue: 'Branch' })}
            value={form.branch}
            autoCapitalize="none"
            onChangeText={value =>
              setForm(current => ({ ...current, branch: value }))
            }
          />
          <OptionChipsField
            label={t('backup.git.schedule', { defaultValue: 'Schedule' })}
            value={schedule}
            options={['manual', 'hourly', 'daily', 'weekly'].map(key => ({
              key,
              get label() { return translateNative(`backup.git.schedule.${key}`, { defaultValue: key }); },
            }))}
            onChange={setSchedule}
          />
          <Text style={{ color: colors.textSecondary }}>
            {t('backup.git.serverTimes', {
              defaultValue:
                'Git schedules use server-managed times; the Git endpoint does not accept a time field.',
            })}
          </Text>
          {backupCategories.map(category => {
            const key = `backup_${category}` as const;
            return (
              <SwitchRow
                key={key}
                label={backupCategoryLabels[category]}
                value={Boolean(form[key])}
                onValueChange={value =>
                  setForm(current => ({ ...current, [key]: value }))
                }
              />
            );
          })}
          <Text style={{ color: colors.textSecondary }}>
            {t('backup.git.secrets', {
              defaultValue:
                'Settings may contain secrets. Cloud profiles collect connected accounts; use a private repository. Initial save tests repository privacy and may fail if permissions are insufficient.',
            })}
          </Text>
          <View style={settingsStyles.actions}>
            <PrimaryButton
              label={t('backup.git.test', { defaultValue: 'Test connection' })}
              variant="secondary"
              disabled={busy}
              onPress={() =>
                operation.mutate(async () => {
                  if (
                    !form.access_token.trim() &&
                    (form.repository_url !== config.data?.repository_url ||
                      form.provider !== config.data?.provider)
                  ) {
                    throw new Error(
                      t('backup.git.testChanged', {
                        defaultValue:
                          'Save changed repository/provider first or provide a token to test these values.',
                      }),
                    );
                  }
                  const result = requireBackupSuccess(
                    await backupWorkflowApi.test(
                      form.repository_url,
                      form.access_token,
                      form.provider ?? 'github',
                    ),
                  );
                  return `${result.message}\n${t('backup.git.privacy', {
                    defaultValue: 'Repository privacy: {{privacy}}',
                    privacy:
                      result.is_private === true
                        ? t('backup.git.private', { defaultValue: 'private' })
                        : result.is_private === false
                        ? t('backup.git.public', {
                            defaultValue: 'not private — cannot save',
                          })
                        : t('backup.git.unknownPrivacy', {
                            defaultValue: 'unverified — cannot save',
                          }),
                  })}`;
                })
              }
            />
            <PrimaryButton
              label={t('backup.git.save', {
                defaultValue: 'Save remote backup',
              })}
              disabled={
                busy ||
                !config.isSuccess ||
                !form.repository_url.trim() ||
                (!config.data && !form.access_token.trim())
              }
              onPress={() =>
                operation.mutate(async () => {
                  const payload = remoteConfigPayload(form, schedule);
                  // Response-only fields never leak back into the update payload.
                  const data = Object.fromEntries(
                    Object.entries(payload).filter(
                      ([key]) =>
                        Object.keys(initialForm).includes(key) ||
                        key === 'schedule_enabled' ||
                        key === 'schedule_type',
                    ),
                  );
                  await backupWorkflowApi.saveConfig(
                    data,
                    Boolean(config.data),
                  );
                  setForm(current => ({ ...current, access_token: '' }));
                  return t('backup.git.saved', {
                    defaultValue: 'Remote backup configuration saved.',
                  });
                })
              }
            />
            <PrimaryButton
              label={t('backup.git.run', { defaultValue: 'Run remote backup' })}
              variant="secondary"
              disabled={busy || !config.data}
              onPress={() =>
                operation.mutate(
                  async () =>
                    requireBackupSuccess(await backupWorkflowApi.runRemote())
                      .message,
                )
              }
            />
          </View>
        </>
      ) : null}
      <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
        {operation.isPending
          ? t('backup.git.working', { defaultValue: 'Working…\n' })
          : ''}
        {status.data?.progress ?? ''}
        {'\n'}
        {t('backup.git.last', {
          defaultValue: 'Last: {{status}} · {{date}}',
          status: status.data?.last_backup_status ?? 'Never',
          date: formatDateTime(status.data?.last_backup_at ?? ''),
        })}
        {'\n'}
        {config.data?.last_backup_message ?? ''}
        {'\n'}
        {t('backup.git.next', {
          defaultValue: 'Next: {{date}}',
          date: status.data?.next_scheduled_run ?? translateNative('native.ba3131e9720a27b0'),
        })}
      </Text>
      {status.error ? (
        <Text style={{ color: colors.error }}>{status.error.message}</Text>
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
      {canBackup ? (
        <>
          <PrimaryButton
            label={t('backup.git.refreshHistory', {
              defaultValue: 'Refresh backup history',
            })}
            variant="secondary"
            onPress={() => {
              void history.refetch();
            }}
          />
          {history.error ? (
            <Text style={{ color: colors.error }}>{history.error.message}</Text>
          ) : null}
          {history.data?.pages.flat().map(row => (
            <View key={row.id} style={settingsStyles.actions}>
              <Text style={{ color: colors.text }}><NativeTranslation id="native.97113b9e96a7644b" values={{ value0: (formatDateTime(row.started_at)), value1: (row.trigger), value2: (row.status), value3: (row.files_changed), value4: (row.error_message ?? '') }} /></Text>
              {row.commit_sha && config.data ? (
                <PrimaryButton
                  label={t('backup.git.commitLink', {
                    defaultValue: 'Commit {{sha}}',
                    sha: row.commit_sha,
                  })}
                  variant="secondary"
                  onPress={() => {
                    const repo = config
                      .data!.repository_url.replace(/\.git$/, '')
                      .replace(/^git@([^:]+):/, 'https://$1/');
                    const path =
                      config.data!.provider === 'gitlab'
                        ? '/-/commit/'
                        : '/commit/';
                    if (/^https?:\/\//.test(repo))
                      void Linking.openURL(`${repo}${path}${row.commit_sha}`);
                  }}
                />
              ) : null}
            </View>
          ))}
          {history.hasNextPage ? (
            <PrimaryButton
              label={t('backup.git.olderHistory', {
                defaultValue: 'Load older history',
              })}
              variant="secondary"
              loading={history.isFetchingNextPage}
              onPress={() => {
                void history.fetchNextPage();
              }}
            />
          ) : null}
          <PrimaryButton
            label={t('backup.git.clearHistory', {
              defaultValue: 'Clear backup history',
            })}
            variant="danger"
            disabled={busy}
            onPress={() =>
              confirmBackupAction(
                t('backup.git.clearConfirm', {
                  defaultValue: 'Clear backup history?',
                }),
                t('backup.git.clearWarning', {
                  defaultValue:
                    'This removes backup and restore log rows, not backup files.',
                }),
                () =>
                  operation.mutate(async () => {
                    await backupWorkflowApi.clearHistory();
                    return t('backup.git.historyCleared', {
                      defaultValue: 'Backup history cleared.',
                    });
                  }),
                t,
              )
            }
          />
        </>
      ) : null}
      {canRestore ? (
        <>
          <Text style={{ color: colors.text }}>
            {t('backup.git.restoreTitle', { defaultValue: 'Restore from Git' })}
          </Text>
          <PrimaryButton
            label={t('backup.git.refreshCommits', {
              defaultValue: 'Refresh commits',
            })}
            variant="secondary"
            onPress={() => {
              void commits.refetch();
            }}
          />
          {commits.error ? (
            <Text style={{ color: colors.error }}>{commits.error.message}</Text>
          ) : null}
          {commits.data && !commits.data.success ? (
            <Text style={{ color: colors.error }}>{commits.data.message}</Text>
          ) : null}
          <OptionChipsField
            label={t('backup.git.commit', { defaultValue: 'Backup commit' })}
            value={ref}
            disabled={busy}
            options={[
              {
                key: 'HEAD',
                get label() { return translateNative('backup.git.latest', { defaultValue: 'Latest' }); },
              },
              ...(commits.data?.commits ?? []).map(commit => ({
                key: commit.sha,
                label: `${commit.date} ${commit.sha.slice(0, 7)} ${
                  commit.message
                }`,
              })),
            ]}
            onChange={changeRef}
          />
          <TextField
            label={t('backup.git.ref', { defaultValue: 'Commit SHA or HEAD' })}
            value={ref}
            editable={!busy}
            autoCapitalize="none"
            onChangeText={changeRef}
          />
          <PrimaryButton
            label={t('backup.git.preview', {
              defaultValue: 'Preview selected commit',
            })}
            variant="secondary"
            disabled={busy}
            onPress={() =>
              operation.mutate(async () => {
                setPreview(undefined);
                setSelected([]);
                if (!/^(HEAD|[0-9a-f]{7,40})$/i.test(ref))
                  throw new Error(
                    t('backup.git.invalidRef', {
                      defaultValue: 'Enter HEAD or a valid Git commit SHA.',
                    }),
                  );
                const result = requireBackupSuccess(
                  await backupWorkflowApi.preview(
                    ref.toUpperCase() === 'HEAD' ? 'HEAD' : ref,
                  ),
                );
                setPreview(result);
                return result.message;
              })
            }
          />
          {preview ? (
            <>
              <Text selectable style={{ color: colors.text }}><NativeTranslation id="native.84a1fd50219ee308" values={{ value0: (preview.ref), value1: (preview.commit?.message), value2: (preview.metadata_version ?? 'Unavailable') }} /></Text>
              <Text style={{ color: colors.textSecondary }}>
                {t('backup.git.caveats', {
                  defaultValue:
                    'Archives restore metadata only, not print files or thumbnails. Credential-like settings and cloud presets cannot be restored. K-profiles always overwrite matching slots on configured, connected printers, even with overwrite disabled. A sent K-profile can count as restored without a printer acknowledgement; verify it on the device.',
                })}
              </Text>
              {preview.categories.map(category => (
                <View key={category.category}>
                  <SwitchRow
                    disabled={
                      !category.available ||
                      !hasPermission(writePermissions[category.category])
                    }
                    label={translateNative('native.6dd55c25a6d45151', { value0: String(category.category), value1: String(category.item_count), value2: String(category.available ? '' : '(unavailable)') })}
                    value={selected.includes(category.category)}
                    onValueChange={value => {
                      if (
                        !category.available ||
                        !hasPermission(writePermissions[category.category])
                      )
                        return;
                      setSelected(current =>
                        value
                          ? [...current, category.category]
                          : current.filter(item => item !== category.category),
                      );
                    }}
                  />
                  <Text style={{ color: colors.textSecondary }}>
                    {category.detail}
                  </Text>
                </View>
              ))}
              <SwitchRow
                label={t('backup.git.overwrite', {
                  defaultValue: 'Overwrite existing records',
                })}
                value={overwrite}
                disabled={busy}
                onValueChange={setOverwrite}
              />
              <PrimaryButton
                label={t('backup.git.restoreSelected', {
                  defaultValue: 'Restore selected categories',
                })}
                variant="danger"
                disabled={busy || !selected.length}
                onPress={restore}
              />
            </>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}
