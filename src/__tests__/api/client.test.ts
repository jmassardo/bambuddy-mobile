import { ApiError, api, setAuthToken } from '@/api/client';
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

  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-length' ? contentLength : null),
    },
    json: jest.fn().mockResolvedValue(data),
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
