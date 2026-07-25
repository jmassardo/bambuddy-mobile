import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime, pickBoolean, pickString, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';
import { OptionChipsField, SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';

type GitHubBackupFormState = {
  repository_url: string;
  access_token: string;
  branch: string;
  provider: 'github' | 'gitea' | 'forgejo' | 'gitlab';
  enabled: boolean;
  schedule_enabled: boolean;
  schedule_type: 'manual' | 'hourly' | 'daily' | 'weekly';
  schedule_time: string;
  allow_insecure_http: boolean;
  backup_settings: boolean;
  backup_spools: boolean;
  backup_archives: boolean;
  backup_kprofiles: boolean;
  backup_cloud_profiles: boolean;
};

const EMPTY_GITHUB_BACKUP_FORM: GitHubBackupFormState = {
  repository_url: '',
  access_token: '',
  branch: 'main',
  provider: 'github',
  enabled: true,
  schedule_enabled: false,
  schedule_type: 'daily',
  schedule_time: '02:00',
  allow_insecure_http: false,
  backup_settings: false,
  backup_spools: false,
  backup_archives: false,
  backup_kprofiles: true,
  backup_cloud_profiles: true,
};

export default function BackupSection() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();
  const [githubBackupForm, setGithubBackupForm] = useState<GitHubBackupFormState>(EMPTY_GITHUB_BACKUP_FORM);

  const githubBackupQuery = useQuery({ queryKey: ['githubBackupStatus'], queryFn: api.getGitHubBackupStatus });
  const githubBackupConfigQuery = useQuery({ queryKey: ['githubBackupConfig'], queryFn: api.getGitHubBackupConfig });
  const localBackupStatusQuery = useQuery({ queryKey: ['localBackupStatus'], queryFn: api.getLocalBackupStatus });
  const localBackupsQuery = useQuery({ queryKey: ['localBackups'], queryFn: api.getLocalBackups });

  useEffect(() => {
    const config = githubBackupConfigQuery.data;
    if (!config) {
      setGithubBackupForm(EMPTY_GITHUB_BACKUP_FORM);
      return;
    }
    setGithubBackupForm({
      repository_url: pickString(config as ApiRecord, ['repository_url']),
      access_token: '',
      branch: pickString(config as ApiRecord, ['branch'], 'main'),
      provider: pickString(config as ApiRecord, ['provider'], 'github') as GitHubBackupFormState['provider'],
      enabled: pickBoolean(config as ApiRecord, ['enabled'], true),
      schedule_enabled: pickBoolean(config as ApiRecord, ['schedule_enabled']),
      schedule_type: pickString(config as ApiRecord, ['schedule_type'], 'daily') as GitHubBackupFormState['schedule_type'],
      schedule_time: pickString(config as ApiRecord, ['schedule_time'], '02:00'),
      allow_insecure_http: pickBoolean(config as ApiRecord, ['allow_insecure_http']),
      backup_settings: pickBoolean(config as ApiRecord, ['backup_settings']),
      backup_spools: pickBoolean(config as ApiRecord, ['backup_spools']),
      backup_archives: pickBoolean(config as ApiRecord, ['backup_archives']),
      backup_kprofiles: pickBoolean(config as ApiRecord, ['backup_kprofiles'], true),
      backup_cloud_profiles: pickBoolean(config as ApiRecord, ['backup_cloud_profiles'], true),
    });
  }, [githubBackupConfigQuery.data]);

  const backupMutation = useMutation({
    mutationFn: api.triggerLocalBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['localBackupStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['localBackups'] });
      showToast('Local backup started.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to start backup.', 'error'),
  });

  const exportBackupMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.exportBackup();
      await shareBlob(blob, 'bambuddy-backup.zip');
    },
    onSuccess: () => showToast('Backup ready to share.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export backup.', 'error'),
  });

  const githubBackupMutation = useMutation({
    mutationFn: api.triggerGitHubBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup triggered.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to run GitHub backup.', 'error'),
  });

  const saveGitHubBackupMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        repository_url: githubBackupForm.repository_url.trim(),
        branch: githubBackupForm.branch.trim() || 'main',
        provider: githubBackupForm.provider,
        enabled: githubBackupForm.enabled,
        schedule_enabled: githubBackupForm.schedule_enabled,
        schedule_type: githubBackupForm.schedule_type,
        allow_insecure_http: githubBackupForm.allow_insecure_http,
        backup_settings: githubBackupForm.backup_settings,
        backup_spools: githubBackupForm.backup_spools,
        backup_archives: githubBackupForm.backup_archives,
        backup_kprofiles: githubBackupForm.backup_kprofiles,
        backup_cloud_profiles: githubBackupForm.backup_cloud_profiles,
      };
      if (githubBackupForm.access_token.trim()) {
        payload.access_token = githubBackupForm.access_token.trim();
      }
      return githubBackupConfigQuery.data ? api.updateGitHubBackupConfig(payload) : api.saveGitHubBackupConfig(payload);
    },
    onSuccess: async () => {
      setGithubBackupForm(current => ({ ...current, access_token: '' }));
      await queryClient.invalidateQueries({ queryKey: ['githubBackupConfig'] });
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save GitHub backup settings.', 'error'),
  });

  const handleSaveGitHubBackup = () => {
    if (!githubBackupForm.repository_url.trim()) {
      showToast('Repository URL is required.', 'error');
      return;
    }
    if (!githubBackupConfigQuery.data && !githubBackupForm.access_token.trim()) {
      showToast('Access token is required for the first save.', 'error');
      return;
    }
    saveGitHubBackupMutation.mutate();
  };

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading backups…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load backup settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Local backups" subtitle="Schedule, retention, and ad-hoc backup actions.">
        <SwitchRow label="Scheduled local backup enabled" value={pickBoolean(draft, ['local_backup_enabled'])} onValueChange={value => setDraft(current => ({ ...current, local_backup_enabled: value }))} />
        <TextField label="Schedule" value={pickString(draft, ['local_backup_schedule'], 'daily')} onChangeText={value => setDraft(current => ({ ...current, local_backup_schedule: value }))} />
        <TextField label="Run time" value={pickString(draft, ['local_backup_time'], '02:00')} onChangeText={value => setDraft(current => ({ ...current, local_backup_time: value }))} />
        <TextField label="Retention" value={stringifyNumberField(draft.local_backup_retention, '7')} onChangeText={value => setDraft(current => ({ ...current, local_backup_retention: Number(value) || 7 }))} keyboardType="number-pad" />
        <TextField label="Backup path" value={pickString(draft, ['local_backup_path'])} onChangeText={value => setDraft(current => ({ ...current, local_backup_path: value }))} autoCapitalize="none" />
        <Text style={styles.helper}>Last run: {pickString(localBackupStatusQuery.data as ApiRecord | undefined, ['last_backup_at'], 'Never')}</Text>
        <View style={styles.actions}>
          <PrimaryButton label="Run local backup" variant="secondary" onPress={() => void backupMutation.mutateAsync()} loading={backupMutation.isPending} />
          <PrimaryButton label="Export full backup" variant="secondary" onPress={() => void exportBackupMutation.mutateAsync()} loading={exportBackupMutation.isPending} />
        </View>
        <Text style={styles.helper}>Saved backups: {((localBackupsQuery.data ?? []) as ApiRecord[]).length}</Text>
      </SectionCard>
      <SectionCard title="GitHub backup" subtitle="Remote backup trigger and recent status.">
        <SwitchRow label="Enabled" value={githubBackupForm.enabled} onValueChange={value => setGithubBackupForm(current => ({ ...current, enabled: value }))} />
        <TextField label="Repository URL" value={githubBackupForm.repository_url} onChangeText={value => setGithubBackupForm(current => ({ ...current, repository_url: value }))} autoCapitalize="none" />
        <TextField label="Token" value={githubBackupForm.access_token} onChangeText={value => setGithubBackupForm(current => ({ ...current, access_token: value }))} secureTextEntry autoCapitalize="none" placeholder="ghp_…" />
        <TextField label="Branch" value={githubBackupForm.branch} onChangeText={value => setGithubBackupForm(current => ({ ...current, branch: value }))} autoCapitalize="none" />
        <OptionChipsField label="Schedule" value={githubBackupForm.schedule_type} options={[{ key: 'manual', label: 'Manual' }, { key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }]} onChange={value => setGithubBackupForm(current => ({ ...current, schedule_type: value as GitHubBackupFormState['schedule_type'] }))} />
        <TextField label="Schedule time" value={githubBackupForm.schedule_time} onChangeText={value => setGithubBackupForm(current => ({ ...current, schedule_time: value }))} placeholder="02:00" />
        <Text style={styles.helper}>Configured: {pickBoolean(githubBackupQuery.data as ApiRecord | undefined, ['configured']) ? 'yes' : 'no'}</Text>
        <Text style={styles.helper}>Last status: {pickString(githubBackupQuery.data as ApiRecord | undefined, ['last_backup_status', 'last_status'], 'Unknown')}</Text>
        <Text style={styles.helper}>Last backup: {formatDateTime(pickString(githubBackupQuery.data as ApiRecord | undefined, ['last_backup_at']))}</Text>
        <Text style={styles.helper}>Last message: {pickString(githubBackupQuery.data as ApiRecord | undefined, ['last_error', 'message'], '—')}</Text>
        <View style={styles.actions}>
          <PrimaryButton label={saveGitHubBackupMutation.isPending ? 'Saving…' : 'Save GitHub backup'} onPress={handleSaveGitHubBackup} loading={saveGitHubBackupMutation.isPending} disabled={saveGitHubBackupMutation.isPending} />
          <PrimaryButton label={githubBackupMutation.isPending ? 'Running…' : 'Run GitHub backup'} variant="secondary" onPress={() => void githubBackupMutation.mutateAsync()} loading={githubBackupMutation.isPending} disabled={githubBackupMutation.isPending} />
        </View>
      </SectionCard>
      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />
    </>
  );
}
