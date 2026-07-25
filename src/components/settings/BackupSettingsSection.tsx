import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow, settingsStyles, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { formatDateTime } from '@/utils/data';

export function BackupSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft, githubBackupForm } = controller.state;
  const { setDraft, setGithubBackupForm } = controller.actions;
  const { localBackupStatusQuery, localBackupsQuery, githubBackupQuery } = controller.queries;
  const { backupMutation, exportBackupMutation, saveGitHubBackupMutation, githubBackupMutation } = controller.mutations;

  return (
    <>
      <SectionCard title="Local backups" subtitle="Schedule, retention, and ad-hoc backup actions.">
        <SwitchRow label="Scheduled local backup enabled" value={Boolean(draft.local_backup_enabled)} onValueChange={value => setDraft(current => ({ ...current, local_backup_enabled: value }))} />
        <TextField label="Schedule" value={String(draft.local_backup_schedule ?? 'daily')} onChangeText={value => setDraft(current => ({ ...current, local_backup_schedule: value }))} />
        <TextField label="Run time" value={String(draft.local_backup_time ?? '02:00')} onChangeText={value => setDraft(current => ({ ...current, local_backup_time: value }))} />
        <TextField label="Retention" value={stringifyNumberField(draft.local_backup_retention, '7')} onChangeText={value => setDraft(current => ({ ...current, local_backup_retention: Number(value) || 7 }))} keyboardType="number-pad" />
        <TextField label="Backup path" value={String(draft.local_backup_path ?? '')} onChangeText={value => setDraft(current => ({ ...current, local_backup_path: value }))} autoCapitalize="none" />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Last run: {String(localBackupStatusQuery.data?.last_backup_at ?? 'Never')}</Text>
        <View style={settingsStyles.actions}>
          <PrimaryButton label="Run local backup" variant="secondary" onPress={() => void backupMutation.mutateAsync()} loading={backupMutation.isPending} />
          <PrimaryButton label="Export full backup" variant="secondary" onPress={() => void exportBackupMutation.mutateAsync()} loading={exportBackupMutation.isPending} />
        </View>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Saved backups: {(localBackupsQuery.data ?? []).length}</Text>
      </SectionCard>
      <SectionCard title="GitHub backup" subtitle="Remote backup trigger and recent status.">
        <SwitchRow label="Enabled" value={githubBackupForm.enabled} onValueChange={value => setGithubBackupForm(current => ({ ...current, enabled: value }))} />
        <TextField label="Repository URL" value={githubBackupForm.repository_url} onChangeText={value => setGithubBackupForm(current => ({ ...current, repository_url: value }))} autoCapitalize="none" />
        <TextField label="Token" value={githubBackupForm.access_token} onChangeText={value => setGithubBackupForm(current => ({ ...current, access_token: value }))} secureTextEntry autoCapitalize="none" placeholder="ghp_…" />
        <TextField label="Branch" value={githubBackupForm.branch} onChangeText={value => setGithubBackupForm(current => ({ ...current, branch: value }))} autoCapitalize="none" />
        <OptionChipsField
          label="Schedule"
          value={githubBackupForm.schedule_type}
          options={[
            { key: 'manual', label: 'Manual' },
            { key: 'daily', label: 'Daily' },
            { key: 'weekly', label: 'Weekly' },
          ]}
          onChange={value => setGithubBackupForm(current => ({ ...current, schedule_type: value }))}
        />
        <TextField label="Schedule time" value={githubBackupForm.schedule_time} onChangeText={value => setGithubBackupForm(current => ({ ...current, schedule_time: value }))} placeholder="02:00" />
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Configured: {githubBackupQuery.data?.configured ? 'yes' : 'no'}</Text>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Last status: {String(githubBackupQuery.data?.last_backup_status ?? githubBackupQuery.data?.last_status ?? 'Unknown')}</Text>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Last backup: {formatDateTime(String(githubBackupQuery.data?.last_backup_at ?? ''))}</Text>
        <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Last message: {String(githubBackupQuery.data?.last_error ?? githubBackupQuery.data?.message ?? '—')}</Text>
        <View style={settingsStyles.actions}>
          <PrimaryButton label={saveGitHubBackupMutation.isPending ? 'Saving…' : 'Save GitHub backup'} onPress={controller.actions.handleSaveGitHubBackup} loading={saveGitHubBackupMutation.isPending} disabled={saveGitHubBackupMutation.isPending} />
          <PrimaryButton label={githubBackupMutation.isPending ? 'Running…' : 'Run GitHub backup'} variant="secondary" onPress={() => void githubBackupMutation.mutateAsync()} loading={githubBackupMutation.isPending} disabled={githubBackupMutation.isPending} />
        </View>
      </SectionCard>
    </>
  );
}
