import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { api } from '@/api/client';
import { useNavigationItems } from '@/navigation/useNavigationItems';

let mockUser: { id: number } | null = null;
const mockPermissions = new Set<string>();
let mockServerUrl = 'https://configured.test';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, authEnabled: true, loading: false, requiresSetup: false,
    hasPermission: (permission: string) => Boolean(mockUser) && mockPermissions.has(permission),
  }),
}));
jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string }) => unknown) => selector({ serverUrl: mockServerUrl }),
}));
jest.mock('@/api/client', () => ({ api: { getSettings: jest.fn() } }));
jest.mock('@/api/uiPreferences', () => ({
  uiPreferencesApi: {
    getNavigationOrder: jest.fn(),
    getFlags: jest.fn(),
  },
}));

describe('navigation destination access', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockServerUrl = 'https://configured.test';
    mockPermissions.clear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    (uiPreferencesApi.getNavigationOrder as jest.Mock).mockResolvedValue({
      default_sidebar_order: 'files,users,camera-wall,finance',
    });
    (uiPreferencesApi.getFlags as jest.Mock).mockResolvedValue({ billing_enabled: true });
  });
  afterEach(() => client.clear());

  it('does not request authenticated preferences before sign-in or server setup', async () => {
    const hook = await renderHook(useNavigationItems, { wrapper });
    expect(uiPreferencesApi.getNavigationOrder).not.toHaveBeenCalled();
    expect(uiPreferencesApi.getFlags).not.toHaveBeenCalled();
    mockUser = { id: 1 };
    mockServerUrl = '';
    await hook.rerender(undefined);
    expect(uiPreferencesApi.getNavigationOrder).not.toHaveBeenCalled();
  });

  it('combines safe server visibility with delegated read access without privileged settings', async () => {
    mockUser = { id: 1 };
    for (const permission of ['library:read_own', 'users:read', 'cost_centers:read_own']) mockPermissions.add(permission);
    const hook = await renderHook(useNavigationItems, { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.items.map(item => item.id)).toEqual(['files', 'users', 'finance', 'more', 'settings']);
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(uiPreferencesApi.getNavigationOrder).toHaveBeenCalledTimes(1);
    mockUser = null;
    await hook.rerender(undefined);
    expect(hook.result.current.items.map(item => item.id)).toEqual(['more', 'settings']);
  });
});
