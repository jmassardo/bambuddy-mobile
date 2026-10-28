import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pick } from '@react-native-documents/picker';
import { LocalBackupTools } from '@/components/settings/LocalBackupTools';
import { RemoteBackupSettings } from '@/components/settings/RemoteBackupSettings';
import { ApplicationLogTools } from '@/components/system/ApplicationLogTools';
import { ServerUpdateTools } from '@/components/system/ServerUpdateTools';
import { backupWorkflowApi, backupApi } from '@/api/backup';
import { systemApi } from '@/api/system';
import { settingsApi } from '@/api/settings';
import { request } from '@/api/http';
import { useServerStore } from '@/api/server';
import { shareBlob } from '@/utils/share';

let mockPermissions: Set<string> | null = null;
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      !mockPermissions || mockPermissions.has(permission),
    logout: jest.fn(),
    refreshUser: jest.fn(),
  }),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { zip: 'application/zip' },
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'cancel' },
}));
jest.mock('@/api/backup', () => ({
  backupWorkflowApi: {
    runLocal: jest.fn(),
    runRemote: jest.fn(),
    localStatus: jest.fn(),
    localFiles: jest.fn(),
    checkPath: jest.fn(),
    restoreZip: jest.fn(),
    restoreSaved: jest.fn(),
    deleteSaved: jest.fn(),
    config: jest.fn(),
    status: jest.fn(),
    commits: jest.fn(),
    test: jest.fn(),
    saveConfig: jest.fn(),
    preview: jest.fn(),
    restore: jest.fn(),
    clearHistory: jest.fn(),
    history: jest.fn(),
  },
  backupApi: {
    exportBackup: jest.fn(),
    downloadLocalBackup: jest.fn(),
    triggerGitHubBackup: jest.fn(),
  },
}));
jest.mock('@/api/system', () => ({
  systemApi: {
    getSupportLogs: jest.fn(),
    clearSupportLogs: jest.fn(),
    getUpdateInfo: jest.fn(),
    getServerUpdateStatus: jest.fn(),
    applyServerUpdate: jest.fn(),
  },
}));
jest.mock('@/api/settings', () => ({
  settingsApi: { getSettings: jest.fn(), updateSettings: jest.fn() },
}));
jest.mock('@/api/http', () => ({ request: jest.fn() }));
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn() }));
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openURL: jest.fn(async () => undefined) },
}));

async function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return {
    ...(await render(
      <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    )),
    client,
  };
}
const filename = 'bambuddy-backup-2026.zip';
const config = {
  repository_url: 'https://git.test/org/private',
  has_token: true,
  provider: 'gitea',
  branch: 'backup',
  schedule_enabled: true,
  schedule_type: 'daily',
  enabled: true,
};
describe('native backup and system operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissions = null;
    useServerStore.setState({ serverUrl: 'https://server.test' });
    jest.mocked(backupWorkflowApi.localStatus).mockResolvedValue({
      next_run: 'tomorrow',
      last_message: 'NAS unavailable',
      timezone: 'UTC',
    } as never);
    jest
      .mocked(backupWorkflowApi.localFiles)
      .mockResolvedValue([{ filename, size: 1024, created_at: '2026-01-01' }]);
    jest.mocked(backupWorkflowApi.checkPath).mockResolvedValue({
      writable: false,
      path: '/backups',
      message: 'Permission denied',
      remedy: 'Mount a writable volume',
    });
    jest.mocked(backupWorkflowApi.config).mockResolvedValue(config as never);
    jest.mocked(backupWorkflowApi.status).mockResolvedValue({
      progress: 'Uploading archives',
      next_scheduled_run: 'tomorrow',
    } as never);
    jest
      .mocked(backupWorkflowApi.commits)
      .mockResolvedValue({ success: true, message: 'OK', commits: [] });
    jest.mocked(backupWorkflowApi.history).mockResolvedValue([]);
    jest.mocked(request).mockResolvedValue([]);
    jest
      .mocked(settingsApi.getSettings)
      .mockResolvedValue({ docker_compose_dir: '/opt/bambuddy' } as never);
    jest.mocked(systemApi.getServerUpdateStatus).mockResolvedValue({
      status: 'idle',
      progress: 0,
      message: '',
      error: null,
    });
  });
  it('shows saved metadata/path/schedule errors; download shares the selected saved file', async () => {
    const view = await mount(<LocalBackupTools />);
    expect(await view.findByText(/Permission denied/)).toBeTruthy();
    expect(view.getByText(/Mount a writable volume/)).toBeTruthy();
    expect(view.getByText(/NAS unavailable/)).toBeTruthy();
    expect(view.getByText(/1,024 bytes/)).toBeTruthy();
    const blob = new Blob(['zip']);
    jest.mocked(backupApi.downloadLocalBackup).mockResolvedValue(blob);
    await fireEvent.press(view.getByLabelText(`Download ${filename}`));
    await waitFor(() => expect(shareBlob).toHaveBeenCalledWith(blob, filename));
    expect(backupWorkflowApi.restoreSaved).not.toHaveBeenCalled();
  });
  it('does not delete or restore a saved file until the destructive dialog is confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const view = await mount(<LocalBackupTools />);
    await fireEvent.press(await view.findByLabelText(`Delete ${filename}`));
    expect(backupWorkflowApi.deleteSaved).not.toHaveBeenCalled();
    jest
      .mocked(backupWorkflowApi.deleteSaved)
      .mockResolvedValue({ success: false, message: 'Read-only disk' });
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    expect(await view.findByText('Read-only disk')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(`Restore ${filename}`));
    expect(backupWorkflowApi.restoreSaved).not.toHaveBeenCalled();
    expect(alert.mock.calls.at(-1)![1]).toContain('Existing data will be lost');
    alert.mockRestore();
  });
  it('picks a ZIP, confirms full replacement and reports upload/server completion', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(pick).mockResolvedValue([
      {
        uri: 'file:///chosen.zip',
        name: 'chosen.zip',
        type: 'application/zip',
      },
    ] as never);
    jest
      .mocked(backupWorkflowApi.restoreZip)
      .mockImplementation(async (_file, progress) => {
        progress(100);
        return { success: true, message: 'Backup restored successfully.' };
      });
    const view = await mount(<LocalBackupTools />);
    await fireEvent.press(view.getByLabelText('Choose ZIP backup'));
    await fireEvent.press(await view.findByLabelText('Restore selected ZIP'));
    expect(backupWorkflowApi.restoreZip).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    expect(await view.findByLabelText('Re-enter restored system')).toBeTruthy();
    expect(backupWorkflowApi.restoreZip).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chosen.zip' }),
      expect.any(Function),
    );
    expect(view.getByText(/Restart the BambuBuddy server/)).toBeTruthy();
    alert.mockRestore();
  });
  it('persists provider/options and manual disables schedules without a meaningless time field', async () => {
    jest
      .mocked(backupWorkflowApi.saveConfig)
      .mockResolvedValue(config as never);
    const view = await mount(<RemoteBackupSettings />);
    await waitFor(() =>
      expect(view.getByLabelText('Repository URL').props.value).toBe(
        config.repository_url,
      ),
    );
    await fireEvent.press(view.getByText('forgejo'));
    await fireEvent.press(view.getByText('manual'));
    await fireEvent(
      view.getByLabelText('Allow insecure HTTP (token may be exposed)'),
      'valueChange',
      true,
    );
    await fireEvent(
      view.getByLabelText('Include archives'),
      'valueChange',
      true,
    );
    await fireEvent.press(view.getByLabelText('Save remote backup'));
    await waitFor(() =>
      expect(backupWorkflowApi.saveConfig).toHaveBeenCalled(),
    );
    expect(backupWorkflowApi.saveConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: 'forgejo',
        schedule_enabled: false,
        schedule_type: 'daily',
        allow_insecure_http: true,
        backup_archives: true,
      }),
      true,
    );
    const sent = jest.mocked(backupWorkflowApi.saveConfig).mock.calls[0][0];
    expect(sent).not.toHaveProperty('schedule_time');
    expect(sent.access_token).toBeUndefined();
    expect(view.getByText(/Uploading archives/)).toBeTruthy();
  });
  it('previews HEAD then restores the immutable commit, only chosen available categories and overwrite', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const sha = 'a'.repeat(40);
    jest.mocked(backupWorkflowApi.preview).mockResolvedValue({
      success: true,
      message: 'Preview ready',
      ref: sha,
      metadata_version: '1',
      commit: null,
      categories: [
        {
          category: 'spools',
          available: true,
          item_count: 3,
          detail: '3 inventory items',
        },
        {
          category: 'archives',
          available: false,
          item_count: 0,
          detail: 'Not backed up',
        },
      ],
    });
    jest.mocked(backupWorkflowApi.restore).mockResolvedValue({
      success: true,
      message: 'Done',
      ref: sha,
      results: { spools: { restored: 2, skipped: 1, failed: 0, notes: [] } },
    });
    const view = await mount(<RemoteBackupSettings />);
    await fireEvent.press(
      await view.findByLabelText('Preview selected commit'),
    );
    const choice = await view.findByLabelText('spools: 3 items ');
    await fireEvent(choice, 'valueChange', true);
    expect(
      view.getByLabelText('archives: 0 items (unavailable)').props.disabled,
    ).toBe(true);
    await fireEvent(
      view.getByLabelText('Overwrite existing records'),
      'valueChange',
      true,
    );
    await fireEvent.press(view.getByLabelText('Restore selected categories'));
    expect(backupWorkflowApi.restore).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    await waitFor(() =>
      expect(backupWorkflowApi.restore).toHaveBeenCalledWith(
        sha,
        ['spools'],
        true,
      ),
    );
    expect(
      await view.findByText(/2 restored, 1 skipped, 0 failed/),
    ).toBeTruthy();
    alert.mockRestore();
  });
  it('searches and filters actual logs, expands multiline and confirms buffer clearing', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(systemApi.getSupportLogs).mockResolvedValue({
      total_in_file: 6,
      filtered_count: 1,
      entries: [
        {
          timestamp: 'now',
          level: 'CRITICAL',
          logger_name: 'server',
          message: 'Traceback\nfull stack frame',
        },
      ],
    });
    const view = await mount(<ApplicationLogTools />);
    await view.findByText('Traceback');
    expect(view.queryByText('Traceback\nfull stack frame')).toBeNull();
    await fireEvent.press(view.getByLabelText('Expand multiline record'));
    expect(view.getByText('Traceback\nfull stack frame')).toBeTruthy();
    await fireEvent.changeText(
      view.getByLabelText('Search messages or logger'),
      'network',
    );
    await fireEvent.press(view.getByText('CRITICAL'));
    await waitFor(() =>
      expect(systemApi.getSupportLogs).toHaveBeenLastCalledWith({
        limit: 200,
        level: 'CRITICAL',
        search: 'network',
      }),
    );
    await fireEvent.press(view.getByLabelText('Clear server log buffer'));
    expect(systemApi.clearSupportLogs).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    expect(systemApi.clearSupportLogs).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
  it('offers Docker host instructions and release notes but never invokes apply', async () => {
    jest.mocked(systemApi.getUpdateInfo).mockResolvedValue({
      current_version: '1',
      latest_version: '2',
      update_available: true,
      update_method: 'docker',
      release_notes: 'Fixes connection errors',
    });
    const view = await mount(<ServerUpdateTools />);
    expect(systemApi.getUpdateInfo).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Check server updates now'));
    await fireEvent.press(
      await view.findByLabelText('Show / hide release notes'),
    );
    expect(view.getByText(/Fixes connection errors/)).toBeTruthy();
    expect(view.getByLabelText('Docker Compose directory').props.value).toBe(
      '/opt/bambuddy',
    );
    expect(view.getByText(/docker compose pull/)).toBeTruthy();
    expect(view.queryByLabelText('Update server now')).toBeNull();
    expect(systemApi.applyServerUpdate).not.toHaveBeenCalled();
  });
  it('requires confirmation for supported git updates and displays apply errors', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(systemApi.getUpdateInfo).mockResolvedValue({
      current_version: '1',
      latest_version: '2',
      update_available: true,
      update_method: 'git',
    });
    jest
      .mocked(systemApi.applyServerUpdate)
      .mockResolvedValue({ success: false, message: 'No matching release' });
    const view = await mount(<ServerUpdateTools />);
    await fireEvent.press(view.getByLabelText('Check server updates now'));
    await fireEvent.press(await view.findByLabelText('Update server now'));
    expect(systemApi.applyServerUpdate).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    expect(await view.findByText('No matching release')).toBeTruthy();
    alert.mockRestore();
  });
  it('surfaces local-run failures without claiming a backup succeeded', async () => {
    jest.mocked(backupWorkflowApi.runLocal).mockResolvedValue({
      success: false,
      message: 'Backup failed: disk full',
    });
    const view = await mount(<LocalBackupTools />);
    await fireEvent.press(view.getByLabelText('Run local backup'));
    expect(await view.findByText('Backup failed: disk full')).toBeTruthy();
  });
  it('shows connection-test failures and history details; links/clear are user-controlled', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    jest.mocked(backupWorkflowApi.test).mockResolvedValue({
      success: false,
      message: 'Token lacks repository access',
      is_private: null,
      repo_name: null,
      permissions: null,
    });
    jest.mocked(backupWorkflowApi.history).mockResolvedValue([
      {
        id: 1,
        config_id: 1,
        started_at: '2026-01-01',
        completed_at: null,
        trigger: 'restore',
        status: 'failed',
        commit_sha: 'abc1234',
        files_changed: 2,
        error_message: 'Printer offline',
      },
    ]);
    const view = await mount(<RemoteBackupSettings />);
    await waitFor(() =>
      expect(view.getByLabelText('Repository URL').props.value).toBe(
        config.repository_url,
      ),
    );
    await fireEvent.press(view.getByLabelText('Test connection'));
    expect(await view.findByText('Token lacks repository access')).toBeTruthy();
    expect(backupWorkflowApi.test).toHaveBeenCalledWith(
      config.repository_url,
      '',
      'gitea',
    );
    expect(view.getByText(/restore · failed/)).toBeTruthy();
    expect(view.getByText(/Printer offline/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Commit abc1234'));
    expect(open).toHaveBeenCalledWith(
      'https://git.test/org/private/commit/abc1234',
    );
    await fireEvent.press(view.getByLabelText('Clear backup history'));
    expect(backupWorkflowApi.clearHistory).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress?.());
    await waitFor(() =>
      expect(backupWorkflowApi.clearHistory).toHaveBeenCalledTimes(1),
    );
    alert.mockRestore();
    open.mockRestore();
  });
  it.each([
    ['ha_addon', 'Update through Home Assistant'],
    ['windows_installer', 'Download server Windows installer'],
  ] as const)(
    'uses the supported %s server update action',
    async (method, label) => {
      jest.mocked(systemApi.getUpdateInfo).mockResolvedValue({
        current_version: '1',
        latest_version: '2',
        update_available: true,
        update_method: method,
        installer_download_url: 'https://releases.test/setup.exe',
      });
      const view = await mount(<ServerUpdateTools />);
      await fireEvent.press(view.getByLabelText('Check server updates now'));
      expect(await view.findByText(new RegExp(label))).toBeTruthy();
      expect(view.queryByLabelText('Update server now')).toBeNull();
      expect(systemApi.applyServerUpdate).not.toHaveBeenCalled();
    },
  );
  it('shows manual update-check failures, retaining a deliberate retry action', async () => {
    jest
      .mocked(systemApi.getUpdateInfo)
      .mockRejectedValueOnce(new Error('Release service unavailable'));
    const view = await mount(<ServerUpdateTools />);
    await fireEvent.press(view.getByLabelText('Check server updates now'));
    expect(await view.findByText('Release service unavailable')).toBeTruthy();
    expect(view.getByLabelText('Check server updates now')).toBeTruthy();
    expect(systemApi.applyServerUpdate).not.toHaveBeenCalled();
  });
  it('allows ZIP restore without backup-read permission and does not request protected saved files', async () => {
    mockPermissions = new Set(['settings:restore']);
    const view = await mount(<LocalBackupTools />);
    expect(view.getByLabelText('Choose ZIP backup')).toBeTruthy();
    expect(view.queryByLabelText('Run local backup')).toBeNull();
    expect(backupWorkflowApi.localStatus).not.toHaveBeenCalled();
    expect(backupWorkflowApi.localFiles).not.toHaveBeenCalled();
    expect(backupWorkflowApi.checkPath).not.toHaveBeenCalled();
  });
  it('permits Git preview without configuration-write permission', async () => {
    mockPermissions = new Set(['github:restore', 'inventory:update']);
    const view = await mount(<RemoteBackupSettings />);
    expect(view.getByLabelText('Preview selected commit')).toBeTruthy();
    expect(view.queryByLabelText('Save remote backup')).toBeNull();
    expect(backupWorkflowApi.config).not.toHaveBeenCalled();
    expect(backupWorkflowApi.status).not.toHaveBeenCalled();
    await waitFor(() => expect(backupWorkflowApi.commits).toHaveBeenCalled());
  });
});
