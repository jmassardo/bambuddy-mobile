import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth, type UserResponse } from '@/contexts/AuthContext';
import { api, getAuthToken, setAuthToken } from '@/api/client';
import { useServerStore } from '@/api/server';

// Mock api
jest.mock('@/api/client', () => {
  const actual = jest.requireActual('@/api/client');
  return {
    ...actual,
    api: {
      getAuthStatus: jest.fn(),
      getCurrentUser: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      verify2FA: jest.fn(),
      validateApiKey: jest.fn(),
    },
    getAuthToken: jest.fn(() => 'test-token'),
    loadAuthToken: jest.fn(() => Promise.resolve()),
    setAuthToken: jest.fn(() => Promise.resolve()),
  };
});

const mockedApi = api as jest.Mocked<typeof api>;
const mockedSetAuthToken = setAuthToken as jest.MockedFunction<typeof setAuthToken>;

const testUser: UserResponse = {
  id: 1,
  username: 'jenna',
  role: 'admin',
  is_active: true,
  is_admin: true,
  auth_source: 'local',
  email: 'jenna@example.com',
  permissions: ['printers:read', 'printers:update', 'queue:update_all'],
  created_at: '2026-01-01T00:00:00Z',
  groups: [
    { id: 1, name: 'admins', permissions: ['printers:read', 'printers:update', 'queue:update_all'] },
  ],
};

const regularUser: UserResponse = {
  id: 2,
  username: 'viewer',
  role: 'user',
  is_active: true,
  is_admin: false,
  auth_source: 'local',
  email: undefined,
  permissions: ['printers:read'],
  created_at: '2026-01-01T00:00:00Z',
  groups: [
    { id: 2, name: 'viewers', permissions: ['printers:read'] },
  ],
};
const keyUser: UserResponse = { ...regularUser, groups: [] };

let latestAuth: ReturnType<typeof useAuth> | null = null;
let renderedAuth: ReactTestRenderer.ReactTestRenderer | null = null;

function AuthConsumer() {
  latestAuth = useAuth();
  return null;
}

function renderAuth() {
  renderedAuth = ReactTestRenderer.create(
    React.createElement(AuthProvider, null, React.createElement(AuthConsumer)),
  );
  return renderedAuth;
}

describe('AuthContext', () => {
  afterEach(async () => {
    await act(async () => { renderedAuth?.unmount(); });
    renderedAuth = null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    latestAuth = null;
    useServerStore.setState({ serverUrl: 'https://bb.test', loading: false });
    mockedApi.getAuthStatus.mockResolvedValue({
      auth_enabled: true,
      requires_setup: false,
    });
    mockedApi.getCurrentUser.mockResolvedValue(testUser);
    mockedApi.validateApiKey.mockResolvedValue(keyUser);
    jest.mocked(getAuthToken).mockReturnValue('test-token');
    mockedSetAuthToken.mockImplementation(async token => {
      jest.mocked(getAuthToken).mockReturnValue(token);
    });
  });

  describe('hasPermission', () => {
    it('returns true for admins regardless of permission', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('settings:update')).toBe(true);
    });

    it('checks group permissions for non-admin users', async () => {
      mockedApi.getCurrentUser.mockResolvedValue(regularUser);

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('printers:read')).toBe(true);
      expect(latestAuth!.hasPermission('printers:update')).toBe(false);
    });

    it('returns true when auth is disabled', async () => {
      mockedApi.getAuthStatus.mockResolvedValue({
        auth_enabled: false,
        requires_setup: false,
      });

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('settings:update')).toBe(true);
    });

    it('returns false when no user is logged in and auth enabled', async () => {
      mockedApi.getCurrentUser.mockRejectedValue(new Error('401'));

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.user).toBeNull();
      expect(latestAuth!.hasPermission('printers:read')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true if user has any of the listed permissions', async () => {
      mockedApi.getCurrentUser.mockResolvedValue(regularUser);

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasAnyPermission('printers:update', 'printers:read')).toBe(true);
      expect(latestAuth!.hasAnyPermission('settings:update', 'users:delete')).toBe(false);
    });
  });

  describe('loginWithToken', () => {
    it('stores token and sets user', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      await act(async () => {
        await latestAuth!.loginWithToken('new-token', regularUser);
      });

      expect(mockedSetAuthToken).toHaveBeenCalledWith('new-token', true);
      expect(latestAuth!.user?.username).toBe('viewer');
    });

    it('honors top-level delegated permissions even when brief groups omit permissions', async () => {
      mockedApi.getCurrentUser.mockResolvedValue({ ...regularUser, groups: [{ id: 2, name: 'Operators', permissions: [] }], permissions: ['users:read'] });
      await act(async () => { renderAuth(); });
      expect(latestAuth!.hasPermission('users:read')).toBe(true);
      expect(latestAuth!.hasPermission('users:delete')).toBe(false);
    });

    it('passes the memory-only choice to secure token storage', async () => {
      mockedApi.login.mockResolvedValue({ access_token: 'session', token_type: 'bearer', user: regularUser });
      await act(async () => { renderAuth(); });
      await act(async () => { await latestAuth!.login('viewer', 'password', false); });
      expect(mockedSetAuthToken).toHaveBeenCalledWith('session', false);
    });
  });

  describe('session transitions', () => {
    it('clears token and user', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.user).not.toBeNull();

      await act(async () => { await latestAuth!.logout(); });

      expect(mockedSetAuthToken).toHaveBeenCalledWith(null);
      expect(latestAuth!.user).toBeNull();
    });

    describe('API-key enrollment', () => {
      it('validates before switching servers and applies only the key identity permissions', async () => {
        await act(async () => { renderAuth(); });
        mockedApi.getCurrentUser.mockResolvedValue(keyUser);
        await act(async () => {
          await latestAuth!.loginWithApiKey('https://new-farm.test', 'bb_fixture');
        });
        expect(mockedApi.validateApiKey).toHaveBeenCalledWith('https://new-farm.test', 'bb_fixture');
        expect(useServerStore.getState().serverUrl).toBe('https://new-farm.test');
        expect(mockedSetAuthToken).toHaveBeenCalledWith('bb_fixture');
        expect(latestAuth!.user).toEqual(keyUser);
        expect(latestAuth!.hasPermission('printers:read')).toBe(true);
        expect(latestAuth!.hasPermission('settings:update')).toBe(false);
        expect(latestAuth!.authEnabled).toBe(true);
        expect(latestAuth!.serverConnected).toBe(true);
      });

      it('leaves the previous server and credential intact when validation fails', async () => {
        await act(async () => { renderAuth(); });
        mockedApi.validateApiKey.mockRejectedValue(new Error('Invalid API key'));
        await act(async () => {
          await expect(latestAuth!.loginWithApiKey('https://other-farm.test', 'bb_invalid')).rejects.toThrow();
        });
        expect(useServerStore.getState().serverUrl).toBe('https://bb.test');
        expect(mockedSetAuthToken).not.toHaveBeenCalled();
        expect(latestAuth!.user).toEqual(testUser);
      });

      it('discards validation when the configured server changes while it is pending', async () => {
        await act(async () => { renderAuth(); });
        let resolve!: (value: UserResponse) => void;
        mockedApi.validateApiKey.mockReturnValue(new Promise(done => { resolve = done; }));
        const pending = latestAuth!.loginWithApiKey('https://qr-farm.test', 'bb_fixture');
        await act(async () => { useServerStore.setState({ serverUrl: 'https://chosen-farm.test' }); });
        await act(async () => {
          resolve(regularUser);
          await expect(pending).rejects.toThrow('Could not connect with this API key.');
        });
        expect(useServerStore.getState().serverUrl).toBe('https://chosen-farm.test');
        expect(mockedSetAuthToken).not.toHaveBeenCalled();
      });

      it('does not let an older auth-disabled response overwrite successful enrollment', async () => {
        let resolve!: (value: { auth_enabled: boolean; requires_setup: boolean }) => void;
        mockedApi.getAuthStatus.mockReturnValueOnce(new Promise(done => { resolve = done; }));
        await act(async () => { renderAuth(); });
        mockedApi.getCurrentUser.mockResolvedValue(keyUser);
        await act(async () => {
          await latestAuth!.loginWithApiKey('https://new-farm.test', 'bb_fixture');
        });
        await act(async () => { resolve({ auth_enabled: false, requires_setup: false }); });
        expect(latestAuth!.user).toEqual(keyUser);
        expect(latestAuth!.authEnabled).toBe(true);
        expect(mockedSetAuthToken).not.toHaveBeenCalledWith(null);
      });

      it('ignores a user refresh started before QR enrollment', async () => {
        await act(async () => { renderAuth(); });
        let resolve!: (value: UserResponse) => void;
        mockedApi.getCurrentUser.mockReturnValueOnce(new Promise(value => { resolve = value; }));
        const refreshing = latestAuth!.refreshUser();
        await act(async () => {
          await latestAuth!.loginWithApiKey('https://bb.test', 'bb_fixture');
        });
        await act(async () => { resolve(testUser); await refreshing; });
        expect(latestAuth!.user).toEqual(keyUser);
        expect(latestAuth!.isAdmin).toBe(false);
      });

      it('restores and refreshes scoped keys even when password authentication is disabled', async () => {
        jest.mocked(getAuthToken).mockReturnValue('bb_fixture');
        mockedApi.getAuthStatus.mockResolvedValue({ auth_enabled: false, requires_setup: false });
        mockedApi.getCurrentUser.mockResolvedValue({
          ...regularUser, role: 'admin', is_admin: true, groups: testUser.groups,
        });
        await act(async () => { renderAuth(); });
        expect(latestAuth!.authEnabled).toBe(true);
        expect(latestAuth!.isAdmin).toBe(false);
        expect(latestAuth!.user?.role).toBe('user');
        expect(latestAuth!.hasPermission('settings:update')).toBe(false);
        expect(mockedSetAuthToken).not.toHaveBeenCalledWith(null);
        await act(async () => { await latestAuth!.refreshUser(); });
        expect(latestAuth!.user?.role).toBe('user');
        expect(latestAuth!.isAdmin).toBe(false);
        expect(latestAuth!.hasPermission('printers:update')).toBe(false);
      });
    });

    it('clears user even if api.logout fails', async () => {
      mockedApi.logout.mockRejectedValue(new Error('Network error'));

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      await act(async () => { await latestAuth!.logout(); });

      expect(latestAuth!.user).toBeNull();
    });
  });

  describe('server connectivity', () => {
    it('sets serverConnected false when server is unreachable', async () => {
      mockedApi.getAuthStatus.mockRejectedValue(new Error('Network error'));

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.serverConnected).toBe(false);
      expect(latestAuth!.loading).toBe(false);
    });

    it('does not attempt auth check when no server URL configured', async () => {
      useServerStore.setState({ serverUrl: null, loading: false });

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      // Reset mock after setState to avoid counting beforeEach calls
      mockedApi.getAuthStatus.mockReset();
      expect(latestAuth!.loading).toBe(false);
    });
  });
});
