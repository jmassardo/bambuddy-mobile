import { authApi } from '@/api/auth';
import { fetchWithTimeout } from '@/api/http';

jest.mock('@/api/http', () => ({ fetchWithTimeout: jest.fn() }));
const send = jest.mocked(fetchWithTimeout);
const identity = {
  id: 7, username: 'operator', is_active: true, is_admin: true, role: 'admin',
  auth_source: 'local', created_at: '2026-01-01', groups: [{ permissions: ['settings:update'] }],
  permissions: ['printers:read'],
};

beforeEach(() => send.mockReset());

it('validates against the selected server with a header credential and scoped identity', async () => {
  send.mockResolvedValue({ ok: true, json: async () => identity } as Response);
  expect(await authApi.validateApiKey('https://farm.test/base', 'bb_fixture')).toEqual({
    ...identity, role: 'user', is_admin: false, groups: [],
  });
  expect(send).toHaveBeenCalledWith('https://farm.test/base/api/v1/auth/me', {
    headers: { Authorization: 'Bearer bb_fixture' },
    credentials: 'omit',
  });
});

it('does not adopt an identity returned from a redirected validation URL', async () => {
  send.mockResolvedValue({
    ok: true, url: 'https://other.test/api/v1/auth/me', json: async () => identity,
  } as Response);
  await expect(authApi.validateApiKey('https://farm.test', 'bb_fixture')).rejects
    .toThrow('Could not connect with this API key.');
});

it('does not expose error bodies or secrets when the server rejects enrollment', async () => {
  const json = jest.fn(async () => ({ detail: 'bb_do-not-display' }));
  send.mockResolvedValue({ ok: false, json } as unknown as Response);
  await expect(authApi.validateApiKey('https://farm.test', 'bb_do-not-display')).rejects
    .toThrow('Could not connect with this API key.');
  expect(json).not.toHaveBeenCalled();
  send.mockRejectedValue(new Error('Network failed for bb_do-not-display'));
  await expect(authApi.validateApiKey('https://farm.test', 'bb_do-not-display')).rejects
    .not.toThrow('bb_do-not-display');
});

it.each([null, {}, { ...identity, is_active: false }, { ...identity, permissions: [42] }])(
  'rejects malformed or inactive identities %#',
  async value => {
    send.mockResolvedValue({ ok: true, json: async () => value } as Response);
    await expect(authApi.validateApiKey('https://farm.test', 'bb_fixture')).rejects
      .toThrow('Could not connect with this API key.');
  },
);
