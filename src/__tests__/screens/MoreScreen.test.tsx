import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import MoreScreen from '@/screens/MoreScreen';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
const mockUseQuery = jest.fn();
const mockShowToast = jest.fn();
const mockOpenURL = jest.fn().mockResolvedValue(undefined);

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

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'testuser' }, logout: jest.fn() }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/api/server', () => ({
  useServerStore: Object.assign(
    (selector: (state: { demoMode: boolean }) => boolean) => selector({ demoMode: false }),
    { getState: () => ({ clearServerUrl: jest.fn() }) },
  ),
}));

jest.mock('react-native-device-info', () => ({
  getVersion: () => '1.0.0',
}));

jest.mock('@/components/common/UIComponents', () => {
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
});

function setupQueries(opts?: {
  settings?: { default_sidebar_order?: string } | null;
  externalLinks?: unknown[] | null;
  settingsError?: boolean;
  externalLinksError?: boolean;
}) {
  mockUseQuery.mockImplementation((options: { queryKey: string[] }) => {
    if (options.queryKey[0] === 'settings') {
      if (opts?.settingsError) return { data: undefined, isLoading: false, isError: true };
      return { data: opts?.settings ?? { default_sidebar_order: '' }, isLoading: false, isError: false };
    }
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
});
