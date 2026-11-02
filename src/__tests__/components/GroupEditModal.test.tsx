import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupEditModal } from '@/components/common/GroupEditModal';
import { translateNative } from '@/i18n';

const mockGetGroup = jest.fn();
const mockGetPermissions = jest.fn();
const mockUpdateGroup = jest.fn();
const mockShowToast = jest.fn();
jest.mock('@/api/client', () => ({
  api: {
    getGroup: (...args: unknown[]) => mockGetGroup(...args),
    getPermissions: () => mockGetPermissions(),
    updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
  },
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.light, isDark: false }),
}));

const group = { id: 1, name: 'Maintainers', description: 'Original', permissions: ['printers:read'] };
const permissionData = {
  all_permissions: ['printers:read', 'printers:control'],
  categories: [{
    name: 'printers', label: 'Printers',
    permissions: [
      { value: 'printers:read', label: 'Read printers' },
      { value: 'printers:control', label: 'Control printers' },
    ],
  }],
};

describe('group editing consistency', () => {
  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new QueryClient({ defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    } });
    mockGetGroup.mockResolvedValue(group);
    mockGetPermissions.mockResolvedValue(permissionData);
    mockUpdateGroup.mockResolvedValue({});
  });
  afterEach(() => client.clear());

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  it('preserves dirty names and permission choices when group data refreshes', async () => {
    const ui = await render(<GroupEditModal visible groupId={1} onClose={jest.fn()} />, { wrapper: Wrapper });
    await ui.findByDisplayValue('Maintainers');
    await fireEvent.changeText(ui.getByDisplayValue('Maintainers'), 'My draft');
    const category = ui.getByRole('checkbox');
    expect(category.props.accessibilityState.checked).toBe('mixed');
    await fireEvent.press(category);
    expect(ui.getByRole('checkbox').props.accessibilityState.checked).toBe(true);

    await act(() => client.setQueryData(['group', 1], { ...group, name: 'Changed on server' }));
    expect(ui.getByDisplayValue('My draft')).toBeTruthy();
    expect(ui.getByRole('checkbox').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(ui.getByRole('button', { name: translateNative('native.10eb6adbe0c1cd3f') }));
    await waitFor(() => expect(mockUpdateGroup).toHaveBeenCalledWith(1, {
      name: 'My draft', description: 'Original',
      permissions: ['printers:read', 'printers:control'],
    }));
  });

  it('offers retry rather than an editable empty-permissions form after a query failure', async () => {
    mockGetPermissions.mockRejectedValue(new Error('Cannot load permissions'));
    const ui = await render(<GroupEditModal visible groupId={1} onClose={jest.fn()} />, { wrapper: Wrapper });
    await ui.findByText('Cannot load permissions');
    expect(ui.queryByRole('button', { name: translateNative('native.10eb6adbe0c1cd3f') })).toBeNull();
    mockGetPermissions.mockResolvedValue(permissionData);
    await fireEvent.press(ui.getByRole('button', { name: 'Retry' }));
    await ui.findByDisplayValue('Maintainers');
    expect(ui.getByRole('checkbox').props.accessibilityState.checked).toBe('mixed');
  });
});
