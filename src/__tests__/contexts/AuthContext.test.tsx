import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth, type UserResponse } from '@/contexts/AuthContext';
import { api, setAuthToken } from '@/api/client';
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
  is_admin: true,
  email: 'jenna@example.com',
  groups: [
    { id: 1, name: 'admins', permissions: ['printers.view', 'printers.edit', 'queue.manage'] },
  ],
};

const regularUser: UserResponse = {
  id: 2,
  username: 'viewer',
  is_admin: false,
  email: null,
  groups: [
    { id: 2, name: 'viewers', permissions: ['printers.view'] },
  ],
};

let latestAuth: ReturnType<typeof useAuth> | null = null;

function AuthConsumer() {
  latestAuth = useAuth();
  return null;
}

function renderAuth() {
  return ReactTestRenderer.create(
    React.createElement(AuthProvider, null, React.createElement(AuthConsumer)),
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestAuth = null;
    useServerStore.setState({ serverUrl: 'https://bb.test', loading: false });
    mockedApi.getAuthStatus.mockResolvedValue({
      auth_enabled: true,
      requires_setup: false,
    });
    mockedApi.getCurrentUser.mockResolvedValue(testUser);
  });

  describe('hasPermission', () => {
    it('returns true for admins regardless of permission', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('anything.at.all')).toBe(true);
    });

    it('checks group permissions for non-admin users', async () => {
      mockedApi.getCurrentUser.mockResolvedValue(regularUser);

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('printers.view')).toBe(true);
      expect(latestAuth!.hasPermission('printers.edit')).toBe(false);
    });

    it('returns true when auth is disabled', async () => {
      mockedApi.getAuthStatus.mockResolvedValue({
        auth_enabled: false,
        requires_setup: false,
      });

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasPermission('anything')).toBe(true);
    });

    it('returns false when no user is logged in and auth enabled', async () => {
      mockedApi.getCurrentUser.mockRejectedValue(new Error('401'));

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.user).toBeNull();
      expect(latestAuth!.hasPermission('printers.view')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('returns true if user has any of the listed permissions', async () => {
      mockedApi.getCurrentUser.mockResolvedValue(regularUser);

      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.hasAnyPermission('printers.edit', 'printers.view')).toBe(true);
      expect(latestAuth!.hasAnyPermission('admin.settings', 'admin.users')).toBe(false);
    });
  });

  describe('loginWithToken', () => {
    it('stores token and sets user', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      await act(async () => {
        await latestAuth!.loginWithToken('new-token', regularUser);
      });

      expect(mockedSetAuthToken).toHaveBeenCalledWith('new-token');
      expect(latestAuth!.user?.username).toBe('viewer');
    });
  });

  describe('logout', () => {
    it('clears token and user', async () => {
      await act(async () => { renderAuth(); });
      await act(async () => { await new Promise<void>((r) => setTimeout(r, 50)); });

      expect(latestAuth!.user).not.toBeNull();

      await act(async () => { await latestAuth!.logout(); });

      expect(mockedSetAuthToken).toHaveBeenCalledWith(null);
      expect(latestAuth!.user).toBeNull();
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

      expect(mockedApi.getAuthStatus).not.toHaveBeenCalled();
      expect(latestAuth!.loading).toBe(false);
    });
  });
});
