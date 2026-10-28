import { Alert } from 'react-native';
import { backupApi, backupWorkflowApi } from '@/api/backup';
import { systemApi } from '@/api/system';
import { request, uploadFileWithProgress } from '@/api/http';
import {
  confirmBackupAction,
  remoteConfigPayload,
  requireBackupSuccess,
  resolvedRestore,
} from '@/components/settings/backupWorkflow';
import type { GitRestorePreview } from '@/types/api';

jest.mock('@/api/http', () => ({
  request: jest.fn(),
  requestBlob: jest.fn(),
  requestWithFallback: jest.fn(),
  uploadFileWithProgress: jest.fn(),
  UPLOAD_TIMEOUT_MS: 300000,
}));

describe('backup workflow contracts', () => {
  beforeEach(() => jest.clearAllMocks());
  it('uses query parameters for connection testing, not an ignored JSON body', async () => {
    await backupApi.testGitHubBackupConnection(
      'https://git.test/team/repo',
      'a+b&c',
      'forgejo',
    );
    const [url, options] = jest.mocked(request).mock.calls[0];
    expect(new URL(`https://server${url}`).searchParams.get('token')).toBe(
      'a+b&c',
    );
    expect(options).toEqual({ method: 'POST' });
    await backupWorkflowApi.test('', '', 'github');
    expect(request).toHaveBeenLastCalledWith('/github-backup/test-stored', {
      method: 'POST',
    });
  });
  it.each(['manual', 'hourly', 'daily', 'weekly'])(
    'persists meaningful %s scheduling',
    schedule => {
      const payload = remoteConfigPayload(
        {
          repository_url: ' https://host/org/repo ',
          access_token: '',
          branch: ' ',
        },
        schedule,
      );
      expect(payload.schedule_enabled).toBe(schedule !== 'manual');
      expect(payload.schedule_type).toBe(
        schedule === 'manual' ? 'daily' : schedule,
      );
      expect(payload.repository_url).toBe('https://host/org/repo');
      expect(payload.access_token).toBeUndefined();
      expect(payload).not.toHaveProperty('schedule_time');
    },
  );
  it('uses immutable preview refs, rejects absent/unavailable selections', async () => {
    const preview: GitRestorePreview = {
      success: true,
      message: 'OK',
      ref: 'a'.repeat(40),
      commit: null,
      metadata_version: '1',
      categories: [
        { category: 'spools', available: true, item_count: 2, detail: null },
      ],
    };
    expect(() =>
      resolvedRestore({ ...preview, ref: 'HEAD' }, ['spools']),
    ).toThrow('immutable');
    expect(() =>
      resolvedRestore({ ...preview, ref: 'a'.repeat(7) }, ['spools']),
    ).toThrow('immutable');
    expect(() => resolvedRestore(preview, [])).toThrow('available');
    expect(() => resolvedRestore(preview, ['archives'])).toThrow('available');
    const resolved = resolvedRestore(preview, ['spools', 'spools']);
    await backupWorkflowApi.restore(resolved.ref, resolved.categories, true);
    expect(request).toHaveBeenLastCalledWith(
      '/github-backup/restore',
      {
        method: 'POST',
        body: JSON.stringify({
          ref: preview.ref,
          categories: ['spools'],
          overwrite_existing: true,
        }),
      },
      300000,
    );
  });
  it('requires explicit destructive confirmation and treats application failures as failures', () => {
    const spy = jest.spyOn(Alert, 'alert');
    const run = jest.fn();
    confirmBackupAction('Restore?', 'Replace all data', run);
    expect(run).not.toHaveBeenCalled();
    const buttons = spy.mock.calls[0][2]!;
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');
    buttons[1].onPress?.();
    expect(run).toHaveBeenCalledTimes(1);
    expect(() =>
      requireBackupSuccess({ success: false, message: 'Disk full' }),
    ).toThrow('Disk full');
    spy.mockRestore();
  });
  it('uploads the ZIP with a real progress callback and encodes saved filenames', async () => {
    const file = {
      uri: 'file:///backup.zip',
      name: 'backup.zip',
      type: 'application/zip',
    };
    const progress = jest.fn();
    await backupWorkflowApi.restoreZip(file, progress);
    expect(uploadFileWithProgress).toHaveBeenCalledWith(
      '/settings/restore',
      file,
      progress,
    );
    await backupWorkflowApi.restoreSaved('backup #1.zip');
    expect(request).toHaveBeenLastCalledWith(
      '/local-backup/backups/backup%20%231.zip/restore',
      { method: 'POST' },
      300000,
    );
    await backupWorkflowApi.checkPath();
    expect(request).toHaveBeenLastCalledWith('/local-backup/path-check');
  });
  it('sends actual log filters, debug restoration and update requests without executing them', async () => {
    await systemApi.getSupportLogs({
      level: 'CRITICAL',
      search: 'trace & cause',
      limit: 500,
    });
    const url = jest.mocked(request).mock.calls[0][0];
    expect(new URL(`https://server${url}`).searchParams.get('search')).toBe(
      'trace & cause',
    );
    expect(url).toContain('level=CRITICAL');
    await systemApi.stopBugReportLogging(true);
    expect(request).toHaveBeenLastCalledWith(
      '/bug-report/stop-logging?was_debug=true',
      { method: 'POST' },
    );
    await systemApi.applyServerUpdate();
    expect(request).toHaveBeenLastCalledWith('/updates/apply', {
      method: 'POST',
    });
  });
});
