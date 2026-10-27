import { authManagementApi } from '@/api/authManagement';
import { authApi } from '@/api/auth';
import { request } from '@/api/http';
jest.mock('@/api/http', () => ({ request: jest.fn(), buildMediaUrl: jest.fn(), checkAuthStatus: jest.fn() }));
const send = jest.mocked(request);
beforeEach(() => send.mockReset());

it('sends optional setup and password changes using the backend field names', async () => {
  await authApi.setupAuth({ auth_enabled: false });
  expect(send).toHaveBeenLastCalledWith('/auth/setup', { method: 'POST', body: '{"auth_enabled":false}' });
  await authApi.changeOwnPassword('old', 'NewPassword1!');
  expect(send).toHaveBeenLastCalledWith('/users/me/change-password', { method: 'POST', body: '{"current_password":"old","new_password":"NewPassword1!"}' });
  await authApi.sendEmailOTP('challenge-token');
  expect(send).toHaveBeenLastCalledWith('/auth/2fa/email/send', { method: 'POST', credentials: 'include', body: '{"pre_auth_token":"challenge-token"}' });
});
it('encodes registration lookup and sends PKCE without forwarding client state to authorization', async () => {
  await authManagementApi.authorizeInfo('a&b', 'https://portal/cb?a=b');
  expect(send).toHaveBeenLastCalledWith('/connect/authorize/info?client_id=a%26b&redirect_uri=https%3A%2F%2Fportal%2Fcb%3Fa%3Db');
  await authManagementApi.authorize({ client_id: 'client', redirect_uri: 'https://portal/cb', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256', state: 'local-state' });
  const [endpoint, options] = send.mock.calls.at(-1)!;
  expect(endpoint).toBe('/connect/authorize');
  expect(JSON.parse(String(options?.body))).toEqual({ client_id: 'client', redirect_uri: 'https://portal/cb', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256' });
});
it('uses actual connected-app rotation, toggle and revocation handlers', async () => {
  await authManagementApi.updateApp(4, false);
  expect(send).toHaveBeenLastCalledWith('/connect/apps/4', { method: 'PATCH', body: '{"enabled":false}' });
  await authManagementApi.rotateApp(4);
  expect(send).toHaveBeenLastCalledWith('/connect/apps/4/rotate-secret', { method: 'POST' });
  await authManagementApi.deleteApp(4);
  expect(send).toHaveBeenLastCalledWith('/connect/apps/4', { method: 'DELETE' });
  await authManagementApi.revokeKey(9);
  expect(send).toHaveBeenLastCalledWith('/api-keys/9', { method: 'DELETE' });
});
