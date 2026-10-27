import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import MoreScreen from '@/screens/MoreScreen';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockUseQuery = jest.fn();
const mockShowToast = jest.fn();
const mockOpenURL = jest.fn().mockResolvedValue(undefined);
const mockPermissions = new Set<string>();
let mockUser: { id: number; username: string } | null = { id: 1, username: 'testuser' };
let mockAnnouncementsVisible = false;

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openURL: mockOpenURL },
  openURL: mockOpenURL,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: string[] }) => mockUseQuery(options),
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<void> }) => ({
    mutateAsync: mutationFn,
    isPending: false,
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getSettings: jest.fn(),
    getExternalLinks: jest.fn(),
  },
}));
jest.mock('@/api/uiPreferences', () => ({
  uiPreferencesApi: { getNavigationOrder: jest.fn(), getFlags: jest.fn() },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, logout: jest.fn(),
    hasPermission: (permission: string) => mockPermissions.has('*') || mockPermissions.has(permission),
  }),
}));
jest.mock('@/components/common/AnnouncementBanner', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  return {
    AnnouncementsEntry: ({ onPress }: { onPress: () => void }) => mockAnnouncementsVisible
      ? ReactModule.createElement(View, { testID: 'announcements-entry', onPress }, ReactModule.createElement(Text, null, 'Announcements'))
      : null,
  };
});

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/api/server', () => ({
  useServerStore: Object.assign(
    (selector: (state: { demoMode: boolean; serverUrl: string }) => unknown) => selector({ demoMode: false, serverUrl: 'https://farm.example' }),
    { getState: () => ({ clearServerUrl: jest.fn() }) },
  ),
}));

jest.mock('react-native-device-info', () => ({
  getVersion: () => '1.0.0',
}));

jest.mock('@/components/common/AppUI', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');

  return {
    MenuItem: ({ label, subtitle, onPress }: { label: string; subtitle?: string; onPress: () => void }) =>
      ReactModule.createElement(View, { testID: 'menu-item-' + label, onPress },
        ReactModule.createElement(Text, null, label),
        subtitle ? ReactModule.createElement(Text, null, subtitle) : null,
      ),
    SectionHeader: ({ title }: { title: string }) =>
      ReactModule.createElement(Text, { testID: 'section-' + title }, title),
  };
});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      text: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      surfaceElevated: '#f0f0f0',
      border: '#ccc',
    },
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions.clear();
  mockPermissions.add('*');
  mockUser = { id: 1, username: 'testuser' };
  mockAnnouncementsVisible = false;
});

function setupQueries(opts?: {
  settings?: { default_sidebar_order?: string } | null;
  externalLinks?: unknown[] | null;
  settingsError?: boolean;
  externalLinksError?: boolean;
  billingEnabled?: boolean;
}) {
  mockUseQuery.mockImplementation((options: { queryKey: string[] }) => {
    if (options.queryKey[0] === 'navigationOrder') {
      if (opts?.settingsError) return { data: undefined, isLoading: false, isError: true };
      return { data: opts?.settings ?? { default_sidebar_order: '' }, isLoading: false, isError: false };
    }
    if (options.queryKey[0] === 'uiFlags') return { data: { billing_enabled: opts?.billingEnabled ?? false } };
    if (options.queryKey[0] === 'externalLinks') {
      if (opts?.externalLinksError) return { data: undefined, isLoading: false, isError: true };
      return { data: opts?.externalLinks ?? [], isLoading: false, isError: false };
    }
    return { data: undefined, isLoading: false, isError: false };
  });
}

describe('MoreScreen', () => {
  it('renders default menu items from navigationConfig', async () => {
    setupQueries();
    const { getByText } = await render(<MoreScreen />);

    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Users')).toBeTruthy();
    expect(getByText('Notifications')).toBeTruthy();
    expect(getByText('Inventory')).toBeTruthy();
    expect(getByText('Maintenance')).toBeTruthy();
    expect(getByText('Stats')).toBeTruthy();

    expect(getByText('Pages')).toBeTruthy();
    expect(getByText('Insights & tools')).toBeTruthy();
  });

  it('shows the newly registered parity routes', async () => {
    setupQueries();
    const { getByText } = await render(<MoreScreen />);

    expect(getByText('Virtual Printers')).toBeTruthy();
    expect(getByText('SpoolBuddy')).toBeTruthy();
  });

  it('ignores removed ids while honoring the remaining custom order', async () => {
    setupQueries({ settings: { default_sidebar_order: 'stats,removed-route,settings' } });
    const { getByText, queryByText } = await render(<MoreScreen />);

    expect(getByText('Stats')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
    expect(queryByText('Users')).toBeNull();
  });

  it('still renders menu when both queries fail', async () => {
    setupQueries({ settingsError: true, externalLinksError: true });
    const { getByText } = await render(<MoreScreen />);

    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Stats')).toBeTruthy();
  });

  it('opens in-app external links in ExternalLinkBrowser', async () => {
    setupQueries({
      externalLinks: [
        { id: 1, name: 'My Link', url: 'https://example.com', icon: 'link', open_in_new_tab: false, custom_icon: null, sort_order: 1, created_at: '', updated_at: '' },
      ],
    });
    const { getByTestId, getByText } = await render(<MoreScreen />);

    expect(getByText('Links')).toBeTruthy();
    fireEvent.press(getByTestId('menu-item-My Link'));

    expect(mockNavigate).toHaveBeenCalledWith('ExternalLinkBrowser', {
      url: 'https://example.com',
      title: 'My Link',
    });
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('opens links flagged as external in the system browser', async () => {
    setupQueries({
      externalLinks: [
        { id: 2, name: 'External Link', url: ' https://example.com/help ', icon: 'link', open_in_new_tab: true, custom_icon: null, sort_order: 1, created_at: '', updated_at: '' },
      ],
    });
    const { getByTestId } = await render(<MoreScreen />);

    fireEvent.press(getByTestId('menu-item-External Link'));

    await waitFor(() =>
      expect(mockOpenURL).toHaveBeenCalledWith('https://example.com/help'),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'ExternalLinkBrowser',
      expect.anything(),
    );
  });

  it('still renders locked items when every hideable item is hidden', async () => {
    setupQueries({
      settings: { default_sidebar_order: 'more,settings,spoolbuddy' },
    });
    const { getByText, queryByText } = await render(<MoreScreen />);

    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('SpoolBuddy')).toBeTruthy();
    expect(queryByText('Users')).toBeNull();
  });

  it('shows signed-in user and version', async () => {
    setupQueries();
    const { getByText } = await render(<MoreScreen />);

    expect(getByText(/testuser/)).toBeTruthy();
    expect(getByText(/v1\.0\.0/)).toBeTruthy();
  });

  it('opens the announcements route only when its server-controlled entry is visible', async () => {
    setupQueries();
    mockAnnouncementsVisible = true;
    const screen = await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('announcements-entry'));
    expect(mockNavigate).toHaveBeenCalledWith('Announcements');
    mockAnnouncementsVisible = false;
    await screen.rerender(<MoreScreen />);
    expect(screen.queryByTestId('announcements-entry')).toBeNull();
  });

  it('gates new camera, pipeline and user entries by permissions rather than administrator status', async () => {
    setupQueries();
    mockPermissions.clear();
    mockPermissions.add('users:read');
    const screen = await render(<MoreScreen />);
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.queryByText('Camera wall')).toBeNull();
    expect(screen.queryByText('Slicer pipelines')).toBeNull();
    mockPermissions.clear();
    mockPermissions.add('camera:view');
    mockPermissions.add('pipelines:read');
    await screen.rerender(<MoreScreen />);
    expect(screen.queryByText('Users')).toBeNull();
    await fireEvent.press(screen.getByTestId('menu-item-Camera wall'));
    expect(mockNavigate).toHaveBeenCalledWith('CameraWall');
    await fireEvent.press(screen.getByTestId('menu-item-Camera integrations'));
    expect(mockNavigate).toHaveBeenCalledWith('CameraIntegrations');
    await fireEvent.press(screen.getByTestId('menu-item-Slicer pipelines'));
    expect(mockNavigate).toHaveBeenCalledWith('SlicerPipelines');
    await fireEvent.press(screen.getByTestId('menu-item-Pipeline runs'));
    expect(mockNavigate).toHaveBeenCalledWith('PipelineRuns');
  });

  it('requires an actual user, enabled billing, and a cost-center permission for Finance without fetching privileged settings', async () => {
    setupQueries({ billingEnabled: true });
    mockPermissions.clear();
    mockPermissions.add('cost_centers:read_own');
    const screen = await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('menu-item-Finance'));
    expect(mockNavigate).toHaveBeenCalledWith('Finance');
    expect(mockUseQuery.mock.calls.some(([options]) => options.queryKey[0] === 'settings')).toBe(false);
    mockUser = null;
    await screen.rerender(<MoreScreen />);
    expect(screen.queryByText('Finance')).toBeNull();
    mockUser = { id: 1, username: 'testuser' };
    setupQueries({ billingEnabled: false });
    await screen.rerender(<MoreScreen />);
    expect(screen.queryByText('Finance')).toBeNull();
  });
});
