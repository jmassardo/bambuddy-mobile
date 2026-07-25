import { request, requestBlob } from './http';

export const backupApi = {
  exportBackup: async () => requestBlob('/settings/backup'),

  getLocalBackups: async () =>
    request<Record<string, unknown>[]>('/local-backup/backups'),

  createLocalBackup: async () =>
    request<Record<string, unknown>>('/local-backup/run', { method: 'POST' }),

  deleteLocalBackup: async (filename: string) =>
    request<void>(`/local-backup/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  getLocalBackupStatus: async () =>
    request<Record<string, unknown>>('/local-backup/status'),

  triggerLocalBackup: async () =>
    request<Record<string, unknown>>('/local-backup/run', {
      method: 'POST',
    }),

  downloadLocalBackup: async (filename: string) =>
    requestBlob(`/local-backup/backups/${encodeURIComponent(filename)}/download`),

  restoreLocalBackup: async (filename: string) =>
    request<Record<string, unknown>>(
      `/local-backup/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
    ),

  getGitHubBackupConfig: async () =>
    request<Record<string, unknown> | null>('/github-backup/config'),

  saveGitHubBackupConfig: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/github-backup/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGitHubBackupConfig: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/github-backup/config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  testGitHubBackupConnection: async (
    repoUrl: string,
    token: string,
    provider = 'github',
  ) =>
    request<Record<string, unknown>>('/github-backup/test', {
      method: 'POST',
      body: JSON.stringify({ repo_url: repoUrl, token, provider }),
    }),

  getGitHubBackupStatus: async () =>
    request<Record<string, unknown>>('/github-backup/status'),

  triggerGitHubBackup: async () =>
    request<Record<string, unknown>>('/github-backup/run', {
      method: 'POST',
    }),
};
