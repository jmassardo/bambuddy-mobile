import type {
  BackupOperationResult,
  BackupPathCheck,
  GitBackupCommit,
  GitHubBackupConfig,
  GitHubBackupConfigCreate,
  GitHubBackupLog,
  GitHubBackupStatus,
  GitHubTestConnectionResponse,
  GitRestoreCategory,
  GitRestorePreview,
  GitRestoreResult,
  LocalBackupFile,
  LocalBackupStatus,
} from '@/types/api';
import {
  request,
  requestBlob,
  uploadFileWithProgress,
  UPLOAD_TIMEOUT_MS,
  type UploadableFile,
} from './http';

export const backupApi = {
  exportBackup: async () => requestBlob('/settings/backup'),

  getLocalBackups: async () =>
    request<Record<string, unknown>[]>('/local-backup/backups'),

  createLocalBackup: async () =>
    request<Record<string, unknown>>(
      '/local-backup/run',
      { method: 'POST' },
      UPLOAD_TIMEOUT_MS,
    ),

  deleteLocalBackup: async (filename: string) =>
    request<void>(`/local-backup/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  getLocalBackupStatus: async () =>
    request<Record<string, unknown>>('/local-backup/status'),

  triggerLocalBackup: async () =>
    request<Record<string, unknown>>(
      '/local-backup/run',
      {
        method: 'POST',
      },
      UPLOAD_TIMEOUT_MS,
    ),

  downloadLocalBackup: async (filename: string) =>
    requestBlob(
      `/local-backup/backups/${encodeURIComponent(filename)}/download`,
    ),

  restoreLocalBackup: async (filename: string) =>
    request<Record<string, unknown>>(
      `/local-backup/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
      UPLOAD_TIMEOUT_MS,
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
    request<Record<string, unknown>>(
      `/github-backup/test?${new URLSearchParams({
        repo_url: repoUrl,
        token,
        provider,
      })}`,
      {
        method: 'POST',
      },
    ),

  getGitHubBackupStatus: async () =>
    request<Record<string, unknown>>('/github-backup/status'),

  triggerGitHubBackup: async () =>
    request<Record<string, unknown>>(
      '/github-backup/run',
      {
        method: 'POST',
      },
      UPLOAD_TIMEOUT_MS,
    ),
};

export const backupWorkflowApi = {
  runLocal: () =>
    request<BackupOperationResult>(
      '/local-backup/run',
      { method: 'POST' },
      UPLOAD_TIMEOUT_MS,
    ),
  runRemote: () =>
    request<BackupOperationResult>(
      '/github-backup/run',
      { method: 'POST' },
      UPLOAD_TIMEOUT_MS,
    ),
  localStatus: () => request<LocalBackupStatus>('/local-backup/status'),
  localFiles: () => request<LocalBackupFile[]>('/local-backup/backups'),
  checkPath: () => request<BackupPathCheck>('/local-backup/path-check'),
  restoreZip: (file: UploadableFile, progress: (value: number) => void) =>
    uploadFileWithProgress<BackupOperationResult>(
      '/settings/restore',
      file,
      progress,
    ),
  restoreSaved: (filename: string) =>
    request<BackupOperationResult>(
      `/local-backup/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
      UPLOAD_TIMEOUT_MS,
    ),
  deleteSaved: (filename: string) =>
    request<BackupOperationResult>(
      `/local-backup/backups/${encodeURIComponent(filename)}`,
      { method: 'DELETE' },
    ),
  config: () => request<GitHubBackupConfig | null>('/github-backup/config'),
  saveConfig: (
    data: GitHubBackupConfigCreate | Partial<GitHubBackupConfigCreate>,
    exists: boolean,
  ) =>
    request<GitHubBackupConfig>('/github-backup/config', {
      method: exists ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    }),
  status: () =>
    request<GitHubBackupStatus & { restore_running: boolean }>(
      '/github-backup/status',
    ),
  test: (repo: string, token: string, provider: string) =>
    request<GitHubTestConnectionResponse>(
      token
        ? `/github-backup/test?${new URLSearchParams({
            repo_url: repo,
            token,
            provider,
          })}`
        : '/github-backup/test-stored',
      { method: 'POST' },
    ),
  history: (offset = 0) =>
    request<GitHubBackupLog[]>(`/github-backup/logs?limit=50&offset=${offset}`),
  clearHistory: () =>
    request<void>('/github-backup/logs', { method: 'DELETE' }),
  commits: () =>
    request<{ success: boolean; message: string; commits: GitBackupCommit[] }>(
      '/github-backup/commits?limit=100',
    ),
  preview: (ref: string) =>
    request<GitRestorePreview>(
      `/github-backup/restore/preview?ref=${encodeURIComponent(ref)}`,
    ),
  restore: (
    ref: string,
    categories: GitRestoreCategory[],
    overwrite: boolean,
  ) =>
    request<GitRestoreResult>(
      '/github-backup/restore',
      {
        method: 'POST',
        body: JSON.stringify({
          ref,
          categories,
          overwrite_existing: overwrite,
        }),
      },
      UPLOAD_TIMEOUT_MS,
    ),
};
