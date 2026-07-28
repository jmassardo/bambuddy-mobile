import { ApiError, api, setAuthToken, request, DEFAULT_TIMEOUT_MS } from '@/api/client';
import { useServerStore } from '@/api/server';
import * as Keychain from 'react-native-keychain';

declare const global: typeof globalThis & { fetch: typeof fetch };

type MockResponseOptions = {
  ok?: boolean;
  status?: number;
  contentLength?: string;
};

const mockFetch = jest.fn();
(global as typeof globalThis & { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

function createResponse(data: unknown, options: MockResponseOptions = {}) {
  const { ok = true, status = 200, contentLength = data === undefined ? '0' : '1' } = options;
  const jsonStr = data !== undefined ? JSON.stringify(data) : '';

  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-length' ? contentLength : null),
    },
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(jsonStr),
  } as unknown as Response;
}

function expectLastRequest(
  endpoint: string,
  method: string = 'GET',
  body?: Record<string, unknown>,
) {
  const [url, options] = mockFetch.mock.calls.at(-1) as [string, RequestInit];

  expect(url).toBe(`https://bambuddy.test/api/v1${endpoint}`);
  expect(options.method ?? 'GET').toBe(method);
  expect(options.headers).toEqual(
    expect.objectContaining({
      'Content-Type': 'application/json',
      Authorization: expect.stringContaining('secret-token'),
    }),
  );

  if (body !== undefined) {
    expect(options.body).toBe(JSON.stringify(body));
  }
}

describe('api client', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    useServerStore.setState({ serverUrl: 'https://bambuddy.test', loading: false });
    mockFetch.mockResolvedValue(createResponse({ token: 'media-token' }));
    await setAuthToken('secret-token');
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await setAuthToken(null);
  });

  it.each([
    {
      name: 'login',
      call: () => api.login({ username: 'jenna', password: 'pw' }),
      endpoint: '/auth/login',
      method: 'POST',
      body: { username: 'jenna', password: 'pw' },
      response: { access_token: 'abc', token_type: 'bearer', user: { id: 1, username: 'jenna', is_admin: true, groups: [] } },
    },
    {
      name: 'verify2FA',
      call: () => api.verify2FA({ pre_auth_token: 'pre-token', code: '123456', method: 'totp' }),
      endpoint: '/auth/2fa/verify',
      method: 'POST',
      body: { pre_auth_token: 'pre-token', code: '123456', method: 'totp' },
      response: { access_token: 'abc', token_type: 'bearer', user: { id: 1, username: 'jenna', is_admin: true, groups: [] } },
    },
    {
      name: 'logout',
      call: () => api.logout(),
      endpoint: '/auth/logout',
      method: 'POST',
      response: undefined,
    },
    {
      name: 'forgotPassword',
      call: () => api.forgotPassword({ email: 'user@example.com' }),
      endpoint: '/auth/forgot-password',
      method: 'POST',
      body: { email: 'user@example.com' },
      response: { message: 'sent' },
    },
    {
      name: 'testGitHubBackupConnection',
      call: () => api.testGitHubBackupConnection('https://github.com/octo/repo', 'pat-secret'),
      endpoint: '/github-backup/test',
      method: 'POST',
      body: {
        repo_url: 'https://github.com/octo/repo',
        token: 'pat-secret',
        provider: 'github',
      },
      response: { ok: true },
    },
  ])('sends the correct auth request for $name', async ({ call, endpoint, method, body, response }) => {
    mockFetch.mockResolvedValue(createResponse(response, { status: response === undefined ? 204 : 200 }));

    await call();

    expectLastRequest(endpoint, method, body);
  });

  it.each([
    {
      name: 'getPrinters',
      call: () => api.getPrinters(),
      endpoint: '/printers/',
      method: 'GET',
      response: [],
    },
    {
      name: 'createPrinter',
      call: () => api.createPrinter({ name: 'X1', ip_address: '192.168.1.50' }),
      endpoint: '/printers/',
      method: 'POST',
      body: { name: 'X1', ip_address: '192.168.1.50' },
      response: { id: 7 },
    },
    {
      name: 'diagnoseConnection',
      call: () => api.diagnoseConnection({ ip_address: '192.168.1.50', serial_number: 'SER123', access_code: '111222' }),
      endpoint: '/printers/diagnostic',
      method: 'POST',
      body: { ip_address: '192.168.1.50', serial_number: 'SER123', access_code: '111222' },
      response: { checks: [] },
    },
  ])('sends the correct printer request for $name', async ({ call, endpoint, method, body, response }) => {
    mockFetch.mockResolvedValue(createResponse(response));

    await call();

    expectLastRequest(endpoint, method, body);
  });

  it.each([
    {
      name: 'getQueue',
      call: () => api.getQueue(3, 'pending', 'X1 Carbon'),
      endpoint: '/queue/?printer_id=3&status=pending&target_model=X1+Carbon',
      method: 'GET',
      response: [],
    },
    {
      name: 'addToQueue',
      call: () => api.addToQueue({ printer_id: 3, archive_id: 11 }),
      endpoint: '/queue/',
      method: 'POST',
      body: { printer_id: 3, archive_id: 11 },
      response: { id: 10 },
    },
    {
      name: 'reorderQueue',
      call: () => api.reorderQueue([10, 12]),
      endpoint: '/queue/reorder',
      method: 'POST',
      body: {
        item_ids: [10, 12],
        items: [
          { id: 10, position: 1 },
          { id: 12, position: 2 },
        ],
      },
      response: { message: 'ok' },
    },
    {
      name: 'bulkUpdateQueue',
      call: () =>
        api.bulkUpdateQueue({
          item_ids: [10, 12],
          update: { status: 'cancelled', manual_start: true },
        }),
      endpoint: '/queue/bulk',
      method: 'PATCH',
      body: {
        item_ids: [10, 12],
        status: 'cancelled',
        manual_start: true,
        update: { status: 'cancelled', manual_start: true },
      },
      response: { updated: 2 },
    },
  ])('sends the correct queue request for $name', async ({ call, endpoint, method, body, response }) => {
    mockFetch.mockResolvedValue(createResponse(response));

    await call();

    expectLastRequest(endpoint, method, body);
  });

  it.each([
    {
      name: 'getArchives',
      call: () =>
        api.getArchives({
          printerId: 9,
          projectId: 4,
          limit: 25,
          offset: 50,
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
        }),
      endpoint:
        '/archives/?printer_id=9&project_id=4&limit=25&offset=50&date_from=2026-01-01&date_to=2026-01-31',
      method: 'GET',
      response: [],
    },
    {
      name: 'updateArchive',
      call: () => api.updateArchive(4, { favorite: true }),
      endpoint: '/archives/4',
      method: 'PATCH',
      body: { favorite: true },
      response: { id: 4, favorite: true },
    },
    {
      name: 'getLibraryFolders',
      call: () => api.getLibraryFolders(),
      endpoint: '/library/folders',
      method: 'GET',
      response: [],
    },
    {
      name: 'getLibraryFiles',
      call: () => api.getLibraryFiles(12, false, 8),
      endpoint: '/library/files?folder_id=12&include_root=false&project_id=8',
      method: 'GET',
      response: [],
    },
  ])('sends the correct archive and library request for $name', async ({ call, endpoint, method, body, response }) => {
    mockFetch.mockResolvedValue(createResponse(response));

    await call();

    expectLastRequest(endpoint, method, body);
  });

  it.each([
    {
      name: 'getSpools',
      call: () => api.getSpools(true),
      endpoint: '/inventory/spools?include_archived=true',
      method: 'GET',
      response: [],
    },
    {
      name: 'updateSpool',
      call: () => api.updateSpool(22, { remaining_weight: 650 }),
      endpoint: '/inventory/spools/22',
      method: 'PATCH',
      body: { remaining_weight: 650 },
      response: { id: 22 },
    },
    {
      name: 'getAssignments',
      call: () => api.getAssignments(8),
      endpoint: '/inventory/assignments?printer_id=8',
      method: 'GET',
      response: [],
    },
    {
      name: 'getSettings',
      call: () => api.getSettings(),
      endpoint: '/settings/',
      method: 'GET',
      response: { theme: 'dark' },
    },
    {
      name: 'updateSettings',
      call: () => api.updateSettings({ theme: 'light', telemetry: true }),
      endpoint: '/settings/',
      method: 'PUT',
      body: { theme: 'light', telemetry: true },
      response: { theme: 'light', telemetry: true },
    },
    {
      name: 'getSpoolmanConfig',
      call: () => api.getSpoolmanConfig(),
      endpoint: '/settings/spoolman',
      method: 'GET',
      response: { enabled: true, url: 'https://spoolman.local', auto_sync: false },
    },
    {
      name: 'updateSpoolmanConfig',
      call: () =>
        api.updateSpoolmanConfig({
          enabled: true,
          url: 'https://spoolman.local',
          auto_sync: true,
        }),
      endpoint: '/settings/spoolman',
      method: 'PUT',
      body: { enabled: true, url: 'https://spoolman.local', auto_sync: true },
      response: { enabled: true, url: 'https://spoolman.local', auto_sync: true },
    },
    {
      name: 'syncSpoolmanInventory',
      call: () => api.syncSpoolmanInventory(),
      endpoint: '/spoolman/sync',
      method: 'POST',
      response: { success: true, synced_count: 3, skipped_count: 0, skipped: [], errors: [] },
    },
    {
      name: 'getSpoolmanSyncStatus',
      call: () => api.getSpoolmanSyncStatus(),
      endpoint: '/spoolman/sync/status',
      method: 'GET',
      response: {
        status: 'idle',
        last_sync_at: null,
        last_sync: null,
        in_progress: false,
        auto_sync: true,
        auto_sync_enabled: true,
        last_result: null,
      },
    },
  ])('sends the correct inventory and settings request for $name', async ({ call, endpoint, method, body, response }) => {
    mockFetch.mockResolvedValue(createResponse(response));

    await call();

    expectLastRequest(endpoint, method, body);
  });

  it('throws an ApiError for non-2xx responses', async () => {
    mockFetch.mockResolvedValue(
      createResponse(
        { detail: { code: 'bad_request', message: 'That setting is invalid.' } },
        { ok: false, status: 400 },
      ),
    );

    await expect(api.updateSettings({ theme: 'broken' })).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        message: 'That setting is invalid.',
        status: 400,
        code: 'bad_request',
      }),
    );
    await expect(api.updateSettings({ theme: 'broken' })).rejects.toBeInstanceOf(ApiError);
  });

  it('falls back to legacy spoolman config endpoint when /settings/spoolman is missing', async () => {
    mockFetch
      .mockResolvedValueOnce(createResponse({ detail: 'not found' }, { ok: false, status: 404 }))
      .mockResolvedValueOnce(createResponse({ enabled: true, connected: true, url: 'https://spoolman.local', auto_sync: true }));

    const response = await api.getSpoolmanConfig();

    expect(response).toEqual(expect.objectContaining({ enabled: true, url: 'https://spoolman.local' }));
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://bambuddy.test/api/v1/settings/spoolman');
    expect(mockFetch.mock.calls[1]?.[0]).toBe('https://bambuddy.test/api/v1/system/integrations/spoolman');
  });

  it('scopes keychain storage to the current server origin', async () => {
    const keychain = Keychain as jest.Mocked<typeof Keychain>;

    await setAuthToken('server-token');

    expect(keychain.setGenericPassword).toHaveBeenLastCalledWith(
      'bambuddy-auth-token:https://bambuddy.test',
      'server-token',
      { service: 'bambuddy-auth-token:https://bambuddy.test' },
    );
  });
});

describe('request timeouts and JSON guard', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    useServerStore.setState({ serverUrl: 'https://bambuddy.test', loading: false });
    // Set auth token without fake timer interference
    jest.useRealTimers();
    mockFetch.mockResolvedValue(createResponse({ token: 'media-token' }));
    await setAuthToken('secret-token');
    mockFetch.mockReset();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await setAuthToken(null);
  });

  it('rejects with a timeout ApiError when server does not respond within DEFAULT_TIMEOUT_MS', async () => {
    mockFetch.mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted.');
              err.name = 'AbortError';
              reject(err);
            });
          }
        }),
    );

    const promise = request('/test');
    jest.advanceTimersByTime(DEFAULT_TIMEOUT_MS);

    await expect(promise).rejects.toThrow(ApiError);
    await expect(promise).rejects.toMatchObject({
      code: 'timeout',
      status: 0,
    });
  });

  it('succeeds when server responds before the timeout', async () => {
    mockFetch.mockImplementation(
      (_url: string, _options?: RequestInit) =>
        new Promise<Response>(resolve => {
          setTimeout(() => resolve(createResponse({ ok: true })), 29_000);
        }),
    );

    const promise = request<{ ok: boolean }>('/test');
    jest.advanceTimersByTime(29_000);

    const result = await promise;
    expect(result).toEqual({ ok: true });
  });

  it('throws ApiError with code invalid_response for non-JSON body (not SyntaxError)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-length'
            ? '100'
            : name.toLowerCase() === 'content-type'
              ? 'text/html'
              : null,
      },
      text: jest.fn().mockResolvedValue('<html><body>Captive Portal</body></html>'),
    });

    let caught: unknown;
    try {
      await request('/test');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('invalid_response');
    expect((caught as ApiError).message).toContain('text/html');
  });

  it('resolves to undefined for an empty response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-length' ? '5' : null,
      },
      text: jest.fn().mockResolvedValue(''),
    });

    const result = await request('/test');
    expect(result).toBeUndefined();
  });

  it('clears the timeout timer on successful response (no leaked handles)', async () => {
    jest.useRealTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    mockFetch.mockResolvedValue(createResponse({ data: 1 }));

    await request('/test');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
