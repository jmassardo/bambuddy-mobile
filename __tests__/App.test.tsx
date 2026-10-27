import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';
import { useUiPreferencesStore } from '../src/store/uiPreferencesStore';

let mockUser: { id: number } | null = null;
const mockResetRoot = jest.fn();
const mockNavigate = jest.fn();
const mockLoadServerUrl = jest.fn(() => Promise.resolve());
const mockToastContext = React.createContext(false);

jest.mock('react-native-get-random-values', () => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: require('node:crypto').webcrypto,
  });
  return {};
});
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: {
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({
    isReady: () => true,
    resetRoot: (...args: unknown[]) => mockResetRoot(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  }),
  NavigationContainer: ({ children, onReady }: { children: React.ReactNode; onReady: () => void }) => {
    require('react').useEffect(onReady, []);
    return children;
  },
}));
jest.mock('../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: mockUser, authEnabled: true, loading: false, requiresSetup: false }),
}));
jest.mock('../src/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) =>
    require('react').createElement(mockToastContext.Provider, { value: true }, children),
}));
jest.mock('../src/contexts/PushNotificationContext', () => ({
  PushNotificationProvider: ({ children }: { children: React.ReactNode }) => {
    if (!require('react').useContext(mockToastContext)) throw new Error('Push notifications require ToastProvider');
    return children;
  },
}));
jest.mock('../src/contexts/SliceJobTrackerContext', () => ({
  SliceJobTrackerProvider: ({ children }: { children: React.ReactNode }) => {
    require('@tanstack/react-query').useQueryClient();
    return children;
  },
  SliceJobStatusBanner: () => require('react').createElement(require('react-native').Text, null, 'Slice job status'),
}));
jest.mock('../src/components/common/AnnouncementBanner', () => ({
  AnnouncementBanner: () => require('react').createElement(require('react-native').Text, null, 'Announcements'),
}));
jest.mock('../src/components/common/ServerPreferencesSync', () => ({ ServerPreferencesSync: () => null }));
jest.mock('../src/components/system/BugReportTools', () => ({
  BugReportCollectionGuard: () => {
    require('@tanstack/react-query').useQueryClient();
    return null;
  },
}));
jest.mock('../src/components/common/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/navigation/useNavigationItems', () => ({
  useNavigationItems: () => ({ items: require('../src/navigation/navigationConfig').BUILT_IN_NAV_ITEMS, loading: false }),
}));
jest.mock('../src/navigation/RootNavigator', () => ({
  __esModule: true,
  default: ({ entryReady }: { entryReady: boolean }) =>
    require('react').createElement(require('react-native').Text, null, entryReady ? 'Navigation ready' : 'Loading navigation'),
}));
jest.mock('../src/hooks/useOffline', () => ({ useOffline: () => ({ isOffline: false }) }));
jest.mock('../src/theme', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('../src/api/server', () => ({
  useServerStore: (selector: (state: { loading: boolean; serverUrl: string; loadServerUrl: () => Promise<void> }) => unknown) =>
    selector({ loading: false, serverUrl: 'https://configured.test', loadServerUrl: mockLoadServerUrl }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  useUiPreferencesStore.setState({ loaded: true, landingPage: 'dashboard' });
});

it('renders navigation while keeping authenticated banners and landing resets behind sign-in', async () => {
  const screen = await render(<App />);
  await waitFor(() => expect(screen.getByText('Navigation ready')).toBeTruthy());
  expect(mockLoadServerUrl).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Announcements')).toBeNull();
  expect(screen.queryByText('Slice job status')).toBeNull();
  expect(mockResetRoot).not.toHaveBeenCalled();

  mockUser = { id: 1 };
  await screen.rerender(<App />);
  expect(screen.getAllByText('Announcements')).toHaveLength(1);
  expect(screen.getAllByText('Slice job status')).toHaveLength(1);
  expect(mockResetRoot).toHaveBeenCalledTimes(1);
  expect(mockResetRoot).toHaveBeenCalledWith({
    index: 0, routes: [{ name: 'Main', params: { screen: 'Dashboard' } }],
  });
  await screen.rerender(<App />);
  expect(mockResetRoot).toHaveBeenCalledTimes(1);
});
