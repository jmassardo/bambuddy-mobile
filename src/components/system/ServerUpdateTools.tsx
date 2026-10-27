import React, { useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { systemApi } from '@/api/system';
import { settingsApi } from '@/api/settings';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import {
  confirmBackupAction,
  requireBackupSuccess,
} from '@/components/settings/backupWorkflow';
import { useTheme } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';

export function ServerUpdateTools() {
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState(false);
  const [compose, setCompose] = useState<string>();
  const [updating, setUpdating] = useState(false);
  const check = useQuery({
    queryKey: ['serverUpdateCheck'],
    queryFn: systemApi.getUpdateInfo,
    enabled: false,
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    enabled: hasPermission('settings:read'),
  });
  const status = useQuery({
    queryKey: ['serverUpdateStatus'],
    queryFn: systemApi.getServerUpdateStatus,
    refetchInterval: query =>
      updating ||
      ['downloading', 'installing'].includes(query.state.data?.status ?? '')
        ? 3000
        : false,
  });
  const apply = useMutation({
    mutationFn: async () =>
      requireBackupSuccess(await systemApi.applyServerUpdate()),
    onSuccess: async () => {
      setUpdating(true);
      await status.refetch();
    },
  });
  const save = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({ docker_compose_dir: directory }),
    onSuccess: () => {
      void settings.refetch();
    },
  });
  const method =
    check.data?.update_method ??
    (check.data?.is_ha_addon
      ? 'ha_addon'
      : check.data?.is_docker
      ? 'docker'
      : check.data?.is_windows_installer
      ? 'windows_installer'
      : undefined);
  const directory =
    compose ??
    String(
      settings.data?.docker_compose_dir ||
        check.data?.compose_dir_detected ||
        '',
    );
  const active = ['downloading', 'installing'].includes(
    status.data?.status ?? '',
  );
  useEffect(() => {
    if (status.data?.status === 'complete' || status.data?.status === 'error')
      setUpdating(false);
  }, [status.data?.status]);
  return (
    <SectionCard
      title={t('system.updates.title', {
        defaultValue: 'BambuBuddy server updates',
      })}
      subtitle={t('system.updates.subtitle', {
        defaultValue: 'Updates the self-hosted server, not this mobile app.',
      })}
    >
      <PrimaryButton
        label={t('system.updates.check', {
          defaultValue: 'Check server updates now',
        })}
        loading={check.isFetching}
        onPress={() => {
          void check.refetch();
        }}
      />
      {check.error ? (
        <Text style={{ color: colors.error }}>{check.error.message}</Text>
      ) : null}
      {check.data ? (
        <>
          <Text style={{ color: colors.text }}>
            {t('system.updates.versions', {
              defaultValue: 'Current: {{current}} · Latest: {{latest}}',
              current: check.data.current_version,
              latest: check.data.latest_version ?? 'Unavailable',
            })}
          </Text>
          <Text
            style={{
              color: check.data.error ? colors.error : colors.textSecondary,
            }}
          >
            {check.data.error ??
              check.data.message ??
              (check.data.update_available
                ? t('system.updates.available', {
                    defaultValue: 'An update is available.',
                  })
                : t('system.updates.current', {
                    defaultValue: 'Server is up to date.',
                  }))}
          </Text>
          <PrimaryButton
            label={t('system.updates.notes', {
              defaultValue: 'Show / hide release notes',
            })}
            variant="secondary"
            onPress={() => setNotes(value => !value)}
          />
          {notes ? (
            <Text selectable style={{ color: colors.text }}>
              {check.data.release_name}
              {'\n'}
              {check.data.release_notes ||
                t('system.updates.noNotes', {
                  defaultValue: 'No release notes available.',
                })}
            </Text>
          ) : null}
          {check.data.release_url ? (
            <PrimaryButton
              label={t('system.updates.release', {
                defaultValue: 'Open server release',
              })}
              variant="secondary"
              onPress={() => {
                void Linking.openURL(check.data!.release_url!);
              }}
            />
          ) : null}
          {method === 'docker' ? (
            <>
              <Text style={{ color: colors.textSecondary }}>
                {t('system.updates.docker', {
                  defaultValue:
                    'Docker deployments must be updated on the server host. Confirm the directory containing your Compose file before running these commands. This app does not execute them.',
                })}
              </Text>
              <TextField
                label={t('system.updates.compose', {
                  defaultValue: 'Docker Compose directory',
                })}
                value={directory}
                autoCapitalize="none"
                onChangeText={setCompose}
              />
              {hasPermission('settings:update') ? (
                <PrimaryButton
                  label={t('system.updates.saveDirectory', {
                    defaultValue: 'Save Compose directory',
                  })}
                  loading={save.isPending}
                  onPress={() => save.mutate()}
                />
              ) : null}
              <Text selectable style={{ color: colors.text }}>
                {directory
                  ? `cd -- '${directory.replace(/'/g, "'\\''")}'\n`
                  : '# First change to your Compose directory\n'}
                docker compose pull{'\n'}docker compose up -d
              </Text>
            </>
          ) : null}
          {method === 'ha_addon' ? (
            <Text style={{ color: colors.text }}>
              {t('system.updates.ha', {
                defaultValue:
                  'Update through Home Assistant: Settings → Add-ons → Bambuddy → Update.',
              })}
            </Text>
          ) : null}
          {method === 'windows_installer' ? (
            <PrimaryButton
              label={t('system.updates.installer', {
                defaultValue: 'Download server Windows installer',
              })}
              variant="secondary"
              disabled={
                !check.data.installer_download_url && !check.data.release_url
              }
              onPress={() => {
                void Linking.openURL(
                  check.data!.installer_download_url ||
                    check.data!.release_url!,
                );
              }}
            />
          ) : null}
          {method === 'git' &&
          check.data.update_available &&
          hasPermission('settings:update') ? (
            <PrimaryButton
              label={t('system.updates.apply', {
                defaultValue: 'Update server now',
              })}
              variant="danger"
              disabled={active || apply.isPending}
              onPress={() =>
                confirmBackupAction(
                  t('system.updates.confirm', {
                    defaultValue: 'Update the BambuBuddy server?',
                  }),
                  t('system.updates.warning', {
                    defaultValue:
                      'Create a backup first. The server will rebuild and restart; connections may be interrupted. Do not update during active prints.',
                  }),
                  () => apply.mutate(),
                  t,
                )
              }
            />
          ) : null}
        </>
      ) : null}
      {status.data ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: status.data.error ? colors.error : colors.text }}
        >
          {status.data.status} · {status.data.progress}% · {status.data.message}
          {'\n'}
          {status.data.error}
        </Text>
      ) : null}
      {apply.error || save.error || status.error ? (
        <Text style={{ color: colors.error }}>
          {apply.error?.message ?? save.error?.message ?? status.error?.message}
        </Text>
      ) : null}
      <PrimaryButton
        label={t('system.updates.refreshStatus', {
          defaultValue: 'Refresh server update status',
        })}
        variant="secondary"
        onPress={() => {
          void status.refetch();
          if (!active) setUpdating(false);
        }}
      />
    </SectionCard>
  );
}
